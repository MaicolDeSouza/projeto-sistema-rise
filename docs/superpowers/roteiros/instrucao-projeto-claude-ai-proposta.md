# Instrução para o Projeto "Rise" (claude.ai, ChatGPT ou outro): proposta de produto

**Desde 21/10/2026 as regras da proposta moram DENTRO do Rise** (`src/lib/proposta/roteiro.js`, o roteiro único) e são
entregues pela ferramenta `roteiroDaProposta` do MCP. A instrução do Projeto não carrega mais regra nenhuma: só manda
ler o roteiro. Assim qualquer assistente conectado ao Rise segue as mesmas regras, e mudar uma regra é editar o roteiro
no Rise e subir (ninguém precisa colar nada de novo).

Cole o bloco abaixo nas **instruções do Projeto** (o conector MCP do Rise ligado, com um login que tenha a ação
"Propor cadastro" e acesso a custo e concorrentes). É o mesmo texto para o Claude, o ChatGPT ou outro.

---

```text
PROPOSTA DE PRODUTO (Rise / 4hobby): quando eu pedir "proposta" (ou "criar proposta"), chame primeiro a ferramenta
roteiroDaProposta do Rise e siga o roteiro que ela devolver, exatamente e do começo ao fim (ele diz o que perguntar,
as ferramentas a usar e o formato de cada seção). Você só propõe: nunca altera o cadastro do produto.
```

Histórico: até 21/10/2026 este arquivo trazia as regras inteiras, e elas divergiam do roteiro da sessão. As versões
antigas estão no git.
