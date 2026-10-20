import "dotenv/config";

/**
 * Move para a arvore nova os produtos que SO existem na Loja Integrada (nao estao no Rise) e ficaram
 * nas categorias antigas, e desliga os 4 servicos de "Servicos" (decisao do dono em 15/10/2026), para as
 * categorias antigas poderem ser apagadas no painel.
 *
 *   node scripts/categorias-li-orfaos.js                       # SIMULACAO (le a LI, nada e gravado)
 *   LI_ESCRITA=true LI_ESCRITA_CODIGOS=<skus> node scripts/categorias-li-orfaos.js --executar
 *
 * Mesmo molde do `categorias-li-enviar.js`: backup das categorias de antes em dados/backup/, so mexe em
 * `categorias` (GET -> PUT do produto inteiro sem as chaves so de leitura), trava aberta so na linha de comando.
 * Os destinos sao a lista abaixo (aprovada pelo dono). Os flanges 121109_5 e 121109_635 sao variacao e a LI
 * recusa categoria neles, entao ficam de fora.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const fs = await import("node:fs");
const path = await import("node:path");
const { clienteLI } = await import("../src/lib/canaisDeVenda/li/cliente.js");
const { CHAVES_SO_LEITURA } = await import("../src/lib/canaisDeVenda/li/corpo.js");
const { paginarLojaIntegrada } = await import("../src/lib/integracoes/lojaIntegrada/paginacao.js");

const EXECUTAR = process.argv.includes("--executar");

// SKU -> [principal, 2a (opcional)], no formato "Topo > Folha" do arquivo da arvore.
const P = "Placas Embarcadas";
const M = "Módulos e Sensores";
const DESTINOS = {
  "110401": [`${P} > Placas Raspberry Pi`],
  "170108": [`${P} > Placas ESP32`, `${M} > Shields para Embarcados`],
  "170111": [`${P} > Placas ESP32`, `${M} > Shields para Embarcados`],
  "970101": [`${P} > Placas ESP32`, `${M} > Shields para Embarcados`],
  "970102": [`${P} > Placas ESP32`, `${M} > Shields para Embarcados`],
  "970105": [`${P} > Placas ESP32`, `${M} > Shields para Embarcados`],
  "970107": [`${P} > Placas ESP32`, `${M} > Shields para Embarcados`],
  "260105": [`${P} > Placas STM32`, `${M} > Shields para Embarcados`],
  "100238": [`${M} > Módulos Relé e Acionamento`],
  "200508": [`${M} > Módulos Relé e Acionamento`],
  "200105": [`${M} > Conversores de Sinais`],
  "200503": [`${M} > Conversores de Sinais`],
  "200512": [`${M} > Conversores de Sinais`],
  "900203": ["Componentes Eletrônicos > Barras de Pinos"],
  "229809": ["Fontes e Conversores > Baterias e Acessórios"],
  "930206": ["Fios e Cabos > Adaptadores para Cabos"],
  "930218": ["Fios e Cabos > Cabos USB", "Fios e Cabos > Cabos HDMI"],
  "930604": ["Fios e Cabos > Cabos USB"],
  "121401": ["Automação Industrial > Encoders"],
  // Chaves e Botoeiras virou parte de Componentes Elétricos em 20/10/2026 (pedido do dono).
  "910602": ["Automação Industrial > Componentes Elétricos"],
  "120126": ["Motores > Drivers e Controladores", "CNC / Laser / 3D > Motores e Drivers"],
  "120330": ["CNC / Laser / 3D > Fusos e Castanhas"],
  "121032": ["CNC / Laser / 3D > Fusos e Castanhas"],
  "120734": ["CNC / Laser / 3D > Polias e Roldanas"],
  "120815": ["CNC / Laser / 3D > Correias"],
  "120902": ["CNC / Laser / 3D > Fresas, Brocas e Pinças"],
  "120926": ["CNC / Laser / 3D > Fresas, Brocas e Pinças"],
  "121075": ["CNC / Laser / 3D > Perfis de Alumínio e Acessórios"],
  "122407": ["CNC / Laser / 3D > Spindles"],
  "990204": ["CNC / Laser / 3D > Polias e Roldanas"],
  // os 4 servicos: sem categoria
  "999903": [],
  "999905": [],
  "999906": [],
  "999907": [],
};
// `--so=910602,121401` restringe a rodada a esses SKUs (a lista inteira reescreveria produtos ja certos).
const soEstes = (process.argv.find((a) => a.startsWith("--so=")) ?? "").replace("--so=", "").split(",").map((s) => s.trim()).filter(Boolean);
for (const sku of soEstes) if (!(sku in DESTINOS)) throw new Error(`--so: SKU ${sku} nao esta na lista de DESTINOS`);
const SKUS = soEstes.length ? soEstes : Object.keys(DESTINOS);

const idDaUri = (uri) => String(uri ?? "").split("/").filter(Boolean).at(-1) ?? null;
const semNumero = (nome) => String(nome ?? "").replace(/^\d{2} - /, "");
const cliente = clienteLI();

async function todos(caminho) {
  const itens = [];
  for await (const pagina of paginarLojaIntegrada({ cliente, caminho, params: { limit: 100 } })) itens.push(...pagina.objetos);
  return itens;
}

const [categorias, produtos] = await Promise.all([todos("/categoria"), todos("/produto")]);
const porId = new Map(categorias.map((c) => [String(c.id), c]));

// "Topo > Folha" -> ids [folha, topo] na LI (a mais antiga se houver repetida)
function resolver(texto) {
  const [topoNome, folhaNome] = texto.split(" > ");
  const topos = categorias.filter((c) => !c.categoria_pai && semNumero(c.nome) === topoNome && !/^ZZ/.test(c.nome)).sort((a, b) => a.id - b.id);
  for (const topo of topos) {
    const folha = categorias.filter((c) => idDaUri(c.categoria_pai) === String(topo.id) && semNumero(c.nome) === folhaNome).sort((a, b) => a.id - b.id)[0];
    if (folha) return [String(folha.id), String(topo.id)];
  }
  throw new Error(`categoria nova nao encontrada na LI: "${texto}"`);
}

const plano = [];
for (const sku of SKUS) {
  const vivos = produtos.filter((p) => String(p.sku).trim().toLowerCase() === sku && !p.removido);
  if (vivos.length !== 1) throw new Error(`SKU ${sku}: ${vivos.length} produtos vivos na LI`);
  const p = vivos[0];
  if (p.tipo === "atributo_opcao") throw new Error(`SKU ${sku} e variacao: nao pode ser movido`);
  const novas = [...new Set(DESTINOS[sku].flatMap(resolver))];
  plano.push({ sku, id: p.id, nome: p.nome, antes: (p.categorias ?? []).map((u) => porId.get(idDaUri(u))?.nome ?? u), antesUris: p.categorias ?? [], novas });
}

console.log(`=== ${EXECUTAR ? "EXECUTAR" : "SIMULAÇÃO (nada será gravado)"}: ${plano.length} produtos ===`);
for (const x of plano) {
  console.log(`${x.sku.padEnd(8)} ${x.nome.slice(0, 50).padEnd(50)} | de: ${x.antes.slice(-2).join(" > ") || "(nenhuma)"} -> ${x.novas.length ? x.novas.map((id) => porId.get(id).nome).join(" + ") : "(sem categoria)"}`);
}

if (!EXECUTAR) {
  console.log("\nSIMULAÇÃO: nada foi gravado. Para executar: --executar com a trava aberta na linha de comando.");
  process.exit(0);
}

const lista = String(process.env.LI_ESCRITA_CODIGOS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
if (process.env.LI_ESCRITA !== "true" || !lista.length || lista.some((s) => !SKUS.includes(s))) {
  console.error("\nRECUSADO: LI_ESCRITA=true e LI_ESCRITA_CODIGOS só com os SKUs deste script (lista vazia libera todos).");
  process.exit(3);
}

function semSoLeitura(objeto) {
  return Object.fromEntries(Object.entries(objeto ?? {}).filter(([k]) => !CHAVES_SO_LEITURA.has(k)));
}

fs.mkdirSync("dados/backup", { recursive: true });
const arquivo = path.join("dados/backup", `li-categorias-orfaos-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}.json`);
const backup = { geradoEm: new Date().toISOString(), produtos: plano.map((x) => ({ id: x.id, sku: x.sku, categoriasAntes: x.antesUris })) };
fs.writeFileSync(arquivo, JSON.stringify(backup, null, 1));

let gravados = 0;
const falhas = [];
for (const x of plano) {
  try {
    cliente.exigirEscrita(x.sku);
    const g = await cliente.get(`/produto/${x.id}`, { descricao_completa: 1 });
    if (!g?.ok) throw new Error(`GET HTTP ${g?.status}`);
    const corpo = { ...semSoLeitura(g.dados), categorias: x.novas.map((id) => `/api/v1/categoria/${id}`) };
    const r = await cliente.put(`/produto/${x.id}`, corpo);
    if (!r?.ok) throw new Error(`PUT HTTP ${r?.status} ${JSON.stringify(r?.dados)?.slice(0, 200)}`);
    gravados += 1;
  } catch (erro) {
    falhas.push({ sku: x.sku, erro: String(erro.message ?? erro) });
    console.error(`  ${x.sku}: FALHOU: ${erro.message ?? erro}`);
    if (falhas.length >= 3) { console.error("  3 falhas: parando."); break; }
  }
}
console.log(`\nGravados: ${gravados} de ${plano.length} | falhas: ${falhas.length}\nBackup: ${arquivo}`);

// conferencia: leitura nova
const depois = await todos("/produto");
let certos = 0;
for (const x of plano) {
  const p = depois.find((q) => q.id === x.id);
  const ids = new Set((p?.categorias ?? []).map(idDaUri));
  if (ids.size === x.novas.length && x.novas.every((id) => ids.has(id))) certos += 1;
  else console.log(`  ${x.sku}: categorias na LI = ${[...ids].join(",") || "(nenhuma)"} (esperado ${x.novas.join(",") || "nenhuma"})`);
}
console.log(`Conferência na LI: ${certos} de ${plano.length} produtos com as categorias esperadas.`);
process.exit(falhas.length ? 1 : 0);
