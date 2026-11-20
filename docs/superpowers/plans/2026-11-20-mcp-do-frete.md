# MCP do frete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 9 ferramentas do MCP do Rise para cotar, preparar, comprar, imprimir, ler, listar e cancelar etiquetas e reenviar o aviso, sobre a lib do frete da fase 2.

**Architecture:** Um arquivo novo `src/lib/mcp/frete.js` no molde de `src/lib/mcp/pedidosDeVenda.js` (acesso pelo `pode()` do contexto, `ErroDeFerramenta` para recusa, resposta só com o que a pessoa precisa). A regra continua em `src/lib/frete/` (`cotacao.js`, `envios.js`, `aviso.js`); o MCP acha o pedido ou o envio, confere o acesso e monta a resposta. Registro em `servidor.js`: leituras com o lembrete, escritas sem.

**Tech Stack:** JavaScript, zod, Prisma, `@modelcontextprotocol/server`.

**Spec:** `docs/superpowers/specs/2026-11-20-mcp-do-frete-design.md` (muda a 5.10 de `2026-11-18-modulo-de-frete-design.md`).

## Global Constraints

- Dado pessoal do cliente nunca sai pelo MCP: do destinatário, só `nome` e `cidade` ("Cidade (UF)"); nada de endereço, CEP de destino, telefone, e-mail, documento nem link do WhatsApp.
- Ver Envios = `pode("tela.envios","ver") || pode("tela.pedidos","ver")`; comprar = `pode("acao.envios.comprarEtiqueta","executar")`; avisar = `pode("acao.envios.avisarCliente","executar")`.
- Compra e cancelamento passam `recalcularLucroDoPedido` (`src/lib/pedidos/banco.js`) como `aoComprar`/`aoMudarCusto`.
- Texto de tela com acento; identificadores sem acento; comentários explicam o porquê.
- Execução inline, sem subagentes (preferência do dono). Commit só dos próprios arquivos (`git commit -- caminhos`), sem push.

## Review Focus

1. `comprarEtiqueta` com `valorConfirmado` diferente do preço preparado → recusa, sem carrinho no Melhor Envio.
2. Preparação com mais de 30 min (`cotadoEm`) → recusa pedindo `prepararEtiqueta` de novo.
3. Pedido que não é do Bling (ML, LI) em `cotarFreteDoPedido`/`prepararEtiqueta` → recusa "O envio pelo Rise é só para pedido do Bling."
4. Respostas de `lerEnvio` e `listarEnvios` sem nenhuma das chaves de dado pessoal (`endereco`, `telefone`, `email`, `documento`, `remetente`).
5. Login sem o acesso de comprar chamando `prepararEtiqueta`/`comprarEtiqueta`/`cancelarEtiqueta` → recusa antes de qualquer escrita.

---

### Task 1: Leituras do MCP do frete

**Files:**
- Create: `src/lib/mcp/frete.js`
- Modify: `src/lib/mcp/pedidosDeVenda.js` (exportar `acharPedido`)
- Test: `scripts/teste-frete.js` (seção nova "MCP do frete", antes do `servidor.close()`)

**Interfaces:**
- Consumes: `cotarFrete(entrada)`, `pacoteSugerido(itens)` (`frete/cotacao.js`); `lerEnvio(id)`, `lerEnvioDoPedido(pedidoId)`, `listarEnvios({status,busca,por})`, `linkDaEtiqueta(id)`, `cotacaoDaPropostaDoPedido(pedido)` (`frete/envios.js`); `listarCaixas({soAtivas})`; `SITUACAO_DO_ENVIO`, `numeroDoEnvio`, `quadroDoEnvio` (`frete/regras.js`); `obterProvedor(PROVEDOR_PADRAO).saldo()`; `acharPedido(referencia) -> Promise<string id>` (pedidosDeVenda.js, passa a ser exportada).
- Produces (todas `(argumentos, { pode }) => Promise<objeto>`, recusa com `ErroDeFerramenta`):
  - `acharEnvio(referencia) -> Promise<envio>` (exportada para o teste): "12" / "ENV-0012" pelo número; senão o rastreio (igual, sem caixa); senão o pedido (`acharPedido`) → `lerEnvioDoPedido`. Sem nada: "Envio não encontrado: use o número do envio, do pedido ou o rastreio."; pedido sem envio vivo: "O pedido X não tem envio pelo Rise."
  - `cotarFreteMcp({ cep, caixa?, comprimentoCm?, larguraCm?, alturaCm?, pesoKg, valor })` → `{ origemCep, pacote:{caixa,pesoKg,medidas}, servicos:[{servicoId,transportadora,servico,preco,valorACobrar,prazoDias,compravel}], naoAtendem:[{transportadora,servico,motivo}] }`. `caixa` é o NOME (sem caixa: "cx 16x11x3" = "CX 16x11x3"); caixa desconhecida: "Caixa X não cadastrada. Caixas: ...".
  - `cotarFreteDoPedido({ pedido, caixa?, pesoKg? })` → o mesmo formato + `pedido` (número) e `pacoteDe` ("rascunho" | "proposta" | "itens" | "chamada"). Pacote: o da chamada, senão o rascunho do envio, senão a cotação da proposta, senão `pacoteSugerido`. Sem pacote possível: "Diga a caixa e o peso: o Rise não conseguiu sugerir (N item(ns) sem peso ou medida)."
  - `lerEnvioMcp({ envio })` → `{ numero, situacao, pedido, destinatario:{nome,cidade}, servico, rastreio, link, prazoDias, custo, validoAte, linhaDoTempo:[{rotulo,em}], aviso:{email, emailErro, whatsapp}, ultimaConsultaEm, ultimoErro }`.
  - `listarEnviosMcp({ situacao?, termos?, limite? })` → `{ saldo, total, porSituacao, envios:[{numero,situacao,pedido,destinatario:{nome,cidade},servico,rastreio,custo,postadoEm,semAviso}] }`; `saldo` null quando o ME não responde.
  - `imprimirEtiquetaMcp({ envio })` → `{ numero, url }`.
  - `FERRAMENTAS_DE_FRETE_LEITURA` (array no molde de `FERRAMENTAS_DE_PEDIDOS_DE_VENDA`: `nome, descricao, esquema, anotacoes, executar`) com nomes `cotarFrete`, `cotarFreteDoPedido`, `lerEnvio`, `listarEnvios`, `imprimirEtiqueta`.

- [ ] **Step 1: Testes (falham)** — na seção "MCP do frete" do `teste:frete`, com `concluirAutorizacao("codigo-de-teste")`, um pedido `ZZ-FRETE-MCP-1` com 1 item e um envio A_POSTAR comprado pelo caminho normal (`salvarRascunhoDoPedido` → `conferirPacote` → `liberarTrava()` → `comprarEtiqueta`), `pode` falso que aceita tudo e outro que nega tudo:
  - `cotarFreteMcp({ cep:"01001000", caixa:"cx 16x11x3", pesoKg:0.2, valor:49.7 })` → `servicos.some(s => s.servico === "SEDEX" && s.preco === 28.85)` true; `caixa:"CX 99"` → erro contém "não cadastrada".
  - `cotarFreteDoPedido({ pedido:"ZZ-FRETE-MCP-2" })` (pedido sem envio, item sem produto) → erro "Diga a caixa e o peso..."; com `caixa` e `pesoKg` → `pacoteDe` "chamada"; pedido `ZZ-FRETE-MCP-ML` com `origem:"MERCADO_LIVRE"` → "O envio pelo Rise é só para pedido do Bling."
  - `lerEnvioMcp` por número do envio, por "ENV-000N", pelo pedido e pelo rastreio → mesmo `numero`; `situacao` "A postar"; `destinatario` = `{ nome:"ZZ Comprador", cidade:"São Paulo (SP)" }`; `JSON.stringify(resultado)` sem `"endereco"`, `"telefone"`, `"email"`, `"documento"`, `"remetente"`.
  - `listarEnviosMcp({ termos:"ZZ-FRETE-MCP-1" })` → `total` 1, `saldo` 123.45, mesmo teste de dado pessoal.
  - `imprimirEtiquetaMcp` → `url` começa com "http".
  - Com o `pode` que nega: as cinco recusam com "Este login não pode ver os envios."
- [ ] **Step 2:** `npm run teste:frete` → falha no import de `src/lib/mcp/frete.js`.
- [ ] **Step 3:** Implementar as leituras em `src/lib/mcp/frete.js` e exportar `acharPedido`.
- [ ] **Step 4:** `npm run teste:frete` → "Tudo certo."
- [ ] **Step 5:** Commit `feat(mcp): leituras do frete (cotar, ler, listar, imprimir)`.

### Task 2: Escritas do MCP do frete

**Files:**
- Modify: `src/lib/mcp/frete.js`
- Test: `scripts/teste-frete.js` (mesma seção)

**Interfaces:**
- Consumes: Task 1 (`acharEnvio`, montagem do pacote do pedido, `acharPedido`); `salvarRascunhoDoPedido`, `conferirPacote`, `comprarEtiqueta`, `cancelarEtiqueta` (`frete/envios.js`); `reenviarEmail(id)` (`frete/aviso.js`); `recalcularLucroDoPedido`.
- Produces:
  - `prepararEtiqueta({ pedido, servicoId, caixa?, comprimentoCm?, larguraCm?, alturaCm?, pesoKg, documento: "NFE"|"DECLARACAO", chaveNfe? }, contexto)` → cota com o pacote, acha o `servicoId` (sumiu: "O serviço X não atende este pacote: cote de novo."), `salvarRascunhoDoPedido`, `conferirPacote` (NF-e sem `chaveNfe` usa `pedido.nf.chave`; sem nenhuma: "O pedido não tem NF-e: informe a chave ou use declaração."). Devolve `{ envio, servico, prazoDias, preco, saldo, saldoDepois, podeComprar, motivos }`.
  - `comprarEtiquetaMcp({ envio, valorConfirmado, confirmo: true }, contexto)`: recusa se `medidaConferida` falso ("Prepare a etiqueta antes."), se `|precoCotado − valorConfirmado| > 0,005` ("O preço preparado é R$ X, não R$ Y: confira com a pessoa."), se `cotadoEm` tem mais de 30 min ("A preparação passou de 30 minutos: prepare de novo."); senão `comprarEtiqueta(id, login, { aoComprar: recalcularLucroDoPedido })` → `{ numero, situacao, rastreio, link, custo, validoAte }`.
  - `cancelarEtiquetaMcp({ envio, motivo, confirmo: true }, contexto)` → `{ numero, situacao: "Cancelado", aviso: "O valor volta à carteira em até 12 horas." }`.
  - `reenviarAvisoMcp({ envio }, contexto)` → o retorno de `reenviarEmail` traduzido (`{ enviado, erro }`).
  - `FERRAMENTAS_DE_FRETE_ESCRITA` com `prepararEtiqueta`, `comprarEtiqueta`, `cancelarEtiqueta`, `reenviarAvisoAoCliente`; anotações: preparar `{readOnly:false, destructive:false, idempotent:true, openWorld:true}`, comprar/cancelar `{readOnly:false, destructive:true, idempotent:false, openWorld:true}`, reenviar `{readOnly:false, destructive:false, idempotent:false, openWorld:true}`. `confirmo` é `z.literal(true)`.
  - O login do contexto é `contexto.usuario`.

- [ ] **Step 1: Testes (falham)**, pedido `ZZ-FRETE-MCP-3` com item e `nf: { chave: "4".repeat(44) }`:
  - `prepararEtiqueta` com `servicoId:"2"`, `caixa:"CX 16x11x3"`, `pesoKg:0.2`, `documento:"NFE"` → `preco` 28.85, `saldo` 123.45, `saldoDepois` 94.6, `podeComprar` true (trava liberada).
  - `comprarEtiquetaMcp` com `valorConfirmado: 20` → erro com "R$ 28,85" e nenhum carrinho novo no falso.
  - `cotadoEm` empurrado 31 min para trás → erro "passou de 30 minutos".
  - De novo `prepararEtiqueta` e `comprarEtiquetaMcp` com 28.85 → `situacao` "A postar", `custo` 25.84; o pedido ganha `real.fontes.frete` "etiqueta".
  - `cancelarEtiquetaMcp` → situação "Cancelado".
  - `reenviarAvisoMcp` num envio POSTADO com a trava `EMAIL_ENVIO` fechada → `enviado` false e o erro da trava.
  - `prepararEtiqueta` no pedido `ZZ-FRETE-MCP-ML` → "só para pedido do Bling".
  - `pode` só com `tela.envios`: preparar, comprar e cancelar recusam "Este login não pode comprar etiquetas." e reenviar "Este login não pode avisar o cliente."
- [ ] **Step 2:** `npm run teste:frete` → falha (funções não existem).
- [ ] **Step 3:** Implementar as escritas.
- [ ] **Step 4:** `npm run teste:frete` → "Tudo certo."
- [ ] **Step 5:** Commit `feat(mcp): preparar, comprar, cancelar etiqueta e reenviar aviso pelo MCP`.

### Task 3: Registro no servidor MCP

**Files:**
- Modify: `src/lib/mcp/servidor.js` (imports, `SO_LEITURA_DO_MCP` ganha as leituras, `PROPOSTAS` ganha as escritas, uma linha nas `INSTRUCOES`)
- Modify: `src/lib/mcp/consultas.js` (`RESUMOS` das 9)
- Test: `scripts/teste-mcp.js` (lista de nomes da linha ~782 ganha as 9, ordenada)

**Interfaces:**
- Consumes: `FERRAMENTAS_DE_FRETE_LEITURA`, `FERRAMENTAS_DE_FRETE_ESCRITA`.
- Produces: linha das INSTRUÇÕES: "Frete (Melhor Envio, pedidos do Bling): cotarFrete, cotarFreteDoPedido, lerEnvio (pelo envio, pedido ou rastreio), listarEnvios e imprimirEtiqueta leem. Para a etiqueta: prepararEtiqueta com a caixa e o peso que a pessoa medir, mostre o preço e o saldo, e só com o ok dela chame comprarEtiqueta com o valor mostrado e confirmo: true. cancelarEtiqueta só quando ela pedir com todas as letras."

- [ ] **Step 1:** Acrescentar os 9 nomes na lista do `teste:mcp`; `npm run teste:mcp` falha na lista.
- [ ] **Step 2:** Registrar e escrever os resumos.
- [ ] **Step 3:** `npm run teste:mcp` → passa; `npx eslint` nos arquivos tocados → 0.
- [ ] **Step 4:** Commit `feat(mcp): registra as ferramentas do frete`.

### Task 4: Documentação e ritual

**Files:** `CLAUDE.md` (seção do frete: "MCP do frete (20/11/2026, SEM deploy)", contagem do `teste:frete` e do `teste:mcp`), spec do frete 5.10 (nota "mudou em 20/11/2026, ver 2026-11-20-mcp-do-frete-design.md"), memória `projeto-sistema-de-envio.md`.

- [ ] **Step 1:** Atualizar os três.
- [ ] **Step 2:** Ritual: `npm run lint`, `teste:frete`, `teste:mcp`, `teste:pedidos`, `teste:acessos`.
- [ ] **Step 3:** Commit `docs: MCP do frete`.
