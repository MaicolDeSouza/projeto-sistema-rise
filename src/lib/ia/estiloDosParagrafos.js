/**
 * O ESTILO dos paragrafos da descricao: o MESMO bloco em todos os prompts da biblioteca (docs/prompts-descricao/), no
 * prompt padrao do sistema (`PROMPT_DESCRICAO_PADRAO`, anuncio.js) e no roteiro da proposta (`ROTEIRO`, proposta/roteiro.js).
 *
 * Pedido do dono em 09/11/2026, depois das descricoes das fresas e dos eletroimas: "nao fica fluido no mesmo raciocinio,
 * tem troca de posicao de palavras que dificulta o entendimento, tenho que ler 2 a 3 vezes", com a Smartkits como
 * referencia. Medido na VPS em 08/11/2026: nas descricoes da Smartkits a frase tem 27 palavras, 55% das frases comecam
 * pelo sujeito, 5% abrem com um trecho solto e quase nao ha ";" nem ":"; nas reprovadas, 11 palavras por frase, 68% abrindo
 * com um trecho solto ("Ligado, o eletroima...") e ";" e ":" colando as ideias. A causa foi a regra "frases curtas, de no
 * maximo 15 palavras" posta nos dois prompts: frase curta nao e frase simples, e cortar os "porque" tirou o fio da ideia.
 *
 * Por que o bloco e COPIADO em cada prompt, e nao acrescentado pelo codigo: o prompt da biblioteca vai inteiro para a IA e
 * e o que o dono ve e edita na janela "Criar descricao" (pedido de 06/10/2026), entao o estilo precisa estar no texto dele.
 * O teste:extracao confere que todo arquivo de docs/prompts-descricao/ traz este bloco IGUAL e que nenhum volta a pedir
 * frases telegraficas. Prompt novo: copie o bloco e escreva so o CONTEUDO de cada paragrafo; nunca redefina o estilo.
 */
export const ESTILO_DOS_PARAGRAFOS = [
  "ESTILO DOS PARÁGRAFOS (regra da loja, igual em todos os prompts)",
  "Quem lê precisa entender na primeira leitura, como nas descrições da Smartkits: palavras do dia a dia, frases inteiras e um raciocínio só do começo ao fim do parágrafo.",
  "- Toda frase começa pelo sujeito (o nome do produto, “o módulo”, “essa força”) e o verbo, nunca por um trecho solto (“Ligado, o eletroímã...”, “Baseada no chip, a placa...”).",
  "- Cada frase continua a anterior, retomando o que ela terminou, e cada recurso vem com o porquê na mesma frase (“porque”, “então”, “já que”, “por isso”).",
  "- O primeiro parágrafo é uma frase só. No segundo, frases de 15 a 30 palavras, nem telegrama nem frase cheia de vírgulas.",
  "- Dentro do parágrafo, nada de ponto e vírgula, dois-pontos ou travessão colando ideias.",
  "- “possui”, “oferece”, “permite”, “dispensa” (nunca “tem”) e “você” quando couber.",
  "Assim não: “Ligou, prende; desligou, solta. Só prende depois de encostar: não puxa de longe.” Assim sim: “O eletroímã prende a peça só enquanto está ligado e só depois de encostar nela, porque não atrai o metal de longe como um ímã comum.”",
  "Antes de responder, releia cada opção: toda frase começa pelo sujeito, continua a anterior, traz o porquê e não tem “;” nem “:”? Corrija o que falhar.",
].join("\n");
