# Assistente 4hobby no site da loja (chat com IA)

Data: 19/11/2026. Decidido em conversa com o dono (Maicol), a partir do Assistente Mamute
(https://www.mamuteeletronica.com.br/), que ele testou e mostrou em prints. Continua a spec
`2026-10-12-rise-ia-agente-design.md` (o agente do WhatsApp) e **muda uma decisão dela**: o "chat de IA dentro da loja da
LI" deixou de ser não objetivo (§2 de lá) e passa a ser o **primeiro canal de cliente**, antes do WhatsApp.

## 1. Por quê

O dono perguntou ao chat da Mamute "quero fazer um projeto com Arduino para ligar LED, você tem peças para isso?" e
recebeu, em cartões com preço, estoque e botão de comprar, o Arduino, o LED, o resistor de 220 Ω e a protoboard. Ele quer
isso na loja da 4hobby (Loja Integrada), usando **a mesma inteligência e a mesma memória** que depois vão atender o
WhatsApp ("dois caminhos, a mesma inteligência").

**Sucesso:** o visitante descreve o que quer fazer, ou cola uma lista de peças, e em segundos vê os produtos certos da
loja, com preço e estoque reais, e os põe no carrinho; quem pergunta "cadê meu pedido" vê a situação e o rastreio; quando
a IA não sabe, o cliente cai no WhatsApp da loja; o dono lê as conversas na Revisão do dia e o gasto fica no teto.

## 2. Objetivos, não objetivos e anti-objetivos

**Objetivos (1ª versão, "Opção 2" do dono):** achar produto e montar projeto; orçar lista de peças colada; adicionar ao
carrinho da loja; acompanhar pedido; botão "Falar no WhatsApp"; conversas na Revisão do dia; o cérebro pronto para o
WhatsApp.

**Não objetivos (ficam para depois):** cupom do assistente; balões que abrem sozinhos (busca sem resultado, carrinho
parado); nota fiscal por código no e-mail; grupo de comparação de 10% e eventos de venda; lista enviada como arquivo;
orçamento salvo com link; "avise-me quando chegar"; caixa de entrada para a Andrea responder pelo site; o WhatsApp em si
(Entrega B da spec de 12/10); pesquisa na internet (o canal do cliente nunca pesquisa).

**Anti-objetivos (fracasso mesmo funcionando). Os dois primeiros são regra do dono, em 19/11/2026:**

1. **Vazar dado.** Custo, margem, fornecedor, localização, quantidade em estoque, dado de cliente, dado de pedido além
   da situação, conversa interna, token ou chave: nada disso pode sair, nem com a IA enganada, nem com o serviço invadido.
2. **Pôr o Rise em risco.** Ataque, erro ou sobrecarga no chat não pode derrubar, deixar lento, nem dar acesso ao painel,
   ao banco inteiro ou às contas do Bling, do Mercado Livre e da Loja Integrada.
3. A IA inventar preço, estoque, prazo ou característica.
4. O chat quebrar ou atrasar a loja (página, carrinho, checkout).
5. O gasto com IA passar do teto sem aviso.
6. O assistente fingir ser uma pessoa.

## 3. Como a Mamute fez (lido do código público do widget em 19/11/2026)

Sistema próprio: um arquivo JavaScript (`widget.js`, 157 KB, Shadow DOM, sem iframe) colado na loja, falando com um
servidor separado (`bot.mamuteeletronica.com.br`). `GET /status` devolve a configuração; `POST /chat` devolve a resposta em
fluxo (SSE) com eventos tipados (`status`, `text`, `cards`, `lista`, `handoff`, `opcoes`, `error`, `desligado`, `done`). O
cartão traz sku, nome, imagem, preço, em estoque, link e o "papel" da peça no projeto. Pedido é um formulário fixo (número +
CPF, CNPJ ou e-mail), não a IA. Proteção: Cloudflare Turnstile, limite de mensagens (429), teto de gente ao mesmo tempo
(503 "lotado"), aviso de CPF/cartão. A "inteligência do resistor" é do modelo: ele decompõe o projeto e busca cada peça.
O servidor deles é inferido; o chat não foi testado ao vivo (passa por verificação de robô). Detalhe em
`memory/projeto-chat-ia-na-loja.md`.

## 4. Abordagens

| | Como | Troca |
| --- | --- | --- |
| 1 | Porta pública dentro do app do Rise | mais rápida; o chat divide processo, chaves e banco com o painel |
| **2 (escolhida)** | **Serviço separado, sem as chaves do Rise e com usuário próprio no banco** | mais trabalho antes da 1ª conversa; contêiner e usuário de banco novos na VPS |
| 3 | Ferramenta pronta de chat com IA | mensalidade, segundo cérebro fora do Rise, diferente do WhatsApp |

O dono pediu "uma opção mais segura e que consiga reaproveitar para WhatsApp" e fixou os anti-objetivos 1 e 2: só a
Opção 2 os atende **por construção** (o que o serviço não alcança, ele não vaza), e não por cuidado do código.

## 5. Arquitetura: um cérebro, duas portas

```
visitante ── loja (LI) ── widget fixado ──► hobi.4hobby.com.br (Caddy, bloco próprio)
                                                   │ só 5 rotas
                                             contêiner `ia`  ──► API da IA (chave própria, com teto)
                                             (sem chaves do Rise)  ──► Cloudflare (confere o robô)
                                                   │ usuário `rise_ia`
                                             Postgres: só visões públicas, 1 função de pedido,
                                             as conversas do canal e o orçamento dos clientes
```

- **Cérebro** (`src/lib/riseAi/cliente/`): prompt do cliente, ferramentas públicas, laço de ferramentas, filtro de saída,
  limites, orçamento, gravação da conversa. Devolve uma resposta neutra: texto + cartões + lista + passagem.
- **Porta 1, o site (esta spec):** HTTP + SSE para o widget.
- **Porta 2, o WhatsApp (Entrega B):** a mesma resposta, em texto, pela fila e pela Evolution. O serviço `ia` é o que a
  spec de 12/10 já previa; aqui ele nasce.

### 5.1 O contêiner `ia`

- Mesma imagem do app, outro comando (`node scripts/ia-processo.js`), servidor `node:http` (sem Next).
- **Ambiente próprio** (`deploy/ia.env`, fora do git), **nunca o `.env` do Rise**: só a URL do banco do `rise_ia`, o
  `IA_SEGREDO` (decifra os dois segredos dele, §5.3) e as origens permitidas. Sem `ENCRYPTION_KEY`, sem tokens, sem
  `RISE_SEGREDO_DE_BORDA`.
  **Como ficou na fase 1 (19/11/2026, decisão da execução, a conferir pelo dono):** o arquivo `deploy/ia.env` não existe. As
  duas variáveis (`IA_DATABASE_URL` e `IA_SEGREDO`) ficam no `.env` da VPS e chegam ao contêiner `ia` pela interpolação do
  compose, uma a uma, como o segredo de borda já chega ao Caddy: um `env_file` ausente quebraria o deploy das outras sessões.
  O que esta regra protege continua valendo e é testado: o contêiner `ia` recebe só 7 variáveis nomeadas, nunca o `.env`, e o
  processo se recusa a subir se achar uma chave do Rise. O custo: o app e o worker passam a ter no ambiente a URL do usuário
  restrito (menos poder do que já têm) e o `IA_SEGREDO` (que o app usa para cifrar as chaves do chat).
- Endurecido: usuário sem root, `read_only`, `cap_drop: ALL`, `no-new-privileges`, sem volume (não monta `dados/`),
  `/tmp` em memória, `mem_limit` e limite de processos próprios, reinício automático.
- **Redes:** `borda_ia` (só caddy e ia) e `dados_ia` (só ia e db). O `ia` **não alcança** `app`, `auth` nem `worker`.
- Só na VPS. No PC roda à mão para teste (`npm run ia`), contra o banco local.

### 5.2 O usuário do banco `rise_ia` (o coração da regra 1)

Papel sem superusuário, criado por migration à mão, com `CONNECTION LIMIT` e `statement_timeout` (não esgota o banco do
Rise). **Só enxerga:**

| O que | Como | O que NÃO tem |
| --- | --- | --- |
| Produtos publicados | visão `ia_produto_publico`: sku, nome, marca, modelo, preço de venda, **faixa de estoque** (`em falta` / `poucas unidades` / `disponível`, calculada na visão com a regra de `faixaDeEstoque`), link da loja, id do produto na LI, caminho da foto principal, descrição, peças do kit publicadas | custo, quantidade, localização, fornecedor, concorrente, NCM, produto não publicado |
| Conhecimento | visão só das notas APROVADAS e PÚBLICAS | notas internas, sugestões |
| Pedido | função `ia_situacao_do_pedido(numero, prova)` (`SECURITY DEFINER`): devolve situação, situação do envio, transportadora, rastreio, link de rastreio e data, **só se** a prova bate (dígitos do CPF/CNPJ ou e-mail do cliente do pedido). Canais LI e Bling | nenhuma leitura de `PedidoDeVenda` nem de `Cliente`; a função conta as tentativas e se recusa acima do limite (§8) |
| Conversas | `ConversaIA`/`MensagemIA` **só dos canais de cliente** (LOJA, depois WHATSAPP) | conversas do chat interno e do MCP |
| Orçamento | reserva e gasto do escopo CLIENTES | o resto |
| Configuração | visão com os campos do canal (prompt do cliente, textos, limites, ligado) e os dois segredos dele cifrados | `Conexao`, `ConfiguracaoIA` inteira, usuários, acessos |

Nenhuma outra tabela tem `GRANT`. **Teste de guarda** (`teste:ia-isolamento`): conecta como `rise_ia` e exige "permissão
negada" numa lista fechada (Produto, Cliente, PedidoDeVenda, Conexao, Fornecedor, UsuarioRise, conversa de canal CHAT…),
e que nenhuma coluna das visões se chame custo, estoque, localizacao, fornecedor. Migration nova que criar tabela não dá
acesso a ele por padrão (`ALTER DEFAULT PRIVILEGES` conferido no teste).

O construtor escolhe, com teste equivalente, entre segurança por linha (RLS) em `ConversaIA` e tabelas próprias do canal.

### 5.3 Os dois segredos do serviço

A chave da IA **dedicada ao chat** (com teto de gasto no painel do provedor, independente do nosso código) e o segredo do
Turnstile. O dono cola os dois **na tela do Rise** (§9), como todo token; o app os grava cifrados com a chave "segredos" derivada do `IA_SEGREDO`
(`derivarChave`, desde 20/11/2026: o `IA_SEGREDO` nunca é usado direto, e o passe do Turnstile tem outra chave), e o
`ia` os lê pela visão. Nunca em conversa, nunca em log.

### 5.4 O endereço

`hobi.4hobby.com.br`, **irmão** de `rise.4hobby.com.br`, nunca debaixo dele: o cookie de login do painel vale para
`rise.4hobby.com.br`, e um serviço público nesse nome poderia recebê-lo. Bloco próprio no Caddyfile: só `GET
/widget-<versão>.js`, `GET /status`, `POST /chat`, `POST /pedido` e `POST /avaliar`; corpo de até 16 KB; qualquer outro
caminho 404; sem `forward_auth`; `reverse_proxy ia:<porta>`. CORS só para a origem da loja. IP mascarado no log, como já é.

**Como ficou na fase 2 (20/11/2026):** o arquivo se chama `widget-<10 hexadecimais do conteúdo>.js` e responde a qualquer origem
(a conferência de integridade exige); `/pedido` entra na fase 3. `/status` devolve também `publico` (o campo "Quem vê").

## 6. O widget na Loja Integrada

**Como ficou na fase 2 (20/11/2026), decisões da execução:** as imagens do mascote vão **embutidas** no arquivo (um arquivo só, tudo
coberto pela integridade); o publicado antigo nunca é apagado depois que a etiqueta estiver na loja; o carrinho foi **medido** (o
endereço de comprar aceita `/adicionar/<quantidade>` e responde JSON; vários itens = um pedido por item, em fila); o atalho
"Acompanhar meu pedido" só aparece na fase 3; "Quem vê" (`?assistente=1` ou todos) já está no widget; a janela foi conferida numa
loja de mentira no PC (`npm run hobi:demo`), não na Loja Integrada.

- **Um arquivo**, JavaScript puro, Shadow DOM (o CSS da loja não o afeta, nem o contrário), carregado com `defer`.
- **Fixado por integridade:** a etiqueta colada na LI traz `integrity="sha384-…"` e o nome do arquivo com a versão. Se o
  servidor for invadido e o arquivo trocado, o navegador se recusa a rodar. Atualizar o widget = arquivo novo + etiqueta
  nova na LI (Configurações › Código HTML, a confirmar no painel; o Rise mostra a etiqueta pronta com Copiar).
- **Dado do servidor é sempre texto:** nada de HTML vindo da resposta; link só da loja; imagem só de
  `rise.4hobby.com.br/api/arquivos/…` (já públicas hoje).
- **Nunca quebra a loja:** tudo em `try/catch`; `/status` fora do ar ou desligado = o botão não aparece. **Não roda no
  carrinho nem no checkout.**
- **Tela** (desenho do print da Mamute, nas cores da 4hobby; o construtor mostra ao dono antes de instalar): botão
  flutuante com a cabeça do mascote; cabeçalho "Hobi · assistente virtual da 4hobby"; linha fixa "Este é um assistente de IA. Preço e estoque
  vêm da loja. Não envie senha nem dados de cartão."; atalhos (Encontrar um componente, Colar lista de peças, Acompanhar
  meu pedido, Falar no WhatsApp); conversa; cartões numerados com foto, nome, preço, faixa de estoque, "Ver produto",
  quantidade e "Adicionar"; 👍/👎 na resposta; campo de texto com Enter.
- **Contexto que manda:** tipo da página e o produto aberto (para "esse produto serve pro meu projeto?"). Nada do carrinho.
- **Carrinho:** o "Adicionar" usa o link do carrinho da própria loja (`/carrinho/produto/<id da LI>/adicionar`, medido na
  4hobby) e atualiza o mini-carrinho. Quantidade e vários itens de uma vez **a medir pelo construtor** no produto de
  teste; produto com opções obrigatórias só ganha "Ver produto".
- **Sessão:** id aleatório no navegador; a conversa volta ao navegar entre páginas e some ao fechar a aba.

## 7. O cérebro

- **Modelo:** GPT-4.1 mini, reserva Haiku 5.5 (decisão de 12/10); o construtor confere modelos e preços na hora e mostra
  ao dono as respostas a perguntas reais ("projeto com Arduino para ligar LED") antes de ligar.
- **Ferramentas (todas só de leitura, sobre as visões):** buscar produtos; ficha de um produto; comparar; similares;
  conhecimento público; **orçar lista** (até 50 linhas "10 resistor 10k": achado, não achado, alternativas, total);
  **mostrar produtos** (o modelo indica os SKUs e o papel de cada um no projeto; o servidor confere que vieram de uma
  busca desta conversa e monta os cartões pelos dados da visão, nunca pelo texto do modelo).
- **Filtro de saída, antes de qualquer texto chegar ao visitante:** todo "R$" tem de ter vindo de uma ferramenta nesta
  resposta; link só da loja; nenhum telefone além do da loja; sem termos internos (custo, margem, fornecedor,
  concorrente). Reprovou: troca por uma frase segura e oferece o WhatsApp.
- **Texto de terceiro é dado:** mensagem do visitante, descrição de produto e resultado de ferramenta nunca são instrução.
  Como nenhuma ferramenta tem efeito, o pior caso de uma IA enganada é texto errado, e ele passa pelo filtro.
- **Passagem para o WhatsApp** (botão com o link `wa.me` da loja): quando o cliente pede pessoa, a IA não acha nos dados,
  ou o assunto é pagamento, troca, reclamação ou garantia. Fora do horário, o botão avisa que a resposta vem no próximo
  dia útil.
- **Memória e ensino:** a mesma Revisão do dia; 👎 do visitante ou do dono vira sugestão com o selo "veio de conversa com
  cliente", nasce interna e só o dono a torna pública (regra da revisão 2 de 12/10). O que for aprovado vale no site e no
  WhatsApp.

## 8. Proteções contra abuso e custo (números de fábrica, editáveis na tela)

- **Robô:** Cloudflare Turnstile, conferido no servidor uma vez por sessão (depois vale um passe assinado por algumas horas).
- **Por sessão:** 30 mensagens por hora; 2.000 caracteres por mensagem; R$ 0,50 de IA por dia.
- **Por IP:** 60 mensagens por hora (o IP fica só na memória, nunca no banco).
- **Ao mesmo tempo:** 5 respostas em andamento; acima disso, "muita gente agora" + WhatsApp.
- **Dinheiro:** orçamento dos clientes de R$ 70 por mês e R$ 7 por dia, reservado antes de cada chamada (já existe);
  avisos de 80% e 100% no Telegram (já existem); esgotou = o chat mostra só o WhatsApp. Mais o teto na conta do provedor.
- **Pedido:** 5 erros por sessão, 10 consultas por IP por hora e, **dentro do banco**, 5 erros por número de pedido por
  dia e um teto geral por hora. A resposta de "não achei" é a mesma para pedido que não existe e para documento errado.
- **Chave geral:** interruptor "Chat da loja ligado" no Rise; desligado, o widget some em até 1 minuto.

## 9. No Rise

- **Rise AI › Configurações › Canais › Chat da loja** (só Administrador, não delegável, com auditoria): ligado; nome;
  boas-vindas; link do WhatsApp; horário; limites de §8; chave da IA e segredo do Turnstile (só escrita); a etiqueta para
  colar na LI (Copiar); estado do serviço.
- **Revisão do dia:** conversas do canal LOJA com o chip "pela loja", os cartões mostrados e a avaliação do visitante.
- **Consumo:** o gasto do canal na barra dos clientes. **Saúde do Rise:** linha "Assistente da loja" (sinal de vida).

## 10. Dados pessoais

A mensagem do visitante é **mascarada antes de ir ao modelo e antes de gravar** (CPF, CNPJ, e-mail, telefone:
`mascarar.js`); ninguém precisa do original. O widget avisa antes de enviar algo com cara de CPF ou cartão. O formulário
de pedido não passa pela IA nem é gravado (só a contagem de tentativas). Sem cookie de rastreio. As conversas ficam sem
prazo, como o dono decidiu para o WhatsApp, e entram no "apagar anteriores a <data>".

## 11. Banco (aditivo)

`CanalIA` ganha `LOJA` (enum em migration própria); `ConversaIA.usuario` = `loja:<sessão>`; `MensagemIA.estruturado`
guarda os cartões e a lista; papel `rise_ia`, visões e função de §5.2 (SQL à mão, gerado de constantes e conferido por
teste, como a busca ampla); tentativas de pedido; segredos do serviço; sinal de vida. `ConfiguracaoIA.dados` ganha o grupo
`chatDaLoja`.

## 12. Entregas (um plano por fase)

1. **Fundação segura:** papel e visões, contêiner `ia`, redes, endereço, cérebro com provedor falso, protocolo, limites,
   `teste:ia-isolamento` e `teste:assistente`. Nada visível na loja.
2. **Widget e telas:** widget, Canais, Revisão, Consumo, Saúde. Página de teste local.
3. **Acompanhar pedido.**
4. **Ligar:** DNS, Cloudflare, chaves, etiqueta na LI. Primeiro só com `?assistente=1` no endereço (o dono testa na loja
   de verdade sem os clientes verem); depois para todos.

Cada fase com teste automático, roteiro de testes do dono e deploy só com o "sobe".

## 13. Decisões minhas (o dono confere)

1. Endereço `hobi.4hobby.com.br`, **escolhido pelo dono em 19/11/2026** (eu tinha proposto `assistente`; antes ainda, o mesmo do Rise, que o cookie do painel descartou).
2. O widget diz que é um assistente de IA (a decisão "sem aviso" de 12/10 era do WhatsApp; no site, não avisar seria fingir).
3. Widget fixado por integridade: atualizar exige trocar a etiqueta na LI.
4. Chave de IA separada para o chat, com teto no provedor.
5. Mensagem do visitante gravada já mascarada.
6. Pedido só dos canais LI e Bling (o do Mercado Livre se acompanha no Mercado Livre).
7. Widget fora do carrinho e do checkout.
8. Lançamento em duas etapas (`?assistente=1` primeiro).
9. ~~Nome "Assistente 4hobby", sem mascote~~ **Decidido pelo dono em 19/11/2026: o assistente se chama Hobi** (vale no
   site e no WhatsApp: "Oi, eu sou o Hobi, assistente da 4hobby") **e tem um mascote futurista**, um robozinho que o dono
   gerou no Google Flow e enviou em 19/11/2026 (`docs/mascote-hobi/`: corpo, cabeça e folha de expressões, em JPG com
   fundo branco; o construtor recorta o fundo). O widget usa a cabeça no botão flutuante e o corpo inteiro na saudação;
   as expressões servem para "pensando" e "feliz". Os arquivos recortados (PNG com fundo transparente) entram como
   imagens do serviço `ia`, servidas com o widget. Sem a imagem, o botão usa um ícone de conversa. O nome é texto da
   configuração (§9), não fixo no código. **O mascote é só do site: no WhatsApp a foto do perfil continua sendo o logo
   da 4hobby** (decisão do dono em 19/11/2026); lá o Hobi aparece só no nome com que a IA se apresenta.

## 14. O que depende do dono

Ok para o contêiner `ia` e o usuário `rise_ia` na VPS; registro DNS `hobi` (Hostinger); conta gratuita na
Cloudflare (Turnstile); chave da OpenAI dedicada com teto; colar a etiqueta na LI (ou autorizar que eu cole pelo painel).

## 15. Riscos que sobram (não existe risco zero)

- A IA pode errar uma recomendação técnica; preço, estoque e link não, porque vêm das ferramentas e passam pelo filtro.
- Quem souber o número do pedido **e** o CPF ou e-mail de outra pessoa vê a situação e o rastreio dela, nada além.
- O texto da conversa (mascarado) vai ao provedor da IA, nos EUA.
- Se o serviço for invadido: o invasor alcança só o catálogo público, as conversas de cliente (mascaradas) e a chave de IA
  do chat (com teto). Não alcança o painel, os tokens, custos, clientes nem pedidos.

## 16. O que fica para o construtor

Divisão dos arquivos; RLS × tabelas próprias; a medição do carrinho da LI (quantidade, vários itens); onde a LI aceita o
script e se permite excluir páginas; modelos e preços na hora; o prompt do canal; o desenho final do widget (mostrado ao
dono, com `frontend-design` e o Padrão visual); a nota no topo da spec de 12/10 apontando para esta.
