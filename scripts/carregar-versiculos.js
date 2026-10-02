import "dotenv/config";

/**
 * Carga inicial da lista de versiculos da NVI (Canais de Venda / Mercado Livre).
 *
 *   npm run versiculos:carregar
 *   npm run versiculos:carregar -- caminho/do/arquivo.json
 *
 * Le src/lib/canaisDeVenda/versiculos-nvi.json (`[{ livro, capitulo, inicio, fim, texto }]`),
 * confere cada entrada e o total contra o teto da licenca da NVI e so entao grava, com
 * `carregarVersiculosIniciais`. Isso so acontece com a tabela vazia: depois da primeira
 * carga a lista e do dono, e recarregar devolveria o que ele tirou.
 *
 * O caminho opcional existe para testar o script com um arquivo de teste, sem tocar na
 * lista aprovada.
 */

const { existsSync, readFileSync } = await import("node:fs");
const path = await import("node:path");
const { register } = await import("node:module");
const { fileURLToPath, pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");
const { carregarVersiculosIniciais } = await import("../src/lib/canaisDeVenda/configuracao.js");
const { TETO_DE_VERSICULOS, contarVersiculos, errosDoVersiculo, referenciaDoVersiculo } = await import(
  "../src/lib/canaisDeVenda/versiculos.js"
);

const ARQUIVO_PADRAO = "src/lib/canaisDeVenda/versiculos-nvi.json";

// Reprovou: diz o motivo (uma linha por problema) e marca a saida com erro, sem lancar, para
// o `finally` desconectar o Prisma antes de o processo acabar.
function reprovar(...linhas) {
  for (const linha of linhas) console.error(linha);
  process.exitCode = 1;
}

// Entrada que nem objeto e nao tem referencia para citar; `errosDoVersiculo` lancaria nela.
function descreverEntrada(v, indice) {
  return v && typeof v === "object" ? referenciaDoVersiculo(v) : `entrada ${indice + 1}`;
}

function problemasDaLista(lista) {
  const problemas = [];
  const vistos = new Set();
  lista.forEach((v, i) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) {
      problemas.push(`${descreverEntrada(v, i)}: nao e um versiculo.`);
      return;
    }
    for (const erro of errosDoVersiculo(v)) problemas.push(`${descreverEntrada(v, i)}: ${erro}`);
    // A chave unica do banco e livro + capitulo + inicio; a carga ignora a repetida em silencio,
    // e "N versiculos carregados" passaria a mentir sobre o arquivo.
    const chave = `${v.livro}|${v.capitulo}|${v.inicio}`;
    if (vistos.has(chave)) problemas.push(`${descreverEntrada(v, i)}: repetido na lista.`);
    vistos.add(chave);
  });
  return problemas;
}

async function carregar() {
  const argumento = process.argv[2];
  const caminho = argumento
    ? path.resolve(argumento)
    : fileURLToPath(new URL(`../${ARQUIVO_PADRAO}`, import.meta.url));

  if (!existsSync(caminho)) {
    return reprovar(
      argumento
        ? `Arquivo ${argumento} nao existe.`
        : `Arquivo ${ARQUIVO_PADRAO} ainda nao existe (a lista aguarda a revisao do dono).`,
    );
  }

  let lista;
  try {
    lista = JSON.parse(readFileSync(caminho, "utf8"));
  } catch (erro) {
    return reprovar(`Nao consegui ler o arquivo como JSON: ${erro.message}`);
  }
  if (!Array.isArray(lista) || lista.length === 0) {
    return reprovar("O arquivo precisa ser uma lista com pelo menos um versiculo.");
  }

  const problemas = problemasDaLista(lista);
  if (problemas.length > 0) {
    return reprovar(`${problemas.length} problema(s) na lista; nada foi carregado:`, ...problemas.map((p) => `  - ${p}`));
  }
  const total = contarVersiculos(lista);
  if (total > TETO_DE_VERSICULOS) {
    return reprovar(
      `A lista tem ${total} versiculos. O limite da NVI sem autorizacao da Biblica e ${TETO_DE_VERSICULOS}; nada foi carregado.`,
    );
  }

  // Ela lanca em lista invalida, passou do teto ou falha de banco: o script avisa e sai com erro.
  let resultado;
  try {
    resultado = await carregarVersiculosIniciais(lista);
  } catch (erro) {
    return reprovar(`Nao foi possivel carregar: ${erro.message}`);
  }

  if (resultado.existentes > 0) {
    console.log(`A lista ja tem ${resultado.existentes} versiculos; nada foi carregado.`);
  } else {
    console.log(`${resultado.carregados} versiculos carregados`);
  }
}

try {
  await carregar();
} finally {
  await prisma.$disconnect();
}
