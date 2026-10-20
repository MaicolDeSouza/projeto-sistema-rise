import { registrarAuditoria } from "@/lib/acessos/banco";
import { recursoPorId } from "@/lib/acessos/recursos";
import { gravarConfiguracao } from "./configuracao";
import { ErroDeUso } from "./erros";
import { parcialDaConfiguracao } from "./formularios";
import { PROMPT_ATENDIMENTO_PADRAO, PROMPT_INTERNO_PADRAO } from "./prompt";
import { registrarVersaoDePrompt } from "./versoesDePrompt";

/**
 * As três abas de Configurações do Rise AI (spec §5a.5). Cada uma grava SÓ os campos dela, com o recurso de Acessos dela
 * em "editar", e o que mexe em dinheiro ou nos prompts entra na trilha de auditoria na MESMA transação.
 *
 *   modelos      Padrão, Reserva, tempos, limites e endereços (as chaves e o "Testar conexão" têm ações próprias)
 *   orcamentos   o teto de gasto do mês dos clientes
 *   atendimento  só para o Administrador: o prompt das respostas ao cliente
 *
 * O chat interno saiu (decisão C1 do dono, 20/10/2026), e com ele a aba Canais (a internet), o orçamento interno e o
 * prompt interno. Os três continuam gravados e lidos por `responder` (o Telegram decide se os usa); só não se editam
 * mais pela tela, e um campo deles que chegue num formulário é ignorado como campo de outra aba.
 */

export const ABAS = ["modelos", "orcamentos", "atendimento"];

export const RECURSO_DA_ABA = {
  modelos: "riseAi.configuracoes.modelos",
  orcamentos: "riseAi.configuracoes.orcamentos",
  atendimento: "riseAi.configuracoes.atendimento",
};

/** Delegar este recurso não existe: o prompt das respostas ao cliente é só do Administrador (conferido em código). */
const RECURSO_DO_PROMPT_DO_CLIENTE = "riseAi.configuracoes.promptCliente";

const CAMPOS_DA_ABA = {
  modelos: ["padraoProvedor", "padraoModelo", "reservaProvedor", "reservaModelo", "primeiroTokenMs", "totalMs", "maxChamadasDeFerramenta", "maxTokensResposta", "contextoMaxTokens", "taxaPorUsuarioPorMinuto"],
  orcamentos: ["orcamentoClientesBrl"],
  atendimento: ["promptCliente"],
};

const ehCampoDaAba = (aba, nome) => CAMPOS_DA_ABA[aba].includes(nome) || (aba === "modelos" && nome.startsWith("endpoint."));

/** Só os campos da aba, com o do prompt do cliente no nome que `parcialDaConfiguracao` lê. Arquivo ou campo de outra aba não entra. */
function dadosDaAba(aba, dados) {
  const filtrado = new FormData();
  for (const [nome, valor] of dados.entries()) {
    if (typeof valor !== "string" || !ehCampoDaAba(aba, nome)) continue;
    filtrado.append(nome === "promptCliente" ? "promptAtendimento" : nome, valor);
  }
  return filtrado;
}

const recortar = (objeto, chaves) => Object.fromEntries(chaves.map((chave) => [chave, objeto?.[chave]]));
const iguais = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Os dois prompts: o canal do histórico, a chave em `prompts` e o texto de fábrica (que vale enquanto o salvo é nulo). */
const PROMPTS = [
  { canal: "interno", chave: "interno", padrao: PROMPT_INTERNO_PADRAO },
  { canal: "cliente", chave: "atendimento", padrao: PROMPT_ATENDIMENTO_PADRAO },
];

/** O que entra na trilha e no histórico, dentro da transação da gravação. `antes` e `depois` são a configuração que vale em cada momento. */
async function registrarMudancas(tx, parcial, { antes, depois }, quem) {
  if (parcial.orcamentos) {
    const chaves = Object.keys(parcial.orcamentos);
    const de = recortar(antes.orcamentos, chaves);
    const para = recortar(depois.orcamentos, chaves);
    if (!iguais(de, para)) await registrarAuditoria(tx, { quem, oQue: "rise-ai.orcamentos", alvo: "ConfiguracaoIA", antes: de, depois: para });
  }
  if ("internet" in parcial && antes.internet !== depois.internet) {
    await registrarAuditoria(tx, { quem, oQue: "rise-ai.internet", alvo: "ConfiguracaoIA", antes: { internet: antes.internet }, depois: { internet: depois.internet } });
  }
  for (const { canal, chave, padrao } of PROMPTS) {
    if (!parcial.prompts || !(chave in parcial.prompts)) continue;
    const de = antes.prompts?.[chave] ?? padrao;
    const para = depois.prompts?.[chave] ?? padrao;
    if (de === para) continue;
    // O texto do prompt não vai para a trilha (é longo e fica no histórico); só o canal e o tamanho.
    await registrarAuditoria(tx, { quem, oQue: "rise-ai.prompt", alvo: "ConfiguracaoIA", antes: { canal, tamanho: de.length }, depois: { canal, tamanho: para.length } });
    await registrarVersaoDePrompt(canal, para, quem, tx);
  }
}

/**
 * Grava os campos da aba (e SÓ eles). Confere o recurso da aba em "editar" (a ação já confere, e aqui de novo: a regra mora
 * onde o teste alcança). Valor inválido volta como `{ ok: false, erros }` e nada é gravado nem auditado.
 *
 * @param {string} aba
 * @param {FormData} dados
 * @param {{ usuario: string, pode: (id: string, nivel: string) => boolean }} sessao
 * @returns {Promise<{ ok: true } | { ok: false, erro: string, erros?: Record<string, string> }>}
 */
export async function salvarAba(aba, dados, { usuario, pode }) {
  if (!ABAS.includes(aba)) throw new ErroDeUso("Aba desconhecida.");
  const recurso = RECURSO_DA_ABA[aba];
  if (!pode?.(recurso, "editar")) return { ok: false, erro: `Sem permissão para ${recursoPorId(recurso)?.rotulo ?? "isso"}.` };
  if (aba === "atendimento" && dados.has("promptCliente") && !pode(RECURSO_DO_PROMPT_DO_CLIENTE, "editar")) {
    const erro = "Só o administrador altera o prompt das respostas ao cliente.";
    return { ok: false, erro, erros: { promptCliente: erro } };
  }

  const parcial = parcialDaConfiguracao(dadosDaAba(aba, dados));
  if (Object.keys(parcial).length === 0) throw new ErroDeUso("Nada para salvar.");
  const resultado = await gravarConfiguracao(parcial, { usuario, auditoria: (tx, quadro) => registrarMudancas(tx, parcial, quadro, usuario) });
  if (!resultado.ok) return { ok: false, erro: "Corrija os campos marcados.", erros: resultado.erros };
  return { ok: true };
}
