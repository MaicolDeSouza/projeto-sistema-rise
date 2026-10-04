/**
 * Estado do icone do Bling na lista de Produtos: uma cor e, a parte, um selo "?" que diz
 * por que o Rise e o Bling podem estar diferentes. Sem imports, sem banco e sem rede: a
 * lista, o pop-up e o teste leem a mesma regra.
 *
 * Cor e selo sao independentes. A cor diz se o produto ja foi sincronizado alguma vez
 * (cinza = nunca, verde = ja); o selo aparece sobre qualquer das duas.
 */

/// Contagem ruim (ausente, texto, NaN) conta 0: o numero vem de um count do banco que a tela
/// passa adiante, e um valor estranho nao pode derrubar a lista inteira com um erro.
function contagemSegura(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * @param {object} entrada
 * @param {Date|null} entrada.sincronizadoEm quando o produto foi sincronizado pela ultima vez.
 * @param {string|null} entrada.assinaturaGuardada assinatura dos campos no ultimo envio.
 * @param {string} entrada.assinaturaAtual assinatura dos campos como o Rise os tem agora.
 * @param {number} entrada.pendentes quantos ajustes de estoque ainda nao foram ao Bling.
 * @returns {{cor: "cinza"|"verde", divergente: boolean, motivos: ("campos"|"estoque")[]}}
 */
export function estadoDoIconeBling({ sincronizadoEm, assinaturaGuardada, assinaturaAtual, pendentes }) {
  const sincronizado = Boolean(sincronizadoEm);
  const motivos = [];

  // Sem sincronizacao nao ha o que comparar: nunca enviado nao e "campo mudou".
  if (sincronizado && assinaturaGuardada !== assinaturaAtual) motivos.push("campos");
  if (contagemSegura(pendentes) > 0) motivos.push("estoque");

  return { cor: sincronizado ? "verde" : "cinza", divergente: motivos.length > 0, motivos };
}
