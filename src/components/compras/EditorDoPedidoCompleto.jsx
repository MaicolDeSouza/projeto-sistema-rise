"use client";

import EditorPedido from "./EditorPedido";

/**
 * O editor com as pecas das tarefas seguintes ligadas (chegada/lancamento de estoque, arquivo da proposta e PDF). Fica
 * separado para o EditorPedido nao conhecer cada uma delas.
 */
export default function EditorDoPedidoCompleto({ pedidoInicial, transportadoras, podeEditar, podeLancar }) {
  void podeLancar;
  return <EditorPedido pedidoInicial={pedidoInicial} transportadoras={transportadoras} podeEditar={podeEditar} extras={{}} />;
}
