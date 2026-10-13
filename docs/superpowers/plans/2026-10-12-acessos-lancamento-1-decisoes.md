# Acessos, lançamento 1: decisões tomadas na execução

Execução inline do plano `2026-10-12-acessos-lancamento-1.md` (18 tarefas, na `main`, 12/10/2026). Cada linha é uma decisão que o
plano ou a spec não fechavam, com o que custa se estiver errada. O dono confere e pode derrubar qualquer uma.

## Decisões

| Onde | O que decidi | Custo se errado |
| --- | --- | --- |
| T2 | `cartao.painel.blocos` cobre o indicador "Blocos disponíveis" e a grade "Blocos do sistema". | Um id a mais no catálogo. |
| T2 | Entraram `tela.indicadores` (e `.estoque`) e `tela.canaisDeVenda.mercadoLivre.frases`, que o plano não listava: todo bloco do menu precisa de tela de entrada. | Nenhum. |
| T3 | `contarLiberados` aceita `grupo` nulo (todos) e filtro por tipo: a lista de funções precisa das telas de todos os grupos. | Nenhum (parâmetro opcional). |
| T3 | `blocosOcultos` esconde o bloco que não tem tela de entrada no catálogo (falha fechada). | Um bloco novo some do menu até entrar no catálogo. |
| T4 | `montarSessao` ganhou `erroBanco` (PC = administrador; VPS = só o quebra-vidro) e `simulando`, na função pura, para ficarem testados. | Nenhum. |
| T4 | `quebraVidro` lê `RISE_AI_ADMINS` com split próprio, sem importar `integracoes/config.js` (que lê o `.env` inteiro na carga). | Duas cópias de um split de 3 linhas. |
| T5 | Caddyfile não validado no PC (o Docker não respondeu); o `deploy-vps.sh` o valida antes de construir. | O deploy para no passo de validação, sem trocar nada. |
| T5 | `--hostname 127.0.0.1` no script `dev`, sem reiniciar o servidor da pasta (é de outra sessão); vale no próximo reinício. Visto subindo com HTTPS em 127.0.0.1. | Se alguém só alcançar por `::1`, trocar para `--hostname localhost`. |
| T6 | O PC sem simulação não lê o banco: é administrador por ambiente e abre mesmo com o Postgres fora do ar. | Nenhum. |
| T7 | Nomes e chave da semeadura são parâmetros (o teste usa `ZZ-AC ...`). | Nenhum. |
| T8 | `administrador` da sessão do Rise AI passou a ser `pode("riseAi.revisao", "ver")`. | Quem revisa pode avaliar mensagens de outros (já era assim). |
| T8 | A leitura de conversa na Revisão fica em `ver` (o plano dizia `editar`). | Nenhum. |
| T8 | Saíram `administrador.js` e `riseAi/acesso.js`; o equivalente está no `teste:acessos`. | Nenhum. |
| T8 | `ListaDeConversas` ganhou `podeConversar` (esconde "Nova conversa" sem `riseAi.chat` em editar). | Nenhum. |
| T9 | Faixa de estoque: 0 ou menos "em falta", 1 a 3 "poucas unidades", 4 ou mais "disponível" (a spec não fixava o corte). | Um número em `faixaDeEstoque`. |
| T9 | `compararProdutos` também passa pela faixa (devolvia estoque numérico). | Nenhum. |
| T9 | Chamada sem `pode` (sugestão ao 👎, testes) vê tudo, como antes: é uso interno, não de uma pessoa. | A sugestão da IA leria custo ao propor uma nota (só o administrador a aprova). |
| T11 | O contador de usuários conta só os ativos. | Um número. |
| T13 | "Administrador" é qualquer função fixa; a trava `FOR UPDATE` pega todas. Quem vem do `.env` também não troca de login. | O dono troca na VPS antes. |
| T14 | As duas tabelas ficam num componente só e sem paginação (poucos usuários e funções). | Dividir ou paginar depois. |
| T15 | Cada segmento mostra o nome do nível; não há cabeçalho de colunas global (ação e cartão têm níveis diferentes da tela). | Voltar ao cabeçalho de colunas. |
| T16 | A exceção nova nasce em "nenhum" (o uso comum é restringir) e o nível se ajusta na própria linha; a janela só busca o recurso. | Um clique a mais para dar mais acesso. |
| T17 | `/api/arquivos` fica na lista de exceções do guarda (a rota também serve a pasta reserva, que pede login), não em "sem recurso". | Nenhum até o lançamento 2. |
| T18 | `CLAUDE.md` commitado só com os meus trechos; o resto do arquivo é de outra sessão. | Nenhum. |

## Revisão final (feita pela própria sessão, sem subagentes, a pedido do dono)

Nada crítico nem importante apareceu; os pontos abaixo ficaram como adiados, e três coisas **não foram vistas num servidor de verdade**.

**Adiados (menores):**
- O chat de quem tem `riseAi.chat` só em `ver` ainda mostra a caixa de texto; enviar volta 403 e a tela mostra "Tentar de novo". A Atendimento tem `editar`, então hoje ninguém cai nisso. Desabilitar a caixa com o motivo no `title`.
- As tabelas de usuários e de funções não paginam.
- O guarda estático ainda tem 54 arquivos na lista de exceções: é o trabalho do lançamento 2.

**Não conferido num servidor real:**
- O 404 de quem não tem acesso (a "Andrea" simulada): o `next dev` da pasta é de outra sessão e o Next só deixa um por pasta. Está coberto pelo guarda e pelos testes de sessão; o roteiro do dono (passos 5 e 6, na seção "Acessos" do `CLAUDE.md`) é a prova na tela.
- O Caddyfile novo (`header_up` com `{env.RISE_SEGREDO_DE_BORDA}`): o Docker do PC não respondeu. O `deploy-vps.sh` o valida antes de construir.
- A semeadura na partida do Next: o `register()` do `instrumentation.js` foi rodado direto no Node, duas vezes (criou Administrador e Atendimento com 28 permissões, e a segunda não criou nada); a partida dentro do Next só se vê no próximo reinício do servidor.
