/**
 * Fontes que so podem ser varridas pelo PC do dono (localhost).
 *
 * O Cloudflare dessas lojas desafia IP de datacenter (a VPS da Hostinger responde
 * 403 com `cf-mitigated: challenge`) e deixa passar o IP residencial. Contornar o
 * desafio nao e opcao: e uma barreira posta de proposito pelo dono da loja. A fonte
 * continua cadastrada, e a tela avisa de onde ela pode ser varrida.
 *
 * Sem imports: a tela e o servidor leem o mesmo arquivo. Medido em 09/10/2026.
 */
const FONTES_SO_LOCALHOST = {
  "oceantech-automation.com.br": "Proteção anti-bot (Cloudflare) da loja bloqueia a VPS.",
};

/** O dominio guardado pode vir com "www." ou em outra caixa. */
function chaveDoDominio(dominio) {
  return String(dominio ?? "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
}

/**
 * Aviso para mostrar na fonte, ou null quando ela pode ser varrida em qualquer lugar.
 *
 * @param {string} dominio
 * @returns {string|null}
 */
export function avisoSoLocalhost(dominio) {
  const motivo = FONTES_SO_LOCALHOST[chaveDoDominio(dominio)];
  if (!motivo) return null;
  return `A varredura desta loja só é aceita pelo localhost (PC do dono). ${motivo}`;
}
