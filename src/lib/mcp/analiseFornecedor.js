import { z } from "zod";

import { lerModeloDaAnalise } from "@/lib/analiseFornecedor/montar";
import { ESQUEMA_ANALISE, ROTEIRO_ANALISE, VERSAO_ROTEIRO_ANALISE } from "@/lib/analiseFornecedor/roteiro";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

/**
 * O roteiro da analise de lista de fornecedor (pedido do dono em 07/11/2026: "isso deve ficar descrito no rise pois posso
 * usar outra LLM para fazer essa mesma analise"): o mesmo para o Claude e o ChatGPT conectados ao Rise, no molde do
 * roteiroDaProposta. So le: devolve o roteiro, o formato dos dados e, a pedido, o modelo da pagina. O acesso e o dos
 * pedidos de compra (o fim da analise e o rascunho do fornecedor).
 */
const SO_LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

export const FERRAMENTAS_DA_ANALISE_DE_FORNECEDOR = [
  {
    nome: "roteiroDaAnaliseDeFornecedor",
    descricao:
      "Primeira chamada da análise de uma lista de preços de fornecedor (em R$ ou US$) contra os concorrentes e os outros fornecedores: devolve o roteiro (passos e regras) e o formato dos dados; com parte 'modelo', o HTML do modelo padrão da página. Siga exatamente; é o mesmo para qualquer assistente.",
    esquema: z.object({
      parte: z.enum(["roteiro", "modelo"]).optional().describe("'roteiro' (padrão): o roteiro e o formato dos dados; 'modelo': o HTML do modelo da página, com os marcadores /*__DADOS__*/null e /*__FOTOS__*/null"),
    }),
    anotacoes: SO_LEITURA,
    async executar({ parte = "roteiro" }, contexto) {
      if (typeof contexto?.pode !== "function" || !contexto.pode("tela.compras.pedidos", "ver")) {
        throw new ErroDeFerramenta("Este login não pode ver os pedidos de compra, e a análise de fornecedor termina neles.");
      }
      if (parte === "modelo") {
        return {
          versao: VERSAO_ROTEIRO_ANALISE,
          marcadores: ["/*__DADOS__*/null", "/*__FOTOS__*/null", "<title>Fornecedor × concorrentes</title>"],
          modelo: await lerModeloDaAnalise(),
        };
      }
      return { versao: VERSAO_ROTEIRO_ANALISE, roteiro: ROTEIRO_ANALISE, esquema: ESQUEMA_ANALISE };
    },
  },
];
