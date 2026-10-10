# Kit no cadastro de Produto: 18 ajustes (10/10/2026)

Pedido do dono em 10/10/2026, combinado item a item na conversa (lista final aprovada com "pode seguir").
Executado inline na `main`. **Sem mudança no banco** (nenhuma migration).

## Lista aprovada

1. Inverter Tipo e Unidade (Unidade em cima, Tipo embaixo).
2. Ao trocar para "Com composição", o produto de origem (Clonar da lista OU "Clonar a partir de um código" com
   produto do Rise) entra como primeira peça, quantidade 1, se for simples, Conferido e vinculado ao Bling;
   senão, aviso com o motivo.
3. Campo Tipo só em produto novo ou clonado (o servidor já mantém o tipo gravado sem o campo).
4. Busca de peças: uma lista só, aptos (selo "Apto", clicável) e não aptos (cinza, "Falta: validar no Rise ·
   integrar com o Bling", "É um kit"), com link "Abrir" nos não aptos.
5. As peças viram abas de referência na janela "Criar descrição" (descrição e especificações do cadastro, com a
   quantidade); a IA recebe as peças; "Itens inclusos" saem da lista de peças com as quantidades.
6. Aba Documentos técnicos do kit: seção "Documentos das peças", só leitura, por peça (documentos e certificado).
   O bloco "Documentos" da descrição da Loja Integrada do kit leva os das peças.
7. Fotos das peças entram no painel a cada peça incluída, todas sem check; as do clone passam a sem check, sem
   duplicar; peça removida leva as fotos dela que estão sem check; teto do painel (150) com aviso.
8. Código sugerido: uma peça com quantidade 2+ = `{sku}_{N}` (milhar com ponto, `codigoDaComposicao`); mais de
   uma peça = em branco. Só troca o campo vazio ou com a última sugestão.
9. Preço sugerido = venda total das peças (preço × quantidade), com a mesma regra; soma incompleta não sugere.
10. Localização: uma peça = a da peça, travada (o servidor grava a da peça no Salvar e a peça que muda de lugar
    leva os kits de uma peça junto, por SQL cru); várias = "Verificar a aba composição", editável. Na lista, a
    célula do kit de uma peça não abre o popup (e a ação recusa).
11. Coluna Localização na tabela de peças.
12. Unidade KIT ao virar kit, UN ao voltar a Simples, sem travar.
13. Medidas preenchidas com a sugestão (mesma regra de não apagar o digitado), sem o botão "Usar a sugestão".
14. EAN limpo ao virar kit.
15. Estoque mínimo e máximo limpos ao virar kit.
16. Concorrentes limpos ao virar kit e de volta ao escolher Simples.
17. Fornecedores (a tabela escondida) limpos ao virar kit e de volta ao escolher Simples.
18. Kits fora do "Valor do estoque a custo" e da "Receita potencial do estoque".

Também: a mensagem de erro do Salvar some quando o formulário muda (ela ficava na tela depois de corrigida).

## Ordem

1. Regras puras (`composicao.js`, `indicadores/estoque.js`) e testes.
2. Banco (`composicaoBanco.js`: localização da peça, situação na busca, peça de origem, documentos e
   descrições das peças), ações e `ajusteRapido`.
3. Telas: `Composicao.jsx`, `AbasDoKit.jsx`, `FormularioProduto.jsx`, `JanelaDescricao.jsx`, lista de Produtos.
4. `teste:composicao`, lint, os 4 testes do ritual, conferência na tela com ZZ-TESTE-BLING como peça e um kit
   ZZ apagado no fim. Commit e push na `main`; deploy só com o "sobe" do dono.
