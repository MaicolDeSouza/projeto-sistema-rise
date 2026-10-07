import { prisma } from "@/lib/db";
import { urlDe } from "@/lib/arquivos";
import { config } from "@/lib/integracoes/config";
import { lerConfigCanal } from "../configuracao";
import { RascunhoLISchema } from "./esquema";
import { rascunhoDaLI, rascunhoInicialLI } from "./rascunho";

/**
 * O anuncio da Loja Integrada no banco: um por produto (indice parcial `Anuncio_um_por_produto`,
 * so no SQL), com o rascunho em `dados` e o vinculo (`idExterno`, `urlExterna`) nas colunas.
 * Fica aqui, e nao nas Server Actions, porque as acoes, as paginas e o teste
 * (scripts/teste-li-sync.js) leem as mesmas funcoes.
 *
 * Diferente do Mercado Livre, o anuncio da LI vinculado (PUBLICADO) continua editavel: e
 * dele que o Sincronizar le o que vai para a loja.
 *
 * Onde mora cada campo: titulo em coluna (a descricao e a do cadastro, nao do anuncio); a primeira categoria tambem em
 * `categoriaExternaId` (para filtrar sem abrir o JSON); slug, marca, categorias, destaque,
 * videoUrl e seo no JSON `dados`.
 */

const CANAL = "LOJA_INTEGRADA";
const POR_PAGINA = 100;

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

const aindaNaoConferido = (sku) => `O produto ${sku} ainda nao foi Conferido. So produto Conferido vira anuncio.`;

const CAMPOS_DO_CONTEXTO = {
  id: true,
  sku: true,
  tituloBase: true,
  descricaoBase: true,
  marca: true,
  modelo: true,
  ean: true,
  ncm: true,
  origem: true,
  tipoProducao: true,
  pesoKg: true,
  alturaCm: true,
  larguraCm: true,
  comprimentoCm: true,
  garantiaMeses: true,
  numeroHomologacao: true,
  videoUrl: true,
  conferido: true,
};

/** O produto como `rascunho.js`, `validacao.js` e `campos.js` o leem, com Decimal em Number. */
export async function contextoDoProduto(produtoId) {
  if (typeof produtoId !== "string" || produtoId === "") return null;
  const p = await prisma.produto.findUnique({ where: { id: produtoId }, select: CAMPOS_DO_CONTEXTO });
  if (!p) return null;
  return {
    ...p,
    pesoKg: numero(p.pesoKg),
    alturaCm: numero(p.alturaCm),
    larguraCm: numero(p.larguraCm),
    comprimentoCm: numero(p.comprimentoCm),
  };
}

/**
 * Os documentos e o certificado do produto com endereco PUBLICO, para o bloco "Documentos" da
 * descricao. Sem `APP_URL_PUBLICA` (o Rise ainda roda so no PC) devolve nada: um link para o
 * localhost na loja quebraria para todo cliente.
 */
export async function documentosDoProduto(produto) {
  const base = String(config.appUrlPublica ?? "").trim().replace(/\/+$/, "");
  if (!base || !produto?.id || !produto?.sku) return [];
  const arquivos = await prisma.produtoArquivo.findMany({
    where: { produtoId: produto.id, tipo: { in: ["DOCUMENTO", "CERTIFICADO"] } },
    orderBy: [{ tipo: "asc" }, { ordem: "asc" }, { criadoEm: "asc" }],
    select: { tipo: true, arquivo: true, nomeOriginal: true },
  });
  return arquivos.map((a) => ({ url: `${base}${urlDe(produto.sku, a.tipo, a.arquivo)}`, nome: a.nomeOriginal ?? a.arquivo }));
}

/** O id do produto pelo SKU exato (a pagina "Novo anuncio" recebe o codigo digitado). */
export async function idDoProdutoPeloSku(sku) {
  const codigo = String(sku ?? "").trim();
  if (!codigo) return null;
  const achado = await prisma.produto.findUnique({ where: { sku: codigo }, select: { id: true } });
  return achado?.id ?? null;
}

export async function anuncioLIDoProduto(produtoId) {
  if (typeof produtoId !== "string" || produtoId === "") return null;
  return prisma.anuncio.findFirst({ where: { canal: CANAL, produtoId }, orderBy: { criadoEm: "asc" } });
}

// Anuncio sem `dados` (gravado por fora do editor) abre com o que falta em branco.
export function rascunhoDoAnuncio(anuncio) {
  const dados = anuncio?.dados ?? {};
  return {
    produtoId: anuncio.produtoId,
    titulo: anuncio.titulo ?? "",
    slug: dados.slug ?? "",
    marca: dados.marca ?? "",
    categorias: Array.isArray(dados.categorias) ? dados.categorias : [],
    destaque: Boolean(dados.destaque),
    videoUrl: dados.videoUrl ?? null,
    seo: { title: dados.seo?.title ?? "", description: dados.seo?.description ?? "" },
  };
}

async function contextoDoEditor(produto) {
  const [{ frases }, documentos] = await Promise.all([lerConfigCanal(CANAL), documentosDoProduto(produto)]);
  return { produto, frases, documentos, urlPublica: Boolean(String(config.appUrlPublica ?? "").trim()) };
}

export async function novoRascunhoLI(produtoId) {
  const produto = await contextoDoProduto(produtoId);
  if (!produto) return { ok: false, erro: "Produto nao encontrado." };
  if (!produto.conferido) return { ok: false, erro: aindaNaoConferido(produto.sku) };
  return { ok: true, rascunho: rascunhoInicialLI(produto), contexto: await contextoDoEditor(produto) };
}

/** Abre o anuncio para editar. Produto que deixou de ser Conferido abre; quem recusa e o Salvar. */
export async function carregarAnuncioLI(id) {
  const naoAchou = { ok: false, erro: "Anuncio nao encontrado." };
  // `where: { id: undefined }` o Prisma le como "sem filtro": um id ausente nao pode chegar la.
  if (typeof id !== "string" || id === "") return naoAchou;
  const anuncio = await prisma.anuncio.findFirst({ where: { id, canal: CANAL } });
  if (!anuncio) return naoAchou;
  const produto = await contextoDoProduto(anuncio.produtoId);
  return {
    ok: true,
    anuncioId: anuncio.id,
    status: anuncio.status,
    rascunho: rascunhoDoAnuncio(anuncio),
    contexto: await contextoDoEditor(produto),
    vinculo: {
      idExterno: anuncio.idExterno,
      urlExterna: anuncio.urlExterna,
      situacaoCanal: anuncio.situacaoCanal,
      sincronizadoEm: anuncio.sincronizadoEm,
      erro: anuncio.erro,
    },
  };
}

function colunasEDados(rascunho) {
  const { produtoId, titulo, ...dados } = rascunho;
  return {
    colunas: { produtoId, titulo, categoriaExternaId: rascunho.categorias[0] ?? null },
    dados,
  };
}

/**
 * Grava o rascunho. Sem `anuncioId` e com um anuncio da LI ja existente para o produto, atualiza
 * esse (um por produto). O produto de um anuncio existente nao muda pelo que vem da tela.
 */
export async function salvarRascunhoLI(anuncioId, entrada) {
  const lido = RascunhoLISchema.safeParse(entrada);
  if (!lido.success) return { ok: false, erro: "O rascunho chegou incompleto. Recarregue a tela." };
  const rascunho = lido.data;

  try {
    let existente = null;
    if (anuncioId !== null && anuncioId !== undefined) {
      if (typeof anuncioId === "string" && anuncioId !== "") {
        existente = await prisma.anuncio.findFirst({
          where: { id: anuncioId, canal: CANAL },
          select: { id: true, produtoId: true, dados: true },
        });
      }
      if (!existente) return { ok: false, erro: "Anuncio nao encontrado." };
      rascunho.produtoId = existente.produtoId;
    } else if (rascunho.produtoId) {
      existente = await prisma.anuncio.findFirst({
        where: { canal: CANAL, produtoId: rascunho.produtoId },
        select: { id: true, produtoId: true, dados: true },
      });
    }

    if (!rascunho.produtoId) return { ok: false, erro: "O rascunho chegou sem o produto. Recarregue a tela." };
    const produto = await prisma.produto.findUnique({ where: { id: rascunho.produtoId }, select: { sku: true, conferido: true } });
    if (!produto) return { ok: false, erro: "O produto do anuncio foi excluido." };
    if (!produto.conferido) {
      return { ok: false, erro: `O produto ${produto.sku} nao esta mais Conferido. Confira o cadastro antes de salvar o anuncio.` };
    }

    const { colunas, dados } = colunasEDados(rascunho);
    if (!existente) {
      const criado = await prisma.anuncio.create({ data: { ...colunas, canal: CANAL, status: "RASCUNHO", dados }, select: { id: true } });
      return { ok: true, id: criado.id };
    }
    // O que o editor nao conhece fica como estava no JSON.
    await prisma.anuncio.update({ where: { id: existente.id }, data: { ...colunas, dados: { ...(existente.dados ?? {}), ...dados } } });
    return { ok: true, id: existente.id };
  } catch (erro) {
    console.error("[canais de venda]", erro);
    return { ok: false, erro: "Nao foi possivel salvar. Tente de novo." };
  }
}

/**
 * Liga o produto ao que ja existe na LI com o mesmo SKU. Cria o anuncio (a partir do produto)
 * se nao havia rascunho. Slug, categorias e destaque vem da LI (`rascunhoDaLI`); o vinculo e o
 * link da loja no produto sao gravados juntos.
 */
export async function vincularPeloSku(produtoId, { idItemExterno, url, ativo, slug, categorias, destaque }) {
  const produto = await contextoDoProduto(produtoId);
  if (!produto) throw new Error("Produto nao encontrado para vincular.");
  const existente = await anuncioLIDoProduto(produtoId);
  const base = existente ? rascunhoDoAnuncio(existente) : rascunhoInicialLI(produto);
  const rascunho = rascunhoDaLI(base, { slug, categorias, destaque });
  const { colunas, dados } = colunasEDados(rascunho);
  const vinculo = {
    idExterno: String(idItemExterno),
    urlExterna: url ?? null,
    situacaoCanal: ativo ? "ATIVA" : "PAUSADA",
    status: "PUBLICADO",
    erro: null,
  };

  const anuncio = await prisma.$transaction(async (tx) => {
    const gravado = existente
      ? await tx.anuncio.update({
          where: { id: existente.id },
          data: { ...colunas, ...vinculo, dados: { ...(existente.dados ?? {}), ...dados } },
          select: { id: true },
        })
      : await tx.anuncio.create({ data: { ...colunas, ...vinculo, canal: CANAL, dados }, select: { id: true } });
    if (url) await tx.produto.update({ where: { id: produtoId }, data: { urlLojaIntegrada: url } });
    return gravado;
  });
  return { anuncioId: anuncio.id };
}

/** Lista dos anuncios da LI, 100 por pagina, o mais recente primeiro; busca sem caixa em titulo e SKU. */
export async function listarAnunciosLI({ busca, pagina } = {}) {
  const termo = String(busca ?? "").trim();
  const where = {
    canal: CANAL,
    ...(termo
      ? {
          OR: [
            { titulo: { contains: termo, mode: "insensitive" } },
            { produto: { sku: { contains: termo, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const total = await prisma.anuncio.count({ where });
  // Pagina fora do intervalo (link antigo, lista que encolheu) cai na mais proxima, nao numa tela vazia.
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pedida = Number.parseInt(pagina, 10);
  const atual = Math.min(Math.max(Number.isFinite(pedida) ? pedida : 1, 1), totalPaginas);
  const anuncios = await prisma.anuncio.findMany({
    where,
    orderBy: { atualizadoEm: "desc" },
    skip: (atual - 1) * POR_PAGINA,
    take: POR_PAGINA,
    select: {
      id: true,
      titulo: true,
      status: true,
      idExterno: true,
      urlExterna: true,
      sincronizadoEm: true,
      atualizadoEm: true,
      produto: { select: { sku: true } },
    },
  });
  return {
    linhas: anuncios.map((a) => ({
      id: a.id,
      sku: a.produto.sku,
      titulo: a.titulo ?? "",
      status: a.status,
      idExterno: a.idExterno,
      urlExterna: a.urlExterna,
      sincronizadoEm: a.sincronizadoEm,
      atualizadoEm: a.atualizadoEm,
    })),
    total,
    pagina: atual,
    totalPaginas,
  };
}
