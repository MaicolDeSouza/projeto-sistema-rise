# Chat da loja (Hobi): ajustes pedidos pelo dono depois da fase 2

Lista do dono, anotada à medida que ele manda. **FEITOS em 22/11/2026** (dono: "pode fazer tudo agora"); o resumo do que foi
implementado está no CLAUDE.md, seção "Chat da loja (o Hobi), fase 2", em "Ajustes do dono de 22/11/2026".

1. **(22/11/2026) Chamada ao lado do botão flutuante.** Uma caixa que o cliente entenda como "tire suas dúvidas aqui", no espírito
   da Mamute, mas autêntica (não copiar). Ideia do dono: caixa de fala com sinal de wi-fi.
   - Minha proposta: balão branco à esquerda do robô; no lugar do "rabicho" do balão, três arcos de sinal saindo da antena verde
     do Hobi em direção ao balão (os arcos acendem um a um, uma vez, ao aparecer). Nome "Hobi" em negrito verde + uma linha.
   - Aparece alguns segundos depois de a página abrir; tem um X; fechada ou depois de abrir o chat, não volta naquela aba.
     No celular, menor. Respeita "reduzir movimento".
   - Texto (dono escolheu a Opção 1 em 22/11/2026): **"Hobi"** em negrito verde e embaixo **"Dúvida no seu projeto? Pergunta pra mim"**.

2. **(22/11/2026) O WhatsApp certo.** Na loja de mentira o botão abriu o número de outra pessoa (era o número de exemplo
   `5554999990000`, posto pela demonstração porque o chat não tinha WhatsApp salvo). Dono: "deve ser usado o numero de whatapp de
   comercial cadastrado na loja. Caso o cliente exija suporte tecnico enviar whatas tecnico cadastrado no rise".
   - Fonte dos números: **Configurações › Dados da empresa** do Rise (`DadosDaEmpresa.celular` = comercial,
     `DadosDaEmpresa.whatsappTecnico` = técnico), os mesmos do PDF da proposta. O campo "Link do WhatsApp" da tela Canais deixa de
     ser digitado (só mostra os dois números lidos, com o link para editar em Dados da empresa).
   - O serviço `ia` não alcança `DadosDaEmpresa`: a visão `ia_configuracao` passa a entregar só esses dois números (já são
     públicos), em migration nova gerada pelo `sqlDoPapel.js`, com o teste de isolamento atualizado.
   - Passagem para o atendimento ganha o motivo **"suporte_tecnico"** (defeito, ligação, código que não funciona, dúvida técnica
     que o Hobi não resolve) → botão "Falar com o suporte técnico" com o número técnico. Os outros motivos → comercial. Sem número
     técnico cadastrado, cai no comercial. O prompt diz quando usar cada um.
   - A loja de mentira passa a usar os números de verdade dos Dados da empresa do PC, nunca um número inventado.

3. **(22/11/2026) A tela de boas-vindas da janela: dizer o que o Hobi faz e atalhos que puxam conversa.** Do print do dono:
   - **Maiúscula:** o subtítulo do topo vira "Assistente virtual da 4hobby" (e todo texto de atalho começa com maiúscula).
   - **Saudação mais clara**, dizendo o que ele faz. Proposta: "Oi! Sou o Hobi, da 4hobby. Posso te ajudar a achar um componente,
     tirar dúvida sobre uma peça, montar a lista do seu projeto e ver o status do seu pedido." (o pedido só depois da fase 3;
     até lá a frase sai sem ele). Continua editável na tela Canais.
   - **Atalhos, nesta ordem:** Encontrar um componente · **Tirar dúvida técnica sobre um produto** (novo, entre o primeiro e o
     "Colar lista", onde o dono marcou) · Colar lista de peças · Acompanhar meu pedido (fase 3) · Falar no WhatsApp.
   - **Todo atalho abre a conversa e o Hobi fala primeiro** (hoje só põe o cursor no campo). A fala de abertura é da própria janela
     (não chama a IA, não gasta):
     - Encontrar um componente → "Qual componente você procura? Pode ser o nome, o código ou para que vai usar."
     - Tirar dúvida técnica → "Qual produto você está com dúvida? Pode me passar o nome ou o código." Se a página aberta for de
       produto (`body.pagina-produto` + `[itemprop=sku]` + o nome do título da página), aparece logo abaixo um botão
       **"O produto desta tela: <nome>"**; clicado, a pergunta segue com esse produto (o código já vai no contexto).
     - Colar lista de peças → "Cole a lista, um item por linha, com a quantidade na frente. Ex.: 10 resistor 10k" (o campo abre
       no modo lista).
     - Falar no WhatsApp → abre o WhatsApp comercial (item 2).
   - (Ajustado pelo item 4: a fala do "Colar lista de peças" não exige formato.)
   - A fala de abertura entra na conversa da janela e é guardada com ela; não vai ao banco nem ao modelo como resposta da IA
     (o modelo recebe só o que o cliente escrever depois, com o contexto da página).

4. **(22/11/2026) Lista de peças em qualquer formato.** Dono: "precisa realmente ser uma linha abaixo da outra e quantidade na
   frente? a IA não conseguiria fazer essa leitura? dai da flexibilidade do cliente colar do jeito que ele desejar."
   - Já hoje quem separa os itens e as quantidades é a IA (ela monta os itens do `orcarLista`); o formato "um por linha, quantidade
     na frente" era só a dica da tela e o atalho do servidor (`lerLinhasDaLista`, que só avisa a IA quando vê 3+ linhas).
   - Fala de abertura do atalho (dono escolheu a Opção 2 em 22/11/2026): **"Pode colar sua lista aqui. Eu analiso e te mostro em
     instantes o que temos."** Placeholder do campo: "Cole sua lista aqui".
   - Prompt: qualquer mensagem com vários itens vira `orcarLista`, lendo a quantidade onde estiver ("10x resistor 10k",
     "resistor 10k - 10 un", "2 de cada", coluna de planilha colada com tabulação); item sem quantidade = 1, e o Hobi diz no texto
     quais ficaram com 1 para o cliente conferir. O aviso do servidor passa a valer também para lista em uma linha só (vírgula,
     ponto e vírgula) e para tabulação.
   - O limite de 2.000 caracteres por mensagem fica; lista maior, o Hobi pede em partes (como hoje). A fazer: ver na tela se
     2.000 cabe uma lista típica de projeto.
   - Testar com a IA DE VERDADE (`hobi:demo -- --real`, com o ok do dono para gastar centavos) com 4 formatos: linhas, vírgulas,
     planilha colada e texto corrido ("preciso de 10 resistores de 10k, 5 leds vermelhos e um arduino"). O provedor falso dos
     testes não prova leitura de formato.

5. **(22/11/2026, DESFEITO no mesmo dia: o dono viu e pediu "Vamos voltar para a cor verde, estava melhor") Cores laranja, preto e branco** ("cor laranja dos Legendários"). Hoje a janela é verde
   (#14532d) e o mascote tem detalhes verdes (fones, engrenagem do "4", luz da antena, olhos na tela).
   - Janela: o verde vira laranja (topo, botão Enviar, Adicionar, cartões numerados, balão da pergunta); preto no texto e no
     contorno; fundo branco. Conferir o contraste do texto branco sobre o laranja (se faltar, o texto do topo vai em preto).
   - Tom do laranja: o do logo dos Legendários que o dono mandou em 22/11/2026 ("essa cor"). O print não ficou salvo como arquivo,
     então o valor é ESTIMADO pela imagem: laranja avermelhado vivo, perto de **#FF5000**. Na implementação, conferir lado a lado
     com o print (ou pedir o arquivo) antes de fechar. Texto branco pequeno sobre esse laranja fica com pouco contraste: o topo usa
     o laranja com texto branco em negrito, e botões com texto pequeno usam um laranja um pouco mais escuro (perto de #D94300).
   - Mascote: o dono não escolheu (respondeu só a cor). Padrão adotado (FEITO, mostrado a ele): recolorir por programa os verdes do robô para o laranja e
     MOSTRAR ao dono antes de usar; se não ficar bom, ele gera de novo no Google Flow ou mantém verde.
   - O balão da chamada (item 1) e os arcos de wi-fi seguem as cores novas.

6. **(22/11/2026) Depois de ver os ajustes 1 a 5:** volta ao verde (janela e mascote); a chamada aparece **1 s** depois de abrir a
   página e de novo a cada atualização (o X só vale para aquela página); o balão fica **acima** do robô e menos para a esquerda; o
   símbolo de wi-fi no formato dos ícones que o dono mandou (em pé: ponto e arcos), logo acima da antena; texto mais caloroso, com a
   pontuação corrigida a partir da sugestão dele: **"Olá! Está com alguma dúvida? Me pergunte que eu te ajudo."** FEITO.
