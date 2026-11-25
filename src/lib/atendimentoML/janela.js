import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";

import { lerAtendimento } from "./banco";
import { montarContextoDePosVenda } from "./contexto";
import { aplicarConversaLida, lerConversaDoML, mensagemDePosVendaLiberada, TEXTO_DA_TRAVA_DE_MENSAGENS, textoDoBloqueio } from "./posVenda";
import { atualizarAvisoFechado } from "./telegram";

/**
 * O que a JANELA DA CONVERSA de pos-venda mostra ao abrir (fase 2). Rele a conversa no ML, sem marcar como lida, para o
 * dono ver a mensagem que acabou de chegar ou a que ja foi respondida pelo app, e junta o pedido do Rise so com o que a
 * tela mostra (numero, situacao, itens, envio e rastreio; nunca nome, documento ou endereco). Sem o ML, abre com o retrato
 * guardado e avisa ("ml-fora").
 *
 * Quem confere a permissao e a acao que chama (`detalhesDaPerguntaAcao`); aqui nao ha sessao.
 */
export async function detalhesDaConversa(id, { ml = null, env = process.env } = {}) {
  const antes = await lerAtendimento(id);
  if (!antes || antes.tipo !== "POS_VENDA") return null;

  const avisos = [];
  try {
    const cliente = ml ?? clienteML();
    const vendedorId = await cliente.usuarioId();
    const dados = await lerConversaDoML(cliente, antes.idExterno, { vendedorId });
    if (dados) {
      const aplicada = await aplicarConversaLida(antes.idExterno, dados, { vendedorId });
      // Respondida pelo app do ML: o aviso do Telegram perde os botoes (nunca lanca).
      if (aplicada.fechou) await atualizarAvisoFechado(id);
    }
  } catch (erro) {
    console.error("[atendimento] conversa:", erro?.message ?? erro);
    avisos.push("ml-fora");
  }

  const atendimento = await lerAtendimento(id);
  const contexto = await montarContextoDePosVenda(id);
  const conversa = atendimento.conversa && typeof atendimento.conversa === "object" ? atendimento.conversa : {};
  return {
    ok: true,
    tipo: "POS_VENDA",
    rascunho: atendimento.rascunho ?? "",
    rascunhoOrigem: atendimento.rascunhoOrigem,
    status: atendimento.status,
    erroDoEnvio: atendimento.erroDoEnvio,
    limite: contexto.limite,
    motivoDoEnvioDesligado: mensagemDePosVendaLiberada(env) ? null : TEXTO_DA_TRAVA_DE_MENSAGENS,
    bloqueio: textoDoBloqueio(atendimento.bloqueio),
    emReclamacao: Boolean(conversa.emReclamacao),
    longa: Boolean(conversa.longa),
    // A tela mostra a conversa como o comprador escreveu (e a conversa do dono com o cliente dele); a mascara e para a IA.
    conversa: Array.isArray(conversa.mensagens) ? conversa.mensagens : [],
    textoDoCliente: atendimento.textoDoCliente,
    respostaEnviada: atendimento.respostaEnviada,
    respondidaVia: atendimento.respondidaVia,
    respondidaEm: atendimento.respondidaEm?.toISOString() ?? null,
    pedido: contexto.pedido ? { ...contexto.pedido, id: atendimento.pedido?.id ?? null } : null,
    urlNoML: `https://www.mercadolivre.com.br/vendas/${encodeURIComponent(atendimento.pedido?.idExterno ?? atendimento.idExterno)}/detalhe`,
    outros: [],
    respondidas: [],
    avisos: [...avisos, ...contexto.avisos],
  };
}
