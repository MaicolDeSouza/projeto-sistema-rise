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
  const { rm } = await import("node:fs/promises");
  for (const sku of ["ZZ-PROP-1", "ZZ-PROP-2"]) await rm(`dados/produtos/${sku}`, { recursive: true, force: true });
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
    conferir("aplicadas: titulos, preco e fotos estao pendentes", ["titulos", "preco", "fotos"].every((s) => pendentes.includes(s)));
    conferir("aplicadas: documentos nunca fica pendente", !pendentes.includes("documentos"));
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
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(`\n${contagem} asserções ok`);
