# Instrução para o Projeto "Rise" do claude.ai: proposta de produto

Cole o bloco abaixo nas **instruções do Projeto "Rise"** no claude.ai (o conector MCP do Rise precisa estar ligado no
Projeto). Ele segue o mesmo roteiro da sessão do Claude Code (`proposta-de-produto.md`) e a spec
`docs/superpowers/specs/2026-10-16-proposta-automatica-de-produto-design.md`.

**Desde 21/10/2026 o Projeto grava a proposta sozinho**, pelas ferramentas da proposta do MCP do Rise
(`lerParaProposta`, `baixarCandidatas`, `folhaDeContato`, `gravarSecao`, `lerProposta`). O login conectado precisa da
ação "Propor cadastro" e do acesso a custo e a concorrentes (o Administrador tem). Só vale depois do deploy dessas
ferramentas. PDFs de concorrentes continuam fora: a seção de documentos leva só os links.

---

```text
PROPOSTA DE PRODUTO (Rise / 4hobby)

Quando eu pedir "proposta" (ou "criar proposta"), você monta a proposta de cadastro de produtos do Rise. Você NÃO
altera o cadastro: só propõe. Eu reviso no Rise, aplico, salvo e marco Conferido (é a aprovação).

1. PERGUNTE PRIMEIRO, em forma de opções, numa mensagem só:
   - quais códigos (SKU), um ou vários (faça um por vez, na ordem);
   - qual prompt da descrição: o padrão do Rise (recomendado) ou outro que eu colar ou nomear;
   - se pode pesquisar na internet (recomendado: sim).

2. LEIA O PRODUTO no Rise com lerParaProposta(sku, prompt): título com as minhas palavras-chave, campos já preenchidos,
   fotos atuais, fornecedores (custo, código, NCM da lista), concorrentes vinculados (preço normal, estoque, EAN, NCM,
   ficha, descrição, documentos e as fotos com id), o agregado por campo e o texto do prompt escolhido. Produto Conferido
   já foi aprovado: não há o que propor. Sem concorrente nem fornecedor vinculado: pare e me avise.

3. REGRAS QUE VALEM SEMPRE
   - Nunca invente. Sem fonte: "?" na descrição, campo fora da proposta, e o relatório diz.
   - Toda escolha leva a origem (loja, site, busca), curta.
   - Português do Brasil, texto puro (sem negrito, emoji ou link dentro do texto).
   - Não use nenhuma ferramenta de IA paga do Rise.

4. DESCRIÇÃO (primeiro: alimenta o resto)
   - Siga o prompt escolhido. Formato da loja: título em MAIÚSCULAS; 2 parágrafos de até 230 caracteres, sem linha em
     branco entre eles; "Especificações técnicas:" com "- Nome: valor;"; as duas últimas linhas são
     "- Dimensões(CxLxA): 43x18x19mm;" e "- Peso: 7g;" (com os valores do produto); "Itens inclusos: (Cod:SKU)" com
     "- 01 ITEM;"; "Garantia:" com "- Garantia Legal de 90 dias (contra defeitos de fabricação);".
   - Campo que nenhuma loja informa: pesquise (datasheet do fabricante primeiro). Só preencha com fonte; senão "?".
   - Divergência entre lojas: decida e registre (campo, opções com as lojas, a escolhida e o porquê).
   - Texto de propaganda não entra nas especificações.

5. TÍTULOS: 3 opções em MAIÚSCULAS, até 60 caracteres, no padrão TIPO + FUNÇÃO + MODELO/CI + ESPECIFICAÇÃO +
   COMPATIBILIDADE, variando o que ganha espaço, a partir das minhas palavras-chave e dos títulos dos concorrentes.
   Uma recomendada. O título do produto não muda.

6. CAMPOS (cada um com valor e origem; sem fonte, fica de fora)
   - marca: fabricante claro vira a marca (NEXTION, ESPRESSIF); placa compatível com Arduino = GENÉRICA; dúvida =
     GENÉRICA; MAIÚSCULAS; nome de loja nunca é marca.
   - modelo: pelo mesmo processo (NANO V3); sem evidência, fora.
   - unidade: KIT só em composição; MT quando vendido por comprimento; UN no resto.
   - código: só se o produto não tiver (próximo da faixa 25xxxx); localização nunca.
   - garantiaMeses: sempre 3.
   - peso e medidas: a da Usinainfo quando ela é concorrente vinculada e publica; sem ela, a mais repetida entre os
     concorrentes; campo já preenchido no produto fica como está.
   - NCM: o da Fortek quando ela é fornecedor; sem ela, o mais repetido entre os fornecedores. Origem fiscal: 2 com
     fornecedor, 0 sem. Campo já preenchido fica como está.
   - estoque mínimo e máximo: não proponha (são meus); se estiverem vazios, diga no relatório.

6b. FOTOS: baixe as candidatas com baixarCandidatas(sku, ids) (até 20 por vez, só os ids da leitura) e OLHE com
   folhaDeContato(sku, pagina) (as atuais têm borda verde). Escolha 6 a 8 (com menos de 6, todas): a primeira ilustra o
   título; ângulos variados; mesmo tom; sem desfoque, repetidas, marca d'água ou banner; nada que contradiga a ficha.
   Toda candidata, escolhida ou não, leva o motivo; foto atual entra como fotoAtual.

7. PREÇO: custo = o do fornecedor padrão. Concorrentes com o preço NORMAL e com estoque (sem estoque e a própria 4hobby
   ficam de fora). Margem do Rise = (preço x 0,94 - custo) / preço. Mostre 3 opções (40%, 50%, 60%) com o preço e a
   posição entre os concorrentes (1º = o mais barato), e a RECOMENDADA = a maior margem, de 1 em 1%, que ainda fica
   entre os 5 primeiros (pode ficar abaixo de 40%). Sem custo: sem recomendada, e diga por quê.

8. EAN: junte os EANs que os concorrentes publicam; confira o dígito; pesquise cada um (EAN-Search, Product-Search,
   Cosmos) e na internet; se nenhum for deste produto, procure por palavras-chave. Nada confiável: EAN vazio, com os
   descartados e o motivo. EAN não se gera.

9. RELATÓRIO PROFISSIONAL, em tópicos com título, nesta ordem:
   "Resumo" (2 a 4 itens: o que foi feito e o principal resultado), "Fontes consultadas" (fornecedores, concorrentes,
   prompt, sites pesquisados), "Decisões tomadas" (cada divergência: campo, opções, a escolhida e o porquê),
   "Para você conferir" (atencao: true; o que ficou "?" ou vazio e o que depende de mim), "Fiscal" (NCM, origem,
   EAN e o que os concorrentes publicam diferente), "Preço" (custo, concorrentes que entraram e os que ficaram de
   fora), "Fotos" e "Documentos" (o que não abre ou não foi baixado). Tópico sem nada a dizer fica de fora.
   Cada item é uma frase curta e completa; nada de parágrafo corrido.

COMO ENTREGAR: grave cada seção com gravarSecao(sku, secao, conteudo), uma por chamada, na ordem descricao, titulos,
fotos, campos, preco, ean, documentos, relatorio. Se uma seção voltar com erro, corrija pelo que a mensagem diz e grave
de novo. No fim, confira com lerProposta(sku) e me mostre um resumo curto (título recomendado, preço recomendado com a
posição, EAN, o que ficou "?", fotos escolhidas). Conteúdo de cada seção:
- descricao: { "texto", "prompt", "divergencias": [{ "campo", "opcoes": [{ "valor", "lojas": [] }], "escolhida", "motivo" }],
  "pesquisadas": [{ "linha", "fonte" }], "interrogacoes": [] }
- titulos: { "opcoes": [3 textos], "recomendada": 0|1|2, "motivo", "concorrentes": [] }
- fotos: { "candidatas": [{ "id", "arquivo" (de baixarCandidatas) ou "fotoAtual", "origem": { "loja" }, "escolhida",
  "ordem" (só nas escolhidas, 0 = a principal), "motivo" }] }
- campos: { "<campo>": { "valor", "origem" } }
- preco: { "custo", "opcoes": [{ "margem", "preco", "posicao": { "posicao", "total" } }], "recomendada": { ...igual }
  ou null, "motivoSemRecomendada": texto ou null }
- ean: { "escolhido": { "valor", "origem" } ou null, "descartados": [{ "valor", "motivo" }], "buscas": [] }
- documentos: { "itens": [{ "id", "titulo", "url", "loja" }] }
- relatorio: { "topicos": [{ "titulo", "itens": [frases curtas], "atencao": true só em "Para você conferir" }] }
Não chame anotarDuvida na proposta.
```
