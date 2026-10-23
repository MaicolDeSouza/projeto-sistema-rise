import { prisma } from "@/lib/db";
import { INCLUDE_DO_ICONE_BLING } from "@/lib/blingSync/estado";
import { anuncioLIDoProduto, contextoDoProduto, novoRascunhoLI, rascunhoDoAnuncio } from "@/lib/canaisDeVenda/li/banco";
import { comAncestrais } from "@/lib/canaisDeVenda/li/categorias";
import { RascunhoLISchema } from "@/lib/canaisDeVenda/li/esquema";
import { listarCategoriasDaLI, listarMarcasDaLI, mesmaMarca } from "@/lib/canaisDeVenda/li/leitura";
import { descriptionPadrao } from "@/lib/canaisDeVenda/li/seo";
import { seoDosConcorrentes } from "@/lib/canaisDeVenda/li/seoConcorrentes";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";
import { aplicarProposta, montarProposta } from "./preencher";
import { VERSAO_ROTEIRO_LI } from "./roteiros";
import { blingVerde } from "./situacao";

/**
 * A proposta do anuncio da Loja Integrada (spec 2026-10-23, Entrega 1): categorias (com as pais), marca e a Meta Tag
 * Description. Le a LI (so GET) e grava SO no rascunho do `Anuncio` do Rise, com `dados.proposta`; nada vai a loja ate o
 * dono sincronizar. O Tag Title nao entra: e o nome do produto, sem IA (decisao do dono).
 */

export const LIMITES_DA_DESCRIPTION = [130, 160];
const CANAL = "LOJA_INTEGRADA";

async function produtoPeloSku(sku) {
  const achado = await prisma.produto.findUnique({ where: { sku }, select: { id: true } });
  if (!achado) throw new ErroDeFerramenta(`Produto ${sku} não encontrado.`);
  return contextoDoProduto(achado.id);
}

export async function lerParaPropostaLI(cliente, sku) {
  const produto = await produtoPeloSku(sku);
  const [categorias, marcas, seoConcorrentes, anuncio] = await Promise.all([
    listarCategoriasDaLI(cliente),
    listarMarcasDaLI(cliente),
    seoDosConcorrentes(produto.id),
    anuncioLIDoProduto(produto.id),
  ]);
  return {
    produto: {
      sku: produto.sku,
      nome: produto.tituloBase,
      marca: produto.marca ?? null,
      modelo: produto.modelo ?? null,
      descricao: produto.descricaoBase ?? "",
      conferido: Boolean(produto.conferido),
    },
    categorias: categorias.map((categoria) => ({ id: categoria.id, caminho: categoria.caminho })),
    marcas: marcas.map((marca) => marca.nome),
    seoConcorrentes,
    rascunho: anuncio ? rascunhoDoAnuncio(anuncio) : null,
    limites: { description: [...LIMITES_DA_DESCRIPTION] },
  };
}

/** Recusa o que nao pode virar proposta, ANTES de ler a LI ou gravar: Conferido e o Bling verde. */
async function exigirProdutoPronto(sku) {
  const produto = await prisma.produto.findUnique({ where: { sku }, include: INCLUDE_DO_ICONE_BLING });
  if (!produto) throw new ErroDeFerramenta(`Produto ${sku} não encontrado.`);
  if (!produto.conferido) throw new ErroDeFerramenta(`O produto ${sku} ainda não está Conferido no Rise: a proposta de anúncio vem depois.`);
  if (!blingVerde(produto).verde) {
    throw new ErroDeFerramenta(`O produto ${sku} não está igual no Bling (sincronize com o Bling antes; o ícone precisa estar verde e sem "!").`);
  }
  return produto;
}

/**
 * @param {object} cliente  o cliente da LI (so GET aqui)
 * @param {string} sku
 * @param {{ categorias: string[], marca?: string, seoDescription: string, relatorio?: string }} entrada
 * @returns {Promise<{ anuncioId: string, campos: string[], sugestoes: object, avisos: string[] }>}
 */
export async function gravarPropostaLI(cliente, sku, { categorias = [], marca = "", seoDescription = "", relatorio = "" }) {
  await exigirProdutoPronto(sku);
  const description = String(seoDescription ?? "").replace(/\s+/g, " ").trim();
  const [minimo, maximo] = LIMITES_DA_DESCRIPTION;
  if (description.length < minimo || description.length > maximo) {
    throw new ErroDeFerramenta(`A Meta Tag Description precisa ter de ${minimo} a ${maximo} caracteres (tem ${description.length}).`);
  }

  const produto = await produtoPeloSku(sku);
  const [arvore, marcasDaLoja] = await Promise.all([listarCategoriasDaLI(cliente), listarMarcasDaLI(cliente)]);
  const ids = [...new Set((categorias ?? []).map((id) => String(id).trim()).filter(Boolean))];
  const desconhecidas = ids.filter((id) => !arvore.some((categoria) => categoria.id === id));
  if (desconhecidas.length > 0) throw new ErroDeFerramenta(`Categoria ${desconhecidas.join(", ")} não existe na Loja Integrada. Use os ids de lerParaPropostaLI.`);

  const avisos = [];
  let nomeDaMarca = String(marca ?? "").trim();
  if (nomeDaMarca) {
    const naLoja = marcasDaLoja.find((candidata) => mesmaMarca(candidata.nome, nomeDaMarca));
    if (naLoja) nomeDaMarca = naLoja.nome;
    else avisos.push(`A marca "${nomeDaMarca}" não existe na loja: o Sincronizar a cria na Loja Integrada.`);
  }

  const anuncio = await anuncioLIDoProduto(produto.id);
  let base;
  if (anuncio) base = rascunhoDoAnuncio(anuncio);
  else {
    const novo = await novoRascunhoLI(produto.id);
    if (!novo.ok) throw new ErroDeFerramenta(novo.erro);
    base = novo.rascunho;
  }

  // A description que o rascunho novo ganha sozinho (o comeco da descricao) conta como vazia: a da proposta e melhor.
  const padrao = descriptionPadrao(produto.descricaoBase ?? "", produto.tituloBase ?? "");
  const vazio = (caminho, valor) => {
    if (valor === null || valor === undefined || valor === "" || (Array.isArray(valor) && valor.length === 0)) return true;
    return caminho === "seo.description" && valor === padrao;
  };
  const propostos = { categorias: comAncestrais(ids, arvore), "seo.description": description };
  // "ARDUINO" no rascunho e "Arduino" na loja sao a mesma marca (o envio as casa assim): nao vira sugestao.
  if (nomeDaMarca && !mesmaMarca(base.marca, nomeDaMarca)) propostos.marca = nomeDaMarca;
  const { rascunho, campos, sugestoes, valores } = aplicarProposta(base, propostos, { vazio });

  const lido = RascunhoLISchema.safeParse(rascunho);
  if (!lido.success) throw new ErroDeFerramenta("O rascunho da Loja Integrada ficou inválido com a proposta. Confira os campos e grave de novo.");
  const proposta = montarProposta({ versaoDoRoteiro: VERSAO_ROTEIRO_LI, campos, sugestoes, valores, relatorio, extras: { avisos } });
  const anuncioId = await gravarRascunhoComProposta(anuncio?.id ?? null, lido.data, proposta);
  return { anuncioId, campos, sugestoes, avisos };
}

/** Rascunho e proposta numa transacao so, com a linha travada (o Salvar do editor nao pode cair no meio). */
async function gravarRascunhoComProposta(anuncioId, rascunho, proposta) {
  const { produtoId, titulo, ...dados } = rascunho;
  const colunas = { produtoId, titulo, categoriaExternaId: rascunho.categorias[0] ?? null };
  return prisma.$transaction(async (tx) => {
    if (!anuncioId) {
      const criado = await tx.anuncio.create({ data: { ...colunas, canal: CANAL, status: "RASCUNHO", dados: { ...dados, proposta } }, select: { id: true } });
      return criado.id;
    }
    await tx.$queryRaw`SELECT id FROM "Anuncio" WHERE id = ${anuncioId} FOR UPDATE`;
    const atual = await tx.anuncio.findUnique({ where: { id: anuncioId }, select: { dados: true } });
    await tx.anuncio.update({ where: { id: anuncioId }, data: { ...colunas, dados: { ...(atual?.dados ?? {}), ...dados, proposta } } });
    return anuncioId;
  });
}
