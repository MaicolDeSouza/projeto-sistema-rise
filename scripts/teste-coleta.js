import "dotenv/config";
import http from "node:http";

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { conferirSite, varrerFonte, coletarUrl } = await import("@/lib/coleta/coletar.js");
const { prisma } = await import("@/lib/db.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : `  obtido=${JSON.stringify(obtido)} esperado=${JSON.stringify(esperado)}`}`);
}

// --- servidor de teste -----------------------------------------------------
const PORTA = 8787;
const BASE = `http://localhost:${PORTA}`;
let precoMouse = "89,90";

function paginaProduto({ nome, marca, modelo, mpn, sku, preco }) {
  return `<!doctype html><html><head><script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"${nome}",
 "description":"<p>Descricao de <b>${nome}</b>.</p>","brand":{"name":"${marca}"},
 "model":"${modelo}","mpn":"${mpn}","sku":"${sku}","image":["/img/${sku}.jpg"],
 "offers":{"@type":"Offer","price":"${preco}","availability":"https://schema.org/InStock"}}
</script></head><body></body></html>`;
}

const rotas = {
  "/robots.txt": () => ({
    tipo: "text/plain",
    corpo: `User-agent: *\nDisallow: /admin/\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`,
  }),
  "/sitemap.xml": () => ({
    tipo: "application/xml",
    corpo: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${BASE}/produto/mouse</loc><lastmod>2026-08-01</lastmod></url>
<url><loc>${BASE}/produto/teclado</loc><lastmod>2026-08-01</lastmod></url>
<url><loc>${BASE}/admin/secreto</loc></url>
</urlset>`,
  }),
  "/produto/mouse": () => ({
    tipo: "text/html",
    corpo: paginaProduto({ nome: "Mouse Logitech M170", marca: "Logitech", modelo: "M170", mpn: "910-004940", sku: "MOU-1", preco: precoMouse }),
  }),
  "/produto/teclado": () => ({
    tipo: "text/html",
    corpo: paginaProduto({ nome: "Teclado Redragon K552", marca: "Redragon", modelo: "K552", mpn: "K552-RGB", sku: "TEC-1", preco: "249,90" }),
  }),
  "/admin/secreto": () => ({ tipo: "text/html", corpo: "<html>nao deveria ser lido</html>" }),
};

const pedidos = [];
const servidor = http.createServer((req, res) => {
  pedidos.push(req.url);
  const rota = rotas[req.url];
  if (!rota) {
    res.writeHead(404, { "Content-Type": "text/html" });
    return res.end("<html>404</html>");
  }
  const { tipo, corpo } = rota();
  res.writeHead(200, { "Content-Type": tipo });
  res.end(corpo);
});
await new Promise((r) => servidor.listen(PORTA, r));
console.log(`servidor de teste em ${BASE}\n`);

// --- 1. conferir o site (o que a tela de cadastro faz) ----------------------
const conferencia = await conferirSite(BASE);
conferir("conferir: robots permite", conferencia.robotsPermite, true);
conferir("conferir: achou sitemap", conferencia.sitemaps.length, 1);
conferir("conferir: contou os produtos (admin fora)", conferencia.totalUrls, 3);
conferir("conferir: nao e pagina de produto", conferencia.ehPaginaDeProduto, false);
conferir("conferir: amostra extraiu", conferencia.amostra?.dados?.marca, "Logitech");
console.log("       resumo:", conferencia.resumo);

// --- 2. colar a URL de um produto ------------------------------------------
const doProduto = await conferirSite(`${BASE}/produto/teclado`);
conferir("colar produto: reconhecido", doProduto.ehPaginaDeProduto, true);
conferir("colar produto: sem prefixo", doProduto.prefixoUrl, null);

// --- 3. colar a URL de uma secao -------------------------------------------
const daSecao = await conferirSite(`${BASE}/produto`);
conferir("colar secao: vira prefixo", daSecao.prefixoUrl, "/produto/");
conferir("colar secao: so as paginas da secao", daSecao.totalUrls, 2);

// --- 4. varredura ----------------------------------------------------------
await prisma.fonteColeta.deleteMany({ where: { dominio: "localhost" } });
const fonte = await prisma.fonteColeta.create({
  data: { nome: "Loja Teste", dominio: "localhost", tipo: "CONCORRENTE", urlSitemap: `${BASE}/sitemap.xml`, prefixoUrl: null },
});

const primeira = await varrerFonte(fonte, [], null);
conferir("varredura 1: criou as duas paginas", primeira.contagem.criada, 2);

let paginas = await prisma.paginaColetada.findMany({ where: { fonteId: fonte.id }, orderBy: { url: "asc" } });
conferir("varredura 1: duas linhas", paginas.length, 2);
conferir("varredura 1: admin NAO foi coletado", paginas.some((p) => p.url.includes("/admin/")), false);
conferir("varredura 1: robots barrou o admin", pedidos.includes("/admin/secreto"), false);
conferir("varredura 1: buscaTexto normalizado", paginas[0].buscaTexto, "mouse logitech m170 logitech m170 910-004940 mou-1 loja teste");
conferir("varredura 1: preco", Number(paginas[0].precoAtual), 89.9);

let historico = await prisma.precoHistorico.count({ where: { pagina: { fonteId: fonte.id } } });
conferir("varredura 1: historico com a linha de base", historico, 2);

// --- 5. varrer de novo SEM mudanca (o teste que prova a estrutura) ---------
const antes = paginas.map((p) => ({ url: p.url, visto: p.vistoEm }));
const segunda = await varrerFonte(fonte, paginas, null);
conferir("varredura 2: nada foi criado", segunda.contagem.criada ?? 0, 0);
conferir("varredura 2: nada foi atualizado", segunda.contagem.atualizada ?? 0, 0);

paginas = await prisma.paginaColetada.findMany({ where: { fonteId: fonte.id }, orderBy: { url: "asc" } });
conferir("varredura 2: continua com duas linhas", paginas.length, 2);

historico = await prisma.precoHistorico.count({ where: { pagina: { fonteId: fonte.id } } });
conferir("varredura 2: NENHUMA linha nova de preco", historico, 2);
conferir("varredura 2: vistoEm avancou", paginas[0].vistoEm > antes[0].visto, true);

// --- 6. mudanca de preco ---------------------------------------------------
precoMouse = "79,90";
const terceira = await varrerFonte(fonte, paginas, null);
conferir("varredura 3: uma pagina atualizada", terceira.contagem.atualizada, 1);

paginas = await prisma.paginaColetada.findMany({ where: { fonteId: fonte.id }, orderBy: { url: "asc" } });
conferir("varredura 3: precoAtual novo", Number(paginas[0].precoAtual), 79.9);

historico = await prisma.precoHistorico.count({ where: { pagina: { fonteId: fonte.id } } });
conferir("varredura 3: uma linha nova no historico", historico, 3);

// --- 7. pagina que sumiu ---------------------------------------------------
const sumida = await coletarUrl({ fonte, url: `${BASE}/produto/mouse-que-sumiu` });
conferir("404 sem linha previa: ignorada", sumida.acao, "ignorada");

delete rotas["/produto/teclado"];
const doTeclado = paginas.find((p) => p.url.includes("teclado"));
const agoraSumiu = await coletarUrl({ fonte, url: doTeclado.url, etag: doTeclado.etag ?? undefined });
conferir("404 com linha previa: marcada indisponivel", agoraSumiu.acao, "indisponivel");

const tecladoDepois = await prisma.paginaColetada.findUnique({ where: { id: doTeclado.id } });
conferir("404: linha NAO foi apagada", Boolean(tecladoDepois), true);
conferir("404: disponivel false", tecladoDepois.disponivel, false);
conferir("404: titulo preservado", tecladoDepois.titulo, "Teclado Redragon K552");

// --- limpeza ---------------------------------------------------------------
await prisma.fonteColeta.delete({ where: { id: fonte.id } });
servidor.close();
await prisma.$disconnect();

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
