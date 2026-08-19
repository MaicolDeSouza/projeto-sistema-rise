const CHAVE = "rise:sidebar-recolhida";

const ouvintes = new Set();

/**
 * localStorage e uma fonte de dados externa ao React. Expor como store e ler
 * com useSyncExternalStore evita o setState-dentro-de-efeito e mantem o HTML
 * do servidor coerente com a primeira renderizacao do cliente.
 */
export function subscrever(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function lerRecolhida() {
  return window.localStorage.getItem(CHAVE) === "1";
}

/** No servidor nao existe preferencia salva: o menu comeca expandido. */
export function lerRecolhidaNoServidor() {
  return false;
}

export function definirRecolhida(valor) {
  window.localStorage.setItem(CHAVE, valor ? "1" : "0");
  for (const ouvinte of ouvintes) ouvinte();
}
