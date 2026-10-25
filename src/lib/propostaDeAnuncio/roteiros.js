/**
 * O ROTEIRO da proposta de anuncio do Mercado Livre (spec 2026-10-23, secao 6.2), no molde do roteiro unico da proposta de
 * produto (`src/lib/proposta/roteiro.js`): a ferramenta `roteiroDaProposta` (com `canal: "ml"`) o entrega a qualquer LLM.
 * Mudar uma regra e editar o texto e subir a VERSAO (cada proposta grava a versao que seguiu). O que e conta ou checagem
 * (preco do ML) o Rise faz sozinho ao gravar; aqui fica o julgamento.
 *
 * A proposta de anuncio da Loja Integrada NAO existe mais (25/10/2026): categorias e SEO da loja sao do produto e vem na
 * proposta de produto.
 *
 * Texto para a LLM, com acento. Sem crase dentro do texto (ele mora numa string de crase).
 */

// "2" em 24/10/2026: o preco passa a ser por markup, nao por margem; "3" no mesmo dia: o markup e sobre o CUSTO TOTAL
// (fornecedor + taxas do ML + frete + imposto), pedido do dono. "4" em 24/10/2026: o titulo e o do produto base (a LLM
// nao o escolhe), e so o produto com composicao (kit) aceita outro titulo, pedido do dono.
export const VERSAO_ROTEIRO_ML = "4";

export const ROTEIRO_ML = `ROTEIRO DA PROPOSTA DE ANÚNCIO DO MERCADO LIVRE (Rise / 4hobby), versão ${VERSAO_ROTEIRO_ML}

O QUE É
Você monta a PROPOSTA do anúncio do produto no Mercado Livre: sempre UM anúncio, Clássico. Você NÃO publica nada: a
proposta fica no rascunho do anúncio no Rise, e o dono revisa no editor do Mercado Livre e publica.
A proposta usa só você (sem custo de IA para o Rise). O PREÇO é calculado pelo Rise, nunca por você.

CAMINHO (nesta ordem)
1. situacaoDoProduto(sku). Diga à pessoa, no chat, o proximoPasso e o motivo, ANTES de fazer qualquer coisa.
   Siga se o proximoPasso for "proposta-ml", ou se o dono pedir para pular o cadastro na Loja Integrada.
   "cadastrar-li": o dono cadastra o produto na Loja Integrada pelo ícone da LI (cria pausado, liga no Bling, grava o
   estoque e ativa); diga isso e siga para o ML só se ele pedir.
   "sincronizar-bling", "proposta-do-produto" ou "conferir-no-rise": pare e diga o que o dono precisa fazer antes.
2. lerParaPropostaML(sku): o produto (com o custo), as categorias candidatas, os atributos da categoria mais provável,
   os catálogos candidatos (cada um com o total de anúncios e o 1º colocado), os catálogos dos anúncios do dono e as
   referências que o produto já tem.
3. Monte a proposta:
   - CATEGORIA: uma categoria FOLHA. Se escolher outra que não a provável, chame lerCategoriaML(categoriaId) para ver
     a ficha dela.
   - TÍTULO: NÃO escolha. O título do anúncio é o nome do produto base (produto.nome da leitura), e o Rise o põe sozinho;
     não mande "titulo" (se mandar, é ignorado e avisado). A ÚNICA exceção é o produto com composição (kit:
     produto.composicao true na leitura): aí você propõe o título, dentro do limite da categoria, com o tipo da peça, o
     modelo ou o chip, a especificação principal e a compatibilidade, sem preço, sem "promoção", sem emoji.
   - FICHA: só o que o cadastro do produto ou as referências PROVAM. Nunca invente. Os valores de lista escritos como
     estão na lista da categoria. Não mande GTIN nem o motivo de não ter (são do dono).
   - CATÁLOGOS: até 10 do MESMO produto (não de um parecido), cada um com 5 ou mais anúncios. Use os candidatos da
     leitura; o Rise descarta os de menos de 5. Menos de 5 catálogos, tudo bem.
   - SEM NENHUM CATÁLOGO do mesmo produto: pesquise no navegador e ache 5 anúncios do MESMO produto no Mercado Livre;
     mande url, título e preço de cada um em linksSemCatalogo. Esses links não são salvos no Rise: só entram na conta
     do preço e no relatório.
4. gravarPropostaML(sku, categoriaId, atributos, catalogos, linksSemCatalogo, relatorio), com titulo só no kit. O
   relatório em tópicos curtos: por que a categoria, de onde veio cada valor da ficha, por que cada catálogo é o mesmo
   produto. Se voltar erro, corrija e grave de novo.
5. Mostre à pessoa o que o Rise devolveu: o título usado, o preço, o markup (lucro sobre o total dos custos: fornecedor, comissão e
   frete do ML e imposto; o mínimo é 40%), a posição no ranking, os catálogos aceitos e os avisos.
   Diga que o dono revisa no editor do Mercado Livre, adiciona os catálogos ao ranking se quiser, e publica (o "P" no
   ícone some no Publicar).`;
