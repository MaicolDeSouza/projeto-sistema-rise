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
- [Fitas de níquel](02-fitas-de-niquel.txt) (04/11/2026, pedido do dono com 900907, 900908 e 900911): tiras e fitas
  simples ou duplas (2P) de níquel puro ou de aço niquelado para solda ponto em packs 18650/21700. Regra principal: o
  material decide a compra, e "Aço Níquel" é aço niquelado, nunca "níquel puro", mesmo que o título diga só "níquel".
  Corrente só com fonte da mesma medida. Peso calculado pelo volume (aço 7,85g/cm³, níquel 8,9g/cm³; na fita dupla, o
  peso máximo pela largura total); a fita vendida enrolada mostra a fita esticada na descrição e fica com o rolo nos
  campos de frete. Parágrafos curtos (até 250 e 400). Na biblioteca da VPS, o nome "Fontes-Fitas de Níquel". Esperando
  a aprovação do dono.
- [Fontes chaveadas](03-fontes-chaveadas.txt) (04/11/2026, pedido do dono com o 111008, fonte 5V 3A micro USB): os dois
  tipos que o catálogo tem, a de tomada (micro USB, USB-C, P4, as de mesa Andeli) e a colmeia (caixa metálica com
  bornes, slim, trilho DIN), cada um com a sua lista de campos obrigatórios. Feito a partir das fichas coletadas: 181
  fontes de tomada de 17 lojas (tensão de entrada e de saída, cabo, plugue, corrente, peso) e 272 colmeias de 20 lojas
  (tensão, corrente, potência, entrada AC, proteções, grau de proteção, eficiência). Regras: "real" e "RMS" na corrente
  saem, potência = tensão × corrente quando não publicada, bivolt automático não é chave seletora, compatibilidade com
  Raspberry Pi só a que o conector permite (micro USB não serve no Pi 4; 5V 3A não serve no Pi 5), e "peso com
  embalagem" nunca. Ficam de fora as mini fontes para placa (prompt 01), bancada, tubo laser, PoE e DC-DC. Parágrafos
  até 250 e 400, e os itens que o dono tirou das mini fontes (ripple, MTBF, corrente de entrada...) também não entram.
  Na biblioteca da VPS, o nome "Fontes-Fontes Chaveadas". Esperando a aprovação do dono.
  Em 05/11/2026 o dono pediu a temperatura mínima e máxima de operação em toda fonte chaveada: a Temperatura de
  Operação virou campo OBRIGATÓRIO nos dois tipos (era condicional, só na colmeia), sempre com as duas pontas. Ordem:
  datasheet do mesmo modelo, referência do mesmo modelo ou da mesma fonte genérica, e só então a faixa padrão do tipo,
  com a decisão registrada: de tomada 0°C a 40°C (fonte oficial da Raspberry Pi e fontes plásticas genéricas medidas)
  e colmeia genérica -10°C a 60°C (série S-xxx). Mean Well LRS publica -25°C a 70°C com redução de potência: vale o
  datasheet. Quase nenhuma loja publica a faixa nas fontes coletadas: 0 a 40°C nas de tomada da Eletrus e na do
  Raspberry Pi 5 da Smartkits, -20 a 60°C na 12V 5A da Smartkits.

Regras próprias, porque as lojas erram aqui: a corrente contínua e a de pico são coisas diferentes (o pico nunca vira
a corrente de saída); a tensão nominal (100 a 240VAC) e a faixa do fabricante (90 a 264VAC) ficam separadas; a versão
"L" (HLK-PM01L) é outro modelo, menor; e isolação e eficiência divergem entre lojas e entre versões do datasheet
(2500VAC e 3000VAC; 70% e 73%), então vale o datasheet do mesmo modelo.

Segue as regras dos prompts de Embarcados e de Componentes (ver `../embarcados/LEIA-ME.md` e
`../componentes/LEIA-ME.md`): campo sem dado confirmado sai da descrição, nomes padronizados por campo, "possui" em vez
de "tem" e " / " entre informações distintas no mesmo valor.

- **09/11/2026:** a seção PARÁGRAFOS de todos os prompts desta pasta passou a trazer o bloco ESTILO DOS PARÁGRAFOS (regras comuns em `../LEIA-ME.md`, pedido do dono: o texto não fluía); o conteúdo de cada parágrafo continua o mesmo.
