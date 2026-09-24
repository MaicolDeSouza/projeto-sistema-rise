# Contexto para continuar o Sistema Rise em outra sessão

Atualizado em 23/09/2026. Este arquivo descreve o estado de trabalho local nesta data; confira o Git, o banco e os processos antes de agir.

## Onde trabalhar

- Repositório local: `C:\00-Dev\Projeto_sistema_Rise\sistema-rise`.
- Remoto: `https://github.com/MaicolDeSouza/projeto-sistema-rise.git`. O código foi alterado localmente; commit não é push.
- Projeto: Next.js 16, React 19, Prisma 7 e PostgreSQL **instalado na máquina**, sem Docker. A seção de Docker no `README.md` está desatualizada para este ambiente.
- `npm run dev` inicia o servidor HTTPS em `https://localhost:3000` quando a porta está livre. Certificados locais ficam em `certificates/`.
- `.env`, `certificates/` e `dados/` são locais e ignorados pelo Git. Nunca copie chaves para este arquivo ou para commits. Em outra worktree, configure o ambiente local necessário; não suponha que esses arquivos acompanhem o Git.
- Antes de mexer em código Next.js, siga `AGENTS.md` e leia a documentação correspondente em `node_modules/next/dist/docs/`.

## Estado operacional que merece conferência

- O worker de coleta foi **pausado** a pedido do usuário. A pausa é persistida por `dados/coleta.pausada` e controlada pela interface em Mercados. Não retome nem dispare uma varredura geral sem pedido explícito.
- A varredura automática foi desativada; `proximaVarreduraEm` pode ficar nulo. Na última conferência, só Circuitronix e Ryndack Componentes estavam na fila pendente. Confirme no banco antes de alterar essa fila.
- A aplicação e o worker podem estar rodando como processos locais. Verifique portas/processos antes de iniciar outra instância. Se usar duas sessões ao mesmo tempo, dê portas diferentes aos servidores. Uma worktree isola arquivos de código, **não** isola o PostgreSQL local nem processos externos.
- Migrations recentes: `20260923_coleta_manual` e `20260923_job_cancelado`. Verifique o estado das migrations no banco antes de reaplicá-las.

## Mudanças de código deste ciclo

- Coleta e cadastro de fontes: importação de catálogo PDF da Circuitronix, leitura dos atributos da Ryndack, correções para salvar fornecedor de arquivo, controle de pausa/fila, e leitura direta da Store API pública do WooCommerce com retorno ao HTML quando a API não funciona.
- A Forseti (`https://loja.forsetisolucoes.com.br/loja/`) foi testada **sem gravação**: prévia de 3 produtos válida; leitura completa retornou 497 produtos válidos de 516 itens anunciados pela API. Produto de concorrente sem preço válido não é importado. O worker continuou pausado e a Forseti não foi adicionada à fila.
- Cadastro de produto: revisão de descrições técnicas e divergências, consulta de fornecedores/concorrentes, documentos de referência, busca por código e cadastros rápidos. Confira o diff e os testes antes de fazer novas alterações nesses fluxos.
- Validação realizada neste ciclo: `npm run teste:extracao`, ESLint dos arquivos da coleta e `npm run build` passaram. O build ainda emite avisos preexistentes de rastreamento amplo de arquivos em `src/lib/arquivos.js`.

## Para trabalhar em paralelo

Abra uma nova tarefa em uma worktree baseada no commit que contém este arquivo, para receber este contexto e o código atual. Não edite a mesma cópia local em duas tarefas ao mesmo tempo. Antes de mudanças de schema ou coleta, combine o uso do banco e do worker entre as sessões. Este arquivo pode ficar desatualizado; o estado efetivo está em `git status`, no PostgreSQL e nos processos locais.
