"use server";

import { revalidatePath } from "next/cache";

import { desconectar, lerSegredo, registrarTeste, salvarConexao } from "@/lib/integracoes/conexoes";
import { RECURSO_DA_ABA, salvarAba } from "@/lib/riseAi/abasDeConfiguracao";
import { SERVICO_DO_PROVEDOR, gravarChave, gravarConfiguracao, lerChave, lerConfiguracao } from "@/lib/riseAi/configuracao";
import { ErroDeUso } from "@/lib/riseAi/erros";
import { idsDosModelos } from "@/lib/riseAi/formularios";
import { provedorPorId } from "@/lib/riseAi/modelos";
import { ehErroDeProvedor } from "@/lib/riseAi/provedores/contrato";
import { criarProvedor } from "@/lib/riseAi/provedores/index";
import { esquecerSaude } from "@/lib/riseAi/provedores/saude";
import { executarComAcesso } from "@/lib/acessos/servidor";
import { criarClienteTelegram, limparToken, tokenValido } from "@/lib/telegram/cliente";
import { SERVICO_TELEGRAM } from "@/lib/telegram/estado";
import { comSessaoDoRiseAi } from "../sessao";

/**
 * Ações da tela de configurações do Rise AI. TODAS passam por `executarComAcesso` com o recurso de Acessos da aba delas
 * (`riseAi.configuracoes.<aba>`, conferido no servidor antes de qualquer leitura). Finas: a regra mora em
 * `src/lib/riseAi/`, que já é testado. Chaves, "Testar conexão" e modelos habilitados são da aba Modelos.
 *
 * A CHAVE de um provedor vai sempre num `FormData` e nunca volta: o `next dev` imprime no terminal os argumentos de
 * toda Server Action, e um `FormData` aparece como `({})` (a lição do `cotacao.js`). Nenhuma ação devolve chave, nem a
 * cifrada.
 */

const atualizarTelas = () => revalidatePath("/rise-ai", "layout");

/** O provedor do pedido; um id que o navegador inventou não vira consulta ao banco. */
function provedorConhecido(id) {
  const provedor = provedorPorId(String(id ?? ""));
  if (!provedor) throw new ErroDeUso("Provedor desconhecido.");
  return provedor;
}

/**
 * Grava os campos de UMA aba (`modelos`, `orcamentos`, `canais` ou `atendimento`), e só eles. Valor inválido não grava
 * nada e volta `erros` por campo (`padrao.modelo`, `orcamentos.internoBrl`, `internet`…), para a tela marcar o campo certo.
 * Aba que não existe não tem recurso: o involucro recusa (falha fechada), e `salvarAba` também confere.
 */
export async function salvarAbaAcao(aba, formData) {
  return executarComAcesso(RECURSO_DA_ABA[aba], "editar", comSessaoDoRiseAi(async (sessao) => {
    const resultado = await salvarAba(aba, formData, { usuario: sessao.usuario, pode: sessao.pode });
    if (!resultado.ok) return resultado;
    esquecerSaude();
    atualizarTelas();
    return {};
  }));
}

/** Guarda a chave (campo `chave`, só de escrita). Só provedor que usa chave. */
export async function salvarChaveAcao(provedor, formData) {
  return executarComAcesso("riseAi.configuracoes.modelos", "editar", comSessaoDoRiseAi(async () => {
    if (!provedorConhecido(provedor).precisaDeChave) throw new ErroDeUso("Este provedor não usa chave.");
    const chave = String(formData.get("chave") ?? "").trim();
    if (!chave) throw new ErroDeUso("Informe a chave.");
    await gravarChave(provedor, chave);
    esquecerSaude();
    atualizarTelas();
    return {};
  }));
}

/** Apaga a chave cadastrada na tela. A do `.env` (`ANTHROPIC_API_KEY`...) não é nossa: continua valendo, e a tela diz. */
export async function removerChaveAcao(provedor) {
  return executarComAcesso("riseAi.configuracoes.modelos", "editar", comSessaoDoRiseAi(async () => {
    provedorConhecido(provedor);
    await desconectar(SERVICO_DO_PROVEDOR[provedor]);
    esquecerSaude();
    atualizarTelas();
    return {};
  }));
}

/**
 * Testa a conexão com o provedor, com o endereço e a chave que valem agora, e anota o resultado. Devolve a latência e os
 * modelos encontrados, ou o erro (`ok: false`): o teste que falha não é falha da ação, e a tela mostra o motivo.
 */
export async function testarProvedorAcao(provedor) {
  return executarComAcesso("riseAi.configuracoes.modelos", "editar", comSessaoDoRiseAi(async () => {
    provedorConhecido(provedor);
    const configuracao = await lerConfiguracao();
    let resultado;
    try {
      const adaptador = criarProvedor(provedor, { endpoint: configuracao.endpoints[provedor], chave: await lerChave(provedor) });
      resultado = await adaptador.testar();
    } catch (falha) {
      // Sem chave, o adaptador da Anthropic recusa já na criação: é o resultado do teste, não um defeito.
      if (!ehErroDeProvedor(falha)) throw falha;
      resultado = { ok: false, latenciaMs: 0, modelos: [], erro: falha.message };
    }
    const { ok, latenciaMs, modelos, erro } = resultado;
    await registrarTeste(SERVICO_DO_PROVEDOR[provedor], { ok, erro });
    atualizarTelas();
    return { ok, latenciaMs, modelos, erro };
  }));
}

/** Os modelos que aparecem nas listas Padrão e Reserva: os marcados nas caixas (`modelo`, repetido). */
export async function habilitarModelosAcao(provedor, formData) {
  return executarComAcesso("riseAi.configuracoes.modelos", "editar", comSessaoDoRiseAi(async (sessao) => {
    provedorConhecido(provedor);
    const resultado = await gravarConfiguracao({ modelosHabilitados: { [provedor]: idsDosModelos(formData) } }, { usuario: sessao.usuario });
    if (!resultado.ok) return { ok: false, erro: "Corrija os campos marcados.", erros: resultado.erros };
    atualizarTelas();
    return {};
  }));
}

// ------------------------------------------------------------------------------------------- Telegram (Entrega C1)
// O token do bot e da aba Canais, e o recurso dela (`riseAi.configuracoes.canais`) nao e delegavel: so o Administrador.
// O token chega num FormData (campo `token`, so de escrita), fica cifrado em `Conexao` e nunca volta para a tela.

/** Guarda o token do bot. Nao testa: o "Testar conexao" e um clique a parte, como nos provedores. */
export async function salvarTokenTelegramAcao(formData) {
  return executarComAcesso("riseAi.configuracoes.canais", "editar", comSessaoDoRiseAi(async () => {
    const token = limparToken(formData.get("token"));
    if (!token) throw new ErroDeUso("Cole o token do bot.");
    if (!tokenValido(token)) throw new ErroDeUso("Token do bot inválido. Copie o token inteiro do BotFather.");
    await salvarConexao(SERVICO_TELEGRAM, { segredo: { token }, status: "CONECTADO", conectadoEm: new Date(), contaExterna: null, ultimoTesteEm: null, ultimoTesteOk: null, ultimoErro: null });
    atualizarTelas();
    return {};
  }));
}

export async function removerTokenTelegramAcao() {
  return executarComAcesso("riseAi.configuracoes.canais", "editar", comSessaoDoRiseAi(async () => {
    await desconectar(SERVICO_TELEGRAM);
    atualizarTelas();
    return {};
  }));
}

/** `getMe` com o token cadastrado. O teste que falha nao e falha da acao: volta `ok: false` com o erro (ja mascarado). */
export async function testarTelegramAcao() {
  return executarComAcesso("riseAi.configuracoes.canais", "editar", comSessaoDoRiseAi(async () => {
    const segredo = await lerSegredo(SERVICO_TELEGRAM);
    if (!segredo?.token) throw new ErroDeUso("Cadastre o token do bot antes de testar.");
    const resposta = await criarClienteTelegram({ token: segredo.token }).getMe();
    const usuario = resposta.ok && resposta.dados?.username ? `@${resposta.dados.username}` : null;
    await registrarTeste(SERVICO_TELEGRAM, { ok: resposta.ok, conta: usuario, erro: resposta.erro });
    atualizarTelas();
    return { ok: resposta.ok, usuario, erro: resposta.ok ? null : resposta.erro };
  }));
}
