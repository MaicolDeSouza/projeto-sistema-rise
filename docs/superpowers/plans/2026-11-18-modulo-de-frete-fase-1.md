# Módulo de frete, fase 1 (cotação) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Rise cota frete no Melhor Envio com a caixa sugerida, na Proposta, no Pedido de venda e em Ferramentas, sem gastar nada.

**Architecture:** Regras puras em `src/lib/frete/regras.js`; o Melhor Envio entra como conector (`src/lib/integracoes/melhorenvio.js`, OAuth) e como provedor de frete atrás de uma interface única (`src/lib/frete/provedores/`). As telas falam só com `src/lib/frete/cotacao.js` por um componente único (`CotadorDeFrete`, embrulhado pela `JanelaDeCotacao`). A tabela `Envio` nasce inteira nesta fase, mas só o status `RASCUNHO` é usado.

**Tech Stack:** Next.js (ler `node_modules/next/dist/docs/` antes de escrever rota ou action), JavaScript sem TypeScript, Prisma 7 + PostgreSQL 17, testes em `scripts/teste-*.js` com `conferir(nome, obtido, esperado)`.

**Spec:** `docs/superpowers/specs/2026-11-18-modulo-de-frete-design.md` (aprovada pelo dono em 18/11/2026). Este plano cobre a fase 1 da seção 6; as fases 2 (etiqueta e acompanhamento) e 3 (reverso) ganham plano próprio.

**Execução:** inline, na `main`, sem subagentes (preferência do dono). Commit só dos arquivos de cada tarefa (`git commit -- caminhos`). Sem push e sem deploy até o dono pedir.

## Global Constraints

- Interface e código em português; identificadores e comentários sem acento; **texto de tela com acento**.
- Comentário explica o porquê, não o quê.
- Padrão visual das 10 regras do `CLAUDE.md`: uma ação principal por tela, ajuda na `BolhaDeAjuda`, recusa vira botão desabilitado com o motivo no `title`, janela com `role="dialog"` e `{...propsDoFundo(fechar)}`.
- Tabela nova nasce com `CabecalhoOrdenavel`.
- Acesso conferido no servidor em toda página (`exigirAcessoNaPagina`) e em toda action.
- Nenhuma escrita em API externa nesta fase. A trava `FRETE_COMPRA` (padrão `false`) já entra em `config.travas` e em `exigirTravaLiberada`, para a fase 2.
- Valores da spec, copiados: acréscimo de embalagem **R$ 1,00**; peso extra **10%**; ocupação máxima da caixa **70%** do volume interno; medida interna ausente = externa **menos 0,5 cm** por lado; caixas `CX 16x11x3` (35 g), `CX 16x11x6` (45 g), `CX 19x12x12` (70 g).
- Origem da cotação = CEP de `DadosDaEmpresa` (`lerDadosDaEmpresa()` em `src/lib/compras/empresa.js`).
- Melhor Envio: produção `https://melhorenvio.com.br`, teste `https://sandbox.melhorenvio.com.br`; `User-Agent` obrigatório com nome do aplicativo e e-mail de contato (contato@4hobby.com.br, vindo do `.env`).
- Testes sem rede: o Melhor Envio é um servidor falso local; só escrevem `ZZ-FRETE-*` e `CX ZZ*`, apagados no começo e no fim, e devolvem a linha `ConfigDeFrete` do dono.
- Nenhuma credencial em arquivo versionado nem em mensagem.

## Review Focus

1. **Produto ou kit sem peso ou sem medida** (418 de 1.320 hoje): a sugestão não sai, a tela diz quantos itens estão incompletos e o operador segue escolhendo a caixa e digitando o peso. Teste na Tarefa 1 (`sugerirCaixa`, `pesoDoPacote`) e na Tarefa 5 (`pacoteSugerido`).
2. **Melhor Envio não conectado, token vencido ou fora do ar**: o cotador mostra a mensagem e o link de Integrações; a página da proposta e do pedido abre normalmente. Teste na Tarefa 5 (`cotarFrete` devolve `{ ok: false, erro }`, nunca lança).
3. **CEP que o provedor recusa** (formato certo, CEP inexistente; medido em 18/11/2026: HTTP 422 `{"errors":{"postal_code":[...]}}`): mensagem "CEP de destino não encontrado", sem derrubar a janela. Teste na Tarefa 4.
4. **Nenhum serviço atende** (pacote grande, valor declarado alto): lista vazia com a linha "Nenhum serviço atende este envio" e os motivos ao abrir. Teste na Tarefa 1 (`separarServicos` com todos recusados) e conferência na tela na Tarefa 7.
5. **Número digitado à brasileira** ("0,3", "1.250,00", campo vazio, zero, negativo) em peso, medidas e valor: lido como decimal; inválido vira erro no campo, não `NaN` na chamada. Teste na Tarefa 5 (`validarPedidoDeCotacao`).

---

### Task 1: Regras puras do frete

**Files:**
- Create: `src/lib/frete/regras.js`
- Create: `scripts/teste-frete.js`
- Modify: `package.json` (script `"teste:frete": "node scripts/teste-frete.js"`)

**Interfaces:**
- Produces (todas exportadas de `regras.js`, sem banco e sem rede):
  - `FATOR_DE_OCUPACAO = 0.7`, `FOLGA_INTERNA_CM = 0.5`
  - `nomeDaCaixa({ comprimentoCm, larguraCm, alturaCm }) -> string`
  - `medidasInternas(caixa) -> { comprimentoCm, larguraCm, alturaCm }`
  - `itensIncompletos(itens) -> number` (item sem `pesoKg` > 0 ou sem as três medidas > 0)
  - `pesoDoPacote({ itens, caixa, percentualDePesoExtra }) -> number | null` (kg com 3 casas, arredondado para cima no grama; `null` com item sem peso)
  - `sugerirCaixa({ itens, caixas }) -> { caixa: object | null, motivo: null | "ITENS_INCOMPLETOS" | "NAO_CABE" }`
  - `valorACobrar(preco, acrescimo) -> number` (2 casas)
  - `separarServicos(lista, acrescimo) -> { atendem, recusados }` (`atendem` por `preco` crescente, cada um com `valorACobrar`; `recusados` = os com `motivoDaRecusa`)
  - `textoDaCotacao({ cidadeDestino, servicos }) -> string` (título e uma linha por serviço: `Correios SEDEX: R$ 29,85, 2 dias úteis`)
  - `lerDecimal(texto) -> number | null` (aceita "0,3", "1.250,00", "0.3"; vazio, negativo e texto = `null`)
- Formato do item: `{ pesoKg, alturaCm, larguraCm, comprimentoCm, quantidade }`. Formato da caixa: o da tabela `CaixaDeEnvio` (Tarefa 2), com números.

- [ ] **Step 1: Escrever `scripts/teste-frete.js` com o cabeçalho de `scripts/teste-compras.js`** (dotenv, `register` do `resolver-alias.js`, `conferir`, `process.exit(falhas ? 1 : 0)`) e a seção "Regras do frete":

```js
const CX3 = { nome: "CX 16x11x3", comprimentoCm: 16, larguraCm: 11, alturaCm: 3, pesoVazioKg: 0.035, ativo: true };
const CX6 = { nome: "CX 16x11x6", comprimentoCm: 16, larguraCm: 11, alturaCm: 6, pesoVazioKg: 0.045, ativo: true };
const CX12 = { nome: "CX 19x12x12", comprimentoCm: 19, larguraCm: 12, alturaCm: 12, pesoVazioKg: 0.07, ativo: true };
const CAIXAS = [CX12, CX3, CX6]; // fora de ordem de proposito
const lcd = { pesoKg: 0.055, alturaCm: 2, larguraCm: 8, comprimentoCm: 6, quantidade: 1 };
const rele = { pesoKg: 0.096, alturaCm: 7.4, larguraCm: 10.6, comprimentoCm: 13.7, quantidade: 1 };

conferir("nome inteiro", nomeDaCaixa(CX3), "CX 16x11x3");
conferir("nome com casa decimal", nomeDaCaixa({ comprimentoCm: 16.5, larguraCm: 11, alturaCm: 3 }), "CX 16,5x11x3");
conferir("interna pela folga", medidasInternas(CX3), { comprimentoCm: 15.5, larguraCm: 10.5, alturaCm: 2.5 });
conferir("interna informada vence", medidasInternas({ ...CX3, comprimentoInternoCm: 15.8, larguraInternaCm: 10.8, alturaInternaCm: 2.8 }), { comprimentoCm: 15.8, larguraCm: 10.8, alturaCm: 2.8 });
conferir("peso: (itens + caixa) x 1,10", pesoDoPacote({ itens: [{ ...lcd, quantidade: 2 }, { pesoKg: 0.005, quantidade: 1 }], caixa: CX3, percentualDePesoExtra: 10 }), 0.165);
conferir("peso sobe no grama", pesoDoPacote({ itens: [{ pesoKg: 0.0101, quantidade: 1 }], caixa: CX3, percentualDePesoExtra: 10 }), 0.05);
conferir("peso com item sem peso", pesoDoPacote({ itens: [{ pesoKg: null, quantidade: 1 }], caixa: CX3, percentualDePesoExtra: 10 }), null);
conferir("incompletos", itensIncompletos([lcd, { ...lcd, alturaCm: null }, { ...lcd, pesoKg: 0 }]), 2);
conferir("menor caixa que serve", sugerirCaixa({ itens: [lcd], caixas: CAIXAS }).caixa?.nome, "CX 16x11x3");
conferir("item alto pula para a grande", sugerirCaixa({ itens: [rele], caixas: CAIXAS }).caixa?.nome, "CX 19x12x12");
conferir("volume acima de 70% sobe de caixa", sugerirCaixa({ itens: [{ ...lcd, quantidade: 3 }], caixas: CAIXAS }).caixa?.nome, "CX 16x11x6");
conferir("nao cabe", sugerirCaixa({ itens: [{ ...lcd, comprimentoCm: 35 }], caixas: CAIXAS }), { caixa: null, motivo: "NAO_CABE" });
conferir("incompleto nao sugere", sugerirCaixa({ itens: [{ ...lcd, larguraCm: null }], caixas: CAIXAS }), { caixa: null, motivo: "ITENS_INCOMPLETOS" });
conferir("caixa inativa fica de fora", sugerirCaixa({ itens: [lcd], caixas: [{ ...CX3, ativo: false }, CX6] }).caixa?.nome, "CX 16x11x6");
conferir("cobrar", [valorACobrar(28.85, 1), valorACobrar(10.57, 1.5)], [29.85, 12.07]);
const lista = [
  { servicoId: "2", servicoNome: "SEDEX", transportadora: "Correios", preco: 28.85, prazoDias: 2, motivoDaRecusa: null },
  { servicoId: "1", servicoNome: "PAC", transportadora: "Correios", preco: 18.4, prazoDias: 6, motivoDaRecusa: null },
  { servicoId: "12", servicoNome: "éFácil", transportadora: "LATAM Cargo", preco: null, prazoDias: null, motivoDaRecusa: "Transportadora não atende este trecho." },
];
conferir("separa e ordena", separarServicos(lista, 1).atendem.map((s) => [s.servicoNome, s.valorACobrar]), [["PAC", 19.4], ["SEDEX", 29.85]]);
conferir("recusados", separarServicos(lista, 1).recusados.length, 1);
conferir("todos recusados", separarServicos([lista[2]], 1), { atendem: [], recusados: [lista[2]] });
conferir("texto", textoDaCotacao({ cidadeDestino: "São Paulo (SP)", servicos: separarServicos(lista, 1).atendem }), "Frete para São Paulo (SP):\nCorreios PAC: R$ 19,40, 6 dias úteis\nCorreios SEDEX: R$ 29,85, 2 dias úteis");
conferir("decimal", [lerDecimal("0,3"), lerDecimal("1.250,00"), lerDecimal("0.3"), lerDecimal(""), lerDecimal("-1"), lerDecimal("abc")], [0.3, 1250, 0.3, null, null, null]);
```

O terceiro `lcd` (volume 3 × 96 = 288 cm³) passa de 70% da CX 16x11x3 (284,8 cm³): é o caso que prova o fator.

- [ ] **Step 2: Rodar e ver falhar.** `npm run teste:frete` → falha no import (`regras.js` não existe).
- [ ] **Step 3: Implementar `src/lib/frete/regras.js`** com as assinaturas acima. `sugerirCaixa` ordena as caixas ativas pelo volume interno crescente; um item cabe quando as três medidas dele, ordenadas, são menores ou iguais às três internas ordenadas; a soma `altura × largura × comprimento × quantidade` não passa de `FATOR_DE_OCUPACAO` do volume interno. "1 dia útil" no singular em `textoDaCotacao`. Em `pesoDoPacote` e `valorACobrar`, arredondar para 6 casas antes do arredondamento final: em ponto flutuante 0,15 × 1,1 dá 0,16500000000000004, e subir no grama direto devolveria 0,166.
- [ ] **Step 4: Rodar e ver passar.** `npm run teste:frete` → todas `ok`, saída 0.
- [ ] **Step 5: Commit.** `git commit -m "Frete: regras puras de caixa, peso e valor a cobrar" -- src/lib/frete/regras.js scripts/teste-frete.js package.json`

---

### Task 2: Banco (caixas, configuração, envio) e a gravação

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261118b_frete_fase_1/migration.sql`
- Create: `src/lib/frete/caixas.js`, `src/lib/frete/configuracao.js`
- Test: `scripts/teste-frete.js` (seção "Banco")

**Interfaces:**
- Schema (nomes exatos da spec 5.1):
  - `enum Servico` ganha `MELHOR_ENVIO`.
  - `model CaixaDeEnvio { id, nome @unique, comprimentoCm, larguraCm, alturaCm (Decimal 10,2), comprimentoInternoCm?, larguraInternaCm?, alturaInternaCm?, pesoVazioKg (Decimal 10,3), ativo @default(true), criadoEm, atualizadoEm }`
  - `model ConfigDeFrete { id @id (sempre "frete"), acrescimoDeEmbalagem Decimal(12,2) @default(1), percentualDePesoExtra Decimal(5,2) @default(10), momentoDoAviso String @default("POSTADO"), assuntoDoEmail String?, textoDoEmail String?, textoDoWhatsapp String?, formatoDeImpressao String?, atualizadoEm }`
  - `enum DirecaoDoEnvio { IDA REVERSO }`, `enum ProvedorDeFrete { MELHOR_ENVIO }`, `enum StatusDoEnvioRise { RASCUNHO A_POSTAR POSTADO ENTREGUE NAO_ENTREGUE COM_PROBLEMA CANCELADO EXPIRADO }` (o nome `StatusDoEnvio` pode já existir nos Pedidos: conferir com Grep antes e manter este).
  - `model Envio` com todos os campos da spec 5.1; `pedidoDeVendaId`, `propostaId`, `pedidoDeCompraId` opcionais com `onDelete: SetNull` e índice em cada um; `numero Int @unique`.
  - `PropostaParaCliente.cotacaoDoFrete Json?`.
- A migration semeia as três caixas e a linha `ConfigDeFrete` (`ON CONFLICT DO NOTHING`).
- Produces:
  - `caixas.js`: `listarCaixas({ soAtivas = false } = {}) -> Promise<Caixa[]>` (Decimal já convertido em número, ordenadas pelo volume externo), `salvarCaixa(entrada, id?) -> Promise<{ ok: true, caixa } | { ok: false, erros }>` (o nome é sempre `nomeDaCaixa` das medidas, nunca digitado; recusa medidas repetidas com `erros.medidas`), `excluirCaixa(id) -> Promise<{ ok: true } | { ok: false, erro }>` (com envio apontando para ela, só desativa e diz isso)
  - `configuracao.js`: `lerConfigDeFrete() -> Promise<{ acrescimoDeEmbalagem: number, percentualDePesoExtra: number, ... }>` (cria a linha com os padrões se faltar), `salvarConfigDeFrete(entrada) -> Promise<{ ok: true } | { ok: false, erros }>` (acréscimo de 0 a 100; percentual de 0 a 100)

- [ ] **Step 1: Teste da seção "Banco"** em `scripts/teste-frete.js` (apaga `CX ZZ*` antes e depois; guarda e devolve a `ConfigDeFrete`):

```js
const nomes = (await listarCaixas()).map((c) => c.nome);
conferir("semeadas", ["CX 16x11x3", "CX 16x11x6", "CX 19x12x12"].every((nome) => nomes.includes(nome)), true);
conferir("ordenadas pelo volume", nomes.indexOf("CX 16x11x3") < nomes.indexOf("CX 16x11x6") && nomes.indexOf("CX 16x11x6") < nomes.indexOf("CX 19x12x12"), true);
const nova = await salvarCaixa({ comprimentoCm: "99", larguraCm: "98,5", alturaCm: "97", pesoVazioKg: "0,2" });
conferir("cria com o nome das medidas", [nova.ok, nova.caixa?.nome, nova.caixa?.pesoVazioKg], [true, "CX 99x98,5x97", 0.2]);
conferir("medidas repetidas", (await salvarCaixa({ comprimentoCm: "99", larguraCm: "98,5", alturaCm: "97", pesoVazioKg: "0,2" })).ok, false);
conferir("medida zero", "comprimentoCm" in ((await salvarCaixa({ comprimentoCm: "0", larguraCm: "10", alturaCm: "10", pesoVazioKg: "0,1" })).erros ?? {}), true);
conferir("interna maior que a externa", "comprimentoInternoCm" in ((await salvarCaixa({ comprimentoCm: "96", larguraCm: "95", alturaCm: "94", pesoVazioKg: "0,1", comprimentoInternoCm: "97" })).erros ?? {}), true);
conferir("so ativas", (await listarCaixas({ soAtivas: true })).every((c) => c.ativo), true);
conferir("exclui a sem uso", (await excluirCaixa(nova.caixa.id)).ok, true);
conferir("config padrao", [(await lerConfigDeFrete()).acrescimoDeEmbalagem, (await lerConfigDeFrete()).percentualDePesoExtra], [1, 10]);
conferir("config invalida", (await salvarConfigDeFrete({ acrescimoDeEmbalagem: "-1", percentualDePesoExtra: "10" })).ok, false);
conferir("config salva", [(await salvarConfigDeFrete({ acrescimoDeEmbalagem: "1,50", percentualDePesoExtra: "12" })).ok, (await lerConfigDeFrete()).acrescimoDeEmbalagem], [true, 1.5]);
```

- [ ] **Step 2: Rodar e ver falhar** (`listarCaixas` não existe).
- [ ] **Step 3: Editar o schema e gerar a migration** com `npx prisma migrate dev --name frete_fase_1 --create-only`, renomear a pasta para `20261118b_frete_fase_1`, **tirar do SQL os `DROP INDEX` dos índices feitos à mão** (busca ampla e `Job_fonte_aberta`: ver `CLAUDE.md`), acrescentar os `INSERT` da semeadura e aplicar (`npx prisma migrate dev`).
- [ ] **Step 4: Implementar `caixas.js` e `configuracao.js`** com as assinaturas acima; números lidos com `lerDecimal` da Tarefa 1.
- [ ] **Step 5: Rodar e ver passar.** `npm run teste:frete`.
- [ ] **Step 6: Commit.** `git commit -m "Frete: tabelas de caixa de envio, configuracao e envio" -- prisma/schema.prisma prisma/migrations/20261118b_frete_fase_1 src/lib/frete/caixas.js src/lib/frete/configuracao.js scripts/teste-frete.js`

---

### Task 3: Conector do Melhor Envio (OAuth e leitura)

**Files:**
- Create: `src/lib/integracoes/melhorenvio.js`
- Modify: `src/lib/integracoes/config.js`, `src/lib/integracoes/registro.js`
- Modify: `src/app/api/oauth/[servico]/iniciar/route.js`, `src/app/api/oauth/[servico]/callback/route.js` (`APELIDOS` ganha `melhorenvio: "MELHOR_ENVIO"`)
- Create: `scripts/fixtures/frete/calculate-sp.json`, `scripts/fixtures/frete/calculate-cep-invalido.json`
- Test: `scripts/teste-frete.js` (seção "Conector", com servidor falso em `node:http`)

**Interfaces:**
- `config.melhorEnvio = { clientId, clientSecret, redirectUri, sandbox, contato, urlBase }` lidos de `MELHOR_ENVIO_CLIENT_ID`, `MELHOR_ENVIO_CLIENT_SECRET`, `MELHOR_ENVIO_REDIRECT_URI` (padrão `https://localhost:3000/api/oauth/melhorenvio/callback`), `MELHOR_ENVIO_SANDBOX` (padrão `true`), `MELHOR_ENVIO_CONTATO`, `MELHOR_ENVIO_URL` (só o teste usa; vazio = `https://sandbox.melhorenvio.com.br` com sandbox, senão `https://melhorenvio.com.br`).
- `config.travas.freteCompra = lerBooleano("FRETE_COMPRA")`; `exigirTravaLiberada` ganha `MELHOR_ENVIO: ["freteCompra", "FRETE_COMPRA"]`.
- Produces (de `melhorenvio.js`, no molde de `mercadolivre.js`):
  - `iniciarAutorizacao(state) -> string`, `concluirAutorizacao(code) -> Promise<string>`, `obterAccessToken() -> Promise<string>` (renova com 5 dias de margem; o token de acesso dura 30 dias e o de renovação 45)
  - `meGet(caminho, params) -> Promise<{ ok, status, dados, duracaoMs }>`
  - `meLer(caminho, corpo) -> Promise<{ ok, status, dados, duracaoMs }>`: POST **de leitura** (a cotação é POST), sem trava
  - `mePost(caminho, corpo)`: POST de escrita, `exigirTravaLiberada("MELHOR_ENVIO")` e uma tentativa só (fase 2 usa; nesta fase só o teste da trava)
  - `testar() -> Promise<{ ok, latenciaMs, conta?, detalhe?, erro? }>` (conta e saldo)
  - `conector` com `id: "MELHOR_ENVIO"`, `nome: "Melhor Envio"`, `descricao: "Frete — cotação, etiqueta e rastreio"`, `tipoAuth: "oauth2"`, `configurado`, `faltando` (inclui `MELHOR_ENVIO_CONTATO`), `painel: { url: "https://melhorenvio.com.br/painel/gerenciar/tokens", rotulo: "Link configuração API" }`
- Todo pedido leva `Accept: application/json` e `User-Agent: Rise 4hobby (<contato>)`.

- [ ] **Step 1: Medir antes de escrever.** Ler `docs.melhorenvio.com.br` (autenticação e cálculo de fretes) e anotar no comentário do topo de `melhorenvio.js`: endereço de autorização e de token, nomes exatos dos escopos (pedir já os de carrinho, pagamento, geração, impressão, rastreio e cancelamento, para a fase 2 não exigir reconectar), e o corpo exato de `POST /api/v2/me/shipment/calculate` para um pacote. Montar as duas fixtures com o formato da resposta medido em 18/11/2026 na calculadora pública: lista de `{ id, name, price, custom_price, delivery_time, custom_delivery_time, company: { id, name }, error? }`; serviço recusado traz só `id`, `name`, `company` e `error`. A de CEP inválido é `{"errors":{"postal_code":["O campo cep_origem está invalido"]},"message":"The given data was invalid."}` com HTTP 422.
- [ ] **Step 2: Teste da seção "Conector"** contra o servidor falso (sobe em porta livre, `MELHOR_ENVIO_URL` aponta para ele antes do import):

```js
conferir("autorizar leva client_id, redirect, state e escopos", ["client_id=", "redirect_uri=", "state=abc", "scope="].every((p) => iniciarAutorizacao("abc").includes(p)), true);
await concluirAutorizacao("codigo-de-teste");
conferir("token guardado cifrado", [(await lerConexao("MELHOR_ENVIO")).status, Boolean((await lerSegredo("MELHOR_ENVIO")).refreshToken)], ["CONECTADO", true]);
await meGet("/api/v2/me");
conferir("user-agent com o contato", falso.ultimoPedido.headers["user-agent"], "Rise 4hobby (zz-frete@exemplo.test)");
conferir("bearer", falso.ultimoPedido.headers.authorization, "Bearer acesso-1");
// vence o token: expiraEm para daqui a 2 dias
conferir("renova com menos de 5 dias", [await obterAccessToken(), falso.pedidosDeToken], ["acesso-2", 2]);
conferir("cotacao e leitura: passa com a trava fechada", (await meLer("/api/v2/me/shipment/calculate", {})).ok, true);
let barrou = null;
try { await mePost("/api/v2/me/cart", {}); } catch (erro) { barrou = erro.message; }
conferir("escrita barrada pela trava", [/FRETE_COMPRA/.test(barrou ?? ""), falso.pedidosDeCarrinho], [true, 0]);
conferir("testar", [(await testar()).ok, /saldo/i.test((await testar()).detalhe ?? "")], [true, true]);
```

O teste guarda e devolve a `Conexao` `MELHOR_ENVIO` do dono (como o `teste:telegram` faz com a dele).

- [ ] **Step 3: Rodar e ver falhar.**
- [ ] **Step 4: Implementar** `config.js`, `melhorenvio.js`, a linha em `registro.js` e os `APELIDOS` das duas rotas. A renovação usa `travaDeRenovacao.js` como o Bling (o token de renovação é de uso único).
- [ ] **Step 5: Rodar e ver passar.** `npm run teste:frete` e `npm run teste:saude` (a Saúde lista as integrações: se a lista for fechada, incluir `MELHOR_ENVIO` e ajustar a asserção).
- [ ] **Step 6: Commit.** `git commit -m "Frete: conector do Melhor Envio (OAuth, leitura e trava de compra)" -- src/lib/integracoes src/app/api/oauth scripts/fixtures/frete scripts/teste-frete.js` (mais os arquivos da Saúde, se mudaram).

---

### Task 4: Provedor de frete e o registro

**Files:**
- Create: `src/lib/frete/provedores/registro.js`, `src/lib/frete/provedores/melhorEnvio.js`
- Test: `scripts/teste-frete.js` (seção "Provedor")

**Interfaces:**
- Consumes: `meLer` da Tarefa 3.
- Produces:
  - `registro.js`: `provedores` (lista), `obterProvedor(id) -> provedor | null`, `PROVEDOR_PADRAO = "MELHOR_ENVIO"`
  - Forma de todo provedor (a interface da spec 5.2): `{ id, nome, capacidades: { reverso, formatosDeImpressao, declaracaoDeConteudo }, cotar, comprar, imprimir, rastrear, cancelar, saldo, gerarReverso }`. Nesta fase `melhorEnvio.js` implementa `cotar` e `saldo`; os outros lançam `Error("Disponível na fase 2 do módulo de frete.")`.
  - `cotar({ origem: { cep }, destino: { cep }, pacote: { pesoKg, comprimentoCm, larguraCm, alturaCm }, valorDeclarado }) -> Promise<Servico[]>`, com `Servico = { servicoId: string, servicoNome, transportadora, preco: number | null, prazoDias: number | null, motivoDaRecusa: string | null }`. Usa `custom_price` e `custom_delivery_time`.
  - Erro do provedor vira `ErroDoProvedor` (exportado de `registro.js`) com `codigo`: `"CEP_INVALIDO"`, `"NAO_CONECTADO"`, `"FORA_DO_AR"` ou `"RECUSADO"`, e `message` pronta para a tela.

- [ ] **Step 1: Teste da seção "Provedor"** com as fixtures da Tarefa 3:

```js
const servicos = await obterProvedor("MELHOR_ENVIO").cotar({ origem: { cep: "95090970" }, destino: { cep: "01001000" }, pacote: { pesoKg: 0.3, comprimentoCm: 16, larguraCm: 11, alturaCm: 3 }, valorDeclarado: 24.85 });
conferir("mapeia o servico", servicos.find((s) => s.servicoNome === "SEDEX"), { servicoId: "2", servicoNome: "SEDEX", transportadora: "Correios", preco: 28.85, prazoDias: 2, motivoDaRecusa: null });
conferir("recusado traz o motivo", servicos.find((s) => s.transportadora === "Buslog")?.motivoDaRecusa, "Transportadora não atende este trecho.");
conferir("manda so digitos e numeros", [falso.ultimoCorpo.from.postal_code, falso.ultimoCorpo.to.postal_code], ["95090970", "01001000"]);
const erroDe = async (preparar) => { preparar(); try { await obterProvedor("MELHOR_ENVIO").cotar(PEDIDO); return null; } catch (erro) { return [erro.name, erro.codigo]; } };
conferir("422 de CEP", await erroDe(() => falso.responderCom(422, CEP_INVALIDO)), ["ErroDoProvedor", "CEP_INVALIDO"]);
conferir("fora do ar", await erroDe(() => falso.responderCom(503, "")), ["ErroDoProvedor", "FORA_DO_AR"]);
conferir("401", await erroDe(() => falso.responderCom(401, { message: "Unauthenticated." })), ["ErroDoProvedor", "NAO_CONECTADO"]);
conferir("fase 2 ainda nao", await obterProvedor("MELHOR_ENVIO").comprar({}).catch((e) => e.message), "Disponível na fase 2 do módulo de frete.");
conferir("provedor desconhecido", obterProvedor("XPTO"), null);
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** os dois arquivos. Nada fora de `provedores/melhorEnvio.js` e de `integracoes/melhorenvio.js` conhece campo ou status do Melhor Envio.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit.** `git commit -m "Frete: provedor trocavel e a cotacao pelo Melhor Envio" -- src/lib/frete/provedores scripts/teste-frete.js`

---

### Task 5: Serviço de cotação e pacote sugerido

**Files:**
- Create: `src/lib/frete/cotacao.js`
- Create: `src/app/frete/acoes.js`
- Modify: `src/lib/acessos/recursos.js` (recursos novos, ver abaixo)
- Test: `scripts/teste-frete.js` (seção "Cotação"); `npm run teste:acessos`

**Interfaces:**
- Consumes: `regras.js`, `caixas.js`, `configuracao.js`, `provedores/registro.js`, `lerDadosDaEmpresa()`.
- Produces (de `cotacao.js`):
  - `validarPedidoDeCotacao(entrada) -> { ok: true, pedido } | { ok: false, erros }`; `entrada = { cepDestino, caixaId?, comprimentoCm?, larguraCm?, alturaCm?, pesoKg, valorDeclarado }` em texto; CEP com 8 dígitos; com `caixaId` as medidas vêm da caixa
  - `pacoteSugerido(itens) -> Promise<{ caixaId: string | null, motivo, pesoKg: number | null, incompletos: number, valorDeclarado: number }>`; `itens = [{ produtoId, quantidade, valorUnitario }]`; lê peso e medidas de `Produto` (kit: os do próprio kit; sem eles, a soma das peças)
  - `cotarFrete(entrada) -> Promise<{ ok: true, origemCep, cotadoEm, pacote, atendem, recusados } | { ok: false, erros?, erro?, codigo? }>`: nunca lança
- Recursos novos em `recursos.js`: `sub("tela.cadastros.caixasDeEnvio", "Cadastros › Caixas de envio", "tela.cadastros")`, `sub("tela.ferramentas.frete", "Ferramentas › Cotar frete", "tela.ferramentas")`, `sub("tela.configuracoes.envios", "Configurações › Envios", "tela.configuracoes")`.
- Actions (de `src/app/frete/acoes.js`, `"use server"`): `cotarFreteAcao(entrada)` e `pacoteSugeridoAcao(itens)`. Passa quem tem `ver` em `tela.propostas`, `tela.pedidos` ou `tela.ferramentas.frete`; os outros recebem `{ ok: false, erro: "Sem acesso." }`.

- [ ] **Step 1: Teste da seção "Cotação"** (produtos `ZZ-FRETE-1` com peso e medidas, `ZZ-FRETE-2` sem peso, kit `ZZ-FRETE-K` sem medidas próprias e com duas peças):

```js
conferir("valida CEP", "cepDestino" in validarPedidoDeCotacao({ cepDestino: "123", pesoKg: "0,3", valorDeclarado: "10", caixaId: cx3.id }).erros, true);
conferir("valida peso", "pesoKg" in validarPedidoDeCotacao({ cepDestino: "01001-000", pesoKg: "0", valorDeclarado: "10", caixaId: cx3.id }).erros, true);
conferir("sem caixa exige medidas", "comprimentoCm" in validarPedidoDeCotacao({ cepDestino: "01001000", pesoKg: "0,3", valorDeclarado: "10" }).erros, true);
conferir("aceita a brasileira", validarPedidoDeCotacao({ cepDestino: "01001-000", pesoKg: "0,3", valorDeclarado: "1.250,00", comprimentoCm: "16", larguraCm: "11", alturaCm: "3" }).pedido, { cepDestino: "01001000", pesoKg: 0.3, valorDeclarado: 1250, comprimentoCm: 16, larguraCm: 11, alturaCm: 3, caixaId: null });
conferir("sugere pelo produto", await pacoteSugerido([{ produtoId: p1.id, quantidade: 2, valorUnitario: 24.85 }]), { caixaId: cx3.id, motivo: null, pesoKg: 0.16, incompletos: 0, valorDeclarado: 49.7 });
conferir("produto sem peso", await pacoteSugerido([{ produtoId: p2.id, quantidade: 1, valorUnitario: 5 }]), { caixaId: null, motivo: "ITENS_INCOMPLETOS", pesoKg: null, incompletos: 1, valorDeclarado: 5 });
conferir("kit pelas pecas", (await pacoteSugerido([{ produtoId: kit.id, quantidade: 1, valorUnitario: 30 }])).incompletos, 0);
const boa = await cotarFrete({ cepDestino: "01001000", caixaId: cx3.id, pesoKg: "0,3", valorDeclarado: "24,85" });
conferir("cota com a origem da empresa e o acrescimo", [boa.ok, boa.origemCep.length, boa.atendem[0].valorACobrar - boa.atendem[0].preco], [true, 8, 1]);
falso.responderCom(503, "");
conferir("provedor fora do ar nao lanca", await cotarFrete({ cepDestino: "01001000", caixaId: cx3.id, pesoKg: "0,3", valorDeclarado: "24,85" }), { ok: false, codigo: "FORA_DO_AR", erro: "O Melhor Envio não respondeu. Tente de novo em instantes." });
```

O `ZZ-FRETE-1` tem 0,055 kg e 2 × 8 × 6 cm: (2 × 0,055 + 0,035) × 1,10 = 0,1595, que sobe para 0,16.

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `cotacao.js`, as actions e os três recursos. Mensagens por código: `NAO_CONECTADO` → "O Melhor Envio não está conectado. Conecte em Configurações › Integrações."; `CEP_INVALIDO` → "CEP de destino não encontrado."; `FORA_DO_AR` → a do teste; `RECUSADO` → o texto do provedor.
- [ ] **Step 4: Rodar e ver passar.** `npm run teste:frete` e `npm run teste:acessos` (o guarda estático confere que a action nova verifica acesso; semear os recursos novos onde o teste pedir).
- [ ] **Step 5: Commit.** `git commit -m "Frete: servico de cotacao, pacote sugerido e acessos" -- src/lib/frete/cotacao.js src/app/frete src/lib/acessos scripts/teste-frete.js`

---

### Task 6: Cadastro de caixas de envio e Configurações › Envios

**Files:**
- Create: `src/app/cadastros/caixas-de-envio/page.jsx`, `src/app/cadastros/caixas-de-envio/acoes.js`, `src/components/frete/TabelaDeCaixas.jsx`
- Create: `src/app/configuracoes/envios/page.jsx`, `src/app/configuracoes/envios/acoes.js`, `src/components/frete/FormularioDeEnvios.jsx`
- Modify: `src/lib/secoesDeCadastros.js`, `src/lib/configuracoes/catalogo.js`

**Interfaces:**
- Consumes: `listarCaixas`, `salvarCaixa`, `excluirCaixa`, `lerConfigDeFrete`, `salvarConfigDeFrete`.
- Produces: actions `salvarCaixaAcao(entrada, id?)`, `excluirCaixaAcao(id)`, `salvarConfigDeFreteAcao(entrada)`, cada uma conferindo `editar` no recurso da própria tela.

Linha-guia das duas telas: em Caixas o operador vê primeiro a lista das caixas com as medidas, e a ação principal é "Nova caixa"; em Envios vê os dois valores, e a ação principal é Salvar.

- [ ] **Step 1: Caixas de envio.** Rota estática `/cadastros/caixas-de-envio` (vence a `[tipo]`). Cartão em `SECOES_DE_CADASTROS`: rótulo "Caixas de envio", ícone `Box`, resumo "As caixas em que a loja despacha, com medidas e peso, para o Rise sugerir a caixa na cotação do frete.". Tabela com Nome, Medidas externas, Medidas internas, Peso vazio e Situação, todas com `CabecalhoOrdenavel`, sem paginação (são poucas). "Nova caixa" e o lápis abrem a mesma janela: comprimento, largura, altura, as três internas (opcionais, bolha "Sem elas o Rise desconta 0,5 cm de cada lado") e peso vazio em gramas; o nome aparece montado enquanto se digita e não é editável. Excluir com popup listando o nome; em uso, o popup diz que a caixa será desativada.
- [ ] **Step 2: Configurações › Envios.** Cartão em `CARTOES_DE_CONFIGURACOES`: recurso `tela.configuracoes.envios`, rótulo "Envios", ícone `PackageCheck`, resumo "O acréscimo de embalagem e a folga de peso usados na cotação do frete.". Formulário com "Acréscimo de embalagem (R$)" e "Peso extra de embalagem (%)", cada um com a bolha explicando a conta. Os campos de aviso e de impressão ficam para a fase 2.
- [ ] **Step 3: Conferir no navegador** (`preview_start`): criar a caixa `CX 30x20x15`, editar o peso, desativar, excluir; mudar o acréscimo para 1,50 e voltar para 1,00; conferir em largura de notebook e passar por `ecc:make-interfaces-feel-better`.
- [ ] **Step 4: Rodar** `npm run lint`, `npm run teste:frete`, `npm run teste:acessos`, `npm run teste:navegacao`.
- [ ] **Step 5: Commit.** `git commit -m "Frete: cadastro de caixas de envio e a configuracao de envios" -- src/app/cadastros/caixas-de-envio src/app/configuracoes/envios src/components/frete src/lib/secoesDeCadastros.js src/lib/configuracoes/catalogo.js`

---

### Task 7: Cotador (componente único) e a ferramenta "Cotar frete"

**Files:**
- Create: `src/components/frete/CotadorDeFrete.jsx`, `src/components/frete/JanelaDeCotacao.jsx`
- Create: `src/app/ferramentas/frete/page.jsx`
- Modify: `src/lib/ferramentas/catalogo.js`

**Interfaces:**
- Consumes: `cotarFreteAcao`, `pacoteSugeridoAcao`.
- Produces:
  - `<CotadorDeFrete caixas inicial aoEscolher rotuloDaEscolha />`: `inicial = { cepDestino, caixaId, pesoKg, valorDeclarado, incompletos, motivo, cidadeDestino }` (todos opcionais); `aoEscolher(servico, pacote, cotadoEm)` e `rotuloDaEscolha` opcionais (sem eles a lista só mostra, com o botão "Copiar")
  - `<JanelaDeCotacao aberta aoFechar titulo {...props do cotador} />`: o cotador num `role="dialog"` com `propsDoFundo`

Linha-guia: o operador precisa ver primeiro o preço e o prazo de cada serviço, e a ação principal é "Cotar frete" (depois, escolher um serviço).

- [ ] **Step 1: `CotadorDeFrete`.** Uma linha de campos: CEP de destino, Caixa (as ativas e "Outra medida", que abre os três campos), Peso (kg), Valor declarado (R$) e o botão **Cotar frete**. Com `inicial.incompletos > 0`, uma linha âmbar: "2 itens sem peso ou medida no cadastro: escolha a caixa e digite o peso." Com `motivo === "NAO_CABE"`: "Os itens não cabem em nenhuma caixa cadastrada." Resultado em tabela (Serviço, Prazo, Custo, Cobrar do cliente), da mais barata para a mais cara, com `CabecalhoOrdenavel` em memória; os recusados numa linha recolhida "5 não atendem este envio" que abre os motivos; lista vazia: "Nenhum serviço atende este envio". Erro do serviço em vermelho numa linha, e com `NAO_CONECTADO` o link para `/integracoes`. Cada linha tem o botão `rotuloDaEscolha` quando `aoEscolher` existe. Embaixo, "Copiar" leva `textoDaCotacao` para a área de transferência.
- [ ] **Step 2: Ferramenta.** `/ferramentas/frete` com `exigirAcessoNaPagina("tela.ferramentas.frete", "ver")` e o cotador sem `aoEscolher`. Entrada em `FERRAMENTAS`: rótulo "Cotar frete", ícone `Truck`, resumo "Cota o frete de um pacote pelo CEP, com as caixas da loja, e copia o resultado para mandar ao cliente.", detalhe "Melhor Envio · sem gravar nada". A página entra em `PAGINAS_COM_CARTOES` só se for página de cartões (não é).
- [ ] **Step 3: Conferir no navegador** contra o ambiente de teste do Melhor Envio, se as credenciais já estiverem no `.env`; sem elas, com `MELHOR_ENVIO_URL` apontando para o servidor falso do teste (`node scripts/teste-frete.js --servir`, que mantém o falso no ar). Casos: cotação normal, CEP inexistente, "Outra medida", peso "0,3", nenhum serviço atende, Melhor Envio desconectado, Copiar.
- [ ] **Step 4: Rodar** `npm run lint` e `npm run teste:frete`.
- [ ] **Step 5: Commit.** `git commit -m "Frete: cotador e a ferramenta Cotar frete" -- src/components/frete src/app/ferramentas/frete src/lib/ferramentas/catalogo.js scripts/teste-frete.js`

---

### Task 8: Cotar frete na Proposta

**Files:**
- Modify: `src/components/propostas/BlocosDaProposta.jsx` (`CartaoFrete`), `src/components/propostas/EditorProposta.jsx`, `src/components/propostas/formato.js`
- Modify: `src/lib/propostas/esquema.js`, `src/lib/propostas/banco.js`
- Test: `scripts/teste-propostas.js`

**Interfaces:**
- Consumes: `JanelaDeCotacao`, `pacoteSugeridoAcao`.
- Produces: `cotacaoDoFrete` no formulário e no banco, com a forma `{ cotadoEm, provedor: "MELHOR_ENVIO", servicoId, servicoNome, transportadora, prazoDias, preco, valorCobrado, cepDestino, caixaId, caixaNome, pesoKg, comprimentoCm, larguraCm, alturaCm, valorDeclarado }`.

- [ ] **Step 1: Teste em `scripts/teste-propostas.js`:**

```js
conferir("cotacao gravada com a proposta", (await lerProposta(numero)).cotacaoDoFrete?.servicoNome, "SEDEX");
conferir("cotacao com campo a mais e recusada", (await salvarProposta(numero, { ...dados, cotacaoDoFrete: { ...cotacao, lixo: 1 } })).ok, false);
conferir("frete trocado a mao apaga a cotacao", paraSalvar({ ...formulario, frete: "40,00", cotacaoDoFrete: { ...cotacao, valorCobrado: 29.85 } }).cotacaoDoFrete, null);
conferir("frete igual ao cotado mantem", paraSalvar({ ...formulario, frete: "29,85", cotacaoDoFrete: { ...cotacao, valorCobrado: 29.85 } }).cotacaoDoFrete?.valorCobrado, 29.85);
conferir("sair do CIF apaga a cotacao", paraSalvar({ ...formulario, fretePorConta: "FOB", cotacaoDoFrete: cotacao }).cotacaoDoFrete, null);
```

(`paraSalvar` é o nome que a função de `formato.js` da linha 101 tiver; usar o nome real.)

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** No `CartaoFrete`, com `fretePorConta === "CIF"` e `editar`, o botão "Cotar frete" ao lado de "Valor do frete". O editor monta os itens (`produtoId`, quantidade, valor unitário) dos itens que têm produto, chama `pacoteSugeridoAcao` e abre a janela com o CEP do endereço de entrega do cliente (o de Entrega; sem ele, o Geral; cliente provisório sem endereço: vazio). Escolher um serviço ("Usar este frete") preenche `frete` com `valorACobrar`, `transportadoraNome` com `"<transportadora> <serviço>"`, limpa `transportadoraId` e grava `cotacaoDoFrete`. Sob o valor, uma linha em cinza: "Cotado em 18/11 · CX 16x11x3 · 0,165 kg · SEDEX, 2 dias úteis". O esquema aceita só os campos listados acima.
- [ ] **Step 4: Rodar e ver passar.** `npm run teste:propostas` (as 204 de antes continuam passando).
- [ ] **Step 5: Conferir no navegador** numa proposta de teste: cotar, usar, salvar, reabrir, mudar o valor à mão (a linha some), trocar para FOB (o botão some). O PDF e o link público não mudam.
- [ ] **Step 6: Commit.** `git commit -m "Propostas: cotar frete pelo Melhor Envio no frete CIF" -- src/components/propostas src/lib/propostas scripts/teste-propostas.js`

---

### Task 9: Cotar frete no Pedido de venda (rascunho do envio)

**Files:**
- Create: `src/lib/frete/envios.js`, `src/components/frete/EnvioDoPedido.jsx`
- Modify: `src/components/pedidos/AbaEnvio.jsx`, `src/app/pedidos/acoes.js`, a página do pedido (`src/app/pedidos/[numero]/page.jsx` ou o nome real) e a leitura do pedido em `src/lib/pedidos/banco.js`
- Modify: `src/lib/acessos/recursos.js`
- Test: `scripts/teste-frete.js` (seção "Envio em rascunho"), `npm run teste:pedidos`

**Interfaces:**
- Consumes: `JanelaDeCotacao`, `pacoteSugeridoAcao`, tabela `Envio`.
- Produces (de `envios.js`):
  - `numeroDoEnvio(n) -> "ENV-0001"`
  - `lerEnvioDoPedido(pedidoDeVendaId) -> Promise<Envio | null>` (o de ida que não está `CANCELADO` nem `EXPIRADO`)
  - `salvarRascunhoDoPedido(pedidoDeVendaId, { pacote, servico, cotadoEm }, login) -> Promise<{ ok: true, envio } | { ok: false, erro }>`: cria o `Envio` `RASCUNHO` (número sob `pg_advisory_xact_lock`, como o pedido de compra) ou atualiza o rascunho que já existe; recusa se o envio do pedido já saiu do rascunho; copia remetente (Dados da empresa) e destinatário (comprador e endereço de entrega do pedido); `medidaConferida: false`
  - `cotacaoDaPropostaDoPedido(pedido) -> Promise<cotacaoDoFrete | null>` (por `pedidoDeVendaBlingId` = `blingPedidoId`)
- Recurso novo: `acao("acao.envios.cotarNoPedido", "Cotar frete e escolher o serviço no pedido", "tela.pedidos")`. Action `salvarRascunhoDoEnvioAcao(pedidoId, dados)` confere esse recurso.

- [ ] **Step 1: Teste da seção "Envio em rascunho"** (pedido `ZZ-FRETE-PED` de origem `BLING`, com endereço de entrega):

```js
conferir("numero", [numeroDoEnvio(1), numeroDoEnvio(12345)], ["ENV-0001", "ENV-12345"]);
const primeiro = await salvarRascunhoDoPedido(pedido.id, { pacote, servico, cotadoEm }, "zz-frete");
conferir("cria o rascunho", [primeiro.ok, primeiro.envio.status, primeiro.envio.direcao, primeiro.envio.medidaConferida, primeiro.envio.servicoNome], [true, "RASCUNHO", "IDA", false, "SEDEX"]);
conferir("destinatario copiado do pedido", primeiro.envio.destinatario.endereco.cep, "01001000");
const segundo = await salvarRascunhoDoPedido(pedido.id, { pacote, servico: { ...servico, servicoNome: "PAC", servicoId: "1" }, cotadoEm }, "zz-frete");
conferir("cotar de novo atualiza o mesmo", [segundo.envio.id === primeiro.envio.id, segundo.envio.servicoNome, await prisma.envio.count({ where: { pedidoDeVendaId: pedido.id } })], [true, "PAC", 1]);
const [a, b] = await Promise.all([salvarRascunhoDoPedido(outro.id, dadosDoRascunho, "zz"), salvarRascunhoDoPedido(outro.id, dadosDoRascunho, "zz")]);
conferir("dois cliques criam um envio so", [a.ok && b.ok, await prisma.envio.count({ where: { pedidoDeVendaId: outro.id } })], [true, 1]);
await prisma.envio.update({ where: { id: primeiro.envio.id }, data: { status: "A_POSTAR" } });
conferir("comprado nao volta a rascunho", (await salvarRascunhoDoPedido(pedido.id, { pacote, servico, cotadoEm }, "zz-frete")).ok, false);
conferir("apagar o pedido mantem o envio", [await apagarPedidoDeTeste(pedido.id), (await prisma.envio.findUnique({ where: { id: primeiro.envio.id } })).pedidoDeVendaId], [true, null]);
conferir("cotacao da proposta de origem", (await cotacaoDaPropostaDoPedido(pedidoComProposta))?.caixaNome, "CX 16x11x3");
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar `envios.js`, a action e a leitura.** A leitura do pedido passa a trazer `envioDoRise` (o `lerEnvioDoPedido`) e a página passa `caixas` e `podeCotar` à aba.
- [ ] **Step 4: `EnvioDoPedido` dentro da `AbaEnvio`**, só para pedido de origem `BLING`, numa `Secao` "Envio pelo Rise":
  - sem envio: botão principal **Cotar frete**; a janela abre com o CEP do endereço de entrega, o pacote sugerido pelos itens do pedido e, havendo cotação na proposta de origem, a caixa e o peso dela;
  - com rascunho: serviço, prazo, custo, valor a cobrar, caixa e peso, a data da cotação, "Cotar de novo" como ação secundária e o botão **Comprar etiqueta** desabilitado com `title="Disponível na próxima entrega do módulo de frete"`.
  O campo "Custo real do frete" digitado continua como está nesta fase.
- [ ] **Step 5: Rodar e ver passar.** `npm run teste:frete`, `npm run teste:pedidos` (as 312 continuam), `npm run teste:acessos`.
- [ ] **Step 6: Conferir no navegador** num pedido do Bling (`npm run teste:pedidos -- --manter` deixa pedidos de teste): cotar, escolher, recarregar a página (o rascunho continua), cotar de novo, e um pedido do ML (a seção não aparece).
- [ ] **Step 7: Commit.** `git commit -m "Pedidos: cotar frete e guardar o rascunho do envio" -- src/lib/frete/envios.js src/components/frete/EnvioDoPedido.jsx src/components/pedidos/AbaEnvio.jsx src/app/pedidos src/lib/pedidos/banco.js src/lib/acessos/recursos.js scripts/teste-frete.js`

---

### Task 10: Fechamento da fase

**Files:**
- Modify: `CLAUDE.md` (linha do `teste:frete` em "Rodar", linha no quadro "Estado" e a seção "Módulo de frete (fase 1)")
- Modify: `.env.example` (as variáveis `MELHOR_ENVIO_*` e `FRETE_COMPRA=false`, com uma linha de comentário cada)

- [ ] **Step 1: Documentar no `CLAUDE.md`** o que custou caro nesta fase (o que foi medido no Melhor Envio, com a data) e o que ficou sem conferir.
- [ ] **Step 2: Ritual de fim de sessão:** `npm run lint`, `npm run teste:extracao`, `npm run teste:coleta`, `npm run teste:cadastros`, `npm run teste:frete`, `npm run teste:propostas`, `npm run teste:pedidos`, `npm run teste:acessos`, e o `npm run teste:worker` sozinho.
- [ ] **Step 3: Commit.** `git commit -m "CLAUDE.md: modulo de frete, fase 1 (cotacao)" -- CLAUDE.md .env.example`
- [ ] **Step 4: Entregar ao dono** com "O que foi feito" e "Testes que você precisa fazer" (conectar o Melhor Envio em Integrações, cadastrar a caixa nova, cotar em Ferramentas, numa proposta CIF e num pedido do Bling). Sem push e sem deploy até ele pedir.

## Depende do dono

- Criar o aplicativo no painel do Melhor Envio (produção e ambiente de teste) com o endereço de retorno `https://rise.4hobby.com.br/api/oauth/melhorenvio/callback` (e o do PC, `https://localhost:3000/api/oauth/melhorenvio/callback`), e pôr `MELHOR_ENVIO_CLIENT_ID`, `MELHOR_ENVIO_CLIENT_SECRET` e `MELHOR_ENVIO_CONTATO` no `.env`. As tarefas 1 a 6 não dependem disso; a conferência no navegador das tarefas 7 a 9 fica melhor com ele.
- Pesar as três caixas (trocar os pesos estimados em Cadastros › Caixas de envio) e decidir os tamanhos novos.
