"use server";

import { negarSemAcesso, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { chaveDaSessao, salvarOrdemDosCartoes } from "@/lib/ordemDosCartoes/banco";

// Quem ve a pagina pode arrumar os cartoes DELA (a ordem e so da propria pessoa).
const RECURSO_DA_PAGINA = {
  painel: "tela.painel",
  cadastros: "tela.cadastros",
  "canais-de-venda": "tela.canaisDeVenda",
  compras: "tela.compras",
  configuracoes: "tela.configuracoes",
  estoque: "tela.estoque",
  ferramentas: "tela.ferramentas",
  indicadores: "tela.indicadores",
  // A ordem dos botoes do menu lateral (09/11/2026): o menu aparece em todas as telas, entao basta ver o Painel.
  menu: "tela.painel",
};

/**
 * Grava a ordem dos cartoes da pagina para a pessoa logada (pedido do dono em 07/11/2026, Opcao 1: por usuario). Lista
 * vazia volta a ordem padrao. Nao revalida a pagina: a tela ja mostra a ordem nova.
 */
export async function salvarOrdemDosCartoesAcao(pagina, ordem) {
  const negado = await negarSemAcesso(RECURSO_DA_PAGINA[pagina] ?? "tela.painel", "ver");
  if (negado) return negado;
  if (!RECURSO_DA_PAGINA[pagina]) return { ok: false, erro: "Página sem cartões." };
  try {
    return await salvarOrdemDosCartoes(chaveDaSessao(await sessaoDeAcessos()), pagina, ordem);
  } catch (erro) {
    console.error("[cartoes] ordem não gravada:", erro?.message ?? erro);
    return { ok: false, erro: "Não foi possível guardar a ordem." };
  }
}
