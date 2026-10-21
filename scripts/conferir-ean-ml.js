/**
 * Lista os produtos com EAN suspeito (pedido do dono em 21/10/2026, opcao 1): formato errado, digito verificador que nao
 * confere, codigo do produto completado com zeros, ou EAN que no catalogo do Mercado Livre e de OUTRO produto. So
 * leitura (no banco e no ML); imprime a lista e nao grava nada. Mesmas regras do aviso do cadastro
 * (`src/lib/eanNoMercadoLivre.js`, `canaisDeVenda/ml/eanNoCatalogo.js`).
 *
 * NA VPS (o token do ML e o da producao; o arquivo viaja pela entrada do comando e nao fica la):
 *
 *   ssh -i ~/.ssh/rise_vps rise@179.199.150.221 \
 *     "cd /srv/rise/app && docker compose exec -T app node --input-type=module -" < scripts/conferir-ean-ml.js
 *
 * No PC: `node scripts/conferir-ean-ml.js` (precisa do ML conectado no Rise do PC).
 */
import { existsSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const RAIZ = existsSync("/app/scripts/resolver-alias.js") ? "/app" : process.cwd();
if (RAIZ !== "/app") await import("dotenv/config");
register(pathToFileURL(`${RAIZ}/scripts/resolver-alias.js`), pathToFileURL(`${RAIZ}/`));

const { prisma } = await import(pathToFileURL(`${RAIZ}/src/lib/db.js`).href);
const { clienteML } = await import(pathToFileURL(`${RAIZ}/src/lib/canaisDeVenda/ml/cliente.js`).href);
const { conferirEanNoML } = await import(pathToFileURL(`${RAIZ}/src/lib/canaisDeVenda/ml/eanNoCatalogo.js`).href);

const produtos = await prisma.produto.findMany({
  where: { ean: { not: null }, NOT: [{ ean: "" }, { sku: { startsWith: "ZZ" } }] },
  select: { sku: true, tituloBase: true, ean: true, ativo: true },
  orderBy: { sku: "asc" },
});

const cliente = clienteML();
const suspeitos = [];
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
// O ML responde 429 a rajadas (medido em 21/10/2026: 2 em 400 consultas seguidas). Pausa curta entre as consultas e,
// no fim, uma segunda volta mais lenta so para quem ficou sem resposta.
async function conferirLista(lista, pausaMs) {
  const falharam = [];
  for (const [posicao, produto] of lista.entries()) {
    const { aviso, semConsulta } = await conferirEanNoML(cliente, { ean: produto.ean, sku: produto.sku, titulo: produto.tituloBase });
    if (semConsulta) falharam.push(produto);
    if (aviso) suspeitos.push({ ...produto, aviso });
    if ((posicao + 1) % 100 === 0) console.error(`... ${posicao + 1} de ${lista.length}`);
    await esperar(pausaMs);
  }
  return falharam;
}
let semResposta = await conferirLista(produtos, 300);
if (semResposta.length > 0) {
  console.error(`... ${semResposta.length} sem resposta; nova tentativa em 30 s`);
  await esperar(30_000);
  semResposta = await conferirLista(semResposta, 1500);
}
const semConsulta = semResposta.length;

const ROTULO = { formato: "FORMATO", digito: "DIGITO", interno: "COM ZEROS", outro: "OUTRO PRODUTO NO ML" };
console.log(`Conferidos: ${produtos.length} produtos com EAN. Suspeitos: ${suspeitos.length}. Sem resposta do ML: ${semConsulta}.\n`);
for (const tipo of Object.keys(ROTULO)) {
  const doTipo = suspeitos.filter((item) => item.aviso.tipo === tipo);
  if (doTipo.length === 0) continue;
  console.log(`== ${ROTULO[tipo]} (${doTipo.length})`);
  for (const item of doTipo) {
    const noMl = item.aviso.itens?.map((outro) => `${outro.nome} (${outro.id})`).join(" | ") ?? "";
    console.log(`${item.sku}\t${item.ean}\t${item.ativo ? "" : "[inativo] "}${item.tituloBase}${noMl ? `\t-> ${noMl}` : ""}`);
  }
  console.log("");
}
await prisma.$disconnect();
