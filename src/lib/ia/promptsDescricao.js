import { prisma } from "@/lib/db";

import { limparPromptDaDescricao, PROMPT_DESCRICAO_PADRAO } from "./anuncio";

/**
 * A biblioteca de prompts da janela "Criar descricao" (pedido do dono em 09/10/2026): varios prompts com nome
 * ("Microcontrolador", "Motor DC"...), um deles marcado como o que ja vem escolhido ao abrir a janela.
 *
 * O "Padrao do sistema" NAO e linha do banco: e o `PROMPT_DESCRICAO_PADRAO` do codigo, sempre o primeiro da
 * lista, que nao se salva nem se exclui (sempre ha um ponto de partida). Nenhuma linha marcada = ele e o padrao.
 * Ate 09/10/2026 havia um prompt so, na tabela do Nano Banana; a migracao o trouxe como "Meu prompt".
 */

export const ID_DO_SISTEMA = "sistema";
export const NOME_DO_SISTEMA = "Padrão do sistema";
export const MAXIMO_NOME_PROMPT = 60;

const falha = (erro) => ({ ok: false, erro });

/** O nome que veio da tela: sem espacos sobrando, nao vazio, ate o teto, e nao o do sistema. */
export function limparNomeDoPrompt(nome) {
  const limpo = typeof nome === "string" ? nome.replace(/\s+/g, " ").trim() : "";
  if (!limpo) return falha("Dê um nome ao prompt.");
  if (limpo.length > MAXIMO_NOME_PROMPT) return falha(`O nome passa de ${MAXIMO_NOME_PROMPT} caracteres.`);
  if (limpo.toLocaleLowerCase("pt-BR") === NOME_DO_SISTEMA.toLocaleLowerCase("pt-BR")) {
    return falha("Este nome é do prompt do sistema. Escolha outro.");
  }
  return { ok: true, nome: limpo };
}

/** Outro prompt ja usa o nome? Comparado sem caixa: "motor dc" e "Motor DC" seriam confundidos na lista. */
async function nomeEmUso(nome, excetoId = null) {
  const outro = await prisma.promptDescricao.findFirst({
    where: { nome: { equals: nome, mode: "insensitive" }, ...(excetoId ? { NOT: { id: excetoId } } : {}) },
    select: { id: true },
  });
  return Boolean(outro);
}

const paraTela = (linha) => ({
  id: linha.id,
  nome: linha.nome,
  texto: linha.texto,
  sistema: false,
  padrao: linha.padrao,
});

/** A lista para a tela: o do sistema primeiro, os outros por nome. */
export async function listarPromptsDaDescricao() {
  const linhas = await prisma.promptDescricao.findMany({ orderBy: { nome: "asc" } });
  return [
    {
      id: ID_DO_SISTEMA,
      nome: NOME_DO_SISTEMA,
      texto: PROMPT_DESCRICAO_PADRAO,
      sistema: true,
      padrao: !linhas.some((linha) => linha.padrao),
    },
    ...linhas.map(paraTela),
  ];
}

/** O texto do prompt marcado como padrao, para a geracao que chega sem prompt da tela. Falha do banco = o do sistema. */
export async function textoDoPromptPadrao() {
  try {
    const linha = await prisma.promptDescricao.findFirst({ where: { padrao: true }, select: { texto: true } });
    return linha?.texto ?? PROMPT_DESCRICAO_PADRAO;
  } catch {
    return PROMPT_DESCRICAO_PADRAO;
  }
}

/** "Salvar como novo": um prompt novo com nome e texto. */
export async function criarPromptDaDescricao(nome, texto) {
  const conferidoNome = limparNomeDoPrompt(nome);
  if (!conferidoNome.ok) return conferidoNome;
  const conferidoTexto = limparPromptDaDescricao(texto);
  if (!conferidoTexto.ok) return conferidoTexto;
  if (await nomeEmUso(conferidoNome.nome)) return falha(`Já existe um prompt chamado "${conferidoNome.nome}".`);

  const linha = await prisma.promptDescricao.create({
    data: { nome: conferidoNome.nome, texto: conferidoTexto.texto },
  });
  return { ok: true, prompt: paraTela(linha) };
}

/** "Salvar": grava o nome e o texto do prompt escolhido. O do sistema nao muda. */
export async function salvarPromptDaDescricao(id, nome, texto) {
  if (id === ID_DO_SISTEMA) return falha('O prompt do sistema não muda. Use "Salvar como novo".');
  const conferidoNome = limparNomeDoPrompt(nome);
  if (!conferidoNome.ok) return conferidoNome;
  const conferidoTexto = limparPromptDaDescricao(texto);
  if (!conferidoTexto.ok) return conferidoTexto;

  const existe = typeof id === "string" && (await prisma.promptDescricao.findUnique({ where: { id }, select: { id: true } }));
  if (!existe) return falha("Este prompt não existe mais. Abra a janela de novo.");
  if (await nomeEmUso(conferidoNome.nome, id)) return falha(`Já existe um prompt chamado "${conferidoNome.nome}".`);

  const linha = await prisma.promptDescricao.update({
    where: { id },
    data: { nome: conferidoNome.nome, texto: conferidoTexto.texto },
  });
  return { ok: true, prompt: paraTela(linha) };
}

/** Exclui o prompt. O do sistema nao se exclui; excluir o padrao devolve o papel ao do sistema. */
export async function excluirPromptDaDescricao(id) {
  if (id === ID_DO_SISTEMA) return falha("O prompt do sistema não se exclui.");
  if (typeof id !== "string") return falha("Este prompt não existe mais.");
  const { count } = await prisma.promptDescricao.deleteMany({ where: { id } });
  if (count === 0) return falha("Este prompt não existe mais.");
  return { ok: true };
}

/** "Usar como padrao": o que ja vem escolhido ao abrir a janela. O do sistema = nenhuma linha marcada. */
export async function definirPromptPadraoDaDescricao(id) {
  if (id !== ID_DO_SISTEMA) {
    const existe = typeof id === "string" && (await prisma.promptDescricao.findUnique({ where: { id }, select: { id: true } }));
    if (!existe) return falha("Este prompt não existe mais.");
  }
  await prisma.$transaction([
    prisma.promptDescricao.updateMany({ where: { padrao: true }, data: { padrao: false } }),
    ...(id === ID_DO_SISTEMA ? [] : [prisma.promptDescricao.update({ where: { id }, data: { padrao: true } })]),
  ]);
  return { ok: true };
}
