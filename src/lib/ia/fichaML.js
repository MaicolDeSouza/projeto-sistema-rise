import { limparAtributosDaIA, montarPedidoDaFicha } from "../canaisDeVenda/ml/atributos";
import { SISTEMA_IA, chamarIA } from "./anuncio";
import { chamarComPesquisa } from "./pesquisaML";

/**
 * Ficha tecnica do anuncio do Mercado Livre pela IA (fase 2): completa so os atributos da
 * categoria que estao em branco, a partir do produto e, se o dono marcar, de pesquisa na internet.
 * A resposta passa por `limparAtributosDaIA`: id que a categoria nao tem, valor fora da lista e o
 * que ja estava preenchido saem. A tela mostra a lista para o dono marcar antes de aplicar.
 */

const FORMATO_FICHA = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      atributos: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" }, valor: { type: "string" } },
          required: ["id", "valor"],
          additionalProperties: false,
        },
      },
    },
    required: ["atributos"],
    additionalProperties: false,
  },
};

export async function preencherFichaIA({ produto, especificacoes = [], atributos = [], valoresAtuais = {}, internet = false }) {
  const pedido =
    montarPedidoDaFicha({
      titulo: produto?.tituloBase,
      marca: produto?.marca,
      modelo: produto?.modelo,
      descricao: produto?.descricaoBase,
      especificacoes,
      atributos,
      valoresAtuais,
    }) + (internet ? "\n\nPode pesquisar o produto na internet (fabricante, datasheet) para confirmar as especificações." : "");

  let bruto;
  if (internet) {
    bruto = await chamarComPesquisa({ tarefa: "ficha-ml", pedido });
  } else {
    const resposta = await chamarIA({ tarefa: "ficha-ml", quantidade: 0, sistema: SISTEMA_IA, pedido, formato: FORMATO_FICHA });
    try {
      bruto = JSON.parse(resposta);
    } catch {
      throw new Error("A IA devolveu a ficha em formato inesperado. Tente de novo.");
    }
  }
  return limparAtributosDaIA(bruto, atributos, valoresAtuais);
}
