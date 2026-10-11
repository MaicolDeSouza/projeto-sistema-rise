/// Os textos do "Varrer pelo PC", num lugar so: a janela do botao da VPS e a dica da caixa em "Testar fonte" dizem a
/// mesma coisa (pedido do dono em 11/10/2026).

export const PASSOS_DO_PEDIDO = [
  "No seu PC: abra o Rise em localhost e deixe o PC ligado, sem suspender.",
  "Na VPS: se a fonte estiver pausada, clique em Retomar antes.",
  "Na VPS: a linha da fonte mostra \"Na fila do PC\" (até 1 minuto) e depois \"Varrendo pelo PC\". O worker do PC desliga sozinho ao terminar.",
  "Na VPS: confira se os novos produtos apareceram.",
];

export const AVISO_DO_PEDIDO = "Se o Rise do localhost estiver fechado, o pedido fica esperando até você abri-lo.";

export const DICA_DE_CADASTRO = "Cadastre a fonte sempre na VPS, nunca no Rise do localhost: o cadastro feito lá se perde.";

/// Texto da bolha "i" da caixa "Varrer pelo PC" (tela Testar fonte, na VPS).
export const DICA_DA_CAIXA =
  "Use quando o site bloqueia a VPS e só deixa passar o seu PC. " +
  "1) Na VPS: marque esta caixa e salve a fonte. " +
  "2) Na VPS: se ela ficar pausada, clique em Retomar. " +
  "3) Na lista de fontes, clique em Varrer pelo PC e siga o procedimento. " +
  "4) No seu PC: deixe o Rise em localhost aberto e o PC sem suspender; ele atende o pedido sozinho em até 1 minuto. " +
  DICA_DE_CADASTRO;
