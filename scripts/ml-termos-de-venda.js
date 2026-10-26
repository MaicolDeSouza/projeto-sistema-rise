/**
 * Garantia e prazo de disponibilidade dos anuncios do ML que o Rise publicou (pedido do dono em 26/10/2026: garantia de
 * 3 meses e prazo de 1 dia nos que ja estao no ar). Os termos de venda (`sale_terms`) so iam no Publicar; o "Enviar
 * mudancas ao ML" nao os manda, entao anuncio publicado antes de 26/10/2026 ficou com o que o ML pos.
 *
 *   ler                     so consulta: o que cada anuncio tem no ML hoje (nada e gravado)
 *   aplicar [--so=SKU]      manda WARRANTY_TYPE (garantia do vendedor), WARRANTY_TIME e MANUFACTURING_TIME. Sem --so,
 *                           um por vez, parando no primeiro que o ML recusar. Passa pelas travas de escrita do ML.
 *
 * NA VPS (o token do ML e o da producao; o arquivo viaja pela entrada do comando e nao fica la):
 *
 *   ssh -i ~/.ssh/rise_vps rise@179.199.150.221 \
 *     "cd /srv/rise/app && docker compose exec -T app node --input-type=module - ler" < scripts/ml-termos-de-venda.js
 */
import { existsSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const RAIZ = existsSync("/app/scripts/resolver-alias.js") ? "/app" : process.cwd();
if (RAIZ !== "/app") await import("dotenv/config");
register(pathToFileURL(`${RAIZ}/scripts/resolver-alias.js`), pathToFileURL(`${RAIZ}/`));

const { prisma } = await import(pathToFileURL(`${RAIZ}/src/lib/db.js`).href);
const { clienteML } = await import(pathToFileURL(`${RAIZ}/src/lib/canaisDeVenda/ml/cliente.js`).href);
const { GARANTIA_DO_VENDEDOR } = await import(pathToFileURL(`${RAIZ}/src/lib/canaisDeVenda/ml/payload.js`).href);

const MESES = 3;
const DIAS = 1;
const [modo = "ler", ...resto] = process.argv.slice(1).filter((arg) => arg === "ler" || arg === "aplicar" || arg.startsWith("--"));
const soSku = resto.find((arg) => arg.startsWith("--so="))?.slice(5) ?? null;

const anuncios = await prisma.anuncio.findMany({
  where: { canal: "MERCADO_LIVRE", status: "PUBLICADO", idExterno: { not: null }, situacaoCanal: { not: "ENCERRADA" } },
  select: { id: true, idExterno: true, situacaoCanal: true, dados: true, produto: { select: { sku: true, garantiaMeses: true } } },
  orderBy: { id: "asc" },
});
const lista = soSku ? anuncios.filter((anuncio) => anuncio.produto?.sku === soSku) : anuncios;
console.log(`Anuncios publicados pelo Rise e nao encerrados: ${anuncios.length}${soSku ? ` (filtrando ${soSku}: ${lista.length})` : ""}.\n`);

const ml = clienteML();
const termosDe = (item) =>
  (Array.isArray(item?.sale_terms) ? item.sale_terms : [])
    .map((termo) => `${termo.id}=${termo.value_name ?? termo.value_id}`)
    .join(" | ") || "(nenhum)";

async function lerNoML(ids) {
  const resposta = await ml.get("/items/bulk", { ids: ids.join(","), attributes: "body.id,body.status,body.sub_status,body.sale_terms" });
  if (!resposta?.ok || !Array.isArray(resposta.dados)) throw new Error(`Leitura recusada (HTTP ${resposta?.status}).`);
  return new Map(resposta.dados.map((linha) => [linha?.body?.id, linha?.body]).filter(([id]) => id));
}

const lidos = new Map();
for (let i = 0; i < lista.length; i += 20) {
  for (const [id, corpo] of await lerNoML(lista.slice(i, i + 20).map((anuncio) => anuncio.idExterno))) lidos.set(id, corpo);
}

for (const anuncio of lista) {
  const item = lidos.get(anuncio.idExterno);
  const prazo = anuncio.dados?.prazoDisponibilidadeDias;
  console.log(
    `${anuncio.produto?.sku ?? "?"}  ${anuncio.idExterno}  ${item?.status ?? "sem leitura"}${item?.sub_status?.length ? `/${item.sub_status.join(",")}` : ""}` +
      `  garantia do produto: ${anuncio.produto?.garantiaMeses ?? "vazia"}  prazo no rascunho: ${prazo ?? "vazio"}\n    no ML hoje: ${termosDe(item)}`,
  );
}

if (modo === "aplicar") {
  console.log("\n--- aplicando ---");
  for (const anuncio of lista) {
    const sku = anuncio.produto?.sku ?? "";
    const item = lidos.get(anuncio.idExterno);
    if (!item || item.status === "closed") {
      console.log(`${sku} ${anuncio.idExterno}: pulado (${item?.status ?? "sem leitura"}).`);
      continue;
    }
    ml.exigirEscrita(sku);
    // Os termos que o anuncio ja tem e nao sao estes ficam como estao: o PUT de `sale_terms` troca a lista inteira.
    const mantidos = (item.sale_terms ?? [])
      .filter((termo) => !["WARRANTY_TYPE", "WARRANTY_TIME", "MANUFACTURING_TIME"].includes(termo.id))
      .map((termo) => (termo.value_id ? { id: termo.id, value_id: termo.value_id } : { id: termo.id, value_name: termo.value_name }));
    const sale_terms = [
      ...mantidos,
      // So com `value_id` o ML aceitou o PUT (200) e descartou o termo; com o nome junto ele grava (medido em 26/10/2026).
      { id: "WARRANTY_TYPE", value_id: GARANTIA_DO_VENDEDOR, value_name: "Garantia do vendedor" },
      { id: "WARRANTY_TIME", value_name: `${MESES} meses` },
      { id: "MANUFACTURING_TIME", value_name: `${DIAS} dias` },
    ];
    const resposta = await ml.put(`/items/${anuncio.idExterno}`, { sale_terms });
    const depois = resposta?.ok ? (await lerNoML([anuncio.idExterno])).get(anuncio.idExterno) : null;
    console.log(`${sku} ${anuncio.idExterno}: HTTP ${resposta?.status} ${resposta?.ok ? "ok" : JSON.stringify(resposta?.dados ?? resposta?.erro ?? "").slice(0, 600)}\n    no ML agora: ${termosDe(depois)}`);
    if (!resposta?.ok) {
      console.log("Parei no primeiro que o ML recusou.");
      break;
    }
    await new Promise((resolver) => setTimeout(resolver, 1500));
  }
}

await prisma.$disconnect();
