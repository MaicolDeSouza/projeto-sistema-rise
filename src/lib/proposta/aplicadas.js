import { createHash } from "node:crypto";

import { temOQueAplicar } from "./aplicar.js";

/**
 * "Esta secao da proposta ja foi aplicada?" (spec 2026-10-16, Aprovacao e limpeza). Quando o dono aplica uma secao e
 * salva, o servidor guarda em `PropostaDeProduto.aplicadas[secao]` a assinatura dos campos do produto que a secao
 * alimenta. Secao sem assinatura, ou com o produto diferente dela (mudou depois), e PENDENTE, e o Conferido avisa.
 * Documentos e relatorio nunca ficam pendentes: anexar e do dono, e o relatorio so se le.
 */

const CAMPOS_POR_SECAO = {
  descricao: ["descricaoBase"],
  titulos: ["tituloBase"],
  campos: ["sku", "marca", "modelo", "unidade", "garantiaMeses", "ncm", "origem", "pesoKg", "alturaCm", "larguraCm", "comprimentoCm"],
  preco: ["precoVenda"],
  ean: ["ean"],
  fotos: ["fotos"],
};

export const SECOES_SEM_PENDENCIA = ["documentos", "relatorio"];

/** O valor como o banco o devolve vira sempre o mesmo texto: Decimal e numero iguais, quebra de linha \r\n = \n. */
function normal(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (Array.isArray(valor)) return valor.map(normal);
  if (typeof valor === "string") return valor.replace(/\r\n/g, "\n").trim();
  if (typeof valor === "number" || typeof valor === "bigint") return String(Number(valor));
  if (typeof valor === "object" && typeof valor.toString === "function") return String(Number(valor.toString()));
  return String(valor);
}

/**
 * @param {string} secao
 * @param {Record<string, unknown> & { fotos?: string[] }} produto o produto gravado; `fotos` = nomes das fotos FOTO na ordem
 */
export function assinaturaDaSecao(secao, produto) {
  const campos = CAMPOS_POR_SECAO[secao];
  if (!campos) return null;
  const retrato = Object.fromEntries(campos.map((campo) => [campo, normal(produto?.[campo])]));
  return createHash("sha1").update(JSON.stringify(retrato)).digest("hex");
}

/** As secoes da proposta que ainda nao foram aplicadas ao produto (ou que o produto deixou de ter). */
export function secoesNaoAplicadas(proposta, produto) {
  const secoes = Object.keys(proposta?.secoes ?? {});
  const aplicadas = proposta?.aplicadas ?? {};
  // Fotos tem o "Aplicar" proprio (aba Imagens) e entra como pendente; as outras, so se tem o que aplicar.
  return secoes.filter(
    (secao) =>
      !SECOES_SEM_PENDENCIA.includes(secao) &&
      (secao === "fotos" || temOQueAplicar(secao, proposta.secoes[secao])) &&
      aplicadas[secao] !== assinaturaDaSecao(secao, produto),
  );
}
