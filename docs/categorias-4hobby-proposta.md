# Proposta de categorias da loja 4hobby (Loja Integrada)

Data: 06/10/2026. Base: 1.315 produtos do catálogo do Rise (importados do Bling), categoria atual de 672 deles lida do próprio site (fonte "4hobby" do bloco Mercados), menus de 8 concorrentes e as categorias dos 16 concorrentes coletados pelo Rise.

Arquivo companheiro: `docs/categorias-4hobby-mapeamento.csv` (1.315 linhas: sku, título, nível 1, nível 2, nível 3, chave, categoria atual no site, preço, estoque). É esse arquivo que o Rise vai ler quando a sessão "enviar produto à LI" existir.

## 1. Resumo

- O site hoje tem **6 categorias de topo e 59 folhas**, mas 784 produtos no ar contra **1.315 no catálogo**: 629 produtos vendáveis não têm lugar na árvore atual.
- A proposta é uma árvore de **10 categorias de topo, 2 níveis** (sem nível intermediário), **101 folhas**, todas com produto de verdade dentro (ver seção 4); os 4 serviços ficam publicados sem categoria.
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

## 4. Árvore final (refeita em 06, 07 e 14/10/2026)

A primeira versão desta seção tinha 76 folhas com nomes que listavam produtos diferentes ("Gás, Chama, Som, Luz e Cor"). O dono recusou esse desenho em 06/10/2026, e as folhas foram refeitas com **uma família de produto por folha**; as 17 fusões de folhas pequenas propostas depois foram aceitas em 07/10/2026. Em 14/10/2026 ele enxugou os topos (12 → 10), tirou o nível intermediário "Movimento Linear", criou o topo Kits Educacionais e o topo Cabos e Conectores e, por último, dissolveu Fontes e Baterias em Componentes Eletrônicos (10 topos). A árvore inteira, com as quantidades e as regras de nome, está em `categorias-4hobby-nomes.md`, e o CSV já a reflete.

Categorias de topo (10, com os produtos de hoje):

- Placas Embarcadas (88, em 4 folhas: Placas Arduino, Placas ESP32, Placas STM32, Placas Raspberry Pi)
- Módulos e Sensores (189, com Teclados Matriciais e a folha Conversores DC-DC, só de 2ª categoria: módulos em 6 folhas mais Pastilhas Peltier, Eletroímãs e Válvulas Solenoide, Imãs de Neodímio e Painéis Solares, sensores em 13, mais a folha Shields para Embarcados, que só recebe 2ª categoria)
- Displays e Telas (36, em 4 folhas por tipo de tela: Telas Gráficas TFT, Displays LCD, Displays OLED, Displays 7 Segmentos e Matriz LED)
- Componentes Eletrônicos (287, com Displays (só 2ª categoria, os 7 segmentos), Conectores para PCB, Barras de Pinos, Espaçadores e Isoladores, Fontes e Baterias (73, as duas folhas antigas juntas) e Terminais e Acessórios; Capacitores e Cristais Osciladores e Fusíveis e Filtros de Ferrite separados)
- Fios e Cabos (54, em 4 folhas: Fios e Cabos Elétricos, Cabos USB, Cabos HDMI, Adaptadores para Cabos)
- Automação Industrial (122, em 9 folhas: CLP, IHM, Chaves e Botoeiras, Sinalizadores, Controladores Industriais, Encoders, Elétrica e Acessórios, Sensores Industriais, Inversores de Frequência)
- Motores (82, em 5 folhas: Motores de Passo, Easy Servo, Servo Drive, Motores DC, Drivers e Controladores)
- CNC, Laser e Impressão 3D (368, em 19 folhas próprias mais 2 só de 2ª categoria para motores de passo/servo drive e drivers de passo: Controladores CNC, Parafusos, Porcas e Acessórios vinda de Ferramentas, porcas martelo em Perfis, Correias e Polias e Roldanas sem siglas, fusos e castanhas juntos, eixos e guias juntos, mancais e suportes juntos, perfis com cantoneiras e espaçadores, mesas aquecidas com extrusoras, Softwares sem os serviços; Máquinas e Equipamentos deixou de ser folha)
- Ferramentas e Prototipagem (60, com Jumpers e Garras Jacaré e Termo Retrátil; voltímetros dentro de Instrumentos de Medição; imãs e parafusos saíram)
- Kits Educacionais (11, com Chassis e Rodas para Robótica)

Total: 10 topos, dois níveis só e **101 folhas** (96 com produto próprio e cinco só de 2ª categoria); os 4 serviços ficam publicados sem categoria. Nenhuma folha "Outros"; 13 folhas ficam com 1 a 4 produtos de propósito, por serem famílias que o cliente procura pelo nome ou que vão crescer (Pastilhas Peltier, Painéis Solares, Imãs de Neodímio, Cristais Osciladores, Fusíveis, Filtros de Ferrite, Servo Drive, Displays OLED, Sinalizadores, Inversores de Frequência, Softwares, Kits Arduino, Kits de Eletrônica e Robótica). Com dois níveis e uma família por folha, Módulos e Sensores (28 folhas), CNC (28) e Componentes Eletrônicos (27) ficam com menu longo: é o custo das duas escolhas do dono.

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

**Decidido pelo dono em 06/10/2026, todas na opção recomendada:** 12 categorias de topo (7.1); três níveis em Movimento Linear (7.2); bombas em "Bombas, Válvulas e Solenoides" com Laser ou Spindles como segunda categoria, e o motor 775 em "Spindles, Inversores e Acessórios" (7.3 e 7.4); os 629 produtos fora do site entram todos na LI (7.6). A coluna `categoria_secundaria` do CSV já traz a segunda categoria dos 4 itens de 7.3. Folhas pequenas (7.5) ficam mantidas até aviso em contrário. Em aberto só a lista de itens individuais no fim desta seção.

**Revisto pelo dono em 14/10/2026:** 7.1 passou a **10 topos** (Módulos e Sensores num topo só; Conectores e Cabos dentro de Componentes Eletrônicos; Softwares e Serviços como folha única dentro de CNC; "Arduino, ESP32 e Embarcados" virou Placas Embarcadas; novo topo Kits Educacionais, com Kits Arduino e Kits de Eletrônica e Robótica). Displays e Telas, Motores e Robótica e Ferramentas e Prototipagem continuam no topo por escolha dele (Fontes e Baterias também ficou, até ele mandar dissolver no fim do dia) (a recomendação era fundir Displays em Módulos e Sensores e juntar Robótica com Kits). 7.2 passou à **opção 2, achatar**: as 12 folhas de Movimento Linear ficam direto em CNC. Cabos USB e Cabos HDMI (duas folhas) ficam no topo **Cabos e Conectores**, criado por ele na mesma data (fios e cabos, Cabos USB e Cabos HDMI com as extensões de painel dentro, Conectores para Cabo e Painel, Adaptadores para Cabos; terminais e abraçadeiras voltaram depois para Componentes); em Componentes Eletrônicos ficaram Conectores para PCB (JST, Dupont, KRE/KF) e Barras de Pinos; jumpers, garras jacaré e termo retrátil foram para Ferramentas e Prototipagem. Os 6 cabos HDMI têm Placas Raspberry Pi como 2ª categoria. Na mesma data ele reduziu **Placas Embarcadas a 4 folhas** (Placas Arduino, Placas ESP32, Placas STM32, Placas Raspberry Pi): shields, cases, interfaces com bornes e gravadores foram para a placa a que servem, e os shields e interfaces aparecem também em Módulos e Sensores > Shields para Embarcados (2ª categoria). E os módulos de Módulos e Sensores passaram de 14 a 6 folhas (Módulos Relé e Acionamento, Conversores de Sinais, Módulos Wireless e IoT, Antenas e Acessórios, Módulos RTC e Memória, mais a de shields), com os cartões micro SD em Placas Raspberry Pi; os 14 grupos de sensores não mudaram. Displays e Telas foi refeita por tipo de tela (Telas Gráficas TFT, com as Nextion e as de Raspberry; Displays LCD; Displays OLED; Displays 7 Segmentos e Matriz LED), sem folha própria para a Nextion. Automação Industrial passou a 8 folhas ditadas por ele (CLP e Expansões, IHM, Chaves e Botoeiras, Sinalizadores, Controladores Industriais, Encoders, Elétrica e Acessórios, Sensores Industriais com os indutivos e capacitivos vindos de Módulos e Sensores); Pastilhas Peltier foi para Módulos e Sensores. Espaçadores e Isoladores (de Ferramentas) e Pilhas e Baterias (de Fontes) foram para Componentes Eletrônicos, e no fim Fontes e Baterias deixou de ser topo: as 7 folhas foram inteiras para Componentes Eletrônicos, a única categoria onde a família toda cabe, ao lado de Pilhas e Baterias. Motores e Robótica virou Motores (5 folhas; mini bombas em Motores DC; eletroímãs e válvulas em Módulos e Sensores; chassis e rodas em Kits Educacionais) e o inversor de frequência avulso foi para Automação Industrial. CNC passou a 19 folhas (fusos e castanhas juntos, eixos e guias juntos, mancais e suportes juntos, perfis com cantoneiras e espaçadores, mesas aquecidas com extrusoras); Suportes de Motor de Passo foi para Motores; Máquinas e Equipamentos deixou de ser folha (as 8 máquinas foram para a família mais próxima); os 4 serviços saíram de Softwares e ficam publicados sem categoria. Imãs de Neodímio foi para Módulos e Sensores e Parafusos, Buchas e Fixação para CNC (ferragem de máquina). Em Componentes, Pilhas e Baterias virou Baterias e Acessórios (com suportes, níquel, BMS e carregadores), Fontes Chaveadas somou com os conversores DC-DC, o painel solar foi para Módulos e Sensores e os voltímetros para Ferramentas e Prototipagem, dentro de Instrumentos de Medição. Motores ficou com 5 folhas (Motores de Passo com os suportes, Easy Servo, Servo Drive, Motores DC com os micro servos e motores de aeromodelismo, Drivers e Controladores); em CNC, Correias e Polias e Roldanas sem siglas, porcas martelo em Perfis de Alumínio e Acessórios e Parafusos, Porcas e Acessórios com excêntricas e espaçadores de alumínio. Em Componentes, Capacitores e Cristais Osciladores e Fusíveis e Filtros de Ferrite foram separados, os interruptores entraram em Chaves e Push Buttons e as tomadas de painel e abraçadeiras foram para Elétrica e Acessórios, em Automação. Motores de passo, servo drives e drivers de passo aparecem também em CNC (2ª categoria), em duas folhas só para isso; o gerador de pulso em Controladores CNC (ex-Placas Controladoras CNC). Em 15/10/2026: Teclados Matriciais ganhou folha em Módulos e Sensores; o topo Cabos e Conectores virou Fios e Cabos (os conectores de cabo e painel foram para Automação > Elétrica e Acessórios); e Componentes ganhou a folha Displays (só 2ª categoria) com os 7 segmentos, que também ficam em Displays e Telas; Baterias e Acessórios foi para dentro de Fontes (folha Fontes e Baterias, 73 produtos); e os conversores DC-DC aparecem também em Módulos e Sensores (folha Conversores DC-DC, só 2ª categoria); e os suportes de PCI para trilho DIN saíram de Automação para a folha nova Suportes para PCI, em Componentes. Árvore em `categorias-4hobby-nomes.md`.

**7.1 Tamanho do menu**
- **Opção 1 (recomendada): 12 categorias de topo**, como na seção 4. Displays e Telas fica no topo porque a linha Nextion (18 itens, ticket de R$ 400 a R$ 1.350) merece um clique só; Softwares e Serviços fica no topo porque o site já tem "Serviços" e são itens de natureza diferente.
- Opção 2: 10 categorias. Displays e Telas vira subcategoria de Placas e Embarcados; Softwares e Serviços vira subcategoria de CNC. Menu mais curto, Nextion a dois cliques.

**7.2 Terceiro nível em Movimento Linear**
- **Opção 1 (recomendada): manter** (CNC > Movimento Linear > Fusos e Castanhas). São 166 produtos em 12 famílias; sem o nível intermediário, CNC teria 27 subcategorias lado a lado. O site atual já usa 3 níveis em CNC > Mecânica, então a LI aceita.
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

- **Categorias do Bling e da LI são independentes, sem vínculo, e o dono quer que continue assim** (decisão de 06/10/2026). O Rise cuida das categorias **direto na API da Loja Integrada**, com o Personal Token que a integração em andamento já usa; o Bling não entra nessa parte.
- **O que a API da LI permite, conforme a especificação oficial** (`api-docs.lojaintegrada.com.br`, OpenAPI "API Loja Integrada v2", lida em 06/10/2026): `POST /v1/categoria` cria (campos `nome`, obrigatório; `descricao`; `categoria_pai`, o id da categoria pai para subcategoria; `id_externo`, um id nosso para depois buscar e alterar por ele); `GET /v1/categoria` lista com paginação; `GET` e `PUT /v1/categoria/{id}` leem e alteram (`nome`, `categoria_pai`). **Não existe DELETE para categoria**: excluir uma categoria é só pelo painel da LI. Leitura real feita em 06/10/2026: a loja tem **124 categorias** hoje, com os campos `id`, `id_externo`, `categoria_pai`, `descricao`, `nome`, `seo`, `url`.
- **Consequência para a migração:** o Rise pode criar as 10 categorias de topo e as 101 folhas pela API, na ordem por tipo gravada em `categorias-4hobby-arvore.csv` (a API não tem campo de ordem e o menu da loja é alfabético, conferido no site em 14/10/2026; por isso o nome gravado na LI leva o número de ordem com dois dígitos, coluna `nome_na_li`, criando com o nome limpo e renomeando depois para a URL ficar limpa),, gravando o SKU/chave nosso em `id_externo`, e pode **renomear e mover** categorias existentes (PUT em `categoria_pai`) para reaproveitar as 124 atuais em vez de criar tudo do zero. O que sobrar sem uso é apagado à mão no painel. A escrita fica atrás da trava `LOJA_INTEGRADA_WRITE_ENABLED`, hoje `false`.
- **No Rise não existe campo de categoria em `Produto`** (conferido no `schema.prisma`). A sessão de envio vai precisar de uma tabela de categorias (árvore com pai, nome, ordem, id na LI, `id_externo`) e de um campo no produto apontando para a folha. O CSV deste trabalho já é o conteúdo inicial dessa tabela e desse campo.
- **Mais de uma categoria por produto**: a LI aceita (o produto tem a lista `categorias`); a segunda categoria dos itens da seção 7.3 vai pela API junto com o produto.
- **URLs antigas**: as categorias atuais têm URL própria e já estão no Google. Ao criar as novas, conferir se o painel da LI oferece redirecionamento 301; se não, manter as antigas ocultas (sem link no menu) por alguns meses em vez de apagar.
- **Nome sem número e com acento** nos dois sistemas. A ordem do menu vai no campo de ordenação da LI.
- **Títulos fora do padrão** (seção 6) passam pelo padronizador do Rise antes de ir para a LI.

## 9. Fontes

- Catálogo: tabela `Produto` do Rise (1.315 linhas, 06/10/2026).
- Categoria atual: tabela `ProdutoColetado`, fonte "4hobby" (702 produtos, 672 batem com SKU do catálogo).
- Menus dos concorrentes lidos em 06/10/2026: eletrogate.com, usinainfo.com.br, casadarobotica.com, smartkits.com.br, curtocircuito.com.br, impactocnc.com, robocore.net, eletruscomp.com.br. Folhas dos 16 concorrentes coletados: tabela `ProdutoColetado`, campo `categoria`.
- Bling e Loja Integrada: Central de Ajuda do Bling, artigos da integração com a Loja Integrada (vínculo de categorias). Ponto a confirmar no painel.
- Classificação: script `classificar.cjs` (regras por palavra do título e por família de SKU; a sua numeração de SKU já agrupa por família) e revisão manual dos 1.315 itens, com 57 correções.
