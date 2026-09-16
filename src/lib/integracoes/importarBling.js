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
 * O Bling nao ordena a listagem por codigo, entao a ordem e feita aqui: le o
 * catalogo inteiro (paginas de 100, ~3 req/s) e ordena na memoria. Com ~1000
 * produtos sao uns 11 pedidos, poucos segundos.
 *
 * Cada clique traz os PROXIMOS da fila: produto que ja existe aqui (pelo id do
 * Bling ou pelo SKU) fica de fora. Sem isso, clicar de novo tentaria importar
 * os mesmos cinco e pararia no SKU repetido.
 */

const POR_PAGINA = 100;
/// Trava contra laco infinito caso o Bling passe a devolver sempre a mesma pagina.
const MAXIMO_PAGINAS = 200;

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

    const lote = dados?.data ?? [];
    produtos.push(...lote);
    if (lote.length < POR_PAGINA) break;
  }

  return produtos;
}

/** Descricao do Bling vem em HTML; o cadastro base guarda texto. */
function htmlParaTexto(html) {
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
function unidadeDe(valor) {
  const unidade = (valor ?? "").trim().toUpperCase();
  if (UNIDADES.includes(unidade)) return unidade;
  if (["M", "METRO", "METROS"].includes(unidade)) return "MT";
  return "UN";
}

/// dimensoes.unidadeMedida do Bling: 0 = metros, 1 = centimetros, 2 = milimetros.
function emCm(valor, unidadeMedida) {
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
 * Importa os proximos `quantidade` produtos do Bling, em ordem crescente de
 * codigo, que ainda nao existem no cadastro.
 */
export async function importarProximosDoBling(quantidade = 5) {
  const catalogo = await listarCatalogo();

  const existentes = await prisma.produto.findMany({
    select: { sku: true, blingId: true },
  });
  const skus = new Set(existentes.map((produto) => produto.sku.toLowerCase()));
  const blingIds = new Set(existentes.map((produto) => produto.blingId).filter(Boolean));

  // Codigo que nao serve de nome de pasta (espaco, barra) nao entra: o SKU daqui
  // vira caminho em dados/produtos. Esses sao contados para a tela avisar.
  const semCodigoValido = catalogo.filter((produto) => !skuValido(produto.codigo?.trim()));

  const fila = catalogo
    .filter((produto) => skuValido(produto.codigo?.trim()))
    .filter(
      (produto) =>
        !blingIds.has(String(produto.id)) &&
        !skus.has(produto.codigo.trim().toLowerCase()),
    )
    .sort((a, b) => compararCodigos(a.codigo.trim(), b.codigo.trim()));

  const importados = [];
  const falhas = [];

  for (const resumo of fila.slice(0, quantidade)) {
    try {
      const { ok, status, dados } = await blingGet(`/produtos/${resumo.id}`);
      if (!ok || !dados?.data) {
        throw new Error(dados?.error?.description ?? `HTTP ${status}`);
      }

      const bling = dados.data;
      const produto = await prisma.produto.create({
        data: {
          ...mapearProduto(bling),
          // O produto ja existe no Bling: o selo "B" da lista e o id que liga os
          // dois lados precisam nascer junto, senao a tela oferece "Cadastrar no
          // Bling" e duplicaria o item no ERP.
          anuncios: {
            create: {
              canal: "BLING",
              status: "PUBLICADO",
              situacaoCanal: bling.situacao === "A" ? "ATIVA" : "PAUSADA",
              idExterno: String(bling.id),
              sincronizadoEm: new Date(),
            },
          },
        },
      });

      const imagens = await importarImagens(produto.id, produto.sku, bling);
      importados.push({ sku: produto.sku, nome: produto.tituloBase, ...imagens });
    } catch (erro) {
      falhas.push({ sku: resumo.codigo, erro: erro.message });
    }
  }

  return {
    importados,
    falhas,
    totalBling: catalogo.length,
    restantes: Math.max(0, fila.length - importados.length - falhas.length),
    semCodigoValido: semCodigoValido.length,
  };
}
