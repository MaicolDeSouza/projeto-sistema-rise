"use server";

import { revalidatePath } from "next/cache";

import { desconectar, registrarTeste } from "@/lib/integracoes/conexoes";
import { RECURSO_DA_ABA, salvarAba } from "@/lib/riseAi/abasDeConfiguracao";
import { SERVICO_DO_PROVEDOR, gravarChave, gravarConfiguracao, lerChave, lerConfiguracao } from "@/lib/riseAi/configuracao";
import { ErroDeUso } from "@/lib/riseAi/erros";
import { idsDosModelos } from "@/lib/riseAi/formularios";
import { provedorPorId } from "@/lib/riseAi/modelos";
import { ehErroDeProvedor } from "@/lib/riseAi/provedores/contrato";
import { criarProvedor } from "@/lib/riseAi/provedores/index";
import { esquecerSaude } from "@/lib/riseAi/provedores/saude";
import { executarComAcesso } from "@/lib/acessos/servidor";
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
