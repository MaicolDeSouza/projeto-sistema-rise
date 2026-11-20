/**
 * A TELA do widget do chat da loja (o Hobi). Este arquivo nao roda sozinho: o montador (scripts/montar-widget.js) o cola
 * depois do nucleo (nucleo.js), dentro de uma funcao unica, e troca o marcador das imagens pelo mascote embutido.
 *
 * Esqueleto da Tarefa 2 do plano da fase 2: so marca que o arquivo carregou. A janela de verdade entra na Tarefa 3.
 */

/* global window */

var HOBI_IMAGENS = __HOBI_IMAGENS__;

try {
  if (!window.__hobi4hobby) window.__hobi4hobby = { imagens: Object.keys(HOBI_IMAGENS).length };
} catch {
  // Nunca quebra a pagina da loja.
}
