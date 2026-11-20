# Chat da loja (Hobi), fase 1: decisoes e registro da execucao (19/11/2026)

Copia do livro de progresso da execucao do plano `2026-11-19-chat-da-loja-fase-1-fundacao-segura.md`: as decisoes ("Ruling") tomadas no caminho, as notas e a revisao final.

```
# SDD ledger — plan: docs/superpowers/plans/2026-11-19-chat-da-loja-fase-1-fundacao-segura.md
Spec: docs/superpowers/specs/2026-11-19-chat-ia-na-loja-design.md (aprovada 19/11/2026). Execucao inline na main (consentimento do dono), sem subagentes.
Outras sessoes ativas na main (frete fase 2): commitar SO os meus caminhos; schema.prisma/package.json por hunk se houver trecho alheio.

Pre-flight:
- T1 -> T3: chatDaLojaPadrao() consumido por dados.configuracaoDoCanal (mescla). OK.
- T1 -> T2/T5: enum CanalIA.LOJA e TipoDeGastoIA.CONVERSA usados nas politicas e no gasto. OK (migration propria antes).
- T2 -> T3: colunas da visao (13) x ProdutoPublico (10 campos): descricao/busca/buscaAmpla ficam so na consulta. OK.
- T2 -> T5: UPDATE so das colunas da avaliacao em MensagemIA: conferir os nomes reais no schema na T2.
- T3 -> T5: dados.{buscarProdutos,produtosPorSku,fichaDoProduto,similares,conhecimento,configuracaoDoCanal,segredos,darSinal}. OK.
- T4 -> T5/T6: limites.entrar e da porta (T6); somarCusto do cerebro (T5). filtrarSaida.telefonesDaLoja: o plano nao diz de onde vem.
  Ruling: telefonesDaLoja = os digitos do numero no link wa.me da configuracao — e o unico telefone da loja que o servico conhece — se errado, um telefone legitimo da loja reprova o texto e o cliente cai no WhatsApp (falha segura).
- T5 -> T6: ErroDoAtendimento.motivo e os eventos. OK.
Task 1: complete (commits 597fdb2..5f0842d, tests: node scripts/teste-assistente.js → 15 de 15 ok)
Task 2: Ruling: o plano mandava `npm run backup` para conferir o dump — rodei um pg_dump para a pasta temporaria e o `pg_restore --list` (4 politicas, 4 visoes), porque o `npm run backup` gira os 4 backups do dono e apagaria o mais antigo por causa de um teste — se errado, a conferencia do script de backup de verdade so acontece no proximo backup semanal.
Task 2: nota para a T8 (docs): restaurar o dump num servidor NOVO exige criar antes o papel (CREATE ROLE rise_ia NOLOGIN), senao as concessoes e politicas do dump falham.
Task 2: nota: TABELAS_PROIBIDAS ganhou ProdutoComponente (18 tabelas, o plano listava 17).
Task 2: complete (commits 5f0842d..2d4500a, tests: node scripts/teste-ia-isolamento.js → 51 de 51 ok)
Task 3: Ruling: o executor de `criarDadosDoCliente` e `consultar(sql, valores)` (placeholders $1..$n), e nao o "modelo etiquetado" do plano — a busca monta um numero variavel de condicoes LIKE, e a mesma assinatura serve ao Prisma (`$queryRawUnsafe`, todos os valores como parametro) e a conexao pg do teste de isolamento — se errado, so muda a forma de injetar o banco; nenhum valor de fora entra no texto do SQL.
Task 3: Ruling: `PADRAO_DO_CEREBRO` (teto, tempos, limites do laco) mora em configuracaoDoCanal.js como copia do padrao do Rise — o servico `ia` nao carrega configuracao.js (ela importa as conexoes e as chaves) — se o padrao do Rise mudar e a copia nao, o teste:assistente falha ("padrao do cerebro = padrao do Rise").
Task 3: nota de TDD: escrevi dados.js e segredos.js ANTES do bloco de teste; o RED observado foi so o da exportacao que faltava (PADRAO_DO_CEREBRO), nao o de cada funcao. Os testes passaram a existir e pegaram um defeito do proprio teste (similares achava o 100101 real).
Task 3: nota: a busca do cliente nao procura por EAN exato (a visao nao expoe a coluna); o EAN continua achavel pelas palavras (esta no texto `busca`). `busca.js` nao precisou mudar (os ajudantes ja eram exportados de @/lib/texto).
Task 3: complete (commits 2d4500a..cb5fd1c, tests: node scripts/teste-assistente.js → 43 de 43 ok)
Task 4: Ruling: "custo-beneficio" NAO reprova no filtro de saida (o termo interno "custo" sozinho continua reprovando) — e fala comum de vendedor e reprovar jogaria respostas boas para o WhatsApp — se errado, uma frase com "custo-beneficio" que tambem fale do custo da loja passaria; a primeira tranca (o banco nao entrega custo ao servico) continua valendo.
Task 4: nota: `limites` ganhou `emAndamento()` (o sinal de vida usa); `entrar` confere nesta ordem: ocupada, gasto do dia do visitante, mensagens do visitante, IP, lotado.
Task 4: complete (commits cb5fd1c..ee1bd6f, tests: node scripts/teste-assistente.js → 87 de 87 ok)
Task 5: Ruling: o servico usa a cotacao FIXA do dolar (R$ 6,00), sem buscar o PTAX do dia — o servico publico nao precisa de mais uma saida de rede, e a fixa e mais alta que o PTAX, entao o teto de gasto fica do lado seguro — se errado, o custo em reais das conversas de cliente aparece ~15% maior que o real no Consumo.
Task 5: Ruling: o gasto e gravado tambem quando a resposta FALHA depois de rodadas pagas, e inclui a tentativa do modelo principal quando a reserva respondeu (um GastoIA so, com o provedor que terminou) — o plano dizia "sem gasto em dobro"; o orcamento dos clientes nao pode ficar cego a dinheiro gasto — se errado, o Consumo atribui ao modelo de reserva alguns centavos gastos no principal.
Task 5: Ruling: o parametro da ferramenta e `apenasDisponiveis` e o campo que o modelo le e `disponibilidade` (o plano dizia apenasComEstoque) — o teste de guarda proibe a chave "estoque" em qualquer resultado de ferramenta — custo nenhum.
Task 5: Ruling: `conversasDoCanal` e `orcamentoDoCliente` sao fabricas (`criarConversasDoCanal()`, `criarOrcamentoDoCliente()`) e `reservar` recebe `tetoBrl` (o plano listava `config`) — o servico nao le a ConfiguracaoIA; o teto vem da visao — custo nenhum.
Task 5: Ruling: a conversa completa "sob o papel" roda num PROCESSO FILHO (scripts/lib/conversaSobOPapel.js) com a DATABASE_URL do rise_ia e ambiente limpo, com uma senha de uso unico que o teste poe e tira — o Prisma do processo e um so, e assim o teste tambem prova que nada do cerebro precisa da ENCRYPTION_KEY — o teste recusa rodar onde o papel ja tem login (a VPS).
Task 5: nota: o historico que o modelo le leva "[produtos mostrados: SKU...]" depois de cada resposta com cartoes; o conhecimento entra como um par usuario/assistente antes da pergunta; mensagem com 3+ linhas de lista ganha a pista "use orcarLista"; motivos da passagem: pediu_pessoa, pagamento, pedido, troca_ou_garantia, reclamacao, nao_encontrei, outro (+ "filtro", posto pelo codigo).
Task 5: complete (commits ee1bd6f..0d80710, tests: node scripts/teste-assistente.js → 125 de 125 ok)
Task 6: Ruling: `GET /status` sem cabecalho Origin e aceito (qualquer outra rota sem Origin e 403) — e por ele que o deploy e o teste conferem que o servico subiu, e ele so devolve o que a janela do chat ja mostra a qualquer visitante — se errado, alguem fora do navegador le nome, saudacao e link do WhatsApp da loja, que sao publicos.
Task 6: Ruling: a porta recebe `avaliar` e `responder` prontos (o plano listava `limites` como dependencia; a porta cria o proprio `limites` e o entrega ao `responder`), e os NUMEROS dos limites acompanham a configuracao relida a cada 30 s — o dono muda um limite na tela e vale sem reiniciar o servico — custo: ate 30 s para ligar/desligar o chat valer no servico (mais 60 s do cache do /status no navegador).
Task 6: nota: o processo de verdade foi visto subindo no PC como rise_ia, em ambiente limpo (teste:ia-isolamento, bloco T6): /status desligado, /chat 503, 403 de outra origem, 404 fora das rotas e sinal de vida gravado.
Task 6: complete (commits 0d80710..cf4cb92, tests: node scripts/teste-assistente.js → 173 de 173 ok)
Task 7: Ruling: NAO existe `deploy/ia.env`. As duas variaveis do servico (IA_DATABASE_URL e IA_SEGREDO) moram no .env da VPS e chegam ao conteiner `ia` pela interpolacao do compose (`environment: DATABASE_URL: ${IA_DATABASE_URL:-}`), do jeito que o segredo de borda ja chega ao Caddy — a spec (§5.1) pedia um arquivo de ambiente proprio; um `env_file` que nao existe quebraria o `docker compose` de TODO deploy das outras sessoes (ou exigiria `required: false`, que depende da versao do Compose da VPS, nao conferida) — o que a spec quer continua valendo e e testado: o conteiner `ia` nao recebe o .env do Rise (so 7 variaveis nomeadas) e o processo se recusa a subir se achar uma chave do Rise. Custo se errado: o app e o worker passam a ter no ambiente a URL do usuario RESTRITO (menos poder do que ja tem) e o IA_SEGREDO (que o app precisa para cifrar as chaves do chat).
Task 7: Ruling: o `.dockerignore` nao mudou — sem `deploy/ia.env`, nao ha arquivo novo de segredo para entrar na imagem (o `.env*` ja cobre o .env e as copias .env.bak-*).
Task 7: nota para o dono: o PRIMEIRO deploy com esta mudanca recria os conteineres do banco e do Caddy (eles ganharam uma rede): o Rise fica alguns segundos fora durante o deploy, uma vez. O volume do banco nao muda.
Task 7: nota: o Caddyfile so e validado de verdade no deploy (`caddy validate`, antes de trocar qualquer coisa); no PC o Docker esta parado. O modelo do endereco do chat so e validado quando for ligado (preparar-ia.sh + deploy). O compose foi validado no PC com `docker compose config` (com e sem o perfil ia).
Task 7: complete (commits cf4cb92..5d72dcd, tests: node scripts/teste-assistente.js → 196 de 196 ok)
Final review: self-review (o dono escolheu execucao inline, sem subagentes; revisao do autor e mais fraca que a de um revisor novo).
Final: fixed o teste deixava a linha `unico` de SinalDoAssistente com versao de teste no banco do PC — os dois testes agora devolvem a linha do dono e tratam versao "zz-..." como sobra; conferido no banco (sinal: [], nenhuma sobra ZZ-LOJA/loja:zz), suites 197/197 e 73/73.
Final: fixed o primeiro deploy recriaria o conteiner do banco (rede dados_ia) ANTES de o deploy-vps.sh parar o worker — "o deploy para o worker antes de recriar o banco pela primeira vez" RED→GREEN, suite 197/197, teste:vps e teste:mcp verdes.
Final: minor (deferred): preco CALCULADO pelo modelo no texto (ex.: "2 unidades saem por R$ 159,60") reprova no filtro e a resposta vira a frase segura + WhatsApp; o prompt manda nao escrever preco no texto (os cartoes e a lista mostram).
Final: minor (deferred): o IA_SEGREDO serve de chave do AES (segredos) e do HMAC (passe do Turnstile); derivar duas chaves separadas.
Final: minor (deferred): em servidorHttp.js o writeHead do fluxo fica fora do try/finally que libera a vaga (o Node nao lanca ali).
Final: minor (deferred): quando os dois modelos falham, a pergunta fica sem resposta no historico (duas mensagens do usuario seguidas na proxima rodada).
Final: minor (deferred): nao validado em Docker no PC (Docker parado): o conteiner `ia` com read_only e o modelo do Caddy; o deploy valida o Caddyfile antes de trocar qualquer coisa e so AVISA se o servico ia nao responder.
Task 8: complete (commits 5d72dcd..6cb0f9a, tests: node scripts/teste-assistente.js → 197 de 197 ok)
```

## Ajustes de 20/11/2026: as pendencias da revisao final (pedido do dono: "Ajuste as pendencias que ficaram para depois")

Ajuste: fixed preco calculado no texto — ferramenta nova `calcularTotal` (codigos vistos + quantidades -> subtotais e total, em centavos); os valores dela entram nos precos permitidos do filtro (`saida.valores`) e o prompt manda usa-la — "conta feita pela ferramenta passa no filtro" RED→GREEN; "conta feita de cabeca continua reprovada" segue verde.
Ajuste: Ruling: NAO aceitei "multiplo de um preco visto" direto no filtro — com um resistor de R$ 0,10 na resposta, quase qualquer valor inventado seria multiplo dele e passaria — custo: uma chamada de ferramenta a mais quando o visitante pede total (centavos de centavo) e, se o modelo esquecer de chama-la, a resposta ainda cai no WhatsApp.
Ajuste: fixed IA_SEGREDO com dois usos — `derivarChave(segredo, "segredos" | "passe")` (HKDF-SHA256) em segredos.js; o processo entrega a cada parte so a chave dela — "cada uso tem a sua chave" RED→GREEN. Nada estava cifrado em producao (sem deploy), entao nao ha o que migrar. A fase 2 (tela que cifra as chaves) tem de derivar a mesma chave "segredos".
Ajuste: nota: `ambiente.js` continua sem imports (roda antes de tudo); a derivacao acontece em scripts/ia-processo.js. A assercao que le o texto do processo nasceu junto com a mudanca (nao foi vista falhar sozinha).
Ajuste: fixed pergunta sem resposta no historico — `historicoParaOModelo` so devolve pares pergunta + resposta valida — "historico: so os pares" RED→GREEN (pela funcao que nao existia); as duas assercoes de ponta a ponta (modelos fora do ar; orcamento esgotado) ja nasceram verdes, porque a execucao parava antes delas.
Ajuste: fixed vaga presa se abrir o fluxo falhar — o writeHead entrou no try de `aoChat`; sem fluxo, a porta responde 500 sem detalhe — "fluxo que nao abre: erro sem detalhe e a vaga liberada" RED (409) →GREEN (200).
Ajuste: continua aberto: Docker do PC parado (nao liguei o Docker Desktop por conta propria: ele ja travou e disputa a porta 5432); o conteiner read_only e o modelo do Caddy seguem validados so no deploy.
Ajuste: continua aberto (fase 2, telas): gasto do chat em "Outros" no Consumo e o 👎 do visitante so gravado.
Ajuste: testes: teste:assistente 217 de 217, teste:ia-isolamento 73 de 73, lint limpo.
