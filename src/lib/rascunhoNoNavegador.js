/**
 * O `localStorage` do rascunho automatico do cadastro (ver `rascunhoDoCadastro.js`, que e a regra pura). Cada acesso
 * tem try/catch: navegador em janela privada, armazenamento cheio ou bloqueado lanca excecao, e o cadastro tem de
 * funcionar do mesmo jeito, so sem rascunho.
 *
 * Lido com `useSyncExternalStore` (o React 19 barra `setState` dentro de efeito; ver `preferenciaMenu.js`). So a
 * mudanca vinda de OUTRA aba (evento `storage`) avisa quem le: a propria gravacao nao avisa, porque o formulario
 * grava a cada pausa na digitacao e o aviso de "recuperar" nao pode reaparecer enquanto o dono edita.
 */

export function subscreverRascunhos(ouvinte) {
  window.addEventListener("storage", ouvinte);
  return () => window.removeEventListener("storage", ouvinte);
}

/** O texto guardado, ou `null` (sem rascunho, ou sem armazenamento). */
export function lerRascunhoBruto(chave) {
  try {
    return window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}

/** `true` se gravou. `false` quando o armazenamento recusou (cheio, bloqueado, janela privada). */
export function gravarRascunhoBruto(chave, texto) {
  try {
    window.localStorage.setItem(chave, texto);
    return true;
  } catch {
    return false;
  }
}

export function apagarRascunhoBruto(chave) {
  try {
    window.localStorage.removeItem(chave);
  } catch {
    // Sem armazenamento, nao ha o que apagar.
  }
}
