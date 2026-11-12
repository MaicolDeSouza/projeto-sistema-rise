import { LIMITES } from "./regras.js";

/**
 * O roteiro do estudo de viabilidade (spec 2026-11-12-estudo-de-viabilidade-design.md), fase 1: so o Mercado Livre. O
 * mesmo para qualquer assistente conectado ao Rise. Mudou o roteiro, suba a versao: cada estudo guarda a dele.
 */
export const VERSAO_ROTEIRO_ESTUDO = "1";

export const ROTEIRO_ESTUDO = [
  "OBJETIVO: dizer se vale a pena a 4hobby trabalhar com o produto e quanto comprar de início, olhando o Mercado Livre. O estudo nunca altera produto, custo, vínculo ou pedido.",
  "1. listarEstudosDeViabilidade (a fila) e, para cada estudo, lerParaEstudoDeViabilidade: o produto do Scraper (nome, código, marca, modelo, ficha, preço) e os estudos anteriores dele.",
  "2. Monte de 1 a 3 termos de busca: o nome limpo (sem cor de loja, sem 'kit', sem o código interno da loja) e, se houver, o modelo ou o código do fabricante (ex.: 'HC-SR04', 'modulo rele 5v 1 canal').",
  "3. No Claude no Chrome, abra https://lista.mercadolivre.com.br/<termo com hífens no lugar dos espaços> e leia os 20 primeiros resultados: título, preço (o NORMAL, o que está em destaque; nunca o 'no Pix' quando há os dois), se é patrocinado, se tem FULL, frete grátis e o link. Se aparecer login, CAPTCHA ou bloqueio: PARE e peça à pessoa para resolver; nunca tente contornar.",
  "4. Para cada resultado decida mesmoProduto (true/false): mesmo componente, mesma especificação que importa (tensão, corrente, canais, tamanho). Kit ou pacote do MESMO produto conta, com 'unidades' = quantas peças o anúncio vende (pacote com 10 = 10). Acessório, versão diferente ou kit com outras peças = false, com o 'motivo' curto.",
  "5. Abra até 10 dos que são o mesmo produto (prefira os de mais vendas e os de catálogo) e anote: vendidos como a página escreve ('+500 vendidos'), o vendedor, a reputação (cor/medalha) e se é anúncio de catálogo. Anote também a categoria do anúncio (o código MLB… da categoria, na trilha do topo ou no link 'Ver mais da categoria') e, se a página disser, peso e medidas do pacote.",
  "6. Com buscarNoMercado (tipo 'fornecedor'), ache o mesmo produto nos fornecedores coletados e anote o produtoColetadoId de cada um (o próprio produto do estudo, quando é de fornecedor, entra). Com buscarProdutos, escolha de 2 a 5 produtos da 4hobby PARECIDOS (mesma família e faixa de preço, já vendidos no ML) e anote o SKU.",
  "7. calcularEstudoDeViabilidade com: termos, anuncios (todos os lidos, com mesmoProduto e motivo), fornecedores (os produtoColetadoId), parecidos (os SKUs), categoriaId e medidas quando achou. O Rise faz as contas (preço de referência = mediana por unidade, taxas e frete reais do ML no Clássico, lucro, markup, preço mínimo para 30%, demanda, quantidade) e devolve o veredito pelas regras com os motivos.",
  `8. Critérios (já aplicados pelo Rise): VALE = markup ≥ ${LIMITES.markupBom}% e lucro ≥ R$ ${LIMITES.lucroMinimo} pela referência, demanda Média ou Forte e fornecedor com estoque; VALE_COM_RESSALVA = markup de ${LIMITES.markupMinimo} a ${LIMITES.markupBom}%, demanda Fraca, um fornecedor só, sem estoque de pronta entrega, frete estimado ou o menor preço do mercado abaixo do nosso mínimo; NAO_VALE = markup < ${LIMITES.markupMinimo}%, lucro < R$ ${LIMITES.lucroMinimo} ou nenhum fornecedor. Demanda pela soma dos vendidos (o piso da faixa): Forte ≥ ${LIMITES.demandaForte}, Média ≥ ${LIMITES.demandaMedia}, Fraca abaixo.`,
  "9. gravarEstudoDeViabilidade com a conclusao: até 6 linhas, em português simples, dizendo por que vale ou não, o risco principal e o que conferir antes de comprar (ex.: 'confirmar com a Fortek o prazo da reserva'). Use o veredito das regras; só grave outro se tiver um motivo forte que as contas não veem (ex.: o produto é sazonal, o anúncio líder é do fabricante), dizendo o motivo em motivoDaDiferenca.",
  "10. Mostre à pessoa o resumo de cada estudo (veredito, preço de referência, custo, lucro, quantidade) e diga que o relatório está em Compras › Estudos de viabilidade.",
  "REGRAS: nunca invente preço, vendidos ou fornecedor; o que não leu fica sem valor. Preço sempre o NORMAL. Um estudo por vez, do mais antigo da fila para o mais novo.",
].join("\n");

export const ESQUEMA_ESTUDO = {
  anuncio: "{ titulo, url, preco (número, o normal), unidades (padrão 1), mesmoProduto (true/false), motivo (quando false), vendidos (texto como a página escreve ou número), vendedor, reputacao, full, freteGratis, patrocinado, catalogo }",
  medidas: "{ alturaCm, larguraCm, comprimentoCm, pesoKg } do pacote, só quando a página disser",
};
