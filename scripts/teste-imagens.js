import "dotenv/config";

/**
 * Testes da padronizacao de imagem (`src/lib/imagens/padronizar.js`). SEM rede: as
 * fotos sao geradas aqui mesmo com o sharp. As secoes de cima nao usam o banco; a
 * ultima ("Gravacao no produto") usa o Postgres e a pasta dados/ com um produto de
 * teste que e apagado no fim.
 *
 *   npm run teste:imagens
 */

import { pathToFileURL } from "node:url";
import { register } from "node:module";

import sharp from "sharp";

register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { LADO_PADRAO, PESO_ALVO_BYTES, padronizarImagem } = await import(
  "../src/lib/imagens/padronizar.js"
);

const semAcento = (texto) => String(texto ?? "").normalize("NFD").replace(/\p{M}/gu, "");
// As mensagens ganharam acento (07/10/2026); os padroes do teste comparam o texto sem acento.
let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

const VERMELHO = { r: 200, g: 30, b: 30 };

/** Foto de teste: fundo cinza-azulado com um bloco vermelho no meio. */
async function foto(largura, altura, formato = "jpeg", extra = {}) {
  const bloco = await sharp({
    create: { width: Math.round(largura / 2), height: Math.round(altura / 2), channels: 3, background: VERMELHO },
  })
    .png()
    .toBuffer();

  const base = sharp({
    create: {
      width: largura,
      height: altura,
      channels: extra.alfa ? 4 : 3,
      background: extra.alfa ? { r: 0, g: 0, b: 0, alpha: 0 } : { r: 90, g: 110, b: 140 },
    },
  }).composite([{ input: bloco, gravity: "centre" }]);

  if (formato === "png") return base.png().toBuffer();
  if (formato === "webp") return base.webp().toBuffer();
  if (formato === "gif") return base.gif().toBuffer();
  return base.jpeg({ quality: 92 }).withMetadata(extra.orientacao ? { orientation: extra.orientacao } : {}).toBuffer();
}

/** Pixel RGB (0-255) de uma coordenada da imagem ja padronizada. */
async function pixel(bytes, x, y) {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true });
  const canais = info.channels;
  const i = (y * info.width + x) * canais;
  return [data[i], data[i + 1], data[i + 2]];
}

const proximoDoBranco = ([r, g, b]) => r >= 250 && g >= 250 && b >= 250;

// ---------------------------------------------------------------------------
console.log("\nForma do resultado");
{
  const r = await padronizarImagem(await foto(2000, 1500));
  conferir("foto grande e aceita", r.ok, true);
  conferir("sai 1024x1024", [r.largura, r.altura], [LADO_PADRAO, LADO_PADRAO]);
  conferir("sai JPEG", r.mimeType, "image/jpeg");
  conferir("2000x1500 nao e ampliada", r.ampliada, false);
  conferir("guarda o tamanho da origem", [r.origem.largura, r.origem.altura], [2000, 1500]);
  conferir("cabe no peso alvo", r.bytes.length <= PESO_ALVO_BYTES, true);

  const meta = await sharp(r.bytes).metadata();
  conferir("o arquivo de fato e JPEG", meta.format, "jpeg");
  conferir("o arquivo de fato e 1024x1024", [meta.width, meta.height], [1024, 1024]);
  conferir("sem canal alfa", Boolean(meta.hasAlpha), false);

  // 2000x1500 em quadrado vira 1024x768, centrado: faixa branca em cima e embaixo.
  conferir("faixa de cima e branca", proximoDoBranco(await pixel(r.bytes, 512, 4)), true);
  conferir("faixa de baixo e branca", proximoDoBranco(await pixel(r.bytes, 512, 1019)), true);
  conferir("o meio tem a foto", proximoDoBranco(await pixel(r.bytes, 512, 512)), false);
}

// ---------------------------------------------------------------------------
console.log("\nAmpliacao (sem tamanho minimo)");
{
  const pequena = await padronizarImagem(await foto(600, 520));
  conferir("600x520 e aceita", pequena.ok, true);
  conferir("600x520 e ampliada", pequena.ampliada, true);
  conferir("600x520 sai 1024x1024", [pequena.largura, pequena.altura], [1024, 1024]);

  conferir("1023x900 e ampliada", (await padronizarImagem(await foto(1023, 900))).ampliada, true);
  conferir("1024x700 nao e ampliada", (await padronizarImagem(await foto(1024, 700))).ampliada, false);
  conferir("3000x2000 nao e ampliada", (await padronizarImagem(await foto(3000, 2000))).ampliada, false);

  // Decisao do dono em 20/09/2026: qualquer tamanho. Antes, abaixo de 500 px no menor
  // lado a foto era recusada; agora e ampliada e marcada.
  for (const [l, a] of [[500, 500], [499, 800], [400, 900], [300, 300], [120, 90]]) {
    const r = await padronizarImagem(await foto(l, a));
    conferir(`${l}x${a} e aceita e ampliada`, [r.ok, r.ampliada], [true, true]);
    conferir(`${l}x${a} sai 1024x1024`, [r.largura, r.altura], [1024, 1024]);
  }
  const tiny = await padronizarImagem(await foto(1, 1));
  conferir("1x1 nao derruba o processo", typeof tiny.ok, "boolean");
}

// ---------------------------------------------------------------------------
console.log("\nTransparencia e formatos");
{
  const png = await padronizarImagem(await foto(800, 800, "png", { alfa: true }));
  conferir("PNG transparente e aceito", png.ok, true);
  // Sem `flatten` o JPEG sairia com o fundo transparente virando PRETO.
  conferir("transparencia vira branco, nao preto", proximoDoBranco(await pixel(png.bytes, 3, 3)), true);
  conferir("PNG transparente: canto oposto tambem", proximoDoBranco(await pixel(png.bytes, 1020, 1020)), true);

  const webp = await padronizarImagem(await foto(800, 800, "webp"));
  conferir("WebP e aceito", webp.ok, true);
  conferir("WebP sai JPEG", webp.mimeType, "image/jpeg");

  const gif = await padronizarImagem(await foto(800, 800, "gif"));
  conferir("GIF e recusado", gif.ok, false);
  conferir("recusa cita o formato", /gif/.test(semAcento(gif.erro)), true);

  const svg = await padronizarImagem(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800"/>'));
  conferir("SVG e recusado", svg.ok, false);
}

// ---------------------------------------------------------------------------
console.log("\nJa padronizada nao e refeita");
{
  const original = await sharp({
    create: { width: 1024, height: 1024, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
  const r = await padronizarImagem(original);
  conferir("1024x1024 JPEG leve passa direto", r.jaPadrao, true);
  conferir("os bytes sao os mesmos", r.bytes.equals(original), true);
  conferir("nao conta como ampliada", r.ampliada, false);

  const emPng = await sharp(original).png().toBuffer();
  const convertida = await padronizarImagem(emPng);
  conferir("1024x1024 em PNG e convertida para JPEG", [convertida.ok, convertida.jaPadrao], [true, false]);
  conferir("... e sai JPEG", (await sharp(convertida.bytes).metadata()).format, "jpeg");
}

// ---------------------------------------------------------------------------
console.log("\nPeso");
{
  // Ruido puro e o pior caso para o JPEG: nao ha o que comprimir. Entra como PNG, e nao como JPEG de
  // qualidade 98: o JPEG ja alisava o ruido, e com o codificador comum o resultado a qualidade 90 ficava
  // perto de 1 MB e, uma vez em cinco, cabia sem perder qualidade (o teste ficava instavel).
  const ruido = await sharp(Buffer.from(Array.from({ length: 1024 * 1024 * 3 }, () => Math.floor(Math.random() * 256))), {
    raw: { width: 1024, height: 1024, channels: 3 },
  })
    .png()
    .toBuffer();
  conferir("o ruido de teste passa do peso alvo", ruido.length > PESO_ALVO_BYTES, true);

  const r = await padronizarImagem(ruido);
  conferir("foto pesada e aceita", r.ok, true);
  conferir("perdeu qualidade para caber", r.qualidade < 90, true);
  conferir("ficou menor que a original", r.bytes.length < ruido.length, true);
  // 4 MB e o teto da Loja Integrada, o mais apertado dos tres canais.
  conferir("abaixo de 4 MB", r.bytes.length < 4 * 1024 * 1024, true);

  const leve = await padronizarImagem(await foto(1600, 1200));
  conferir("foto comum sai na qualidade maxima", leve.qualidade, 90);
}

// ---------------------------------------------------------------------------
console.log("\nOrientacao EXIF");
{
  // 900x600 gravada de lado (orientacao 6): o operador ve 600x900, em pe.
  const deLado = await foto(900, 600, "jpeg", { orientacao: 6 });
  const r = await padronizarImagem(deLado);
  conferir("foto deitada com EXIF 6 e aceita", r.ok, true);
  conferir("a origem e medida como o operador ve", [r.origem.largura, r.origem.altura], [600, 900]);
  // Em pe dentro do quadrado: sobra branco nas laterais, nao em cima.
  conferir("laterais brancas (foto em pe)", proximoDoBranco(await pixel(r.bytes, 4, 512)), true);
  conferir("topo com foto", proximoDoBranco(await pixel(r.bytes, 512, 4)), false);

  // 900x400 com EXIF 6 e 400x900 para quem olha: a medida da origem e a girada.
  const girada = await padronizarImagem(await foto(900, 400, "jpeg", { orientacao: 6 }));
  conferir("foto pequena girada e aceita", girada.ok, true);
  conferir("a medida da origem e a girada", [girada.origem.largura, girada.origem.altura], [400, 900]);
}

// ---------------------------------------------------------------------------
console.log("\nEntradas invalidas");
{
  conferir("buffer vazio", (await padronizarImagem(Buffer.alloc(0))).ok, false);
  conferir("nulo", (await padronizarImagem(null)).ok, false);
  conferir("texto no lugar de imagem", (await padronizarImagem(Buffer.from("isto nao e uma foto"))).ok, false);

  const truncada = (await foto(800, 800)).subarray(0, 300);
  conferir("JPEG cortado no meio", (await padronizarImagem(truncada)).ok, false);

  const gigante = await padronizarImagem(Buffer.alloc(26 * 1024 * 1024, 1));
  conferir("acima de 25 MB e recusada sem ler", gigante.ok, false);
  conferir("a recusa diz o limite", /25 MB/.test(semAcento(gigante.erro)), true);
}

// ---------------------------------------------------------------------------
// Integracao: `anexarImagens` de verdade, no banco e no disco (sem rede: as fotos
// entram como data URI). Usa um produto descartavel, apagado no fim.
// ---------------------------------------------------------------------------
console.log("\nGravacao no produto (usa o Postgres e a pasta dados/)");

const SKU_TESTE = "ZZ-TESTE-IMAGENS";
const SKU_EDICAO = "ZZ-TESTE-IMAGENS-EDICAO";
const SKU_RESERVA = "ZZ-TESTE-RESERVA";
const SKU_SALVAR = "ZZ-TESTE-RESERVA-SALVAR";
const SKU_REABRIR = "ZZ-TESTE-RESERVA-REABRIR";
const { prisma } = await import("../src/lib/db.js");
const { anexarImagens } = await import("../src/lib/imagensImportadas.js");
const { caminhoDe, apagarPastaProduto } = await import("../src/lib/arquivos.js");
const { readFile } = await import("node:fs/promises");

const dataUri = (bytes, tipo) => `data:${tipo};base64,${bytes.toString("base64")}`;

try {
  await prisma.produto.deleteMany({ where: { sku: SKU_TESTE } });
  await apagarPastaProduto(SKU_TESTE);
  const produto = await prisma.produto.create({ data: { sku: SKU_TESTE, tituloBase: "Produto de teste de imagens" } });

  const fontes = [
    { tipo: "endereco", endereco: dataUri(await foto(2000, 1500), "image/jpeg") },
    { tipo: "endereco", endereco: dataUri(await foto(700, 700, "png"), "image/png") },
    { tipo: "endereco", endereco: dataUri(await foto(300, 300), "image/jpeg") },
    { tipo: "endereco", endereco: dataUri(await foto(800, 800, "gif"), "image/gif") },
    { tipo: "endereco", endereco: "ftp://exemplo.invalid/foto.jpg" },
  ];
  const r = await anexarImagens(produto.id, SKU_TESTE, fontes);
  conferir("3 fotos gravadas (a de 300 px entra, ampliada)", r.salvas, 3);
  conferir("2 ampliadas (700 px e 300 px)", r.ampliadas, 2);
  conferir("2 recusadas (GIF, endereco)", r.recusadas.length, 2);

  const linhas = await prisma.produtoArquivo.findMany({
    where: { produtoId: produto.id, tipo: "IMAGEM" },
    orderBy: { ordem: "asc" },
  });
  conferir("3 linhas no banco", linhas.length, 3);
  conferir("a primeira e a principal", linhas.map((l) => l.principal), [true, false, false]);
  conferir("todas gravadas como JPEG", linhas.map((l) => l.mimeType), ["image/jpeg", "image/jpeg", "image/jpeg"]);

  for (const [indice, linha] of linhas.entries()) {
    const bytes = await readFile(caminhoDe(SKU_TESTE, "IMAGEM", linha.arquivo));
    const meta = await sharp(bytes).metadata();
    conferir(`arquivo ${indice + 1} no disco: 1024x1024 JPEG`, [meta.format, meta.width, meta.height], ["jpeg", 1024, 1024]);
    conferir(`arquivo ${indice + 1}: tamanho gravado confere com o disco`, linha.tamanhoBytes, bytes.length);
  }

  // Copiar de outro produto: a foto ja e padrao e nao pode ser recomprimida.
  const copia = await anexarImagens(produto.id, SKU_TESTE, [
    { tipo: "arquivo", sku: SKU_TESTE, nome: linhas[0].arquivo },
  ]);
  conferir("copia de foto ja padronizada e gravada", [copia.salvas, copia.ampliadas], [1, 0]);
  const todas = await prisma.produtoArquivo.findMany({
    where: { produtoId: produto.id, tipo: "IMAGEM" },
    orderBy: { ordem: "asc" },
  });
  conferir("a copia tem os mesmos bytes da original", todas[3].tamanhoBytes, linhas[0].tamanhoBytes);
  conferir("a copia nao vira principal", todas[3].principal, false);

  // -------------------------------------------------------------------------
  // Lote de fotos do produto novo, Photoroom e a trava de compra. SEM rede: o `fetch` e
  // trocado por um falso que devolve uma imagem de teste, e as chaves sao inventadas.
  // -------------------------------------------------------------------------
  console.log("\nPhotoroom: regras e trava (sem rede)");
  const { randomUUID } = await import("node:crypto");
  const { avaliarConfiguracao, camposDaEdicao, editarImagem, mensagemDeErro, opcoesCanonicas } = await import(
    "../src/lib/integracoes/photoroom.js"
  );

  const combinacoes = [];
  for (const r of [false, true]) for (const i of [false, true]) for (const a of [false, true]) {
    if (r || i || a) combinacoes.push({ removerFundo: r, iluminacao: i, ampliar: a });
  }
  const valorDe = (opcoes, nome) => Object.fromEntries(camposDaEdicao(opcoes))[nome];

  conferir("7 combinacoes de opcoes", combinacoes.length, 7);
  // O `beautify` REDESENHOU o produto no teste de 20/09/2026 (trocou a placa e o cabo).
  conferir("NENHUMA combinacao envia beautify", combinacoes.every((o) => camposDaEdicao(o).every(([n]) => !n.startsWith("beautify"))), true);
  conferir("sempre pede fundo branco", combinacoes.every((o) => valorDe(o, "background.color") === "FFFFFF"), true);
  conferir("remover fundo pede o quadrado de 1024 com margem", [valorDe({ removerFundo: true }, "outputSize"), valorDe({ removerFundo: true }, "padding")], ["1024x1024", "0.05"]);
  conferir("ampliar NAO pede outputSize (deu erro 500)", valorDe({ removerFundo: true, ampliar: true }, "outputSize"), undefined);
  conferir("sem remover fundo nao pede outputSize", valorDe({ iluminacao: true }, "outputSize"), undefined);
  conferir("iluminacao preserva matiz e saturacao", valorDe({ iluminacao: true }, "lighting.mode"), "ai.preserve-hue-and-saturation");
  conferir("ampliar usa o modo rapido", valorDe({ ampliar: true }, "upscale.mode"), "ai.fast");
  conferir("sem nenhuma opcao e recusado", (() => { try { camposDaEdicao({}); return "aceitou"; } catch { return "recusou"; } })(), "recusou");
  conferir("opcao que nao e booleano de verdade vira falsa", opcoesCanonicas({ removerFundo: "true", iluminacao: 1, ampliar: true }), { removerFundo: false, iluminacao: false, ampliar: true });

  conferir("sem chaves: nem previa nem compra", [avaliarConfiguracao({}).previa.ok, avaliarConfiguracao({}).compra.ok], [false, false]);
  conferir("chave de producao no lugar da previa e recusada", avaliarConfiguracao({ PHOTOROOM_API_KEY: "sk_pr_abc" }).previa.ok, false);
  conferir("chave sandbox libera a previa", avaliarConfiguracao({ PHOTOROOM_API_KEY: "sandbox_sk_abc" }).previa.ok, true);
  conferir("compra desligada mesmo com a chave colada", avaliarConfiguracao({ PHOTOROOM_API_KEY_PRODUCAO: "sk_pr_abc", PHOTOROOM_COMPRA: "false" }).compra.ok, false);
  conferir("compra em branco conta como desligada", avaliarConfiguracao({ PHOTOROOM_API_KEY_PRODUCAO: "sk_pr_abc", PHOTOROOM_COMPRA: "" }).compra.ok, false);
  conferir("compra ligada sem chave de producao", avaliarConfiguracao({ PHOTOROOM_COMPRA: "true" }).compra.ok, false);
  conferir("compra ligada com chave de sandbox no lugar da producao", avaliarConfiguracao({ PHOTOROOM_COMPRA: "true", PHOTOROOM_API_KEY_PRODUCAO: "sandbox_sk_abc" }).compra.ok, false);
  conferir("compra ligada com chave de producao", avaliarConfiguracao({ PHOTOROOM_COMPRA: "true", PHOTOROOM_API_KEY_PRODUCAO: "sk_pr_abc" }).compra.ok, true);
  conferir(
    "os motivos nunca trazem o valor da chave",
    JSON.stringify(avaliarConfiguracao({ PHOTOROOM_API_KEY: "sandbox_SEGREDO1", PHOTOROOM_API_KEY_PRODUCAO: "sk_pr_SEGREDO2", PHOTOROOM_COMPRA: "false" })).includes("SEGREDO"),
    false,
  );
  conferir("402 vira aviso de creditos", /creditos/.test(semAcento(mensagemDeErro(402, ""))), true);
  conferir("erro de ampliacao vira aviso claro", /ampliar/.test(mensagemDeErro(400, JSON.stringify({ error: { message: "The image you are trying to upscale is too big" } }))), true);
  conferir("... e diz o limite de 1 megapixel", /1 megapixel/.test(mensagemDeErro(400, JSON.stringify({ error: { message: "The image you are trying to upscale is too big" } }))), true);
  conferir("erro 500 ao ampliar diz que costuma passar tentando de novo", /de novo/.test(mensagemDeErro(500, JSON.stringify({ error: { message: "An error occurred during image upscaling" } }))), true);
  const { MAXIMO_PIXELS_PARA_AMPLIAR } = await import("../src/lib/limites.js");
  conferir("limite de ampliacao: 1 megapixel (1000x1000 passa, 1024x1024 nao)", [1000 * 1000 <= MAXIMO_PIXELS_PARA_AMPLIAR, 1024 * 1024 <= MAXIMO_PIXELS_PARA_AMPLIAR], [true, false]);

  // Cotacao do dolar: FIXA em R$ 6,00 por ora (o agente 2 fara a busca do dia). Um ponto de troca so.
  const { COTACAO_DOLAR_FIXA, cotacaoDoDolar, emReais } = await import("../src/lib/cotacaoDolar.js");
  conferir("cotacao fixa em R$ 6,00", [COTACAO_DOLAR_FIXA, cotacaoDoDolar().origem], [6, "fixa"]);
  conferir("US$ 0,10 sao R$ 0,60", emReais(0.1), 0.6);
  conferir("conversao arredonda ao centavo", [emReais(0.15, { valor: 5.1575 }), emReais(1, { valor: 5.1575 })], [0.77, 5.16]);

  // -------------------------------------------------------------------------
  // Nano Banana (Google): configuracao, pedido e erros. SEM rede: `fetch` falso.
  // -------------------------------------------------------------------------
  console.log("\nNano Banana: configuracao, pedido e erros (sem rede)");
  const nb = await import("../src/lib/integracoes/nanobanana.js");
  const { MAXIMO_EXTRAS, MAXIMO_PROMPT, MAXIMO_EXTRA_BYTES } = await import("../src/lib/limites.js");
  conferir("limites: 5 extras, prompt de 2000, extra de 10 MB", [MAXIMO_EXTRAS, MAXIMO_PROMPT, MAXIMO_EXTRA_BYTES], [5, 2000, 10 * 1024 * 1024]);

  conferir("sem chave: geracao recusada com o motivo", [nb.avaliarConfiguracao({}).ok, /GEMINI_API_KEY/.test(nb.avaliarConfiguracao({}).motivo)], [false, true]);
  conferir("trava desligada recusa mesmo com chave", nb.avaliarConfiguracao({ GEMINI_API_KEY: "k", NANO_BANANA_GERACAO: "false" }).ok, false);
  conferir("trava em branco conta como desligada", nb.avaliarConfiguracao({ GEMINI_API_KEY: "k", NANO_BANANA_GERACAO: "" }).ok, false);
  conferir("... e o motivo diz como ligar", /NANO_BANANA_GERACAO=true/.test(nb.avaliarConfiguracao({ GEMINI_API_KEY: "k" }).motivo), true);
  conferir(
    "chave e trava ligada liberam, teto padrao 50",
    [nb.avaliarConfiguracao({ GEMINI_API_KEY: "k", NANO_BANANA_GERACAO: "true" }).ok, nb.avaliarConfiguracao({ GEMINI_API_KEY: "k", NANO_BANANA_GERACAO: "true" }).tetoDia],
    [true, 50],
  );
  conferir("teto lido do .env", nb.avaliarConfiguracao({ GEMINI_API_KEY: "k", NANO_BANANA_GERACAO: "true", NANO_BANANA_TETO_DIA: " 7 " }).tetoDia, 7);
  conferir(
    "teto invalido volta para 50",
    ["abc", "-3", "2.5", ""].map((t) => nb.avaliarConfiguracao({ GEMINI_API_KEY: "k", NANO_BANANA_GERACAO: "true", NANO_BANANA_TETO_DIA: t }).tetoDia),
    [50, 50, 50, 50],
  );
  conferir("o motivo nunca traz a chave", JSON.stringify(nb.avaliarConfiguracao({ GEMINI_API_KEY: "SEGREDO", NANO_BANANA_GERACAO: "false" })).includes("SEGREDO"), false);

  conferir("tres modelos, nessa ordem, o 2 e o padrao", [Object.keys(nb.MODELOS), nb.MODELO_PADRAO], [["nano-banana-2", "nano-banana-pro", "nano-banana-2-lite"], "nano-banana-2"]);
  conferir("ids do Google", Object.values(nb.MODELOS).map((m) => m.id), ["gemini-3.1-flash-image", "gemini-3-pro-image", "gemini-3.1-flash-lite-image"]);
  conferir("precos dos tres modelos", Object.values(nb.MODELOS).map((m) => m.usd), [0.067, 0.134, 0.034]);
  conferir("o Lite ignora as extras", Object.values(nb.MODELOS).map((m) => m.aceitaExtras), [true, true, false]);
  conferir("preco com a data da conferencia", Object.values(nb.MODELOS).every((m) => m.conferidoEm === "2026-10-05" && m.nome), true);
  conferir("prompt padrao e o da spec, com acentos", [nb.PROMPT_PADRAO.startsWith("Melhore a nitidez desta foto de produto"), nb.PROMPT_PADRAO.includes("sem aspecto de desenho") && nb.PROMPT_PADRAO.includes("Não invente letras, números nem marcações")], [true, true]);

  // montarPedido: ordem, 1:1, 1K, so imagem; Lite descarta extras e a regra fixa
  const b64 = (texto) => Buffer.from(texto).toString("base64");
  const originalFalsa = { bytes: Buffer.from("o"), mimeType: "image/jpeg" };
  const extrasFalsas = [{ bytes: Buffer.from("a"), mimeType: "image/png" }, { bytes: Buffer.from("b"), mimeType: "image/webp" }];
  const pedidoNB = nb.montarPedido({ prompt: "p", original: originalFalsa, extras: extrasFalsas, aceitaExtras: true });
  const partes = pedidoNB.contents[0].parts;
  conferir("pedido: prompt, original, regra, extras, nessa ordem", partes.map((p) => (p.text ? "texto" : "imagem")), ["texto", "imagem", "texto", "imagem", "imagem"]);
  conferir("pedido: o prompt e o original em base64 com o tipo", [partes[0].text, partes[1].inline_data], ["p", { mime_type: "image/jpeg", data: b64("o") }]);
  conferir("pedido: a regra fixa vem antes das extras", partes[2].text, nb.REGRA_EXTRAS);
  conferir("pedido: extras na ordem dada", partes.slice(3).map((p) => [p.inline_data.mime_type, p.inline_data.data]), [["image/png", b64("a")], ["image/webp", b64("b")]]);
  const cfg = pedidoNB.generationConfig;
  conferir("pedido: 1:1, 1K e so imagem", [cfg.responseModalities, cfg.imageConfig], [["IMAGE"], { aspectRatio: "1:1", imageSize: "1K" }]);
  const pedidoLite = nb.montarPedido({ prompt: "p", original: originalFalsa, extras: extrasFalsas, aceitaExtras: false });
  conferir("Lite nao leva extras nem a regra", pedidoLite.contents[0].parts.length, 2);
  conferir("sem extras nao vai a regra", nb.montarPedido({ prompt: "p", original: originalFalsa, extras: [], aceitaExtras: true }).contents[0].parts.length, 2);

  // lerResposta aceita as duas grafias da parte de imagem.
  const pngNB = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
  const lidaSnake = nb.lerResposta({ candidates: [{ content: { parts: [{ inline_data: { mime_type: "image/png", data: pngNB.toString("base64") } }] } }] });
  conferir("resposta com inline_data tambem e lida", [lidaSnake.ok, lidaSnake.bytes?.equals(pngNB)], [true, true]);

  const envNB = { GEMINI_API_KEY: "chave-teste-nb", NANO_BANANA_GERACAO: "true" };
  const originalNB = { bytes: await foto(800, 800), mimeType: "image/jpeg" };
  const comImagem = (bytes = pngNB) => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: bytes.toString("base64") } }] }, finishReason: "STOP" }] });
  const json = (corpo, status = 200) => () => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
  const chamadasNB = [];
  let respostaNB = json(comImagem());
  const fetchAntesNB = globalThis.fetch;
  const gerarNB = (extra = {}) => nb.gerarImagem({ modelo: "nano-banana-2", prompt: "Faca a foto de estudio", original: originalNB, env: envNB, ...extra });
  try {
    globalThis.fetch = async (url, inicio) => {
      chamadasNB.push({ url: String(url), chave: inicio.headers["x-goog-api-key"], corpo: JSON.parse(inicio.body), sinal: Boolean(inicio.signal) });
      return respostaNB();
    };
    const certo = await nb.gerarImagem({ modelo: "nano-banana-2", prompt: "  faca a foto  ", original: originalNB, env: envNB });
    conferir("gerar: sucesso devolve os bytes, numa chamada so", [certo.ok, certo.enviada, certo.status, certo.bytes?.equals(pngNB), chamadasNB.length], [true, true, 200, true, 1]);
    conferir("gerar: endereco do modelo 2", chamadasNB[0].url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent");
    conferir("gerar: chave no cabecalho x-goog-api-key, com tempo limite", [chamadasNB[0].chave, chamadasNB[0].sinal], ["chave-teste-nb", true]);
    conferir("gerar: a chave nao vai no corpo", JSON.stringify(chamadasNB[0].corpo).includes("chave-teste-nb"), false);
    conferir("gerar: o prompt vai sem os espacos das pontas", chamadasNB[0].corpo.contents[0].parts[0].text, "faca a foto");
    conferir("gerar: o original vai em seguida", chamadasNB[0].corpo.contents[0].parts[1].inline_data.data, originalNB.bytes.toString("base64"));
    await nb.gerarImagem({ modelo: "nano-banana-pro", prompt: "x", original: originalNB, env: envNB });
    conferir("gerar: o Pro vai ao endereco dele", chamadasNB[1].url.endsWith("/models/gemini-3-pro-image:generateContent"), true);

    const casos = [
      [403, { error: { code: 403, message: "Billing account not enabled for this project", status: "PERMISSION_DENIED" } }, /faturamento ativo/],
      [400, { error: { code: 400, message: "Image generation requires billing", status: "FAILED_PRECONDITION" } }, /faturamento ativo/],
      [403, { error: { code: 403, message: "Permission denied", status: "PERMISSION_DENIED" } }, /recusou a chave/],
      [401, { error: { code: 401, message: "Unauthorized" } }, /recusou a chave/],
      [400, { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } }, /recusou a chave/],
      [429, { error: { code: 429, message: "Resource exhausted" } }, /Limite ou cota do Google/],
      [500, { error: { code: 500, message: "Internal error" } }, /falhou \(HTTP 500\): Internal error/],
      [400, { error: { code: 400, message: "Campo invalido" } }, /recusou o pedido: Campo invalido/],
    ];
    for (const [status, corpo, esperado] of casos) {
      respostaNB = json(corpo, status);
      const r = await gerarNB();
      conferir(`HTTP ${status} "${corpo.error.message}": mensagem certa, sem bytes, conta como enviada`, [r.ok, esperado.test(semAcento(r.erro)), r.bytes, r.enviada, r.status], [false, true, undefined, true, status]);
    }

    const respostas200 = [
      ["recusa por conteudo (IMAGE_SAFETY)", { candidates: [{ finishReason: "IMAGE_SAFETY", content: { parts: [] } }] }, /recusou esta foto/],
      ["pedido bloqueado (blockReason)", { promptFeedback: { blockReason: "SAFETY" } }, /recusou esta foto/],
      ["so texto", { candidates: [{ content: { parts: [{ text: "Nao consigo gerar esta imagem." }] }, finishReason: "STOP" }] }, /nao devolveu imagem: Nao consigo gerar esta imagem\./],
      ["base64 que nao e imagem", comImagem(Buffer.from("isto nao e uma imagem")), /nao pode ser lida/],
    ];
    for (const [nome, corpo, esperado] of respostas200) {
      respostaNB = json(corpo);
      const r = await gerarNB();
      conferir(`200 com ${nome}: erro em portugues, sem bytes, status 200 e enviada`, [r.ok, esperado.test(semAcento(r.erro)), r.bytes, r.status, r.enviada], [false, true, undefined, 200, true]);
    }
    respostaNB = () => new Response("<html>erro</html>", { status: 200 });
    const naoJson = await gerarNB();
    conferir("200 que nao e JSON: erro, enviada", [naoJson.ok, naoJson.enviada, naoJson.status], [false, true, 200]);
    const longo = "x".repeat(500);
    respostaNB = json({ candidates: [{ content: { parts: [{ text: longo }] } }] });
    conferir("o texto devolvido e cortado em 200 caracteres", (await gerarNB()).erro.length <= "O Google nao devolveu imagem: ".length + 200, true);

    globalThis.fetch = async () => {
      chamadasNB.push({});
      throw Object.assign(new Error("tempo"), { name: "TimeoutError" });
    };
    const demorou = await gerarNB();
    conferir("tempo esgotado: 'demorou demais' e enviada", [demorou.ok, /demorou demais/.test(semAcento(demorou.erro)), demorou.enviada, demorou.status], [false, true, true, null]);
    globalThis.fetch = async () => {
      chamadasNB.push({});
      throw new TypeError("fetch failed");
    };
    const semRede = await gerarNB();
    conferir("falha de rede: mensagem e enviada", [semRede.ok, /Nao foi possivel falar com o Google/.test(semAcento(semRede.erro)), semRede.enviada], [false, true, true]);

    // Recusas ANTES de chamar: nenhuma chamada sai, `enviada: false`.
    const antes = chamadasNB.length;
    const recusas = [
      ["modelo desconhecido", { modelo: "nano-banana-1" }],
      ["trava desligada", { env: { GEMINI_API_KEY: "k", NANO_BANANA_GERACAO: "false" } }],
      ["sem chave", { env: { NANO_BANANA_GERACAO: "true" } }],
      ["prompt vazio", { prompt: "   " }],
      [`prompt acima de ${MAXIMO_PROMPT}`, { prompt: "a".repeat(MAXIMO_PROMPT + 1) }],
      [`mais de ${MAXIMO_EXTRAS} extras`, { extras: Array.from({ length: MAXIMO_EXTRAS + 1 }, () => ({ bytes: Buffer.from("e"), mimeType: "image/png" })) }],
      ["sem original", { original: null }],
    ];
    for (const [nome, extra] of recusas) {
      const r = await gerarNB(extra);
      conferir(`${nome}: recusado sem chamar o Google`, [r.ok, r.enviada, typeof r.erro === "string" && r.erro.length > 0], [false, false, true]);
    }
    conferir("... e nenhuma das recusas chamou o fetch", chamadasNB.length, antes);
    const noLimite = await gerarNB({ prompt: "a".repeat(MAXIMO_PROMPT) });
    conferir(`prompt de exatamente ${MAXIMO_PROMPT} passa`, noLimite.enviada, true);
  } finally {
    globalThis.fetch = fetchAntesNB;
  }

  console.log("\nNano Banana: registro e uso (usa o Postgres)");
  const { registrarChamada: registrarNB, usoDoNanoBanana } = await import("../src/lib/integracoes/nanobananaLog.js");
  const inicioNB = new Date();
  try {
    await registrarNB({ modelo: "nano-banana-2", status: 200, duracaoMs: 1234, pixelsOrigem: 640000, extras: 2, tamanhoPrompt: 300, repetida: true });
    const linhaNB = await prisma.logIntegracao.findFirst({ where: { servico: "GEMINI", criadoEm: { gte: inicioNB } }, orderBy: { criadoEm: "desc" } });
    conferir(
      "log: 1 linha GEMINI, POST, no endereco do modelo, com status e duracao",
      [linhaNB?.metodo, linhaNB?.endpoint, linhaNB?.statusHttp, linhaNB?.duracaoMs],
      ["POST", "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent", 200, 1234],
    );
    const resumoNB = JSON.parse(linhaNB?.requestResumo ?? "{}");
    conferir("log: o resumo tem so pixels, extras, tamanho do prompt e se repetiu", [Object.keys(resumoNB).sort(), resumoNB], [["extras", "pixelsOrigem", "repetida", "tamanhoPrompt"], { pixelsOrigem: 640000, extras: 2, tamanhoPrompt: 300, repetida: true }]);
    conferir("log: nada de chave, imagem ou prompt", /chave|key|base64|inline|data:/i.test(linhaNB?.requestResumo ?? ""), false);
    conferir("log: falha ao gravar nao derruba quem chamou", await registrarNB({ modelo: "nano-banana-2", status: "nao e numero", duracaoMs: 1, pixelsOrigem: null, extras: 0, tamanhoPrompt: 1, repetida: false }).then(() => "seguiu", () => "estourou"), "seguiu");

    // Uso num mes ficticio (2099), para nao misturar com o uso real do dono. So 200 conta.
    const endereco2 = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent";
    const enderecoPro = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image:generateContent";
    const linhaUso = (endpoint, statusHttp, quando) => ({ servico: "GEMINI", metodo: "POST", endpoint, statusHttp, duracaoMs: 1, criadoEm: new Date(quando) });
    await prisma.logIntegracao.createMany({
      data: [
        linhaUso(endereco2, 200, "2099-03-15T10:00:00Z"),
        linhaUso(endereco2, 200, "2099-03-15T11:00:00Z"),
        linhaUso(endereco2, 429, "2099-03-15T12:00:00Z"),
        linhaUso(enderecoPro, 200, "2099-03-02T12:00:00Z"),
        linhaUso(endereco2, 200, "2099-02-27T12:00:00Z"),
      ],
    });
    const uso = await usoDoNanoBanana(new Date("2099-03-15T18:00:00Z"));
    conferir("uso: hoje 2 e mes 3 (o 429 e o mes anterior ficam de fora)", [uso.hoje, uso.mes], [2, 3]);
    conferir("uso: gasto do mes = 2 x 0,067 + 0,134", uso.gastoMesUsd, 0.27);
    conferir("uso: limite do dia vem do teto", uso.limiteDia, nb.avaliarConfiguracao().tetoDia);
  } finally {
    await prisma.logIntegracao.deleteMany({ where: { servico: "GEMINI", criadoEm: { gte: inicioNB } } });
  }

  const envAntes = {};
  for (const nome of ["PHOTOROOM_API_KEY", "PHOTOROOM_API_KEY_PRODUCAO", "PHOTOROOM_COMPRA"]) envAntes[nome] = process.env[nome];
  const fetchReal = globalThis.fetch;
  const chamadas = [];
  let respostaFalsa = null;
  const inicioDoTeste = new Date();
  const loteDeTeste = randomUUID();
  const lotesDasReferencias = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const PREFIXO_FONTE = "ZZ-TESTE-IMAGENS";

  try {
    const pngFalso = await sharp({ create: { width: 700, height: 700, channels: 3, background: { r: 200, g: 30, b: 30 } } }).png().toBuffer();
    globalThis.fetch = async (url, inicio) => {
      chamadas.push({ url: String(url), chave: inicio.headers["x-api-key"], campos: Object.fromEntries([...inicio.body.entries()].filter(([k]) => k !== "imageFile")) });
      return respostaFalsa ? respostaFalsa() : new Response(pngFalso, { status: 200 });
    };
    const jpg = await foto(900, 700);

    const previa = await editarImagem({ modo: "previa", bytes: jpg, extensao: "jpg", opcoes: { iluminacao: true }, env: { PHOTOROOM_API_KEY: "sandbox_teste" } });
    conferir("previa chama o Photoroom com a chave de sandbox", [previa.ok, chamadas.length, chamadas[0]?.chave], [true, 1, "sandbox_teste"]);
    conferir("... no endereco de edicao", chamadas[0]?.url, "https://image-api.photoroom.com/v2/edit");

    const semTrava = await editarImagem({ modo: "producao", bytes: jpg, extensao: "jpg", opcoes: { iluminacao: true }, env: { PHOTOROOM_API_KEY_PRODUCAO: "sk_pr_teste", PHOTOROOM_COMPRA: "false" } });
    conferir("compra desligada NAO chama o Photoroom", [semTrava.ok, semTrava.enviada, chamadas.length], [false, false, 1]);

    const chaveTrocada = await editarImagem({ modo: "previa", bytes: jpg, extensao: "jpg", opcoes: { iluminacao: true }, env: { PHOTOROOM_API_KEY: "sk_pr_teste" } });
    conferir("previa com chave de producao NAO chama o Photoroom", [chaveTrocada.ok, chamadas.length], [false, 1]);

    const semOpcao = await editarImagem({ modo: "previa", bytes: jpg, extensao: "jpg", opcoes: {}, env: { PHOTOROOM_API_KEY: "sandbox_teste" } });
    conferir("pedido sem opcao NAO chama o Photoroom", [semOpcao.ok, chamadas.length], [false, 1]);

    const compra = await editarImagem({ modo: "producao", bytes: jpg, extensao: "jpg", opcoes: { removerFundo: true }, env: { PHOTOROOM_API_KEY_PRODUCAO: "sk_pr_teste", PHOTOROOM_COMPRA: "true" } });
    conferir("compra ligada usa a chave de producao", [compra.ok, chamadas[1]?.chave], [true, "sk_pr_teste"]);
    conferir("os campos enviados sao os pedidos", chamadas[1]?.campos.removeBackground, "true");

    respostaFalsa = () => new Response(JSON.stringify({ error: { message: "sem credito" } }), { status: 402 });
    const semCredito = await editarImagem({ modo: "producao", bytes: jpg, extensao: "jpg", opcoes: { removerFundo: true }, env: { PHOTOROOM_API_KEY_PRODUCAO: "sk_pr_teste", PHOTOROOM_COMPRA: "true" } });
    conferir("402 volta como erro que SAIU (conta no log)", [semCredito.ok, semCredito.status, semCredito.enviada], [false, 402, true]);
    respostaFalsa = null;
    chamadas.length = 0;

    // ----- O caminho de verdade: lote, previa, compra, voltar ao original, Salvar -----
    console.log("\nPainel de fotos: lote, previa e compra (usa o Postgres e dados/)");
    process.env.PHOTOROOM_API_KEY = "sandbox_teste";
    process.env.PHOTOROOM_API_KEY_PRODUCAO = "sk_pr_teste";
    process.env.PHOTOROOM_COMPRA = "true";

    const { caminhoNoLote, lerDoLote, moverImagensParaProduto } = await import("../src/lib/imagens/lote.js");
    const acoes = await import("../src/app/produtos/acoes-imagens.js");
    const { GET: rotaDoLote } = await import("../src/app/api/temporarios/[...caminho]/route.js");

    const formulario = new FormData();
    formulario.set("arquivo", new File([jpg], "minha foto.jpg", { type: "image/jpeg" }));
    const enviada = await acoes.enviarImagemAoLote(loteDeTeste, formulario);
    const base = enviada.imagem?.base;
    conferir("foto enviada entra no lote padronizada", [enviada.ok, enviada.imagem?.ampliada], [true, true]);
    conferir("a foto fica em 1024x1024 no lote", (await sharp(await lerDoLote(loteDeTeste, "imagens", `${base}.jpg`)).metadata()).width, 1024);
    conferir("o original fica guardado", (await lerDoLote(loteDeTeste, "originais", `${base}.jpg`)).equals(jpg), true);

    const traversal = [
      caminhoNoLote(loteDeTeste, "imagens", "../../../.env"),
      caminhoNoLote("../fora", "imagens", `${base}.jpg`),
      caminhoNoLote(loteDeTeste, "documentos", "a.pdf"),
      caminhoNoLote(loteDeTeste, "imagens", `${base}.png`),
    ];
    conferir("nome, pasta e lote fora do formato nao viram caminho", traversal, [null, null, null, null]);

    const rotaOk = await rotaDoLote(null, { params: Promise.resolve({ caminho: [loteDeTeste, "imagens", `${base}.jpg`] }) });
    conferir("a rota entrega a foto do lote", [rotaOk.status, rotaOk.headers.get("content-type"), rotaOk.headers.get("cache-control")], [200, "image/jpeg", "no-store"]);
    const rotaRuim = await rotaDoLote(null, { params: Promise.resolve({ caminho: [loteDeTeste, "imagens", "../../.env"] }) });
    conferir("a rota recusa caminho estranho", rotaRuim.status, 404);
    const rotaCurta = await rotaDoLote(null, { params: Promise.resolve({ caminho: [loteDeTeste, "imagens"] }) });
    conferir("a rota recusa caminho incompleto", rotaCurta.status, 400);

    const estado = await acoes.estadoDoPhotoroom();
    conferir("estado: previa e compra liberadas (chaves de teste)", [estado.previa.ok, estado.compra.ok, estado.custoUsd], [true, true, 0.1]);
    conferir("estado: o custo tambem vem em reais, pela cotacao fixa", [estado.custoBrl, estado.cotacao], [0.6, { valor: 6, origem: "fixa" }]);

    const semPrevia = await acoes.comprarPhotoroom(loteDeTeste, base, { removerFundo: true, iluminacao: true });
    conferir("comprar SEM previa e recusado", [semPrevia.ok, /previa/i.test(semAcento(semPrevia.erro)), chamadas.length], [false, true, 0]);

    const antesDaCompra = await lerDoLote(loteDeTeste, "imagens", `${base}.jpg`);
    const gerada = await acoes.gerarPreviaPhotoroom(loteDeTeste, base, { removerFundo: true, iluminacao: true });
    conferir("previa gerada", [gerada.ok, chamadas.length, chamadas[0]?.chave], [true, 1, "sandbox_teste"]);
    conferir("a previa NAO mexe na foto do produto", (await lerDoLote(loteDeTeste, "imagens", `${base}.jpg`)).equals(antesDaCompra), true);
    conferir("a previa fica no lote em 1024x1024", (await sharp(await lerDoLote(loteDeTeste, "previas", `${base}.jpg`)).metadata()).height, 1024);

    const outrasOpcoes = await acoes.comprarPhotoroom(loteDeTeste, base, { removerFundo: true });
    conferir("comprar com opcoes DIFERENTES das da previa e recusado", [outrasOpcoes.ok, chamadas.length], [false, 1]);

    process.env.PHOTOROOM_COMPRA = "false";
    const travada = await acoes.comprarPhotoroom(loteDeTeste, base, { removerFundo: true, iluminacao: true });
    conferir("trava desligada recusa a compra mesmo com previa e chave", [travada.ok, /desligada/i.test(semAcento(travada.erro)), chamadas.length], [false, true, 1]);
    process.env.PHOTOROOM_COMPRA = "true";

    const comprada = await acoes.comprarPhotoroom(loteDeTeste, base, { removerFundo: true, iluminacao: true });
    conferir("compra feita com a chave de producao", [comprada.ok, comprada.imagem?.versao, chamadas[1]?.chave], [true, "photoroom", "sk_pr_teste"]);
    conferir("depois da compra a foto sabe que tem a versao do Photoroom guardada", [comprada.imagem?.versao, comprada.imagem?.versoes], ["photoroom", { photoroom: true, nanobanana: false }]);
    conferir(
      "a tela recebe os enderecos das DUAS versoes para comparar",
      [
        new RegExp(`^/api/temporarios/${loteDeTeste}/versoes/${base}\\.original\\.jpg\\?v=\\d+$`).test(comprada.imagem?.urls?.original ?? ""),
        new RegExp(`^/api/temporarios/${loteDeTeste}/versoes/${base}\\.photoroom\\.jpg\\?v=\\d+$`).test(comprada.imagem?.urls?.photoroom ?? ""),
      ],
      [true, true],
    );
    const rotaOriginal = await rotaDoLote(null, { params: Promise.resolve({ caminho: [loteDeTeste, "versoes", `${base}.original.jpg`] }) });
    const bytesDaOriginal = Buffer.from(await rotaOriginal.arrayBuffer());
    conferir(
      "a rota entrega a original ja padronizada (1024x1024)",
      [rotaOriginal.status, (await sharp(bytesDaOriginal).metadata()).width, bytesDaOriginal.equals(antesDaCompra)],
      [200, 1024, true],
    );
    const rotaMelhorada = await rotaDoLote(null, { params: Promise.resolve({ caminho: [loteDeTeste, "versoes", `${base}.photoroom.jpg`] }) });
    conferir("a rota entrega a versao do Photoroom", rotaMelhorada.status, 200);
    const rotaVersaoRuim = await rotaDoLote(null, { params: Promise.resolve({ caminho: [loteDeTeste, "versoes", `${base}.outra.jpg`] }) });
    conferir("a rota recusa versao que o sistema nao gera", rotaVersaoRuim.status, 404);
    conferir("a foto do produto MUDOU", (await lerDoLote(loteDeTeste, "imagens", `${base}.jpg`)).equals(antesDaCompra), false);
    conferir("a previa some depois da compra", await lerDoLote(loteDeTeste, "previas", `${base}.jpg`), null);
    const melhoradaComprada = await lerDoLote(loteDeTeste, "imagens", `${base}.jpg`);

    // Alternar entre as versoes: sem custo, sem chamar o Photoroom, sem perder a paga.
    const escolheuOriginal = await acoes.escolherVersaoNoLote(loteDeTeste, base, "original");
    conferir("escolher a original nao chama o Photoroom", [escolheuOriginal.ok, escolheuOriginal.imagem?.versao, chamadas.length], [true, "original", 2]);
    conferir("... e a foto do produto volta a ser a de antes da compra", (await lerDoLote(loteDeTeste, "imagens", `${base}.jpg`)).equals(antesDaCompra), true);
    conferir("... mas a melhorada continua guardada e a tela sabe", [escolheuOriginal.imagem?.versoes?.photoroom, Boolean(escolheuOriginal.imagem?.urls?.photoroom)], [true, true]);
    const escolheuMelhorada = await acoes.escolherVersaoNoLote(loteDeTeste, base, "photoroom");
    conferir("escolher a melhorada de novo nao cobra outra vez", [escolheuMelhorada.ok, escolheuMelhorada.imagem?.versao, chamadas.length], [true, "photoroom", 2]);
    conferir("... e a foto do produto e a melhorada que foi comprada", (await lerDoLote(loteDeTeste, "imagens", `${base}.jpg`)).equals(melhoradaComprada), true);
    const versaoInvalida = await acoes.escolherVersaoNoLote(loteDeTeste, base, "outra");
    conferir("versao desconhecida e recusada", versaoInvalida.ok, false);

    // Foto que nunca foi melhorada: escolher a melhorada e recusado; a original serve.
    const segundo = new FormData();
    segundo.set("arquivo", new File([jpg], "outra.jpg", { type: "image/jpeg" }));
    const outraFoto = await acoes.enviarImagemAoLote(loteDeTeste, segundo);
    const semCompra = await acoes.escolherVersaoNoLote(loteDeTeste, outraFoto.imagem.base, "photoroom");
    conferir("melhorada de foto que nao foi comprada e recusada", [semCompra.ok, /ainda nao/i.test(semAcento(semCompra.erro))], [false, true]);
    const soOriginal = await acoes.escolherVersaoNoLote(loteDeTeste, outraFoto.imagem.base, "original");
    conferir("a original de uma foto comum funciona e nao tem melhorada", [soOriginal.ok, soOriginal.imagem?.versoes?.photoroom, soOriginal.imagem?.urls?.original], [true, false, null]);
    await acoes.removerImagemDoLote(loteDeTeste, outraFoto.imagem.base);

    // Excluir a foto tambem apaga as duas versoes.
    const outraBase = outraFoto.imagem.base;
    conferir("a foto excluida some do lote", await lerDoLote(loteDeTeste, "imagens", `${outraBase}.jpg`), null);

    const registros = await prisma.logIntegracao.findMany({
      where: { servico: "PHOTOROOM", criadoEm: { gte: inicioDoTeste } },
      orderBy: { criadoEm: "asc" },
    });
    conferir(
      "previa e compra ficam no registro, com o modo",
      registros.map((linha) => linha.endpoint.split(" ").at(-1)),
      ["[previa]", "[producao]"],
    );
    conferir("o registro nao guarda chave nenhuma", /sandbox_teste|sk_pr_teste/.test(JSON.stringify(registros)), false);
    const uso = await acoes.estadoDoPhotoroom();
    conferir("o uso conta a previa e a compra", [uso.uso.previasHoje >= 1, uso.uso.comprasMes >= 1], [true, true]);

    const movidas = await moverImagensParaProduto(loteDeTeste, SKU_TESTE, [base, base, "nao-e-base-valida"]);
    conferir("no Salvar a foto vai para a pasta do produto, uma vez so", movidas.map((m) => m.nome), [`${base}.jpg`]);
    conferir("... e sai do lote", await lerDoLote(loteDeTeste, "imagens", `${base}.jpg`), null);
    conferir("... e o disco confere", (await readFile(caminhoDe(SKU_TESTE, "IMAGEM", `${base}.jpg`))).length, movidas[0].tamanhoBytes);

    const removida = await acoes.removerImagemDoLote(loteDeTeste, base);
    conferir("remover foto que ja saiu do lote nao da erro", removida.ok, true);
    conferir(
      "remover tambem apaga as duas versoes guardadas",
      [await lerDoLote(loteDeTeste, "versoes", `${base}.original.jpg`), await lerDoLote(loteDeTeste, "versoes", `${base}.photoroom.jpg`)],
      [null, null],
    );

    // ----- Versao nomeada (Nano Banana): original, photoroom e nanobanana, mais extras/ e geracoes/ -----
    console.log("\nVersao nomeada: original, photoroom e nanobanana (dados/)");
    {
      const lote = await import("../src/lib/imagens/lote.js");
      const { writeFile: escreverArquivo, mkdir: criarPasta } = await import("node:fs/promises");
      const { dirname: pastaDe } = await import("node:path");
      const gravarCru = async (pasta, nome, bytes) => {
        const alvo = lote.caminhoNoLote(loteDeTeste, pasta, nome);
        await criarPasta(pastaDe(alvo), { recursive: true });
        await escreverArquivo(alvo, bytes);
      };
      const pedirAoLote = (pasta, nome) => rotaDoLote(null, { params: Promise.resolve({ caminho: [loteDeTeste, pasta, nome] }) });
      conferir("as tres versoes, nessa ordem", lote.VERSOES, ["original", "photoroom", "nanobanana"]);

      // Lote antigo (de antes desta mudanca, vive ate 24 h): a melhorada guardada como .melhorada.jpg.
      const legado = await lote.adicionarImagem(loteDeTeste, await foto(800, 800));
      const bytesLegado = (await padronizarImagem(await foto(820, 820))).bytes;
      await gravarCru("versoes", `${legado.base}.melhorada.jpg`, bytesLegado);
      conferir("legado: .melhorada.jpg conta como photoroom", await lote.versoesDoLote(loteDeTeste, legado.base), { photoroom: true, nanobanana: false });
      conferir("legado: o nome guardado e o antigo", await lote.nomeGuardadoDaVersao(loteDeTeste, legado.base, "photoroom"), `${legado.base}.melhorada.jpg`);
      const escolheuLegado = await lote.escolherVersao(loteDeTeste, legado.base, "photoroom");
      conferir("legado: escolher photoroom copia os bytes antigos", [escolheuLegado.ok, (await lerDoLote(loteDeTeste, "imagens", `${legado.base}.jpg`)).equals(bytesLegado)], [true, true]);
      conferir("legado: a rota ainda serve .melhorada.jpg", (await pedirAoLote("versoes", `${legado.base}.melhorada.jpg`)).status, 200);
      const legadoNaTela = await acoes.escolherVersaoNoLote(loteDeTeste, legado.base, "photoroom");
      conferir("legado: a tela recebe o endereco antigo como photoroom", [legadoNaTela.imagem?.versao, legadoNaTela.imagem?.urls?.photoroom?.includes(`${legado.base}.melhorada.jpg`)], ["photoroom", true]);

      // Nano Banana: guardar a versao e escolher, sem tocar na original.
      const nova = await lote.adicionarImagem(loteDeTeste, await foto(900, 900));
      const semGerar = await lote.escolherVersao(loteDeTeste, nova.base, "nanobanana");
      conferir("nanobanana sem versao guardada e recusada", [semGerar.ok, /ainda nao/i.test(semAcento(semGerar.erro))], [false, true]);
      conferir("'melhorada' nao e mais nome de versao", (await lote.escolherVersao(loteDeTeste, nova.base, "melhorada")).erro, "Versão inválida.");
      const bytesNB = (await padronizarImagem(await foto(950, 950))).bytes;
      conferir("guardar a versao nanobanana", await lote.guardarVersao(loteDeTeste, nova.base, "nanobanana", bytesNB), { ok: true });
      conferir("guardar versao fora da lista e recusado", (await lote.guardarVersao(loteDeTeste, nova.base, "outra", bytesNB)).ok, false);
      const padronizadaNova = await lerDoLote(loteDeTeste, "imagens", `${nova.base}.jpg`);
      const garantida = await lote.garantirOriginalGuardado(loteDeTeste, nova.base);
      conferir("a original fica guardada, padronizada", [garantida.ok, (await lote.lerVersao(loteDeTeste, nova.base, "original"))?.equals(padronizadaNova)], [true, true]);
      const escolhidaNB = await acoes.escolherVersaoNoLote(loteDeTeste, nova.base, "nanobanana");
      conferir("escolher nanobanana copia a versao para a foto", [escolhidaNB.ok, escolhidaNB.imagem?.versao, (await lerDoLote(loteDeTeste, "imagens", `${nova.base}.jpg`)).equals(bytesNB)], [true, "nanobanana", true]);
      conferir(
        "a tela sabe das versoes e dos enderecos",
        [escolhidaNB.imagem?.versoes, Boolean(escolhidaNB.imagem?.urls?.original), Boolean(escolhidaNB.imagem?.urls?.nanobanana), escolhidaNB.imagem?.urls?.photoroom, escolhidaNB.imagem?.finalizada],
        [{ photoroom: false, nanobanana: true }, true, true, null, false],
      );
      const deVolta = await acoes.escolherVersaoNoLote(loteDeTeste, nova.base, "original");
      conferir("voltar a original mantem a nanobanana guardada", [deVolta.imagem?.versao, deVolta.imagem?.versoes?.nanobanana, (await lerDoLote(loteDeTeste, "imagens", `${nova.base}.jpg`)).equals(padronizadaNova)], ["original", true, true]);
      await lote.guardarVersao(loteDeTeste, nova.base, "photoroom", bytesLegado);
      conferir("a rota entrega .photoroom.jpg e .nanobanana.jpg", [(await pedirAoLote("versoes", `${nova.base}.photoroom.jpg`)).status, (await pedirAoLote("versoes", `${nova.base}.nanobanana.jpg`)).status], [200, 200]);
      await gravarCru("imagens", `${nova.base}.jpg`, bytesNB); // um arquivo qualquer existe; o nome .outra continua recusado
      conferir("a rota recusa versao que o sistema nao gera", (await pedirAoLote("versoes", `${nova.base}.outra.jpg`)).status, 404);

      // Pastas novas do lote: extras/ (ate 5 por foto) e geracoes/ (o ultimo pedido).
      const b = nova.base;
      conferir(
        "extras e geracoes viram caminho",
        [lote.caminhoNoLote(loteDeTeste, "extras", `${b}.1.jpg`) !== null, lote.caminhoNoLote(loteDeTeste, "extras", `${b}.5.webp`) !== null, lote.caminhoNoLote(loteDeTeste, "geracoes", `${b}.json`) !== null],
        [true, true, true],
      );
      conferir(
        "extra 6, extensao estranha e travessia nao viram caminho",
        [lote.caminhoNoLote(loteDeTeste, "extras", `${b}.6.jpg`), lote.caminhoNoLote(loteDeTeste, "extras", `${b}.1.gif`), lote.caminhoNoLote(loteDeTeste, "extras", "../x"), lote.caminhoNoLote(loteDeTeste, "geracoes", "../x")],
        [null, null, null, null],
      );

      // Excluir a foto leva tudo dela: as quatro grafias de versao, as extras e a geracao. Nunca as da vizinha.
      await gravarCru("versoes", `${b}.melhorada.jpg`, bytesNB);
      await gravarCru("extras", `${b}.1.jpg`, bytesNB);
      await gravarCru("extras", `${b}.3.png`, bytesNB);
      await gravarCru("geracoes", `${b}.json`, Buffer.from("{}"));
      await gravarCru("extras", `${legado.base}.1.jpg`, bytesNB);
      await lote.apagarImagem(loteDeTeste, b);
      conferir(
        "apagar a foto leva as quatro versoes, as extras e a geracao",
        await Promise.all([
          ...["original", "photoroom", "nanobanana", "melhorada"].map((v) => lerDoLote(loteDeTeste, "versoes", `${b}.${v}.jpg`)),
          lerDoLote(loteDeTeste, "extras", `${b}.1.jpg`),
          lerDoLote(loteDeTeste, "extras", `${b}.3.png`),
          lerDoLote(loteDeTeste, "geracoes", `${b}.json`),
        ]),
        [null, null, null, null, null, null, null],
      );
      conferir("... e nao toca na extra de outra foto", (await lerDoLote(loteDeTeste, "extras", `${legado.base}.1.jpg`)) !== null, true);
      await lote.apagarImagem(loteDeTeste, legado.base);
    }

    // ----- As fotos dos produtos marcados na lupa (concorrentes e fornecedores) -----
    console.log("\nFotos dos produtos marcados na lupa (usa o Postgres; fotos como data URI, sem rede)");
    const { MAXIMO_IMAGENS, MAXIMO_FOTOS_NO_PAINEL } = await import("../src/lib/limites.js");
    conferir("o painel guarda mais fotos do que o produto leva", MAXIMO_FOTOS_NO_PAINEL > MAXIMO_IMAGENS, true);

    const fonteDaLupa = await prisma.fonteColeta.create({
      data: { nome: `${PREFIXO_FONTE} Loja`, dominio: "zz-teste-imagens.invalid", tipo: "CONCORRENTE", ativa: false, proximaVarreduraEm: new Date(Date.now() + 1e12) },
    });
    const fotoA = dataUri(await foto(600, 600), "image/jpeg");
    const fotoB = dataUri(await foto(800, 500, "png"), "image/png");
    const fotoC = dataUri(await foto(1024, 1024, "webp"), "image/webp");
    const coletado = (chave, nome, imagens, miniatura = null) =>
      prisma.produtoColetado.create({ data: { fonteId: fonteDaLupa.id, chave, origem: "site", nome, imagens, miniatura } });
    const pa = await coletado("codigo:ZA", "Produto A", [fotoA, fotoB, "ftp://exemplo.invalid/x.jpg"]);
    const pb = await coletado("codigo:ZB", "Produto B", [fotoB, fotoC]);
    const pc = await coletado("codigo:ZC", "Produto C so com miniatura", null, fotoA);
    // A MESMA foto por outro endereco (so muda o tipo declarado): tem que entrar uma vez so.
    const pd = await coletado("codigo:ZD", "Produto D", [fotoA.replace("image/jpeg", "image/jpg")]);
    const pe = await coletado("codigo:ZE", "Produto E sem foto", null);

    const [loteRefs, loteRefsCurto, loteClone, loteUmAUm] = lotesDasReferencias;
    const todos = [pa.id, pb.id, pc.id, pd.id, pe.id, "id-que-nao-existe"];
    const trazidas = await acoes.importarFotosDasReferencias(loteRefs, todos, MAXIMO_FOTOS_NO_PAINEL);
    conferir("3 fotos distintas entram (repetidas por endereco e por conteudo ficam de fora)", [trazidas.ok, trazidas.imagens.length], [true, 3]);
    conferir("o endereco que nao e imagem valida conta como recusado", trazidas.recusadas, 1);
    conferir("nada ficou de fora do painel", trazidas.foraDoLimite, 0);
    conferir("as referencias olhadas voltam (menos o id que nao existe)", trazidas.referencias, [pa.id, pb.id, pc.id, pd.id, pe.id]);
    conferir(
      "cada foto diz de que produto e de que loja veio",
      trazidas.imagens.map((imagem) => [imagem.ref, imagem.fonte, imagem.produto]),
      [
        [pa.id, `${PREFIXO_FONTE} Loja`, "Produto A"],
        [pa.id, `${PREFIXO_FONTE} Loja`, "Produto A"],
        [pb.id, `${PREFIXO_FONTE} Loja`, "Produto B"],
      ],
    );
    conferir("a foto de 600 px entra ampliada", trazidas.imagens[0].ampliada, true);
    for (const [posicao, imagem] of trazidas.imagens.entries()) {
      const meta = await sharp(await lerDoLote(loteRefs, "imagens", `${imagem.base}.jpg`)).metadata();
      conferir(`foto ${posicao + 1} do lote: 1024x1024 JPEG`, [meta.format, meta.width, meta.height], ["jpeg", 1024, 1024]);
    }

    // Um produto por chamada, como o formulario faz para as fotos irem aparecendo uma a uma: a foto que
    // ja veio de um produto nao pode entrar de novo pelo outro (o servidor olha o conteudo do lote).
    const porChamada = [];
    let vagasRestantes = MAXIMO_FOTOS_NO_PAINEL;
    for (const produto of [pa, pb, pc, pd, pe]) {
      const parcial = await acoes.importarFotosDasReferencias(loteUmAUm, [produto.id], vagasRestantes);
      porChamada.push(parcial.imagens.length);
      vagasRestantes -= parcial.imagens.length;
    }
    conferir("uma chamada por produto traz as mesmas 3 fotos, sem duplicar", [porChamada, porChamada.reduce((a, b) => a + b, 0)], [[2, 1, 0, 0, 0], 3]);
    conferir("... e o lote fica com 3 originais", (await (await import("../src/lib/imagens/lote.js")).impressoesDoLote(loteUmAUm)).size, 3);

    const curta = await acoes.importarFotosDasReferencias(loteRefsCurto, todos, 2);
    conferir("com 2 vagas entram 2 e o resto e avisado", [curta.imagens.length, curta.foraDoLimite], [2, 3]);
    const semVaga = await acoes.importarFotosDasReferencias(loteRefsCurto, todos, 0);
    conferir("sem vaga nao baixa nada", [semVaga.ok, semVaga.imagens.length], [true, 0]);
    const demais = await acoes.importarFotosDasReferencias(loteRefsCurto, Array.from({ length: 21 }, (_, i) => `id${i}`), 10);
    conferir("mais de 20 ids nao e processado", [demais.ok, demais.imagens.length], [true, 0]);
    const semLista = await acoes.importarFotosDasReferencias(loteRefsCurto, "nao-e-lista", 10);
    conferir("ids que nao sao lista nao derrubam", [semLista.ok, semLista.imagens.length], [true, 0]);
    const loteInvalido = await acoes.importarFotosDasReferencias("../fora", [pa.id], 10);
    conferir("lote invalido e recusado", loteInvalido.ok, false);

    // O "Clonar" tambem traz TODAS as fotos, e nao so as que o produto leva (MAXIMO_IMAGENS): o dono escolhe.
    const quantas = MAXIMO_IMAGENS + 3;
    const muitas = await coletado("codigo:ZF", "Produto F com muitas fotos", Array.from({ length: quantas }, () => fotoA));
    const clonadas = await acoes.importarImagensDaOrigem(loteClone, `coletado:${muitas.id}`);
    conferir(`Clonar traz as ${quantas} fotos, e nao so as ${MAXIMO_IMAGENS} do produto`, [clonadas.ok, clonadas.imagens.length], [true, quantas]);

    // Desmarcar na lupa: remover varias de uma vez, ignorando o que nao e foto valida.
    const [primeira, segunda, terceira] = trazidas.imagens;
    const removidas = await acoes.removerImagensDoLote(loteRefs, [primeira.base, segunda.base, "../../.env"]);
    conferir("remover varias fotos de uma vez", removidas.ok, true);
    conferir(
      "as duas somem do lote e a terceira fica",
      [
        await lerDoLote(loteRefs, "imagens", `${primeira.base}.jpg`),
        await lerDoLote(loteRefs, "imagens", `${segunda.base}.jpg`),
        (await lerDoLote(loteRefs, "imagens", `${terceira.base}.jpg`)) !== null,
      ],
      [null, null, true],
    );
    conferir("o original tambem some", await lerDoLote(loteRefs, "originais", `${primeira.base}.jpg`), null);
    conferir("lote invalido na remocao e recusado", (await acoes.removerImagensDoLote("../fora", [terceira.base])).ok, false);

    // ----- Editar um produto que JA EXISTE: o mesmo painel, e o Salvar aplica o resultado -----
    console.log("\nFotos de um produto que ja existe (usa o Postgres e dados/)");
    const { reconciliarImagensDoProduto } = await import("../src/lib/imagens/produto.js");
    const { adicionarImagem } = await import("../src/lib/imagens/lote.js");
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { dirname } = await import("node:path");

    await prisma.produto.deleteMany({ where: { sku: SKU_EDICAO } });
    await apagarPastaProduto(SKU_EDICAO);
    const produtoEdicao = await prisma.produto.create({
      data: { sku: SKU_EDICAO, tituloBase: "Produto de teste da edicao de fotos" },
    });
    const alvo = { id: produtoEdicao.id, sku: SKU_EDICAO };
    // Nomes no formato que o sistema aceita como caminho (32 hexadecimais e a extensao).
    const NOME_ANTIGA = `${"a".repeat(32)}.png`;
    const NOME_SUMIDA = `${"b".repeat(32)}.jpg`;

    await anexarImagens(produtoEdicao.id, SKU_EDICAO, [
      { tipo: "endereco", endereco: dataUri(await foto(2000, 1500), "image/jpeg") },
      { tipo: "endereco", endereco: dataUri(await foto(700, 700, "png"), "image/png") },
    ]);
    // Uma foto ANTIGA, fora do padrao (antes de 21/09/2026 nada padronizava): 800x600 em PNG, gravada direto.
    const caminhoAntiga = caminhoDe(SKU_EDICAO, "IMAGEM", NOME_ANTIGA);
    await mkdir(dirname(caminhoAntiga), { recursive: true });
    await writeFile(caminhoAntiga, await foto(800, 600, "png"));
    await prisma.produtoArquivo.create({
      data: { produtoId: produtoEdicao.id, tipo: "IMAGEM", arquivo: NOME_ANTIGA, mimeType: "image/png", tamanhoBytes: 1, ordem: 2, principal: false },
    });
    // E uma linha cujo arquivo SUMIU do disco: nao abre no painel, e nao pode ser apagada por isso.
    const sumida = await prisma.produtoArquivo.create({
      data: { produtoId: produtoEdicao.id, tipo: "IMAGEM", arquivo: NOME_SUMIDA, mimeType: "image/jpeg", tamanhoBytes: 1, ordem: 3, principal: false },
    });
    const linhasAntes = await prisma.produtoArquivo.findMany({
      where: { produtoId: produtoEdicao.id, tipo: "IMAGEM" },
      orderBy: { ordem: "asc" },
    });
    const [linhaA, linhaB, linhaAntiga] = linhasAntes;
    conferir("o produto de teste tem 4 fotos, a primeira e a principal", [linhasAntes.length, linhaA.principal], [4, true]);

    const loteEdicao = randomUUID();
    const aberto = await acoes.prepararFotosDoProduto(loteEdicao, produtoEdicao.id);
    conferir("abrir a edicao traz as 3 fotos que abrem", [aberto.ok, aberto.imagens.length], [true, 3]);
    conferir("... na ordem do produto, cada uma com a linha de origem", aberto.imagens.map((i) => i.arquivoId), [linhaA.id, linhaB.id, linhaAntiga.id]);
    conferir("... e a que nao abriu volta para ser preservada", aberto.naoCarregadas, [sumida.id]);
    const abertaAntiga = aberto.imagens[2];
    conferir(
      "a foto antiga entra no painel ja em 1024x1024",
      (await sharp(await lerDoLote(loteEdicao, "imagens", `${abertaAntiga.base}.jpg`)).metadata()).width,
      1024,
    );

    // O dono: traz uma foto nova, poe ela na frente e exclui a B.
    const novaFoto = await adicionarImagem(loteEdicao, await foto(900, 900));
    const bytesAntesA = await readFile(caminhoDe(SKU_EDICAO, "IMAGEM", linhaA.arquivo));
    const salvo = await reconciliarImagensDoProduto({
      produto: alvo,
      lote: loteEdicao,
      // Todas validadas (o check verde): so as validadas ficam (04/10/2026), e este bloco testa os tres
      // destinos de foto que FICA. A regra de quem sai tem bloco proprio, mais abaixo.
      itens: [
        { base: novaFoto.base, finalizada: true },
        { base: aberto.imagens[0].base, arquivoId: linhaA.id, finalizada: true },
        { base: abertaAntiga.base, arquivoId: linhaAntiga.id, finalizada: true },
      ],
      preservar: [sumida.id],
    });
    conferir("salvar: 1 mantida, 1 substituida, 1 nova, 1 removida", [salvo.mantidas, salvo.substituidas, salvo.novas, salvo.removidas], [1, 1, 1, 1]);

    const linhasDepois = await prisma.produtoArquivo.findMany({
      where: { produtoId: produtoEdicao.id, tipo: "IMAGEM" },
      orderBy: { ordem: "asc" },
    });
    conferir("as linhas ficam na ordem do painel, e so a primeira e a principal", linhasDepois.map((l) => [l.ordem, l.principal]), [[0, true], [1, false], [2, false], [3, false]]);
    conferir("a foto nova ficou na frente", linhasDepois[0].arquivo, `${novaFoto.base}.jpg`);
    conferir("a mantida continua a mesma linha e o mesmo arquivo", [linhasDepois[1].id, linhasDepois[1].arquivo], [linhaA.id, linhaA.arquivo]);
    conferir("... sem reescrever os bytes", (await readFile(caminhoDe(SKU_EDICAO, "IMAGEM", linhaA.arquivo))).equals(bytesAntesA), true);
    conferir(
      "a antiga foi substituida pela padronizada, na mesma linha",
      [linhasDepois[2].id, linhasDepois[2].arquivo.endsWith(".jpg"), linhasDepois[2].arquivo !== NOME_ANTIGA],
      [linhaAntiga.id, true, true],
    );
    const metaAntiga = await sharp(await readFile(caminhoDe(SKU_EDICAO, "IMAGEM", linhasDepois[2].arquivo))).metadata();
    conferir("... e o arquivo novo tem 1024x1024 JPEG", [metaAntiga.format, metaAntiga.width, metaAntiga.height], ["jpeg", 1024, 1024]);
    conferir("o arquivo velho saiu do disco", await readFile(caminhoAntiga).then(() => "existe", () => "sumiu"), "sumiu");
    conferir(
      "a excluida saiu do banco e do disco",
      [await prisma.produtoArquivo.count({ where: { id: linhaB.id } }), await readFile(caminhoDe(SKU_EDICAO, "IMAGEM", linhaB.arquivo)).then(() => "existe", () => "sumiu")],
      [0, "sumiu"],
    );
    conferir("a que nao abriu ficou no fim, como estava", [linhasDepois[3].id, linhasDepois[3].arquivo], [sumida.id, NOME_SUMIDA]);

    // Reabrir e salvar sem mudar nada: nada e reescrito nem apagado.
    const loteDeNovo = randomUUID();
    const reaberto = await acoes.prepararFotosDoProduto(loteDeNovo, produtoEdicao.id);
    const semMudar = await reconciliarImagensDoProduto({
      produto: alvo,
      lote: loteDeNovo,
      itens: reaberto.imagens.map((i) => ({ base: i.base, arquivoId: i.arquivoId })),
      preservar: reaberto.naoCarregadas,
    });
    conferir("reabrir e salvar sem mudar nada nao reescreve nem apaga nada", [semMudar.mantidas, semMudar.substituidas, semMudar.novas, semMudar.removidas], [3, 0, 0, 0]);

    // SALVA = VALIDADA (04/10/2026): so as fotos validadas sao salvas, entao toda foto que ja estava no
    // produto volta com o check verde ao reabrir. Isso tambem protege as fotos antigas (de antes da regra) e as
    // importadas do Bling: sem o check elas seriam apagadas no proximo Salvar.
    const lotesCheck = [];
    const abrirParaCheck = async () => {
      const lote = randomUUID();
      lotesCheck.push(lote);
      return { lote, ...(await acoes.prepararFotosDoProduto(lote, produtoEdicao.id)) };
    };
    conferir("toda foto que ja estava salva volta VALIDADA ao reabrir", reaberto.imagens.map((i) => i.finalizada), [true, true, true]);
    conferir(
      "salvar SEM informar o check (formulario aberto antes da regra) nao apaga nada",
      [semMudar.removidas, semMudar.naoValidadas, (await abrirParaCheck()).imagens.length],
      [0, 0, 3],
    );

    // O lote perdeu uma foto (limpeza de 24 h, outra aba): a do produto continua valendo, e nao e apagada.
    const semUma = await reconciliarImagensDoProduto({
      produto: alvo,
      lote: loteDeNovo,
      itens: reaberto.imagens.map((i, posicao) => ({ base: posicao === 0 ? "f".repeat(32) : i.base, arquivoId: i.arquivoId })),
      preservar: reaberto.naoCarregadas,
    });
    conferir("foto que sumiu do lote nao apaga a do produto", [semUma.mantidas, semUma.removidas], [3, 0]);

    // SO AS VALIDADAS FICAM (pedido do dono em 04/10/2026): ao salvar, as sem o check verde sao excluidas.
    const regra = await abrirParaCheck();
    const candidataSemCheck = await adicionarImagem(regra.lote, await foto(900, 900));
    const candidataComCheck = await adicionarImagem(regra.lote, await foto(950, 950));
    const linhaQueSai = await prisma.produtoArquivo.findUnique({ where: { id: regra.imagens[1].arquivoId } });
    const filtrado = await reconciliarImagensDoProduto({
      produto: alvo,
      lote: regra.lote,
      itens: [
        { base: regra.imagens[0].base, arquivoId: regra.imagens[0].arquivoId, finalizada: true },
        { base: regra.imagens[1].base, arquivoId: regra.imagens[1].arquivoId, finalizada: false },
        { base: regra.imagens[2].base, arquivoId: regra.imagens[2].arquivoId, finalizada: true },
        { base: candidataSemCheck.base, finalizada: false },
        { base: candidataComCheck.base, finalizada: true },
      ],
      preservar: regra.naoCarregadas,
    });
    conferir(
      "so as validadas ficam: 2 mantidas e 1 nova; a do produto sem check sai; a candidata sem check nao entra",
      [filtrado.mantidas, filtrado.novas, filtrado.removidas, filtrado.naoValidadas],
      [2, 1, 1, 2],
    );
    conferir(
      "a foto sem check que era do produto saiu do banco e do disco",
      [
        await prisma.produtoArquivo.count({ where: { id: linhaQueSai.id } }),
        await readFile(caminhoDe(SKU_EDICAO, "IMAGEM", linhaQueSai.arquivo)).then(() => "existe", () => "sumiu"),
      ],
      [0, "sumiu"],
    );
    const aposFiltrar = await prisma.produtoArquivo.findMany({
      where: { produtoId: produtoEdicao.id, tipo: "IMAGEM" },
      orderBy: { ordem: "asc" },
    });
    conferir(
      "o produto fica com as 3 validadas e a que nao abriu (4 linhas), so a primeira e a principal",
      [aposFiltrar.length, aposFiltrar.map((l) => l.principal)],
      [4, [true, false, false, false]],
    );
    conferir(
      "a candidata validada entrou, a sem check nao",
      aposFiltrar.some((l) => l.arquivo === `${candidataComCheck.base}.jpg`) &&
        !aposFiltrar.some((l) => l.arquivo === `${candidataSemCheck.base}.jpg`),
      true,
    );

    // Tirar o check de TODAS: o produto fica so com a que nao abriu no painel (essa nunca e apagada por isso).
    const todasSemCheck = await abrirParaCheck();
    const semNenhuma = await reconciliarImagensDoProduto({
      produto: alvo,
      lote: todasSemCheck.lote,
      itens: todasSemCheck.imagens.map((i) => ({ base: i.base, arquivoId: i.arquivoId, finalizada: false })),
      preservar: todasSemCheck.naoCarregadas,
    });
    const restantes = await prisma.produtoArquivo.findMany({ where: { produtoId: produtoEdicao.id, tipo: "IMAGEM" } });
    conferir(
      "todas sem check: as 3 do painel saem e so fica a ilegivel, que vira a principal",
      [semNenhuma.mantidas, semNenhuma.removidas, restantes.map((l) => [l.id, l.principal])],
      [0, 3, [[sumida.id, true]]],
    );

    // So o que e DESTE produto: a linha de outro produto na lista e ignorada (viraria uma foto nova sem arquivo).
    const foraDoProduto = await reconciliarImagensDoProduto({
      produto: alvo,
      lote: loteDeNovo,
      itens: [{ base: reaberto.imagens[0].base, arquivoId: "id-de-outro-produto" }],
      preservar: ["id-de-outro-produto"],
    });
    conferir("id de linha que nao e do produto nao e tratado como dele", [foraDoProduto.novas, foraDoProduto.mantidas], [1, 0]);

    for (const lote of [loteEdicao, loteDeNovo, ...lotesCheck]) await acoes.descartarLoteDeArquivos(lote);

    // ----- Reserva (Nano Banana): so as linhas FOTO contam; a RESERVA fica guardada e escondida -----
    console.log("\nReserva: so FOTO conta (usa o Postgres e dados/)");
    {
      const { readdir } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { gravarNaReserva, lerDaReserva, apagarDaReserva } = await import("../src/lib/imagens/reserva.js");
      const { caminhoDaReserva, urlDaReserva, renomearPastaProduto, apagarArquivo } = await import("../src/lib/arquivos.js");
      const { GET: rotaDeArquivos } = await import("../src/app/api/arquivos/[...caminho]/route.js");
      const { imagensDaOrigem } = await import("../src/lib/imagensImportadas.js");
      const { definirImagemPrincipal, removerArquivo } = await import("../src/app/produtos/acoes.js");

      await prisma.produto.deleteMany({ where: { sku: SKU_RESERVA } });
      await apagarPastaProduto(SKU_RESERVA);
      const produtoReserva = await prisma.produto.create({
        data: { sku: SKU_RESERVA, tituloBase: "Produto de teste da reserva" },
      });

      // Linha criada sem informar os campos novos: FOTO, original e grupo nulo (nulo vale "o proprio id").
      // O backfill grupo = id das linhas que JA existiam esta na migration e foi conferido na Tarefa 1.
      const semCampos = await prisma.produtoArquivo.create({
        data: { produtoId: produtoReserva.id, tipo: "DOCUMENTO", arquivo: `${"d".repeat(32)}.pdf` },
      });
      conferir(
        "linha criada sem os campos novos vira FOTO/original, com grupo nulo (= o proprio id)",
        [semCampos.papel, semCampos.versao, semCampos.grupo],
        ["FOTO", "original", null],
      );
      await prisma.produtoArquivo.delete({ where: { id: semCampos.id } });

      // gravarNaReserva: JPEG entra como esta; PNG (foto antiga) passa antes pelo padronizador.
      const jpgUm = await foto(1000, 1000);
      const reservaUm = await gravarNaReserva(SKU_RESERVA, jpgUm);
      const reservaDois = await gravarNaReserva(SKU_RESERVA, await foto(900, 900));
      conferir("reserva: nome gerado (32 hexadecimais + .jpg) e tipo image/jpeg", [/^[0-9a-f]{32}\.jpg$/.test(reservaUm.nome), reservaUm.mimeType], [true, "image/jpeg"]);
      conferir("reserva: JPEG e gravado sem mexer nos bytes", (await lerDaReserva(SKU_RESERVA, reservaUm.nome))?.equals(jpgUm), true);
      conferir("reserva: tamanhoBytes confere com o arquivo", reservaUm.tamanhoBytes, jpgUm.length);
      const reservaPng = await gravarNaReserva(SKU_RESERVA, await foto(800, 600, "png"));
      const metaPng = await sharp(await lerDaReserva(SKU_RESERVA, reservaPng.nome)).metadata();
      conferir("reserva: PNG antigo e padronizado antes de gravar (JPEG 1024x1024)", [metaPng.format, metaPng.width, metaPng.height], ["jpeg", 1024, 1024]);
      await apagarDaReserva(SKU_RESERVA, reservaPng.nome);
      conferir("reserva: apagar tira o arquivo", await lerDaReserva(SKU_RESERVA, reservaPng.nome), null);
      await apagarDaReserva(SKU_RESERVA, reservaPng.nome); // ENOENT nao e erro
      conferir("reserva: apagar de novo nao estoura", true, true);
      conferir("reserva: nome fora do formato nao le nada", [await lerDaReserva(SKU_RESERVA, "../../.env"), await lerDaReserva("../fora", reservaUm.nome)], [null, null]);

      const criarReserva = (gravada, versao) =>
        prisma.produtoArquivo.create({
          data: {
            produtoId: produtoReserva.id,
            tipo: "IMAGEM",
            papel: "RESERVA",
            versao,
            grupo: "grupo-de-teste",
            arquivo: gravada.nome,
            mimeType: gravada.mimeType,
            tamanhoBytes: gravada.tamanhoBytes,
            ordem: 0,
            principal: false,
          },
        });
      const linhaReservaUm = await criarReserva(reservaUm, "original");
      const linhaReservaDois = await criarReserva(reservaDois, "photoroom");

      // So RESERVA no produto: a primeira FOTO que chega e a principal e fica na posicao 0.
      const primeiraAnexo = await anexarImagens(produtoReserva.id, SKU_RESERVA, [{ tipo: "endereco", endereco: dataUri(await foto(700, 700), "image/jpeg") }]);
      const fotosA = await prisma.produtoArquivo.findMany({ where: { produtoId: produtoReserva.id, tipo: "IMAGEM", papel: "FOTO" } });
      conferir("a RESERVA nao conta: a 1a foto de verdade e a principal, na posicao 0", [primeiraAnexo.salvas, fotosA.length, fotosA[0]?.principal, fotosA[0]?.ordem], [1, 1, true, 0]);

      // 99 FOTO + 2 RESERVA: sobra 1 vaga das 100 (so FOTO conta), e nao zero.
      await prisma.produtoArquivo.createMany({
        data: Array.from({ length: MAXIMO_IMAGENS - 2 }, (_, i) => ({
          produtoId: produtoReserva.id,
          tipo: "IMAGEM",
          arquivo: `${"e".repeat(28)}${String(i).padStart(4, "0")}.jpg`,
          ordem: i + 1,
        })),
      });
      const cheia = await anexarImagens(produtoReserva.id, SKU_RESERVA, [
        { tipo: "endereco", endereco: dataUri(await foto(710, 710), "image/jpeg") },
        { tipo: "endereco", endereco: dataUri(await foto(720, 720), "image/jpeg") },
      ]);
      conferir("as 100 fotos contam so FOTO: com 99 FOTO e 2 RESERVA sobra 1 vaga", cheia.salvas, 1);
      const fotosCheias = await prisma.produtoArquivo.findMany({ where: { produtoId: produtoReserva.id, tipo: "IMAGEM", papel: "FOTO" }, orderBy: { ordem: "asc" } });
      conferir("... e o produto fecha com 100 FOTO", fotosCheias.length, MAXIMO_IMAGENS);
      // Volta ao produto com 1 FOTO (a do primeiro anexo) e as 2 RESERVA.
      for (const linha of fotosCheias.slice(1)) await apagarArquivo(SKU_RESERVA, "IMAGEM", linha.arquivo);
      await prisma.produtoArquivo.deleteMany({ where: { id: { in: fotosCheias.slice(1).map((l) => l.id) } } });
      const fotoUnica = fotosCheias[0];

      // Leituras de foto: a reserva nunca aparece.
      const daOrigem = await imagensDaOrigem(`rise:${produtoReserva.id}`);
      conferir("Clonar (imagensDaOrigem) so traz as FOTO", [daOrigem.fontes.length, daOrigem.previas.length], [1, 1]);
      const loteReserva = randomUUID();
      const aberta = await acoes.prepararFotosDoProduto(loteReserva, produtoReserva.id);
      conferir("abrir a edicao so traz as FOTO, e a reserva nao vira 'nao carregada'", [aberta.ok, aberta.imagens.length, aberta.naoCarregadas], [true, 1, []]);
      await acoes.descartarLoteDeArquivos(loteReserva);
      conferir("a foto principal nao pode ser uma RESERVA", (await definirImagemPrincipal(linhaReservaUm.id)).ok, false);
      const principaisA = await prisma.produtoArquivo.findMany({ where: { produtoId: produtoReserva.id, principal: true } });
      conferir("... e a principal continua a FOTO", principaisA.map((l) => l.id), [fotoUnica.id]);

      // Excluir a principal escolhe a proxima FOTO, nunca uma RESERVA (as RESERVA ficam na posicao 0 de proposito).
      await anexarImagens(produtoReserva.id, SKU_RESERVA, [{ tipo: "endereco", endereco: dataUri(await foto(730, 730), "image/jpeg") }]);
      try {
        await removerArquivo(fotoUnica.id);
      } catch {
        // revalidatePath so existe dentro do Next; o banco ja foi mexido antes dele.
      }
      const aposRemover = await prisma.produtoArquivo.findMany({ where: { produtoId: produtoReserva.id, tipo: "IMAGEM" }, orderBy: { criadoEm: "asc" } });
      conferir(
        "excluir a principal passa a marca para a proxima FOTO, nunca para uma RESERVA",
        aposRemover.map((l) => [l.papel, l.principal]).sort().map(String),
        [["FOTO", true], ["RESERVA", false], ["RESERVA", false]].sort().map(String),
      );
      conferir("excluir uma RESERVA por aqui e recusado (ela se exclui pelo Salvar)", [(await removerArquivo(linhaReservaDois.id).catch(() => ({ ok: false }))).ok, await prisma.produtoArquivo.count({ where: { id: linhaReservaDois.id } })], [false, 1]);

      // Guarda de codigo: nenhuma leitura de foto sem filtrar o papel.
      const arquivosDeCodigo = (await readdir(join(process.cwd(), "src"), { recursive: true })).filter((nome) => /\.(js|jsx)$/.test(nome));
      const semFiltro = [];
      for (const nome of arquivosDeCodigo) {
        const linhas = (await readFile(join(process.cwd(), "src", nome), "utf8")).split(/\r?\n/);
        linhas.forEach((linha, i) => {
          if (/where:\s*\{[^}]*tipo: "IMAGEM"[^}]*\}/.test(linha) && !linha.includes("papel")) semFiltro.push(`${nome}:${i + 1}`);
        });
      }
      conferir("nenhuma leitura de foto sem filtrar papel", semFiltro, []);

      // Caminho e endereco da reserva: nome so no formato do sistema, nunca um caminho.
      conferir("caminhoDaReserva recusa travessia e extensao fora do padrao", [caminhoDaReserva("ZZ", "../../.env"), caminhoDaReserva("ZZ", `${"a".repeat(32)}.png`), caminhoDaReserva("../fora", reservaUm.nome)], [null, null, null]);
      conferir("caminhoDaReserva aceita o nome gerado", caminhoDaReserva(SKU_RESERVA, reservaUm.nome)?.endsWith(join(SKU_RESERVA, "reserva", reservaUm.nome)), true);
      conferir("urlDaReserva", urlDaReserva(SKU_RESERVA, reservaUm.nome), `/api/arquivos/${SKU_RESERVA}/reserva/${reservaUm.nome}`);

      // A rota serve a pasta reserva.
      const pedir = (caminho) => rotaDeArquivos(new Request("http://localhost/api/arquivos"), { params: Promise.resolve({ caminho }) });
      const servida = await pedir([SKU_RESERVA, "reserva", reservaUm.nome]);
      conferir("rota: reserva existente devolve 200 image/jpeg", [servida.status, servida.headers.get("content-type")], [200, "image/jpeg"]);
      conferir("rota: ... com os bytes do arquivo", Buffer.from(await servida.arrayBuffer()).equals(jpgUm), true);
      conferir("rota: nome valido que nao existe devolve 404", (await pedir([SKU_RESERVA, "reserva", `${"c".repeat(32)}.jpg`])).status, 404);
      conferir("rota: travessia na reserva e recusada", [400, 404].includes((await pedir([SKU_RESERVA, "reserva", "../../.env"])).status), true);
      conferir("rota: pasta desconhecida continua recusada", (await pedir([SKU_RESERVA, "outra", reservaUm.nome])).status, 400);
      // A rota e PUBLICA: o Next ja entrega o SKU decodificado, e um "%" solto nao pode mais virar 500 (era um
      // decodeURIComponent a mais, medido em 08/10/2026). `%zz` nao e SKU valido: 400, como qualquer outro.
      conferir("rota: '%' solto no SKU da reserva e 400, nao 500", (await pedir(["%zz", "reserva", reservaUm.nome])).status, 400);
      conferir("rota: '%' solto no SKU de foto e 400, nao 500", (await pedir(["%zz", "imagens", reservaUm.nome])).status, 400);
      conferir("rota: o corpo e o tamanho vem do arquivo (fluxo)", [servida.headers.get("content-length")], [String(jpgUm.length)]);

      // O fluxo e PREGUICOSO: o Next nao le nem cancela o corpo de um HEAD, e o `createReadStream` abre o arquivo na
      // construcao. Medido em producao em 08/10/2026: 300 HEAD deixaram 300 descritores abertos no servidor.
      {
        const { createReadStream } = await import("node:fs");
        const { fluxoDeArquivo } = await import("../src/lib/arquivos.js");
        const arquivoDoFluxo = caminhoDaReserva(SKU_RESERVA, reservaUm.nome);
        const aberturas = [];
        const espiao = (caminho) => {
          const fluxo = createReadStream(caminho);
          aberturas.push(fluxo);
          return fluxo;
        };

        const naoLido = fluxoDeArquivo(arquivoDoFluxo, espiao);
        await new Promise((resolver) => setTimeout(resolver, 150));
        conferir("fluxo: corpo que ninguem le (o HEAD) nao abre o arquivo", aberturas.length, 0);
        void naoLido;

        const leitor = fluxoDeArquivo(arquivoDoFluxo, espiao).getReader();
        const primeiro = await leitor.read();
        conferir("fluxo: a primeira leitura abre o arquivo, uma vez, e traz dados", [aberturas.length, primeiro.done, primeiro.value?.length > 0], [1, false, true]);
        await leitor.cancel();
        await new Promise((resolver) => setTimeout(resolver, 150));
        conferir("fluxo: cancelar a leitura fecha o arquivo", aberturas[0].destroyed, true);

        const inteiro = Buffer.from(await new Response(fluxoDeArquivo(arquivoDoFluxo)).arrayBuffer());
        conferir("fluxo: lido inteiro e igual ao arquivo", inteiro.equals(jpgUm), true);
      }

      // Trocar o SKU leva a pasta reserva junto.
      const skuNovoReserva = `${SKU_RESERVA}-B`;
      await apagarPastaProduto(skuNovoReserva);
      const trocou = await renomearPastaProduto(SKU_RESERVA, skuNovoReserva);
      conferir("trocar o SKU leva a reserva junto", [trocou.ok, (await lerDaReserva(skuNovoReserva, reservaUm.nome))?.equals(jpgUm)], [true, true]);
      await renomearPastaProduto(skuNovoReserva, SKU_RESERVA);
    }

    // ----- Salvar com reserva (Nano Banana): o que nao vira foto do carrossel vai para a reserva -----
    console.log("\nSalvar com reserva (usa o Postgres e dados/)");
    {
      const { createHash } = await import("node:crypto");
      const { readdir, writeFile: escreverArquivo, mkdir: criarPasta } = await import("node:fs/promises");
      const { dirname: pastaDe, join: juntar } = await import("node:path");
      const { reconciliarImagensDoProduto: salvarFotos } = await import("../src/lib/imagens/produto.js");
      const loteLib = await import("../src/lib/imagens/lote.js");
      const { gravarNaReserva, lerDaReserva } = await import("../src/lib/imagens/reserva.js");
      const { RAIZ } = await import("../src/lib/arquivos.js");

      const lotesSalvar = [];
      const novoLote = () => {
        const id = randomUUID();
        lotesSalvar.push(id);
        return id;
      };
      let produtoS = null;
      const recomecar = async () => {
        await prisma.produto.deleteMany({ where: { sku: SKU_SALVAR } });
        await apagarPastaProduto(SKU_SALVAR);
        produtoS = await prisma.produto.create({ data: { sku: SKU_SALVAR, tituloBase: "Teste do Salvar com reserva" } });
        return { id: produtoS.id, sku: SKU_SALVAR };
      };
      const linhas = () =>
        prisma.produtoArquivo.findMany({ where: { produtoId: produtoS.id, tipo: "IMAGEM" }, orderBy: [{ papel: "asc" }, { ordem: "asc" }, { criadoEm: "asc" }] });
      const deTipo = (lista, papel) => lista.filter((l) => l.papel === papel);
      const sha = (bytes) => (bytes ? createHash("sha1").update(bytes).digest("hex") : null);
      const bytesDaLinha = async (l) =>
        l.papel === "FOTO" ? readFile(caminhoDe(SKU_SALVAR, "IMAGEM", l.arquivo)).catch(() => null) : lerDaReserva(SKU_SALVAR, l.arquivo);
      const naPasta = async (pasta) => (await readdir(juntar(RAIZ, SKU_SALVAR, pasta)).catch(() => [])).sort();
      // Imagens bem diferentes entre si (cores lisas), ja no padrao: o padronizador devolve os mesmos bytes.
      const cor = async (r, g, b) =>
        (await padronizarImagem(await sharp({ create: { width: 1024, height: 1024, channels: 3, background: { r, g, b } } }).jpeg({ quality: 90 }).toBuffer())).bytes;
      const ORIG = await cor(200, 40, 40);
      const PR = await cor(40, 200, 40);
      const NB = await cor(40, 40, 200);
      const OUTRA = await cor(200, 200, 40);
      conferir("as imagens de teste estao no padrao (padronizar de novo nao muda os bytes)", (await padronizarImagem(ORIG)).bytes.equals(ORIG), true);
      // Uma FOTO ja gravada no produto, direto (como o Salvar de antes a deixaria).
      const fotoGravada = async (bytes, dados = {}) => {
        const nome = `${randomUUID().replaceAll("-", "")}.jpg`;
        const alvo = caminhoDe(SKU_SALVAR, "IMAGEM", nome);
        await criarPasta(pastaDe(alvo), { recursive: true });
        await escreverArquivo(alvo, bytes);
        const linha = await prisma.produtoArquivo.create({ data: { produtoId: produtoS.id, tipo: "IMAGEM", arquivo: nome, mimeType: "image/jpeg", tamanhoBytes: bytes.length, ...dados } });
        return prisma.produtoArquivo.update({ where: { id: linha.id }, data: { grupo: dados.grupo ?? linha.id } });
      };
      const reservaGravada = async (bytes, versao, grupo) => {
        const gravada = await gravarNaReserva(SKU_SALVAR, bytes);
        return prisma.produtoArquivo.create({
          data: { produtoId: produtoS.id, tipo: "IMAGEM", papel: "RESERVA", versao, grupo, arquivo: gravada.nome, mimeType: "image/jpeg", tamanhoBytes: gravada.tamanhoBytes, ordem: 0 },
        });
      };

      try {
        // S1: foto nova validada na versao do Photoroom: FOTO photoroom + RESERVA original, no mesmo grupo.
        let alvoS = await recomecar();
        let L = novoLote();
        let nova = await loteLib.adicionarImagem(L, ORIG);
        await loteLib.garantirOriginalGuardado(L, nova.base);
        await loteLib.guardarVersao(L, nova.base, "photoroom", PR);
        await loteLib.escolherVersao(L, nova.base, "photoroom");
        let r = await salvarFotos({ produto: alvoS, lote: L, itens: [{ base: nova.base, finalizada: true, versao: "photoroom" }] });
        let ls = await linhas();
        conferir("S1: 1 FOTO photoroom e 1 RESERVA original", [r.novas, r.reservadas, deTipo(ls, "FOTO").map((l) => l.versao), deTipo(ls, "RESERVA").map((l) => l.versao)], [1, 1, ["photoroom"], ["original"]]);
        conferir("S1: no mesmo grupo, e o grupo e gravado", [ls[0].grupo !== null, ls[0].grupo === ls[1]?.grupo], [true, true]);
        conferir("S1: os bytes certos em cada uma", [sha(await bytesDaLinha(deTipo(ls, "FOTO")[0])), sha(await bytesDaLinha(deTipo(ls, "RESERVA")[0] ?? {}))], [sha(PR), sha(ORIG)]);
        conferir("S1: a RESERVA nao e principal", deTipo(ls, "RESERVA")[0]?.principal, false);

        // S2: validada na ORIGINAL, com Nano Banana pago: FOTO original + RESERVA nanobanana (a original nao duplica).
        alvoS = await recomecar();
        L = novoLote();
        nova = await loteLib.adicionarImagem(L, ORIG);
        await loteLib.garantirOriginalGuardado(L, nova.base);
        await loteLib.guardarVersao(L, nova.base, "nanobanana", NB);
        r = await salvarFotos({ produto: alvoS, lote: L, itens: [{ base: nova.base, finalizada: true, versao: "original" }] });
        ls = await linhas();
        conferir("S2: FOTO original e so a nanobanana na reserva", [r.reservadas, deTipo(ls, "FOTO").map((l) => l.versao), deTipo(ls, "RESERVA").map((l) => l.versao)], [1, ["original"], ["nanobanana"]]);
        conferir("S2: a reserva tem os bytes do Nano Banana", sha(await bytesDaLinha(deTipo(ls, "RESERVA")[0] ?? {})), sha(NB));

        // S3 + S4: paga sem validar vai inteira para a reserva; candidata nunca tocada some.
        alvoS = await recomecar();
        L = novoLote();
        const paga = await loteLib.adicionarImagem(L, ORIG);
        await loteLib.garantirOriginalGuardado(L, paga.base);
        await loteLib.guardarVersao(L, paga.base, "nanobanana", NB);
        const intocada = await loteLib.adicionarImagem(L, OUTRA);
        r = await salvarFotos({
          produto: alvoS,
          lote: L,
          itens: [
            { base: paga.base, finalizada: false, versao: "original" },
            { base: intocada.base, finalizada: false },
          ],
        });
        ls = await linhas();
        conferir("S3: paga sem validar: nenhuma FOTO, 2 RESERVA (original e nanobanana)", [r.novas, r.reservadas, deTipo(ls, "FOTO").length, deTipo(ls, "RESERVA").map((l) => l.versao).sort()], [0, 2, 0, ["nanobanana", "original"]]);
        conferir("S3: as duas no mesmo grupo", new Set(ls.map((l) => l.grupo)).size, 1);
        conferir("S4: a candidata nunca tocada nao e gravada em lugar nenhum", (await Promise.all(ls.map(bytesDaLinha))).some((b) => sha(b) === sha(OUTRA)), false);
        conferir("S4: e a pasta de imagens fica vazia", await naPasta("imagens"), []);

        // S5: FOTO original existente, escolhe Nano Banana: a mesma linha muda; o velho desce para a reserva, uma vez so.
        alvoS = await recomecar();
        const fotoS5 = await fotoGravada(ORIG, { principal: true });
        L = novoLote();
        let aberto = await acoes.prepararFotosDoProduto(L, produtoS.id);
        const base5 = aberto.imagens[0].base;
        await loteLib.guardarVersao(L, base5, "nanobanana", NB);
        await loteLib.garantirOriginalGuardado(L, base5);
        await loteLib.escolherVersao(L, base5, "nanobanana");
        r = await salvarFotos({ produto: alvoS, lote: L, itens: [{ base: base5, arquivoId: fotoS5.id, finalizada: true, versao: "nanobanana" }] });
        ls = await linhas();
        const fotoS5Depois = deTipo(ls, "FOTO")[0];
        conferir("S5: a mesma linha, com arquivo novo e versao nanobanana", [r.substituidas, fotoS5Depois.id, fotoS5Depois.arquivo !== fotoS5.arquivo, fotoS5Depois.versao, fotoS5Depois.grupo], [1, fotoS5.id, true, "nanobanana", fotoS5.id]);
        conferir("S5: o arquivo velho saiu da pasta de imagens", (await naPasta("imagens")).includes(fotoS5.arquivo), false);
        conferir("S5: e mora na reserva como original, UMA vez", [r.reservadas, deTipo(ls, "RESERVA").map((l) => [l.versao, l.grupo]), sha(await bytesDaLinha(deTipo(ls, "RESERVA")[0] ?? {}))], [1, [["original", fotoS5.id]], sha(ORIG)]);
        conferir("S5: na pasta reserva so o arquivo da linha", await naPasta("reserva"), deTipo(ls, "RESERVA").map((l) => l.arquivo));

        // S6: foto antiga em PNG, so padronizada: a linha muda, o PNG some e NADA vai para a reserva.
        alvoS = await recomecar();
        const NOME_PNG = `${"9".repeat(32)}.png`;
        const caminhoPng = caminhoDe(SKU_SALVAR, "IMAGEM", NOME_PNG);
        await criarPasta(pastaDe(caminhoPng), { recursive: true });
        await escreverArquivo(caminhoPng, await foto(800, 600, "png"));
        const fotoPng = await prisma.produtoArquivo.create({ data: { produtoId: produtoS.id, tipo: "IMAGEM", arquivo: NOME_PNG, mimeType: "image/png", tamanhoBytes: 1, principal: true } });
        L = novoLote();
        aberto = await acoes.prepararFotosDoProduto(L, produtoS.id);
        r = await salvarFotos({ produto: alvoS, lote: L, itens: [{ base: aberto.imagens[0].base, arquivoId: fotoPng.id, finalizada: true }] });
        ls = await linhas();
        conferir("S6: padronizada na mesma linha, sem reserva", [r.substituidas, r.reservadas, ls.length, ls[0].id, ls[0].arquivo.endsWith(".jpg")], [1, 0, 1, fotoPng.id, true]);
        conferir("S6: o PNG saiu do disco e a pasta reserva nem existe", [await readFile(caminhoPng).then(() => "existe", () => "sumiu"), await naPasta("reserva")], ["sumiu", []]);
        conferir("S6: a linha antiga ganha o grupo dela (= o id)", ls[0].grupo, fotoPng.id);

        // S7: FOTO nanobanana com RESERVA original, versoes carregadas no lote; o dono volta a original.
        alvoS = await recomecar();
        const fotoS7 = await fotoGravada(NB, { versao: "nanobanana", principal: true });
        const reservaS7 = await reservaGravada(ORIG, "original", fotoS7.grupo);
        L = novoLote();
        const base7 = (await loteLib.adicionarImagem(L, ORIG)).base; // como a Tarefa 6 faz: o original do lote e a original verdadeira
        await loteLib.guardarVersao(L, base7, "nanobanana", NB);
        await loteLib.garantirOriginalGuardado(L, base7);
        r = await salvarFotos({ produto: alvoS, lote: L, itens: [{ base: base7, arquivoId: fotoS7.id, finalizada: true, versao: "original" }] });
        ls = await linhas();
        conferir("S7: a FOTO volta a ser a original (mesma linha)", [deTipo(ls, "FOTO").map((l) => [l.id, l.versao]), sha(await bytesDaLinha(deTipo(ls, "FOTO")[0]))], [[[fotoS7.id, "original"]], sha(ORIG)]);
        conferir("S7: 1 RESERVA nanobanana, sem duplicata", [deTipo(ls, "RESERVA").map((l) => l.versao), sha(await bytesDaLinha(deTipo(ls, "RESERVA")[0] ?? {}))], [["nanobanana"], sha(NB)]);
        conferir("S7: a RESERVA original (agora na FOTO) saiu, linha e arquivo", [await prisma.produtoArquivo.count({ where: { id: reservaS7.id } }), (await naPasta("reserva")).includes(reservaS7.arquivo)], [0, false]);

        // S8: trouxe da reserva para o carrossel; a FOTO do mesmo grupo saiu da lista e desce para a reserva.
        alvoS = await recomecar();
        const fotoS8 = await fotoGravada(ORIG, { principal: true });
        const reservaS8 = await reservaGravada(PR, "photoroom", fotoS8.grupo);
        L = novoLote();
        const trazida = await loteLib.adicionarImagem(L, PR);
        r = await salvarFotos({ produto: alvoS, lote: L, itens: [{ base: trazida.base, finalizada: true, versao: "photoroom", grupo: fotoS8.grupo }] });
        ls = await linhas();
        const fotoS8Nova = deTipo(ls, "FOTO")[0];
        const reservaS8Depois = deTipo(ls, "RESERVA");
        conferir("S8: no fim 1 FOTO e 1 RESERVA", [deTipo(ls, "FOTO").length, reservaS8Depois.length], [1, 1]);
        conferir("S8: a FOTO nova e a trazida (photoroom), no grupo da foto", [fotoS8Nova?.versao, fotoS8Nova?.grupo, fotoS8Nova?.principal, sha(await bytesDaLinha(fotoS8Nova ?? {}))], ["photoroom", fotoS8.grupo, true, sha(PR)]);
        conferir("S8: a FOTO antiga virou a RESERVA (a mesma linha), com os bytes dela", [reservaS8Depois[0]?.id, reservaS8Depois[0]?.versao, sha(await bytesDaLinha(reservaS8Depois[0] ?? {}))], [fotoS8.id, "original", sha(ORIG)]);
        conferir("S8: a RESERVA de origem sumiu, e o arquivo da foto antiga saiu de imagens/", [await prisma.produtoArquivo.count({ where: { id: reservaS8.id } }), (await naPasta("imagens")).includes(fotoS8.arquivo)], [0, false]);
        conferir("S8: so os arquivos das linhas ficam no disco", [await naPasta("imagens"), await naPasta("reserva")], [deTipo(ls, "FOTO").map((l) => l.arquivo), reservaS8Depois.map((l) => l.arquivo)]);

        // S11: reabrir e salvar sem mudar nada (estado do S8): nada criado, nada apagado.
        const antesS11 = await linhas();
        const arquivosAntesS11 = [await naPasta("imagens"), await naPasta("reserva")];
        L = novoLote();
        aberto = await acoes.prepararFotosDoProduto(L, produtoS.id);
        r = await salvarFotos({ produto: alvoS, lote: L, itens: aberto.imagens.map((i) => ({ base: i.base, arquivoId: i.arquivoId, finalizada: i.finalizada, versao: i.versao })), preservar: aberto.naoCarregadas });
        conferir("S11: reabrir e salvar sem mudar: 0 reservadas e as mesmas linhas", [r.reservadas, r.removidas, (await linhas()).map((l) => l.id)], [0, 0, antesS11.map((l) => l.id)]);
        conferir("S11: ... e os mesmos arquivos", [await naPasta("imagens"), await naPasta("reserva")], arquivosAntesS11);

        // S9: excluir da reserva: so ids de RESERVA deste produto valem.
        const idReservaS9 = deTipo(antesS11, "RESERVA")[0]?.id;
        const arquivoReservaS9 = deTipo(antesS11, "RESERVA")[0]?.arquivo;
        const idFotoS9 = deTipo(antesS11, "FOTO")[0]?.id;
        L = novoLote();
        aberto = await acoes.prepararFotosDoProduto(L, produtoS.id);
        r = await salvarFotos({
          produto: alvoS,
          lote: L,
          itens: aberto.imagens.map((i) => ({ base: i.base, arquivoId: i.arquivoId, finalizada: true })),
          reservaExcluida: [idReservaS9, idFotoS9, "outro-produto"],
        });
        ls = await linhas();
        conferir("S9: so a RESERVA some (linha e arquivo); a FOTO fica", [r.reservaExcluidas, ls.map((l) => l.id), (await naPasta("reserva")).includes(arquivoReservaS9)], [1, [idFotoS9], false]);

        // S10: FOTO excluida na tela (fora da lista, sem foto do mesmo grupo): apagada de verdade, sem RESERVA.
        alvoS = await recomecar();
        const fica = await fotoGravada(ORIG, { principal: true, ordem: 0 });
        const sai = await fotoGravada(OUTRA, { ordem: 1 });
        L = novoLote();
        aberto = await acoes.prepararFotosDoProduto(L, produtoS.id);
        const doFica = aberto.imagens.find((i) => i.arquivoId === fica.id);
        r = await salvarFotos({ produto: alvoS, lote: L, itens: [{ base: doFica.base, arquivoId: fica.id, finalizada: true }] });
        ls = await linhas();
        conferir("S10: a excluida some (linha e arquivo), sem reserva", [r.removidas, r.reservadas, ls.map((l) => l.id), (await naPasta("imagens")).includes(sai.arquivo), await naPasta("reserva")], [1, 0, [fica.id], false, []]);

        // S12: as 100 fotos contam so FOTO: 100 validadas + 3 RESERVA, e uma 101a ainda fica de fora.
        alvoS = await recomecar();
        await prisma.produtoArquivo.createMany({
          data: Array.from({ length: MAXIMO_IMAGENS }, (_, i) => ({ produtoId: produtoS.id, tipo: "IMAGEM", arquivo: `${"c".repeat(28)}${String(i).padStart(4, "0")}.jpg`, ordem: i, principal: i === 0 })),
        });
        const cem = await prisma.produtoArquivo.findMany({ where: { produtoId: produtoS.id }, orderBy: { ordem: "asc" } });
        for (const [i, bytes] of [ORIG, PR, NB].entries()) await reservaGravada(bytes, "original", cem[i].id);
        L = novoLote();
        const sobra = await loteLib.adicionarImagem(L, OUTRA);
        r = await salvarFotos({
          produto: alvoS,
          lote: L,
          // As 100 com uma base que nao esta no lote: o lote "perdeu" a foto, e a do produto continua valendo.
          itens: [...cem.map((l) => ({ base: randomUUID().replaceAll("-", ""), arquivoId: l.id, finalizada: true })), { base: sobra.base, finalizada: true }],
        });
        ls = await linhas();
        conferir("S12: 100 FOTO mantidas, a 101a fica de fora, as 3 RESERVA ficam", [r.mantidas, r.novas, deTipo(ls, "FOTO").length, deTipo(ls, "RESERVA").length], [MAXIMO_IMAGENS, 0, MAXIMO_IMAGENS, 3]);
      } finally {
        for (const id of lotesSalvar) await acoes.descartarLoteDeArquivos(id);
        await prisma.produto.deleteMany({ where: { sku: SKU_SALVAR } });
        await apagarPastaProduto(SKU_SALVAR);
      }

      // ----- Reabrir com reserva: a janela parte da original VERDADEIRA, e reabrir+salvar nao duplica -----
      console.log("\nReabrir com reserva (usa o Postgres e dados/)");
      const lotesReabrir = [];
      const loteReabrir = () => {
        const id = randomUUID();
        lotesReabrir.push(id);
        return id;
      };
      try {
        await prisma.produto.deleteMany({ where: { sku: SKU_REABRIR } });
        await apagarPastaProduto(SKU_REABRIR);
        const produtoR = await prisma.produto.create({ data: { sku: SKU_REABRIR, tituloBase: "Teste do reabrir com reserva" } });
        const alvoR = { id: produtoR.id, sku: SKU_REABRIR };
        const nomeFoto = `${randomUUID().replaceAll("-", "")}.jpg`;
        const caminhoFoto = caminhoDe(SKU_REABRIR, "IMAGEM", nomeFoto);
        await criarPasta(pastaDe(caminhoFoto), { recursive: true });
        await escreverArquivo(caminhoFoto, NB);
        const fotoR = await prisma.produtoArquivo.create({ data: { produtoId: produtoR.id, tipo: "IMAGEM", arquivo: nomeFoto, versao: "nanobanana", principal: true } });
        await prisma.produtoArquivo.update({ where: { id: fotoR.id }, data: { grupo: fotoR.id } });
        const gravadaR = await gravarNaReserva(SKU_REABRIR, ORIG);
        const reservaR = await prisma.produtoArquivo.create({
          data: { produtoId: produtoR.id, tipo: "IMAGEM", papel: "RESERVA", versao: "original", grupo: fotoR.id, arquivo: gravadaR.nome, mimeType: "image/jpeg", tamanhoBytes: gravadaR.tamanhoBytes },
        });

        let L = loteReabrir();
        const aberto = await acoes.prepararFotosDoProduto(L, produtoR.id);
        const im = aberto.imagens[0];
        conferir("reabrir: a foto volta com a versao e o grupo da linha", [aberto.ok, aberto.imagens.length, im?.versao, im?.grupo, im?.arquivoId], [true, 1, "nanobanana", fotoR.id, fotoR.id]);
        conferir("reabrir: a tela sabe da versao nanobanana e tem o endereco da original", [im?.versoes?.nanobanana, Boolean(im?.urls?.original), Boolean(im?.urls?.nanobanana)], [true, true, true]);
        const originalNoLote = await loteLib.originalDoLote(L, im.base);
        conferir("reabrir: o original do lote e a ORIGINAL verdadeira (a da reserva), nao a foto atual", [sha(originalNoLote?.bytes), sha(originalNoLote?.bytes) === sha(NB)], [sha(ORIG), false]);
        conferir("reabrir: escolher a original na janela poe os bytes da reserva", [(await loteLib.escolherVersao(L, im.base, "original")).ok, sha(await loteLib.lerDoLote(L, "imagens", `${im.base}.jpg`))], [true, sha(ORIG)]);
        await loteLib.escolherVersao(L, im.base, "nanobanana");
        conferir(
          "reabrir: a lista da reserva vem com versao, grupo e endereco",
          [aberto.reserva?.length, aberto.reserva?.[0]?.id, aberto.reserva?.[0]?.versao, aberto.reserva?.[0]?.grupo, aberto.reserva?.[0]?.url],
          [1, reservaR.id, "original", fotoR.id, `/api/arquivos/${SKU_REABRIR}/reserva/${gravadaR.nome}`],
        );

        // Reabrir e salvar sem mudar nada: nada criado nem apagado, a reserva continua com 1.
        const reservaAntes = (await readdir(juntar(RAIZ, SKU_REABRIR, "reserva"))).sort();
        const semMudar = await salvarFotos({
          produto: alvoR,
          lote: L,
          itens: aberto.imagens.map((i) => ({ base: i.base, arquivoId: i.arquivoId, finalizada: i.finalizada, versao: i.versao, grupo: i.grupo })),
          preservar: aberto.naoCarregadas,
        });
        const depois = await prisma.produtoArquivo.findMany({ where: { produtoId: produtoR.id }, orderBy: { criadoEm: "asc" } });
        conferir(
          "reabrir e salvar sem mudar: 0 reservadas, 0 apagadas, as mesmas 2 linhas",
          [semMudar.mantidas, semMudar.reservadas, semMudar.removidas, depois.map((l) => [l.id, l.papel, l.versao])],
          [1, 0, 0, [[fotoR.id, "FOTO", "nanobanana"], [reservaR.id, "RESERVA", "original"]]],
        );
        conferir("... e nenhum arquivo novo na reserva", (await readdir(juntar(RAIZ, SKU_REABRIR, "reserva"))).sort(), reservaAntes);

        // Trazer da reserva para o carrossel ("Escolher essa" da reserva): a imagem entra no lote, ja validada.
        const loteTrazer = loteReabrir();
        const trazida = await acoes.trazerDaReserva(loteTrazer, reservaR.id);
        conferir(
          "trazer da reserva: imagem validada, com a versao, o grupo e o id da reserva",
          [trazida.ok, trazida.imagem?.finalizada, trazida.imagem?.versao, trazida.imagem?.grupo, trazida.imagem?.reservaId],
          [true, true, "original", fotoR.id, reservaR.id],
        );
        conferir("trazer da reserva: os bytes da reserva ficam em imagens/<base>.jpg", sha(await loteLib.lerDoLote(loteTrazer, "imagens", `${trazida.imagem?.base}.jpg`)), sha(ORIG));
        conferir("trazer da reserva: o original do lote tambem e o da reserva", sha((await loteLib.originalDoLote(loteTrazer, trazida.imagem?.base))?.bytes), sha(ORIG));
        const trazerFoto = await acoes.trazerDaReserva(loteTrazer, fotoR.id);
        conferir("trazer um id de FOTO e recusado (so RESERVA)", [trazerFoto.ok, typeof trazerFoto.erro], [false, "string"]);
        conferir("trazer id que nao existe e lote invalido sao recusados", [(await acoes.trazerDaReserva(loteTrazer, "id-inventado")).ok, (await acoes.trazerDaReserva("../fora", reservaR.id)).ok], [false, false]);

        // Reserva cujo arquivo sumiu: a foto abre mesmo assim, e a reserva ilegivel so nao entra nas versoes.
        const { unlink } = await import("node:fs/promises");
        await unlink(juntar(RAIZ, SKU_REABRIR, "reserva", gravadaR.nome));
        L = loteReabrir();
        const semArquivo = await acoes.prepararFotosDoProduto(L, produtoR.id);
        conferir(
          "reserva com arquivo sumido nao derruba a abertura",
          [semArquivo.ok, semArquivo.imagens.length, semArquivo.reserva?.length, await loteLib.lerVersao(L, semArquivo.imagens[0]?.base, "original").then((b) => sha(b) === sha(ORIG))],
          [true, 1, 1, false],
        );
        conferir("trazer da reserva com o arquivo sumido e recusado", (await acoes.trazerDaReserva(loteReabrir(), reservaR.id)).ok, false);

        // Produto sem reserva: reserva vazia, a foto original segue como antes.
        await prisma.produtoArquivo.deleteMany({ where: { produtoId: produtoR.id, papel: "RESERVA" } });
        await prisma.produtoArquivo.update({ where: { id: fotoR.id }, data: { versao: "original" } });
        L = loteReabrir();
        const simples = await acoes.prepararFotosDoProduto(L, produtoR.id);
        conferir("produto sem reserva: reserva [] e a foto como original, sem versao gerada", [simples.reserva, simples.imagens[0]?.versao, simples.imagens[0]?.versoes, simples.imagens[0]?.urls?.original], [[], "original", { photoroom: false, nanobanana: false }, null]);
      } finally {
        for (const id of lotesReabrir) await acoes.descartarLoteDeArquivos(id);
        await prisma.produto.deleteMany({ where: { sku: SKU_REABRIR } });
        await apagarPastaProduto(SKU_REABRIR);
      }

      // ----- Nano Banana: gerar (Postgres e dados/, fetch simulado, chaves inventadas) -----
      console.log("\nNano Banana: gerar (usa o Postgres e dados/, fetch simulado)");
      const nbAcoes = await import("../src/app/produtos/acoes-nanobanana.js");
      const { usoDoNanoBanana: usoNB } = await import("../src/lib/integracoes/nanobananaLog.js");
      const { RAIZ_TEMPORARIA: RAIZ_LOTE } = await import("../src/lib/arquivos.js");
      const ENV_NB = ["GEMINI_API_KEY", "NANO_BANANA_GERACAO", "NANO_BANANA_TETO_DIA"];
      const envAntesNB = Object.fromEntries(ENV_NB.map((nome) => [nome, process.env[nome]]));
      const fetchAntesGerar = globalThis.fetch;
      const inicioGerar = new Date();
      const L = randomUUID();
      const chamadasGerar = [];
      let cores = 0;
      let respostaGerar = null;
      // Cada chamada devolve um PNG 700x700 de outra cor: "gerar de novo" tem que trocar a versao.
      const pngGerado = (largura = 700, altura = 700) =>
        sharp({ create: { width: largura, height: altura, channels: 3, background: { r: 30 + (cores++ % 200), g: 120, b: 60 } } }).png().toBuffer();
      const respostaComImagem = async (bytes) =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: (bytes ?? (await pngGerado())).toString("base64") } }] }, finishReason: "STOP" }] }), { status: 200 });
      try {
        process.env.GEMINI_API_KEY = "chave-falsa-do-teste";
        process.env.NANO_BANANA_GERACAO = "true";
        process.env.NANO_BANANA_TETO_DIA = "100000";
        globalThis.fetch = async (url, inicio) => {
          chamadasGerar.push({ url: String(url), corpo: JSON.parse(inicio.body) });
          return respostaGerar ? respostaGerar() : respostaComImagem();
        };
        const foto1 = await loteLib.adicionarImagem(L, ORIG);
        const foto2 = await loteLib.adicionarImagem(L, OUTRA);
        await loteLib.guardarVersao(L, foto1.base, "photoroom", PR);
        const fotoAntes = await loteLib.lerDoLote(L, "imagens", `${foto1.base}.jpg`);
        const pedido = { modelo: "nano-banana-2", prompt: "Foto de estudio do produto", extras: [] };

        const gerada = await nbAcoes.gerarComNanoBanana(L, foto1.base, pedido);
        const versaoNB = await loteLib.lerVersao(L, foto1.base, "nanobanana");
        conferir("gerar: uma chamada, e a versao nanobanana fica guardada", [gerada.ok, chamadasGerar.length, gerada.versoes?.nanobanana, Boolean(gerada.urls?.nanobanana)], [true, 1, true, true]);
        conferir("gerar: devolve o custo do modelo e nao a foto inteira", [gerada.custoUsd, "versao" in gerada, "finalizada" in gerada], [0.067, false, false]);
        conferir("gerar: a versao guardada sai 1024x1024", (await sharp(versaoNB).metadata()).width, 1024);
        conferir(
          "gerar: a foto do produto, a do Photoroom e a original ficam intactas",
          [(await loteLib.lerDoLote(L, "imagens", `${foto1.base}.jpg`)).equals(fotoAntes), (await loteLib.lerVersao(L, foto1.base, "photoroom"))?.equals(PR), sha((await loteLib.originalDoLote(L, foto1.base)).bytes)],
          [true, true, sha(ORIG)],
        );
        conferir("gerar: a original padronizada tambem fica guardada", Boolean(await loteLib.lerVersao(L, foto1.base, "original")), true);
        const geracao = await loteLib.lerGeracao(L, foto1.base);
        conferir("gerar: o pedido fica em geracoes/ (modelo, prompt e extras)", [geracao?.modelo, geracao?.prompt, geracao?.extras, typeof geracao?.em], ["nano-banana-2", "Foto de estudio do produto", [], "string"]);
        conferir("gerar: o original vai no pedido", chamadasGerar[0].corpo.contents[0].parts[1].inline_data.data, ORIG.toString("base64"));
        let logs = await prisma.logIntegracao.findMany({ where: { servico: "GEMINI", criadoEm: { gte: inicioGerar } }, orderBy: { criadoEm: "asc" } });
        conferir("gerar: 1 linha GEMINI 200, sem chave nem prompt", [logs.length, logs[0]?.statusHttp, /chave-falsa|estudio/.test(JSON.stringify(logs))], [1, 200, false]);
        conferir("gerar: o resumo do log tem pixels da original, extras, tamanho do prompt, repetida", JSON.parse(logs[0].requestResumo), { pixelsOrigem: 1024 * 1024, extras: 0, tamanhoPrompt: 26, repetida: false });

        // Gerar de novo: troca a versao nanobanana (so a ultima fica) e conta duas no uso.
        const hojeAntes = (await usoNB()).hoje;
        const deNovo = await nbAcoes.gerarComNanoBanana(L, foto1.base, { ...pedido, repetida: true });
        conferir("gerar de novo: outra chamada, outra imagem no lugar da anterior", [deNovo.ok, chamadasGerar.length, sha(await loteLib.lerVersao(L, foto1.base, "nanobanana")) !== sha(versaoNB)], [true, 2, true]);
        conferir("gerar de novo: continua UM arquivo nanobanana, e a foto do produto nao mudou", [(await readdir(juntar(RAIZ_LOTE, L, "versoes"))).filter((n) => n.startsWith(`${foto1.base}.nanobanana`)).length, (await loteLib.lerDoLote(L, "imagens", `${foto1.base}.jpg`)).equals(fotoAntes)], [1, true]);
        conferir("gerar de novo: o uso conta mais uma, e o log marca repetida", [(await usoNB()).hoje - hojeAntes, JSON.parse((await prisma.logIntegracao.findFirst({ where: { servico: "GEMINI", criadoEm: { gte: inicioGerar } }, orderBy: { criadoEm: "desc" } })).requestResumo).repetida], [1, true]);

        // Recusas ANTES de chamar o Google: nenhuma chamada sai.
        const antesDasRecusas = chamadasGerar.length;
        const recusasGerar = [
          ["lote invalido", () => nbAcoes.gerarComNanoBanana("../fora", foto1.base, pedido)],
          ["foto invalida", () => nbAcoes.gerarComNanoBanana(L, "../x", pedido)],
          ["modelo desconhecido", () => nbAcoes.gerarComNanoBanana(L, foto1.base, { ...pedido, modelo: "nano-banana-1" })],
          ["prompt vazio", () => nbAcoes.gerarComNanoBanana(L, foto1.base, { ...pedido, prompt: "   " })],
          ["prompt longo demais", () => nbAcoes.gerarComNanoBanana(L, foto1.base, { ...pedido, prompt: "a".repeat(MAXIMO_PROMPT + 1) })],
          ["extra enviada que nao existe", () => nbAcoes.gerarComNanoBanana(L, foto1.base, { ...pedido, extras: [{ tipo: "enviada", n: 3 }] })],
          ["extra que e a propria foto", () => nbAcoes.gerarComNanoBanana(L, foto1.base, { ...pedido, extras: [{ tipo: "foto", base: foto1.base }] })],
          ["extra de foto que nao esta no lote", () => nbAcoes.gerarComNanoBanana(L, foto1.base, { ...pedido, extras: [{ tipo: "foto", base: "e".repeat(32) }] })],
          [`mais de ${MAXIMO_EXTRAS} extras`, () => nbAcoes.gerarComNanoBanana(L, foto1.base, { ...pedido, extras: Array.from({ length: MAXIMO_EXTRAS + 1 }, () => ({ tipo: "foto", base: foto2.base })) })],
        ];
        for (const [nome, chamar] of recusasGerar) {
          const r = await chamar();
          conferir(`${nome}: recusado em portugues, sem chamar o Google`, [r.ok, typeof r.erro === "string" && r.erro.length > 5], [false, true]);
        }
        process.env.NANO_BANANA_GERACAO = "false";
        const travada = await nbAcoes.gerarComNanoBanana(L, foto1.base, pedido);
        conferir("trava desligada: recusado com o motivo", [travada.ok, /NANO_BANANA_GERACAO=true/.test(semAcento(travada.erro))], [false, true]);
        process.env.NANO_BANANA_GERACAO = "true";
        delete process.env.GEMINI_API_KEY;
        conferir("sem chave: recusado com o motivo", /GEMINI_API_KEY/.test((await nbAcoes.gerarComNanoBanana(L, foto1.base, pedido)).erro), true);
        process.env.GEMINI_API_KEY = "chave-falsa-do-teste";
        process.env.NANO_BANANA_TETO_DIA = String((await usoNB()).hoje);
        const noTeto = await nbAcoes.gerarComNanoBanana(L, foto1.base, pedido);
        conferir("teto do dia: a proxima e recusada", [noTeto.ok, /limite de \d+ geracoes de hoje acabou/i.test(semAcento(noTeto.erro))], [false, true]);
        process.env.NANO_BANANA_TETO_DIA = "100000";
        conferir("... e nenhuma das recusas chamou o Google", chamadasGerar.length, antesDasRecusas);

        // Duas ao mesmo tempo na MESMA foto: so uma passa; a outra e recusada sem chamar. Depois, libera.
        let soltar;
        const segurar = new Promise((resolve) => (soltar = resolve));
        respostaGerar = async () => {
          await segurar;
          return respostaComImagem();
        };
        const antesDoPar = chamadasGerar.length;
        const par = [nbAcoes.gerarComNanoBanana(L, foto1.base, pedido), nbAcoes.gerarComNanoBanana(L, foto1.base, pedido)];
        // A recusada termina primeiro (a outra esta presa no Google falso); so depois a outra e solta.
        const primeiraAterminar = await Promise.race(par);
        soltar();
        const resultadosDoPar = await Promise.all(par);
        conferir(
          "duas ao mesmo tempo: 1 chamada, 1 sucesso e 1 'ja ha uma geracao'",
          [chamadasGerar.length - antesDoPar, resultadosDoPar.filter((x) => x.ok).length, primeiraAterminar.ok, /Ja ha uma geracao/.test(semAcento(primeiraAterminar.erro ?? ""))],
          [1, 1, false, true],
        );
        respostaGerar = null;
        conferir("... e depois de terminar, a mesma foto gera de novo", (await nbAcoes.gerarComNanoBanana(L, foto1.base, pedido)).ok, true);
        const antesDeDuasFotos = chamadasGerar.length;
        const [d1, d2] = await Promise.all([nbAcoes.gerarComNanoBanana(L, foto1.base, pedido), nbAcoes.gerarComNanoBanana(L, foto2.base, pedido)]);
        conferir("fotos diferentes no mesmo instante nao se bloqueiam", [d1.ok, d2.ok, chamadasGerar.length - antesDeDuasFotos], [true, true, 2]);

        // Extras: carrossel manda o ORIGINAL da outra foto; enviada manda o arquivo de extras/; Lite nao manda nenhuma.
        const extraEnviada = await loteLib.adicionarExtra(L, foto1.base, NB);
        conferir("extra enviada recebe o primeiro numero livre", [extraEnviada.ok, extraEnviada.n], [true, 1]);
        const comExtras = await nbAcoes.gerarComNanoBanana(L, foto1.base, { ...pedido, extras: [{ tipo: "foto", base: foto2.base }, { tipo: "enviada", n: 1 }] });
        const partesEnviadas = chamadasGerar.at(-1).corpo.contents[0].parts;
        conferir(
          "extras: prompt, original, regra, a outra foto e a enviada, nessa ordem",
          [comExtras.ok, partesEnviadas.length, partesEnviadas[3]?.inline_data?.data === OUTRA.toString("base64"), partesEnviadas[4]?.inline_data?.data === NB.toString("base64")],
          [true, 5, true, true],
        );
        conferir("extras: o log conta 2 extras", JSON.parse((await prisma.logIntegracao.findFirst({ where: { servico: "GEMINI", criadoEm: { gte: inicioGerar } }, orderBy: { criadoEm: "desc" } })).requestResumo).extras, 2);
        const comLite = await nbAcoes.gerarComNanoBanana(L, foto1.base, { ...pedido, modelo: "nano-banana-2-lite", extras: [{ tipo: "foto", base: foto2.base }, { tipo: "enviada", n: 1 }] });
        conferir("Lite: so o prompt e a original vao, mesmo com extras pedidas", [comLite.ok, chamadasGerar.at(-1).corpo.contents[0].parts.length, chamadasGerar.at(-1).url.endsWith("gemini-3.1-flash-lite-image:generateContent")], [true, 2, true]);

        // Respostas ruins do Google: nada vira versao; o log registra o 200 so quando o Google respondeu 200.
        const ruins = [
          ["200 so com texto", () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Nao vou gerar" }] } }] }), { status: 200 }), 200, /nao devolveu imagem/],
          ["200 com IMAGE_SAFETY", () => new Response(JSON.stringify({ candidates: [{ finishReason: "IMAGE_SAFETY" }] }), { status: 200 }), 200, /recusou esta foto/],
          ["200 com base64 que nao e imagem", () => respostaComImagem(Buffer.from("nao e imagem nenhuma")), 200, /nao pode ser lida/],
          ["200 com PNG quebrado (o sharp nao abre)", () => respostaComImagem(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)])), 200, /cobrada, mas a imagem recebida nao pode ser tratada/],
          ["429", () => new Response(JSON.stringify({ error: { message: "quota" } }), { status: 429 }), 429, /Limite ou cota/],
        ];
        for (const [nome, resposta, status, mensagem] of ruins) {
          const antesNB = await loteLib.lerVersao(L, foto1.base, "nanobanana");
          const hojeAntesRuim = (await usoNB()).hoje;
          respostaGerar = resposta;
          const ruim = await nbAcoes.gerarComNanoBanana(L, foto1.base, pedido);
          const ultimo = await prisma.logIntegracao.findFirst({ where: { servico: "GEMINI", criadoEm: { gte: inicioGerar } }, orderBy: { criadoEm: "desc" } });
          conferir(
            `${nome}: erro em portugues, a versao anterior fica, o log tem o status`,
            [ruim.ok, mensagem.test(semAcento(ruim.erro ?? "")), (await loteLib.lerVersao(L, foto1.base, "nanobanana")).equals(antesNB), ultimo.statusHttp],
            [false, true, true, status],
          );
          conferir(`${nome}: conta no uso so se o Google respondeu 200`, (await usoNB()).hoje - hojeAntesRuim, status === 200 ? 1 : 0);
        }
        respostaGerar = () => Promise.reject(new TypeError("fetch failed"));
        const logsAntesRede = await prisma.logIntegracao.count({ where: { servico: "GEMINI", criadoEm: { gte: inicioGerar } } });
        const semRede = await nbAcoes.gerarComNanoBanana(L, foto1.base, pedido);
        const ultimoRede = await prisma.logIntegracao.findFirst({ where: { servico: "GEMINI", criadoEm: { gte: inicioGerar } }, orderBy: { criadoEm: "desc" } });
        conferir("erro de rede: entra no log sem status e nao conta", [semRede.ok, (await prisma.logIntegracao.count({ where: { servico: "GEMINI", criadoEm: { gte: inicioGerar } } })) - logsAntesRede, ultimoRede.statusHttp], [false, 1, null]);

        // Resposta fora de 1:1: aceita, e a versao sai 1024x1024 com fundo branco (o padronizador enquadra).
        respostaGerar = async () => respostaComImagem(await pngGerado(1024, 768));
        const retangular = await nbAcoes.gerarComNanoBanana(L, foto1.base, pedido);
        const versaoRetangular = await loteLib.lerVersao(L, foto1.base, "nanobanana");
        const metaRetangular = await sharp(versaoRetangular).metadata();
        conferir("resposta 1024x768: guardada em 1024x1024, com faixa branca", [retangular.ok, metaRetangular.width, metaRetangular.height, proximoDoBranco(await pixel(versaoRetangular, 512, 4))], [true, 1024, 1024, true]);
        respostaGerar = null;
      } finally {
        globalThis.fetch = fetchAntesGerar;
        for (const [nome, valor] of Object.entries(envAntesNB)) {
          if (valor === undefined) delete process.env[nome];
          else process.env[nome] = valor;
        }
        await acoes.descartarLoteDeArquivos(L);
        await prisma.logIntegracao.deleteMany({ where: { servico: "GEMINI", criadoEm: { gte: inicioGerar } } });
      }

      // ----- Criar descricao: a biblioteca de prompts com nome (pedido do dono em 09/10/2026) -----
      console.log("\nCriar descricao: biblioteca de prompts (usa o Postgres)");
      const acoesProduto = await import("../src/app/produtos/acoes.js");
      const { PROMPT_DESCRICAO_PADRAO, MAXIMO_PROMPT_DESCRICAO } = await import("../src/lib/ia/anuncio.js");
      const { ID_DO_SISTEMA, NOME_DO_SISTEMA, MAXIMO_NOME_PROMPT, textoDoPromptPadrao } = await import("../src/lib/ia/promptsDescricao.js");
      // Os prompts reais do dono ficam guardados e voltam no fim.
      const promptsDescricaoDoDono = await prisma.promptDescricao.findMany();
      const resumo = (lista) => lista.map((p) => `${p.nome}${p.padrao ? "*" : ""}`);
      try {
        await prisma.promptDescricao.deleteMany();
        const inicial = await acoesProduto.promptsDaDescricao();
        conferir("biblioteca vazia: so o do sistema, que e o padrao", [inicial.ok, resumo(inicial.prompts), inicial.prompts[0].id, inicial.prompts[0].sistema, inicial.maximo], [true, [`${NOME_DO_SISTEMA}*`], ID_DO_SISTEMA, true, MAXIMO_PROMPT_DESCRICAO]);
        conferir("o do sistema traz o texto do codigo", inicial.prompts[0].texto === PROMPT_DESCRICAO_PADRAO, true);

        const mcu = await acoesProduto.criarPromptDaDescricao("  Microcontrolador  ", "  Texto MCU  ");
        conferir("criar: grava sem os espacos das pontas e devolve a lista", [mcu.ok, mcu.prompt?.nome, mcu.prompt?.texto, resumo(mcu.prompts)], [true, "Microcontrolador", "Texto MCU", [`${NOME_DO_SISTEMA}*`, "Microcontrolador"]]);
        await acoesProduto.criarPromptDaDescricao("Motor DC", "Texto motor");
        conferir("a lista vem com o do sistema primeiro e os outros por nome", resumo((await acoesProduto.promptsDaDescricao()).prompts), [`${NOME_DO_SISTEMA}*`, "Microcontrolador", "Motor DC"]);

        const recusas = [
          ["nome repetido, mesmo em outra caixa", "microcontrolador", "x"],
          ["nome do prompt do sistema", NOME_DO_SISTEMA.toUpperCase(), "x"],
          ["nome vazio", "   ", "x"],
          [`nome acima de ${MAXIMO_NOME_PROMPT} caracteres`, "n".repeat(MAXIMO_NOME_PROMPT + 1), "x"],
          ["texto vazio", "Sensor", "   "],
          ["texto acima do teto", "Sensor", "a".repeat(MAXIMO_PROMPT_DESCRICAO + 1)],
        ];
        for (const [nome, nomeDoPrompt, texto] of recusas) {
          const r = await acoesProduto.criarPromptDaDescricao(nomeDoPrompt, texto);
          conferir(`criar recusado (${nome}): erro e nada gravado`, [r.ok, typeof r.erro === "string" && r.erro.length > 5, await prisma.promptDescricao.count()], [false, true, 2]);
        }

        const salvo = await acoesProduto.salvarPromptDaDescricao(mcu.prompt.id, "Microcontrolador 8 bits", "Texto novo");
        conferir("salvar: troca nome e texto do escolhido", [salvo.ok, salvo.prompt?.nome, salvo.prompt?.texto], [true, "Microcontrolador 8 bits", "Texto novo"]);
        const salvoRepetido = await acoesProduto.salvarPromptDaDescricao(mcu.prompt.id, "motor dc", "Texto novo");
        conferir("salvar com o nome de OUTRO prompt e recusado", salvoRepetido.ok, false);
        const mesmoNome = await acoesProduto.salvarPromptDaDescricao(mcu.prompt.id, "Microcontrolador 8 bits", "Texto 3");
        conferir("salvar mantendo o proprio nome passa", [mesmoNome.ok, mesmoNome.prompt?.texto], [true, "Texto 3"]);
        conferir("o do sistema nao se salva", (await acoesProduto.salvarPromptDaDescricao(ID_DO_SISTEMA, NOME_DO_SISTEMA, "x")).ok, false);
        conferir("salvar prompt que nao existe e recusado", (await acoesProduto.salvarPromptDaDescricao("nao-existe", "Outro", "x")).ok, false);

        const padrao = await acoesProduto.definirPromptPadraoDaDescricao(mcu.prompt.id);
        conferir("usar como padrao: so ele marcado, o do sistema deixa de ser", [padrao.ok, resumo(padrao.prompts)], [true, [NOME_DO_SISTEMA, "Microcontrolador 8 bits*", "Motor DC"]]);
        conferir("o texto do padrao e o que a geracao usa sem prompt da tela", await textoDoPromptPadrao(), "Texto 3");
        const outroPadrao = await acoesProduto.definirPromptPadraoDaDescricao((await prisma.promptDescricao.findUnique({ where: { nome: "Motor DC" } })).id);
        conferir("trocar o padrao desmarca o anterior", resumo(outroPadrao.prompts), [NOME_DO_SISTEMA, "Microcontrolador 8 bits", "Motor DC*"]);
        const voltaSistema = await acoesProduto.definirPromptPadraoDaDescricao(ID_DO_SISTEMA);
        conferir("o do sistema como padrao: nenhuma linha marcada", [resumo(voltaSistema.prompts), await textoDoPromptPadrao() === PROMPT_DESCRICAO_PADRAO], [[`${NOME_DO_SISTEMA}*`, "Microcontrolador 8 bits", "Motor DC"], true]);

        await acoesProduto.definirPromptPadraoDaDescricao(mcu.prompt.id);
        const excluido = await acoesProduto.excluirPromptDaDescricao(mcu.prompt.id);
        conferir("excluir o padrao: sai, e o do sistema volta a ser o padrao", [excluido.ok, resumo(excluido.prompts)], [true, [`${NOME_DO_SISTEMA}*`, "Motor DC"]]);
        conferir("o do sistema nao se exclui", (await acoesProduto.excluirPromptDaDescricao(ID_DO_SISTEMA)).ok, false);
        conferir("excluir o que nao existe e recusado", (await acoesProduto.excluirPromptDaDescricao("nao-existe")).ok, false);

        const geracaoRecusada = await acoesProduto.criarDescricaoIA(["x"], { titulo: "T", sku: "S" }, "  ");
        conferir("gerar com prompt vazio e recusado ANTES de chamar a IA", [geracaoRecusada.ok, geracaoRecusada.erro], [false, "O prompt não pode ficar vazio."]);
      } finally {
        await prisma.promptDescricao.deleteMany();
        if (promptsDescricaoDoDono.length > 0) await prisma.promptDescricao.createMany({ data: promptsDescricaoDoDono });
      }

      // ----- Nano Banana: prompt salvo por modelo, imagens extras e o estado para a tela -----
      console.log("\nNano Banana: prompt, extras e estado (usa o Postgres e dados/)");
      const { PROMPT_PADRAO, MODELOS: MODELOS_NB } = await import("../src/lib/integracoes/nanobanana.js");
      const { MAXIMO_EXTRA_BYTES } = await import("../src/lib/limites.js");
      const { GET: rotaTemporarios } = await import("../src/app/api/temporarios/[...caminho]/route.js");
      const apagarPrompts = () => prisma.promptImagem.deleteMany({ where: { modelo: { in: Object.keys(MODELOS_NB) } } });
      // Os prompts reais do dono ficam guardados e voltam no fim: este teste usa as chaves de verdade.
      const promptsDoDono = await prisma.promptImagem.findMany({ where: { modelo: { in: Object.keys(MODELOS_NB) } } });
      const LE = randomUUID();
      try {
        await apagarPrompts();
        const estado = await nbAcoes.estadoDoNanoBanana();
        conferir("estado: os tres modelos, na ordem, com preco em reais (US$ x 6)", [estado.modelos.map((m) => m.chave), estado.modelos.map((m) => m.brl), estado.modelos.map((m) => m.aceitaExtras)], [["nano-banana-2", "nano-banana-pro", "nano-banana-2-lite"], [0.4, 0.8, 0.2], [true, true, false]]);
        conferir("estado: modelo padrao, cotacao e limites", [estado.modeloPadrao, estado.cotacao, estado.maximoExtras, estado.maximoPrompt], ["nano-banana-2", { valor: 6, origem: "fixa" }, MAXIMO_EXTRAS, MAXIMO_PROMPT]);
        conferir("estado: sem linha, o prompt de cada modelo e o padrao do codigo", Object.keys(MODELOS_NB).every((chave) => estado.prompts[chave] === PROMPT_PADRAO), true);
        conferir("estado: a configuracao vem com o motivo e o uso do dia", [typeof estado.config.ok, estado.uso === null || typeof estado.uso.hoje === "number"], ["boolean", true]);

        const salvo = await nbAcoes.salvarPromptDoModelo("nano-banana-pro", "  Meu prompt do Pro  ");
        conferir("salvar prompt grava (sem os espacos das pontas)", [salvo.ok, salvo.texto], [true, "Meu prompt do Pro"]);
        const depoisDeSalvar = await nbAcoes.estadoDoNanoBanana();
        conferir("o texto salvo vale SO para aquele modelo", [depoisDeSalvar.prompts["nano-banana-pro"], depoisDeSalvar.prompts["nano-banana-2"] === PROMPT_PADRAO, depoisDeSalvar.prompts["nano-banana-2-lite"] === PROMPT_PADRAO], ["Meu prompt do Pro", true, true]);
        await nbAcoes.salvarPromptDoModelo("nano-banana-pro", "Segundo texto");
        conferir("salvar de novo sobrescreve, e ha uma linha so", [(await nbAcoes.estadoDoNanoBanana()).prompts["nano-banana-pro"], await prisma.promptImagem.count({ where: { modelo: "nano-banana-pro" } })], ["Segundo texto", 1]);
        const voltouAoPadrao = await nbAcoes.salvarPromptDoModelo("nano-banana-pro", PROMPT_PADRAO);
        conferir("salvar o texto igual ao padrao apaga a linha (padrao do codigo = sem linha)", [voltouAoPadrao.ok, await prisma.promptImagem.count({ where: { modelo: "nano-banana-pro" } })], [true, 0]);

        const recusasPrompt = [
          ["texto vazio", "nano-banana-2", ""],
          ["so espacos", "nano-banana-2", "    "],
          [`${MAXIMO_PROMPT + 1} caracteres`, "nano-banana-2", "a".repeat(MAXIMO_PROMPT + 1)],
          ["modelo inexistente", "nano-banana-1", "texto"],
          ["modelo vindo como outro tipo", { toString: () => "nano-banana-2" }, "texto"],
        ];
        for (const [nome, modelo, texto] of recusasPrompt) {
          const r = await nbAcoes.salvarPromptDoModelo(modelo, texto);
          conferir(`prompt recusado (${nome}): erro em portugues e nada gravado`, [r.ok, typeof r.erro === "string" && r.erro.length > 5, await prisma.promptImagem.count({ where: { modelo: { in: Object.keys(MODELOS_NB) } } })], [false, true, 0]);
        }
        const noLimitePrompt = await nbAcoes.salvarPromptDoModelo("nano-banana-2-lite", "a".repeat(MAXIMO_PROMPT));
        conferir(`prompt de exatamente ${MAXIMO_PROMPT} caracteres e aceito`, noLimitePrompt.ok, true);

        // Extras enviadas.
        const fotoE = await loteLib.adicionarImagem(LE, ORIG);
        const enviar = (bytes, nome = "extra.jpg", tipo = "image/jpeg") => {
          const dados = new FormData();
          dados.set("arquivo", new File([bytes], nome, { type: tipo }));
          return nbAcoes.adicionarExtraAoLote(LE, fotoE.base, dados);
        };
        const jpgExtra = await foto(900, 700);
        const primeiraExtra = await enviar(jpgExtra);
        conferir("extra: JPEG valido devolve n 1 e o endereco", [primeiraExtra.ok, primeiraExtra.extra?.n, new RegExp(`^/api/temporarios/${LE}/extras/${fotoE.base}\\.1\\.jpg\\?v=\\d+$`).test(primeiraExtra.extra?.url ?? "")], [true, 1, true]);
        const servida = await rotaTemporarios(null, { params: Promise.resolve({ caminho: [LE, "extras", `${fotoE.base}.1.jpg`] }) });
        conferir("extra: a rota de temporarios entrega a imagem", [servida.status, servida.headers.get("content-type"), Buffer.from(await servida.arrayBuffer()).equals(jpgExtra)], [200, "image/jpeg", true]);
        for (let i = 2; i <= MAXIMO_EXTRAS; i++) await enviar(await foto(800 + i, 800), `extra${i}.png`, "image/png");
        const sexta = await enviar(jpgExtra);
        conferir("extra: a 6a e recusada", [sexta.ok, /No maximo 5/.test(semAcento(sexta.erro ?? ""))], [false, true]);
        const texto = await nbAcoes.adicionarExtraAoLote(LE, fotoE.base, (() => { const d = new FormData(); d.set("arquivo", new File([Buffer.from("isto nao e uma imagem")], "x.jpg", { type: "image/jpeg" })); return d; })());
        conferir("extra: arquivo de texto renomeado .jpg e recusado", texto.ok, false);
        const vazio = await nbAcoes.adicionarExtraAoLote(LE, fotoE.base, new FormData());
        conferir("extra: sem arquivo e recusado", vazio.ok, false);
        const grandeDemais = await nbAcoes.adicionarExtraAoLote(LE, fotoE.base, (() => { const d = new FormData(); d.set("arquivo", new File([Buffer.alloc(MAXIMO_EXTRA_BYTES + 1, 1)], "g.jpg", { type: "image/jpeg" })); return d; })());
        conferir("extra: acima de 10 MB e recusado", [grandeDemais.ok, /10 MB/.test(semAcento(grandeDemais.erro ?? ""))], [false, true]);
        conferir("extra: lote e foto invalidos sao recusados", [(await nbAcoes.adicionarExtraAoLote("../fora", fotoE.base, new FormData())).ok, (await nbAcoes.adicionarExtraAoLote(LE, "../x", new FormData())).ok], [false, false]);

        const removida = await nbAcoes.removerExtraDoLote(LE, fotoE.base, 1);
        conferir("remover extra apaga o arquivo", [removida.ok, await loteLib.lerExtra(LE, fotoE.base, 1)], [true, null]);
        const cheiaDeNovo = await enviar(jpgExtra);
        conferir("... e libera o numero: a proxima enviada volta a ser a 1", [cheiaDeNovo.ok, cheiaDeNovo.extra?.n], [true, 1]);
        conferir("remover numero invalido e recusado", [(await nbAcoes.removerExtraDoLote(LE, fotoE.base, 9)).ok, (await nbAcoes.removerExtraDoLote(LE, fotoE.base, "x")).ok, (await nbAcoes.removerExtraDoLote("../fora", fotoE.base, 1)).ok], [false, false, false]);
      } finally {
        await acoes.descartarLoteDeArquivos(LE);
        await apagarPrompts();
        if (promptsDoDono.length > 0) await prisma.promptImagem.createMany({ data: promptsDoDono });
      }
    }
  } finally {
    globalThis.fetch = fetchReal;
    for (const [nome, valor] of Object.entries(envAntes)) {
      if (valor === undefined) delete process.env[nome];
      else process.env[nome] = valor;
    }
    const { descartarLoteDeArquivos } = await import("../src/app/produtos/acoes-imagens.js");
    await descartarLoteDeArquivos(loteDeTeste);
    for (const lote of lotesDasReferencias) await descartarLoteDeArquivos(lote);
    // Os produtos coletados de teste saem junto (onDelete: Cascade).
    await prisma.fonteColeta.deleteMany({ where: { nome: { startsWith: PREFIXO_FONTE } } });
    // Linhas de log que ESTE teste criou (o servico so e gravado por chamadas de verdade).
    await prisma.logIntegracao.deleteMany({ where: { servico: "PHOTOROOM", criadoEm: { gte: inicioDoTeste } } });
  }
} finally {
  await prisma.produto.deleteMany({ where: { sku: SKU_TESTE } });
  await apagarPastaProduto(SKU_TESTE);
  await prisma.produto.deleteMany({ where: { sku: SKU_EDICAO } });
  await apagarPastaProduto(SKU_EDICAO);
  await prisma.produto.deleteMany({ where: { sku: SKU_RESERVA } });
  await apagarPastaProduto(SKU_RESERVA);
  await apagarPastaProduto(`${SKU_RESERVA}-B`);
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
