import "dotenv/config";

/**
 * Testes do estudo de viabilidade (spec 2026-11-12-estudo-de-viabilidade-design.md): as regras puras (mediana, piso da
 * faixa de vendidos, demanda, preco por unidade, quantidade, vendas por mes entre dois estudos, veredito), o banco (fila
 * sem repetir, calcular com um ML falso, gravar, historico) e as cinco ferramentas do MCP com o acesso. SEM rede.
 *
 *   npm run teste:estudos
 *
 * So escreve fontes "ZZ-EST *", produtos ZZ-EST-*, pedidos ZZ-EST-* e os estudos deles, e apaga tudo no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

const regras = await import("../src/lib/estudos/regras.js");
const { mediana, pisoDosVendidos, nivelDaDemanda, precoPorUnidade, idDoAnuncio, resumoDoMercado, confiancaDoEstudo, vendasPorMesEntre, arredondarNoMultiplo, quantidadeInicial, melhorFornecedor, vereditoPelasRegras } =
  regras;

console.log("Regras puras");
conferir("mediana impar, par e vazia", [mediana([3, 1, 2]), mediana([4, 1, 3, 2]), mediana([]), mediana([null, 5])], [2, 2.5, null, 5]);
conferir(
  "piso da faixa de vendidos",
  ["+500 vendidos", "+1mil vendidos", "+10 mil vendidos", "5 vendidos", "1.234 vendidos", "+2,5 mil", 42, "Novo", null].map(pisoDosVendidos),
  [500, 1000, 10000, 5, 1234, 2500, 42, null, null],
);
conferir("nivel da demanda", [nivelDaDemanda(1000), nivelDaDemanda(999), nivelDaDemanda(200), nivelDaDemanda(199), nivelDaDemanda(null)], ["FORTE", "MEDIA", "MEDIA", "FRACA", null]);
conferir("preco por unidade", [precoPorUnidade({ preco: 50, unidades: 10 }), precoPorUnidade({ preco: 19.9 }), precoPorUnidade({ preco: 0 })], [5, 19.9, null]);
conferir(
  "id do anuncio pelo link",
  [idDoAnuncio({ url: "https://produto.mercadolivre.com.br/MLB-1234567890-modulo-_JM" }), idDoAnuncio({ url: "https://www.mercadolivre.com.br/x/p/MLB19876543" }), idDoAnuncio({ url: "x" })],
  ["MLB1234567890", "MLB19876543", null],
);

const ANUNCIOS = [
  { titulo: "Modulo A", url: "https://produto.mercadolivre.com.br/MLB-1000001-a", preco: 20, mesmoProduto: true, vendidos: "+500 vendidos", vendedor: "Loja1", full: true },
  { titulo: "Modulo B", url: "https://produto.mercadolivre.com.br/MLB-1000002-b", preco: 24, mesmoProduto: true, vendidos: "+100 vendidos", vendedor: "Loja2" },
  { titulo: "Kit 10", url: "https://produto.mercadolivre.com.br/MLB-1000003-c", preco: 180, unidades: 10, mesmoProduto: true, vendidos: "+50 vendidos", vendedor: "loja1" },
  { titulo: "Acessorio", url: "https://produto.mercadolivre.com.br/MLB-1000004-d", preco: 5, mesmoProduto: false, motivo: "case", vendidos: "+5mil vendidos" },
];
const mercado = resumoDoMercado(ANUNCIOS);
conferir(
  "resumo do mercado so com o mesmo produto",
  [mercado.lidos, mercado.iguais, mercado.precoReferencia, mercado.precoMenor, mercado.precoMaior, mercado.vendidosSomados, mercado.demanda, mercado.vendedores, mercado.comFull],
  [4, 3, 20, 18, 24, 650, "MEDIA", 2, 1],
);
conferir("confianca", [confiancaDoEstudo(mercado), confiancaDoEstudo({ iguais: 6, comVendidos: 5 }), confiancaDoEstudo({ iguais: 1, comVendidos: 1 })], ["MEDIA", "ALTA", "BAIXA"]);
conferir(
  "vendas por mes entre dois estudos",
  vendasPorMesEntre(
    { em: "2026-11-01T12:00:00Z", anuncios: [{ ...ANUNCIOS[0], vendidos: "+500 vendidos" }, { ...ANUNCIOS[1], vendidos: "+50 vendidos" }] },
    { em: "2026-11-16T12:00:00Z", anuncios: ANUNCIOS },
  ),
  { porMes: 100, dias: 15, anunciosEmComum: 2 },
);
conferir("vendas por mes: intervalo curto nao mede", vendasPorMesEntre({ em: "2026-11-10", anuncios: ANUNCIOS }, { em: "2026-11-12", anuncios: ANUNCIOS }), null);
conferir("multiplo do fornecedor", [arredondarNoMultiplo(7, 5), arredondarNoMultiplo(10, 5), arredondarNoMultiplo(3, null)], [10, 10, 3]);
conferir(
  "quantidade pelos parecidos e pela demanda",
  [
    quantidadeInicial({ parecidos: [{ vendasPorMes: 4 }, { vendasPorMes: 10 }, { vendasPorMes: 6 }], demanda: "FORTE", multiplo: 5 }),
    quantidadeInicial({ parecidos: [{ vendasPorMes: 0 }], demanda: "MEDIA" }),
    quantidadeInicial({ parecidos: [], demanda: null }),
  ],
  [{ quantidade: 15, origem: "parecidos", base: 12 }, { quantidade: 10, origem: "demanda", base: 10 }, { quantidade: 5, origem: "demanda", base: 5 }],
);
conferir(
  "melhor fornecedor: o menor custo, com estoque no empate",
  melhorFornecedor([{ fonte: "A", custo: 8, temEstoque: false }, { fonte: "B", custo: 8, temEstoque: true }, { fonte: "C", custo: 9 }, { fonte: "D", custo: null }]).fonte,
  "B",
);
const contasBoas = { mercado: { demanda: "FORTE", precoMenor: 20 }, custo: { custo: 5, fornecedores: [{ temEstoque: true }, { temEstoque: false }] }, lucro: { lucro: 8, markup: 45, precoMinimo: 15 } };
conferir("veredito: vale", vereditoPelasRegras(contasBoas), { veredito: "VALE", motivos: [] });
conferir("veredito: ressalva pela demanda fraca e um fornecedor", vereditoPelasRegras({ ...contasBoas, mercado: { demanda: "FRACA" }, custo: { custo: 5, fornecedores: [{ temEstoque: true }] } }).motivos, ["Demanda fraca.", "Um fornecedor só."]);
conferir("veredito: ressalva pelo menor preco abaixo do minimo", vereditoPelasRegras({ ...contasBoas, mercado: { demanda: "FORTE", precoMenor: 12 } }).veredito, "VALE_COM_RESSALVA");
conferir("veredito: nao vale pelo markup", vereditoPelasRegras({ ...contasBoas, lucro: { lucro: 6, markup: 10 } }).veredito, "NAO_VALE");
conferir("veredito: nao vale sem fornecedor", vereditoPelasRegras({ ...contasBoas, custo: { custo: null, fornecedores: [] } }), { veredito: "NAO_VALE", motivos: ["Nenhum fornecedor com custo."] });

// ---------------------------------------------------------------------------
const { prisma } = await import("../src/lib/db.js");
const banco = await import("../src/lib/estudos/banco.js");
const { FERRAMENTAS_DE_ESTUDOS } = await import("../src/lib/mcp/estudos.js");

async function limpar() {
  const coletados = await prisma.produtoColetado.findMany({ where: { fonte: { nome: { startsWith: "ZZ-EST " } } }, select: { id: true } });
  await prisma.estudoDeViabilidade.deleteMany({ where: { OR: [{ produtoColetadoId: { in: coletados.map((linha) => linha.id) } }, { fonteNome: { startsWith: "ZZ-EST " } }] } });
  await prisma.fonteColeta.deleteMany({ where: { nome: { startsWith: "ZZ-EST " } } });
  await prisma.pedidoDeVenda.deleteMany({ where: { idExterno: { startsWith: "ZZ-EST-" } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-EST-" } } });
}

// O ML falso: categoria, taxas (13% + R$ 6,25 abaixo de R$ 79) e frete de R$ 7 do vendedor.
function mlFalso() {
  const chamadas = [];
  return {
    chamadas,
    usuarioId: async () => "212386247",
    async get(caminho, params) {
      chamadas.push(caminho);
      if (caminho === "/sites/MLB/domain_discovery/search") return { ok: true, status: 200, dados: [{ category_id: "MLB5672", category_name: "Módulos", domain_id: "D", domain_name: "D" }] };
      if (caminho === "/sites/MLB/listing_prices") {
        const fixa = Number(params.price) < 79 ? 6.25 : 0;
        return { ok: true, status: 200, dados: [{ listing_type_id: params.listing_type_id, sale_fee_amount: Number(params.price) * 0.13 + fixa, sale_fee_details: { percentage_fee: 13, fixed_fee: fixa } }] };
      }
      if (caminho.endsWith("/shipping_options/free")) return { ok: true, status: 200, dados: { coverage: { all_country: { list_cost: 7, billable_weight: 300 } } } };
      return { ok: false, status: 404, dados: { message: "nao achado" } };
    },
  };
}

try {
  await limpar();
  console.log("\nBanco");
  const fornecedor = await prisma.fonteColeta.create({ data: { nome: "ZZ-EST Fornecedor", dominio: "zz-est-f.test", tipo: "FORNECEDOR" } });
  const concorrente = await prisma.fonteColeta.create({ data: { nome: "ZZ-EST Concorrente", dominio: "zz-est-c.test", tipo: "CONCORRENTE" } });
  const base = { origem: "site" };
  const doFornecedor = await prisma.produtoColetado.create({
    data: { ...base, fonteId: fornecedor.id, chave: "codigo:ZZ1", codigo: "ZZ1", nome: "Modulo ZZ", precoNormal: 4, impostos: [{ nome: "IPI", percentual: 10 }], quantidade: 30, multiploVenda: 5 },
  });
  const outroFornecedor = await prisma.produtoColetado.create({ data: { ...base, fonteId: fornecedor.id, chave: "codigo:ZZ2", codigo: "ZZ2", nome: "Modulo ZZ caro", precoNormal: 9, quantidade: 0 } });
  const doConcorrente = await prisma.produtoColetado.create({ data: { ...base, fonteId: concorrente.id, chave: "codigo:C1", codigo: "C1", nome: "Modulo ZZ na vitrine", precoNormal: 25 } });

  conferir("enviar: vazio recusa", await banco.enviarParaEstudo([]).catch((erro) => erro.name), "ErroDoEstudo");
  conferir("enviar: cria os dois", await banco.enviarParaEstudo([doConcorrente.id, doFornecedor.id, "nao-existe"], { usuario: "zz" }), { criados: 2, repetidos: 0, naoAchados: 1 });
  conferir("enviar de novo nao repete o que esta na fila", await banco.enviarParaEstudo([doConcorrente.id]), { criados: 0, repetidos: 1, naoAchados: 0 });
  const fila = (await banco.filaDeEstudos()).filter((estudo) => estudo.fonteNome.startsWith("ZZ-EST "));
  conferir("fila: os dois, na fila", fila.map((estudo) => [estudo.fonteTipo, estudo.situacao]).sort(), [["CONCORRENTE", "NA_FILA"], ["FORNECEDOR", "NA_FILA"]]);
  const estudo = fila.find((item) => item.fonteTipo === "CONCORRENTE");

  const lido = await banco.lerParaEstudo(estudo.id);
  conferir("ler para estudo: o produto do concorrente sem custo", [lido.produto.nome, lido.produto.codigo, lido.produto.custo, lido.anteriores.length], ["Modulo ZZ", undefined, null, 0].slice(0, 0).concat(["Modulo ZZ na vitrine", "C1", null, 0]));

  // Produto parecido da loja com 6 vendas no ML nos ultimos 90 dias (= 2 por mes) e uma cancelada que nao conta.
  const parecido = await prisma.produto.create({ data: { sku: "ZZ-EST-P1", tituloBase: "ZZ EST parecido", precoVenda: 22 } });
  const pedido = (id, status, quantidade) =>
    prisma.pedidoDeVenda.create({
      data: {
        origem: "MERCADO_LIVRE", canal: "MERCADO_LIVRE", idExterno: id, numero: id, dataDaVenda: new Date(), atualizadoNaOrigemEm: new Date(), statusDaOrigem: "paid", status,
        enderecoDeEntrega: {}, pagamento: [], envio: {}, historico: [], totalProdutos: 10, desconto: 0, freteCobrado: 0, total: 10,
        itens: { create: [{ ordem: 0, produtoId: parecido.id, titulo: "x", quantidade, precoUnitario: 1, desconto: 0, total: quantidade }] },
      },
    });
  await pedido("ZZ-EST-1", "ENTREGUE", 6);
  await pedido("ZZ-EST-2", "CANCELADO", 50);

  const ml = mlFalso();
  const entrada = { termos: ["modulo zz"], anuncios: ANUNCIOS, fornecedores: [doFornecedor.id, outroFornecedor.id], parecidos: ["ZZ-EST-P1"] };
  conferir("calcular: fornecedor que nao e fornecedor recusa", await banco.calcularEstudo(estudo.id, { ...entrada, fornecedores: [doConcorrente.id] }, { cliente: ml }).catch((erro) => /não é fornecedor/.test(erro.message)), true);
  conferir("calcular: SKU que nao existe recusa", await banco.calcularEstudo(estudo.id, { ...entrada, parecidos: ["ZZ-EST-NAO"] }, { cliente: ml }).catch((erro) => /ZZ-EST-NAO/.test(erro.message)), true);
  conferir("gravar antes de calcular recusa", await banco.gravarEstudo(estudo.id, { conclusao: "x" }).catch((erro) => /contas/.test(erro.message)), true);

  const contas = await banco.calcularEstudo(estudo.id, entrada, { cliente: ml });
  // Referencia R$ 20: comissao 2,60 + tarifa 6,25 + frete 7 + imposto 1,20 + custo 4,40 (4 + 10% IPI) = 21,45 -> lucro -1,45.
  conferir("contas: custo com IPI do fornecedor de menor custo", [contas.custo.custo, contas.custo.fornecedor, contas.custo.fornecedores.length], [4.4, "ZZ-EST Fornecedor", 2]);
  conferir("contas: categoria pelo ML", [contas.lucro.categoriaId, contas.lucro.categoriaNome], ["MLB5672", "Módulos"]);
  conferir("contas: lucro no classico", [contas.lucro.comissao, contas.lucro.tarifaFixa, contas.lucro.frete, contas.lucro.imposto, contas.lucro.lucro, contas.lucro.freteEstimado], [2.6, 6.25, 7, 1.2, -1.45, true]);
  conferir("contas: preco minimo para 30% existe e passa do mercado", contas.lucro.precoMinimo > 20, true);
  conferir("contas: parecidos com as vendas (cancelada fora)", contas.quantidade, { quantidade: 5, origem: "parecidos", base: 4 });
  conferir("contas: regra nao vale (lucro negativo) e quantidade 0", [contas.regra.veredito, contas.regra.quantidade], ["NAO_VALE", 0]);
  const parecidosGravados = (await prisma.estudoDeViabilidade.findUnique({ where: { id: estudo.id } })).parecidos;
  conferir("parecido gravado com 6 vendidos e 2/mes", [parecidosGravados[0].vendidos90Dias, parecidosGravados[0].vendasPorMes], [6, 2]);

  conferir("gravar outro veredito sem motivo recusa", await banco.gravarEstudo(estudo.id, { veredito: "VALE", conclusao: "Boa" }).catch((erro) => /motivoDaDiferenca/.test(erro.message)), true);
  const gravado = await banco.gravarEstudo(estudo.id, { conclusao: "Taxas comem o lucro abaixo de R$ 79." });
  conferir("gravar com o veredito das regras", [gravado.veredito, gravado.confianca, gravado.quantidadeInicial], ["NAO_VALE", "MEDIA", 0]);
  conferir("estudo concluido nao recalcula", await banco.calcularEstudo(estudo.id, entrada, { cliente: ml }).catch((erro) => /concluído/.test(erro.message)), true);

  const novo = await banco.estudarDeNovo(estudo.id);
  conferir("estudar de novo cria outro na fila", novo.jaEstava, false);
  conferir("estudar de novo outra vez devolve o mesmo", (await banco.estudarDeNovo(estudo.id)).id, novo.id);
  const comHistorico = await banco.lerEstudo(novo.id);
  conferir("historico: o estudo antigo aparece no novo", comHistorico.historico.map((item) => item.id), [estudo.id]);
  conferir("ler para estudo traz o anterior", (await banco.lerParaEstudo(novo.id)).anteriores.map((item) => item.id), [estudo.id]);

  const lista = await banco.listarEstudos({ busca: "ZZ-EST", ordenar: "lucro", direcao: "asc" });
  conferir("lista: busca pela fonte e ordem pelo lucro (sem lucro no fim)", [lista.total, lista.linhas[0].id], [3, estudo.id]);
  conferir("lista: filtro concluidos", (await banco.listarEstudos({ busca: "ZZ-EST", situacao: ["CONCLUIDO"] })).total, 1);

  console.log("\nMCP");
  const ferramenta = (nome) => FERRAMENTAS_DE_ESTUDOS.find((item) => item.nome === nome);
  const tudo = { pode: () => true, mcp: { clienteML: mlFalso() } };
  const soVer = { pode: (recurso, nivel) => nivel === "ver" };
  const semCusto = { pode: (recurso) => recurso !== "dado.custo" };
  const recusa = (promessa) => promessa.then(() => null).catch((erro) => erro.message);
  conferir("cinco ferramentas", FERRAMENTAS_DE_ESTUDOS.map((item) => item.nome), [
    "roteiroDoEstudoDeViabilidade",
    "listarEstudosDeViabilidade",
    "lerParaEstudoDeViabilidade",
    "calcularEstudoDeViabilidade",
    "gravarEstudoDeViabilidade",
  ]);
  conferir("roteiro com versao e passos", [(await ferramenta("roteiroDoEstudoDeViabilidade").executar({}, soVer)).versao, /lista\.mercadolivre/.test((await ferramenta("roteiroDoEstudoDeViabilidade").executar({}, soVer)).roteiro)], ["1", true]);
  conferir("sem custo recusa", /custo/.test(await recusa(ferramenta("listarEstudosDeViabilidade").executar({}, semCusto))), true);
  conferir("so ver nao calcula", /não pode fazer/.test(await recusa(ferramenta("calcularEstudoDeViabilidade").executar({ id: novo.id, anuncios: [] }, soVer))), true);
  conferir("listar traz o novo da fila", (await ferramenta("listarEstudosDeViabilidade").executar({}, tudo)).estudos.some((item) => item.id === novo.id), true);
  const esquema = ferramenta("calcularEstudoDeViabilidade").esquema;
  conferir("esquema recusa categoria sem MLB", esquema.safeParse({ id: "x", anuncios: [], categoriaId: "5672" }).success, false);
  const outro = fila.find((item) => item.fonteTipo === "FORNECEDOR");
  const pelaFerramenta = await ferramenta("calcularEstudoDeViabilidade").executar(esquema.parse({ id: outro.id, anuncios: ANUNCIOS.slice(0, 2), fornecedores: [doFornecedor.id], categoriaId: "MLB5672", medidas: { alturaCm: 2, larguraCm: 3, comprimentoCm: 4, pesoKg: 0.02 } }), tudo);
  conferir("calcular pela ferramenta com categoria e medidas dadas", [pelaFerramenta.lucro.categoriaId, pelaFerramenta.lucro.freteEstimado, pelaFerramenta.quantidade.origem], ["MLB5672", false, "demanda"]);
  conferir("erro do estudo vira recado", /concluído/.test(await recusa(ferramenta("calcularEstudoDeViabilidade").executar({ id: estudo.id, anuncios: [] }, tudo))), true);
  const fechado = await ferramenta("gravarEstudoDeViabilidade").executar({ id: outro.id, conclusao: "Teste.", veredito: "VALE", motivoDaDiferenca: "teste" }, tudo);
  conferir("gravar pela ferramenta com motivo", fechado.veredito, "VALE");
  conferir("conclusao guarda o motivo da diferenca", /Diferente das regras/.test((await banco.lerEstudo(outro.id)).conclusao), true);
} catch (erro) {
  falhas++;
  console.error("FALHA inesperada:", erro);
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
