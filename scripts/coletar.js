import "dotenv/config";

/**
 * Coleta fontes CADASTRADAS pela linha de comando e grava no banco.
 *
 * Mesmo caminho do botao "Atualizar dados" para colher (colher.js) e para gravar
 * (banco.js) — so nao passa pela fila. Serve para conferir uma fonte sem subir o
 * worker.
 *
 *   npm run coletar -- https://loja-a.com.br https://loja-b.com.br
 *   npm run coletar -- --limite=50 https://loja.com.br
 *
 * O endereco precisa ser de uma fonte ja cadastrada em /mercados/fontes: todo
 * produto pertence a uma fonte, e cadastrar por aqui pularia o teste que a tela
 * exige. Sem --limite vale o da fonte: 20 para concorrente, catalogo inteiro para
 * fornecedor.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");

register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { colherProdutos } = await import("../src/lib/coleta/colher.js");
const { gravarColeta } = await import("../src/lib/coleta/banco.js");
const { limiteDaFonte } = await import("../src/lib/coleta/coletar.js");
const { prisma } = await import("../src/lib/db.js");

const argumentos = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const achado = argumentos.find((a) => a.startsWith(`--${nome}=`));
  return achado ? achado.split("=").slice(1).join("=") : padrao;
};

const LIMITE = opcao("limite", null);
const alvos = argumentos.filter((a) => !a.startsWith("--"));

if (alvos.length === 0) {
  console.error(
    "Informe ao menos o endereco de uma fonte cadastrada.\n" +
      "  npm run coletar -- https://loja.com.br\n" +
      "  npm run coletar -- --limite=50 https://loja.com.br",
  );
  process.exit(1);
}

async function fonteDe(url) {
  let alvo;
  try {
    alvo = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
  } catch {
    return { erro: "endereco invalido" };
  }

  const fontes = await prisma.fonteColeta.findMany({ where: { dominio: alvo.hostname } });
  if (fontes.length === 0) {
    return { erro: `${alvo.hostname} nao e uma fonte cadastrada — cadastre em /mercados/fontes` };
  }

  // Mais de uma fonte no mesmo dominio e trecho diferente: vale a do caminho colado.
  const fonte =
    fontes.find((f) => f.prefixoUrl && alvo.pathname.startsWith(f.prefixoUrl)) ??
    fontes.find((f) => !f.prefixoUrl) ??
    fontes[0];

  // Fornecedor com lista se atualiza reprocessando a lista. Gravar a vitrine por
  // aqui marcaria a ultima coleta como "site", e a trava de queda — que so
  // compara lista com lista — deixaria de proteger o proximo envio.
  if (fonte.tipo === "FORNECEDOR" && fonte.listaArquivos?.length > 0) {
    return {
      erro: `${fonte.nome} tem lista enviada — use "Atualizar dados", que reprocessa a lista`,
    };
  }

  return { fonte };
}

// Em paralelo: a fila de requisicoes e por dominio, entao lojas diferentes nao
// se atrapalham e coletar de cinco leva o tempo de uma.
const resultados = await Promise.all(
  alvos.map(async (url) => {
    const { fonte, erro } = await fonteDe(url);
    if (!fonte) {
      console.log(`[${url}] ${erro}`);
      return { nome: url, ok: false, total: 0 };
    }

    const nome = fonte.nome;
    const limite = LIMITE ? Number(LIMITE) : limiteDaFonte();
    console.log(`[${nome}] iniciando, ate ${limite} produto(s)...`);

    const comecou = Date.now();
    try {
      const colheita = await colherProdutos({
        url: `https://${fonte.dominio}/`,
        secao: fonte.prefixoUrl ?? undefined,
        nome,
        tipo: fonte.tipo,
        limite,
        aoProgredir: ({ visitadas, produtos }) => {
          if (visitadas % 10 === 0) {
            console.log(`[${nome}] ${produtos} produto(s) em ${visitadas} pagina(s)`);
          }
        },
      });

      if (!colheita.ok || colheita.produtos.length === 0) {
        console.log(`[${nome}] FALHOU: ${colheita.motivo ?? "nenhum produto valido"}`);
        return { nome, ok: false, total: 0 };
      }

      const resumo =
        `${colheita.produtos.length} produto(s) em ${colheita.visitas} pagina(s) · ` +
        `formatos: ${colheita.formatos.join(", ")}` +
        (colheita.ritmoMs ? ` · site pede ${colheita.ritmoMs / 1000}s entre visitas` : "");

      const gravacao = await gravarColeta({
        fonte,
        produtos: colheita.produtos,
        origem: "site",
        resumo,
        duracaoMs: Date.now() - comecou,
      });

      console.log(`[${nome}] ${resumo}`);
      console.log(
        `[${nome}] ${gravacao.novos} novo(s), ${gravacao.atualizados} atualizado(s), ` +
          `${gravacao.inalterados} sem mudanca, ${gravacao.precosMudaram} mudanca(s) de preco`,
      );
      return { nome, ok: true, total: gravacao.gravados, colheita };
    } catch (excecao) {
      console.log(`[${nome}] ERRO: ${excecao?.message ?? excecao}`);
      return { nome, ok: false, total: 0 };
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
console.log(`\n${total} produto(s) gravado(s) no banco`);

await prisma.$disconnect();
