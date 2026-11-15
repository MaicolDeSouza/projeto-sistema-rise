# MCP do Mapa do estoque (15/11/2026)

**Pedido do dono:** "criar MCP para estoque para que Andrea possa ter acesso e ajustar o estoque 3d, mandar fotos para
ajustar em que posição cada caixinha está e etc. faça um mcp para ter acesso completo." Desenho aprovado no chat em 15/11/2026.

## Intenção

A Andrea arruma o estoque físico e manda as fotos das prateleiras no chat dela (claude.ai, já ligado ao `/mcp` do Rise). O
Claude dela lê os códigos das caixinhas e acerta o Mapa do estoque sem a tela: a ordem na prateleira, o lugar de cada produto,
as colunas, os modelos de caixinha e a caixinha de cada produto.

## Abordagens

1. **Ferramentas no MCP do Rise que chamam o que a tela `/estoque/mapa` já usa** (`lib/estoque3d`): escolhida. Uma regra só
   para tela e chat, os mesmos acessos.
2. Subir a foto ao Rise e o Rise ler (IA no servidor): descartada; o MCP nunca chama IA, quem lê a foto é o Claude da pessoa.
3. Script por linha de comando (`ordem-pelas-fotos.js`, que já existe): só serve a quem tem o PC; não dá à Andrea.

## Decisões

- A foto NÃO fica guardada no Rise: só os códigos lidos (decisão do dono, opção recomendada).
- Acesso: leitura = `tela.estoque.mapa` ver + `dado.localizacao` ver; Mover e a ordem pelas fotos = mapa editar +
  `dado.localizacao` editar; colunas, modelos, caixinha do produto e estoque = mapa editar (como as ações da tela).
- Excluir coluna/modelo só com `confirmo: true`, depois de a pessoa confirmar no chat; as recusas de sempre valem (coluna com
  produto, modelo em uso).
- A ordem pelas fotos primeiro simula (`confirmar` falso) e só grava com `confirmar: true`; nunca muda a Localização: quem está
  em outra prateleira vira dúvida, e o Claude pergunta antes de usar o Mover.
- Sem o lembrete de anotar (é trabalho, não dúvida de atendimento), como a proposta e as compras.
- A Localização movida vai ao Bling pelo Sincronizar de sempre, nunca sozinha.

## Ferramentas (`src/lib/mcp/estoque.js`)

`roteiroDoMapaDoEstoque`, `lerMapaDoEstoque`, `lerCaixinhaDoProduto`, `sugerirLugarNoEstoque`, `moverProdutoNoEstoque`,
`gravarOrdemPelasFotos`, `salvarColunaDeEstoque`, `excluirColunaDeEstoque`, `salvarModeloDeCaixinha`,
`excluirModeloDeCaixinha`, `definirCaixinhaDoProduto`, `configurarEstoque`, `criarColunasPelaLocalizacao`.

## Para o dono

A Andrea é Administradora até 17/11/2026. Depois, a função dela precisa de `tela.estoque.mapa` e `dado.localizacao` em editar.
