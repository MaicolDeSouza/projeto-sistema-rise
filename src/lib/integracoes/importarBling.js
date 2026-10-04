import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { skuValido } from "@/lib/arquivos";
import { decodificar } from "@/lib/coleta/texto-html";
import { anexarImagens } from "@/lib/imagensImportadas";
import { UNIDADES } from "@/lib/unidades";

import { blingGet } from "./bling";

/**
 * Importacao de produtos do Bling para o cadastro base.
 *
 * So LE o Bling (GET): nao passa pela trava BLING_ESCRITA e nao altera nada la.
 *
 * Em duas etapas, porque o catalogo tem centenas de produtos e cada um leva um
 * pedido de detalhe mais o download das fotos: uma chamada so estouraria o tempo
 * de resposta.
 *   1. `planejarImportacaoDoBling` le o catalogo inteiro UMA vez (paginas de 100,
 *      ~3 req/s), descarta o que ja existe aqui e devolve a fila de ids em ordem
 *      de codigo (o Bling nao ordena a listagem, entao a ordem e feita aqui).
 *   2. `importarLoteDoBling` importa uma fatia pequena dessa fila. A tela chama
 *      em laco, mostra o progresso e pode parar entre um lote e outro.
 *
 * Retomar e seguro: produto que ja existe aqui (pelo id do Bling ou pelo SKU) e
 * pulado, entao um novo plano depois de uma parada so traz o que faltou.
 */

const POR_PAGINA = 100;
/// Trava contra laco infinito caso o Bling passe a devolver sempre a pagina.
const MAXIMO_PAGINAS = 200;
/// Tamanho maximo de um lote: o navegador escolhe o tamanho, o servidor limita.
export const MAXIMO_POR_LOTE = 10;

/// "900403_100" antes de "920302_1.000", e "2" antes de "10".
export const compararCodigos = (a, b) =>
  a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });

async function listarCatalogo() {
  const produtos = [];

  for (let pagina = 1; pagina <= MAXIMO_PAGINAS; pagina++) {
    // criterio 2 = so ativos. Produto inativo no Bling nao e vendido; traze-lo
    // para o cadastro base encheria a lista de itens mortos.
    const { ok, status, dados } = await blingGet("/produtos", {
      pagina,
      limite: POR_PAGINA,
      criterio: 2,
    });

    if (!ok) {
      const detalhe = dados?.error?.description ?? dados?.error?.message ?? `HTTP ${status}`;
      throw new Error(`Bling recusou a listagem de produtos: ${detalhe}`);
    }

    // O fim da paginacao e decidido pelo tamanho da pagina CRUA do Bling, nao do
    // que sobra apos o filtro: uma pagina cheia de variacao/composicao teria poucos
    // itens "S" e pareceria a ultima pagina, cortando o resto do catalogo.
    const paginaCrua = dados?.data ?? [];
    const lote = paginaCrua.filter((p) => p.formato === "S");
    produtos.push(...lote);
    if (paginaCrua.length < POR_PAGINA) break;
  }

  return produtos;
}

/** Descricao do Bling vem em HTML; o cadastro base guarda texto. */
export function htmlParaTexto(html) {
  if (!html) return null;
  const texto = decodificar(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return texto || null;
}

/**
 * A lista de unidades daqui e fechada. O Bling usa "PÇ", "Un", "pc" para a
 * mesma coisa; o que nao casar vira UN em vez de barrar a importacao.
 */
export function unidadeDe(valor) {
  const unidade = (valor ?? "").trim().toUpperCase();
  if (UNIDADES.includes(unidade)) return unidade;
  if (["M", "METRO", "METROS"].includes(unidade)) return "MT";
  return "UN";
}

/// dimensoes.unidadeMedida do Bling: 0 = metros, 1 = centimetros, 2 = milimetros.
export function emCm(valor, unidadeMedida) {
  const numero = Number(valor);
  if (!numero || numero <= 0) return null;
  const fator = { 0: 100, 1: 1, 2: 0.1 }[unidadeMedida] ?? 1;
  return Math.round(numero * fator * 100) / 100;
}

const positivoOuNull = (valor) => (Number(valor) > 0 ? Number(valor) : null);
const textoOuNull = (valor) => (valor && String(valor).trim()) || null;

function mapearProduto(bling) {
  const tributacao = bling.tributacao ?? {};
  const dimensoes = bling.dimensoes ?? {};
  const estoque = bling.estoque ?? {};

  return {
    sku: bling.codigo.trim(),
    tituloBase: bling.nome.trim(),
    descricaoBase: htmlParaTexto(bling.descricaoCurta),
    // Maiusculas, como o cadastro manual (pedido do dono em 16/09/2026).
    marca: textoOuNull(bling.marca)?.toLocaleUpperCase("pt-BR") ?? null,
    ean: textoOuNull(bling.gtin),
    precoVenda: positivoOuNull(bling.preco),
    estoque: Math.max(0, Math.trunc(Number(estoque.saldoVirtualTotal) || 0)),
    localizacao: textoOuNull(estoque.localizacao),
    estoqueMinimo: positivoOuNull(estoque.minimo),
    estoqueMaximo: positivoOuNull(estoque.maximo),
    unidade: unidadeDe(bling.unidade),
    pesoKg: positivoOuNull(bling.pesoBruto) ?? positivoOuNull(bling.pesoLiquido),
    alturaCm: emCm(dimensoes.altura, dimensoes.unidadeMedida),
    larguraCm: emCm(dimensoes.largura, dimensoes.unidadeMedida),
    comprimentoCm: emCm(dimensoes.profundidade, dimensoes.unidadeMedida),
    videoUrl: textoOuNull(bling.midia?.video?.url),
    origem: Number.isInteger(tributacao.origem) ? tributacao.origem : null,
    ncm: textoOuNull(tributacao.ncm),
    cest: textoOuNull(tributacao.cest),
    spedTipoItem: textoOuNull(tributacao.spedTipoItem),
    percentualTributos: positivoOuNull(tributacao.percentualTributos),
    ativo: bling.situacao === "A",
    blingId: String(bling.id),
  };
}

/**
 * Imagens do Bling, copiadas para dados/produtos/<SKU>/imagens.
 *
 * Os links do Bling sao do S3 e EXPIRAM (validade de uma semana): guardar a URL
 * deixaria o produto sem foto dias depois. Por isso o arquivo e copiado.
 */
function importarImagens(produtoId, sku, bling) {
  const imagens = bling.midia?.imagens ?? {};
  const enderecos = [
    ...(imagens.internas ?? []).map((imagem) => imagem.link),
    ...(imagens.externas ?? []).map((imagem) => imagem.link),
  ].filter(Boolean);

  return anexarImagens(
    produtoId,
    sku,
    enderecos.map((endereco) => ({ tipo: "endereco", endereco })),
  );
}

/**
 * Primeira etapa: le o catalogo inteiro (um pedido por pagina), filtra o que
 * ja existe aqui e devolve a fila de ids em ordem de codigo. Recalcular a cada
 * vez e seguro: produtos novos do Bling sao adicionados, os que ja existem sao
 * pulados automaticamente.
 */
export async function planejarImportacaoDoBling() {
  const catalogo = await listarCatalogo();

  const existentes = await prisma.produto.findMany({
    select: { sku: true, blingId: true },
  });
  const skus = new Set(existentes.map((produto) => produto.sku.toLowerCase()));
  const blingIds = new Set(existentes.map((produto) => produto.blingId).filter(Boolean));

  const semCodigoValido = catalogo.filter((produto) => !skuValido(produto.codigo?.trim()));

  const fila = catalogo
    .filter((produto) => skuValido(produto.codigo?.trim()))
    .filter(
      (produto) =>
        !blingIds.has(String(produto.id)) &&
        !skus.has(produto.codigo.trim().toLowerCase()),
    )
    .sort((a, b) => compararCodigos(a.codigo.trim(), b.codigo.trim()))
    .map((produto) => produto.id);

  return {
    fila,
    totalBling: catalogo.length,
    totalParaImportar: fila.length,
    semCodigoValido: semCodigoValido.length,
  };
}

/**
 * Fornecedor do Bling para o rascunho do produto: so RASCUNHO, nunca cria
 * Fornecedor nem ProdutoFornecedor aqui (pedido do dono em 22/09/2026). Fica em
 * Produto.fornecedorRascunho; a aba Fornecedores/Concorrentes mostra como linha
 * editavel, e so vira vinculo de verdade quando o operador salvar o produto.
 *
 * DUAS chamadas, porque o Bling espalha o fornecedor em dois lugares (medido em
 * 22/09/2026):
 *  - `GET /produtos/{id}` traz o NOME, em fornecedor.contato.nome — nao em
 *    fornecedor.nome, que nao existe.
 *  - `GET /produtos/fornecedores?idProduto=` traz a DESCRICAO (na tela do Bling
 *    "Descricao no fornecedor" — na pratica o link do produto no site do
 *    fornecedor, ex. AliExpress), o codigo e o preco de custo. O `fornecedor` do
 *    primeiro endpoint NAO tem esses campos (varias linhas de producao ja
 *    confirmaram: sem telefone, email, link nem descricao ali).
 * Falha na segunda chamada nao derruba a importacao do produto: o rascunho sai
 * so com o que o primeiro endpoint ja deu (nome, e o codigo/preco resumidos).
 */
async function lerFornecedorBling(bling) {
  const nome = textoOuNull(bling.fornecedor?.contato?.nome);
  if (!nome) return null;

  let linha = null;
  try {
    const { ok, dados } = await blingGet("/produtos/fornecedores", { idProduto: bling.id });
    const linhas = ok ? (dados?.data ?? []) : [];
    // O produto pode ter mais de um fornecedor cadastrado no Bling; o padrao e
    // o mesmo que aparece resumido em bling.fornecedor.
    linha = linhas.find((item) => item.padrao) ?? linhas[0] ?? null;
  } catch {
    // Sem sorte na segunda chamada: segue so com o resumo do primeiro endpoint.
  }

  return {
    nome,
    descricao: textoOuNull(linha?.descricao),
    codigo: textoOuNull(linha?.codigo ?? bling.fornecedor.codigo),
    precoCusto: positivoOuNull(
      linha?.precoCusto ?? linha?.precoCompra ?? bling.fornecedor.precoCusto ?? bling.fornecedor.precoCompra,
    ),
  };
}

/**
 * Segunda etapa: importa uma fatia da fila planejada. Cada produto leva um
 * pedido de detalhe mais download das fotos; a tela chama isto em laco e
 * mostra progresso.
 */
export async function importarLoteDoBling(fila, comeco = 0, quantidade = MAXIMO_POR_LOTE) {
  if (!Array.isArray(fila) || fila.length === 0) {
    return { importados: [], falhas: [], lotes: 0, total: 0, proximoComeco: 0 };
  }

  const lote = fila.slice(comeco, comeco + quantidade);
  const importados = [];
  const falhas = [];

  for (const idBling of lote) {
    try {
      const { ok, status, dados } = await blingGet(`/produtos/${idBling}`);
      if (!ok || !dados?.data) {
        throw new Error(dados?.error?.description ?? `HTTP ${status}`);
      }

      const bling = dados.data;
      const fornecedorBling = await lerFornecedorBling(bling);

      const produto = await prisma.produto.create({
        data: {
          ...mapearProduto(bling),
          // Json nulo no Prisma e Prisma.DbNull, nao null puro (ver CLAUDE.md).
          fornecedorRascunho: fornecedorBling ?? Prisma.DbNull,
          anuncios: {
            create: {
              canal: "BLING",
              status: "RASCUNHO",
              situacaoCanal: bling.situacao === "A" ? "ATIVA" : "PAUSADA",
              idExterno: String(bling.id),
              sincronizadoEm: new Date(),
            },
          },
        },
      });

      const imagens = await importarImagens(produto.id, produto.sku, bling);
      importados.push({
        sku: produto.sku,
        nome: produto.tituloBase,
        fornecedorBling,
        ...imagens,
      });
    } catch (erro) {
      falhas.push({ id: idBling, erro: erro.message });
    }
  }

  const proximoComeco = comeco + lote.length;
  const lotes = Math.ceil(proximoComeco / quantidade);

  return {
    importados,
    falhas,
    lotes,
    total: fila.length,
    proximoComeco,
  };
}
