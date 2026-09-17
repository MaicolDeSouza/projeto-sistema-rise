import "dotenv/config";

/**
 * Teste (17/09/2026): o dono informa o LINK DE UMA CATEGORIA da Santana e vem
 * todo produto dela — sem abrir produto por produto.
 *
 *   node scripts/teste-categoria-santana.js <link-da-categoria> [--saida=arquivo.json] [--por-pagina=100] [--ordenacoes=0,1,2]
 *     [--limite=500] [--ritmo=30]   (segundos entre pedidos)
 *
 * Nada e gravado no banco. `--saida` guarda os itens lidos para conferencia.
 *
 * O QUE O TESTE NO NAVEGADOR MOSTROU:
 * - A pagina da categoria nao traz os produtos no HTML: chama
 *   /handlers/departamento/CategoriaResult.ashx, que devolve JSON com um `html`
 *   pronto da vitrine.
 * - Cada item desse html ja tem link COM `?sku=`, codigo, preco, IPI, ST, preco
 *   com impostos, caixa inner/master, faixas de quantidade, multiplo de venda e o
 *   botao de comprar. A pagina do produto nao precisa ser aberta.
 * - O endereco vira parametro assim: ultimo trecho = `subcategoria`, penultimo =
 *   `categoria`; com um trecho so, ele e a `categoria`.
 *     componentes.html                              -> categoria=componentes
 *     componentes/roboticos.html                    -> categoria=componentes, subcategoria=roboticos
 *     antenas/amplificadores-de-sinal/satelite-finder.html
 *                                                   -> categoria=amplificadores-de-sinal, subcategoria=satelite-finder
 * - O peso sao IMAGENS EMBUTIDAS em base64 (~150 KB por item): 12 itens dao
 *   1,9 MB e 67 KB sem elas. O numero de bytes nao muda com o tamanho da pagina,
 *   so o de requisicoes.
 */

import https from "node:https";
import { writeFileSync } from "node:fs";
import zlib from "node:zlib";

const BASE = "https://santanaimport.com.br";
const USER_AGENT = process.env.COLETA_USER_AGENT || "SistemaRise/1.0 (coleta de precos para uso proprio)";
/*
  RITMO: 2 s entre pedidos no primeiro teste, e a Santana BLOQUEOU o
  user-agent do sistema (17/09/2026): ~150 pedidos no dia, a maioria listas de
  1,5 a 15 MB, e a conexao passou a ser cortada (ECONNRESET) so para o nosso
  user-agent. Voltou em menos de uma hora. Nao se troca o user-agent para
  contornar: o padrao agora e 30 s, e corte de conexao encerra o teste.
*/
const RITMO_MS = Number(process.argv.find((arg) => arg.startsWith("--ritmo="))?.slice(8) ?? 30) * 1000;

const argumento = (nome) => process.argv.find((arg) => arg.startsWith(`--${nome}=`))?.slice(nome.length + 3);
const link = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
const saida = argumento("saida");
const porPagina = Number(argumento("por-pagina") ?? 50);
// Quantos produtos bastam. Sem limite, a categoria inteira.
const limite = Number(argumento("limite") ?? Infinity);

if (!link) {
  console.error("Informe o link da categoria. Ex.: https://santanaimport.com.br/componentes.html?p=1");
  process.exit(2);
}

const usuario = process.env.SANTANA_USUARIO;
const senha = process.env.SANTANA_SENHA;
if (!usuario || !senha) {
  console.error("Falta SANTANA_USUARIO e/ou SANTANA_SENHA no .env.");
  process.exit(2);
}

const cookies = new Map();
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
let bytesRecebidos = 0;

/** Uma requisicao, sem seguir redirecionamento; guarda os cookies. */
function pedir(url, { metodo = "GET", corpo = null } = {}) {
  return new Promise((resolver, rejeitar) => {
    const cabecalhos = {
      "User-Agent": USER_AGENT,
      "Accept-Encoding": "gzip, deflate, br",
      Cookie: [...cookies].map(([nome, valor]) => `${nome}=${valor}`).join("; "),
    };
    if (corpo) {
      cabecalhos["Content-Type"] = "application/x-www-form-urlencoded";
      cabecalhos["Content-Length"] = Buffer.byteLength(corpo);
    }

    const requisicao = https.request(url, { method: metodo, headers: cabecalhos, timeout: 120000 }, (resposta) => {
      for (const linha of resposta.headers["set-cookie"] ?? []) {
        const [par] = linha.split(";");
        const posicao = par.indexOf("=");
        cookies.set(par.slice(0, posicao).trim(), par.slice(posicao + 1).trim());
      }

      const partes = [];
      resposta.on("data", (parte) => partes.push(parte));
      resposta.on("end", () => {
        let bytes = Buffer.concat(partes);
        bytesRecebidos += bytes.length;
        const codificacao = resposta.headers["content-encoding"];
        if (codificacao === "gzip") bytes = zlib.gunzipSync(bytes);
        else if (codificacao === "deflate") bytes = zlib.inflateSync(bytes);
        else if (codificacao === "br") bytes = zlib.brotliDecompressSync(bytes);
        resolver({ status: resposta.statusCode, local: resposta.headers.location, texto: bytes.toString("utf-8") });
      });
    });
    requisicao.on("timeout", () => requisicao.destroy(new Error("tempo esgotado")));
    requisicao.on("error", rejeitar);
    if (corpo) requisicao.write(corpo);
    requisicao.end();
  });
}

async function abrir(url, opcoes) {
  let resposta = await pedir(url, opcoes);
  for (let saltos = 0; resposta.status >= 300 && resposta.status < 400 && resposta.local && saltos < 5; saltos++) {
    const proxima = new URL(resposta.local, url).toString();
    await esperar(RITMO_MS);
    resposta = await pedir(proxima);
    url = proxima;
  }
  return resposta;
}

const decodificar = (texto) =>
  texto
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const semTags = (html) => decodificar(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const reais = (texto) => {
  const achado = /R\$\s*([\d.]+,\d{2})/.exec(texto ?? "");
  return achado ? Number(achado[1].replace(/\./g, "").replace(",", ".")) : null;
};

/** O endereco da categoria vira os parametros do CategoriaResult.ashx. */
function parametrosDaCategoria(endereco) {
  const caminho = new URL(endereco).pathname.replace(/\.html?$/i, "");
  const trechos = caminho.split("/").filter(Boolean);
  if (trechos.length === 0) throw new Error("link sem categoria");
  if (trechos.length === 1) return { categoria: trechos[0], subcategoria: "" };
  return { categoria: trechos.at(-2), subcategoria: trechos.at(-1) };
}

/** Os itens do `html` da vitrine. */
function lerItens(html) {
  // As imagens em base64 sao 95% do texto e nao interessam aqui.
  const leve = html.replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/gi, "").replace(/<svg[\s\S]*?<\/svg>/gi, "");

  return leve
    .split(/<li\b/)
    .slice(1)
    .map((bloco) => {
      const titulo = /<div class="titulo">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(bloco);
      if (!titulo) return null;

      const linhaDetalhe = (rotulo) => {
        const achado = new RegExp(`<span[^>]*>\\s*${rotulo}[\\s\\S]*?</span\\s*>\\s*<p>([\\s\\S]*?)</p>`, "i").exec(bloco);
        return achado ? semTags(achado[1]) : null;
      };

      const faixas = [...bloco.matchAll(/<span>\s*([^<]*Unidades)\s*<\/span>\s*<p>\s*(R\$\s*[\d.,]+)/gi)].map((m) => ({
        quantidade: decodificar(m[1]).trim(),
        preco: reais(m[2]),
      }));

      return {
        codigo: /data-sku="([^"]+)"/.exec(bloco)?.[1] ?? /Ref:\s*([^<]+)/.exec(bloco)?.[1]?.trim() ?? null,
        nome: semTags(titulo[2]),
        url: decodificar(titulo[1]),
        preco: reais(/<span class="valor">([^<]+)</.exec(bloco)?.[1]),
        ipiPercentual: Number((/IPI[\s\S]*?<strong>([\d.,]+)%<\/strong>/.exec(bloco)?.[1] ?? "").replace(",", ".")) || 0,
        ipi: reais(linhaDetalhe("IPI")),
        st: reais(linhaDetalhe("ST")),
        precoComImpostos: reais(linhaDetalhe("PRE[ÇC]O UNIT\\. COM IMP\\.")),
        caixaInner: Number(/CX\. INNER<\/span>\s*<p>\s*(\d+)/.exec(bloco)?.[1] ?? 0),
        caixaMaster: Number(/CX\. MASTER<\/span>\s*<p>\s*(\d+)/.exec(bloco)?.[1] ?? 0),
        multiplo: Number(/adicionarMaisVitrini\('[^']*',\s*(\d+)\)/.exec(bloco)?.[1] ?? 1),
        faixas,
        compravel: /id="bt_comprar_/.test(bloco),
        semFoto: /sem_img\.jpg/.test(bloco),
      };
    })
    .filter(Boolean);
}

// 1) Login (o mesmo do teste-login-santana.js).
const comecou = Date.now();
console.log("1. entrando");
const paginaLogin = await abrir(`${BASE}/minhaconta/identificacao`);
const campos = new Map();
for (const [input] of paginaLogin.texto.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
  const nome = /name="([^"]+)"/i.exec(input)?.[1];
  if (nome && !campos.has(nome)) campos.set(nome, decodificar(/value="([^"]*)"/i.exec(input)?.[1] ?? ""));
}
campos.set("__EVENTTARGET", "ctl00$ContentPlaceHolder1$lkEntrar");
campos.set("__EVENTARGUMENT", "");
campos.set("ctl00$ContentPlaceHolder1$tblogin", usuario);
campos.set("ctl00$ContentPlaceHolder1$tbSenha", senha);
await esperar(RITMO_MS);
const aposLogin = await abrir(`${BASE}/minhaconta/identificacao`, {
  metodo: "POST",
  corpo: new URLSearchParams([...campos]).toString(),
});
if (!/>\s*SAIR\s*</i.test(aposLogin.texto)) {
  console.error("  o login nao entrou — confira SANTANA_USUARIO e SANTANA_SENHA");
  process.exit(1);
}
console.log("  logado");

// 2) Todas as paginas da vitrine da categoria, em cada ordenacao pedida.
/*
  A PAGINACAO DA SANTANA REPETE E PULA PRODUTOS. A ordem tem empates, e o site
  nao desempata: na Componentes (7.068), a pagina 40 de 100 veio inteira com
  itens das paginas 34 e 35, mesmo endereco. Quem se repete toma o lugar de
  alguem que nunca aparece. Por isso: nunca parar na pagina repetida (vai ate
  a ultima, pelo `total_registros`), e ler em mais de uma ordenacao, juntando
  pelo codigo. Cada ordenacao empata em lugares diferentes.
*/
const { categoria, subcategoria } = parametrosDaCategoria(link);
const ordenacoes = (argumento("ordenacoes") ?? "0").split(",").map((valor) => valor.trim());
console.log(`2. categoria=${categoria} subcategoria=${subcategoria || "(vazia)"} · ${porPagina} por pagina · ordenacoes ${ordenacoes.join(",")}`);

const itens = [];
const porCodigo = new Set();
let repetidos = 0;
let totalDeclarado = null;

let bloqueado = false;
for (const ordenacao of ordenacoes) {
  if (bloqueado || itens.length >= limite) break;
  const antes = itens.length;
  let ultimaPagina = Infinity;
  for (let pagina = 1; pagina <= ultimaPagina; pagina++) {
    await esperar(RITMO_MS);
    const consulta = new URLSearchParams({
      subcategoria,
      categoria,
      qtdePorPagina: String(porPagina),
      paginaAtual: String(pagina),
      ordenacao,
      busca: "",
      precoMin: "0",
      precoMax: "0",
      filtros: "",
      vitrine: "",
    });
    const inicioPagina = Date.now();
    let resposta;
    try {
      resposta = await abrir(`${BASE}/handlers/departamento/CategoriaResult.ashx?${consulta}`);
    } catch (erro) {
      // Conexao cortada e o sinal de bloqueio: para de vez, guarda o que leu.
      console.log(`  [ord ${ordenacao}] pagina ${pagina}: ${erro.code ?? erro.message} — PARANDO (possivel bloqueio)`);
      bloqueado = true;
      break;
    }
    let dados;
    try {
      dados = JSON.parse(resposta.texto);
    } catch {
      console.log(`  [ord ${ordenacao}] pagina ${pagina}: HTTP ${resposta.status}, resposta nao e JSON — parando`);
      break;
    }

    if (pagina === 1) {
      totalDeclarado = Number(dados.total_registros) || totalDeclarado;
      if (totalDeclarado) ultimaPagina = Math.ceil(totalDeclarado / porPagina);
    }

    const daPagina = lerItens(dados.html ?? "");
    let novos = 0;
    for (const item of daPagina) {
      if (porCodigo.has(item.codigo)) {
        repetidos++;
        continue;
      }
      if (itens.length >= limite) break;
      porCodigo.add(item.codigo);
      itens.push(item);
      novos++;
    }
    console.log(
      `  [ord ${ordenacao}] pagina ${String(pagina).padStart(3)}/${ultimaPagina}: ${daPagina.length} item(ns), ` +
        `${novos} novo(s) · ${((Date.now() - inicioPagina) / 1000).toFixed(1)}s · total ${itens.length}`,
    );
    if (daPagina.length === 0 || itens.length >= limite) break;
  }
  console.log(`  ordenacao ${ordenacao}: +${itens.length - antes} produto(s) · acumulado ${itens.length} de ${totalDeclarado}`);
}

// 3) Resumo.
const conta = (teste) => itens.filter(teste).length;
console.log("\nRESUMO");
console.log(`  declarados no site : ${totalDeclarado}`);
console.log(`  produtos           : ${itens.length}${repetidos ? ` (+${repetidos} repetido(s) descartado(s))` : ""}`);
console.log(`  com preco          : ${conta((i) => i.preco > 0)}`);
console.log(`  preco zero/ausente : ${conta((i) => !(i.preco > 0))}`);
console.log(`  com IPI            : ${conta((i) => i.ipiPercentual > 0)}`);
console.log(`  com ST             : ${conta((i) => i.st > 0)}`);
console.log(`  com faixas de qtd  : ${conta((i) => i.faixas.length > 0)}`);
console.log(`  multiplo > 1       : ${conta((i) => i.multiplo > 1)}`);
console.log(`  compraveis         : ${conta((i) => i.compravel)}`);
console.log(`  sem foto           : ${conta((i) => i.semFoto)}`);
console.log(`  baixado            : ${(bytesRecebidos / 1024 / 1024).toFixed(0)} MB`);
console.log(`  tempo              : ${((Date.now() - comecou) / 1000 / 60).toFixed(1)} min`);

console.log("\nAMOSTRA");
for (const item of itens.filter((_, indice) => indice % Math.max(1, Math.floor(itens.length / 8)) === 0).slice(0, 8)) {
  const faixas = item.faixas.map((f) => `${f.quantidade} R$ ${f.preco?.toFixed(2)}`).join(" · ");
  console.log(
    `  ${item.codigo.padEnd(14)} R$ ${String(item.preco?.toFixed(2)).padStart(8)} · c/ imp R$ ${item.precoComImpostos?.toFixed(2)}` +
      ` (IPI ${item.ipiPercentual}%) · mult ${item.multiplo} · ${item.compravel ? "compravel" : "SEM BOTAO"}` +
      `\n    ${item.nome.slice(0, 80)}${faixas ? `\n    faixas: ${faixas}` : ""}`,
  );
}

if (saida) {
  writeFileSync(saida, JSON.stringify(itens, null, 2));
  console.log(`\nitens gravados em ${saida}`);
}
