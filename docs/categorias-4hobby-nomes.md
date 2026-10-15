# Árvore final de categorias da loja 4hobby (uma família por folha)

Data: 14/10/2026. Esta é a árvore **aprovada**. Histórico: a de 06/10 (76 folhas) foi refeita porque nome de folha não pode listar produtos diferentes; em 07/10 o dono aceitou as 17 fusões de folhas pequenas (133 folhas, 12 topos); em 14/10 ele enxugou os topos (12 → 10), tirou o nível intermediário "Movimento Linear", criou o topo Kits Educacionais reduziu Placas Embarcadas a quatro folhas, uma por família de placa, com shields, interfaces e gravadores dentro da placa a que servem, enxugou os módulos de Módulos e Sensores a seis folhas (os sensores ficaram como estavam) refez Displays e Telas por tipo de tela, sem folha própria para a Nextion, e criou o topo Cabos e Conectores (cabos e conectores de painel), deixando em Componentes Eletrônicos só os conectores de PCB e as barras de pinos; por fim refez Automação Industrial em 8 folhas (a Peltier foi para Módulos e Sensores e os sensores indutivos e capacitivos industriais vieram para Automação). Por último, Fontes e Baterias deixou de ser topo: as 7 folhas foram para Componentes Eletrônicos. Depois ainda: Motores e Robótica virou Motores, com 5 folhas (eletroímãs para Módulos e Sensores, chassis para Kits Educacionais), e o inversor de frequência foi para Automação Industrial. Fechou com CNC, Laser e Impressão 3D em 19 folhas (fusos juntos, eixos e guias juntos, mancais e suportes juntos, perfis com cantoneiras e espaçadores, mesas aquecidas com extrusoras; suportes de motor de passo para Motores; Máquinas e Equipamentos e os serviços deixaram de ser folha). O CSV `categorias-4hobby-mapeamento.csv` já reflete esta árvore.

## Regras que valem para nome novo

1. **Uma família de produto por folha.** O nome tem o substantivo do produto ("Sensores de Gás e Chama", "Fusos Trapezoidais"). "X e Y" só quando Y é acessório ou vizinho inseparável de X.
2. **O nome se sustenta sozinho** (vira URL e título da página na LI): "Sensores de Temperatura e Umidade", não "Temperatura".
3. Sem dois-pontos, sem parênteses; sigla só quando é o que o cliente digita (CLP, IHM, LED, RFID, CNC, SSR, ESP32, GT2). O número de ordenação ("04 - Resistores") existe **só no nome gravado na LI**, porque o menu dela é alfabético (ver "Ordem no menu"); o nome da árvore, da URL e do Rise é o limpo.
4. Nada vai para "Outros". Produto sem família própria fica na família mais próxima.
5. **Dois níveis só** (topo > folha). Não existe nível intermediário.

Resultado: **11 topos e 106 folhas** para 1.307 produtos publicáveis, 4 deles (os serviços) publicados sem categoria (99 folhas com produto próprio, uma reservada sem produto (Transformadores) e seis só com produtos de 2ª categoria: Shields para Embarcados, Conversores DC-DC e Módulos BMS para Bateria, em Módulos e Sensores, Displays 7 Segmentos e Caixas Plásticas e Organizadores, em Componentes Eletrônicos, e Motores e Drivers, em CNC; média de 11 por folha). Folhas com 2 a 4 produtos ficam de propósito (marcadas ◂ pequena): são famílias que o cliente procura pelo nome ou que vão crescer (kits).

Com dois níveis e uma família por folha, Módulos e Sensores (26 folhas, contando as de 2ª categoria), CNC (19) e Componentes Eletrônicos (20) ficam com menu longo. É o custo das duas escolhas do dono (topo enxuto + folha de uma família); os temas da Loja Integrada mostram essas listas em colunas.

## Árvore, com a quantidade de produtos de hoje

### Placas Embarcadas (88)

- Placas Arduino (27)
- Placas ESP32 (22)
- Placas STM32 (10)
- Placas Raspberry Pi (29)

Uma folha por família de placa (decisão do dono em 14/10/2026). Shields, cases, placas de interface com bornes e gravadores ficam dentro da placa a que servem: protoshield, shield multifunções, shield expansor Nano, os dois ethernet shields, o data logger shield, o joystick shield, as interfaces com bornes para Uno/Mega/Nano, os cases e o gravador AVR ISP em Placas Arduino; o Arduino Mega WiFi e os adaptadores de ESP-01/ESP-07/ESP-12 em Placas ESP32 (as ESP8266 ficam aí, com o nome curto que ele pediu), junto das interfaces para ESP32 e Heltec; as interfaces Bluepill/F446RE, o ST-Link e o J-Link em Placas STM32. Os acessórios de Raspberry (cases, câmeras, dissipadores, HATs de CAN e PoE, gateway LoRa, controles USB) e, por decisão do dono, os cartões micro SD e o leitor USB ficam em Placas Raspberry Pi.

### Módulos e Sensores (188)

- Shields para Embarcados (20 como 2ª categoria, nenhum próprio)
- Módulos Wireless e IoT (24)
- Antenas e Acessórios (5)
- Módulos RTC e Memória (5)
- Módulos Relé e Acionamento (15)
- Conversores de Sinais (29)
- Conversores DC-DC (11 como 2ª categoria, nenhum próprio)
- Módulos BMS para Bateria (6 como 2ª categoria, nenhum próprio)
- Sensores de Temperatura e Umidade (14)
- Sensores de Distância e Proximidade (9)
- Sensores de Corrente e Tensão (9)
- Sensores de Gás e Chama (9)
- Sensores de Luz e Cor (7)
- Sensores de Movimento e Vibração (5)
- Sensores Magnéticos Reed e Hall (5)
- Sensores de Fluxo de Água (5)
- Sensores de Nível de Água (5)
- Sensores de Umidade do Solo e Chuva (5)
- Células de Carga (7)
- Transdutores Piezoelétricos (5)
- Chaves Fim de Curso (7)
- Teclados Matriciais (4) ◂ pequena
- Eletroímãs e Válvulas Solenoide (8)
- Pastilhas Peltier (3) ◂ pequena
- Imãs de Neodímio (3) ◂ pequena

Módulos em seis folhas (decisão do dono em 14/10/2026: relé, conversores de sinais, wireless e IoT, antenas e acessórios e shields; os grupos de sensores ficaram como estavam, menos Sensores Indutivos e Capacitivos, que foi para Automação Industrial como Sensores Industriais). Pastilhas Peltier veio de Automação Industrial, Eletroímãs e Válvulas Solenoide de Motores e Imãs de Neodímio de Ferramentas e Prototipagem, por decisão dele. O painel solar de 6V veio de Componentes ("painel solar vai para Módulos") e ficou em folha própria, Painéis Solares, com 1 produto, porque não cabia em nenhuma outra. Módulos Relé e Acionamento junta relés, optoacopladores, MOSFET e dimmers; Conversores de Sinais junta RS485/RS232, CAN, 4-20mA/0-10V, nível lógico, ADC/DAC e o conversor RS485-Ethernet; Módulos Wireless e IoT junta WiFi, Bluetooth, RF 433MHz/nRF24, GPS/GSM, Sonoff, os módulos Ethernet, RFID/NFC com tags e cartões, o leitor biométrico e o infravermelho. **Módulos RTC e Memória** (RTC DS1307/DS3231, EEPROM e o módulo leitor micro SD) ficou porque não cabe em nenhuma das cinco: é a única folha de módulo fora da lista dele. Saíram para outros topos: teclados matriciais → folha própria Teclados Matriciais, em Módulos e Sensores (pedido dele em 15/10/2026, depois de terem passado por Chaves e Push Buttons); joystick → Potenciômetros e Trimpots; encoders KY-040/HW-040 → Encoders Incrementais; sensor de toque TTP223 → Sensores de Distância e Proximidade; cartões micro SD e leitor USB → Placas Raspberry Pi.

### Displays e Telas (36)

- Telas Gráficas TFT (24)
- Displays LCD (5)
- Displays OLED (2) ◂ pequena
- Displays e Matriz de LED (5)

Folhas por tipo de tela (decisão do dono em 14/10/2026: a Nextion não fica separada). Toda tela TFT é gráfica (painel LCD de matriz ativa, pixel a pixel), por isso o nome que ele pediu, "Telas Gráficas TFT", sem parênteses; a OLED também é gráfica, mas é outra tecnologia e fica na folha dela. Telas Gráficas TFT junta as 15 Nextion (Basic, Enhanced, Intelligent) com as expansões e o conector delas, as 3 telas de 7" para Raspberry Pi com o case da oficial (todas com Placas Raspberry Pi como 2ª categoria), a 3,5" touch ILI9488 e a 1,8" ST7735: são todas LCD TFT, a diferença é só a interface (serial, HDMI/DSI, SPI). Displays LCD são os alfanuméricos de caracteres (16x2 e 20x4), com o módulo I2C e o LCD shield; o dono preferiu o nome curto, mesmo com os títulos das Nextion e das TFT também dizendo "LCD".

### Componentes Eletrônicos (232)

- Resistores (18)
- Diodos (10)
- Capacitores (7)
- Transistores e MOSFETs (16)
- Circuitos Integrados (33)
- Reguladores de Tensão (5)
- Potenciômetros e Trimpots (11)
- Cristais Osciladores (1) ◂ pequena
- Filtros de Ferrite (2) ◂ pequena
- LEDs e Soquetes (20)
- Displays 7 Segmentos (4 como 2ª categoria, nenhum próprio)
- Buzzers, Alto-falantes e Áudio (7)
- Barras de Pinos (15)
- Fusíveis (1) ◂ pequena
- Chaves e Push Buttons (18)
- Plugs e Conectores (46)
- Terminais e Acessórios (6)
- Espaçadores e Isoladores (6)
- Suportes para PCB (7)
- Lasers Sinalizadores (3)
- Caixas Plásticas e Organizadores (14 como 2ª categoria, nenhum próprio)

**Caixas Plásticas e Organizadores** (15/10/2026) aparece aqui também, como 2ª categoria, e continua em Ferramentas e Prototipagem (eu tinha lido o "também" dele como mover; ele corrigiu: "continuam fazendo parte de prototipagem"). **Suportes para PCB** (15/10/2026) recebe os 6 suportes de PCI para trilho DIN e o suporte de placa de circuito impresso para trilho DIN (951201 a 951206 e 901001), que estavam em Elétrica e Acessórios, em Automação; ficam só aqui (ele pediu "vira uma nova categoria", sem manter lá). **Fontes e Baterias** (15/10/2026) junta as antigas Fontes Chaveadas e Conversores DC-DC e Baterias e Acessórios, a pedido dele ("Baterias e Acessórios vai dentro de fonte"): 73 produtos, a maior folha do menu, e como são duas famílias numa folha só o nome cita as duas; os conversores também aparecem em Módulos e Sensores (depois, no mesmo dia, ele tirou tudo isso de Componentes e criou o topo Fontes e Conversores). Terminais e Acessórios (terminais, emendas e ilhoses) voltou de Cabos e Conectores a pedido do dono; as abraçadeiras passaram por aqui e foram para Automação Industrial > Elétrica e Acessórios, com as tomadas de painel. Na última passada dele: Capacitores e Cristais Osciladores separados, Fusíveis e Filtros de Ferrite separados (ele disse "filtros"; o "de Ferrite" é para o nome se sustentar sozinho), e os interruptores tipo abajur entraram em Chaves e Push Buttons. Fontes e Baterias deixou de ser topo a pedido do dono em 14/10/2026 ("fontes deve se juntar a outra categoria, veja qual faz mais sentido"): as 7 folhas vieram para cá e depois ele as enxugou: **Baterias e Acessórios** junta pilhas e baterias, suportes de pilha, níquel e terminais, placas BMS e testadores e carregadores; **Fontes Chaveadas e Conversores DC-DC** junta as fontes com os step up/step down; o painel solar de 6V foi para Módulos e Sensores e Voltímetros e Testadores para Ferramentas e Prototipagem. Motivo da escolha de Componentes: Pilhas e Baterias já estava aqui e o resto é a família dela (suportes, níquel, BMS, carregadores); fontes chaveadas, conversores DC-DC e voltímetros são alimentação, que nas lojas do ramo mora em Eletrônica. Em Automação Industrial só as fontes Andeli de 12/24/48V fariam sentido, e em Módulos e Sensores só os conversores DC-DC; partir a família não valia. Espaçadores e Isoladores (espaçadores de PCB, nylon isolante e parafusos nylon) veio de Ferramentas e Prototipagem, também a pedido dele. **Plugs e Conectores** (era Conectores para PCB e depois só Conectores; renomeada pelo dono em 15/10/2026) junta o que se solda na placa ou liga fio à placa: JST XH e PH com terminais, Dupont com terminais e os bornes KRE/KF e BR7. Em 15/10/2026 entraram também, vindos de Automação > Elétrica e Acessórios e a pedido dele, os 6 plugs jack P4, os 4 plugs P10, os 2 plugs Canon (XLR) o conector banana 3,5 mm de RC LiPo (902301_z) e, depois, os 2 plugs banana fêmea (900707 e 900708); o XT60 (900801) foi para Fontes e Conversores > Baterias e Acessórios. Barras de Pinos fica como folha própria, a pedido dele. Os conectores de painel e de cabo (Mike, P4/P10, XLR/XT60/banana, DB/RJ45/HDMI) e os cabos foram para o topo Cabos e Conectores (hoje Fios e Cabos); os conectores de painel acabaram em Automação Industrial > Elétrica e Acessórios e os adaptadores ficaram com os cabos. Plugs P4 e P10 tem 2 itens de PCB (P4 fêmea para PCB e P10 fêmea painel/PCB) no meio de 8 de cabo e painel: a família ficou inteira em Cabos e Conectores para não se partir.

### Fontes e Conversores (81)

- Fontes Chaveadas (22)
- Transformadores (0) ◂ reservada, sem produto hoje
- Conversores DC-DC (11)
- Baterias e Acessórios (47)
- Painéis Solares (1) ◂ pequena

Topo ditado pelo dono em 15/10/2026 ("Fontes e Conversores vira categoria de topo com subcategorias"): tudo o que era a folha Fontes e Baterias, de Componentes Eletrônicos, agora com folhas próprias. Fontes Chaveadas (22) inclui as mini fontes Hi-Link, a fonte PoE e as fontes Andeli; Conversores DC-DC (11) são os step up e step down e continuam aparecendo também em Módulos e Sensores > Conversores DC-DC; Baterias e Acessórios (47) junta pilhas e baterias, suportes, níquel, BMS, testadores, carregadores, o conector XT60 (900801, desde 15/10/2026) e os 6 termoretráteis de PVC azul para baterias (940714 a 940719, de 85 a 200 mm), que estavam fora do site como "uso e consumo" e foram publicados a pedido dele. Esses 6 estão sem preço no Rise e o título começa com "USO E CONSUMO-": preço e título padronizado antes de ir à LI. **Transformadores não tem nenhum produto no catálogo** (nem fora do site): a folha está no arquivo da árvore como reservada, e o script da LI só a cria quando houver produto, a menos que ele mande criá-la vazia. O topo se chama Fontes e Conversores, como ele ditou, mas leva Baterias e Acessórios dentro; "Fontes e Baterias" ou "Energia" seriam nomes que cobrem as quatro folhas.

### Fios e Cabos (54)

- Fios e Cabos Elétricos (15)
- Cabos USB (19)
- Cabos HDMI (6)
- Adaptadores para Cabos (14)

Renomeado **Fios e Cabos** em 15/10/2026, sem folha de conectores: os 25 conectores de cabo e painel (Mike GX12/GX16, XLR, XT60 e banana, plugs P4/P10) foram para Automação Industrial > Elétrica e Acessórios, a pedido dele (a folha mais cheia do menu, com 67 produtos). Topo criado pelo dono em 14/10/2026 para cabos, conectores de painel e adaptadores (o que não se solda na PCB) e enxugado por ele na mesma data: Cabos USB e Cabos HDMI separados, cada um com as extensões para painel dentro (os dois cabos combinados USB + HDMI ficam em Cabos USB e aparecem também em Cabos HDMI); Conectores para Cabo e Painel junta os metálicos Mike GX12/GX16, os XLR, XT60 e banana e os plugs P4/P10; Adaptadores para Cabos é o antigo "Adaptadores DB9, RJ45 e HDMI" com o nome sem siglas, como ele pediu (os dois nomes finais são dele). Terminais e Emendas virou Terminais e Acessórios e voltou para Componentes Eletrônicos, junto com Abraçadeiras e Organizadores de Cabos; jumpers, garras jacaré e termo retrátil foram para Ferramentas e Prototipagem.

### Automação Industrial (106)

- CLP (8)
- IHM (9)
- Controladores Industriais (8)
- Inversores de Frequência (1) ◂ pequena
- Sensores Industriais (6)
- Encoders (5)
- Chaves e Botoeiras (21)
- Sinalizadores (4) ◂ pequena
- Componentes Elétricos (44)

Nove folhas ditadas pelo dono em 14/10/2026. Inversores de Frequência recebe o inversor avulso de 2,2 kW ("inversores vai para Automação"); os kits de spindle com inversor continuam em CNC > Spindles, porque são vendidos como conjunto. Chaves e Botoeiras junta as botoeiras 22mm (pulso, emergência, seletora, seccionadora, contatos, tampões e plaquetas) com os botões metálicos iluminados e antivandalismo; Sinalizadores são os luminosos LED 22mm para painel; Controladores Industriais é o antigo "Controladores de Temperatura e SSR" (REX-C100, termostatos, relés SSR e o relé com soquete); Componentes Elétricos (era Elétrica e Acessórios; renomeada pelo dono em 15/10/2026) junta bornes para trilho DIN, trilho, canaletas e suportes, quadros elétricos, prensa cabos e microventiladores, e depois recebeu as tomadas de painel e as abraçadeiras e organizadores de cabos, vindas de Componentes, e por fim os 25 conectores de cabo e painel (Mike, XLR, XT60, banana, P4/P10), vindos de Cabos e Conectores; Sensores Industriais recebe os indutivos e capacitivos M12/M18 PNP/NPN que estavam em Módulos e Sensores. Pastilhas Peltier foi para Módulos e Sensores.

### Motores (82)

- Motores de Passo (18)
- Easy Servo (5)
- Servo Drive (1) ◂ pequena
- Motores DC (36)
- Drivers e Controladores (22)

Topo renomeado pelo dono em 14/10/2026 (sem "Robótica"), em cinco folhas. Motores de Passo inclui os suportes de motor (vindos de CNC); Easy Servo (motor de passo com encoder + driver, 45 a 120 kgf) ganhou folha própria a pedido dele e Servo Drive ficou com o servo motor AC 400 W com drive; Motores DC junta os motores DC com caixa de redução, as mini bombas de água e ar e os micro servos e motores para aeromodelismo (SG90, MG996R, brushless, ESC, Pixhawk, PCA9685), tudo pedido dele; Drivers e Controladores junta os drivers de motor de passo (A4988, TMC, DM556, DM860H) com as pontes H e os controladores PWM de motor DC. Eletroímãs e Válvulas Solenoide foi para Módulos e Sensores e Chassis e Rodas para Robótica para Kits Educacionais.

### CNC, Laser e Impressão 3D (365)

- Fusos e Castanhas (29)
- Eixos e Guias Lineares (16)
- Rolamentos e Pillow Block (20)
- Mancais e Suportes de Eixo (16)
- Acoplamentos (21)
- Correias (19)
- Polias e Roldanas (35)
- Cremalheiras e Engrenagens (12)
- Perfis de Alumínio e Acessórios (33)
- Esteiras Porta Cabos (22)
- Controladores CNC (13)
- Motores e Drivers (37 como 2ª categoria, nenhum próprio)
- Spindles (11)
- Fresas, Brocas e Pinças (24)
- Módulos Laser de Diodo (5)
- Peças para Laser CO2 (17)
- Mesas Aquecidas e Extrusoras (30)
- Acessórios para Impressora 3D (12)
- Parafusos, Porcas e Acessórios (22)
- Máquinas (4) ◂ pequena
- Softwares (4) ◂ pequena

Dezenove folhas ditadas pelo dono em 14/10/2026. Parafusos, Porcas e Acessórios veio de Ferramentas e Prototipagem a pedido dele ("avaliar qual é melhor": manoplas de aperto, parafusos usinados, allen, buchas, pé nivelador e dobradiça são ferragem de máquina, não de bancada) e recebeu as porcas excêntricas, a porca fina OpenBuilds, os espaçadores de alumínio e as arruelas de precisão; as porcas martelo foram para Perfis de Alumínio e Acessórios, junto dos perfis, cantoneiras, acabamentos e batentes. Correias e Polias e Roldanas perderam as siglas do nome (GT2, HTD, V-Slot), como ele pediu. Motores de Passo e Servo Drive e Drivers de Motor de Passo existem só como 2ª categoria (os produtos moram em Motores): foi a resposta ao "motores e drivers também devem fazer parte de CNC"; concordei para motores de passo, servo drives e drivers de passo, que são de quem monta CNC e impressora 3D, e não para ponte H, PWM e motores DC, que ficam só em Motores. O gerador de pulso para motor de passo aparece em Controladores CNC (nome novo de Placas Controladoras CNC). A folha de motores não se chama só "Motores" para a URL não bater com a do topo Motores. Fusos e Castanhas junta fusos de esferas, trapezoidais e castanhas/antifolga ("não separar esfera e trapezoidal"); Eixos e Guias Lineares junta eixos, guias MGN e os dois atuadores lineares; Mancais e Suportes de Eixo junta mancais KP/KFL e suportes SK/SHF; Perfis de Alumínio e Acessórios junta perfis V-Slot, cantoneiras, acabamentos, batentes e porcas martelo; Mesas Aquecidas e Extrusoras junta mesas, hotends, bicos e extrusoras. Suportes de Motor de Passo foi para Motores. **Máquinas e Equipamentos deixou de ser folha** ("saem"): as duas máquinas laser e os dois conjuntos da gravadora Ciclope foram para Módulos Laser de Diodo, os atuadores lineares para Eixos e Guias Lineares, a Ender3 montada para Acessórios para Impressora 3D e o conjunto pick-and-place para Ferramentas e Solda; se "saem" queria dizer "fora do site", é só marcar NÃO PUBLICAR. **Softwares ficou sem os serviços**: os 4 serviços (programação para embarcados e para CLP/IHM, configuração de LightBurn e de Mach3) ficam publicados **sem categoria** (marcados SEM CATEGORIA no CSV), acháveis pela busca e não pelo menu; se ele quiser uma folha Serviços, falta dizer em qual topo.

### Ferramentas e Prototipagem (60)

- Protoboards e Placas Fenolite (8)
- Jumpers e Garras Jacaré (7)
- Ferramentas e Solda (8)
- Instrumentos de Medição (12)
- Caixas Plásticas e Organizadores (14)
- Termo Retrátil (11)

Imãs de Neodímio foi para Módulos e Sensores e Parafusos, Buchas e Fixação para CNC, Laser e Impressão 3D; os voltímetros e testadores vieram de Componentes e entraram em Instrumentos de Medição. Tudo por decisão do dono em 14/10/2026. Em 15/10/2026 as Caixas Plásticas e Organizadores passaram a aparecer também em Componentes Eletrônicos (2ª categoria).

### Kits Educacionais (11)

- Kits Arduino (3) ◂ pequena
- Kits de Eletrônica e Robótica (8)

Topo criado a pedido do dono para receber os kits que serão montados no Rise (produto com composição). Hoje tem os 3 kits Arduino (iniciante, avançado, 37 sensores), o kit Micro:bit V2 e o kit didático de eletrônica e robótica.

## Ordem no menu

Pedido do dono em 14/10/2026, refinado em 15/10: dentro de cada topo, **as famílias principais vêm primeiro, as vizinhas logo em seguida, e as pequenas e os acessórios no fim**, na ordem em que aparecem nas listas acima (em Componentes: Resistores, Diodos, Capacitores, Transistores, CIs e Reguladores, Potenciômetros e Cristais, LEDs, Displays, Barras de Pinos e Fusíveis, som, chaves, conectores, terminais, espaçadores e suportes de PCB, e por último Filtros de Ferrite, Lasers Sinalizadores e Caixas Plásticas (ordem ditada por ele em 15/10/2026); em Módulos e Sensores: os módulos, os sensores do mais procurado ao menos, e atuadores e energia no fim; em CNC: movimento linear, estrutura, eletrônica e motores, usinagem, laser, impressão 3D, software; em Automação: controle, sensores, comando e sinalização, elétrica). A primeira versão, agrupada por família técnica (passivos, semicondutores...), ele recusou: não era isso. A ordem dos topos é a das seções. Ela está gravada em `categorias-4hobby-arvore.csv` (ordem_topo, topo, chave_topo, ordem_folha, folha, chave, tipo, produtos próprios, produtos de 2ª, nome_na_li), gerado por `scripts/categorias-gerar-arvore.cjs`, que é a tabela de categorias que o Rise vai usar.

**A API da Loja Integrada não tem campo de ordem** para categoria (o POST aceita só nome, descrição, categoria_pai e id_externo; "posicao" existe só em imagem de produto) e **o menu da loja lista as categorias em ordem alfabética** (conferido na home da www.4hobby.com.br em 14/10/2026: as subcategorias aparecem de Antenas a Válvulas, e no CNC de Acessórios a Rolamento, independente da ordem de criação). O dono já contornava isso com número no nome ("1 - Placas Embarcados"). Decisão dele em 14/10/2026: **o nome gravado na LI leva o número de ordem**, e a coluna `nome_na_li` do arquivo da árvore já traz ("01 - Placas Embarcadas", "04 - Resistores"). Duas regras que o próprio site ensina: (a) **dois dígitos**, senão "10 -" fica antes de "2 -"; (b) **criar a categoria com o nome limpo e renomear depois com o número**, porque a LI mantém a URL original no rename ("1 - CLPs e IHMs" vive em /clps-e-ihms, "4 - Spindles" em /fresas-brocas-spindles), enquanto a criada já com número ganha URL feia (/1-placas). O script da LI vai fazer POST com o nome limpo e PUT com o nome numerado, e o teste com uma categoria confirma que a URL fica limpa. O título da página da categoria mostra o número, como já mostra hoje; é o custo aceito.

## Segunda categoria

Produto na Loja Integrada pode estar em mais de uma categoria. A coluna `categoria_secundaria` do CSV marca:

- 4 bombas de água de laser/spindle (120212, 122402, 122403, 122408): ficam em Motores > Motores DC (as mini bombas entraram lá) e aparecem também em Peças para Laser CO2 / Spindles.
- 5 cabos HDMI, micro HDMI e DP (930213, 930701, 930702_4h, 930703_4h, 930704_z) em Cabos HDMI e o hub OTG (930607_z) em Cabos USB: aparecem também em Placas Raspberry Pi.
- 2 cabos de extensão combinados USB + HDMI para painel (930204, 930212): ficam em Cabos USB e aparecem também em Cabos HDMI.
- 11 conversores DC-DC step up e step down (200201, 200202, 200205, 200206, 200207, 200224, 200225, 200226, 200227, 200228, 220504_z): ficam em Fontes e Conversores > Conversores DC-DC e aparecem também em **Módulos e Sensores > Conversores DC-DC**, folha que existe só para isso (pedido dele em 15/10/2026). As fontes chaveadas, as mini fontes Hi-Link e as baterias ficam só no topo Fontes e Conversores.
- 4 displays de 7 segmentos (100307, 100308, 921701_z, 921702_z): ficam em Displays e Telas > Displays e Matriz de LED e aparecem também em **Componentes Eletrônicos > Displays 7 Segmentos**, folha que existe só para isso (pedido dele em 15/10/2026: levar para Componentes e manter em Displays). A matriz de LED 8x8 MAX7219 (100309) ficou só em Displays e Telas; se ele quiser, entra também.
- 3 jumpers Dupont de 20 cm (930104 macho-fêmea, 930105 macho-macho, 930106 fêmea-fêmea): ficam em Ferramentas e Prototipagem > Jumpers e Garras Jacaré e aparecem também em **Fios e Cabos > Fios e Cabos Elétricos** (pedido dele em 15/10/2026: "também entram"). Os outros jumpers (kits de 65 e 140 peças, os de 10 cm estanhados) e a garra jacaré ficam só em Jumpers e Garras Jacaré; se ele quiser todos lá, é só dizer.
- 6 placas e módulos BMS (220105, 221101, 221102, 221103, 221104, 221105): ficam em Fontes e Conversores > Baterias e Acessórios e aparecem também em **Módulos e Sensores > Módulos BMS para Bateria**, folha só para isso (pedido dele em 15/10/2026: "mas mantenha BMS de baterias também"). O módulo testador de capacidade para bateria de lítio (100270) não é BMS e ficou só em Baterias e Acessórios.
- 14 caixas plásticas e organizadores: ficam em Ferramentas e Prototipagem > Caixas Plásticas e Organizadores e aparecem também em **Componentes Eletrônicos > Caixas Plásticas e Organizadores**, folha só para isso (pedido dele em 15/10/2026).
- 24 motores de passo (com os suportes) e servo drives: ficam em Motores e aparecem também em **CNC > Motores e Drivers**, folha que existe só para isso.
- 13 drivers de motor de passo (A4988, DRV8825, TMC2100/2130/2208/2209, DM556, DM860H, TB6560, Easy drive, extensão e proteção): ficam em Motores > Drivers e Controladores e aparecem também em **CNC > Motores e Drivers**, folha só para isso; o gerador de pulso para motor de passo (200317) aparece em CNC > Controladores CNC.
- 3 telas de 7" para Raspberry Pi e o case da oficial (110304, 110306, 110307, 111031): ficam em Telas Gráficas TFT e aparecem também em Placas Raspberry Pi.
- 20 shields, HATs, placas de interface com bornes e o gravador AVR ISP (100112, 100201, 100204, 100207, 100211, 100224, 100233, 100272, 101001, 101002, 101010, 170107, 170707, 200509, 200510, 260104, 260108, 910103, 970104, 970106): ficam na placa correspondente e aparecem também em **Módulos e Sensores > Shields para Embarcados**, folha que existe só para isso (pedido do dono em 14/10/2026: "todos os módulos e shields de Arduino também devem ser mostrados na categoria Módulos"). O script da LI precisa criar essa folha mesmo sem produto próprio.
- Arduino Mega WiFi com ESP8266 (100108): fica em Placas Arduino e aparece também em Placas ESP32.
- Serviço de programação para CLP e IHM (999905): desde a última rodada de 14/10 está sem categoria, como os outros serviços, e por isso sem 2ª categoria; se um dia ganhar folha, CLP é a 2ª natural.

## Mudanças de 14/10/2026 (ditadas pelo dono)

- "Arduino, ESP32 e Embarcados" passou a **Placas Embarcadas**; os kits saíram dela. Depois, na mesma data, ela passou de 8 para **4 folhas, uma por família de placa** (Placas Arduino, Placas Espressif ESP32 e ESP8266, Placas STM32, Placas Raspberry Pi): Shields e Cases, Placas de Interface com Bornes e Gravadores e Programadores deixaram de ser folhas, cada produto foi para a placa a que serve, e os shields e interfaces ganharam a 2ª categoria em Módulos e Sensores. Único sem placa própria: o gravador PICkit3 (270201, para PIC, que não tem placa no catálogo) foi para Componentes Eletrônicos > Circuitos Integrados, junto do ATmega328P.
- **Módulos e Sensores**: os 14 grupos de módulos viraram os 5 ditados por ele (Módulos Relé e Acionamento, Conversores de Sinais, Módulos Wireless e IoT, Antenas e Acessórios, Shields e Placas de Interface) mais Módulos RTC e Memória, que mantive por falta de lugar. Os 14 grupos de sensores não mudaram. Cartões micro SD e leitor USB foram para Placas Raspberry Pi (pedido dele); teclados matriciais para Chaves e Push Buttons, joystick para Potenciômetros e Trimpots, encoders KY-040/HW-040 para Encoders Incrementais e o TTP223 para Sensores Indutivos e Capacitivos; ethernet shields, data logger shield e joystick shield foram para Placas Arduino, e os HATs CAN e o gateway LoRa para Placas Raspberry Pi, todos com a 2ª categoria de shields.
- **Displays e Telas** passou de 5 para 4 folhas, por tipo de tela: Telas Gráficas TFT (Nextion, telas de Raspberry, SPI; nome dele, "Telas Gráficas (TFT)", sem os parênteses), Displays LCD, Displays OLED e Displays e Matriz de LED. Telas Nextion e Telas para Raspberry Pi deixaram de ser folhas.
- **Módulos** e **Sensores** viraram um topo, **Módulos e Sensores**.
- **Conectores e Cabos** entrou em **Componentes Eletrônicos**; depois, na mesma data, ele separou de novo: os conectores de PCB (JST, Dupont, KRE/KF) viraram a folha **Conectores para PCB** e **Barras de Pinos** ficou, os dois em Componentes; cabos, conectores de painel (Mike, P4/P10, XLR/XT60/banana, DB/RJ45/HDMI), terminais e abraçadeiras foram para o topo novo **Cabos e Conectores**; jumpers, garras jacaré e termo retrátil foram para **Ferramentas e Prototipagem**.
- **Automação Industrial** passou de 11 para 8 folhas ditadas por ele: CLP e Expansões, IHM, Chaves e Botoeiras (botoeiras 22mm + botões metálicos), Sinalizadores (folha nova), Controladores Industriais, Encoders, Elétrica e Acessórios (bornes, trilho DIN, quadros, ventiladores) e Sensores Industriais (os indutivos e capacitivos que estavam em Módulos e Sensores). Pastilhas Peltier foi para Módulos e Sensores; o sensor de toque TTP223, que não é industrial, ficou em Sensores de Distância e Proximidade.
- **Componentes Eletrônicos** recebeu também **Espaçadores e Isoladores** (de Ferramentas e Prototipagem, era "Espaçadores e Parafusos Nylon") e **Pilhas e Baterias** (de Fontes e Baterias), pedidos dele.
- **Fontes e Baterias deixou de ser topo** ("fontes deve se juntar a outra categoria, veja qual faz mais sentido"): as 7 folhas foram inteiras para Componentes Eletrônicos, ao lado de Pilhas e Baterias. A loja fica com 10 topos.
- **Motores e Robótica virou Motores**, com 5 folhas ditadas por ele: Motores de Passo, Easy Servo e Servo AC, Motores DC (com as mini bombas de água e ar), Drivers e Controladores (drivers de passo + ponte H e PWM) e Servos e Motores para Aeromodelismo (não citada; mantida). Eletroímãs e Válvulas Solenoide foi para Módulos e Sensores e Chassis e Rodas para Robótica para Kits Educacionais.
- **Inversores** foram para Automação Industrial: o inversor avulso virou a folha Inversores de Frequência (1 produto); os kits de spindle com inversor ficaram em CNC, na folha que passou a se chamar Spindles.
- **CNC, Laser e Impressão 3D** passou de 28 para 19 folhas ditadas por ele: Fusos e Castanhas (esferas + trapezoidais + castanhas), Eixos e Guias Lineares, Mancais e Suportes de Eixo, Perfis de Alumínio e Acessórios (perfis + cantoneiras + espaçadores), Mesas Aquecidas e Extrusoras (mesas + hotend/bicos/extrusoras); Rolamentos e Pillow Block, Acoplamentos, Correias, Polias e Roldanas, Cremalheiras e Engrenagens, Porcas Martelo, Esteiras, Placas Controladoras, Spindles, Fresas, Laser de Diodo e Laser CO2 e Acessórios para Impressora 3D como estavam. Suportes de Motor de Passo foi para Motores; Máquinas e Equipamentos deixou de ser folha (as 8 máquinas foram para a família mais próxima); Softwares ficou sem os 4 serviços, que ficam publicados sem categoria.
- **Últimos ajustes**: Placas Espressif ESP32 e ESP8266 virou **Placas ESP32**; Shields e Placas de Interface virou **Shields para Embarcados**; Imãs de Neodímio foi para Módulos e Sensores; Parafusos, Buchas e Fixação foi para CNC, Laser e Impressão 3D. Telas TFT virou **Telas Gráficas TFT** e Displays LCD 16x2 e 20x4 virou **Displays LCD**.
- **Baterias e fontes enxugadas** em Componentes: Pilhas e Baterias virou **Baterias e Acessórios**, com suportes, níquel, BMS/testadores e carregadores dentro; Fontes Chaveadas somou com os conversores DC-DC (**Fontes Chaveadas e Conversores DC-DC**); o painel solar foi para Módulos e Sensores (Painéis Solares) e Voltímetros e Testadores para Ferramentas e Prototipagem.
- **Cabos e Conectores** enxugado por ele a 5 folhas: Cabos USB e Cabos HDMI separados, com as extensões para painel dentro de cada um; Conectores para Cabo e Painel (Mike + XLR/XT60/banana + plugs P4/P10); Adaptadores para Cabos (sem siglas no nome); Terminais e Acessórios e Abraçadeiras e Organizadores de Cabos voltaram para Componentes Eletrônicos.
- **CLP** perdeu o "e Expansões" do nome, a pedido dele (as expansões continuam dentro).
- **Motores em 5 folhas**: suportes dentro de Motores de Passo; Easy Servo e Servo AC virou Servo Drive e, logo depois, Easy Servo ganhou folha própria (Servo Drive ficou com o servo AC); micro servos e motores para aeromodelismo entraram em Motores DC. **CNC**: Correias e Polias e Roldanas sem siglas; porcas martelo dentro de Perfis de Alumínio e Acessórios; Parafusos, Porcas e Acessórios (ex-Parafusos, Buchas e Fixação) com as excêntricas, a porca fina e os espaçadores de alumínio. **Ferramentas**: Voltímetros e Testadores dentro de Instrumentos de Medição.
- **Componentes, última passada**: Capacitores e Cristais Osciladores separados; Fusíveis e Filtros de Ferrite separados; interruptores em Chaves e Push Buttons; tomadas de painel e abraçadeiras foram para Automação Industrial > Elétrica e Acessórios.
- **Motores de passo e drivers também em CNC** (pergunta dele, "concorda?"): sim para motores de passo, servo drives e drivers de passo, como 2ª categoria em duas folhas novas de CNC (Motores de Passo e Servo Drive; Drivers de Motor de Passo); não para ponte H, PWM e motores DC. Placas Controladoras CNC virou Controladores CNC e recebe o gerador de pulso.
- **Movimento Linear** deixou de existir como nível: as 12 folhas ficam direto em CNC.
- **Softwares e Serviços** virou uma folha única dentro de CNC (6 dos 8 itens são LightBurn/Mach3 e seus serviços de configuração).
- Novo topo **Kits Educacionais**, com duas folhas.
- "Prototipagem e Ferramentas" passou a **Ferramentas e Prototipagem** (ferramentas é a palavra que o cliente procura).
- Displays e Telas, Motores e Robótica e Ferramentas e Prototipagem continuam como topo por decisão do dono (recomendação minha era fundir Displays em Módulos e Sensores e juntar Robótica com Kits; ele preferiu manter). Fontes e Baterias também ficou nessa rodada, até ele mandar dissolver no fim do dia (abaixo).

- **Teclados Matriciais** ganhou folha própria em Módulos e Sensores (15/10/2026): os 4 teclados de membrana e rígidos saíram de Chaves e Push Buttons; o sensor de toque TTP223 continua em Sensores de Distância e Proximidade.
- **Cabos e Conectores virou Fios e Cabos** (15/10/2026): os 25 conectores de cabo e painel (Mike, XLR, XT60, banana, P4/P10) foram para Automação Industrial > Elétrica e Acessórios; o topo ficou com Fios e Cabos Elétricos, Cabos USB, Cabos HDMI e Adaptadores para Cabos (54 produtos). Conectores para PCB, Barras de Pinos e Terminais continuam em Componentes, e as Fontes também (a dúvida dele sobre elas ficou em aberto).
- **Displays 7 Segmentos** (primeiro chamada Displays): nova folha em Componentes Eletrônicos, só de 2ª categoria, com os 4 displays de 7 segmentos, que continuam também em Displays e Telas (15/10/2026).
- **Baterias e Acessórios foi para dentro de Fontes** (15/10/2026): as duas folhas de Componentes viraram **Fontes e Baterias** (73 produtos: fontes chaveadas, conversores, pilhas e baterias, suportes, níquel, BMS e carregadores). **Conversores DC-DC** ganhou folha em Módulos e Sensores, só de 2ª categoria, com os 11 conversores, que continuam também em Fontes e Baterias.
- **Suportes para PCB**: nova folha em Componentes Eletrônicos (15/10/2026) com os 7 suportes de placa para trilho DIN, que saíram de Automação Industrial > Elétrica e Acessórios.
- **Fontes e Conversores virou topo** (15/10/2026), com Fontes Chaveadas, Transformadores (reservada: nenhum produto no catálogo), Conversores DC-DC e Baterias e Acessórios; saiu de Componentes Eletrônicos. A loja fica com 11 topos.
- **Caixas Plásticas e Organizadores** continua em Ferramentas e Prototipagem e aparece também em Componentes Eletrônicos como 2ª categoria (15/10/2026; numa 1ª leitura eu a tinha movido); **3 jumpers de 20 cm** aparecem também em Fios e Cabos > Fios e Cabos Elétricos (2ª categoria).
- **Módulos BMS para Bateria**: nova folha em Módulos e Sensores, só de 2ª categoria, com as 6 placas e módulos BMS, que continuam em Baterias e Acessórios (15/10/2026).
- **Conectores para PCB virou apenas Conectores** (15/10/2026), em Componentes Eletrônicos, com os 31 produtos de sempre (JST, Dupont, KRE/KF e BR7). O site atual já tem uma categoria com a URL /conectores: ao criar a nova, a LI pode pôr um sufixo na URL (conectores-2) até a antiga ser renomeada ou apagada.
- **Plugs jack P4** (6 produtos: 900701 a 900706_4h) foram de Automação > Elétrica e Acessórios para Componentes Eletrônicos > Conectores (15/10/2026); no mesmo dia ele mandou atrás os 4 plugs P10 (901701 a 901704), os 2 plugs Canon (901801, 901802) e o conector banana 3,5 mm 902301_z, 7 produtos a mais (Plugs e Conectores passa a 44); as bananas 900707 e 900708 vieram em seguida (Plugs e Conectores passa a 46) e o XT60 900801 foi para Baterias e Acessórios (41).
- **Conectores virou Plugs e Conectores** (15/10/2026), em Componentes Eletrônicos, já que a folha também leva os plugs jack P4. A URL nova (/plugs-e-conectores) deixa de colidir com a /conectores do site atual.
- **Elétrica e Acessórios virou Componentes Elétricos** (15/10/2026), em Automação Industrial, com 47 produtos (bornes, trilho DIN, quadros, ventiladores, tomadas de painel, abraçadeiras e o resto). O nome é parecido com o do topo Componentes Eletrônicos (elétricos x eletrônicos), mas as URLs são diferentes.
- **Motores e Drivers** (CNC, 15/10/2026): as duas folhas de 2ª categoria (Motores de Passo e Servo Drive, 24 produtos, e Drivers de Motor de Passo, 13) viraram uma só, Motores e Drivers, com 37 produtos; os produtos continuam em Motores. A loja fica com 105 folhas.
- **Máquinas** voltou como folha em CNC (15/10/2026), com as 4 gravadoras laser que estavam em Módulos Laser de Diodo: a máquina laser 10W TTS-10 (120213), a gravadora de cuia rotativa 10W (122002) e os dois conjuntos da gravadora Ciclope, frame em inox e peças impressas (600207, 600208). Módulos Laser de Diodo ficou só com os módulos e acessórios de laser (8). A Ender3 montada (150905), o pick-and-place (121701) e os atuadores lineares seguem onde estão; se ele quiser, entram em Máquinas também.
- **Kits Educacionais** ficou com 2 folhas (15/10/2026): Chassis e Rodas para Robótica (6 produtos) juntou-se a Kits de Eletrônica e Robótica, que passa a ter 8.
- **Lasers Sinalizadores**: nova folha em Componentes Eletrônicos (15/10/2026) com os 3 lasers sinalizadores vermelhos de 650 nm (cruz, linha e ponto: 121605, 121606, 121607), que saíram de CNC > Módulos Laser de Diodo (agora com 5). Ele disse "Laser Sinalizadores"; pus no plural, "Lasers Sinalizadores", que é o nome que o cliente digita.
- **Termoretráteis de PVC para baterias** (940714 a 940719, "uso e consumo", fora do site) entraram em Fontes e Conversores > Baterias e Acessórios (15/10/2026). Ficam fora do site agora 8 itens: 6 "OBSOLETO-", o projeto especial e o produto de teste.
- **Ordem do início de Módulos e Sensores** (15/10/2026, ditada por ele): Shields para Embarcados, Módulos Wireless e IoT, Antenas e Acessórios, Módulos RTC e Memória, Módulos Relé e Acionamento e Conversores de Sinais, nessa sequência; as demais (Conversores DC-DC, Módulos BMS, Teclados e os sensores) seguem na ordem que já tinham, depois dessas. Ele primeiro pediu "o item 7 fica abaixo do item 4" e, em seguida, "na verdade o item 4 vai ficar acima do item 7": li a correção como Conversores de Sinais descendo para ficar logo acima de Conversores DC-DC (o que desfaz o primeiro pedido).
- **Displays e Matriz de LED**: a folha de Displays e Telas antes chamada Displays 7 Segmentos e Matriz LED passa a se chamar Displays e Matriz de LED (15/10/2026). A folha só de 2ª categoria de Componentes continua Displays 7 Segmentos.
- **Ordem e nome em Componentes Eletrônicos** (15/10/2026, ditados por ele): Capacitores logo abaixo de Diodos; Barras de Pinos logo abaixo de Displays 7 Segmentos e Fusíveis logo abaixo de Barras de Pinos; Lasers Sinalizadores penúltimo e Caixas Plásticas e Organizadores último; e Suportes para PCI virou **Suportes para PCB** (plural, como as outras folhas; os títulos dos produtos dizem "suporte PCI").
- **Ordem de Motores** (15/10/2026, ditada por ele): Motores de Passo, Easy Servo, Servo Drive, Motores DC e Drivers e Controladores.
- **Ordem de CNC** (15/10/2026, ditada por ele): Parafusos, Porcas e Acessórios (era a 10) passa para logo acima de Máquinas (a 20), ficando 19; as outras mantêm a ordem.
- **Ordem de Placas Embarcadas** (15/10/2026, ditada por ele, "1, 2, 4, 3"): Placas Arduino, Placas ESP32, Placas STM32 e Placas Raspberry Pi, nessa sequência (01 a 04). Numa 1ª leitura eu tinha deixado o Raspberry Pi em 03; ele corrigiu.
- **Ajustes em Módulos e Sensores e Fontes** (15/10/2026, ditados por ele): Chaves Fim de Curso (era a 17) passa a logo abaixo de Transdutores Piezoelétricos (22) e Teclados Matriciais (era a 9) a logo acima de Eletroímãs e Válvulas Solenoide (23), as duas entre os Transdutores e os Eletroímãs, nessa sequência; **Painéis Solares** (a 26, com 1 produto, 220801) foi para o fim de Fontes e Conversores, como folha 05.
- **Ajustes de ordem em Componentes Eletrônicos** (15/10/2026, ditados por ele): Buzzers, Alto-falantes e Áudio (era a 13) passa a logo abaixo de Displays 7 Segmentos (10) e Filtros de Ferrite (era a 19) a logo abaixo de LEDs e Soquetes (9); as demais seguem na ordem que tinham. Depois, no mesmo dia, ele pediu "o item 10 fica acima do item 9": Filtros de Ferrite passou a logo ACIMA de LEDs e Soquetes (09 Filtros de Ferrite, 10 LEDs e Soquetes).

## Fusões aplicadas em 07/10/2026

Shields + Cases para Arduino; Optoacoplador + MOSFET e Dimmer (Módulos de Acionamento); Joysticks + Controle Remoto; Áudio foi para Buzzers e Alto-falantes; Distância + Infravermelho; Tensão + Corrente; Cor + Luz; Sinalizadores + Botoeiras 22mm; Relés SSR + Controladores de Temperatura; Hi-Link dentro de Fontes Chaveadas; Micro Servos + Brushless (Servos e Motores para Aeromodelismo); PWM + Ponte H; Válvulas + Eletroímãs; Roldanas + Polias; Brocas e Pinças + Fresas; Chaves Táteis + Gangorra (Chaves e Push Buttons); Solda + Ferramentas de Bancada.

## Próximo passo

Ajustes pontuais que o dono ditar (nome, produto trocando de folha) entram no CSV e aqui. Só então o script da Loja Integrada é escrito (criar as categorias pela API, reatribuir os 681 produtos que casam por SKU).
