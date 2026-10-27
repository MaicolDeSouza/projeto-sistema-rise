# Prompts de descrição — Componentes

- [Bornes de placa](01-bornes.txt) (27/10/2026, pedido do dono com os exemplos 900902, 902202 e 900904_z): bornes de
  parafuso (KRE, KF301, KF350, KF128), plugáveis macho e fêmea (2EDG, KF2EDG, 15EDG) e de pressão de placa. Feito a partir
  dos 284 bornes de placa coletados de 15 concorrentes (Mamute, Solda Fria, Saravati, Smartkits, Ryndack, Eletrus,
  Eletrogate, Usinainfo...): passo, vias, corrente, tensão, bitola, fixação do fio, materiais e cor são os campos que mais
  aparecem. Parágrafos simples e diretos (o 1º até 200 caracteres, o 2º até 300), pedido do dono. Ficam de fora os bornes de
  trilho DIN, os bornes para pino banana e as barras de emenda (sindal). Na biblioteca da VPS, o nome "Componentes-Bornes".
  Aprovado pelo dono em 27/10/2026; o roteiro da proposta (v14) passou a deixar o tamanho de parágrafo do prompt valer.
- [Barras de pinos](02-barras-de-pinos.txt) (27/10/2026, pedido do dono com o exemplo 900212, fêmea 1x18): macho e fêmea,
  torneadas, de uma ou duas fileiras, retas ou 90°, e empilháveis para shield. O de bornes não servia (Tipo de Borne,
  Fixação e Bitola do Fio não existem numa barra). Mesmo molde e mesmo tamanho de parágrafo do de bornes; os campos vêm das
  fichas de Ryndack, Smartkits, Eletrogate e Curto Circuito (passo, vias, fileiras, ângulo, cor, corrente, tensão). Regra
  própria: barra da mesma família com outra quantidade de vias confirma passo, corrente, tensão, materiais e cor, mas nunca
  medida e peso. Na biblioteca da VPS, o nome "Componentes-Barras de Pinos". Esperando a aprovação do dono.

Segue as regras dos prompts de Embarcados (ver `../embarcados/LEIA-ME.md`): campo sem dado confirmado sai da descrição,
nomes padronizados por campo, "possui" em vez de "tem" e " / " entre informações distintas no mesmo valor. Diferença: aqui
Cor e os materiais entram nas características, porque decidem a compra de um borne.
