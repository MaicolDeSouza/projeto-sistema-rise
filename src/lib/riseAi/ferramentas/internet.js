import { z } from "zod";

import { BUSCAS_POR_PESQUISA, USD_POR_BUSCA, pesquisarComAnthropic } from "@/lib/ia/pesquisaGeral";
import { cotacaoDoDolar } from "@/lib/cotacaoDolar";
import { PRECOS_USD_POR_MILHAO } from "../modelos";
import { liquidarReserva, registrarGasto, reservarOrcamento } from "../orcamento";
import { ErroDeFerramenta } from "./erro";

/**
 * "Pesquisar na internet" (spec §3): UMA consulta curta ao dia a dia da equipe ("qual o clock do ATmega328P?"), respondida
 * com a busca do servidor da Anthropic e devolvida ao modelo como um resumo com as fontes.
 *
 * Fica FORA de `FERRAMENTAS`: só entra na lista do modelo quando o chat é o da equipe (`perfil admin`) e o interruptor
 * "Pesquisar na internet" está ligado (`definicoesParaProvedor(perfil, { internet })`). O perfil cliente nunca a enxerga,
 * nem o guarda de teste que percorre o catálogo público. O que volta da internet é dado, nunca instrução (a regra está no
 * prompt interno); o resumo e as fontes só chegam à tela depois do analisador de texto seguro.
 */

/**
 * Quanto uma pesquisa pode custar NO PIOR CASO, para separar o dinheiro antes de sair: as buscas inteiras e o modelo mais
 * caro da lista (o Sonnet entra se o Haiku recusar a ferramenta), com a entrada e a saída que o laço de continuação alcança.
 */
const TOKENS_DE_ENTRADA_NO_PIOR_CASO = 30000;
const TOKENS_DE_SAIDA_NO_PIOR_CASO = 6000;

const arredondar = (valor, casas) => Math.round(valor * 10 ** casas) / 10 ** casas;

function estimativaEmReais() {
  const preco = PRECOS_USD_POR_MILHAO["claude-sonnet-5-5"];
  const usd = BUSCAS_POR_PESQUISA * USD_POR_BUSCA + (TOKENS_DE_ENTRADA_NO_PIOR_CASO / 1e6) * preco.entrada + (TOKENS_DE_SAIDA_NO_PIOR_CASO / 1e6) * preco.saida;
  return arredondar(usd * cotacaoDoDolar().valor, 4);
}

/** O custo real: os tokens pela tabela do modelo mais as buscas a US$ 0,01 cada; em reais pela cotação do sistema. */
function custoDaPesquisa({ modelo, uso, buscas }) {
  const preco = PRECOS_USD_POR_MILHAO[modelo];
  const dosTokens = preco ? (uso.entrada / 1e6) * preco.entrada + (uso.saida / 1e6) * preco.saida : 0;
  const usd = arredondar(dosTokens + buscas * USD_POR_BUSCA, 6);
  return { usd, brl: arredondar(usd * cotacaoDoDolar().valor, 4) };
}

/** O erro da API da Anthropic (chave, limite, rede) em português; qualquer outro vai como falha nossa. */
function erroDaPesquisa(erro) {
  if (erro instanceof ErroDeFerramenta) return erro;
  if (erro?.status === 401 || erro?.status === 403) return new ErroDeFerramenta("A chave da Anthropic foi recusada; a pesquisa na internet não funciona agora.");
  if (erro?.status === 429) return new ErroDeFerramenta("A Anthropic limitou as consultas agora. Tente de novo em instantes.");
  if (erro?.status >= 400 && erro?.status < 500) return new ErroDeFerramenta("A pesquisa na internet não está disponível nesta conta da Anthropic.");
  return erro;
}

export const FERRAMENTA_DE_INTERNET = {
  nome: "pesquisarNaInternet",
  descricao:
    "Pesquisa UM dado técnico na internet (ex.: o clock de um chip, a pinagem de um módulo) e devolve um resumo com as fontes. Use só quando o cadastro, o catálogo e as notas aprovadas não trazem a resposta. Uma consulta curta e específica por chamada.",
  perfis: ["admin"],
  esquema: z.object({ consulta: z.string().trim().min(3).max(200).describe("O que pesquisar, curto e específico, em português ou inglês") }),
  async executar({ consulta }, contexto) {
    const dono = contexto.conversaId ?? "sem-conversa";
    const agora = contexto.agoraDoOrcamento ?? Date.now();
    const reserva = await reservarOrcamento("INTERNO", estimativaEmReais(), { dono, agora, config: contexto.config, jaGastoBrl: contexto.jaGastoBrl ?? 0 });
    if (!reserva.ok) throw new ErroDeFerramenta("Orçamento interno do mês esgotado.");

    try {
      const pesquisar = contexto.pesquisar ?? pesquisarComAnthropic;
      let achado;
      try {
        achado = await pesquisar({ consulta, sinal: contexto.sinal });
      } catch (erro) {
        throw erroDaPesquisa(erro);
      }
      const custo = custoDaPesquisa(achado);
      await registrarGasto({
        tipo: "BUSCA",
        escopo: "INTERNO",
        provedor: "anthropic",
        modelo: achado.modelo,
        valorUsd: custo.usd,
        valorBrl: custo.brl,
        referencia: contexto.conversaId ?? null,
        detalhe: { buscas: achado.buscas, entrada: achado.uso.entrada, saida: achado.uso.saida },
      });
      return { resumo: achado.resumo, fontes: achado.fontes };
    } finally {
      await liquidarReserva(reserva.reservaId);
    }
  },
};
