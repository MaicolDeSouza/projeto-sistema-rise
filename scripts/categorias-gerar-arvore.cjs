// Gera docs/categorias-4hobby-arvore.csv (ordem das categorias da loja, por tipo) a partir do
// mapeamento por produto e da arvore ordenada abaixo, conferindo que os dois batem.
// Rodar: node scripts/categorias-gerar-arvore.cjs
const fs=require('fs');const path=require('path');const DOCS=path.join(__dirname,'..','docs');
const MAPA=path.join(DOCS,'categorias-4hobby-mapeamento.csv');
const SAIDA=path.join(DOCS,'categorias-4hobby-arvore.csv');
const LISTA=path.join(DOCS,'categorias-4hobby-produtos.md'); // arvore com os produtos de cada folha, para o dono conferir
const txt=fs.readFileSync(MAPA,'utf8').replace(/^\uFEFF/,'');
const linhas=txt.split(/\r?\n/).filter(Boolean);const cab=linhas[0].split(';');
function parse(l){const out=[];let cur='',q=false;for(let i=0;i<l.length;i++){const c=l[i];if(q){if(c==='"'){if(l[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}else{if(c==='"')q=true;else if(c===';'){out.push(cur);cur='';}else cur+=c;}}out.push(cur);return out;}
const rows=linhas.slice(1).map(l=>{const v=parse(l);const o={};cab.forEach((c,i)=>o[c]=v[i]);return o;});
// ordem por tipo, definida em 14/10/2026 (pedido do dono: "resistor, diodos, transistor e assim por diante")
const ARVORE=[
 // criterio (dono, 15/10/2026): familias principais primeiro, as vizinhas logo em seguida, as pequenas e os acessorios no fim
 ['Placas Embarcadas','T_placas',['Placas Arduino','Placas ESP32','Placas STM32','Placas Raspberry Pi']],
 ['Módulos e Sensores','T_modulos',[['Shields para Embarcados','B_shield'],'Módulos Wireless e IoT','Antenas e Acessórios','Módulos RTC e Memória','Módulos Relé e Acionamento','Conversores de Sinais',['Conversores DC-DC','B_dcdc'],['Módulos BMS para Bateria','B_bms'],'Sensores de Temperatura e Umidade','Sensores de Distância e Proximidade','Sensores de Corrente e Tensão','Sensores de Gás e Chama','Sensores de Luz e Cor','Sensores de Movimento e Vibração','Sensores Magnéticos Reed e Hall','Sensores de Fluxo de Água','Sensores de Nível de Água','Sensores de Umidade do Solo e Chuva','Células de Carga','Transdutores Piezoelétricos','Chaves Fim de Curso','Teclados Matriciais','Eletroímãs e Válvulas Solenoide','Pastilhas Peltier','Imãs de Neodímio']],
 ['Displays e Telas','T_displays',['Telas Gráficas TFT','Displays LCD','Displays OLED','Displays e Matriz de LED']],
 ['Componentes Eletrônicos','T_componentes',['Resistores','Diodos','Capacitores','Transistores e MOSFETs','Circuitos Integrados','Reguladores de Tensão','Potenciômetros e Trimpots','Cristais Osciladores','Filtros de Ferrite','LEDs e Soquetes',['Displays 7 Segmentos','I_disp'],'Buzzers, Alto-falantes e Áudio','Barras de Pinos','Fusíveis','Chaves e Push Buttons','Plugs e Conectores','Terminais e Acessórios','Espaçadores e Isoladores','Suportes para PCB','Lasers Sinalizadores',['Caixas Plásticas e Organizadores','I_caixa']]],
 ['Fontes e Conversores','T_fontes',['Fontes Chaveadas',['Transformadores','F_trafo','reservada'],'Conversores DC-DC','Baterias e Acessórios','Painéis Solares']],
 ['Fios e Cabos','T_cabos',['Fios e Cabos Elétricos','Cabos USB','Cabos HDMI','Adaptadores para Cabos']],
 ['Automação Industrial','T_automacao',['CLP','IHM','Controladores Industriais','Inversores de Frequência','Sensores Industriais','Encoders','Componentes Elétricos']],
 ['Motores','T_motores',['Motores de Passo','Easy Servo','Servo Drive','Motores DC','Drivers e Controladores']],
 ['CNC / Laser / 3D','T_cnc',['Fusos e Castanhas','Eixos e Guias Lineares','Rolamentos e Pillow Block','Mancais e Suportes de Eixo','Acoplamentos','Correias','Polias e Roldanas','Cremalheiras e Engrenagens','Perfis de Alumínio e Acessórios','Esteiras Porta Cabos','Controladores CNC',['Motores e Drivers','H_motdrv'],'Spindles','Fresas, Brocas e Pinças','Módulos Laser de Diodo','Peças para Laser CO2','Mesas Aquecidas e Extrusoras','Acessórios para Impressora 3D','Parafusos, Porcas e Acessórios','Máquinas','Softwares']],
 ['Prototipagem','T_ferramentas',['Protoboards e Placas Fenolite','Jumpers e Garras Jacaré','Ferramentas e Solda','Instrumentos de Medição','Caixas Plásticas e Organizadores','Termo Retrátil']],
 ['Kits Educacionais','T_kits',['Kits Arduino','Kits de Eletrônica e Robótica']],
];
// chave e contagem de cada folha própria, a partir do mapeamento
const chaveDe={},qtd={};const secund={};
for(const r of rows){ if(r.nivel1==='NÃO PUBLICAR'||r.nivel1==='SEM CATEGORIA')continue; const k=r.nivel1+' > '+r.nivel2; qtd[k]=(qtd[k]||0)+1; if(chaveDe[k]&&chaveDe[k]!==r.chave) throw new Error('folha com 2 chaves: '+k+' '+chaveDe[k]+' '+r.chave); chaveDe[k]=r.chave; if(r.categoria_secundaria) secund[r.categoria_secundaria]=(secund[r.categoria_secundaria]||0)+1; }
const naArvore=new Set();// nome_na_li: a LI ordena o menu em ordem alfabetica (conferido no site em 14/10/2026), entao o nome na loja leva o
// numero de ordem com dois digitos; o nome limpo fica em 'folha'/'topo' (URL, titulo, Rise).
const naLi=(n,nome)=>String(n).padStart(2,'0')+' - '+nome;
const out=['ordem_topo;topo;chave_topo;ordem_folha;folha;chave;tipo;produtos_proprios;produtos_2a;nome_na_li'];
ARVORE.forEach(([topo,ct,folhas],ti)=>{
  out.push([ti+1,topo,ct,0,'','','topo',0,0,topo].join(';'));// o topo vai SEM numero (pedido do dono em 15/10/2026: o menu de topo na LI e ordenado a mao pelo painel; so as folhas levam o numero)
  folhas.forEach((f,fi)=>{const nome=Array.isArray(f)?f[0]:f;const k=topo+' > '+nome;naArvore.add(k);
    const tipoF=Array.isArray(f)?(f[2]==='reservada'?'reservada':'segunda'):'propria';const chave=tipoF==='propria'?chaveDe[k]:f[1];
    if(tipoF==='propria'&&!chave) throw new Error('folha da árvore sem produto no mapeamento: '+k);
    if(tipoF==='segunda'&&qtd[k]) throw new Error('folha só de 2ª tem produto próprio: '+k);
    if(tipoF==='reservada'&&(qtd[k]||secund[k])) throw new Error('folha reservada já tem produto: '+k);
    out.push([ti+1,topo,ct,fi+1,nome,chave,tipoF,qtd[k]||0,secund[k]||0,naLi(fi+1,nome)].join(';'));
  });
});
for(const k of Object.keys(qtd)) if(!naArvore.has(k)) throw new Error('folha do mapeamento fora da árvore: '+k);
for(const k of Object.keys(secund)) if(!naArvore.has(k)) throw new Error('2ª categoria fora da árvore: '+k);
// linha do topo: tipo "topo"
const final=out;
fs.writeFileSync(SAIDA,'\uFEFF'+final.join('\r\n')+'\r\n');
// lista de conferencia: cada folha com os produtos (SKU e titulo), na ordem da arvore; 2a categoria marcada
const md=['# Categorias da loja 4hobby com os produtos de cada folha','','Gerado por scripts/categorias-gerar-arvore.cjs a partir de categorias-4hobby-mapeamento.csv. Nome como vai na LI; entre parenteses, a quantidade. Produto marcado com (2a) mora em outra folha e aparece aqui tambem.',''];
ARVORE.forEach(([topo,,folhas],ti)=>{
  md.push('## '+naLi(ti+1,topo));
  folhas.forEach((f,fi)=>{
    const nome=Array.isArray(f)?f[0]:f;const k=topo+' > '+nome;
    const prop=rows.filter(r=>r.nivel1===topo&&r.nivel2===nome);
    const seg=rows.filter(r=>r.categoria_secundaria===k);
    md.push('','### '+naLi(fi+1,nome)+' ('+(prop.length+seg.length)+')'+(Array.isArray(f)&&f[2]==='reservada'?' - reservada, sem produto hoje':''),'');
    for(const r of prop) md.push('- '+r.sku+' '+r.titulo);
    for(const r of seg) md.push('- '+r.sku+' '+r.titulo+' (2a, fica em '+r.nivel2+')');
  });
  md.push('');
});
const semCat=rows.filter(r=>r.nivel1==='SEM CATEGORIA'),naoPub=rows.filter(r=>r.nivel1==='N\u00C3O PUBLICAR');
md.push('## Publicados sem categoria ('+semCat.length+')','');
for(const r of semCat) md.push('- '+r.sku+' '+r.titulo);
md.push('','## Fora do site ('+naoPub.length+')','');
for(const r of naoPub) md.push('- '+r.sku+' '+r.titulo);
fs.writeFileSync(LISTA,md.join('\n')+'\n');
const nTopos=ARVORE.length,nFolhas=ARVORE.reduce((a,[,,f])=>a+f.length,0),nSeg=ARVORE.reduce((a,[,,f])=>a+f.filter(x=>Array.isArray(x)&&x[2]!=='reservada').length,0),nRes=ARVORE.reduce((a,[,,f])=>a+f.filter(x=>Array.isArray(x)&&x[2]==='reservada').length,0);
console.log('ok: topos',nTopos,'| folhas',nFolhas,'(próprias',nFolhas-nSeg-nRes,', só 2ª',nSeg,', reservadas',nRes,') | linhas',final.length);
console.log('conferência: folhas no mapeamento',Object.keys(qtd).length,'| 2ª distintas',Object.keys(secund).length);
