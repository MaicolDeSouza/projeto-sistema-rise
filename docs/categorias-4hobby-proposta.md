# Proposta de categorias da loja 4hobby (Loja Integrada)

Data: 06/10/2026. Base: 1.315 produtos do catálogo do Rise (importados do Bling), categoria atual de 672 deles lida do próprio site (fonte "4hobby" do bloco Mercados), menus de 8 concorrentes e as categorias dos 16 concorrentes coletados pelo Rise.

Arquivo companheiro: `docs/categorias-4hobby-mapeamento.csv` (1.315 linhas: sku, título, nível 1, nível 2, nível 3, chave, categoria atual no site, preço, estoque). É esse arquivo que o Rise vai ler quando a sessão "enviar produto à LI" existir.

## 1. Resumo

- O site hoje tem **6 categorias de topo e 59 folhas**, mas 784 produtos no ar contra **1.315 no catálogo**: 629 produtos vendáveis não têm lugar na árvore atual.
- A proposta é uma árvore de **12 categorias de topo, 2 níveis** (3º nível só em "Movimento Linear", como a Impacto CNC faz), **76 folhas**, todas com produto de verdade dentro.
- Cada um dos 1.315 SKUs já está classificado no CSV. 14 ficam fora do site (6 "OBSOLETO", 6 "USO E CONSUMO", 1 projeto especial, 1 teste do Bling).
- Decisões que são suas estão na seção 7.

## 2. O que está errado na árvore atual

| Problema | Evidência |
| --- | --- |
| Depósito "Geral" | 21 produtos sem relação entre si: hotend, mesa aquecida, tomada de painel, SSR, peltier, laser sinalizador |
| Mesma coisa em dois lugares | "Módulos" (12) e "2 - Módulos e shields" (118); "Acessórios" (27, CNC) e "5 - Acessórios" (15, embarcados); sensores dentro de "Módulos e shields" (HC-SR04, PIR, BME280, ACS712) e também em "Sensores" |
| Uma folha gorda | "2 - Módulos e shields" com 118 itens misturando case de Arduino, câmera, relé, conversor, wireless e sensor |
| Folhas quase vazias | Válvulas (1), Ferramentas (1), Perfis (1), Teclados (2), Carros Robóticos (2), Microventilador (3), Sensor de fluxo (3) |
| Número no nome | "1 - Placas Embarcados", "2 - Módulos e shields": o número de ordenação vazou para o nome, a URL e o Google |
| 28 subcategorias em EletroEletrônico | Lista longa demais para bater o olho; concorrentes ficam entre 7 e 14 por grupo |
| Metade do catálogo sem casa | 629 produtos vendáveis fora do site. Famílias inteiras sem categoria: esteiras porta-cabos (22), bornes e trilho DIN (27), termo retrátil (17), caixas plásticas (14), componentes discretos (~100), quadros elétricos, cremalheiras, perfis |

## 3. O que os concorrentes fazem

| Loja | Categorias de topo | Padrão que vale copiar |
| --- | --- | --- |
| Eletrogate | 11 | Sensores separados por grandeza (temperatura, corrente, gás...); Displays e Wireless/IoT no topo |
| Usinainfo | 10 | Nomes compostos e descritivos ("Módulos Relé e Acionamento", "Conversores de Sinal e Nível Lógico"); Raspberry dentro de Placas |
| Casa da Robótica | 10 | Sensores & Módulos juntos; Fontes & Conversores no topo; Display no topo |
| Smartkits | 9 | Enxuta: Arduino, IoT, Sensores, Módulos, Robótica, Componentes, Prototipagem, Ferramentas, Impressão 3D |
| Curto Circuito | 10 | Componentes com 17 folhas por tipo de componente |
| Impacto CNC | 7 | Mecânica em 3 níveis: Mecânicos > Correias e Polias > Polias GT2; Fixação separada |
| Robocore | 14 | Muitas entradas de marca; não copiar |
| Eletrus / Metaltex | 6 grupos | Industrial separa "Comando e Sinalização" (botões, sinaleiros) de "Eletricidade" (bornes, trilho, quadros) |

Conclusões: 9 a 11 categorias de topo é a norma; sensores viram subcategorias por grandeza medida; displays aparecem no topo em 3 de 8 lojas; quem vende CNC usa 3 níveis na mecânica; quem vende industrial separa botoeira de borne.

## 4. Árvore proposta (com a contagem de produtos de hoje)

Nomes sem número, com acento, prontos para o cadastro. A ordem do menu é a desta lista; na LI a ordem vai no campo próprio, não no nome.

**1. Placas e Embarcados** (83)
- Arduino e Compatíveis (9)
- ESP32 e ESP8266 (20)
- Raspberry Pi e Acessórios (21)
- STM32 e Outras Placas (8)
- Shields e Placas de Interface (16)
- Gravadores e Programadores (4)
- Kits Arduino e Educacionais (5)

**2. Módulos** (98)
- Relés, MOSFET e Potência (15)
- Comunicação Serial, CAN e Ethernet (20)
- Conversores de Sinal e Nível Lógico (15)
- Wireless, IoT e Antenas (19)
- RFID e Biometria (6)
- RTC, Memória e Cartões SD (10)
- Áudio, Teclados e Controles (13)

**3. Sensores** (98)
- Temperatura e Umidade (14)
- Distância, Presença e Movimento (12)
- Indutivos, Capacitivos e Fim de Curso (18)
- Corrente e Tensão (9)
- Gás, Chama, Som, Luz e Cor (18)
- Fluxo, Nível, Chuva e Solo (15)
- Peso, Carga e Piezo (12)

**4. Displays e Telas** (36)
- Telas Nextion (18)
- Displays LCD, OLED e TFT (9)
- Telas para Raspberry Pi (4)
- 7 Segmentos e Matriz de LED (5)

**5. Automação Industrial** (90)
- CLP e IHM (17)
- Botões, Chaves e Sinalização de Painel (25)
- Relés de Estado Sólido e Industriais (3)
- Controladores de Temperatura e Encoders (8)
- Bornes, Trilho DIN e Quadros (27)
- Ventilação e Refrigeração (10)

**6. Energia e Alimentação** (80)
- Fontes Chaveadas (22)
- Conversores DC-DC Step Up e Step Down (11)
- Baterias, Carregadores e BMS (19)
- Suportes de Pilha e Acessórios de Bateria (22)
- Voltímetros, Medidores e Testadores (6)

**7. Motores, Drivers e Robótica** (90)
- Motores de Passo e Servos Industriais (18)
- Drivers para Motor de Passo (14)
- Motores DC e Caixas de Redução (19)
- Servos, Brushless e Aeromodelismo (8)
- Drivers e Controladores de Motor DC (8)
- Bombas, Válvulas e Solenoides (17)
- Chassis, Rodas e Partes Robóticas (6)

**8. CNC, Laser e Impressão 3D** (360)
- Movimento Linear (166)
  - Fusos e Castanhas (29)
  - Eixos, Guias e Rolamentos Lineares (34)
  - Mancais e Suportes de Eixo (16)
  - Acoplamentos e Flanges (21)
  - Polias, Roldanas e Correias (54)
  - Cremalheiras e Engrenagens (12)
- Perfis de Alumínio e Fixação V-Slot (48)
- Esteiras Porta Cabos (22)
- Controladoras e Eletrônica CNC (13)
- Spindles, Inversores e Acessórios (12)
- Fresas, Brocas e Pinças (24)
- Laser: Módulos e Peças (25)
- Impressão 3D: Hotend, Bicos e Peças (42)
- Máquinas e Equipamentos (8)

**9. Componentes Eletrônicos** (146)
- Resistores, Potenciômetros e Trimpots (28)
- Capacitores e Cristais (8)
- Diodos, Transistores e MOSFETs (26)
- Circuitos Integrados, Reguladores e Soquetes (37)
- LEDs e Suportes (19)
- Buzzers e Alto-falantes (5)
- Fusíveis, Filtros e Proteção (3)
- Chaves, Botões e Interruptores (20)

**10. Conectores e Cabos** (155)
- Conectores JST, Dupont e Barras de Pinos (40)
- Conectores Circulares, Plugs e Jacks (25)
- Bornes, Terminais e Emendas (12)
- Conectores DB, RJ45, HDMI e Adaptadores (13)
- Cabos USB, HDMI e Extensões de Painel (26)
- Fios, Jumpers e Cabos Diversos (22)
- Termo Retrátil e Organização de Cabos (17)

**11. Prototipagem e Ferramentas** (57)
- Protoboards e Placas de Circuito (8)
- Soldagem (3)
- Ferramentas e Instrumentos de Bancada (10)
- Parafusos, Espaçadores e Fixação (22)
- Caixas Plásticas e Organizadores (14)

**12. Softwares e Serviços** (8)
- Softwares e Licenças (4)
- Serviços (4)

**Fora do site** (14): 6 títulos "OBSOLETO-", 6 "USO E CONSUMO-" (termo retrátil PVC de bateria), "Projeto especial - Máquina Colagem" e `ZZ-TESTE-BLING`.

### Regras que guiaram a árvore

- **Uma folha só existe se tem produto hoje.** Nada de "em breve". As menores (Soldagem 3, Fusíveis 3, SSR 3) ficam porque são famílias que você compra regularmente; se preferir, podem ser fundidas (ver seção 7).
- **O cliente pensa pela função, não pelo chip.** "Relés, MOSFET e Potência" junta módulo relé, SSR módulo, mosfet IRF520 e dimmer porque todos acionam carga. Sensores agrupados pela grandeza que medem, como Eletrogate e Usinainfo fazem.
- **Industrial separado do maker.** Botão 22 mm, sinalizador 24 V, borne mola e quadro elétrico ficam em "Automação Industrial", e não misturados com chave gangorra e LED 5 mm. Quem compra um é outro público.
- **CNC segue a lógica da Impacto CNC**, a referência do segmento: Movimento Linear com 3º nível, estrutura (perfil e fixação) à parte, eletrônica à parte, consumíveis (fresas) à parte.
- **Acessório anda com o sistema dele.** Cabo de programação de CLP fica em CLP e IHM; conector molex da Nextion fica em Telas Nextion; display da RAMPS fica em Impressão 3D.
- **Sem categoria "Outros"/"Geral".** Os 21 itens de "Geral" foram todos realocados (8 para Impressão 3D, 4 para Laser, 4 para Industrial, 2 para Chaves, 1 Termo Retrátil, 1 CNC eletrônica, 1 Trilho DIN).

## 5. De onde cada categoria atual vai (672 produtos conferidos)

| Categoria atual no site | Qtd | Vai para (principal) | Também para |
| --- | --- | --- | --- |
| 2 - Módulos e shields | 109 | Módulos (50, em 6 folhas) | Shields e Interfaces 14, Sensores 16, ESP32 6, Displays 5, Drivers 4, Energia 4, outros |
| Conectores e Bornes | 54 | Conectores e Cabos (51) | Bornes Trilho DIN 2, Acessórios de Bateria 1 |
| Sensores | 42 | Sensores (39, em 7 folhas) | Impressão 3D 2 (KW11, termistor), RFID 1 |
| Polias e Roldanas | 29 | Polias, Roldanas e Correias (27) | Rolamentos (608ZZ) 2 |
| Acessórios (CNC) | 26 | Perfis e Fixação V-Slot (12) | Impressão 3D 6, Fusos 4, Correias 2, Bombas 1, Máquinas 1 |
| Cabos | 23 | Cabos USB/HDMI (11), Fios e Jumpers (8) | CLP 1, Raspberry 1, CNC 1, Impressão 3D 1 |
| 1 - Placas Embarcados | 22 | ESP32 e ESP8266 (11), Arduino (8) | STM32 3 |
| Geral | 21 | Impressão 3D (8), Laser (4) | Industrial 4, Chaves 2, outros 3 |
| 3 - Telas e LCD | 20 | Telas Nextion (12), LCD/OLED (6) | Telas Raspberry 2 |
| Baterias e Acessórios | 19 | Baterias e BMS (9), Suportes de Pilha (9) | Soldagem 1 (solda ponto) |
| Mancais e Suportes | 19 | Mancais e Suportes de Eixo (16) | Fusos (suporte de castanha) 3 |
| Leds e Lampadas | 19 | LEDs e Suportes (15) | Sinalização de Painel 4 (sinalizadores 22 mm) |
| Fusos | 18 | Fusos e Castanhas (18) | |
| Fontes | 17 | Fontes Chaveadas (17) | |
| Rolamento Linear e Pillow Block | 17 | Eixos, Guias e Rolamentos (17) | |
| Acoplamentos | 17 | Acoplamentos e Flanges (17) | |
| Fresas e Brocas | 16 | Fresas, Brocas e Pinças (16) | |
| Conversores | 15 | DC-DC (6), Comunicação Serial (5) | Adaptadores 2, Ferramentas 1, Wireless 1 |
| 5 - Acessórios | 15 | Raspberry Pi (6) | Cartões SD 3, Gravadores 3, RFID 2, Baterias 1 |
| Hardware | 13 | Fixação V-Slot (8) | Parafusos e Espaçadores 5 |
| Componentes | 13 | Componentes Eletrônicos (11, em 5 folhas) | Sensores 2 (LDR, DS18B20) |
| Chaves e Botões | 13 | Chaves e Interruptores (9) | Sinalização de Painel 4 (emergência, 22 mm) |
| Módulos | 12 | Medidores e Testadores (5) | Relés 2, Drivers DC 2, Wireless 2, Nível 1 |
| 1 - CLPs e IHMs | 12 | CLP e IHM (12) | |
| Motores | 10 | Motores DC (5) | Spindles 2 (775), Servos 2, Chassis 1 |
| Correias (7), Prototipagem (7), Motor de passo (6), Células de Carga (6), Eixo/Guia Linear (5), Antenas (5), Placas de controle (4), Eletroímãs (4), Esteira (3), Mini Bomba (3), Sensor de fluxo (3), Microventilador (3), Softwares (3) | | Cada uma inteira para a folha equivalente | |
| Driver (5) | 5 | Drivers de Passo (4) | Drivers DC 1 (L298) |
| Equipamentos (2), Encoder (2), Carros Robóticos (2), Teclados (2), Termoretrátil (2), Kits (2), Spindles (1), Perfis (1), Válvulas (1), Ferramentas (1) | | Folha equivalente | |
| Cremalheira e Pinhão | 1 | Impressão 3D (era a engrenagem da extrusora MK8) | |

## 6. O que a árvore nova destrava: 629 produtos que hoje não estão no site

| Categoria proposta | Produtos sem categoria hoje |
| --- | --- |
| CNC, Laser e Impressão 3D | 164 (esteiras, perfis, porcas martelo, cremalheiras, laser CO2, mesas aquecidas) |
| Componentes Eletrônicos | 109 (resistores, CIs CD40xx, MOSFETs, reguladores, kits SMD) |
| Conectores e Cabos | 80 (JST por via, Dupont por via, termo retrátil por bitola, fio de silicone) |
| Automação Industrial | 58 (bornes mola, trilho, quadros, prensa cabo, botões iluminados) |
| Motores, Drivers e Robótica | 51 |
| Prototipagem e Ferramentas | 41 (caixas PB, insertos, parafusos de manopla) |
| Sensores | 31 |
| Energia e Alimentação | 28 |
| Placas e Embarcados | 27 |
| Módulos | 24 |
| Displays e Telas | 11 |
| Softwares e Serviços | 5 |

Atenção: muitos desses têm **título fora do padrão** (minúsculas, `*SKU` no fim, "Vias: 2 Vias" das variações). Publicar na LI vai exigir passar o título pelo padrão do Rise antes. É trabalho da sessão de envio, não desta.

## 7. Decisões suas (recomendação marcada)

**7.1 Tamanho do menu**
- **Opção 1 (recomendada): 12 categorias de topo**, como na seção 4. Displays e Telas fica no topo porque a linha Nextion (18 itens, ticket de R$ 400 a R$ 1.350) merece um clique só; Softwares e Serviços fica no topo porque o site já tem "Serviços" e são itens de natureza diferente.
- Opção 2: 10 categorias. Displays e Telas vira subcategoria de Placas e Embarcados; Softwares e Serviços vira subcategoria de CNC. Menu mais curto, Nextion a dois cliques.

**7.2 Terceiro nível em Movimento Linear**
- **Opção 1 (recomendada): manter** (CNC > Movimento Linear > Fusos e Castanhas). São 166 produtos em 6 famílias; sem o nível intermediário, CNC teria 14 subcategorias lado a lado. O site atual já usa 3 níveis em CNC > Mecânica, então a LI aceita.
- Opção 2: achatar. CNC com 14 subcategorias diretas.

**7.3 Onde ficam as bombas d'água de laser e spindle (3 itens) e o compressor de ar do laser**
- **Opção 1 (recomendada): em Bombas, Válvulas e Solenoides**, com a categoria de Laser ou Spindles como **segunda categoria** (a LI permite mais de uma por produto). Quem procura "bomba" acha tudo junto; quem está no Laser também vê.
- Opção 2: só em Laser / Spindles.

**7.4 Motor DC 775 "mini spindle" (2 itens)**
- **Opção 1 (recomendada): Spindles, Inversores e Acessórios.** É comprado por quem monta router de PCB.
- Opção 2: Motores DC e Caixas de Redução.

**7.5 Folhas pequenas (Soldagem 3, Fusíveis/Filtros 3, SSR industriais 3, Gravadores 4, Telas Raspberry 4)**
- **Opção 1 (recomendada): manter.** São famílias que você repõe; folha pequena com nome certo vale mais que folha "Outros".
- Opção 2: fundir (Soldagem dentro de Ferramentas; Fusíveis dentro de Componentes > Diodos...; SSR dentro de Controladores).

**7.6 Os 629 produtos que não estão no site**
- Publicar todos na LI com a árvore nova, ou só os que já estão no ar? Isso define o tamanho do trabalho de títulos e fotos na sessão de envio.

### Itens que classifiquei no critério e você pode discordar

| SKU | Produto | Ficou em | Alternativa |
| --- | --- | --- | --- |
| 111001/2/7 | Cartões micro SD SanDisk | Módulos > RTC, Memória e Cartões SD | Raspberry Pi e Acessórios |
| 110501/110502 | Controle Super Nintendo USB, controle Xbox 360 | Raspberry Pi e Acessórios (retrogame) | Softwares e Serviços ou tirar do site |
| 180501 | Micro chave fim de curso KW11 "impressora 3D" | Impressão 3D | Sensores > Fim de Curso |
| 960403/4/5 | Insertos metálicos "para impressora 3D" | Impressão 3D | Parafusos e Fixação |
| 920325 | Potenciômetro 10K 22 mm para inversor | Resistores e Potenciômetros | Spindles e Inversores |
| 122404 | Pressostato de água HT-30 para CO2 | Laser: Módulos e Peças | Sensores > Fluxo e Nível |
| 192804 | Controlador de nível XH-M203 com relé | Sensores > Fluxo, Nível | Módulos > Relés |
| 170301 | Sonoff | Wireless, IoT e Antenas | Relés e Potência |
| 120128 | "Mangueira flexível para câmera" | Laser (título não diz o uso) | confirmar o que é |
| 120523 | Servo motor AC 400 W com drive | Motores de Passo e Servos Industriais | Spindles e Inversores |
| 150101 | Conta-giro | Ferramentas e Instrumentos | Spindles |
| 100271 | Relé com soquete 24 VDC 10 A | Relés de Estado Sólido e Industriais | Módulos > Relés |

## 8. Como isso entra no Rise e na Loja Integrada

- **A Loja Integrada é alimentada pelo Bling**, e a ajuda do Bling diz que a integração com a LI **só vincula categorias**: a categoria tem que existir dos dois lados e ser ligada uma a uma no painel do Bling. Logo a mesma árvore precisa ser criada **na LI e no Bling**, e o "De/Para" feito no Bling. Confirmar no painel antes de criar as 76 folhas duas vezes.
- **No Rise não existe campo de categoria em `Produto`** (conferido no `schema.prisma`). A sessão de envio vai precisar de uma tabela de categorias (árvore com pai, nome, ordem, id na LI, id no Bling) e de um campo no produto apontando para a folha. O CSV deste trabalho já é o conteúdo inicial dessa tabela e desse campo.
- **Mais de uma categoria por produto**: a LI aceita; o Bling, conferir. Se só o Bling mandar uma, a segunda categoria dos itens da seção 7.3 é marcada à mão na LI.
- **URLs antigas**: as categorias atuais têm URL própria e já estão no Google. Ao criar as novas, conferir se o painel da LI oferece redirecionamento 301; se não, manter as antigas ocultas (sem link no menu) por alguns meses em vez de apagar.
- **Nome sem número e com acento** nos dois sistemas. A ordem do menu vai no campo de ordenação da LI.
- **Títulos fora do padrão** (seção 6) passam pelo padronizador do Rise antes de ir para a LI.

## 9. Fontes

- Catálogo: tabela `Produto` do Rise (1.315 linhas, 06/10/2026).
- Categoria atual: tabela `ProdutoColetado`, fonte "4hobby" (702 produtos, 672 batem com SKU do catálogo).
- Menus dos concorrentes lidos em 06/10/2026: eletrogate.com, usinainfo.com.br, casadarobotica.com, smartkits.com.br, curtocircuito.com.br, impactocnc.com, robocore.net, eletruscomp.com.br. Folhas dos 16 concorrentes coletados: tabela `ProdutoColetado`, campo `categoria`.
- Bling e Loja Integrada: Central de Ajuda do Bling, artigos da integração com a Loja Integrada (vínculo de categorias). Ponto a confirmar no painel.
- Classificação: script `classificar.cjs` (regras por palavra do título e por família de SKU; a sua numeração de SKU já agrupa por família) e revisão manual dos 1.315 itens, com 57 correções.
