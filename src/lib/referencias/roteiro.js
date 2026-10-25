/**
 * O ROTEIRO DA ESCOLHA DE REFERENCIAS (pedido do dono em 25/10/2026: "quero deixar salvo isso em algum lugar para que
 * possamos ser mais assertivos"). Antes da proposta, a LLM acha os fornecedores e concorrentes do produto no acervo
 * coletado e os deixa marcados (vinculados) para o dono conferir na lupa. Servido pela `roteiroDaProposta` com canal
 * "referencias", para qualquer LLM conectada. Cada correcao do dono vira uma regra AQUI, com a VERSAO subida.
 *
 * Texto para a LLM, com acento. Sem crase dentro do texto (ele mora numa string de crase).
 */
export const VERSAO_ROTEIRO_REFERENCIAS = "1";

export const ROTEIRO_REFERENCIAS = `ROTEIRO DA ESCOLHA DE REFERÊNCIAS (Rise / 4hobby), versão ${VERSAO_ROTEIRO_REFERENCIAS}

O QUE É
Antes da proposta de cadastro, você acha os FORNECEDORES (onde a loja compra) e os CONCORRENTES (quem vende o mesmo
produto) no acervo que o Rise coleta, e os deixa MARCADOS no produto. O dono confere na lupa do Nome (quem está marcado
aparece em verde na primeira busca) e na aba Fornecedores / Concorrentes. Você NÃO faz a proposta aqui.

PERGUNTE E ESPERE (regra do dono)
Se o produto ou a foto deixar dúvida que muda a escolha, PERGUNTE ao dono numa mensagem curta, em forma de opções, e
NÃO siga antes da resposta. Exemplos: a foto não mostra o conector ("é USB Tipo C ou Micro USB?"); o título diz um
modelo e a foto mostra outro; não dá para ver quantos pinos tem; não se sabe se vai com cabo ou soldado.

CAMINHO (as ferramentas do Rise, nesta ordem)
1. lerParaProposta(sku): título, descrição, campos, fotos atuais, os fornecedores (inclusive o rascunho que veio do
   Bling) e os concorrentes já marcados.
2. folhaDeContato(sku): OLHE a foto do produto e descreva para você mesmo, com cuidado, antes de comparar: tipo de
   placa, onde fica o módulo, se a antena passa da borda da placa ou não, botões, conector (Tipo C, Micro USB),
   quantidade de pinos, cor, componentes que aparecem. Na dúvida, pergunte (acima).
3. buscarNoMercado: várias buscas, do mais exato ao mais largo (modelo, código, palavras do título; variantes de
   escrita como "wroom-32d" e "wroom 32d"). Leia os dois lados: fornecedores e concorrentes.
4. Pré-escolha pelo título e marque os candidatos de concorrente com marcarReferencias(sku, concorrentes.adicionar).
5. Confira cada concorrente pela FOTO: lerParaProposta(sku) dá as fotos com id, baixarCandidatas(sku, ids) com a
   primeira foto de cada um, folhaDeContato(sku) para olhar lado a lado com a nossa. Tire os que não batem com
   marcarReferencias(sku, concorrentes.remover).
6. Fornecedores: as listas de fornecedor não têm foto. Escolha pelo título e pelo código, e marque com
   marcarReferencias(sku, fornecedores.adicionar). Fornecedor nunca vira padrão: o custo do produto não muda e o
   fornecedor que veio do Bling continua valendo até o dono escolher o padrão na tela.
7. Mostre ao dono: uma tabela dos marcados (loja, código, nome, preço, estoque, por que entrou), os que você tirou e
   por quê, e as dúvidas. Termine dizendo para ele abrir o produto numa ABA NOVA antes de salvar (uma aba que já estava
   aberta, ao Salvar, apaga as marcações novas).

REGRAS DE ESCOLHA (cada uma veio de uma correção do dono)
- A PRÓPRIA 4HOBBY ENTRA COMO CONCORRENTE: fonte "4hobby", código = o SKU do produto. Não pule por ser "nós".
- A FOTO MANDA MAIS QUE O TÍTULO. Título igual com placa diferente na foto não entra (170113: o Mamute 26199 dizia
  "DOIT DevKitC WROOM-32D USB-C" e era outra placa).
- Compare com a SUA leitura da nossa foto, e leia com cuidado: no 170113 a antena NÃO passa da borda da placa, e a
  leitura errada levou a escolhas erradas.
- Fornecedor com o mesmo modelo no título e o código certo entra, mesmo sem foto (170113: Nightech ROB0103 e Fortek
  ROB150 eram os certos).
- Mesmo produto, não acessório: expansor, shield, base, case ou só o chip/módulo solto não é a placa.
- Variante que muda o produto (conector, quantidade de pinos, memória, com ou sem antena externa) só entra se for a
  mesma do nosso; se a nossa não estiver clara, pergunte.
- Não abra o navegador para procurar anúncio do Mercado Livre: use só o acervo do Rise.
- Nunca invente código ou loja: só o que buscarNoMercado devolveu.
`;
