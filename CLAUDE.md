@AGENTS.md

# Sistema Rise

Painel de controle das operações de uma loja de eletrônicos (4hobby) que vende no
**Mercado Livre** e na **Loja Integrada**, com o **Bling** como ERP. **Roda numa VPS da Hostinger desde 09/10/2026**
(https://rise.4hobby.com.br); a máquina do dono é o ambiente de desenvolvimento.

Organizado em **blocos** no menu lateral, cada um desenvolvido de forma independente.

## Convenções

- **JavaScript**, sem TypeScript. O client do Prisma é gerado em `.ts` (o gerador da v7 não
  emite JS) e fica em `src/generated/`, fora do git — nada escrito à mão é TypeScript.
- **Interface e código em português**, sem acentos nos identificadores e comentários.
- **Comentários explicam o porquê**, não o quê. Se um trecho parece estranho, o comentário
  diz que problema ele evita.
- **Preço: sempre o NORMAL (de tabela), nunca o promocional** — regra do dono em 19/09/2026,
  **valendo para todas as sessões** (Agente 1, Agente 2 e `main`). Vale para todo preço de
  concorrente ou fornecedor que o sistema mostra, compara, ordena ou copia para outro campo. O
  promocional (desconto à vista, pix, campanha) é temporário, e comparar ou ordenar por ele engana.
  Só se usa o promocional **na falta do normal** (`normal ?? promocional`), e nunca no lugar dele
  quando os dois existem. Onde a tela mostra os dois lado a lado (Mercados, prévia do teste de
  fonte), o promocional aparece como informação, **não** como o número que decide. Ao escrever
  código novo que escolhe um preço, siga isso e diga no comentário.
- Fonte única para listas que a tela usa: `src/lib/blocos.js`, `src/lib/canais.js`,
  `src/lib/unidades.js`, `src/lib/limites.js`, `src/lib/fiscal.js`,
  `src/lib/integracoes/registro.js`.

## Padrões do projeto

Regras de **dado e de interface que valem em toda tela, de toda sessão** (Agente 1, Agente 2, a
principal). Cada uma diz onde está o componente ou a função, para a próxima tela **reaproveitar** em
vez de reinventar. Quando o dono decidir um padrão, ele entra aqui, com a data. Onde a regra já
existe em texto corrido mais abaixo, esta seção só aponta para lá.

**Dado**

- **Telefone** (`src/lib/telefone.js`, decidido em 19/09/2026): **grava só os dígitos com DDD, sem
  código de país** (`54988990008`); a tela e a digitação usam **`(54) 98899-0008`** (fixo:
  `(54) 3333-4444`). Vale para todo campo de telefone.
  - **Validação:** DDD real (lista fechada de 67; "10" e "23" não existem), celular com 11 dígitos e
    9 depois do DDD, fixo com 10 dígitos começando de 2 a 5. Colar `+55 54 98899-0008` é aceito. Um
    número com DDD que não existe é **recusado** com o texto digitado na mensagem.
  - **Filtra a cada tecla** (some letra) e **formata ao sair do campo**, o mesmo momento do CPF/CNPJ.
    Formatar a cada tecla trava o apagar: apagar o hífen não muda os dígitos e a máscara o devolve.
  - **Por que dígitos, e não formatado como o CPF:** o telefone é *consumido* — vira link de
    WhatsApp (`wa.me/55…`), vai para integração e é buscado por quem digita só o número. Formatado,
    `(54)98899-0008` e `(54) 98899-0008` seriam dois textos para o mesmo número. O documento só é
    exibido e conferido.
  - **O dono sugeriu `(xx)9NNNNNNNN`** (sem espaço nem hífen). Ficou o formato usual de leitura
    `(xx) 9NNNN-NNNN`; a entrada nesse formato é aceita. Trocar o de tela é uma linha em
    `formatarTelefone` e **não muda o que está gravado**.
- **CPF, CNPJ e CEP**: conferidos e gravados **formatados** (`src/lib/documentos.js`).
- **Vários valores no mesmo campo** (`ListaDeValores`): o **primeiro é o principal** e fica na coluna
  original (`telefone`, `email`); os demais vão para uma lista (`String[]`). Um `<input>` por linha
  com o mesmo `name`, lido com `formData.getAll`. Linha em branco sai e repetido vira um só.
- **Marca e Modelo** sempre em MAIÚSCULAS (ver "Produtos: Buscar por código").

**Interface**

- **Formulário de Cadastros:** `Campo` dentro de um `Card`. O envio é **manual** (`onSubmit` +
  `startTransition`), porque o React 19 limpa o formulário depois de uma action. Campos de um tipo
  ficam **montados e ocultos** (`hidden`) quando o outro tipo está escolhido, e o **servidor zera** o
  que não é do tipo salvo.
- **Abas para agrupar um formulário** (decidido em 19/09/2026 como padrão do sistema; **aplicado só
  ao Cliente**, e o dono pediu para **não mexer no resto agora**). Abas lado a lado como as do
  cadastro de Produto: `Card className="p-0"`, barra com `border-b-2`, a ativa em `border-acento`
  e as demais em `text-suave`. Regras, todas em `FormularioCliente.jsx`:
  - **Todas as abas ficam montadas e só escondidas (`hidden`)** (`Painel`): campo desmontado não
    entra no `FormData`, e salvar de uma aba perderia o que foi digitado nas outras.
  - **Erro do servidor leva à primeira aba com erro** e põe um **ponto vermelho** no título de cada
    aba com erro. A tabela `ABA_DO_CAMPO` diz em que aba mora cada campo; campo novo entra nela.
  - **Campo inválido para o navegador numa aba escondida abre a aba** (`onInvalidCapture`): o
    navegador não consegue focar um campo `display: none`, e o Salvar — que fica fora das abas —
    parecia não fazer nada.
  - Formulários que ainda **não** seguem: Fornecedor, Concorrente e Transportadora
    (`FormularioParceiro`), e os demais do sistema. Convertê-los é pedido do dono, não é dívida.
- **Escolha entre poucas opções:** opções lado a lado com `<input type="radio">` de verdade
  escondidos (`EscolhaDoTipo` em `FormularioCliente.jsx`). Entram no envio como um `<select>`
  entraria, e o teclado continua funcionando.
- **Ajuda de campo:** bolha "i" (`BolhaDeAjuda`), abre **para cima**; nunca texto fixo embaixo do
  campo. Ver "Ajuda de campo é bolha".
- **Exclusão:** popup listando nome e código de cada item, **nunca** `confirm()` nativo (Produtos).
- **Janela (popup) com fundo escuro:** o fundo fecha a janela **só se o botão do mouse foi apertado E solto nele**
  (`{...propsDoFundo(fechar)}` no elemento do fundo, `src/lib/fundoDaJanela.js`, decidido pelo dono em 10/10/2026).
  O `onClick` com `target === currentTarget` fechava também quando se selecionava o texto de um campo e se arrastava
  para fora (o navegador manda o `click` ao ancestral comum): a janela fechava e o digitado se perdia. O estado é por
  elemento (`WeakMap`), porque há janela dentro de janela. **Janela nova usa o `propsDoFundo`, nunca o `onClick` direto.**
- **Lista longa:** paginada, 100 por página, filtro por parâmetro repetido (`?fonte=A&fonte=B`), e
  nenhuma marcada quer dizer todas (Mercados).
- **Texto da tela COM acento** (decidido pelo dono em 07/10/2026; até ali era sem acento): `Pessoa Física`,
  `Última varredura`, `Não foi possível salvar.`. Vale para tudo o que a pessoa lê: rótulos, botões, bolhas,
  mensagens de erro e avisos que as ações devolvem. **Continuam sem acento:** identificadores, ids de aba e chaves,
  comentários, slug/URL e nome de arquivo, e valores que o código compara ou grava como dado. A troca foi feita com
  as ferramentas de `.acentos/` (fora do git): o extrator só pega texto de JSX e strings de tela, nunca chave,
  classe CSS ou comparação.
  - **Ficaram sem acento de propósito:** as "origens" e os textos de leitura de site de `src/lib/coleta/` (são dados
    gravados em `ProdutoColetado` e entram na assinatura: acentuar regravaria todos os produtos na próxima varredura),
    as notas de `plataformas.js` e os prompts da IA. Os passos e as mensagens do "Testar fonte" ganharam acento.
  - **Teste que confere mensagem por regex** compara sem acento (`casa`/`casaTexto` no `teste-bling-sync`,
    `semAcento` no `teste-imagens`); código que reconhece mensagem por regex aceita as duas grafias
    (`/n[aã]o configurada/` em `integracoes/lojaintegrada.js`).

## Estado

| Bloco | Situação |
| --- | --- |
| Produtos | Cadastro completo — é a base de que todo anúncio deriva. Cadastro novo com importação do Bling, busca por código, referências de mercado e título/descrição por IA (Anthropic). Sincronização com o Bling: ícone na lista, pop-up de diferenças, envio de campos e de ajustes de estoque e botão "Sincronizar estoque com Bling"; a **escrita no Bling está travada**. Produto com composição (kit): aba Composição, estoque calculado pelas peças, abas de fornecedores/medidas/NCM das peças e envio da composição ao Bling |
| Integrações | Bling e ML conectados e testados; Loja Integrada pelo Personal Token (API direta para o conteúdo; estoque, preço e pedidos seguem pelo Bling) |
| Painel | Indicadores lendo do banco |
| Anúncios | Interface e validação por canal, **sem publicar** |
| Canais de Venda | Mercado Livre: rascunho de anúncio simples e de composição/kit (salvar, pop-up pelo ícone na lista de Produtos e página própria, frases fixas), inteligência do ML (categoria, título, ficha, custos) e **Publicar pronto sob trava** (`ML_PUBLICACAO=false`; nenhum envio real ainda). Loja Integrada: editor por abas (Geral, SEO, Descrição, Fiscal, Envio, Prévia) com categorias ao vivo, ícone com selo e pop-up de diferenças na lista de Produtos, Cadastrar e Sincronizar **sob trava** (`LI_ESCRITA=false`). Shopee é só cartão "em breve" |
| Cadastros | Clientes (física/jurídica, endereço Geral/Entrega com lupa de CEP, contatos), fornecedores, concorrentes, transportadoras e marcas, numa página de **cartões** (sem cascata no menu); a seção Produtos abre o mesmo formulário de Produtos. Grava só no banco local |
| Mercados | Teste de fonte, importação de arquivo (HTML/PDF/XLSX) e coleta gravando **no Postgres**, com série de preço |
| Ferramentas | Conversor de imagem para SVG (PNG/JPG/WebP em vetor colorido, motor VTracer) e cotação do dólar (PTAX do Banco Central, com gráfico). Não gravam nada |
| Pedidos, Estoque, Financeiro, Relatórios | Esqueleto |

**A publicação nunca foi ligada.** `ML_PUBLICACAO`, `BLING_ESCRITA` e `LI_ESCRITA` estão em `false`, e
`exigirTravaLiberada` em `src/lib/integracoes/config.js` barra todo `POST`/`PUT` antes da
requisição sair. A conta tem **1007 anúncios e estoque reais** — não ligue sem pedir. Em 05/10/2026 houve um
teste de escrita real no Bling com UM produto de teste (`ZZ-TESTE-BLING`), com as travas abertas só no ambiente
de um script (o `.env` continuou em `false`); liberar produtos reais continua decisão do dono. O Mercado Livre
tem a segunda trava no mesmo molde desde 08/10/2026: `ML_PUBLICACAO_CODIGOS` (lista de códigos liberados;
**vazia libera todos**).

## Rodar

```bash
npm run dev                       # https://localhost:3000 (banco: servico postgresql-x64-17)
npm run diagnostico               # testa as integrações pela linha de comando
npm run teste:extracao            # 518 asserções da extração, da conciliação, das medidas, das opções de parágrafo da descrição e do cabeçalho de download de arquivo, SEM rede
npm run teste:svg                 # 60 asserções do conversor de imagem para SVG (Ferramentas), SEM rede e SEM banco
npm run teste:cotacao             # 86 asserções da cotação do dólar (Ferramentas): datas, leitura do PTAX e do boletim, gráfico. SEM rede e SEM banco
npm run teste:versao              # 20 asserções da versão no pé do menu (VPS: DD.MM.AAAA.HH.MM do deploy, em São Paulo; PC: "dev" + hora do último commit, "+" se há alteração não commitada; o commit curto aparece ao lado nos dois). SEM rede e SEM banco
npm run teste:migracao            # regras puras da migração para a VPS (nomes de arquivo com caixa diferente; restore da cópia; quais Conexao do PC sobrevivem à cópia; `BACKUP_MANTER` inválido). SEM rede e SEM banco
npm run teste:rede                # o filtro de rede pública do servidor (`src/lib/redePublica.js` + `lookup`/`validar` do `obter`) e sua LIGAÇÃO em `bytesDe` e `baixarDocumento`: IPs internos, nome que resolve para IP interno, ponto final, redirecionamento para IP escrito, IPv6. Os "sites" são servidores nesta máquina: SEM internet e SEM consulta ao banco
npm run auditar:arquivos          # confere que todo ProdutoArquivo existe no disco com o nome EXATO (o Linux distingue caixa); só lê; código 1 se houver problema
npm run copia:atualizar           # RESTAURA no banco do PC o backup da VPS (R2, ou --dump=<arquivo>) e APAGA as Conexao do ML e do Bling vindas do dump (tokens que rotacionam). As Conexao que o PC já tinha VOLTAM quando o token é do app do .env do PC (ML_CLIENT_ID/BLING_CLIENT_ID = o `clientId` gravado no segredo, desde 08/10/2026); token de outro app ou de antes disso sai. Recusa banco remoto, servidor no ar e worker vivo; faz cópia de segurança antes
npm run copia:atualizar -- --banco=sistema_rise_ensaio --dump=<arquivo>   # o mesmo restore AO LADO, sem tocar no banco do .env (ensaio); apagar depois com dropdb
npm run teste:fonte -- <url>      # avalia um concorrente pela linha de comando
npm run teste:fonte -- --tipo=FORNECEDOR <url>   # preco deixa de ser exigido
COLETA_TIMEOUT_MS=90000 npm run teste:fonte -- <url>   # site lento
npm run teste:coleta              # 43 asserções da gravação no banco (usa o Postgres, SEM rede)
npm run teste:cadastros           # 88 asserções: CPF/CNPJ/CEP/telefone, CNPJ obrigatório do fornecedor, a ligação fonte -> cadastro e as indicações dos vínculos salvos (Postgres, SEM rede)
npm run coletar -- <url>          # colhe uma fonte CADASTRADA e grava no banco
npm run worker                    # supervisor + worker: varre o que "Atualizar dados" enfileira
npm run worker:parar              # encerra do jeito certo (devolve as varreduras a fila)
npm run worker:pc                 # NO PC: abre um tunel SSH ate o banco da VPS, poe na fila as fontes ativas marcadas "Varrer pelo PC" (o site bloqueia a VPS), varre SO elas, grava direto na VPS e TERMINA quando acabar (`-- --ficar` mantem no ar). Ctrl+C encerra. O "Varrer agora" da fonte no Rise do PC faz o mesmo, so para ela. Ver "Fonte que bloqueia a VPS"
npm run teste:vps                 # 58 asserções das regras do cartão "Servidor VPS" (Integrações): onde os botões funcionam, decisões de deploy e cópia, log do deploy, quem o ajudante para (e quem NUNCA) e os scripts mandados à VPS. SEM rede, SEM banco, SEM processos
npm run teste:fila-pc             # 66 asserções dos TRÊS modos do worker na fila (normal, do PC e de teste): quem pega, recolhe e fecha o job de uma fonte marcada, a regra "servidor do banco é o Windows", o "Varrer agora" do Rise do PC (só a fonte pedida) e o arquivo de estado do worker do PC (Postgres local, SEM rede; só escreve fontes e jobs ZZ-PC-*)
npm run backup                    # dados/backup/sistema_rise-AAAAMMDD-HHMMSS.dump (pg_dump, conferido com pg_restore; guarda os 4 mais recentes)
npm run teste:worker              # 58 asserções: rede, fila, retomada e o worker de verdade (~6 min). RODE SOZINHO: junto de outros testes o "segundo worker" já saiu com 3221226505 (0xC0000409, aborto do Node no Windows ao encerrar, antes de o código 3 chegar); sozinho passa
npm run foto:mensal               # tira a foto mensal de preço e estoque (só se passou do dia 14 e o mês não tem foto); `-- --forcar` ignora o dia
npm run teste:fotos               # 41 asserções da foto mensal (Postgres, SEM rede; fotografa meses fictícios de 2025 e apaga tudo)
npm run teste:estoque             # 57 asserções da edição rápida da lista de Produtos: localização, preço e ajuste de estoque (Postgres, SEM rede; cria um produto ZZ-EDIT-1 e apaga)
npm run teste:imagens             # 429 asserções das fotos: padronização, lote temporário, Photoroom simulado, a edição das fotos de um produto que já existe ("só as validadas ficam"), a versão nomeada, a reserva de imagens, o Nano Banana (Google falso) e o prompt salvo da descrição (Postgres e dados/, SEM rede)
npm run teste:anuncios-ml         # 591 asserções do anúncio do Mercado Livre: composição, validação, payload, ícone, gravação, frases fixas, a fase 2 (categoria, atributos, custos, preço por margem, IA) e a fase 3 (publicar, retomar, kit e vínculo no Bling) contra um ML falso e um Bling falso (Postgres, SEM rede; só escreve produtos ZZ-ML-* e a linha ConfigCanal, que restaura)
npm run teste:loja-integrada      # contrato do cliente da Loja Integrada (handoff): paginação, normalizadores, Personal Token. SEM rede e SEM banco
npm run teste:li-sync             # sincronização Rise -> Loja Integrada: slug, SEO, descrição HTML, campos, corpo do PUT, rascunho, banco, leitura, envio e ícone (LI falsa, SEM rede; Postgres local, só escreve produtos ZZ-LI-*)
npm run teste:fundo               # 9 asserções da regra do fundo das janelas (`src/lib/fundoDaJanela.js`: fecha só com clique que começa e termina no fundo, inclusive janela dentro de janela). SEM rede e SEM banco
npm run teste:composicao          # 136 asserções do produto com composição (kit): regras puras, gravação, estoque calculado, cadastro, busca de peças (com o que falta a cada produto), a descrição só com referências cadastradas e os ajustes de 10/10/2026 (código sugerido, localização da peça, peça de origem, documentos e descrições das peças, o "!" do kit e o "Anexar a este produto") (Postgres, SEM rede; só escreve produtos ZZ-KIT-* e a pasta dados/produtos/ZZ-KIT-C3, que apaga)
npm run teste:bling-sync          # 685 asserções da sincronização Rise <-> Bling: ícone, pop-up, envio de campos, fornecedores, ajustes e saldos de estoque e as travas (Bling falso, SEM rede; Postgres local, só escreve produtos ZZ-BS-*)
```

**Backup semanal agendado** (pedido do dono em 16/09/2026): tarefa do Agendador de Tarefas do
Windows "Sistema Rise - Backup semanal do banco", toda segunda às 12:00. Com
`StartWhenAvailable`, se o computador estiver desligado ela roda assim que ligar.
- **Retenção:** o script mantém os **4** backups automáticos mais recentes (nome
  `sistema_rise-AAAAMMDD-HHMMSS.dump`). Só apaga depois de o novo passar na conferência do
  pg_restore, e backup com outro nome, feito à mão, nunca é apagado.
- **Log:** `dados/logs/backup.log`.
- **Senha:** vai por `PGPASSWORD` com `--no-password`. Pela URL, o pg_dump do Windows parou
  esperando senha no terminal.
- **Na VPS:** o agendamento não vai junto; lá vira um cron com `npm run backup`.

HTTPS é obrigatório (o OAuth do ML exige). Certificado em `certificates/`, gerado com
mkcert, fora do git.

- **`certificates/rootCA.pem` é obrigatório**, e é só a parte pública da CA do mkcert
  (`%LOCALAPPDATA%\mkcert\rootCA.pem`) — a `rootCA-key.pem` **nunca** vem para cá. O
  navegador confia no certificado porque a CA está no Windows; o **Node não olha lá**. Com
  `--experimental-https-key/cert` e sem `--experimental-https-ca`, o `next dev` põe
  `NODE_EXTRA_CA_CERTS` **indefinido** no processo filho. Nada falha até o Next precisar
  **encaminhar uma Server Action** para outro worker — ele faz `fetch` no próprio
  `https://localhost:3000` e leva `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. No log aparece
  `failed to forward action response`; na tela, botão que não responde em `/mercados/fontes`.

**O banco é PostgreSQL 17 nativo, não mais Docker** — migrado em 15/09/2026 a pedido do dono:
o Docker Desktop travava ao abrir e o sistema ficava sem banco.

- Serviço do Windows `postgresql-x64-17`, **início automático** — liga com a máquina, sem
  `npm run db:up`. Superusuário `rise` com a senha do `.env`, o mesmo arranjo do container,
  então o `DATABASE_URL` não mudou.
- **`listen_addresses = 'localhost'`**, posto à mão em
  `C:\Program Files\PostgreSQL\17\data\postgresql.conf`. O instalador do Windows deixa `'*'`, e
  o compose publicava só em 127.0.0.1 de propósito.
- Banco criado com **`TEMPLATE template0`, UTF8, ICU `en-US`**: o `template1` do instalador herda
  a codificação do Windows (WIN1252), e restaurar nele estragaria os acentos.
- A cópia do banco do Docker está em `dados/backup/` (fora do git — leva os tokens cifrados).
  Contagens conferidas tabela a tabela depois de restaurar, e o ML autenticou com o token
  restaurado.
- **O container `rise-postgres` foi parado, não apagado** (`docker compose stop`), e o
  `docker-compose.yml` continua valendo para a VPS. Os dois ligados disputam a porta 5432.
  **Desde 08/10/2026 o compose é o da produção na VPS** (`db`, `app`, `worker`, `auth`, `caddy`, com o
  `Dockerfile` e o `deploy/caddy/Caddyfile`); `npm run db:up` e `db:down` mexem **só no `db`**, para nunca montar o
  sistema inteiro no PC.
- **Não fechar o Docker Desktop à força.** `Stop-Process -Force` deixa sockets unix órfãos
  (`%LOCALAPPDATA%\Docker\run\dockerInference`, `docker-secrets-engine\engine.sock`); na abertura
  seguinte ele tenta apagá-los, o Windows devolve erro 1920 e o Docker fecha com *"unexpected
  error"*. `Remove-Item`, `del` e `fsutil reparsepoint delete` falham; **renomear a pasta** que os
  contém resolveu. **Nunca "Reset to factory defaults"** — apaga os volumes, e o banco com eles.

---

## Conhecimento que custou caro

### Bling

- Credenciais no header **`Authorization: Basic`**, não no corpo.
- Autorização em `https://www.bling.com.br/b/Api/v3/oauth/authorize` — **com `/b/`**.
  Token em `https://api.bling.com.br/Api/v3/oauth/token` — **sem `/b/`**.
  API em `https://api.bling.com.br/Api/v3`.
  **Até 15/09/2026 a API era em `www`**; naquele dia passou a responder *"A URL
  'www.bling.com.br' está bloqueada para requisições de API. Por favor, utilize o endpoint
  oficial: 'api.bling.com.br'"*. Trocado em 16/09. O token foi conferido **sem credencial**
  (um pedido por host, os dois devolvem `invalid_client`), para não gastar a cota de 20
  pedidos que bloqueia o IP. A autorização continua em `www`: é a página que o navegador
  abre. **A primeira renovação de token pelo host `api` ainda não aconteceu** — se falhar,
  é o primeiro suspeito.
- **"Importar do Bling" importa UM produto, pelo código digitado** (pedido do dono em 07/10/2026;
  `importarPorCodigoDoBling` em `src/lib/integracoes/importarBling.js`, janela em
  `BotaoImportarBling.jsx`). Até ali o botão lia o catálogo ativo inteiro (1.834 produtos, 19
  páginas de 100) e trazia em lotes tudo o que faltava, inclusive o que o dono tinha apagado de
  propósito; esse caminho (plano + lotes) foi removido. Hoje: `GET /produtos?codigos[]=<código>`
  (só ativos), e recusa sem gravar nada quando o código é vazio ou não serve de SKU, quando o
  produto já existe aqui (pelo SKU sem caixa, ou pelo `blingId`; a janela dá o link para ele),
  quando não há produto ATIVO com o código, quando há mais de um, ou quando é variação (formato
  `V`). **Composição (kit, formato `E`) é importada como produto comum** (pedido do dono em
  07/10/2026; antes kit só existia no anúncio do Mercado Livre), já com a lista de peças (aba Composição; ver
  "Produto com composição (kit)"); **só entra se TODAS as peças já existem no Rise** (pelo `blingId`
  ou pelo código), senão recusa dizendo quais faltam ("o item 121503_z do kit 121503_10z não está
  cadastrado no Rise"). E o envio de ajustes de estoque **recusa kit de estoque virtual** (só o de
  estoque próprio, `estrutura.tipoEstoque` "F", recebe ajuste). Primeiro kit importado: o 990204.
  Importa com fotos e fornecedor em rascunho, e cria junto o `Anuncio` BLING com
  `idExterno`: sem ele a lista oferece "Cadastrar no Bling" e duplicaria o item no ERP. Código
  com barra (`900314_8/conector`) não vira SKU, porque SKU é nome de pasta.
- **Imagem do Bling é link do S3 que expira em uma semana** — por isso é baixada para
  `dados/produtos`, não guardada como URL.
- O `code` vale **1 minuto**. O refresh token dura 30 dias e **rotaciona**.
- **20 pedidos de token em 60s bloqueiam o IP por 60 minutos.** Nunca pedir token se o
  guardado ainda vale.
- **3 requisições por segundo**, da conta inteira. Toda chamada passa pela fila de
  `src/lib/integracoes/httpClient.js`.
- `GET /canais-venda` (**`/lojas` dá 404**), `GET /produtos/lojas` (o campo `codigo` guarda
  o `MLB...`), `GET /produtos?codigo=<sku>`, `GET /depositos`.
  **`GET /integracoes` dá 403** com os escopos atuais.
- O canal do ML é o **`203593931` ("ML_4h")**. Há 8 canais desse tipo e só um ativo —
  gravar no canal errado quebra a sincronia de estoque **sem dar erro**.

### Mercado Livre

- Credenciais **no corpo**, não em header Basic. Sem PKCE.
- **Recusa `localhost`** como redirect. Usamos `sistema-rise.localtest.me` (domínio público
  que resolve para 127.0.0.1). **Mas a interface não funciona nesse domínio** — o navegador
  bloqueia os scripts por DNS rebinding. Daí: interface em `localhost`, OAuth do ML em
  `localtest.me`. O fluxo **começa e termina** no mesmo domínio, senão o cookie de `state`
  se perde.
- Access token dura 6h; o refresh exige o escopo **`offline_access`**.
- Conta **`4HOBBY_STORE`**, seller `212386247`, no modelo **User Products** →
  **`family_name` é obrigatório** ao publicar e **o `title` NÃO pode ser enviado** no `POST /items`: o ML
  gera o título a partir do `family_name` e dos atributos (documentação `preco-variacao`, lida em 08/10/2026).
  O "Título" do editor do Rise vai como `family_name` (decisão do dono).
- **Preço: na CRIAÇÃO ele vai no `POST /items`** (a documentação de preços, de 26/02/2026, diz que criar e
  editar continua pela `/items`, e o "editar preço standard" ainda não existe). O que mudou em março/2026: um
  `PUT /items` que manda **só** o `price` é recusado (400). Até 08/10/2026 este arquivo dizia que o preço
  tinha saído do `POST`, o que estava errado.
- Descrição: `POST /items/{id}/description` (`{ plain_text }`) depois de criar o item; não vai no `POST /items`.
- **Título não muda depois que o anúncio tem vendas.** Encerrar é irreversível.
- Publicar **pausado**, ajustar, e só então ativar — falha no meio não deixa anúncio
  incompleto no ar.
- Imagens por **upload binário** (`POST /pictures/items/upload`), 500×500 a 1920×1920.
- `GET /sites/MLB/search` dá **403** (busca pública fechada).

### Loja Integrada

- **Autenticação: Personal Token** do proprietário, em `Authorization: Basic <token>` (a Chave de Aplicação, emitida
  só a provedores, continua suspensa para lojistas e não é usada). API em `https://api.awsli.com.br/v1`, **100
  requisições por minuto por loja** (o cliente limita a 90). Listagens em no máximo 100 (`limit=200` dá 400).
- **O que a API grava e o que não grava foi MEDIDO** em 07/10/2026 no produto de teste: ver "Canais de Venda: Loja
  Integrada" (origem e tipo de produção são só leitura; SEO só pelo `/seo`; `categorias: []` apaga; medidas inteiras).
- As URLs de produto são baseadas no **nome** e editáveis — não dá para deduzi-las do id. O vínculo pelo SKU grava
  `Produto.urlLojaIntegrada` com `LI_DOMINIO` + o `url` da loja.

### Mercados (coleta de concorrentes e fornecedores)

Bloco que lê sites de terceiros. **Não tem vínculo com o catálogo próprio** — nada aqui
lê ou escreve `Produto`, por decisão explícita do dono. **Uma exceção que não é `Produto`:**
desde 18/09/2026 `salvarFonte` também grava o `Fornecedor` ou `Concorrente` da fonte em
Cadastros (ver "Cadastros", abaixo).

**Duas etapas que não se misturam** — combinado com o dono em 28/08/2026, depois de uma
tentativa de coletar os 20 produtos direto do teste:

1. **"Testar fonte" só valida, não coleta.** É o campo que responde "dá para ler este
   site?". Amostra pequena (3 produtos, teto de 25 páginas), **nada é gravado — nem em
   JSON nem no banco**. Verificar HTTP 200 não responderia nada — toda loja devolve 200 na
   home; o que decide é conseguir normalizar produto com nome, endereço e preço.
2. **A coleta de verdade só começa depois que a fonte é salva.** São os ~20 produtos por
   concorrente ou fornecedor. Nunca disparar coleta a partir da tela de teste: são
   momentos diferentes do fluxo, e juntá-los já foi erro cometido uma vez.

**A coleta grava no Postgres** — desde 15/09/2026, a pedido do dono ("não vamos mais usar
JSON"). Até ali gravava em `dados/coleta/<domínio>/produtos.json`; os 7 arquivos foram
carregados por `scripts/migrar-coleta-json.js` (2.471 produtos, contagem conferida fonte a
fonte) e guardados em `dados/backup/coleta-json-20260915/`.

- **Quanto se colhe: TUDO, de todas as fontes** — decidido pelo dono em 15/09/2026, no fim da
  sessão (antes eram 20 por concorrente). `TETO_POR_FONTE` e `ORCAMENTO_PAGINAS` (20.000, em
  `coletar.js`) não são cota: são freio para a loja gigante não prender o worker. Quem
  encostar no freio aparece na tela com "produtos no site" maior que o coletado.
- **Custo disso, medido nos números das fontes de hoje:** cada produto exige abrir a página
  dele, a 1 requisição a cada 2 s por domínio — a Smartkits (3.780) leva ~2 h, a Casa da
  Robótica (2.294) ~1,3 h. **Eletrogate e Impacto CNC pedem 10 s entre visitas**: 500
  produtos já são ~1,4 h cada. A varredura completa das oito fontes é trabalho de uma noite,
  e desde 16/09/2026 corre com **3 lojas ao mesmo tempo** (ver "Worker da coleta").
- **O botão "Atualizar dados" enfileira**, não executa: varrer seis lojas passa de dez
  minutos, o que não cabe numa requisição HTTP e morreria no primeiro hot reload. Quem
  executa é o `scripts/worker.js` (`npm run worker`): `varrerFonte` → `colherProdutos` ou
  `reprocessarArquivos` → `gravarColeta` (`banco.js`).
- **O mesmo `colher.js` do "Testar fonte".** Era aqui que as duas trilhas divergiam: a tela
  mostrava o que o normalizador completo extraía e a gravação guardava o que um extrator
  antigo entendia. O caminho antigo do banco (`gravar.js`, `coletarUrl`, `conferirSite`, a
  tabela `PaginaColetada`) foi **removido**: gravava o formato do extrator antigo e exigia
  URL, que os 1.911 da Fortek não têm.
- **`ProdutoColetado` espelha o produto de `normalizar.js`**, e `linha.js` converte nos dois
  sentidos. A conversão tem que **voltar igual**: conciliar lê do banco e grava de novo, e
  assinatura diferente reescreveria a lista inteira a cada envio.
- **O JSONB reordena as chaves.** `origens` e `seo` voltam do Postgres em outra ordem, e com
  `JSON.stringify` comum o mesmo produto dava outra assinatura. A assinatura usa chaves
  ordenadas; a ordem dos ITENS continua valendo, porque a ficha é ordenada.
- **A chave é `fonteId + chave`**: `codigo:` quando há código (não `N/A`), senão `url:`,
  senão `nome:` normalizado. A Usinainfo publica o mesmo produto (09109, id 6072) por dois
  endereços; pelo código, é um só — por isso 20 no JSON viraram 19 no banco.
- **Só escreve o que mudou.** Sem mudança de conteúdo, só `vistoEm` avança, num
  `updateMany`. A série (`PrecoHistorico`) ganha linha quando **preço normal, promocional,
  de reserva ou status de estoque** mudam — a quantidade fica de fora, senão todo
  reprocessamento da Fortek viraria mudança. O detalhe mostra como anterior o **último
  preço diferente**, e não a penúltima linha, que pode ser só mudança de estoque.
- **Produto de site que some da amostra não é apagado** — fica com o `vistoEm` antigo.
  Ficar fora de 20 não prova que saiu do ar, e o histórico de preço dele continua valendo.
- **A tabela mostra TODOS os produtos do banco** (pedido do dono em 07/10/2026: "não quero que esconda nenhum
  produto"). De 15/09 a 07/10/2026 ela mostrava só a última coleta de cada fonte, para não misturar preço de hoje
  com preço antigo. O efeito colateral foi esconder sem aviso tudo o que uma varredura deixava de ver: o
  ESP32-S3-WROOM-1 da Usinainfo estava no banco e sumiu da lista e da lupa, junto de outros 106 produtos dela
  (a causa do sumiço era a paginação; ver "A navegação segue a paginação").
  - **O que a última varredura da loja não viu vem marcado:** `naoVistoDesde` é o `vistoEm` do produto quando ele é
    anterior ao `ultimaColetaEm` da fonte. A coluna "Atualizado" do Scraper e a lupa mostram "Não visto desde
    dd/mm/aa", em âmbar. Loja que nunca fechou varredura não marca nada.
  - **Os não vistos vão por último em qualquer ordenação** da tela (`foraDaUltima` em `listarProdutos`), para o
    preço antigo não ficar no meio dos de hoje.
  - `produtosParaLista` e `listarProdutos` fazem a mesma coisa (a lupa e o Scraper). O `incluirIds` (concorrentes
    ligados) ficou sem efeito, porque todos já vêm.
  - **Custo:** a tela passou a contar 70.442 produtos; a lupa e as indicações dos vínculos leem esse acervo
    inteiro na memória a cada busca.
- **BUSCA AMPLA** (pedido do dono em 09/10/2026), botão **"Pesquisa profunda"** (nome pedido pelo dono no mesmo dia;
  `BotaoBuscaAmpla.jsx`, `?ampla=1` na URL) ao lado do campo de busca do **Scraper** e de **Produtos**. **Sempre
  começa desligado:** abrir ou recarregar a tela com `?ampla=1` (link salvo, F5) desliga; continua ligado só nas
  navegações de dentro da tela (outra busca, outra página da lista), por uma variável do módulo do botão. Ligado, procura também no texto, e cada linha achada
  só no texto ganha o selo "achado na descrição / na ficha técnica / no SEO / na categoria" (Produtos: "na
  descrição / no NCM / na homologação / na localização"). Todas as palavras continuam exigidas.
  - **Índice sobre EXPRESSÃO, sem coluna nova** (migration `20261009_busca_ampla`): três índices de trigramas
    sobre "fórmulas" que juntam os campos sem acento e em minúsculas (`EXPRESSAO_AMPLA_COLETADO`,
    `EXPRESSAO_BUSCA_PRODUTO`, `EXPRESSAO_AMPLA_PRODUTO` em `src/lib/buscaAmpla.js`). O banco monta o índice
    para todos ao criar e o mantém sozinho em toda gravação. **A busca tem de repetir a expressão EXATAMENTE**,
    senão o Postgres lê a tabela inteira: o SQL da migration foi GERADO das constantes, e o `teste:coleta` confere.
    Só funções imutáveis (`lower`, `translate`, `||`, `->>`, `jsonb_path_query_array`); `unaccent` e `concat`
    não servem em índice. A ficha entra pelos nomes e valores, não pelo JSON inteiro.
  - **Medido em 09/10/2026 (PC, 70.513 coletados):** índices de 56 MB (coletado), 1,4 MB e 0,5 MB (Produto);
    banco de 331 para 389 MB; criação em menos de 1 min. "atmega328" no Scraper: 275 achados (127 pelo nome)
    em ~200 ms; sem índice, só a descrição levava 1,4 s.
  - **Scraper:** os achados pelo NOME vêm primeiro em qualquer ordenação; o selo lê o texto só das linhas da página.
  - **Produtos:** a busca NORMAL também passou a usar índice (todas as palavras, em qualquer ordem, no nome,
    código, marca, modelo e EAN; antes era o texto inteiro, só em nome e código). O índice devolve os ids; ordem e
    página continuam no Prisma, então Produtos não põe "pelo nome primeiro".
  - Migration feita à mão: o próximo `migrate diff` vai propor apagar esses três índices. Tirar essas linhas.
- **O saldo anterior fica guardado** (`quantidadeAnterior`, `quantidadeAnteriorEm`), pedido do
  dono em 15/09/2026 para montar depois o histórico de venda: com os dois números e as duas
  datas dá para dizer quanto saiu entre uma varredura e outra. **São dois campos porque um
  só não serve** — "de 20 para 10" não diz se foi numa semana ou em seis meses. Só muda
  quando a quantidade muda, e **saldo não informado não apaga o anterior**: produto fora da
  lista do fornecedor fica sem saldo, e isso não é uma quantidade nova. O histórico em si
  **ainda não existe** — por enquanto só se guarda o par.
- **Ausente guarda a data da PRIMEIRA lista em que faltou.** A conciliação carimba a data da
  lista atual; `gravarColeta` mantém a guardada, senão um produto fora há dois meses
  pareceria ausente desde a semana passada.
- **A última coleta mora na fonte** (`ultimaColetaEm`, `ultimaColetaOrigem`,
  `ultimaColetaTotal`, `ultimaColetaDuracaoMs`, `ultimaColetaResumo`), escrita por quem
  grava. A trava de queda compara com `ultimaColetaOrigem`.
- **A lista enviada também**: `listaArquivos` e `listaEnviadaEm` substituíram o
  `manifesto.json`. Os **originais** (HTML, planilha) continuam em
  `dados/coleta/<domínio>/arquivos/` — não são JSON, e é deles que se reprocessa.
- **A lista da tela é leve**: `produtosParaLista` traz tudo sem galeria, descrição nem
  ficha, e filtra em memória; a miniatura (base64, na Fortek) vem só para as 100 da página.
- **Json nulo no Prisma é `Prisma.DbNull`.** `null` puro num campo `Json?` é recusado.
- **A fonte nasce pausada**, com `proximaVarreduraEm` a 100 anos: salvar um cadastro não
  pode disparar varredura sozinho. Fonte pausada dá recado dizendo para usar "Retomar".
- **(DESATUALIZADO: desde 23/09/2026 a coleta é MANUAL — migration `20260923_coleta_manual`,
  `enfileirarVencidas` devolve 0 — e o ciclo descrito abaixo não roda.)** O ciclo automático estava
  LIGADO, e desde 16/09/2026 era de 30 dias (`intervaloHoras` = 720,
  migration `20260916_intervalo_30_dias`). Era de 24 h, mas com o catálogo inteiro de cada loja
  uma varredura leva horas (Eletrogate: 8.783 páginas a 10 s cada) e emendava na seguinte.
  Fonte ativa cuja `proximaVarreduraEm` venceu é enfileirada pelo worker a cada volta
  (`enfileirarVencidas`), sem clique. A migration levou a próxima varredura das fontes já
  varridas para 30 dias depois da última. As que estavam na fila rodam uma vez e ganham a data
  nova no fim.
- **Fornecedor com lista e site (Nightech) navega o site sem gravar em lotes**: a trava de queda
  precisa da lista inteira, mesclada.
- **O teto da tabela subiu de 100 para 300.** A data é da **coleta inteira**, não de cada
  produto, então a ordenação agrupa por fonte e um teto apertado corta a fonte mais antiga
  **por completo**: com 100, a Casa da Robótica sumia da tela inteira tendo 20 produtos
  coletados. Com a Fortek e a Nightech em disco o teto passou a ser atingido de verdade, e
  foi substituído pela paginação (item seguinte).
- **A tela filtra, ordena, conta e pagina NO BANCO** (`listarProdutos`, 17/09/2026). Antes lia a
  lista inteira e fazia tudo em memória: com 2 mil produtos passava, com **35.226** eram **20 MB
  montados em 2,3 s a cada clique** — marcar fonte, trocar de aba, limpar filtro. Hoje o Postgres
  devolve as 100 linhas e as contagens, e a tela responde em 350–900 ms.
  - **SQL cru** porque a ordenação não cabe no Prisma: o preço que ordena é `COALESCE(normal,
    promocional)` (era o contrário até 19/09/2026, ver "Preço: sempre o NORMAL" em Convenções) com
    os sem preço no fim, e a ordem padrão põe o disponível na frente.
  - **Cada contagem é uma varredura da tabela**, então só se conta o que não dá para somar: o total
    filtrado sai da contagem por fonte, e o acervo inteiro só vira consulta quando há aba ou busca.
  - **Índice de trigramas** (`pg_trgm`, migration `20260917_busca_trigrama`): a busca é
    `LIKE '%palavra%'`, que índice comum não atende. Caiu de **600 ms para 15 ms**.
- **A gravação lê só as chaves DO LOTE, não a fonte inteira** (17/09/2026). `gravarColeta` buscava
  todos os produtos da fonte a cada lote, e a varredura grava de 10 em 10: na Mamute, **17.153 linhas
  relidas a cada dez produtos**, por horas. Era a causa de a tela ficar lenta durante qualquer
  varredura.
- **Modo de desenvolvimento custa 2 a 4 vezes mais que o de produção.** Medido nas mesmas telas:
  1,2–2,3 s no `next dev` contra 0,4–1,2 s no build. O sistema roda em `npm run dev` por causa do
  `--experimental-https` (o OAuth do ML exige HTTPS), e `next start` não tem esse recurso — trocar
  exigiria um proxy TLS na frente.
- **A lista é paginada, 100 por página.** O teto de 300 não cortava linhas: cortava o
  acervo — com 2.469 produtos, **88% eram inalcançáveis** e o rodapé mandava "refinar a
  busca" para ver o que já estava coletado. Navegação em setas (`«  ‹  [n]  ›  »`), no topo
  e no rodapé; a de cima é compacta porque medido: filtros ocupam 772px e a barra completa
  455px, e não cabem em 1165px.
- **Trocar filtro ou busca zera a página.** Quem está na página 12 e filtra uma fonte de 40
  produtos cairia numa página que não existe mais e veria tabela vazia — parecendo que o
  filtro não achou nada. Além disso a página vinda da URL é **grampeada** ao intervalo
  válido, porque link antigo e varredura que encolhe a lista produzem o mesmo efeito.
- **O filtro de fontes aceita VÁRIAS**, por caixa de marcação (`?fonte=A&fonte=B`). Começou
  como `<select>` de escolha única, e comparar Fortek com Nightech — que é o trabalho —
  exigia carregar a tela duas vezes. Parâmetro repetido, nunca lista separada por vírgula:
  "Casa da Robótica - Varejo" já mostra que pontuação em nome de loja é normal. **Nenhuma
  marcada quer dizer todas**, e "Todas" limpa a escolha em vez de marcar as sete — marcar
  todas prenderia o filtro ao conjunto de hoje, e a fonte cadastrada amanhã ficaria de fora
  sem ninguém perceber.
- **O filtro lista TODAS as fontes cadastradas da aba**, com 0 na que ainda não tem produto (pedido do dono em
  09/10/2026: a Oceantech, recém-cadastrada, sumia do seletor e parecia não existir). Até ali só entrava fonte com
  produto gravado (`contagemPorFonte` em `listarProdutos`).
- **`IN_STOCK` e `AVAILABLE` são o mesmo fato com dois nomes**: os leitores de arquivo
  gravam o primeiro, o raspador de site o segundo. A tela só conhecia `AVAILABLE`, e os
  **1.592 produtos em estoque da Fortek não mostravam linha nenhuma** — nem disponível, nem
  esgotado. Quem interpreta status tem que aceitar os dois.
- **Na lista, produto de fornecedor mostra o preço COM imposto em destaque.** O
  distribuidor cobra por fora — a Benser escreve *"Preço unit. sem IPI"* — então os R$ 44,90
  não são o que se paga; embaixo vem R$ 47,82 com o rótulo `IPI 6.5%`. Sem dizer **quais**
  impostos entraram, o número não tem como ser conferido.
- **Sem endereço não há link, e havia um que não levava a lugar nenhum.** O `<a>` era
  montado sempre; com `url` nulo o href sumia e sobrava texto azul convidando ao clique. São
  os 1.911 da Fortek, que vieram de arquivo de portal atrás de login — não existe página
  pública, e isso não é defeito de coleta. A tela diz a razão.
- A **ficha técnica** no painel é lista ordenada, igual à prévia — linha sem rótulo aparece
  com marcador, nunca com nome inventado. O campo `atributos` (objeto) era do caminho do
  banco.
- O bloco foi fundido na **`main`** em 18/09/2026 (avanço simples, commit `73d813f`, 16 commits).
  A branch `bloco-mercados` continua existindo, mas **não recebe mais trabalho**.

### Fotos mensais de preço e estoque (30/09/2026)

Pedido do dono: guardar **12 meses** de preço e estoque de fornecedores, concorrentes e dos produtos
da loja, para análise futura. **Todo dia 14** o worker copia o que está no banco para duas tabelas
novas (migration `20260930_fotos_mensais`), em `src/lib/coleta/fotos.js`.

- **Por que o dia 14 e não o 15:** a varredura leva mais de um dia (o Eletrogate sozinho passa de 20 h)
  e, no meio dela, o banco mistura lojas novas com antigas. No dia 14 todas as fontes já fecharam o
  ciclo anterior. Consequência: a foto do dia 14 traz o **estoque do ciclo anterior**, com cerca de 30
  dias — por isso cada linha guarda `lidoEm`, a data em que o número foi de fato lido.
- **`FotoMensalColeta`** (fornecedor e concorrente), uma linha por produto por mês:
  - **Preço:** fornecedor guarda o **com impostos** (o que se paga), e o normal na falta dele;
    concorrente guarda o **normal**. O promocional só entra quando a loja não publicou o normal
    (`normal ?? promocional`, a regra do sistema), e `tipoPreco` (`NORMAL`, `COM_IMPOSTOS`,
    `PROMOCIONAL`) diz qual foi, para a série não misturar "com IPI" e "sem IPI".
  - **Estoque:** `quantidade` e `aChegar` (nunca somados) e `estoqueStatus`. **Nulo é "a fonte não
    informa"** — a maioria dos concorrentes só diz "disponível" —, nunca 0. `ausente` marca o produto
    que saiu da lista do fornecedor.
  - **Quem entra:** todo produto de fornecedor (a lista é regravada inteira) e o de concorrente **visto
    desde a foto anterior**; sem foto anterior, os vistos nos últimos 45 dias. Sem isso, amostras
    antigas (a Usinainfo traz 19 produtos diferentes a cada varredura) entrariam como se fossem do mês.
- **`FotoMensalProduto`** (produtos da loja): `precoVenda`, `custo`, `estoque` e `canais` (onde tem
  anúncio). **O estoque é o da importação do Bling, não o do dia** — o dono escolheu "fotografar o que
  está no banco" em vez de reler o Bling antes de cada foto, e nada atualiza `Produto.estoque` depois
  da importação. `produtoAtualizadoEm` mostra o quão velho é o número. O custo sai, nesta ordem, do
  fornecedor padrão confirmado, do rascunho do Bling (`fornecedorRascunho.precoCusto`) e do cadastro;
  `custoOrigem` diz qual.
- **Preço por canal NÃO existe no banco:** os três conectores leem `Produto.precoVenda` (o dono pediu
  "de cada canal — Mercado Livre e Loja Integrada"). A foto guarda o preço de venda único e a lista de
  canais com anúncio; quando houver preço por canal, é nessa lista que ele entra.
- **Sem chave estrangeira, de propósito:** com `onDelete: Cascade`, apagar uma fonte levaria o histórico
  dela. A foto copia fonte, código e nome, e sobrevive à exclusão da fonte e do produto (testado).
- **Idempotente e com recuperação:** uma foto por mês e por tabela (chave única produto + mês). O
  worker confere de hora em hora; se ficou desligado no dia 14, a foto sai na primeira volta depois de
  ligar, em qualquer dia a partir do 14. `npm run foto:mensal` faz o mesmo na mão.
- **Fuso:** o dia 14 e o mês são os de **São Paulo** (perto da meia-noite o UTC já é o dia seguinte), o
  `mes` vai para o SQL como texto `2026-09-01` (um `Date` cairia no fim do mês anterior no fuso do
  Postgres) e `tiradaEm` é gravado em UTC explicitamente.
- **Volume medido em 30/09/2026:** cerca de 61 mil linhas de coleta e 1.314 da loja por foto (~730 mil
  por ano).
- **A varredura NÃO é agendada:** desde 23/09/2026 a coleta é **manual** (migration
  `20260923_coleta_manual`; `enfileirarVencidas` devolve 0). O "dia 15" é a rotina do operador, e a foto
  do dia 14 funciona igual com a varredura manual ou automática.
- **Em aberto:** retenção. Nada apaga foto antiga (guarda tudo); se o dono quiser cortar em 12 meses, é
  um `deleteMany` no fim de `tirarFotoMensal`. O backup segue guardando só os 4 mais recentes (~1 mês);
  para o histórico sobreviver a um disco perdido, falta um backup mensal com retenção maior.
- **Depois de mudar `fotos.js` ou o worker, reiniciar o worker** (`npm run worker:parar` e `npm run worker`).

### Worker da coleta — reescrito em 16/09/2026

Um dia inteiro de defeitos no mesmo lugar levou à reescrita:
- job "em andamento" por horas sem ninguém varrendo;
- dois workers disputando a fila;
- worker preso para sempre;
- loja que falhava voltando à fila na hora.

A raiz era uma só: **a vida de um job era deduzida do andamento dele** (`atualizadoEm`), e as
duas coisas não são a mesma.

**Como rodar.**
- `npm run worker` sobe o **supervisor** (`scripts/worker.js`), que sobe o worker
  (`scripts/worker-processo.js`) e o religa quando cai, com espera de 5 s a 2 min.
- **Não use mais laço de shell** (`until npm run worker; do ...`). Ele sobrevivia à sessão e
  religou um worker enquanto outro rodava.
- **Log em arquivo:** `dados/logs/worker-AAAA-MM-DD.log`. Quando uma varredura "para", é lá
  que se vê por quê.
- **Para parar:** Ctrl+C no terminal dele, ou `npm run worker:parar` de qualquer lugar (pedido
  por arquivo, `dados/worker.parar`). Os dois devolvem as varreduras à fila **sem gastar
  tentativa**, gravam o lote aberto e encerram em ~1 s. O supervisor sai junto, sem religar.
- **Matar o processo (`taskkill /F`) não é parar.** No Windows o Node põe o filho num *job
  object* que o mata junto com o pai, sem aviso (medido: até filho sem canal nenhum morre). Os
  jobs ficam `PROCESSANDO` e o próximo worker os recolhe **na partida**, gastando uma
  tentativa.

**Três sinais, cada um com uma pergunta** (`src/lib/coleta/fila.js`):

| Sinal | Pergunta | Como |
| --- | --- | --- |
| `WorkerColeta.sinalEm` | o processo está vivo? | relógio, a cada 15 s (`SINAL_MS`) |
| `Job.sinalEm` + `workerId` | o dono ainda cuida do job? | relógio, a cada 15 s; sem sinal há 2 min = largado |
| última resposta do site (`ultimaRespostaDe`) | a varredura anda? | o vigia cancela após 10 min sem resposta |

Loja lenta não parece worker morto (o sinal é por relógio), e varredura travada não parece
viva (o vigia olha a atividade).

**O vigia olha a última RESPOSTA do site, e não o andamento em produtos.** O andamento só
aparece nos laços de página. A leitura de catálogo e sitemap vem antes e passou de 2 min na
Smartkits; numa loja com 10 s entre visitas passaria dos 10 min, e o vigia cancelaria uma
varredura legítima. Toda requisição termina em até 20 s, com sucesso ou erro, então varredura
viva responde a cada poucos segundos em qualquer fase.

**Três garantias que o banco dá**, em vez de o código conferir antes de agir:
- **Um worker por vez:** `pg_try_advisory_lock` numa conexão própria. A trava morre com a
  conexão, então processo morto nunca a deixa presa. O segundo worker sai com código 3, e o
  supervisor não insiste.
- **Um job aberto por fonte:** índice único parcial `Job_fonte_aberta` (só `PENDENTE` e
  `PROCESSANDO`), migration `20260916_worker_paralelo`. O Prisma não descreve índice parcial,
  então ele mora só no SQL. `enfileirar` usa `createMany({ skipDuplicates })`, e o botão e o
  ciclo de 30 dias podem enfileirar no mesmo instante.
- **Um dono por job:** `pegarProximoJob` é um `UPDATE ... WHERE id = (SELECT ... FOR UPDATE
  SKIP LOCKED)`. Antes era "achar, depois marcar", e dois workers pegavam o mesmo job.

**5 lojas em paralelo** (`COLETA_PARALELO`, padrão 5, pedido do dono; eram 3 no mesmo dia).
Cada domínio tem a própria fila de ritmo (`buscar.js`), então paralelo não aperta site nenhum.
É um worker com cinco varreduras, e não cinco workers, porque a varredura é espera de rede, não
CPU.

**A coleta NÃO usa `fetch`** (`src/lib/coleta/http.js`, sobre `node:http`/`node:https`). O
`fetch` do Node é o `undici`, e ele derruba o **processo inteiro** com
`AssertionError: assert(!this.paused)` em `Parser.finish`, seguido de abort do libuv.
- **Quando acontece:** o site responde com `Connection: close` e sem tamanho declarado, e fecha
  a conexão no instante em que o leitor do corpo está pausado por contrapressão. Nenhum
  try/catch alcança.
- **Quanto custou:** derrubou o worker 4 vezes em 16/09/2026, e 3 delas vieram em 13 min com
  três lojas em paralelo.
- **Reprodução:** 12 conexões simultâneas lendo com pequenas pausas
  (`dados/diag/repro4.mjs`, descartável). Cai no undici 7.29.0 do Node 24 **e** no 8.10.2, o
  mais novo, então atualizar não resolve. O cliente nativo passou 3×1.500 requisições no mesmo
  teste.
- **O que `obter` refaz à mão:** segue redirecionamento (recusa outro domínio em página, aceita
  em sitemap), descompacta gzip/deflate/br, aplica o teto de tempo até o último byte e o teto de
  tamanho, e sempre consome ou descarta o corpo.
- **Resto do sistema:** fora da coleta (integrações, IA, imagens) o `fetch` continua. Lá ele
  roda no servidor do site, e não no worker.

**Retomada: a varredura continua de onde parou** (pedido do dono em 16/09/2026).
- **Como funciona:** o job guarda `payload.inicioDaColeta`, gravado ao começar e mantido em
  queda, encerramento e recolhimento. A tentativa seguinte passa a data a `varrerFonte`, que
  busca os endereços gravados pelos lotes desde então (`enderecosGravadosDesde`).
  `colherProdutos({ jaColetadas })` não reabre essas páginas e as conta como `retomados`, no
  catálogo, no sitemap e na navegação (`rastrear({ pular })`, que não segue os links delas).
- **Fechamento:** a coleta fecha com a data da primeira tentativa e o total inclui os
  retomados.
- **Perda máxima numa queda:** o lote aberto, até 9 produtos.
- **Validade:** 3 dias (`RETOMADA_VALE_MS`). Depois disso o preço gravado envelheceu, e a
  varredura começa de novo.
- **Fornecedor com lista (Nightech) não retoma:** a trava de queda precisa da lista inteira.
- **Cada endereço é tratado uma vez por colheita** (`tratados` em `colher.js`, 16/09/2026).
  Catálogo, sitemap e navegação listam os mesmos produtos, e cada fase refazia a anterior.
  - **Retomados em dobro:** na Smartkits a tela mostrou 7.249 retomados para 3.625 gravados.
  - **Produtos reabertos:** os 3.780 itens do catálogo eram abertos de novo pelo sitemap, antes
    mesmo da retomada existir.
- **Catálogo completo encerra a colheita:** a loja declara o total e todos os itens foram
  lidos, então sitemap e navegação não rodam. Antes, a navegação ia até o teto de 20.000
  páginas atrás de produto que o catálogo já tinha dado; a tela marcava 564 s/produto. Com a
  correção, a Smartkits fechou em 8 min (157 páginas).
- **Teste:** queda no meio de uma loja de 25 produtos; o seguinte abre só o que faltava.

**Freio de secura: 300 páginas seguidas sem produto novo encerram a navegação** (`SEM_ACHADO` em
`descobrir.js`, 17/09/2026). O teto de 20.000 páginas não bastava. O Eletrogate declara **2.033** no
catálogo público e a colheita fecha em **2.030**: por causa de três itens que a loja conta e não
publica, a navegação saiu atrás deles e passou **6h40 abrindo 6.111 páginas sem gravar nada**. Loja
com produto a achar acha bem antes disso — a Usinainfo, que só se varre por navegação, acha um a
cada duas páginas. **Retomado não zera o contador:** não custou visita e não prova que ainda há o
que achar. Quando o freio corta, a tela diz por quê ("N páginas seguidas sem produto novo"), senão
"2.030 de 2.033" pareceria varredura interrompida por erro. Testado com um corredor infinito de
categorias na loja falsa do `teste:worker`.

**A navegação segue a paginação das categorias** (`parametroRuim` em `descobrir.js`, 07/10/2026). Até então
`p=` e `page=` estavam na lista de parâmetros recusados, junto de ordenação e filtro, e **a página 2 de
categoria nenhuma era aberta**. Produto que só aparece na página 2 ou seguinte de uma categoria, sem link em
destaque ou relacionados, nunca era achado. Caso real: o ESP32-S3-WROOM-1 N8 da Usinainfo (09795) só estava
em `esp32-611?p=2`. Visto em 17/09, ele sumiu da lista porque a varredura de 04/10 não passou por ele, e
**107** dos 2.515 produtos da Usinainfo ficaram de fora dela.
- **Regra nova:** paginação é seguida quando é um número de 2 a 500 (`ULTIMA_PAGINA`). `p=1` (a própria
  página 1), número inválido, número acima de 500 ou paginação junto de ordenação, filtro, busca ou `n=`
  continuam recusados.
- **Não era o preço:** a primeira suspeita foi a página do produto indisponível sem preço ser descartada. A
  Usinainfo publica o preço no OpenGraph mesmo indisponível (R$ 69,83, `OUT_OF_STOCK`), e a página passa como
  produto válido.
- **Efeito esperado:** a varredura de site abre mais páginas (as páginas 2+ das categorias) e acha os
  produtos que só estavam ali. A primeira varredura da Usinainfo com a regra nova ainda não rodou: conferir o
  total e o tempo.

**Tentativas numa queda.** Antes, o erro fatal devolvia todo job como PENDENTE, e o log mostrou
"tentativa 4/3".
- **Erro fatal:** o job na última tentativa agora FALHA e a fonte é adiada.
- **Pegar job:** `pegarProximoJob` não pega job com tentativas esgotadas.
- **Na fila:** `fecharEsgotados` fecha os que já estavam nela.

**Tela: botão de status** ao lado de "Varredura em andamento", com o número de lojas em
varredura. Ao clicar abre a tabela: produtos, páginas, **segundos por produto** e quanto falta.
- **Segundos por produto:** o worker mede entre o primeiro e o último produto **novo** desta
  passada, sem contar descoberta nem retomados, e só com 2 ou mais produtos.
- **"Falta" e o total:** só aparecem quando o total é o catálogo de verdade. `total` igual ao
  teto (20.000) é loja que não publica quantos tem, e "falta 11h38" seria inventado.
- **Vale a pena:** mostra por que uma loja demora. A Impacto CNC dá ~18–20 s/produto (10 s de
  Crawl-delay mais as páginas de categoria no caminho); as outras, ~2 s.

**Defeitos fechados, com a causa medida:**
- **Worker preso para sempre numa página.** `buscarPagina` desligava o relógio de 20 s quando
  chegavam os cabeçalhos, e o corpo era lido **sem teto**: loja que parasse de mandar bytes
  prendia o worker sem erro e sem log. Agora o `AbortSignal.timeout` vale até o último byte (e
  para robots.txt e sitemap). Teste: página que manda cabeçalho e para.
- **Cancelar demorava até 60 s**, porque catálogo, sitemap e preço à vista não recebiam o
  sinal. Hoje `sinal` chega a `colherProdutos`, `rastrear`, `lerCatalogo`, `descobrirSitemaps`,
  `lerSitemaps`, `lerAVista` e à requisição em voo.
- **Loja que esgotava as tentativas voltava à fila na volta seguinte**: continuava "vencida".
  Agora `adiarFonte` a empurra 6 h (`ESPERA_APOS_ESGOTAR_MS`).
- **Job largado só era recolhido entre um job e outro**: a Smartkits ficou 4 h "881 de 3780"
  com o worker varrendo a Impacto CNC. `recolherLargados` roda a cada volta (5 s), esteja o
  worker ocupado ou não.
- **Erro fatal fora de qualquer `try`** (o `AssertionError` do `undici` que derrubou o worker
  na Casa da Robótica): `uncaughtException`/`unhandledRejection` devolvem os jobs e saem com
  código 1, e o supervisor religa.
- **Varredura que não responde nem ao cancelamento** (60 s de graça): o job é devolvido e o
  worker reinicia, porque a promessa viva ainda poderia escrever no banco.
- **Andamento velho na tela**: o job pego zera `total/feitas/visitadas` no próprio `UPDATE`.
- **`NOT` sobre chave ausente de JSON nunca casa** (18/09/2026): `recolherLargados` e
  `fecharEsgotados` filtravam com `NOT: { payload: { path: ["teste"], equals: true } }`. Em SQL
  isso vira `NOT (payload->'teste' = true)`, que vale **NULL** para todo job *sem* a chave — e
  NULL não passa no `WHERE`. As duas funções não achavam job real nenhum. Como o índice
  `Job_fonte_aberta` só admite um job aberto por fonte, a fonte largada por worker morto ficava
  presa em "varredura em andamento" **para sempre**: foi o que prendeu a Santana e a Eletrogate
  depois de a máquina cair sem `worker:parar`. Hoje o descarte é em JS (`ehDeTeste`, poucos jobs
  abertos por vez). `pegarProximoJob` sempre esteve certo: usa
  `COALESCE(payload->>'teste','false') <> 'true'` em SQL cru.
  Nenhum teste pegou porque **todos** passavam `fontes` — o caminho do worker de verdade
  (`fontes = null`) não era exercitado. Ao testá-lo, o job de mentira não pode ser pegável pelo
  worker que está no ar: nasce `PROCESSANDO` e com as tentativas esgotadas, numa escrita só.

**`NOW()` do Postgres está em `America/Sao_Paulo`, e as colunas são UTC.** As colunas são
`TIMESTAMP` sem fuso, gravadas pelo Prisma em UTC. Comparado a elas, `NOW()` vira hora local,
3 h atrás. Em SQL cru, use `(NOW() AT TIME ZONE 'UTC')`. O teste do worker pegou isso antes de
ir ao ar: o job só seria pego 3 h depois, e todo sinal de vida nasceria velho.

**`COLETA_FONTES=<id,id>`** restringe o worker a essas fontes, com **outra trava**. Serve para
o teste (sobe ao lado do worker normal sem tocar na fila dele) e para varrer uma loja só ao
investigar. Fonte com `dominio` gravado **com protocolo** (`http://127.0.0.1:porta`) é varrida
como está; é assim que o teste usa uma loja falsa local.

**O teste do worker roda com o worker real no ar.** Os jobs dele levam `payload.teste = true`,
que o worker sem filtro não pega nem recolhe. Uma primeira versão criava uma fonte de teste já
vencida, e o worker no ar a enfileirou para si no meio do teste. Hoje o ciclo automático é
testado com um `agora` simulado (`enfileirarVencidas({ agora })`).

**Tela Mercados:** depois da migration, o servidor do site precisa ser **reiniciado**. Sem isso,
o cliente Prisma antigo na memória (`globalThis.prismaRise`) não tem `workerColeta`, e a consulta
de andamento dá 500.

**Em aberto no Mercados** — estado em 15/09/2026:

- **Conferir o campo Documentos na prévia do teste de fonte.** A extração está testada; o
  que nunca foi visto é a tela desenhando o link clicável.
- **A Nightech passa a varrer a vitrine inteira** (decidido em 15/09/2026). A primeira
  varredura depois disso ainda não rodou: conferir o tempo e o total que ela dá.
- **Usinainfo sem total de catálogo é de propósito**, não pendência: o único sitemap dela
  são 12 rotas de busca (ver "Sitemap", abaixo).
- **A varredura de site grava em lotes de 10 produtos** (`LOTE_GRAVACAO`), desde 16/09/2026, a pedido do dono (que escolheu 10, e não 50).
  Antes `gravarColeta` só rodava no fim, e a queda custava a varredura inteira: a Casa da
  Robótica tinha aberto 1.157 das 2.294 páginas e **nada** foi salvo, e o Eletrogate chegou a
  2.000 produtos só em memória, com dias de navegação pela frente.
  - `colherProdutos` chama `aoGuardar` a cada produto novo, e `varrerFonte` junta 10 e grava.
  - Os lotes vão **em fila** (`gravacoes`): produto é achado dentro de chamada que ninguém
    aguarda, e duas transações da mesma fonte criariam a mesma chave. O lote sai do buffer
    antes de gravar; lote que falha volta para a gravação final.
  - Lote grava com `fecharColeta: false` (não mexe na "última coleta"). A gravação final
    fecha com **`inicioDaColeta`**: a tela lista quem tem `vistoEm` a partir dessa data, e
    com a data do fim os lotes anteriores sumiriam da lista. O total é o da varredura inteira.
  - **Lista de fornecedor continua gravando de uma vez**: a trava de queda precisa da lista
    inteira para comparar.
  - Se o worker cair, os lotes gravados ficam, mas a "última coleta" da fonte não avança. A
    tela mostra a coleta anterior mais os lotes novos, até a próxima varredura fechar.
  - Varredura **cancelada** (worker encerrando, vigia) grava o lote aberto antes de sair.
  - **Mudança no código da coleta só vale depois de reiniciar o worker**: o Node carregou o
    código antigo. `npm run worker:parar` e `npm run worker`.
- A unidade de venda do fornecedor (ver "Ainda em aberto" em Fornecedores).

**As telas, e o vocabulário do dono** — ajustado ao longo de 01/09/2026:

- **"Sites" virou "Fontes"**, "Atualizar tabelas" virou **"Atualizar dados"**, "Coletados"
  virou **"Produtos atualizados"** e "Ficha Técnica" virou **"Características"**, para
  casar com a aba Produtos. Nome de tela é vocabulário de quem opera, não do código.
- **Fontes é dividida por abas** (Fornecedores / Concorrentes), por `?tipo=` na URL. Uma
  primeira versão pôs os dois lado a lado como cartões de resumo e o dono recusou: ele quer
  **a lista inteira de um tipo por vez**, não um resumo dos dois. Com a aba respondendo o
  tipo, a coluna "Fornecedor/Concorrente" saiu — repetir o rótulo em toda linha de uma aba
  que já se chama Fornecedores só gasta largura.
- **A coluna da lista só aparece na aba de fornecedor.** Concorrente tem vitrine; cinco
  linhas de travessão não são informação. Quem muda de colunas muda o `colSpan` das linhas
  de apoio junto (`COLUNAS_BASE`), senão as linhas de erro e edição desalinham.
- **"Última varredura" traz a duração entre parênteses.** É o que explica por que uma fonte
  demora quatro vezes mais que outra pelo mesmo trabalho — o Eletrogate e o Impacto CNC
  pedem 10s entre visitas, e sem o número a lentidão parece defeito nosso. Coleta antiga
  não tem o campo e **não ganha um inventado**: `null`, e a tela não mostra nada.
- **O botão pergunta o estado ao ABRIR a tela, não só depois do clique.** `situacao`
  nascia `null`, então quem chegasse no meio de uma varredura via o botão ocioso, clicava,
  e levava *"Já há uma varredura em andamento"* **em vermelho** — concluindo que a
  atualização falhou, quando ela estava correndo. Recusa não é erro: ela agora vira
  estado (botão desabilitado, fonte da vez e percentual), e o vermelho fica para falha de
  verdade.
- **Uma linha por loja em varredura** (até três), e "e mais N fontes na fila". O aviso
  "Nenhum worker no ar" vem do registro do worker (`WorkerColeta`), não da idade dos jobs —
  ver "Worker da coleta".
- **"2000 de 500 (400%)"**: o total é o que se sabia do catálogo, e o sitemap do Eletrogate
  lista só 500 endereços. Quando a contagem passa do total, a tela mostra só "N produto(s)" e as
  páginas abertas, sem percentual.
- **A fila aparece ao lado do andamento** ("e mais 4 fontes na fila"). Só a fonte da vez
  faz a varredura parecer quase pronta com cinco lojas pela frente, e há loja que pede 10s
  entre visitas — o Eletrogate leva 4min sozinho contra 49s da Smartkits.
- **"Retomar" ligava a fonte e a deixava invisível para o ciclo automático.** A fonte nasce
  pausada com `proximaVarreduraEm` a cem anos — para que salvar um cadastro não dispare
  varredura sozinho —, e `alternarFonte` só virava o `ativa`, deixando a data em **2126**.
  O ciclo filtra por ela, então a fonte aparecia **"Ativa" na tela e nunca era varrida**.
  Foi o que houve com a Fortek e a Nightech: passaram a sessão inteira ativas, com
  *"última varredura: nunca"*, enquanto as cinco concorrentes rodavam — e ninguém notou,
  porque a tela não tinha como mostrar a diferença entre "ativa" e "agendada". Retomar
  agora devolve a data; pausar não mexe nela, porque quem pausa quer parar.
- **A coluna se chama "Produtos no site/arquivo" na aba de fornecedor.** "No site" mentia
  ali: o catálogo da Fortek vem da **lista** que ela manda, não de vitrine — o portal dela
  está atrás de login e varrer devolve zero.
- **"Produtos no site" era gravado só no CADASTRO da fonte.** A colheita mede o tamanho do
  catálogo a cada varredura (`produtosNoSite` em `colher.js`) e o worker **descartava o
  número**: a coluna ficava congelada no que o teste viu no dia do cadastro, e fonte cujo
  teste não provou o total mostrava travessão para sempre — por mais varreduras que
  rodasse. O worker agora persiste, e o catálogo público e o sitemap são reconsultados a
  cada volta de qualquer jeito, então guardar sai de graça.
- **Mas só escreve quando a varredura PROVOU o total.** Espalhar o resultado inteiro no
  `update` gravaria `null` na varredura que não conseguiu medir, **apagando um número bom
  da semana passada** — a loja continua tendo 2.296 produtos no dia em que o sitemap não
  responde. Não saber quantos são não é o mesmo que saber que são zero.
- **Para fornecedor que manda lista, o catálogo É a lista.** Não há vitrine para contar:
  o total é o que a lista declara depois de conciliada, ausentes incluídos — eles
  continuam sendo produtos dele, só sem saldo confirmado nesta remessa.
- **A data é a da última coleta gravada, não a da varredura.** `ultimaVarreduraEm` só é
  escrito pelo worker; reprocessar a lista fora dele não mexia nele, e a Fortek aparecia
  como "nunca" com 1.911 produtos guardados. Hoje é `ultimaColetaEm`, escrito por quem grava.
- **O ⓘ guarda instruções de download/upload por fonte** (`FonteColeta.instrucoes`), porque
  cada portal tem um caminho diferente e isso vive hoje na cabeça do dono. **Senha não vai
  aí** — o campo é texto puro, aparece na tela e vai para o dump; credencial pertence à
  `Conexao`, cifrada. A tela diz isso por escrito.
- **O detalhe do produto de fornecedor espelha a prévia do teste de fonte:** duas caixas,
  *Pronta entrega* e *Reserva*, cada uma com preço, preço com impostos e a **quantidade
  dela**. Repor o que vendeu e planejar importação não se comparam pelo mesmo número, e na
  Fortek a reserva chega a custar mais caro (`65-276`: 79,90 contra 82,90). O operador
  aprova a fonte olhando aquelas caixas e depois consulta o produto aqui — dois desenhos
  para o mesmo dado obrigariam a reaprender a ler. Fornecedor que não diferencia o preço da
  reserva mostra o da pronta entrega com a nota *(mesmo da pronta entrega)*, e a caixa de
  reserva **some** quando o arquivo não trouxe o dado: vazia, ela diria que não há nada a
  chegar, quando a verdade é que a lista não informou.

**Um caminho só.** `colher.js` é usado pelo teste e pela coleta em lote, mudando só o
limite. Houve um período com duas trilhas — o teste usava o normalizador completo e a
gravação um extrator antigo — e o que a tela mostrava não era o que se guardava.

**Três formatos combinados, nunca escolhidos.** JSON-LD, **Microdata** (`itemprop`) e
OpenGraph. A Usinainfo publica preço em OpenGraph e código/marca em Microdata, sem
JSON-LD nenhum; o impactocnc só tem Microdata. Escolher um formato devolve metade.

- **Recorte no bloco do produto.** A página traz `schema.org/Product` dos **relacionados**
  ("quem viu isso viu também"). Sem recortar, 4 das 5 imagens eram de outros produtos.
  Corte no primeiro `isRelatedTo` ou segundo `itemtype=Product`.
- **Preço normal ≠ preço marcado.** Loja brasileira anuncia "R$ 49,90 / R$ 47,40 no pix".
  O `itemprop="price"` costuma ser o do **pix**. O de tabela vem em
  `productPriceWithoutReduction` (PrestaShop) ou `data-sell-price`. Atributo `data-price`
  **só conta se for MAIOR que o preço marcado** — noutra loja havia `data-price="0"`,
  `"2.09"` e `"4.85"`, que eram **opções de frete**.
- **`og:description` é resumo de SEO** (~155 caracteres). Vence a descrição **mais longa**
  entre as fontes, não a de um formato preferido: 138 contra 2946 na mesma página.
**Documentos: o datasheet do concorrente** — `documentos: [{titulo, url}]`, campo próprio e
clicável na prévia, nunca endereço colado dentro da descrição. É o que permite conferir se
o produto do concorrente é o **mesmo** que o nosso: dois módulos com nome diferente e o
mesmo CI são o mesmo item.

- **O que identifica documento é o TEXTO DO LINK**, mais extensão de arquivo (`.pdf`,
  `.zip`, `.stl`…) e endpoint de anexo (`controller=attachment`, do PrestaShop).
- **"Sai da loja" NÃO serve, e chegou a ser usado.** Parecia bom porque foi medido só no
  bloco da descrição de uma loja. Varrendo a página inteira, esse critério devolve **30**
  candidatos na Smartkits — WhatsApp vinte vezes, Instagram, TikTok, o selo da Loja
  Protegida — e **6** na Usinainfo, todos redes sociais. Com texto + extensão + anexo, as
  duas devolvem **um**: o datasheet.
- **Os dois casos reais não se parecem, e nenhum critério sozinho pega os dois.** A
  Smartkits hospeda no **Google Drive** — fora do domínio e sem extensão. A Usinainfo serve
  pelo **anexo do PrestaShop** (`index.php?controller=attachment&id_attachment=101`) — no
  próprio domínio e também sem extensão; responde `200` com
  `Content-Disposition: filename="Datasheet DS18B20.pdf"`. O `get-file` é que está no
  `Disallow` do robots; `attachment`, não — e de todo modo o endereço só é **guardado**,
  nunca baixado.
- **Varre a página inteira**, porque o link não mora num lugar só: na Tray fica dentro da
  descrição, na Usinainfo numa aba própria (`li.download_produto`), fora dela.
- Vocabulário de **documento**, não de página: "blog", "tutorial" e "projeto" ficam de fora
  de propósito — a Usinainfo linka o próprio blog no meio da descrição.
- **Especificações**: seção declarada pelo site, lida como **lista ordenada** de
  `{nome, valor}` — `nome: null` na linha sem rótulo, porque objeto JSON não comporta isso
  sem inventar chave. Encerra no título seguinte, num parágrafo, ou numa **linha em branco
  seguida de algo que não é par**.
- **O título da seção nem sempre tem dois-pontos.** A Smartkits escreve só
  `Especificações` no JSN-SR04T, em caixa normal, e a ficha inteira — dez itens — era
  descartada por causa de um caractere. A folga vale só para o título que o vocabulário já
  reconhece, curto e de até três palavras: aceita-se a linha que **só anuncia** a seção,
  nunca a frase que menciona a palavra.
- **O marcador de lista vale mais que a heurística de tamanho.** Onde o site escreveu `-`,
  ele está dizendo "isto ainda é ficha": o teto de palavras do rótulo sobe, e a regra de
  parágrafo não se aplica. `- Diferença mínima entre a entrada e saída: 1. 5 V DC;` tem
  sete palavras no rótulo (o teto era seis), então deixava de ser par, caía na regra de
  parágrafo por ter doze palavras no total e **encerrava** a ficha do XL6009 no terceiro
  item de onze. Quem limita rótulo é o tamanho em caracteres.
- **Numa lista marcada, linha sem marcador encerra.** É o site mudando de assunto sem usar
  dois-pontos no subtítulo: no JSN-SR04T a ficha é seguida de `Downloads`, `Acompanha` e
  `Garantia` — sem marcador, sem dois-pontos e sem linha em branco antes. Nenhuma das
  outras regras os alcançava, e os seis viravam especificação. O par escapa antes, então
  item solto sem hífen no meio da lista continua sendo lido.
- **Categoria**: breadcrumb em Microdata (só os `name` dentro de `itemListElement`) ou o
  **dataLayer do GA4** (`item_category`), casando por `item_sku` — a página empurra um
  objeto por produto, incluindo relacionados.
- **Estoque**: nenhuma loja testada declara `inventoryLevel`; o número está no texto
  (`estoque-qtd-45`, "Estoque: 45 unidades").
- **Imagens**: deduplicar por foto, ignorando o segmento de dimensão da URL
  (`/600x450/` e `/800x800/` são a mesma), e ficar com a maior.
- Campo ausente fica `null` — **nunca inventado**. Cada produto carrega `origens`, dizendo
  de onde veio cada valor, para distinguir lido de derivado.

**Plataformas, e o que cada uma esconde:**

- **Magento 2 (Saravati): o JSON-LD não vem solto — vem dentro de `ItemPage`.** O bloco único
  da página é um `ItemPage` com o produto em `mainEntity`, e o achatamento só descia por
  `@graph`: a página inteira era lida como "sem JSON-LD", caía no OpenGraph e o código saía
  **deduzido do endereço** (`4gb-ram` em vez de `srvt001158`). Em 15/09/2026.
- **Três preços na mesma página, e só um é o que se paga.** `data-price-type="finalPrice"` e
  o `product:price:amount` do OpenGraph trazem o do cartão (1.499,90); a oferta do JSON-LD
  traz o do **pix/boleto** (1.349,91); e `data-price-type="oldPrice"` é o **riscado**
  (1.599,90), que não é preço vigente e **não pode virar o normal** — o dono marcou o de
  1.499,90 como o preço integral. A loja não publica Microdata nenhum, então o riscado não
  entra como candidato; se um dia entrar, a regra do maior preço o elegeria.
- **O saldo está só no texto**: `<div class="availability only" title="2 itens">`. Ancorar no
  bloco é o que separa do "N itens" do carrinho.
- **A galeria do Magento só existe num bloco JSON.** Das três fotos da página da Saravati,
  só a principal é `<img>`; as outras duas vivem na inicialização
  `"[data-gallery-role=gallery-placeholder]"`, como `{thumb, img, full}`. Nenhuma regra
  baseada em `<img>` as alcançava. Fica o `full`, que é a maior das três versões do mesmo
  arquivo, e a galeria entra **antes** das estruturadas — a primeira entrada é a principal, e
  endereço de Magento não declara dimensão, então quem chega primeiro é quem fica.
- **O `/cache/<hash>/` do Magento é recorte, não foto.** A mesma foto principal chega por três
  caminhos (og:image, JSON-LD e o `full` da galeria), cada um com um hash diferente: a
  Saravati aparecia com "2 imagens" que eram **a mesma foto duas vezes**. O hash de 32
  caracteres e o segmento `cache` saem da identidade, como já saía o `/600x450/`.
- **CDN citado num link não é CDN da loja.** A mesma página da Saravati saiu identificada
  como **Loja Integrada**: ela cita `cdn.awsli.com.br` uma única vez, num `<a>` para o PDF do
  datasheet hospedado no CDN de outra loja, e isso valia os 5 pontos de CDN próprio — empate
  com o Magento (caminho 3 + marca 2), decidido pela ordem da lista. Agora o host só vale 5
  quando **serve** a página (`src`, `<link href>`); citado num `<a href>` vale 2. Plataforma
  errada não é detalhe: é ela que diz à tela onde procurar preço, código e imagens.

- **Tray** (Casa da Robótica): o microdata declara **só o nome** — sem `price`, sem
  `offers`, sem `sku`. A página tinha nome e endereço e mesmo assim reprovava por falta
  de preço. O preço vive num campo oculto, `<input id="preco_atual" value="25.99">`, que é
  o único lugar legível por máquina: o preço visível quebra os centavos em `<span>`
  aninhados. Logo abaixo vem `precoAvista`, **menor** — é o do pix, não o de tabela.
- **Tray: `preco_atual` vem `0.00` no produto esgotado.** A página do SK1089 mostra "Não
  disponível" e zera o campo, enquanto o `dataLayer` segue anunciando 59,90. Quem lê só o
  input perde o preço justamente onde a comparação interessa — o concorrente continua
  publicando quanto cobra. A alternativa é `price`/`priceSell` do `dataLayer`.
- **Tray: `priceSellDetails` vem STRING VAZIA quando não há parcelamento.** Não é lista
  vazia nem campo ausente, e é assim na Smartkits inteira, inclusive num produto de
  R$ 4.299,90 — enquanto `listSku` e `breadcrumbDetails` na mesma página são arrays de
  verdade. O `?.` não alcança `""`, e `"".find` derrubava a validação da fonte com
  `find is not a function` antes de qualquer preço ser lido. Campo de JSON de terceiro
  quer `Array.isArray`, não encadeamento opcional.
- **Loja Integrada** (Eletrogate): a galeria fica **fora** do escopo do `itemtype=Product`.
- **Tray**: os relacionados ficam **dentro** desse escopo. As duas convenções são opostas,
  e é por isso que recortar no bloco do produto **não** serve de regra geral para imagem.
- **Loja Integrada (4hobby), 22/09/2026: galeria repetida na página derrubava o teto de
  segurança e cortava fotos de verdade.** O produto tinha 4 fotos, mas só 1 era salva. A página
  publica a galeria **duas vezes** (a tira visível + um bloco oculto para o zoom/lightbox,
  `jquery.fancybox`), e cada foto aparece em várias resoluções (miniatura, zoom, tamanho médio)
  — 4 fotos reais geravam **17 candidatas brutas**, acima do teto de 10 que existe para não
  confundir "pasta compartilhada da loja" com galeria de verdade (`TETO_DE_GALERIA` em
  `normalizar.js`). O teto descartava a galeria **inteira**, sobrando só a foto principal.
  Corrigido: as candidatas são deduplicadas por foto única (`semRepetir`, que já escolhe a maior
  resolução de cada uma) **antes** de aplicar o teto — ele agora compara fotos de verdade, não
  ocorrências repetidas da mesma foto.
- O **dataLayer é JSON lido por regex**, então os escapes chegam crus: a categoria aparecia
  como "Componentes Eletr\u00f4nicos" na tela. Decodificar só ali, onde se sabe que a
  origem é JSON — em `comoTexto` isso alcançaria texto de HTML, onde a sequência não é
  escape nenhum.

**Imagens além do formato estruturado:**

A loja publica só a principal em `itemprop`/`og:image`; as outras ficam em `<img>` comum
(`data-largeimg`, `data-zoom-image`). O filtro do que é do produto é o **diretório
completo** da foto, com origem — não a última pasta: a RoboCore serve
`.../1180/images/1180_1_H.png`, e "images" casava com o ícone do WhatsApp, o `blank.gif`
e a foto do produto 908.

- **Tamanho pode estar no NOME**, não no caminho: `1180_1_H`, `_X`, `_S`, `_L` são a mesma
  foto. Sem tratar isso, três fotos viravam dez.
- **Teto de 10 por galeria**, para a plataforma sem regra própria. Passando disso o
  diretório não é do produto, é balde da loja inteira. Descarta-se a galeria inteira, e não
  se apara a lista: não há como saber quais eram do produto. Fica só o que veio estruturado.
- **Na Tray o filtro é o id do produto no nome do arquivo**, não o diretório: o CDN serve
  o catálogo inteiro de `/img/img_prod/<loja>/`, e ali o diretório não separa nada.

**Catálogo público da plataforma:**

Algumas plataformas publicam a lista de produtos em JSON, sem credencial — a Tray em
`/web_api/products`, a Shopify em `/products.json`. O registro em
`src/lib/coleta/plataformas.js` guarda o endereço de cada uma; a leitura mora em
`src/lib/coleta/catalogo.js` e passa por `buscarPagina`, então robots.txt e ritmo valem
igual — catálogo público não é licença para atropelar o servidor.

- **Ele encurta a descoberta, não a leitura.** Na Tray o catálogo dá o total exato (2296
  contra o "500+" do sitemap) e a lista de imagens, mas **não traz a referência da loja**
  (`Ref: 21A502`) nem o preço à vista. Como o código é a chave de acesso ao produto do
  concorrente, a página continua sendo aberta uma a uma.
- **Só imagens e NCM vêm do catálogo.** Preço, nome e código não: o `promotional_price`
  da Tray vem `0` num produto que anuncia desconto à vista, e a referência não existe ali.
  Deixar o catálogo vencer nesses campos apagaria dado bom com dado ausente.
- **A LISTAGEM da Tray trunca em 4 imagens por produto.** Medido: todo item de
  `/web_api/products?limit=50` vem com exatamente 4; `/web_api/products/{id}` do mesmo
  produto traz 9.
- **Fonte declarada ≠ fonte completa.** O catálogo **soma** às imagens da página, nunca
  substitui. Substituir custou cinco fotos por produto: a lista era autoritativa sobre
  *de quem* é a foto, e ainda assim era uma amostra. Trocar uma fonte por outra só se
  justifica depois de medir que a nova cobre tudo que a antiga cobria — somar é o padrão
  seguro, porque a deduplicação já cuida da sobreposição.
- **Não afirme sobre o site o que não foi medido.** O sitemap só é consultado quando o
  catálogo não completa a cota, e o passo "Sitemap identificado" só aparece quando a
  consulta aconteceu — dizer "não publicado" sem ter olhado é inventar um fato.

**O preço à vista pode não estar na página:**

Na Tray o bloco "Formas de Pagamento" é montado por AJAX. A Smartkits anuncia
*"à vista R$ 52,15 — Desconto de 5 %"* e a string `52,15` **não existe uma vez sequer** no
HTML entregue: o que vem é o preço de tabela, 54,90. Sem abrir
`/mvc/store/product/payment_options?loja=<idLoja>&IdProd=<id>&preco=<preco>`, o desconto do
pix não é coletado e a comparação usa um preço que ninguém paga. Leitura em
`src/lib/coleta/pagamento.js`; o endereço é dado, no registro da plataforma.

- **Fora do `Disallow`.** O robots.txt da Tray barra o endpoint **antigo**
  (`/loja/pag_parcelado.php`) e os de carrinho — não este. Responde **ISO-8859-1**, então
  tem que passar por `buscarPagina`.
- **UMA requisição por FONTE, não por produto.** O ritmo é de uma visita a cada 2 s por
  domínio, então perguntar item a item **dobrava** a colheita: numa fonte de 20 produtos,
  40 s viravam 80 s. O desconto à vista não é do produto — é da **loja**: 5% em todos os
  produtos medidos na Smartkits e na Casa da Robótica. A regra é aprendida no primeiro item
  e aplicada ao resto (`novaMemoriaDePagamento`, uma por colheita — nunca global, senão uma
  loja responde pela outra).
- **O arredondamento do centavo NÃO é igual em toda loja Tray.** A Smartkits **trunca**
  (8,90 −5% = 8,455 e ela cobra 8,45); a Casa da Robótica **arredonda** (4,89 −5% = 4,6455
  e ela cobra 4,65). Supor um dos dois erra o outro em um centavo.
- **Só adota a regra quando a amostra DISCRIMINA os dois modos.** Conferir que a regra
  reproduz o valor lido não basta, e isso já custou um centavo errado: o primeiro produto
  da Casa da Robótica (12,99 −5% = 12,3405) dá 12,34 truncando **ou** arredondando, então
  não prova nada — e a regra escolhida ali errou o produto seguinte. Enquanto os dois modos
  explicarem todas as amostras, continua perguntando. Na prática: Smartkits resolve em 1
  leitura, Casa da Robótica em 2.
- **A conta é em centavos inteiros.** Em ponto flutuante, 59,90 × 0,95 vira
  56,90499999999999 e o meio-centavo some — fazendo os dois modos parecerem iguais
  justamente na amostra que os separaria.
- Modo nenhum explicando as amostras, ou percentual mudando entre produtos: `semRegra`, e a
  fonte pergunta produto a produto até o fim. Preço errado de concorrente é pior que coleta
  lenta.
- `percentual: 0` é resposta legítima: loja sem desconto à vista. Guardar isso evita 19
  requisições que devolveriam sempre o preço de tabela.
- **A origem diz se foi lido ou calculado.** `origens.precoPromocional` sai como *"formas
  de pagamento — desconto de 5%"* no primeiro e *"calculado: desconto de 5% da loja,
  conferido em N leitura(s)"* nos demais. Sem isso, não haveria como saber em qual dos
  dois casos um produto caiu.
- **Só uma parcela conta**, a mesma regra do `priceSellDetails`. E o valor sai do `<b>`,
  não de qualquer `R$` da linha: o cartão escreve *"Parcela Mínima de `<strong>`R$
  30,00"* na mesma `<tr>`, e um leitor guloso gravaria 30,00 como preço do produto.

**Códigos, imagens e charset:**

- **O código é o ponto de acesso ao produto do concorrente.** Campo com mais de um código
  vira mais de um produto: a Casa da Robótica publica `reference="AF01 ou AF02"`, e um
  registro com os dois dentro não é achado por nenhum dos dois. Separa em disjunção
  explícita (`ou`, vírgula, ponto-e-vírgula) — **nunca em hífen, ponto ou barra**, que
  fazem parte de códigos inteiros (`F30-004`, `HK-502`, `5V/3A`).
- **Na Tray, o `sku` do JSON-LD é o id INTERNO, não o código da loja.** Medido em três
  lojas: onde o JSON-LD publica `sku`, ele é sempre igual ao `idProduct` do `dataLayer`
  (Smartkits 1079, Arduino Brasil Shop 1001), e o código que a página mostra ao cliente —
  **`REF: SK1244`** — é o `reference`. A Casa da Robótica não publica `sku` nenhum, e por
  isso já vinha certa. O desvio em `normalizar.js` só vale quando está **provado** que os
  dois são o mesmo número: loja que um dia publicar `sku` próprio continua vencendo pela
  ordem normal.
- **Sem código na página, o produto entra como `N/A`** — decidido pelo dono, e é a única
  exceção à regra de nunca inventar valor. Por isso `origens.code` sempre registra que a
  marcação foi nossa. Constante `SEM_CODIGO` em `normalizar.js`.
- **A Tray usa três convenções de nome de arquivo na mesma loja:** `73_5_<data>` (id abre),
  `71_variacao_3_0_<data>` (id abre, foto de variação) e
  `modulo_..._ky_019_73_1_<hash>` (id depois do slug). O padrão aceita o id no início ou
  entre sublinhados seguido de número — a segunda forma exige o dígito porque um hash
  como `..._5227_1_71ff6f9c...` seria confundido com o produto 71.
- **Charset não é sempre UTF-8.** A Casa da Robótica serve `charset=ISO-8859-1`, e
  decodificar tudo como UTF-8 gravava "M�dulo Rel�" **no banco**, não só na tela. O
  charset vem do cabeçalho e, na falta dele, do `<meta charset>` — lido numa prévia em
  latin1, onde todo byte é válido e a declaração, sendo ASCII, sobrevive intacta.

### Fornecedores: importação de arquivo

Fornecedor não tem vitrine para varrer — a Fortek/Benser é um **portal B2B atrás de
login**, a Santana Import só mostra preço a cliente cadastrado. O caminho é o operador
trazer o arquivo (Ctrl+S na página, ou o catálogo baixado). **Nenhuma credencial passa
pelo sistema**, e pedir a senha do dono foi recusado de propósito.

Leitura em `src/lib/coleta/arquivos.js`. O produto sai no **mesmo formato da coleta** —
muitos leitores, uma forma só, senão a tela passaria a precisar saber de onde veio a linha.

**Os três formatos, medidos em arquivos reais:**

| Arquivo | Formato | Produtos | Onde o dado estava |
| --- | --- | --- | --- |
| Benser (10,8 MB) | HTML | 1592 | array JSON num `<script>`, com 1592 fotos em base64 |
| Santana (3,7 MB) | PDF | 989 | texto tabulado; `getTable()` volta **vazio** em 65 de 69 páginas |
| Nightech (16 MB) | XLSX | 457 | cabeçalho na **linha 6**; 459 imagens **ancoradas**, fora das células |

- **PDF: ancore no código no início da linha.** O catálogo da Santana tem 9465 linhas e
  só 989 são produto — sem âncora entram título de seção e texto de garantia.
- **XLSX: procure o cabeçalho, não assuma a linha 1.** Planilha de fornecedor começa com
  logo e total. E **casar coluna por PREFIXO**: a Nightech escreve `PREVISÃO 20/09` e
  `VALOR UNIT. (R$)`, com data e moeda coladas no nome.
- **Coluna que parece estoque e não é.** `QUANTIDADE DO PEDIDO` é o pedido do comprador —
  lê-la como saldo mostraria zero num produto com 4618 em estoque. Lista `CAMPOS.ignorar`.
- **Imagem no Excel flutua sobre a folha**, ancorada a uma posição. O caminho é
  âncora → linha → código → foto, com o binário em `workbook.model.media[imageId]`.

**Pronta entrega e reserva:**

- `stock.quantity` é **sempre** a pronta entrega; `stock.aChegar` é o que está comprado e
  em trânsito. **Nunca somados** — um número só prometeria entrega que não existe.
- `prices.normal` é o de pronta entrega (decisão do dono); `prices.reserva` é o do que vai
  chegar. Medido na Fortek: `65-276` custa **79,90 na reserva e 82,90 na pronta entrega** —
  num campo só essa inversão sumiria.
- **Dois arquivos** (Fortek) ou **duas colunas** (Nightech). O arquivo diz qual lista é pelo
  `<title>`: *Benser · Lista de Reserva* contra *Benser · Portal de Pedidos*. O título veio
  do fornecedor; o nome do arquivo o operador renomeia. Na dúvida, pronta entrega.

**Regras por fornecedor** — `src/lib/coleta/fornecedores.js`, dado e não código:

- **Fortek — `sufixoDeCarga`.** `02-268-A` é o mesmo item que `02-268`; o sufixo é a carga.
  Confirmado pelo dono em 31/08/2026. Junta 153 pares a mais (1911 contra 2064). **Vale só
  para ela**: noutro catálogo `-2` pode ser voltagem ou versão, e juntar apagaria produto.
- **Nightech — `mesclarSiteComArquivo`.** O site tem foto, texto de venda e endereço; a
  planilha tem preço e saldo. Mesmo código = um produto.

A mesclagem em si mora em `src/lib/coleta/mesclar.js`, **sem imports**, usada pelo servidor
(duas listas) e pela tela (site + arquivo). Duplicá-la faria as duas divergirem em silêncio.

- **Quem chega primeiro vence**, e quem chama decide a ordem: pronta entrega antes da
  reserva; site antes da planilha.
- **Descrição: vence a mais longa**, não a primeira.
- **Fotos somam, a nova por último.** Site primeiro (resolução de venda), planilha depois
  (miniatura de conferência). A primeira é a que vira miniatura na tela.
- **`aChegar` SOMA** quando o mesmo produto vem em duas cargas. Manter só a primeira
  descartava a segunda em silêncio — 13 casos com `65-361` e `65-361-2` na mesma lista.

**A prévia mostra 3 produtos, o arquivo tem centenas.** Por isso a ação devolve também um
`porCodigo` — índice do arquivo inteiro, **sem imagem e sem descrição** (são os campos
pesados). Sem ele a mesclagem tentava casar 3 sorteados com 3 do site e quase nunca
acertava, o que fazia a regra *parecer* quebrada.

**O total da fonte é um TETO.** Site + arquivo − códigos conferidos nos dois. O teste abre
três páginas, então só três casamentos são confirmados; os outros produtos do site podem
estar no arquivo também. O passo na tela diz quantos foram conferidos, em vez de fingir
precisão.

**Impostos** — `src/lib/coleta/impostos.js`. Distribuidor cobra por fora: a Benser escreve
*"Preço unit. sem IPI"*. `prices.comImpostos` guarda o valor somado, e `taxes` diz quais
entraram. **Só rótulo conhecido** (IPI, ICMS, ICMS ST, FCP, PIS, COFINS) e alíquota entre 0
e 100 — varrer atrás de qualquer `%` traria desconto e garantia para dentro do custo. O
imposto sai das especificações: ele tem campo próprio, e repetir diria a mesma coisa duas
vezes.

**O arquivo entra pela tela, não pela linha de comando** — feito em 01/09/2026. O
fornecedor manda a lista por e-mail ou WhatsApp; o operador anexa na linha da fonte, em
`ArquivosDaFonte.jsx`, e "Atualizar dados" reprocessa **o último arquivo de cada tipo**.

- Os originais vão para `dados/coleta/<domínio>/arquivos/` (`guardarArquivosOriginais`);
  quais são e quando chegaram, para `FonteColeta.listaArquivos` e `listaEnviadaEm`. Fora do
  git e fora de `public/`, igual às fotos de produto.
- **O nome do arquivo vem do navegador e é dado de terceiro.** Passa por
  `path.basename` e `replace(/[^\w.\- ]/g, "_")` antes de virar caminho: `../../.env` é um
  nome de arquivo perfeitamente válido para quem envia, e sem isso seria um destino de
  escrita perfeitamente válido para nós.
- **Teto de 24 MB, conferido nos dois lados.** No cliente para dar recado, no
  `next.config.mjs` porque acima disso o 413 vem **antes** do nosso código — a planilha da
  Nightech tem 16 MB.
- Reprocessar é `reprocessarArquivos`, o mesmo caminho da leitura de arquivo: a tela não
  ganhou um segundo extrator.

**Conciliação: o que some da lista não é apagado** — `src/lib/coleta/conciliar.js`, sem
imports, testado em `npm run teste:extracao`. Combinado com o dono em 01/09/2026:

- Novo entra; conhecido atualiza; **ausente fica, com o saldo a `null`**.
- **Ausente não é zero, e a distinção é o ponto todo.** "Esgotou" é afirmação do
  fornecedor; "não veio na lista" é observação nossa. Gravar `0` poria na boca dele um
  número que ele não disse — contra a regra que vale no resto do sistema. O motivo fica em
  `ausente.desde/motivo` e em `origens.quantidade`, para a tela dizer qual dos dois casos é.
- Apagar jogaria fora código, descrição, fotos e NCM — caros de obter — por causa de uma
  linha que não veio, e o item costuma voltar na semana seguinte.

**A trava de queda: uma lista pela metade é recusada inteira.** `quedaSuspeita`, teto de
50%. Não é hipótese: um upload parcial da Fortek chegou com 512 produtos contra 1.911
guardados, e teria marcado **73% do catálogo como ausente sem um erro na tela**. Foi
recusado, e os 1.911 ficaram intactos.

- A causa concreta é a Fortek mandar **duas** listas — pronta entrega e reserva. Enviar só
  uma marca como ausente todo produto que só existe na outra. Vale igual para exportação
  truncada ou da aba errada.
- **Só compara arquivo com arquivo.** A colheita do site traz 20 produtos e o arquivo traz
  1.900: comparar os dois acusaria queda em toda troca de caminho, e o aviso viraria ruído
  que se aprende a ignorar.

**Ainda em aberto:** a unidade de venda — a Santana publica *Múltiplo de venda: 100*, e
preço por embalagem comparado com varejo engana.

**Fornecedores com conta, ainda não ligados** — `FORNECEDORES.md`, na raiz. São 32 contas
que o dono já tem, registradas a partir de 01/09/2026.

**Nomes não entram no código.** Uma primeira versão colocou a lista dentro de
`src/lib/coleta/fornecedores.js` e o dono recusou em 01/09/2026: o arquivo de regras é
lido pelo `regrasDoFornecedor` a cada coleta, e uma lista de intenção ali passa a parecer
configuração ativa — alguém acabaria iterando sobre ela. O `.md` na raiz não tem `export`,
ninguém o importa, e ele volta à conversa só quando o dono pedir um nome.

Ter a conta não é ter o fornecedor ligado: implementar um deles começa por descobrir como
o dado chega — vitrine pública, portal atrás de login ou arquivo exportado —, e só então
decidir entre coleta e importação. **Site só está anotado onde o dono deu** (hoje doze). A
**Solda Fria** é a mais adiantada — é a loja em que a plataforma OpenCart foi conferida em
`plataformas.js`, então só falta cadastrá-la como fonte.

Arquivos de origem em `C:/Users/pesso/Downloads/`.

### Sites que exigiram tratamento próprio

- **Santana (santanaimport.com.br): portal B2B, preço SÓ com login, varrido POR CATEGORIA** —
  implementado em 17/09/2026. Plataforma Add Suite, ASP.NET WebForms. Leitor em
  `src/lib/coleta/portal-addsuite.js`, regra (ritmo, itens por página) em `fornecedores.js`
  (`portal`), reconhecida **só pelo domínio** (`portalDoEndereco`): pelo nome, um concorrente
  "Santana Eletrônicos" viraria portal.
  - **Como o dono usa:** cadastra com o link de UMA categoria e o login. O teste entra e lê a
    primeira página (12 itens). Depois, em **Categorias** na linha da fonte, adiciona ou remove
    links e troca o login. A varredura lê só as categorias da lista.
  - **Onde mora:** `FonteColeta.categorias` (`[{url, total, lidos, varridaEm, adicionadaEm}]`) e
    `credencialCifrada` (`{usuario, senha}` com `lib/crypto.js`) + `credencialAtualizadaEm`,
    migration `20260917_fonte_portal_login`. **Não em `Conexao`**: lá é uma linha por serviço
    (enum único), e o login é de cada fornecedor. A tela só recebe `temLogin`.
  - **Sem login:** nome, código, foto, NCM, EAN, peso e dimensões; no preço, *"Faça o Login para
    visualizar o preço"*. Nenhum JSON-LD, Microdata ou OpenGraph com preço.
  - **Login sem captcha:** GET em `/minhaconta/identificacao`, POST com os campos ocultos
    (`__VIEWSTATE`...), `__EVENTTARGET=ctl00$ContentPlaceHolder1$lkEntrar`, `tblogin` e `tbSenha`.
    302 para `PainelCliente`; sessão = cookie `ASP.NET_SessionId`. Quem prova que entrou é o link
    `SAIR` (`PainelCliente` aparece também no anônimo). Por isso `obter` (`http.js`) ganhou
    `metodo`, `corpo`, `seguir: false` e `setCookie`: o cookie chega na resposta do POST.
  - **A lista da categoria dispensa a página do produto.** A página da categoria chama
    `/handlers/departamento/CategoriaResult.ashx?categoria=&subcategoria=&qtdePorPagina=&paginaAtual=&ordenacao=`,
    que devolve JSON com `html` e `total_registros`. Cada item traz link com `?sku=`, código
    (`data-sku`; esgotado só tem `Ref:`), preço, IPI %, ST em R$, preço com impostos, caixa
    inner/master, faixas de quantidade, múltiplo de venda (`adicionarMaisVitrini('sku', 5)`) e botão
    de comprar. Sem quantidade em estoque, e sem marca (só na página do produto).
  - **Link → parâmetros:** último trecho = `subcategoria`, penúltimo = `categoria`; um trecho só é
    a `categoria`. Categoria termina em **`.html`**, produto em **`.htm`**: aceitar os dois
    cadastraria página de produto como categoria (o teste pegou).
  - **A paginação repete e pula produtos.** Empates na ordenação: na Componentes (7.068), a página
    40 de 100 veio inteira com itens das 34 e 35. A leitura nunca para na página repetida, vai até
    `ceil(total/porPagina)` e repassa nas ordenações 0, 1 e 2 enquanto a categoria não fechar o total.
  - **Peso:** cada item traz foto em base64 (~150 KB); descartada antes de ler.
  - **Compra em lote e múltiplo de venda NÃO são característica** (o dono, 17/09/2026, repetindo).
    Campos próprios em `ProdutoColetado` — `precosPorQuantidade` (`[{rotulo, minimo, maximo, preco}]`)
    e `multiploVenda` —, migration `20260917_compra_em_lote`, e caixas próprias ao lado de Pronta
    entrega (`RegrasDeCompra.jsx`, na prévia e no detalhe). Vale também para o múltiplo das
    planilhas (`arquivos.js`). Na assinatura, os dois só entram quando existem (`undefined`), senão
    a primeira varredura depois deles reescreveria todas as fontes; no banco, ausência grava null.
  - **Marca e EAN não vêm na lista** (só na página do produto, 1,5 MB cada). O dono decidiu NÃO abrir
    a página na varredura: o leitor grava em `origens.brand/ean` o aviso *"nao vem na lista: veja no
    link do produto"*, e a tela o mostra sob o campo vazio. Só este leitor grava o aviso — vale só
    para a Santana.
  - **Status:** o leitor grava `IN_STOCK`; a prévia só conhecia `AVAILABLE` e mostrava
    "Indeterminado". Acrescentado ao mapa da `PreviaProduto`.
  - **BLOQUEIO medido:** a 2 s entre pedidos, ~150 pedidos no dia (listas de 1,5 a 15 MB), a Santana
    passou a cortar a conexão (`ECONNRESET`) **só para o user-agent do sistema**. Voltou em menos
    de 1 h. **Não se troca o user-agent para contornar.** Ritmo agora **30 s**, 50 itens por página;
    `ECONNRESET` encerra a varredura com recado. A 30 s, 500 produtos levaram 6,8 min, sem bloqueio.
  - **Só segue redirecionamento para o próprio portal** (`ehDoPortal`: mesmo esquema, porta e host, com ou sem
    `www.`): o cookie de sessão vai em TODO pedido da sessão, e um redirecionamento para outro site, ou um open
    redirect no portal, o levaria junto. Outro destino interrompe a varredura com recado (revisão de 08/10/2026).
  - **Sem retomada:** paginação que repete não permite pular página já lida. A queda recomeça, mas
    os lotes (uma página por lote) ficam gravados.
  - **Sem `?sku=` a página do produto mostra o padrão do modelo** (R$ 0,00, "indisponível") — só
    importa para quem abrir produto avulso; a coleta não abre.
  - **Termos de uso:** site para clientes com login; proíbem reproduzir conteúdo "para fins
    comerciais", sem falar de acesso automatizado. Uso decidido pelo dono.
  - **Scripts de investigação** (`scripts/teste-login-santana.js`, `teste-categoria-santana.js`)
    leem `SANTANA_USUARIO`/`SANTANA_SENHA` do `.env`. A coleta de verdade usa o login cifrado da
    fonte; as linhas do `.env` podem sair quando os scripts não forem mais usados.

- **Nuvemshop (Oceantech, 09/10/2026): cada tamanho é um produto.** Leitor em `src/lib/coleta/nuvemshop.js`
  (`variantesDaNuvemshop`), ligado em `normalizarPagina`. A página tem só UM item no JSON-LD, que descreve a primeira
  variante sem nenhuma opção escolhida, e o resto está no JS `LS.variants` (uma linha por variante). No "Fuso com Castanha
  SFU 2005" (24 tamanhos, 250 a 2200 mm) o JSON-LD trazia o **código 1156** (a de 250 mm), o **preço 297** (o RISCADO dela;
  ela é vendida a 267) e o **saldo 178** (a SOMA dos 24 tamanhos); a tela da loja mostrava o preço do tamanho escolhido.
  - **Cada variante vira um produto** (decisão do dono): código = o `sku` da variante, nome = o da página + as opções
    (`... SFU 2005 - 250 mm`), e a opção entra também na ficha (`Medidas: 250 mm`). Variante única mantém o nome da página.
    O MPN e o EAN da página saem quando há várias variantes (são do produto inteiro). Variante sem `sku` entra como `N/A`.
  - **Preço normal = o que a loja cobra** pela variante (`price_number`); o riscado (`compare_at_price_number`, só a de 250 mm
    tem) **não é preço vigente** e fica só na origem, a mesma regra da Tray em promoção. **O preço no pix**
    (`price_with_payment_discount_short`, 5% abaixo) vai como **promocional**, só informação. A tela da loja NÃO mostra o pix
    por variante (só "5% de desconto pagando com Pix"): o número está no JS.
  - **Saldo = o da variante** (`stock`). A página não o mostra ao cliente, mas é o número que a própria loja usa para liberar
    a venda (`available` vem dele), então é tão confiável quanto o estoque dela. `stock: null` = a loja não controla (fica
    sem número, nunca zero); `stock: 0` = esgotada.
  - **Documentos: só os da descrição** (`data-store="product-description-<id>"`). O menu e o rodapé repetem "Catálogo de
    produtos" (link do Drive) em toda página. Vale para toda Nuvemshop. Link que aponta para a própria página (`href="#"`)
    também não é mais documento, em qualquer plataforma.
  - **Fonte chaveada 36V (mesmo dia): três defeitos.** (1) **Acento:** `decodificar` (`texto-html.js`) procurava a
    entidade pelo nome em minúsculas, e `&Iacute;` virava "í" ("CARACTERíSTICAS"). Agora o nome exato vence, e maiúscula
    fora da tabela volta em caixa alta. **Vale para todas as lojas**: quem escreve entidade em maiúscula terá a descrição
    regravada na próxima varredura (é correção). (2) **Foto repetida:** a Nuvemshop põe tamanho e formato no NOME
    (`-480-0.webp`, `-640-0.webp`, `-1024-1024.png` são a mesma foto); `semRepetir` tira isso da identidade só no CDN
    `mitiendanube.com`, fica com a maior e passa `http://` para `https://` (a tela em https bloqueia a foto em http).
    (3) **Categoria:** o dataLayer só tem o primeiro nível ("ELETRÔNICA"); hoje vem o caminho do breadcrumb
    do JSON-LD ("ELETRÔNICA > FONTES DE ENERGIA"), pelo leitor genérico de `categoria.js`.
  - **A home virava produto (mesmo dia).** A home e as categorias da Nuvemshop trazem um Product no JSON-LD por card da
    vitrine (26 na home da Oceantech), e o primeiro virava produto com o link da home, o resumo cortado do card, o logo
    da loja como foto e o "Catálogo de produtos" do menu como documento. Era isso que a prévia do "Buscar dados" mostrava.
    `ehListagemDaNuvemshop`: página do CDN `mitiendanube.com` SEM sinal de produto não rende produto. Sinais de produto,
    qualquer um: `og:type` "nuvemshop:product" ou `<body class="template-product">`. **O `LS.variants` NÃO é sinal:** produto que
    saiu da loja continua no sitemap, e o endereço responde 200 com "A página solicitada não existe" e "Produtos em destaque",
    com o `LS.variants` do primeiro destaque (o redutor 2511 da Policomp virava o spindle de R$ 862,90). A classe do `<body>`
    sozinha não bastou: o tema da Policomp (`lojapolicompcomponentes.com.br`, 10/10/2026) não põe classe nenhuma, e a home
    (19 Product no JSON-LD) voltou a virar produto com o link da home. O `policompcomponentes.com.br` é o site
    INSTITUCIONAL (phpwcms, sem preço nem carrinho): a loja é o outro domínio.
  - **Ficha sem título com item solto** (`fichaSemTitulo`, vale para toda loja): numa lista MARCADA ("- "), item sem
    dois-pontos ("- Rosca Direita") entra sem nome e não quebra mais a sequência, e o nome pode ter até 5 palavras
    ("Máxima Folga Fuso Axial"). Continua exigindo 3 pares "Nome: valor" (lista de propaganda com um par não vira ficha).
  - **Efeito:** a Oceantech sai com mais produtos que páginas (24 de uma página). A varredura continua tratando a página uma vez.
    Os produtos já gravados dela só se corrigem na próxima varredura, e o worker do PC (`worker:pc`) precisa ser reiniciado
    para carregar o código novo.
- **R&AC (rac.tec.br, 10/10/2026): catálogo em UM arquivo JavaScript, sem página de produto nem preço.** O dono pediu para
  varrer e o coletor de páginas devolvia zero. O `index.html` carrega `js/produtos-data.js`
  (`window.PRODUTOS=[{codigo, descricao, imagem, pagina_pdf, imagem_compartilhada, ...}]`, 2.195 itens, 590 KB) e a busca roda
  no navegador. Atacado e varejo por orçamento no WhatsApp: **não há preço, estoque, marca, categoria nem endereço por produto.**
  - **Leitor:** `src/lib/coleta/catalogo-js.js` (`listaDoCatalogoJs` lê o array como JSON, NUNCA executa o arquivo;
    `produtoDoCatalogoJs`; `colherCatalogoJs`, que baixa por `buscarPagina`, então robots.txt e ritmo valem). Ligado por
    dado em `fornecedores.js` (entrada `rac`, `catalogoJs: { caminho }`, reconhecida **só pelo domínio** em
    `catalogoJsDoEndereco`), em `varrerFonte` (`varrerCatalogoJs`, grava de uma vez e vale a trava de queda de 50%) e em
    `testarFonte` (3 itens de amostra, resultado "PARCIAL" por não haver preço, o que é o desenho do site).
  - **O produto sai com** código `RACnnnn` (chave `codigo:`), descrição como nome e a foto em endereço absoluto; `url` nula
    (não há página). Preço, estoque e o resto ficam `null`, nunca inventados. `imagem_compartilhada` (o mesmo arquivo serve a
    vários códigos) vai para a origem da imagem.
  - **Para usar:** cadastrar em Fontes como FORNECEDOR com o endereço `https://www.rac.tec.br/` e usar "Atualizar dados".
    Conferido contra o site real em 10/10/2026 (só leitura): 2.195 produtos. **A gravação no banco pela varredura NÃO foi
    exercitada de ponta a ponta.** Preço, se o dono quiser, só por tabela enviada pelo fornecedor (importação de arquivo).
- **Makerhero é lida pela Store API, não pela página** ("WooCommerce Store API" nas origens), e a API não traz o PIX.
  `colherWooCommerce` abre a página dos PRIMEIROS produtos, lê o "R$ X no PIX" do Simulador de Parcelas
  (`precosDoSimuladorWoo`) e aprende a regra da loja com a lógica da Tray (`aprenderRegraDePagamento` /
  `aplicarRegraDePagamento`, em `pagamento.js`): na Makerhero, 5% truncando, aprendido numa página só (12,90 → 12,25 separa
  os dois modos) e conferido no 2CC58 (14,90 → 14,15 na página). Loja WooCommerce sem o bloco desiste depois de UMA página.
  A categoria da API vem pelo link da categoria mais funda (`caminhoDasCategoriasWoo`: "Impressão 3D > Partes").
- **"Amostra variada" não funcionava em loja WooCommerce** (a Makerhero, 09/10/2026): o toggle manda `evitar` (os
  produtos já mostrados) a `colherProdutos`, que o pré-marcava só no caminho de página e no Magento PWA; o
  `colherWooCommerce` nem o recebia, e o segundo clique repetia os mesmos três. Agora recebe o conjunto já normalizado
  (`enderecoComparavel`, que foi para `texto-html.js` porque `colher.js` importa `woocommerce.js` e seria um ciclo; `colher.js`
  a reexporta) e pula sem contar como achado. Medido na Makerhero real: 1ª chamada 8IN07/2CC58/2CC59, 2ª 9SS80/8IMQ5/8IMK3,
  zero repetidos.
- **Policomp (Nuvemshop, 10/10/2026): as 4 anotações do dono.**
  - **Pix não é promoção:** a prévia do teste de fonte (`PreviaProduto`) só risca o preço normal quando o promocional É
    promoção. Quando a origem dele diz pix, à vista, boleto, pagamento, depósito, transferência ou "desconto de N% da loja",
    o rótulo vira **"À vista (pix/boleto)"** e o normal fica sem risco (a Policomp mostra R$ 632,90 e o 601,26 só no popup
    "Ver meios de pagamento"). O dado gravado não mudou.
  - **Datasheet por `download.php?f=<hash>`** (no site institucional, na raiz e sem extensão) entra como anexo
    (`ENDPOINT_DE_ANEXO`); antes caía na regra contra "página de primeiro nível". E o escopo dos documentos da Nuvemshop
    aceita também o `<div class="user-product-description">` do tema da Policomp (o da Oceantech usa `data-store`).
  - **Ficha "NOME = valor"** (`fichaSemTitulo`): " = " (com espaço em volta) também separa, e vale o PRIMEIRO separador
    da linha ("REDUÇÃO = 6.25:1" -> nome REDUÇÃO, valor 6.25:1; antes nome "REDUÇÃO = 6.25", valor "1"); com "=" o nome
    pode ter até 5 palavras. No redutor NEMA 34: 17 características (eram 5). Repetidos da página ("Redução" e "REDUÇÃO")
    ficam os dois, como o site mostra.
  - **Foto ampliada com setas na prévia:** clicar na foto ou numa miniatura abre a `AmpliacaoDeFoto` de Produtos.
  - **Visto e NÃO corrigido (fora das 4):** descrição que só existe no JSON-LD, ou em `<br><br>`, chega cortada (fica só
    o que vem depois da última linha em branco). Já era assim antes; nas páginas reais testadas a descrição vem do bloco
    HTML em `<p>` e sai inteira.
  - **Itens 5 e 6 (mesmo dia, pedido do dono):** (5) **fotos pequenas** na Nuvemshop (só a 1ª vinha grande; as outras eram
    a miniatura `-240-0`) e, pedido junto, **em todas as fontes**. `versaoGrande` (`normalizar.js`, em `semRepetir`) troca o
    endereço pela versão grande, medida em 10/10/2026 com HTTP 200 e o tamanho real: Nuvemshop `-NNN-N` → `-1024-1024`
    (240 → 1024 px); Usinainfo (PrestaShop) `-small|cart|home|medium|large_default` → `-thickbox_default` (397 → 1192 px);
    Eletrus `_thumb` → `_orig` (300 → 500); Wix (Nightech) sem o recorte `/v1/...` (500 → 2000). Mais duas pela
    deduplicação: o OpenCart (Solda Fria) põe o tamanho no nome (`-600x315w`, `-1000x1000`, só em `/image/cache/`) e fica
    o maior; a miniatura `90_` da Tray (WJ) sai quando a foto grande do mesmo arquivo está na lista (sozinha, fica). As
    outras fontes (Mamute, Saravati, Ryndack, Curto Circuito, Smartkits, Casa da Robótica, Easytronics, RoboCore, Forseti,
    Unitel, Loja Integrada) já vinham entre 800 e 2500 px. (6) **Descrição do cone BT30:** na Nuvemshop o bloco da
    descrição da página (com 20+ caracteres) VENCE o JSON-LD, que ali é um resumo de SEO gerado (e mais longo); `comoTexto`
    passou a quebrar linha também em `<br style="...">`; e na ficha sem título um nome de UMA letra vale se for maiúscula
    ("D: 42 mm"). O cone sai com a descrição real em 6 linhas e as 6 características. Produtos já gravados só mudam na
    próxima varredura.
  - **Itens 7 a 10 (mesmo dia):** (7) **Características por coluna** na prévia e no detalhe do Scraper: a primeira
    metade na esquerda, o resto na direita (`sm:grid-flow-col` com `--linhas` = metade arredondada para cima). (8) **Ficha
    sem título** (`fichaSemTitulo`): nome até 5 palavras e valor até 80 caracteres também sem marcador (eram 3 e 40: o
    redutor NEMA 23 tinha 6 pares e saía com ZERO, partido em 2+2 por "Torque maximo na saída"); valor acima de 40 (60
    com marcador) só com NÚMERO, que é o que separa "Potência: 35W sob..." de "Leveza: Ideal para projetos..."; e UMA
    linha curta solta entre dois pares ("Altura x Largura") entra sem nome em vez de quebrar a ficha. Comparado em
    todas as descrições do banco do PC (~62 mil): nenhuma loja perdeu item, ~760 produtos ganharam (Mamute, Saravati,
    Smartkits, Forseti, Solda Fria...). Ruído que sobrou: sumário de e-book da Casa da Robótica ("Projeto 1: ...") em 4
    produtos. Lista de recursos sem "Nome:" (placa controladora, driver DM542) continua sem ficha. (9) **"Amostra
    variada" esgotava na 3ª busca:** a amostra do sitemap (8 endereços) agora é escolhida DEPOIS de tirar os já
    mostrados, e na Nuvemshop `/produtos/<slug>/` conta como produto (antes só o "-NNN" no fim, e o resto ficava atrás da
    home, do contato e da FAQ). Policomp: 4 buscas seguidas, 3 produtos novos em cada. (10) A tela acumula os produtos
    mostrados em TODA busca (o `evitar` só vai com o toggle ligado): a 1ª busca depois de ligar repetia os anteriores.
- **CATEGORIA = CAMINHO COMPLETO** (decisão do dono em 09/10/2026): `Impressão 3D > Partes`, `ELETRÔNICA > FONTES DE ENERGIA`,
  e não mais um nível só (era o ÚLTIMO degrau no Microdata, RoboCore e Eletrus, e o PRIMEIRO no dataLayer). Regras em
  `src/lib/coleta/categoria.js` (`caminhoDeCategoria`, separador ` > `): tira a raiz do começo (Início, Home, Página inicial,
  Loja, Shop, Produtos, Todos os produtos), o próprio produto do fim e degrau repetido. Ordem das fontes: painel da Eletrus,
  RoboCore, breadcrumb em Microdata, **breadcrumb do JSON-LD** (`caminhoDoJsonLd`, novo, fica com a trilha mais longa: a
  Makerhero publica duas), `category` do JSON-LD e, por último, o dataLayer (só o primeiro nível). **Efeito:** a categoria
  de todas as lojas muda na próxima varredura de cada uma (os produtos são regravados com o caminho).
- **WooCommerce com "Simulador de Parcelas" (Makerhero, 09/10/2026): o JSON-LD traz só o preço do PIX** (12,25), que
  entrava como preço normal. `precosDoSimuladorWoo` (`normalizar.js`) lê o PRIMEIRO `<p class="price">` que tem o
  simulador: o valor cobrado (o `<ins>` quando há riscado) vira o preço normal declarado (12,90) e o valor de
  `wc-simulador-parcelas-detalhes-valor` seguido de "pix", "boleto" ou "à vista" vira candidato a promocional. Os blocos
  seguintes da página são de produtos relacionados (99,90 / 94,90 na mesma página).
- **Eletru's (eletruscomp.com.br): plataforma própria em ASP.NET MVC** (IIS,
  `x-aspnetmvc-version`), mapeada em 16/09/2026 como `aspnet-uploads` em `plataformas.js`.
  - **Formatos:** não tem JSON-LD. O Microdata traz só nome, preço e imagem, com `sku` **vazio**.
  - **Onde estão os dados:** `daVitrineAspNet` (`normalizar.js`) lê o painel e as abas.
    - `Ref:` é a referência do fabricante e vira MPN e modelo. Descartada quando é só o nome
      cortado em 30 letras ("LAMPADA VAPOR SODIO 250 W E-40"): começa como o nome ou tem 3+
      palavras.
    - `Cód: 53.00.1463` é o código.
    - `itemprop="brand"`, quando há.
    - Categoria: o último degrau do `loja__breadcrumb` antes do produto.
    - Preço: `itemprop="price"`, e o à vista escrito "Ou R$ 304,00 à vista ( - 5% )".
    - Estoque: botão `comprar-btn`; `avise-btn` é sem estoque, e aí não há preço (concorrente
      sem preço é descartado).
    - Descrição e ficha nas abas `#abaNNNN`; ficha em "Nome: valor".
  - **A home virava produto:** os cards da vitrine repetem `itemtype=Product`. Com
    `ehListagemAspNet`, página com cards e sem o painel de detalhe não rende produto.
  - **Aba recortada pelo `</div>` que a equilibra** (`conteudoDoDiv`). Cortar em "próxima aba
    ou relacionados" levava a última aba até o rodapé, e o formulário "avise-me", o telefone
    e o CNPJ viravam 30 especificações.
  - **Fotos:** a galeria usa **duas pastas**, `_uploads/ProdutoDestaque/` (a principal) e
    `_uploads/produtoArquivo/` (as demais). O borne PT 2,5 tem 1 + 5, e só a principal vinha.
    Só a versão `orig`, nomeada `__orig` ou `_orig`. O Microdata de imagem trazia "Passe o mouse
    para dar zoom" como endereço.
  - **"Catálogos" do menu virava documento de todo produto** (`/catalogos`, página
    institucional). Em `documentosDaPagina`, link reconhecido **só pelo texto** (sem extensão
    nem endpoint de anexo) que aponta para página de primeiro nível e tem até 2 palavras é
    seção do site, e não documento. Conferido nas outras 6 concorrentes: nenhum documento real
    se perdeu.
  - **Sitemap plano:** 249 categorias (`/produtos/...`) **antes** de 1.825 produtos (`/{slug}/p`).
    `colher.js` ordena o sitemap em produto (`pareceProduto`, que agora reconhece `/{slug}/p`),
    resto e listagem (`pareceListagem`). Sem isso a amostra do teste abria só categoria.

- **Mamute Eletrônica (Magento 2): o preço à vista não está no HTML** (16/09/2026). A página
  mostra "R$ 46,46 — 5% OFF no PIX", mas o servidor só entrega R$ 48,90. O resto é calculado
  no navegador a partir do módulo de parcelamento, num `text/x-magento-init` com
  `"installment": {"discounts": {"name": "PIX, Transferência ou Depósito", "percentage": "5"}}`.
  `aVistaDoMagento` refaz a conta em centavos, arredondando meio para cima
  (48,90 × 0,95 = 46,455 → 46,46). Só vale desconto de pagamento à vista (pix, boleto,
  transferência, depósito).
  - **A base é o preço de CARTÃO** (`product:price:amount` / `finalPrice`), nunca o JSON-LD. Na
    Saravati o JSON-LD já é o preço do pix, e aplicar os 10% de novo dava 12,07 onde a loja
    cobra 13,41. A primeira versão errou assim, e a comparação com os produtos já gravados
    pegou.
- **Mamute: ficha técnica em lista HTML, com tabela de atributos de UMA linha.** A regra era
  "tabela OU lista da descrição". A tabela (`Fabricante: IMP`) calava a lista, e a lista por
  texto também não serviria: a descrição do JSON-LD vem numa linha só, sem quebras.
  `especificacoesDeListaHtml` lê o `<ul>` colado a um título "Especificações Técnicas" /
  "Ficha técnica" (`<li><strong>Nome:</strong> valor`), e `juntarFichas` soma com a tabela sem
  repetir rótulo. Nas outras 6 concorrentes a contagem de especificações não mudou.
- **Mamute: a descrição chegava num bloco só.** O JSON-LD dela vem numa linha ("...
  Especificações Técnicas Modelo: CJMCU-219 Interface de comunicação: I2C ..."), e pela regra
  da mais longa vencia o bloco HTML da página por poucos caracteres. Duas mudanças:
  - `melhorDescricao` compara o tamanho **sem espaços nem marcadores**. Entre as que trazem
    ao menos 85% do texto da mais longa, vence a que tem **mais linhas**. Resumo de SEO continua
    perdendo.
  - `descricaoDoBloco` mantém a estrutura: título ganha linha em branco antes, `<li>` vira
    `- item`, e os itens ficam colados.

  Nas outras 6 concorrentes o conteúdo ficou idêntico (conferido sem espaços e marcadores),
  e só a disposição melhorou: a Casa da Robótica perdeu as linhas em branco entre itens, e a
  Smartkits ganhou hífen nas listas.
- **Mamute: a categoria do dataLayer vem errada da própria loja** (kit de fusíveis em
  "Espaguetes Termo Retráteis"). O breadcrumb é montado por JavaScript, e não há outra fonte
  na página. Não se corrige: é dado deles.

- **Solda Fria (OpenCart), 19/09/2026 (Agente 1):** cinco defeitos na mesma página.
  - **Estoque:** "Estoque Atual: 317" sem a palavra "unidades" depois deixava a quantidade como
    "não informada".
  - **Tabelas de especificação** vêm só do HTML da página: `<script>` e `<style>` saem antes
    (`especificacoesDeTabela`). O JavaScript do cálculo de frete monta tabelas em strings, e isso
    virava "Métodos de envio: Valor" na ficha técnica.
  - **"Características" sozinho anuncia ficha, mas só se TODOS os itens forem pares "Nome: valor"**
    (`TITULO_DE_FICHA_CURTO`): em outras lojas é título de lista de marketing ("Alta durabilidade").
  - **Descrição na aba "Descrição"** (`descricaoDaAba`, exige `data-toggle="tab"`; link `#descricao`
    comum é âncora de rolagem). O JSON-LD, o og:description e o Microdata trazem a descrição
    cortada em ~250 caracteres, e o texto inteiro só está no painel da aba. Quem decide continua
    sendo `melhorDescricao` (a mais longa). A plataforma ASP.NET já lê a própria aba.
  - **Tray em promoção (WJ Componentes):** o `price` do dataLayer é o RISCADO ("de R$ 6,05") e o
    `priceSell` é o que a loja cobra (R$ 5,75). O riscado entrava como preço normal (6,05 → 5,58
    contra 5,75 → 5,58 na tela). Agora `origens.precoNormal` diz quando o riscado foi descartado.
- **O mesmo produto por vários endereços (OpenCart, 19/09/2026, Agente 1).** O painel da Solda Fria
  dizia **10.647 produtos** com **5.350 no banco**, e o dono achou que a coleta tinha perdido dado.
  Não perdeu: o OpenCart lista cada produto por **um endereço por caminho de categoria** (`/x`,
  `/arduino/x`, `/arduino/acessorios/x`), o sitemap traz todos (**38.839 endereços para ~8,6 mil
  produtos**) e o worker abria cada um a 2,3 s.
  - **Por que o banco parecia certo e o painel não:** o contador usava `código|endereço` (variante
    = produto novo), e o banco identifica por **código** (`chaveDoProduto`). A segunda variante
    **reescrevia a linha** já gravada, trocando `url` e `coletadoEm` pela da última visita: 3.286
    linhas foram regravadas mais de 1 h depois de criadas. Por isso o `coletadoEm` **não** diz
    quando a linha nasceu; `criadoEm` diz.
  - **Identidade por endereço** (`identidadeDoEndereco`, `plataformas.js`): `p:<id>` quando termina em
    `-p-<id>.html`, senão o **último segmento** do caminho, com o `?` (`/arduino?page=2` é outra
    página). **Só onde o registro declara** `entrega.identidadePorProduto` — hoje só o OpenCart; em
    loja genérica o último segmento pode repetir de verdade (`/produto/1`, `/servico/1`). Medido no
    sitemap: 38.839 → **8.644** identidades (4,5×), e **nenhuma** das 5.352 linhas gravadas divide
    identidade com outra, então a regra não junta produtos diferentes.
  - **Marca só o que virou produto ou foi retomado** (`identidadesTratadas`). Categoria nunca marca,
    senão a navegação deixaria de seguir os links dela. Vale no catálogo, no sitemap e no `pular` da
    navegação.
  - **Retomada casa por identidade:** o endereço gravado é o da última variante visitada, e o sitemap
    pode trazer outra primeiro.
  - **O contador usa a chave do banco** (`chaveDoProduto`), e "produtos no site" conta identidades,
    não endereços do sitemap. A tela ganhou o passo "Endereços repetidos ignorados".
  - **O `coletadoEm` e o `url` de linhas já gravadas só se acertam na próxima varredura.** Nada foi
    perdido nem precisa de correção no banco.
  - **Não se sabe se algum lote falhou:** o `console.error` do worker (`lote de N produto(s) nao
    gravado`) vai para o terminal dele, não para `dados/logs/`. Nada indicou falha.
- **Curto Circuito (19/09/2026, Agente 2):** a ficha vem sob **"Principais Características:"**,
  título que o vocabulário de seção não conhecia, e voltava vazia. "Características" só vale como
  **segunda opção**: também é título de texto de venda e não pode disputar com "Especificações"
  quando as duas existem (a propaganda trocaria a ficha de verdade). E item que o site quebrou
  no meio de um parêntese ("Consumo: 70 mA (Standby) e Max 215 mA (802.11b, CCK" + "- 1Mbps,...);")
  é **juntado ao anterior**: parêntese aberto e sem fechar prova que a linha é continuação.
- **RoboCore: a quantidade em estoque só existe dentro de JavaScript** (29/09/2026, Agente 2). A
  coluna ESTOQUE mostrava o status (disponivel/esgotado, do Microdata) mas nunca o número: o
  "(92 un. em estoque)" que a página exibe nunca está no texto visível nem em `inventoryLevel`
  (a RoboCore não declara) — só existe em `document.getElementById('estoque_<id base>').innerHTML
  = '(92 un. em estoque)'`, a mesma técnica já tratada para o preço (`precosDaRoboCore`). Corrigido
  com `estoqueDaRoboCore` (`src/lib/coleta/robocore.js`).
  - **Produto com cores (HockeyBot, código `3388-416`) tem VÁRIOS blocos escrevendo no MESMO id**
    (`estoque_3388`), um por opção de `extras.value` (a cor escolhida): sem isolar o bloco da
    variante antes de ler, a primeira cor da página venceria para qualquer código. O código é
    dividido em id base + variante pelo último hífen, e a leitura busca a atribuição só dentro do
    bloco `extras.value == '<variante>'`.
  - **Produtos já coletados continuam com quantidade `null`** até a próxima varredura: a correção
    vale só para coleta nova, e o worker precisa ser reiniciado para carregar o código (ver linha
    abaixo).
- **Depois de juntar mudança de coleta na `main`, reiniciar o worker** (`npm run worker:parar` e
  `npm run worker`): ele carregou o código antigo. Varredura em curso grava com a regra velha até
  lá — a WJ Componentes, por exemplo, com o preço riscado.
- **Makerhero: Cloudflare.** Desafio anti-bot em qualquer combinação de cabeçalho,
  inclusive nenhum. **Não se contorna** — o `buscar.js` diz por escrito que user-agent
  disfarçado de navegador é o oposto de educado. A mensagem na tela nomeia a proteção em
  vez de dizer `HTTP 403` seco, senão parece erro de digitação.
- **Santana Import: lenta e irregular.** 1,5 MB de home variando de 0,4s a 26s no mesmo
  minuto. O teto era fixo em 20s e cortava no meio; virou `COLETA_TIMEOUT_MS`.
- **Wix (Nightech): `ImageObject` com `contentUrl`.** O JSON-LD publica cada foto como
  objeto completo, e ler só `url` trazia 1 de 6. As duas chaves são válidas no schema.org.
- **Código na URL, confirmado pelo nome.** A Santana publica `018-0071` no endereço e no
  título, e em nenhum formato estruturado. Exigir que apareça nos **dois** transforma o
  palpite em conferência — slug tem número de tudo quanto é tipo.
- **EAN na ficha técnica.** Rótulo em português (`Cód. Barras`), ancorado nas pontas para
  deixar `EAN Caixa Mãe` de fora: aquele é o código do fardo, não da peça.
- **Preço é opcional para `FORNECEDOR`.** Atacadista publica catálogo aberto e preço só a
  cliente cadastrado; exigir preço jogaria fora um catálogo inteiro de dados úteis. Para
  `CONCORRENTE` a exigência continua.

**robots.txt e educação:**

- Vários `User-agent:` seguidos formam **um** grupo. Tratando cada linha como grupo novo,
  um arquivo com dezessete agentes era julgado pelo último e as regras eram ignoradas.
- **`?` na regra é caractere, não curinga.** Ficou fora do escape em `caminhoCasa` e
  `Disallow: /*?*` virava `/.*?.*`, que casa com tudo: a Saravati (Magento 2) apareceu
  **inteira** bloqueada, home inclusive, quando só barra endereço com parâmetro. Em
  15/09/2026. Regra é convertida em regex — todo metacaractere que não seja `*` e `$`
  final precisa de escape.
- **`Crawl-delay` é respeitado** (impactocnc pede 10s). Isso faz o teste levar minutos —
  a tela avisa.
- Ritmo próprio: 1 requisição a cada 2s por domínio, via `limitar()` de `httpClient.js`.
  O scraper **não** usa `requisitar()`, que gravaria `LogIntegracao` com um enum `Servico`
  inexistente.

**Sitemap:**

- **Sitemap tem teto de 50 MB** (`MAXIMO_BYTES_SITEMAP` em `buscar.js`, o máximo do
  protocolo), e não os 2 MB de página. A Mamute Eletrônica (Magento) publica dois arquivos de
  **10 MB** cada, com 18 mil produtos. Com o teto de página eles eram recusados (o erro não vai
  ao log), só o terceiro (0,7 MB, 492 endereços) era lido, e a colheita caía na navegação.
  No Magento a navegação **não pagina categoria**, porque `?p=` está em `PARAMETROS_RUINS`:
  só acha produto pela primeira página de cada categoria e pelos relacionados. Em 17/09/2026
  a varredura estava havia **4 h sem produto novo**, com 14.331 páginas abertas. O worker não
  a cancelava porque o site respondia, e a tela mostrava 10,7 s/produto e "falta 18h44".
  Com o teto novo, o sitemap entrega 18.951 endereços.
- **Só entram endereços da loja** (mesmo host, com ou sem `www.`). O robots.txt da Mamute
  declara também o sitemap do blog, e 68 posts iam para a fila de produtos.
- **O "10.000" de "produtos no site" da Mamute não foi provado por varredura.** É o número do
  cadastro, e a primeira varredura completa o substitui.

- O índice pode listar a home como se fosse sitemap, e o de produtos pode não ser o
  primeiro. Priorizar quem tem cara de produto — mas **o padrão não pode conter "item"**:
  a palavra "s**item**ap" casa, todos os filhos furam a fila e a ordem se inverte.
- Sitemap declarado no robots.txt nem sempre lista produtos (a Usinainfo declara um de
  rotas de busca). Quando ele não entrega, a descoberta é por **navegação**, priorizando
  URLs com cara de produto (`.html`, id numérico no fim) — em largura pura o orçamento
  acaba nas categorias.
- **ENDEREÇO NÃO É PRODUTO, e confundir os dois já enganou o dono.** O passo contava as
  linhas do sitemap e as chamava de "produto": a Usinainfo aparecia com *"12 produto(s) no
  sitemap"*, e o número ia para **"Catálogo da loja"** e ficava **gravado na fonte** — como
  se a loja inteira tivesse doze itens. `usbuscaroute-sitemap.xml` é o único sitemap dela
  (todos os outros caminhos dão 404) e traz 12 rotas de `/busca/...`.
- **A coleta nunca esteve limitada** — o defeito era só de relatório. Medido: com limite
  20, a Usinainfo entrega **20 produtos em 78 s**, abrindo 35 páginas, com 20 códigos
  distintos. A navegação compensa o sitemap inútil por inteiro.
- **Filtrar por "cara de produto" não resolveria.** Das 12 rotas, onze não têm cara de
  produto e a décima segunda tem **por acidente**: `baterias-18650` casa com o padrão de id
  numérico, e 18650 é o modelo da bateria.
- Hoje o passo diz **"N endereço(s) no sitemap"**, que é o que foi contado, e o total só
  vira "produtos da loja" depois de **provado** que aquele sitemap lista produto — ou seja,
  quando pelo menos um endereço dele virou produto de verdade. Sem prova, `null` e
  travessão na tela. E a frase distingue a origem: catálogo público da plataforma
  (`produtosNoSiteFonte: "catalogo"`, o caso dos 2.296 da Casa da Robótica, que vêm do
  `/web_api/products` e **não** do sitemap) ou sitemap.

---

## Armadilhas da stack

- **`prisma migrate dev` é interativo** e falha aqui. Use
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
  gravando em `prisma/migrations/<timestamp>_nome/migration.sql`, depois `migrate deploy`.
- **Ele nem sempre regenera o client.** Depois de migrar: `npx prisma generate` **e
  reiniciar o servidor** — o dev server mantém o client antigo em memória e a tela mostra
  "banco indisponível" com o Postgres saudável. **Esta armadilha já estava escrita aqui e
  ainda assim foi repetida** ao adicionar a coluna `instrucoes`: migration aplicada,
  `generate` rodado, servidor não reiniciado — e o campo não salvava. O sintoma não é erro
  de banco: o client em memória **não conhece a coluna**, então ela some do `update` em
  silêncio e a tela volta como se tivesse salvado. Ler a regra não basta; reiniciar faz
  parte do passo de migrar.
- **Renomear relação no schema deixa telas para trás, e o aviso genérico esconde isso por
  semanas.** `Produto.imagens` virou `arquivos` em 27/08/2026; as duas telas de Anúncios
  continuaram pedindo `imagens`, e a consulta falhava inteira. Como `AvisoBanco` dizia
  "não foi possível conversar com o banco de dados" para **qualquer** exceção — e mandava
  subir o Docker —, o dono passou a olhar o Postgres, que estava perfeito. Descoberto só em
  16/09, quando alguém abriu o bloco. O aviso agora separa os dois casos: conexão
  (`P1001`, `PrismaClientInitializationError`) fala do serviço `postgresql-x64-17`; o resto
  diz que o defeito é da consulta e mostra a mensagem do Prisma, que nomeia o campo.
- **Tela mostrando zero pode estar lendo a fonte errada, não contando errado.** A coluna
  "Coletados" exibia 0 com 1.911 produtos em disco: ela lia `_count.paginas` do Postgres,
  que está **vazio de propósito** enquanto a coleta grava em JSON. Trocar o rótulo teria
  escondido o defeito. Enquanto duas origens convivem, número na tela pede a pergunta
  "de onde este veio?" antes de "a conta está certa?".
- **Renomear tabela**: escreva a migration à mão com `ALTER TABLE ... RENAME`. O
  `migrate diff` gera `DROP` + `CREATE` e apaga os dados.
- **Erro de sintaxe envenena o cache do Turbopack, e o veneno sobrevive ao restart.** Um
  arquivo salvo por instantes com erro de parse — no caso, uma aspa a mais deixada por um
  `sed` em `mercados/page.jsx` — derrubou o manifesto de rotas da **subárvore inteira**:
  depois de corrigido o arquivo, `/mercados/fontes` continuou devolvendo **404** enquanto
  `/mercados` e `/integracoes` respondiam 200. O arquivo da rota estava intacto, com
  `export default` no lugar, e **três reinícios do servidor não resolveram**. O que resolve
  é apagar o cache:

  ```bash
  rm -rf .next && npm run dev
  ```

  O sintoma engana: parece rota apagada ou site fora do ar, e não é nenhum dos dois — o
  layout renderiza normalmente em volta do 404. Antes de procurar no código, confira se a
  rota some só numa subárvore e se o arquivo dela foi mesmo alterado (`git status`).
- **Patch com `sed` em JSX cobra caro por isso.** Aspas dentro de atributo e de string
  fazem o comando escapar do que se pretendia, e o estrago não aparece no arquivo editado —
  aparece numa rota vizinha, minutos depois. Em JSX, prefira edição por trecho exato.
- **Abas precisam ficar montadas e apenas ocultas.** Campo desmontado não entra no
  `FormData` — salvar por uma aba invalidava os campos das outras.
- **Arquivo `"use server"` só exporta função assíncrona.** Uma constante exportada faz o
  Next recusar o módulo inteiro.
- **Limite de corpo de Server Action** é 1 MB por padrão; está em 24 MB no
  `next.config.mjs` por causa dos PDFs. Acima disso vem 413 **antes** do nosso código.
- **`next/image` lança exceção** quando o host não está em `images.remotePatterns` — uma URL
  externa inválida derruba a página. Use `<img>` para URL externa (ver `ehLocal`).
- **Tailwind v4**: `divide-x` usa `border-inline-end`, e o utilitário de translação escreve
  a propriedade `translate`, não `transform`.
- **`pdf-parse` precisa ficar FORA do bundle.** Ele usa o pdfjs, que carrega um worker em
  arquivo separado; empacotado pelo Turbopack o caminho se perde e a leitura morre com
  `Cannot find module .../pdf.worker.mjs` — funcionando fora do Next o tempo todo. Está em
  `serverExternalPackages` no `next.config.mjs`.
- **`exceljs` foi escolhido no lugar de `xlsx`**: o `xlsx` no npm está parado na 0.18.5 com
  vulnerabilidades sem correção, porque a SheetJS saiu do npm. O `exceljs` traz um aviso
  **moderado** transitivo (`uuid` < 11.1.1, GHSA-w5hq-g745-h8pq), cujo caminho vulnerável
  exige passar buffer próprio a `v3/v5/v6` — coisa que ler planilha não faz.
- **`String.replace` interpreta `$` na string de substituição.** `` $` `` insere tudo que
  vem ANTES do casamento: um patch com isso injetou 3120 caracteres no meio de
  `normalizar.js`. Em substituição gerada por script, use função `() => novo`.
- **Barra invertida some entre shell e JS.** Um `node -e` com `\d` gerou `d` no arquivo:
  código válido que não fazia nada, e o lint passou. Patch com regex vai por arquivo.
- **Não canalize teste com `| head`.** O SIGPIPE mata o processo antes da limpeza, deixa
  linhas no banco e envenena a execução seguinte. Redirecione para arquivo e leia depois.
- **React 19 barra `setState` dentro de efeito.** Para ler `localStorage`, use
  `useSyncExternalStore` (ver `src/lib/preferenciaMenu.js`); para reagir ao resultado de uma
  ação, trate dentro do próprio `useActionState`.

---

## Produtos: "Buscar por código" no cadastro novo

Pedido do dono em 16/09/2026. **Desde 19/09/2026 o botão se chama "Clonar a partir de um código"**
(o arquivo e a ação continuam `BuscarPorCodigo`/`buscarPorCodigo`): é isso que ele faz, e o nome
diz o que esperar. A explicação mora só na bolha "i", sem parágrafo fixo. O botão fica ao lado de Salvar/Cancelar, **só em produto novo**
(num produto existente, sobrescrever o cadastro com um clique é arriscado demais). Procura por
**igualdade** de código, EAN ou MPN em `Produto` (Rise) e `ProdutoColetado` (fornecedores e
concorrentes), em `src/lib/buscaPorCodigo.js`.

- **Um resultado preenche direto; mais de um vira lista** com a origem. O mesmo código em
  fornecedor e concorrente traz nome e descrição diferentes, e quem escolhe é o operador.
  Em 16/09 nenhum código se repetia entre fontes, então **a lista nunca foi vista com dado
  real**.
- **Os campos são não controlados** (`defaultValue`). Preencher é remontar o corpo do
  formulário com `key={versao}`. **Clonar RECOMEÇA DO ZERO** (pedido do dono em 19/09/2026):
  parte dos `valoresIniciais`, o `FormData` lido na montagem (Unidade "UN", Situação ativa, o
  resto vazio), e sobrepõe só o que o produto achado trouxe **com valor**. Partir do que estava
  na tela fazia a segunda busca herdar da primeira tudo o que a nova não traz (Marca, NCM, peso
  e estoque de um produto misturados com o outro). Junto saem os ícones já usados (voltam a
  azul) e as opções de título pedidas para o Nome antigo. **A lupa sai junto** (pedido do dono em
  19/09/2026, depois de ver o contador da lupa ainda apontando para o primeiro clone): as
  referências marcadas, os valores lidos delas (`valoresRefs`, que acendem os ícones de marca,
  peso, NCM), a busca da janela (`reiniciar()` em `ReferenciasDeMercado`), as linhas de
  fornecedores e concorrentes que entraram sozinhas a partir da marcação, e os documentos
  enviados (apagados do lote temporário). O que foi digitado antes da busca **também some** — é
  o preço de clonar sem confirmação. A **IA** (título, descrição, medidas) segue **somando** ao
  que está na tela (`aplicar` sem `recomecar`).
- **Preço de CONCORRENTE vai para "Preço venda"; o de fornecedor não** (19/09/2026). O
  concorrente entra como ponto de partida, sempre o preço normal (ver "Preço: sempre o NORMAL"
  em Convenções), e continua editável. O de fornecedor é custo, e vender por ele é vender sem
  margem: aparece na lista só para comparar. De produto da Rise copia quase tudo, **menos a
  localização e o link da Loja Integrada**, que pertencem àquela peça.
- **O código do produto achado vai SEMPRE para o SKU**, inclusive por cima do que já estava no
  campo (pedido do dono em 16/09/2026; antes só entrava com o campo vazio e o código livre).
  Outro código, só pela varinha (25xxxx). Código repetido ou que não serve de nome de pasta
  é recusado no Salvar, com o motivo.
- **Marca e Modelo são sempre MAIÚSCULAS** (pedido do dono em 16/09/2026): a tela converte ao
  digitar (sem mover o cursor), ao escolher da lista e ao vir da busca por código; o
  `ProdutoSchema` converte de novo ao salvar, e a importação do Bling também. Os 5 produtos
  já importados foram convertidos no banco ("Genérica" virou "GENÉRICA").
- Marca igual ao nome da loja é descartada: a Casa da Robótica publica a si mesma em `brand`.
- **As imagens vêm junto**, pedido do dono em 16/09/2026. O produto novo ainda não tem pasta,
  então a tela mostra a **prévia** no lugar da imagem e a cópia acontece no **Salvar**
  (`anexarImagens` em `src/lib/imagensImportadas.js`, que a importação do Bling também usa).
  - **O formulário manda só a referência** (`importarImagensDe` = `rise:<id>` ou
    `coletado:<id>`), e os endereços são lidos de novo no servidor. Aceitar endereço vindo do
    navegador faria o servidor baixar o que alguém mandasse.
  - **Passa pelo `salvarArquivo`**, com as regras do envio manual (JPEG/PNG, 500 a 1920 px).
    O tipo é lido **pelos bytes**, porque CDN de loja devolve `octet-stream`. Foto recusada não
    desfaz o cadastro: a tela do produto criado mostra quantas vieram e quantas ficaram de fora
    (`?imagens=&recusadas=` na URL). Medido com o 06811 da Usinainfo: 4 copiadas e 1 recusada,
    a `large_default` de 397 px.

## Produtos: referências de mercado e texto por IA

Pedido do dono em 16/09/2026, como etapa de criação de anúncio. A **lupa ao lado do Nome** abre
uma **janela (pop-up)**, e não um painel no meio do formulário: o dono pediu a troca no mesmo
dia. A janela lista fornecedores e concorrentes **parecidos** com o Nome
(`src/lib/buscaPorPalavras.js`, lendo a mesma `produtosParaLista` da tela Mercados). O
operador marca referências e pede **título** ou **descrição** à IA (`src/lib/ia/anuncio.js`).

- **A busca é por relevância, não por "todas as palavras".** A primeira versão usava a
  `combina` do Mercados, e o título inteiro `PLACA COMPATIVEL ARDUINO UNO R3 CH340 COM CABO USB`
  **não achava nada**, com 37 produtos tendo "arduino uno": ninguém repete as nove palavras. A
  nota vai de 0 a 1 e é a fração do peso do título que aparece no produto. Entra quem tem pelo
  menos metade (com até 2 palavras, todas). A lista é ordenada pela nota, e a janela mostra a
  coluna "Parecido".
  - **Peso pela raridade** (log N/df), com bônus de 1,5× para palavra com dígito. Com peso
    igual, "SENSOR DE DISTÂNCIA ULTRASSÔNICO HC-SR04 5V" punha sensores ToF (sensor +
    distância + 5V) no nível do HC-SR04.
  - **Compara por palavra, não por trecho** (`casaPalavra` em `texto.js`). Por trecho, o "4" de
    "4 canais" casava com "RS485". Até 3 caracteres, a palavra precisa ser igual; mais longa
    pode ser o começo ("ch340" em "ch340g").
  - **Cada nome é indexado em várias formas** (`indiceDePalavras`): a palavra sem símbolo, os
    pedaços dela e os pares de pedaços vizinhos. É o que junta "HCSR04" com "HC-SR04" e "5V"
    com "5 V".
  - A **tela Mercados continua com `combina`** (todas as palavras): lá o operador filtra, e
    filtro não pode trazer linha que não tem o que se digitou.
- **A marcação NÃO é gravada**, por decisão do dono: serve só para gerar o texto. O Mercados
  continua sem vínculo com `Produto`.
- **A janela só busca e marca; os botões de IA ficam no formulário**, pedido do dono no mesmo
  dia. O título era **só o símbolo (✦) ao lado da lupa** (**substituído em 04/10/2026 pela lista "Escolher o
  título"**, que traz os títulos dos produtos marcados e a opção de IA; ver mais abaixo), e só aparece com
  referências marcadas.
  **"Criar descrição"** fica no topo da **aba Descrição** e abre uma janela própria
  (`JanelaDescricao.jsx`): à esquerda, os produtos marcados **em abas lado a lado** (a cor do
  ponto diz fornecedor ou concorrente; ficha, descrição da loja e link); à direita, a criação
  com IA. Começou como seções empilhadas, e o dono redesenhou em abas. O texto gerado aparece **editável**, e só vai para
  o campo em "Usar esta descrição".
- **A descrição segue o padrão da loja**, que o dono definiu em 16/09/2026, em **texto puro**
  (é exportada para várias plataformas): TÍTULO EM MAIÚSCULAS · **2 parágrafos sucintos, SEM
  linha em branco entre eles** (o que é e o que diferencia; como usar e para quem; eram 2 ou 3
  separados até a revisão do dono no mesmo dia), **cada um com no máximo 4 linhas**
  — **padrão "técnico-comparativo" dos parágrafos, revisado com o dono em 22/09/2026**: o
  primeiro começa pelo NOME do produto como sujeito ("A Placa...", "O Sensor..."), diz o que é e
  a especificação central que decide a compra (chip/CI, processador, clock), terminando na tensão
  de operação quando as referências trouxerem; o segundo é compatibilidade prática — o que o
  produto aceita ou exige junto (shields, bibliotecas, módulo complementar) e o que acompanha.
  Frases completas com verbo ligando os fatos ("possui", "é compatível com"), nunca lista
  telegráfica separada só por vírgula; tom acessível, sem perder precisão técnica, sem adjetivo de
  efeito.
  (`LIMITE_PARAGRAFO` = 230 caracteres, medido nos ~57 por linha da caixa da janela). Parágrafo
  mais longo volta uma vez para a IA encurtar, com o texto recusado. Se ainda passar, ficam
  as frases inteiras que cabem (`frasesQueCabem`), nunca corte no meio da frase ·
  `Especificações técnicas:` (era "Características") com `- Nome: valor;` ·
  `Itens inclusos: (Cod:SKU)` com `- 01 ITEM;` · `Garantia:` com
  `- Garantia Legal de 90 dias (contra defeitos de fabricação);`.
  **As duas últimas linhas de "Especificações técnicas" são sempre `- Dimensões(CxLxA):
  68x53x10mm;` (sem espaço antes do parêntese nem em volta do "x") e `- Peso: 55g;`** (pedido do dono em 16/09/2026), escritas pelo código
  (`linhaDeDimensoes`/`linhaDePeso` em `medidas.js`) para serem **lidas de volta**
  (`medidasDaDescricao`). A IA devolve `pesoGramas` e `dimensoesMm` como números, e
  especificação de medida que ela puser na lista é descartada, para não aparecer duas vezes.
  **Medida já preenchida no formulário vence a da IA**: o texto não pode dizer uma coisa e o
  campo outra. Ao usar a descrição, e ao sair do campo Descrição (texto colado ou editado), as
  medidas lidas vão **só para os campos vazios**, e o aviso diz quais. Medida faltando some da
  letra do rótulo: `(CxA): 30,5 x 17mm`.
  **O campo Descrição é um só, em texto puro e alto (40rem)**: as abas "Escrever" e
  "Pré-visualizar" e o conversor de Markdown (`Markdown.jsx`) saíram, porque a prévia passou a
  mostrar o mesmo texto do campo.
  **Sem seção de documentos técnicos**: chegou a existir no mesmo dia, e o dono tirou. Texto puro
  não tem link clicável, e os arquivos só terão endereço público na VPS. A lista com link será
  feita na Loja Integrada, que aceita HTML, numa etapa própria.
  **A ordem e a pontuação são do código** (`montarDescricao`), não da IA: a IA devolve JSON
  (`paragrafos`, `caracteristicas`, `itensInclusos`), e o texto é montado aqui. O
  `textoPuro` tira `**`, `#`, crase e emoji que escapem da instrução, e só os 2 primeiros
  parágrafos entram. Pedir o texto
  pronto dava variação a cada chamada. O título e o código saem do Nome e do Código do
  formulário **na hora de gerar**, e a garantia é texto fixo (`GARANTIA_PADRAO`). O
  `;`/`.` que vier no fim de um valor é removido antes de pôr o `;`, para não sair dobrado.
  Medido em 16/09 com 3 referências de placa Uno: 14 s, 21 características.
- **O título vem em 3 opções para escolher** (`gerarTitulos`, `OPCOES_DE_TITULO`). Com um
  título só, o dono tinha que clicar de novo até sair um bom, e cada volta é uma chamada paga.
  Nada vai para o Nome até ele clicar numa opção. Opção acima de 60 caracteres ou repetida é
  descartada, e uma segunda chamada pede só as que faltaram, mostrando as recusadas.
  O pedido manda variar **o que ganha espaço** (CI, especificação, o que acompanha), não só a
  ordem: foi o que deu três opções realmente diferentes no teste do relé. Por isso a marcação
  (`marcados`) mora no `FormularioProduto`, e não na janela: os botões precisam dela com a janela
  fechada. As palavras enviadas à IA são as do Nome no momento do clique.
- **O título agora é escolhido numa LISTA, e o botão "✦" saiu do sistema** (pedido do dono em 04/10/2026).
  Ao lado da lupa, depois que há produtos marcados, o botão **"Escolher o título"** (`ListaDeTitulos`, em
  `FormularioProduto.jsx`) abre uma lista só com:
  - os **títulos dos produtos de fornecedores e concorrentes marcados na lupa**, cada um com a loja e o tipo e a
    contagem dos 60 do Mercado Livre (passar de 60 não impede escolher: o Nome mostra o aviso). Entram em
    **MAIÚSCULAS**, como o padrão da loja (o que o Bling já usa), e **sem repetir**: o mesmo nome em duas lojas
    vira uma linha com as duas origens;
  - e, **na mesma lista**, a opção **"Gerar título com IA"**, que chama a **mesma ação de antes**
    (`criarTitulosIA` → `gerarTitulos`, o mesmo `PADRAO_TITULO`, 3 opções de até 60 caracteres) e põe as 3 na
    própria lista, com o selo "IA" e o link "Gerar outras opções".
  Nada vai para o Nome até o dono clicar numa linha. O que não mudou: a IA só roda no clique, e o aviso de erro
  continua embaixo do Nome.
- **A marcação fica fora dos trechos com `key={versao}`.** Preencher o Nome remonta os campos,
  e ela sumiria junto. Por isso o formulário tem dois `Fragment` (`geral-` e `abas-`).
  O `BotaoIA` pode ser remontado no meio da geração porque o estado da chamada também é do
  formulário.
- **A função que lê o formulário vai em prop separada (`aoCriarIA`)**, não dentro do objeto
  `ia`. Um objeto que junta dados e uma função que lê `ref` faz o lint do React Compiler acusar
  "Cannot access ref value during render" no primeiro uso de `ia.quantos`.
- **Foto principal por rota própria**: `/api/mercados/miniatura/[id]`, com `<img loading="lazy">`.
  A miniatura da Nightech é base64 no banco (média de 50 KB, a maior com 1 MB), e 200 linhas
  com a foto embutida pesariam megabytes na resposta da busca. Foto de loja (http) vira
  redirecionamento; base64 vira bytes, **só JPEG/PNG/WebP/GIF**. SVG é XML com script e seria
  servido do nosso domínio.
- **Foto: mouse em cima amplia, clique mostra grande.** A prévia (260 px) usa posição
  `fixed` calculada da miniatura, porque a lista rola num contêiner com overflow que cortaria
  um `absolute`. O clique na foto **não marca a linha**. O Esc da foto grande é ouvido na
  captura da `window` e para ali; sem isso, o mesmo Esc fecharia também a janela de
  referências, que escuta no `document`.
- **Link aberto muda para "Aberto", em roxo**, por estado da tela (`abertos`), e não pelo
  `:visited` do navegador: o histórico guarda visitas de meses atrás e não diz o que foi
  conferido agora. O clique do meio é contado por `onAuxClick`.
- **Medido na primeira chamada real** (16/09, 3 referências de placa Uno):
  `PLACA UNO R3 CH340 COMPATÍVEL ARDUINO COM CABO USB`, com 50 caracteres, em 3,8 s e ~6,8 mil
  tokens de entrada. A descrição levou 17 s, com ~6,2 mil tokens de entrada e 1,2 mil de saída.
- **Padrão de título em `src/lib/ia/padraoTitulo.js`**: TIPO + FUNÇÃO + MODELO/CI +
  ESPECIFICAÇÃO + COMPATIBILIDADE, **em MAIÚSCULAS**. A ordem foi medida nos concorrentes
  (todos abrem pelo tipo da peça, com mediana de 41 a 57 caracteres). A caixa alta é decisão do
  dono e é o que o Bling já usa. O código força maiúsculas e **recusa acima de 60**, pedindo
  uma nova tentativa, em vez de cortar no meio da palavra.
- **O cliente manda só ids.** O conteúdo das referências é lido do banco no servidor, e o
  **nome da loja não entra no prompt**: o que não entra não vaza para o texto da Rise.
- **Modelo `claude-opus-5`** com `fallbacks: "default"` (beta
  `server-side-fallback-2026-07-01`), no máximo 20 referências.
- **`baseURL` fixo em `https://api.anthropic.com`.** O SDK lê `ANTHROPIC_BASE_URL` do ambiente,
  e nesta máquina essa variável existe (vem de outras ferramentas). Sem fixar, a chave da
  loja iria para outro servidor.
- **Precisa de `ANTHROPIC_API_KEY` no `.env`**, que o dono cria no console da Anthropic. Sem
  ela, os botões dizem isso na tela.
- **Auditoria:** `Servico` ganhou `ANTHROPIC` (migration `20260916_servico_anthropic`). Grava
  modelo, `stop_reason`, uso de tokens e erro, nunca o texto.

**Ícones dentro dos campos Código e Preço** — pedido do dono em 16/09/2026:

- **Código automático na faixa 25xxxx** (`gerarSku`): o **maior já usado mais um**, a partir de
  250001. Não reaproveita o buraco deixado por um produto excluído: anúncio antigo ou planilha
  apontariam para outra peça. Dois cadastros abertos ao mesmo tempo podem receber o mesmo número,
  e o SKU único recusa o segundo Salvar.
- **Preço das referências marcadas na lupa**: a lista separa **"Fornecedor · custo"** de
  concorrente (o preço do fornecedor é custo, e vender por ele é vender sem margem). Clicar
  preenche o campo, que continua editável.
- Os dois escrevem **direto no `<input>`** (campo não controlado) e marcam o formulário como
  alterado, sem remontar os campos.
- **Marca, Modelo e Número de homologação** usam o mesmo desenho (`CampoDeReferencias`). Cada
  valor aparece uma vez, com as lojas que o publicam.
- **Peso, Altura, Largura, Comprimento e NCM também vêm das referências** (16/09/2026). O NCM é
  a coluna própria, publicada por Fortek, Casa da Robótica e Smartkits; Eletrogate, Saravati e
  Usinainfo não publicam. Peso e medidas são lidos da ficha (`src/lib/medidas.js`, sem imports,
  testado no `teste:extracao`) e convertidos para kg e cm. Cada loja escreve de um jeito:
  `12,3g`; `Altura: 32mm`; `Dimensões (CxLxA): 54 x 30,5 x 17mm`, com a ordem no rótulo;
  `35mm (Altura) x 50mm (Largura)`, com a ordem no valor; e `31 x 15 x 18mm`, sem ordem, que
  vira C x L x A e fica marcado "ordem presumida". **Comprimento do cabo, largura do canal e
  dimensões da embalagem ficam de fora**: não são o corpo da peça. Peso com embalagem entra,
  com o rótulo à vista. Cada opção mostra o texto de onde saiu.
- **Medida é lida da ficha E do texto da descrição** (`medidasDoProdutoColetado`, que usa
  `linhasDeEspecificacao`). Tem loja que só escreve a medida no texto: a Usinainfo deixa
  `- Dimensões (CxLxE): ~54x29x5mm;` e `- Peso: 11g.` na descrição e a ficha sem medida
  nenhuma. Em 16/09/2026 a IA recebia esse texto solto e devolvia `null`, e a descrição saía
  sem Dimensões e Peso. **Correção:** `gerarDescricao` manda a lista "Peso e medidas já
  encontrados nas referências" já lida. Se a IA ainda assim devolver `null`, o código usa a
  medida da referência cujo nome mais se parece com o título (`reservaDasReferencias`), para
  não pegar a de outro produto marcado por engano. A ordem é: formulário > IA > reserva.
- **Ficha lida da lista na descrição parava num item em caixa alta** (`especificacoesDeLista`
  em `coleta/normalizar.js`). Linha curta toda maiúscula conta como título de seção, e
  `- RAM: 256KB;` também é toda maiúscula. A leitura parava ali, e tudo o que vinha depois
  (Dimensões e Peso, no EMW3080V2 da Usinainfo) sumia da aba Características. Agora caixa
  alta só vale como título **sem valor depois dos dois-pontos**. Em 16/09/2026 eram cerca de
  140 produtos cortados (99 da Usinainfo, 30 da Casa da Robótica, o resto espalhado). **Os
  dados gravados só se corrigem na próxima varredura.** O cadastro já não depende disso,
  porque lê a medida também do texto da descrição.
- **Campos de número recusam `e`, `E`, `+` e `-`** (`propsDeNumero`). O `<input type="number">`
  aceita essas teclas por causa da notação científica, e o dono achou `-e` na Garantia. Campo
  inteiro (`step="1"`) recusa também ponto e vírgula. Ao testar com ferramenta de navegador,
  saiba que o ponto e a vírgula chegam como tecla vazia (`key: ""`): o `005` no lugar de `0.05`
  vem da ferramenta, não do bloqueio.
- **Cor dos ícones = uso, e não disponibilidade** (pedido do dono em 16/09/2026, revisto no
  mesmo dia): **azul enquanto não usado, verde depois** (`usos` no `FormularioProduto`, com
  `COR_DE_USO` e `BORDA_DE_USO`). Lupa (verde quando há referências marcadas), lista de título (era o ✦),
  varinha do código e $ preço sempre aparecem. **Ícone de lista (marca, modelo, homologação,
  peso, medidas, NCM) some quando as referências não trazem aquele dado.** Antes foi cinza e
  sem dado, e chegou a ser vermelho quando não usado; o dono pediu azul. "Usado" é escolher um
  valor pelo ícone, e digitar à mão não conta. **Sem aviso azul de "campos preenchidos"**: o
  dono tirou, e a cor verde cumpre o papel.
- **Contador no canto do ícone** (`Contador`), pedido do dono em 16/09/2026. No $ preço e nos
  ícones de lista, mostra quantos valores **distintos** há para escolher, e por isso pode ser
  menor que o número de marcados (a marca da loja é descartada, e valores iguais se juntam). Na
  lupa, mostra quantos produtos estão marcados. A cor acompanha o ícone: azul enquanto não
  usado, verde depois.
- **Lista de um ícone abre sempre dentro da tela** (`ListaFlutuante`). Aberta sempre para baixo
  e alinhada à direita, a do Peso (campo no pé da página e na primeira coluna) saía pela borda
  de baixo e ficava atrás do menu lateral. Agora a posição é decidida em `useLayoutEffect`,
  antes da pintura: abre **acima** quando não cabe embaixo e há espaço em cima, e alinha **à
  esquerda** quando invadiria o `<main>`. O estilo é escrito direto no elemento, sem estado,
  para não haver segunda renderização nem salto.
- **O primeiro bloco do cadastro termina onde terminam os campos**: a coluna da imagem fica em
  `absolute inset-0` dentro de um `relative`, então não dita a altura da linha do grid. A foto
  grande encolhe (`flex-1 min-h-0`), as miniaturas ficam numa linha com rolagem lateral (44 px),
  e a legenda "N imagem(ns) de X · Não importar" cabe em uma linha. Em tela estreita a coluna
  tem altura fixa (`h-80`).
- Para a cor e a presença dos ícones estarem certas **antes** do clique, os valores são lidos
  (`lerCamposDasReferencias`) quando a **janela da lupa fecha** (`aoFechar`), e não ao abrir a
  lista. A marcação só muda dentro da janela, então fechar é o momento certo. O Esc chega ao
  `fechar` por `useEffectEvent`, sem recriar o ouvinte do teclado.
  - **Marca igual ao nome da loja é descartada**: o Eletrogate põe "Eletrogate" nos 2.000
    produtos, e a Casa da Robótica e a Impacto CNC fazem o mesmo.
  - **Homologação quase nunca existe**: medido em 16/09, de 8.588 produtos só um publica o
    número (Saravati, `4556-15-1209`). Os outros escrevem "certificado pela Anatel". Só entra o
    que tem o **formato** do número (`0000-00-0000`), vindo de especificação com rótulo
    Anatel/homologação/INMETRO, ou colado à palavra na descrição. Número solto com hífen pode ser
    telefone.
- **Indicações sempre à mostra: lupa + vínculos salvos** (pedido do dono em 06/10/2026). Antes, as indicações só
  vinham da lupa, e um produto salvo abria sem nenhuma. Agora marca, modelo, homologação, **GTIN/EAN** (novo),
  peso, medidas, NCM, preço e a **lista de títulos** vêm da soma das marcadas na lupa com os **fornecedores e
  concorrentes salvos** na aba Fornecedores / Concorrentes. O "Gerar título com IA" usa a mesma soma.
  - **Os vínculos NÃO entram em `marcados`**: a lupa continua começando vazia (decisão de 22/09/2026, porque
    pré-marcar importava fotos sozinho). Os vínculos ficam em `vinculosItens`, lidos por `buscarPorPalavras` com
    `limite: 0` (só os vínculos, sem achados por semelhança). É só leitura: nada é gravado, nenhuma foto é trazida.
  - Relê quando a lista de fornecedores/concorrentes da tela muda, com 600 ms de espera (o nome de um fornecedor
    novo muda a cada tecla, e a busca lê o acervo inteiro, uns 4 s). A lupa entra pelo que estava marcado quando
    a janela **fechou** (`idsDaLupa`), como antes.
  - `buscarReferencias` com o **Nome vazio** passou a achar os vínculos (antes devolvia nada). Fornecedor sem
    código nem link, sem Nome, não escolhe produto no chute.
  - **EAN só entra com formato de código de barras** (8, 12, 13 ou 14 dígitos, `eanValido`): há loja que põe o
    código interno no campo de EAN.
  - **Links de consulta rápida abaixo do GTIN / EAN** (pedido do dono em 06/10/2026): "Consultar em: Cosmos ·
    EAN-Search · Product-Search" abre o site numa aba nova com o código digitado na hora (só os dígitos); com o
    campo vazio, usa o Nome. O `pt.product-search.net/?q=` é o endereço que o próprio dono usou. O **NCM** tem o
    mesmo "Consultar em: Cosmos" (a busca do Cosmos aceita o NCM de 8 dígitos). Os dois usam o componente
    `LinksDeConsulta`, com as listas `SITES_DO_EAN` e `SITES_DO_NCM`. O endereço é montado no clique, porque o campo não é controlado. `ean-search.org/?q=` está nos exemplos
    da própria documentação; o `cosmos.bluesoft.com.br/pesquisar?q=` **não foi conferido** (o site tem
    verificação da Cloudflare). **Consulta pela API foi descartada** (06/10/2026): o Cosmos é pago (a partir de
    R$ 499,99/mês para 100 consultas por dia; o plano grátis citado em resumos de busca não aparece na página
    de preços), e o EAN-Search também cobra. Ficam só os links.
  - Medido em 06/10/2026 no 100103, servidor de desenvolvimento: as indicações aparecem uns 17 s depois de abrir
    a página. As ações do servidor rodam uma de cada vez, e a preparação das fotos vem antes. Testes em
    `teste-cadastros` ("Indicações dos vínculos salvos").

**O React 19 limpa o formulário depois da action**, e o que volta é o `defaultValue`, não o
que foi digitado. Num Salvar recusado (SKU repetido), o SKU voltava **vazio** junto com a
mensagem de erro. Agora a action guarda o que foi enviado como valor inicial
(`setPreenchido`), e o reset devolve os mesmos valores. Vale para todo campo não controlado
deste formulário.

## Produtos: importação do Bling, margem de lucro e paginação (22/09/2026)

Sessão de correções e funcionalidades pedidas pelo dono depois da primeira importação completa
do catálogo do Bling (1.316 produtos de formato simples).

**Importação do Bling — dois bugs achados testando com produtos de verdade:**
- **A paginação do catálogo quebrava com o filtro de formato.** `listarCatalogo` decidia "acabou
  a paginação" olhando o tamanho da lista **já filtrada** (só formato `S`), não da página crua do
  Bling — uma página cheia de variação/composição tinha poucos itens `S` e parecia a última
  página, cortando o resto do catálogo. Corrigido: o critério de parar usa o tamanho da página
  crua (`importarBling.js`).
- **(HISTÓRICO: a importação em lotes saiu em 07/10/2026; hoje o botão importa um código.)** **O
  botão "Importar do Bling" travava aos 20 produtos numa fila grande.** `importarProximo`
  encadeava só **um** lote extra (uma chamada aninhada), e parava em silêncio depois disso — sem
  erro, sem "Importação completa". Numa fila de exatamente 10 (os primeiros testes) isso nunca
  apareceu; numa fila de 1.266 ele parava aos 20. Reescrito como um laço de verdade
  (`BotaoImportarBling.jsx`), com um `ref` (`rodandoRef`) para o Pausa interromper entre um lote e
  o próximo — o estado do React sozinho leria o valor antigo, capturado no fechamento.
- **Fornecedor do Bling, em RASCUNHO** (`Produto.fornecedorRascunho`, migration
  `20260922_produto_fornecedor_rascunho`): a importação grava `{nome, descricao, codigo,
  precoCusto}` sem criar `Fornecedor`/`ProdutoFornecedor` — pedido do dono: "esses campos devem
  ser apenas rascunhos". A aba Fornecedores mostra essa linha como editável; **salvar o produto**
  confirma em vínculo de verdade (reaproveitando `Fornecedor` existente pelo nome) e zera o
  campo. Combinado de **duas chamadas** à API do Bling, porque o fornecedor vem espalhado:
  `GET /produtos/{id}` traz só o nome (`fornecedor.contato.nome` — não `fornecedor.nome`, que não
  existe), e `GET /produtos/fornecedores?idProduto=` traz descrição (o que o Bling chama
  "Descrição no fornecedor" é, na prática, o link do produto no site do fornecedor, ex.
  AliExpress), código e preço de custo. Quando o produto tem mais de um fornecedor cadastrado,
  usa o marcado como `padrao`, igual ao Bling.

**Margem de lucro no campo Preço venda** (`CampoPreco` em `FormularioProduto.jsx`): ícone de
calculadora ao lado do ícone `$` abre um painel com Fornecedor (custo, só leitura — quem muda é a
aba Fornecedores), Preço de venda, % de lucro e Margem financeira, os três últimos editáveis e
sincronizados entre si (mudar um recalcula os outros dois e o campo principal). No campo
principal, mostra `(X% / R$Y)` entre parênteses, colorido: vermelho se o preço fica abaixo do
custo do fornecedor (prejuízo), amarelo com lucro líquido abaixo de 60%, verde a partir de 60%.
- **Imposto de 6% embutido no lucro** (`IMPOSTO_PADRAO`, fixo por enquanto — pedido do dono:
  "futuramente faremos esse valor dinâmico"): lucro líquido = `preço × (1 − 6%) − custo`. O
  painel mostra o valor do imposto em R$ e uma nota avisando que é fixo.
- **Bug corrigido no painel:** editar "% de lucro" ou "Margem financeira" **reescrevia o próprio
  campo a cada tecla** (a função que propaga o novo preço também escrevia de volta no campo que
  originou a mudança), e digitar "60" virava "6" — o "0" seguinte "entrava" depois do campo já
  ter sido resetado para "6.0". Corrigido: cada campo tem um `origem` que nunca é sobrescrito por
  si mesmo, só reformatado (2 casas / 1 casa) ao perder o foco.

**Lista de Produtos, paginada e ordenável** (pedido do dono, mesmo padrão de Mercados):
- **25 por página**, navegação compacta no topo (ao lado da busca) e completa embaixo
  (`Paginacao`, reaproveitado de `src/components/mercados/`). Antes a lista carregava os 1.316
  produtos de uma vez e ficava pesada para interagir.
- **Cabeçalhos clicáveis** (Código, Localização, Preço, Estoque): ciclo nada → crescente →
  decrescente, ordenado **no banco antes de paginar** — importante, senão "ordenar por preço" só
  reorganizaria os 25 da página, sem tocar no resto do acervo.
- **"Conferido" agora grava no banco** (`Produto.conferido`, migration `20260922_produto_conferido`)
  — antes vivia só no navegador (`ConferidoProduto.jsx`) e sumia ao recarregar. A caixa ao lado da
  busca mostra `N produto(s) (M verificados)`, contados no banco (todo o acervo, não só a página).

**Lupa de referências de mercado (`ReferenciasDeMercado.jsx`):**
- **Marca sozinha, ao BUSCAR, quem já está vinculado ao produto** (comparando por
  `produtoColetadoId` para concorrente e por nome para fornecedor) — mas **só reage a uma busca
  nova**, nunca ao abrir a página. Uma primeira versão pré-marcava no carregamento da página e
  isso disparava efeitos que deviam ser só por ação do operador (o painel de imagens chegou a
  tentar importar fotos de 20 produtos marcados sozinho, só de a página ter carregado) — revertido
  a pedido do dono.
- **Verde mais forte** nos itens marcados da busca (`bg-emerald-100`/`accent-emerald-600`, no
  lugar do azul claro `bg-sky-50` de antes, que sumia na tela).
- **Tooltip com o texto completo** ao passar o mouse nas colunas "Concorrente" e "Produto" da
  tabela de Concorrentes, e "Descrição no fornecedor" da tabela de Fornecedores — o corte
  (`truncate`) é só visual, os campos não têm limite de caracteres no banco.

**Janela "Criar descrição" (`JanelaDescricao.jsx`):**
- **Conteúdo de cada referência em DUAS sub-abas**: Descrição (o texto original da página) e
  Especificações (com a quantidade entre parênteses no rótulo) — antes vinham empilhadas, e uma
  ficha técnica longa empurrava a descrição para baixo da rolagem.
- **"Levar para edição"** (pedido do dono em 06/10/2026): na sub-aba Descrição de qualquer referência,
  inclusive a "Descrição atual", o botão põe aquele texto na área de edição da direita, no lugar de gerar com IA.
  Abre em "Editar texto completo" (o texto da loja não segue o padrão), e zera as opções de parágrafo e as
  divergências da geração anterior. Se já houver texto lá, pergunta "Substituir?" antes; desabilitado enquanto a
  IA escreve. Não custa nada: nenhuma chamada à IA.
- **Prompt editável, com "Salvar prompt"** (pedido do dono em 06/10/2026, no molde do Nano Banana): no lugar do
  texto informativo, **uma linha com o botão "Editar prompt"** e o estado ("o padrão do sistema", "o salvo por
  você" ou, em âmbar, "editado, vale só nesta janela"). O botão abre o prompt numa **janela grande por cima**
  (`editandoPrompt`), para a área da descrição ficar com o espaço (pedido do mesmo dia). "Salvar prompt" grava e
  fecha; "Fechar", o X, o Esc e o clique fora fecham mantendo a edição só para esta janela. A caixa vem já
  carregada com o salvo. São só as
  INSTRUÇÕES (`PROMPT_DESCRICAO_PADRAO`, em `anuncio.js`); o Nome, as referências, as medidas e as divergências
  entram sozinhos antes dele (`montarPedidoDaDescricao`). Editar sem salvar vale só para as gerações da janela
  aberta; "Voltar ao salvo" descarta, "Restaurar padrão" põe o texto do código na caixa (e só vale depois de
  salvar). Vazio ou acima de 12.000 caracteres (`MAXIMO_PROMPT_DESCRICAO`) não gera nem salva; o servidor confere
  de novo (`limparPromptDaDescricao`).
  - **BIBLIOTECA DE PROMPTS** (pedido do dono em 09/10/2026: "Microcontrolador", "Motor DC"...). A linha do
    prompt virou uma **lista de escolha** ("Prompt: [Microcontrolador ▾]  ✏ Editar prompt"). Escolher na lista põe
    o texto daquele prompt na caixa, e a edição não salva do anterior se perde.
    - **"GERENCIAR PROMPTS"** (redesenhado pelo dono em 10/10/2026; o botão era "Editar prompt"). **O que está
      acima desta linha sobre "Salvar prompt", "Voltar ao salvo", "Restaurar padrão" e "editado, vale só nesta janela"
      ficou para trás:**
      - **Topo:** seletor dos prompts, **"+ Novo prompt"** (limpa nome e texto, deixa o seletor vazio e põe o cursor
        no Nome) e "Usar como padrão" (ou o selo "padrão: já vem escolhido ao abrir"). X no canto.
      - **Quadro do prompt:** o **Nome** na primeira linha, sempre visível (renomeia o escolhido ou dá nome ao
        novo), o ícone de **copiar** o texto inteiro e o contador; o texto embaixo.
      - **Rodapé: só Excluir e Salvar.** Salvar cria o novo ou grava o escolhido e fecha o popup; sem nome não
        salva. Excluir pede confirmação e fica cinza no do sistema e no novo ainda não salvo.
      - **Alteração não salva** + clique fora, X, Esc, trocar no seletor ou "Novo prompt": pergunta **Sair**
        (descarta; o novo descartado volta ao escolhido antes dele), **Salvar** ou **Cancelar**, no molde do "Sair
        sem usar?" da janela (`saidaDoPrompt`, `comPergunta`). Por isso a edição deixou de "valer só nesta janela".
      - **A janela gera com o último prompt aberto no popup** (decisão do dono): é o mesmo `promptId`.
      - Conferido na tela em 10/10/2026: editar e clicar fora perguntou, Sair descartou; "Novo prompt" + Salvar criou
        e a janela passou a usá-lo; Excluir confirmou e voltou ao do sistema.
    - **"Padrão do sistema"** é sempre o primeiro da lista e **não se exclui**. **Desde 10/10/2026 ele se edita e
      se salva** (nome e texto, pedido do dono): a edição mora numa linha de `PromptDescricao` com o **id fixo
      `"sistema"`** (`ID_DO_SISTEMA`), que nunca fica com `padrao` ligado; sem essa linha ele é o
      `PROMPT_DESCRICAO_PADRAO` do código, que continua guardado como o original. Não há botão de restaurar: o texto
      original volta só se o dono pedir. Nenhum prompt marcado = ele é o padrão, e a geração usa o texto editado.
    - **Onde fica:** tabela `PromptDescricao` (nome único, comparado sem caixa; `padrao` em no máximo um),
      regras em `src/lib/ia/promptsDescricao.js`. As ações (`promptsDaDescricao`, `criarPromptDaDescricao`,
      `salvarPromptDaDescricao`, `excluirPromptDaDescricao`, `definirPromptPadraoDaDescricao`) devolvem sempre a
      lista atualizada. Nome: até 60 caracteres, não vazio, não o do sistema. `criarDescricaoIA` sem prompt da
      tela usa o marcado como padrão.
    - **Migração `20261009_prompts_descricao`:** o prompt único de antes (linha `"descricao"` da `PromptImagem`,
      06 a 09/10/2026) virou "Meu prompt", marcado como padrão, e a linha velha saiu.
    - Testes em `teste-imagens` ("biblioteca de prompts", 28, com o do sistema editável). Escolher o prompt pela **categoria do produto** fica
      para quando o produto tiver categoria no banco.
  - **"Salvar e sair"** (pedido do dono em 09/10/2026): o antigo "Usar esta descrição" saiu do pé da janela e foi
    para a linha do "Gerar com IA", à direita. Põe o texto na aba Descrição e fecha.
  - Os nomes das partes no texto (paragrafos, caracteristicas, itensInclusos, pesoGramas, dimensoesMm, decisoes)
    são os campos da resposta; tirar um do prompt não quebra a leitura, porque o formato JSON os exige. O
    `SISTEMA` (o papel de redator da Rise) continua fixo e é o mesmo dos títulos.
  - Ao separar o prompt, o pedido montado ficou idêntico, caractere por caractere, ao de antes (conferido contra o
    commit anterior). Testes: `teste-extracao` (regras e montagem) e `teste-imagens` (salvar e ler no banco).
- **Remover uma referência só DESTA geração** (lixeira em cada aba): não desmarca na lupa nem
  mexe no que está salvo — pedido do dono: "não excluir fonte". Reabrir a janela (que reseta o
  estado local `excluidos`) traz todas de volta.
- **Sair com texto gerado pergunta antes** (pedido do dono em 04/10/2026: clicar fora fechava a janela e
  perdia o texto sem avisar). Clique fora, X e Esc passam por `pedirFechamento`, no molde do "Sair sem
  salvar?" do editor do Mercado Livre. **Só pergunta quando há o que perder**: texto já gerado, ou geração em
  andamento (fechar a descarta, e ela é paga); janela vazia fecha direto. O aviso oferece, nesta ordem, **Sair**
  (descarta), **Salvar** (o mesmo "Usar esta descrição" de baixo, desabilitado enquanto houver parâmetro aguardando
  escolha) e **Cancelar** (volta à janela); rótulos trocados a pedido do dono em 06/10/2026 (eram "Sair sem usar",
  "Usar esta descrição" e "Continuar editando"). Com o aviso aberto, o Esc o fecha e volta à edição.
- **3 opções para cada um dos 2 primeiros parágrafos** (pedido do dono em 04/10/2026). A IA devolve
  `paragrafos` como DOIS grupos, `[[p1a, p1b, p1c], [p2a, p2b, p2c]]` (`OPCOES_DE_PARAGRAFO`), e a descrição
  nasce com a **primeira** de cada. A janela mostra as 6 opções em duas listas de escolha, e clicar numa troca
  **a linha do parágrafo** no texto (`trocarParagrafo`, em `revisaoDescricao.js`).
  - **O limite de 230 caracteres vale para CADA opção** (`opcoesDeParagrafos`): a que passa volta para a IA
    reescrever (uma segunda chamada, todas as opções), e a que ainda passar fica nas frases inteiras que cabem
    (`ajustarAoLimite`); o corte pode igualar duas opções, e a repetida sai. Repetida, em branco e a quarta em
    diante também saem. Faltar opção não é erro; só não vir nenhuma é.
  - **Parágrafo editado à mão não é trocado "no escuro"**: a troca procura a linha exata, e se o dono mexeu
    nela a janela avisa em vez de escrever a opção no lugar errado. `organizarDescricao` só mexe nas
    especificações, então as linhas dos parágrafos não mudam sob a troca.
  - O retorno de `criarDescricaoIA` ganhou `opcoesParagrafos`; `texto` continua sendo a descrição pronta.
  - **A janela não importa `anuncio.js`** (puxaria o SDK e o banco para o navegador): por isso o limite não
    aparece como "x/230" na tela, só a contagem de caracteres.
- **Revisão em texto corrido, "Finalizar" e "Reajustar"** (pedido do dono em 10/10/2026; substitui as "duas listas de
  escolha" acima e o "Organizar descrição"):
  - **Uma tela só** (`LinhasDescricao.jsx`): a descrição na ordem final, e no lugar de cada escolha um **quadro
    preto** (`Quadro`) com título curto ("Parágrafo 1: escolha uma opção", "Corrente Pinos I/O") e as opções dentro,
    com as cores internas de antes. O quadro do parágrafo entra na linha que tem a opção escolhida dele. Saiu a lista
    de parágrafos acima do texto e o link "Revisar linha por linha / Editar texto completo": o modo vem do estado
    (com opções = quadros; finalizada, digitada ou levada da esquerda = texto editável).
  - **"Finalizar descrição"** (`calcularFinal` + `finalizar`): cada parâmetro com a escolha do dono e, sem escolha, a
    **recomendada pela IA**; parágrafo sem escolha fica com a 1ª opção; depois `organizarDescricao`. Guarda o retrato
    de antes (`antesDeFinalizar`). O botão vira **"Reajustar descrição"** (hoje se chama "Editar descrição", ver "Quatro ajustes seguintes"), que volta às opções com as escolhas do
    dono; se o texto finalizado foi editado, pergunta antes ("Voltar às opções?"), porque a edição se perde.
  - **"Salvar e sair" não trava mais** por parâmetro pendente: sem finalizar, finaliza sozinho (as escolhas e, no
    resto, a recomendada). Peso e medidas vão aos campos pelas escolhas USADAS.
  - **A IA SEMPRE recomenda** (`recomendacaoDaDivergencia`, em `divergencias.js`, testada no `teste:extracao`): a
    decisão dela quando aponta uma opção da lista; senão a opção com mais lojas (empate: a primeira). **Corrente de
    pico × contínua:** antes a recomendação era apagada; agora vai para a opção que traz a contínua (o valor de
    operação), com o motivo.
  - Conferido em 10/10/2026: o componente renderizado no Node com dados de exemplo (3 quadros, na ordem certa, sem
    repetir o parágrafo) e, na tela, Finalizar → Reajustar → "Voltar às opções?" com texto digitado. **A revisão de
    uma geração de verdade com os quadros ainda não foi vista** (a geração é paga): o primeiro uso é do dono.
  - **Ajustes de 10/10/2026 na mesma tela** (pedidos do dono, itens 8 a 14):
    - **Marca de escolha igual à dos parágrafos:** as opções dos parâmetros usam o **círculo** (vazio; azul com o visto
      quando escolhida) no lugar do "?", e a marca "Selecionada" saiu. As cores do grupo continuam. Cada opção é um
      `role="radio"` dentro de um `radiogroup`.
    - **No fim da linha:** primeiro a **loja** (as que publicam aquele valor), depois o selo "IA recomenda".
    - **Quadro sem opções some:** excluídas todas as opções de um parâmetro, o quadro sai da tela, o parâmetro fica de
      fora da descrição e não conta como pendente.
    - **Mover quadros e linhas:** as setas ˄ ˅ aparecem também no cabeçalho de cada quadro de parâmetro. A `posicao` de um
      quadro é quantas linhas comuns vêm antes dele; quadros na mesma posição seguem `ordemDosQuadros`. Quadro troca com
      o vizinho (posição e ordem) ou passa por cima de uma linha comum; uma linha comum também passa por cima de **um**
      quadro por clique (o quadro ganha ou perde uma linha antes dele). A regra é `moverQuadroNoEstado`
      (`revisaoDescricao.js`, pura, testada). O "Finalizar" e o `calcularFinal` respeitam a mesma ordem.
    - **A tela segue o item movido e o destaca** (fundo azul-claro com anel): `scrollIntoView({ block: "nearest" })`
      **instantâneo** (o suave não rolava a cada clique no navegador de teste), e o destaque some ao clicar fora. Conferido
      em 40 passos numa página de teste temporária (apagada), com a rolagem da página travada como na janela.
    - **Lápis nas linhas comuns das especificações** (`substituirEspecificacao`): a linha vira um campo (Enter ou ✓ salva,
      Esc ou ✕ cancela) e volta no formato "- Nome: valor;", com a unidade colada. A linha editada mostra **"editada"** no
      lugar da loja.
    - **Loja de cada especificação comum** (`lojasDaCaracteristica`, em `divergencias.js`): a IA devolve, em cada item de
      `caracteristicas`, `referencias` (os números das referências de onde o tirou; o pedido manda isso, em
      `INSTRUCAO_DE_REFERENCIAS`, e o nome da loja **continua sem ir para a IA**). O Rise **confere no texto de cada
      referência** (nome, descrição e ficha) se o valor está lá (os pedaços com número, como "16mhz", ou, sem número,
      todas as palavras) e só então mostra a loja; senão a linha fica **sem nome de loja**. Especificação que não veio de
      concorrente nem de fornecedor também fica sem nome (pedido do dono). `gerarDescricao` devolve
      `fontesDasLinhas` (`{ "- Nome: valor;": [lojas] }`, chave = a linha formatada); só valem as referências de loja,
      não as peças de um kit. Vale só para a geração nova: texto digitado ou levado da esquerda não tem loja.
    - Testes: `teste:extracao` (lojas, `substituirEspecificacao`, `moverQuadroNoEstado`, o pedido com e sem referências).
  - **Quatro ajustes seguintes, também de 10/10/2026** (pedidos do dono):
    - **Referências já na primeira abertura.** A janela abria com "(0)" e o aviso de que não havia concorrente: os
      fornecedores e concorrentes SALVOS são lidos em segundo plano pelo formulário (`vinculosItens`, uns 17 s no
      servidor de desenvolvimento) e só a segunda abertura os trazia. Agora `FormularioProduto` calcula `lendoVinculos`
      (a assinatura lida difere da de agora) e passa `lendoReferencias` à janela, que mostra "Lendo fornecedores e
      concorrentes...", **desabilita o "Gerar com IA"** (com a dica) e **relê as referências sozinha** quando a lista de ids
      muda com a janela aberta (`idsLidos`, `releituraAtual`). O aviso "Nenhum concorrente ou fornecedor" só sai depois de
      a leitura terminar. A "Descrição atual" aparece logo, sem esperar as lojas.
    - **"Descrição atual" é a primeira aba e abre selecionada**; a seleção é por id (`idAtivo`), então a lista das lojas
      chegando depois não a tira dela. **Ela é a descrição do FORMULÁRIO no momento de abrir** (`descricaoDaAba`, lida do
      campo por `lerProduto().descricao`), e não a gravada do produto: o "Salvar e sair" só põe o texto no formulário, e
      reabrir a janela sem salvar o produto trazia o texto antigo (achado do dono em 10/10/2026).
    - **Lápis e lixeira em todos os campos da revisão** (pedido do dono em 10/10/2026). Além das especificações e das opções
      dos parâmetros, que já tinham: **toda linha de conteúdo** (título, parágrafo sem opções, itens inclusos, garantia) ganha
      lápis (editar, num campo de texto; Enter salva, Esc cancela) e lixeira (`substituirLinha`, `removerLinha`, em
      `revisaoDescricao.js`; excluir junta as linhas em branco que ficarem seguidas). **Os títulos das seções**
      ("Especificações técnicas:", "Itens inclusos:", "Garantia:"; `ehCabecalhoDeSecao`) e as linhas em branco **não** têm: dão a
      estrutura do texto (o "Itens inclusos" tem só o lápis do código). **Cada opção dos quadros de parágrafo** também tem
      lápis e lixeira (`editarOpcaoDeParagrafo`, `excluirOpcaoDeParagrafo`): editar a **escolhida** troca a linha do texto junto;
      excluir a escolhida passa para a primeira que sobrar; **sobrando uma opção o quadro some** e o parágrafo vira linha comum
      com lápis e lixeira; se o dono editou a linha do parágrafo à mão, não trocamos "no escuro" (a mesma regra de
      `escolherParagrafo`). Qualquer uma dessas mudanças desfaz o "finalizado" (ver abaixo). Conferido em 10/10/2026 no 100101
      (título, item incluso) e numa página de teste temporária (apagada) com as opções de parágrafo.
    - **Trava do "Salvar e sair" até finalizar** (pedido do dono em 10/10/2026): qualquer alteração (digitar, editar, mover,
      excluir, escolher uma opção, gerar, levar um texto) mostra **"Finalizar descrição"** e deixa o **"Salvar e sair"
      desabilitado**; ele só libera depois do "Finalizar". `finalizado = textoFinalizado !== null && texto ===
      textoFinalizado && pendentes === 0`: o texto na caixa é igual ao que o "Finalizar" montou e nenhum parâmetro ficou sem
      escolha. O "Salvar e sair" **deixou de finalizar sozinho**; o "Salvar" da pergunta ao fechar vale a mesma regra (e a
      pergunta diz para finalizar antes). Sem alteração depois de finalizar, o botão ao lado mostra "Editar descrição".
    - **Ao clicar numa loja, a sub-aba "Especificações" abre primeiro** (pedido do dono em 10/10/2026), e as duas sub-abas
      continuam na tela. Só para fornecedor e concorrente com ao menos uma especificação; a "Descrição atual", as peças
      do kit e a loja sem especificação abrem em "Descrição". Cada clique reinicia a escolha (o `key` da aba remonta).
    - **Dois botões, iguais para texto da IA ou não: "Editar descrição" e "Finalizar descrição".** O "Reajustar" deixou
      de existir. Texto simples (digitado, levado da esquerda ou já finalizado) mostra **"Editar descrição"**, que abre a
      revisão linha por linha (lápis, excluir, mover, arrastar); na revisão o botão é **"Finalizar descrição"**, que
      volta ao texto. Descrição da IA já finalizada **e com opções** volta aos quadros com as escolhas (e pergunta
      "Voltar às opções?" se o texto foi editado); sem opções, abre direto, sem pergunta e sem perder nada
      (`editarDescricao`).
    - **Código dos "Itens inclusos"**: a linha ganhou o lápis do código (`codigoDosItensInclusos`,
      `substituirCodigoDosItens`). O código **do produto vem sugerido** ("sugerido: 100101") quando a linha não traz
      código; editável, Enter salva. Aceita "Cod:" (geração) e "Cód:" (descrições antigas do cadastro, que também
      terminam em CRLF) e mantém a grafia da linha. Texto sem "Itens inclusos" não ganha a seção sozinho.
    - Conferido na tela em 10/10/2026 no 100101, sem gerar: a espera (mudando a lista de concorrentes e abrindo a
      janela na hora), a aba atual selecionada, digitar → Editar → editar código, linha, mover, excluir → Finalizar,
      e "Levar para edição" → Editar. O caminho da IA com opções (Finalizar → Editar volta aos quadros) é o de antes e
      segue coberto só pelo teste de renderização.

**Fotos do produto: só as validadas são salvas, o botão Baixar e a ampliada com setas** (`PainelDeImagens.jsx`,
pedidos do dono em 04/10/2026):
- **SÓ AS FOTOS VALIDADAS FICAM.** Ao salvar o produto, apenas as fotos com o **check verde** (`finalizada`,
  que o dono marca com "Escolher essa" em Melhorar) são salvas; **as demais são excluídas** (a linha, o
  arquivo no disco e, no produto novo, nunca chegam a ser gravadas). Vale para o produto novo
  (`gravarImagensDoLote`, que desde 05/10/2026 delega ao mesmo `reconciliarImagensDoProduto`) e para o existente
  (que devolve `naoValidadas`). **Exceção:** a foto que tem versão PAGA (Photoroom ou Nano Banana) e não foi
  validada não é excluída, vai para a **reserva** (ver a seção abaixo).
  - **O que decide é o `false` EXPLÍCITO; campo ausente MANTÉM a foto.** Um formulário aberto antes da regra
    salva sem o campo, e tratar a falta como "não validada" apagaria as fotos de um produto inteiro.
    Por isso `imagemParaTela` faz toda foto nova nascer com `finalizada: false`, e o formulário manda o valor
    como está (`imagem.finalizada`, sem `Boolean(...)`).
  - **SALVA = VALIDADA.** Como só a validada é salva, toda foto que já estava no produto volta **com o check**
    ao reabrir (`prepararFotosDoProduto` devolve `finalizada: true`). Sem isso, as fotos antigas (de antes da
    regra) e as importadas do Bling voltariam sem check e **seriam apagadas no próximo Salvar**; nenhum
    produto existente teve foto apagada por isto. Foto que não abriu no painel (arquivo ilegível) segue
    preservada, nunca apagada por não estar validada.
  - O painel diz o que vai acontecer: "N fotos · M validadas · K sem validar serão excluídas ao salvar", e o
    limite de 100 conta só as validadas (`FormularioProduto` confere o que está sendo enviado). O texto da tela
    é "validada"; o nome no código segue `finalizada`.
  - **A coluna `ProdutoArquivo.finalizada` (migration `20261004_arquivo_finalizada`) ficou SEM USO.** Nasceu
    na primeira versão, que gravava o check; na mesma sessão a regra virou "só validada é salva", e gravar o
    check deixou de ter função. Nada a lê nem a escreve. **A migration da reserva (`20261005_nano_banana_reserva`)
    também NÃO a removeu:** o servidor da outra frente roda com o client antigo, que a lista em toda consulta, e
    um `DROP COLUMN` o derrubaria. Fica para a próxima migration, quando as duas frentes tiverem o client novo.
  - Trocar o conteúdo da foto (Melhorar, voltar ao original) zera a validação na tela (`trocar`): a decisão do
    dono recomeça. Testado em `teste:imagens` (os três destinos, campo ausente, todas sem check).
- **A foto ampliada ganhou setas** (`AmpliacaoDeFoto`, em `ImagemComZoom.jsx`): clicar na foto principal abre
  a ampliada com seta anterior/próxima, as setas do teclado e o contador "2 / 5". As setas **não dão a volta**
  (na primeira o "anterior" apaga, na última o "próxima"), e a foto do painel de trás acompanha (usa o mesmo `ir`
  das setas do painel). É opcional (`aoNavegar`): a janela de revisão, que compara original com melhorada, não
  passa nada e fica como era, com as setas do teclado engolidas.
- **Botão Baixar** entre Melhorar e Excluir (o destrutivo continua por último): baixa a foto que está na
  tela (a padronizada 1024x1024, ou a melhorada, se foi a escolhida). É um `<a download>` para o endereço do
  próprio sistema (`/api/temporarios/...`), sem rota nova. O nome do arquivo é o SKU digitado no formulário
  e a posição (`100103-2.jpg`), ou `foto-N.jpg` sem SKU: sem isso, toda foto de todo produto se chamaria
  `foto-1.jpg` e uma sobrescreveria a outra na pasta de downloads. O SKU é lido do campo na hora do clique e
  limpo (só letras, números, ponto, hífen e sublinhado). Apagado enquanto a foto está sendo ajustada.

## Produtos: Nano Banana e a reserva de imagens (05/10/2026)

Pedido do dono: gerar a foto do produto como **foto de estúdio limpa** com o Nano Banana (modelos de imagem do
Google), **dentro do Rise**, e **não perder mais** o original e as versões geradas no Salvar. Spec:
`docs/superpowers/specs/2026-10-05-nano-banana-design.md`; plano:
`docs/superpowers/plans/2026-10-05-nano-banana.md`. Foi executado inline, sem subagentes.

### Versão nomeada da foto (substituiu o booleano `melhorada`)

- `imagem.versao` é `"original" | "photoroom" | "nanobanana"` (a que está em `imagens/<base>.jpg` agora);
  `imagem.versoes` diz quais versões **geradas** existem guardadas (`{ photoroom, nanobanana }`) e `imagem.urls`
  traz os endereços. `imagemParaTela` e `versoesParaTela` moram em `src/lib/imagens/paraTela.js` (módulo comum:
  um arquivo `"use server"` só exporta função assíncrona).
- **Lote temporário** (`dados/temporarios/<lote>/`): `versoes/<base>.<versao>.jpg` (as três), `extras/<base>.<n>.<ext>`
  (até 5 imagens extras ENVIADAS para a geração) e `geracoes/<base>.json` (o último pedido: modelo, prompt e
  extras). O nome antigo `.melhorada.jpg` (lotes de antes de 05/10/2026, que vivem até 24 h) é lido como
  `photoroom`. `apagarImagem` leva as quatro grafias de versão, as extras e a geração, e nunca as de outra foto.
- "Escolher essa" copia a versão guardada para `imagens/<base>.jpg`, sem custo, para qualquer versão. O Cancelar da
  janela restaura a versão pelo **nome**. A janela confirma duas vezes a exclusão de qualquer foto com versão paga.

### A reserva (`ProdutoArquivo.papel`)

- **`papel`**: `FOTO` (carrossel e anúncios) ou `RESERVA` (guardada, escondida atrás do botão "Reserva (N)").
  `versao` e `grupo` ligam a original e as versões da mesma foto (`grupo` nulo vale "o próprio id"; as linhas
  antigas ganharam `grupo = id` na migration). Arquivos em `dados/produtos/<SKU>/reserva/<32 hex>.jpg`, servidos
  por `/api/arquivos/<sku>/reserva/<nome>` (`caminhoDaReserva`, `urlDaReserva`, `reserva.js`).
- **TODA leitura de foto do produto filtra `papel: "FOTO"`.** As 100 fotos, a foto principal, "Clonar", os
  anúncios do ML, a lista de Produtos e a abertura do painel nunca veem a reserva. Há um teste de guarda
  (`nenhuma leitura de foto sem filtrar papel`) que lê todo o `src/` e falha se uma linha nova com
  `where: { ... tipo: "IMAGEM" ... }` esquecer o `papel`. **Ao escrever uma leitura nova de foto, filtre.**
- **Regras do Salvar** (`reconciliarImagensDoProduto`, único lugar onde a reserva é decidida):
  - a foto validada fica como FOTO; o original e as outras versões do lote **descem para a reserva** no mesmo
    grupo (sha1 diferente da foto final);
  - o arquivo velho de uma foto trocada desce para a reserva quando a troca envolve uma versão gerada; a foto
    antiga só padronizada continua sendo apagada, como antes;
  - foto **paga sem validar**: nada entra no carrossel e todas as versões dela (inclusive a original) vão para a
    reserva. A geração paga nunca some em silêncio;
  - a FOTO que sai da lista mas divide o grupo com uma validada que ficou (o dono trouxe outra versão da
    reserva) vira RESERVA, na mesma linha;
  - **nunca duas imagens iguais no mesmo grupo**: a RESERVA igual à foto final é apagada, e nada novo é criado se
    o grupo já tem aqueles bytes. Candidata nunca tocada continua descartada;
  - `reservaExcluida` (ids que o dono excluiu na tela) apaga linha e arquivo, só de RESERVA deste produto, e o
    que foi excluído não é recriado pelo lote. **A exclusão só vale no Salvar do produto**: o Cancelar não grava.
  - Ordem das operações: arquivos novos entram (nome novo, nunca renomeia o do produto antes da transação),
    depois a transação, e só no fim os velhos saem.
- **Reabrir** (`prepararFotosDoProduto`): cada foto volta com `versao` e `grupo`; a RESERVA do mesmo grupo entra no
  lote como `versoes/`; **a RESERVA `original` vira o original do lote** (`definirOriginal`), então o Nano
  Banana parte da original verdadeira e não da foto atual. Reabrir e salvar sem mexer não duplica nada.
- **Tela:** botão "Reserva (N)" ao lado de "Melhorar" (só em produto que já existe; some quando N é 0). "Escolher
  essa" troca a foto do mesmo grupo na mesma posição; "Gerar com Nano Banana" (só nas `original`) traz a original
  como candidata **no fim** e abre a janela na aba Nano Banana; "Excluir" pede um segundo clique.

### Integração com o Google (`src/lib/integracoes/nanobanana.js` e `nanobananaLog.js`)

- **Modelos** (`MODELOS`, preço por imagem 1K, **conferidos em 05/10/2026** em ai.google.dev): `nano-banana-2` →
  `gemini-3.1-flash-image`, US$ 0,067 (padrão, aceita extras); `nano-banana-pro` → `gemini-3-pro-image`, US$ 0,134
  (aceita extras); `nano-banana-2-lite` → `gemini-3.1-flash-lite-image`, US$ 0,034 (**ignora as extras**). O Nano
  Banana 1 ficou fora (legado). Se o Google mudar o preço, é uma linha.
- **Sem camada gratuita nem sandbox para imagem: gerar já é pagar.** Chamada `POST .../models/<id>:generateContent`,
  chave no cabeçalho `x-goog-api-key`, só imagem, 1:1, 1K, tempo limite de 120 s, até 5 extras, prompt até 2.000
  caracteres. **O formato do corpo (clássico `contents/parts/inline_data`) foi CONFIRMADO com a chave
  real em 06/10/2026**: os dois modelos responderam HTTP 200 em 9 a 16 s, a imagem vem em `candidates[0].content.parts[0].inlineData`
  (JPEG 1024x1024, ~400 KB) e a parte traz também um `thoughtSignature` enorme (~1,4 MB de texto) que é ignorado.
  Só `montarPedido` e `lerResposta` conhecem o formato; o roteiro `scripts/teste-nano-banana.js` repete a conferência.
  Teste com a foto do produto 100104 (placa Arduino Mega 2560 com cabo): forma, cores, conectores e cabo saíram iguais;
  o texto impresso miúdo (marcação do chip, rótulos dos pinos) é **redesenhado e não copiado**, com pequenas diferenças.
- **`.env`:** `GEMINI_API_KEY=`, `NANO_BANANA_GERACAO=false` (trava, no molde de `PHOTOROOM_COMPRA`: mesmo com a chave
  colada nada é gerado) e `NANO_BANANA_TETO_DIA=50` (gerações por dia que deram certo). Mudou o `.env`, reiniciar o
  servidor (o `.env` só é relido na partida).
- **Travas, todas no servidor (`gerarComNanoBanana`, `acoes-nanobanana.js`) e antes de chamar o Google:** lote e foto
  válidos, modelo conhecido, prompt não vazio e até 2.000, configuração (chave + trava), teto do dia (sem
  conseguir ler o uso, **recusa**: o gasto é real), **uma geração por vez por foto** (clique duplo ou duas abas) e
  extras disponíveis (uma faltando recusa o pedido inteiro **antes** de cobrar).
- **Custo e auditoria:** em reais pela cotação de `cotacaoDolar.js` (fixa em R$ 6,00 por ora), com o dólar entre
  parênteses e sem IOF. `LogIntegracao` com **`servico = GEMINI`** (migration `20261005_nano_banana_reserva`): o
  modelo no `endpoint`, status e duração, e no resumo só pixels da original, quantas extras, tamanho do prompt e
  se era "gerar de novo". **Nunca a chave, a imagem nem o prompt.** Só a resposta **200** conta como gasto e no teto;
  falha de rede ou 429 entra no log mas não conta; chamada recusada antes de sair nem entra.
- **Só a ÚLTIMA geração do Nano Banana fica guardada por foto** ("gerar de novo" troca a versão `nanobanana`; nunca
  toca na original nem na do Photoroom). Para ficar com as duas, "Escolher essa" na primeira antes de gerar a
  segunda, e a segunda vai para a reserva no Salvar.
- **Erros traduzidos** (`mensagemDeErro`/`lerResposta`): chave recusada, faturamento ausente (também em HTTP 400
  `FAILED_PRECONDITION`), cota, recusa por conteúdo (`SAFETY`, `IMAGE_SAFETY`...), resposta sem imagem (mostra o
  texto que o Google devolveu) e imagem que não abre (a geração foi cobrada, e a mensagem diz isso).
- **O modelo é generativo e pode redesenhar o produto**, como o `beautify` do Photoroom fez com um Arduino. A defesa é
  o prompt (`PROMPT_PADRAO`: mesma forma, proporções e cores, sem inventar texto), as imagens extras de referência e a revisão
  lado a lado com zoom antes de escolher. **O prompt enviado à IA tem acento** (é o texto da spec, literal); o
  resto do código segue sem acento.
- **Prompt salvo por modelo** (`PromptImagem`, chave do `MODELOS`, **não** o id do Google). Salvar o texto igual ao
  padrão do código **apaga a linha** (padrão = sem linha, e uma melhoria futura do padrão chega a quem nunca mexeu).

### Tela (janela "Fotos do produto", layout B)

Quadro da esquerda com a original; o da direita tem as abas **Photoroom | Nano Banana** (lembrada por foto). A aba
Nano Banana (`PainelNanoBanana.jsx`): resultado, modelo com o preço em reais, prompt (`n/2000`, "Salvar prompt" só
acende quando difere do salvo, "Voltar ao salvo"), tira de imagens extras (outras fotos do carrossel + "Enviar"),
**confirmação amarela de preço antes de cobrar** e "Escolher essa". O estado de cada foto (modelo, prompt editado,
extras marcadas) mora em `porFoto[base].nb`, no painel: fechar a janela não perde o que o dono estava refinando.
Sem chave ou com a trava desligada, uma faixa diz o motivo e "Gerar" fica cinza; o resto funciona. O rodapé mostra
o uso do Nano Banana ao lado do Photoroom.

### Pendências

- **Chave e faturamento do Google** (aistudio.google.com) **estão feitos** (06/10/2026), e o crédito de boas-vindas de
  US$ 300 do Google Cloud **não cobre a API Gemini** (diz a própria tela): as gerações cobram no cartão. O roteiro
  `scripts/teste-nano-banana.js` já rodou (US$ 0,20) e confirmou o formato. Orçamento mensal com alerta no Google
  Cloud é opcional.
- **`NANO_BANANA_GERACAO=true` no `.env` desde 06/10/2026** (o dono mandou ligar; teto de 50 por dia). **A geração
  real de ponta a ponta na tela (produto novo e existente) NUNCA foi vista**: o dono dispensou mais testes com
  imagens, então o primeiro uso de verdade é o dele. O que foi visto na tela, sem gerar: a aba, o prompt salvo, as
  extras, a reserva. O roteiro de bancada gerou só a placa Arduino Mega, 3 vezes (US$ 0,47 no total).
- **O prompt padrão mudou três vezes em 06/10/2026**, e a versão atual (a que está em `PROMPT_PADRAO`) foi escolhida
  pelo dono: **melhorar a nitidez da foto real**, sem aspecto de desenho, reescrevendo o texto meio apagado só se
  der para ler com certeza e sem inventar nada. As anteriores ("recriar como foto de estúdio" e "digitalizar") foram
  descartadas: nos testes o texto impresso miúdo (marcação do chip, rótulos de pinos) saiu **redesenhado, não
  copiado**, e a versão "digitalizada" ficou com cara de desenho. **Um prompt não impede o modelo de errar texto
  miúdo**: a conferência lado a lado na janela, antes de "Escolher essa", é a defesa de verdade, e o texto da
  marcação do chip merece olho.
- **Pontos menores deixados de lado na revisão final** (nenhum perde dado): o teto do dia não é atômico (duas fotos
  gerando no mesmo instante passam uma acima); "Gerar com Nano Banana" na reserva traz a original no fim, e validá-la
  sem tirar a foto do mesmo grupo deixa duas FOTO do mesmo grupo; `/api/arquivos` devolve 500 para endereço malformado
  (`decodeURIComponent`, como já fazia nas outras pastas); o Salvar lê todos os arquivos da reserva para comparar os
  bytes (sem teto de reserva isso cresce). O reparo "gerar sem escolher e fechar a janela" (as versões geradas entram
  na assinatura da janela) **não tem teste automático** (é código de tela) e a geração de verdade não foi vista.
- Fora desta rodada: várias gerações por foto, prompt por produto, teto de tamanho da reserva, Nano Banana a partir
  da foto do Photoroom, 2K/4K e o Nano Banana 1.

## Produtos: edição rápida na lista (30/09/2026)

Pedido do dono, a partir de um print da lista com três células marcadas: **localização, preço e estoque
editáveis por popup**, sem abrir o cadastro. Clicar na célula abre o popup (o lápis aparece com o mouse em
cima). O esboço foi mostrado e aprovado antes de implementar.

- **Só neste sistema (a Opção 1 escolhida pelo dono):** nada é enviado ao Bling nem aos canais. A escrita
  neles está desligada, e o Mercado Livre e a Loja Integrada leem estoque e preço **pelo Bling**, então o
  número daqui pode divergir do dele. **Os popups de preço e estoque trazem esse aviso na tela.** Quando a
  escrita no Bling for ligada, o histórico de movimentos é o que há para enviar (ainda sem coluna de "enviado").
- **Estoque, três operações**, escolhidas em cartões: **Entrada** (soma), **Saída** (tira, nunca deixa
  negativo) e **Balanço** (o operador conta e informa o total; o sistema calcula a diferença). Abaixo, a
  quantidade (só inteiros, o campo recusa `e + - . ,`), a **prévia do saldo** ("5 → 8 (+3)"), o motivo e uma
  observação. Motivos por operação em `src/lib/estoque.js`.
- **Histórico:** tabela `MovimentoEstoque` (migration `20260930_movimento_estoque`), com tipo, quantidade,
  **saldo antes e depois**, motivo e observação. O balanço guarda o total contado, e a diferença sai dos dois
  saldos. Um balanço que confirma o mesmo número **também é gravado** (a contagem aconteceu). Apagar o produto
  apaga o histórico dele (`Cascade`). **Ainda não há tela para ver o histórico**: só se grava.
- **Sem corrida:** a linha do produto é travada (`FOR UPDATE`) antes de ler o saldo, dentro de uma transação
  que grava o saldo novo e o movimento juntos. Testado com 20 saídas simultâneas de 1 sobre saldo 10: passam
  exatamente 10, o estoque termina em 0 e cada saída guarda um saldo diferente.
- **Preço:** um só por produto (`Produto.precoVenda`); **não existe preço por canal** no banco. O popup mostra
  a margem líquida com o mesmo cálculo e as mesmas cores do cadastro (6% de imposto fixo; vermelho abaixo do
  custo, amarelo abaixo de 60%, verde a partir daí), via `src/lib/margem.js`. **`FormularioProduto.jsx` ainda
  tem a cópia própria** desse cálculo (arquivo da outra frente): mudar o imposto pede mudar nos dois. O
  **custo** é o do cadastro e, na falta dele, o do rascunho do Bling (`page.jsx`), porque é lá que está o custo
  de quase todos os produtos importados. Vazio não limpa o preço aqui (o cadastro completo faz isso).
- **Localização:** texto de até 40 caracteres; vazio limpa. Não vai para canal nenhum.
- **Onde mora:** a lógica de banco em `src/lib/ajusteRapido.js` e as Server Actions, finas, em
  `src/app/produtos/acoes-edicao-rapida.js` — **fora de `acoes.js`**, o arquivo de maior conflito entre as
  frentes. Separadas porque `revalidatePath` só existe dentro do Next e o teste chama a lógica direto.
  Componentes em `src/components/produtos/EdicaoRapida.jsx`.
- **O estoque da foto mensal** (`FotoMensalProduto`) passa a refletir esses ajustes, já que lê `Produto.estoque`.
- **Ficou de fora, por decisão do dono** ("as ideias não vamos implementar neste momento"): ver o histórico de
  movimentos, motivo obrigatório, alerta de estoque baixo e edição em lote.
- **A migration está aplicada no banco compartilhado, mas o código só existe na `main`:** quem for gerar
  migration nas outras worktrees precisa fazer `git merge main` antes, senão o `migrate diff` propõe apagar
  `FotoMensalColeta`, `FotoMensalProduto` e `MovimentoEstoque` (regra do schema).

## Canais de Venda: Mercado Livre (fase 1)

Pedido do dono em 30/09/2026; construído de 01 a 03/10/2026 na branch `canais-de-venda`. Spec:
`docs/superpowers/specs/2026-09-30-canais-de-venda-mercado-livre-design.md`; plano:
`docs/superpowers/plans/2026-10-01-canais-de-venda-ml-fase-1.md`. **A fase 1 só monta e salva o rascunho**:
nada escreve no Mercado Livre nem no Bling, o botão Publicar fica desabilitado com o motivo, e
`ML_PUBLICACAO`/`BLING_ESCRITA` seguem `false`. A fase 2 (inteligência do ML, só leitura) e a fase 3 (publicar) estão
nas seções seguintes.

**Onde mora cada parte**
- **Rotas** (`src/app/canais-de-venda/`): `page.jsx` (cartões de `src/lib/canaisDeVenda/catalogo.js`; Loja Integrada
  e Shopee com `emBreve`, prop nova do `CartaoDeAtalho`), `mercado-livre/` com a lista (busca, 100 por página),
  `novo/` (`?produto=<sku>`), `[id]/`, `configuracoes/` e `acoes.js` (Server Actions finas: conferem o que vem do
  navegador, chamam a lib e revalidam). No menu, só ícone e texto (`blocos.js`), como Ferramentas.
- **Componentes** (`src/components/anuncios/ml/`): `EditorAnuncioML` (estado controlado, sem `<form>`, as 7 abas
  montadas e só escondidas, uma aba por arquivo), `BlocoComposicao`, `JanelaAnuncioML` (pop-up do ícone),
  `EditorNaPagina`, `TabelaAnunciosML`, `FrasesFixas`.
- **Lib** (`src/lib/canaisDeVenda/`, funções puras sem rede, lidas pela tela, pelas ações e pelo teste):
  `composicao.js`, `custo.js` (fornecedor padrão), `frases.js`, `configuracao.js`; em `ml/`: `rascunho.js`,
  `esquema.js` (zod), `validacao.js` (`ABAS_ML`, `validarRascunhoML`), `payload.js`, `descricao.js`, `icone.js`,
  `rotulos.js` e `banco.js` (leitura e gravação no Postgres).
- **Rascunho:** `{ produtoId, titulo, familyName, tipoAnuncio, condicao, categoriaId, preco, estoque, imagens,
  descricao, atributos, envio, composicao }`. `tipoAnuncio` é `gold_special` (Clássico) ou `gold_pro` (Premium);
  `imagens` guarda só o id da foto; `atributos` tem `BRAND`, `MODEL`, `GTIN` (o SKU vai em `SELLER_SKU` no payload).
  Gravado em colunas de `Anuncio` (`produtoId`, `titulo`, `descricao`, `categoriaExternaId`, `atributos`) e no JSON
  `Anuncio.dados` (o resto). Atualizar **mescla** sobre o `dados` existente, para a fase 3 guardar a etapa ali. As
  frases fixas **não** vão no rascunho: ficam em `ConfigCanal.frasesFixas` e entram na prévia e no payload.
- **Salvar não é barrado por problema de validação** (rascunho incompleto vale; a validação só impede publicar). O
  servidor recusa o que a tela não garante: formato quebrado, produto excluído ou não Conferido, composição ruim,
  código de kit de outro anúncio e anúncio já `PUBLICADO` (só a fase 3 o altera).

**Vários anúncios por produto e o índice que só existe no SQL**
- `@@unique([produtoId, canal])` saiu de `Anuncio`: o ML aceita vários (Clássico e Premium). Bling e Loja Integrada
  seguem com um só, pelo índice único parcial **`Anuncio_um_por_produto`**, que o Prisma não descreve e **mora só
  na migration `20261001_canais_de_venda_ml`**. O próximo `migrate diff` vai propor apagá-lo, junto com
  `Job_fonte_aberta`, o índice de trigramas e `ProdutoColetado_coletadoEm_idx`: **tirar essas linhas de toda
  migration gerada** (as duas desta feature já foram editadas assim).
- **`separarCanais`** (`src/lib/canais.js`) deixava o último anúncio do canal vencer, e um rascunho listado depois
  escondia o publicado. Agora o anúncio com `idExterno` (que existe no canal) tem prioridade.
- **Ícone do ML** (`estadoDoIconeML`): **verde só com `status` PUBLICADO e `situacaoCanal` ATIVA** (o ML pausa
  sozinho, e publicado pausado não é "tudo certo"); **ponto âmbar** para qualquer outro anúncio ML do produto
  (rascunho, validado, publicando, erro, publicado pausado). Valem juntos. O texto acessível e o `title` vêm de
  `rotuloDoIconeML`: cor sozinha não chega a leitor de tela.
- **Só Produto Conferido vira anúncio, conferido no servidor** (ao abrir, ao incluir item de kit e em todo Salvar,
  no principal e em cada item). Produto que deixou de ser Conferido abre normalmente, mas o Salvar recusa com o
  motivo no topo do editor e o digitado fica. **BRAND e MODEL em MAIÚSCULAS** na tela e no payload.

**Composição / kit** (`composicao.js`, `rascunho.js`, `banco.js`)
- Existe só no anúncio: `dados.composicao = { itens: [{ produtoId, quantidade }], codigo, blingProdutoId }`. Mínimo de
  2 unidades, quantidade inteira de 1 a 9999, sem produto repetido; o produto do anúncio é o primeiro item.
- **Código:** um produto só = `{sku}_{N}` com milhar em ponto (`920302_1.000`), **sempre recalculado no servidor**;
  kit misto = **digitado**, com sugestão do próximo livre da faixa 25xxxx. `codigoEmUso` recusa código igual a SKU
  de Produto ou ao de outro anúncio **com composição diferente**; com a mesma é aceito (Clássico e Premium dividem o
  kit do Bling). Conferir o código **no Bling** é fase 3.
- **`blingProdutoId` é do servidor:** o que a tela mandar é ignorado; nasce `null` e, na atualização, só fica se o
  código do kit for o mesmo do gravado.
- **Estoque** = menor ⌊estoque do item ÷ quantidade⌋ (negativo conta 0); **custo** = soma de quantidade × custo, e
  item sem custo deixa o total `null` (um parcial pareceria margem boa).
- **`aplicarComposicao`** refaz a cada mudança nos itens: estoque, peso, fotos, código e o bloco "Itens inclusos" da
  descrição. Não toca em título, preço (o do kit nasce em branco: não é a soma das peças), categoria e medidas (nascem
  as do principal, editáveis na aba Envio). O **GTIN sai** ao virar kit e o `ean` do principal volta ao desligar a
  composição, que devolve também descrição, estoque e fotos dele.

**Editor: pop-up e página**
- **Pop-up:** o editor desenha a própria janela (Esc, "Sair sem salvar?"). Sem anúncio abre direto um novo; com
  anúncios, lista + "Novo anúncio"; não Conferido, só o aviso. Ao salvar volta à lista. O `key` do editor muda a cada
  abertura, senão o anúncio anterior vazaria para o seguinte.
- **Página:** no primeiro Salvar de um anúncio novo a URL vira `/[id]` por `router.replace` dentro de
  `useTransition`, com o editor `inert` até a navegação acabar. Isso **remonta o editor** (a aba volta para Geral).
  `history.replaceState` para mantê-lo montado **foi tentado e não serve no Next 16**: a resposta da Server Action
  (que revalida a lista) remonta o editor no meio do trabalho. **Enquanto o primeiro Salvar roda**, o editor
  (barra e painéis) fica `inert` e o botão diz "Salvando...", então nada é digitado e perdido nesse intervalo
  (`travado` em `EditorAnuncioML`; só anúncio novo na página, o pop-up e o anúncio já salvo não travam).
- **Anúncio `PUBLICADO` abre só para leitura** (barra e painéis `inert`, Salvar desabilitado com o motivo no
  `title` e em texto no rodapé; vale na página e no pop-up). Como a barra de abas também fica `inert`, só a aba Geral
  é visível: se o dono quiser ler as outras abas, deixar a barra livre e travar só os painéis.

**Frases fixas** (`mercado-livre/configuracoes`): uma por linha, **até 10, de até 200 caracteres**; linha vazia sai
e repetida vira uma. As regras moram em `frases.js` (sem imports), lido pela tela e pelo servidor: copiá-las faria o
aviso e a recusa divergirem. A descrição final é a do rascunho, uma linha em branco e as frases.

**Versículo no anúncio: ideia descartada pelo dono em 03/10/2026; não há lista, tabela nem tela.** A migration
`20261001_canais_de_venda_ml` chegou a criar `Versiculo` e `ConfigCanal.versiculosUsados`; a
`20261003_remover_versiculos` os apagou (tabela em 0 linhas). Não reconstruir.

**Testes:** `npm run teste:anuncios-ml` (`scripts/teste-anuncios-ml.js`), Postgres, SEM rede. Um `try/finally` com
um bloco `{ ... }` por assunto, cada um começando em `await limpar()` (apaga produtos `ZZ-ML-*`); a linha
`ConfigCanal` real é guardada e restaurada. Bloco novo entra antes do comentário-marcador, antes do `finally`.

**Em aberto / fases 2 e 3**
- **Excluir um produto apaga em silêncio os rascunhos de ML dele, os de kit incluídos** (`Anuncio.produto` é
  `onDelete: Cascade`; `excluirProduto` só barra anúncio `PUBLICADO`), e o pop-up de exclusão da lista de Produtos
  não menciona isso. Decidir na fase 3 se o pop-up avisa (e lista os anúncios) antes de apagar.
- Investigação de leitura (03/10/2026, só GETs): `docs/superpowers/investigacoes/2026-10-01-ml-bling-para-fases-2-e-3.md`.
  Ela diz o que muda nos planos seguintes e lista **as decisões que dependem do dono** (validador do ML, criar o kit
  no Bling, logística do cálculo, o sufixo `z`, preço e medidas do kit, primeiro teste de escrita).
- O que a fase 1 deixou para a fase 2 (categoria só digitada, ficha só com `BRAND`/`MODEL`/`GTIN`, margem sem as
  taxas do ML) está feito: ver a seção seguinte.
- **Para carregar adiante:** (1) `gerarSku` (`src/app/produtos/acoes.js`) só lê `Produto.sku` e pode entregar um
  25xxxx já usado como código de kit; resolver antes de criar kit no Bling. (2) Gravar o vínculo com o Bling e a
  `etapa` tem que ser **atômico**: `salvarRascunhoML` lê e grava `dados` sem trava. (3) O vínculo do kit sobrevive a
  edição de itens com o mesmo código: a conferência no Bling deve comparar a composição (id + quantidade), não só o
  código. (4) `listarAnunciosML` carrega todos os anúncios ML em memória; com os 1.007 reais, filtrar e paginar no banco.

## Canais de Venda: Mercado Livre (fase 2, inteligência do ML)

Pedido do dono em 08/10/2026; plano: `docs/superpowers/plans/2026-10-08-canais-de-venda-ml-fase-2.md` (executado
inline na `main`). **Só leitura no Mercado Livre**: nada é publicado nem validado por POST, e as travas seguem `false`.
Conferido no navegador com dados reais (100101, `MLB99779`): o `LogIntegracao` só teve GET para o ML, mais o
`POST /oauth/token` da renovação do token que o conector sempre faz.

**Onde mora cada parte** (`src/lib/canaisDeVenda/ml/`, salvo onde dito)
- `cliente.js`: `clienteML()` = `{ get: mlGet, usuarioId: obterUsuarioId }`. **Toda leitura recebe o cliente por
  parâmetro** (molde do `clienteBling()`), e o teste passa o ML falso **`scripts/lib/mlFalso.js`** (sem rede, não
  importa nada de `src/`, caminho desconhecido LANÇA). `obterUsuarioId` (em `integracoes/mercadolivre.js`) guarda o id
  em memória e **não regrava a conexão**: o refresh token é de uso único e poderia voltar um já queimado.
- `leitura.js` (só GET): `descobrirCategoria` (`domain_discovery`), `lerCategoria` (`null` em 404; `folha`,
  `limiteTitulo`, `maxFotos`), `lerCategoriaCompleta` (com os atributos já normalizados), `lerTaxas` (`listing_prices`
  **sempre** com `logistic_type` e `shipping_mode=me2`), `lerFreteDoVendedor` (`shipping_options/free`, medidas em
  inteiros; `null` sem as quatro medidas, sem chamar o ML), `lerTendencias` (cache de 6 h em memória; 404 = lista
  vazia), `lerCustosDoAnuncio`, `precoPorMargemNoML` (recalcula, relê as taxas no preço novo e repete até 4 voltas,
  porque a tarifa fixa some acima do limite de frete grátis) e `textoDoErroML`.
- `atributos.js` (puro, sem imports): normaliza `/categories/{id}/attributes` (obrigatórios, depois o GTIN condicional,
  depois o resto; `read_only` e ocultos saem, menos `EMPTY_GTIN_REASON`), `motivoSemGtin` (acha "kit ou pack" / "não tem
  código" **pelo nome**, nunca por id fixo), `valorDeLista` (sem caixa e sem acento), `problemasDosAtributos`,
  `limparAtributosDaIA` e `montarPedidoDaFicha`. **GTIN e o motivo ficam fora da IA**: código de barras não se deduz.
- `custos.js` (puro): `custosDoAnuncio`, `precoPorMargem` (arredonda **para cima** ao centavo; `null` sem custo ou
  quando as porcentagens passam de 100%), `custosValem` (preço, categoria, tipo e logística iguais aos lidos) e
  `freteQueConta` (o frete do vendedor **só conta com frete grátis ligado**).
- `inteligencia.js`: `sugerirCategoria`, `sugerirTitulos`, `preencherFicha`, com o ML e a IA por parâmetro.
- IA em `src/lib/ia/`: `categoriaML.js`, `tituloML.js`, `fichaML.js` e `pesquisaML.js` (`chamarComPesquisa`, com a
  ferramenta `web_search_20260209` e **sem** `output_config.format`: as citações da pesquisa não combinam com ele, então
  o JSON vem no fim do texto e `jsonDoTexto` o acha; trata `pause_turn`). Usam o modelo e o registro de
  `src/lib/ia/anuncio.js`, reexportados no fim dele (`chamarIA`, `MODELO_IA`, `registrarIA`...).
- Ações (`src/app/canais-de-venda/mercado-livre/acoes.js`): `lerCategoriaML`, `sugerirCategoriaML`,
  `sugerirTitulosML`, `preencherFichaML`, `lerCustosML`, `precoPorMargemML`. Todas conferem Conferido no servidor e
  não revalidam. Não rodam no teste de Node (`next/cache`): a orquestração delas é testada em `inteligencia.js`.
- Tela: `SugestaoDeCategoria`, `SugestaoDeTitulo` (aba Geral), `CampoDeAtributo` e `SugestaoDeFicha` (Ficha técnica),
  `CustosDoML` e `CalculadoraDeMargem` (Preço e estoque; a calculadora abre num painel, porque a `ListaFlutuante` é
  interna do `FormularioProduto`), select de logística na aba Envio.

**Decisões**
- **A IA nunca inventa código de categoria**: escolhe entre as candidatas do `domain_discovery` ou devolve termos de
  busca que voltam ao ML. Toda sugestão (categoria, título, ficha) só entra com clique do dono.
- **Validador do ML (`POST /items/validate`) e `POST .../attributes/conditional` ficaram fora** (o dono escolheu em
  08/10/2026): a validação é local (categoria final, limite de título da categoria, obrigatórios, lista, GTIN ou
  motivo, fotos até `max_pictures_per_item`, aviso de arredondamento das medidas).
- **A categoria lida (`contexto.categoria`) e os custos (`contexto.custosML`) vivem no estado do editor, não no banco.**
  O editor relê a categoria 400 ms depois da última tecla no código. O rascunho ganhou só `categoriaNome` e
  `envio.logistica` (padrão `xd_drop_off`, com padrão no zod e no `carregarAnuncioML` para rascunhos da fase 1). Sem
  migration.
- **O motivo de "sem GTIN" (`EMPTY_GTIN_REASON`) é do estado**: sai junto com o GTIN ao ligar ou desligar o kit (a
  ficha põe "kit ou pack" de novo no kit), e o payload não o manda quando há GTIN. Limite de atributos no zod: 150.
- **Payload**: `SELLER_PACKAGE_HEIGHT/WIDTH/LENGTH` em cm arredondados **para cima** e `SELLER_PACKAGE_WEIGHT` em
  gramas, só com as quatro medidas, e `shipping.logistic_type`.
- A cor do lucro com as taxas do ML usa a mesma regra do Produto (vermelho com prejuízo, amarelo abaixo de 60%, verde a
  partir de 60%), mas sobre a margem **já com** as taxas; o `corDaMargem` ignoraria as taxas.

**Armadilha vista aqui:** o ESLint do projeto **não tem `no-undef`**: um import que faltou passou no lint e só quebrou
no navegador. Conferir a tela depois de mexer em componente.

## Canais de Venda: Mercado Livre (fase 3, publicar)

Pedido do dono em 08/10/2026; plano: `docs/superpowers/plans/2026-10-08-canais-de-venda-ml-fase-3.md` (executado inline
na `main`). **O Publicar está pronto e NUNCA foi usado de verdade**: `ML_PUBLICACAO` e `BLING_ESCRITA` seguem `false`, e
tudo foi testado contra o ML falso e o Bling falso. Conferido no navegador (100101, rascunho de teste apagado depois): a
janela mostra o resumo com leituras reais e o "Publicar no Mercado Livre" volta "Escrita bloqueada: ML_PUBLICACAO está
false", sem nenhuma escrita no `LogIntegracao`.

**Decisões do dono (08/10/2026):** o "Título" do editor vai como `family_name` (o ML não aceita `title` no modelo User
Products; o campo family_name separado saiu da tela); o validador do ML entra (etapa do Publicar e botão "Validar no ML"
na Prévia); **kit pelos dois caminhos**: (a) anúncio de um Produto com composição do cadastro publica como anúncio simples
dele, e a pré-checagem exige que ele seja kit (`formato "E"`) no Bling; (b) anúncio com composição montada no editor:
cada item Conferido, com `blingId` e produto simples no Bling, e o Rise **garante o kit no Bling** (reaproveita se as
peças e quantidades forem iguais, recusa se forem outras, cria `formato "E"`/estoque virtual se o código está livre).

**Etapas** (`ml/etapas.js`), cada uma gravada em `Anuncio.dados.publicacao.feitas` ao terminar: fotos → validar
(`POST /items/validate`) → criar pausado com preço (`POST /items`) → pausar (só se o ML criou ativo) → descrição (`POST
/items/{id}/description`) → kit no Bling (só composição) → vínculo no Bling (`POST /produtos/lojas`, loja `203593931`,
`codigo` = MLB, `preco` = do anúncio; reaproveitado quando já existe) → registrar o anúncio no Bling (`POST /anuncios`, um por MLB;
fase 3b, 08/10/2026) → ativar (`PUT /items/{id}`) → gravar (`PUBLICADO`, `situacaoCanal`, `idExterno`,
`urlExterna`, `publicadoEm`). A ordem real difere da spec §7 (fotos antes, preço na criação, descrição por POST): é o que
a documentação do ML diz hoje.

**Onde mora:** `ml/publicar.js` (`prepararPublicacaoML`, só leitura, e `publicarAnuncioML`/`validarNoML`), `ml/bling.js`
(`vinculoNoBlingML`, `vincularNoBlingML`, `conferirKitNoBling`, `criarKitNoBling`, `corpoDoKitDoAnuncio`),
`ml/respostas.js` (corpo da criação e as causas de recusa do ML), `ml/etapas.js`, `ml/banco.js` (`lerPublicacao`,
`gravarPublicacao`). Conector: `mlPost`, `mlPut`, `mlUpload` (multipart; `requisitar` aceita `FormData`), todos com
uma tentativa só. Tela: `JanelaPublicarML.jsx`, o rodapé do `EditorAnuncioML` e o "Validar no ML" da `AbaPrevia`.

**Regras que custaram pensar:**
- **As duas travas antes da primeira escrita** (`ml.exigirEscrita` e `bling.exigirEscrita` do código do anúncio): a
  recusa não deixa meia publicação. O ML falso e o Bling falso **lançam** quando alguém escreve sem ter chamado
  `exigirEscrita` antes.
- **Escrita nunca repete sozinha.** Criação sem resposta certa (rede, HTTP 5xx) marca a publicação como `incerta`;
  "Retomar" recusa até o dono conferir no ML e escolher **Criar de novo**.
- **Retomar continua da etapa que falhou:** o item não é recriado, as fotos já subidas não sobem de novo, a descrição
  e o vínculo não duplicam. Sem item criado, fotos e validação rodam de novo a cada volta (o rascunho pode ter mudado).
- **Kit que falha no Bling** deixa o anúncio `PUBLICANDO`, pausado no ML, com o rótulo "Aguardando o Bling" e o botão
  **Verificar no Bling** (repete a partir do kit). O anúncio nunca é ativado sem o vínculo no Bling.
- **Editor travado** durante a publicação e depois que o item existe no ML (o servidor recusa o Salvar com
  `PUBLICANDO` ou com `publicacao.itemId`). As gravações de `dados` (publicação e Salvar) são feitas com
  `SELECT ... FOR UPDATE`, e uma publicação por anúncio por vez neste processo (`emAndamento`).
- **`gerarSku` pula os códigos de kit dos anúncios** (o Rise vai criá-los no Bling).
- A pré-checagem relê a categoria no ML e valida no servidor; categoria que não pode ser lida **recusa** (na tela é só
  alerta).

**Primeiro Publicar real (08/10/2026, com o dono acompanhando):** 100101 como Premium, R$ 999,00, estoque 1, travas
abertas só no processo de um script (`ML_PUBLICACAO=true ML_PUBLICACAO_CODIGOS=100101 BLING_ESCRITA=true
BLING_ESCRITA_CODIGOS=100101`; o script recusava qualquer outra lista), `.env` intocado. Criou o **MLB7770989588**, que
o dono mandou **encerrar** logo depois do teste (encerrado; no Rise fica `ERRO`/`ENCERRADA`). O que foi medido:
- **O validador recusou `shipping.dimensions` com decimais** ("Dimensions do not follow the pattern 20x30x40,50") e
  avisou "User has not mode me1". Corrigido: no ME2 o campo não vai (as medidas vão nos `SELLER_PACKAGE_*`); no ME1,
  só inteiros.
- **O validador responde 400 "Validation error" mesmo quando todas as causas são `warning`** ("User has not mode me1",
  "Mandatory free shipping added"). Corrigido: 400 só com avisos não bloqueia; o `POST /items` decide.
- **O `POST /items` NÃO respeitou `status: "paused"`**: a etapa "pausar" teve de pausar o item logo depois (ele ficou
  ativo por ~0,5 s). Fica a etapa; o anúncio só é ativado depois do vínculo.
- **Título gerado pelo ML = o `family_name` em "Title Case"** ("Placa Compativel Arduino Uno R3 Smd Ch340 Com Cabo
  Usb"). Frete grátis ligado sozinho (obrigatório nesse preço). Novo `user_product_id` (MLBU5399328107), 7 fotos,
  `good_quality_thumbnail`.
- **O Bling aceita UM vínculo por produto em cada loja**: o segundo deu 400 "Para esta loja já existe um produto loja
  vinculado ao produto informado" (o 100101 já tem o MLB4165084257). O anúncio ficou pausado, sem vínculo, e foi
  encerrado. Corrigido: a pré-checagem recusa o produto que já tem outro anúncio ligado na loja do ML, antes de criar
  qualquer coisa. **Em aberto (decisão do dono): como ter Clássico e Premium do mesmo produto com o estoque no Bling.**
- **O token do Bling foi invalidado no meio do teste** (17:33, com o Rise achando que valia até 21:56); o dono
  reconectou. Suspeita: outro processo (a VPS do ensaio?) renovou o token com a mesma conta.
- O teste do `FormData` gravava um registro falso de envio de foto no `LogIntegracao` a cada rodada (33 em 08/10/2026,
  apagados); hoje ele usa um endereço `teste-rise.invalid` e apaga o registro.

**Segundo teste real, o fluxo inteiro (08/10/2026, com o dono):** ZZ-TESTE-BLING (com uma foto copiada do 100101),
Clássico, R$ 999,00, estoque 1 → **MLB7771172470**: fotos, validador, criação, pausa, descrição, **vínculo no Bling**
(`POST /produtos/lojas` 201: `codigo` MLB7771172470, preço 999, loja 203593931), ativação e gravação, tudo certo.
- **O ML recusou a descrição com `<b>tag</b>`** ("The description must be in plain text", nas posições das
  etiquetas). Corrigido: `montarDescricaoML` tira o que tem forma de etiqueta HTML (mantém "<5V", "< 3,3 V").
- Depois de ativado, **o ML pôs o anúncio em revisão** (`under_review`, `waiting_for_patch`): moderação, provavelmente
  por ser "produto de teste" com a foto de outro produto. O Rise gravou "Ativa" pela resposta do `PUT`.
- **Encerrar um anúncio em revisão devolve `inactive`, não `closed`.** No Rise ele ficou `PUBLICADO`/`ENCERRADA`. O
  vínculo dele no Bling (id 1024857128) continua lá: o dono remove no Bling se quiser.
- `situacaoDoItem` não conhece `under_review` nem `inactive` (viram `DESCONHECIDA`): fica para a tela de gerenciar.

**Vários anúncios do mesmo produto (decisão do dono em 08/10/2026):** Clássico, Premium etc., todos do mesmo produto,
com o estoque controlado pelo Bling. **O Bling aceita isso, por outro recurso:** o vínculo produto-loja
(`/produtos/lojas`) é um por produto, mas os **anúncios** são `/anuncios` (tag "Anúncios" da API v3), um por MLB, e é
essa a lista "Anúncios já exportados" da tela de produto do Bling ("Vincular estoques dos anúncios"). Medido em
08/10/2026 (ZZ-TESTE-BLING, MLB7771172470):
- `GET /anuncios?tipoIntegracao=MercadoLivre&idLoja=203593931&idProduto=<id>` lista `{ id, titulo, situacao, anuncioLoja:
  { id: "MLB..." }, preco }`; `situacao` 1 Publicado, 2 Rascunho, 3 Com problema, 4 Pausado. O vínculo `/produtos/lojas`
  sozinho **não** registra anúncio (a lista veio vazia com o vínculo já criado).
- `POST /anuncios` com `{ produto: { id }, integracao: { tipo: "MercadoLivre" }, loja: { id: 203593931 }, anuncioLoja: { id:
  "MLB..." } }` → 201 `{ data: { id } }`: **só registra, não mexe no anúncio do ML** (`last_updated` igual). Nasce com
  título vazio, preço 0 e situação 2; `PUT /anuncios/{id}` com `nome`, `preco.valor` e `mercadoLivre.modalidade` → 204
  completa o registro. A situação continuou 2 (o MLB de teste está inativo no ML; o do 100101, ativo, mostra 1):
  **presunção**: a situação espelha o ML. `/anuncios/{id}/publicar` e `/pausar` não foram chamados (podem agir no ML).
- Registro de teste criado no Bling: anúncio id **64439359** (ZZ-TESTE-BLING ↔ MLB7771172470); fica até o dono apagar.
- Consequência (fase 3b, feita em 08/10/2026): a recusa "um só anúncio por produto" da pré-checagem saiu; o Publicar
  ganhou a etapa **`registrar_bling`** (`POST /anuncios` com nome, preço e modalidade; `PUT` só se a releitura voltar
  sem título ou preço) e o vínculo produto-loja é reaproveitado quando já existe (com qualquer MLB).
- **Terceiro teste real (08/10/2026, 100101 Premium a R$ 999, estoque 1 → MLB7771491156):** fluxo inteiro ok como
  anúncio adicional: vínculo reaproveitado (o 907446191, do MLB4165084257, sem mudar), `POST /anuncios` → 201
  (id 64442771) **já com título, preço e modalidade** (o PUT não foi preciso), ativado; o Bling listou os dois
  anúncios do 100101, ambos situação 1. O ML pôs o anúncio novo no `user_product_id` MLBU5399328107 (o criado no
  primeiro teste, não o do MLB4165084257). Encerrado depois do teste, a pedido do dono (`closed` no ML); **logo depois
  do encerramento o Bling ainda mostrava o registro com situação 1**: a situação do Bling não acompanha o ML na hora.
  O registro 64442771 continua no Bling (o dono remove se quiser). **Confirmado pelo dono na tela do Bling:** o
  produto 100101 mostra "ML_4h · 2 anúncios" em "Anúncios já exportados" (MLB7771491156 Premium R$ 999 e
  MLB4165084257 Clássico), ou seja, o `POST /anuncios` do Rise é o mesmo cadastro da tela. O ZZ-TESTE-BLING, cujo
  anúncio ficou em Rascunho (MLB inativo, em revisão no ML), **não** mostra o ML_4h na tela, apesar do vínculo e do
  registro existirem na API: presunção, a tela só lista a loja com anúncio que não está em Rascunho. Não confirmado:
  se o Bling baixa o estoque pelo registro em `/anuncios` (só uma venda real mostra).

**Fora desta fase:** gerenciar anúncio publicado (editar, pausar, sincronizar preço/estoque), `hashConteudo`, aviso de
exclusão de produto com anúncios, listagem paginada no banco.

## Sincronização Rise <-> Bling (04 a 05/10/2026)

Pedido do dono em 04/10/2026: o Rise manda ao Bling os dados do produto (campos, fornecedores e ajustes de
estoque) e lê de lá o saldo, e a lista de Produtos ganha um **ícone** que diz se os dois lados estão iguais.
Spec: `docs/superpowers/specs/2026-10-04-sincronizacao-bling-design.md`; plano:
`docs/superpowers/plans/2026-10-04-sincronizacao-bling.md`; investigação da API (só leitura) e **resultados da
escrita real**: `docs/superpowers/specs/2026-10-04-sincronizacao-bling-investigacao.md`. **A escrita segue
travada** (`BLING_ESCRITA=false` no `.env`): só um produto de teste foi escrito no Bling de verdade (ver "Teste
real de 05/10/2026").

### O que o dono decidiu (04/10/2026)

- **O vínculo é só pelo código (SKU).** O alvo da escrita sai do código do próprio `Produto`, nunca de um id
  guardado (Emenda 11): um `blingId` velho não pode apontar a escrita para o produto errado.
- **A sincronização geral nunca envia código nem estoque.** O estoque vai só como **ajuste** (entrada, saída ou
  balanço, os mesmos movimentos da edição rápida da lista), e o código só vai no cadastro de um produto novo.
- **A descrição do Rise substitui a do Bling** (`descricaoCurta`, em HTML: texto escapado e quebra de linha
  como `<br>`).
- **Fornecedores por CNPJ, todos os vinculados.** Se o contato não existe no Bling, é criado lá. Contato
  achado **só por nome** é reaproveitado **somente se não tiver documento** (emenda 3b): na investigação, 578 dos
  603 contatos Fornecedor do Bling não têm CNPJ, e criar de novo duplicaria quase todos.
- **Ativo/inativo não é enviado.** Nem categoria, variações, campos personalizados, fotos e vídeo
  (ver "O que nunca entra no corpo"). A **composição do kit** passou a ir em 07/10/2026 (ver "Produto com
  composição (kit)").
- **A foto principal fica para quando o sistema estiver na VPS:** o Bling só aceita imagem por link público, e
  as fotos do Rise estão em disco local.
- **O estoque do Bling para o Rise só pelo botão manual** "Sincronizar estoque com Bling". O controle
  automático também fica para a VPS.
- **Conflito de estoque:** o estoque do Rise = saldo do Bling + ajustes pendentes do Rise. Os ajustes
  pendentes vão ao **depósito padrão** do Bling (ou o dono escolhe o depósito quando não há padrão).
- **Teste real com UM produto antes de qualquer produto real** (feito em 05/10/2026, abaixo).

### Onde mora cada parte

- **Lib** (`src/lib/blingSync/`): `campos.js` (campos de envio, normalização, assinatura, diferenças),
  `corpo.js` (corpo do `POST`/`PATCH`), `estoque.js` (`estoqueDoRise`), `estado.js` (o ícone; **só servidor**,
  importa `node:crypto`), `cliente.js` (o contrato `{get, post, put, patch, exigirEscrita}` e as travas),
  `leitura.js` (`lerParaPopup`), `envio.js` (`sincronizarProduto`, `cadastrarNoBling`, `enviarAjustesDeEstoque` e
  a trava por produto `umPorVez`), `saldos.js` (`sincronizarEstoqueDoBling`) e `apresentacao.js` (**puro**: o
  navegador pode importá-lo).
- **Tela:** `src/app/produtos/acoes-bling.js` (Server Actions finas), `src/components/produtos/IconeBling.jsx`,
  `JanelaBling.jsx` (o pop-up), `BotaoSincronizarEstoque.jsx`, e `LinhaProduto.jsx`/`TabelaProdutos.jsx`/`page.jsx`
  da lista.
- **Banco:** `Produto.blingSincronizadoEm`, `blingAssinatura` e `blingSaldo`; `MovimentoEstoque.enviadoAoBlingEm`
  (nulo = ajuste pendente); `BlingCopiaProduto` (o produto do Bling como estava antes de cada sobrescrita, os 3
  mais recentes por produto).
- **Teste:** `npm run teste:bling-sync` (`scripts/teste-bling-sync.js`), 685 asserções, **SEM rede**: o Bling
  falso (`scripts/lib/blingFalso.js`) tem o mesmo formato do cliente real e **recusa escrita sem um
  `exigirEscrita` antes**. Postgres local, só escreve produtos `ZZ-BS-*`.

### Estado guardado e o ícone

- **Cor e selo são independentes.** A **cor** diz se o produto já foi sincronizado alguma vez: **cinza = nunca**,
  **verde = já**. O **selo "!"** (era "?" até 06/10/2026, troca pedida pelo dono) aparece sobre qualquer das duas e diz que o Rise e o Bling podem estar
  diferentes, por um de dois motivos: `campos` (a assinatura dos campos mudou desde o último envio; só vale
  depois de sincronizado, porque produto nunca enviado não tem "campo que mudou") e `estoque` (há ajuste de
  estoque ainda não enviado). O texto acessível e o `title` vêm de `IconeBling.jsx`.
- **O ícone sai só do banco, sem chamar o Bling** (`iconeBlingDoProduto`). A assinatura é composta do mesmo jeito
  que o envio a grava (`normalizarDoRise` + `normalizarFornecedoresDoRise`), senão o produto recém-sincronizado
  apareceria como divergente. **A assinatura só avança quando todas as etapas do envio deram certo.** A ordem dos
  vínculos de fornecedor (padrão primeiro, depois a criação) tem que ser a mesma no envio e no ícone.
- **O pop-up** (`JanelaBling`) lê o Bling na hora, a cada abertura, e mostra campo a campo o que difere. O botão
  principal do rodapé muda com o estado: "Cadastrar no Bling" (o código não existe lá), "Sincronizar com o
  Bling", ou "Ler de novo" (erro de leitura). O bloco Estoque tem "Enviar ajustes de estoque" (e "Enviar ajustes
  neste deposito" quando é preciso escolher). **Com as travas fechadas os botões continuam na tela**, e ao
  clicar o motivo da recusa aparece em vermelho: nunca um botão que some sem dizer por quê.
- **`blingSaldo` é o saldo VIRTUAL do Bling** (o que desconta reservas, como o importador sempre leu) e **pode
  ser negativo**. O `estoque` do Rise é esse saldo mais os ajustes pendentes; saldo negativo no Bling deixa o
  `estoque` do Rise em 0 e guarda o negativo em `blingSaldo`.

### O que nunca entra no corpo (`corpo.js`)

Código (só o `POST` o leva, como identificador), situação, imagens e vídeo (`midia`), `fornecedor` (só se grava
por `/produtos/fornecedores`), `actionEstoque` (o valor `Z` **zera os saldos**), categoria, variações e
campos personalizados (a `estrutura` só vai para kit, ver "Produto com composição (kit)"). O envio é por **`PATCH`**, não `PUT`: a documentação do Bling diz que só os campos
informados mudam, e o `PUT` não diz o que faz com o campo omitido. Só vai o que **mudou**: cada grupo tocado
(`dimensoes`, `estoque`, `tributacao`) vai por inteiro, mesclado com o que o Bling já tem, e o grupo que ninguém
tocou não vai. **Campo vazio no Rise nunca apaga nada no Bling.**

### Travas de segurança

**Leia isto antes de ligar qualquer coisa.**

- **Duas travas, e as duas precisam deixar passar:** `BLING_ESCRITA` (a geral) e `BLING_ESCRITA_CODIGOS` (a
  lista de SKUs liberados, separados por vírgula, sem diferenciar caixa). `exigirTravaLiberada` barra todo verbo
  que não é `GET` (`POST`, `PUT` e `PATCH`).
- **LISTA VAZIA = TODOS OS CÓDIGOS LIBERADOS.** Variável ausente, **com o nome errado** ou só com vírgulas dá lista
  vazia, e com `BLING_ESCRITA=true` isso libera os ~1.314 produtos de uma vez, numa conta com estoque e anúncios
  reais. **Ao ligar a escrita para um teste, conferir ANTES, imprimindo
  `config.travas.blingCodigosLiberados`, que a lista é a esperada e não `[]`.**
- **As duas só são lidas UMA vez, na partida do processo** (`src/lib/integracoes/config.js`). Mudar o `.env` não
  vale para o servidor, o worker ou o script que já estão no ar: reiniciar. (O que também vale ao contrário:
  fechar a trava no `.env` não fecha um processo que já subiu aberto.)
- **O teste de escrita pode ser feito SEM editar o `.env`:** passar as duas variáveis na linha de comando do
  script, `BLING_ESCRITA=true BLING_ESCRITA_CODIGOS=ZZ-TESTE-BLING node <script>`. O `dotenv` **não sobrescreve**
  variável que já existe no ambiente, então as travas ficam abertas só naquele processo; o `.env` continua
  `BLING_ESCRITA=false` e os servidores, que leem as travas uma vez, continuam fechados. Foi assim em 05/10/2026,
  e o script se recusava a rodar se a lista não fosse exatamente `["ZZ-TESTE-BLING"]`.
- **A escrita nunca tenta de novo sozinha** (`tentativas: 1`): resposta que se perde não quer dizer que o Bling
  não recebeu, e repetir pode escrever duas vezes. A mensagem manda conferir antes de tentar de novo.
- **`exigirEscrita(codigo)` roda antes da primeira chamada de escrita**, para a recusa não deixar meia
  sincronização para trás.
- **Cópia de segurança antes de cada sobrescrita** (`BlingCopiaProduto`).
- **A trava por produto (`umPorVez`) só vale dentro de UM processo:** dois processos (o site e um script, por
  exemplo) não se enxergam.
- **Para liberar produtos reais** (decisão do dono): `BLING_ESCRITA=true` e a lista com os SKUs que ele quiser,
  de preferência poucos de cada vez. Lista vazia ou ausente libera todos.

### Teste real de 05/10/2026 (um produto, com ok do dono)

Medido contra o Bling de verdade, com as travas abertas só no ambiente de um script temporário (apagado depois).
O produto de teste é **`ZZ-TESTE-BLING`** (id no Bling 16715406765): criado no Rise com descrição contendo `<b>`,
`&`, quebra de linha e acentos, NCM 85011019, CEST 2806300, medidas, estoque mínimo e máximo e o fornecedor Fortek
(CNPJ 17.142.314/0001-21, contato que já existia no Bling, id 6674987146, achado por
`GET /contatos?numeroDocumento=17142314000121`). **Ele fica nos dois lados** (Rise e Bling): o dono apaga ou
inativa quando quiser, nada foi apagado no Bling.

- **Cadastrar:** `POST /produtos` → **201** `{data:{id, variations:null, warnings:[]}}`; depois
  `POST /produtos/fornecedores` → **201** `{data:{id}}`.
  - **O Bling reformata:** guardou o NCM como `8501.10.19` e o CEST como `28.063.00`, e a descrição como
    `Linha 1 com &lt;b&gt;tag&lt;/b&gt; &amp; e-comercial<br>Linha 2 ...` (o escape e o `<br>` foram preservados).
  - **Mesmo assim o pop-up logo depois mostrou ZERO diferenças** (a normalização iguala os formatos) e o ícone
    ficou **verde**.
  - **O Bling pôs uma categoria padrão** (`categoria.id` 962676) que o Rise não envia.
- **Sincronizar** (mudou só o preço no Rise): o ícone ganhou o selo `campos`; `PATCH /produtos/{id}` com o corpo
  `{"preco":15}` → **200**. Só o preço mudou no Bling (comparado o produto inteiro antes e depois): categoria,
  situação e o resto intactos. O ícone voltou a verde. Os fornecedores não foram reenviados (já vinculados,
  `enviados: 0`).
- **O `PATCH` de um grupo preserva os subcampos não enviados:** um `PATCH` cru `{"estoque":{"localizacao":"T-3"}}`
  (só no produto de teste) mudou apenas `estoque.localizacao`; `minimo`, `maximo` e `crossdocking` ficaram. A
  sincronização envia o grupo `estoque` completo mesclado com o do Bling, o que é redundante mas inofensivo.
- **Estoque:** `GET /depositos` devolveu 2 depósitos, um padrão (id 1423545090, o usado). `POST /estoques` →
  **201** `{data:{id}}` para `E` (entrada de 10), `S` (saída de 3) e `B` (balanço de 5).
  - **A entrada NÃO exige `preco`.**
  - Saldo no Bling: 0 → 7 → balanço 5. `saldoFisicoTotal` e `saldoVirtualTotal` ficaram **ambos em 5** (sem
    reservas, o virtual é o balanço).
  - O Rise ficou com `estoque` 7 (depois dos dois primeiros) e 5 (depois do balanço), `blingSaldo` igual e ícone
    verde. `sincronizarEstoqueDoBling` só desse produto: 1 atualizado.
- **Trava por código:** com a escrita ligada e a lista só com o código de teste, `sincronizarProduto`,
  `enviarAjustesDeEstoque` e `cadastrarNoBling` do produto **real 100103** foram **recusados** ("Escrita
  bloqueada: o codigo 100103 nao esta na lista de codigos liberados ... Nenhum dado foi enviado."), com **zero
  escritas** ao Bling.
- **Contato:** o contato do fornecedor já existia, então a criação de contato (`POST /contatos`) **não foi
  exercitada** na API real. Continua testada só contra o Bling falso.

### O botão "Sincronizar estoque com Bling" (05/10/2026, com ok do dono e backup antes)

Lê o saldo de **todos** os produtos do Rise no Bling (só leitura, em lotes de 100 códigos) e grava em cada um o
`blingSaldo` e o `estoque` recalculado. Nada é escrito no Bling, e **nada roda sozinho**: o botão avisa, antes do
clique, o que vai acontecer. Roda no servidor, e a tela mostra sempre os dois números (atualizados e falhas).

- **Resultado na tela:** "1314 atualizados, 0 sem esse codigo no Bling".
- **No banco:** os 1.314 produtos ficaram com `blingSaldo`; **50 tiveram o `estoque` alterado** (soma +6.747; os
  serviços 9999xx foram de 10 para ~1.000, igual ao Bling); os **37 produtos com saldo NEGATIVO** no Bling ficaram
  com `estoque` 0 (e o `blingSaldo` negativo guardado). **Nenhum `MovimentoEstoque` foi criado.**
- **O servidor da porta 3000 pertence a outra sessão, e as Server Actions do Next rodam uma por vez:** um pop-up
  aberto durante o botão espera a leitura em massa terminar.

### Segundo teste real (06/10/2026, só no `ZZ-TESTE-BLING`)

Mesmo esquema (travas abertas só no ambiente do script, `.env` intocado):

- **Grupo fiscal e medidas:** percentual de tributos (vazio → 12,5), tipo SPED (vazio → `00`) e altura (2 → 2,5)
  mudados no Rise; um `PATCH` → **200** com `dimensoes` e `tributacao` inteiros (mesclados com o Bling, inclusive
  `grupoProduto: {id: 0}`, NCM e CEST no formato do Bling). No Bling mudaram **só** esses 3 campos.
- **Fornecedor achado PELO NOME (o caso comum):** os fornecedores do Rise quase nunca têm o CNPJ no Bling
  (Circuitronix, Metaltex e Unitel existem lá só pelo nome, sem documento; a Metaltex tem 2 contatos com o mesmo
  nome). Com a Unitel: busca por CNPJ vazia → `pesquisa=Unitel&criterio=1` → `GET /contatos/{id}` confirmou o tipo
  Fornecedor → **reaproveitado sem escrever nele**, e só o vínculo foi criado (`POST /produtos/fornecedores` 201).
- **Fornecedor SEM contato no Bling:** `POST /contatos` → **201** com `{nome, situacao: "A", tipo: "J",
  numeroDocumento: <14 dígitos>, tiposContato: [{id}]}`; o Bling guardou como Fornecedor, a busca por CNPJ só com
  dígitos o acha, e a segunda sincronização não fez **nenhuma** escrita. O contato de teste é **"ZZ Teste
  Fornecedor Rise"** (id 18435727818, CNPJ de exemplo 11.222.333/0001-81): fica no Bling até o dono apagar.
- **Alterar um vínculo:** custo e descrição mudados no Rise → `PUT /produtos/fornecedores/{id}` → **200** (com as
  chaves extras da listagem, `precoCompra` incluído); só aquele vínculo mudou.

### O que continua SEM medida na API real

- `GET /contatos?pesquisa=` com acentos, páginas e situação E/I (o nome simples foi medido).
- Saída maior que o saldo (físico negativo).
- O campo exato do `400` "nenhum produto foi informado" de `GET /estoques/saldos` (se `description`, `message` ou
  `fields[].msg`).
- **O vídeo (`midia.video`) segue FORA do envio (Emenda 2).** Enviar vídeo obriga a mandar `midia.imagens`, e o
  produto de teste não tem fotos, então não dá para provar que isso preserva as fotos do Bling. Só entra com um
  teste que prove.

### Limitações e pendências conhecidas

- **PENDÊNCIA REGISTRADA: estoque automático e foto principal quando o sistema estiver na VPS.** A **foto
  principal** depende de uma URL pública (as fotos moram em `dados/produtos/`, sem rota pública), e o **controle
  automático do estoque** (hoje só o botão manual) também espera a VPS. Até lá: foto só pelo Bling, estoque só
  pelo botão e pelos ajustes enviados.
- **"N campos iguais" no pop-up não expande:** `lerParaPopup` só devolve a contagem.
- **O "Cadastrar no Bling" do pop-up NÃO cria o `Anuncio` BLING com `idExterno`** (a importação cria). As telas de
  Anúncios podem oferecer "Cadastrar no Bling" de novo para um produto cadastrado assim.
- **Revisão final (05/10/2026), corrigido:** o cadastro procura o código também entre os **inativos**
  (`GET /produtos?codigos[]=<sku>&criterio=3`, medido: devolve só inativos) e recusa se achar, então o produto
  inativo **sem** `blingId` guardado não é mais duplicado; a busca por código que volta 200 **sem lista** falha
  fechada (não vira "não existe", que abriria o cadastro); e as buscas de contato vão com `criterio=1` (todos; o
  padrão `3` é "últimos incluídos") e **contato excluído (`situacao` "E") nunca recebe vínculo**. A busca
  `pesquisa=` pelo nome foi medida: acha o contato da Fortek com o padrão e com `criterio=1`.
- **Janela de milissegundos** entre o `POST` de estoque aceito e a marca `enviadoAoBlingEm`: um "Sincronizar
  estoque" no mesmo instante pode contar o ajuste em dobro no número LOCAL do Rise até o próximo clique (o Bling
  fica certo).
- **CNPJ alfanumérico** (o novo formato de 2026) não é tratado pela busca por CNPJ.

## Produto com composição (kit) (07/10/2026)

Pedido do dono em 07/10/2026: o Rise ganha produto do tipo **"Com composição"** (kit), feito de outros produtos do
Rise em quantidades, criado e editado no cadastro, importado do Bling com as peças e **exportado para o Bling com a
composição**. Até ali o kit só existia no anúncio do Mercado Livre (`dados.composicao` do rascunho, que continua
separado). Spec: `docs/superpowers/specs/2026-10-07-produto-com-composicao-design.md`; plano (9 tarefas, executado
inline): `docs/superpowers/plans/2026-10-07-produto-com-composicao.md`.

### O que o dono decidiu

- **Peça = produto já cadastrado no Rise, simples, Conferido e vinculado ao Bling** (`blingId`). Kit dentro de kit e
  variação ficam fora.
- **Estoque do kit calculado pelas peças** (o menor ⌊estoque da peça ÷ quantidade⌋; peça negativa conta 0), a mesma
  conta do estoque virtual do Bling.
- **Peso somado; medidas sugeridas e editáveis** (maior comprimento, maior largura, alturas somadas).
- **O kit criado no Rise vai ao Bling com a composição.**
- **Campo Tipo** (Simples / Com composição): desde 10/10/2026 **só em produto novo ou clonado**, embaixo da Unidade
  (ver "Ajustes de 10/10/2026").

### Onde mora cada parte

- **Banco** (migration `20261007_produto_composicao`, só aditiva): `enum TipoProduto`, `Produto.tipo` (padrão
  `SIMPLES`) e `ProdutoComponente` (`kitId` Cascade, `componenteId` **Restrict**, `quantidade`, `ordem`,
  `@@unique([kitId, componenteId])`).
- **Regras puras** (`src/lib/composicao.js`, sem imports): `estoqueDoKit`, `totaisDoKit`, `pesoEMedidasDoKit`,
  `ncmsDasPecas`, `validarComposicao` (lista não vazia, quantidade inteira 1..9999, total ≥ 2, sem repetir, sem o
  próprio produto).
- **Banco do kit** (`src/lib/composicaoBanco.js`): `lerPecasDoKit`, `pecasPermitidas`, `gravarComposicao` (troca a
  lista inteira e grava o estoque calculado), `recalcularKitsDasPecas`, `kitsQueUsam`, `prepararComposicaoDoCadastro`
  e `gravarComposicaoDoCadastro` (o Salvar do cadastro), `pecasParaKit` (busca da aba) e `pecaParaTela` (a peça num
  formato só, com preço, custo, peso, NCM e fornecedor padrão).
- **Tela:** `Composicao.jsx` (aba Composição: Componente, Código, Qtde, lixeira e "Adicionar outro item") e
  `AbasDoKit.jsx` (`FornecedoresDoKit` e `MedidasDoKit`), ligados em `FormularioProduto.jsx`.
- **Teste:** `npm run teste:composicao` (111) e o bloco "Composicao (kit)" do `teste:bling-sync`.

### Regras que custaram pensar

- **O estoque do kit é GRAVADO em `Produto.estoque` já calculado**, porque a lista, a foto mensal e a sincronização
  leem a coluna. É recalculado ao salvar o kit, na edição rápida de estoque de uma peça (na MESMA transação, para todo
  kit que a usa), no "Sincronizar estoque com Bling" (depois de gravar as peças; o kit guarda só o `blingSaldo`) e na
  importação. O recálculo grava por **SQL cru**, para o `atualizadoEm` do kit não subir (a lista ordena por ele e o
  envio ao Bling o usa para saber se o produto foi editado durante o envio).
- **Ajuste rápido de estoque num kit é recusado** ("calculado pelas peças"), e a célula da lista não abre o popup.
- **Peça usada em kit não é excluída**: `excluirProduto` recusa dizendo os kits, e o `Restrict` do banco é a última
  defesa. Apagar o kit leva as linhas de composição, não as peças.
- **Salvar:** a composição é conferida ANTES de gravar e gravada na mesma transação do produto. Formulário sem o campo
  `tipo` (aberto antes dele existir) mantém o tipo gravado: um padrão "SIMPLES" apagaria as peças de um kit sem
  ninguém pedir. Produto que é peça de algum kit não vira kit. Trocar um kit para Simples pede confirmação na tela e
  apaga as peças no Salvar (desde 10/10/2026 só no produto novo ou clonado: o salvo não mostra o Tipo).
- **Busca de peças:** só entra simples, Conferido e com `blingId`. Desde 10/10/2026 a lista mostra aptos e não aptos
  juntos (até 20 e 10), em ordem de código: o apto com o selo "Apto", o não apto cinza, sem clique, com TUDO o que falta
  ("Falta: validar no Rise · integrar com o Bling", ou "É um kit, não pode ser peça"; `faltasParaSerPeca`) e o link
  "Abrir". Antes os barrados só vinham quando nenhum era apto, e com o primeiro motivo.
- **Aba Fornecedores do kit é só leitura:** o fornecedor padrão de cada peça e, na falta dele, o **rascunho do Bling**
  (`fornecedorRascunho`, marcado "rascunho do Bling"; as peças importadas só têm ele). Custo total e venda total
  (valor × quantidade) ficam **incompletos**, nunca soma parcial, quando falta o valor de uma peça. A margem do
  "Preço venda" do kit usa o custo total. A tabela editável fica montada e escondida: vínculos que o kit já tinha
  continuam no envio (no produto novo ou clonado que VIRA kit ela é limpa; ver "Ajustes de 10/10/2026").
- **Peso e dimensões:** trocar as peças preenche o peso sempre e as medidas só no campo vazio ou que ainda tinha a
  sugestão anterior; **abrir o kit não muda nada gravado**. O quadro por peça mostra "sem dado" e o total diz
  "incompleto". O botão "Usar a sugestão nos campos" saiu em 10/10/2026.
- **NCM:** os NCMs das peças entram na lista do campo (cada um uma vez, com os SKUs que o usam).
- **Janela "Criar descrição" (vale para TODO produto):** usa só os fornecedores e concorrentes cadastrados na aba
  (salvos ou não) e os marcados na lupa. Até 07/10/2026 ela procurava o Nome no catálogo coletado inteiro e trazia
  concorrentes que não estavam na aba (o dono viu isso).
  - **Sem fornecedor nem concorrente, a janela funciona do mesmo jeito** (pedido do dono em 10/10/2026). A caixa da
    descrição fica aberta para digitar desde o início (é o mesmo `<textarea>` antes e depois da primeira tecla, para
    o cursor não sair dela), e o "Gerar com IA" fica liberado com o Nome preenchido. A IA recebe então os dados do
    próprio produto (`dadosDoProprioProduto`: Nome, Marca, Modelo e a descrição atual), com a regra
    `REGRA_SEM_REFERENCIAS` no pedido (fica no código, e não no prompt da biblioteca, para valer com qualquer
    prompt): especificação só a que estiver escrita nesses dados, nunca inventada. Peso e medidas da IA são
    ignorados nesse caso; valem só os do formulário. A janela avisa para conferir as especificações. A geração real
    sem referência ainda não foi vista (é paga): o primeiro uso é do dono.

### Ajustes de 10/10/2026 (18 pedidos do dono, aprovados um a um)

Plano: `docs/superpowers/plans/2026-10-10-kit-no-cadastro.md`. **Sem mudança no banco.** Conferido na tela com o
ZZ-TESTE-BLING como peça (os kits de teste foram apagados).

- **Topo do cadastro:** Unidade em cima e Tipo embaixo, ao lado da Situação; o **Tipo só aparece em produto novo ou
  clonado** (o salvo não vira kit nem volta a simples pela tela; o caminho para um kit novo é o Clonar). O link da Loja
  Integrada fica sempre na primeira coluna.
- **Virar kit** (`virarKit` em `FormularioProduto.jsx`): Unidade KIT; EAN, estoque mínimo e máximo, **fornecedores
  (a tabela escondida) e concorrentes** guardados e limpos (eram da peça: o Bling receberia o custo de uma peça como o
  do kit, e o selo de posição compararia o kit com a peça avulsa); todas as fotos passam a "não escolhida"; o preço e
  as medidas que vieram do clone contam como sugestão. **Voltar a Simples** (`voltarASimples`): Unidade UN, e tudo o
  que o kit limpou volta, inclusive código, preço, localização, peso e medidas que ainda tinham a sugestão do kit.
- **Produto de origem vira a primeira peça:** o do "Clonar" da lista e o do "Clonar a partir de um código" com
  produto do Rise (`origemId`), quantidade 1, se for apto (`pecaDeOrigemParaKit`). Senão, aviso âmbar na aba
  Composição: "O produto de origem 101010 não entrou no kit: falta validar no Rise." O "Clonar a partir de um código"
  copia o código da peça para o campo: ao virar kit ele conta como sugestão e é trocado pelo `{sku}_N`.
- **Sugestões nos campos** (`aplicarSugestoesDoKit`, regras em `textosDasSugestoes`): código `{sku}_{N}` com UMA peça e
  2+ unidades (milhar com ponto, como os kits do Bling: `codigoSugeridoDoKit`; com várias peças, vazio; só em produto
  novo); preço = venda total das peças (soma incompleta não sugere); medidas; localização. **O digitado nunca é
  apagado:** o campo só recebe a sugestão vazio ou com a última sugestão (`sugeridos`). A chave aplicada fica num ref
  (`ultimaChaveDasSugestoes`), e não numa "primeira passada": o modo estrito roda o efeito duas vezes, e abrir um kit
  não pode mudar o que está gravado.
- **Localização do kit** (`localizacaoDoKit`, regra revista na terceira rodada, abaixo): **automática e travada**, a das
  peças. Gravada pelo servidor no Salvar (`localizacaoDoKitNoSalvar`). **A peça que muda de lugar (ou de código) leva
  junto TODOS os kits que a usam** (`propagarLocalizacaoDaPeca`, SQL cru, sem mexer no `atualizadoEm` do kit): no Salvar da
  peça e na edição rápida da lista, na mesma transação. Kit gravado antes da regra fica com o texto antigo gravado até o
  próximo Salvar dele ou até uma peça mudar de lugar; a tela e a lista já mostram o texto novo (calculado das peças).
  Coluna Localização na tabela de peças.
- **Fotos das peças:** cada peça que ENTRA traz as fotos dela, todas sem check (`trazerFotosDaPeca`); a peça de origem
  já tem as fotos no painel (`daOrigem`) e não baixa de novo; peça que sai leva as fotos dela ainda sem check (as da
  origem ficam). Abrir um kit não traz nada. Teto do painel (150) com aviso.
- **Documentos das peças** (`DocumentosDasPecas` em `AbasDoKit.jsx`, `documentosDasPecas`): seção na aba Documentos
  técnicos, por peça, com baixar pelo nome real e, desde a segunda rodada, o "Anexar a este produto" (abaixo). O bloco
  "Documentos" da descrição da Loja Integrada do kit leva os do kit e os das peças, sem repetir nome
  (`documentosDoProduto`, só com `APP_URL_PUBLICA`).
- **Descrição:** as peças viram abas de referência na janela "Criar descrição" ("Peça ×5", ponto roxo, com a descrição
  do cadastro, especificações lidas dela e o link para a peça; `descricoesDasPecas`), e vão para a IA
  (`lerPecasParaDescricao` em `ia/anuncio.js`, como `<peca_do_kit>` com a quantidade). Os **"Itens inclusos" saem das
  peças**, com as quantidades, e não da IA. A geração real com peças ainda não foi vista (é paga).
- **Indicadores de estoque:** kits ficam fora do "Valor do estoque a custo" e da "Receita potencial" (o estoque deles é
  o das peças, que já estão na soma); a tela diz quantos ficaram de fora (`kitsFora`).
- **Mensagem do Salvar recusado some ao mexer no formulário** (`erroDispensado`); o próximo Salvar mostra a nova.
- **DEFEITO ACHADO E CORRIGIDO (vinha de antes):** depois de um Salvar recusado, o reset do React 19 devolve cada
  **lista** (`<select>`) ao valor de quando foi montada (mudar o `defaultValue` depois não muda isso), e uma lista
  controlada volta para a primeira opção. Um kit novo recusado (código vazio) voltava a Unidade para UN e o Tipo para
  Simples sem a tela mostrar, e o Salvar seguinte **gravava um produto simples, sem as peças**. Agora o Salvar recusado
  remonta os campos com o que foi enviado (`setVersao`, como o `aplicar`), e o Tipo é `defaultValue` + `key` (remonta a
  cada troca). Vale para as outras listas do formulário (Origem, Tipo de produção, Tipo do item).
  - **Ao testar a troca do Tipo por script ou pela ferramenta de formulário logo depois de reiniciar o servidor**, a
    troca pode não chegar ao estado: no modo de desenvolvimento a página demora a ligar o React na primeira abertura
    (compila tudo). Com a página carregada responde normal (conferido em 10/10/2026).

### Segunda rodada de 10/10/2026 (4 pedidos do dono)

- **"Anexar a este produto" só no kit**, ao lado de cada documento e certificado das PEÇAS (`anexarDocumentoDaPeca` em
  `acoes.js`): copia o arquivo para o lote do kit e ele entra como "a salvar"; só o Salvar grava. O que o kit já tem com
  o mesmo nome aparece como "Anexado". **Não existe nos documentos de fornecedor e concorrente** (decisão do dono: esses
  ele baixa e confere antes), nem no produto simples.
- **Salvar um produto NOVO volta para a lista** (`/produtos?novo=<id>`), como o existente já fazia. A lista ordena pelo
  último alterado, então ele vem no topo, com fundo verde que some sozinho (animação CSS `riseLinhaNova`, sem estado). O
  que não foi gravado (fotos, documentos, fornecedores, concorrentes) aparece num aviso no alto da lista
  (`TEXTO_DO_AVISO` em `produtos/page.jsx`); antes aparecia na tela do produto.
- **"!" no kit quando uma peça muda** (`mudancasDaPeca` em `composicao.js`, `retratoDaPeca` e `mudancasDosKits` em
  `composicaoBanco.js`; coluna `ProdutoComponente.retrato`, migration `20261010_kit_retrato_das_pecas`):
  - O retrato de cada peça é gravado em todo Salvar do kit (`gravarComposicao`): nome, md5 da descrição, preço de venda,
    peso, medidas, NCM, situação, Conferido, md5 e quantidade das fotos (só `papel: FOTO`) e nomes dos documentos.
    **Custo, estoque e localização ficam de fora** (decisão do dono).
  - Na lista, um "!" âmbar ao lado do ícone de conferido do kit, com a contagem no `title`. Ao abrir o kit, um quadro
    âmbar no topo lista o que mudou em cada peça ("Preço de venda: R$ 16,00 → R$ 17,00", "Descrição alterada",
    "Fotos: 3 → 4", "Documentos: novo X"). **Salvar o kit apaga o "!"**: não há botão "Marcar como revisado", porque
    toda mudança só vale no Salvar.
  - **A migration preencheu o retrato dos kits que já existiam**, então eles começam sem "!". O SQL repete o formato do
    `retratoDaPeca` (md5, fotos em `COLLATE "C"`, documentos em lista): **mudar um pede mudar o outro**, senão todo kit
    antigo acende o "!" sem nada ter mudado. O teste confere o md5 do código.
  - **Quebra de linha da descrição uniformizada em "\n" antes do md5** (no código e no SQL). O navegador manda o texto
    do `<textarea>` com "\r\n", e salvar a peça pelo formulário sem mexer na descrição acendia "Descrição alterada"
    (visto no teste de 10/10/2026). A migration foi corrigida antes de ir para a VPS; no PC, o registro dela em
    `_prisma_migrations` teve o `checksum` atualizado e o preenchimento foi refeito.
- **Toda mudança do produto só vale no Salvar, documentos inclusive** (pedido do dono em 10/10/2026). Fotos,
  fornecedores, concorrentes, composição e reserva já esperavam o Salvar; a exceção eram os documentos do produto JÁ
  EXISTENTE, que gravavam e apagavam na hora (`enviarArquivo`/`removerArquivo`, que o cadastro não usa mais).
  - `DocumentosDoProduto` (`FormularioProduto.jsx`) serve produto novo e existente: o gravado tem baixar e Excluir, que
    só RISCA ("excluído ao salvar", `documentosExcluidos`, com "Desfazer"); o enviado ou anexado entra no lote como "a
    salvar". Cancelar descarta tudo.
  - No Salvar do existente: `excluirDocumentosMarcados` (só documento ou certificado DESTE produto) e `gravarTemporarios`
    (agora com a ordem depois dos que já existem), **depois das fotos**: `moverTemporarios` apaga o lote inteiro no fim.
  - O "Enviar arquivo" espera as fotos do produto carregarem (`carregandoFotosDoProduto`): elas criam o lote, e um
    segundo lote, criado antes, ficaria órfão.
  - Continuam gravando na hora, por não serem dados do produto: o cadastro rápido de fornecedor e concorrente (o vínculo
    espera o Salvar), a biblioteca de prompts e as telas fora do cadastro (edição rápida da lista, Conferido, canais).

### Terceira rodada de 10/10/2026 (4 pedidos do dono)

- **Garantia (meses) sugerida em 3** (`garantiaInicial` em `FormularioProduto.jsx`): só no produto NOVO que **não veio
  de um clone**, e só no estado inicial (depois de um Salvar recusado o campo volta com o que foi enviado, e quem
  apagou os 3 não os vê de volta). **O clone traz a garantia do produto clonado, mesmo vazia** (o dono corrigiu isso no
  teste de 10/10/2026): vale para o "Clonar" da lista e para o "Clonar a partir de um código" com produto do Rise
  (`forcarOrigem` em `aplicar`, porque o `trazidos` ignora valor vazio e deixaria os 3 sugeridos); produto de
  fornecedor ou concorrente não tem garantia cadastrada e fica com os 3. **Produto já salvo com o campo vazio não
  muda**: o próximo Salvar gravaria 3 sem o dono ter escolhido.
- **Localização do kit com várias peças** (`localizacaoDoKit`): `100101(F9) / 101010(H2)`, na ordem da aba Composição;
  peça sem localização entra só com o código; **acima de 40 caracteres** (`LIMITE_DA_LOCALIZACAO`, o mesmo da edição
  rápida e uma margem para o Bling, cujo limite não foi medido) vira "Verificar a aba composição". Uma peça só continua
  sendo o lugar dela, sem o código. O campo é **travado** com 1 ou mais peças e **editável** sem nenhuma.
  - **Na lista:** a célula do kit (de uma ou de várias peças) **não tem lápis**, fica numa linha só (`max-w-44`, com
    reticências, sem expandir a coluna) e **abre o popup** `PopupPecasDoKit` (em `EdicaoRapida.jsx`) com código, peça
    (link para o cadastro), quantidade e localização de cada peça, só consulta. A página lê as peças dos kits da página
    numa consulta só e calcula o texto com a mesma regra do cadastro (não lê o gravado).
  - `gravarLocalizacao` (edição rápida) recusa **qualquer** kit ("A localização de um kit vem das peças dele"); `ehKit`
    substituiu `ehKitDeUmaPeca`.
- **Janelas só fecham com clique que COMEÇA e TERMINA no fundo** (`propsDoFundo` em `src/lib/fundoDaJanela.js`; ver
  "Padrões do projeto"): aplicado nos 22 fundos que fechavam por `target === currentTarget`, no detalhe do Mercados
  (que tinha o mesmo defeito por `stopPropagation`) e na busca por código do cadastro (que não fechava ao clicar fora).
  **Ficaram como estão**, de propósito: as camadas invisíveis dos menus, a barra lateral do celular, os visualizadores de
  foto (fecham com qualquer clique, por desenho) e os dois cadastros rápidos (fornecedor e concorrente), que são
  formulários grandes sem confirmação de saída e perderiam o que foi digitado.

### Bling

- **Importar** um kit (formato `E`) já grava as peças (`resolverPecasDoKit`: pelo `blingId` guardado ou pelo código);
  só entra se todas existem no Rise. `scripts/composicao-do-bling.js <código>` preenche as peças de um kit importado
  antes disso (rodado no 990204: 3 peças, estoque 9).
- **"Composição" é um campo da sincronização**, comparado como texto ("CÓDIGO xQTD; ..." por código, em maiúsculas).
  A `estrutura` do Bling só traz o id de cada peça: a leitura busca o código de cada uma (`GET /produtos/{id}`, até 20;
  peça que falha = erro de leitura, nunca "sem composição", senão um kit lido pela metade pareceria diferente).
- **A assinatura só leva a composição quando ela existe**: sem isso, todo produto simples já sincronizado acenderia o
  "!" sem nada ter mudado (há um teste contra a conta antiga).
- **Cadastrar um kit:** `POST /produtos` com `formato: "E"` e `estrutura: { tipoEstoque: "V", componentes: [{ produto:
  { id }, quantidade }] }`. **Sincronizar** com a composição diferente: `PATCH` com a `estrutura` inteira, mantendo o
  `tipoEstoque` que o Bling tinha.
- **Os ids das peças saem da busca por código FEITA NO ENVIO (Emenda 11)**, nunca do `blingId` guardado. Peça ausente,
  repetida ou que é kit no Bling recusa o envio inteiro antes de escrever.
- **Kit no Rise cujo código é produto SIMPLES no Bling: recusado, não convertido.** O produto do Bling tem estoque e
  anúncios próprios; virar kit pelo Rise é decisão que o dono faz no Bling.

### Teste real de 07/10/2026 (com OK do dono, só no produto de teste)

Travas abertas só no processo de um script temporário (`BLING_ESCRITA=true BLING_ESCRITA_CODIGOS=ZZ-TESTE-KIT`; o
script recusava qualquer outra lista), apagado depois.
- **Leitura do 990204** (`GET /produtos/16593700269`): `formato "E"`, `estrutura: { tipoEstoque: "V",
  lancamentoEstoque: "", componentes: [{ produto: { id }, quantidade: 1 }, ...] }`, quantidade numérica. Produto
  simples também traz `estrutura` (vazia: `tipoEstoque: ""`, `componentes: []`).
- **ZZ-TESTE-BLING foi marcado Conferido** no Rise (exigência para ser peça), e o **`ZZ-TESTE-KIT`** criado com ele ×2.
- **Cadastrar:** `POST` → 201, id **16716767841**. O Bling guardou `formato "E"`, a estrutura com a peça
  (16715406765) ×2 e calculou o saldo virtual **3** (6 ÷ 2), igual ao do Rise. O pop-up logo depois: só a Origem
  como "só no Bling" (o Bling põe 0 por padrão), nenhuma divergência.
- **Mudar para ×3 e Sincronizar:** `PATCH` só com a `estrutura` → 200. No Bling mudaram só a `estrutura` (×2 → ×3, o
  `tipoEstoque "V"` mantido) e o saldo calculado (3 → 2). O Rise ficou com estoque 2 e o pop-up sem divergência.
- **ZZ-TESTE-KIT fica no Bling e no Rise** até o dono apagar (junto do ZZ-TESTE-BLING, que agora é peça dele: no Rise
  o kit tem que sair antes da peça).
- **Pop-up real do 990204** (só leitura): "Nenhuma diferença: 19 campos iguais", composição incluída, saldo 9 nos dois.

### Pendências

- As peças do 990204 (120706, 120809, 120732) **não estão Conferidas** e só têm o fornecedor em rascunho do Bling: o
  backfill da importação não exigia isso. Ao salvar uma delas, o rascunho vira vínculo de verdade. A correia (120809)
  não tem peso nem medidas cadastrados, e a sugestão de peso/medidas do kit fica incompleta.
- Kit dentro de kit, variação e o anúncio de kit do ML (`dados.composicao`) continuam separados do produto kit.

## Canais de Venda: Loja Integrada (06 a 07/10/2026)

Pedido do dono em 06/10/2026: o Rise passa a ser a origem do **conteúdo** dos produtos da Loja Integrada (LI), na
mesma sequência do Bling e do Mercado Livre (ícone na lista, pop-up de diferenças, travas, teste com um produto, depois
liberar). A NF-e é emitida **pela própria LI**, então NCM e GTIN têm que chegar certos. Spec:
`docs/superpowers/specs/2026-10-06-loja-integrada-design.md`; plano: `docs/superpowers/plans/2026-10-06-loja-integrada.md`;
levantamento da API, da NF-e, do SEO e **das medições na loja real** (seção 8):
`docs/superpowers/investigacoes/2026-10-06-loja-integrada-levantamento.md`. **A escrita segue travada** (`LI_ESCRITA=false`).

### O que o dono decidiu (06/10/2026)

- **O Bling continua dono de ESTOQUE e PEDIDOS na LI** (canal `Loja_Integrada` 203478870, confirmado pelo dono).
  O Rise **nunca** escreve `produto_estoque`. **O PREÇO passou para o Rise em 07/10/2026** (decisão do dono: o Bling não
  mandava preço à LI, e o Sincronizar do Rise já muda o preço no Bling): o Sincronizar e o Cadastrar mandam o **preço de
  venda** (`precoVenda`, o normal) por `PUT /produto_preco/{id}`, lendo antes o que a LI tem e devolvendo `custo`,
  `promocional` e `sob_consulta` como estavam (o PUT pode zerar chave ausente; não medido). O preço entra na comparação
  (campo "Preço") e na assinatura; vazio no Rise não apaga. **Um preço só para tudo, escolha do dono:** o 100101 custava
  R$ 38,90 no Rise e R$ 49,00 na loja (o preço da loja no vínculo do Bling), e o próximo Sincronizar o leva a 38,90.
  **Medido em 07/10/2026 (ok do dono), no ZZ-TESTE-BLING (404349127):** `PUT /produto_preco/404349127` com
  `{cheio: 16, custo: null, promocional: null, sob_consulta: false}` → 200; a LI guardou `cheio` "16.0000" e o detalhe do
  produto passou a mostrar `preco_cheio` 16. Estoque (6), custo, promocional e `ativo` não mudaram. Só o preço foi enviado
  (os outros campos já estavam iguais). **Não medido:** se o Bling sobrescreve depois com o preço do vínculo (15).
- **Só Produto Conferido** vincula, cadastra e sincroniza (conferido no servidor em toda ação).
- **Fotos e documentos esperam a VPS** (a LI só aceita imagem por URL pública). O bloco "Documentos" da descrição está
  pronto e desligado enquanto `APP_URL_PUBLICA` estiver vazio.
- Os **44 produtos que só existem na LI** ficam ignorados; no NCM **o Rise vence** (77 divergentes medidos).
- **Abordagem híbrida:** editor por abas (molde do ML) + ícone com selo e pop-up de diferenças (molde do Bling).
- **Categorias ao vivo:** a lista vem da LI na hora (o dono está renovando a árvore do site), em árvore, várias por produto.

### Medido na LI real em 07/10/2026 (produto de teste `ZZ-TESTE-LI`, id 404334430, inativo; fica até o dono apagar)

- **Origem (`icms_origin_code`) e tipo de produção (`production_type`) NÃO são graváveis pela API**: o `PUT` do produto
  os ignora (200), o `PATCH` dá 405 e o `POST` do cadastro também os ignora (medido em 07/10/2026 com `ZZ-TESTE-LI-2` e
  `ZZ-TESTE-LI-3`, inativos na LI até o dono apagar). Saída prática: o padrão do emissor nas configurações de NF-e da LI. Ficaram **só leitura**: o pop-up compara com o cadastro e avisa "ajuste no painel da
  LI"; não contam como divergência (o selo nunca apagaria). `Produto.tipoProducao` existe para essa comparação.
- **SEO só pelo `PUT /v1/seo/{id}`** (o `PUT` do produto ignora `seo_title`/`seo_description`).
- **`PUT` do produto inteiro:** aceita até as chaves só de leitura, mas o Rise as tira (`CHAVES_SO_LEITURA`): devolver
  `preco_cheio`/`estoque_quantidade` lidos segundos antes desfaria o Bling. **`categorias: []` e `marca: null` explícitos
  APAGAM**; sem a chave, mantém. Lista vazia no Rise nunca entra no corpo.
- **Medidas só inteiras** (decimal = 400 com corpo vazio): o envio faz `Math.ceil`. Nome até 255. NCM guardado como
  enviado (vai `8537.10.20`). SKU repetido no `POST` = **400** com `error[].sku` (não 409). `?sku=` filtra.
- **`/alias?replace_main=true`** muda o `url` (301 do antigo) e **mantém o `apelido`**: o slug atual é o `url`.
- `descricao_completa` preserva `<h2>`, `<ul>`, `&amp;` e `<a href>` byte a byte.

### Onde mora cada parte

- **Lib** (`src/lib/canaisDeVenda/li/`): `slug.js`, `seo.js`, `descricao.js` (HTML: texto escapado, Especificações,
  Documentos, frases), `campos.js` (normalização dos dois lados, assinatura, diferenças, avisos fiscais; **só servidor**),
  `corpo.js` (POST e mesclagem do PUT), `rascunho.js`, `esquema.js` (zod), `validacao.js` (`ABAS_LI`), `banco.js`
  (rascunho, vínculo pelo SKU, lista), `cliente.js` (as duas travas), `leitura.js` (busca, detalhe, categorias, marcas,
  pop-up), `envio.js` (Sincronizar e Cadastrar), `estado.js` (ícone), `apresentacao.js` (o único que o navegador importa),
  `rotulos.js`. O cliente HTTP, a paginação e os normalizadores do handoff ficam em `src/lib/integracoes/lojaIntegrada/`.
- **Tela:** `src/app/canais-de-venda/loja-integrada/` (lista, `novo`, `[id]`, `acoes.js`),
  `src/app/produtos/acoes-li.js`, `src/components/anuncios/li/` (editor por abas, `ArvoreDeCategorias`, `JanelaAnuncioLI`)
  e `src/components/produtos/IconeLojaIntegrada.jsx`. O ícone da lista abre o editor direto (o pop-up de diferenças
  `JanelaLojaIntegrada` foi apagado em 07/10/2026: virou a aba Divergências).
- **Banco:** migration `20261006_loja_integrada` (`Produto.tipoProducao`, `CopiaProdutoCanal`). O rascunho mora em `Anuncio`
  (canal LOJA_INTEGRADA, **um por produto**, índice parcial `Anuncio_um_por_produto`): título e descrição em coluna, o resto
  (slug, marca, categorias, destaque, vídeo, SEO, especificações) em `dados`. Anúncio vinculado (PUBLICADO) **continua
  editável**: é dele que o Sincronizar lê.
- **Teste:** `npm run teste:li-sync` (LI falsa em `scripts/lib/lojaIntegradaFalsa.js`, que reproduz o medido e é **mais dura**
  que a real só em `CHAVES_SO_LEITURA`; Postgres, só escreve produtos `ZZ-LI-*`).

### Fluxos

- **Descrição (pedido do dono em 07/10/2026):** é sempre a do **cadastro do produto** (`descricaoBase`); o anúncio
  não a edita (a aba Descrição é só leitura, com "Editar no produto"). Vai com **fonte 16** e **títulos em negrito** (a
  1ª linha em maiúsculas e as linhas que terminam em dois-pontos, como "Especificações técnicas:" e "Itens inclusos:
  (Cód:...)"). A seção **"Documentos / Arquivos para download:"** entra logo abaixo de "Especificações técnicas:"; sem
  ela, acima de "Garantia:"; sem as duas, no fim (só com `APP_URL_PUBLICA`). O bloco automático de Especificações e a
  prévia separada saíram. A formatação não acende o selo (a comparação é pelo texto).
- **Editor = pop-up (07/10/2026):** ao abrir, o editor lê a loja (`abrirJanelaLI`, só leitura). Abas, nesta ordem:
  **Divergências** (só quando há campo "diferente"; "só tem na loja" não conta) / Características / Imagens / Descrição / Categorias / Peso e dimensões /
  Tributação / SEO / Prévia e sincronização (nomes iguais aos do cadastro de Produto). A comparação é do anúncio **salvo** com a loja. No rodapé, **"Sincronizar com a
  LI"** ("Cadastrar na LI" se o código não está na loja), sob as mesmas travas; com alteração na tela pergunta "Salvar e
  sincronizar" (sem opção de enviar sem salvar). "Editar produto" (Descrição, Fiscal, Envio) abre o cadastro na mesma
  aba e, com alteração não salva, pergunta (Salvar e abrir / Abrir sem salvar / Cancelar).
- **Aba Fiscal:** aviso grande do que mudar **no painel da LI** (origem e tipo de produção vazios ou diferentes; a API
  não os grava), com o link `https://app.lojaintegrada.com.br/catalogo/produto/{idExterno}/editar`. O alerta "sem
  GTIN" considera o GTIN que já está na loja (`gtinDaLI`).
- **Aba SEO:** (o Tag Title não tem ícone de lista: o dono dispensou) nomes e ordem da LI (Tag Title, Meta Tag Description, URL do produto), contador "54 de 70 caracteres".
  **Title e description são OBRIGATÓRIOS** (bloqueiam Sincronizar e Cadastrar) e travados no campo: 70 e **160** (o que o
  Google mostra; `LIMITE_DA_DESCRIPTION_SEO`, que também é o corte do envio, era 250). Sem "Usar padrão": um **ícone de
  lista** ao lado de cada campo, no molde do "Escolher o título" do cadastro, traz o nome do produto, o SEO dos
  concorrentes salvos (`seoConcorrentes.js`, de `ProdutoColetado.seo`, cortado na frase) e, na description, "Gerar com
  IA" (3 opções, pede 140-160 e aceita 130-160: `gerarDescriptionsSeo` em `ia/anuncio.js`).
- **Aba Imagens** (07/10/2026), depois de Características (a antiga Geral): marcar e ordenar as fotos validadas do
  produto (`fotosDoProduto`, só `papel: FOTO`; a capa é a primeira), guardadas em `rascunho.imagens`. O **envio espera a
  VPS** (a LI só aceita imagem por URL pública): as fotos não entram na assinatura nem no Sincronizar. Anúncio novo nasce
  com todas as fotos, a principal na frente.
- **Categorias pela IA** (pedido do dono em 07/10/2026): botão "Sugerir com IA" na aba Categorias. A IA recebe o nome,
  a marca, a descrição e a árvore da loja inteira ("id: caminho", uma por linha) e devolve até 3 ids com um motivo
  (`sugerirCategoriasIA` em `ia/anuncio.js`, regras puras em `li/categorias.js`). Id que não existe na árvore sai, e o
  caminho mostrado vem da árvore, nunca do texto da IA. Nada é marcado até "Marcar estas", que marca as sugeridas **com
  as categorias-pai** (`comAncestrais`, como o 100101 está na loja) e mantém as que já estavam marcadas. Gravar continua
  sendo o Salvar. **A chamada real nunca foi vista** (é paga; o primeiro uso é do dono).
- **URL (slug):** produto que **já está na loja mantém a URL de hoje** (decisão do dono em 07/10/2026, que desfez a
  de trocar pela do nome: o Google já indexou). O slug saiu dos campos comparados e o Sincronizar **não chama mais o
  `/alias`**. Só o produto novo nasce com `slugDe(nome)`, como `apelido` no Cadastrar. A aba SEO mostra a URL de hoje
  (`vinculo.urlExterna`, que pode ser `/produto/<slug>.html`) ou a que vai nascer do nome.
- **MPN sempre em branco** (07/10/2026): é o código de peça do fabricante e não se aplica aos produtos da loja. O
  Rise mandava o Modelo do cadastro como MPN (o 100101 foi com "UNO R3 SMD CH340"); agora o MPN do Rise é vazio, valor
  na loja conta como diferença e o Sincronizar limpa com `mpn: ""` (`CAMPOS_QUE_LIMPAM_LI`). **Limpar com texto vazio
  ainda não foi medido na LI real.**
- **Frases fixas saíram da LI** (07/10/2026): não entram na descrição nem na assinatura, e a página de configurações
  do canal foi apagada. As do Mercado Livre continuam.
- **Vínculo:** a primeira leitura de um produto Conferido que já existe na LI grava `idExterno`, `urlExterna` e o
  link em `Produto.urlLojaIntegrada`; categorias e destaque **vêm da loja** para o rascunho (o slug não).
- **Sincronizar** (etapas: trava, leitura, marca, produto, seo, slug, gravação): só os campos diferentes; marca achada sem
  caixa e sem acento (`POST /marca` só se não houver); categoria do rascunho que sumiu da loja sai do envio
  (`categoriasIgnoradas`); cópia do GET em `CopiaProdutoCanal` (3 por produto) antes do PUT; falha depois da trava deixa o
  anúncio em ERRO com a etapa e a assinatura intacta.
- **Cadastrar:** recusa sem NCM e SKU que já existe (ou está na lixeira); cria **inativo**; o vínculo é gravado logo após o
  POST (se o SEO falhar depois, o próximo clique não duplica).
- **Ícone:** cinza = nunca sincronizado, não Conferido ou **sem vínculo com o Bling** (`blingId`; decisão do dono em
  07/10/2026: é o Bling que controla estoque e pedidos da LI, e o texto do ícone diz "sem vínculo com o Bling"); verde =
  sincronizado e no Bling; **o editor confere ao abrir** (só leitura, `blingLoja.js`) se o produto está ligado, DENTRO do
  Bling, à loja Loja_Integrada (203478870): `GET /produtos/lojas?idProduto=`, cujo `codigo` é o id do produto na LI
  (medido no 100101: "204930845", preço 49 no vínculo). Sem o vínculo, ou ligado a outro produto da LI, aviso no topo do
  editor e na Prévia, com o botão **"Ligar à Loja Integrada no Bling"** (`ligarNoBlingLI`): `POST /produtos/lojas` com
  `{codigo: id na LI, preco: o do produto NO BLING, produto.id, loja.id: 203478870}`, sob BLING_ESCRITA e
  BLING_ESCRITA_CODIGOS, conferindo antes (não duplica, não mexe em vínculo de outro produto) e relendo depois.
  **Teste real em 07/10/2026 (ok do dono):** ZZ-TESTE-BLING cadastrado inativo na LI (id **404349127**) e ligado no Bling
  (201, releitura "ligado", preço 15). **Em 10 minutos o Bling NÃO mandou estoque nem preço** à LI (preço vazio, estoque
  0, `estoque_gerenciado` false, nenhuma modificação): ligar não dispara envio. **Uma entrada de estoque de 1 unidade
  enviada pelo Rise ao Bling (5 → 6) chegou à LI em menos de 1 minuto: estoque 6 e `estoque_gerenciado` true.** O
  preço continuou vazio. **Mudar o preço do produto no Bling também NÃO chegou à LI** (medido em 07/10/2026: o
  Sincronizar do Rise mandou `PATCH` com o preço 15 → 16; 23 minutos depois a LI seguia com `preco_cheio` vazio). O preço
  do VÍNCULO com a loja (`/produtos/lojas`) é outro número e não acompanhou: continuou 15 com o produto em 16. Ainda não
  medido: se o Bling manda o preço quando o preço DO VÍNCULO muda, ou se a integração da LI no Bling está com o envio de
  preço desligado (conferir na tela de configuração da integração). Por isso o preço passou a ir pelo Rise. ZZ-TESTE-BLING
  (404349127) e o vínculo ficam até o dono apagar. selo "!" = a assinatura (Rise + rascunho +
  documentos) mudou desde o último envio. **A LI regrava `<br>` como `<br />\r\n`**: `htmlParaTexto(..., { paragrafos:
  true })` trata quebra crua do HTML como espaço, senão a descrição ficava "diferente" para sempre.

### Primeiro envio real (07/10/2026, produto 100101, com ok do dono)

Travas abertas só no processo de um script (`LI_ESCRITA=true LI_ESCRITA_CODIGOS=100101`), `.env` intocado.
- **A primeira tentativa recusou antes da trava, sem escrever nada:** o vínculo trouxe o slug `produto/...html`. Produto
  antigo da loja tem a URL `/produto/<slug>.html` (o novo, `/<slug>`); `normalizarDaLI` passou a tirar o `produto/`
  e o `.html`.
- **Depois:** `PUT /v1/produto/204930845` → 200 e `PUT /v1/seo/88716201` → 200. Mudaram nome, descrição (com a lista
  de Especificações), MPN, peso, medidas (7 x 6 x 1 cm) e SEO. **Preço, estoque, ativo, categorias, destaque, fotos (5),
  marca, GTIN e a URL principal ficaram iguais** (comparado com a cópia em `CopiaProdutoCanal`). A releitura mostrou só
  o GTIN como "só tem na loja" (o Rise está vazio, e vazio não apaga).
- O `apelido` voltou da LI com uma barra na frente (`/placa-...`): a LI normaliza o que recebe; a URL não mudou.

### Travas

`LI_ESCRITA` (geral) e `LI_ESCRITA_CODIGOS` (SKUs liberados; **vazia libera todos**), lidas uma vez na partida. Teste de
escrita sem editar o `.env`: `LI_ESCRITA=true LI_ESCRITA_CODIGOS=<sku> node <script>` (o `dotenv` não sobrescreve).
`exigirEscrita(sku)` antes da primeira escrita; nenhuma escrita repete sozinha.

### Pendências

- **"Especifique para melhorar resultados" (BETA da LI, Classificação de mercado e Especificações):** analisado em
  07/10/2026. Não existe na API v1 (o `GET /produto` não traz nenhum campo disso), então só se preenche no painel. A
  classificação usa a árvore de categorias do Mercado Livre, e a página pública do produto não publica GTIN, MPN nem
  especificações em dados estruturados (só nome, marca, SKU, preço, imagem e descrição em Microdata). Ganho provável:
  integrações da LI (Google Shopping / marketplaces), pouco no Google orgânico. Teste sugerido: preencher em um produto
  e conferir se a página pública ganha dados novos.
- **O servidor da porta 3000 (de outra sessão, na mesma pasta) ficou com a lib antiga da LI na memória** em 07/10/2026:
  a tela atualizou, mas as ações não (sem `fiscais`, `daLoja` e `dominioDaLoja`). Até reiniciar, a aba Fiscal diz
  "conferem" e o alerta de GTIN ignora a loja. Só um `next dev` roda por pasta.
- Fotos (`POST /produto_imagem`) e documentos: na VPS. Webhooks, pedidos e importação dos 44 só-LI: fora desta fase.
- `POST /marca` nunca foi exercitado na API real (só na LI falsa).

## Decisões de arquitetura

- **Produtos é o cadastro base.** Todo anúncio deriva dele. O `Anuncio` guarda só o que é
  específico do canal.
- **Dois estados por anúncio:** `status` (interno) e `situacaoCanal` (no marketplace). Eles
  divergem — o ML pausa anúncios sozinho por falta de estoque.
- **Conectores não assumem OAuth.** Bling e ML usam OAuth2, a LI usa chaves estáticas, a
  Shopee assina com HMAC. O gancho `autorizarRequisicao` é onde a diferença cabe.
- **Segredos cifrados** (AES-256-GCM) na tabela `Conexao`, num único JSON por serviço.
  Sem a `ENCRYPTION_KEY` os tokens viram lixo — **leve a chave junto do dump**.
- **Arquivos em `dados/produtos/<SKU>/<tipo>/`**, fora de `public/` (que não sobrevive a
  deploy com Docker). O SKU é validado como nome de caminho; a pasta acompanha quando ele
  muda; o endereço é **calculado na leitura**, nunca gravado.
- **Custo do produto vem do fornecedor padrão.**
- **Concorrente vinculado ao produto (`ProdutoConcorrente`, migration `20260918_produto_concorrente`)
  não guarda cópia do preço quando vem da lupa do Nome — só a referência**
  (`produtoColetadoId`). A tela lê o preço de HOJE em `ProdutoColetado` toda vez que abre o
  produto, decidido com o dono em 18/09/2026: ele quer acompanhar a próxima varredura sem
  precisar remover e adicionar de novo. Diferente do preço de custo do Fornecedor, que é o que
  o operador negociou e por isso fica fixo. Concorrente digitado à mão (sem produto coletado
  por trás) usa os campos `*Manual`, fixos — não há varredura para seguir.
  Adicionar pela lupa manda **todas as chaves do schema explícitas, nunca omitidas**
  (`fonteManual: null` em vez de ausente): o schema é `nullable`, não `optional`, e chave
  ausente falha a validação **em silêncio** — foi o que aconteceu na primeira versão, sem
  lançar exceção nem aparecer no log, e o concorrente simplesmente não entrava na lista.
- **Concorrentes e Fornecedores entram sozinhos na aba ao fechar a janela da lupa**
  (`sincronizarSugestoes`, via `ref` em `Fornecedores.jsx`/`Concorrentes.jsx`), pedido do dono
  em 18/09/2026: sem precisar clicar em "Adicionar" para cada um. Fechar é o momento em que o
  operador termina de escolher — sincronizar a cada marcação dentro da janela criaria linha a
  cada clique, antes da escolha estar pronta. Fornecedor exclui candidato repetido pelo NOME
  (é o `Fornecedor` real, único por loja); Concorrente exclui pela referência
  (`produtoColetadoId`), porque duas linhas do mesmo concorrente com produtos diferentes são
  legítimas — o Fornecedor é único por loja, o concorrente não.
- **Coluna "Diferença" da lista de Concorrentes** (`Concorrentes.jsx`, 18 e 19/09/2026): o número é
  `(nosso preço − preço normal do concorrente) ÷ preço normal do concorrente`, e **a seta e a cor
  dizem onde está o CONCORRENTE em relação a nós**: mais barato = seta para baixo em **vermelho**
  (o caso ruim para quem vende), mais caro = seta para cima em verde, igual = "Igual". A primeira
  versão apontava para o nosso preço; o dono pediu a inversão em 19/09/2026 e o **número ficou o
  mesmo** (39,90 contra 49,00 dá 22,8%). Como a coluna é medida vai numa bolha "i" no cabeçalho.
  Se um dia a base passar a ser o NOSSO preço, o mesmo exemplo dá 18,6%: é uma linha em `Diferenca`.
- **Posição de preço "2º de 10"** (pedido do dono em 06/10/2026): selo ao lado de "Preço venda" e do título
  "Concorrentes" (`SeloPosicaoDePreco.jsx`). O cálculo é de `posicaoDePreco` (`src/lib/posicaoDePreco.js`, função
  pura): o Preço venda que está no campo AGORA contra a lista de concorrentes da tela (`concorrentesRascunho`,
  salva ou não), e atualiza enquanto o dono digita.
  - **1º = o mais barato.** O total é "lojas com preço + o produto".
  - **Cada loja conta uma vez, pelo menor preço dela** (o nome é comparado sem caixa e sem espaço nas pontas).
  - **Empate** (mesmo preço em centavos) fica na mesma posição, com "(empatado)".
  - Concorrente sem preço ou com preço zero fica de fora. Sem preço do produto, ou sem concorrente com preço,
    não há selo.
  - **Concorrente sem estoque também fica de fora** (pedido do dono em 07/10/2026): `estoqueStatus`
    `OUT_OF_STOCK`, ou produto que saiu da loja (`ausenteDesde`). A loja sai da conta só se todos os produtos
    dela estiverem assim, e a dica diz quantas saíram. O formulário lê o estoque pela ação
    `consultarSituacaoConcorrentes`, porque a aba Concorrentes só lê o dela quando abre. No 100103 o selo foi
    de 7º de 14 para 6º de 11.
  - **Na aba Concorrentes eles continuam, por último** (pedido do dono em 07/10/2026: ele usa outros dados
    desses concorrentes). A ordem é: com estoque ou sem informação primeiro, sem estoque depois, fora da coleta
    por último; dentro de cada grupo, do mais barato ao mais caro. `ordenarConcorrentes` e `situacaoDeEstoque`
    (`src/lib/estoqueDoConcorrente.js`) são a regra única da ordem, da coluna Estoque e da posição de preço, que
    antes tinham cada uma a sua. A quantidade manda: zero é "sem estoque" mesmo que a loja diga disponível.
  - **Cor:** verde quando é o 1º, âmbar quando é o último, cinza no meio. Não usa vermelho, porque ser o mais
    caro pode ser estratégia.
  - **A dica (mouse) mostra a distância:** o mais barato e a loja, "para ser o 1º: abaixo de R$ X", e os
    vizinhos logo abaixo e logo acima.
  - **Não é gravado no banco.** Uma coluna na lista de produtos ficaria para um segundo passo, que pede mudança no
    banco. Testes em `teste-extracao` ("Posição de preço").
- **Manual e ficha técnica são um tipo só, `DOCUMENTO`** ("Documentos técnicos", pasta
  `documentos/`), desde 16/09/2026, decidido com o dono. Nada no sistema tratava um diferente do
  outro, e o mesmo PDF de fabricante costuma ser as duas coisas. **O certificado de
  homologação continua separado** (`CERTIFICADO`): anda com o número, e o Mercado Livre o pede
  em algumas categorias. A migration `20260916_documentos_tecnicos` recria o enum, porque o
  Postgres não remove valor de enum. Não havia nenhum arquivo dos tipos antigos.
- **Documentos técnicos aceitam `.zip`** (pedido do dono em 04/10/2026; o certificado continua só
  PDF/imagem). O Windows manda `application/x-zip-compressed`, então os dois tipos entram, e o
  servidor só aceita se o conteúdo começar com `PK` (o tipo vem do navegador). Limite de 20 MB, o
  mesmo dos PDFs (o `bodySizeLimit` é 24 MB). A rota `/api/arquivos` serve `.zip` como download.
- **O arquivo baixado leva o NOME REAL, e não o hash** (pedido do dono em 05/10/2026: baixava como
  `d408461a…pdf` em vez de `Datasheet ATmega328P.pdf`). O arquivo mora no disco com nome gerado por nós (32
  hexadecimais), mas a lista já mostrava `ProdutoArquivo.nomeOriginal`; a rota `/api/arquivos` não o informava
  ao navegador. Agora ela busca o nome no banco e manda `Content-Disposition` (`cabecalhoDeArquivo`, em
  `arquivos.js`): PDF e imagem continuam **abrindo na página** (`inline`, e o "Salvar como" já sugere o nome
  certo) e ZIP **baixa** (`attachment`).
  - **O nome real é texto de terceiro** (vem do navegador de quem enviou) e vai para um cabeçalho HTTP:
    saem quebra de linha (injeção de cabeçalho), aspas, barras e dois-pontos, e vai em duas formas, a ASCII e
    a `filename*` UTF-8 (RFC 5987), para "Manual técnico.pdf" não virar "Manual t_cnico.pdf".
  - **A busca do nome não derruba o download**: se o banco falhar, o arquivo sai com o nome do endereço, como
    antes. Sem nome real (foto importada) também.
  - **`urlDe` acrescenta `?v=2` a documento e certificado** (imagem não). A rota guarda a resposta por um
    ano (`immutable`), e as respostas já guardadas no navegador não têm o nome real; mudar o endereço faz buscar
    de novo. A rota ignora o parâmetro, e o endereço é calculado (nunca gravado). Testado em `teste:extracao`.
  - **Clicar no documento BAIXA, não abre janela** (pedido do dono em 05/10/2026). O link da lista (documentos
    e certificado, em `FormularioProduto.jsx`) perdeu o `target="_blank"` — com ele o ZIP abria uma aba em
    branco e o PDF abria no navegador — e ganhou `download` com o nome real. O **ícone e o nome ficam dentro do
    mesmo link** (o ícone virou o de download), então clicar em qualquer um baixa. Quem quiser só ver o PDF
    perde essa saída pela lista; a rota continua servindo `inline`, então o endereço aberto direto ainda mostra.
- **Fotos do produto: até 100** (`MAXIMO_IMAGENS`, pedido do dono em 04/10/2026; eram 9), e o painel
  do cadastro novo guarda 150 candidatas (`MAXIMO_FOTOS_NO_PAINEL`, sempre acima do limite do
  produto). Os canais aceitam menos (Shopee 9, Mercado Livre 12): cada anúncio escolhe as suas, e o
  envio da fase 3 precisa cortar nesse número. O rascunho do ML guarda até 100 ids de foto.
- **Descrição com IA: as opções candidatas (linhas roxas com "?") são editáveis antes da escolha**
  (lápis + Salvar por linha, `LinhasDescricao` → `editarOpcao` em `JanelaDescricao`). O texto
  salvo é o que entra na descrição se a opção for a selecionada.
- **Ordem das medidas: Peso, Comprimento, Largura, Altura** (pedido do dono em 04/10/2026), no
  cadastro do produto e na aba Envio do anúncio do ML.
- **Documentos e certificado podem ser enviados no cadastro NOVO** (pedido do dono em
  16/09/2026). Vão para `dados/temporarios/<lote>/`, onde o lote é um UUID criado no primeiro
  envio, e são **movidos** para `dados/produtos/<SKU>/` no Salvar (`moverTemporarios`). **Desde 10/10/2026 vale também
  para o produto já existente**, e excluir só vale no Salvar (ver "Segunda rodada de 10/10/2026", na seção do kit).
  - O lote nasce no clique, e não na montagem: gerado na renderização, o valor do servidor e o
    do navegador divergiriam.
  - Passa pela **mesma validação** do envio normal (`validarEGravar`, extraída de
    `salvarArquivo`).
  - A lista (`arquivosTemporarios`) vem do navegador, mas **só entra o que existe no lote com
    nome gerado por nós**. Tamanho e formato são lidos do disco. Testado: `../../../.env` na
    lista é ignorado.
  - Lote com mais de 24 h (cadastro abandonado) é apagado no envio seguinte.
  - Sem link de abrir antes de salvar: a pasta temporária não tem rota pública, de propósito.
  - **Falha ao gravar os documentos não derruba o Salvar.** Em 16/09, com o servidor sem
    reiniciar após a migration, o produto foi criado e o registro dos arquivos falhou. A ação
    devolvia erro, a tela ficava em "Novo produto" e o segundo Salvar daria "SKU já existe".
    Agora o Salvar segue para o produto, com o aviso `?documentos=falhou`.
- **Exclusão de produto: "Excluir" nos 3 pontinhos de cada linha da lista** (pedido do dono em
  09/10/2026). De 18/09 a 09/10/2026 era em lote, por caixa de seleção e uma lixeira fixa ao lado da
  busca; a lixeira e as caixas saíram, e os "Cadastrar no Bling/LI/ML/Shopee" desabilitados que moravam
  no menu também. O menu tem só **Clonar** e **Excluir**. **A confirmação continua sendo o popup com
  nome e SKU**, não o `confirm()` nativo: um erro real de teste (excluído o produto errado por
  reordenação da lista) mostrou que "Excluir estes 2 produtos?" não deixa ver o que está marcado.
  Produto com anúncio publicado ou que é peça de kit continua recusado, com o motivo no aviso.
- **Clonar** (pedido do dono em 09/10/2026): o item do menu abre `/produtos/novo?clonar=<id>`, o mesmo
  cadastro novo já preenchido, com a faixa "Clonado a partir de <código> · <nome>". Nada é gravado até o
  Salvar. Decisões do dono: **código (SKU) vazio**; copia campos, **fotos (já validadas), documentos e
  certificado, fornecedores, concorrentes e a composição do kit**; **EAN copiado**. Não copia localização
  nem link da Loja Integrada (são daquela peça), e o clone nasce sem estoque, sem Conferido, sem vínculo
  com o Bling e sem anúncio.
  - O produto é lido por `carregarProdutoParaFormulario` (`src/lib/produtoParaFormulario.js`), o MESMO da
    tela de edição; `dadosParaClone` tira o que é do original e dá **ids novos** às linhas de fornecedor e
    concorrente (o concorrente digitado à mão é reconhecido pelo id no Salvar).
  - Fotos: `importarImagensDaOrigem(lote, "rise:<id>")` com `finalizada: true` (só a validada é salva).
    Documentos: `copiarDocumentosParaClone` copia para o lote com nome novo (`copiarParaTemporario`), e o
    Salvar os move para o clone; o original fica intacto. Conferido em 09/10/2026 com o 100101: o clone
    saiu com 7 fotos, 3 documentos, 3 fornecedores e 12 concorrentes, e foi excluído pelo menu depois.
- **O mesmo GTIN/EAN em dois produtos é recusado no Salvar** (pedido do dono em 09/10/2026, junto do
  Clonar). Conferido em `salvarProduto`, não por índice único: em 09/10/2026 já havia **5 EAN repetidos**
  no banco (14 produtos: 1208030000000 em 120808/09/10/12/13, 1210490000001 em 121058/63/70, e os pares
  130502/130506, 121000/121049, 200302/258199). Esses produtos passam a pedir a correção no próximo Salvar.
  A importação do Bling não confere.
- **Imagem principal é uma marca (`principal`), não a posição 0.** Reordenar a cada clique
  fazia as miniaturas dançarem e custava até 3s por clique.
- **Toda chamada externa é auditada** em `LogIntegracao`, com credenciais mascaradas.
- **Ajuda de campo é bolha "i" no hover, não texto sempre visível embaixo do campo**
  (`BolhaDeAjuda.jsx`, `src/components/ui/`), padrão adotado em 18/09/2026 a partir do Bling,
  "para deixar a tela mais limpa" (pedido do dono). Convenção para telas novas ou mexidas a
  partir de agora — **não foi varrida em telas que não usam `Campo`/`CampoComIcone` deste
  arquivo** (Mercados, por exemplo, ainda usa `title` nativo do navegador).
  - Duas variantes: `"canto"` (padrão) para botão-ícone (lupa, Buscar por código, ✦) — bolinha
    desprendida no canto **superior** direito, fora da borda. `"inline"` para o rótulo de um
    campo comum — ao lado do texto, no lugar do parágrafo de ajuda.
  - **O "i" é um SVG desenhado** (19/09/2026, pedido do dono): círculo cheio + glifo branco de "i"
    itálico com serifa no alto e rabo curvo embaixo, no lugar do texto "i". O círculo usa
    `currentColor` (`text-acento`), então **segue a cor de destaque da loja** e o anel branco
    (`ring-superficie`) e a sombra de antes. Tamanho e posição não mudaram (`h-4 w-4`).
  - **O texto sempre abre para CIMA**, nunca para baixo — pedido explícito do dono depois de
    ver a primeira versão abrindo para baixo.
  - **Quando o ícone também tem um número** (`Contador`), o número vai para o canto
    **inferior** direito, no MESMO `right` da bolha de ajuda — os dois alinhados na mesma
    borda, nunca disputando o canto.
  - Grupo `group/ajuda` **nomeado**, não `group` liso: vários botões da tela já vivem dentro
    de outro `group` (imagem, linha de tabela), e um grupo sem nome acionaria a bolha errada
    no hover de quem está em volta.
  - `onClick` da bolha para a propagação — quando ela mora dentro de um botão maior (a lupa),
    clicar em cima do "i" não pode disparar a ação do botão por baixo.
  - **O texto zera a caixa herdada** (`normal-case tracking-normal font-normal`): dentro de um
    `<th>` de tabela (`uppercase`, espaçamento largo) a explicação inteira saía em MAIÚSCULAS.
  - **Bolha em cabeçalho de tabela é CORTADA por `overflow-x-auto`.** Qualquer `overflow` diferente
    de `visible` prende também o eixo Y, e a bolha abre para cima, fora da caixa da tabela: no hover
    não aparecia nada (conferido com `elementFromPoint`). Em `Concorrentes.jsx` o wrapper usa
    `md:overflow-visible`, e a rolagem lateral fica só nas telas estreitas.

## Cadastros: clientes, fornecedores, concorrentes, transportadoras, produtos e marcas

Pedido do dono em 18/09/2026: uma seção no menu para cadastrar fornecedores, concorrentes,
produtos e o que mais fizesse falta. **Item de menu logo abaixo do Painel** (`blocos.js`),
com as seções como **CARTÕES na própria página `/cadastros`** (desde 21/09/2026, pedido do dono, no
desenho de Ferramentas; até ali eram subitens em cascata no menu). Ordem: Clientes, Fornecedores,
Concorrentes, Transportadoras, Produtos, Marcas. A lista mora em `src/lib/secoesDeCadastros.js`; cada
tela tem um link "← Cadastros" (`LinkDeVolta`, em `src/components/ui/`, usado também em Ferramentas).
**Condições de pagamento saiu** (ver abaixo).

- **A primeira versão tinha abas dentro da tela** (`?aba=`, no desenho de Fontes) e o item
  ficava acima de Mercados. O dono desenhou o pedido de novo no mesmo dia: subiu o item e
  moveu as abas para o menu. As abas **saíram da tela**.
- **Cada seção tem rota própria:** `/cadastros/clientes|fornecedores|concorrentes|transportadoras|produtos|marcas`
  (`[tipo]/page.jsx`), e `/cadastros` mostra os cartões (até 21/09/2026 só redirecionava para
  Clientes). É o que deixa o item ativo sair de `ehRotaAtiva(pathname, href)`,
  sem `useSearchParams` na barra lateral (que está no layout de todas as páginas e exigiria
  `Suspense`). Formulário: `[tipo]/novo` e `[tipo]/[id]`, só para clientes, fornecedores,
  concorrentes e transportadoras (marcas e produtos dão 404: marcas
  edita na linha, produtos usa a tela de Produtos; `/cadastros/condicoes` também dá 404).
- **Fornecedores, concorrentes e transportadoras são UMA tela** (`PARCEIROS` em
  `src/lib/cadastros.js`, `TabelaParceiros`, `FormularioParceiro`, `salvarParceiro`), e o que
  muda vem da configuração: `tiposDeFonte` vazio esconde a ligação com fonte de Mercados
  (transportadora não tem site varrido), `usos` dá o nome da coluna ("Produtos" do fornecedor,
  "Clientes" da transportadora), `artigo`/`novo` acertam o gênero ("Ja existe uma
  transportadora", "Nova transportadora"). **Marcas** usa a `TabelaSimples` (nome +
  observação, edição na linha), que continua genérica para o próximo cadastro simples.
- **CNPJ é conferido pelos dígitos verificadores** (`src/lib/documentos.js`, sem imports, usado
  pela ação, pelo formulário e pelo teste) e guardado **formatado**, para "11222333000181" e
  "11.222.333/0001-81" não virarem dois textos. Vale para fornecedor, transportadora e cliente.
  Antes só se contava 14 dígitos no fornecedor.
- **Fornecedor: CNPJ obrigatório, salvo o ESTRANGEIRO** (pedido do dono em 04/10/2026). Coluna
  `Fornecedor.estrangeiro` (`Boolean @default(false)`, migration `20261004_fornecedor_estrangeiro`). Botão
  **Estrangeiro** ao lado do CNPJ (`CampoCnpjFornecedor`): ligado, o campo fica desabilitado e vazio e só o
  nome é obrigatório. O navegador não envia campo desabilitado, então a marca vai num campo oculto
  `estrangeiro=on`; o **servidor zera o CNPJ** de quem chega marcado (`exigirCnpjSalvoEstrangeiro`, em
  `src/lib/validacao.js`, testado em `teste:cadastros`) e recusa a falta dos dois com o erro no campo `cnpj`.
  - **O componente vale para os DOIS formulários de fornecedor**: o completo e o cadastro rápido dentro de
    Produtos (`CadastroRapidoFornecedor`), que chama a mesma `salvarParceiro`. Sem o botão ali, não haveria
    como cadastrar um estrangeiro por aquele popup depois de o CNPJ virar obrigatório.
  - **Fornecedor criado pela fonte de Mercados** (`garantirCadastroDaFonte`) nasce sem CNPJ e sem a marca,
    porque grava direto no banco, sem passar pelo formulário. O formulário passa a exigir um dos dois no
    próximo Salvar. Os 6 existentes em 04/10/2026 já tinham CNPJ.
- **Lista de fornecedores** (`TabelaParceiros`): coluna **CNPJ** logo depois do Nome (flag `cnpj` em
  `PARCEIROS`; o estrangeiro mostra o selo "Estrangeiro"). **"Produtos" = produtos COLETADOS da fonte ligada**
  (`_count` de `ProdutoColetado`, feito no banco; travessão quando não há fonte), e não mais os vínculos com
  produtos cadastrados na Rise: a Fortek mostrava 3 contra 1.979 coletados, e o dono estranhou. Os vínculos
  continuam na trava de exclusão (`recadoDeUso`) e no rodapé do formulário. Enquanto uma varredura corre, o
  número sobe junto e pode passar do "coletados" da tela Fontes, que só avança quando a coleta fecha.
- **Site do cadastro** (`CampoSite`): botão **Abrir site** ao lado do campo, que abre o endereço digitado em
  outra aba. O campo continua de digitar (clicar dentro dele para corrigir não pode sair da tela); o botão só
  acende com http/https válido, porque `javascript:` num `href` executaria código. Vale para fornecedor e
  concorrente (mesmo formulário) e para o cadastro rápido.
- **Cascata (`blocos.js` → `filhos`, `SidebarItem.jsx`) — hoje NENHUM bloco a usa**, mas o código do menu
  continua suportando (Cadastros a usou até 21/09/2026): um nível, cada filho é um link. A
  seta é um botão **irmão** do link, não filho (botão dentro de `<a>` é HTML inválido e o clique
  navegaria junto). Sem escolha do operador, a cascata **segue a rota** (aberta dentro do
  bloco, fechada fora); depois de abrir/fechar na seta, vale a escolha, só até recarregar. Clicar
  no **nome** do bloco reabre uma cascata fechada; clicar num **subitem** não grava escolha
  (senão ela ficaria aberta depois de sair de Cadastros). Pesquisar no menu abre a cascata e
  mostra só os filhos que casaram ("marc" acha Cadastros > Marcas). **Barra recolhida:** sem
  seta, mas os filhos aparecem como ícones com tooltip, senão Marcas ficaria inalcançável.
- **`revalidatePath("/cadastros", "layout")`**, e não `"/cadastros"`: a raiz agora só mostra os cartões, e o
  path simples não alcança as rotas de baixo.

- **A EMPRESA é uma coisa e o SITE que o worker varre é outra.** `Fornecedor` e `Concorrente`
  guardam contato, CNPJ, prazo, condições; `FonteColeta` continua sendo só o site. Há fornecedor
  sem site e site sem negociação, então a ligação é opcional (`fonteId`, `onDelete: SetNull`) e
  **a coleta não muda**. Excluir a fonte não apaga o cadastro: ele guarda a negociação.
- **Salvar uma fonte em Mercados já cria o cadastro** (`garantirCadastroDaFonte`,
  `src/lib/cadastros.js`), na **mesma transação** do `fonteColeta.create`. Nome que já existe
  **só liga, nunca sobrescreve** (o fornecedor pode ter nascido no cadastro de um produto, ou o
  operador já ter preenchido o contato), e cadastro ligado a outra fonte não é roubado. Tipo
  `OUTRO` não gera cadastro. Renomear a fonte depois **não** renomeia o cadastro.
- **`scripts/cadastros-das-fontes.js`** faz a carga das fontes que já existiam (repetível).
  Rodada em 18/09/2026: 11 cadastros novos e a Fortek ligada ao que já existia.
- **Produto NÃO tem formulário aqui, de propósito** (pedido do dono): a aba Produtos leva a
  `/produtos/novo`, o mesmo `FormularioProduto`. Duas telas para o mesmo cadastro acabariam
  divergindo. Um catálogo manual de produtos por fornecedor foi cogitado e descartado.
- **Fornecedor usado por produto não é excluído** (`ProdutoFornecedor` é `Restrict`): a ação
  conta os vínculos e devolve o recado em vez de deixar o banco estourar um erro de chave.
- **Marca é sempre MAIÚSCULAS**, como o campo Marca do produto. O cadastro ainda **não** alimenta
  esse campo (segue texto solto); é o próximo passo, junto de `ProdutoConcorrente.concorrenteId`
  — ambos mexem em arquivos com trabalho não commitado.
- **`opcional`, `decimal`, `ehUrlSegura`, `errosPorCampo`, `lerCampos`, `cnpjOpcional`** moram em
  `src/lib/validacao.js` (arquivo `"use server"` só exporta função assíncrona, então
  `produtos/acoes.js` não tinha como emprestá-los). `produtos/acoes.js` ainda tem a cópia dele.
  **`opcional` trata `""` E campo ausente como nulo:** campo desabilitado (a Inscrição Estadual
  com "IE isento" marcada) o navegador simplesmente não envia, e sem isso o formulário inteiro
  era recusado com "expected string, received undefined".
- **As migrations `20260918_tabelas_cadastros` e `20260918_tabelas_clientes` foram editadas à
  mão:** o `migrate diff` propôs `DROP INDEX` do índice de trigramas e de
  `ProdutoColetado_coletadoEm_idx`, que só existem no SQL, **nas duas vezes**. Aplicar o diff cru
  derrubaria a busca de Mercados de 15 ms para 600 ms. O sufixo `t` mantém a ordem depois de
  `20260918_produto_concorrente`.
- Depois de migrar, `npx prisma generate` **e reiniciar o servidor** (a armadilha de sempre).
- **Formulários daqui enviam a mão (`onSubmit` + `startTransition(() => acao(dados))`), não com
  `<form action>`.** O React 19 limpa o formulário depois de uma action de formulário e devolve
  cada campo ao valor inicial. Achado no primeiro teste do Cliente: num Salvar recusado (CNPJ
  inválido) a lista "Tipo da Pessoa" voltava sozinha para "Física" enquanto a tela seguia
  mostrando os campos de Jurídica — e reenviar gravaria o tipo errado. O truque do
  `FormularioProduto` (guardar o enviado como valor inicial) não alcança lista nem caixa de
  marcação. Também corrigido no `FormularioParceiro`, onde a lista de fonte de coleta voltava
  ao valor salvo depois de um erro.

### Clientes

Pedido do dono em 18/09/2026, desenhado a partir da tela "Cliente ou Fornecedor" do Bling com
caixas vermelhas no que aproveitar. **Cliente é só cliente, pessoa física OU jurídica — não se
mistura com fornecedor** (o Bling junta os dois numa tela).

- **Campos** (`Cliente`, `ClienteEndereco`, `ClienteContato`): Nome, Tipo da Pessoa, CPF ou CNPJ
  (um campo só, rótulo e validação trocam com o tipo), Cliente desde (hoje por padrão),
  telefones, e-mails (vários, ver "Reorganização" abaixo), observações, situação. **Só pessoa física:** Sexo e Naturalidade. **Só
  pessoa jurídica:** Fantasia, Código de regime tributário (1, 2, 3 da NF-e; nulo = "Não
  definido"), Inscrição Estadual, IE Isento e Inscrição Municipal. O campo **Contribuinte** do
  Bling estava fora das caixas e **não entrou**.
- **Os campos dos dois tipos ficam montados e só ocultos (`hidden`)**: trocar de tipo e voltar não
  perde o digitado. **O servidor zera o que não é do tipo salvo**, então nada de jurídica fica
  gravado num cliente que virou física (conferido no banco). IE Isento marcada limpa a
  Inscrição Estadual.
- **Documento único por cliente** (`documento @unique`, guardado formatado). **Obrigatório no
  cadastro desde 19/09/2026**, assim como o nome: CPF para pessoa física e CNPJ para jurídica, e o
  recado diz qual (`Informe o CPF.`). A regra é do formulário e da ação; a **coluna continua aceitando
  nulo**, então um cliente antigo sem documento não quebra a leitura — só não salva de novo sem
  preenchê-lo. CPF e CNPJ inválidos, e sequência repetida (111.111.111-11), são recusados.
- **Endereço em duas abas, Geral e Entrega** — o dono trocou a "Cobrança" do Bling porque o
  endereço do cliente nem sempre é o de entrega. **"Mesmo endereço do Geral" vem marcada e, marcada,
  NÃO se grava linha de Entrega** (uma cópia ficaria velha quando o Geral mudasse); desmarcada,
  grava; marcar de novo e salvar apaga a linha. As duas abas ficam montadas, e um ponto vermelho
  no título avisa de erro numa aba escondida.
- **Lupa do CEP = ViaCEP** (`buscarCep` em `acoes-clientes.js`). **Só o CEP sai daqui.** O valor
  vem do navegador, então é reduzido a 8 dígitos ANTES de entrar na URL (a base é fixa). É
  auditado em `LogIntegracao` (`Servico.VIACEP`), **sem o CEP no log** — o endpoint gravado é o
  modelo `/ws/{cep}/json/`. O ViaCEP responde 200 com `{"erro": true}` para CEP que não existe.
  Falha nunca trava o cadastro: devolve o recado e o operador digita. Preenche UF, cidade,
  bairro e endereço; **número e complemento ficam** com o operador.
- **Contatos ficam dentro do cliente** (sem item de menu): a lista mora no estado da tela e vai
  num campo oculto JSON; o servidor troca a lista inteira numa transação. **Contato digitado e
  não incluído entra junto no Salvar** (com aviso na tela) — descartar em silêncio perderia o que
  acabou de ser escrito.
- **Reorganização do formulário, 19/09/2026 (pedido do dono, feito pela frente Agente 1):**
  - **Quatro abas** — Dados cadastrais, Endereço, Contato, Dados adicionais —, no lugar dos quatro
    cartões empilhados (ver "Abas para agrupar um formulário", em "Padrões do projeto").
  - **Tipo da Pessoa** saiu da grade e virou **duas opções lado a lado no fim da barra das abas**
    (`EscolhaDoTipo`), visíveis em todas elas: o tipo decide o que aparece em três abas (Fantasia e IE
    na primeira, Sexo e Pessoas de contato em Contato). Foi pedido "ao lado do título" quando eram
    cartões; com abas, a barra é o título. São `<input type="radio" name="tipoPessoa">` de verdade,
    escondidos (`sr-only`), então entram no envio como o `<select>` entrava.
  - **"Cliente desde"** foi para "Dados adicionais".
  - **Vários telefones e e-mails** (`ListaDeValores`): um `<input>` por linha, todos com o mesmo
    `name`, lidos com `formData.getAll`. **O primeiro é o principal** e continua em
    `Cliente.telefone`/`email`; os demais vão para `telefonesAdicionais`/`emailsAdicionais`
    (`String[]`, migration `20260919_cliente_telefones_emails`). **Aditiva de propósito:** a outra
    frente usa o mesmo banco com o client antigo, e coluna nova com padrão não a quebra. Linha em
    branco sai, e-mail repetido (sem diferenciar caixa) vira um só, e o limite é 10 de cada.
    **Telefone segue o padrão de "Padrões do projeto"** (grava só dígitos, mostra `(54) 98899-0008`),
    e vale também para o telefone da pessoa de contato.
  - **Sexo e Naturalidade** foram para a seção **Contato** e só aparecem para pessoa física.
  - **"Pessoas de contato" só existe para pessoa jurídica.** Fica montada e oculta na física, mas
    **o servidor nem lê a lista e apaga a gravada** quando o tipo é física, como faz com os demais
    campos do outro tipo. Trocar para física e salvar por engano perde os contatos.
- **Transportadora preferida** é UMA, do cadastro de Transportadoras (`Restrict`). **Transportadora
  em uso por cliente não é excluída**, e o recado diz quantos clientes usam. Editar um cliente
  mantém na lista a transportadora que ele já tem mesmo se estiver inativa — senão salvar apagaria
  uma preferência que a tela nem mostrou.
- **Condições de pagamento REMOVIDAS em 21/09/2026 (pedido do dono: "a seção pode ser removida").**
  Saíram o cartão, a rota, a tabela, as ações `salvarCondicao`/`excluirCondicao` e **o campo "Condições
  de pagamento preferidas" do cliente** (sem cadastro, ele ficaria com uma lista vazia para sempre). **O
  banco NÃO mudou**: a tabela `CondicaoPagamento` e a relação `Cliente.condicoesPreferidas` continuam no
  schema, sem uso, porque apagá-las é migration (regra do schema). **`salvarCliente` não toca mais na
  relação**: gravar `set: []` apagaria em silêncio o que já estivesse ligado. Limpar o schema fica para a
  próxima migration de quem mexer nele. **O campo de TEXTO "Condições de pagamento" do fornecedor
  (`Fornecedor.condicoesPagamento`, o que ele negociou) é outra coisa e ficou.**
- **Dado pessoal (LGPD):** CPF, endereço e telefone ficam só no Postgres local e entram nos
  dumps do `npm run backup` (que ficam em `dados/`, fora do git). Nada vai a marketplace ou ERP.
- `npm run teste:cadastros`: 88 asserções (CPF, CNPJ, CEP, telefone, CNPJ obrigatório do fornecedor, a ligação fonte → cadastro e as
  indicações dos vínculos salvos; a parte
  do banco usa fontes de teste e as apaga).

**Pendências combinadas com o dono (não implementadas):**

- **Sintegra para pessoa jurídica** ("faremos essa integração depois"): puxar os dados da
  empresa pelo CNPJ. Encaixe pensado: botão ao lado do CNPJ (como a lupa do CEP), ação
  `buscarCnpj` no molde de `buscarCep` (validar antes com `validarCnpj`, base fixa, teto de tempo,
  `LogIntegracao` com um novo `Servico`, só o CNPJ sai daqui). **A decidir na hora:** qual
  serviço (o Sintegra é por estado e, até onde se sabe, não tem API pública única; pode ser
  preciso intermediário, com custo ou limite) e se o retorno sobrescreve ou só completa vazios.
- **Cobrança como terceira aba de endereço**, se ele quiser; **Contribuinte**; e as ideias que
  ficaram de fora do menu: Vendedores, Categorias de produto, Naturezas de operação (fiscal) e
  Depósitos.

## Ferramentas: imagem para SVG

Pedido do dono em 20/09/2026: bloco novo no menu, `/ferramentas`. **A barra lateral só tem o ícone e
o texto "Ferramentas", SEM cascata; as ferramentas aparecem como CARTÕES na própria página**
(`src/lib/ferramentas/catalogo.js` é a lista; `CartaoDeAtalho`, em `src/components/ui/`, desenha o
cartão, no desenho da grade "Personalizar" do Claude que o dono mostrou). É um **teste de desenho**:
**se ficar bom, vira o padrão das páginas de bloco do sistema** (**o dono aprovou e Cadastros passou a usar o mesmo desenho em 21/09/2026**; os outros blocos não têm telas
internas).
Sem submenu, a tela de cada ferramenta tem um link "← Ferramentas" para voltar.

O motivo imediato foi o **logo real do Mercado Livre**: `public/marcas/mercado-livre.svg` era um
marcador (as letras "ML" sobre um quadrado amarelo, 349 bytes). Foi substituído pelo logo gerado
**pela própria ferramenta**: 447×447, **fundo transparente** (o quadrado amarelo da imagem foi
removido; sobra o oval com o aperto de mãos), 5 caminhos, 7,6 KB, cores exatas `#2D3277 #FFD100
#FFFFFF`, erro médio de pixel 2,01 de 255. O `canais.js` o mostra via `next/image` a 22 e 16 px.

**O que o dono decidiu (20/09/2026) — só para LOGOS:**
- **Sem campos na tela.** Saíram o "Tipo de imagem" (logo, ilustração, foto, preto e branco), as
  "Opções avançadas" (cores fixas, limite de cores, transparência) e o botão "Converter": a conversão
  **começa ao escolher a imagem**. Só existe a receita de logo (`OPCOES_LOGO`).
- **Fundo sempre transparente** e **cores exatas**, os dois automáticos (ver "Como é montado").
- **Sem "Trocar cores"** e **sem redimensionar**. Só duas aparências: as **cores originais** e a
  **fosca** (cinza + 50% de opacidade, um filtro CSS sobre o mesmo arquivo, sem segundo SVG), com um
  botão "Cores originais | Fosco" na prévia. `LogoSvg` (`src/components/ui/`) tem o `estado`.
  **Quando usar o fosco (por exemplo o logo do Bling com o canal em falha) o dono ainda vai decidir:
  nenhuma tela existente o usa.** Quem já tem `<img>` ou `next/image` soma `CLASSE_LOGO_FOSCO`.
- **Salvar no banco: implementar o resto e ESPERAR O AVISO DO DONO** ("quando tiver tudo pronto e
  testado, eu te aviso"). Desenho combinado: tabela no Postgres com o texto do SVG (nome + busca,
  **sem tipo/categoria**), biblioteca listada em Ferramentas, rota que serve o SVG por nome e
  download. **Ainda NÃO existe** a tabela, a migration, o botão "Salvar" nem a biblioteca. **A
  migration segue a regra do schema** (uma sessão por vez, `git merge main` antes, e o dono ainda
  não confirmou que o Agente 1 não tem migration pendente).

**O dono indicou três repositórios; nenhum serve** (GitHub API e npm, 20/09/2026). Nenhum tem script de
instalação suspeito nem chamada de rede: o problema é utilidade e manutenção, não malícia.
- `ialoig/nodejs-png2svg`: **não vetoriza**. Compacta o PNG em RLE e gera um retângulo de 1 px por
  sequência de pixels iguais. Sem licença, 8 commits, parado desde set/2023.
- `kagof/pixel-perfect-svg`: **não vetoriza**, troca cada pixel por um retângulo (é para pixel-art).
  MIT, 5 commits, parado desde out/2021, dependências de 2021.
- `rameez543/png-to-svg`: só uma **interface React sobre `potrace-wasm`**, que é **GPL-2.0** e de
  **uma cor só** (silhueta): perderia as 4 cores do logo. Sem licença, sem testes, 9 commits. Exibe o
  SVG com `dangerouslySetInnerHTML`.

**Motor: `@visioncortex/vtracer` (WASM, sem binário nativo), no servidor.** Repositório oficial com
7 mil estrelas e push do próprio dia; MIT OR Apache-2.0. Escolhido por benchmark (20/09/2026,
rasterizando o SVG de volta contra o original com o `sharp`):

| Amostra | VTracer | imagetracerjs (Unlicense, JS puro, parado desde nov/2023) |
| --- | --- | --- |
| Logo do ML, 447×447 | **8 KB, 6 a 8 caminhos**, erro 3,2 (**2,0 com paleta fixa**) | padrão: 72 KB, 490 caminhos, erro 3,0; detalhado: 489 KB, 3.444 caminhos |
| Foto de produto, 700×700 | 3,6 a 4,5 s, 0,6 a 1,3 MB | 2,4 a 2,9 s, 1,9 a 7,3 MB |
| Ícone com degradê e sombra translúcida | **pior**: erro ~11 (cores chapadas) | melhor: erro 2 a 4 |

- **Limite conhecido:** degradê e sombra translúcida saem achatados (cores chapadas), porque a receita
  é só a de logo e a paleta é fixada. Se um dia isso doer, o plano B é o `imagetracerjs` (**não instalado**).
- **O pacote npm é ALFA** (`1.0.0-alpha.4`, 4 versões em jul-ago/2026, **sem atestado de procedência**).
  Por isso: versão **exata**, sem `^`, instalada com `--ignore-scripts`; lidos os 8 arquivos
  publicados. O JS só lê o próprio `.wasm`, e o WASM só importa funções de conferência de tipo
  (nada de arquivo, rede, relógio ou aleatoriedade): fica isolado. **Ao atualizar, reler o que mudou.**
- **Cores exatas: o vtracer sozinho as aproxima** (`#FEE500` em vez de `#FFE600`, `#FCFCFD` em vez de
  branco, `#313676` em vez de `#2D3277`), e uma marca tem cor definida. A opção `palette` dele resolve, e
  a ferramenta a alimenta **sozinha**, detectando as cores da própria imagem (`coresDaImagem`, em
  `src/lib/ferramentas/pixels.js`). Descobertas que custaram caro:
  - **Cada balde de 6 bits guarda a cor exata mais votada** (voto de maioria), e não a média: a média de
    um balde que mistura `#FFFFFF` com pixels de borda daria um quase-branco.
  - **Mistura de anti-aliasing não é cor** (`ehMistura`): a borda de um logo de 3 cores gera dezenas de
    misturas, e no logo do ML seis delas (`#D7D8E4`, `#A5A7C4`, `#E3BC21`...) passaram como cor e o SVG saiu
    com uma camada lilás fantasma. Descarta-se a cor que fica a até 40 da reta entre duas aceitas e tem
    menos de 8% dos pixels da menor das pontas (o limite protege um laranja de detalhe entre amarelo e vermelho).
  - **Tom parecido não é ruído** (`ehRuido`): até 16 de distância é a mesma cor; entre 16 e 48 só é ruído se
    tiver menos de 10% dos pixels da vizinha. Uma regra só de distância engolia o dourado `#FFD100`, que fica a
    21 do amarelo `#FFE600`.
- **Fundo transparente** (`pixels.js`): se a imagem já tem transparência, nada é apagado. Se a **borda** é de
  uma cor só (85% dos pixels da borda a até 36 da mais comum), apaga-se a região dessa cor **que toca a
  borda**: o branco DENTRO de um contorno é da arte e fica. Fundo em degradê ou foto **não é apagado às
  cegas** (apagar comeria o logo); a tela avisa "o fundo não é de uma cor só, então foi mantido".
  - **A borda do anti-aliasing é desmisturada** (`refinarBorda`), e não apagada em camada fixa: o pixel entre
    o fundo e o desenho é `fundo + p·(cor − fundo)`; acha-se a cor da paleta que melhor o explica e, se
    `p ≥ 0,5`, ele fica com essa cor, senão vira transparente. Sem isso, um pixel meio azul e meio
    amarelo-de-fundo caía no dourado e o logo de contorno azul ganhava um **filete dourado**; e uma camada
    fixa de halo afinava o contorno.
  - Imagem de uma cor só (tudo seria fundo) dá o recado "toda transparente".

**Como é montado**
- `src/lib/ferramentas/presetsSvg.js` (constantes e a receita de logo, sem imports: tela e servidor o
  leem), `src/lib/ferramentas/pixels.js` (fundo e cores, sem imports, testável sozinho) e
  `src/lib/ferramentas/imagemParaSvg.js` (só servidor: `sharp` e o WASM). A Server Action
  (`src/app/ferramentas/acoes.js`) só confere o envelope; a tela é `src/components/ferramentas/ImagemParaSvg.jsx`.
- **O vtracer nunca recebe o arquivo do usuário.** Quem decodifica é o `sharp` (libvips), que reduz o
  lado maior a 2048 px (o WASM roda **na thread do servidor** e bloqueia durante a conversão: um logo leva
  menos de 1 s, mas uma foto de 700 px levou 4 s) e aplica a orientação do EXIF. O WASM só vê RGBA.
- **Tipo pelos BYTES** (PNG, JPEG, WebP), nunca pelo `type` do navegador nem pela extensão. Limite de
  10 MB (o corpo de Server Action aceita 24 MB), conferido na tela, na action e na lógica.
- **Teto de pixels (40 milhões) conferido pelo cabeçalho, ANTES de decodificar.** O `sharp` lê as
  dimensões de um PNG falso de 50.000×50.000 sem reclamar e só recusa no decodificador, com um "arquivo
  corrompido" que não diz o que houve. A bomba real do teste é um PNG **válido** de 7000×6000 que
  comprime a 40 KB.
- **O SVG de saída é conferido** (`motivoDeSvgInseguro`: sem `<script>`, `<foreignObject>`, `<image>`,
  `<use>`, `on...=`, `href`, DOCTYPE) e mostrado só por `<img src="blob:...">`, **nunca**
  `dangerouslySetInnerHTML`. Nada é gravado em disco nem no banco, e o download é um `Blob` no navegador.
- **`sharp` e `@visioncortex/vtracer` estão em `serverExternalPackages`** (`next.config.mjs`): o pacote do
  wasm-pack lê o próprio `.wasm` do disco, e empacotado o caminho se perde (o mesmo defeito do `pdf-parse`).
- **`sharp` agora é dependência DECLARADA.** Antes só existia como opcional transitiva do `next` e
  sumiria num deploy Linux/VPS. Fixado em **0.35.5** desde 07/10/2026: a 0.35.3 tinha aviso ALTO (libheif) e a
  0.35.4 outro (librsvg, GHSA-wq5f-xc86-pv6w).
- **Testes:** `npm run teste:svg`, 60 asserções, sem rede e sem banco, com as imagens geradas pelo
  próprio `sharp`. Cobre a bomba de descompressão, SVG e HTML disfarçados de imagem, PNG truncado,
  foto girada por EXIF, fundo transparente (amarelo, branco, já transparente, degradê), o branco de
  dentro do logo preservado, ausência de filete dourado na borda, cores exatas e SVG de saída perigoso.

**`npm audit` (20/09/2026) acusou avisos que JÁ existiam, fora desta feature** (o `sharp` e o VTracer
não aparecem): **`next` 16.3.1 com dois avisos CRÍTICOS de execução remota** (um específico de servidor
Windows; correção 16.3.5, sem mudança de versão maior), `image-size` (alto, usado no upload de imagens de
produto) e outros menores. **Resolvido em 07/10/2026** (Task 1 da migração para a VPS): `next` e
`eslint-config-next` 16.3.8 (o audit daquele dia já estendia a faixa crítica até 16.3.7), `sharp` 0.35.5 e
`image-size` 2.0.4; lint e os testes extracao, svg, cotacao, loja-integrada, cadastros, imagens e li-sync
passaram. Os avisos que sobraram são de ferramentas de desenvolvimento (`prisma` CLI, `eslint`), que não rodam
no site. **O dev server também escuta na rede local** (`Network: https://<ip>:3001`).

## Ferramentas: cotação do dólar

Pedido do dono em 21/09/2026: uma tela em Ferramentas (`/ferramentas/cotacao-dolar`, cartão em
`src/lib/ferramentas/catalogo.js`) que coleta o dólar do dia e o mostra em gráfico, para uso no sistema
interno. **Por que interessa à loja:** o custo dos fornecedores (a "reserva" da Fortek é o que ainda vai
chegar) e os preços dos concorrentes seguem o câmbio, e o sistema só tem valores em reais. **Bitcoin e
euro ficaram de fora** (o dono ficou só com o dólar; bitcoin não tem ligação com o custo da loja).

**O que o dono decidiu:** só o dólar; **não guardar no banco agora** (o BC guarda o histórico inteiro;
sem migration e sem tocar no schema); **gráfico em SVG próprio, sem biblioteca** (nenhuma dependência
nova). Guardar a cotação e usá-la em outras telas (custo do fornecedor, margem) fica para quando houver
uma tela que a use.

**Fontes (conferidas em 21/09/2026, todas sem chave):**
- **PTAX do Banco Central** (Olinda, `CotacaoDolarPeriodo`): o dólar oficial, **um valor por dia útil**
  (fecha por volta das 13h), com o histórico inteiro. Alimenta o gráfico (a **venda**) e a tabela dos
  últimos dias. **A data na URL é `MM-DD-AAAA`**; fim de semana e feriado não têm linha, e por isso o
  gráfico espaça os dias úteis por igual, sem eixo de calendário.
- **AwesomeAPI** (`/json/last/USD-BRL`): a cotação de **agora**, em tempo real. **Passou a recusar com
  429 (`QuotaExceeded`) depois de poucas consultas sem chave** — medido no mesmo dia em que a tela foi
  feita, e o aviso de limites dela nem abre. Com chave gratuita (cadastro em awesomeapi.com.br) são 100 mil
  consultas por mês, enviada no header `x-api-key`. **O token vai na linha `AWESOMEAPI_TOKEN` do `.env`** (ver
  "O token da AwesomeAPI" abaixo).
- **Reserva do "agora": o último boletim do PTAX** (`CotacaoMoedaPeriodo`, moeda USD). O BC divulga de hora
  em hora, das 10h às 13h. Quando a AwesomeAPI falha, o cartão "Dólar agora" mostra o boletim e diz isso
  ("boletim do BC de 21/09 13:06"), e a AwesomeAPI fica **10 minutos de lado** em vez de gastar 2 s de
  espera a cada clique. **Depois das 13h o "agora" do boletim é igual ao PTAX do dia**: o tempo real só vem
  com a chave. O boletim não traz máxima, mínima nem variação do dia, e o cartão não as mostra.

**Como é montado**
- `src/lib/ferramentas/cotacao.js` (**sem imports**, lido pela tela, pela Server Action e pelo teste):
  períodos (7 dias, 30 dias, 90 dias, 1 ano), URLs, leitura das respostas, variação e a conta do gráfico.
  **Linha do PTAX fora do formato é descartada** (zero, negativo, texto no lugar de número, data ruim), e
  resposta sem nenhuma linha boa vira erro: nunca gráfico com lixo. `Number("")` é 0, então
  `numeroPositivo` recusa vazio e espaço antes de converter.
- `buscarCotacaoAcao(periodo, forcar)` em `src/app/ferramentas/acoes.js`. **Do navegador só vem o período**,
  conferido contra a lista (`intervaloDoPeriodo`); os endereços são fixos. Tempo limite de 8 s e teto de
  2 MB por resposta. As duas consultas são independentes: uma falhar não derruba a outra, e só as duas
  juntas dão erro. **Memória de 1 h para o PTAX e de 60 s para o "agora"**, só de resposta boa (falha de rede
  não fica grudada); o botão Atualizar ignora a memória. **A "data de hoje" é a de `America/Sao_Paulo`**:
  perto da meia-noite o UTC já é o dia seguinte.
- **A primeira carga vem pronta do servidor** (`page.jsx` chama a ação e passa o resultado): sem tela vazia
  e sem `setState` em efeito. Depois só se consulta ao trocar o período ou apertar Atualizar.
- **Sobe é vermelho, desce é verde**: é o que importa a quem compra em dólar (a alta encarece o custo do
  fornecedor). O inverso de um gráfico de bolsa, e a tela diz isso.
- **O gráfico é desenhado na largura real do quadro** (`ResizeObserver`), não num `viewBox` que encolhe:
  no celular o texto dos eixos ficaria ilegível. **O eixo Y não começa do zero** (o dólar varia centavos e
  a linha ficaria reta). Valor e data do ponto aparecem numa linha **acima** do gráfico, não num balão:
  serve igual ao mouse e ao teclado (setas percorrem os dias, Esc volta ao último).
- **O token da AwesomeAPI vai SÓ no `.env`** (`AWESOMEAPI_TOKEN=`, linha já criada vazia no `.env` e no
  `.env.example`). **Pedido do dono em 21/09/2026**: ele pediu a linha no `.env`, e uma primeira versão
  criou por engano um cartão na tela para colar o token, guardado cifrado em `dados/config/`; foi **removida**
  a pedido dele, para não haver dois lugares onde o token possa estar. `buscarAgora` lê
  `process.env.AWESOMEAPI_TOKEN` a cada consulta, mas **o `.env` só é relido na partida do servidor**:
  depois de colar o token, reiniciar. Sem token (ou com token recusado), o "agora" cai no boletim do BC.
  - **Lição que ficou da versão removida:** o `next dev` **imprime no terminal os argumentos de toda Server
    Action** (`salvarTokenAcao("...")`), então segredo passado a uma ação sai inteiro no log. Mandar num
    `FormData` faz o log mostrar só `({})`. Vale para qualquer segredo, em qualquer tela.
- **`Card className="p-0"` NÃO zera o padding**: a classe `p-5` do próprio `Card` também vale e vence.
  Para uma caixa sem padding (a tabela dos últimos dias), usar um `<div>` com as mesmas classes de borda.
- **Sem `LogIntegracao`.** O enum `Servico` não tem valor para o BC nem para a AwesomeAPI, e acrescentar é
  migration (o dono pediu sem schema). A regra "toda chamada externa é auditada" fica **em aberto** aqui e
  entra junto com o banco, se um dia a cotação for guardada. Falha vai para o log do servidor
  (`[cotacao] ...`).
- **Testes:** `npm run teste:cotacao`, 86 asserções, sem rede e sem banco: datas (virada de mês e de ano,
  bissexto, meia-noite em São Paulo), período fora da lista recusado, PTAX e boletim com resposta boa, fora
  de ordem, repetida, com lixo e vazia, "agora", variação e as coordenadas do gráfico (um ponto só, série
  reta, série vazia, 250 dias, quadro minúsculo).

## Rodar na VPS (migração de 08/10/2026)

O Rise de produção roda numa VPS da Hostinger (KVM 2, Ubuntu 26.04), em **https://rise.4hobby.com.br**, com login na
frente de tudo. Spec: `docs/superpowers/specs/2026-10-07-migracao-vps-hostinger-design.md`; plano:
`docs/superpowers/plans/2026-10-07-migracao-vps-hostinger.md`. **A virada aconteceu em 09/10/2026 (06:25 a 07:25): o banco de verdade é o da VPS.** O PC recebeu o dump final, e hoje o
  banco e `dados/` do PC são uma CÓPIA para desenvolver: o que se muda lá se perde na próxima `copia:atualizar`. **Nunca
  ligue o worker NORMAL no PC** (coletar nos dois lados duplicaria a varredura; quem coleta é o worker da VPS). A única
  exceção é `npm run worker:pc`, restrito às fontes marcadas e apontado para o banco da VPS (ver "Fonte que bloqueia a VPS"). Janela de volta
  atrás até 11/10/2026: na VPS ficam `dados/produtos.antes` e `dados/coleta.antes` (as pastas do ensaio) e os dumps
  `ensaio-antes-da-virada.dump` e `pc-final-da-virada.dump` em `dados/backup/`; **apagar tudo isso depois da janela**. O
  snapshot da Hostinger de 09/10 06:25 expira em 10/10.

- **O que a virada ensinou** (09/10/2026): (1) o Git Bash do PC **não tem `rsync`**: arquivos vão por `tar` dentro do
  `ssh` para pastas `.novo`, conferidas por contagem e bytes e trocadas com a VPS parada; (2) `pg_dump`/`pg_restore` recusam o
  `?schema=public` do `DATABASE_URL` do Prisma: dentro do contêiner use `"${DATABASE_URL%%\?*}"`; (3) `docker compose
  run/exec` sem `-T` ou sem `< /dev/null` engole o resto de um script passado ao `ssh bash -s`; (4) o dump do PC traz os
  tokens dos apps do PC: depois do restore, apagar as `Conexao` do ML e do Bling e **conectar de novo pela tela**
  (a Loja Integrada, de token fixo, fica); (5) **o Banco Central (Olinda) responde 403 a qualquer pedido com `$select` a
  partir da VPS** (IP de datacenter; um campo só e a vírgula codificada também), e 200 ao mesmo pedido sem ele, por isso a
  cotação do dólar não usa `$select`; (6) para rodar um script do projeto dentro do contêiner, registrar o resolvedor
  (`register(new URL("file:///app/scripts/resolver-alias.js"), pathToFileURL("/app/"))`) antes de importar `@/lib/...`.
  A primeira varredura na VPS (Easytronics, 356 produtos) levou 13 min sem bloqueio, e nenhuma das 23 fontes bloqueou o IP.
- **Outra sessão do Claude pode religar o PC.** Em 09/10/2026 a sessão `Rise_Manager` subiu servidor e worker no PC no meio
  da virada (06:47 e 06:48) e o `copia:atualizar` recusou, corretamente. Quem religar o PC: servidor sim, **worker normal nunca**.
- **Fonte que bloqueia a VPS: "Varrer pelo PC"** (decidido com o dono em 09/10/2026, a pedido: a Oceantech, cuja
  Cloudflare desafia o IP de datacenter e deixa passar o de casa; outros virão). Em vez de copiar dados entre os bancos,
  **o worker do PC grava direto no banco da VPS**, então não há merge e os produtos aparecem na VPS na hora.
  - **A marca:** `FonteColeta.varridaNoPc` (migration `20261009_fonte_varrida_no_pc`), ligada pelo botão **"Varrer pelo
    PC"** na linha da fonte (tela Fontes, na VPS) ou pelo botão "Cadastrar para varrer pelo PC" do formulário (abaixo).
    Marcada, o worker normal (o da VPS) a **ignora** (pega, recolhe e fecha só as outras). **Na VPS, o botão "Varrer
    agora" dela some e dá lugar ao rótulo "Varredura só pelo PC"** (pedido do dono: a VPS não alcança o PC, que está na
    rede de casa), e o botão "Varrer pelo PC" some (o "Devolver à VPS" saiu a pedido do dono em 09/10/2026: um clique
    por engano mandaria a fonte de volta à VPS que ela bloqueia; desmarcar, se o site parar de bloquear, é
    `definirVarridaNoPc(id, false)` por script). `varrerFonteAgora` recusa a fonte do PC, e o "Atualizar
    dados" da VPS a pula. O interruptor só aparece na VPS: no PC a marca iria para a cópia, que a `copia:atualizar` apaga.
    O texto de `src/lib/coleta/soLocalhost.js` (a lista de sites que a Cloudflare barra, medida em 09/10/2026) continua
    sendo só o aviso; quem decide é a marca.
  - **Como varrer: "Varrer agora" no Rise do PC** (pedido do dono em 09/10/2026: "abrir o Rise no meu PC e clicar em
    Varrer agora desse concorrente, e todo o processo se inicia sozinho"). No Rise do PC (sem `RISE_PRODUCAO`), a fonte
    marcada mostra "Varrer agora", que chama `varrerPeloPcAgora` → `iniciarWorkerPc` (`src/lib/coleta/workerPc.js`): liga
    `scripts/worker-pc.js --fonte=<id>` **destacado** (sobrevive a um reinício do `next dev`, sem janela de console), que
    varre **só aquela fonte**, grava direto na VPS e termina sozinho. A fonte tem que estar marcada e ativa **no banco da
    VPS** (o id é o mesmo da cópia): se não estiver, o worker sai com 5 e a tela diz por quê. O andamento não vem da fila
    da cópia, e sim de `dados/worker-pc.estado.json` (o botão grava o começo; o `worker-pc.js`, o fim com código e motivo):
    a linha mostra "Varrendo pelo PC" e "Pelo PC desde 16:16", e depois "Pelo PC (16:40): Concluída." ou o motivo em
    vermelho. Um worker do PC por vez (o botão recusa e a porta 55432 também). Saída do script em
    `dados/logs/worker-pc-botao.log`. **Limite:** a fonte só aparece no PC depois de a cópia ser atualizada
    (`copia:atualizar`). O supervisor do PC **desiste depois de 3 quedas seguidas** (ex.: a VPS sem a coluna nova), em vez
    de religar para sempre com o túnel aberto.
  - **Pelo terminal** (continua valendo): `npm run worker:pc` (`scripts/worker-pc.js`) põe na fila TODAS as fontes
    ativas marcadas (`enfileirarFontesDoPc`), varre e **termina sozinho quando não sobra job aberto delas** (código 6, que
    o supervisor trata como sucesso); `npm run worker:pc -- --ficar` o mantém no ar. Por dentro: lê o `DATABASE_URL` da
    VPS por SSH **só em memória**, abre um túnel SSH na porta local **55432** (nunca a 5432 do Postgres do PC, para um engano de porta não
    apontar o PC para a VPS) e sobe o supervisor com `COLETA_SO_PC=1` e esse endereço **só no ambiente do filho**. A senha do
    banco da VPS nunca vai para o `.env` nem para o disco. `Ctrl+C` encerra e devolve as varreduras à fila; o túnel só fecha
    depois (`detached`, para o Ctrl+C não derrubá-lo antes). Log em `dados/logs/worker-pc-AAAA-MM-DD.log`.
  - **Três modos, três travas do Postgres** (`travaDoWorker`): o normal, o de teste (`COLETA_FONTES`) e o do PC
    (`COLETA_SO_PC=1`) convivem no mesmo banco. O do PC **não tira a foto mensal** (é do worker da VPS) e nunca se
    combina com `COLETA_FONTES`. **Ele recusa subir contra um banco do Windows** (a cópia local): a varredura iria para uma
    cópia que a próxima `copia:atualizar` apaga (`SAIDA_CONFIGURACAO` = 5, que o supervisor não religa).
  - **O PC desligou no meio da varredura:** o job fica sem sinal, e depois de 2 minutos o worker da VPS o recolhe e a tela
    deixa de dizer "varrendo". Na PARTIDA o worker da VPS não recolhe job de fonte do PC (pode ser de um worker vivo).
  - **A `copia:atualizar` só aceita o Postgres do Windows.** Conferir só o nome do host não bastava: o túnel aparece como
    `localhost`, e a cópia apagaria o banco da VPS. Hoje ela lê `SELECT version()` (`servidorEhWindows`) e recusa o resto.
    Provado com um túnel de verdade em 09/10/2026: recusou no primeiro passo e o banco da VPS ficou intacto. Fecha a
    pendência de segurança 5.
  - **Cadastrar a fonte:** o formulário **esconde o Salvar quando o teste falha**, e o teste da VPS é barrado pelo site.
    Por isso, na falha, aparece **"Cadastrar para varrer pelo PC"** (só site: nunca arquivo nem portal com login): grava a
    fonte **sem teste**, já marcada e **ativa**, sem ler o robots.txt daqui (`soNoPc` em `salvarFonteInterna`). A extração se
    confere com "Buscar dados" na tela do PC, que passa do IP de casa. O robots.txt é conferido a cada visita, em qualquer
    lugar, e o worker do PC o confere de casa. Dado de teste: domínio `.invalid` é
    tratado como "só arquivo" e não vale como site de teste. O user-agent e o ritmo continuam os de sempre: **nada de disfarce**, e a regra
    "desafio anti-bot não se contorna" continua valendo para quem barra também o IP de casa (Makerhero).
- **Código novo que muda o banco chega à VPS pelo deploy, nunca pela cópia do banco.** A migration é um arquivo SQL em
  `prisma/migrations/` que vai no commit. O `deploy-vps.sh` roda `prisma migrate status` na VPS e, se há migration
  pendente, **tira um backup antes** e aplica só as que faltam (`migrate deploy`), em ordem, **sem tocar nos dados**. Fluxo:
  mexer no `schema.prisma`; gerar o SQL com `migrate diff` (tirando as linhas que apagam os índices que só existem no SQL);
  aplicar no banco do PC; commitar a pasta; push; deploy. **Migration não tem volta** (só pelo backup tirado antes), então
  deve ser aditiva (coluna nova com padrão, tabela nova); renomear ou apagar coluna em dois passos, para o código antigo
  não quebrar nos segundos entre a migration e a troca dos contêineres. Depois de uma `copia:atualizar` o banco do PC volta
  ao estado da VPS: migration criada no PC e ainda não deployada precisa de `npx prisma migrate deploy` de novo.
- **Subir o banco do PC para a VPS apagaria tudo o que a VPS gravou** (restore = apagar e recriar; não existe merge):
  coleta, histórico de preço, fotos mensais, ajustes de estoque, tokens. Só se fez na virada, uma vez. Dado criado no PC
  que precise ir para a VPS: refazer pela tela da VPS, ou um script que envia só aquela tabela.
- **Acesso:** `ssh -i ~/.ssh/rise_vps rise@179.199.150.221` (só chave; root e senha desligados; firewall 22/80/443). O
  projeto fica em `/srv/rise/app` (clone deste repositório), com o `docker-compose.yml`: `db` (Postgres 17, porta só em
  127.0.0.1), `app`, `worker` (mesma imagem), `auth` (Tinyauth, o login) e `caddy` (HTTPS e roteamento). O `.env` da VPS
  é um arquivo à parte, nunca passa pelo git: chave nova ou trava mudada se grava lá por SSH (arquivo temporário lido
  por um script, **nunca no texto de um comando**) e depois `docker compose up -d --force-recreate app worker`.
- **Deploy só quando o dono disser "sobe":**
  `ssh ... "cd /srv/rise/app && git fetch -q --tags origin && git checkout -q --detach origin/main && ./deploy/deploy-vps.sh"`
  (baixar antes de rodar, porque o próprio script pode ter mudado). Ele valida o Caddyfile, constrói a imagem com o site
  no ar, tira backup e aplica migrations só se houver pendência, troca os contêineres, recarrega o Caddy, confere o site
  por dentro e **o login por fora com falha de verdade** (6 respostas, no fim do script), e só então guarda a imagem como
  `rise:bom`, grava `~/logs/deploy.log` (no host, fora de `dados/`) e reinstala o crontab. Se parar no meio, o `trap` diz o passo e os comandos
  de volta. **Volta atrás:** `docker image tag rise:anterior rise:latest && docker compose up -d app worker` (a anterior
  é a do último deploy que passou em tudo). Migration não tem volta: só pelo dump tirado antes dela.
- **Cartão "Servidor VPS" em Integrações** (pedido do dono em 09/10/2026): os dois caminhos acima por botão, **só no Rise
  do PC aberto em localhost** (`ehOPcDeDesenvolvimento`: nunca na VPS, que tem `RISE_PRODUCAO`, nem pela rede local; a
  página só mostra o cartão nesse caso, e as ações em `src/app/integracoes/acoes-vps.js` conferem de novo). Regras puras em
  `src/lib/vps/regras.js` (teste `npm run teste:vps`), conversa com git, SSH e processos em `src/lib/vps/executar.js`, estado
  da operação em `dados/vps-operacao.json`. **É um cartão da grade, no desenho dos conectores** (pedido do dono no mesmo
  dia): mostra selo, versão no ar, o que falta subir e as varreduras; **clicar abre a janela com tudo** (os dois botões, as
  confirmações e o andamento). O estado mora no cartão, então o selo diz "Atualizando" com a janela fechada. Aparece
  mesmo com o banco do PC fora do ar (é quando trazer o da VPS resolve).
  - **"Atualizar a VPS"** = o "sobe" do dono. Mostra o que está no ar (versão e commit do `~/logs/deploy.log`), os commits
    da origin/main que a VPS ainda não tem, as migrations entre os dois e as varreduras rodando. Liga o deploy NA VPS em
    segundo plano (`setsid nohup`, log em `~/logs/deploy-botao-AAAAMMDD-HHMMSS.log` com a linha final `== FIM codigo=N`),
    baixando o código antes de rodar o script, e a tela acompanha os passos (`== ...` do `deploy-vps.sh`) e mostra o
    resultado ou o passo que parou com os comandos de volta. **Arquivo sem commit e commit não enviado são AVISO**, não
    bloqueio: várias sessões trabalham nesta pasta, e o que é só do PC não sobe (o aviso diz isso). Bloqueiam: VPS sem
    resposta, deploy já rodando, outra operação, e a VPS já no commit do GitHub. A situação é lida de novo no clique.
  - **"Atualizar banco do PC"** liga o ajudante destacado `scripts/vps-copiar-banco.js`: tira um dump de AGORA do banco da
    VPS pela saída do SSH (`pg_dump` dentro do contêiner `db`, `< /dev/null`; nada fica na VPS; 84 MB em ~20 s, medido),
    para os servidores de desenvolvimento das portas 3000/3001/3002 (a cadeia inteira do `npm run dev`, subindo pelos pais
    `node`/`cmd` com next/npm no comando; nunca o Claude, o terminal, o próprio ajudante nem um `worker*.js`, que pode estar
    varrendo para a VPS), roda o `copia:atualizar --dump=<arquivo>`, aplica as migrations deste código que a VPS ainda não
    tem (`prisma migrate deploy`) e religa o servidor DESTA pasta (o das outras pastas fica parado, e a tela diz). O dump
    sai em `dados/backup/vps-agora-*.dump` e é apagado no sucesso. Log em `dados/logs/vps-copia-botao.log`; o servidor
    religado escreve em `dados/logs/servidor-dev-botao.log` (ele roda sem janela; para pará-lo, o Gerenciador de Tarefas
    ou um novo clique).
- **Versão no pé do menu:** na VPS é a hora do deploy (`DD.MM.AAAA.HH.MM`) e o commit; no PC é `dev` mais a hora do
  último commit (`+` se há alteração não commitada). **Mesmo commit nos dois = mesmo código**; a hora só dá a ordem.
- **Dois apps de OAuth por plataforma:** o app do PC (redirect em `localhost`/`localtest.me`) e o da VPS (redirect em
  `rise.4hobby.com.br`), cada um com as chaves no `.env` do seu ambiente. O token gravado leva o `clientId` do app, e o
  `copia:atualizar` só devolve ao PC o token do app do PC. **Na virada, o dump traz os tokens do app do PC:** conectar o
  ML e o Bling de novo na VPS (tela Integrações).
- **Travas:** o `.env` da VPS tem as mesmas do PC (`BLING_ESCRITA` só para o 100101; `PHOTOROOM_COMPRA` e
  `NANO_BANANA_GERACAO` ligadas); `ML_PUBLICACAO` e `LI_ESCRITA` desligadas.
- **Backups, 3 camadas:** (1) 03:00, `deploy/backup-diario.sh` = `npm run backup` dentro do `app` (guarda 4,
  `BACKUP_MANTER`); (2) 03:30, `deploy/backup-externo.sh` copia o dump e espelha `dados/produtos` e `dados/coleta` para o
  Cloudflare R2 (bucket `rise-backup`: `banco/diario` 30 dias, `banco/mensal` 12 meses, o primeiro do mês que der certo,
  e `apagados/<AAAAMMDD>` 30 dias **pela data da pasta**, não pela data do arquivo); (3) o backup semanal da Hostinger e
  um snapshot manual na véspera da virada. As duas primeiras avisam o healthchecks.io (e-mail se falharem ou não
  rodarem). `npm run copia:atualizar` traz o dump do R2 para o banco do PC.
- **Superfície pública, o que NÃO se afrouxa** (revisão de segurança de 08/10/2026):
  - Só `GET`/`HEAD` de `/api/arquivos/<SKU>/<imagens|documentos|certificados>/<32 hex>.<ext>` passam sem login
    (`deploy/caddy/Caddyfile`); o resto cai no Tinyauth, a pasta `reserva` inclusive (só a tela, que tem login, a usa).
    O Caddy tira `Remote-*` de fora em todos os ramos (os níveis de acesso vão ler esses cabeçalhos) e registra os
    acessos do host do Rise (`log`, no log do Docker, com o `code` e o `state` do retorno do OAuth trocados por
    `REDACTED` e o IP mascarado em /24 e /48: o IP inteiro de quem abre uma foto da loja é dado pessoal).
  - **Todo pedido do servidor a um endereço que veio de texto de terceiro** passa pelo filtro de rede pública
    (`src/lib/redePublica.js`): documento de referência, foto de concorrente **e a coleta inteira** (link de página,
    `<loc>` de sitemap, `Sitemap:` do robots.txt, redirecionamento). O filtro mora no **`obter` de `coleta/http.js`**:
    `lookupPublico` no agente (confere o IP quando a conexão é criada, e o socket reaproveitado já foi conferido) e
    `validarEnderecoPublico` (documento, sem porta) ou `validarEnderecoDeBusca` (foto e coleta, portas 80, 443, 8080 e 8443)
    em cada salto. **É o padrão**: `obter` sem opções já filtra. Só o teste do worker, que varre uma loja falsa em
    127.0.0.1, o desliga com `COLETA_PERMITIR_REDE_LOCAL=1` (lida a cada chamada; nunca desliga o que um chamador pediu
    explicitamente; **a imagem de produção a ignora**, porque carrega `RISE_PRODUCAO=1` (fixo no Dockerfile, não depende
    de build-arg), e o `deploy-vps.sh` recusa um `.env` que a contenha; por isso o `teste:worker` não roda dentro da
    imagem de produção). Nunca `fetch` direto: o servidor alcança `app`, `auth` e `db` pela rede do Docker (provado em
    produção: os quatro nomes são recusados). IPv6 por **lista permitida** (só 2000::/3, menos documentação, Teredo,
    6to4 e 3fff::/20), e o ponto final do nome (`localhost.`) é tirado antes das regras de nome interno.
    `http://[::1]/` passava no filtro antigo, porque o `URL` devolve o host de IPv6 com colchetes. Link de página só é
    seguido se for da **mesma origem** (`mesmaOrigem` em `coleta/descobrir.js`): com `startsWith`, a origem
    `https://loja.com.br` aceitava `https://loja.com.br.atacante.com`.
  - O Next já entrega os segmentos de rota **decodificados**: decodificar de novo lança `URIError` (500 numa rota
    pública).
  - **Arquivo de `dados/` numa `Response` sai por `fluxoDeArquivo` (`src/lib/arquivos.js`), nunca por
    `createReadStream` direto.** O Next não lê nem cancela o corpo de um HEAD, e o `createReadStream` abre o arquivo na
    construção: 300 HEAD deixaram 300 descritores abertos em produção (medido), e o Caddy deixa HEAD passar sem login.
    O fluxo é preguiçoso (abre na primeira leitura; precisa de `highWaterMark: 0`, senão o `ReadableStream` já faz um
    `pull` na criação) e o `teste:imagens` confere.
- **Pendências de segurança que dependem do dono** (nenhuma bloqueia a virada): (1) segundo fator (TOTP do Tinyauth) e
  senha de 16+ caracteres: o login é o único portão, e atrás dele estão tokens com escrita em 1.007 anúncios reais e CPF
  e endereço de clientes; (2) **guardar a `ENCRYPTION_KEY` num cofre de senhas**: sem ela os tokens do dump viram lixo;
  (3) criptografar o dump antes de ir ao R2 (`rclone crypt`): ele leva CPF e endereço de clientes, hoje protegidos só
  pelo token do bucket; (4) endurecer os contêineres depois da virada: rodam como root e `app`/`worker` recebem o `.env`
  inteiro; `USER node` exige `chown` de `dados/`, e `cap_drop: ALL` sem isso impediria gravar; as imagens `caddy:2`,
  `tinyauth:v5` e `postgres:17` têm tag flutuante; (5) **RESOLVIDA em 09/10/2026:** a `copia:atualizar` agora exige que o
  servidor do banco seja o Postgres do Windows (`servidorEhWindows`), porque o túnel do `worker:pc` aparece como
  "localhost"; (6) o app não confere o login sozinho (sem
  `proxy.js`): entra com os níveis de acesso; (7) sem limite de taxa na rota pública (o Caddy puro não tem; o fluxo em
  disco já tirou o risco de memória, e o `log` do Caddy dá a trilha de quem pede o quê, mas gira em 5 arquivos de 10 MB:
  quem varre a rota expulsa a trilha em minutos; para guardar mais, `output file` com `roll_keep`); (8) o mapa de
  apelidos do OAuth (`bling`/`mercadolivre`) está copiado em 3 lugares; (9) **o dump nasce dentro do contêiner e o
  `copia:atualizar` o restaura no PC com o superusuário do Postgres**: um dump forjado por quem controlasse o contêiner
  rodaria SQL arbitrário na máquina do dono. Hoje o risco depende de o contêiner já estar comprometido; o caminho é
  restaurar com um papel sem superusuário.
- **O host não escreve onde o contêiner escreve.** O contêiner roda como root e `dados/` é de escrita para ele: quem o
  controlasse trocaria um arquivo dali por um link, e um `>>` do host (o cron roda como `rise`, que tem sudo) escreveria
  onde não deve. Por isso os logs do HOST (`deploy.log`, `cron.log`) ficam em `/home/rise/logs/` (o deploy cria a
  pasta), e não em `dados/logs/`, onde ficam só os que o contêiner escreve (`worker-*.log`, `backup.log`). Escrita nova
  do host dentro de `dados/` não entra.

## Trabalho em paralelo: worktrees

Desde 18/09/2026 o dono trabalha em **duas sessões ao mesmo tempo**, cada uma no seu **worktree**
(uma segunda cópia da pasta, ligada ao mesmo histórico do git, com branch própria). O que uma
sessão edita não aparece na outra até o merge.

**"Agente 1" e "Agente 2" são o nome que o dono dá às duas FRENTES de trabalho (as duas
sessões), não a agentes de nuvem nem a subagentes.** O nome não diz a área: a área de cada uma é
combinada a cada vez (até 18/09/2026, Agente 1 = Produtos e Agente 2 = Cadastros). Era
`produtos`/`cadastros` no primeiro dia; renomeado a pedido dele no mesmo dia.

| Pasta (em `C:\00-Dev\Projeto_sistema_Rise\`) | Branch | Frente | Servidor |
| --- | --- | --- | --- |
| `sistema-rise` | `main` | integração: merges, testes finais, **worker** | livre (usar 3002) |
| `sistema-rise-agente-1` | `agente-1` | frente 1 (hoje: Produtos, anúncios) | **3000** (`sistema-rise`) |
| `sistema-rise-agente-2` | `agente-2` | frente 2 (hoje: Cadastros) | **3001** (`sistema-rise-3001`) |

**Perguntas que ele já fez, com a resposta:**

- **Quem altera o banco?** As duas podem, **uma de cada vez** (regra do schema, abaixo). Não há
  uma frente "dona" do banco.
- **Uma sessão depende da outra?** Não para trabalhar: cada uma edita, roda e testa sozinha. Só
  se encontram no banco (regra do schema) e no merge final.
- **Mudar na frente 1 altera o Rise da frente 2?** O **código não**: são pastas e branches
  separadas, e só chega lá com o merge na `main` seguido de `git merge main` na outra. O **banco
  e o `dados/` SIM**, na hora: são um só. O que uma frente grava aparece na outra, e uma migration
  aplicada muda o banco das duas (a outra só não conhece as tabelas novas no código).

- **O que é copiado e o que é compartilhado:** `.env` e `certificates/` são **cópias** (o git os
  ignora). O `ENCRYPTION_KEY` do `.env` tem que ser o mesmo nas três pastas, senão os tokens
  cifrados no banco viram lixo. `dados/` é um **atalho (junction) para o mesmo `dados/`**: o banco
  é um só, e as imagens de produto e os originais de fornecedor que ele aponta têm que ser os
  mesmos arquivos. `node_modules` e `src/generated` são de cada pasta (`npm ci` em cada uma).
- **A porta 3000 é da frente 1** (que hoje cuida de Produtos e anúncios) porque o OAuth do
  Mercado Livre depende dela. Quem usa
  a 3001 (`launch.json` → `sistema-rise-3001`) não consegue refazer OAuth, mas o resto funciona.
- **REGRA DO SCHEMA — o banco é um só e o `migrate diff` compara o banco VIVO com o schema da
  sua pasta.** Se a sessão A aplicou uma migration e a B ainda não tem o schema dela, o diff da B
  propõe **`DROP TABLE` das tabelas novas da A**. Portanto: (1) **só uma sessão mexe no schema por
  vez**; (2) a que terminou faz o merge na `main`; (3) a outra faz `git merge main` **antes** de
  gerar a migration dela; (4) depois de qualquer migration, `npx prisma generate` e **reiniciar o
  servidor** nas outras pastas. Conferir o SQL do diff antes de aplicar (já pede edição à mão por
  causa dos índices que só existem no SQL).
- **Worker só sobe da pasta principal (`main`)**: ele roda o código da pasta onde foi iniciado, e
  dois workers disputariam a fila (o segundo sai com código 3). Mudança em `src/lib/coleta/*` só
  vale no worker depois de chegar à `main` e ele ser reiniciado.
- **CLAUDE.md:** cada sessão escreve só na seção da sua frente, para o merge não gerar conflito.
- **Cruzamentos das duas frentes**, feitos por UMA sessão só depois de a outra ter feito o merge:
  o campo Marca do produto usando o cadastro de Marcas, `ProdutoConcorrente.concorrenteId`, e o
  fornecedor do produto lendo o cadastro de Fornecedores.
- **Ritual de fim de sessão:** cada sessão commita e dá push na **sua** branch; o merge na `main`
  é feito na pasta principal.

## Trabalhando neste projeto

- Verifique com evidência: consulte a API real (leitura é segura), meça nos logs, teste o
  caminho de erro — não só o feliz.
- Prefira `Edit` a reescrever arquivo inteiro com `Write`.
- Antes de commitar: `npm run lint`, e confira que `.env`, `certificates/` e `dados/` ficam
  de fora.
