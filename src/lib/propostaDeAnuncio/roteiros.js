/**
 * Os ROTEIROS da proposta de anuncio (spec 2026-10-23, secao 6.2), um por canal, no molde do roteiro unico da proposta de
 * produto (`src/lib/proposta/roteiro.js`): a ferramenta `roteiroDaProposta` (com `canal`) os entrega a qualquer LLM.
 * Mudar uma regra e editar o texto e subir a VERSAO (cada proposta grava a versao que seguiu). O que e conta ou checagem
 * (pais das categorias, tamanho da description, preco do ML) o Rise faz sozinho ao gravar; aqui fica o julgamento.
 *
 * Texto para a LLM, com acento. Sem crase dentro do texto (ele mora numa string de crase).
 */

export const VERSAO_ROTEIRO_LI = "1";

export const ROTEIRO_LI = `ROTEIRO DA PROPOSTA DE ANÚNCIO DA LOJA INTEGRADA (Rise / 4hobby), versão ${VERSAO_ROTEIRO_LI}

O QUE É
Você monta a PROPOSTA do anúncio do produto na Loja Integrada (a loja 4hobby.com.br). Você NÃO envia nada à loja: a
proposta fica no rascunho do anúncio no Rise, e o dono revisa no editor da Loja Integrada e sincroniza.
A proposta usa só você (sem custo de IA para o Rise).

CAMINHO (nesta ordem)
1. situacaoDoProduto(sku). Diga à pessoa, no chat, o proximoPasso e o motivo, ANTES de fazer qualquer coisa.
   Só siga se o proximoPasso for "proposta-li" (ou se o dono pedir a proposta da LI mesmo assim).
   "sincronizar-bling", "proposta-do-produto" ou "conferir-no-rise": pare e diga o que o dono precisa fazer antes.
2. lerParaPropostaLI(sku): o produto (nome, marca, modelo, descrição), a árvore de categorias da loja (id: caminho),
   as marcas da loja, o SEO dos concorrentes e o rascunho atual, se houver.
3. Monte a proposta:
   - CATEGORIAS: de 1 a 3 ids da árvore, as MAIS ESPECÍFICAS (o fim do caminho). Os pais o Rise marca sozinho.
     Mais de uma só quando o produto é de assuntos diferentes de verdade.
   - MARCA: a do cadastro do produto, escrita como está na lista de marcas da loja quando existir lá.
     Sem marca no cadastro, não invente: deixe vazio.
   - META TAG DESCRIPTION: de 130 a 160 caracteres, uma ou duas frases, com as palavras do nome do produto e o que ele
     faz, em português, sem preço, sem estoque, sem promessa de prazo, sem inventar especificação. Use o SEO dos
     concorrentes só como referência de palavras, nunca copie.
   - O Tag Title NÃO entra: é o nome do produto.
4. gravarPropostaLI(sku, categorias, marca, seoDescription, relatorio). O relatório em tópicos curtos: por que cada
   categoria, de onde veio a marca e as palavras da description. Se voltar erro, corrija e grave de novo.
5. Mostre à pessoa o resumo: o que entrou no rascunho, o que virou sugestão (campo que já tinha outro valor) e os
   avisos. Diga que o dono revisa e sincroniza no editor da Loja Integrada (o "P" no ícone some no Sincronizar).
   Depois disso, o próximo passo é a proposta do Mercado Livre.`;

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
   Siga se o proximoPasso for "proposta-ml", ou se o dono pedir para pular a Loja Integrada.
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
