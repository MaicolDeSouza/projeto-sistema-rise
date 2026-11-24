import { mascararDadosPessoais } from "@/lib/riseAi/mascarar";

/**
 * O filtro da resposta do Atendimento do ML, antes de qualquer envio (spec 2026-11-24-atendimento-ml-design.md, "O filtro
 * antes de enviar"). Vale para o texto da IA e para o texto digitado, na tela, no Telegram e no MCP, e roda de novo no
 * servidor na hora do envio.
 *
 * - Link: no texto da IA so passam os enderecos que vieram da troca de etiqueta (`linksDaTroca`); no texto do dono,
 *   qualquer `https://` em mercadolivre.com.br e subdominios. O resto barra (o ML pune link de fora).
 * - Telefone, e-mail e CPF/CNPJ barram (a mesma conferencia de `mascararDadosPessoais`: so numero que e mesmo dado pessoal).
 * - Nada e "consertado": o que barra volta em `barrados`, com o trecho, para o dono corrigir.
 *
 * Sem banco e sem rede.
 */

const COM_PROTOCOLO = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"']+/gi;
const COM_WWW = /(?<![\w@./-])www\.[^\s<>"']+/gi;
// Dominio solto ("4hobby.com.br", "bit.ly/abc"): so com terminacao de site, para "v2.0" e "12.5V" nao virarem link.
const DOMINIO_SOLTO =
  /(?<![\w@./-])[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|br|io|ly|me|app|shop|store|link|site|online|info|gg|tv|co|gl|to|page|dev)(?:\.[a-z]{2})?(?![\w-])(?:\/[^\s<>"']*)?/gi;

const PADRAO_DO_TIPO = {
  email: /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/,
  telefone: /(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/,
  documento: /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}/,
};

const semPontuacaoNoFim = (trecho) => trecho.replace(/[.,;:!?)\]]+$/, "");

/** `https://` em mercadolivre.com.br ou num subdominio dele. */
export function linkDoMercadoLivre(url) {
  let alvo;
  try {
    alvo = new URL(String(url ?? ""));
  } catch {
    return false;
  }
  if (alvo.protocol !== "https:" || alvo.username || alvo.password) return false;
  const host = alvo.hostname.toLowerCase();
  return host === "mercadolivre.com.br" || host.endsWith(".mercadolivre.com.br");
}

/** Os enderecos do texto, na ordem em que aparecem, sem repetir o mesmo trecho achado por dois padroes. */
function enderecosDo(texto) {
  const achados = [];
  for (const padrao of [COM_PROTOCOLO, COM_WWW, DOMINIO_SOLTO]) {
    for (const casou of texto.matchAll(padrao)) {
      const trecho = semPontuacaoNoFim(casou[0]);
      const inicio = casou.index;
      const fim = inicio + trecho.length;
      if (!trecho || achados.some((a) => inicio < a.fim && fim > a.inicio)) continue;
      achados.push({ trecho, inicio, fim });
    }
  }
  return achados.sort((a, b) => a.inicio - b.inicio);
}

/**
 * @param {{ texto: string, origem: "IA" | "DONO", linksDaTroca?: string[], limite: number }} entrada
 * @returns {{ ok: boolean, barrados: { trecho: string, motivo: "vazio"|"tamanho"|"email"|"telefone"|"documento"|"link" }[] }}
 */
export function filtrarResposta({ texto, origem, linksDaTroca = [], limite }) {
  const conteudo = String(texto ?? "");
  const barrados = [];
  if (!conteudo.trim()) return { ok: false, barrados: [{ trecho: "", motivo: "vazio" }] };
  if (Number.isFinite(limite) && conteudo.length > limite) barrados.push({ trecho: `${conteudo.length} de ${limite} caracteres`, motivo: "tamanho" });

  // Os enderecos saem do texto antes da conferencia de dado pessoal: o numero de um anuncio nao e telefone.
  const enderecos = enderecosDo(conteudo);
  let semEnderecos = conteudo;
  for (const endereco of [...enderecos].reverse()) semEnderecos = semEnderecos.slice(0, endereco.inicio) + " ".repeat(endereco.trecho.length) + semEnderecos.slice(endereco.fim);

  for (const tipo of new Set(mascararDadosPessoais(semEnderecos).mascarados)) {
    barrados.push({ trecho: PADRAO_DO_TIPO[tipo]?.exec(semEnderecos)?.[0] ?? "", motivo: tipo });
  }

  const daTroca = new Set(linksDaTroca ?? []);
  for (const { trecho } of enderecos) {
    const permitido = origem === "DONO" ? linkDoMercadoLivre(trecho) : daTroca.has(trecho);
    if (!permitido) barrados.push({ trecho, motivo: "link" });
  }
  return { ok: barrados.length === 0, barrados };
}

const TEXTO_DO_MOTIVO = {
  vazio: "a resposta está vazia",
  tamanho: "passou do limite",
  email: "e-mail não é permitido",
  telefone: "telefone não é permitido",
  documento: "CPF ou CNPJ não é permitido",
  link: "só link do Mercado Livre é permitido",
};

/** "Trecho não permitido: bit.ly/abc (só link do Mercado Livre é permitido)." Uma linha, para a tela e para o bot. */
export function textoDoBarrado({ trecho, motivo }) {
  const razao = TEXTO_DO_MOTIVO[motivo] ?? "não permitido";
  if (motivo === "vazio") return "A resposta está vazia.";
  if (motivo === "tamanho") return `A resposta passou do limite: ${trecho}.`;
  return `Trecho não permitido: ${String(trecho).slice(0, 80)} (${razao}).`;
}
