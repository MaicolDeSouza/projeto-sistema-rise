# Árvore final de categorias da loja 4hobby (uma família por folha)

Data: 14/10/2026. Esta é a árvore **aprovada**. Histórico: a de 06/10 (76 folhas) foi refeita porque nome de folha não pode listar produtos diferentes; em 07/10 o dono aceitou as 17 fusões de folhas pequenas (133 folhas, 12 topos); em 14/10 ele enxugou os topos (12 → 10), tirou o nível intermediário "Movimento Linear", criou o topo Kits Educacionais e reduziu Placas Embarcadas a quatro folhas, uma por família de placa, com shields, interfaces e gravadores dentro da placa a que servem. O CSV `categorias-4hobby-mapeamento.csv` já reflete esta árvore.

## Regras que valem para nome novo

1. **Uma família de produto por folha.** O nome tem o substantivo do produto ("Sensores de Gás e Chama", "Fusos Trapezoidais"). "X e Y" só quando Y é acessório ou vizinho inseparável de X.
2. **O nome se sustenta sozinho** (vira URL e título da página na LI): "Sensores de Temperatura e Umidade", não "Temperatura".
3. Sem dois-pontos, sem parênteses, sem número de ordenação; sigla só quando é o que o cliente digita (CLP, IHM, LED, RFID, CNC, SSR, ESP32, GT2).
4. Nada vai para "Outros". Produto sem família própria fica na família mais próxima.
5. **Dois níveis só** (topo > folha). Não existe nível intermediário.

Resultado: **10 topos e 130 folhas** para 1.301 produtos publicáveis (129 folhas com produto próprio e uma, Shields e Placas de Interface, só com produtos de 2ª categoria; média de 10 por folha). Folhas com 2 a 4 produtos ficam de propósito (marcadas ◂ pequena): são famílias que o cliente procura pelo nome ou que vão crescer (kits).

Com dois níveis e uma família por folha, três topos ficam com menu longo: Módulos e Sensores (29 folhas), CNC (28) e Componentes Eletrônicos (27). É o custo das duas escolhas do dono (topo enxuto + folha de uma família); os temas da Loja Integrada mostram essas listas em colunas.

## Árvore, com a quantidade de produtos de hoje

### Placas Embarcadas (77)

- Placas Arduino (23)
- Placas Espressif ESP32 e ESP8266 (22)
- Placas STM32 (10)
- Placas Raspberry Pi (22)

Uma folha por família de placa (decisão do dono em 14/10/2026). Shields, cases, placas de interface com bornes e gravadores ficam dentro da placa a que servem: protoshield, shield multifunções, shield expansor Nano, as interfaces com bornes para Uno/Mega/Nano, os cases e o gravador AVR ISP em Placas Arduino; o Arduino Mega WiFi e os adaptadores de ESP-01/ESP-07/ESP-12 em Placas Espressif, junto das interfaces para ESP32 e Heltec; as interfaces Bluepill/F446RE, o ST-Link e o J-Link em Placas STM32. Os acessórios de Raspberry (cases, câmeras, dissipadores, HATs, controles USB) continuam em Placas Raspberry Pi.

### Módulos e Sensores (194)

- Módulos Relé (9)
- Módulos de Acionamento (6)
- Conversores Seriais RS485 e RS232 (10)
- Módulos CAN Bus (5)
- Módulos Ethernet (5)
- Conversores 4-20mA e 0-10V (6)
- Conversores de Nível Lógico, ADC e DAC (9)
- Módulos Wireless e IoT (14)
- Antenas e Pigtails (5)
- Módulos RFID e Biometria (6)
- Cartões e Leitores Micro SD (5)
- Módulos RTC e Memória (5)
- Teclados Matriciais e Botões Touch (5)
- Joysticks e Controles Remotos (7)
- Shields e Placas de Interface (13 como 2ª categoria, nenhum próprio)
- Sensores de Temperatura e Umidade (14)
- Sensores de Distância e Proximidade (8)
- Sensores de Movimento e Vibração (5)
- Sensores Indutivos e Capacitivos (6)
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

### Displays e Telas (36)

- Telas Nextion (18)
- Displays LCD (5)
- Displays OLED e TFT (4) ◂ pequena
- Telas para Raspberry Pi (4) ◂ pequena
- Displays 7 Segmentos e Matriz LED (5)

### Componentes Eletrônicos (305)

- Resistores (18)
- Potenciômetros e Trimpots (10)
- Capacitores e Cristais (8)
- Diodos (10)
- Transistores e MOSFETs (16)
- Circuitos Integrados (33)
- Reguladores de Tensão (5)
- LEDs e Soquetes (20)
- Buzzers, Alto-falantes e Áudio (7)
- Fusíveis e Filtros (3) ◂ pequena
- Interruptores e Tomadas de Painel (5)
- Chaves e Push Buttons (15)
- Conectores JST (18)
- Conectores Dupont (7)
- Barras de Pinos (15)
- Conectores Mike GX12 e GX16 (9)
- Plugs P4 e P10 (10)
- Conectores XLR, XT60 e Banana (6)
- Bornes KRE e KF (6)
- Terminais e Emendas (6)
- Adaptadores DB9, RJ45 e HDMI (14)
- Cabos de Extensão para Painel (11)
- Cabos USB e HDMI (14)
- Jumpers e Garras Jacaré (7)
- Fios e Cabos Elétricos (15)
- Termo Retrátil (11)
- Abraçadeiras e Organizadores de Cabos (6)

### Automação Industrial (90)

- CLP e Expansões (8)
- IHM (9)
- Botoeiras e Sinalizadores 22mm (14)
- Botões Metálicos Iluminados (11)
- Controladores de Temperatura e SSR (8)
- Encoders Incrementais (3) ◂ pequena
- Bornes para Trilho DIN (9)
- Trilho DIN, Canaletas e Suportes (10)
- Quadros Elétricos e Prensa Cabos (8)
- Microventiladores (7)
- Pastilhas Peltier (3) ◂ pequena

### Fontes e Baterias (80)

- Fontes Chaveadas (22)
- Conversores DC-DC Step Up e Step Down (11)
- Baterias e Pilhas (6)
- Placas BMS e Testadores de Bateria (7)
- Carregadores de Bateria e Painel Solar (6)
- Suportes de Pilha e Bateria (17)
- Níquel e Terminais para Bateria (5)
- Voltímetros e Testadores (6)

### Motores e Robótica (90)

- Motores de Passo (12)
- Easy Servo e Servo AC (6)
- Drivers de Motor de Passo (14)
- Motores DC e Caixas de Redução (19)
- Servos e Motores para Aeromodelismo (8)
- Ponte H e Controladores de Motor DC (8)
- Mini Bombas de Água e Ar (9)
- Eletroímãs e Válvulas Solenoide (8)
- Chassis e Rodas para Robótica (6)

### CNC, Laser e Impressão 3D (367)

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
- Spindles e Inversores (12)
- Fresas, Brocas e Pinças (24)
- Módulos Laser de Diodo (8)
- Peças para Laser CO2 (17)
- Hotend, Bicos e Extrusoras (21)
- Mesas Aquecidas (9)
- Acessórios para Impressora 3D (11)
- Máquinas e Equipamentos (8)
- Softwares e Serviços (8)

### Ferramentas e Prototipagem (57)

- Protoboards e Placas Fenolite (8)
- Ferramentas e Solda (7)
- Instrumentos de Medição (6)
- Espaçadores e Parafusos Nylon (6)
- Imãs de Neodímio (3) ◂ pequena
- Parafusos, Buchas e Fixação (13)
- Caixas Plásticas e Organizadores (14)

### Kits Educacionais (5)

- Kits Arduino (3) ◂ pequena
- Kits de Eletrônica e Robótica (2) ◂ pequena

Topo criado a pedido do dono para receber os kits que serão montados no Rise (produto com composição). Hoje tem os 3 kits Arduino (iniciante, avançado, 37 sensores), o kit Micro:bit V2 e o kit didático de eletrônica e robótica.

## Segunda categoria

Produto na Loja Integrada pode estar em mais de uma categoria. A coluna `categoria_secundaria` do CSV marca:

- 4 bombas de água de laser/spindle (120212, 122402, 122403, 122408): ficam em Mini Bombas de Água e Ar e aparecem também em Peças para Laser CO2 / Spindles e Inversores.
- 6 cabos HDMI, micro HDMI, DP e hub OTG (930213, 930607_z, 930701, 930702_4h, 930703_4h, 930704_z): ficam em Cabos USB e HDMI e aparecem também em Placas Raspberry Pi.
- 13 shields, placas de interface com bornes e o gravador AVR ISP (100112, 100204, 100224, 100233, 100272, 101001, 101002, 101010, 170107, 260104, 260108, 970104, 970106): ficam na placa correspondente e aparecem também em **Módulos e Sensores > Shields e Placas de Interface**, folha que existe só para isso (pedido do dono em 14/10/2026: "todos os módulos e shields de Arduino também devem ser mostrados na categoria Módulos"). O script da LI precisa criar essa folha mesmo sem produto próprio.
- Arduino Mega WiFi com ESP8266 (100108): fica em Placas Arduino e aparece também em Placas Espressif ESP32 e ESP8266.
- Serviço de programação para CLP e IHM (999905): fica em Softwares e Serviços e aparece também em CLP e Expansões.

## Mudanças de 14/10/2026 (ditadas pelo dono)

- "Arduino, ESP32 e Embarcados" passou a **Placas Embarcadas**; os kits saíram dela. Depois, na mesma data, ela passou de 8 para **4 folhas, uma por família de placa** (Placas Arduino, Placas Espressif ESP32 e ESP8266, Placas STM32, Placas Raspberry Pi): Shields e Cases, Placas de Interface com Bornes e Gravadores e Programadores deixaram de ser folhas, cada produto foi para a placa a que serve, e os shields e interfaces ganharam a 2ª categoria em Módulos e Sensores. Único sem placa própria: o gravador PICkit3 (270201, para PIC, que não tem placa no catálogo) foi para Componentes Eletrônicos > Circuitos Integrados, junto do ATmega328P.
- **Módulos** e **Sensores** viraram um topo, **Módulos e Sensores**.
- **Conectores e Cabos** entrou em **Componentes Eletrônicos** (as 15 folhas continuam iguais). Cabos USB e HDMI fica aí, no bloco de cabos.
- **Movimento Linear** deixou de existir como nível: as 12 folhas ficam direto em CNC.
- **Softwares e Serviços** virou uma folha única dentro de CNC (6 dos 8 itens são LightBurn/Mach3 e seus serviços de configuração).
- Novo topo **Kits Educacionais**, com duas folhas.
- "Prototipagem e Ferramentas" passou a **Ferramentas e Prototipagem** (ferramentas é a palavra que o cliente procura).
- Displays e Telas, Fontes e Baterias, Motores e Robótica e Ferramentas e Prototipagem continuam como topo por decisão do dono (recomendação minha era fundir Displays em Módulos e Sensores e juntar Robótica com Kits; ele preferiu manter).

## Fusões aplicadas em 07/10/2026

Shields + Cases para Arduino; Optoacoplador + MOSFET e Dimmer (Módulos de Acionamento); Joysticks + Controle Remoto; Áudio foi para Buzzers e Alto-falantes; Distância + Infravermelho; Tensão + Corrente; Cor + Luz; Sinalizadores + Botoeiras 22mm; Relés SSR + Controladores de Temperatura; Hi-Link dentro de Fontes Chaveadas; Micro Servos + Brushless (Servos e Motores para Aeromodelismo); PWM + Ponte H; Válvulas + Eletroímãs; Roldanas + Polias; Brocas e Pinças + Fresas; Chaves Táteis + Gangorra (Chaves e Push Buttons); Solda + Ferramentas de Bancada.

## Próximo passo

Ajustes pontuais que o dono ditar (nome, produto trocando de folha) entram no CSV e aqui. Só então o script da Loja Integrada é escrito (criar as categorias pela API, reatribuir os 681 produtos que casam por SKU).
