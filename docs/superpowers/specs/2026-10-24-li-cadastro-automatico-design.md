# Cadastro automático na Loja Integrada (24/10/2026)

## Pedido e porquê

Dono, 24/10/2026: "ao criar esse anúncio na LI, tive que sincronizar o anúncio da LI no Bling por um botão. Não poderíamos
fazer esse processo automático como é feito no ML. Cria anúncio na LI PAUSADO, sincroniza com Bling, após sincronizar com
Bling ativa o anúncio. Caso algum passo fique falho mostra '!'".

Hoje o "Cadastrar na LI" cria o produto inativo e para. O dono precisa clicar em "Ligar à Loja Integrada no Bling" no editor
e depois ativar o produto à mão no painel da LI. No 100108 isso deixou um defeito real (lido em 24/10/2026, 22:20):
o Bling tem 5 unidades e a LI tem o produto ATIVO com o controle de estoque DESLIGADO (`gerenciado: false`, quantidade 0).
Ligar o produto à loja no Bling não faz o Bling mandar o saldo (medido em 07/10/2026: em 10 min nada chegou; só um
movimento de estoque dispara o envio, e ele chega em menos de 1 min). Um produto ativo sem controle de estoque pode
vender mais do que existe.

## Decisões do dono

- **Ativar só depois de o estoque estar na LI** (Opção 1).
- **O Rise grava o estoque na LI UMA vez, no cadastro** (Opção 3): liga o controle de estoque com o saldo do Bling lido
  naquela hora. Daí em diante o Bling é o dono do estoque, como sempre. É uma exceção consciente à regra "o Rise nunca
  escreve `produto_estoque`", limitada a essa etapa.
- **Forma A:** etapas dentro do próprio Cadastrar, no molde do Publicar do ML, com o "!" no ícone e "Continuar o
  cadastro" no editor. Vale também para produto que já está na LI com etapa faltando (o 100108).

## Abordagens consideradas

- **A. Etapas no Cadastrar (escolhida):** um clique faz tudo, cada etapa terminada fica registrada, falha mostra "!" e o
  clique seguinte retoma. O dono vê o resultado na hora.
- **B. Worker completa de hora em hora:** descartada. Escreve na LI e no Bling sem o dono ver e deixa o anúncio pausado
  até 1 h à toa.
- **C. Botões separados:** é o que existe e o que o dono pediu para tirar.

## Como funciona

Etapas, em ordem, cada uma gravada em `Anuncio.dados.cadastroLI.feitas` ao terminar (sem migration: `dados` é JSON):

1. **criar** (o Cadastrar de hoje): busca pelo SKU, `POST /produto` inativo, vínculo no Rise, SEO, preço, fotos.
2. **ligar_bling:** `ligarNoBlingLI` (o botão de hoje). Já ligado com o mesmo id conta como feito; ligado a OUTRO produto
   da LI é falha (o dono corrige no Bling).
3. **estoque:** lê o saldo do produto no Bling na hora (o mesmo `blingSaldo` virtual do resto do Rise; negativo vira 0) e
   grava na LI `produto_estoque` com o controle ligado e essa quantidade. Se a LI já mostra o controle ligado, não escreve
   (o Bling chegou antes) e conta como feito.
4. **ativar:** `PUT /produto/{id}` com o produto inteiro (o mesmo `mesclarCorpoLI`) e `ativo: true`. Relê e confere.
   Saldo 0 ativa mesmo assim: com o controle ligado, a LI mostra esgotado e não vende.
5. **gravar:** `situacaoCanal` ATIVA, `dados.cadastroLI` limpo, o mesmo `gravarSucesso` de hoje.

Regras:
- As travas antes da primeira escrita: `LI_ESCRITA`/`LI_ESCRITA_CODIGOS` e, como a etapa 2 escreve no Bling,
  `BLING_ESCRITA`/`BLING_ESCRITA_CODIGOS`. A recusa vem antes de criar qualquer coisa.
- **Nenhuma escrita repete sozinha.** O clique seguinte ("Continuar o cadastro") começa da etapa que falhou, sem refazer as
  feitas; cada etapa relê antes de escrever (ligar e estoque já conferem o estado).
- **Falha:** o anúncio fica com a etapa e o motivo (`status` ERRO, como hoje). O ícone da LI ganha o "!" com o texto
  "cadastro incompleto: <etapa> falhou (<motivo curto>)", e o editor mostra a faixa com "Continuar o cadastro".
- **Produto já na LI sem as etapas registradas** (cadastrado antes disto, como o 100108): o editor, ao abrir, já lê o
  vínculo no Bling; com a leitura do estoque e do `ativo` da LI, ele oferece "Completar o cadastro" quando falta o vínculo
  no Bling, o controle de estoque ou a ativação. Produto antigo já ativo e com estoque controlado não mostra nada.
- O Sincronizar não muda: continua sem mandar `ativo` nem estoque.

## O que precisa ser medido antes (com o OK do dono, no ZZ-TESTE-BLING, id 404349127)

1. `PUT /produto_estoque/{id}` com `{ gerenciado: true, quantidade: N }`: o formato aceito, se as `situacao_*` precisam
   ir junto, e se o Bling depois continua mandando o saldo (uma entrada de 1 pelo Rise e conferir a LI).
2. `PUT /produto/{id}` com `ativo: true`: se ativa, e se a releitura mostra `ativo: true`.
3. Depois, voltar o produto de teste a inativo.

## Fora

- Desligar ou pausar pela tela, outras lojas, mudar o Sincronizar.
- Corrigir o 100108 agora: o dono decide (o "Completar o cadastro" resolve depois do deploy; antes, um movimento de
  estoque no Bling resolve).

## Para o construtor

Molde: `ml/etapas.js` e `ml/publicar.js` (feitas, retomar, `emAndamento`). Onde mexer: `li/envio.js` (`cadastrarNaLI` vira
as etapas), `li/blingLoja.js` (já pronto), um `li/estoqueInicial.js` novo, `li/estado.js` (o "!" do cadastro incompleto),
`IconeLojaIntegrada.jsx`, o editor da LI (faixa e botão) e a LI falsa (`produto_estoque` e `ativo` no PUT) com o
`teste:li-sync`.
