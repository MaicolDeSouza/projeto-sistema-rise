/**
 * Ritmo PROPRIO por site, por cima do Crawl-delay do robots.txt.
 *
 * Modulo de DADOS, como fornecedores.js. A regra do Rise e respeitar o Crawl-delay (buscar.js, `janelaDe`); a entrada
 * aqui e uma EXCECAO decidida pelo dono, site a site, e nunca fica abaixo do nosso proprio ritmo (JANELA_MS, 2 s).
 *
 * Waveshare (08/11/2026): o robots.txt pede `Crawl-delay: 60` (uma visita por minuto). Com isso o Testar fonte (ate 25
 * paginas) passa de 20 min e a varredura do catalogo levaria dias; o dono: "sobre a waveshare vamos tentar a opcao 2"
 * (ritmo proprio, ignorando o pedido do site, com risco de bloqueio). Ficou 5 s: 12 visitas por minuto, o dobro do
 * Eletrogate (10 s), e nao os 2 s das lojas que nao pedem nada.
 */
export const RITMO_PROPRIO = [
  { dominios: ["waveshare.com"], janelaMs: 5000, motivo: "decisão do dono em 08/11/2026: o site pede 60 s por visita" },
];

/** A regra do site, ou null quando ele segue o robots.txt. */
export function ritmoProprioDe(hostname) {
  const host = String(hostname ?? "").toLowerCase();
  return RITMO_PROPRIO.find((regra) => regra.dominios.some((dominio) => host === dominio || host.endsWith(`.${dominio}`))) ?? null;
}
