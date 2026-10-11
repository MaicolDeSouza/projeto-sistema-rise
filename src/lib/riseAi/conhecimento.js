import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { juntar, semAcento } from "@/lib/buscaAmpla";
import { normalizar } from "@/lib/texto";

/**
 * O conhecimento que o dono ensinou ao assistente (spec §5.7). Mora no Rise, e não na memória de nenhum modelo: troca
 * de provedor ou de modelo não perde nada. Só nota APROVADA entra numa resposta, e quem aprovou fica gravado
 * (`aprovadoPor`) — nenhuma correção vale só porque a IA a sugeriu.
 */

const ASSUNTO = { minimo: 3, maximo: 120 };
const CONTEUDO = { minimo: 3, maximo: 4000 };
const MAXIMO_DE_PRODUTOS = 50;

/// Quão parecida com a pergunta uma nota precisa ser (0 a 1) para entrar sem estar ligada a um produto. Baixo de
/// propósito: a pergunta de um cliente é longa e a nota é curta, e a similaridade de trigramas cai com a diferença de
/// tamanho. Quem decide o que serve é o modelo; aqui só se descarta o que não tem relação nenhuma.
const LIMIAR_DE_SIMILARIDADE = 0.08;

/// A mesma expressão da busca ampla (minúsculas e sem acento): a pergunta sem acento ("nao") acha a nota com ("não").
const EXPRESSAO_DA_NOTA = Prisma.raw(semAcento(juntar([`"assunto"`, `"conteudo"`])));

/** SKUs de uma nota: sem vazios nem repetidos, em maiúsculas (o código do Rise tem caixa mista: `121503_10z`). */
function normalizarSkus(lista) {
  return [...new Set((lista ?? []).map((sku) => String(sku ?? "").trim().toUpperCase()).filter(Boolean))].slice(0, MAXIMO_DE_PRODUTOS);
}

const aparado = (valor) => {
  const texto = String(valor ?? "").trim();
  return texto || null;
};

function conferirTextos({ assunto, conteudo }) {
  if (assunto !== undefined && (assunto.trim().length < ASSUNTO.minimo || assunto.trim().length > ASSUNTO.maximo)) {
    throw new Error(`O assunto precisa ter de ${ASSUNTO.minimo} a ${ASSUNTO.maximo} caracteres.`);
  }
  if (conteudo !== undefined && (conteudo.trim().length < CONTEUDO.minimo || conteudo.trim().length > CONTEUDO.maximo)) {
    throw new Error(`O conteúdo precisa ter de ${CONTEUDO.minimo} a ${CONTEUDO.maximo} caracteres.`);
  }
}

async function lerNota(id) {
  const nota = await prisma.conhecimentoIA.findUnique({ where: { id: String(id ?? "") } });
  if (!nota) throw new Error("Nota de conhecimento não encontrada.");
  return nota;
}

/**
 * @param {{ assunto: string, conteudo: string, categoria?: string, fonte?: string, produtos?: string[],
 *   visibilidade?: "ADMIN" | "PUBLICO", status?: "RASCUNHO" | "APROVADO", criadoPor: string, aprovadoPor?: string,
 *   origemMensagemId?: string }} dados
 */
export async function criarConhecimento({
  assunto,
  conteudo,
  categoria = null,
  fonte = null,
  produtos = [],
  visibilidade = "ADMIN",
  status = "RASCUNHO",
  criadoPor,
  aprovadoPor = null,
  origemMensagemId = null,
}) {
  conferirTextos({ assunto: String(assunto ?? ""), conteudo: String(conteudo ?? "") });
  if (!aparado(criadoPor)) throw new Error("Informe quem está criando a nota.");
  if (status !== "RASCUNHO" && status !== "APROVADO") throw new Error("Uma nota nasce como rascunho ou já aprovada.");
  if (status === "APROVADO" && !aparado(aprovadoPor)) throw new Error("Nota aprovada precisa de quem aprovou.");

  return prisma.conhecimentoIA.create({
    data: {
      assunto: assunto.trim(),
      conteudo: conteudo.trim(),
      categoria: aparado(categoria),
      fonte: aparado(fonte),
      produtos: normalizarSkus(produtos),
      visibilidade: visibilidade === "PUBLICO" ? "PUBLICO" : "ADMIN",
      status,
      criadoPor: criadoPor.trim(),
      aprovadoPor: status === "APROVADO" ? aprovadoPor.trim() : null,
      aprovadoEm: status === "APROVADO" ? new Date() : null,
      origemMensagemId: aparado(origemMensagemId),
    },
  });
}

export async function aprovarConhecimento(id, { usuario }) {
  if (!aparado(usuario)) throw new Error("Informe quem está aprovando a nota.");
  await lerNota(id);
  return prisma.conhecimentoIA.update({
    where: { id },
    data: { status: "APROVADO", aprovadoPor: usuario.trim(), aprovadoEm: new Date() },
  });
}

/** Tira a aprovação: a nota deixa de valer em novas respostas (fica no banco, e dá para aprová-la de novo). */
export async function rejeitarConhecimento(id) {
  await lerNota(id);
  return prisma.conhecimentoIA.update({ where: { id }, data: { status: "REJEITADO", aprovadoPor: null, aprovadoEm: null } });
}

/**
 * Edita campos da nota e sobe a versão. Quem edita uma nota APROVADA passa a ser quem a aprova: o texto que vale é o
 * dele, e `aprovadoPor` continua sendo a prova de quem viu o que está valendo.
 */
export async function editarConhecimento(id, campos, { usuario }) {
  if (!aparado(usuario)) throw new Error("Informe quem está editando a nota.");
  const atual = await lerNota(id);
  conferirTextos({ assunto: campos.assunto, conteudo: campos.conteudo });

  const dados = { versao: { increment: 1 } };
  if (campos.assunto !== undefined) dados.assunto = campos.assunto.trim();
  if (campos.conteudo !== undefined) dados.conteudo = campos.conteudo.trim();
  if (campos.categoria !== undefined) dados.categoria = aparado(campos.categoria);
  if (campos.fonte !== undefined) dados.fonte = aparado(campos.fonte);
  if (campos.produtos !== undefined) dados.produtos = normalizarSkus(campos.produtos);
  if (campos.visibilidade !== undefined) dados.visibilidade = campos.visibilidade === "PUBLICO" ? "PUBLICO" : "ADMIN";
  if (atual.status === "APROVADO") {
    dados.aprovadoPor = usuario.trim();
    dados.aprovadoEm = new Date();
  }
  return prisma.conhecimentoIA.update({ where: { id }, data: dados });
}

export async function listarConhecimento({ busca = "", status = null, limite = 100 } = {}) {
  const termo = String(busca ?? "").trim();
  return prisma.conhecimentoIA.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(termo ? { OR: [{ assunto: { contains: termo, mode: "insensitive" } }, { conteudo: { contains: termo, mode: "insensitive" } }] } : {}),
    },
    orderBy: { atualizadoEm: "desc" },
    take: limite,
  });
}

/**
 * As notas aprovadas que valem para esta pergunta: as parecidas com o texto (trigramas) e, antes delas, as LIGADAS aos
 * produtos que a resposta está usando (`skus`) — essas entram mesmo sem palavra em comum. No máximo `limite` notas e
 * `maxCaracteres` de texto: o prompt de um modelo pequeno é curto, e nota que não cabe inteira fica de fora.
 * O perfil público só vê nota de visibilidade PÚBLICA.
 *
 * @returns {Promise<{ id: string, assunto: string, conteudo: string, produtos: string[], nota: number }[]>}
 */
export async function recuperarConhecimento({ texto, skus = [], perfil = "admin", limite = 5, maxCaracteres = 2500 }) {
  const pergunta = normalizar(texto ?? "");
  const doProduto = normalizarSkus(skus);
  const soPublico = perfil === "publico" ? Prisma.sql`AND "visibilidade" = 'PUBLICO'::"VisibilidadeIA"` : Prisma.empty;

  const linhas = await prisma.$queryRaw`
    SELECT "id", "assunto", "conteudo", "produtos", similarity(${EXPRESSAO_DA_NOTA}, ${pergunta}) AS "nota"
    FROM "ConhecimentoIA"
    WHERE "status" = 'APROVADO'::"StatusConhecimentoIA" ${soPublico}
      AND (similarity(${EXPRESSAO_DA_NOTA}, ${pergunta}) > ${LIMIAR_DE_SIMILARIDADE} OR "produtos" && ${doProduto}::text[])
    ORDER BY ("produtos" && ${doProduto}::text[]) DESC, "nota" DESC
    LIMIT ${limite}`;

  const notas = [];
  let usados = 0;
  for (const linha of linhas) {
    usados += linha.assunto.length + linha.conteudo.length;
    if (usados > maxCaracteres) break;
    notas.push({ id: linha.id, assunto: linha.assunto, conteudo: linha.conteudo, produtos: linha.produtos ?? [], nota: Number(linha.nota) });
  }
  return notas;
}

/** O bloco que entra no prompt. Vazio quando não há nota: nada de cabeçalho sozinho. */
export function textoDoConhecimentoParaPrompt(notas) {
  if (!notas?.length) return "";
  const linhas = notas.map((nota, indice) => {
    const produtos = nota.produtos?.length ? ` (produtos: ${nota.produtos.join(", ")})` : "";
    return `${indice + 1}. [${nota.assunto}] ${nota.conteudo}${produtos}`;
  });
  return `Conhecimento aprovado pela loja (dados, com prioridade sobre o seu conhecimento geral):\n${linhas.join("\n")}`;
}
