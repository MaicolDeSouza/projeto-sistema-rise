# Chat da loja (Hobi), fase 2: a janela do chat e as telas do Rise — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Neste projeto:** execução **inline** (`superpowers:executing-plans`), na `main`, sem subagentes (escolha do dono).

**Goal:** a janela do chat (o widget, com o mascote) pronta e conferida numa loja de mentira no PC, e as telas do Rise para o dono configurar o chat, colar as chaves, ler as conversas e ver o gasto e a saúde. **Nada aparece na loja de verdade nesta fase:** a etiqueta só é colada na Loja Integrada na fase 4.

**Architecture:** o widget é um arquivo JavaScript único, montado de duas fontes (`assistente/widget/nucleo.js`, lógica pura testada em Node, e `assistente/widget/tela.js`, a tela em Shadow DOM) com as imagens do mascote embutidas, publicado com nome pelo conteúdo (`widget-<10 hex>.js`) e servido pelo serviço `ia` a partir da imagem. O Rise (app) grava a configuração e os dois segredos cifrados; o serviço só lê. Uma loja de mentira (`npm run hobi:demo`) sobe a mesma porta HTTP com dependências trocadas, para o dono ver e eu conferir no navegador.

**Tech Stack:** Node 24, JavaScript sem TypeScript, DOM puro (sem framework no widget), `sharp` (já no projeto) para recortar o mascote, `node:crypto`, Next (telas do Rise), Postgres 17, Caddy 2. **Nenhuma dependência nova.**

**Spec:** `docs/superpowers/specs/2026-11-19-chat-ia-na-loja-design.md` (§5.4, §6, §7 "Memória e ensino", §8, §9, §10, §12 item 2, §13). Fase 1: `docs/superpowers/plans/2026-11-19-chat-da-loja-fase-1-fundacao-segura.md` e `...-fase-1-decisoes.md`.

## Global Constraints

- **Anti-objetivos 1 e 2 do dono continuam valendo:** "Nao pode haver vazamanto de dados e nao pode colocar todo o sistema do rise em risco". O widget não recebe nada além do que `/status`, `/chat` e `/avaliar` já devolvem; o serviço `ia` continua sem as chaves do Rise.
- **Nunca quebra nem atrasa a loja (anti-objetivo 4):** todo o widget dentro de `try/catch`; carregado com `defer`; `/status` fora do ar, desligado ou lento (4 s) = o botão não aparece; não roda no carrinho nem no checkout; o script da Cloudflare só é carregado na primeira mensagem.
- **Dado do servidor é sempre texto:** nada de `innerHTML` com dado da resposta; link só da loja; foto só de `https://rise.4hobby.com.br/`; WhatsApp só `https://wa.me/<número>`.
- **Mascote só no site.** No WhatsApp a foto continua o logo da 4hobby (decisão do dono em 19/11/2026). O nome ("Hobi") vem da configuração, não do código.
- **O widget diz que é IA** (linha fixa): "Este é um assistente de IA. Preço e estoque vêm da loja. Não envie senha nem dados de cartão."
- **Segredos:** só de escrita na tela; cifrados com `derivarChave(IA_SEGREDO, "segredos")`; nunca voltam à tela, ao log nem à trilha de auditoria. **Nunca digitar nem ler senha ou token: quem cola é o dono, na tela.**
- **Medido na loja em 20/11/2026 (código da própria LI):** comprar é `GET /carrinho/produto/<id da LI>/adicionar/<quantidade>` com `X-Requested-With: XMLHttpRequest`, resposta JSON `{ status: "sucesso", mensagem, carrinho_id, produto: { id, sku, nome, preco, quantidade } }`; depois a loja faz `$("#carrinho-mini").load("/carrinho/mini")` e `atualizarCarrinhoMini()`; se a chamada falha, ela navega para o endereço. Página de produto: `body.pagina-produto.produto-<id>` e `[itemprop=sku]`; carrinho: `body.pagina-carrinho`.
- Convenções do `CLAUDE.md`: identificadores e comentários em português **sem acento**; texto que a pessoa lê **com acento**; comentário explica o porquê; as 10 regras do **Padrão visual**; toda tela nova passa por `frontend-design` e `ecc:make-interfaces-feel-better` e é conferida no navegador.
- Testes no molde do projeto (`conferir(nome, obtido, esperado)`), Postgres local, **sem rede e sem IA paga**; só escrevem `ZZ-LOJA-*`, `loja:zz-*`, "ZZ LOJA *" e segredos com `atualizadoPor: "zz-loja"`, e devolvem a `ConfiguracaoIA` e a linha `SinalDoAssistente` do dono.
- Commit só dos arquivos de cada tarefa (`git commit -- caminhos`), mensagem terminando com `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`. **Deploy só com o "sobe"; qualquer mudança na VPS só com o ok do dono.**

## Review Focus

1. **O serviço responde algo inesperado ao widget** (HTML de erro do Caddy, JSON pela metade, fluxo cortado no meio) → o widget mostra "Não consegui responder agora" com o WhatsApp e continua usável; nunca uma exceção solta na página da loja. Teste na Tarefa 1 (leitor do fluxo) e conferência na Tarefa 3.
2. **Cartão com link ou foto de fora, ou texto com marcação HTML** (serviço invadido ou resposta adulterada) → o link e a foto somem do cartão, o texto aparece como texto. Teste na Tarefa 1.
3. **O visitante navega para outra página no meio da conversa** → a conversa volta como estava (mesma sessão, mesmo passe), sem pedir o robô de novo e sem repetir a pergunta. Teste na Tarefa 1 (guardar e ler) e conferência na Tarefa 3.
4. **O dono liga o chat sem ter colado uma chave, ou remove a chave com o chat ligado** → a tela não deixa ligar e diz o que falta; removida depois, o `/status` passa a desligado sozinho e a tela mostra "ligado, mas fora do ar: falta a chave". Teste na Tarefa 4.
5. **Versão nova do widget publicada e a loja ainda com a etiqueta antiga** → o arquivo antigo continua sendo servido (nenhum publicado é apagado), e o chat não some da loja. Teste na Tarefa 2.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `assistente/mascote/{cabeca,corpo,pensando,feliz}.webp` | o mascote recortado (fundo transparente), gerado de `docs/mascote-hobi/` |
| `scripts/recortar-mascote.js` | recorta o fundo claro a partir das bordas e grava os `.webp` |
| `assistente/widget/nucleo.js` | lógica pura do widget (sessão, leitor do fluxo, regras de link/foto, carrinho, estado da conversa) |
| `assistente/widget/tela.js` | a tela: Shadow DOM, CSS, eventos, Turnstile, chamadas ao serviço |
| `scripts/montar-widget.js` | junta núcleo + tela + imagens num arquivo, calcula versão e integridade, grava em `assistente/publicado/` |
| `assistente/publicado/widget-<versão>.js`, `manifesto.json` | o que o serviço serve e o que a etiqueta aponta (no git) |
| `src/lib/riseAi/cliente/widgetPublicado.js` | ler os publicados e o manifesto; montar a etiqueta |
| `src/lib/riseAi/cliente/servidorHttp.js` | + rota `GET /widget-<versão>.js`; `/status` com `publico` |
| `scripts/hobi-demo.js`, `assistente/demo/loja.html` | a loja de mentira do PC |
| `src/lib/riseAi/cliente/painelDoCanal.js` | (app) estado do canal, guardar/remover/testar segredo, o que falta para ligar |
| `src/components/riseAi/CanalChatDaLoja.jsx` | a seção "Chat da loja" da aba Canais |
| `src/lib/riseAi/cliente/revisaoDaLoja.js` | o resumo de uma resposta da loja para a Revisão (puro) |
| `src/lib/saude/regras.js`, `coletar.js` | + a linha "Assistente da loja" |
| `scripts/teste-widget.js` (novo, `npm run teste:widget`), `scripts/teste-assistente.js`, `scripts/teste-rise-ai.js`, `scripts/teste-saude.js` | testes |

---

### Task 1: o mascote recortado e o núcleo puro do widget

**Files:**
- Create: `scripts/recortar-mascote.js`, `assistente/mascote/*.webp`, `assistente/widget/nucleo.js`, `scripts/teste-widget.js`
- Modify: `package.json` (scripts `teste:widget`, `hobi:mascote`), `eslint.config.mjs` (globais de navegador para `assistente/widget/`)

**Interfaces (Produces), todas exportadas de `nucleo.js`, sem DOM e sem `fetch`:**
- `novaSessaoId(bytes: Uint8Array) → string` (32 hexadecimais minúsculos)
- `criarLeitorDoFluxo() → { alimentar(pedaco: string): { evento: string, dados: object }[] }` (SSE: blocos separados por linha em branco; bloco com JSON inválido é descartado, nunca lança)
- `contextoDaPagina({ classeDoBody, skuNaPagina }) → { pagina: "produto" | "outra", skuAberto: string }` (`skuAberto` só quando a classe tem `pagina-produto` e o sku casa `/^[A-Za-z0-9._-]{1,64}$/`; senão `""`)
- `paginaProibida({ classeDoBody, caminho }) → boolean` (classe `pagina-carrinho` ou caminho começando por `/carrinho` ou `/checkout`)
- `deveAparecer({ status, busca, lembrado }) → boolean` (`status.ligado === true` **e** (`status.publico === true` ou `busca` tem `assistente=1` ou `lembrado`))
- `linkDaLoja(url, origemDaPagina) → string | null` (https e origem ∈ `{origemDaPagina, "https://www.4hobby.com.br", "https://4hobby.com.br"}`)
- `fotoPermitida(url, origemDoServico) → string | null` (começa por `https://rise.4hobby.com.br/`; ou, só quando o host de `origemDoServico` é `127.0.0.1` ou `localhost`, qualquer `https://`)
- `linkDoWhatsApp(url) → string | null` (`/^https:\/\/wa\.me\/\d{10,15}(\?\S*)?$/`)
- `enderecoDoCarrinho(liId, quantidade) → string | null` (`/carrinho/produto/<liId>/adicionar/<quantidade>`; `liId` só dígitos, quantidade inteira de 1 a 99)
- `pareceDadoSensivel(texto) → "cpf" | "cartao" | null` (CPF com dígitos verificadores válidos; cartão = 13 a 19 dígitos que passam no Luhn)
- `conversaVazia() → conversa`; `aplicarEvento(conversa, { evento, dados }) → conversa` (imutável; eventos `pergunta`, `status`, `cartoes`, `lista`, `texto`, `passagem`, `erro`, `fim`, `passe`, `avaliacao`); `paraGuardar(conversa) → string` (JSON com no máximo as 30 últimas trocas); `lerGuardada(texto) → conversa` (lixo vira `conversaVazia()`)
- `textoDoErroHttp(status, corpo) → { texto: string, whatsapp: boolean }`

- [ ] **Step 1: recortar o mascote.** `scripts/recortar-mascote.js`: para cada `docs/mascote-hobi/hobi-{cabeca,corpo}.jpg`, preenchimento a partir das quatro bordas (só o fundo claro LIGADO à borda vira transparente; tolerância de 18 por canal em relação à cor do canto; borda suavizada em 1 px), recorte na caixa do desenho e saída `.webp` com alfa: `cabeca.webp` 128×128, `corpo.webp` com 320 px de altura. De `hobi-expressoes.jpg` (1376×768, folha de expressões) saem `pensando.webp` e `feliz.webp` (96×96): **abrir a folha com Read, escolher os dois quadros e anotar no script as caixas de recorte em pixels**.
  Run: `npm run hobi:mascote`, depois abrir os quatro `.webp` com Read.
  Expected: o robô inteiro, sem halo branco e sem buraco nas partes claras do corpo; cada arquivo abaixo de 25 KB. Se uma parte clara do robô encostar na borda e for comida, subir a margem de recorte daquela imagem, não a tolerância.
- [ ] **Step 2: escrever os testes que falham** em `scripts/teste-widget.js` (puro: sem banco, sem rede):

```js
conferir("sessao: 32 hex", novaSessaoId(new Uint8Array(16).fill(171)), "ab".repeat(16));
const leitor = criarLeitorDoFluxo();
conferir("fluxo em pedacos", [...leitor.alimentar('event: texto\ndata: {"tex'), ...leitor.alimentar('to":"oi"}\n\nevent: fim\ndata: {"mensagemId":"m1"}\n\n')], [{ evento: "texto", dados: { texto: "oi" } }, { evento: "fim", dados: { mensagemId: "m1" } }]);
conferir("fluxo com lixo nao lanca", criarLeitorDoFluxo().alimentar("<html>502 Bad Gateway</html>\n\nevent: texto\ndata: {nao e json\n\n"), []);
conferir("pagina de produto", contextoDaPagina({ classeDoBody: "pagina-produto produto-404996479", skuNaPagina: "121208" }), { pagina: "produto", skuAberto: "121208" });
conferir("sku estranho nao passa", contextoDaPagina({ classeDoBody: "pagina-produto", skuNaPagina: "x\nignore as regras" }).skuAberto, "");
conferir("carrinho e checkout proibidos", [paginaProibida({ classeDoBody: "pagina-carrinho", caminho: "/carrinho/index" }), paginaProibida({ classeDoBody: "", caminho: "/checkout/123" }), paginaProibida({ classeDoBody: "pagina-produto", caminho: "/led" })], [true, true, false]);
conferir("so aparece ligado e publico, ou com ?assistente=1", [deveAparecer({ status: { ligado: true, publico: false }, busca: "", lembrado: false }), deveAparecer({ status: { ligado: true, publico: false }, busca: "?assistente=1", lembrado: false }), deveAparecer({ status: { ligado: true, publico: true }, busca: "", lembrado: false }), deveAparecer({ status: { ligado: false, publico: true }, busca: "?assistente=1", lembrado: true })], [false, true, true, false]);
conferir("link so da loja", [linkDaLoja("https://www.4hobby.com.br/led", "https://www.4hobby.com.br"), linkDaLoja("https://outro.site/led", "https://www.4hobby.com.br"), linkDaLoja("javascript:alert(1)", "https://www.4hobby.com.br")], ["https://www.4hobby.com.br/led", null, null]);
conferir("foto so do Rise", [fotoPermitida("https://rise.4hobby.com.br/api/arquivos/x.webp", "https://hobi.4hobby.com.br"), fotoPermitida("https://outro.site/x.png", "https://hobi.4hobby.com.br"), fotoPermitida("data:image/svg+xml,<svg onload=alert(1)>", "https://hobi.4hobby.com.br")], ["https://rise.4hobby.com.br/api/arquivos/x.webp", null, null]);
conferir("whatsapp", [linkDoWhatsApp("https://wa.me/5554999990000"), linkDoWhatsApp("https://wa.me.outro.site/1")], ["https://wa.me/5554999990000", null]);
conferir("carrinho", [enderecoDoCarrinho("404996479", 2), enderecoDoCarrinho("40x", 1), enderecoDoCarrinho("404996479", 0), enderecoDoCarrinho("404996479", 100)], ["/carrinho/produto/404996479/adicionar/2", null, null, null]);
conferir("dado sensivel", [pareceDadoSensivel("meu cpf e 529.982.247-25"), pareceDadoSensivel("cartao 4111 1111 1111 1111"), pareceDadoSensivel("10 resistor 10k\n5 led"), pareceDadoSensivel("pedido 12345678901")], ["cpf", "cartao", null, null]);
```

  Mais: o redutor (`pergunta` + `cartoes` + `texto` + `fim` dão UMA troca com `mensagemId`; `erro` fecha a troca com o texto do erro; `texto` com `<b>oi</b>` guarda a string igual; `passe` não entra na conversa), `paraGuardar`/`lerGuardada` (ida e volta; 40 trocas guardam 30; `lerGuardada("lixo")` = vazia) e `textoDoErroHttp` para 409 ("Espere a resposta anterior terminar."), 413, 429, 503 `desligado`, 503 `lotado` ("Muita gente por aqui agora.") e outro (os textos de `whatsapp: true` terminam oferecendo o WhatsApp).
- [ ] **Step 3:** Run: `npm run teste:widget`. Expected: FALHA (o módulo não existe).
- [ ] **Step 4: implementar `nucleo.js`** como módulo ES só com `export function`/`export const`, sem `import`, sem `window`/`document` (o montador da Tarefa 2 tira os `export`).
- [ ] **Step 5:** Run: `npm run teste:widget` → todos ok. Run: `npm run lint` → limpo.
- [ ] **Step 6: Commit** (`assistente/mascote`, `assistente/widget/nucleo.js`, os dois scripts, `package.json`, `eslint.config.mjs`).

### Task 2: publicar e servir o widget; `publico` na configuração

**Files:**
- Create: `scripts/montar-widget.js`, `assistente/widget/tela.js` (esqueleto mínimo: só registra `window.__hobi4hobby`), `assistente/publicado/*`, `src/lib/riseAi/cliente/widgetPublicado.js`
- Modify: `src/lib/riseAi/cliente/configuracaoDoCanal.js`, `servidorHttp.js`, `scripts/ia-processo.js`, `deploy/caddy/assistente.modelo`, `deploy/deploy-vps.sh`, `package.json` (script `hobi:montar`), `scripts/teste-assistente.js`

**Interfaces:**
- Consumes: `criarServidorDoAssistente` (fase 1).
- Produces:
  - `montarWidget({ nucleo, tela, imagens }) → { conteudo: string, versao: string, arquivo: string, integridade: string }` (em `scripts/montar-widget.js`, exportada): IIFE única `(function(){"use strict"; …})();`, o núcleo sem os `export`, as imagens como `data:image/webp;base64,…` no lugar do marcador `__HOBI_IMAGENS__`; `versao` = 10 primeiros hexadecimais do SHA-256 do conteúdo; `arquivo` = `widget-<versao>.js`; `integridade` = `sha384-<base64>`.
  - `assistente/publicado/manifesto.json`: `{ "atual": { "arquivo", "versao", "integridade", "bytes" } }`. **O montador nunca apaga um publicado antigo.**
  - `lerPublicados(pasta?) → { atual: object | null, arquivos: Map<string, Buffer> }` e `etiquetaDoWidget(atual, endereco = "https://hobi.4hobby.com.br") → string` em `widgetPublicado.js`. A etiqueta, exata: `<script defer src="https://hobi.4hobby.com.br/widget-<versao>.js" integrity="sha384-…" crossorigin="anonymous"></script>`.
  - `criarServidorDoAssistente({ …, widgets: Map<string, Buffer> })`: `GET /widget-<10 hex>.js`.
  - `chatDaLojaPadrao().publico = false`; `EsquemaDoChatDaLoja.publico: z.boolean()`; `/status` devolve `publico`.

- [ ] **Step 1: testes que falham** (em `teste-assistente.js`):
  - montador: mesmas fontes → mesmo `versao`; mudar um caractere da tela → outro `versao`; `integridade` confere com `createHash("sha384")` do conteúdo; o conteúdo não contém `export ` nem `__HOBI_IMAGENS__`; `new Function(conteudo)` não lança erro de sintaxe.
  - **guarda:** `manifesto.atual` é igual ao que `montarWidget` dá com as fontes de agora, e o arquivo existe com os mesmos bytes (quem mudar a fonte e esquecer de montar, o teste avisa).
  - Review Focus 5: com dois arquivos na pasta, `lerPublicados` devolve os dois.
  - porta: `GET /widget-<versao>.js` sem `Origin` e com `Origin` de outro site → 200, `content-type: text/javascript; charset=utf-8`, `cache-control: public, max-age=31536000, immutable`, `access-control-allow-origin: *`, `x-content-type-options: nosniff`, corpo = o arquivo; versão que não existe, `/widget-../x.js` e `POST` no caminho → 404.
  - `/status` ligado traz `publico: false` de fábrica; `EsquemaDoChatDaLoja` recusa `publico: "sim"`.
  - texto do `assistente.modelo`: tem um matcher só de `GET` com `path_regexp ^/widget-[a-f0-9]{10}\.js$`.
  - texto do `deploy-vps.sh`: quando `deploy/caddy/ligado-assistente.caddy` existe e difere do modelo, copia o modelo por cima **antes** do `caddy validate`.
- [ ] **Step 2:** Run: `npm run teste:assistente`. Expected: FALHA nas asserções novas.
- [ ] **Step 3: implementar.** O serviço lê os publicados uma vez na partida (`lerPublicados()` em `ia-processo.js`; o contêiner é `read_only`, ler basta). A rota do widget fica **antes** da regra de origem (é arquivo público; a integridade exige CORS aberto). No Caddy, um segundo matcher e um segundo `handle` com o mesmo `reverse_proxy`.
- [ ] **Step 4:** Run: `npm run hobi:montar && npm run teste:assistente && npm run teste:ia-isolamento && npm run lint`. Expected: tudo ok.
- [ ] **Step 5: Commit.**

### Task 3: a tela do widget e a loja de mentira

**Files:**
- Create: `scripts/hobi-demo.js`, `assistente/demo/loja.html`
- Modify: `assistente/widget/tela.js`, `assistente/publicado/*` (remontado), `package.json` (script `hobi:demo`), `.claude/launch.json` (configuração `hobi-demo`, porta 8790)

**Interfaces:**
- Consumes: tudo do `nucleo.js`; `GET /status` (`ligado, nome, boasVindas, whatsapp, foraDoHorario, turnstileSiteKey, publico, versao`); `POST /chat` (`{ sessaoId, mensagem, turnstileToken?, passe?, contexto }` → SSE `passe, status, cartoes, lista, texto, passagem, erro, fim`); `POST /avaliar` (`{ sessaoId, mensagemId, nota }`).
- Produces: `npm run hobi:demo` → `http://127.0.0.1:8790/` (a loja de mentira com o widget). Opções: `--real` (usa a chave da OpenAI cadastrada no Rise do PC e gasta de verdade; **só com o ok do dono**), sem ela um provedor de roteiro que busca os termos da mensagem com `buscarProdutos`, mostra até 4 com `mostrarProdutos` e escreve uma frase; `--roteiro=barrada` (o roteiro escreve um preço inventado, para o filtro barrar) e `--roteiro=marcacao` (o texto traz `<img src=x onerror=alert(1)>`).

**A loja de mentira (`hobi-demo.js`):** servidor só em `127.0.0.1`, que se recusa a subir com `RISE_PRODUCAO` no ambiente. Monta `criarServidorDoAssistente` com: `dados` reais sobre o banco do PC (o usuário do `.env`, é ferramenta de desenvolvimento), a configuração do canal trocada em memória (`ligado: true`, `publico: true`, WhatsApp de exemplo, `turnstileSiteKey` = a chave de teste "sempre passa" da Cloudflare, **conferida na documentação deles na hora**), `verificarRobo` que aceita o token dessa chave, `origens: ["http://127.0.0.1:8790"]`, `baseDasFotos: "https://rise.4hobby.com.br"`. Serve também `/` (a página), `/produto` (a mesma página com `body.pagina-produto` e um `[itemprop=sku]` de um produto real do banco), `/carrinho/…` (página com `body.pagina-carrinho`) e a resposta medida do carrinho (`/carrinho/produto/<id>/adicionar/<n>` → o JSON de sucesso; `/carrinho/mini` → um trecho HTML).

**A tela (decisões; o desenho fino sai com `frontend-design` e as 10 regras do Padrão visual, antes de codar):**
- "Nesta tela o visitante precisa ver primeiro **os produtos que resolvem o que ele pediu**, e a ação principal é **Adicionar ao carrinho**."
- Botão flutuante redondo, canto inferior direito, com `cabeca.webp` (sem a imagem: ícone de conversa). Painel de 380×600 no computador; tela inteira abaixo de 480 px de largura. `role="dialog"`, foco no campo ao abrir, Esc fecha, foco visível, `prefers-reduced-motion` respeitado.
- Cabeçalho: cabeça do mascote + "`<nome>` · assistente virtual da 4hobby" + fechar. Logo abaixo, a linha fixa do aviso de IA (texto das Global Constraints).
- Conversa vazia: `corpo.webp`, a saudação (`boasVindas`) e os atalhos **Encontrar um componente** (foca o campo), **Colar lista de peças** (campo cresce para várias linhas, com o exemplo "10 resistor 10k") e **Falar no WhatsApp** (só com link válido). "Acompanhar meu pedido" entra na fase 3.
- Enquanto responde: `pensando.webp` + o texto do evento `status`. Resposta: cartões primeiro (numerados; foto, nome, preço em R$, faixa de estoque, o papel da peça, "Ver produto", quantidade e **Adicionar**), depois a tabela da lista (item pedido, achado, quantidade, subtotal, total), depois o texto, depois o botão do WhatsApp quando houver `passagem` (com "respondemos no próximo dia útil" se `foraDoHorario`), depois 👍 👎.
- **Adicionar:** só com `liId` e faixa diferente de "em falta" (senão só "Ver produto"). A loja não tem produto com opções obrigatórias (o Rise não cadastra variação); se um dia a loja recusar, a `mensagem` dela aparece no cartão. Chama `enderecoDoCarrinho` com `fetch` (`credentials: "same-origin"`, `X-Requested-With: XMLHttpRequest`, `Accept: application/json`); `status: "sucesso"` → o botão vira "Adicionado" e, se a página tem `jQuery` e `#carrinho-mini`, `jQuery("#carrinho-mini").load("/carrinho/mini", () => window.atualizarCarrinhoMini?.())`; outro `status` → a `mensagem` da loja como texto; falha de rede ou resposta que não é JSON → navega para o endereço (o mesmo recurso da loja).
- Campo: Enter envia, Shift+Enter quebra linha; contador a partir de 1.800 caracteres e bloqueio em 2.000; `pareceDadoSensivel` → pergunta "Parece um CPF ou número de cartão. Enviar mesmo assim?" antes de mandar.
- **Robô:** na primeira mensagem sem passe, carrega `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit` e executa o desafio num contêiner **fora** do Shadow DOM (conferir na documentação da Cloudflare se já funciona dentro; se sim, fica dentro); o token vai no `POST /chat`; o evento `passe` é guardado; resposta 403 `robo` com passe → apaga o passe e refaz o desafio uma vez.
- **Estado no navegador:** `sessionStorage` (`hobi:sessao`, `hobi:passe`, `hobi:conversa`, `hobi:aberto`, `hobi:teste`), sempre em `try/catch`. O endereço do serviço é a origem do próprio script (`document.currentScript.src`).
- 👍/👎: `POST /avaliar`; a escolha fica marcada e não muda mais.

- [ ] **Step 1:** montar a loja de mentira e o esqueleto; Run: `npm run hobi:demo` (via `preview_start` `hobi-demo`). Expected: a página abre e o botão do Hobi aparece.
- [ ] **Step 2:** chamar `frontend-design` com as decisões acima e o Padrão visual como restrição; escrever a tela.
- [ ] **Step 3: conferir no navegador (Review Focus 1 e 3 e o resto), em 1280×800 e em 375×812:**
  1. "quero ligar um LED com Arduino" → cartões com foto e preço, texto depois; **Adicionar** muda para "Adicionado".
  2. colar uma lista de 3 linhas → tabela com total.
  3. navegar para `/produto` no meio → a conversa volta, o robô não é pedido de novo, o contexto leva o sku.
  4. abrir `/carrinho/x` → o botão não existe.
  5. parar o servidor e mandar mensagem → aviso com o WhatsApp, sem erro no console; recarregar com o servidor parado → nenhum botão, nenhum erro no console.
  6. digitar um CPF → a pergunta de confirmação.
  7. teclado: Tab chega a tudo, Esc fecha, foco volta ao botão.
  8. Review Focus 2: com `--roteiro=marcacao`, a marcação aparece escrita como texto e nenhum alerta abre; com `--roteiro=barrada`, aparece a frase segura e o botão do WhatsApp.
  Expected: os 8 passam; `read_console_messages` sem erro do widget. Passar por `ecc:make-interfaces-feel-better`.
- [ ] **Step 4:** Run: `npm run hobi:montar && npm run teste:widget && npm run teste:assistente && npm run lint`. Expected: ok (a guarda do manifesto confere o publicado novo).
- [ ] **Step 5:** tirar as capturas (computador e celular: fechado, saudação, cartões, lista) e **mandar ao dono com `SendUserFile`**; é o "mostrar ao dono antes de instalar" da spec §6.
- [ ] **Step 6: Commit.**

### Task 4: o Rise grava o canal — configuração, segredos e o que falta para ligar

**Files:**
- Create: `src/lib/riseAi/cliente/painelDoCanal.js`
- Modify: `src/lib/riseAi/formularios.js`, `src/lib/riseAi/abasDeConfiguracao.js`, `src/app/rise-ai/configuracoes/acoes.js`, `src/lib/acessos/recursos.js` (rótulo: "Canais (Telegram e chat da loja)"), `scripts/teste-rise-ai.js`

**Interfaces (Produces):**
- Campos do formulário (aba `canais`): `chat.ligado`, `chat.publico`, `chat.nome`, `chat.boasVindas`, `chat.whatsapp`, `chat.turnstileSiteKey`, `chat.dias` (repetido, 0 a 6), `chat.turno1De`, `chat.turno1Ate`, `chat.turno2De`, `chat.turno2Ate`, `chat.principal` e `chat.reserva` (`"<provedor>/<modelo>"`; reserva vazia = sem reserva), `chat.limite.<nome>` para os 6 limites. `parcialDaConfiguracao` só devolve `chatDaLoja` quando algum `chat.*` veio, e o Salvar do Telegram continua sem tocar no chat (e vice-versa).
- `NOMES_DOS_SEGREDOS = ["openai", "anthropic", "turnstile"]`
- `servicoPreparado(env = process.env) → boolean` (`IA_SEGREDO` com 64 hexadecimais)
- `guardarSegredoDoChat(nome, valor, { usuario, env }) → Promise<{ ok: true } | { ok: false, erro }>` (valor aparado, de 10 a 400 caracteres; cifra com `derivarChave(env.IA_SEGREDO, "segredos")`; `upsert` em `SegredoDoAssistente`; auditoria `rise-ai.chatDaLoja.segredo` com `{ nome, cadastrado }` antes e depois, **nunca o valor**)
- `removerSegredoDoChat(nome, { usuario })`
- `testarChaveDoChat(provedor, { env, criarProvedor }) → Promise<{ ok, latenciaMs, erro }>` (decifra e chama `testar()` do provedor, que só lista modelos: não gasta)
- `estadoDoChatDaLoja({ config, env, agora }) → Promise<{ preparado, segredos: Record<nome, { cadastrado, em }>, sinal: { em, versao, emAndamento, ultimoErro } | null, noAr: boolean, widget: { versao, etiqueta } | null, faltas: string[] }>` (`noAr` = sinal com menos de 2 minutos)
- `faltasParaLigar({ preparado, segredos, canal }) → string[]`, na ordem: "o serviço do chat ainda não foi preparado na VPS", "a chave da IA (`<provedor principal>`)", "o segredo do Turnstile", "a chave pública do Turnstile", "o link do WhatsApp".
- Ações: `guardarSegredoDoChatAcao(nome, formData)`, `removerSegredoDoChatAcao(nome)`, `testarChaveDoChatAcao(provedor)`, todas pelo recurso `riseAi.configuracoes.canais` em `editar`.
- Regra do Salvar: `chat.ligado = true` com `faltasParaLigar` não vazia → `{ ok: false, erros: { "chat.ligado": "Para ligar falta: …" } }`, nada gravado. Mudança no grupo entra na trilha como `rise-ai.chatDaLoja` (antes e depois do grupo inteiro; ele não tem segredo).

- [ ] **Step 1: testes que falham** (`teste-rise-ai.js`, bloco novo): formulário → parcial (com os valores de fábrica da spec §8); Salvar do chat não muda o Telegram; segredo vai cifrado (a coluna não contém o valor; abre com a chave "segredos"; **não** abre com a chave "passe" nem com o `IA_SEGREDO` cru); a auditoria não contém o valor; sem `IA_SEGREDO` → `{ ok: false }` com "o serviço do chat ainda não foi preparado"; `faltasParaLigar` nas 5 situações; Review Focus 4 (ligar sem chave recusa; remover a chave com o chat ligado → `estado.faltas` volta a listar a chave); usuário sem `canais` em `editar` → recusado; `testarChaveDoChat` com provedor falso (ok e erro); a etiqueta do `estado.widget` igual à de `etiquetaDoWidget`.
- [ ] **Step 2:** Run: `npm run teste:rise-ai`. Expected: FALHA no bloco novo.
- [ ] **Step 3: implementar.**
- [ ] **Step 4:** Run: `npm run teste:rise-ai && npm run teste:assistente && npm run teste:acessos && npm run lint`. Expected: ok.
- [ ] **Step 5: Commit.**

### Task 5: a tela Canais › Chat da loja

**Files:**
- Create: `src/components/riseAi/CanalChatDaLoja.jsx`
- Modify: `src/components/riseAi/AbaCanais.jsx` (duas abas internas, "Telegram" e "Chat da loja", todas montadas e a outra `hidden`), `src/app/rise-ai/configuracoes/page.jsx` (passa `estadoDoChatDaLoja` e a configuração do grupo)

**Interfaces:** Consumes tudo da Tarefa 4; `Interruptor`, `RodapeDaAba`, `useSalvarAba`, `BolhaDeAjuda`, `ConclusaoDoEnvio` não se aplica (salvar comum).

**Decisões da tela** ("o dono precisa ver primeiro **se o chat está no ar e o que falta**, e a ação principal é **Salvar**"):
- Topo: o estado numa linha (ponto colorido + "No ar, versão X, N respostas agora" / "Desligado" / "Ligado, mas fora do ar: falta …") e o interruptor **Chat da loja ligado** (desabilitado com o motivo no `title` enquanto houver falta). Ao lado, a escolha **Quem vê**: "Só com ?assistente=1" / "Todos os visitantes" (rádios lado a lado, `EscolhaDoTipo`).
- Três grupos em abas internas (regra 5), não empilhados: **Atendimento** (nome, saudação, link do WhatsApp, dias e os dois turnos), **Chaves e instalação** (chave da IA do provedor principal e da reserva, segredo e chave pública do Turnstile, cada segredo com campo só de escrita + Guardar, "cadastrada em dd/mm" e Remover com confirmação; **Testar chave**; a etiqueta num campo só de leitura com **Copiar**), **Limites e modelos** (os 6 limites e os dois modelos, escolhidos entre os que têm preço cadastrado).
- Ajuda só em bolha "i" (de onde vem cada chave; que a etiqueta nova só vale depois de colada na Loja Integrada). Sem texto fixo embaixo de campo.
- Somente leitura para quem não edita (`MOTIVO_SO_LEITURA`).

- [ ] **Step 1:** chamar `frontend-design` com as decisões e o Padrão visual; escrever a tela.
- [ ] **Step 2: conferir no navegador** (servidor `dev` do projeto; no PC o `.env` não tem `IA_SEGREDO`): a tela abre "Desligado", o interruptor desabilitado diz "o serviço do chat ainda não foi preparado na VPS"; salvar nome e saudação grava e volta; os campos de segredo recusam com o mesmo motivo; Copiar copia a etiqueta; a aba Telegram continua igual. Depois, **só nesta conferência**, subir o `dev` com um `IA_SEGREDO` de teste no ambiente do processo (gerado na hora, sem tocar no `.env`) e guardar um segredo de mentira `zz-...`: aparece "cadastrada em", o campo esvazia, Remover pede confirmação; apagar a linha `zz` no fim.
  Expected: tudo acima; captura enviada ao dono com `SendUserFile`.
- [ ] **Step 3:** passar por `ecc:make-interfaces-feel-better`; Run: `npm run lint && npm run teste:rise-ai`. Expected: ok.
- [ ] **Step 4: Commit.**

### Task 6: as conversas da loja na Revisão do dia

**Files:**
- Create: `src/lib/riseAi/cliente/revisaoDaLoja.js`
- Modify: `src/lib/riseAi/revisao.js` (comentário e tipo do `canal`), `src/lib/riseAi/sugestoes.js` (`listarSugestoes` devolve `deCliente`), `src/components/riseAi/RevisaoDoDia.jsx`, `src/components/riseAi/SugestoesDaIA.jsx`, `scripts/teste-rise-ai.js`

**Interfaces (Produces):**
- `resumoDaRespostaDaLoja(estruturado) → { cartoes: { sku, nome, preco, faixa, papel }[], lista: { linhas: { pedido, quantidade, sku, subtotal }[], total } | null, passagem: string | null, barrada: { motivo, texto } | null }` (puro; `estruturado` nulo ou de outro formato → tudo vazio).
- `conversasDoDia` → item com `canal: "LOJA"` e `visitante: string` (os 6 primeiros caracteres da sessão) quando a conversa é da loja.
- `listarSugestoes` → item com `deCliente: boolean` (a mensagem de origem é de conversa de canal de cliente).

**Decisões:**
- Selo **"pela loja"** na lista (ao lado dos selos que já existem) e "Visitante `<6 caracteres>`" no lugar do login.
- Na leitura, sob cada resposta da loja: os cartões mostrados (código, nome, preço, faixa, papel) numa lista compacta; a lista orçada com o total; "Passou para o WhatsApp: `<motivo>`"; e, quando o filtro barrou, um quadro âmbar **"Barrada pelo filtro (`<motivo>`)"** com o texto original que o visitante NÃO viu. A nota do visitante aparece como "👎 do visitante" / "👍 do visitante".
- **O 👎 do visitante não gera sugestão sozinho** (decisão minha: geraria uma chamada paga a cada clique de qualquer pessoa). Ele já põe a conversa no topo como "sinalizada"; o dono usa os botões que existem, "Gerar sugestão" ou "Propor correção".
- Sugestão vinda de conversa de cliente leva o selo **"veio de conversa com cliente"**, e a nota aprovada nasce **interna** (`ADMIN`); só o dono a torna pública, no seletor que a nota já tem.

- [ ] **Step 1: testes que falham:** `resumoDaRespostaDaLoja` (com cartões; com lista; barrada; nulo); `conversasDoDia` com uma conversa `loja:zz-…` (canal, `visitante`, sinalizada depois de `avaliacao: -1` com `avaliadoPor: "visitante"`); `listarSugestoes` com `deCliente: true` para sugestão de conversa da loja e `false` para as demais; aprovar essa sugestão cria nota com `visibilidade: "ADMIN"`.
- [ ] **Step 2:** Run: `npm run teste:rise-ai`. Expected: FALHA no bloco novo.
- [ ] **Step 3: implementar** a lib e as telas.
- [ ] **Step 4: conferir no navegador:** conversar na loja de mentira (Tarefa 3), dar 👎, provocar uma resposta barrada (roteiro com preço inventado), abrir a Revisão do dia: selo, cartões, quadro âmbar e "👎 do visitante". O roteiro é o `--roteiro=barrada` da Tarefa 3.
- [ ] **Step 5:** Run: `npm run teste:rise-ai && npm run lint`. Expected: ok. **Commit.**

### Task 7: o gasto no Consumo e a linha na Saúde

**Files:**
- Modify: `src/lib/riseAi/consumo.js`, `src/app/rise-ai/consumo/page.jsx`, `src/lib/saude/regras.js`, `src/lib/saude/coletar.js`, `scripts/teste-rise-ai.js`, `scripts/teste-saude.js`

**Interfaces (Produces):**
- `gastosOutrosPorDia` **não soma** `GastoIA` de tipo `CONVERSA`: a resposta da loja já está na linha do modelo (pelo custo gravado na mensagem), e hoje aparece duas vezes.
- Rótulo da barra: "Clientes (loja e WhatsApp)".
- `avaliarAssistente({ ligado, sinalEm, emAndamento, versao, ultimoErro }, agora) → { estado, detalhe }`: desligado → `info` "Chat da loja desligado."; ligado e sem sinal ou sinal com mais de 2 minutos → `falha` "O serviço do chat não dá sinal há …"; sinal fresco com `ultimoErro` → `atencao` com o erro; sinal fresco → `ok` "No ar, versão X, N respostas agora.".
- Item `{ id: "assistente", rotulo: "Assistente da loja", caminho: "/rise-ai/configuracoes?aba=canais" }` em `coletarSaude`; no PC, `info` "Só roda na VPS." (como as rotinas do worker).

- [ ] **Step 1: testes que falham:** um `GastoIA` `CONVERSA` de teste não aparece em `gastosOutrosPorDia` e um `BUSCA` continua aparecendo; `avaliarAssistente` nos 4 casos; `coletarSaude` no modo VPS com a linha `SinalDoAssistente` de teste (e devolvendo a do dono no fim) e no modo PC.
- [ ] **Step 2:** Run: `npm run teste:rise-ai && npm run teste:saude`. Expected: FALHA nas novas.
- [ ] **Step 3: implementar.** A falha do assistente entra sozinha no aviso de saúde do Telegram (ele lê `itensEmFalha`).
- [ ] **Step 4:** Run: os dois testes e `npm run lint`. Expected: ok. Conferir as duas telas no navegador. **Commit.**

### Task 8: documentação e ritual de fim

- [ ] `CLAUDE.md`: linha do Estado, as linhas novas em "Rodar" (`teste:widget`, `hobi:demo`, `hobi:montar`, `hobi:mascote`, contagens novas), a seção "Chat da loja (o Hobi), fase 2" (mapa dos arquivos, **como publicar uma versão do widget**, o que foi medido no carrinho da LI, as decisões) e o que não foi visto.
- [ ] Spec: §5.4 e §6 com o que mudou (rotas, `publico`, imagens embutidas, sem "Acompanhar meu pedido" até a fase 3).
- [ ] Memória `projeto-chat-ia-na-loja.md` e a linha do `MEMORY.md`.
- [ ] Ritual: `npm run lint`, `teste:extracao`, `teste:coleta`, `teste:cadastros`, `teste:assistente`, `teste:ia-isolamento`, `teste:widget`, `teste:rise-ai`, `teste:saude`, `teste:acessos`, `teste:mcp` e, sozinho, `teste:worker`.
- [ ] Commit, push, e a mensagem final com "O que foi feito" e "Testes que você precisa fazer".

## Decisões minhas neste plano (o dono confere)

1. **As imagens do mascote vão embutidas no arquivo do widget**, e não como arquivos à parte: um arquivo só, tudo coberto pela integridade, nenhuma rota a mais no endereço público. Custo: o arquivo fica uns 60 KB maior.
2. **O nome do arquivo do widget é pelo conteúdo** e os publicados antigos nunca são apagados: a etiqueta antiga continua funcionando até você colar a nova.
3. **"Só com ?assistente=1" entra agora** (campo "Quem vê"), para a fase 4 não exigir outra versão do widget.
4. **Sem minificar** o widget (nenhuma dependência nova); o Caddy já comprime.
5. **O 👎 do visitante não chama a IA sozinho**; ele sinaliza a conversa e você decide gerar a sugestão.
6. **A tela não deixa ligar o chat enquanto faltar alguma coisa**, e diz o que falta.
7. **O recorte do mascote é automático** (fundo claro a partir das bordas). Se ficar ruim em alguma imagem, eu mostro e a saída é você gerar aquela imagem com fundo transparente.
8. **O carrinho de teste:** ao medir a loja em 20/11/2026 eu adicionei 2 unidades do 121208 a um carrinho anônimo do navegador do Claude; nenhuma compra, nenhum pedido.

## O que esta fase NÃO faz

Acompanhar pedido (fase 3). DNS, Cloudflare, chaves de verdade, etiqueta na Loja Integrada e o chat aparecendo para clientes (fase 4). WhatsApp. Cupom, balões automáticos, lista por arquivo, "avise-me".

## Subida na VPS (fora das tarefas)

Um deploy comum, só com o "sobe": não tem migration; o serviço `ia` (se já estiver preparado) passa a servir o widget e o modelo do Caddy é atualizado pelo próprio deploy. Sem o `preparar-ia.sh`, nada muda na VPS além das telas do Rise.
