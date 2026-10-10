import { prisma } from "@/lib/db";

import { limparPromptDaDescricao, PROMPT_DESCRICAO_PADRAO } from "./anuncio";

/**
 * A biblioteca de prompts da janela "Criar descricao" (pedido do dono em 09/10/2026): varios prompts com nome
 * ("Microcontrolador", "Motor DC"...), um deles marcado como o que ja vem escolhido ao abrir a janela.
 *
 * O "Padrao do sistema" e sempre o primeiro da lista e nao se exclui (sempre ha um ponto de partida). Nenhuma linha
 * marcada = ele e o padrao. Ate 10/10/2026 ele nao se editava; o dono pediu que pudesse, e a edicao (nome e texto)
 * mora numa linha com o id fixo `ID_DO_SISTEMA`. Sem essa linha, ele e o `PROMPT_DESCRICAO_PADRAO` do codigo, que
 * continua guardado ali como o original. A linha do sistema nunca fica com `padrao` ligado.
 * Ate 09/10/2026 havia um prompt so, na tabela do Nano Banana; a migracao o trouxe como "Meu prompt".
 */

export const ID_DO_SISTEMA = "sistema";
export const NOME_DO_SISTEMA = "Padrão do sistema";
export const MAXIMO_NOME_PROMPT = 60;

const falha = (erro) => ({ ok: false, erro });

/** O nome que veio da tela: sem espacos sobrando, nao vazio, ate o teto, e nao o do sistema. */
export function limparNomeDoPrompt(nome, { doSistema = false } = {}) {
  const limpo = typeof nome === "string" ? nome.replace(/\s+/g, " ").trim() : "";
  if (!limpo) return falha("Dê um nome ao prompt.");
  if (limpo.length > MAXIMO_NOME_PROMPT) return falha(`O nome passa de ${MAXIMO_NOME_PROMPT} caracteres.`);
  if (!doSistema && limpo.toLocaleLowerCase("pt-BR") === NOME_DO_SISTEMA.toLocaleLowerCase("pt-BR")) {
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
  sistema: linha.id === ID_DO_SISTEMA,
  padrao: linha.padrao,
});

/** O do sistema como a tela o ve: a edicao gravada, ou o original do codigo. */
function doSistema(linha, padrao) {
  return {
    id: ID_DO_SISTEMA,
    nome: linha?.nome ?? NOME_DO_SISTEMA,
    texto: linha?.texto ?? PROMPT_DESCRICAO_PADRAO,
    sistema: true,
    padrao,
  };
}

/** A lista para a tela: o do sistema primeiro, os outros por nome. */
export async function listarPromptsDaDescricao() {
  const linhas = await prisma.promptDescricao.findMany({ orderBy: { nome: "asc" } });
  const outros = linhas.filter((linha) => linha.id !== ID_DO_SISTEMA);
  return [
    doSistema(linhas.find((linha) => linha.id === ID_DO_SISTEMA), !outros.some((linha) => linha.padrao)),
    ...outros.map(paraTela),
  ];
}

/** O texto do prompt marcado como padrao, para a geracao que chega sem prompt da tela. Falha do banco = o original. */
export async function textoDoPromptPadrao() {
  try {
    const linha =
      (await prisma.promptDescricao.findFirst({ where: { padrao: true, NOT: { id: ID_DO_SISTEMA } }, select: { texto: true } })) ??
      (await prisma.promptDescricao.findUnique({ where: { id: ID_DO_SISTEMA }, select: { texto: true } }));
    return linha?.texto ?? PROMPT_DESCRICAO_PADRAO;
  } catch {
    return PROMPT_DESCRICAO_PADRAO;
  }
}

/** "Novo prompt" + Salvar: um prompt novo com nome e texto. */
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

/** "Salvar": grava o nome e o texto do prompt escolhido, o do sistema inclusive (na linha de id fixo). */
export async function salvarPromptDaDescricao(id, nome, texto) {
  const sistema = id === ID_DO_SISTEMA;
  const conferidoNome = limparNomeDoPrompt(nome, { doSistema: sistema });
  if (!conferidoNome.ok) return conferidoNome;
  const conferidoTexto = limparPromptDaDescricao(texto);
  if (!conferidoTexto.ok) return conferidoTexto;

  if (sistema) {
    if (await nomeEmUso(conferidoNome.nome, ID_DO_SISTEMA)) return falha(`Já existe um prompt chamado "${conferidoNome.nome}".`);
    const dados = { nome: conferidoNome.nome, texto: conferidoTexto.texto };
    const linha = await prisma.promptDescricao.upsert({
      where: { id: ID_DO_SISTEMA },
      update: dados,
      create: { id: ID_DO_SISTEMA, ...dados, padrao: false },
    });
    return { ok: true, prompt: paraTela(linha) };
  }

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
