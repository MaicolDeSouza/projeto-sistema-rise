import { createHash } from "node:crypto";

/**
 * A impressao do que vai (ou foi) ao anuncio do ML: o md5 da descricao (o texto pode ter milhares de caracteres e mora
 * no JSON de todo anuncio publicado) e as fotos e o pacote como vieram. So servidor: `node:crypto`. A regra que
 * compara as impressoes e `mudancasDoAnuncio`, em `acompanhar.js`.
 */
export function impressaoDoConteudo(conteudo) {
  const descricao = typeof conteudo?.descricao === "string" ? createHash("md5").update(conteudo.descricao).digest("hex") : null;
  return { descricao, fotos: conteudo?.fotos ?? null, pacote: conteudo?.pacote ?? null };
}
