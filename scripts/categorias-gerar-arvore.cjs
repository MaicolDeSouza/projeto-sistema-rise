// Gera docs/categorias-4hobby-arvore.csv (ordem das categorias da loja, por tipo) a partir do
// mapeamento por produto e da arvore ordenada abaixo, conferindo que os dois batem.
// Rodar: node scripts/categorias-gerar-arvore.cjs
const fs=require('fs');const path=require('path');const DOCS=path.join(__dirname,'..','docs');
const MAPA=path.join(DOCS,'categorias-4hobby-mapeamento.csv');
const SAIDA=path.join(DOCS,'categorias-4hobby-arvore.csv');
const txt=fs.readFileSync(MAPA,'utf8').replace(/^\uFEFF/,'');
const linhas=txt.split(/\r?\n/).filter(Boolean);const cab=linhas[0].split(';');
function parse(l){const out=[];let cur='',q=false;for(let i=0;i<l.length;i++){const c=l[i];if(q){if(c==='"'){if(l[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}else{if(c==='"')q=true;else if(c===';'){out.push(cur);cur='';}else cur+=c;}}out.push(cur);return out;}
const rows=linhas.slice(1).map(l=>{const v=parse(l);const o={};cab.forEach((c,i)=>o[c]=v[i]);return o;});
// ordem por tipo, definida em 14/10/2026 (pedido do dono: "resistor, diodos, transistor e assim por diante")
const ARVORE=[
 ['Placas Embarcadas','T_placas',['Placas Arduino','Placas ESP32','Placas STM32','Placas Raspberry Pi']],
 ['Módulos e Sensores','T_modulos',['Módulos Relé e Acionamento','Conversores de Sinais','Módulos Wireless e IoT','Antenas e Acessórios','Módulos RTC e Memória',['Shields para Embarcados','B_shield'],'Eletroímãs e Válvulas Solenoide','Pastilhas Peltier','Painéis Solares','Imãs de Neodímio','Sensores de Temperatura e Umidade','Sensores de Gás e Chama','Sensores de Luz e Cor','Sensores de Umidade do Solo e Chuva','Sensores de Distância e Proximidade','Sensores de Movimento e Vibração','Sensores Magnéticos Reed e Hall','Chaves Fim de Curso','Sensores de Corrente e Tensão','Sensores de Fluxo de Água','Sensores de Nível de Água','Células de Carga','Transdutores Piezoelétricos']],
 ['Displays e Telas','T_displays',['Telas Gráficas TFT','Displays LCD','Displays OLED','Displays 7 Segmentos e Matriz LED']],
 ['Componentes Eletrônicos','T_componentes',['Resistores','Potenciômetros e Trimpots','Capacitores','Cristais Osciladores','Filtros de Ferrite','Fusíveis','Diodos','Transistores e MOSFETs','Reguladores de Tensão','Circuitos Integrados','LEDs e Soquetes','Buzzers, Alto-falantes e Áudio','Chaves e Push Buttons','Conectores para PCB','Barras de Pinos','Terminais e Acessórios','Espaçadores e Isoladores','Fontes Chaveadas e Conversores DC-DC','Baterias e Acessórios']],
 ['Cabos e Conectores','T_cabos',['Fios e Cabos Elétricos','Cabos USB','Cabos HDMI','Conectores para Cabo e Painel','Adaptadores para Cabos']],
 ['Automação Industrial','T_automacao',['CLP','IHM','Inversores de Frequência','Controladores Industriais','Sensores Industriais','Encoders','Chaves e Botoeiras','Sinalizadores','Elétrica e Acessórios']],
 ['Motores','T_motores',['Motores de Passo','Easy Servo','Servo Drive','Motores DC','Drivers e Controladores']],
 ['CNC, Laser e Impressão 3D','T_cnc',['Perfis de Alumínio e Acessórios','Parafusos, Porcas e Acessórios','Fusos e Castanhas','Eixos e Guias Lineares','Mancais e Suportes de Eixo','Rolamentos e Pillow Block','Acoplamentos','Correias','Polias e Roldanas','Cremalheiras e Engrenagens','Esteiras Porta Cabos','Controladores CNC',['Motores de Passo e Servo Drive','H_motpasso'],['Drivers de Motor de Passo','H_drvpasso'],'Spindles','Fresas, Brocas e Pinças','Módulos Laser de Diodo','Peças para Laser CO2','Mesas Aquecidas e Extrusoras','Acessórios para Impressora 3D','Softwares']],
 ['Ferramentas e Prototipagem','T_ferramentas',['Protoboards e Placas Fenolite','Jumpers e Garras Jacaré','Termo Retrátil','Ferramentas e Solda','Instrumentos de Medição','Caixas Plásticas e Organizadores']],
 ['Kits Educacionais','T_kits',['Kits Arduino','Kits de Eletrônica e Robótica','Chassis e Rodas para Robótica']],
];
// chave e contagem de cada folha própria, a partir do mapeamento
const chaveDe={},qtd={};const secund={};
for(const r of rows){ if(r.nivel1==='NÃO PUBLICAR'||r.nivel1==='SEM CATEGORIA')continue; const k=r.nivel1+' > '+r.nivel2; qtd[k]=(qtd[k]||0)+1; if(chaveDe[k]&&chaveDe[k]!==r.chave) throw new Error('folha com 2 chaves: '+k+' '+chaveDe[k]+' '+r.chave); chaveDe[k]=r.chave; if(r.categoria_secundaria) secund[r.categoria_secundaria]=(secund[r.categoria_secundaria]||0)+1; }
const naArvore=new Set();// nome_na_li: a LI ordena o menu em ordem alfabetica (conferido no site em 14/10/2026), entao o nome na loja leva o
// numero de ordem com dois digitos; o nome limpo fica em 'folha'/'topo' (URL, titulo, Rise).
const naLi=(n,nome)=>String(n).padStart(2,'0')+' - '+nome;
const out=['ordem_topo;topo;chave_topo;ordem_folha;folha;chave;tipo;produtos_proprios;produtos_2a;nome_na_li'];
ARVORE.forEach(([topo,ct,folhas],ti)=>{
  out.push([ti+1,topo,ct,0,'','','topo',0,0,naLi(ti+1,topo)].join(';'));
  folhas.forEach((f,fi)=>{const nome=Array.isArray(f)?f[0]:f;const k=topo+' > '+nome;naArvore.add(k);
    const propria=!Array.isArray(f);const chave=propria?chaveDe[k]:f[1];
    if(propria&&!chave) throw new Error('folha da árvore sem produto no mapeamento: '+k);
    if(!propria&&qtd[k]) throw new Error('folha só de 2ª tem produto próprio: '+k);
    out.push([ti+1,topo,ct,fi+1,nome,chave,propria?'propria':'segunda',qtd[k]||0,secund[k]||0,naLi(fi+1,nome)].join(';'));
  });
});
for(const k of Object.keys(qtd)) if(!naArvore.has(k)) throw new Error('folha do mapeamento fora da árvore: '+k);
for(const k of Object.keys(secund)) if(!naArvore.has(k)) throw new Error('2ª categoria fora da árvore: '+k);
// linha do topo: tipo "topo"
const final=out;
fs.writeFileSync(SAIDA,'\uFEFF'+final.join('\r\n')+'\r\n');
const nTopos=ARVORE.length,nFolhas=ARVORE.reduce((a,[,,f])=>a+f.length,0),nSeg=ARVORE.reduce((a,[,,f])=>a+f.filter(Array.isArray).length,0);
console.log('ok: topos',nTopos,'| folhas',nFolhas,'(próprias',nFolhas-nSeg,', só 2ª',nSeg,') | linhas',final.length);
console.log('conferência: folhas no mapeamento',Object.keys(qtd).length,'| 2ª distintas',Object.keys(secund).length);
