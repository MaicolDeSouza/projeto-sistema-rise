import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * A pagina da analise de lista de fornecedor (07/11/2026): o modelo padrao (modelo.html) com os DADOS e as FOTOS no
 * lugar dos marcadores. Regras puras (sem banco, sem rede); quem le o modelo do disco e `lerModeloDaAnalise`. O formato
 * dos dados esta em roteiro.js (ESQUEMA_ANALISE); `problemasDosDados` recusa o que a pagina nao saberia desenhar.
 */

export const VERSAO_DOS_DADOS = 1;
const TITULO_DO_MODELO = "<title>Fornecedor × concorrentes</title>";
const ESTOQUES = new Set(["disp", "sem", null]);

const numeroPositivo = (valor) => typeof valor === "number" && Number.isFinite(valor) && valor > 0;
const textoOuNulo = (valor) => valor === null || valor === undefined || typeof valor === "string";

/** Os problemas dos dados, em texto (vazio = pode montar). */
export function problemasDosDados(dados) {
  const problemas = [];
  if (!dados || typeof dados !== "object") return ["os dados não são um objeto"];
  if (typeof dados.fornecedor !== "string" || !dados.fornecedor.trim()) problemas.push("falta o fornecedor (nome como está no Rise)");
  if (dados.moeda !== "USD" && dados.moeda !== "BRL") problemas.push('moeda tem de ser "USD" ou "BRL"');
  if (dados.moeda === "USD" && !numeroPositivo(dados.cambio)) problemas.push("lista em US$ sem câmbio");
  if (dados.fator !== undefined && dados.fator !== null && !numeroPositivo(dados.fator)) problemas.push("fator tem de ser um número maior que zero");
  if (!textoOuNulo(dados.pedido)) problemas.push("pedido tem de ser o código (PC-0000) ou null");
  if (!Array.isArray(dados.itens) || dados.itens.length === 0) return [...problemas, "sem itens"];
  const vistos = new Set();
  for (const [indice, item] of dados.itens.entries()) {
    const quem = `item ${item?.n ?? `#${indice + 1}`}`;
    if (!Number.isInteger(item?.n)) { problemas.push(`${quem}: n tem de ser inteiro`); continue; }
    if (vistos.has(item.n)) problemas.push(`${quem}: n repetido`);
    vistos.add(item.n);
    if (typeof item.nome !== "string" || !item.nome.trim()) problemas.push(`${quem}: sem nome`);
    if (!numeroPositivo(item.preco)) problemas.push(`${quem}: preço da lista tem de ser maior que zero`);
    if (item.rise !== null && item.rise !== undefined && (typeof item.rise !== "object" || typeof item.rise.sku !== "string" || !item.rise.sku.trim())) {
      problemas.push(`${quem}: rise sem sku (use null quando não há produto)`);
    }
    if (!Array.isArray(item.ofertas)) problemas.push(`${quem}: ofertas tem de ser lista (vazia quando não há)`);
    else for (const oferta of item.ofertas) {
      if (!Array.isArray(oferta) || typeof oferta[0] !== "string" || !numeroPositivo(oferta[2]) || !ESTOQUES.has(oferta[4] ?? null)) {
        problemas.push(`${quem}: oferta fora do formato [loja, nome, preço, endereço, "disp"|"sem"|null]`);
        break;
      }
    }
    if (!Array.isArray(item.forn)) problemas.push(`${quem}: forn tem de ser lista (vazia quando não há)`);
    else for (const linha of item.forn) {
      if (!Array.isArray(linha) || typeof linha[0] !== "string" || !numeroPositivo(linha[3])) {
        problemas.push(`${quem}: fornecedor fora do formato [fornecedor, nome, código, preço, quantidade, endereço]`);
        break;
      }
    }
  }
  return problemas;
}

/** JSON que pode ficar dentro de <script>: "</" quebraria a tag. */
const jsonSeguro = (valor) => JSON.stringify(valor).replace(/<\//g, "<\\/");
const semTags = (texto) => String(texto).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);

/**
 * O HTML pronto. Lanca com a lista de problemas quando os dados nao servem. `fotos`: { "n<numero>": "data:..." } ou null.
 * As substituicoes usam funcao: um "$&" num nome de produto nao vira padrao do replace.
 */
export function montarPagina(modelo, dados, fotos = null) {
  const problemas = problemasDosDados(dados);
  if (problemas.length) throw new Error(`Dados da análise com problema: ${problemas.slice(0, 10).join("; ")}${problemas.length > 10 ? ` (e mais ${problemas.length - 10})` : ""}`);
  for (const marcador of ["/*__DADOS__*/null", "/*__FOTOS__*/null", TITULO_DO_MODELO]) {
    if (!modelo.includes(marcador)) throw new Error(`O modelo não tem o marcador ${marcador}.`);
  }
  const titulo = `<title>${semTags(dados.apelido || dados.fornecedor)} × concorrentes</title>`;
  return modelo
    .replace(TITULO_DO_MODELO, () => titulo)
    .replace("/*__DADOS__*/null", () => jsonSeguro({ versao: VERSAO_DOS_DADOS, ...dados }))
    .replace("/*__FOTOS__*/null", () => (fotos ? jsonSeguro(fotos) : "null"));
}

/** O modelo padrao, lido do disco (src/lib/analiseFornecedor/modelo.html, a partir da raiz do projeto). */
export async function lerModeloDaAnalise(raiz = process.cwd()) {
  return readFile(path.join(raiz, "src", "lib", "analiseFornecedor", "modelo.html"), "utf8");
}
