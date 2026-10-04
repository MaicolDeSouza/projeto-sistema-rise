# Sincronização Rise ↔ Bling — desenho

Data: 04/10/2026. Status: aprovado em brainstorming, seções 1 a 4. Aguarda revisão da spec escrita.

## 1. Objetivo

Na lista de Produtos, o ícone do Bling passa a mostrar o estado de sincronização do produto e, ao ser clicado, abre um pop-up que permite **enviar o cadastro do Rise para o Bling** e **enviar ajustes de estoque**. O estoque vem do Bling por um botão manual. O vínculo entre os dois lados é **sempre o código (SKU)**.

Hoje o sistema só **lê** o Bling (importação). Toda escrita está barrada por `BLING_ESCRITA=false` (`exigirTravaLiberada`), numa conta real com 1.007 anúncios e estoque real. Esta feature é o primeiro uso de escrita no Bling.

## 2. Decisões do dono (brainstorming de 04/10/2026)

- O código e o estoque nunca são enviados pela sincronização geral. O estoque tem fluxo próprio.
- Enviados: nome, descrição (substitui a do Bling), preço, marca, EAN, unidade, peso, medidas, vídeo, estoque mínimo e máximo, localização, campos fiscais e **todos os fornecedores** do produto com o custo.
- Fornecedores ligados pelo **CNPJ**; contato criado no Bling se não existir.
- **Foto principal fica para a VPS**: o Bling só recebe imagem por link público (a confirmar na investigação, §9) e as fotos do Rise ficam em disco local.
- Estoque do Bling para o Rise **só ao clicar** em "Sincronizar estoque com Bling". O controle automático fica para a VPS.
- Conflito de estoque: Rise = saldo do Bling + ajustes pendentes do Rise.
- A escrita só é ligada depois de um teste com **1 produto de teste**.
- Situação ativo/inativo **não** é enviada.

## 3. Estado guardado (banco)

Migration só com colunas e tabelas novas, seguindo a regra do schema (uma sessão por vez, `git merge main` antes, `npx prisma generate` e reiniciar o servidor depois).

`Produto`:
- `blingSincronizadoEm DateTime?` — último envio bem-sucedido. Nulo = nunca sincronizado.
- `blingAssinatura String?` — hash dos campos de envio no último envio.
- `blingSaldo Int?` — último saldo lido do Bling.

`MovimentoEstoque`:
- `enviadoAoBlingEm DateTime?` — nulo = ajuste pendente. Os movimentos que já existem na migration ficam com a data da migration (resolvidos).

`BlingCopiaProduto` (nova): `produtoId`, `criadoEm`, `conteudo Json` — o produto do Bling como estava antes de cada sobrescrita; guarda as 3 mais recentes por produto.

## 4. Estados do ícone

- **Cinza**: `blingSincronizadoEm` nulo. Os 1.314 produtos importados começam assim.
- **Verde**: assinatura atual igual à guardada e nenhum movimento pendente.
- **Selo "?"**: assinatura diferente, ou há movimento pendente. Um só selo; o pop-up diz qual é a divergência.

A assinatura é calculada só com os campos de envio (§6), em ordem fixa. A lista **não** chama o Bling para decidir o estado. Edição feita direto no Bling só aparece quando o pop-up é aberto (leitura ao vivo).

## 5. Pop-up e fluxos

Abre ao clicar no ícone. Ao abrir, lê o produto no Bling pelo código (só leitura, independente da trava).

- **Código inexistente no Bling**: avisa e oferece "Cadastrar no Bling", criando o produto com os campos de envio e sem estoque.
- **Existente**: lista as diferenças campo a campo (Rise × Bling), com os campos iguais recolhidos. O estoque aparece à parte: saldo do Bling, saldo do Rise e ajustes pendentes.

Dois botões separados:

1. **Sincronizar com o Bling**: lê o produto completo, troca só os campos mapeados e devolve (`PUT`), preservando categoria, variações, composição e campos personalizados. Depois envia os fornecedores. Ao fim grava assinatura e data e revalida a lista (ícone verde).
2. **Enviar ajustes de estoque**: só aparece com ajustes pendentes. Envia entradas, saídas e balanços na ordem em que foram lançados, ao **depósito padrão** do Bling (se não houver, o pop-up pede para escolher uma vez). Marca `enviadoAoBlingEm` em cada um e relê o saldo.

Falha no meio: a assinatura só avança para o que deu certo; o selo continua e o pop-up diz o que falhou.

### Botão "Sincronizar estoque com Bling" (lista de Produtos, ao lado de "Importar do Bling")

Monta o mapa código → produto do Bling lendo o catálogo, pede os saldos em lotes de 100, grava `blingSaldo` e recalcula `Produto.estoque = blingSaldo + soma dos ajustes pendentes`. Termina com resumo: "N atualizados, M sem esse código no Bling". Produto sem saldo lido não tem o estoque alterado.

## 6. Mapeamento de campos

Enviados (Rise → Bling):

| Rise | Bling |
| --- | --- |
| `tituloBase` | `nome` |
| `descricaoBase` | `descricaoCurta` (texto escapado, quebras de linha em HTML simples) |
| `precoVenda` | `preco` |
| `marca`, `ean`, `unidade` | `marca`, `gtin`, `unidade` |
| `pesoKg` | `pesoLiquido` e `pesoBruto` |
| `alturaCm`, `larguraCm`, `comprimentoCm` | `dimensoes` (`unidadeMedida` = cm; `profundidade` = comprimento) |
| `videoUrl` | `midia.video.url` |
| `estoqueMinimo`, `estoqueMaximo`, `localizacao` | `estoque.minimo`, `estoque.maximo`, `estoque.localizacao` |
| `origem`, `ncm`, `cest`, `spedTipoItem`, `percentualTributos` | `tributacao.*` |
| vínculos `ProdutoFornecedor` | fornecedores do produto (contato, código, descrição, custo, padrão) |

Nunca enviados: código, saldo de estoque, situação, imagens, categorias, variações, composição, campos personalizados.

Regras:
- **Campo vazio no Rise não apaga nada no Bling.** Aparece no pop-up como "vazio no Rise (não será enviado)" e não conta como divergência.
- **Normalização antes de comparar**: espaços, HTML da descrição do Bling convertido a texto pela função da importação (`htmlParaTexto`), números em 2 casas, medidas em cm, unidade "PÇ"/"Un" lida como UN (`unidadeDe`). Sem isso apareceriam falsas diferenças.
- **Fornecedores**: ligação pelo CNPJ. Fornecedor do Rise sem CNPJ não é enviado e o pop-up avisa. Contato inexistente no Bling é criado (nome, CNPJ, tipo fornecedor).

## 7. Segurança da escrita

- **Duas travas**: `BLING_ESCRITA` (existente) e uma lista de **códigos liberados**. Enquanto a lista existir, o envio de qualquer outro código é recusado; remover a lista libera todos. Assim, ligar a escrita para o teste não expõe os produtos reais.
- **Escrita nunca tenta de novo sozinha**, para não duplicar contato, fornecedor ou lançamento de estoque. Leitura pode repetir.
- **Cópia de segurança** do produto do Bling antes de cada sobrescrita (`BlingCopiaProduto`).
- **Auditoria**: toda chamada passa pela fila e pelo `LogIntegracao` já existentes (limite de 3 chamadas por segundo), sem credenciais, mais o resumo "campo: de → para" de cada sincronização.
- Um produto leva cerca de 3 a 6 chamadas (leitura, envio e fornecedores).

## 8. Testes

- `npm run teste:bling-sync`, sem internet, contra um **Bling falso local** (no molde da loja falsa do `teste:worker`): mapeamento, normalização, assinatura estável, lista de diferenças, estoque = saldo + pendentes, ordem dos lançamentos, falha parcial, bloqueio por código, e mesclagem que não apaga campos desconhecidos do Rise.
- Teste real, nesta ordem: leitura em produtos reais; envio **só** no produto de teste (código liberado); depois a liberação geral, a pedido do dono.
- Lint e a bateria de testes do ritual de fim de sessão.

## 9. Investigação antes de implementar (primeira tarefa do plano)

Confirmar na API real do Bling, só com leitura, e registrar no relatório da tarefa:
- formato do `PUT /produtos/{id}` e quais campos omitidos ele zera;
- como imagens entram (confirmar que é só por link público);
- endpoints e formatos de fornecedores do produto, de contatos (`/contatos`, busca por CNPJ) e de depósitos;
- lançamento de estoque (`/estoques`: operações de entrada, saída e balanço, e o depósito) e leitura de saldos em lote (`/estoques/saldos`);
- limite de ids por chamada de saldos.

## 10. Fora do escopo (registrado para depois)

- Foto principal (VPS).
- Estoque automático e webhook (VPS).
- Conferência noturna de edições feitas direto no Bling.
- Preço por canal e sincronização de Mercado Livre e Loja Integrada (eles leem o estoque pelo Bling).
