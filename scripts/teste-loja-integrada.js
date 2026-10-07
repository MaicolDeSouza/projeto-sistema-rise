/**
 * Contrato basico da Loja Integrada, inteiramente em memoria e sem rede.
 * Nenhum teste usa o Personal Token real nem altera a loja.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { mascarar } = await import("../src/lib/integracoes/httpClient.js");
const {
  classificarFalhaLojaIntegrada,
  criarLojaIntegradaClient,
  urlDaLojaIntegrada,
} = await import("../src/lib/integracoes/lojaIntegrada/client.js");
const {
  idDeRecursoLojaIntegrada,
  normalizarClienteLojaIntegrada,
  normalizarEstoqueLojaIntegrada,
  normalizarPedidoLojaIntegrada,
  normalizarPrecoLojaIntegrada,
  normalizarProdutoLojaIntegrada,
} = await import(
  "../src/lib/integracoes/lojaIntegrada/normalizadores.js"
);
const { criarProdutosLojaIntegrada } = await import(
  "../src/lib/integracoes/lojaIntegrada/produtos.js"
);
const {
  interpretarProximaPagina,
  paginarLojaIntegrada,
} = await import("../src/lib/integracoes/lojaIntegrada/paginacao.js");
const { criarClientesLojaIntegrada } = await import(
  "../src/lib/integracoes/lojaIntegrada/clientes.js"
);
const { criarPedidosLojaIntegrada } = await import(
  "../src/lib/integracoes/lojaIntegrada/pedidos.js"
);
const { criarPrecosEstoqueLojaIntegrada } = await import(
  "../src/lib/integracoes/lojaIntegrada/precosEstoque.js"
);
const { testar } = await import("../src/lib/integracoes/lojaintegrada.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

conferir(
  "URL oficial com parametros",
  urlDaLojaIntegrada("/produto", { limit: 1, ativo: true, vazio: "" }),
  "https://api.awsli.com.br/v1/produto?limit=1&ativo=true",
);

const chamadas = [];
const esperas = [];
const cliente = criarLojaIntegradaClient({
  configuracao: { lojaIntegrada: { enabled: true } },
  obterToken: async () => "N0F_TOKEN_DE_TESTE",
  limitarHttp: async (...args) => esperas.push(args),
  requisitarHttp: async (opcoes) => {
    chamadas.push(opcoes);
    return {
      ok: true,
      status: 200,
      duracaoMs: 12,
      dados: { meta: { total_count: 7 }, objects: [] },
    };
  },
  exigirEscrita: () => {
    throw new Error("Operacoes de escrita da Loja Integrada estao desabilitadas.");
  },
});

await cliente.get("/produto", { limit: 1 });
conferir(
  "Personal Token vai no header Basic",
  chamadas[0].headers.Authorization,
  "Basic N0F_TOKEN_DE_TESTE",
);
conferir(
  "GET usa limite conservador por minuto",
  esperas[0],
  ["LOJA_INTEGRADA", 90, 60000],
);
conferir("o token nunca entra na URL", chamadas[0].url.includes("TOKEN_DE_TESTE"), false);

let escritaBloqueada = null;
try {
  await cliente.put("/produto/1", { nome: "Teste" });
} catch (erro) {
  escritaBloqueada = erro.message;
}
conferir(
  "escrita e bloqueada antes da requisicao",
  [escritaBloqueada, chamadas.length],
  ["Operacoes de escrita da Loja Integrada estao desabilitadas.", 1],
);

conferir(
  "mascara Authorization Basic completo",
  mascarar("Authorization: Basic N0F_SEGREDO"),
  "Authorization: ***",
);
conferir(
  "mascara Personal Token em objeto",
  mascarar({ personalToken: "N0F_SEGREDO", nome: "Rise" }),
  { personalToken: "***", nome: "Rise" },
);

for (const [status, tipo] of [
  [401, "AUTENTICACAO"],
  [403, "ACESSO_NEGADO"],
  [404, "NAO_ENCONTRADO"],
  [409, "CONFLITO"],
  [429, "LIMITE"],
  [500, "INDISPONIVEL"],
]) {
  conferir(
    `HTTP ${status} tem categoria propria`,
    classificarFalhaLojaIntegrada(status, {}).tipo,
    tipo,
  );
}

const conexaoOk = await testar(cliente);
conferir(
  "teste de conexao normaliza o sucesso",
  { ok: conexaoOk.ok, conta: conexaoOk.conta, detalhe: conexaoOk.detalhe },
  { ok: true, conta: "Personal Token válido", detalhe: "7 produto(s) no catálogo" },
);

const autenticacaoFalhou = await testar({
  get: async () => ({
    ok: false,
    status: 401,
    duracaoMs: 8,
    dados: { detail: "Token invalido" },
  }),
});
conferir(
  "teste distingue credencial invalida",
  { ok: autenticacaoFalhou.ok, tipo: autenticacaoFalhou.tipo },
  { ok: false, tipo: "AUTENTICACAO" },
);

const indisponivel = await testar({
  get: async () => {
    throw new Error("Tempo esgotado apos 20000ms");
  },
});
conferir(
  "teste distingue API indisponivel",
  { ok: indisponivel.ok, tipo: indisponivel.tipo },
  { ok: false, tipo: "INDISPONIVEL" },
);

conferir(
  "interpreta meta.next da API v1 sem duplicar o prefixo",
  interpretarProximaPagina("/api/v1/produto?limit=2&offset=2"),
  { caminho: "/produto", params: { limit: "2", offset: "2" } },
);
conferir(
  "extrai id de resource_uri",
  idDeRecursoLojaIntegrada("/api/v1/produto/321/?descricao_completa=1"),
  "321",
);

const produtoNormalizado = normalizarProdutoLojaIntegrada({
  id: 11,
  resource_uri: "/api/v1/produto/11/",
  pai: "/api/v1/produto/10/",
  tipo: "atributo_opcao",
  sku: " CAM-P ",
  nome: "Camiseta P",
  descricao_completa: "<p>Algodao</p>",
  ativo: true,
  marca: "/api/v1/marca/4/",
  preco_cheio: "79.90",
  preco_promocional: "69.90",
  gerenciado: "1",
  estoque_quantidade: "8",
  peso: "0.35",
  altura: "2",
  largura: "20",
  comprimento: "30",
  categorias: ["/api/v1/categoria/7/"],
  variacoes: ["/api/v1/produto/11/"],
  data_modificacao: "2026-10-05T12:00:00Z",
});
conferir(
  "normaliza produto-filho sem misturar ids de produto e variacao",
  {
    produto: produtoNormalizado.idProdutoExterno,
    variacao: produtoNormalizado.idVariacaoExterna,
    sku: produtoNormalizado.sku,
    preco: produtoNormalizado.precos.promocional,
    estoque: produtoNormalizado.estoque.quantidade,
    categoria: produtoNormalizado.categorias[0].id,
    marca: produtoNormalizado.marca.id,
    comprimento: produtoNormalizado.dimensoesCm.comprimento,
  },
  {
    produto: "10",
    variacao: "11",
    sku: "CAM-P",
    preco: 69.9,
    estoque: 8,
    categoria: "7",
    marca: "4",
    comprimento: 30,
  },
);

conferir(
  "normalizador traz slug, video, fiscais e SEO do detalhe",
  (({ apelido, url, destaque, videoUrl, origem, tipoProducao, seo, tags }) => ({ apelido, url, destaque, videoUrl, origem, tipoProducao, seo, tags }))(
    normalizarProdutoLojaIntegrada({
      id: 404334430,
      apelido: "/zz-teste-li-apagar",
      url: "/zz-teste-li-alias",
      destaque: false,
      url_video_youtube: "https://youtu.be/x",
      icms_origin_code: "0",
      production_type: "Fabricação própria",
      seo_title: "Titulo",
      seo_description: "",
      tags: [],
    }),
  ),
  {
    apelido: "/zz-teste-li-apagar",
    url: "/zz-teste-li-alias",
    destaque: false,
    videoUrl: "https://youtu.be/x",
    origem: "0",
    tipoProducao: "Fabricação própria",
    seo: { title: "Titulo", description: null },
    tags: [],
  },
);

const chamadasPaginadas = [];
const clientePaginado = {
  get: async (caminho, params) => {
    chamadasPaginadas.push({ caminho, params });
    const offset = Number(params?.offset ?? 0);
    return {
      ok: true,
      status: 200,
      dados:
        offset === 0
          ? {
              meta: {
                total_count: 3,
                next: "/api/v1/produto?limit=2&offset=2",
              },
              objects: [
                { id: 1, sku: "A", nome: "Produto A", tipo: "normal" },
                { id: 2, sku: "B", nome: "Produto B", tipo: "normal" },
              ],
            }
          : {
              meta: { total_count: 3, next: null },
              objects: [{ id: 3, sku: "C", nome: "Produto C", tipo: "normal" }],
            },
    };
  },
};
const catalogo = await criarProdutosLojaIntegrada({
  cliente: clientePaginado,
}).listarTodos({ limit: 2 });
conferir(
  "percorre todas as paginas e normaliza produtos",
  {
    paginas: catalogo.paginas,
    skus: catalogo.produtos.map(({ sku }) => sku),
    chamadas: chamadasPaginadas,
  },
  {
    paginas: 2,
    skus: ["A", "B", "C"],
    chamadas: [
      { caminho: "/produto", params: { limit: 2 } },
      { caminho: "/produto", params: { limit: "2", offset: "2" } },
    ],
  },
);

let repeticaoDetectada = null;
try {
  const paginas = paginarLojaIntegrada({
    cliente: {
      get: async () => ({
        ok: true,
        status: 200,
        dados: {
          meta: { next: "/api/v1/produto?limit=1" },
          objects: [],
        },
      }),
    },
    caminho: "/produto",
    params: { limit: 1 },
  });
  for await (const _pagina of paginas) {
    // A segunda iteracao identifica a mesma URL antes de nova requisicao.
  }
} catch (erro) {
  repeticaoDetectada = erro.message;
}
conferir(
  "interrompe meta.next repetido",
  repeticaoDetectada,
  "A paginação da Loja Integrada entrou em repetição.",
);

conferir(
  "normaliza preco no endpoint separado",
  normalizarPrecoLojaIntegrada({
    id: 91,
    produto: "/api/v1/produto/51",
    cheio: "120.00",
    promocional: "99.90",
    custo: "70.00",
    sob_consulta: false,
  }),
  {
    id: "91",
    idProdutoExterno: "51",
    cheio: 120,
    promocional: 99.9,
    custo: 70,
    sobConsulta: false,
  },
);
conferir(
  "normaliza estoque disponivel e reservado",
  normalizarEstoqueLojaIntegrada({
    id: 92,
    produto: "/api/v1/produto/51",
    gerenciado: true,
    quantidade: 15,
    quantidade_disponivel: 12,
    quantidade_reservada: 3,
    situacao_em_estoque: 0,
    situacao_sem_estoque: -1,
  }),
  {
    id: "92",
    idProdutoExterno: "51",
    gerenciado: true,
    quantidade: 15,
    quantidadeDisponivel: 12,
    quantidadeReservada: 3,
    prazoEmEstoqueDias: 0,
    prazoSemEstoqueDias: -1,
  },
);

const clienteNormalizado = normalizarClienteLojaIntegrada({
  id: 71,
  nome: "Cliente Teste",
  tipo: "PF",
  cpf: "12345678900",
  email: "cliente@example.com",
  telefone_celular: "11999999999",
  enderecos: [
    {
      id: 72,
      principal: true,
      cep: "01001000",
      estado: "SP",
      cidade: "Sao Paulo",
      endereco: "Praca da Se",
      numero: "1",
    },
  ],
});
conferir(
  "normaliza cliente sem copiar o payload bruto",
  {
    id: clienteNormalizado.idExterno,
    tipo: clienteNormalizado.tipoPessoa,
    email: clienteNormalizado.email,
    cidade: clienteNormalizado.enderecos[0].cidade,
    possuiRaw: Object.hasOwn(clienteNormalizado, "raw"),
  },
  {
    id: "71",
    tipo: "FISICA",
    email: "cliente@example.com",
    cidade: "Sao Paulo",
    possuiRaw: false,
  },
);

const pedidoNormalizado = normalizarPedidoLojaIntegrada({
  numero: 165,
  resource_uri: "/api/v1/pedido/165",
  cliente: { id: 71, nome: "Cliente Teste", email: "cliente@example.com" },
  itens: [
    {
      id: 81,
      produto: { resource_uri: "/api/v1/produto/51" },
      sku: "LI-51",
      nome: "Item 51",
      quantidade: "2.00",
      preco_venda: "49.95",
      preco_subtotal: "99.90",
    },
  ],
  pagamentos: [
    {
      id: 82,
      forma_pagamento: { nome: "Pix" },
      pagamento_tipo: "pix",
      valor: "109.90",
      valor_pago: "109.90",
    },
  ],
  envios: [
    {
      id: 83,
      forma_envio: { nome: "PAC", code: "PAC" },
      objeto: "AA123BR",
      valor: "10.00",
    },
  ],
  situacao: { codigo: "pedido_pago", nome: "Pedido pago" },
  valor_subtotal: "99.90",
  valor_envio: "10.00",
  valor_desconto: "0.00",
  valor_total: "109.90",
  data_criacao: "2026-10-05T12:00:00Z",
});
conferir(
  "normaliza pedido para o dominio do Rise",
  {
    id: pedidoNormalizado.idExterno,
    numero: pedidoNormalizado.numero,
    sku: pedidoNormalizado.itens[0].sku,
    quantidade: pedidoNormalizado.itens[0].quantidade,
    total: pedidoNormalizado.valores.total,
    status: pedidoNormalizado.status,
    rastreamento: pedidoNormalizado.envio.rastreamento,
  },
  {
    id: "165",
    numero: "165",
    sku: "LI-51",
    quantidade: 2,
    total: 109.9,
    status: "pedido_pago",
    rastreamento: "AA123BR",
  },
);

const leituras = [];
const clienteLeitura = {
  get: async (caminho, params) => {
    leituras.push({ caminho, params });
    if (caminho.startsWith("/produto_preco/")) {
      return {
        ok: true,
        dados: { produto: "/api/v1/produto/51", cheio: "100.00" },
      };
    }
    if (caminho.startsWith("/produto_estoque/")) {
      return {
        ok: true,
        dados: { produto: "/api/v1/produto/51", gerenciado: true, quantidade: 4 },
      };
    }
    if (caminho === "/cliente/search") {
      return { ok: true, dados: { meta: {}, objects: [{ id: 71, nome: "Teste" }] } };
    }
    if (caminho.startsWith("/pedido/")) {
      return { ok: true, dados: { numero: 165, resource_uri: "/api/v1/pedido/165" } };
    }
    throw new Error(`Leitura nao simulada: ${caminho}`);
  },
};
const precosEstoque = criarPrecosEstoqueLojaIntegrada({ cliente: clienteLeitura });
await precosEstoque.obterPreco(51);
await precosEstoque.obterEstoque(51);
await criarClientesLojaIntegrada({ cliente: clienteLeitura }).buscarPorEmail(
  "cliente@example.com",
);
await criarPedidosLojaIntegrada({ cliente: clienteLeitura }).obter(165);
conferir(
  "servicos read-only usam os endpoints oficiais separados",
  leituras,
  [
    { caminho: "/produto_preco/51" },
    { caminho: "/produto_estoque/51" },
    {
      caminho: "/cliente/search",
      params: { cliente_email: "cliente@example.com" },
    },
    { caminho: "/pedido/165" },
  ],
);

console.log(
  falhas === 0
    ? "\nTodos os testes da Loja Integrada OK."
    : `\n${falhas} FALHA(S).`,
);
process.exit(falhas === 0 ? 0 : 1);
