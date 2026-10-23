import { createHash } from "node:crypto";

import { propostaNoFormulario } from "./aplicar.js";

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

/**
 * As secoes da proposta que o Conferido ainda pergunta (decisao B do dono em 22/10/2026, com a proposta direto no
 * formulario): so as que PREENCHERIAM algum campo ainda vazio no produto SALVO, ou a descricao diferente da salva
 * (`propostaNoFormulario`, a mesma regra da tela). O que so foi para a lista do icone (o campo ja tinha valor) vale como
 * decidido. O titulo nunca fica pendente (a proposta nunca o troca). Fotos continuam como antes: pendentes ate o dono
 * aplica-las e salvar (assinatura).
 */
export function secoesNaoAplicadas(proposta, produto) {
  const secoes = proposta?.secoes ?? {};
  const aplicadas = proposta?.aplicadas ?? {};
  const camposDoProduto = Object.fromEntries(Object.entries(produto ?? {}).map(([campo, valor]) => [campo, normal(valor) ?? ""]));
  const pendentes = propostaNoFormulario(secoes, camposDoProduto, aplicadas).secoes;
  if (secoes.fotos && aplicadas.fotos !== assinaturaDaSecao("fotos", produto)) pendentes.push("fotos");
  return pendentes;
}
