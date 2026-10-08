import { SISTEMA_IA, chamarIA } from "./anuncio";
import { chamarComPesquisa } from "./pesquisaML";

/**
 * IA na sugestao de categoria do Mercado Livre (fase 2). A IA NUNCA inventa um codigo de
 * categoria: ou escolhe entre as candidatas que o proprio ML devolveu (`domain_discovery`), ou
 * devolve termos de busca melhores, que voltam ao ML. Quem orquestra e
 * `src/lib/canaisDeVenda/ml/inteligencia.js`.
 */

const texto = (valor) => String(valor ?? "").trim();
const MAXIMO_DE_TERMOS = 3;
const TAMANHO_DO_TERMO = 60;

const FORMATO_ESCOLHA = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: { categoriaId: { type: "string" }, motivo: { type: "string" } },
    required: ["categoriaId", "motivo"],
    additionalProperties: false,
  },
};

function descricaoDoProduto({ titulo, marca, modelo, descricao }) {
  return (
    `Produto: ${texto(titulo)}\nMarca: ${texto(marca) || "(sem)"}\nModelo: ${texto(modelo) || "(sem)"}\n\n` +
    `Descrição:\n${String(descricao ?? "").slice(0, 3000) || "(vazia)"}`
  );
}

/** O pedido: o produto e as candidatas do ML, uma por linha (`id: caminho`). */
export function montarPedidoDeEscolha({ titulo = "", marca = "", modelo = "", descricao = "", candidatas = [] }) {
  const linhas = candidatas.map((candidata) => `${candidata.categoriaId}: ${(candidata.caminho ?? []).join(" > ") || candidata.nome}`);
  return (
    "Escolha a categoria do Mercado Livre em que este produto deve ser anunciado.\n\n" +
    "Regras:\n" +
    "- escolha UMA, só da lista abaixo, pelo id;\n" +
    "- prefira a mais específica para o produto;\n" +
    "- dê um motivo curto (uma frase).\n\n" +
    `${descricaoDoProduto({ titulo, marca, modelo, descricao })}\n\n` +
    `Categorias candidatas (id: caminho):\n${linhas.join("\n")}\n\n` +
    'Responda no formato {"categoriaId": "...", "motivo": "..."}.'
  );
}

/** So um id que esta entre as candidatas; qualquer outro (inventado) vira `null`. */
export function limparEscolha(bruto, candidatas) {
  const id = texto(bruto?.categoriaId);
  if (!id || !(candidatas ?? []).some((candidata) => candidata.categoriaId === id)) return null;
  return { categoriaId: id, motivo: texto(bruto.motivo) };
}

/** A IA escolhe entre as candidatas do ML. `null` quando ela aponta uma que nao estava na lista. */
export async function escolherCategoriaIA({ produto, candidatas }) {
  const resposta = await chamarIA({
    tarefa: "categoria-ml",
    quantidade: 0,
    sistema: SISTEMA_IA,
    pedido: montarPedidoDeEscolha({
      titulo: produto?.tituloBase,
      marca: produto?.marca,
      modelo: produto?.modelo,
      descricao: produto?.descricaoBase,
      candidatas,
    }),
    formato: FORMATO_ESCOLHA,
  });
  try {
    return limparEscolha(JSON.parse(resposta), candidatas);
  } catch {
    throw new Error("A IA devolveu a categoria em formato inesperado. Tente de novo.");
  }
}

/** Termos de busca da resposta: texto aparado, sem repetir (sem caixa), ate 3, cada um ate 60. */
export function limparTermos(bruto) {
  const vistos = new Set();
  const termos = [];
  for (const item of Array.isArray(bruto?.termos) ? bruto.termos : []) {
    if (typeof item !== "string") continue;
    const termo = item.replace(/\s+/g, " ").trim().slice(0, TAMANHO_DO_TERMO).trim();
    if (!termo || vistos.has(termo.toLowerCase())) continue;
    vistos.add(termo.toLowerCase());
    termos.push(termo);
    if (termos.length >= MAXIMO_DE_TERMOS) break;
  }
  return termos;
}

/**
 * Quando o ML nao acha categoria pelo titulo: a IA pesquisa o produto na internet e devolve ate
 * 3 nomes curtos pelos quais ele e vendido, que voltam ao `domain_discovery`.
 */
export async function termosDeBuscaIA({ produto }) {
  const pedido =
    "O Mercado Livre não encontrou categoria para este produto pelo título. Pesquise o produto na internet " +
    `e diga ${MAXIMO_DE_TERMOS} nomes curtos (2 a 5 palavras) pelos quais ele é vendido no Mercado Livre do Brasil.\n\n` +
    `${descricaoDoProduto({ titulo: produto?.tituloBase, marca: produto?.marca, modelo: produto?.modelo, descricao: produto?.descricaoBase })}\n\n` +
    'Termine a resposta com o JSON {"termos": ["...", "..."]}.';
  return limparTermos(await chamarComPesquisa({ tarefa: "termos-ml", pedido }));
}
