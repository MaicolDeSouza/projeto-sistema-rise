import { createHash } from "node:crypto";

/**
 * A impressao do que vai (ou foi) ao anuncio do ML: o md5 da descricao (o texto pode ter milhares de caracteres e mora
 * no JSON de todo anuncio publicado) e as fotos e o pacote como vieram. So servidor: `node:crypto`. A regra que
 * compara as impressoes e `mudancasDoAnuncio`, em `acompanhar.js`.
 */
export function impressaoDoConteudo(conteudo) {
  const descricao = typeof conteudo?.descricao === "string" ? createHash("md5").update(conteudo.descricao).digest("hex") : null;
  return {
    descricao,
    fotos: conteudo?.fotos ?? null,
    pacote: conteudo?.pacote ?? null,
    preco: conteudo?.preco ?? null,
    ficha: conteudo?.ficha ?? null,
    prazo: conteudo?.prazo ?? null,
    // A base do preco do ML (08/11/2026): o preco de venda da loja quando o anuncio foi publicado ou registrado pela ultima vez.
    precoDaLoja: conteudo?.precoDaLoja ?? null,
    // So o anuncio reaproveitado da conta grava o titulo (08/11/2026); sem titulo no conteudo a chave nem existe na impressao,
    // senao toda impressao antiga (sem a chave) acenderia o titulo de um anuncio publicado pelo Rise.
    ...(typeof conteudo?.titulo === "string" ? { titulo: conteudo.titulo } : {}),
    // Idem o atacado (08/11/2026): a chave so existe quando o conteudo a traz; o publicado antes dela nao acende sozinho.
    ...(conteudo?.atacado && typeof conteudo.atacado === "object" ? { atacado: conteudo.atacado } : {}),
  };
}
