# Condições comerciais no cadastro do cliente (24/11/2026)

Complementa `2026-11-12-propostas-para-cliente-design.md` e substitui os "padrões de proposta" de 13/11/2026.

## Por que

Palavras do dono (23 e 24/11/2026):

- "Não há necessidade de criar padrão de cliente na aba da proposta, pois cada cliente muda mesmo sendo SENAI no exemplo.
  Então acredito que os dados devem ficar no cadastro do cliente junto com suas peculiaridades."
- "Um campo que sugiro é e-mail para envio da NF e envio do rastreio. Também campo para acessar portal do fornecedor"
  (o portal de compras do cliente, onde a 4hobby se cadastra como fornecedora: Portal de Compras FIESC, por exemplo).
- "Eu quero que o Rise entenda na hora de criar a proposta, ele busque as condições do cliente pelo CNPJ. Por exemplo, se o
  CNPJ do SENAI exige pagamento 28 dias, automaticamente a proposta deve se adequar com as condições salvas no cadastro
  daquele cliente."
- "Ao auto-preencher a proposta, os campos devem ficar abertos para modificação."
- Senha do portal: Opção 1 do dono, **cifrada no Rise**.

O que os dados mostram (VPS, 23/11/2026): há 4 padrões (Cliente comum, SENAI, FUNPEC, SENAI SC) e cada um, fora o Cliente
comum, serve a **um cliente só**. O "SENAI" é o de São Bernardo (15 dias da entrega, sem os dias 10/20/30, marca e modelo,
faturamento mínimo); o "SENAI SC" é o de Joinville (28 dias DDL na conta do Portal de Compras FIESC). O padrão virou uma
segunda ficha do cliente, guardada em outra tela.

## Objetivos

1. As condições comerciais do cliente moram no **cadastro do cliente**, numa aba nova **"Condições comerciais"**.
2. Toda proposta que **liga a um cliente** recebe as condições dele sozinha: pela busca, pelo CNPJ digitado, no Salvar e nos
   scripts. **Todos os campos continuam editáveis na proposta**; mudar na proposta não muda o cadastro.
3. **E-mails da NF** (o campo já existe e ninguém usa) passam a ir para o contato do Bling, que emite a nota.
4. **E-mails do rastreio**: o aviso de envio vai para eles antes do e-mail do comprador.
5. **Portal de compras do cliente**: link, usuário, senha (cifrada) e observação.
6. **Contribuinte de ICMS** (contribuinte, isento, não contribuinte), que hoje não tem campo e muda a nota (a FUNPEC é não
   contribuinte).
7. Os padrões de proposta **saem** (tabela, tela, seletor e o campo do cliente).

## Não objetivos

- Não mexe em itens, preços, quantidades, prazo por item, frete cotado (`frete`, `cotacaoDoFrete`) nem vendedor.
- Mudar o cadastro depois **não muda proposta nenhuma** já ligada (nem rascunho): a proposta guarda a própria cópia.
- O Rise não entra no portal do cliente nem preenche nada lá; só guarda o acesso.
- O Rise não envia a nota: põe o e-mail no contato do Bling, e o Bling envia.
- Sem "copiar condições de outro cliente" (ficou de fora; o dono pede se quiser).
- O MCP do Rise continua só leitura e **nunca** devolve a senha do portal.

## Antiobjetivos (seria fracasso mesmo funcionando)

- A senha do portal aparecer em texto aberto em qualquer lugar fora do "Mostrar": tela sem pedir, HTML enviado ao navegador,
  log, Histórico, dump do banco sem cifra, MCP, PDF, link público.
- Uma proposta já enviada (ou o PDF dela) mudar por causa desta migração ou de uma edição no cadastro.
- O operador editar um campo da proposta depois do preenchimento automático e o Salvar seguinte desfazer a edição.
- Um cliente recém-criado pela proposta (sem condições) apagar o que o operador digitou.

## Como funciona hoje (o que muda)

- `EditorProposta.ligarCliente` (busca por nome/CPF/CNPJ no Rise e no Bling) copia o padrão do cliente **só se a proposta
  ainda não tem padrão**, e a transportadora e a 1ª condição preferida **só se o campo está vazio**.
- CNPJ digitado direto no campo CPF/CNPJ: o Salvar (`salvarProposta` → `garantirClienteDaProposta`) acha o cliente no Rise
  ou copia do Bling e liga a proposta, **mas não aplica condição nenhuma**. É o furo que a regra do dono fecha.
- O PDF (`conteudo.js`) liga a coluna Marca/Modelo por `proposta.padrao.exigeMarcaModelo` e mostra o faturamento mínimo
  sempre que a proposta tem **qualquer** padrão (inclusive o "Cliente comum", caso da 2037 da FEESC).
- `enviarClienteAoBling` só **cria** o contato (com `ie`, sem `indicadorIe` nem `emailNotaFiscal`); contato que já existe no
  Bling nunca é atualizado.
- O aviso de rastreio (`frete/envios.js`, `destinatarioDoPedido`) usa `pedido.emailDoComprador || cliente.email`.

## Caminhos considerados

- **Opção 1 (escolhida pelo dono): campos no próprio `Cliente`**. Um lugar só para cada dado; uma função pura monta as
  condições para a tela, o Salvar e os scripts. Custo: migração maior agora.
- Opção 2: manter `PadraoDeProposta`, um por cliente, escondido e editado de dentro do cadastro. Mexe menos no banco, mas o
  mesmo dado continua em dois lugares e a tela de Padrões teria de sumir de qualquer jeito.
- Tabela própria 1:1 (`CondicoesDoCliente`): mesmo resultado na tela, mais um join em toda leitura, sem ganho hoje. Descartada.

## Banco

### `Cliente`: colunas novas

| Grupo | Coluna | Tipo | Observação |
| --- | --- | --- | --- |
| Proposta | `propostaValidadeDias` | `Int?` | vazio = regra geral (15) |
| | `propostaFormaPagamento` | `String?` | uma de `FORMAS_DE_PAGAMENTO` |
| | `propostaPagamentoTexto` | `String?` | texto do PDF depois do resumo do pagamento |
| | `propostaFretePorConta` | `FreteDaProposta?` | vazio = regra geral (A_COMBINAR) |
| | `propostaFreteDiluido` | `Boolean @default(false)` | só vale com CIF |
| | `propostaGarantia` | `String?` | vazio = regra geral ("90 dias") |
| | `propostaAc` | `String?` | o A/C das propostas: nome de um contato do cliente ou texto livre ("Grupo de Compras – FUNPEC"); o `salvarProposta` já liga ao contato quando o nome é igual |
| | `propostaMarcaModelo` | `Boolean @default(false)` | coluna Marca/Modelo no PDF e o "!" do item sem marca |
| | `propostaAssinar` | `Boolean @default(false)` | assinar digitalmente |
| | `propostaFaturamentoMinimo` | `Boolean @default(false)` | linha "Faturamento mínimo" no PDF (valor em `DadosDaEmpresa`) |
| | `propostaObservacoes` | `String?` | observações do PDF |
| | `propostaExigencias` | `String?` | uma por linha; só na tela da proposta, nunca no PDF |
| Fiscal | `indicadorIe` | enum `IndicadorIe?` (`CONTRIBUINTE`, `ISENTO`, `NAO_CONTRIBUINTE`) | igual ao `indicadorIe` do Bling (1, 2, 9) |
| Faturamento | `notaFiscalObservacao` | `String?` | vira o `observacoesNf` da proposta |
| Entrega | `emailsRastreio` | `String[] @default([])` | |
| Portal | `portalUrl` | `String?` | só `http(s)://` |
| | `portalUsuario` | `String?` | |
| | `portalSenhaCifrada` | `String?` | `cifrar({ senha })` de `src/lib/crypto.js` (AES-256-GCM, `ENCRYPTION_KEY`) |
| | `portalObservacao` | `String?` | |

Ficam como estão e passam para a aba nova: `transportadoraId`, `condicoesPreferidas` (a proposta usa a 1ª, como hoje) e
`emailsNotaFiscal`.

**Por que a senha fica numa coluna do cliente e não na `Conexao`:** a `Conexao` é uma por serviço (`servico @unique`) e guarda
as credenciais da própria 4hobby nas integrações. A senha do portal é uma por cliente. Vale a mesma regra do CLAUDE.md (nunca
texto aberto) com a mesma cifra.

**`ieIsento`** continua (o resto do sistema lê) e é gravado pelo `indicadorIe`: `ISENTO` ⇔ `ieIsento = true`. A caixa
"IE isenta" sai da tela.

### `PropostaParaCliente`: colunas novas

- `mostrarMarcaModelo Boolean @default(false)`: o PDF e o "!" passam a ler daqui, não do padrão.
- `mostrarFaturamentoMinimo Boolean @default(false)`: idem.
- `condicoesDoClienteId String?`: o cliente cujas condições já foram aplicadas nesta proposta. É o que impede o Salvar
  seguinte de reaplicar e desfazer as edições do operador.

### Sai

`PropostaParaCliente.padraoId`, `Cliente.padraoPropostaId` e a tabela `PadraoDeProposta`.

### Migration (uma só, SQL, com backup antes como em todo deploy)

1. Cria as colunas e o enum.
2. Propostas existentes (para nenhum PDF mudar): `mostrarMarcaModelo = padrao.exigeMarcaModelo`,
   `mostrarFaturamentoMinimo = (padraoId IS NOT NULL)`, `condicoesDoClienteId = clienteId`.
3. Cada padrão que não é o "Cliente comum" vai para os clientes ligados a ele (`padraoPropostaId`): validade, forma, texto,
   frete, garantia, observações, exigências, `exigeMarcaModelo` → `propostaMarcaModelo`, `assinarDigitalmente` →
   `propostaAssinar`, e `propostaFaturamentoMinimo = true` (era o comportamento de todo cliente com padrão).
4. `indicadorIe` inicial: IE preenchida → `CONTRIBUINTE`; `ieIsento` → `ISENTO`; senão vazio.
5. Apaga `padraoId`, `padraoPropostaId` e `PadraoDeProposta`.

Na VPS isso põe as condições no SENAI São Bernardo, na FUNPEC e no SENAI Joinville. **A FUNPEC fica com o que o padrão
dizia** (30 dias, sem assinatura marcada no padrão); o dono confere na aba nova, porque as 2031-2036 saíram com A/C "Grupo de
Compras – FUNPEC", frete diluído e assinatura.

## Regras puras (`src/lib/propostas/regras.js`)

- `CONDICOES_GERAIS`: validade 15 dias, frete `A_COMBINAR`, garantia "90 dias", textos vazios, caixas desmarcadas. É o
  "Cliente comum" de hoje, que deixa de ser linha do banco.
- `temCondicoes(cliente)`: verdadeiro se o cliente tem **qualquer** coluna `proposta*` preenchida ou marcada. Transportadora e
  condição preferida **não contam**: muitos clientes de hoje só têm uma delas, e contá-las faria a regra geral apagar o que o
  operador já pôs na proposta desses clientes.
- Cliente **sem** condições segue a regra de hoje: transportadora e 1ª condição preferida só preenchem o campo vazio.
- `condicoesDoCliente(cliente, { hoje })`: devolve os campos do formulário da proposta. Todos os campos são devolvidos: o que
  o cliente deixou vazio vem da `CONDICOES_GERAIS` (senão o cliente A deixaria rastro ao trocar para o cliente B).
  **Exceções:** `transportadoraId` e `condicaoPagamentoId` só vêm quando o cliente tem um (costumam sair da cotação do frete).
  Campos: `validadeAte` (hoje + dias), `condicaoPagamentoId`, `formaPagamento`, `pagamentoTexto`, `fretePorConta`,
  `freteDiluido`, `transportadoraId`, `garantia` (pela `garantiaCurta` de hoje), `contatoNome` (o `propostaAc`, com
  `contatoId` vazio para o servidor ligar pelo nome), `observacoesCliente`, `observacoesNf`, `assinarDigitalmente`,
  `mostrarMarcaModelo`, `mostrarFaturamentoMinimo` e `condicoesDoClienteId`.
- `camposDoPadrao` e `pendenciasDoPdf({ exigeMarcaModelo })`: a primeira sai; a segunda passa a receber
  `mostrarMarcaModelo` da proposta.

## Quando as condições entram

**Regra única, na tela e no servidor:** a proposta recebe as condições quando liga a um cliente **diferente** do
`condicoesDoClienteId` dela **e** o cliente `temCondicoes`. Cliente sem condições (recém-criado, por exemplo) só marca o
`condicoesDoClienteId` e não mexe em nada. Depois disso o operador edita à vontade, e nada reaplica enquanto o cliente for o
mesmo.

- **Busca (Rise ou Bling):** `ligarCliente` aplica `condicoesDoCliente` por cima do formulário. O `clienteParaProposta`
  (em `app/propostas/acoes.js`) passa a trazer as colunas `proposta*`, `notaFiscalObservacao`, `transportadoraId` e a 1ª
  condição; **nunca** os campos do portal.
- **CNPJ digitado no campo CPF/CNPJ:** ao sair do campo, com documento válido e sem cliente ligado, a tela procura o cliente
  **no Rise** pelo documento (ação nova, acesso `tela.propostas` ver). Achou: liga como na busca. Não achou: nada muda, e o
  Salvar faz o que faz hoje (Bling ou cadastro novo, que nasce sem condições).
- **Salvar (`salvarProposta`) e scripts:** depois de resolver o `clienteId`, se ele difere do `condicoesDoClienteId` gravado
  **e** do que a entrada mandou, e o cliente `temCondicoes`, o servidor aplica `condicoesDoCliente` sobre os campos
  comerciais da entrada. A tela manda o `condicoesDoClienteId` que já aplicou, então o servidor não reaplica o que a tela fez.
  Script que quer valores diferentes do cadastro salva uma vez (recebe as condições) e salva de novo com o que muda.
- **Desligar o cliente:** os campos ficam como estão e o `condicoesDoClienteId` é limpo.
- Proposta em situação só leitura nunca recebe nada (como hoje).

## Telas

### Cadastro do cliente (`FormularioCliente.jsx`)

Aba nova **"Condições comerciais"**, entre "Contato" e "Adicionais" (`ABA_DO_CAMPO` ganha os campos novos; erro do servidor
leva à aba, como as outras):

```
Proposta
  Validade [30] dias   Condição [28 dias ▾]   Forma [Transferência ▾]
  Texto do pagamento [Faturamento em 28 dias DDL, na conta do Portal FIESC..........]
  Frete [CIF ▾] [x] Diluir no preço   Transportadora [Jadlog ▾]   Garantia [90 dias]
  A/C [Adler Truber ▾ / texto]
  [ ] Marca/Modelo no PDF   [ ] Assinar digitalmente   [ ] Faturamento mínimo no PDF
  Observações no PDF [...]
  Exigências do cliente (só na tela) [...]
Faturamento
  E-mails da NF [....] (+)          Observação padrão da NF [...]
Entrega
  E-mails do rastreio [....] (+)
Portal de compras
  Link [https://...]   Usuário [....]   Senha [•••••• Mostrar · Trocar · Apagar]
  Observação [...]
```

- Saem da aba Adicionais: transportadora, condição preferida e "Padrão de proposta". Sai da aba Contato: e-mails da NF.
- **Contribuinte de ICMS** fica na aba Cadastro, no lugar da caixa "IE isenta", como escolha entre três (`EscolhaDoTipo`).
- O A/C é um campo com sugestões dos contatos do cliente (`datalist`), mas aceita texto livre.
- O servidor confere: validade de 1 a 365 dias, forma dentro de `FORMAS_DE_PAGAMENTO`, link só `http(s)://`, e-mails pelo
  mesmo `lerEmails` dos outros campos de e-mail; e zera o grupo Proposta quando o cliente é salvo sem nada nele.
- Ajuda de campo só pela `BolhaDeAjuda` (regra 2); nada de texto fixo.

### Senha do portal

- O cliente vai ao navegador **sem a senha**; vai só `temSenhaDoPortal: true|false`.
- **Mostrar**: ação nova, exige `tela.cadastros.clientes` editar **e** `dado.pessoalDoCliente` ver, decifra e devolve só a
  senha; grava no Histórico (`registrarAuditoria`) "Viu a senha do portal" com o cliente como alvo, **sem** a senha
  (`antes`/`depois` nulos). A senha some da tela ao fechar ou depois de 30 s.
- **Trocar**: campo `type="password"`; o Salvar cifra e grava. Campo vazio no Salvar = mantém a gravada.
  **Apagar**: zera, com o pop-up de confirmação do padrão do projeto.
- O Histórico do Salvar registra "trocou a senha do portal" sem o valor.
- Decifrar com outra `ENCRYPTION_KEY` (a cópia do banco no PC, se a chave for outra) dá o aviso "Senha gravada com outra
  chave; grave de novo", nunca erro 500.
- `portalUsuario`, `portalUrl`, `portalObservacao`, `emailsRastreio` e `notaFiscalObservacao` entram como dado pessoal em
  `acessos/projecoes.js` (`PESSOAIS_NA_TELA` e `PESSOAIS_GRAVADOS`): quem não vê dado pessoal não vê nem apaga.

### Editor da proposta (`EditorProposta.jsx`, `CartaoCliente.jsx`)

- O seletor de padrão (`seletorDoPadrao`, ao lado do título "Cliente") sai. No lugar, quando `condicoesDoClienteId` é o
  cliente ligado e ele `temCondicoes`, um selo discreto **"Condições do cadastro"** (estado, regra 8), com o `title` "Vieram do
  cadastro do cliente; mudar aqui não muda o cadastro".
- Duas caixas novas, ao lado de "Assinar digitalmente": **"Marca/Modelo no PDF"** e **"Faturamento mínimo no PDF"**. Valem
  para a proposta e começam pelo cadastro.
- O quadro das exigências passa a ler `cliente.propostaExigencias` (ao vivo, não copiado).
- A coluna Marca/Modelo dos itens e o "!" usam `formulario.mostrarMarcaModelo`.

### Saem

`src/app/propostas/padroes/` (a tela), `src/app/propostas/acoes-padroes.js`, `src/components/propostas/PadroesDeProposta.jsx`,
`src/lib/propostas/padroes.js`, `camposDoPadrao`, o `listarPadroes` das páginas de cadastro e de proposta e o link ou cartão
que leva à tela de Padrões.

## PDF e link público (`conteudo.js`)

- `temMarca = proposta.mostrarMarcaModelo`; o faturamento mínimo aparece com `proposta.mostrarFaturamentoMinimo`.
- Com a migration, as propostas de hoje continuam com o mesmo PDF (passo 2).

## Bling

- **Criar contato** (`enviarClienteAoBling`): manda também `indicadorIe` (1, 2 ou 9, quando preenchido) e `emailNotaFiscal`.
- **Contato que já existe** (`blingContatoId` preenchido): quando o Salvar do cadastro muda os e-mails da NF ou o indicador
  de IE, o Rise lê o contato (`GET /contatos/{id}`), troca só esses dois campos e grava (`PUT /contatos/{id}` com o contato
  inteiro, porque o PUT do Bling substitui tudo). Falha do Bling vira aviso âmbar no cadastro, sem perder o Salvar.
- **Nunca medido:** `emailNotaFiscal` e `indicadorIe` só foram LIDOS (estudo de 04/10/2026). O formato de vários e-mails no
  `emailNotaFiscal` (separados por "," ou ";"?) e o PUT de contato não foram medidos. **O 1º envio real é num contato de
  teste (ZZ) com o OK do dono**, e o resultado entra no CLAUDE.md antes de valer para clientes reais.

## Rastreio

`destinatarioDoPedido` (`frete/envios.js`): `email = cliente.emailsRastreio[0] || pedido.emailDoComprador || cliente.email`,
e o `destinatario` (JSON, cópia da hora do envio) ganha `emails` com a lista inteira. O aviso por e-mail
(`avisarCliente` em `frete/aviso.js`) manda a todos de `destinatario.emails` quando há; sem eles, ao `destinatario.email`,
como hoje. Envio já criado não muda.

## Testes

- `teste:propostas`: `condicoesDoCliente` (cheio, vazio → geral, transportadora e condição só quando há, troca de A para B),
  `temCondicoes`; `salvarProposta` aplica ao ligar pela 1ª vez, não reaplica no 2º Salvar, respeita o
  `condicoesDoClienteId` da tela, aplica com o CNPJ achado no Salvar, não aplica com cliente recém-criado; PDF com as duas
  caixas; a página pública sem nada do portal. Os testes dos padrões saem.
- `teste:cadastros`: grava e relê as condições; a senha nunca em texto na linha do banco; vazio mantém, Apagar zera;
  Mostrar com e sem acesso e o Histórico sem a senha; projeção sem dado pessoal; `indicadorIe` ⇔ `ieIsento`.
- `teste:frete`: aviso para os e-mails do rastreio.
- Bling falso: o corpo do POST com `indicadorIe`/`emailNotaFiscal` e o GET+PUT do contato existente.
- `teste:acessos`: o guarda estático de `src/app` com as ações novas.
- `teste:mcp`: `listarClientes` e a leitura da proposta nunca devolvem os campos do portal (o `listarClientes` monta a saída
  campo a campo, então basta a asserção).

## Deixado para quem constrói

- Nome exato das ações novas e onde ficam (`acoes-clientes.js`, `app/propostas/acoes.js`).
- Onde o link para a tela de Padrões aparece hoje (procurar e tirar).
- Se o `clienteParaProposta` lê as colunas por `select` explícito (preferido) ou pela projeção.
- A ordem exata dos campos dentro de cada grupo da aba, seguindo o esboço.
- Atualizar o CLAUDE.md (seção Propostas e a nota da senha por cliente).

## Decisões que tomei e o dono pode mudar

1. As condições sobrescrevem os campos comerciais ao ligar o cliente (com a regra geral no que o cliente deixa vazio), menos
   transportadora e condição, que só entram quando o cliente tem uma.
2. Cliente sem nenhuma condição no grupo Proposta não mexe na proposta (só preenche transportadora e condição vazias, como
   hoje). Transportadora e condição sozinhas não contam como "ter condições".
3. Contribuinte de ICMS na aba Cadastro, no lugar de "IE isenta".
4. A migration leva o padrão como está; a FUNPEC é conferida pelo dono na aba nova.
5. Sem "copiar condições de outro cliente".
6. A senha some da tela 30 s depois de mostrada.
