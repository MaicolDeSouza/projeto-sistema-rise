# Revisão dos nomes das categorias (rascunho para discussão)

Data: 06/10/2026. Complemento de `categorias-4hobby-proposta.md`. A árvore (12 topos, 76 folhas) está aprovada; aqui discutimos só **os nomes**. Nada disto está no CSV ainda: o CSV muda quando os nomes forem fechados.

## Padrão proposto para os nomes

1. **O nome se sustenta sozinho.** Na Loja Integrada o nome vira a URL e o título da página da categoria, e o Google indexa a página sem o menu em volta. "Temperatura e Umidade" vira `/temperatura-e-umidade`; "Sensores de Temperatura" vira `/sensores-de-temperatura`, que é o que o cliente digita. É o padrão da Usinainfo.
2. **Duas a quatro palavras, no máximo um "e".** Lista de cinco coisas ("Gás, Chama, Som, Luz e Cor") é sinal de gaveta mal fechada.
3. **Sem dois-pontos, sem parênteses, sem número de ordenação.** A ordem do menu vai no campo próprio da LI.
4. **Sigla só quando é o que o cliente digita**: CLP, IHM, LED, RFID, CNC, DC-DC, SSR, GT2, ESP32, STM32.
5. **Plural para família de produto** ("Fontes Chaveadas"), singular para nome de tecnologia ("Arduino", "Nextion").
6. **Mesmo padrão entre irmãs.** Se uma filha de Sensores começa com "Sensores de", todas começam.

A regra 1 é a que mais muda nomes (cerca de 30 dos 89). A alternativa é manter nomes curtos que dependem do pai ("Temperatura e Umidade"), que ficam mais limpos no menu e piores na URL e no Google.

## Categorias de topo

| Hoje na proposta | Sugestão | Por quê |
| --- | --- | --- |
| Placas e Embarcados | **Arduino, ESP32 e Embarcados** | "Arduino" e "ESP32" são as palavras que o cliente digita; 5 de 8 concorrentes têm Arduino no topo. "Embarcados" segura Raspberry, STM32 e kits. |
| Módulos | Módulos | mantém |
| Sensores | Sensores | mantém |
| Displays e Telas | Displays e Telas | mantém |
| Automação Industrial | Automação Industrial | mantém |
| Energia e Alimentação | **Fontes e Baterias** | "Energia e Alimentação" é abstrato; as duas famílias que o cliente procura são fonte e bateria (41 dos 80 itens). |
| Motores, Drivers e Robótica | **Motores e Robótica** | mais curto; drivers já estão nas folhas. |
| CNC, Laser e Impressão 3D | CNC, Laser e Impressão 3D | mantém |
| Componentes Eletrônicos | Componentes Eletrônicos | mantém |
| Conectores e Cabos | Conectores e Cabos | mantém |
| Prototipagem e Ferramentas | Prototipagem e Ferramentas | mantém |
| Softwares e Serviços | Softwares e Serviços | mantém |

## Folhas, por categoria de topo

Coluna "Sugestão" em negrito quando muda. Entre parênteses, a quantidade de produtos de hoje.

### Arduino, ESP32 e Embarcados (83)

| Hoje | Sugestão | Por quê |
| --- | --- | --- |
| Arduino e Compatíveis (9) | **Placas Arduino Compatíveis** | é o termo de busca e deixa claro que não é a placa oficial |
| ESP32 e ESP8266 (20) | **Placas ESP32 e ESP8266** | o substantivo entra (regra 1) |
| Raspberry Pi e Acessórios (21) | Raspberry Pi e Acessórios | mantém |
| STM32 e Outras Placas (8) | STM32 e Outras Placas | mantém |
| Shields e Placas de Interface (16) | **Shields e Interfaces** | mais curto, mesma leitura |
| Gravadores e Programadores (4) | Gravadores e Programadores | mantém |
| Kits Arduino e Educacionais (5) | Kits Arduino e Educacionais | mantém |

### Módulos (98)

| Hoje | Sugestão | Por quê |
| --- | --- | --- |
| Relés, MOSFET e Potência (15) | **Módulos Relé e Acionamento** | "módulo relé" é o termo de busca; "acionamento" cobre MOSFET, dimmer e temporizador (é o nome da Usinainfo) |
| Comunicação Serial, CAN e Ethernet (20) | **Comunicação RS485, CAN e Ethernet** | RS485 é a palavra buscada; "serial" fica implícita |
| Conversores de Sinal e Nível Lógico (15) | Conversores de Sinal e Nível Lógico | mantém |
| Wireless, IoT e Antenas (19) | **Wireless e IoT** | antenas são acessório do wireless; nome mais curto |
| RFID e Biometria (6) | RFID e Biometria | mantém |
| RTC, Memória e Cartões SD (10) | **RTC, Memória e Cartão SD** | singular no acessório |
| Áudio, Teclados e Controles (13) | Áudio, Teclados e Controles | mantém |

### Sensores (98)

| Hoje | Sugestão | Por quê |
| --- | --- | --- |
| Temperatura e Umidade (14) | **Sensores de Temperatura e Umidade** | regra 1 |
| Distância, Presença e Movimento (12) | **Sensores de Distância e Movimento** | presença (PIR) é movimento; menos uma palavra |
| Indutivos, Capacitivos e Fim de Curso (18) | **Sensores Indutivos e Fim de Curso** | capacitivos são 2 itens e ficam aqui sem precisar do nome |
| Corrente e Tensão (9) | **Sensores de Corrente e Tensão** | regra 1 |
| Gás, Chama, Som, Luz e Cor (18) | **Sensores de Gás e Chama** (10) e **Sensores de Luz, Som e Cor** (8) | cinco coisas num nome é gaveta; dividir dá dois nomes limpos e vira 77 folhas |
| Fluxo, Nível, Chuva e Solo (15) | **Sensores de Fluxo, Nível e Solo** | chuva é um item; os três restantes são famílias |
| Peso, Carga e Piezo (12) | **Sensores de Peso e Célula de Carga** | "célula de carga" é o termo buscado; piezo (4) fica junto sem nome |

### Displays e Telas (36)

| Hoje | Sugestão | Por quê |
| --- | --- | --- |
| Telas Nextion (18) | Telas Nextion | mantém, forte no Google |
| Displays LCD, OLED e TFT (9) | Displays LCD, OLED e TFT | mantém |
| Telas para Raspberry Pi (4) | Telas para Raspberry Pi | mantém |
| 7 Segmentos e Matriz de LED (5) | **Displays 7 Segmentos e Matriz LED** | regra 1 |

### Automação Industrial (90)

| Hoje | Sugestão | Por quê |
| --- | --- | --- |
| CLP e IHM (17) | CLP e IHM | mantém |
| Botões, Chaves e Sinalização de Painel (25) | **Botões de Comando e Sinalização** | "comando e sinalização" é o vocabulário do setor (Metaltex, Eletrus); cabe emergência, seletora, sinalizador |
| Relés de Estado Sólido e Industriais (3) | **Relés Industriais e SSR** | mais curto, a sigla é buscada |
| Controladores de Temperatura e Encoders (8) | Controladores de Temperatura e Encoders | mantém (duas famílias pequenas; dividir daria 5 e 3) |
| Bornes, Trilho DIN e Quadros (27) | **Bornes, Trilho DIN e Quadros Elétricos** | "quadro elétrico" é o termo completo |
| Ventilação e Refrigeração (10) | **Microventiladores e Refrigeração** | "microventilador" e "cooler" são os termos buscados |

### Fontes e Baterias (80)

| Hoje | Sugestão | Por quê |
| --- | --- | --- |
| Fontes Chaveadas (22) | Fontes Chaveadas | mantém |
| Conversores DC-DC Step Up e Step Down (11) | Conversores DC-DC Step Up e Step Down | mantém (longo, mas são os três termos buscados) |
| Baterias, Carregadores e BMS (19) | Baterias, Carregadores e BMS | mantém |
| Suportes de Pilha e Acessórios de Bateria (22) | **Suportes de Pilha e Bateria** | mais curto, mesma leitura |
| Voltímetros, Medidores e Testadores (6) | **Voltímetros e Medidores** | testador USB é medidor |

### Motores e Robótica (90)

| Hoje | Sugestão | Por quê |
| --- | --- | --- |
| Motores de Passo e Servos Industriais (18) | **Motores de Passo e Servo AC** | "servos industriais" confunde com os micro servos de robótica; o servo AC é 1 item e o nome diz qual |
| Drivers para Motor de Passo (14) | **Drivers de Motor de Passo** | preposição mais natural |
| Motores DC e Caixas de Redução (19) | Motores DC e Caixas de Redução | mantém |
| Servos, Brushless e Aeromodelismo (8) | **Micro Servos, Brushless e Aeromodelismo** | separa do servo AC industrial |
| Drivers e Controladores de Motor DC (8) | **Ponte H e Controladores de Motor DC** | "ponte H L298" é o termo buscado |
| Bombas, Válvulas e Solenoides (17) | Bombas, Válvulas e Solenoides | mantém |
| Chassis, Rodas e Partes Robóticas (6) | **Chassis e Rodas para Robótica** | mais curto |

### CNC, Laser e Impressão 3D (360)

| Hoje | Sugestão | Por quê |
| --- | --- | --- |
| Movimento Linear (166, intermediária) | Movimento Linear | mantém |
| ↳ Fusos e Castanhas (29) | Fusos e Castanhas | mantém |
| ↳ Eixos, Guias e Rolamentos Lineares (34) | Eixos, Guias e Rolamentos Lineares | mantém |
| ↳ Mancais e Suportes de Eixo (16) | Mancais e Suportes de Eixo | mantém |
| ↳ Acoplamentos e Flanges (21) | **Acoplamentos** | flange é 1 produto em 4 variações |
| ↳ Polias, Roldanas e Correias (54) | Polias, Roldanas e Correias | mantém |
| ↳ Cremalheiras e Engrenagens (12) | Cremalheiras e Engrenagens | mantém |
| Perfis de Alumínio e Fixação V-Slot (48) | **Perfis V-Slot e Fixação** | "v-slot" é o termo buscado; "alumínio" fica implícito |
| Esteiras Porta Cabos (22) | Esteiras Porta Cabos | mantém |
| Controladoras e Eletrônica CNC (13) | **Placas Controladoras CNC** | nome do produto, não da área |
| Spindles, Inversores e Acessórios (12) | **Spindles e Inversores** | "e Acessórios" não diz nada; nebulizador e mangueira ficam aqui sem precisar do nome |
| Fresas, Brocas e Pinças (24) | Fresas, Brocas e Pinças | mantém |
| Laser: Módulos e Peças (25) | **Módulos Laser e Peças CO2** | sai o dois-pontos (regra 3); CO2 é a palavra buscada |
| Impressão 3D: Hotend, Bicos e Peças (42) | **Peças para Impressora 3D** | é o termo de busca; sai o dois-pontos |
| Máquinas e Equipamentos (8) | Máquinas e Equipamentos | mantém |

### Componentes Eletrônicos (146)

| Hoje | Sugestão | Por quê |
| --- | --- | --- |
| Resistores, Potenciômetros e Trimpots (28) | **Resistores e Potenciômetros** | trimpot é potenciômetro |
| Capacitores e Cristais (8) | Capacitores e Cristais | mantém |
| Diodos, Transistores e MOSFETs (26) | Diodos, Transistores e MOSFETs | mantém |
| Circuitos Integrados, Reguladores e Soquetes (37) | **Circuitos Integrados e Reguladores** | soquete é acessório do CI |
| LEDs e Suportes (19) | **LEDs e Soquetes** | "soquete para LED" é o termo |
| Buzzers e Alto-falantes (5) | Buzzers e Alto-falantes | mantém |
| Fusíveis, Filtros e Proteção (3) | **Fusíveis e Filtros** | "proteção" é redundante |
| Chaves, Botões e Interruptores (20) | **Chaves e Interruptores** | "botões" confunde com os de painel industrial |

### Conectores e Cabos (155)

| Hoje | Sugestão | Por quê |
| --- | --- | --- |
| Conectores JST, Dupont e Barras de Pinos (40) | Conectores JST, Dupont e Barras de Pinos | mantém (três termos buscados) |
| Conectores Circulares, Plugs e Jacks (25) | **Conectores Mike, Plugs e Jacks** | "mike" (GX12/GX16) é como o cliente chama |
| Bornes, Terminais e Emendas (12) | Bornes, Terminais e Emendas | mantém |
| Conectores DB, RJ45, HDMI e Adaptadores (13) | **Adaptadores DB9, RJ45 e HDMI** | o que há aqui é adaptador e conector de painel |
| Cabos USB, HDMI e Extensões de Painel (26) | **Cabos USB, HDMI e Extensões** | mais curto |
| Fios, Jumpers e Cabos Diversos (22) | **Jumpers, Fios e Cabos** | jumper na frente (é o mais buscado); sai "diversos" |
| Termo Retrátil e Organização de Cabos (17) | **Termo Retrátil e Abraçadeiras** | nome de produto, não de função |

### Prototipagem e Ferramentas (57)

| Hoje | Sugestão | Por quê |
| --- | --- | --- |
| Protoboards e Placas de Circuito (8) | **Protoboards e Placas Fenolite** | "fenolite" é o termo buscado |
| Soldagem (3) | **Solda e Estação de Solda** | regra 1: "soldagem" sozinho é processo, não produto |
| Ferramentas e Instrumentos de Bancada (10) | **Ferramentas e Instrumentos** | mais curto |
| Parafusos, Espaçadores e Fixação (22) | Parafusos, Espaçadores e Fixação | mantém |
| Caixas Plásticas e Organizadores (14) | Caixas Plásticas e Organizadores | mantém |

### Softwares e Serviços (8)

| Hoje | Sugestão | Por quê |
| --- | --- | --- |
| Softwares e Licenças (4) | **Softwares** | licença é o que se vende de software |
| Serviços (4) | Serviços | mantém |

## Resumo

- 3 nomes de topo mudam; 9 ficam.
- 39 folhas mudam; 37 ficam; 1 folha vira 2 (Sensores de Gás e Chama; Sensores de Luz, Som e Cor). Total: 12 topos, 1 intermediária, 77 folhas.
- Depois de fechados os nomes, o CSV e a seção 4 do relatório principal são atualizados, e só então o script da LI é escrito.
