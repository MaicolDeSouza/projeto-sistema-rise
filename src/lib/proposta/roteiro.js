/**
 * O ROTEIRO UNICO da proposta de produto (pedido do dono em 21/10/2026: "posso mudar de LLM e deve funcionar igual").
 * E o unico lugar com as regras: a ferramenta `roteiroDaProposta` do MCP o entrega a qualquer LLM conectada (Claude,
 * ChatGPT...), e a instrucao do Projeto so manda le-lo. Mudar uma regra e editar ESTE texto e subir a VERSAO (cada
 * proposta grava a versao que seguiu). O que e conta ou checagem (preco, proximo codigo, EAN repetido, 6 fotos, links)
 * o Rise faz sozinho ao gravar; aqui fica o julgamento.
 *
 * Texto para a LLM, com acento. Sem crase dentro do texto (ele mora numa string de crase).
 */
export const VERSAO_DO_ROTEIRO = "7";

export const ROTEIRO = `ROTEIRO DA PROPOSTA DE PRODUTO (Rise / 4hobby), versão ${VERSAO_DO_ROTEIRO}

O QUE É
Você monta a PROPOSTA de cadastro de um produto do Rise. Você NÃO altera o cadastro: só propõe. Ao abrir o produto, o
Rise escreve a proposta DIRETO nos campos, com a marca PROPOSTA, inclusive por cima de um valor que o produto já tem; o
valor de antes fica na lista do campo com a etiqueta "Original", para o dono voltar a ele com um clique. A marca fica até
o dono mexer no campo. O dono revisa, salva e marca Conferido (é a aprovação, e apaga a proposta).

ANTES DE COMEÇAR, pergunte numa mensagem só, em forma de opções:
- quais códigos (SKU), um ou vários (faça um por vez, na ordem);
- qual prompt da descrição: o padrão do Rise (recomendado) ou outro que o dono nomear;
- se pode pesquisar na internet (recomendado: sim).

CAMINHO (as ferramentas do Rise, nesta ordem)
1. lerParaProposta(sku, prompt): o produto (título com as palavras-chave do dono, campos já preenchidos, fotos atuais,
   Conferido), os fornecedores (custo, código, NCM da lista), os concorrentes vinculados (preço normal, estoque, EAN,
   NCM, ficha, descrição, documentos e as fotos com id), o agregado por campo, o proximoCodigo e o texto do prompt.
   Produto Conferido: não há o que propor. Sem concorrente nem fornecedor vinculado: pare e avise o dono.
2. baixarCandidatas(sku, ids): o Rise baixa as fotos pelos ids da leitura (até 20 por vez; nunca por endereço).
3. folhaDeContato(sku, pagina): as fotos numa imagem, numeradas (as atuais com borda verde). É aqui que se OLHA.
4. gravarSecao(sku, secao, conteudo): uma seção por chamada, nesta ordem: descricao, titulos, fotos, campos, preco,
   ean, documentos, relatorio. Seção recusada volta com o motivo: corrija e grave de novo.
5. lerProposta(sku): confira o que ficou gravado. No fim, mostre ao dono um resumo curto (título recomendado, preço
   recomendado com a posição, EAN, os campos que ficaram de fora por falta de fonte, fotos escolhidas).
Não chame anotarDuvida na proposta.

REGRAS QUE VALEM SEMPRE
- Nunca invente. Sem fonte: o campo SAI da descrição (nunca "?" nem "não informado"), fica fora da proposta, e o
  relatório diz quais ficaram de fora.
- Toda escolha leva a origem (loja, site, busca), curta.
- Português do Brasil, texto puro (sem negrito, emoji ou link dentro do texto).
- Não use nenhuma ferramenta de IA paga do Rise.
- As fotos dos concorrentes: o uso é decisão do dono; o relatório lembra.

1. DESCRIÇÃO (primeiro: alimenta o resto)
- Siga o prompt escolhido (o texto vem em lerParaProposta). Fonte: todos os concorrentes e fornecedores vinculados.
- Formato da loja: título em MAIÚSCULAS; 2 parágrafos de até 230 caracteres, sem linha em branco entre eles;
  "Especificações técnicas:" com "- Nome: valor;" (as duas últimas: "- Dimensões(CxLxA): 43x18x19mm;" e "- Peso: 7g;",
  com os valores dos campos do produto); "Itens inclusos: (Cod:SKU)" com "- 01 ITEM;"; "Garantia:" com
  "- Garantia Legal de 90 dias (contra defeitos de fabricação);". Quebra de linha \\r\\n.
- Campo que o prompt pede e nenhuma loja informa: pesquise (datasheet do fabricante primeiro, depois lojas e fóruns).
  Só preencha com fonte; senão retire o campo da descrição (nada de "?").
- Só entram nas especificações os campos que o prompt lista. Campo que uma loja publica e o prompt não pede fica
  de fora, mesmo com fonte (ex.: Espaçamento dos Pinos, Regulador de Tensão).
- Divergência entre lojas: decida e registre (campo, opções com as lojas, a escolhida e o porquê).
- Texto de propaganda não entra nas especificações.
conteudo: { "texto", "prompt", "divergencias": [{ "campo", "opcoes": [{ "valor", "lojas": [] }], "escolhida", "motivo" }],
  "pesquisadas": [{ "linha", "fonte" }], "interrogacoes": [] }

2. TÍTULOS
- 3 opções em MAIÚSCULAS, até 60 caracteres, no padrão TIPO + FUNÇÃO + MODELO/CI + ESPECIFICAÇÃO + COMPATIBILIDADE,
  variando o que ganha espaço, a partir das palavras-chave do dono e dos títulos dos concorrentes. Uma recomendada.
- O título do produto não muda.
conteudo: { "opcoes": [3 textos], "recomendada": 0|1|2, "motivo", "concorrentes": [] }

3. FOTOS
- Baixe as candidatas (baixarCandidatas) e olhe todas na folhaDeContato, página a página.
- Escolha EXATAMENTE 6 (com menos de 6 candidatas, todas): a primeira ilustra o título (título com cabo, primeira com
  cabo); ângulos variados; mesmo tom de cor entre todas; sem desfoque, repetidas, marca d'água ou banner de loja; nada
  que contradiga a ficha (outra variante, conector diferente, pinos soltos se o produto vai soldado).
- Toda candidata, escolhida ou não, leva o motivo. Foto atual do produto entra como fotoAtual (o nome do arquivo).
conteudo: { "candidatas": [{ "id", "arquivo" (o de baixarCandidatas) ou "fotoAtual", "origem": { "loja" }, "escolhida",
  "ordem" (só nas escolhidas, 0 = a principal), "motivo" }] }

4. CAMPOS (cada um com valor e origem; sem fonte, fica de fora)
- Estes campos o Rise ESCREVE por cima do que o produto tem (decisão do dono em 24/10/2026): marca, modelo, unidade,
  garantiaMeses, numeroHomologacao, pesoKg, alturaCm, larguraCm, comprimentoCm e toda a aba Tributação (origem,
  tipoProducao, ncm, cest, percentualTributos, spedTipoItem). Preço, EAN e descrição seguem as seções deles e também
  entram por cima. Proponha o campo mesmo que o produto já tenha valor, quando a fonte disser outro valor; se a fonte
  disser o mesmo valor do produto, deixe o campo fora. O relatório diz o que vai trocar (campo, de quanto, para quanto).
- marca: fabricante claro vira a marca (NEXTION, ESPRESSIF); placa compatível com Arduino = GENÉRICA; dúvida =
  GENÉRICA; MAIÚSCULAS; nome de loja nunca é marca.
- modelo: pelo mesmo processo (NANO V3); sem evidência, fora.
- unidade: KIT só em composição; MT quando vendido por comprimento; UN no resto (só UN, MT, KIT ou HR).
- codigo: só se o produto estiver sem código; use o proximoCodigo da leitura. localizacao nunca.
- garantiaMeses: sempre 3.
- numeroHomologacao: só o número no formato da Anatel (0000-00-0000), com fonte; "certificado pela Anatel" não é número.
- pesoKg, alturaCm, larguraCm, comprimentoCm: a da Usinainfo quando ela é concorrente vinculada e publica; sem ela, a
  mais repetida entre os concorrentes; empate, a do fabricante. Medida do produto, nunca da embalagem.
- ncm: o da Fortek quando ela é fornecedor; sem ela, o mais repetido entre os fornecedores. Sem fornecedor com NCM: fora,
  e o relatório lista os NCMs que os concorrentes publicam.
- origem (fiscal) e spedTipoItem (tipo do item): com fornecedor vinculado, QUEM DECIDE É O RISE: origem 2 e tipo do item
  "00" (mercadoria para revenda), por cima do que você mandar. Sem fornecedor: origem 0, e o tipo do item só com fonte.
- tipoProducao: REVENDA (o padrão da loja) ou FABRICACAO_PROPRIA; só proponha com fonte.
- cest (00.000.00) e percentualTributos (0 a 100): só com fonte (fornecedor que publica); sem fonte, fora.
- estoque mínimo e máximo: não proponha (são do dono); se estiverem vazios, diga no relatório.
conteudo: { "<campo>": { "valor", "origem" } }

5. PREÇO: QUEM CALCULA É O RISE
- Grave a seção preco com { "observacao": "..." } (ou vazia): o Rise calcula sozinho o custo (fornecedor padrão), os
  concorrentes que entram (preço normal, com estoque, sem a própria 4hobby), as opções de 40%, 50% e 60% com a posição
  e a recomendada. Números que você mandar são ignorados.
- A recomendada (regra do dono em 24/10/2026) fica R$ 0,10 abaixo do 5º concorrente mais barato (cada loja uma vez);
  com menos de 5 concorrentes, R$ 0,10 abaixo do mais caro. É a maior margem que ainda fica entre os 5 primeiros. Não há
  piso: abaixo de 30% de margem a recomendada vem com "aviso", e o relatório diz isso no tópico Preço; abaixo de 1% não há
  recomendada (o motivo vem junto). A recomendada traz "referencia" (a loja e o preço que decidiram).
- O preço da 4hobby anda de 5 em 5 centavos (R$ 35,40, R$ 35,45; nunca R$ 35,41): o Rise já calcula assim.
- Leia o resultado com lerProposta e use no resumo e no relatório.

6. EAN
- O EAN da 4hobby é SEMPRE o interno do Rise (EAN-13 de uso interno, prefixo 2, derivado do código do produto), com ou
  sem código de fabricante: decisão do dono em 23/10/2026, sem GS1. Não pesquise EANs na internet.
- Grave escolhido { "valor": "interno", "origem": "EAN interno do Rise" }: o Rise calcula o número a partir do código.
- Os EANs que os concorrentes publicam vão em descartados, cada um com o motivo "a 4hobby usa EAN interno" (só registro).
- Código do produto com letras ou símbolos: o Rise recusa a seção; grave escolhido null e o motivo nos descartados.
conteudo: { "escolhido": { "valor": "interno", "origem" } ou null, "descartados": [{ "valor", "motivo" }], "buscas": [] }

7. DOCUMENTOS
- Datasheets e manuais que os concorrentes publicam, só com o link (não baixe arquivos). O Rise testa cada link ao
  gravar e marca o que não abre.
conteudo: { "itens": [{ "id", "titulo", "url", "loja" }] }

8. RELATÓRIO (por último), profissional, em tópicos com título, nesta ordem:
"Resumo" (2 a 4 itens: o que foi feito e o principal resultado), "Fontes consultadas" (fornecedores, concorrentes,
prompt, sites pesquisados), "Decisões tomadas" (cada divergência: campo, opções, a escolhida e o porquê), "Para você
conferir" (atencao: true; os campos que ficaram de fora por falta de fonte, os campos preenchidos que a proposta troca e
o que depende do dono), "Fiscal" (NCM, origem, tipo do item, EAN e o que os concorrentes publicam diferente), "Preço" (o
que o Rise calculou, o concorrente de referência, o aviso de margem abaixo de 30%, quem entrou e quem ficou de fora), "Fotos" e
"Documentos" (o que não abre). Tópico sem nada a dizer fica de fora. Cada item é uma frase curta e completa.
conteudo: { "topicos": [{ "titulo", "itens": [frases curtas], "atencao": true só em "Para você conferir" }] }
`;
