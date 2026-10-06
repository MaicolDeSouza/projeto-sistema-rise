# Nano Banana nas fotos do produto, com reserva de imagens — desenho

Data: 05/10/2026. Status: aprovado em brainstorming, seções 1 a 6. Aguarda revisão da spec escrita.

## 1. Objetivo

Na janela "Fotos do produto" (cadastro e edição de produto), além da foto original e da versão do Photoroom, entra uma terceira opção: a foto refeita pelo **Nano Banana** (modelos de imagem do Google, API Gemini), gerada **dentro do Rise**. O uso é um só: **foto de estúdio limpa do mesmo produto** (fundo branco, iluminação uniforme, mesmo ângulo, cores, textos e conectores intactos).

Junto entra uma mudança no que o produto guarda: a **reserva de imagens**. Originais e versões geradas deixam de sumir no Salvar e ficam com o produto, escondidas atrás de um botão. Só o que o dono excluir se perde.

## 2. Decisões do dono (brainstorming de 05/10/2026)

- Resultado desejado: foto de estúdio limpa do **mesmo** produto. Não é render nem ilustração.
- O Nano Banana parte **sempre da foto original** (a que chegou), nunca da versão do Photoroom.
- Imagens extras **por geração**: outras fotos do carrossel (marcadas) ou arquivos enviados na hora. Não há "exemplo fixo da loja".
- **Uma geração por clique**, com confirmação de preço. "Gerar de novo" cobra de novo.
- Seletor de modelo: **Nano Banana 2** (padrão), **Nano Banana Pro**, **Nano Banana 2 Lite**. O Nano Banana 1 fica fora (legado).
- **Um prompt salvo por modelo**, no banco, com padrão escrito no código; "Salvar prompt" sobrescreve; "Voltar ao salvo" descarta a edição.
- Chave e faturamento do Google ainda **não existem**: criar é a primeira tarefa do dono. O código entra testado com chamada simulada.
- Layout **B**: dois quadros como hoje; o da direita com abas **Photoroom | Nano Banana** e os controles de cada um embaixo dele.
- **Reserva:** guarda só o que foi trabalhado (originais das fotos escolhidas, versões geradas, e o que for mandado para a reserva). Candidata da lupa nunca tocada continua descartada no Salvar.
- Abordagem de código: **generalizar "versão" para N provedores** (versão nomeada), não encaixar ao lado.
- Execução: **inline, sem subagentes**; tarefas simples com Sonnet, complexas com Opus (marcadas no plano).

## 3. O que o código de hoje impõe

- O Photoroom tem prévia grátis (sandbox, marca d'água) e resultado determinístico; por isso o fluxo é "ver de graça, comprar o que viu". O Google **não tem sandbox para imagem** e **cada chamada sai diferente**: no Nano Banana, gerar já é pagar. Fluxo: gerar (pago, confirmado) → ver → "Escolher essa" ou "Gerar de novo".
- A versão da foto hoje é o booleano `imagem.melhorada` (+ `temMelhorada`), espalhado por `lote.js`, `acoes-imagens.js`, `PainelDeImagens.jsx`, `JanelaDeFotos.jsx` e `teste-imagens.js`. O "Cancelar" da janela restaura a versão por esse booleano. É a mudança mais delicada.
- `photoroom.js` registra que o "beautify" **redesenhou o produto** (um Arduino virou outra placa). O Nano Banana é generativo: mesmo risco, maior. A defesa é o prompt, as imagens extras e a revisão lado a lado com zoom, que já existe.
- O que o Nano Banana herda: padronizador (1024×1024, fundo branco), lote temporário, auditoria em `LogIntegracao`, cotação do dólar, trava no `.env`.

## 4. Fatos da API do Google (conferidos na documentação oficial em 05/10/2026)

| Modelo | id | Preço por imagem (1K) | Observação |
| --- | --- | --- | --- |
| Nano Banana 2 Lite | `gemini-3.1-flash-lite-image` | US$ 0,034 | só 1K; "não otimizado para várias referências" |
| **Nano Banana 2** | `gemini-3.1-flash-image` | US$ 0,067 | padrão; até 14 referências; 0,5K a 4K |
| Nano Banana Pro | `gemini-3-pro-image` | US$ 0,134 | maior qualidade; melhor com texto na imagem |
| Nano Banana 1 | `gemini-2.5-flash-image` | US$ 0,039 | legado, fora |

- Sem camada gratuita para gerar imagem. Toda geração cobra.
- Toda imagem sai com marca **SynthID**, invisível.
- Saída 1:1 em 1K cabe direto no padronizador. 2K/4K custam mais e seriam reduzidos; não se usam.
- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/<modelo>:generateContent`, chave em `x-goog-api-key`. **O formato exato do corpo se confirma com a chave na mão** (a documentação mostra um formato novo, com `previous_interaction_id` e `output_image`, ao lado do clássico `contents/parts/inlineData`). Primeira tarefa do plano.
- Os preços ficam em `MODELOS` no código, com a data em que foram conferidos. Se o Google mudar, é uma linha.

Fontes: https://ai.google.dev/gemini-api/docs/image-generation e https://ai.google.dev/gemini-api/docs/pricing.

## 5. Dados, lote e reserva

### 5.1 Versão nomeada (substitui o booleano)

- `imagem.versao`: `"original" | "photoroom" | "nanobanana"` — a que está em `imagens/<base>.jpg` agora.
- `imagem.versoes`: `{ photoroom: boolean, nanobanana: boolean }` — quais versões geradas existem guardadas.
- `imagem.urls`: `{ original, photoroom, nanobanana }` — endereços das guardadas, para a janela mostrar sem chamar ninguém.

### 5.2 Lote temporário (`dados/temporarios/<lote>/`)

- `versoes/<base>.original.jpg`, `.photoroom.jpg`, `.nanobanana.jpg`. O `.melhorada.jpg` de hoje vira `.photoroom.jpg`; a leitura aceita o nome antigo como `photoroom` (lote vive no máximo 24 h; sem conversão).
- `extras/<base>.<n>.<ext>` — imagens extras enviadas de fora para aquela foto. Extra vinda do carrossel não é copiada: na chamada, o servidor lê o original dela pelo `base`.
- `geracoes/<base>.json` — modelo, prompt e extras da última geração ("Gerar de novo" repete o pedido; auditoria sabe o que foi pedido).

Regras: "Escolher essa" copia a versão guardada para `imagens/<base>.jpg`, sem custo, para qualquer versão. "Cancelar" restaura `versao` por nome. Trocar o conteúdo da foto zera a validação.

### 5.3 Banco (`ProdutoArquivo`, migration)

- `papel`: `FOTO` (carrossel e anúncios) ou `RESERVA` (guardada, escondida).
- `versao`: `original | photoroom | nanobanana`.
- `grupo`: id que liga o original e as versões geradas da mesma foto.
- Fotos existentes: `papel = FOTO, versao = original, grupo = id`. Nenhuma linha some.

`PromptImagem` (nova): `modelo` (chave), `texto`, `atualizadoEm`.

`Servico` ganha `GEMINI`.

Tudo numa migration só, escrita à mão (os índices que só existem no SQL ficam de fora). Entra quando a outra frente não estiver no meio de uma migration. Remover a coluna `finalizada` sem uso só se for barato.

### 5.4 Disco do produto

`dados/produtos/<SKU>/reserva/` para as `RESERVA`, com o mesmo nome gerado. A rota `/api/arquivos` passa a conhecer a pasta.

### 5.5 Salvar

- Foto com "Escolher essa": a versão escolhida vira `FOTO`; o original e as outras versões geradas viram `RESERVA`, no mesmo `grupo`.
- Foto sem "Escolher essa" mas com versão gerada (paga): nada vai para o carrossel; original e versões viram `RESERVA`.
- Candidata nunca tocada (sem geração, sem escolha): descartada, como hoje.
- Excluída na tela: apagada de verdade, do carrossel ou da reserva.
- As 100 fotos do produto contam só as `FOTO`. A reserva não tem teto por enquanto (~200 KB por imagem).

### 5.6 Reabrir um produto

O painel carrega as `FOTO` como hoje; a reserva entra escondida, atrás de "Reserva (N)". Dali, "Escolher essa" traz a imagem para o carrossel (a que estava lá, se for do mesmo grupo, desce para a reserva) e "Gerar com Nano Banana" parte do original guardado.

## 6. Integração com o Google

Dois arquivos novos, no molde do Photoroom:

- `src/lib/integracoes/nanobanana.js` (sem banco, testável sem rede): `MODELOS` (id do Google, nome na tela, preço em dólar, data da conferência, se aceita extras), `PROMPT_PADRAO`, `avaliarConfiguracao(env)`, `montarPedido(...)`, `gerarImagem(...)`, `mensagemDeErro(status, corpo)`.
- `src/lib/integracoes/nanobananaLog.js`: `registrarChamada` e `usoDoNanoBanana` em `LogIntegracao`, modelo no `endpoint`, sem chave, sem imagem, sem prompt.

`.env`: `GEMINI_API_KEY=`, `NANO_BANANA_GERACAO=false` (trava), `NANO_BANANA_TETO_DIA=50`.

Chamada: prompt + foto original em base64 + extras em base64, pedindo só imagem, 1:1, 1K; tempo limite 120 s. A resposta passa pelo padronizador antes de ser guardada.

Erros traduzidos: chave recusada (401/403); faturamento ausente (403 com a mensagem do Google); cota ou limite (429); recusa por conteúdo ("o Google recusou esta foto, tente outra ou mude o prompt"); resposta sem imagem (mostra o texto que o Google devolveu). Chamada que não saiu não entra no log nem conta no teto.

Ritmo: uma geração por vez por foto, recusada na tela e no servidor.

## 7. Tela (layout B)

Janela "Fotos do produto": quadro da direita com abas **Photoroom | Nano Banana**, lembrada por foto.

Aba Nano Banana, de cima para baixo:

1. Quadro com o resultado da última geração (zoom e ampliação iguais aos de hoje). Vazio: "O resultado aparece aqui. Cada geração custa R$ X."
2. Modelo: lista com os três, preço em reais ao lado; padrão Nano Banana 2; o 2 Lite com o aviso "ignora as imagens extras".
3. Prompt: caixa já preenchida com o salvo do modelo; "Salvar prompt" só acende quando o texto difere do salvo; "Voltar ao salvo". Editar sem salvar vale só para esta geração. Até 2.000 caracteres; vazio deixa o "Gerar" cinza.
4. Imagens extras: tira com as outras fotos do carrossel (clicar marca); "+ Enviar" para arquivo de fora (mesmas regras do envio de foto); "×" para tirar. Até 5. Vazio é normal: a original sempre vai.
5. Botões: "Gerar (R$ 0,35)" e "Escolher essa". Depois de gerar: "Gerar de novo (R$ 0,35)".

Confirmação de preço (faixa amarela, como no Photoroom): "Gerar com Nano Banana 2 por R$ 0,35 (US$ 0,067)? Cada geração é cobrada e sai diferente." Enquanto gera: "Gerando... (uns 10 a 30 s)".

"Escolher essa" marca a versão `nanobanana` como a da foto, selo "Validada". As outras versões continuam disponíveis para trocar sem custo.

Aba Photoroom: como hoje; só o nome interno da versão muda (`melhorada` → `photoroom`).

Painel: botão **"Reserva (N)"** ao lado de "Melhorar" (só em produto existente): grade de miniaturas com a etiqueta da versão e os botões "Escolher essa" e "Excluir" (com confirmação).

Rodapé da janela: "Nano Banana no mês: R$ X", ao lado do do Photoroom.

Sem chave ou trava desligada: faixa com o motivo na aba, "Gerar" cinza, o resto funciona.

## 8. Prompt e pedido à IA

Prompt padrão (ponto de partida, o dono refina na tela):

> Digitalize esta foto de produto de loja de componentes eletrônicos, reproduzindo-a fielmente, como um scanner de alta resolução, mantendo o aspecto original. Mantenha exatamente o produto da foto: mesma forma, proporções, cores, conectores, pinos, componentes, marcações, textos e etiquetas impressas. Copie cada texto e cada detalhe como estão, sem redesenhar, sem recriar e sem "corrigir". Mesmo ângulo, mesmo enquadramento e mesma iluminação da foto original. Deixe o fundo branco puro, sem sombra dura e sem reflexo. Não acrescente, não remova e não altere nenhum elemento. Sem texto, logo ou marca d'água adicionados.
>
> (Versão de 06/10/2026, a pedido do dono: "digitalizar a foto mantendo o aspecto original". A primeira versão pedia para "recriar a peça como foto de estúdio", e no teste com a chave real o texto impresso miúdo saiu redesenhado, e não copiado.)

Regra fixa acrescentada pelo sistema quando há extras (não aparece na caixa): "As imagens a seguir são do mesmo produto e servem só como referência de forma e acabamento."

Ordem de envio: foto original primeiro, depois as extras na ordem marcada.

"Gerar de novo": repete modelo, prompt e extras da última geração, a menos que algo tenha mudado na tela. **Só a última geração do Nano Banana fica guardada por foto**; a anterior é substituída. Para ficar com as duas: "Escolher essa" na primeira antes de gerar a segunda.

Na reserva do produto vai só a imagem (`versao = nanobanana`), sem o prompt.

## 9. Custo, travas e auditoria

- `NANO_BANANA_GERACAO=false`: desligada, "Gerar" cinza com o motivo.
- Confirmação de preço a cada geração, sem "não perguntar de novo".
- Uma geração por vez por foto.
- `NANO_BANANA_TETO_DIA` (padrão 50): passou, "Gerar" avisa e para.
- Custo em reais pela cotação de `cotacaoDolar.js` (fixa por ora), dólar entre parênteses; estimativa sem IOF.
- `LogIntegracao` com `servico = GEMINI`: modelo no `endpoint`, status, duração; no resumo: pixels da original, quantas extras, tamanho do prompt, se era "gerar de novo". Nunca a chave, a imagem nem o prompt.
- `usoDoNanoBanana`: gerações com status 200 de hoje e do mês; gasto do mês = soma por modelo × preço. Erro não conta como gasto.
- Alerta de orçamento no Google Cloud: passo opcional do dono (§11).

## 10. Testes

Automáticos, em `teste:imagens`, sem rede (`fetch` simulado):

- `nanobanana.js`: configuração (sem chave, trava, teto); pedido (prompt, original, extras na ordem, 1:1, 1K); cada erro traduzido; resposta sem imagem.
- Lote: versão nomeada nas três; `.melhorada.jpg` lido como `photoroom`; extras e `geracoes/` somem com a foto e com o lote.
- Gerar: cobra uma vez; trava não chama; teto barra; "gerar de novo" substitui; duas ao mesmo tempo, só uma passa.
- Salvar com reserva: escolhida vira `FOTO` e as outras `RESERVA` no mesmo grupo; paga sem escolha vai para a reserva; intocada descartada; excluída some do disco.
- Reabrir: reserva escondida; "Escolher essa" troca com a do carrossel; "Excluir" apaga.
- Prompt: salvar, voltar ao salvo, padrão do código sem linha.
- Log: sem chave, imagem ou prompt.

Manuais, no plano: script descartável `scripts/teste-nano-banana.js` com a chave real (uma foto do dono, Nano Banana 2 e Pro lado a lado) para confirmar o formato do corpo e comparar os modelos; passada na tela com produto novo e existente.

## 11. Passos do dono (fora do código)

1. Em aistudio.google.com: "Get API key" → "Create API key" (projeto novo, ex. "Rise"). Copiar a chave uma vez.
2. Ativar o faturamento ("Plan / Billing" → Google Cloud, cadastrar cartão). Sem isso, gerar imagem dá erro.
3. Conferir que a chave aparece como paga.
4. Colar em `GEMINI_API_KEY=` no `.env`; reiniciar o servidor. Ligar `NANO_BANANA_GERACAO=true` só depois do teste.
5. Opcional: orçamento mensal com alerta por e-mail no Google Cloud.

## 12. Fora desta rodada

- Várias gerações do Nano Banana por foto (só a última fica).
- Prompt por produto; prompt gravado junto da imagem na reserva.
- Teto de tamanho da reserva.
- Nano Banana a partir da foto do Photoroom (encadear).
- Edição em etapas e 2K/4K.
- Nano Banana 1 (legado).

## 13. Execução

Inline, sem subagentes. No plano, cada tarefa leva **Sonnet** ou **Opus**. Opus: versão nomeada no lote e na janela (§5.1, §5.2), Salvar com reserva (§5.5), chamada ao Google com erros (§6). Sonnet: prompt salvo, tira de extras, log, `.env`, migration, textos de tela, testes de regra.
