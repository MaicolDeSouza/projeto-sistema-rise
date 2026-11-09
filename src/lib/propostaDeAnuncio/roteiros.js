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
// nao o escolhe), e so o produto com composicao (kit) aceita outro titulo, pedido do dono. "5" em 25/10/2026: o markup
// minimo do preco e 30% e o desejado 40% (pedido do dono). "6" em 25/10/2026: "nao se aplica" ("-1") nos opcionais que o
// produto nao tem, e o Microcontrolador e o chip ou, sem ele, o Processador/CPU da descricao (pedidos do dono). "7" em
// 25/10/2026: o Publicar exige a ficha inteira preenchida (pedido do dono), e o roteiro diz isso a LLM. "8" em 28/10/2026: o
// kit no ML ("anuncio com 10 pecas do 900211"), montado no editor e ligado ao produto base, nunca um produto novo, com o titulo
// "10x ..." (pedidos do dono). "9" em 05/11/2026: o preco sai do lucro na loja (o mesmo lucro em R$ no ML), sem regra de %,
// e o ranking so da a posicao (pedido do dono). "10" em 08/11/2026: as variantes pelo preco (sem frete abaixo de R$ 72, frete
// gratis de 72 em diante com piso de 79, Premium + frete gratis a partir de 150) e, antes de propor, consultar o que ja existe na
// conta do ML e reaproveitar (pedidos do dono: "como informar ela para consultar no ML primeiro se tem anuncio daquele produto e
// reaproveitar?").
import { REGRAS_DAS_VARIANTES } from "@/lib/canaisDeVenda/ml/faixas";

// "11" em 09/11/2026: anunciosNaConta traz tambem os kits do codigo ({sku}_{N}, campo kit), inclusive na leitura do kit, e o
// reaproveitar aceita o kit (pedido do dono: o 910207 tinha o kit 20x e a proposta nao achou).
export const VERSAO_ROTEIRO_ML = "11";

export const ROTEIRO_ML = `ROTEIRO DA PROPOSTA DE ANÚNCIO DO MERCADO LIVRE (Rise / 4hobby), versão ${VERSAO_ROTEIRO_ML}

O QUE É
Você monta a PROPOSTA dos anúncios do produto no Mercado Livre. Você NÃO publica nada: a proposta fica no rascunho dos
anúncios no Rise, e o dono revisa no editor do Mercado Livre e publica.

QUANTOS ANÚNCIOS E DE QUE TIPO (o Rise decide pelo preço que ele calcula; você só confere e explica ao dono):
${REGRAS_DAS_VARIANTES.map((linha) => `- ${linha}`).join("\n")}
A proposta usa só você (sem custo de IA para o Rise). O PREÇO é calculado pelo Rise, nunca por você.

CAMINHO (nesta ordem)
1. situacaoDoProduto(sku). Diga à pessoa, no chat, o proximoPasso e o motivo, ANTES de fazer qualquer coisa.
   Siga se o proximoPasso for "proposta-ml", ou se o dono pedir para pular o cadastro na Loja Integrada.
   "cadastrar-li": o dono cadastra o produto na Loja Integrada pelo ícone da LI (cria pausado, liga no Bling, grava o
   estoque e ativa); diga isso e siga para o ML só se ele pedir.
   "sincronizar-bling", "proposta-do-produto" ou "conferir-no-rise": pare e diga o que o dono precisa fazer antes.
2. lerParaPropostaML(sku): o produto (com o custo), as categorias candidatas, os atributos da categoria mais provável,
   os catálogos candidatos (cada um com o total de anúncios e o 1º colocado), os catálogos dos anúncios do dono e as
   referências que o produto já tem. No kit no ML, com quantidade (veja KIT NO ML).
   ANTES DE PROPOR, O QUE JÁ EXISTE (obrigatório): a leitura traz anunciosNaConta (anúncios do código na conta do Mercado
   Livre que o Rise ainda não tem, com a variante em texto, preço, vendas e estado) e anunciosNoRise (os que o Rise já tem).
   a) Para cada anúncio de anunciosNaConta, confira se é o MESMO produto (título e preço; o código às vezes se repete em
      outro produto, como um cabo vendido junto). Sendo o mesmo produto e uma das variantes que a faixa pede, chame
      reaproveitarAnuncioML(sku, itemId): ele vira anúncio do Rise, sem escrever nada no ML. Prefira o que tem mais vendas.
   b) Não reaproveite anúncio de outro produto, nem uma segunda cópia da mesma variante: liste esses ao dono no chat.
   c) Diga ao dono, ANTES de gravar a proposta, o que reaproveitou, o que já estava no Rise e quais variantes ainda faltam.
   d) Se todas as variantes que a faixa pede já existem no Rise, NÃO grave proposta: diga isso e pare.
   e) KITS NA CONTA: anunciosNaConta traz também os kits do código ({sku}_{N}, campo "kit" com o N e "(kit de N)" na variante),
      na leitura de 1 unidade e na do kit. Kit não conta como o anúncio de 1 unidade. Pedido de kit de N: se a conta já tem o kit
      da MESMA quantidade, reaproveite-o (reaproveitarAnuncioML vira o Kit de N do produto base) em vez de gravar proposta; kit
      de outra quantidade, liste ao dono e pergunte antes. Na proposta de 1 unidade, diga ao dono os kits que a conta já tem.
KIT NO ML: quando o dono pede o anúncio em kit ("anúncio com 10 peças", "kit de 10"), o kit é montado no EDITOR do ML,
   no anúncio do PRÓPRIO produto base, que controla o estoque. Nunca crie nem peça um produto kit novo no Rise. Passe
   quantidade N em lerParaPropostaML e em gravarPropostaML: o Rise cria (ou atualiza) o Clássico do produto com o Kit de N
   ligado (código {sku}_{N}), com o custo, o peso e as medidas das N unidades, e calcula o preço do kit; o estoque do
   anúncio é o que o produto monta (estoque ÷ N). Catálogos e links só do MESMO kit (a mesma peça na mesma quantidade).
3. Monte a proposta:
   - CATEGORIA: uma categoria FOLHA. Se escolher outra que não a provável, chame lerCategoriaML(categoriaId) para ver
     a ficha dela.
   - TÍTULO: NÃO escolha. O título do anúncio é o nome do produto base (produto.nome da leitura), e o Rise o põe sozinho;
     não mande "titulo" (se mandar, é ignorado e avisado). A ÚNICA exceção é o kit (produto.composicao true na leitura:
     o produto com composição ou o kit no ML): aí você propõe o título, dentro do limite da categoria, com o tipo da peça,
     o modelo ou o chip, a especificação principal e a compatibilidade, sem preço, sem "promoção", sem emoji. No kit no
     ML o título COMEÇA pela quantidade com "x" e segue com o nome do produto (pedido do dono: kit de 10 da barra de pinos =
     "10x BARRA DE PINOS ..."); produto.kit.tituloDePartida já vem assim e é o que o Rise usa se você não mandar.
   - KIT NO ML, na ficha: os atributos de quantidade da categoria levam o kit (Formato de venda "Kit", a quantidade por
     pacote ou de unidades = N), quando a categoria os tiver.
   - FICHA: só o que o cadastro do produto ou as referências PROVAM. Nunca invente. Os valores de lista escritos como
     estão na lista da categoria. Não mande GTIN nem o motivo de não ter (são do dono).
     Microcontrolador: o Chip(SoC) da descrição do produto; sem o chip, a linha Processador/CPU da descrição.
     NÃO SE APLICA: atributo OPCIONAL que o produto não tem (ex.: Capacidade de EEPROM numa placa ESP32, que não tem
     EEPROM): mande o valor "-1"; o Rise o envia ao ML como "não se aplica". Nunca nos obrigatórios (marcados como
     obrigatórios na leitura), e nunca para "não sei": o que você não sabe fica em branco.
     FICHA COMPLETA: o Rise só deixa o dono PUBLICAR com todos os campos da ficha preenchidos (ou "-1"). Preencha tudo o
     que puder provar; o que ficar em branco volta como aviso "Ficha: Preencha ..." e entra no relatório como pendência
     para o dono, nunca como valor inventado.
   - CATÁLOGOS: até 10 do MESMO produto (não de um parecido), cada um com 5 ou mais anúncios. Use os candidatos da
     leitura; o Rise descarta os de menos de 5. Menos de 5 catálogos, tudo bem.
   - SEM NENHUM CATÁLOGO do mesmo produto: pesquise no navegador e ache 5 anúncios do MESMO produto no Mercado Livre;
     mande url, título e preço de cada um em linksSemCatalogo. Esses links não são salvos no Rise: só entram na posição
     do ranking e no relatório.
4. gravarPropostaML(sku, categoriaId, atributos, catalogos, linksSemCatalogo, relatorio), com titulo só no kit e
   quantidade só no kit no ML. O Rise grava o Clássico na variante do preço e, com o Clássico a R$ 150 ou mais, também o
   Premium + frete grátis (premium na resposta); a variante que já está publicada no Rise não ganha outro rascunho. O
   relatório em tópicos curtos: por que a categoria, de onde veio cada valor da ficha, por que cada catálogo é o mesmo
   produto. Se voltar erro, corrija e grave de novo.
5. Mostre à pessoa o que o Rise devolveu: o título usado, a variante de cada anúncio (preco.variante e, quando houver,
   premium.preco), o preço, o lucro no ML ao lado do lucro na loja (o Rise
   calcula o preço do ML para deixar o MESMO lucro em R$ que o produto dá na loja, depois da comissão, do frete do ML e
   do imposto; não há regra de %), a posição no ranking (só informa: fora dos 5 primeiros vem um aviso), os catálogos
   aceitos e os avisos.
   Diga que o dono revisa no editor do Mercado Livre, adiciona os catálogos ao ranking se quiser, e publica (o "P" no
   ícone some no Publicar).`;
