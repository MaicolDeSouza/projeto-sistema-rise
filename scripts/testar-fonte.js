import "dotenv/config";

/**
 * Testa uma ou mais fontes pela linha de comando.
 *
 * Mesmo caminho do botao "Testar fonte" da tela — nao uma segunda
 * implementacao. Serve para avaliar um concorrente novo sem abrir o navegador,
 * e para responder por evidencia a pergunta "este site precisa de adaptador
 * proprio?".
 *
 *   npm run teste:fonte -- https://loja-a.com.br https://loja-b.com.br
 *
 * Nada e gravado no banco.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");

register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { testarFonte } = await import("../src/lib/coleta/testar.js");
const { prisma } = await import("../src/lib/db.js");

const alvos = process.argv.slice(2).filter((argumento) => !argumento.startsWith("-"));

// O tipo muda o que conta como produto valido: fornecedor sem preco ainda e
// cadastro util, concorrente sem preco nao responde nada.
//   npm run teste:fonte -- --tipo=FORNECEDOR https://loja.com.br
const tipo =
  /--tipo=([A-Z]+)/i.exec(process.argv.join(" "))?.[1]?.toUpperCase() ?? "CONCORRENTE";

if (alvos.length === 0) {
  console.error("Informe ao menos uma URL.\n  npm run teste:fonte -- https://loja.com.br");
  process.exit(1);
}

function coluna(texto, largura) {
  const valor = String(texto ?? "");
  return valor.length > largura ? `${valor.slice(0, largura - 1)}…` : valor.padEnd(largura);
}

// Em paralelo: a fila de requisicoes e por dominio, entao lojas diferentes nao
// se atrapalham e o teste de cinco sites leva o tempo de um.
const resultados = await Promise.all(
  alvos.map(async (url) => {
    try {
      return { url, ...(await testarFonte({ url, tipo })) };
    } catch (erro) {
      return { url, resultado: "FALHA", motivo: erro?.message, produtos: [], passos: [] };
    }
  }),
);

for (const r of resultados) {
  console.log(`\n${"=".repeat(78)}`);
  console.log(`${r.url}  →  ${r.resultado}`);
  if (r.motivo) console.log(`  ${r.motivo}`);

  for (const passo of r.passos ?? []) {
    console.log(`  ${passo.ok ? "ok " : "X  "} ${coluna(passo.nome, 26)} ${passo.detalhe ?? ""}`);
  }

  if (r.plataforma) {
    console.log(`
  plataforma: ${r.plataforma.nome} (confianca ${r.plataforma.confianca})`);
    console.log(`    sinais  : ${r.plataforma.sinais.join(" · ")}`);
    if (r.plataforma.entrega?.resumo) console.log(`    entrega : ${r.plataforma.entrega.resumo}`);
    if (r.plataforma.entrega?.preco) console.log(`    preco   : ${r.plataforma.entrega.preco}`);
    for (const cuidado of r.plataforma.entrega?.cuidados ?? []) {
      console.log(`    cuidado : ${cuidado}`);
    }
  }

  if (r.catalogoPublico) {
    const c = r.catalogoPublico;
    console.log(
      `  catalogo publico: ${c.disponivel ? "SIM" : "nao"} ${c.url}` +
        (c.disponivel ? ` · ${c.total ?? "?"} produto(s)` : ` · ${c.motivo}`),
    );
  }

  if (r.formatos?.length) console.log(`  formatos: ${r.formatos.join(", ")}`);

  if (r.campos) {
    console.log(`  tem   : ${r.campos.encontrados.join(", ")}`);
    console.log(`  falta : ${r.campos.ausentes.join(", ") || "(nada)"}`);
  }

  for (const produto of (r.produtos ?? []).slice(0, 2)) {
    console.log(
      `\n  · ${coluna(produto.name, 46)} cod ${coluna(produto.code, 12)} ` +
        `R$ ${produto.prices.normal}${
          produto.prices.promotional ? ` → ${produto.prices.promotional}` : ""
        }`,
    );
    console.log(
      `    marca ${coluna(produto.brand ?? "—", 16)} categoria ${coluna(produto.category ?? "—", 22)} ` +
        `${produto.images.length} img · ${Object.keys(produto.specifications).length} specs · ` +
        `${(produto.description ?? "").length} car. de descricao`,
    );
  }
}

console.log(`\n${"=".repeat(78)}`);
const placar = resultados.reduce((conta, r) => {
  conta[r.resultado] = (conta[r.resultado] ?? 0) + 1;
  return conta;
}, {});
console.log(
  Object.entries(placar)
    .map(([chave, valor]) => `${valor} ${chave}`)
    .join(" · "),
);

await prisma.$disconnect();
