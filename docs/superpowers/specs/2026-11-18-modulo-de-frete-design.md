# Módulo de frete: cotar, comprar etiqueta e acompanhar envio pelo Melhor Envio

Data: 18/11/2026. Dono: Maicol (4hobby). Estado: desenho para aprovação. Nada implementado.

## 1. Intenção e porquê

Hoje o envio do que sai por fora da loja e do Mercado Livre é todo manual: a cotação é feita no site do Melhor Envio com
caixa e peso estimados, o valor é passado ao cliente, e depois da aprovação a equipe emite a nota, embala, mede, pesa, volta
ao site do Melhor Envio para gerar a etiqueta e copia o rastreio para o WhatsApp ou o e-mail do cliente. Palavras do dono:
"Fica tudo muito manual. Gostaria de tornar o mais automático possível".

O módulo traz esse fluxo para dentro do Rise: cotar na Proposta e no Pedido, comprar e imprimir a etiqueta no pedido,
acompanhar o envio e avisar o cliente sozinho quando o pacote for postado. O Melhor Envio é o primeiro provedor; o dono pediu
para deixar "preparada para cadastrar outras no futuro" (a SuperFrete é a candidata).

Dois fatos que moldam o desenho:

- O pedido de venda vai deixar de nascer no Bling ("não iremos mais criar pedido pelo bling futuramente, será tudo pelo
  rise"). Por isso o envio é um registro próprio do Rise, e não um pedaço do pedido do Bling.
- O Mercado Livre continua no Mercado Envios (obrigatório) e a Loja Integrada continua no Enviali (a etiqueta do Enviali só
  existe para pedido da loja, e na simulação de 18/11/2026 ele ganhou no SEDEX dentro do RS). Este módulo não toca nos dois.

## 2. Goals, non-goals, anti-goals

**Goals**

- Cotar frete com a caixa sugerida pelo Rise, em quatro lugares: Proposta para cliente, Pedido de venda, Envio avulso e a
  cotação rápida de Ferramentas.
- Comprar, imprimir (térmica 10×15 ou A4) e cancelar a etiqueta dentro do Rise, com o saldo da carteira do Melhor Envio.
- Acompanhar todos os envios numa lista e em cada pedido, com o rastreio atualizado pelo worker.
- Avisar o cliente quando o pacote for postado: e-mail automático de contato@4hobby.com.br e botão de WhatsApp com o texto
  pronto.
- Levar o custo real da etiqueta para o lucro do pedido, no lugar do valor digitado.
- Gerar código reverso (logística reversa dos Correios) no pedido de compra (o fornecedor posta para a 4hobby, frete da
  4hobby) e no pedido de venda (troca, garantia, devolução).
- Provedor de frete trocável: um segundo provedor entra criando um arquivo e uma linha num registro, sem mexer nas telas.

**Non-goals (por agora)**

- Trocar o Enviali da loja ou o Mercado Envios.
- WhatsApp automático (Evolution ou API oficial). Fica o botão de um clique.
- Aviso instantâneo do Melhor Envio (webhook). O worker consulta a cada 15 minutos; o webhook pode entrar depois sem refazer
  nada.
- Mais de um volume por envio (o dono confirmou: sempre um volume).
- Aviso de recebimento e mão própria (o dono não usa).
- Coleta (a postagem é na agência).
- Recarregar saldo pelo Rise. O Rise só mostra o saldo e o link do painel.
- Vincular caixa de envio padrão a cada produto. O cadastro de caixas nasce pronto para isso, mas o vínculo é fase futura.
- Criar o pedido de venda no Rise. É outro projeto; este módulo só não pode depender do Bling.

**Anti-goals (seria fracasso mesmo funcionando)**

- Comprar etiqueta em dobro por clique duplo, ou comprar sem o operador ver o valor e o saldo antes.
- Comprar com a medida estimada sem deixar claro: a transportadora cobra a diferença depois (conciliação).
- Mandar e-mail a cliente de verdade a partir do PC de desenvolvimento.
- Avisar o cliente duas vezes do mesmo envio.
- A tela de pedido depender do provedor estar no ar para abrir.

## 3. Restrições

- **Melhor Envio (documentação lida em 18/11/2026):** produção `https://melhorenvio.com.br`, teste
  `https://sandbox.melhorenvio.com.br` (conta separada, saldo falso de R$ 10.000, só Correios e Jadlog, o status muda sozinho
  a cada 15 min). OAuth2 por aplicativo: token de acesso de 30 dias, de renovação de 45. Cabeçalho `User-Agent` obrigatório
  com o nome do aplicativo e um e-mail de contato.
- **Nota fiscal:** envio comercial pede a chave da NF-e; a etiqueta só sai depois de a nota existir. Sem nota vai declaração
  de conteúdo, e o provedor pode recusar conforme a transportadora; a recusa aparece na tela como veio.
- **Transportadoras:** Azul Cargo com NF-e não se compra pela API. Mini Envios: até 300 g, 4×16×24 cm, valor segurado até
  R$ 116,70. Quem decide o que atende é a resposta do provedor, não uma regra nossa.
- **Reverso:** só Correios (PAC e SEDEX), um volume, código no lugar da etiqueta, só com declaração de conteúdo (que precisa
  ir impressa com o pacote) e 7 dias para postar. No ambiente de teste o código não é gerado: o primeiro reverso real é o
  teste.
- **Dinheiro:** comprar etiqueta gasta saldo real. Vale a regra das outras escritas do Rise: trava no `.env`
  (`FRETE_COMPRA=false` no PC), conferida antes de a requisição sair.
- **Cadastro incompleto:** 418 de 1.320 produtos estão sem medida e 419 sem peso (cópia do PC, 18/11/2026). O módulo tem de
  funcionar com caixa e peso escolhidos à mão.
- **Padrões do Rise:** JavaScript, texto de tela com acento, padrão visual das 10 regras, tabela com cabeçalho que ordena e
  25/100 por página, popup de conclusão com OK, janelas com `propsDoFundo` e `role`, acessos conferidos no servidor.

## 4. Abordagens consideradas

1. **Envio como registro próprio, provedor trocável, rastreio consultado pelo worker (escolhida pelo dono em 18/11/2026).**
   Cada envio é uma linha do Rise ligada a um pedido de venda, a uma proposta, a um pedido de compra ou a nada. O Melhor Envio
   fica atrás de uma interface única. O worker consulta os envios abertos a cada 15 minutos. Troca: o aviso ao cliente pode
   sair com até 15 minutos de atraso, o que não pesa num pacote que leva dias.
2. **A mesma, mais o webhook do Melhor Envio.** Aviso em segundos, ao custo de uma rota pública nova com conferência de
   assinatura e mais um ponto de manutenção; o worker continuaria consultando como rede. Pode ser acrescentada depois.
3. **Direto no pedido, sem registro próprio nem camada de provedor (descartada).** Mais rápida, mas quebra quando o pedido
   sair do Bling e não deixa cadastrar outro provedor.

Fora do Melhor Envio, foram descartados antes: o Bling Envios (é o próprio Melhor Envio, e a API do Bling não cota nem
compra etiqueta), o Enviali (só pedido da loja), os Correios direto e o Frenet (só com contrato próprio).

## 5. Desenho

### 5.1 Dados

**`CaixaDeEnvio`** (Cadastros). `nome` único no padrão `CX 16x11x3` (comprimento x largura x altura em cm, sem casas quando
inteiro), medidas externas, medidas internas opcionais (sem elas vale a externa menos 0,5 cm por lado), `pesoVazioKg`,
`ativo`. A migration semeia as três do dono, com peso estimado até ele pesar:

| Nome | Medidas externas (cm) | Peso vazio estimado |
|---|---|---|
| CX 16x11x3 | 16 × 11 × 3 | 35 g |
| CX 16x11x6 | 16 × 11 × 6 | 45 g |
| CX 19x12x12 | 19 × 12 × 12 | 70 g |

**`Envio`**. Um por pacote.

- Identidade: `numero` (mostrado `ENV-0001`, sob trava como o do pedido de compra), `direcao` (`IDA` ou `REVERSO`),
  `provedor` (hoje só `MELHOR_ENVIO`), `status`.
- Vínculo: `pedidoDeVendaId`, `propostaId`, `pedidoDeCompraId`, todos opcionais; os três vazios = avulso. `SetNull` ao
  apagar o pai: o envio e o custo dele sobrevivem.
- Partes, copiadas na hora (não apontam para o cadastro, que muda): `remetente` e `destinatario` em JSON (nome, documento,
  e-mail, telefone, endereço).
- Pacote: `caixaDeEnvioId` opcional, comprimento, largura, altura, `pesoKg`, `valorDeclarado`, `medidaConferida` (falso
  enquanto a medida é estimativa).
- Documento: `tipoDeDocumento` (`NFE` ou `DECLARACAO`), `chaveNfe`, `itensDaDeclaracao` em JSON.
- Serviço escolhido: `servicoId` e `servicoNome` como o provedor devolve, `transportadoraNome`, `prazoDias`, `precoCotado`,
  `cotadoEm`.
- Compra: `idNoProvedor`, `protocolo`, `custo`, `compradoEm`, `compradoPor`, `rastreio`, `linkDoRastreio`, `validoAte`.
- Andamento: `postadoEm`, `entregueEm`, `canceladoEm`, `eventos` em JSON, `ultimaConsultaEm`, `ultimoErro`.
- Aviso: `avisoEmailEm`, `avisoEmailErro`, `avisoWhatsappEm`.

Regras do vínculo:

- Um pedido de venda tem no máximo um envio de ida que não esteja cancelado nem expirado; reversos, quantos forem
  precisos. O pedido de compra aceita vários reversos (o fornecedor pode mandar em partes).
- A proposta de origem de um pedido do Bling é achada por `PropostaParaCliente.pedidoDeVendaBlingId` =
  `PedidoDeVenda.blingPedidoId`; é assim que a cotação da proposta chega à janela do pedido.
- Origem (remetente da ida, destinatário do reverso) = Dados da empresa, lidos na hora da cotação.

Status do envio, com o que vem do Melhor Envio entre parênteses:

| Status | Quando |
|---|---|
| `RASCUNHO` | Cotado e com serviço escolhido, ainda não comprado |
| `A_POSTAR` | Comprado e com etiqueta ou código gerado (`released`, `generated`) |
| `POSTADO` | A transportadora registrou a postagem (`posted`) |
| `ENTREGUE` | (`delivered`) |
| `NAO_ENTREGUE` | (`undelivered`) |
| `COM_PROBLEMA` | (`paused`, `suspended`) |
| `CANCELADO` | Cancelado por nós ou pelo provedor (`canceled`) |
| `EXPIRADO` | Passou do `validoAte` sem postar |

**`ConfigDeFrete`** (uma linha): `acrescimoDeEmbalagem` (R$ 1,00), `percentualDePesoExtra` (10), `momentoDoAviso`
(`POSTADO`), assunto e texto do e-mail, texto do WhatsApp, formato de impressão preferido.

**Proposta**: ganha `cotacaoDoFrete` em JSON (caixa, peso, serviço, custo, valor cobrado, data). A coluna `frete` que já
existe recebe o valor cobrado.

**`Servico`** (enum das conexões) ganha `MELHOR_ENVIO`; o token fica em `Conexao`, cifrado, como os outros.

### 5.2 Provedor de frete

`src/lib/frete/provedores/registro.js` é a fonte única, no molde de `src/lib/integracoes/registro.js`. Cada provedor é um
arquivo que exporta um objeto com:

- `id`, `nome`, `capacidades` (`reverso`, `formatosDeImpressao`, `declaracaoDeConteudo`);
- `cotar({ origem, destino, pacote, valorDeclarado })` → lista de `{ servicoId, servicoNome, transportadora, preco,
  prazoDias, motivoDaRecusa }`;
- `comprar(envio)` → `{ idNoProvedor, protocolo, custo, rastreio, linkDoRastreio, validoAte }`;
- `imprimir(envio, formato)` → endereço ou bytes da etiqueta (e da declaração, quando houver);
- `rastrear(listaDeIds)` → status e eventos de cada um;
- `cancelar(envio)`; `saldo()`; `gerarReverso(envio)`.

As telas e o worker só falam com essa interface. Nada fora de `provedores/melhorEnvio.js` conhece endereço, campo ou status
do Melhor Envio. A SuperFrete, no futuro, é outro arquivo com a mesma forma.

O cliente HTTP do Melhor Envio mora em `src/lib/integracoes/melhorenvio.js` como conector (cartão em Integrações, teste de
conexão, `npm run diagnostico`), com a renovação do token no molde do Bling. Chamadas usadas: `shipment/calculate`, `cart`,
`shipment/checkout`, `shipment/generate`, `shipment/print`, `shipment/tracking`, saldo, cancelamento e a logística reversa no
carrinho.

### 5.3 Cotação e sugestão de caixa

Regra pura em `src/lib/frete/regras.js`, sem banco e sem rede:

- **Peso do pacote** = (soma do peso dos itens × quantidade + peso da caixa vazia) × (1 + `percentualDePesoExtra`). Kit usa
  o peso do kit; sem ele, a soma das peças.
- **Caixa sugerida** = a menor caixa ativa em que todo item cabe sozinho (as três medidas ordenadas contra as internas) e
  em que a soma dos volumes dos itens não passa de 70% do volume interno. Nenhuma serve: sem sugestão, com o aviso "não cabe
  em nenhuma caixa cadastrada".
- **Item sem peso ou sem medida:** a sugestão não sai; a tela diz quantos itens estão incompletos e o operador escolhe a
  caixa e digita o peso.
- **Valor declarado** = valor dos produtos (o da nota).
- **Valor a cobrar do cliente** = preço cotado + `acrescimoDeEmbalagem`.

A lista de serviços vem da mais barata para a mais cara, com transportadora, prazo, custo e valor a cobrar. Os serviços que
o provedor recusa ficam recolhidos numa linha ("5 não atendem este envio"), com o motivo ao abrir.

Um componente só, `JanelaDeCotacao`, é usado nos quatro lugares.

### 5.4 Telas

Em cada tela o operador precisa ver primeiro a situação do envio, e a ação principal é a próxima etapa dele.

- **Proposta para cliente:** botão "Cotar frete" na seção do frete, visível com frete CIF. Abre a janela já com o CEP de
  entrega do cliente, a caixa sugerida e o peso. Escolher um serviço grava o valor a cobrar no frete da proposta, o nome do
  serviço como transportadora e a cotação com a data.
- **Pedido de venda, aba Envio** (pedidos do Bling hoje; os do Rise quando existirem): seção "Envio pelo Rise", com um botão
  principal conforme a situação:
  - sem envio: **Cotar frete** (se a proposta de origem tem cotação, a janela abre com a caixa e o peso dela);
  - rascunho: mostra o serviço escolhido e **Comprar etiqueta**; antes pede a caixa e o peso reais ("medido e pesado");
  - a postar: **Imprimir etiqueta** (Térmica 10×15 ou A4), o rastreio e "Cancelar etiqueta" no menu;
  - postado em diante: a linha do tempo, a situação do aviso e o botão do WhatsApp.
  O campo "Custo real do frete" digitado some quando há envio comprado: o custo passa a ser o da etiqueta, com a fonte
  "da etiqueta do Melhor Envio".
- **Comprar etiqueta:** popup de confirmação com serviço, prazo, valor, saldo antes e depois. Saldo insuficiente ou trava
  fechada: botão desabilitado com o motivo. Sucesso termina no `ConclusaoDoEnvio` com OK.
- **Envios** (bloco novo no menu, `/envios`): tabela com número, data, destinatário (remetente no reverso), vínculo com
  link, serviço, situação, rastreio, custo e aviso. Filtros por situação e direção, busca por rastreio, nome ou número,
  cabeçalho que ordena, 25/100 por página. Ação principal "Novo envio" (avulso). O saldo da carteira aparece discreto no
  topo, com o link do painel do Melhor Envio.
- **Envio avulso** (`/envios/novo`): destinatário do cadastro (cliente ou fornecedor) ou digitado, pacote, documento,
  cotar e comprar. Serve para garantia, troca, amostra e devolução a fornecedor.
- **Cotar frete** (cartão em Ferramentas): CEP, caixa, peso e valor; mostra a lista e copia o resultado como texto para
  colar no WhatsApp. Não grava nada.
- **Caixas de envio** (cartão em Cadastros): tabela e formulário; o nome é montado pelas medidas.
- **Configurações › Envios:** acréscimo de embalagem, percentual de peso extra, texto do e-mail e do WhatsApp, formato de
  impressão preferido.
- **Integrações:** cartão do Melhor Envio (conectar, testar, saldo, ambiente de teste ou produção).

### 5.5 Compra, impressão e cancelamento

- **Antes de comprar** o servidor confere: acesso, trava `FRETE_COMPRA`, envio em `RASCUNHO`, documento presente (chave da
  NF-e ou itens da declaração), `medidaConferida` verdadeiro, saldo suficiente.
- **Sem compra em dobro:** a passagem de `RASCUNHO` para "comprando" é uma escrita condicional no banco; o segundo clique
  não acha a linha. Queda no meio (carrinho criado e pagamento não confirmado) é retomada pelo `idNoProvedor` gravado, sem
  criar outro carrinho.
- **Pedido do Bling:** a chave da NF-e é a que o Rise já lê do pedido. Sem nota no pedido, o operador escolhe declaração de
  conteúdo (os itens saem do pedido) ou espera a nota.
- **Impressão:** pedida ao provedor a cada clique; o Rise não guarda o arquivo.
- **Cancelar:** só em `A_POSTAR`, com popup; o provedor devolve o valor à carteira. O envio fica `CANCELADO` e o pedido
  volta a aceitar nova cotação.
- **Custo no lucro:** envio comprado alimenta o custo do frete do pedido pela mesma função que hoje recalcula o lucro real
  ao digitar o frete.

### 5.6 Rastreio (worker)

Rotina `envios`, a cada 15 minutos, registrada na Saúde do Rise como as outras:

1. pega os envios em `A_POSTAR`, `POSTADO` e `COM_PROBLEMA`;
2. chama `rastrear` do provedor em lotes;
3. grava status, datas e eventos; só escreve o que mudou;
4. na passagem para o status do `momentoDoAviso`, dispara o aviso (5.7);
5. marca `EXPIRADO` o que passou do `validoAte` sem postar.

Provedor fora do ar é aviso da rotina, não erro do pedido: a tela mostra o último estado conhecido e a data da última
consulta. O pedido de venda passa a mostrar o envio do Rise quando ele existe; sem ele, segue o que veio do Bling.

### 5.7 Aviso ao cliente

- **E-mail automático:** sai de contato@4hobby.com.br pelo Google Workspace (SMTP com senha de aplicativo, guardada no
  `.env`; biblioteca `nodemailer`). Texto com o número do pedido, a transportadora, o código e o link de rastreio.
  Destinatário: o e-mail do envio (o do cliente no cadastro ou o do pedido).
- **Uma vez só:** `avisoEmailEm` é gravado junto do envio; quem acha a data preenchida não manda de novo. Falha fica em
  `avisoEmailErro`, aparece na lista de Envios e tem o botão "Reenviar e-mail".
- **Trava:** `EMAIL_ENVIO=false` no PC. Com a trava fechada o e-mail é montado e registrado como "não enviado (trava)".
- **WhatsApp:** botão que abre a conversa com o texto pronto (o mesmo mecanismo das Propostas); o clique grava
  `avisoWhatsappEm`. Cliente sem e-mail: o envio postado ganha um "!" na lista até o botão ser usado.
- **Momento:** na postagem. Antes dela o link de rastreio não mostra nada.

### 5.8 Código reverso

- **Pedido de compra:** botão "Gerar código reverso". Remetente = o fornecedor do pedido (endereço, e-mail e telefone do
  cadastro, editáveis na janela); destinatário = a 4hobby (Dados da empresa). O operador informa caixa ou medidas, peso e
  valor declarado, escolhe PAC ou SEDEX e compra. O pedido passa a mostrar o código, a validade, a situação e o rastreio.
- **Enviar ao fornecedor:** e-mail com o código, as instruções de postagem e a declaração de conteúdo para imprimir, mais o
  botão de WhatsApp. Os Correios também mandam o código ao e-mail do remetente.
- **Pedido de venda:** o mesmo botão, com o cliente como remetente. Se o envio de ida foi feito pelo Rise, o reverso é
  pedido a partir dele, e o provedor reaproveita os dados.
- **Lista de Envios:** o reverso aparece marcado e filtrável; expira em 7 dias sem postagem.

### 5.9 Acessos

- `tela.envios` (ver a lista e os envios) e `tela.cadastros.caixasDeEnvio`.
- `acao.envios.comprarEtiqueta`: comprar, cancelar e gerar reverso. Só o dono e a Andrea.
- Cotar não gasta nada: quem vê a tela pode cotar.
- O custo do frete segue a regra de dado sensível que o pedido já aplica.

### 5.10 MCP

Só leitura, na última fase: `cotarFrete` (CEP, caixa ou medidas, peso, valor), `listarEnvios` e `lerEnvio`. Nenhuma
ferramenta compra etiqueta.

### 5.11 Testes

`npm run teste:frete`, com Postgres local, sem rede, contra um Melhor Envio falso e um transporte de e-mail falso; só
escreve `ZZ-FRETE-*` e apaga. Cobre: regras puras (peso, sugestão de caixa, item incompleto, valor a cobrar, mapa de
status), o provedor (cotar, comprar, retomar compra pela metade, imprimir, cancelar, saldo, reverso), o banco (numeração,
clique duplo, saldo insuficiente, trava fechada, sem documento, medida não conferida), a rotina do worker (transições,
aviso uma vez, expirado, provedor fora do ar), o e-mail (montagem, trava, reenvio), os acessos e o custo no lucro do
pedido. As telas são conferidas no navegador contra o ambiente de teste do Melhor Envio.

## 6. Fases de entrega

1. **Cotação (não gasta nada):** conexão com o Melhor Envio, caixas de envio, regra de sugestão, `JanelaDeCotacao`, cotar na
   Proposta, no Pedido (rascunho) e em Ferramentas, Configurações › Envios.
2. **Etiqueta e acompanhamento:** `Envio` completo, comprar, imprimir e cancelar, envio avulso, lista de Envios, rotina do
   worker, custo real no lucro, e-mail automático e botão de WhatsApp.
3. **Reverso e complementos:** código reverso no pedido de compra e no de venda, ferramentas do MCP, envio com problema no
   aviso do Telegram.

Cada fase termina com deploy só depois de o dono testar a anterior.

**O que o dono precisa providenciar**

- Criar o aplicativo no painel do Melhor Envio (Integrações › Área Dev) e a conta no ambiente de teste; as credenciais vão
  no `.env`.
- Gerar a senha de aplicativo do Google para contato@4hobby.com.br.
- Pesar as três caixas e decidir os tamanhos novos (115 produtos não cabem em nenhuma: 68 caberiam numa 30×20×15 e 38 têm
  um lado maior que 30 cm).
- Completar peso e medida dos produtos aos poucos.

## 7. O que fica para o construtor

- Os campos exatos de cada chamada do Melhor Envio (carrinho, pagamento, geração, impressão, cancelamento, reverso), medidos
  no ambiente de teste antes de escrever o provedor.
- Como a declaração de conteúdo do reverso é obtida para mandar ao fornecedor (só existe em produção).
- O encaixe da sugestão de caixa quando há muitos itens pequenos (a regra dos 70% é o ponto de partida; os testes fixam os
  casos).
- O desenho fino das telas, com `frontend-design` e as 10 regras do padrão visual.
- Onde o bloco Envios entra na ordem do menu.

## 8. Decisões tomadas por mim (para o dono conferir)

1. O aviso ao cliente sai na postagem, não na compra da etiqueta (a pergunta ficou sem resposta).
2. Nome das caixas pela medida (`CX 16x11x3`) e pesos estimados de 35, 45 e 70 g.
3. A caixa sugerida usa no máximo 70% do volume interno.
4. O botão "Cotar frete" da Proposta só aparece com frete CIF.
5. O R$ 1,00 de embalagem e os 10% de peso extra são configuração, não número fixo no código.
6. A etiqueta só é comprada com a caixa e o peso marcados como medidos; a cotação estimada não compra.
7. O Rise não grava o rastreio de volta no pedido do Bling (o pedido vai sair do Bling). Entra se o dono pedir.
8. E-mail por SMTP do Google com senha de aplicativo; e-mail de contato exigido pelo Melhor Envio no cabeçalho das chamadas:
   contato@4hobby.com.br.
9. Envios vira um bloco próprio no menu; a cotação rápida fica em Ferramentas e as caixas em Cadastros.
10. O reverso fica na fase 3, porque só pode ser testado em produção.
11. Comprar etiqueta fica atrás da trava `FRETE_COMPRA` e o e-mail atrás de `EMAIL_ENVIO`, as duas fechadas no PC.
