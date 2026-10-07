# Árvore final de categorias da loja 4hobby (uma família por folha)

Data: 07/10/2026. Esta é a árvore **aprovada**: a de 06/10 (76 folhas) foi refeita depois do retorno do dono de que nome de folha não pode listar produtos diferentes, e as 17 fusões de folhas pequenas propostas em seguida foram aceitas por ele em 07/10/2026. O CSV `categorias-4hobby-mapeamento.csv` já reflete esta árvore.

## Regras que valem para nome novo

1. **Uma família de produto por folha.** O nome tem o substantivo do produto ("Sensores de Gás e Chama", "Fusos Trapezoidais"). "X e Y" só quando Y é acessório ou vizinho inseparável de X.
2. **O nome se sustenta sozinho** (vira URL e título da página na LI): "Sensores de Temperatura e Umidade", não "Temperatura".
3. Sem dois-pontos, sem parênteses, sem número de ordenação; sigla só quando é o que o cliente digita (CLP, IHM, LED, RFID, CNC, SSR, ESP32, GT2).
4. Nada vai para "Outros". Produto sem família própria fica na família mais próxima.

Resultado: **12 topos, 1 intermediária (Movimento Linear) e 133 folhas** para 1.301 produtos publicáveis (média de 10 por folha). Nove folhas ficam com 3 ou 4 produtos de propósito (marcadas ◂ pequena): são famílias que o cliente procura pelo nome.

## Árvore, com a quantidade de produtos de hoje

### Arduino, ESP32 e Embarcados (83)

- Placas Arduino Compatíveis (10)
- Placas ESP32 (11)
- Módulos ESP8266 (9)
- Raspberry Pi e Acessórios (22)
- Placas STM32 (6)
- Placas de Interface com Bornes (9)
- Shields e Cases para Arduino (7)
- Gravadores e Programadores (4) ◂ pequena
- Kits Arduino e Educacionais (5)

### Módulos (97)

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

### Sensores (97)

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

### CNC, Laser e Impressão 3D (359)

- Movimento Linear (intermediária)
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

### Componentes Eletrônicos (149)

- Resistores (18)
- Potenciômetros e Trimpots (10)
- Capacitores e Cristais (8)
- Diodos (10)
- Transistores e MOSFETs (16)
- Circuitos Integrados (32)
- Reguladores de Tensão (5)
- LEDs e Soquetes (20)
- Buzzers, Alto-falantes e Áudio (7)
- Fusíveis e Filtros (3) ◂ pequena
- Interruptores e Tomadas de Painel (5)
- Chaves e Push Buttons (15)

### Conectores e Cabos (155)

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

### Prototipagem e Ferramentas (57)

- Protoboards e Placas Fenolite (8)
- Ferramentas e Solda (7)
- Instrumentos de Medição (6)
- Espaçadores e Parafusos Nylon (6)
- Imãs de Neodímio (3) ◂ pequena
- Parafusos, Buchas e Fixação (13)
- Caixas Plásticas e Organizadores (14)

### Softwares e Serviços (8)

- Softwares (4) ◂ pequena
- Serviços (4) ◂ pequena

## Fusões aplicadas em 07/10/2026

Shields + Cases para Arduino; Optoacoplador + MOSFET e Dimmer (Módulos de Acionamento); Joysticks + Controle Remoto; Áudio foi para Buzzers e Alto-falantes; Distância + Infravermelho; Tensão + Corrente; Cor + Luz; Sinalizadores + Botoeiras 22mm; Relés SSR + Controladores de Temperatura; Hi-Link dentro de Fontes Chaveadas; Micro Servos + Brushless (Servos e Motores para Aeromodelismo); PWM + Ponte H; Válvulas + Eletroímãs; Roldanas + Polias; Brocas e Pinças + Fresas; Chaves Táteis + Gangorra (Chaves e Push Buttons); Solda + Ferramentas de Bancada.

## Próximo passo

Ajustes pontuais que o dono ditar (nome, produto trocando de folha) entram no CSV e aqui. Só então o script da Loja Integrada é escrito (criar as categorias pela API, reatribuir os 681 produtos que casam por SKU).
