# Árvore final de categorias da loja 4hobby (uma família por folha)

Data: 14/10/2026. Esta é a árvore **aprovada**. Histórico: a de 06/10 (76 folhas) foi refeita porque nome de folha não pode listar produtos diferentes; em 07/10 o dono aceitou as 17 fusões de folhas pequenas (133 folhas, 12 topos); em 14/10 ele enxugou os topos (12 → 10), tirou o nível intermediário "Movimento Linear", criou o topo Kits Educacionais reduziu Placas Embarcadas a quatro folhas, uma por família de placa, com shields, interfaces e gravadores dentro da placa a que servem, enxugou os módulos de Módulos e Sensores a seis folhas (os sensores ficaram como estavam) refez Displays e Telas por tipo de tela, sem folha própria para a Nextion, e criou o topo Cabos e Conectores (cabos e conectores de painel), deixando em Componentes Eletrônicos só os conectores de PCB e as barras de pinos; por fim refez Automação Industrial em 8 folhas (a Peltier foi para Módulos e Sensores e os sensores indutivos e capacitivos industriais vieram para Automação). Por último, Fontes e Baterias deixou de ser topo: as 7 folhas foram para Componentes Eletrônicos. Depois ainda: Motores e Robótica virou Motores, com 5 folhas (eletroímãs para Módulos e Sensores, chassis para Kits Educacionais), e o inversor de frequência foi para Automação Industrial. O CSV `categorias-4hobby-mapeamento.csv` já reflete esta árvore.

## Regras que valem para nome novo

1. **Uma família de produto por folha.** O nome tem o substantivo do produto ("Sensores de Gás e Chama", "Fusos Trapezoidais"). "X e Y" só quando Y é acessório ou vizinho inseparável de X.
2. **O nome se sustenta sozinho** (vira URL e título da página na LI): "Sensores de Temperatura e Umidade", não "Temperatura".
3. Sem dois-pontos, sem parênteses, sem número de ordenação; sigla só quando é o que o cliente digita (CLP, IHM, LED, RFID, CNC, SSR, ESP32, GT2).
4. Nada vai para "Outros". Produto sem família própria fica na família mais próxima.
5. **Dois níveis só** (topo > folha). Não existe nível intermediário.

Resultado: **10 topos e 114 folhas** para 1.301 produtos publicáveis (113 folhas com produto próprio e uma, Shields e Placas de Interface, só com produtos de 2ª categoria; média de 11 por folha). Folhas com 2 a 4 produtos ficam de propósito (marcadas ◂ pequena): são famílias que o cliente procura pelo nome ou que vão crescer (kits).

Com dois níveis e uma família por folha, CNC (28 folhas) e Componentes Eletrônicos (23) ficam com menu longo. É o custo das duas escolhas do dono (topo enxuto + folha de uma família); os temas da Loja Integrada mostram essas listas em colunas.

## Árvore, com a quantidade de produtos de hoje

### Placas Embarcadas (88)

- Placas Arduino (27)
- Placas Espressif ESP32 e ESP8266 (22)
- Placas STM32 (10)
- Placas Raspberry Pi (29)

Uma folha por família de placa (decisão do dono em 14/10/2026). Shields, cases, placas de interface com bornes e gravadores ficam dentro da placa a que servem: protoshield, shield multifunções, shield expansor Nano, os dois ethernet shields, o data logger shield, o joystick shield, as interfaces com bornes para Uno/Mega/Nano, os cases e o gravador AVR ISP em Placas Arduino; o Arduino Mega WiFi e os adaptadores de ESP-01/ESP-07/ESP-12 em Placas Espressif, junto das interfaces para ESP32 e Heltec; as interfaces Bluepill/F446RE, o ST-Link e o J-Link em Placas STM32. Os acessórios de Raspberry (cases, câmeras, dissipadores, HATs de CAN e PoE, gateway LoRa, controles USB) e, por decisão do dono, os cartões micro SD e o leitor USB ficam em Placas Raspberry Pi.

### Módulos e Sensores (181)

- Módulos Relé e Acionamento (15)
- Conversores de Sinais (29)
- Módulos Wireless e IoT (24)
- Antenas e Acessórios (5)
- Módulos RTC e Memória (5)
- Pastilhas Peltier (3) ◂ pequena
- Eletroímãs e Válvulas Solenoide (8)
- Shields e Placas de Interface (20 como 2ª categoria, nenhum próprio)
- Sensores de Temperatura e Umidade (14)
- Sensores de Distância e Proximidade (9)
- Sensores de Movimento e Vibração (5)
- Chaves Fim de Curso (7)
- Sensores Magnéticos Reed e Hall (5)
- Sensores de Corrente e Tensão (9)
- Sensores de Gás e Chama (9)
- Sensores de Luz e Cor (7)
- Sensores de Fluxo de Água (5)
- Sensores de Nível de Água (5)
- Sensores de Umidade do Solo e Chuva (5)
- Células de Carga (7)
- Transdutores Piezoelétricos (5)

Módulos em seis folhas (decisão do dono em 14/10/2026: relé, conversores de sinais, wireless e IoT, antenas e acessórios e shields; os grupos de sensores ficaram como estavam, menos Sensores Indutivos e Capacitivos, que foi para Automação Industrial como Sensores Industriais). Pastilhas Peltier veio de Automação Industrial e Eletroímãs e Válvulas Solenoide veio de Motores, por decisão dele. Módulos Relé e Acionamento junta relés, optoacopladores, MOSFET e dimmers; Conversores de Sinais junta RS485/RS232, CAN, 4-20mA/0-10V, nível lógico, ADC/DAC e o conversor RS485-Ethernet; Módulos Wireless e IoT junta WiFi, Bluetooth, RF 433MHz/nRF24, GPS/GSM, Sonoff, os módulos Ethernet, RFID/NFC com tags e cartões, o leitor biométrico e o infravermelho. **Módulos RTC e Memória** (RTC DS1307/DS3231, EEPROM e o módulo leitor micro SD) ficou porque não cabe em nenhuma das cinco: é a única folha de módulo fora da lista dele. Saíram para outros topos: teclados matriciais → Chaves e Push Buttons; joystick → Potenciômetros e Trimpots; encoders KY-040/HW-040 → Encoders Incrementais; sensor de toque TTP223 → Sensores de Distância e Proximidade; cartões micro SD e leitor USB → Placas Raspberry Pi.

### Displays e Telas (36)

- Telas TFT (24)
- Displays LCD 16x2 e 20x4 (5)
- Displays OLED (2) ◂ pequena
- Displays 7 Segmentos e Matriz LED (5)

Folhas por tipo de tela (decisão do dono em 14/10/2026: a Nextion não fica separada). Telas TFT junta as 15 Nextion (Basic, Enhanced, Intelligent) com as expansões e o conector delas, as 3 telas de 7" para Raspberry Pi com o case da oficial (todas com Placas Raspberry Pi como 2ª categoria), a 3,5" touch ILI9488 e a 1,8" ST7735: são todas LCD TFT, a diferença é só a interface (serial, HDMI/DSI, SPI). Displays LCD 16x2 e 20x4 são os alfanuméricos de caracteres, com o módulo I2C e o LCD shield; o nome traz os tamanhos para não confundir com as telas TFT, que os títulos também chamam de "LCD".

### Componentes Eletrônicos (287)

- Resistores (18)
- Potenciômetros e Trimpots (11)
- Capacitores e Cristais (8)
- Diodos (10)
- Transistores e MOSFETs (16)
- Circuitos Integrados (33)
- Reguladores de Tensão (5)
- LEDs e Soquetes (20)
- Buzzers, Alto-falantes e Áudio (7)
- Fusíveis e Filtros (3) ◂ pequena
- Interruptores e Tomadas de Painel (5)
- Chaves e Push Buttons (19)
- Conectores para PCB (31)
- Barras de Pinos (15)
- Espaçadores e Isoladores (6)
- Pilhas e Baterias (6)
- Suportes de Pilha e Bateria (17)
- Níquel e Terminais para Bateria (5)
- Placas BMS e Testadores de Bateria (7)
- Carregadores de Bateria e Painel Solar (6)
- Fontes Chaveadas (22)
- Conversores DC-DC Step Up e Step Down (11)
- Voltímetros e Testadores (6)

Fontes e Baterias deixou de ser topo a pedido do dono em 14/10/2026 ("fontes deve se juntar a outra categoria, veja qual faz mais sentido"): as 7 folhas vieram inteiras para cá. Motivo: Pilhas e Baterias já estava aqui e o resto é a família dela (suportes, níquel, BMS, carregadores); fontes chaveadas, conversores DC-DC e voltímetros são alimentação, que nas lojas do ramo mora em Eletrônica. Em Automação Industrial só as fontes Andeli de 12/24/48V fariam sentido, e em Módulos e Sensores só os conversores DC-DC; partir a família não valia. Espaçadores e Isoladores (espaçadores de PCB, nylon isolante e parafusos nylon) veio de Ferramentas e Prototipagem, também a pedido dele. Conectores para PCB (decisão do dono em 14/10/2026) junta o que se solda na placa ou liga fio à placa: JST XH e PH com terminais, Dupont com terminais e os bornes KRE/KF e BR7. Barras de Pinos fica como folha própria, a pedido dele. Os conectores de painel e de cabo (Mike, P4/P10, XLR/XT60/banana, DB/RJ45/HDMI, terminais) e os cabos foram para o topo Cabos e Conectores. Plugs P4 e P10 tem 2 itens de PCB (P4 fêmea para PCB e P10 fêmea painel/PCB) no meio de 8 de cabo e painel: a família ficou inteira em Cabos e Conectores para não se partir.

### Cabos e Conectores (91)

- Fios e Cabos Elétricos (15)
- Cabos USB e HDMI (14)
- Cabos de Extensão para Painel (11)
- Conectores Mike GX12 e GX16 (9)
- Plugs P4 e P10 (10)
- Conectores XLR, XT60 e Banana (6)
- Adaptadores DB9, RJ45 e HDMI (14)
- Terminais e Emendas (6)
- Abraçadeiras e Organizadores de Cabos (6)

Topo criado pelo dono em 14/10/2026 para cabos, conectores de painel e adaptadores (o que não se solda na PCB). Jumpers, garras jacaré e termo retrátil foram para Ferramentas e Prototipagem, por decisão dele.

### Automação Industrial (96)

- CLP e Expansões (8)
- IHM (9)
- Chaves e Botoeiras (21)
- Sinalizadores (4) ◂ pequena
- Controladores Industriais (8)
- Encoders (5)
- Elétrica e Acessórios (34)
- Sensores Industriais (6)
- Inversores de Frequência (1) ◂ pequena

Nove folhas ditadas pelo dono em 14/10/2026. Inversores de Frequência recebe o inversor avulso de 2,2 kW ("inversores vai para Automação"); os kits de spindle com inversor continuam em CNC > Spindles, porque são vendidos como conjunto. Chaves e Botoeiras junta as botoeiras 22mm (pulso, emergência, seletora, seccionadora, contatos, tampões e plaquetas) com os botões metálicos iluminados e antivandalismo; Sinalizadores são os luminosos LED 22mm para painel; Controladores Industriais é o antigo "Controladores de Temperatura e SSR" (REX-C100, termostatos, relés SSR e o relé com soquete); Elétrica e Acessórios junta bornes para trilho DIN, trilho, canaletas e suportes, quadros elétricos, prensa cabos e microventiladores; Sensores Industriais recebe os indutivos e capacitivos M12/M18 PNP/NPN que estavam em Módulos e Sensores. Pastilhas Peltier foi para Módulos e Sensores.

### Motores (76)

- Motores de Passo (12)
- Easy Servo e Servo AC (6)
- Motores DC (28)
- Drivers e Controladores (22)
- Servos e Motores para Aeromodelismo (8)

Topo renomeado pelo dono em 14/10/2026 (sem "Robótica"). Motores DC junta os motores DC com caixa de redução e as mini bombas de água e ar (pedido dele); Drivers e Controladores junta os drivers de motor de passo (A4988, TMC, DM556, DM860H) com as pontes H e os controladores PWM de motor DC. Servos e Motores para Aeromodelismo não foi citada por ele e ficou como estava (micro servos, brushless, ESC, Pixhawk, PCA9685). Eletroímãs e Válvulas Solenoide foi para Módulos e Sensores e Chassis e Rodas para Robótica para Kits Educacionais, por decisão dele.

### CNC, Laser e Impressão 3D (366)

- Fusos de Esferas (7)
- Fusos Trapezoidais (10)
- Castanhas e Antifolga TR8 (12)
- Eixos Lineares (8)
- Guias Lineares MGN (6)
- Rolamentos e Pillow Block (20)
- Mancais KP e KFL (7)
- Suportes de Eixo SK e SHF (9)
- Acoplamentos (21)
- Correias GT2 e HTD (19)
- Polias GT2 e Roldanas V-Slot (35)
- Cremalheiras e Engrenagens (12)
- Perfis de Alumínio V-Slot (8)
- Suportes de Motor de Passo (6)
- Porcas Martelo e Excêntricas (14)
- Cantoneiras para Perfil (8)
- Espaçadores e Acabamentos V-Slot (12)
- Esteiras Porta Cabos (22)
- Placas Controladoras CNC (13)
- Spindles (11)
- Fresas, Brocas e Pinças (24)
- Módulos Laser de Diodo (8)
- Peças para Laser CO2 (17)
- Hotend, Bicos e Extrusoras (21)
- Mesas Aquecidas (9)
- Acessórios para Impressora 3D (11)
- Máquinas e Equipamentos (8)
- Softwares e Serviços (8)

### Ferramentas e Prototipagem (69)

- Protoboards e Placas Fenolite (8)
- Jumpers e Garras Jacaré (7)
- Termo Retrátil (11)
- Ferramentas e Solda (7)
- Instrumentos de Medição (6)
- Imãs de Neodímio (3) ◂ pequena
- Parafusos, Buchas e Fixação (13)
- Caixas Plásticas e Organizadores (14)

### Kits Educacionais (11)

- Kits Arduino (3) ◂ pequena
- Kits de Eletrônica e Robótica (2) ◂ pequena
- Chassis e Rodas para Robótica (6)

Topo criado a pedido do dono para receber os kits que serão montados no Rise (produto com composição). Hoje tem os 3 kits Arduino (iniciante, avançado, 37 sensores), o kit Micro:bit V2 e o kit didático de eletrônica e robótica.

## Segunda categoria

Produto na Loja Integrada pode estar em mais de uma categoria. A coluna `categoria_secundaria` do CSV marca:

- 4 bombas de água de laser/spindle (120212, 122402, 122403, 122408): ficam em Motores > Motores DC (as mini bombas entraram lá) e aparecem também em Peças para Laser CO2 / Spindles.
- 6 cabos HDMI, micro HDMI, DP e hub OTG (930213, 930607_z, 930701, 930702_4h, 930703_4h, 930704_z): ficam em Cabos USB e HDMI e aparecem também em Placas Raspberry Pi.
- 3 telas de 7" para Raspberry Pi e o case da oficial (110304, 110306, 110307, 111031): ficam em Telas TFT e aparecem também em Placas Raspberry Pi.
- 20 shields, HATs, placas de interface com bornes e o gravador AVR ISP (100112, 100201, 100204, 100207, 100211, 100224, 100233, 100272, 101001, 101002, 101010, 170107, 170707, 200509, 200510, 260104, 260108, 910103, 970104, 970106): ficam na placa correspondente e aparecem também em **Módulos e Sensores > Shields e Placas de Interface**, folha que existe só para isso (pedido do dono em 14/10/2026: "todos os módulos e shields de Arduino também devem ser mostrados na categoria Módulos"). O script da LI precisa criar essa folha mesmo sem produto próprio.
- Arduino Mega WiFi com ESP8266 (100108): fica em Placas Arduino e aparece também em Placas Espressif ESP32 e ESP8266.
- Serviço de programação para CLP e IHM (999905): fica em Softwares e Serviços e aparece também em CLP e Expansões.

## Mudanças de 14/10/2026 (ditadas pelo dono)

- "Arduino, ESP32 e Embarcados" passou a **Placas Embarcadas**; os kits saíram dela. Depois, na mesma data, ela passou de 8 para **4 folhas, uma por família de placa** (Placas Arduino, Placas Espressif ESP32 e ESP8266, Placas STM32, Placas Raspberry Pi): Shields e Cases, Placas de Interface com Bornes e Gravadores e Programadores deixaram de ser folhas, cada produto foi para a placa a que serve, e os shields e interfaces ganharam a 2ª categoria em Módulos e Sensores. Único sem placa própria: o gravador PICkit3 (270201, para PIC, que não tem placa no catálogo) foi para Componentes Eletrônicos > Circuitos Integrados, junto do ATmega328P.
- **Módulos e Sensores**: os 14 grupos de módulos viraram os 5 ditados por ele (Módulos Relé e Acionamento, Conversores de Sinais, Módulos Wireless e IoT, Antenas e Acessórios, Shields e Placas de Interface) mais Módulos RTC e Memória, que mantive por falta de lugar. Os 14 grupos de sensores não mudaram. Cartões micro SD e leitor USB foram para Placas Raspberry Pi (pedido dele); teclados matriciais para Chaves e Push Buttons, joystick para Potenciômetros e Trimpots, encoders KY-040/HW-040 para Encoders Incrementais e o TTP223 para Sensores Indutivos e Capacitivos; ethernet shields, data logger shield e joystick shield foram para Placas Arduino, e os HATs CAN e o gateway LoRa para Placas Raspberry Pi, todos com a 2ª categoria de shields.
- **Displays e Telas** passou de 5 para 4 folhas, por tipo de tela: Telas TFT (Nextion, telas de Raspberry, SPI), Displays LCD 16x2 e 20x4, Displays OLED e Displays 7 Segmentos e Matriz LED. Telas Nextion e Telas para Raspberry Pi deixaram de ser folhas.
- **Módulos** e **Sensores** viraram um topo, **Módulos e Sensores**.
- **Conectores e Cabos** entrou em **Componentes Eletrônicos**; depois, na mesma data, ele separou de novo: os conectores de PCB (JST, Dupont, KRE/KF) viraram a folha **Conectores para PCB** e **Barras de Pinos** ficou, os dois em Componentes; cabos, conectores de painel (Mike, P4/P10, XLR/XT60/banana, DB/RJ45/HDMI), terminais e abraçadeiras foram para o topo novo **Cabos e Conectores**; jumpers, garras jacaré e termo retrátil foram para **Ferramentas e Prototipagem**.
- **Automação Industrial** passou de 11 para 8 folhas ditadas por ele: CLP e Expansões, IHM, Chaves e Botoeiras (botoeiras 22mm + botões metálicos), Sinalizadores (folha nova), Controladores Industriais, Encoders, Elétrica e Acessórios (bornes, trilho DIN, quadros, ventiladores) e Sensores Industriais (os indutivos e capacitivos que estavam em Módulos e Sensores). Pastilhas Peltier foi para Módulos e Sensores; o sensor de toque TTP223, que não é industrial, ficou em Sensores de Distância e Proximidade.
- **Componentes Eletrônicos** recebeu também **Espaçadores e Isoladores** (de Ferramentas e Prototipagem, era "Espaçadores e Parafusos Nylon") e **Pilhas e Baterias** (de Fontes e Baterias), pedidos dele.
- **Fontes e Baterias deixou de ser topo** ("fontes deve se juntar a outra categoria, veja qual faz mais sentido"): as 7 folhas foram inteiras para Componentes Eletrônicos, ao lado de Pilhas e Baterias. A loja fica com 10 topos.
- **Motores e Robótica virou Motores**, com 5 folhas ditadas por ele: Motores de Passo, Easy Servo e Servo AC, Motores DC (com as mini bombas de água e ar), Drivers e Controladores (drivers de passo + ponte H e PWM) e Servos e Motores para Aeromodelismo (não citada; mantida). Eletroímãs e Válvulas Solenoide foi para Módulos e Sensores e Chassis e Rodas para Robótica para Kits Educacionais.
- **Inversores** foram para Automação Industrial: o inversor avulso virou a folha Inversores de Frequência (1 produto); os kits de spindle com inversor ficaram em CNC, na folha que passou a se chamar Spindles.
- **Movimento Linear** deixou de existir como nível: as 12 folhas ficam direto em CNC.
- **Softwares e Serviços** virou uma folha única dentro de CNC (6 dos 8 itens são LightBurn/Mach3 e seus serviços de configuração).
- Novo topo **Kits Educacionais**, com duas folhas.
- "Prototipagem e Ferramentas" passou a **Ferramentas e Prototipagem** (ferramentas é a palavra que o cliente procura).
- Displays e Telas, Motores e Robótica e Ferramentas e Prototipagem continuam como topo por decisão do dono (recomendação minha era fundir Displays em Módulos e Sensores e juntar Robótica com Kits; ele preferiu manter). Fontes e Baterias também ficou nessa rodada, até ele mandar dissolver no fim do dia (abaixo).

## Fusões aplicadas em 07/10/2026

Shields + Cases para Arduino; Optoacoplador + MOSFET e Dimmer (Módulos de Acionamento); Joysticks + Controle Remoto; Áudio foi para Buzzers e Alto-falantes; Distância + Infravermelho; Tensão + Corrente; Cor + Luz; Sinalizadores + Botoeiras 22mm; Relés SSR + Controladores de Temperatura; Hi-Link dentro de Fontes Chaveadas; Micro Servos + Brushless (Servos e Motores para Aeromodelismo); PWM + Ponte H; Válvulas + Eletroímãs; Roldanas + Polias; Brocas e Pinças + Fresas; Chaves Táteis + Gangorra (Chaves e Push Buttons); Solda + Ferramentas de Bancada.

## Próximo passo

Ajustes pontuais que o dono ditar (nome, produto trocando de folha) entram no CSV e aqui. Só então o script da Loja Integrada é escrito (criar as categorias pela API, reatribuir os 681 produtos que casam por SKU).
