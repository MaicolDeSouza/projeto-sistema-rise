import { digitosDoTelefone, telefoneValido } from "@/lib/telefone";
import { normalizar } from "@/lib/texto";

/**
 * O filtro do texto da IA ANTES de ele chegar ao visitante (spec de 19/11/2026, §7). Puro: texto entra, veredito sai.
 *
 * A IA do chat so pode AFIRMAR o que veio de uma ferramenta nesta resposta. Aqui se confere o que da para conferir por
 * maquina: todo "R$" tem de ser um preco que uma ferramenta devolveu; todo endereco tem de ser da loja; nenhum telefone
 * que nao seja o da loja; nenhum termo interno (custo, margem, fornecedor, concorrente). Reprovou, o cerebro troca o
 * texto por uma frase segura e oferece o WhatsApp: resposta errada a um cliente e pior que resposta nenhuma.
 */

const PRECO = /R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g;
const ENDERECO = /\b(?:https?:\/\/|www\.)[^\s)>\]"']+/gi;
// DDD + numero, com a pontuacao usual. As bordas de palavra tiram do caminho EAN, CPF, CNPJ e codigo de produto.
const TELEFONE = /(?:\+?55[\s.-]?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g;
const TERMO_INTERNO = /\b(?:custo|margem|fornecedor|concorrente)(?:s|es)?\b/;
// "custo-beneficio" e fala de vendedor, nao o custo da loja.
const CUSTO_BENEFICIO = /\bcusto[\s-]+beneficio\b/g;

const emCentavos = (valor) => Math.round(Number(valor) * 100);
const comoEndereco = (url) => String(url).replace(/[.,;:!?]+$/, "").replace(/\/+$/, "").toLowerCase();

/**
 * @param {string} texto
 * @param {{ precos?: number[], links?: string[], telefonesDaLoja?: string[] }} permitido
 *   `precos`: os preços (e subtotais e totais) que as ferramentas devolveram nesta resposta; `links`: os endereços da loja
 *   que podem aparecer; `telefonesDaLoja`: só dígitos, com DDD.
 * @returns {{ ok: true, texto: string } | { ok: false, motivo: "preco" | "link" | "telefone" | "termo_interno" }}
 */
export function filtrarSaida(texto, { precos = [], links = [], telefonesDaLoja = [] } = {}) {
  const original = String(texto ?? "");

  const precosPermitidos = new Set(precos.filter((preco) => Number.isFinite(Number(preco))).map(emCentavos));
  for (const achado of original.matchAll(PRECO)) {
    const inteiro = Number(achado[1].replace(/\./g, ""));
    const centavos = achado[2] ? Number(achado[2].padEnd(2, "0")) : 0;
    if (!precosPermitidos.has(inteiro * 100 + centavos)) return { ok: false, motivo: "preco" };
  }

  const linksPermitidos = new Set(links.filter(Boolean).map(comoEndereco));
  for (const achado of original.matchAll(ENDERECO)) {
    if (!linksPermitidos.has(comoEndereco(achado[0]))) return { ok: false, motivo: "link" };
  }

  const daLoja = new Set(telefonesDaLoja.map(digitosDoTelefone).filter(Boolean));
  // Os enderecos saem antes: um numero dentro de um link da loja nao e telefone.
  for (const achado of original.replace(ENDERECO, " ").matchAll(TELEFONE)) {
    if (telefoneValido(achado[0]) && !daLoja.has(digitosDoTelefone(achado[0]))) return { ok: false, motivo: "telefone" };
  }

  if (TERMO_INTERNO.test(normalizar(original).replace(CUSTO_BENEFICIO, " "))) return { ok: false, motivo: "termo_interno" };

  return { ok: true, texto: original };
}
