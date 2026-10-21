import "dotenv/config";
import assert from "node:assert/strict";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

import { escolherMedidas, escolherNcm, opcoesDePreco, origemFiscal, precoParaMargem } from "../src/lib/proposta/regras.js";
import { calcularMargem } from "../src/lib/margem.js";

/**
 * Proposta automatica de produto (spec 2026-10-16): as regras puras de preco, medidas, NCM e origem fiscal. SEM rede e
 * SEM banco neste bloco; os blocos de banco (tarefas seguintes do plano) limpam o que escrevem (produtos ZZ-PROP-*).
 */

let contagem = 0;
function conferir(nome, condicao) {
  assert.ok(condicao, nome);
  contagem++;
  console.log(`ok    ${nome}`);
}

// ---------------------------------------------------------------------------
// Preco por margem (a margem e a do Rise: lucro liquido, com 6% de imposto, dividido pelo preco de venda)
// ---------------------------------------------------------------------------
{
  conferir("precoParaMargem(18,90; 60%) = 55,59 (18,9 / 0,34, arredondado para cima)", precoParaMargem(18.9, 60) === 55.59);
  conferir("precoParaMargem devolve a margem pedida pela conta do Rise", Math.abs(calcularMargem(precoParaMargem(18.9, 40), 18.9) - 40) < 0.1);
  conferir("precoParaMargem sem custo = null", precoParaMargem(0, 40) === null);
  conferir("precoParaMargem com margem que nao cabe (94%) = null", precoParaMargem(10, 94) === null);
}

{
  const concorrentes = [30, 40, 50, 60, 70, 80].map((preco, i) => ({ loja: `Loja ${"ABCDEF"[i]}`, preco }));
  const resultado = opcoesDePreco(18.9, concorrentes);
  conferir("opcoesDePreco traz as margens 40, 50 e 60", JSON.stringify(resultado.opcoes.map((o) => o.margem)) === "[40,50,60]");
  conferir("cada opcao traz o preco e a posicao", resultado.opcoes.every((o) => o.preco > 0 && o.posicao?.posicao >= 1));
  conferir("a recomendada fica entre os 5 primeiros", resultado.recomendada?.posicao.posicao <= 5);
  const seguinte = precoParaMargem(18.9, resultado.recomendada.margem + 1);
  const lojasMaisBaratas = concorrentes.filter((c) => c.preco < seguinte).length;
  conferir("a margem seguinte a recomendada ja passa do 5º lugar (ou nao cabe)", seguinte === null || lojasMaisBaratas + 1 > 5);
  conferir("com recomendada, sem motivo", resultado.motivoSemRecomendada === null);
}

{
  const semCusto = opcoesDePreco(null, [{ loja: "A", preco: 30 }]);
  conferir("sem custo: sem recomendada", semCusto.recomendada === null);
  conferir("sem custo: o motivo fala do custo", /custo/.test(semCusto.motivoSemRecomendada ?? ""));
}

{
  const baratos = ["A", "B", "C", "D", "E", "F"].map((loja) => ({ loja, preco: 10 }));
  const caro = opcoesDePreco(18.9, baratos);
  conferir("concorrentes abaixo do custo: sem recomendada", caro.recomendada === null);
  conferir("concorrentes abaixo do custo: o motivo fala dos 5 primeiros", /5 primeiros/.test(caro.motivoSemRecomendada ?? ""));
  conferir("concorrentes abaixo do custo: as 3 opcoes continuam", caro.opcoes.length === 3);
}

// ---------------------------------------------------------------------------
// Peso e medidas: a Usinainfo primeiro; sem ela, o valor mais repetido; empate, o do fabricante
// ---------------------------------------------------------------------------
{
  const medida = (loja, pesoKg, extra = {}) => ({ loja, pesoKg, alturaCm: 1.9, larguraCm: 1.8, comprimentoCm: 4.3, ...extra });
  const comUsina = escolherMedidas([medida("Smartkits", 0.007), medida("Usinainfo", 0.006), medida("Saravati", 0.007), medida("Eletrogate", 0.007)]);
  conferir("com a Usinainfo, vale a dela", comUsina.valor.pesoKg === 0.006);
  conferir("com a Usinainfo, a origem diz Usinainfo", /Usinainfo/.test(comUsina.origem));

  const semUsina = escolherMedidas([medida("Smartkits", 0.007), medida("Saravati", 0.007), medida("Robocore", 0.006)]);
  conferir("sem a Usinainfo, vale o mais repetido", semUsina.valor.pesoKg === 0.007);

  const usinaSemPeso = escolherMedidas([medida("Usinainfo", null), medida("Smartkits", 0.007), medida("Saravati", 0.007)]);
  conferir("Usinainfo sem o peso: o peso vem do mais repetido", usinaSemPeso.valor.pesoKg === 0.007);

  const empate = escolherMedidas([medida("Loja A", 0.006), medida("Fabricante X", 0.007, { fabricante: true })]);
  conferir("empate: vale o do fabricante", empate.valor.pesoKg === 0.007);

  conferir("sem nenhuma medida: null", escolherMedidas([]) === null);
}

// ---------------------------------------------------------------------------
// NCM: a Fortek primeiro; sem ela, o mais repetido; origem fiscal 2 com fornecedor, 0 sem
// ---------------------------------------------------------------------------
{
  const comFortek = escolherNcm([{ fornecedor: "Santana", ncm: "8471.80.00" }, { fornecedor: "Fortek", ncm: "8542.31.90" }]);
  conferir("com a Fortek, vale o NCM dela", comFortek.ncm === "8542.31.90");
  conferir("com a Fortek, a origem diz Fortek", /Fortek/.test(comFortek.origem));

  const semFortek = escolherNcm([{ fornecedor: "A", ncm: "8471.80.00" }, { fornecedor: "B", ncm: "8542.31.90" }, { fornecedor: "C", ncm: "8542.31.90" }]);
  conferir("sem a Fortek, vale o mais repetido", semFortek.ncm === "8542.31.90");

  const empate = escolherNcm([{ fornecedor: "A", ncm: "8471.80.00" }, { fornecedor: "B", ncm: "8542.31.90" }]);
  conferir("empate sem Fortek: vale o primeiro da lista", empate.ncm === "8471.80.00");

  conferir("fornecedor sem NCM nao conta", escolherNcm([{ fornecedor: "Fortek", ncm: null }, { fornecedor: "B", ncm: "8542.31.90" }]).ncm === "8542.31.90");
  conferir("sem NCM nenhum: null", escolherNcm([{ fornecedor: "A", ncm: "" }]) === null);

  conferir("origem fiscal com fornecedor = 2", origemFiscal(true) === 2);
  conferir("origem fiscal sem fornecedor = 0", origemFiscal(false) === 0);
}

// ---------------------------------------------------------------------------
// Aplicar ao formulario (puro): o que cada secao escolhida poe nos campos
// ---------------------------------------------------------------------------
{
  const { camposDoFormularioDaProposta, SECOES_APLICAVEIS } = await import("../src/lib/proposta/aplicar.js");
  const secoes = {
    descricao: { texto: "PLACA\r\n\r\nTexto." },
    titulos: { opcoes: ["OPCAO A", "OPCAO B", "OPCAO C"], recomendada: 1 },
    campos: { marca: { valor: "GENÉRICA", origem: "x" }, garantiaMeses: { valor: 3, origem: "x" }, codigo: { valor: "250010", origem: "x" }, pesoKg: { valor: 0.007, origem: "x" } },
    preco: { opcoes: [{ margem: 40, preco: 35 }, { margem: 50, preco: 42.96 }, { margem: 60, preco: 55.59 }], recomendada: { margem: 39, preco: 34.37 } },
    ean: { escolhido: { valor: "7891234567895", origem: "x" }, descartados: [] },
    fotos: { candidatas: [] },
  };
  const todas = { secoes: ["descricao", "titulos", "campos", "preco", "ean"] };
  const comSku = camposDoFormularioDaProposta(secoes, todas, { sku: "100103" });
  conferir("aplicar: sem escolha, o titulo e o recomendado", comSku.campos.tituloBase === "OPCAO B");
  conferir("aplicar: a descricao entra", comSku.campos.descricaoBase === "PLACA\r\n\r\nTexto.");
  conferir("aplicar: sem escolha, o preco e o recomendado", comSku.campos.precoVenda === 34.37);
  conferir("aplicar: os campos com valor entram", comSku.campos.marca === "GENÉRICA" && comSku.campos.garantiaMeses === 3 && comSku.campos.pesoKg === 0.007);
  conferir("aplicar: o EAN escolhido entra", comSku.campos.ean === "7891234567895");
  conferir("aplicar: produto com SKU nao recebe o codigo", !("sku" in comSku.campos));
  conferir("aplicar: devolve as secoes aplicadas", JSON.stringify(comSku.secoes) === JSON.stringify(todas.secoes));

  const semSku = camposDoFormularioDaProposta(secoes, todas, { sku: "" });
  conferir("aplicar: produto sem SKU recebe o codigo da proposta", semSku.campos.sku === "250010");

  const escolhido = camposDoFormularioDaProposta(secoes, { secoes: ["titulos", "preco"], titulo: 2, preco: 50 }, { sku: "1" });
  conferir("aplicar: o titulo escolhido vale", escolhido.campos.tituloBase === "OPCAO C");
  conferir("aplicar: a margem escolhida vale", escolhido.campos.precoVenda === 42.96);
  conferir("aplicar: secao nao marcada nao entra", !("descricaoBase" in escolhido.campos) && !("marca" in escolhido.campos));

  const semRecomendada = camposDoFormularioDaProposta({ preco: { opcoes: secoes.preco.opcoes, recomendada: null } }, { secoes: ["preco"] }, { sku: "1" });
  conferir("aplicar: sem recomendada e sem escolha, o preco nao muda", !("precoVenda" in semRecomendada.campos) && semRecomendada.secoes.length === 0);
  const eanVazio = camposDoFormularioDaProposta({ ean: { escolhido: null, descartados: [] } }, { secoes: ["ean"] }, { sku: "1" });
  conferir("aplicar: EAN vazio na proposta nao apaga o do produto", !("ean" in eanVazio.campos));
  conferir("aplicar: fotos, documentos e relatorio nao sao aplicaveis aqui", !SECOES_APLICAVEIS.includes("fotos") && !SECOES_APLICAVEIS.includes("documentos"));
  conferir("aplicar: secao ausente na proposta e ignorada", camposDoFormularioDaProposta({}, todas, { sku: "1" }).secoes.length === 0);

  // "Aplicar fotos": a lista do painel depois de aplicar.
  const { fotosDoPainelComAProposta } = await import("../src/lib/proposta/aplicar.js");
  const painel = [
    { base: "a1", arquivoId: "id-a1", finalizada: true },
    { base: "a2", arquivoId: "id-a2", finalizada: true },
    { base: "x9", finalizada: false },
  ];
  const novas = [{ base: "n1", finalizada: true, candidataId: "21" }, { base: "n2", finalizada: true, candidataId: "28" }];
  const escolhas = [{ candidataId: "21" }, { arquivoId: "id-a2" }, { candidataId: "28" }];
  const final = fotosDoPainelComAProposta(painel, novas, escolhas);
  conferir("aplicar fotos: as escolhidas vem primeiro, na ordem", JSON.stringify(final.slice(0, 3).map((i) => i.base)) === '["n1","a2","n2"]');
  conferir("aplicar fotos: as escolhidas ficam validadas", final.slice(0, 3).every((i) => i.finalizada === true && !i.paraReserva));
  const a1 = final.find((i) => i.base === "a1");
  conferir("aplicar fotos: a foto atual que saiu vai para a reserva", a1.finalizada === false && a1.paraReserva === true);
  const x9 = final.find((i) => i.base === "x9");
  conferir("aplicar fotos: candidata que nao e do produto so perde o check", x9.finalizada === false && !x9.paraReserva);
  conferir("aplicar fotos: nenhuma foto some do painel", final.length === 5);
  conferir("aplicar fotos: escolha que nao achou a foto e ignorada", fotosDoPainelComAProposta(painel, [], [{ candidataId: "99" }, { arquivoId: "id-a1" }])[0].base === "a1");

  // Arrastar na janela "Fotos da proposta" (pedido do dono em 21/10/2026): so as escolhidas tem ordem.
  const { moverNaOrdem } = await import("../src/lib/proposta/aplicar.js");
  const ordem = ["a", "b", "c", "d", "e"];
  conferir("arrastar: a 5ª sobre a 1ª vira a 1ª", moverNaOrdem(ordem, "e", "a").join() === "e,a,b,c,d");
  conferir("arrastar: a 1ª sobre a 3ª vai para a 3ª posicao", moverNaOrdem(ordem, "a", "c").join() === "b,c,a,d,e");
  conferir("arrastar: nao escolhida sobre a 2ª e escolhida nessa posicao", moverNaOrdem(ordem, "x", "b").join() === "a,x,b,c,d,e");
  conferir("arrastar: soltar sobre uma nao escolhida nao muda nada", moverNaOrdem(ordem, "b", "x").join() === ordem.join());
  conferir("arrastar: soltar sobre ela mesma nao muda nada", moverNaOrdem(ordem, "c", "c").join() === ordem.join());
  conferir("arrastar: a lista original fica intacta", ordem.join() === "a,b,c,d,e");
}

// ---------------------------------------------------------------------------
// Banco: a tabela PropostaDeProduto (uma por produto, apagada junto com ele). Postgres local; so escreve ZZ-PROP-*.
// ---------------------------------------------------------------------------
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));
const { prisma } = await import("../src/lib/db.js");

// ---------------------------------------------------------------------------
// Disco: a pasta proposta/ (fotos candidatas e PDFs baixados), com nome gerado por nos
// ---------------------------------------------------------------------------
{
  const { PASTA_PROPOSTA, caminhoDaProposta, urlDaProposta, apagarPastaDaProposta } = await import("../src/lib/arquivos.js");
  const nome = "0123456789abcdef0123456789abcdef.jpg";
  conferir("disco: a pasta se chama proposta", PASTA_PROPOSTA === "proposta");
  conferir("disco: nome com ../ e recusado", caminhoDaProposta("100103", "../x.jpg") === null);
  conferir("disco: nome que nao e o do sistema e recusado", caminhoDaProposta("100103", "abc.jpg") === null);
  conferir("disco: extensao fora de jpg/pdf e recusada", caminhoDaProposta("100103", nome.replace(".jpg", ".zip")) === null);
  conferir("disco: SKU invalido e recusado", caminhoDaProposta("../etc", nome) === null);
  conferir("disco: nome valido termina em proposta/<nome>", /[\\/]100103[\\/]proposta[\\/]0123456789abcdef0123456789abcdef\.jpg$/.test(caminhoDaProposta("100103", nome) ?? ""));
  conferir("disco: PDF tambem vale", caminhoDaProposta("100103", nome.replace(".jpg", ".pdf")) !== null);
  conferir("disco: urlDaProposta monta o endereco da rota", urlDaProposta("100103-teste", nome) === `/api/arquivos/100103-teste/proposta/${nome}`);
  // apagarPastaDaProposta com SKU invalido nao apaga nada e nao lanca.
  conferir("disco: apagar com SKU invalido nao faz nada", (await apagarPastaDaProposta("..")) === false);
}

async function limpar() {
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-PROP-" } } });
  // O fornecedor e Restrict (sai depois dos produtos); os produtos coletados saem junto com a fonte (Cascade).
  await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: "ZZ-PROP " } } });
  await prisma.fonteColeta.deleteMany({ where: { dominio: { startsWith: "zz-prop-" } } });
  const { rm } = await import("node:fs/promises");
  for (const sku of ["ZZ-PROP-1", "ZZ-PROP-2", "ZZ-PROP-3", "ZZ-PROP-4", "ZZ-PROP-5", "ZZ-PROP-6", "ZZ-PROP-7", "ZZ-PROP-8", "ZZ-PROP-9"]) await rm(`dados/produtos/${sku}`, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Validacao do plano (pura): secoes conhecidas, 3 titulos de ate 60, 6 a 8 fotos escolhidas
// ---------------------------------------------------------------------------
const { validarPlano } = await import("../src/lib/proposta/plano.js");
{
  const foto = (id, escolhida, ordem) => ({ id: String(id), origem: { loja: "Loja", url: `https://x.test/${id}.jpg` }, escolhida, ordem, motivo: "teste" });
  const fotos = (total, escolhidas) => ({
    secao: "fotos",
    conteudo: { candidatas: Array.from({ length: total }, (_, i) => foto(i, i < escolhidas, i < escolhidas ? i : undefined)) },
  });
  const titulos = (opcoes, recomendada = 0) => ({ secao: "titulos", conteudo: { opcoes, recomendada, concorrentes: [] } });

  conferir("plano: secao desconhecida e recusada", validarPlano({ secao: "estoque", conteudo: {} }).ok === false);
  conferir("plano: 3 titulos validos passam", validarPlano(titulos(["A", "B", "C"], 1)).ok === true);
  conferir("plano: titulo de 61 caracteres e recusado", validarPlano(titulos(["A", "B", "X".repeat(61)])).ok === false);
  conferir("plano: 2 titulos sao recusados", validarPlano(titulos(["A", "B"])).ok === false);
  conferir("plano: recomendada fora de 0..2 e recusada", validarPlano(titulos(["A", "B", "C"], 3)).ok === false);
  conferir("plano: 5 fotos escolhidas de 10 sao recusadas", validarPlano(fotos(10, 5)).ok === false);
  conferir("plano: 9 fotos escolhidas de 12 sao recusadas", validarPlano(fotos(12, 9)).ok === false);
  conferir("plano: 7 fotos escolhidas de 12 passam", validarPlano(fotos(12, 7)).ok === true);
  const poucas = validarPlano(fotos(3, 3));
  conferir("plano: com so 3 candidatas, as 3 escolhidas passam com aviso", poucas.ok === true && /candidatas/.test(poucas.aviso ?? ""));
  conferir("plano: candidata escolhida sem ordem e recusada", validarPlano({ secao: "fotos", conteudo: { candidatas: [foto(1, true)] } }).ok === false);
  conferir("plano: id de candidata repetido e recusado", validarPlano({ secao: "fotos", conteudo: { candidatas: [foto(1, false), foto(1, false)] } }).ok === false);
  conferir("plano: campo fora da lista e recusado", validarPlano({ secao: "campos", conteudo: { estoque: { valor: 3, origem: "x" } } }).ok === false);
  conferir("plano: campo sem origem e recusado", validarPlano({ secao: "campos", conteudo: { marca: { valor: "GENÉRICA" } } }).ok === false);
  conferir("plano: marca com origem passa", validarPlano({ secao: "campos", conteudo: { marca: { valor: "GENÉRICA", origem: "placa compatível" } } }).ok === true);
  conferir("plano: EAN com 11 digitos e recusado", validarPlano({ secao: "ean", conteudo: { escolhido: { valor: "12345678901", origem: "x" }, descartados: [] } }).ok === false);
  conferir("plano: EAN vazio (nada confiavel) passa", validarPlano({ secao: "ean", conteudo: { escolhido: null, descartados: [{ valor: "7671459174876", motivo: "prefixo nao brasileiro" }] } }).ok === true);
  conferir("plano: descricao vazia e recusada", validarPlano({ secao: "descricao", conteudo: { texto: "  " } }).ok === false);
  conferir("plano: relatorio com texto passa", validarPlano({ secao: "relatorio", conteudo: { texto: "Feito." } }).ok === true);
  const topico = (titulo, itens, extra = {}) => ({ titulo, itens, ...extra });
  conferir("plano: relatorio em topicos passa", validarPlano({ secao: "relatorio", conteudo: { topicos: [topico("Resumo", ["Feito."]), topico("Para você conferir", ["NCM"], { atencao: true })] } }).ok === true);
  conferir("plano: relatorio com topico sem titulo e recusado", validarPlano({ secao: "relatorio", conteudo: { topicos: [topico(" ", ["x"])] } }).ok === false);
  conferir("plano: relatorio com topico sem itens e recusado", validarPlano({ secao: "relatorio", conteudo: { topicos: [topico("Resumo", [])] } }).ok === false);
  conferir("plano: relatorio sem texto nem topicos e recusado", validarPlano({ secao: "relatorio", conteudo: { topicos: [] } }).ok === false);
}

try {
  await limpar();
  {
    const produto = await prisma.produto.create({ data: { sku: "ZZ-PROP-1", tituloBase: "PRODUTO DE TESTE DA PROPOSTA" } });
    const criada = await prisma.propostaDeProduto.create({ data: { produtoId: produto.id, secoes: { titulos: { opcoes: [] } } } });
    conferir("banco: a proposta nasce com aplicadas vazio", JSON.stringify(criada.aplicadas) === "{}");
    conferir("banco: a proposta nasce com a versao 1 do roteiro", criada.versaoDoRoteiro === "1");
    const lida = await prisma.propostaDeProduto.findUnique({ where: { produtoId: produto.id } });
    conferir("banco: a secao volta como foi gravada", Array.isArray(lida?.secoes?.titulos?.opcoes));
    let recusou = false;
    try {
      await prisma.propostaDeProduto.create({ data: { produtoId: produto.id, secoes: {} } });
    } catch {
      recusou = true;
    }
    conferir("banco: uma proposta so por produto", recusou);
    await prisma.produto.delete({ where: { id: produto.id } });
    conferir("banco: apagar o produto apaga a proposta", (await prisma.propostaDeProduto.findUnique({ where: { id: criada.id } })) === null);
  }

  // Gravacao por secao, fotos padronizadas na pasta proposta/, secoes nao aplicadas e apagar.
  {
    const { existsSync, readdirSync } = await import("node:fs");
    const { default: sharp } = await import("sharp");
    const { gravarProposta, lerProposta, apagarProposta } = await import("../src/lib/proposta/banco.js");
    const { assinaturaDaSecao, secoesNaoAplicadas } = await import("../src/lib/proposta/aplicadas.js");
    const produto = await prisma.produto.create({ data: { sku: "ZZ-PROP-1", tituloBase: "PRODUTO DE TESTE DA PROPOSTA" } });
    const titulos = { secao: "titulos", conteudo: { opcoes: ["OPCAO A", "OPCAO B", "OPCAO C"], recomendada: 1, concorrentes: ["TITULO DA LOJA"] } };

    const r1 = await gravarProposta("ZZ-PROP-1", titulos);
    conferir("gravar: a primeira secao cria a proposta", r1.ok === true && JSON.stringify(r1.secoes) === '["titulos"]');
    const r2 = await gravarProposta("ZZ-PROP-1", { secao: "preco", conteudo: { opcoes: [], recomendada: null, motivoSemRecomendada: "sem custo" } });
    conferir("gravar: outra secao mantem a primeira", r2.ok === true && r2.secoes.includes("titulos") && r2.secoes.includes("preco"));
    await gravarProposta("ZZ-PROP-1", { ...titulos, conteudo: { ...titulos.conteudo, opcoes: ["NOVA A", "NOVA B", "NOVA C"] } });
    conferir("gravar: a mesma secao e substituida", (await lerProposta("ZZ-PROP-1")).secoes.titulos.opcoes[0] === "NOVA A");
    conferir("gravar: o produto nao muda", (await prisma.produto.findUnique({ where: { id: produto.id } })).tituloBase === "PRODUTO DE TESTE DA PROPOSTA");

    const png = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#2a6" } }).png().toBuffer();
    const fotoPlano = { secao: "fotos", conteudo: { candidatas: [{ id: "c1", origem: { loja: "Loja X", url: "https://x.test/1.png" }, escolhida: true, ordem: 0, motivo: "placa com cabo" }] } };
    const r3 = await gravarProposta("ZZ-PROP-1", fotoPlano, { bytes: new Map([["c1", png]]) });
    const candidata = (await lerProposta("ZZ-PROP-1")).secoes.fotos.candidatas[0];
    conferir("fotos: gravou com aviso de poucas candidatas", r3.ok === true && /candidatas/.test(r3.aviso ?? ""));
    conferir("fotos: a candidata ganhou o nome do arquivo", /^[0-9a-f]{32}\.jpg$/.test(candidata.arquivo ?? ""));
    const caminho = `dados/produtos/ZZ-PROP-1/proposta/${candidata.arquivo}`;
    const meta = existsSync(caminho) ? await sharp(caminho).metadata() : {};
    conferir("fotos: o arquivo foi padronizado em JPEG 1024x1024", meta.format === "jpeg" && meta.width === 1024 && meta.height === 1024);
    conferir("fotos: nenhuma linha de ProdutoArquivo foi criada", (await prisma.produtoArquivo.count({ where: { produtoId: produto.id } })) === 0);

    const semBytes = await gravarProposta("ZZ-PROP-1", { secao: "fotos", conteudo: { candidatas: [{ ...fotoPlano.conteudo.candidatas[0], id: "c2" }] } });
    conferir("fotos: candidata sem bytes nem foto atual e recusada", semBytes.ok === false);
    conferir("fotos: a recusa nao apagou a foto anterior", existsSync(caminho));

    await gravarProposta("ZZ-PROP-1", { secao: "fotos", conteudo: { candidatas: [] } });
    conferir("fotos: substituir a secao apaga o arquivo que saiu", !existsSync(caminho) && readdirSync("dados/produtos/ZZ-PROP-1/proposta").length === 0);

    const pdf = Buffer.from("%PDF-1.4\n%teste\n");
    const docs = await gravarProposta("ZZ-PROP-1", { secao: "documentos", conteudo: { itens: [{ id: "d1", titulo: "Datasheet", url: "https://x.test/d.pdf" }] } }, { bytes: new Map([["d1", pdf]]) });
    conferir("documentos: PDF vai para a pasta da proposta", docs.ok === true && /^[0-9a-f]{32}\.pdf$/.test((await lerProposta("ZZ-PROP-1")).secoes.documentos.itens[0].arquivo ?? ""));
    const falso = await gravarProposta("ZZ-PROP-1", { secao: "documentos", conteudo: { itens: [{ id: "d2", titulo: "Falso", url: "https://x.test/f.pdf" }] } }, { bytes: new Map([["d2", Buffer.from("<html>")]]) });
    conferir("documentos: arquivo que nao e PDF e recusado", falso.ok === false);

    const proposta = await lerProposta("ZZ-PROP-1");
    const atual = { ...(await prisma.produto.findUnique({ where: { id: produto.id } })), fotos: [] };
    const pendentes = secoesNaoAplicadas(proposta, atual);
    conferir("aplicadas: titulos e fotos estao pendentes", ["titulos", "fotos"].every((s) => pendentes.includes(s)));
    conferir("aplicadas: preco sem opcao (sem custo) nao fica pendente", !pendentes.includes("preco"));
    conferir("aplicadas: documentos nunca fica pendente", !pendentes.includes("documentos"));
    const semNadaAAplicar = { secoes: { ean: { escolhido: null, descartados: [] }, campos: {}, preco: { opcoes: [], recomendada: null, motivoSemRecomendada: "x" } }, aplicadas: {} };
    conferir("aplicadas: EAN vazio, campos vazios e preco sem opcao nao ficam pendentes", secoesNaoAplicadas(semNadaAAplicar, atual).length === 0);
    const marcada = { ...proposta, aplicadas: { titulos: assinaturaDaSecao("titulos", atual) } };
    conferir("aplicadas: com a assinatura, titulos sai da lista", !secoesNaoAplicadas(marcada, atual).includes("titulos"));
    conferir("aplicadas: o produto mudou depois, titulos volta", secoesNaoAplicadas(marcada, { ...atual, tituloBase: "OUTRO" }).includes("titulos"));

    await prisma.produto.update({ where: { id: produto.id }, data: { conferido: true } });
    const conferido = await gravarProposta("ZZ-PROP-1", titulos);
    conferir("gravar: produto Conferido e recusado", conferido.ok === false && /Conferido/.test(conferido.erro));
    conferir("gravar: produto inexistente e recusado", (await gravarProposta("ZZ-PROP-NAO", titulos)).ok === false);

    await apagarProposta(produto.id, "ZZ-PROP-1");
    conferir("apagar: a proposta sumiu", (await lerProposta("ZZ-PROP-1")) === null);
    conferir("apagar: a pasta proposta/ sumiu", !existsSync("dados/produtos/ZZ-PROP-1/proposta"));
  }

  // Depois do Salvar: as secoes que o dono aplicou ficam marcadas com a assinatura do produto GRAVADO.
  {
    const { gravarProposta, lerProposta, marcarSecoesAplicadas, propostaParaFormulario } = await import("../src/lib/proposta/banco.js");
    const produto = await prisma.produto.create({ data: { sku: "ZZ-PROP-3", tituloBase: "TITULO ANTIGO" } });
    await gravarProposta("ZZ-PROP-3", { secao: "titulos", conteudo: { opcoes: ["NOVO A", "NOVO B", "NOVO C"], recomendada: 0 } });
    await gravarProposta("ZZ-PROP-3", { secao: "relatorio", conteudo: { texto: "ok" } });
    let tela = await propostaParaFormulario(produto.id);
    conferir("formulario: a proposta vem com as secoes", tela?.secoes?.titulos?.opcoes?.length === 3);
    conferir("formulario: titulos vem como nao aplicada", tela.naoAplicadas.includes("titulos"));
    await prisma.produto.update({ where: { id: produto.id }, data: { tituloBase: "NOVO A" } });
    await marcarSecoesAplicadas(produto.id, ["titulos", "fotos", "inventada"]);
    const marcada = await lerProposta("ZZ-PROP-3");
    conferir("salvar: titulos ficou marcada", typeof marcada.aplicadas.titulos === "string");
    conferir("salvar: secao que nao e aplicavel aqui nao e marcada", !("fotos" in marcada.aplicadas) && !("inventada" in marcada.aplicadas));
    tela = await propostaParaFormulario(produto.id);
    conferir("formulario: depois do Salvar, titulos sai das nao aplicadas", !tela.naoAplicadas.includes("titulos"));
    await marcarSecoesAplicadas("id-que-nao-existe", ["titulos"]);
    conferir("salvar: produto sem proposta nao da erro", true);
    conferir("formulario: produto sem proposta devolve null", (await propostaParaFormulario("id-que-nao-existe")) === null);
  }

  // Fotos (Tarefa 8): a candidata da proposta entra no lote validada, e a foto atual que sai vai para a reserva.
  {
    const { randomUUID } = await import("node:crypto");
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");
    const { default: sharp } = await import("sharp");
    const { gravarProposta, marcarSecoesAplicadas, lerProposta } = await import("../src/lib/proposta/banco.js");
    const { trazerFotosDaProposta } = await import("../src/app/produtos/acoes-imagens.js");
    const { reconciliarImagensDoProduto } = await import("../src/lib/imagens/produto.js");
    const jpeg = (cor) => sharp({ create: { width: 700, height: 500, channels: 3, background: cor } }).jpeg().toBuffer();

    const produto = await prisma.produto.create({ data: { sku: "ZZ-PROP-4", tituloBase: "TESTE DAS FOTOS DA PROPOSTA" } });
    const fotosAtuais = [];
    await mkdir("dados/produtos/ZZ-PROP-4/imagens", { recursive: true });
    for (const [ordem, cor] of ["#a33", "#3a3"].entries()) {
      const nome = `${randomUUID().replaceAll("-", "")}.jpg`;
      await writeFile(`dados/produtos/ZZ-PROP-4/imagens/${nome}`, await jpeg(cor));
      fotosAtuais.push(await prisma.produtoArquivo.create({ data: { produtoId: produto.id, tipo: "IMAGEM", papel: "FOTO", arquivo: nome, mimeType: "image/jpeg", ordem, principal: ordem === 0 } }));
    }
    const candidata = (id, escolhida, ordem) => ({ id, origem: { loja: "Loja X", url: `https://x.test/${id}.jpg` }, escolhida, ...(escolhida ? { ordem } : {}), motivo: "teste" });
    // Com menos de 6 candidatas a validacao exige todas escolhidas.
    const gravada = await gravarProposta("ZZ-PROP-4", { secao: "fotos", conteudo: { candidatas: [candidata("c1", true, 1), candidata("c2", true, 0), candidata("c3", true, 2)] } }, {
      bytes: new Map([["c1", await jpeg("#33a")], ["c2", await jpeg("#aa3")], ["c3", await jpeg("#3aa")]]),
    });

    conferir("fotos: a proposta de teste foi gravada", gravada.ok === true);
    const lote = randomUUID();
    const trazidas = await trazerFotosDaProposta(lote, produto.id, ["c2", "c1", "inexistente"]);
    conferir("fotos: trazer devolve so as candidatas que existem", trazidas.ok === true && trazidas.imagens.length === 2);
    conferir("fotos: na ordem pedida", JSON.stringify(trazidas.imagens.map((i) => i.candidataId)) === '["c2","c1"]');
    conferir("fotos: entram validadas", trazidas.imagens.every((i) => i.finalizada === true));
    conferir("fotos: o arquivo esta no lote", trazidas.imagens.every((i) => existsSync(`dados/temporarios/${lote}/imagens/${i.base}.jpg`)));
    conferir("fotos: produto de outra pessoa nao serve de origem", (await trazerFotosDaProposta(lote, "id-que-nao-existe", ["c1"])).ok === false);

    // O Salvar: as duas novas viram FOTO; a atual 1 sai para a reserva (paraReserva); a atual 2 sem a marca sai de vez.
    const itens = [
      ...trazidas.imagens.map((i) => ({ base: i.base, finalizada: true, versao: "original" })),
      { base: "a".repeat(32), arquivoId: fotosAtuais[0].id, finalizada: false, paraReserva: true },
      { base: "b".repeat(32), arquivoId: fotosAtuais[1].id, finalizada: false },
    ];
    await reconciliarImagensDoProduto({ produto, lote, itens });
    const depois = await prisma.produtoArquivo.findMany({ where: { produtoId: produto.id, tipo: "IMAGEM" }, orderBy: { ordem: "asc" } });
    const fotos = depois.filter((linha) => linha.papel === "FOTO");
    const reserva = depois.filter((linha) => linha.papel === "RESERVA");
    conferir("salvar fotos: as 2 da proposta viraram FOTO", fotos.length === 2 && fotos[0].principal);
    conferir("salvar fotos: a atual marcada foi para a reserva", reserva.length === 1);
    conferir("salvar fotos: a atual sem marca saiu de vez", !depois.some((linha) => linha.id === fotosAtuais[1].id));

    await marcarSecoesAplicadas(produto.id, ["fotos"]);
    conferir("salvar fotos: a secao fotos fica marcada como aplicada", typeof (await lerProposta("ZZ-PROP-4")).aplicadas.fotos === "string");
    const { rm } = await import("node:fs/promises");
    await rm(`dados/temporarios/${lote}`, { recursive: true, force: true });
  }

  // Conferido (Tarefa 9): com secao pendente, avisa e nao confere; confirmado, confere e apaga a proposta inteira.
  {
    const { existsSync } = await import("node:fs");
    const { gravarProposta, lerProposta, marcarSecoesAplicadas } = await import("../src/lib/proposta/banco.js");
    const { conferirComProposta } = await import("../src/lib/proposta/conferir.js");
    const produto = await prisma.produto.create({ data: { sku: "ZZ-PROP-5", tituloBase: "TITULO ANTIGO" } });
    await gravarProposta("ZZ-PROP-5", { secao: "titulos", conteudo: { opcoes: ["NOVO A", "NOVO B", "NOVO C"], recomendada: 0 } });
    await gravarProposta("ZZ-PROP-5", { secao: "documentos", conteudo: { itens: [{ id: "d1", titulo: "Datasheet", url: "https://x.test/d.pdf" }] } }, { bytes: new Map([["d1", Buffer.from("%PDF-1.4\n")]]) });
    conferir("conferido: a pasta proposta/ existe antes", existsSync("dados/produtos/ZZ-PROP-5/proposta"));

    const pendente = await conferirComProposta(produto.id, true);
    conferir("conferido: com titulos pendente, avisa", pendente.ok === false && JSON.stringify(pendente.pendentes) === '["titulos"]');
    conferir("conferido: e o produto continua nao conferido", (await prisma.produto.findUnique({ where: { id: produto.id } })).conferido === false);
    conferir("conferido: e a proposta continua", (await lerProposta("ZZ-PROP-5")) !== null);

    const confirmado = await conferirComProposta(produto.id, true, { apagarProposta: true });
    conferir("conferido: confirmado, confere", confirmado.ok === true && (await prisma.produto.findUnique({ where: { id: produto.id } })).conferido === true);
    conferir("conferido: confirmado, a proposta some", (await lerProposta("ZZ-PROP-5")) === null);
    conferir("conferido: confirmado, a pasta proposta/ some", !existsSync("dados/produtos/ZZ-PROP-5/proposta"));

    conferir("conferido: desmarcar sem proposta funciona", (await conferirComProposta(produto.id, false)).ok === true);
    conferir("conferido: marcar de novo sem proposta funciona", (await conferirComProposta(produto.id, true)).ok === true);

    // Tudo aplicado: confere direto, sem pergunta, e apaga a proposta.
    await prisma.produto.update({ where: { id: produto.id }, data: { conferido: false, tituloBase: "NOVO A" } });
    await gravarProposta("ZZ-PROP-5", { secao: "titulos", conteudo: { opcoes: ["NOVO A", "NOVO B", "NOVO C"], recomendada: 0 } });
    await marcarSecoesAplicadas(produto.id, ["titulos"]);
    const direto = await conferirComProposta(produto.id, true);
    conferir("conferido: sem pendencia, confere direto", direto.ok === true && !direto.pendentes);
    conferir("conferido: sem pendencia, a proposta tambem some", (await lerProposta("ZZ-PROP-5")) === null);
    conferir("conferido: produto inexistente da erro", (await conferirComProposta("id-que-nao-existe", true)).ok === false);
  }

  // O script: `proposta --ler` e o `gravar` recusando produto com proposta aberta (roda o script de verdade, no PC).
  {
    const { execFileSync } = await import("node:child_process");
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    await prisma.produto.create({ data: { sku: "ZZ-PROP-2", tituloBase: "PRODUTO DE TESTE DO SCRIPT" } });
    const pasta = mkdtempSync(`${tmpdir()}/rise-proposta-`);
    const plano = `${pasta}/plano.json`;
    writeFileSync(plano, JSON.stringify({ secao: "relatorio", conteudo: { texto: "Relatório do teste." } }));
    const rodar = (...args) => {
      try {
        return { codigo: 0, saida: execFileSync("node", ["scripts/preencher-produto.js", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) };
      } catch (erro) {
        return { codigo: erro.status, saida: `${erro.stdout ?? ""}${erro.stderr ?? ""}` };
      }
    };
    const gravado = rodar("proposta", "ZZ-PROP-2", `--plano=${plano}`);
    conferir("script: proposta --plano grava a secao", gravado.codigo === 0 && /relatorio/.test(gravado.saida));
    const lido = rodar("proposta", "ZZ-PROP-2", "--ler");
    conferir("script: proposta --ler mostra a secao", lido.codigo === 0 && /Relatório do teste/.test(lido.saida));
    writeFileSync(plano, JSON.stringify({ sku: "ZZ-PROP-2", descricaoBase: "nao deve gravar" }));
    const recusado = rodar("gravar", plano);
    conferir("script: gravar recusa produto com proposta aberta", recusado.codigo !== 0 && /proposta aberta/.test(recusado.saida));
    conferir("script: a descricao nao mudou", (await prisma.produto.findUnique({ where: { sku: "ZZ-PROP-2" } })).descricaoBase !== "nao deve gravar");
  }

  // Leitura para a proposta (MCP, Tarefa 1): o que lerParaProposta entrega e o id das fotos das ofertas.
  {
    const { lerParaProposta, fotoDaOferta } = await import("../src/lib/proposta/leitura.js");
    const loja = await prisma.fonteColeta.create({ data: { nome: "ZZ-PROP Loja", dominio: "zz-prop-loja.invalid", tipo: "CONCORRENTE" } });
    const distribuidora = await prisma.fonteColeta.create({ data: { nome: "ZZ-PROP Distribuidora", dominio: "zz-prop-distribuidora.invalid", tipo: "FORNECEDOR" } });
    const coletado = await prisma.produtoColetado.create({
      data: {
        fonteId: loja.id, chave: "codigo:L1", origem: "site", codigo: "L1", nome: "Placa ZZ-PROP da loja", precoNormal: 49.9, precoPromocional: 45,
        estoqueStatus: "IN_STOCK", ean: "7891234567895", marca: "GENÉRICA", url: "https://zz-prop-loja.invalid/l1", descricao: "x".repeat(4000),
        imagens: ["https://zz-prop-loja.invalid/1.jpg", { url: "https://zz-prop-loja.invalid/2.jpg" }],
        especificacoes: [{ nome: "Tensão", valor: "5V" }], documentos: [{ titulo: "Datasheet", url: "https://zz-prop-loja.invalid/d.pdf" }],
      },
    });
    const solto = await prisma.produtoColetado.create({ data: { fonteId: loja.id, chave: "codigo:L2", origem: "site", codigo: "L2", nome: "Outro produto", imagens: ["https://zz-prop-loja.invalid/9.jpg"] } });
    await prisma.produtoColetado.create({ data: { fonteId: distribuidora.id, chave: "codigo:F1", origem: "arquivo", codigo: "F1", nome: "Item F1", ncm: "85340000" } });
    const fornecedor = await prisma.fornecedor.create({ data: { nome: "ZZ-PROP Distribuidora", fonteId: distribuidora.id } });
    const produto = await prisma.produto.create({ data: { sku: "ZZ-PROP-6", tituloBase: "PLACA ZZ PROP", marca: "GENÉRICA", estoqueMinimo: null } });
    await prisma.produtoConcorrente.create({ data: { produtoId: produto.id, produtoColetadoId: coletado.id } });
    await prisma.produtoFornecedor.create({ data: { produtoId: produto.id, fornecedorId: fornecedor.id, codigo: "F1", precoCusto: 12, padrao: true } });

    const lido = await lerParaProposta("ZZ-PROP-6");
    const oferta = lido.concorrentes[0];
    conferir("leitura: o produto com sku, titulo, campos e sem Conferido", lido.produto.sku === "ZZ-PROP-6" && lido.produto.titulo === "PLACA ZZ PROP" && lido.produto.campos.marca === "GENÉRICA" && lido.produto.conferido === false);
    conferir("leitura: a oferta vinculada com loja, preco normal, EAN e as 2 fotos", lido.concorrentes.length === 1 && oferta.loja === "ZZ-PROP Loja" && oferta.precoNormal === 49.9 && oferta.ean === "7891234567895" && oferta.fotos.length === 2);
    conferir("leitura: as fotos com id <coletado>:<indice> e a url", oferta.fotos[0].id === `${coletado.id}:0` && oferta.fotos[1].url === "https://zz-prop-loja.invalid/2.jpg");
    conferir("leitura: a descricao da oferta cortada em 3.000", oferta.descricao.length === 3000);
    conferir("leitura: documentos como links e a ficha", oferta.documentos[0]?.url === "https://zz-prop-loja.invalid/d.pdf" && oferta.ficha[0]?.valor === "5V");
    const vinculo = lido.fornecedores[0];
    conferir("leitura: o fornecedor com custo, codigo, padrao e o NCM da lista dele", vinculo?.nome === "ZZ-PROP Distribuidora" && vinculo.custo === 12 && vinculo.codigo === "F1" && vinculo.padrao === true && vinculo.ncm === "85340000");
    conferir("leitura: o agregado por campo (o EAN com a loja)", lido.agregado.ean.some((item) => item.valor === "7891234567895" && item.lojas.includes("ZZ-PROP Loja")));
    conferir("leitura: os prompts da biblioteca, o do sistema primeiro, e sem texto sem pedir", lido.prompts[0]?.nome === "Padrão do sistema" && lido.promptTexto === null);
    conferir("leitura: sem proposta ainda", lido.proposta === null);
    const comPrompt = await lerParaProposta("ZZ-PROP-6", { prompt: "padrão do sistema" });
    conferir("leitura: com o prompt pedido (sem caixa), o texto dele", typeof comPrompt.promptTexto === "string" && comPrompt.promptTexto.length > 100);
    let semPrompt = "";
    try {
      await lerParaProposta("ZZ-PROP-6", { prompt: "ZZ prompt que nao existe" });
    } catch (erro) {
      semPrompt = erro.message;
    }
    conferir("leitura: prompt que nao existe e recusado com os nomes que existem", /não existe/.test(semPrompt) && /Padrão do sistema/.test(semPrompt));
    let semProduto = "";
    try {
      await lerParaProposta("ZZ-PROP-NAO-HA");
    } catch (erro) {
      semProduto = erro.message;
    }
    conferir("leitura: produto que nao existe e recusado", /ZZ-PROP-NAO-HA/.test(semProduto));

    conferir("fotoDaOferta: o id da oferta vinculada devolve a url e a loja", JSON.stringify(await fotoDaOferta("ZZ-PROP-6", `${coletado.id}:1`)) === JSON.stringify({ url: "https://zz-prop-loja.invalid/2.jpg", loja: "ZZ-PROP Loja" }));
    conferir("fotoDaOferta: foto de produto coletado NAO vinculado = null", (await fotoDaOferta("ZZ-PROP-6", `${solto.id}:0`)) === null);
    conferir("fotoDaOferta: indice fora da lista = null", (await fotoDaOferta("ZZ-PROP-6", `${coletado.id}:7`)) === null);
    conferir("fotoDaOferta: id sem formato = null", (await fotoDaOferta("ZZ-PROP-6", "https://outro.site/x.jpg")) === null && (await fotoDaOferta("ZZ-PROP-6", `${coletado.id}:-1`)) === null);

    await prisma.produto.update({ where: { id: produto.id }, data: { conferido: true } });
    conferir("leitura: produto Conferido vem marcado (o MCP recusa)", (await lerParaProposta("ZZ-PROP-6")).produto.conferido === true);

    const rascunho = await prisma.produto.create({ data: { sku: "ZZ-PROP-7", tituloBase: "SO RASCUNHO", fornecedorRascunho: { nome: "Fornecedor do Bling", codigo: "B1", precoCusto: 8.5 } } });
    const doBling = (await lerParaProposta("ZZ-PROP-7")).fornecedores;
    conferir("leitura: sem vinculo confirmado, o fornecedor em rascunho do Bling", rascunho && doBling.length === 1 && doBling[0].nome === "Fornecedor do Bling" && doBling[0].custo === 8.5 && doBling[0].rascunho === true);
  }

  // Candidatas (MCP, Tarefa 2): o Rise baixa so as fotos das ofertas vinculadas, pelo id, e a gravacao das fotos as usa.
  {
    const { existsSync, readdirSync, writeFileSync, mkdirSync } = await import("node:fs");
    const { default: sharp } = await import("sharp");
    const { baixarCandidatas, LIMITE_DE_CANDIDATAS } = await import("../src/lib/proposta/candidatas.js");
    const { gravarProposta, lerProposta } = await import("../src/lib/proposta/banco.js");
    const loja = await prisma.fonteColeta.create({ data: { nome: "ZZ-PROP Loja Fotos", dominio: "zz-prop-fotos.invalid", tipo: "CONCORRENTE" } });
    const fotos = ["https://zz-prop-fotos.invalid/a.png", "https://zz-prop-fotos.invalid/b.png", "https://zz-prop-fotos.invalid/pagina.html"];
    const coletado = await prisma.produtoColetado.create({ data: { fonteId: loja.id, chave: "codigo:P1", origem: "site", codigo: "P1", nome: "Produto com fotos", imagens: fotos } });
    const outro = await prisma.produtoColetado.create({ data: { fonteId: loja.id, chave: "codigo:P2", origem: "site", codigo: "P2", nome: "Nao vinculado", imagens: ["https://zz-prop-fotos.invalid/z.png"] } });
    const produto = await prisma.produto.create({ data: { sku: "ZZ-PROP-8", tituloBase: "PRODUTO DAS CANDIDATAS" } });
    await prisma.produtoConcorrente.create({ data: { produtoId: produto.id, produtoColetadoId: coletado.id } });
    const png = await sharp({ create: { width: 800, height: 500, channels: 3, background: "#36c" } }).png().toBuffer();
    const pedidos = [];
    const baixar = async (url) => {
      pedidos.push(url);
      return url.endsWith(".html") ? Buffer.from("<html><body>não é foto</body></html>") : png;
    };
    const pasta = "dados/produtos/ZZ-PROP-8/proposta";
    const id = (indice) => `${coletado.id}:${indice}`;

    const r1 = await baixarCandidatas("ZZ-PROP-8", [id(0), id(1)], { baixar });
    conferir("candidatas: as 2 fotos das ofertas baixadas, com arquivo, loja e 1024x1024", r1.baixadas.length === 2 && r1.falharam.length === 0 && r1.baixadas.every((b) => /^[0-9a-f]{32}\.jpg$/.test(b.arquivo) && b.loja === "ZZ-PROP Loja Fotos" && b.largura === 1024 && b.altura === 1024));
    const meta = await sharp(`${pasta}/${r1.baixadas[0].arquivo}`).metadata();
    conferir("candidatas: o arquivo no disco e JPEG 1024x1024", meta.format === "jpeg" && meta.width === 1024 && meta.height === 1024);
    const antes = pedidos.length;
    const r2 = await baixarCandidatas("ZZ-PROP-8", [`${outro.id}:0`, "inventado:0", "https://zz-prop-fotos.invalid/a.png"], { baixar });
    conferir("candidatas: id de outro produto, inventado ou endereco = falharam, sem baixar nada", r2.baixadas.length === 0 && r2.falharam.length === 3 && r2.falharam.every((f) => /não é foto das ofertas deste produto/.test(f.motivo)) && pedidos.length === antes);
    const r3 = await baixarCandidatas("ZZ-PROP-8", [id(2), id(0)], { baixar });
    conferir("candidatas: a pagina HTML falha com o motivo e a outra volta", r3.falharam.length === 1 && r3.falharam[0].id === id(2) && r3.falharam[0].motivo.length > 0 && r3.baixadas.length === 1);
    conferir("candidatas: o mesmo id de novo devolve o mesmo arquivo, sem baixar de novo", r3.baixadas[0].arquivo === r1.baixadas[0].arquivo && pedidos.filter((url) => url === fotos[0]).length === 1);
    let muitos = "";
    try {
      await baixarCandidatas("ZZ-PROP-8", Array.from({ length: 21 }, (_, i) => id(i)), { baixar });
    } catch (erro) {
      muitos = erro.message;
    }
    conferir("candidatas: 21 ids de uma vez sao recusados", /no máximo 20/.test(muitos));

    // O teto conta todas as fotos guardadas na pasta, citadas ou nao.
    const enchimento = Array.from({ length: LIMITE_DE_CANDIDATAS - 2 }, (_, i) => `${String(i).padStart(32, "a")}.jpg`);
    for (const nome of enchimento) writeFileSync(`${pasta}/${nome}`, "x");
    let cheio = "";
    try {
      await baixarCandidatas("ZZ-PROP-8", [id(2)], { baixar });
    } catch (erro) {
      cheio = erro.message;
    }
    conferir(`candidatas: com ${LIMITE_DE_CANDIDATAS} na pasta, recusa e pede para gravar a secao fotos`, LIMITE_DE_CANDIDATAS === 100 && /100/.test(cheio) && /fotos/.test(cheio));
    const { rm } = await import("node:fs/promises");
    for (const nome of enchimento) await rm(`${pasta}/${nome}`);

    const extra = await baixarCandidatas("ZZ-PROP-8", [id(1)], { baixar });
    const [a, b] = r1.baixadas;
    const candidata = (baixada, ordem) => ({ id: baixada.id, arquivo: baixada.arquivo, origem: { loja: baixada.loja }, escolhida: true, ordem, motivo: "teste" });
    const soA = await gravarProposta("ZZ-PROP-8", { secao: "fotos", conteudo: { candidatas: [candidata(a, 0)] } });
    conferir("gravar fotos: cita o arquivo baixado sem mandar os bytes", soA.ok === true && (await lerProposta("ZZ-PROP-8")).secoes.fotos.candidatas[0].arquivo === a.arquivo);
    conferir("gravar fotos: a baixada que nao foi citada sai da pasta", existsSync(`${pasta}/${a.arquivo}`) && !existsSync(`${pasta}/${b.arquivo}`) && extra.baixadas[0].arquivo === b.arquivo);
    const denovo = await baixarCandidatas("ZZ-PROP-8", [id(1)], { baixar });
    conferir("gravar fotos: a que saiu pode ser baixada de novo (outro arquivo)", denovo.baixadas.length === 1 && denovo.baixadas[0].arquivo !== b.arquivo && existsSync(`${pasta}/${denovo.baixadas[0].arquivo}`));
    const fantasma = await gravarProposta("ZZ-PROP-8", { secao: "fotos", conteudo: { candidatas: [{ ...candidata(a, 0), arquivo: `${"f".repeat(32)}.jpg` }] } });
    conferir("gravar fotos: arquivo que nao foi baixado e recusado", fantasma.ok === false);
    mkdirSync(pasta, { recursive: true });
    conferir("gravar fotos: depois da recusa a pasta continua com a citada", readdirSync(pasta).includes(a.arquivo));

    await prisma.produto.update({ where: { id: produto.id }, data: { conferido: true } });
    let aprovado = "";
    try {
      await baixarCandidatas("ZZ-PROP-8", [id(0)], { baixar });
    } catch (erro) {
      aprovado = erro.message;
    }
    conferir("candidatas: produto Conferido recusa", /já aprovado/.test(aprovado));
  }

  // Documentos so com link: o Rise testa cada um ao gravar e marca o que nao abre (pedido do dono em 21/10/2026).
  {
    const { gravarProposta, lerProposta } = await import("../src/lib/proposta/banco.js");
    await prisma.produto.update({ where: { sku: "ZZ-PROP-8" }, data: { conferido: false } });
    const testados = [];
    const testarLink = async (url) => {
      testados.push(url);
      if (url.includes("cai")) throw new Error("tempo esgotado");
      return url.includes("quebrado") ? { ok: false, status: 404 } : { ok: true, status: 200 };
    };
    const itens = [
      { id: "l1", titulo: "Datasheet bom", url: "https://zz.test/bom.pdf", loja: "A" },
      { id: "l2", titulo: "Driver quebrado", url: "https://zz.test/quebrado.zip", loja: "B" },
      { id: "l3", titulo: "Manual que cai", url: "https://zz.test/cai.docx", loja: "B" },
    ];
    const gravado = await gravarProposta("ZZ-PROP-8", { secao: "documentos", conteudo: { itens } }, { testarLink });
    const lidos = (await lerProposta("ZZ-PROP-8")).secoes.documentos.itens;
    conferir("links: cada link testado uma vez", gravado.ok === true && testados.length === 3);
    conferir("links: o que abre fica ok com o status", lidos[0].link?.ok === true && lidos[0].link?.status === 200 && typeof lidos[0].link?.conferidoEm === "string");
    conferir("links: o 404 fica marcado como nao abre", lidos[1].link?.ok === false && lidos[1].link?.status === 404);
    conferir("links: falha de rede fica marcada sem status, com o motivo", lidos[2].link?.ok === false && lidos[2].link?.status === null && /tempo/.test(lidos[2].link?.erro ?? ""));
    conferir("links: o aviso da gravacao diz quantos nao abrem", /2 de 3/.test(gravado.aviso ?? ""));
  }

  // Folha de contato (MCP, Tarefa 3): as fotos atuais e as candidatas numa imagem, com a legenda numero -> id/arquivo/loja.
  {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    const { default: sharp } = await import("sharp");
    const { folhaDeContato, POR_PAGINA } = await import("../src/lib/proposta/folha.js");
    const { gravarIndiceDeCandidatas } = await import("../src/lib/proposta/banco.js");
    const produto = await prisma.produto.create({ data: { sku: "ZZ-PROP-9", tituloBase: "PRODUTO DA FOLHA" } });
    const jpeg = (cor) => sharp({ create: { width: 300, height: 200, channels: 3, background: cor } }).jpeg().toBuffer();
    const nome = (letra, i) => `${letra}${String(i).padStart(31, "0")}.jpg`;
    mkdirSync("dados/produtos/ZZ-PROP-9/imagens", { recursive: true });
    mkdirSync("dados/produtos/ZZ-PROP-9/proposta", { recursive: true });
    for (const i of [1, 2]) {
      writeFileSync(`dados/produtos/ZZ-PROP-9/imagens/${nome("a", i)}`, await jpeg("#c33"));
      await prisma.produtoArquivo.create({ data: { produtoId: produto.id, tipo: "IMAGEM", papel: "FOTO", arquivo: nome("a", i), ordem: i } });
    }
    const indice = {};
    for (const i of [1, 2, 3]) {
      writeFileSync(`dados/produtos/ZZ-PROP-9/proposta/${nome("b", i)}`, await jpeg("#33c"));
      indice[`coletado${i}:0`] = { arquivo: nome("b", i), loja: `Loja ${i}`, largura: 1024, altura: 1024 };
    }
    await gravarIndiceDeCandidatas("ZZ-PROP-9", indice);

    const folha = await folhaDeContato("ZZ-PROP-9");
    const meta = await sharp(folha.jpeg).metadata();
    conferir("folha: 2 atuais primeiro e as 3 candidatas, numeradas de 1 a 5", folha.legenda.length === 5 && folha.legenda.map((l) => l.numero).join() === "1,2,3,4,5" && folha.legenda[0].atual && folha.legenda[1].atual && !folha.legenda[2].atual);
    conferir("folha: a candidata leva o id, o arquivo e a loja; a atual, o arquivo", folha.legenda[2].id === "coletado1:0" && folha.legenda[2].arquivo === nome("b", 1) && folha.legenda[2].loja === "Loja 1" && folha.legenda[0].arquivo === nome("a", 1));
    conferir("folha: um JPEG que abre, numa pagina so, sem aviso", meta.format === "jpeg" && meta.width > 0 && folha.pagina === 1 && folha.paginas === 1 && folha.aviso === null);
    const pequena = await sharp((await folhaDeContato("ZZ-PROP-9", { tamanho: 160 })).jpeg).metadata();
    conferir("folha: tamanho 160 sai menor que o 256", pequena.width < meta.width);

    for (let i = 4; i <= 28; i++) writeFileSync(`dados/produtos/ZZ-PROP-9/proposta/${nome("c", i)}`, await jpeg("#3c3"));
    const primeira = await folhaDeContato("ZZ-PROP-9");
    const segunda = await folhaDeContato("ZZ-PROP-9", { pagina: 2 });
    conferir(`folha: 30 fotos dao 2 paginas de ate ${POR_PAGINA}`, POR_PAGINA === 24 && primeira.paginas === 2 && primeira.legenda.length === 24 && segunda.legenda.length === 6);
    conferir("folha: a numeracao continua na segunda pagina", segunda.legenda[0].numero === 25);
    conferir("folha: foto da pasta sem indice entra com o arquivo e sem id", segunda.legenda.some((l) => l.arquivo === nome("c", 28) && l.id === null));
    const alem = await folhaDeContato("ZZ-PROP-9", { pagina: 9 });
    conferir("folha: pagina alem da ultima devolve a ultima com aviso", alem.pagina === 2 && /última/.test(alem.aviso ?? ""));

    const vazio = await prisma.produto.create({ data: { sku: "ZZ-PROP-10", tituloBase: "SEM FOTOS" } });
    let semFotos = "";
    try {
      await folhaDeContato("ZZ-PROP-10");
    } catch (erro) {
      semFotos = erro.message;
    }
    conferir("folha: produto sem foto nenhuma e recusado, apontando baixarCandidatas", vazio && /baixarCandidatas/.test(semFotos));
    await prisma.produto.update({ where: { id: produto.id }, data: { conferido: true } });
    let aprovado = "";
    try {
      await folhaDeContato("ZZ-PROP-9");
    } catch (erro) {
      aprovado = erro.message;
    }
    conferir("folha: produto Conferido recusa", /já aprovado/.test(aprovado));
  }
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(`\n${contagem} asserções ok`);
