/**
 * As etapas do "Enviar ao ML" (o anuncio publicado acompanhando o produto) no popup de andamento (pedido do dono em
 * 26/10/2026: "igual foi implementado na LI, com checks conforme for fazendo"). Sem imports: o navegador, o servidor e o teste
 * leem a mesma lista. As partes (descricao, fotos, pacote, preco, ficha) sao as de `atualizar.js`, na ordem em que ele as manda;
 * a que nao mudou fica marcada "sem mudança". A ultima ("conferir") e a releitura da tela.
 */
export const ETAPAS_DO_ENVIO_ML = [
  { id: "permissao", rotulo: "Conferir permissão de envio" },
  { id: "ler", rotulo: "Ler o anúncio no Mercado Livre" },
  { id: "descricao", rotulo: "Enviar a descrição" },
  { id: "fotos", rotulo: "Enviar as fotos" },
  { id: "pacote", rotulo: "Enviar peso e medidas" },
  { id: "preco", rotulo: "Enviar o preço" },
  { id: "ficha", rotulo: "Enviar a ficha técnica" },
  { id: "conferir", rotulo: "Conferir o resultado no ML" },
];

/** As partes que o envio manda, na ordem das etapas. */
export const PARTES_DO_ENVIO_ML = ["descricao", "fotos", "pacote", "preco", "ficha"];
