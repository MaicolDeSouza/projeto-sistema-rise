import "dotenv/config";

/**
 * Testes do worker da coleta: rede, fila e o processo de verdade.
 *
 *   npm run teste:worker     (uns 4 minutos)
 *
 * Cada defeito de 16/09/2026 virou um teste aqui:
 *   - pagina que para de chegar no meio prendia o worker para sempre;
 *   - dois workers pegavam o mesmo job;
 *   - job largado ficava "em andamento" por horas;
 *   - loja que esgotava as tentativas voltava a fila na volta seguinte;
 *   - encerrar o worker gastava tentativa e perdia o lote aberto.
 *
 * Usa uma LOJA FALSA em http://127.0.0.1 e fontes de teste, apagadas no fim (e no
 * comeco, se uma execucao anterior morreu no meio). O worker e subido com
 * COLETA_FONTES, entao so enxerga as fontes de teste e usa outra trava: pode rodar
 * com o worker normal no ar, sem tocar na fila dele.
 */

// Antes de importar buscar.js: o teto de tempo e lido na carga do modulo.
process.env.COLETA_TIMEOUT_MS = "1500";

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const http = await import("node:http");
const { fork } = await import("node:child_process");
const path = await import("node:path");

// O teste sobe um worker restrito a fontes ficticias. A pausa real do operador
// permanece intacta; o processo filho herda este marcador isolado.
process.env.COLETA_PAUSA_ARQUIVO = path.join(process.cwd(), "dados", `coleta.pausada-teste-${process.pid}`);

const { prisma } = await import("@/lib/db.js");
const { buscarBytes, buscarPagina, ultimaRespostaDe } = await import("@/lib/coleta/buscar.js");
const { rastrear } = await import("@/lib/coleta/descobrir.js");
const { colherProdutos, enderecoComparavel } = await import("@/lib/coleta/colher.js");
const fila = await import("@/lib/coleta/fila.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${
      ok ? "" : `\n        obtido=${JSON.stringify(obtido)}\n      esperado=${JSON.stringify(esperado)}`
    }`,
  );
}
const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

async function esperarAte(descricao, condicao, tetoMs = 120 * 1000) {
  const inicio = Date.now();
  for (;;) {
    const valor = await condicao();
    if (valor) return valor;
    if (Date.now() - inicio > tetoMs) throw new Error(`tempo esgotado esperando: ${descricao}`);
    await dormir(500);
  }
}

// ---------------------------------------------------------------------------
// Loja falsa
// ---------------------------------------------------------------------------

const PRODUTOS = 6;
const loja = {
  /// Quantos produtos a home lista.
  produtos: PRODUTOS,
  /// Espera antes de responder cada pagina de produto.
  atrasoMs: 0,
  /// Pagina de produto manda o cabecalho e para de mandar o corpo.
  travarProdutos: false,
  /// A home se apresenta como OpenCart (cookie OCSESSID + caminho do tema).
  opencart: false,
  /// O sitemap lista cada produto por 3 caminhos de categoria, como o da Solda Fria.
  variantes: false,
};
const conexoes = new Set();
/// Quantas vezes cada pagina de produto foi aberta.
const aberturas = new Map();

const servidor = http.createServer((pedido, resposta) => {
  const caminho = pedido.url.split("?")[0];

  if (caminho === "/travada") {
    resposta.writeHead(200, { "Content-Type": "text/html" });
    resposta.write("<html><body>comecou e parou");
    return; // nunca termina
  }

  if (caminho === "/sitemap.xml") {
    const prefixos = loja.variantes ? ["", "/cat-a", "/cat-a/cat-b"] : [""];
    const urls = Array.from({ length: loja.produtos }, (_, i) =>
      prefixos
        .map((prefixo) => `<url><loc>http://${pedido.headers.host}${prefixo}/produto-${101 + i}.html</loc></url>`)
        .join(""),
    );
    resposta.writeHead(200, { "Content-Type": "application/xml" });
    resposta.end(`<?xml version="1.0"?><urlset>${urls.join("")}</urlset>`);
    return;
  }

  if (caminho === "/") {
    const links = Array.from({ length: loja.produtos }, (_, i) => `<a href="/produto-${101 + i}.html">P${i}</a>`);
    // Cookie + caminho do tema + rota: os tres sinais que fazem o OpenCart ser
    // reconhecido (3 + 3 + 2 pontos, e mais de um sinal).
    const sinaisOpenCart = loja.opencart
      ? `<script src="/catalog/view/theme/default/js/app.js"></script><!-- index.php?route=product/product -->`
      : "";
    resposta.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      ...(loja.opencart ? { "Set-Cookie": "OCSESSID=abc123; path=/" } : {}),
    });
    resposta.end(`<html><body><h1>Loja teste</h1>${links.join(" ")}${sinaisOpenCart}</body></html>`);
    return;
  }

  // Corredor infinito de categorias SEM produto nenhum: e o que o freio de
  // secura tem que cortar (o Eletrogate abriu 6.111 paginas assim).
  const categoria = /^\/categoria-(\d+)\.html$/.exec(caminho);
  if (categoria) {
    const proxima = Number(categoria[1]) + 1;
    resposta.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    resposta.end(`<html><body><h1>Categoria</h1><a href="/categoria-${proxima}.html">proxima</a></body></html>`);
    return;
  }

  // Aceita o caminho de categoria na frente (`/cat-a/cat-b/produto-101.html`): e a
  // mesma pagina, como no OpenCart.
  const produto = /^(?:\/cat-[a-z])*\/produto-(\d+)\.html$/.exec(caminho);
  if (produto) {
    aberturas.set(caminho, (aberturas.get(caminho) ?? 0) + 1);
    if (loja.travarProdutos) {
      resposta.writeHead(200, { "Content-Type": "text/html" });
      resposta.write("<html>");
      return;
    }
    const numero = produto[1];
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: `Produto Teste ${numero}`,
      sku: `TW-${numero}`,
      offers: {
        "@type": "Offer",
        price: "10.50",
        priceCurrency: "BRL",
        availability: "https://schema.org/InStock",
      },
    };
    setTimeout(() => {
      resposta.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      resposta.end(
        `<html><head><title>Produto ${numero}</title><script type="application/ld+json">${JSON.stringify(jsonLd)}</script></head><body>Produto ${numero}</body></html>`,
      );
    }, loja.atrasoMs);
    return;
  }

  resposta.writeHead(404);
  resposta.end();
});
servidor.on("connection", (socket) => {
  conexoes.add(socket);
  socket.on("close", () => conexoes.delete(socket));
});
await new Promise((resolver) => servidor.listen(0, "127.0.0.1", resolver));
const BASE = `http://127.0.0.1:${servidor.address().port}`;

// ---------------------------------------------------------------------------
console.log("\n— rede: teto de tempo cobre o corpo inteiro —");

let inicio = Date.now();
let pagina = await buscarPagina(`${BASE}/travada`);
conferir("corpo que para de chegar vira erro, em vez de prender", pagina.erro, "Tempo esgotado");
conferir("e dentro do teto (1,5 s + folga)", Date.now() - inicio < 6000, true);

const cancelar = new AbortController();
setTimeout(() => cancelar.abort(), 3000); // a fila do dominio segura uns 2 s antes
inicio = Date.now();
pagina = await buscarPagina(`${BASE}/travada`, { sinal: cancelar.signal });
conferir("cancelada pelo sinal: diz cancelado", pagina.erro === "Cancelado" || pagina.erro === "Tempo esgotado", true);

const bytes = await buscarBytes(`${BASE}/travada`);
conferir("buscarBytes tambem respeita o teto", bytes.erro, "Tempo esgotado");
conferir(
  "resposta com erro tambem conta como atividade do site (vigia)",
  Date.now() - ultimaRespostaDe("127.0.0.1") < 1000,
  true,
);

const rastreio = await rastrear({ semente: `${BASE}/`, orcamento: 50, sinal: AbortSignal.abort() });
conferir("rastreamento cancelado nao abre pagina", rastreio.visitadas, 0);

// FREIO DE SECURA: site que so tem categoria nao prende a navegacao ate o teto.
const seco = await rastrear({ semente: `${BASE}/categoria-1.html`, orcamento: 200, pararSemAchado: 5 });
conferir(
  "navegacao para depois de N paginas sem produto novo",
  [seco.secou, seco.visitadas, seco.produtos],
  [true, 5, 0],
);
const comProduto = await rastrear({ semente: `${BASE}/`, orcamento: 200, pararSemAchado: 5 });
conferir(
  "site com produto nao e cortado pelo freio",
  [comProduto.secou, comProduto.produtos],
  [false, PRODUTOS],
);

// ---------------------------------------------------------------------------
console.log("\n— colheita: cada produto uma vez so —");

aberturas.clear();
const colheita = await colherProdutos({ url: `${BASE}/`, nome: "Loja", tipo: "CONCORRENTE", limite: 1000, orcamento: 200 });
conferir("sitemap e navegacao acham os 6 produtos", colheita.produtos.length, PRODUTOS);
conferir(
  "e nenhuma pagina de produto e aberta duas vezes (sitemap, depois navegacao)",
  [...aberturas.values()].every((vezes) => vezes === 1),
  true,
);

aberturas.clear();
const jaGravados = new Set(
  [101, 102, 103].map((numero) => enderecoComparavel(`${BASE}/produto-${numero}.html`)),
);
const retomada = await colherProdutos({
  url: `${BASE}/`,
  nome: "Loja",
  tipo: "CONCORRENTE",
  limite: 1000,
  orcamento: 200,
  jaColetadas: jaGravados,
});
conferir("retomada conta cada gravado UMA vez (sitemap e navegacao juntos)", retomada.retomados, 3);
conferir("e abre so os que faltavam", [...aberturas.keys()].sort(), ["/produto-104.html", "/produto-105.html", "/produto-106.html"]);

// ---------------------------------------------------------------------------
console.log("\n— o mesmo produto por varios enderecos (OpenCart) —");

// A Solda Fria lista cada produto por varios caminhos de categoria: 10.647
// "produtos" para 5.350 no banco, e a segunda abertura reescrevia a linha.
const totalAberturas = () => [...aberturas.values()].reduce((soma, vezes) => soma + vezes, 0);
const enderecoVariante = (numero) => enderecoComparavel(`${BASE}/cat-a/produto-${numero}.html`);
const colherVariantes = (extra = {}) =>
  colherProdutos({ url: `${BASE}/`, nome: "Loja", tipo: "CONCORRENTE", limite: 1000, orcamento: 200, ...extra });

loja.variantes = true;

// Sem a plataforma declarada, cada variante e uma pagina — e o contador ainda
// assim conta PRODUTOS, porque a chave e a mesma do banco (o codigo).
loja.opencart = false;
aberturas.clear();
const semIdentidade = await colherVariantes();
conferir("loja generica abre as 18 variantes (o ultimo segmento pode repetir de verdade)", totalAberturas(), 18);
conferir("mas conta 6 produtos, nao 18: a chave do contador e o codigo, como no banco", semIdentidade.produtos.length, PRODUTOS);

loja.opencart = true;
aberturas.clear();
const comIdentidade = await colherVariantes();
conferir("OpenCart: a plataforma e reconhecida", comIdentidade.plataforma?.id, "opencart");
conferir("abre UMA variante por produto (6 aberturas, nao 18)", totalAberturas(), PRODUTOS);
conferir("e acha os 6 produtos", comIdentidade.produtos.length, PRODUTOS);
conferir(
  "diz quantos enderecos eram repeticao (2 por produto)",
  comIdentidade.passos.find((p) => p.nome === "Endereços repetidos ignorados")?.detalhe?.startsWith("12 "),
  true,
);
conferir("o total do site conta produtos, nao enderecos (18 no sitemap, 6 produtos)", comIdentidade.produtosNoSite, PRODUTOS);

// RETOMADA: o gravado e a ULTIMA variante visitada, e o sitemap traz outra primeiro.
aberturas.clear();
const retomadaPorIdentidade = await colherVariantes({ jaColetadas: new Set([enderecoVariante(101)]) });
conferir("retomada casa pela identidade: a variante gravada e outra que a do sitemap", retomadaPorIdentidade.retomados, 1);
conferir("e nao reabre o produto retomado em variante nenhuma", [...aberturas.keys()].some((c) => c.endsWith("/produto-101.html")), false);
conferir("abre so os 5 que faltavam", totalAberturas(), PRODUTOS - 1);

loja.variantes = false;
loja.opencart = false;

// ---------------------------------------------------------------------------
console.log("\n— fila —");

const DOMINIOS = ["teste-fila-a.local", "teste-fila-b.local", "teste-fila-c.local", BASE, "teste-fila-d.local"];
async function limpar() {
  const antigas = await prisma.fonteColeta.findMany({
    where: { OR: [{ dominio: { in: DOMINIOS } }, { dominio: { startsWith: "http://127.0.0.1:" } }] },
    select: { id: true },
  });
  const ids = antigas.map((fonte) => fonte.id);
  await prisma.job.deleteMany({ where: { fonteId: { in: ids } } });
  await prisma.fonteColeta.deleteMany({ where: { id: { in: ids } } });
}
await limpar();

const longe = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
const criarFonte = (nome, dominio, extra = {}) =>
  prisma.fonteColeta.create({
    data: { nome, dominio, tipo: "CONCORRENTE", proximaVarreduraEm: longe, ...extra },
  });
const [fonteA, fonteB, fonteC] = [
  await criarFonte("Fila A", DOMINIOS[0]),
  await criarFonte("Fila B", DOMINIOS[1]),
  // Vence daqui a meio ano: o teste simula o futuro, e o worker no ar nao a enxerga.
  await criarFonte("Fila C", DOMINIOS[2], { proximaVarreduraEm: new Date(Date.now() + 180 * 24 * 3600 * 1000) }),
];
const soTeste = [fonteA.id, fonteB.id, fonteC.id];
const jobsDe = (fonte) => prisma.job.findMany({ where: { fonteId: fonte.id }, orderBy: { criadoEm: "asc" } });

const entradas = await Promise.all([fila.enfileirar([fonteA], { teste: true }), fila.enfileirar([fonteA], { teste: true }), fila.enfileirar([fonteA], { teste: true })]);
conferir("tres enfileiramentos ao mesmo tempo: um job so", entradas.reduce((a, b) => a + b, 0), 1);
conferir("um job aberto da fonte A", (await jobsDe(fonteA)).length, 1);
await fila.enfileirar([fonteB], { teste: true });

const pegos = await Promise.all(
  Array.from({ length: 6 }, (_, i) => fila.pegarProximoJob(`w${i}`, { fontes: soTeste })),
);
const pegosDeVerdade = pegos.filter(Boolean);
conferir("seis workers disputando dois jobs: dois pegam", pegosDeVerdade.length, 2);
conferir("e nenhum job e pego duas vezes", new Set(pegosDeVerdade.map((job) => job.id)).size, 2);

const jobA = pegosDeVerdade.find((job) => job.fonteId === fonteA.id);
const jobB = pegosDeVerdade.find((job) => job.fonteId === fonteB.id);
conferir("o job pego ja esta PROCESSANDO, com tentativa contada", [jobA.status, jobA.tentativas], ["PROCESSANDO", 1]);
conferir("sinal do dono e aceito", await fila.sinalDoJob(jobA.id, jobA.workerId, null), true);
conferir("sinal de outro worker e recusado", await fila.sinalDoJob(jobA.id, "intruso", null), false);

await prisma.job.update({ where: { id: jobA.id }, data: { sinalEm: new Date(Date.now() - 5 * 60 * 1000) } });
const recolhidos = await fila.recolherLargados({ fontes: soTeste });
conferir("recolhe so o job sem sinal", recolhidos.map((item) => item.fonteNome), ["Fila A"]);
const [aDepois] = await jobsDe(fonteA);
conferir("o largado volta a fila, sem dono", [aDepois.status, aDepois.workerId], ["PENDENTE", null]);
conferir("o job com sinal recente continua com o dono", (await jobsDe(fonteB))[0].status, "PROCESSANDO");
conferir("o dono antigo perde a posse", await fila.sinalDoJob(jobA.id, jobA.workerId, null), false);

// O worker de verdade chama recolherLargados() SEM lista de fontes. Esse caminho
// tinha um filtro SQL que descartava todo job real (ver ehDeTeste em fila.js), e
// nenhum teste passava por ele: todos informavam `fontes`. Resultado no dia
// 18/09/2026: fontes presas em "varredura em andamento" para sempre.
// Chamar sem lista e seguro — e o que o worker faz a cada 5 s, e o sinal de vida
// protege o job de quem esta no ar.
const fonteD = await criarFonte("Fila D", DOMINIOS[4]);
soTeste.push(fonteD.id);
// Nasce PROCESSANDO e sem tentativa sobrando, em UMA escrita. Sem `teste` no
// payload ele e igualzinho a um job real — e o worker no ar, que le a fila toda,
// o pegaria e sairia varrendo teste-fila-d.local. Assim ele nunca fica PENDENTE
// nem com tentativa livre, os dois requisitos de pegarProximoJob.
const jobD = await prisma.job.create({
  data: {
    tipo: "coleta",
    fonteId: fonteD.id,
    status: "PROCESSANDO",
    workerId: "dono-morto",
    tentativas: 3,
    maxTentativas: 3,
    sinalEm: new Date(Date.now() - 5 * 60 * 1000),
    payload: { fonteId: fonteD.id, fonteNome: fonteD.nome, total: 0, feitas: 0 },
  },
});
const semLista = await fila.recolherLargados();
conferir(
  "sem lista de fontes, recolhe o job real largado",
  semLista.some((item) => item.fonteNome === "Fila D"),
  true,
);
conferir("e ele sai de PROCESSANDO", (await prisma.job.findUnique({ where: { id: jobD.id } })).status, "FALHOU");
await prisma.job.deleteMany({ where: { fonteId: fonteD.id } });
await prisma.fonteColeta.delete({ where: { id: fonteD.id } });

conferir(
  "encerrar sem culpa da loja devolve a tentativa",
  await fila.encerrarJob(jobB.id, jobB.workerId, {
    status: "PENDENTE",
    devolverTentativa: true,
    proximaTentativaEm: new Date(),
  }),
  true,
);
conferir("tentativa devolvida", (await jobsDe(fonteB))[0].tentativas, 0);

await prisma.job.update({
  where: { id: jobA.id },
  data: {
    status: "PROCESSANDO",
    workerId: "morto",
    tentativas: 3,
    maxTentativas: 3,
    sinalEm: new Date(Date.now() - 5 * 60 * 1000),
  },
});
await fila.recolherLargados({ fontes: soTeste });
conferir("largado na ultima tentativa: falha", (await jobsDe(fonteA))[0].status, "FALHOU");
const adiada = await prisma.fonteColeta.findUnique({ where: { id: fonteA.id } });
conferir("falha nao agenda uma nova varredura", adiada.proximaVarreduraEm, null);
await prisma.fonteColeta.update({ where: { id: fonteA.id }, data: { proximaVarreduraEm: longe } });
conferir("ciclo automatico nao enfileira fontes", await fila.enfileirarVencidas({ fontes: soTeste, teste: true, agora: Date.now() + 200 * 24 * 3600 * 1000 }), 0);
conferir("com o job anterior fechado, a fonte A aceita um novo", await fila.enfileirar([fonteA], { teste: true }), 1);

// ---------------------------------------------------------------------------
console.log("\n— worker de verdade, contra a loja falsa —");

const lojaFalsa = await prisma.fonteColeta.create({
  data: { nome: "Loja Falsa", dominio: BASE, tipo: "CONCORRENTE", proximaVarreduraEm: longe },
});
const PROCESSO = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "worker-processo.js");

function subirWorker(extra = {}) {
  const saida = [];
  const filho = fork(PROCESSO, [], {
    env: {
      ...process.env,
      COLETA_FONTES: lojaFalsa.id,
      COLETA_PARALELO: "2",
      COLETA_TIMEOUT_MS: "3000",
      ...extra,
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const guardar = (pedaco) => saida.push(...String(pedaco).split("\n").filter(Boolean));
  filho.stdout.on("data", guardar);
  filho.stderr.on("data", guardar);
  const saiu = new Promise((resolver) => filho.on("exit", (codigo) => resolver(codigo)));
  return { filho, saida, saiu };
}
const jobDaLoja = () => prisma.job.findFirst({ where: { fonteId: lojaFalsa.id }, orderBy: { criadoEm: "desc" } });
const produtosDaLoja = () => prisma.produtoColetado.count({ where: { fonteId: lojaFalsa.id } });

try {
  // 1. Varredura completa
  await fila.enfileirar([lojaFalsa], { teste: true });
  const w1 = subirWorker();
  await esperarAte("worker no ar", () => w1.saida.some((linha) => linha.includes("worker no ar")), 30000);

  // 2. Segundo worker com o primeiro no ar
  const w2 = subirWorker();
  conferir("segundo worker com o primeiro no ar nao sobe (codigo 3)", await w2.saiu, 3);

  const concluido = await esperarAte("varredura concluida", async () => {
    const job = await jobDaLoja();
    return job?.status === "CONCLUIDO" || job?.status === "FALHOU" ? job : null;
  });
  conferir("varredura da loja falsa conclui", [concluido.status, concluido.erro], ["CONCLUIDO", null]);
  conferir("todos os produtos gravados", await produtosDaLoja(), PRODUTOS);
  conferir("job encerrado sem dono", [concluido.workerId, concluido.sinalEm], [null, null]);
  const fonteVarrida = await prisma.fonteColeta.findUnique({ where: { id: lojaFalsa.id } });
  conferir("a fonte fica sem proxima varredura", fonteVarrida.proximaVarreduraEm, null);

  // 3. Encerrar no meio: devolve sem gastar tentativa
  loja.atrasoMs = 1500;
  await fila.enfileirar([lojaFalsa], { teste: true });
  await esperarAte("varredura em andamento", async () => (await jobDaLoja())?.status === "PROCESSANDO");
  await dormir(8000);
  w1.filho.send({ tipo: "encerrar" });
  conferir("worker encerrado por mensagem sai com codigo 0", await w1.saiu, 0);
  const devolvido = await jobDaLoja();
  conferir(
    "encerrar no meio devolve o job a fila sem gastar tentativa",
    [devolvido.status, devolvido.tentativas, devolvido.workerId],
    ["PENDENTE", 0, null],
  );
  const registro = await prisma.workerColeta.findFirst({ orderBy: { iniciadoEm: "desc" } });
  conferir("o registro do worker marca o encerramento", registro.encerradoEm !== null, true);

  // 4. Queda sem aviso no meio de uma loja maior: o proximo worker recolhe na
  // partida e CONTINUA DE ONDE PAROU, sem reabrir o que os lotes ja gravaram.
  loja.atrasoMs = 0;
  loja.produtos = 25;
  const w3 = subirWorker();
  await esperarAte("varredura em andamento", async () => (await jobDaLoja())?.status === "PROCESSANDO", 30000);
  const inicioDaVarredura = await esperarAte("inicio da varredura gravado no job", async () => {
    const data = Date.parse((await jobDaLoja())?.payload?.inicioDaColeta ?? "");
    return Number.isFinite(data) ? new Date(data) : null;
  });
  const gravadosAntesDaQueda = await esperarAte(
    "dois lotes gravados",
    async () => {
      const quantos = await prisma.produtoColetado.count({
        where: { fonteId: lojaFalsa.id, vistoEm: { gte: inicioDaVarredura } },
      });
      return quantos >= 20 ? quantos : null;
    },
    150000,
  );
  w3.filho.kill("SIGKILL");
  await w3.saiu;
  conferir("morto sem aviso, o job fica PROCESSANDO", (await jobDaLoja()).status, "PROCESSANDO");

  loja.atrasoMs = 0;
  const w4 = subirWorker();
  await esperarAte(
    "recolhimento na partida",
    () => w4.saida.some((linha) => linha.includes("largada pelo worker anterior")),
    30000,
  );
  conferir("o worker seguinte recolhe o largado na partida, sem esperar", true, true);
  const retomado = await esperarAte("varredura concluida de novo", async () => {
    const job = await jobDaLoja();
    return job?.status === "CONCLUIDO" ? job : null;
  });
  conferir("e conclui, com a queda contada como tentativa", retomado.tentativas, 2);
  conferir(
    "retoma de onde parou: o gravado antes da queda nao e reaberto",
    retomado.payload.retomados >= gravadosAntesDaQueda - 1,
    true,
  );
  conferir(
    "e abre so as paginas que faltavam",
    retomado.payload.visitas < loja.produtos,
    true,
  );
  conferir("a coleta fecha com os 25 produtos", await produtosDaLoja(), 25);
  loja.produtos = PRODUTOS;

  w4.filho.send({ tipo: "encerrar" });
  await w4.saiu;

  // 5. Vigia: varredura que nao anda e cancelada
  loja.travarProdutos = true;
  await fila.enfileirar([lojaFalsa], { teste: true });
  const w5 = subirWorker({ COLETA_TIMEOUT_MS: "600000", COLETA_SEM_ATIVIDADE_MS: "4000" });
  const parada = await esperarAte(
    "vigia cancelar",
    async () => {
      const job = await jobDaLoja();
      return job?.status === "PENDENTE" && job.erro?.includes("parada") ? job : null;
    },
    90000,
  );
  conferir("varredura presa numa pagina e cancelada pelo vigia", parada.erro.startsWith("varredura parada"), true);
  conferir("e volta a fila com espera, gastando a tentativa", [parada.tentativas, parada.proximaTentativaEm > new Date()], [1, true]);
  w5.filho.send({ tipo: "encerrar" });
  conferir("worker encerra mesmo depois de uma varredura presa", await w5.saiu, 0);
} catch (erro) {
  falhas++;
  console.log(`FALHA ${erro.message}`);
} finally {
  loja.travarProdutos = false;
  await limpar();
  await prisma.$disconnect();
  for (const socket of conexoes) socket.destroy();
  servidor.close();
}

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
