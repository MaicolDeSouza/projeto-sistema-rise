import "dotenv/config";

/**
 * ETAPA 2 do teste de fonte com login (17/09/2026): um programa consegue entrar
 * no portal da Santana sozinho e ler o preco de UM produto?
 *
 *   node scripts/teste-login-santana.js [url-do-produto]
 *   node scripts/teste-login-santana.js --lista=arquivo.txt   (etapa 3)
 *
 * O usuario e a senha vem do .env (SANTANA_USUARIO, SANTANA_SENHA) e nunca sao
 * impressos. Nada e gravado no banco. Sao tres requisicoes, com 2 s entre elas.
 *
 * A etapa 1 (no navegador, logado) mostrou o que se procura aqui:
 * - o login e um postback do ASP.NET WebForms, sem captcha;
 * - o preco vem no HTML do servidor, dentro de script:
 *   $('#valor').text('R$ 19,90') e $('td.descricao1').text('R$ 19,90 / un').
 *
 * Usa node:https, e nao fetch, pelo mesmo motivo da coleta (ver http.js).
 */

import https from "node:https";
import { readFileSync } from "node:fs";
import zlib from "node:zlib";

const BASE = "https://santanaimport.com.br";
const PRODUTO_PADRAO =
  `${BASE}/modulo-para-prototipagem-tipo-data-logger-shield-compativel-com-arduino-010-0340.htm?sku=010-0340`;
const USER_AGENT = process.env.COLETA_USER_AGENT || "SistemaRise/1.0 (coleta de precos para uso proprio)";

const usuario = process.env.SANTANA_USUARIO;
const senha = process.env.SANTANA_SENHA;
if (!usuario || !senha) {
  console.error("Falta SANTANA_USUARIO e/ou SANTANA_SENHA no .env.");
  process.exit(2);
}

const cookies = new Map();
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

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

    const requisicao = https.request(url, { method: metodo, headers: cabecalhos, timeout: 60000 }, (resposta) => {
      for (const linha of resposta.headers["set-cookie"] ?? []) {
        const [par] = linha.split(";");
        const posicao = par.indexOf("=");
        cookies.set(par.slice(0, posicao).trim(), par.slice(posicao + 1).trim());
      }

      const partes = [];
      resposta.on("data", (parte) => partes.push(parte));
      resposta.on("end", () => {
        let bytes = Buffer.concat(partes);
        const codificacao = resposta.headers["content-encoding"];
        if (codificacao === "gzip") bytes = zlib.gunzipSync(bytes);
        else if (codificacao === "deflate") bytes = zlib.inflateSync(bytes);
        else if (codificacao === "br") bytes = zlib.brotliDecompressSync(bytes);
        resolver({ status: resposta.statusCode, local: resposta.headers.location, html: bytes.toString("utf-8") });
      });
    });
    requisicao.on("timeout", () => requisicao.destroy(new Error("tempo esgotado")));
    requisicao.on("error", rejeitar);
    if (corpo) requisicao.write(corpo);
    requisicao.end();
  });
}

/** Segue redirecionamento no mesmo site, como o navegador. */
async function abrir(url, opcoes) {
  let resposta = await pedir(url, opcoes);
  for (let saltos = 0; resposta.status >= 300 && resposta.status < 400 && resposta.local && saltos < 5; saltos++) {
    const proxima = new URL(resposta.local, url).toString();
    console.log(`  ${resposta.status} -> ${proxima}`);
    await esperar(2000);
    resposta = await pedir(proxima);
    url = proxima;
  }
  return resposta;
}

const decodificar = (texto) =>
  texto.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Campos ocultos do formulario do ASP.NET (__VIEWSTATE e companhia). */
function camposOcultos(html) {
  const campos = new Map();
  for (const [input] of html.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
    const nome = /name="([^"]+)"/i.exec(input)?.[1];
    if (!nome || campos.has(nome)) continue;
    campos.set(nome, decodificar(/value="([^"]*)"/i.exec(input)?.[1] ?? ""));
  }
  return campos;
}

// "SAIR" so aparece para quem entrou; "PainelCliente" aparece tambem no anonimo.
const logado = (html) => />\s*SAIR\s*</i.test(html);

/** Os dados que interessam de uma pagina de produto ja aberta. */
function lerProduto(html) {
  const faixas = [...new Set([...html.matchAll(/\$\('td\.descricao\d'\)\.text\('([^']+)'\)/g)].map((m) => m[1]))];
  return {
    titulo: decodificar(/<meta property="og:title" content="([^"]+)"/i.exec(html)?.[1] ?? ""),
    sku: /Skuprod'\)\.text\('([^']+)'\)/.exec(html)?.[1] ?? null,
    marca: /MARCA DO PRODUTO:\s*(?:<[^>]+>\s*)*([^<]+)/i.exec(html)?.[1]?.trim() ?? null,
    preco: /\$\('#valor'\)\.text\('([^']+)'\)/.exec(html)?.[1] ?? null,
    faixas,
    indisponivel: /\$\('#divIndisponivel'\)\.css\('display',\s*'block'\)/.test(html),
    comprar: /\$\('#bt_comprar'\)\.css\('display',\s*'block'\)/.test(html),
    pedeLogin: /Login para visualizar o/i.test(html),
  };
}

// ETAPA 3: `--lista=arquivo` le varios produtos (um endereco por linha) com a
// mesma sessao, 2 s entre cada um. Responde se o portal aceita acessos seguidos
// e se a sessao se mantem.
const argLista = process.argv.find((arg) => arg.startsWith("--lista="));
const enderecos = argLista
  ? readFileSync(argLista.slice("--lista=".length), "utf-8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  : [process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? PRODUTO_PADRAO];

// 1) Pagina de login: pega os campos ocultos e o cookie de sessao.
console.log("1. abrindo a pagina de login");
const paginaLogin = await abrir(`${BASE}/minhaconta/identificacao`);
const campos = camposOcultos(paginaLogin.html);
console.log(`  HTTP ${paginaLogin.status} · ${campos.size} campos ocultos · __VIEWSTATE ${campos.has("__VIEWSTATE") ? "ok" : "AUSENTE"}`);

// 2) Postback do botao Entrar.
await esperar(2000);
console.log("2. enviando o login");
campos.set("__EVENTTARGET", "ctl00$ContentPlaceHolder1$lkEntrar");
campos.set("__EVENTARGUMENT", "");
campos.set("ctl00$ContentPlaceHolder1$tblogin", usuario);
campos.set("ctl00$ContentPlaceHolder1$tbSenha", senha);
const corpo = new URLSearchParams([...campos]).toString();
const aposLogin = await abrir(`${BASE}/minhaconta/identificacao`, { metodo: "POST", corpo });
console.log(`  HTTP ${aposLogin.status} · ${logado(aposLogin.html) ? "LOGADO" : "NAO parece logado"} · cookies: ${[...cookies.keys()].join(", ")}`);

// 3) Produtos com a sessao.
console.log(`3. lendo ${enderecos.length} produto(s)\n`);
const inicio = Date.now();
const resultados = [];
for (const [indice, endereco] of enderecos.entries()) {
  await esperar(2000);
  const comecou = Date.now();
  let linha;
  try {
    /*
      SEM `?sku=` A PAGINA MOSTRA O PADRAO DO MODELO, nao o produto: R$ 0,00 e
      "indisponivel". O sitemap lista os enderecos sem o parametro, e na primeira
      rodada 10 dos 20 vieram zerados. O codigo esta no campo oculto
      hdnSemAtributo da propria pagina, e o site aceita em minusculas — mas a
      barra do endereco nao da para separar ("tny276gn", "056-1489"), entao custa
      uma visita a mais por produto.
    */
    let resposta = await abrir(endereco);
    if (!/[?&]sku=/i.test(endereco)) {
      const codigo = /id="ctl00_ContentPlaceHolder1_hdnSemAtributo" value="([^"]+)"/.exec(resposta.html)?.[1];
      if (codigo) {
        await esperar(2000);
        resposta = await abrir(`${endereco}?sku=${encodeURIComponent(codigo)}`);
      }
    }
    const dados = lerProduto(resposta.html);
    linha = { endereco, status: resposta.status, ms: Date.now() - comecou, ...dados };
  } catch (erro) {
    linha = { endereco, status: null, ms: Date.now() - comecou, erro: erro.message };
  }
  resultados.push(linha);

  const numero = String(indice + 1).padStart(2);
  if (linha.erro) {
    console.log(`${numero}. ERRO ${linha.erro} · ${endereco}`);
    continue;
  }
  const situacao = linha.pedeLogin ? "PEDE LOGIN" : linha.indisponivel ? "indisponivel" : linha.comprar ? "compravel" : "sem botao";
  console.log(
    `${numero}. HTTP ${linha.status} · ${(linha.ms / 1000).toFixed(1)}s · ${(linha.sku ?? "?").padEnd(14)} · ` +
      `${(linha.preco ?? "SEM PRECO").padEnd(12)} · ${situacao}` +
      (linha.faixas.length > 1 ? ` · faixas: ${linha.faixas.join(" / ")}` : "") +
      `\n    ${linha.titulo.slice(0, 90)}${linha.marca ? ` · marca ${linha.marca}` : ""}`,
  );
}

const lidos = resultados.filter((r) => r.status === 200 && !r.erro);
const comPreco = resultados.filter((r) => r.preco && !r.pedeLogin);
const perdeuSessao = resultados.findIndex((r) => r.pedeLogin);
const naoOk = resultados.filter((r) => r.status !== 200);

console.log("\nRESUMO");
console.log(`  paginas 200     : ${lidos.length} de ${resultados.length}`);
console.log(`  com preco       : ${comPreco.length}`);
console.log(`  sem preco       : ${resultados.length - comPreco.length}`);
console.log(`  sessao          : ${perdeuSessao === -1 ? "valeu do inicio ao fim" : `caiu no produto ${perdeuSessao + 1}`}`);
console.log(`  status != 200   : ${naoOk.map((r) => r.status ?? "erro").join(", ") || "nenhum"}`);
console.log(`  tempo total     : ${((Date.now() - inicio) / 1000).toFixed(0)} s`);

process.exit(comPreco.length === resultados.length ? 0 : 1);
