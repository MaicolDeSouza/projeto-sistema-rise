import "dotenv/config";

/**
 * Coleta produtos de uma ou mais fontes e grava em JSON.
 *
 * Enquanto o banco nao entra, e assim que juntamos material real para conferir
 * a extracao. Usa o MESMO caminho do botao "Testar fonte" (colher.js), so com
 * limite maior — o que a previa mostra e o que este arquivo guarda.
 *
 *   npm run coletar -- https://loja-a.com.br https://loja-b.com.br
 *   npm run coletar -- --limite=50 https://loja.com.br
 *   npm run coletar -- --secao=/informatica/ https://loja.com.br
 *
 * Grava em dados/coleta/<dominio>/produtos.json. Nada vai para o banco.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");

register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { colherProdutos } = await import("../src/lib/coleta/colher.js");
const { salvarColeta } = await import("../src/lib/coleta/arquivo.js");

const argumentos = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const achado = argumentos.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split("=").slice(1).join("=") : padrao;
};

const LIMITE = Number(opcao("limite", 20));
const SECAO = opcao("secao", "");
const TIPO = opcao("tipo", "CONCORRENTE");
const alvos = argumentos.filter((a) => !a.startsWith("--"));

if (alvos.length === 0) {
  console.error(
    "Informe ao menos uma URL.\n" +
      "  npm run coletar -- https://loja.com.br\n" +
      "  npm run coletar -- --limite=20 --secao=/informatica/ https://loja.com.br",
  );
  process.exit(1);
}

function nomeDe(url) {
  try {
    const raiz = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
    return raiz.charAt(0).toUpperCase() + raiz.slice(1);
  } catch {
    return url;
  }
}

// Em paralelo: a fila de requisicoes e por dominio, entao lojas diferentes nao
// se atrapalham e coletar de cinco leva o tempo de uma.
const resultados = await Promise.all(
  alvos.map(async (url) => {
    const nome = nomeDe(url);
    console.log(`[${nome}] iniciando...`);

    try {
      const colheita = await colherProdutos({
        url,
        secao: SECAO,
        nome,
        tipo: TIPO,
        limite: LIMITE,
        aoProgredir: ({ visitadas, produtos }) => {
          if (visitadas % 10 === 0) {
            console.log(`[${nome}] ${produtos} produto(s) em ${visitadas} pagina(s)`);
          }
        },
      });

      if (!colheita.ok) {
        console.log(`[${nome}] FALHOU: ${colheita.motivo}`);
        return { nome, url, ok: false, motivo: colheita.motivo, total: 0 };
      }

      const resumo =
        `${colheita.produtos.length} produto(s) em ${colheita.visitas} pagina(s) · ` +
        `formatos: ${colheita.formatos.join(", ")}` +
        (colheita.ritmoMs ? ` · site pede ${colheita.ritmoMs / 1000}s entre visitas` : "");

      const destino = await salvarColeta({
        fonte: {
          nome,
          dominio: colheita.dominio,
          tipo: TIPO,
          url,
          secao: colheita.prefixoUrl,
        },
        produtos: colheita.produtos,
        resumo,
      });

      console.log(`[${nome}] ${resumo}`);
      console.log(`[${nome}] gravado em ${destino}`);
      return { nome, url, ok: true, total: colheita.produtos.length, destino, colheita };
    } catch (erro) {
      console.log(`[${nome}] ERRO: ${erro?.message ?? erro}`);
      return { nome, url, ok: false, motivo: String(erro?.message ?? erro), total: 0 };
    }
  }),
);

console.log(`\n${"=".repeat(74)}`);

for (const r of resultados) {
  console.log(`${r.ok ? "ok " : "X  "} ${String(r.nome).padEnd(16)} ${r.total} produto(s)`);

  // Uma amostra do que foi guardado: numero sem exemplo nao diz se presta.
  for (const produto of r.colheita?.produtos.slice(0, 2) ?? []) {
    console.log(
      `      ${String(produto.name).slice(0, 44).padEnd(46)} ` +
        `R$ ${produto.prices.normal}${produto.prices.promotional ? ` → ${produto.prices.promotional}` : ""} · ` +
        `${produto.specifications.length} spec · ${produto.images.length} img`,
    );
  }
}

const total = resultados.reduce((soma, r) => soma + r.total, 0);
console.log(`\n${total} produto(s) gravado(s) em dados/coleta/`);
