# Prompts de descrição — Fontes e Conversores

- [Mini fontes AC-DC para placa](01-mini-fontes-ac-dc.txt) (27/10/2026, pedido do dono com o exemplo 220505, Hi-Link
  HLK-PM01 5V 3W): as encapsuladas para soldar na placa (Hi-Link HLK-PM, HLK-PM-L, 5M, 10M e 20M; Mean Well IRM-03 e
  IRM-05; SHB-5W) e as abertas, sem invólucro (XL-007, "mini fonte aberta 5V 700mA"). Feito a partir das 110 mini fontes
  coletadas de 17 lojas (Smartkits, Usinainfo, Eletrogate, Curto Circuito, Saravati, Mamute, Casa da Robótica, Robocore,
  Easytronics, Metaltex...) e do datasheet da Hi-Link do HLK-PM01: tensão de entrada e de saída, corrente de saída
  (contínua e de pico), potência, corrente de entrada, eficiência, consumo sem carga, temperatura e medidas são os campos
  que mais aparecem. Mesmo molde e mesmo tamanho de parágrafo dos prompts de Componentes (o 1º até 200 caracteres, o 2º
  até 300) e peso e dimensões OBRIGATÓRIOS, como no de barras de pinos. Ficam de fora as fontes de tomada com plugue,
  as de caixa metálica ou de trilho DIN (colmeia, industriais, Andeli), os conversores DC-DC e os carregadores de
  bateria. Na biblioteca da VPS, o nome "Fontes-Mini Fontes AC-DC". Aprovado pelo dono em 27/10/2026.
  Depois de ver a descrição do 220505, o dono tirou (27/10/2026) corrente de entrada, corrente de partida, ripple,
  regulação de linha e de carga, pinagem, temperatura de armazenamento, umidade e MTBF: o prompt manda não escrevê-los.

Regras próprias, porque as lojas erram aqui: a corrente contínua e a de pico são coisas diferentes (o pico nunca vira
a corrente de saída); a tensão nominal (100 a 240VAC) e a faixa do fabricante (90 a 264VAC) ficam separadas; a versão
"L" (HLK-PM01L) é outro modelo, menor; e isolação e eficiência divergem entre lojas e entre versões do datasheet
(2500VAC e 3000VAC; 70% e 73%), então vale o datasheet do mesmo modelo.

Segue as regras dos prompts de Embarcados e de Componentes (ver `../embarcados/LEIA-ME.md` e
`../componentes/LEIA-ME.md`): campo sem dado confirmado sai da descrição, nomes padronizados por campo, "possui" em vez
de "tem" e " / " entre informações distintas no mesmo valor.
