/**
 * A variante que falta de um produto no ML (definicoes do dono em 08/11/2026, spec
 * docs/superpowers/specs/2026-11-08-anuncios-ml-por-lucro-da-loja-design.md): um clone do anuncio que ja existe, com o tipo e o
 * frete da variante pedida e o preco que mantem no ML o lucro da loja. Nada e gravado: o clone abre no editor, e o Salvar e
 * do dono. Servidor (le o banco e o ML); a acao `criarVarianteMLAcao` e so o invólucro com os acessos.
 */

import { clonarRascunhoML } from "./banco";
import { lucroDaLojaDoRascunho, rascunhoDaVariante, VARIANTES } from "./faixas";
import { precoPelaFaixaNoML } from "./leitura";

/**
 * @returns o retorno de `clonarRascunhoML` com o rascunho da variante; `aviso` quando o preco nao pode ser calculado (sem
 * categoria, sem custo, sem preco da loja ou lucro inatingivel): o preco fica o do clone, para o dono decidir no editor.
 */
export async function clonarVarianteML(anuncioId, variante, { ml }) {
  if (!VARIANTES.includes(variante)) return { ok: false, erro: "Variante de anúncio desconhecida." };
  const clone = await clonarRascunhoML(anuncioId);
  if (!clone.ok) return clone;
  const rascunho = rascunhoDaVariante(clone.rascunho, variante);
  const produtos = clone.contexto.produtos ?? {};
  const custoDe = (id) => Number(produtos[id]?.custo?.valor);
  const pecas = rascunho.composicao?.itens;
  const custo = Array.isArray(pecas) && pecas.length
    ? pecas.reduce((soma, item) => (soma === null || !(custoDe(item.produtoId) > 0) ? null : soma + custoDe(item.produtoId) * Number(item.quantidade)), 0)
    : custoDe(rascunho.produtoId) > 0 ? custoDe(rascunho.produtoId) : null;
  const lucro = lucroDaLojaDoRascunho(rascunho, Object.values(produtos));

  let aviso = null;
  let preco = rascunho.preco;
  if (!(custo > 0)) aviso = "Sem custo do produto: o preço ficou o do anúncio de origem.";
  else if (lucro === null) aviso = "Sem preço de venda do produto: o preço ficou o do anúncio de origem.";
  else {
    try {
      const resultado = await precoPelaFaixaNoML(ml, rascunho, { custo, lucro, variante });
      if (resultado) preco = resultado.preco;
      else aviso = "Lucro da loja inatingível com estas taxas: o preço ficou o do anúncio de origem.";
    } catch (erro) {
      // "Sem categoria: escolha a categoria na aba Geral." e as falhas de leitura do ML.
      aviso = `${String(erro?.message ?? erro)} O preço ficou o do anúncio de origem.`;
    }
  }
  return { ...clone, rascunho: { ...rascunho, preco }, aviso };
}
