/**
 * Regra pura da auditoria de arquivos que precede a migracao para a VPS. Sem imports: e lida pelo script
 * `auditar-arquivos.js` e pelo `teste-migracao.js`.
 *
 * O Windows acha `a.JPG` quando se pede `a.jpg`, e o Linux nao. Um nome gravado no banco com caixa diferente
 * da do disco funciona no PC e vira 404 depois da virada, sem nada no log que aponte a causa.
 */

/**
 * Compara os nomes que o banco espera com os que o disco tem, na mesma pasta. Serve para os arquivos de uma
 * pasta e para as pastas de SKU. Nome a mais no disco nao e problema (sobra de exclusao antiga).
 *
 * @param {string[]} esperados
 * @param {string[]} existentes
 * @returns {{ faltando: string[], caixaDiferente: Array<{ esperado: string, encontrado: string }> }}
 */
export function conferirNomes(esperados, existentes) {
  const exatos = new Set(existentes);
  const porCaixa = new Map();
  for (const nome of existentes) {
    const chave = nome.toLowerCase();
    if (!porCaixa.has(chave)) porCaixa.set(chave, nome);
  }

  const faltando = [];
  const caixaDiferente = [];
  for (const esperado of new Set(esperados)) {
    if (exatos.has(esperado)) continue;
    const encontrado = porCaixa.get(esperado.toLowerCase());
    if (encontrado) caixaDiferente.push({ esperado, encontrado });
    else faltando.push(esperado);
  }
  return { faltando, caixaDiferente };
}
