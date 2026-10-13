import "dotenv/config";

/**
 * Bancada da descricao: gera a descricao do MESMO produto em varios modelos e mostra as respostas lado a lado, com o
 * custo de cada uma (pedido do dono em 13/10/2026: "se o Sonnet mapear os sinonimos e as decisoes igual, a economia
 * e de 60%").
 *
 *   npm run bancada:descricao -- --sku=100101 --prompt=docs/prompts-descricao/embarcados/01-arduino.txt --modelos=claude-opus-5-5,claude-sonnet-5-5
 *
 * Sem `--rodar` NAO chama a IA (nao gasta nada): so mostra o que seria enviado. Com `--rodar` cada modelo gera uma
 * descricao de verdade (Opus 5.5 com effort low custa perto de R$ 1 por geracao). As referencias sao as mesmas da
 * tela: os concorrentes e fornecedores SALVOS no produto. O Rise nao grava nada; so le o banco e escreve o relatorio
 * em `dados/diag/`.
 *
 * `--prompt` aceita: um arquivo (.txt), o nome de um prompt da biblioteca, ou `sistema` (o do codigo).
 * O modelo vale por PROCESSO (`IA_MODELO`), entao o script se chama de novo, uma vez por modelo (`--filho`).
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { register } from "node:module";

register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const argumentos = Object.fromEntries(
  process.argv.slice(2).map((texto) => {
    const [chave, ...resto] = texto.replace(/^--/, "").split("=");
    return [chave, resto.length > 0 ? resto.join("=") : true];
  }),
);

function sair(mensagem) {
  console.error(mensagem);
  process.exit(1);
}

if (!argumentos.sku || typeof argumentos.sku !== "string") sair("Informe --sku=<codigo do produto>.");
const modelos = String(argumentos.modelos ?? "claude-opus-5-5").split(",").map((texto) => texto.trim()).filter(Boolean);
if (modelos.length === 0) sair("Informe --modelos=<id>,<id>.");

const { prisma } = await import("@/lib/db");

/** O texto do prompt: arquivo, biblioteca ou o do codigo. */
async function carregarPrompt(pedido) {
  const { PROMPT_DESCRICAO_PADRAO } = await import("@/lib/ia/anuncio");
  if (!pedido || pedido === true || pedido === "sistema") return { nome: "Padrão do sistema (código)", texto: PROMPT_DESCRICAO_PADRAO };
  if (existsSync(pedido)) return { nome: pedido, texto: readFileSync(pedido, "utf8").trim() };
  const linha = await prisma.promptDescricao.findFirst({ where: { nome: { equals: pedido, mode: "insensitive" } } });
  if (!linha) sair(`Prompt "${pedido}" não existe: use um arquivo .txt, o nome de um prompt da biblioteca ou "sistema".`);
  return { nome: linha.nome, texto: linha.texto };
}

/** Produto e as referencias salvas nele (as mesmas que a tela usa), ja resolvidas para ids de `ProdutoColetado`. */
async function carregarProduto(sku) {
  const produto = await prisma.produto.findUnique({
    where: { sku },
    select: {
      sku: true,
      tituloBase: true,
      marca: true,
      modelo: true,
      descricaoBase: true,
      concorrentes: { select: { produtoColetadoId: true } },
      fornecedores: { select: { codigo: true, link: true, fornecedor: { select: { nome: true } } } },
    },
  });
  if (!produto) sair(`Produto ${sku} não existe neste banco.`);
  const { buscarReferencias } = await import("@/lib/buscaPorPalavras");
  const idsConcorrentesLigados = produto.concorrentes.map((item) => item.produtoColetadoId).filter(Boolean);
  const fornecedoresLigados = produto.fornecedores.map((item) => ({ nome: item.fornecedor.nome, codigo: item.codigo, link: item.link }));
  const { itens } = await buscarReferencias("", { limite: 0, fornecedoresLigados, idsConcorrentesLigados });
  return { produto, ids: itens.map((item) => item.id) };
}

// ---------------------------------------------------------------------------------------------- processo filho
// US$ por 1 milhao de tokens (pagina oficial da OpenAI, conferida em 13/10/2026). `emCache` e o preco do que o cache automatico lê.
const PRECOS_OPENAI = {
  "gpt-6.1-sol": { entrada: 2, emCache: 0.1, saida: 10 },
  "gpt-6-sol": { entrada: 2, emCache: 0.2, saida: 10 },
  "gpt-6-luna": { entrada: 0.1, emCache: 0.01, saida: 0.5 },
  "gpt-6-astra": { entrada: 10, emCache: 1, saida: 50 },
  "gpt-5.4-mini": { entrada: 0.75, emCache: 0.075, saida: 4.5 },
  "gpt-4.1-mini": { entrada: 0.4, emCache: 0.1, saida: 1.6 },
};

if (argumentos.filho) {
  // Modelo GPT: o cliente da Anthropic e criado na primeira chamada, entao o adaptador troca o `fetch` antes dela.
  const ehGpt = /^(gpt-|o\d)/.test(process.env.IA_MODELO ?? "");
  if (ehGpt) {
    process.env.ANTHROPIC_API_KEY ||= "adaptador-openai"; // a `chamar` exige a variavel; a chamada nunca chega la
    const { instalarAdaptadorOpenAI } = await import("./lib/gptComoAnthropic.js");
    const { lerChave } = await import("@/lib/riseAi/configuracao");
    instalarAdaptadorOpenAI({ obterChave: () => lerChave("openai") });
  }
  const { gerarDescricao, MODELO_IA, esforcoDaTarefa } = await import("@/lib/ia/anuncio");
  const { custoDaChamada } = await import("@/lib/riseAi/modelos");
  const { cotacaoDoDolar } = await import("@/lib/cotacaoDolar");
  const { produto, ids } = await carregarProduto(argumentos.sku);
  const prompt = await carregarPrompt(argumentos.prompt);

  const inicio = new Date(Date.now() - 2000);
  const t0 = Date.now();
  let resultado = null;
  let erro = null;
  try {
    resultado = await gerarDescricao(
      ids,
      { titulo: produto.tituloBase, sku: produto.sku, marca: produto.marca ?? "", modelo: produto.modelo ?? "", descricao: produto.descricaoBase ?? "" },
      prompt.texto,
    );
  } catch (falha) {
    erro = falha.message;
  }
  const ms = Date.now() - t0;

  // Os tokens saem do log de cada chamada (a descricao pode fazer duas: a segunda encurta paragrafo longo).
  const logs = await prisma.logIntegracao.findMany({
    where: { servico: "ANTHROPIC", criadoEm: { gte: inicio }, requestResumo: { contains: '"tarefa":"descricao"' } },
    select: { responseResumo: true },
  });
  const tokens = { chamadas: logs.length, entrada: 0, saida: 0, pensamento: 0, cacheLido: 0, cacheGravado: 0, semCache: 0 };
  for (const log of logs) {
    const uso = JSON.parse(log.responseResumo ?? "{}").usage ?? {};
    tokens.semCache += uso.input_tokens ?? 0;
    tokens.cacheLido += uso.cache_read_input_tokens ?? 0;
    tokens.cacheGravado += uso.cache_creation_input_tokens ?? 0;
    tokens.saida += uso.output_tokens ?? 0;
    tokens.pensamento += uso.output_tokens_details?.thinking_tokens ?? 0;
  }
  tokens.entrada = tokens.semCache + tokens.cacheLido + tokens.cacheGravado;
  // Gravar no cache custa 1,25x e ler 0,1x o preco de entrada (como a Anthropic cobra).
  const entradaPonderada = tokens.semCache + tokens.cacheGravado * 1.25 + tokens.cacheLido * 0.1;
  let custo;
  if (ehGpt) {
    // Na OpenAI o raciocinio ja vem dentro de `output_tokens`, e o cache automatico lido custa o preco de "emCache".
    const preco = PRECOS_OPENAI[MODELO_IA];
    const usd = preco ? (tokens.semCache * preco.entrada + tokens.cacheLido * preco.emCache + tokens.saida * preco.saida) / 1e6 : null;
    custo = usd === null ? null : { usd, brl: usd * cotacaoDoDolar().valor };
  } else {
    custo = custoDaChamada({ provedor: "anthropic", modelo: MODELO_IA, tokensEntrada: entradaPonderada, tokensSaida: tokens.saida });
  }

  writeFileSync(
    String(argumentos.saida),
    JSON.stringify({
      modelo: MODELO_IA,
      effort: esforcoDaTarefa("descricao"),
      prompt: prompt.nome,
      referencias: ids.length,
      erro,
      ms,
      tokens,
      custo,
      texto: resultado?.texto ?? null,
      opcoesParagrafos: resultado?.opcoesParagrafos ?? [],
      fontesDasLinhas: resultado?.fontesDasLinhas ?? {},
      quadros: (resultado?.divergencias ?? []).map((quadro) => ({
        campo: quadro.campo,
        ids: quadro.ids ?? [quadro.id],
        posicao: quadro.posicao,
        recomendada: quadro.recomendada,
        motivo: quadro.motivo,
        opcoes: quadro.opcoes.map((opcao) => ({ linha: opcao.linha, lojas: [...new Set(opcao.fontes.map((fonte) => fonte.nome))] })),
      })),
    }),
  );
  await prisma.$disconnect();
  process.exit(0);
}

// -------------------------------------------------------------------------------------------- processo principal
const { produto, ids } = await carregarProduto(argumentos.sku);
const prompt = await carregarPrompt(argumentos.prompt);

if (!argumentos.rodar) {
  const linhas = ids.length
    ? await prisma.produtoColetado.findMany({ where: { id: { in: ids } }, select: { descricao: true, especificacoes: true } })
    : [];
  const descricoes = linhas.reduce((soma, linha) => soma + (linha.descricao?.length ?? 0), 0);
  const fichas = linhas.reduce((soma, linha) => soma + JSON.stringify(linha.especificacoes ?? []).length, 0);
  console.log(`Produto ${produto.sku}: ${produto.tituloBase}`);
  console.log(`Prompt: ${prompt.nome} (${prompt.texto.length} caracteres)`);
  console.log(`Referências salvas: ${ids.length} (descrições ${descricoes} caracteres, fichas ${fichas})`);
  // ~2 caracteres por token (medido em 13/10/2026: 27,6 mil tokens para ~55 mil caracteres, texto em portugues e JSON).
  for (const modelo of modelos) console.log(`  ${modelo} · effort low · ~${Math.round((descricoes + fichas + prompt.texto.length) / 2)} tokens de entrada (sem as divergências)`);
  console.log("\nNada foi enviado à IA. Rode com --rodar para gerar de verdade (gasta dinheiro).");
  await prisma.$disconnect();
  process.exit(0);
}

const pasta = join(process.cwd(), "dados", "diag");
mkdirSync(pasta, { recursive: true });
const resultados = [];
for (const modelo of modelos) {
  const saida = join(tmpdir(), `bancada-${Date.now()}-${modelo}.json`);
  console.log(`\n== ${modelo}: gerando (um processo próprio)...`);
  const filho = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), `--sku=${argumentos.sku}`, `--prompt=${argumentos.prompt ?? "sistema"}`, "--filho", `--saida=${saida}`],
    { env: { ...process.env, IA_MODELO: modelo }, stdio: ["ignore", "inherit", "inherit"] },
  );
  if (filho.status !== 0 || !existsSync(saida)) {
    console.error(`${modelo}: o processo terminou com código ${filho.status}.`);
    resultados.push({ modelo, erro: `processo terminou com código ${filho.status}` });
    continue;
  }
  const resultado = JSON.parse(readFileSync(saida, "utf8"));
  resultados.push(resultado);
  const reais = resultado.custo ? `R$ ${resultado.custo.brl.toFixed(4)}` : "sem preço cadastrado";
  console.log(`   ${resultado.erro ? "ERRO: " + resultado.erro : "ok"} · ${(resultado.ms / 1000).toFixed(1)} s · ${reais} · ${resultado.tokens.entrada} entrada / ${resultado.tokens.saida} saída (${resultado.tokens.pensamento} de raciocínio)`);
}

/** As linhas "- Nome: valor;" da secao Especificacoes tecnicas de um texto final, como { nome: valor }. */
function especificacoes(texto) {
  const mapa = {};
  let dentro = false;
  for (const linha of String(texto ?? "").split("\n")) {
    if (/^Especificações técnicas:/i.test(linha)) { dentro = true; continue; }
    if (dentro && !linha.trim()) break;
    const achado = dentro && /^- ([^:]+): (.*);$/.exec(linha.trim());
    if (achado) mapa[achado[1].trim()] = achado[2].trim();
  }
  return mapa;
}

/**
 * O texto final com a opcao RECOMENDADA pela IA em cada quadro de divergencia, na posicao que a IA reservou (quantas linhas
 * comuns vem antes dele; posicao alem da ultima vai para o fim, na ordem dos quadros). O texto "opcoes 1 de cada" nao tem
 * essas linhas: Microcontrolador, Tensao, Dimensoes e Peso, quando divergem, so existem dentro dos quadros.
 */
function textoComRecomendadas(texto, quadros) {
  const linhas = String(texto ?? "").split("\n");
  const inicio = linhas.findIndex((linha) => /^Especificações técnicas:/i.test(linha));
  if (inicio < 0 || quadros.length === 0) return texto ?? "";
  let fim = inicio + 1;
  while (fim < linhas.length && linhas[fim].trim()) fim += 1;
  const comuns = linhas.slice(inicio + 1, fim);
  const doQuadro = (quadro) => quadro.opcoes[quadro.recomendada ?? 0]?.linha;
  const montadas = [];
  for (let posicao = 0; posicao <= comuns.length; posicao += 1) {
    for (const quadro of quadros.filter((q) => q.posicao === posicao)) if (doQuadro(quadro)) montadas.push(doQuadro(quadro));
    if (posicao < comuns.length) montadas.push(comuns[posicao]);
  }
  for (const quadro of quadros.filter((q) => q.posicao > comuns.length)) if (doQuadro(quadro)) montadas.push(doQuadro(quadro));
  return [...linhas.slice(0, inicio + 1), ...montadas, ...linhas.slice(fim)].join("\n");
}

const dois = (valor) => String(valor).padStart(2, "0");
const agora = new Date();
const carimbo = `${agora.getFullYear()}${dois(agora.getMonth() + 1)}${dois(agora.getDate())}-${dois(agora.getHours())}${dois(agora.getMinutes())}`;
const arquivo = join(pasta, `bancada-descricao-${argumentos.sku}-${carimbo}.md`);

const md = [`# Bancada da descrição — ${produto.sku} ${produto.tituloBase}`, "", `Prompt: ${prompt.nome} · ${ids.length} referências · ${agora.toLocaleString("pt-BR")}`, ""];
md.push("## Custo e tempo", "", "| Modelo | Custo | Tempo | Entrada | Saída | Raciocínio | Chamadas | Resultado |", "| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const r of resultados) {
  md.push(r.tokens
    ? `| ${r.modelo} | ${r.custo ? "R$ " + r.custo.brl.toFixed(4) : "sem preço"} | ${(r.ms / 1000).toFixed(1)} s | ${r.tokens.entrada} | ${r.tokens.saida} | ${r.tokens.pensamento} | ${r.tokens.chamadas} | ${r.erro ?? "ok"} |`
    : `| ${r.modelo} | — | — | — | — | — | — | ${r.erro} |`);
}

const comTexto = resultados.filter((r) => r.texto);
if (comTexto.length > 1) {
  const porModelo = comTexto.map((r) => ({ modelo: r.modelo, mapa: especificacoes(r.texto) }));
  const nomes = [...new Set(porModelo.flatMap((m) => Object.keys(m.mapa)))];
  const diferentes = nomes.filter((nome) => new Set(porModelo.map((m) => m.mapa[nome] ?? "(ausente)")).size > 1);
  md.push("", `## Características: ${nomes.length - diferentes.length} iguais nos ${comTexto.length} modelos, ${diferentes.length} diferentes`, "");
  if (diferentes.length > 0) {
    md.push(`| Campo | ${porModelo.map((m) => m.modelo).join(" | ")} |`, `| --- | ${porModelo.map(() => "---").join(" | ")} |`);
    for (const nome of diferentes) md.push(`| ${nome} | ${porModelo.map((m) => m.mapa[nome] ?? "(ausente)").join(" | ")} |`);
  }
  md.push("", "## Quadros de divergência por modelo", "");
  for (const r of comTexto) md.push(`- ${r.modelo}: ${r.quadros.length ? r.quadros.map((q) => q.campo).join(" · ") : "nenhum"}`);
}

for (const r of resultados) {
  md.push("", "---", "", `## ${r.modelo}`);
  if (r.erro && !r.texto) { md.push("", `Erro: ${r.erro}`); continue; }
  r.opcoesParagrafos.forEach((opcoes, grupo) => {
    md.push("", `### Parágrafo ${grupo + 1}`, "");
    opcoes.forEach((opcao, indice) => md.push(`${indice + 1}. (${opcao.length}) ${opcao}`));
  });
  md.push("", "### Quadros de divergência", "");
  if (r.quadros.length === 0) md.push("Nenhum.");
  for (const q of r.quadros) {
    md.push(`**${q.campo}** (posição ${q.posicao}, ids: ${q.ids.join(", ")})`, "");
    q.opcoes.forEach((opcao, indice) => md.push(`- ${q.recomendada === indice ? "★ " : ""}${opcao.linha} — ${opcao.lojas.join(", ")}`));
    if (q.motivo) md.push("", `  motivo: ${q.motivo}`);
    md.push("");
  }
  md.push("### Texto final (opções 1 de cada)", "", "```text", r.texto ?? "", "```");
  if (r.quadros.length > 0) md.push("", "### Texto final com as recomendadas da IA", "", "```text", textoComRecomendadas(r.texto, r.quadros), "```");
}

writeFileSync(arquivo, md.join("\n"));
console.log(`\nRelatório: ${arquivo}`);
await prisma.$disconnect();
