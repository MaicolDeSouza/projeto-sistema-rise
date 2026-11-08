/**
 * As etapas do "Enviar ao ML" (o anuncio publicado acompanhando o produto) no popup de andamento (pedido do dono em
 * 26/10/2026: "igual foi implementado na LI, com checks conforme for fazendo"). Sem imports: o navegador, o servidor e o teste
 * leem a mesma lista. As partes (descricao, fotos, pacote, preco, ficha) sao as de `atualizar.js`, na ordem em que ele as manda;
 * a que nao mudou fica marcada "sem mudança". A ultima ("conferir") e a releitura da tela.
 */
export const ETAPAS_DO_ENVIO_ML = [
  { id: "permissao", rotulo: "Conferir permissão de envio" },
  { id: "ler", rotulo: "Ler o anúncio no Mercado Livre" },
  // O titulo (08/11/2026) so existe no anuncio reaproveitado da conta; com vendas o ML nao o muda, e a etapa so registra.
  { id: "titulo", rotulo: "Enviar o título" },
  { id: "descricao", rotulo: "Enviar a descrição" },
  { id: "fotos", rotulo: "Enviar as fotos" },
  { id: "pacote", rotulo: "Enviar peso e medidas" },
  // O preco da loja (08/11/2026) nao vai ao ML: a etapa so registra a base nova, para o "!" apagar.
  { id: "precoDaLoja", rotulo: "Registrar o preço da loja" },
  { id: "preco", rotulo: "Enviar o preço" },
  { id: "ficha", rotulo: "Enviar a ficha técnica" },
  { id: "prazo", rotulo: "Enviar o prazo de disponibilidade" },
  // O vinculo do Bling do anuncio reaproveitado (08/11/2026): sai da loja ML_4h e entra na Rise_ML, com o OK do dono.
  { id: "bling", rotulo: "Mover o vínculo no Bling" },
  { id: "conferir", rotulo: "Conferir o resultado no ML" },
];

/** As partes que o envio manda, na ordem das etapas (`bling` nao e parte: e a etapa final do reaproveitado). */
export const PARTES_DO_ENVIO_ML = ["titulo", "descricao", "fotos", "pacote", "precoDaLoja", "preco", "ficha", "prazo"];

/**
 * As etapas que o popup mostra para um anuncio: `titulo` so quando a impressao tem o titulo (anuncio reaproveitado) e `bling`
 * so com o vinculo ainda por mover. Nos demais anuncios as duas nao aparecem (regra 4 do padrao visual: so o que tem dado).
 */
export function etapasDoEnvioML({ comTitulo = false, comBling = false } = {}) {
  return ETAPAS_DO_ENVIO_ML.filter((etapa) => (etapa.id !== "titulo" || comTitulo) && (etapa.id !== "bling" || comBling));
}
