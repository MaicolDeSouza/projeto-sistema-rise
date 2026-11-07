import { prisma } from "@/lib/db";

import { aplicarCorrecoes, validarCorrecao } from "./correcoes";

/**
 * Correcoes da descricao no banco (spec docs/superpowers/specs/2026-11-07-correcoes-da-descricao-design.md): a leitura
 * das ativas com cache curto, as escritas (chat, popup do Salvar e tela de gestao), os usos, o ensaio e o Salvar.
 */

export const CACHE_MS = 60_000;
const ORIGENS = ["CHAT", "CADASTRO", "TELA"];
// Teto do que o popup do Salvar manda de uma vez: a lista vem do navegador.
const MAXIMO_DO_CADASTRO = 50;

// Toda descricao gerada, proposta ou salva le a lista: o cache evita uma consulta por gravacao. Vale por processo; a escrita
// deste modulo o limpa, e a de outro processo (teste, script) aparece em ate 60 s.
const cache = new Map();

export function limparCacheDeCorrecoes() {
  cache.clear();
}

/** As ativas que valem para um prompt: as de todas as descricoes (promptNome null) e as daquele nome exato. A mais nova primeiro. */
export async function lerCorrecoesAtivas({ promptNome = null } = {}) {
  const chave = promptNome ?? "";
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < CACHE_MS) return guardado.lista;
  const lista = await prisma.correcaoDaDescricao.findMany({
    where: { ativa: true, OR: promptNome ? [{ promptNome: null }, { promptNome }] : [{ promptNome: null }] },
    orderBy: { criadoEm: "desc" },
  });
  cache.set(chave, { em: Date.now(), lista });
  return lista;
}

const comoTexto = (correcao) => (correcao.tipo === "TROCA" ? `${correcao.errado} → ${correcao.certo}` : correcao.certo);
const escopoNoTexto = (promptNome) => (promptNome ? `o prompt "${promptNome}"` : "todas as descrições");

/** A mesma TROCA (o errado, sem caixa) ou a mesma REGRA (o texto, sem caixa) no mesmo escopo, ligada ou desligada. */
async function repetidaDe(dados, ignorarId = null) {
  return prisma.correcaoDaDescricao.findFirst({
    where: {
      tipo: dados.tipo,
      promptNome: dados.promptNome,
      ...(dados.tipo === "TROCA" ? { errado: { equals: dados.errado, mode: "insensitive" } } : { certo: { equals: dados.certo, mode: "insensitive" } }),
      ...(ignorarId ? { id: { not: ignorarId } } : {}),
    },
  });
}

function mensagemDeRepetida(existente) {
  const desligada = existente.ativa ? "" : " (desligada)";
  return `Já existe a correção "${comoTexto(existente)}" para ${escopoNoTexto(existente.promptNome)}${desligada}.`;
}

/** Grava uma correcao nova. Repetida volta com o erro e a existente (o chat e o popup dizem qual). */
export async function criarCorrecao(dados, { quem, origem, produtoSku = null } = {}) {
  if (!ORIGENS.includes(origem)) throw new Error(`Origem de correcao desconhecida: ${origem}`);
  const validado = validarCorrecao(dados);
  if (!validado.ok) return { ok: false, erros: validado.erros };
  const existente = await repetidaDe(validado.dados);
  if (existente) return { ok: false, erro: mensagemDeRepetida(existente), existente };
  const correcao = await prisma.correcaoDaDescricao.create({
    data: { ...validado.dados, origem, produtoSku: produtoSku || null, criadoPor: String(quem || "pc") },
  });
  limparCacheDeCorrecoes();
  return { ok: true, correcao };
}

/** Edita o texto, a explicacao e o escopo. O tipo nao muda: uma TROCA que vira REGRA e outra correcao. */
export async function editarCorrecao(id, dados) {
  const atual = await prisma.correcaoDaDescricao.findUnique({ where: { id: String(id ?? "") } });
  if (!atual) return { ok: false, erro: "Correção não encontrada." };
  const validado = validarCorrecao({ ...dados, tipo: atual.tipo });
  if (!validado.ok) return { ok: false, erros: validado.erros };
  const existente = await repetidaDe(validado.dados, atual.id);
  if (existente) return { ok: false, erro: mensagemDeRepetida(existente), existente };
  const { errado, certo, explicacao, promptNome } = validado.dados;
  const correcao = await prisma.correcaoDaDescricao.update({ where: { id: atual.id }, data: { errado, certo, explicacao, promptNome } });
  limparCacheDeCorrecoes();
  return { ok: true, correcao };
}

/** Liga ou desliga (desligar nao apaga: a correcao volta com um clique e guarda os usos). */
export async function alternarCorrecao(id, ativa) {
  const atual = await prisma.correcaoDaDescricao.findUnique({ where: { id: String(id ?? "") } });
  if (!atual) return { ok: false, erro: "Correção não encontrada." };
  const correcao = await prisma.correcaoDaDescricao.update({ where: { id: atual.id }, data: { ativa: Boolean(ativa) } });
  limparCacheDeCorrecoes();
  return { ok: true, correcao };
}

export async function excluirCorrecao(id) {
  const { count } = await prisma.correcaoDaDescricao.deleteMany({ where: { id: String(id ?? "") } });
  limparCacheDeCorrecoes();
  return { ok: count > 0 };
}

/**
 * A lista da tela de gestao e do chat. `promptNome` dado = as que valem para ele (todas as descricoes ou o nome exato);
 * `ativas` dado = so ligadas ou so desligadas. A mais nova primeiro.
 */
export async function listarCorrecoes({ busca = "", promptNome, ativas } = {}) {
  const condicoes = [];
  const termo = String(busca ?? "").trim();
  if (termo) {
    condicoes.push({
      OR: ["errado", "certo", "explicacao"].map((campo) => ({ [campo]: { contains: termo, mode: "insensitive" } })),
    });
  }
  if (promptNome !== undefined) condicoes.push({ OR: [{ promptNome: null }, ...(promptNome ? [{ promptNome }] : [])] });
  if (typeof ativas === "boolean") condicoes.push({ ativa: ativas });
  return prisma.correcaoDaDescricao.findMany({ where: condicoes.length > 0 ? { AND: condicoes } : {}, orderBy: { criadoEm: "desc" } });
}

/** Soma quantas vezes cada TROCA trocou texto. Erro aqui nunca segura a descricao: so vai para o log. */
export async function somarUsos(aplicadas) {
  for (const { id, vezes } of Array.isArray(aplicadas) ? aplicadas : []) {
    if (!id || !(vezes > 0)) continue;
    try {
      await prisma.correcaoDaDescricao.updateMany({ where: { id }, data: { usos: { increment: vezes } } });
    } catch (erro) {
      console.error("Falha ao somar os usos da correcao da descricao:", erro.message);
    }
  }
}

/**
 * O que uma TROCA mudaria em ate `limite` descricoes recentes, para o chat mostrar ao dono logo depois de gravar: a
 * primeira linha que muda de cada produto. Nao grava nada (nem os usos). REGRA nao tem ensaio.
 */
export async function ensaioDaCorrecao(correcao, { limite = 3 } = {}) {
  if (correcao?.tipo !== "TROCA" || !correcao.errado) return [];
  // Busca alguns a mais: o texto pode conter o errado e nao mudar ("5 Vdc", ou ja estar como o certo).
  const produtos = await prisma.produto.findMany({
    where: { descricaoBase: { contains: correcao.errado, mode: "insensitive" } },
    orderBy: { atualizadoEm: "desc" },
    take: limite * 5,
    select: { sku: true, descricaoBase: true },
  });
  const ensaio = [];
  for (const produto of produtos) {
    for (const linha of String(produto.descricaoBase ?? "").split("\n")) {
      const antes = linha.replace(/\r$/, "");
      const { texto: depois } = aplicarCorrecoes(antes, [correcao]);
      if (depois !== antes) {
        ensaio.push({ sku: produto.sku, antes, depois });
        break;
      }
    }
    if (ensaio.length >= limite) break;
  }
  return ensaio;
}

/**
 * As TROCAs de todas as descricoes no texto do Salvar do produto (o Salvar nao sabe que prompt escreveu o texto, entao as
 * de um prompt so valem na geracao e na proposta). Qualquer falha devolve o texto como veio: o Salvar nunca cai por aqui.
 */
export async function corrigirDescricaoDoSalvar(texto) {
  if (typeof texto !== "string" || !texto) return { texto, aplicadas: [] };
  try {
    const resultado = aplicarCorrecoes(texto, await lerCorrecoesAtivas());
    await somarUsos(resultado.aplicadas);
    return resultado;
  } catch (erro) {
    console.error("Falha ao aplicar as correcoes da descricao no Salvar:", erro.message);
    return { texto, aplicadas: [] };
  }
}

/** As TROCAs que o dono marcou no popup "O que mudou na descricao". A repetida vai para `recusadas`, sem falhar o resto. */
export async function criarCorrecoesDoCadastro(lista, { quem, produtoSku = null } = {}) {
  const criadas = [];
  const recusadas = [];
  for (const item of (Array.isArray(lista) ? lista : []).slice(0, MAXIMO_DO_CADASTRO)) {
    const resultado = await criarCorrecao(
      { tipo: "TROCA", errado: item?.errado, certo: item?.certo, explicacao: item?.explicacao, promptNome: item?.promptNome },
      { quem, origem: "CADASTRO", produtoSku },
    );
    if (resultado.ok) criadas.push(resultado.correcao);
    else recusadas.push({ errado: item?.errado ?? null, certo: item?.certo ?? null, erro: resultado.erro ?? Object.values(resultado.erros).join(" ") });
  }
  return { criadas, recusadas };
}
