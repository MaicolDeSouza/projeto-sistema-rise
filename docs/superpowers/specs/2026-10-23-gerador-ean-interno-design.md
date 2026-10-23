# Gerador de GTIN/EAN interno

Data: 2026-10-23. Decisões do dono na conversa de brainstorming; o que foi escolha minha está marcado como "minha chamada".

## Intenção

A 4hobby quer um código de barras GTIN/EAN para cada produto, gerado pelo próprio Rise, que preencha o campo
GTIN/EAN do cadastro e, por ele, os campos que vão ao Mercado Livre, ao Bling, à Shopee e aos outros marketplaces.
O dono decidiu NÃO se associar à GS1 Brasil (custo). Ele sabe que o Mercado Livre confere o GTIN na base da GS1 e
que a SEFAZ valida o GTIN da NF-e, e decidiu resolver esses dois pontos depois, fora deste trabalho.

## Formato do código (Opção 1, escolhida pelo dono)

EAN-13 da faixa de uso interno da GS1 (prefixo 2), derivado do SKU:

    2 + zeros à esquerda + dígitos do SKU + dígito verificador (módulo 10 do EAN)

Os 12 primeiros dígitos são `2` seguido do SKU preenchido com zeros à esquerda até 11 dígitos. Exemplos:

| SKU    | EAN gerado      |
|--------|-----------------|
| 100101 | 2000001001011   |
| 250012 | 2000002500124   |

(Dígitos verificadores calculados à mão pelo módulo 10 do EAN; os testes conferem estes dois casos.)

Por que assim: não precisa de contador nem sequência no banco; nunca repete porque o SKU é único e nunca
reaproveitado; quem lê a etiqueta enxerga o SKU dentro do número; e a faixa 200 a 299 é a que a GS1 reserva para
numeração interna, então não colide com produto real de fabricante.

Limites, ditos ao dono: só gera para SKU composto só de dígitos, com até 11 deles. SKU com letras ou traço
(ex.: ZZ-TESTE-KIT) não gera, e a tela diz o motivo.

## Onde fica

- Botão **Gerar** ao lado do campo GTIN/EAN no cadastro de Produto (`FormularioProduto.jsx`), no mesmo molde do
  botão que gera o SKU. Aparece só quando o campo está vazio e o SKU já está preenchido; ao clicar, preenche o campo
  e marca o formulário como alterado. Nada é salvo até o Salvar.
- Minha chamada: o cálculo mora numa função pura em `src/lib/ean.js` (gerar a partir do SKU, calcular e conferir o
  dígito verificador), sem acesso ao banco, para o formulário, o Salvar e os testes usarem a mesma regra.

## Validação no Salvar (minha chamada)

- Código de 13 dígitos que começa com `2` passa a ter o dígito verificador conferido no Salvar; errado é recusado
  com mensagem no campo e ao lado do Salvar, como já acontece com o EAN repetido. Códigos de fabricante (outros
  prefixos) continuam aceitos como hoje, sem conferir dígito, porque existem códigos reais gravados que não vale
  arriscar barrar.
- A recusa de EAN repetido continua valendo; o gerado passa por ela como qualquer outro.

## Não faz parte (non-goals)

- Gerar em lote para todos os produtos sem EAN. Fica para um pedido futuro, se o dono quiser.
- Mudar o que os canais fazem com o código: o ML continua recebendo o EAN como GTIN (vai dar "GTIN inválido" para
  código interno), o Bling e a LI continuam gravando como hoje. O dono disse que resolve isso depois.
- Imprimir etiqueta com o código de barras.
- Mexer na proposta automática (seção `ean` do roteiro do MCP) ou na sincronização com o Bling.

## Anti-goals

- Nunca imitar prefixo de empresa (789 etc.): poderia bater com produto real de outra empresa.
- Nunca sobrescrever um EAN já preenchido: o botão não aparece com o campo cheio.
- Nunca reaproveitar: como deriva do SKU, e SKU excluído não volta, o código tampouco volta.

## Abordagens consideradas

1. **Derivado do SKU (escolhida).** Sem contador, legível, único por construção. Troca: só SKU numérico.
2. **Contador próprio** 2000000000001, 2000000000002... "maior mais um". Serve a qualquer SKU, mas o número não diz
   nada e dois cadastros abertos juntos podem disputar o mesmo número.
3. **Imitar prefixo GS1 brasileiro (789...)**. Descartada: código falso com cara de real pode colidir com produto de
   outra empresa.

## O que fica para o construtor

- Posição exata e ícone do botão, seguindo o botão de gerar SKU e o Padrão visual das telas do CLAUDE.md.
- Texto exato das mensagens (SKU com letras; dígito verificador errado).
- Testes: dígito verificador em casos conhecidos (ex.: 4006381333931 é válido), geração a partir de SKUs de 6 e de
  11 dígitos, recusa de SKU com letras e de SKU com mais de 11 dígitos, e a validação no Salvar.
