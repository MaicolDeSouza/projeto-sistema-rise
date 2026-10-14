import "dotenv/config";

/**
 * Testes do Rise AI (Entrega 1): regras puras e gravacao no Postgres, SEM rede.
 *
 *   npm run teste:rise-ai
 *
 * Um bloco por tarefa do plano `docs/superpowers/plans/2026-10-11-rise-ai-entrega-1.md`. Os dados de teste levam
 * o prefixo `ZZ-IA-` e saem no `finally`; o teste nunca toca na `Conexao` de BLING, MERCADO_LIVRE, LOJA_INTEGRADA,
 * ANTHROPIC nem GEMINI (usa OLLAMA) e guarda/restaura a linha `unica` da ConfiguracaoIA e a Conexao OLLAMA.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");

// O laco do chat pede a cotacao do dia ao Banco Central (`garantirCotacaoDoDia`); teste nao fala com a internet, e a
// cotacao tem de ficar a fixa (as contas de custo dos blocos antigos assumem R$ 6,00). Quem testa a busca passa o seu `buscar`.
const fetchDeVerdade = globalThis.fetch;
globalThis.fetch = (entrada, ...resto) => {
  if (String(entrada?.url ?? entrada).includes("olinda.bcb.gov.br")) return Promise.reject(new Error("sem rede nos testes"));
  return fetchDeVerdade(entrada, ...resto);
};

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

/** O JSONB do Postgres devolve as chaves de um objeto em outra ordem (as curtas primeiro): compara sem depender dela. */
const ord = (valor) => (valor === undefined ? valor : JSON.parse(JSON.stringify(valor, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x))));

/** O que e do dono e os testes mexem: lido antes e devolvido no fim (a linha unica da configuracao e a Conexao OLLAMA). */
const guardados = {
  configuracao: await prisma.configuracaoIA.findUnique({ where: { id: "unica" } }),
  ollama: await prisma.conexao.findUnique({ where: { servico: "OLLAMA" } }),
  // A chave real da OpenAI do dono (cadastrada em 13/10/2026): o teste de chaves assume "sem Conexao", entao ela sai do
  // caminho e volta no fim.
  openai: await prisma.conexao.findUnique({ where: { servico: "OPENAI" } }),
  // As versoes dos dois prompts: as abas gravam em "interno" e "cliente", e o limite de 20 poderia apagar uma do dono.
  versoes: await prisma.versaoDePromptIA.findMany({ where: { canal: { in: ["interno", "cliente"] } } }),
};

async function devolverOQueEraDoDono() {
  if (guardados.configuracao) {
    const { id, ...resto } = guardados.configuracao;
    await prisma.configuracaoIA.upsert({ where: { id }, update: resto, create: guardados.configuracao });
  } else {
    await prisma.configuracaoIA.deleteMany({ where: { id: "unica" } });
  }
  if (guardados.ollama) {
    const { id, ...resto } = guardados.ollama;
    await prisma.conexao.upsert({ where: { servico: "OLLAMA" }, update: resto, create: guardados.ollama });
  } else {
    await prisma.conexao.deleteMany({ where: { servico: "OLLAMA" } });
  }
  if (guardados.openai) {
    const { id, ...resto } = guardados.openai;
    await prisma.conexao.upsert({ where: { servico: "OPENAI" }, update: resto, create: guardados.openai });
  }
  await prisma.versaoDePromptIA.deleteMany({ where: { canal: { in: ["interno", "cliente"] } } });
  if (guardados.versoes.length) await prisma.versaoDePromptIA.createMany({ data: guardados.versoes });
}

/** Apaga tudo o que os testes criam. Roda no comeco (resto de uma execucao que caiu) e no fim. */
async function limpar() {
  // Entrega A1: gasto, reservas e versoes de prompt de teste.
  // O gasto da pesquisa e a reserva do laco levam o id da CONVERSA (um cuid, sem o prefixo): sai pelo id das conversas de teste,
  // antes de elas serem apagadas, senao cada rodada deixaria uma linha de gasto de mentira no orcamento do dono.
  const conversasDeTeste = (await prisma.conversaIA.findMany({ where: { usuario: { startsWith: "ZZ-IA-" } }, select: { id: true } })).map((conversa) => conversa.id);
  await prisma.gastoIA.deleteMany({ where: { OR: [{ referencia: { startsWith: "ZZ-IA-" } }, { referencia: { in: conversasDeTeste } }] } });
  await prisma.reservaDeGastoIA.deleteMany({ where: { OR: [{ dono: { startsWith: "ZZ-IA-" } }, { dono: { in: conversasDeTeste } }] } });
  await prisma.versaoDePromptIA.deleteMany({ where: { canal: { startsWith: "zz-ia-" } } });
  await prisma.auditoriaDeAcesso.deleteMany({ where: { quem: { startsWith: "ZZ-IA-" } } });
  await prisma.conversaIA.deleteMany({ where: { usuario: { startsWith: "ZZ-IA-" } } });
  await prisma.conhecimentoIA.deleteMany({ where: { assunto: { startsWith: "ZZ-IA" } } });
  // A peca de um kit e RESTRICT: o kit sai antes (e a composicao dele), senao o produto da peca nao se apaga.
  await prisma.produtoComponente.deleteMany({ where: { kit: { sku: { startsWith: "ZZ-IA-" } } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-IA-" } } });
  await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: "ZZ-IA" } } });
  await prisma.logIntegracao.deleteMany({ where: { endpoint: "falso-1" } });
  // A reserva de fabrica (anthropic/claude-haiku-5-5) responde pelos provedores falsos e o laco registra a chamada como
  // se fosse real. Chamada de verdade a API leva centenas de ms; a dos falsos, 0 a poucos ms.
  await prisma.logIntegracao.deleteMany({ where: { servico: "ANTHROPIC", endpoint: "claude-haiku-5-5", duracaoMs: { lt: 50 }, requestResumo: { contains: '"tarefa":' } } });
}

// Resultados que um bloco entrega aos seguintes (as conversas da Tarefa 9 alimentam a Revisao da Tarefa 12).
const compartilhado = {};

try {
  await limpar();

  // -------------------------------------------------------------------------
  // Tarefa 1 — Banco
  // -------------------------------------------------------------------------
  console.log("\nBanco");
  const conversa = await prisma.conversaIA.create({ data: { titulo: "ZZ-IA teste", usuario: "ZZ-IA-TESTE" } });
  await prisma.mensagemIA.create({ data: { conversaId: conversa.id, papel: "USUARIO", conteudo: "oi", avisos: [] } });
  conferir("conversa com mensagem", await prisma.mensagemIA.count({ where: { conversaId: conversa.id } }), 1);
  conferir(
    "enum Servico tem LM_STUDIO",
    (await prisma.$queryRaw`SELECT 1 AS ok FROM pg_enum WHERE enumlabel = 'LM_STUDIO'`).length,
    1,
  );
  conferir(
    "indice de trigramas do conhecimento",
    (await prisma.$queryRaw`SELECT 1 AS ok FROM pg_indexes WHERE indexname = 'ConhecimentoIA_busca_trgm'`).length,
    1,
  );

  // -------------------------------------------------------------------------
  // Tarefa 2 — Modelos e custo
  // -------------------------------------------------------------------------
  {
    const { custoDaChamada, endpointPadrao, provedorPorId } = await import("../src/lib/riseAi/modelos.js");
    console.log("\nModelos e custo");
    conferir(
      "haiku 1000/1000",
      custoDaChamada({ provedor: "anthropic", modelo: "claude-haiku-5-5", tokensEntrada: 1000, tokensSaida: 1000 }),
      { usd: 0.0006, brl: 0.0036 },
    );
    conferir(
      "local custa zero",
      custoDaChamada({ provedor: "lmstudio", modelo: "qwen3-4b", tokensEntrada: 5000, tokensSaida: 500 }),
      { usd: 0, brl: 0 },
    );
    conferir(
      "modelo de API sem preco",
      custoDaChamada({ provedor: "openai", modelo: "gpt-x", tokensEntrada: 10, tokensSaida: 10 }),
      null,
    );
    conferir("endpoint do LM Studio na VPS", endpointPadrao("lmstudio", "vps"), "http://host.docker.internal:1234/v1");
    conferir("endpoint do LM Studio no PC", endpointPadrao("lmstudio", "pc"), "http://127.0.0.1:1234/v1");
    conferir("endpoint de API nao depende do ambiente", endpointPadrao("anthropic", "vps"), "https://api.anthropic.com");
    conferir("provedor desconhecido", provedorPorId("bard"), null);
  }

  // -------------------------------------------------------------------------
  // Tarefa 3 — Mascaramento de dados pessoais
  // -------------------------------------------------------------------------
  {
    const { mascararDadosPessoais } = await import("../src/lib/riseAi/mascarar.js");
    console.log("\nMascaramento");
    const m1 = mascararDadosPessoais(
      "Cliente João (54) 98899-0008, joao.silva@gmail.com, CPF 529.982.247-25 quer o 100101",
    );
    conferir("telefone, email e cpf, na ordem em que aparecem", m1.mascarados, ["telefone", "email", "documento"]);
    conferir(
      "texto mascarado",
      m1.texto.includes("(54) 9****-**08") &&
        m1.texto.includes("j***@***") &&
        m1.texto.includes("***.***.***-25") &&
        m1.texto.includes("100101") &&
        !m1.texto.includes("98899-0008") &&
        !m1.texto.includes("joao.silva") &&
        !m1.texto.includes("529.982"),
      true,
    );
    conferir("codigos de produto ficam", mascararDadosPessoais("ESP32 HC-SR04 121503_10z EAN 1208030000000").mascarados, []);
    conferir("+55 solto", mascararDadosPessoais("me chama no +55 54 98899-0008").mascarados, ["telefone"]);
    conferir("telefone so com digitos", mascararDadosPessoais("fone 54988990008").texto, "fone (54) 9****-**08");
    conferir("fixo", mascararDadosPessoais("fixo (54) 3333-4444").texto, "fixo (54) ****-**44");
    const cnpj = mascararDadosPessoais("CNPJ 11.222.333/0001-81");
    conferir("cnpj", [cnpj.mascarados, cnpj.texto], [["documento"], "CNPJ **.***.***/****-81"]);
    conferir("numero que nao e CPF nem telefone fica", mascararDadosPessoais("lote 111.111.111-11").mascarados, []);
    conferir("repetido aparece uma vez na lista", mascararDadosPessoais("a@b.com e c@d.com").mascarados, ["email"]);
    conferir(
      "sem nada",
      mascararDadosPessoais("qual arduino serve para ligar um LED?"),
      { texto: "qual arduino serve para ligar um LED?", mascarados: [] },
    );
  }

  // -------------------------------------------------------------------------
  // Tarefa 4 — Acesso, configuracao e chaves
  // -------------------------------------------------------------------------
  {
    const { configuracaoPadrao, validarConfiguracao, lerConfiguracao, gravarConfiguracao, lerChave, gravarChave, estadoDasChaves } =
      await import("../src/lib/riseAi/configuracao.js");
    const { criarLimitador } = await import("../src/lib/riseAi/limite.js");
    // Quem e administrador e o login da requisicao sairam daqui (acesso.js) para Acessos: o teste:acessos os cobre.
    console.log("\nConfiguracao");

    const padrao = configuracaoPadrao("pc");
    conferir(
      "padrao e reserva de fabrica",
      [padrao.padrao.provedor, padrao.reserva.provedor, padrao.reserva.modelo, padrao.tempoLimite.primeiroTokenMs, padrao.tempoLimite.totalMs],
      ["lmstudio", "anthropic", "claude-haiku-5-5", 45000, 180000],
    );
    conferir("a propria configuracao padrao e valida", validarConfiguracao(padrao).ok, true);
    conferir(
      "validacao recusa endpoint sem http",
      validarConfiguracao({ ...padrao, endpoints: { ...padrao.endpoints, lmstudio: "ftp://x" } }).ok,
      false,
    );
    conferir(
      "validacao recusa total menor que primeiro token",
      validarConfiguracao({ ...padrao, tempoLimite: { primeiroTokenMs: 60000, totalMs: 30000 } }).ok,
      false,
    );
    conferir(
      "validacao recusa provedor desconhecido na reserva",
      validarConfiguracao({ ...padrao, reserva: { provedor: "bard", modelo: "x" } }).ok,
      false,
    );
    conferir("reserva pode ser nula", validarConfiguracao({ ...padrao, reserva: null }).ok, true);
    conferir(
      "erro por campo",
      Object.keys(validarConfiguracao({ ...padrao, maxChamadasDeFerramenta: 99 }).erros ?? {}),
      ["maxChamadasDeFerramenta"],
    );

    // Configuracao gravada: o que NAO foi salvo continua vindo do padrao do ambiente.
    await prisma.configuracaoIA.deleteMany({ where: { id: "unica" } });
    conferir("sem linha, vale o padrao", (await lerConfiguracao("pc")).maxChamadasDeFerramenta, 8);
    const gravada = await gravarConfiguracao(
      { maxChamadasDeFerramenta: 5, endpoints: { lmstudio: "http://10.0.0.2:1234/v1" } },
      { usuario: "ZZ-IA-TESTE" },
    );
    conferir("gravou", gravada.ok, true);
    const lida = await lerConfiguracao("pc");
    conferir(
      "mescla raso + endpoints chave a chave",
      [lida.maxChamadasDeFerramenta, lida.endpoints.lmstudio, lida.endpoints.anthropic],
      [5, "http://10.0.0.2:1234/v1", "https://api.anthropic.com"],
    );
    conferir(
      "so o salvo e gravado (o endpoint do ambiente nao vira dado)",
      Object.keys((await prisma.configuracaoIA.findUnique({ where: { id: "unica" } })).dados).sort(),
      ["endpoints", "maxChamadasDeFerramenta"],
    );
    conferir("o padrao do VPS continua valendo no VPS", (await lerConfiguracao("vps")).endpoints.ollama, "http://host.docker.internal:11434/v1");
    conferir(
      "reserva nula gravada vale (nao volta ao padrao)",
      (await gravarConfiguracao({ reserva: null }, { usuario: "ZZ-IA-TESTE" })).ok && (await lerConfiguracao("pc")).reserva,
      null,
    );
    const recusada = await gravarConfiguracao({ maxTokensResposta: 10 }, { usuario: "ZZ-IA-TESTE" });
    conferir("gravar valor invalido e recusado e nada muda", [recusada.ok, (await lerConfiguracao("pc")).maxTokensResposta], [false, 1500]);

    // Chaves: Conexao cifrada, com o .env como reserva.
    await prisma.conexao.deleteMany({ where: { servico: "OPENAI" } });
    conferir("chave do env quando nao ha Conexao", await lerChave("openai", { OPENAI_API_KEY: "sk-env" }), "sk-env");
    conferir("sem chave nenhuma", await lerChave("openai", {}), null);
    conferir("provedor local nao tem chave", await lerChave("lmstudio", { LMSTUDIO: "x" }), null);
    await prisma.conexao.deleteMany({ where: { servico: "OLLAMA" } });
    await gravarChave("ollama", "chave-teste");
    conferir("chave gravada vence o env", await lerChave("ollama", {}), "chave-teste");
    const estado = await estadoDasChaves({ OPENAI_API_KEY: "sk-env" });
    conferir(
      "estado: cadastrada e origem",
      [estado.ollama.cadastrada, estado.ollama.origem, estado.openai.cadastrada, estado.openai.origem, estado.gemini.cadastrada],
      [true, "conexao", true, "env", false],
    );
    conferir("estado nao vaza a chave", JSON.stringify(estado).includes("chave-teste") || JSON.stringify(estado).includes("sk-env"), false);
    conferir("chave vazia e recusada", await gravarChave("ollama", "   ").then(() => "gravou", () => "recusou"), "recusou");

    const limitador = criarLimitador({ porMinuto: 2 });
    conferir(
      "limite por minuto",
      [limitador.permitir("a", 0), limitador.permitir("a", 1000), limitador.permitir("a", 2000), limitador.permitir("a", 61000), limitador.permitir("b", 2000)],
      [true, true, false, true, true],
    );
  }

  // -------------------------------------------------------------------------
  // Tarefa 5 — Contrato e adaptador compativel com OpenAI
  // -------------------------------------------------------------------------
  {
    const { ErroDoProvedor, erroDeStatus } = await import("../src/lib/riseAi/provedores/contrato.js");
    const { criarProvedorOpenAICompativel, mensagensParaOpenAI, ferramentasParaOpenAI } = await import(
      "../src/lib/riseAi/provedores/openaiCompativel.js"
    );
    const { criarProvedor } = await import("../src/lib/riseAi/provedores/index.js");
    const { provedorDisponivel, esquecerSaude } = await import("../src/lib/riseAi/provedores/saude.js");
    console.log("\nProvedor OpenAI-compativel");

    const sse = (...objetos) =>
      objetos.map((o) => `data: ${typeof o === "string" ? o : JSON.stringify(o)}\n\n`).join("") + "data: [DONE]\n\n";
    const corpoSSE = sse(
      { choices: [{ delta: { role: "assistant", content: "" } }] },
      { choices: [{ delta: { content: "Olá" } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "buscarProdutos", arguments: '{"ter' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'mos":"esp32"}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 12, completion_tokens: 7 } },
    );
    const fetchFalso = (pedidos, corpo, status = 200, cabecalhos = {}) => async (url, init = {}) => {
      pedidos.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null, signal: init.signal });
      return new Response(corpo, { status, headers: cabecalhos });
    };
    const provedorCom = (corpo, status = 200, cabecalhos = {}, pedidos = []) =>
      criarProvedorOpenAICompativel({ id: "lmstudio", rotulo: "LM Studio", endpoint: "http://falso:1234/v1", fetchImpl: fetchFalso(pedidos, corpo, status, cabecalhos) });
    const pedidoSimples = { modelo: "qwen3-4b", sistema: "S", mensagens: [{ papel: "usuario", conteudo: "oi" }], maxTokens: 50, aoTexto: () => {} };

    const pedidos = [];
    const provedor = provedorCom(corpoSSE, 200, {}, pedidos);
    const partes = [];
    const r = await provedor.conversar({
      ...pedidoSimples,
      maxTokens: 100,
      ferramentas: [{ nome: "buscarProdutos", descricao: "d", parametros: { type: "object", properties: {} } }],
      aoTexto: (delta) => partes.push(delta),
    });
    conferir("texto em fluxo (o delta vazio nao conta)", partes, ["Olá"]);
    conferir("chamada de ferramenta montada de dois pedacos", r.chamadasDeFerramenta, [{ id: "call_1", nome: "buscarProdutos", argumentos: { termos: "esp32" } }]);
    conferir("uso e parada", [r.uso, r.motivoParada, r.texto], [{ entrada: 12, saida: 7 }, "ferramenta", "Olá"]);
    conferir(
      "corpo do pedido",
      [pedidos[0].url, pedidos[0].method, pedidos[0].body.model, pedidos[0].body.tools[0].function.name, pedidos[0].body.stream, pedidos[0].body.max_tokens, pedidos[0].headers.Authorization],
      ["http://falso:1234/v1/chat/completions", "POST", "qwen3-4b", "buscarProdutos", true, 100, undefined],
    );
    {
      const p = [];
      await provedorCom(sse({ choices: [{ delta: { content: "x" }, finish_reason: "stop" }] }), 200, {}, p).conversar(pedidoSimples);
      conferir("sem ferramentas: nada de tools", ["tools" in p[0].body, "tool_choice" in p[0].body], [false, false]);
    }
    {
      const p = [];
      const comChave = criarProvedorOpenAICompativel({ id: "openai", rotulo: "OpenAI", endpoint: "https://api/v1", chave: "sk-x", fetchImpl: fetchFalso(p, sse({ choices: [{ delta: { content: "x" }, finish_reason: "stop" }] })) });
      await comChave.conversar(pedidoSimples);
      conferir("a chave vai no Authorization", p[0].headers.Authorization, "Bearer sk-x");
    }

    // Um pedaco de rede pode partir uma linha "data:" e ate um caractere acentuado ao meio.
    {
      const bytes = new TextEncoder().encode(sse({ choices: [{ delta: { content: "Olá!" }, finish_reason: "stop" }] }));
      const corte = bytes.indexOf(0xc3) + 1; // no meio do "á" (2 bytes)
      const fluxo = new ReadableStream({
        start(controle) {
          controle.enqueue(bytes.slice(0, corte));
          controle.enqueue(bytes.slice(corte));
          controle.close();
        },
      });
      const recebidos = [];
      const picado = await provedorCom(fluxo).conversar({ ...pedidoSimples, aoTexto: (d) => recebidos.push(d) });
      conferir("linha e acento partidos entre pedacos de rede", [recebidos.join(""), picado.texto, picado.motivoParada], ["Olá!", "Olá!", "fim"]);
    }

    conferir(
      "argumentos invalidos viram malformada, sem derrubar",
      (await provedorCom(sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c9", function: { name: "f", arguments: '{"termos": ' } }] }, finish_reason: "tool_calls" }] })).conversar(pedidoSimples)).chamadasDeFerramenta,
      [{ id: "c9", nome: "f", argumentos: {}, malformada: true, bruto: '{"termos": ' }],
    );
    conferir(
      "chamada sem argumentos e sem id",
      (await provedorCom(sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "consultarEstoque" } }] }, finish_reason: "tool_calls" }] })).conversar(pedidoSimples)).chamadasDeFerramenta,
      [{ id: "chamada_0", nome: "consultarEstoque", argumentos: {} }],
    );
    const semUso = await provedorCom(sse({ choices: [{ delta: { content: "resposta curta" }, finish_reason: "length" }] })).conversar(pedidoSimples);
    conferir("sem usage: estimado por caracteres / 4", [semUso.uso.estimado, semUso.uso.saida, semUso.motivoParada], [true, Math.ceil("resposta curta".length / 4), "max_tokens"]);
    conferir(
      "content_filter vira recusa",
      (await provedorCom(sse({ choices: [{ delta: {}, finish_reason: "content_filter" }] })).conversar(pedidoSimples)).motivoParada,
      "recusa",
    );
    {
      const completo = JSON.stringify({
        model: "qwen3-4b",
        choices: [{ message: { content: "Oi", tool_calls: [{ id: "t1", function: { name: "f", arguments: '{"a":1}' } }] }, finish_reason: "tool_calls" }],
        usage: { prompt_tokens: 3, completion_tokens: 2 },
      });
      const deltas = [];
      const naoFluxo = await provedorCom(completo, 200, { "content-type": "application/json" }).conversar({ ...pedidoSimples, aoTexto: (d) => deltas.push(d) });
      conferir(
        "servidor que ignora stream e devolve o JSON inteiro",
        [deltas, naoFluxo.texto, naoFluxo.chamadasDeFerramenta, naoFluxo.uso],
        [["Oi"], "Oi", [{ id: "t1", nome: "f", argumentos: { a: 1 } }], { entrada: 3, saida: 2 }],
      );
    }

    // Erros por tipo (o laço da conversa decide a reserva por `tipo`).
    const tipoDe = async (promessa) => promessa.then(() => "nao lancou", (erro) => [erro instanceof ErroDoProvedor, erro.tipo, erro.status ?? null]);
    conferir("401 vira autenticacao", await tipoDe(provedorCom("", 401).conversar(pedidoSimples)), [true, "autenticacao", 401]);
    conferir("429 vira limite", await tipoDe(provedorCom("", 429).conversar(pedidoSimples)), [true, "limite", 429]);
    conferir("500 vira resposta, com o status", await tipoDe(provedorCom("boom", 500).conversar(pedidoSimples)), [true, "resposta", 500]);
    conferir(
      "fetch que lanca vira conexao",
      await tipoDe(criarProvedorOpenAICompativel({ id: "lmstudio", endpoint: "http://x", fetchImpl: async () => { throw new TypeError("ECONNREFUSED"); } }).conversar(pedidoSimples)),
      [true, "conexao", null],
    );
    conferir(
      "AbortError vira tempo",
      await tipoDe(criarProvedorOpenAICompativel({ id: "lmstudio", endpoint: "http://x", fetchImpl: async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); } }).conversar(pedidoSimples)),
      [true, "tempo", null],
    );
    conferir("erroDeStatus: mensagem cita o status", erroDeStatus(503, "indisponivel").message.includes("503"), true);

    // Conversores puros.
    conferir(
      "mensagem de ferramenta vira role tool",
      mensagensParaOpenAI("S", [{ papel: "ferramenta", chamadaId: "c1", nome: "x", conteudo: "{}" }])[1],
      { role: "tool", tool_call_id: "c1", content: "{}" },
    );
    conferir(
      "assistente com chamadas vira tool_calls com arguments em string",
      mensagensParaOpenAI("S", [{ papel: "assistente", conteudo: "", chamadas: [{ id: "a1", nome: "f", argumentos: { k: 1 } }] }])[1],
      { role: "assistant", content: "", tool_calls: [{ id: "a1", type: "function", function: { name: "f", arguments: '{"k":1}' } }] },
    );
    conferir("o sistema abre a lista", mensagensParaOpenAI("SISTEMA", [])[0], { role: "system", content: "SISTEMA" });
    conferir(
      "ferramenta no formato function",
      ferramentasParaOpenAI([{ nome: "f", descricao: "d", parametros: { type: "object" } }]),
      [{ type: "function", function: { name: "f", description: "d", parameters: { type: "object" } } }],
    );

    // listarModelos e testar nunca lancam no testar.
    const listado = await provedorCom(JSON.stringify({ data: [{ id: "qwen3-4b" }, { id: "gemma-3" }] })).listarModelos();
    conferir("listar modelos", listado, [{ id: "qwen3-4b", nome: "qwen3-4b" }, { id: "gemma-3", nome: "gemma-3" }]);
    const teste = await provedorCom(JSON.stringify({ data: [{ id: "qwen3-4b" }] })).testar();
    conferir("testar ok", [teste.ok, teste.modelos.length, typeof teste.latenciaMs, teste.erro], [true, 1, "number", null]);
    const testeRuim = await provedorCom("", 401).testar();
    conferir("testar com erro nao lanca", [testeRuim.ok, testeRuim.modelos, typeof testeRuim.erro], [false, [], "string"]);

    // Fabrica.
    conferir("fabrica cria o compativel", criarProvedor("lmstudio", { endpoint: "http://x" }).id, "lmstudio");
    conferir("fabrica: id desconhecido lanca", (() => { try { criarProvedor("bard", {}); return "criou"; } catch { return "lancou"; } })(), "lancou");

    // Saude com cache.
    esquecerSaude();
    let chamadasDeListar = 0;
    const provedorQueFalha = { id: "lmstudio", listarModelos: async () => { chamadasDeListar++; throw new Error("x"); } };
    conferir(
      "saude com cache de 60 s",
      [await provedorDisponivel(provedorQueFalha, { agora: 0 }), await provedorDisponivel(provedorQueFalha, { agora: 1000 }), chamadasDeListar],
      [false, false, 1],
    );
    conferir("passado o cache, consulta de novo", [await provedorDisponivel(provedorQueFalha, { agora: 61000 }), chamadasDeListar], [false, 2]);
    esquecerSaude();
    conferir("provedor de pe", await provedorDisponivel({ id: "ollama", listarModelos: async () => [{ id: "a" }] }, { agora: 0 }), true);
  }

  // -------------------------------------------------------------------------
  // Tarefa 6 — Adaptador Anthropic
  // -------------------------------------------------------------------------
  {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const { criarProvedorAnthropic } = await import("../src/lib/riseAi/provedores/anthropic.js");
    const { criarProvedor } = await import("../src/lib/riseAi/provedores/index.js");
    console.log("\nProvedor Anthropic");

    const conteudoDaResposta = [
      { type: "thinking", thinking: "", signature: "assinatura-opaca" },
      { type: "text", text: "Olá" },
      { type: "tool_use", id: "tu1", name: "consultarPreco", input: { skus: ["100101"] } },
    ];
    const clienteFalso = {
      ultimoParams: null,
      ultimasOpcoes: null,
      resposta: { content: conteudoDaResposta, stop_reason: "tool_use", usage: { input_tokens: 20, output_tokens: 9 }, model: "claude-haiku-5-5" },
      erro: null,
      messages: {
        stream(params, opcoes) {
          clienteFalso.ultimoParams = params;
          clienteFalso.ultimasOpcoes = opcoes;
          return {
            on(evento, ouvinte) {
              if (evento === "text") ouvinte("Olá");
              return this;
            },
            finalMessage: async () => {
              if (clienteFalso.erro) throw clienteFalso.erro;
              return clienteFalso.resposta;
            },
          };
        },
      },
      models: { list: async () => ({ data: [{ id: "claude-haiku-5-5" }, { id: "claude-opus-5-5" }, { id: "outro-modelo" }] }) },
    };

    const provedorA = criarProvedorAnthropic({ chave: "x", cliente: clienteFalso });
    const deltas = [];
    const controle = new AbortController();
    const resposta = await provedorA.conversar({
      modelo: "claude-haiku-5-5",
      sistema: "S",
      mensagens: [
        { papel: "usuario", conteudo: "oi" },
        { papel: "assistente", conteudo: "", chamadas: [{ id: "a1", nome: "f", argumentos: { k: 1 } }, { id: "a2", nome: "g", argumentos: {} }] },
        { papel: "ferramenta", chamadaId: "a1", nome: "f", conteudo: "{}" },
        { papel: "ferramenta", chamadaId: "a2", nome: "g", conteudo: '{"ok":true}' },
      ],
      ferramentas: [{ nome: "f", descricao: "d", parametros: { type: "object", properties: {} } }],
      maxTokens: 50,
      sinal: controle.signal,
      aoTexto: (delta) => deltas.push(delta),
    });
    conferir(
      "chamada convertida",
      [resposta.texto, resposta.chamadasDeFerramenta, resposta.motivoParada, resposta.uso, resposta.modelo],
      ["Olá", [{ id: "tu1", nome: "consultarPreco", argumentos: { skus: ["100101"] } }], "ferramenta", { entrada: 20, saida: 9 }, "claude-haiku-5-5"],
    );
    conferir("texto em fluxo", deltas, ["Olá"]);
    conferir("os blocos como a API os devolveu ficam em `bruto` (o pensamento inclusive)", resposta.bruto, conteudoDaResposta);
    conferir(
      "parametros do pedido",
      [clienteFalso.ultimoParams.model, clienteFalso.ultimoParams.max_tokens, clienteFalso.ultimoParams.system, clienteFalso.ultimoParams.output_config, clienteFalso.ultimoParams.tools],
      ["claude-haiku-5-5", 50, "S", { effort: "low" }, [{ name: "f", description: "d", input_schema: { type: "object", properties: {} } }]],
    );
    conferir("o sinal de cancelamento vai ao SDK", clienteFalso.ultimasOpcoes.signal === controle.signal, true);
    conferir(
      "assistente reconstruido: texto (se houver) + tool_use",
      clienteFalso.ultimoParams.messages[1],
      { role: "assistant", content: [{ type: "tool_use", id: "a1", name: "f", input: { k: 1 } }, { type: "tool_use", id: "a2", name: "g", input: {} }] },
    );
    conferir(
      "resultados de ferramenta seguidos num user so",
      clienteFalso.ultimoParams.messages[2],
      { role: "user", content: [{ type: "tool_result", tool_use_id: "a1", content: "{}" }, { type: "tool_result", tool_use_id: "a2", content: '{"ok":true}' }] },
    );
    conferir("so 3 mensagens: nada sobrou", clienteFalso.ultimoParams.messages.length, 3);

    // Dentro do laço de ferramentas o assistente volta com os blocos EXATOS da API (thinking tem assinatura).
    await provedorA.conversar({
      modelo: "claude-haiku-5-5",
      sistema: "S",
      mensagens: [
        { papel: "usuario", conteudo: "oi" },
        { papel: "assistente", conteudo: "Olá", chamadas: [{ id: "tu1", nome: "consultarPreco", argumentos: { skus: ["100101"] } }], bruto: conteudoDaResposta },
        { papel: "ferramenta", chamadaId: "tu1", nome: "consultarPreco", conteudo: "[]" },
      ],
      maxTokens: 50,
    });
    conferir("com `bruto`, o assistente volta como a API devolveu", clienteFalso.ultimoParams.messages[1], { role: "assistant", content: conteudoDaResposta });
    conferir("sem ferramentas, o pedido nao leva `tools`", "tools" in clienteFalso.ultimoParams, false);

    // Paradas.
    const paradaDe = async (motivo) => {
      clienteFalso.resposta = { content: [{ type: "text", text: "x" }], stop_reason: motivo, usage: { input_tokens: 1, output_tokens: 1 }, model: "m" };
      return (await provedorA.conversar({ modelo: "m", sistema: "S", mensagens: [{ papel: "usuario", conteudo: "oi" }], maxTokens: 5 })).motivoParada;
    };
    conferir("paradas", [await paradaDe("end_turn"), await paradaDe("max_tokens"), await paradaDe("refusal"), await paradaDe("pause_turn")], ["fim", "max_tokens", "recusa", "outro"]);

    // Erros do SDK viram `tipo`.
    const tipoDoErro = async (erro) => {
      clienteFalso.erro = erro;
      const resultado = await provedorA
        .conversar({ modelo: "m", sistema: "S", mensagens: [{ papel: "usuario", conteudo: "oi" }], maxTokens: 5 })
        .then(() => "nao lancou", (e) => [e.name, e.tipo, e.status ?? null]);
      clienteFalso.erro = null;
      return resultado;
    };
    conferir("401 -> autenticacao", await tipoDoErro(Anthropic.APIError.generate(401, { error: { message: "x" } }, "recusada", new Headers())), ["ErroDoProvedor", "autenticacao", 401]);
    conferir("429 -> limite", await tipoDoErro(Anthropic.APIError.generate(429, { error: { message: "x" } }, "limite", new Headers())), ["ErroDoProvedor", "limite", 429]);
    conferir("500 -> resposta, com o status", await tipoDoErro(Anthropic.APIError.generate(500, {}, "boom", new Headers())), ["ErroDoProvedor", "resposta", 500]);
    conferir("conexao", await tipoDoErro(new Anthropic.APIConnectionError({ message: "caiu" })), ["ErroDoProvedor", "conexao", null]);
    conferir("tempo do SDK", await tipoDoErro(new Anthropic.APIConnectionTimeoutError()), ["ErroDoProvedor", "tempo", null]);
    conferir("cancelado pelo laco (sinal) tambem e tempo", await tipoDoErro(new Anthropic.APIUserAbortError()), ["ErroDoProvedor", "tempo", null]);

    // Modelos e teste de conexao.
    conferir(
      "listar modelos: so claude-, mais os sugeridos, sem repetir",
      (await provedorA.listarModelos()).map((m) => m.id),
      ["claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5"],
    );
    const testeA = await provedorA.testar();
    conferir("testar ok", [testeA.ok, testeA.modelos.length, testeA.erro], [true, 3, null]);
    clienteFalso.models.list = async () => { throw Anthropic.APIError.generate(401, {}, "chave ruim", new Headers()); };
    const testeRuimA = await provedorA.testar();
    conferir("testar com erro nao lanca", [testeRuimA.ok, testeRuimA.modelos, typeof testeRuimA.erro], [false, [], "string"]);

    // Fabrica: a Anthropic agora e criada pelo mesmo ponto.
    conferir("fabrica cria o adaptador da Anthropic", criarProvedor("anthropic", { chave: "x", cliente: clienteFalso }).id, "anthropic");
    conferir("sem chave nem cliente a fabrica avisa", (() => { try { criarProvedor("anthropic", {}); return "criou"; } catch (e) { return e.message; } })(), "Anthropic: cadastre a chave em Configurações (ou ANTHROPIC_API_KEY no .env).");
  }

  // -------------------------------------------------------------------------
  // Tarefa 7 — Busca no catalogo e ferramentas de produto
  // -------------------------------------------------------------------------
  {
    const { indiceDePalavras, notasDeRelevancia } = await import("../src/lib/texto.js");
    const { buscarProdutosNoCatalogo, buscarProdutosParecidos, cartaoDoProduto, fichaResumo } = await import("../src/lib/riseAi/busca.js");
    const { definicoesParaProvedor, executarFerramenta } = await import("../src/lib/riseAi/ferramentas/index.js");
    console.log("\nBusca e ferramentas de produto");

    // A conta de relevancia (extraida da lupa): a fracao do peso do termo que o item tem.
    const formas = ["placa uno ch340", "placa nano ch340", "case uno"].map((titulo) => indiceDePalavras(titulo));
    const { notas } = notasDeRelevancia(["uno", "ch340"], formas);
    conferir("relevancia: o item com tudo vence", [notas[0], notas[0] > notas[1], notas[0] > notas[2], notas[1] > 0 && notas[1] < 1], [1, true, true, true]);
    conferir("relevancia sem palavras: tudo zero", notasDeRelevancia([], formas).notas, [0, 0, 0]);

    const base = { ativo: true, conferido: true };
    const uno = await prisma.produto.create({
      data: {
        ...base,
        sku: "ZZ-IA-UNO",
        tituloBase: "PLACA ZZIA UNO R3 CH340",
        marca: "ZZIA",
        modelo: "UNO R3",
        precoVenda: 38.9,
        custo: 20,
        estoque: 12,
        localizacao: "R14",
        urlLojaIntegrada: "https://www.4hobby.com.br/placa-zzia-uno",
        blingSaldoLidoEm: new Date(Date.now() - 20 * 60 * 1000),
        descricaoBase: "PLACA ZZIA UNO R3\nCodigo interno: zzxia9\nEspecificações técnicas:\n- Tensão: 5V;\n- Microcontrolador: ATmega328P;",
      },
    });
    await prisma.produto.create({
      data: { ...base, sku: "ZZ-IA-NANO", tituloBase: "PLACA ZZIA NANO V3 CH340", ean: "7890000000017", precoVenda: 29.9, estoque: 0, descricaoBase: "Especificações técnicas:\n- Tensão: 5V;" },
    });
    await prisma.produto.create({
      data: { ...base, sku: "ZZ-IA-ESP32", tituloBase: "ZZIA ESP32 DEVKIT V1 WIFI", precoVenda: 42.9, estoque: 8, descricaoBase: "Especificações técnicas:\n- Tensão: 5V;\n- Wi-Fi: 2.4GHz;" },
    });
    await prisma.produto.create({ data: { ...base, ativo: false, sku: "ZZ-IA-INATIVO", tituloBase: "PLACA ZZIA INATIVA CH340", precoVenda: 10, estoque: 3 } });

    const skus = (r) => r.produtos.map((p) => p.sku);
    conferir("busca por codigo", [skus(await buscarProdutosNoCatalogo("ZZ-IA-UNO")), (await buscarProdutosNoCatalogo("ZZ-IA-UNO")).origem], [["ZZ-IA-UNO"], "codigo"]);
    conferir("busca por EAN", skus(await buscarProdutosNoCatalogo("7890000000017")), ["ZZ-IA-NANO"]);
    conferir("busca por palavras ordena o mais parecido", skus(await buscarProdutosNoCatalogo("placa zzia uno ch340")), ["ZZ-IA-UNO"]);
    conferir("a origem da busca por palavras", (await buscarProdutosNoCatalogo("placa zzia uno ch340")).origem, "palavras");
    conferir("palavra vazia (para, com) nao atrapalha", skus(await buscarProdutosNoCatalogo("placa para zzia com uno")), ["ZZ-IA-UNO"]);
    conferir("com estoque primeiro quando a relevancia empata", skus(await buscarProdutosNoCatalogo("placa zzia ch340")), ["ZZ-IA-UNO", "ZZ-IA-NANO"]);
    conferir("so com estoque", skus(await buscarProdutosNoCatalogo("placa zzia ch340", { apenasComEstoque: true })), ["ZZ-IA-UNO"]);
    conferir("preco maximo", skus(await buscarProdutosNoCatalogo("placa zzia ch340", { precoMaximo: 30 })), ["ZZ-IA-NANO"]);
    conferir("produto inativo nao aparece", skus(await buscarProdutosNoCatalogo("placa zzia inativa")), []);
    conferir("achado so na descricao: busca ampla", [skus(await buscarProdutosNoCatalogo("zzxia9")), (await buscarProdutosNoCatalogo("zzxia9")).origem], [["ZZ-IA-UNO"], "ampla"]);
    conferir("nada achado: lista vazia e origem nenhuma", [await buscarProdutosNoCatalogo("zzqq nenhum produto assim")].map((r) => [r.produtos, r.origem])[0], [[], "nenhuma"]);
    conferir("perfil publico so ve quem esta na loja", skus(await buscarProdutosNoCatalogo("placa zzia ch340", { perfil: "publico" })), ["ZZ-IA-UNO"]);
    conferir("limite", (await buscarProdutosNoCatalogo("zzia", { limite: 2 })).produtos.length, 2);
    conferir("parecidos ao Uno: o Nano entra, o proprio Uno nao", (await buscarProdutosParecidos(uno)).map((p) => p.sku).filter((s) => s.startsWith("ZZ-IA-")), ["ZZ-IA-NANO"]);

    conferir("ficha resumida da descricao", fichaResumo("Especificações técnicas:\n- Tensão: 5V;\n- Wi-Fi: 2.4GHz;"), "Tensão: 5V; Wi-Fi: 2.4GHz");
    conferir("ficha sem especificacoes", fichaResumo("Placa muito boa"), "");
    conferir("ficha cortada em 600 caracteres", fichaResumo(Array.from({ length: 80 }, (_, i) => `- Item ${i}: valor numero ${i};`).join("\n")).length <= 600, true);

    const cartaoAdmin = cartaoDoProduto(uno, { perfil: "admin" });
    conferir(
      "cartao do admin",
      [cartaoAdmin.sku, cartaoAdmin.nome, cartaoAdmin.preco, cartaoAdmin.estoque, cartaoAdmin.temNaLoja, cartaoAdmin.urlLoja, cartaoAdmin.urlRise, cartaoAdmin.custo, cartaoAdmin.localizacao],
      ["ZZ-IA-UNO", "PLACA ZZIA UNO R3 CH340", 38.9, 12, true, "https://www.4hobby.com.br/placa-zzia-uno", `/produtos/${uno.id}`, 20, "R14"],
    );
    conferir("estoque lido do Bling e texto simples (JSON)", [typeof cartaoAdmin.estoqueLidoEm, cartaoAdmin.fichaResumo], ["string", "Tensão: 5V; Microcontrolador: ATmega328P"]);
    conferir("cartao publico sem custo nem localizacao", ["custo" in cartaoDoProduto(uno, { perfil: "publico" }), "localizacao" in cartaoDoProduto(uno, { perfil: "publico" })], [false, false]);

    // Ferramentas
    const defs = definicoesParaProvedor("admin");
    conferir(
      "ferramentas de produto para admin",
      defs.map((d) => d.nome).filter((nome) => nome !== "buscarConhecimento").sort(),
      ["buscarProdutos", "buscarProdutosSimilares", "compararProdutos", "consultarEstoque", "consultarPreco", "consultarProduto"],
    );
    conferir("o schema vai sem $schema, como objeto, com termos obrigatorio", [defs.every((d) => d.parametros.type === "object" && !("$schema" in d.parametros)), defs.find((d) => d.nome === "buscarProdutos").parametros.required], [true, ["termos"]]);
    conferir("publico recebe so as ferramentas seguras (sem estoque numerico)", definicoesParaProvedor("publico").map((d) => d.nome).sort(), ["buscarConhecimento", "buscarProdutos", "buscarProdutosSimilares", "compararProdutos", "consultarPreco", "consultarProduto"]);

    const executar = (nome, args, contexto = { perfil: "admin" }) => executarFerramenta(nome, args, contexto);
    conferir("zod recusa argumento invalido", (await executar("consultarProduto", { sku: "x".repeat(500) })).ok, false);
    conferir("zod recusa limite fora da faixa", (await executar("buscarProdutos", { termos: "zzia", limite: 50 })).ok, false);
    conferir("ferramenta inexistente", (await executar("apagarTudo", {})).ok, false);
    conferir("perfil sem permissao", (await executar("consultarEstoque", { skus: ["ZZ-IA-UNO"] }, { perfil: "publico" })).ok, false);
    const achados = await executar("buscarProdutos", { termos: "placa zzia ch340", apenasComEstoque: true });
    conferir("buscarProdutos devolve cartoes sem custo", [achados.ok, achados.resultado.map((p) => p.sku), "custo" in achados.resultado[0], typeof achados.duracaoMs], [true, ["ZZ-IA-UNO"], false, "number"]);
    conferir("buscarProdutos sem resultado e lista vazia", (await executar("buscarProdutos", { termos: "zzqq nenhum produto assim" })).resultado, []);

    const completo = (await executar("consultarProduto", { sku: "ZZ-IA-UNO" })).resultado;
    conferir(
      "consultarProduto: ficha, custo e descricao",
      [completo.sku, completo.custo, completo.ficha, completo.descricao.includes("zzxia9"), completo.fotos, completo.kit],
      ["ZZ-IA-UNO", 20, [{ nome: "Tensão", valor: "5V" }, { nome: "Microcontrolador", valor: "ATmega328P" }], true, 0, []],
    );
    conferir("consultarProduto: codigo inexistente", (await executar("consultarProduto", { sku: "ZZ-IA-NAO-EXISTE" })).ok, false);
    conferir("consultarProduto ignora a caixa do codigo", (await executar("consultarProduto", { sku: "zz-ia-uno" })).resultado?.sku, "ZZ-IA-UNO");
    conferir("consultarEstoque", (await executar("consultarEstoque", { skus: ["ZZ-IA-UNO", "ZZ-IA-NANO"] })).resultado.map((l) => l.estoque), [12, 0]);
    conferir("consultarEstoque: quando foi lido", typeof (await executar("consultarEstoque", { skus: ["ZZ-IA-UNO"] })).resultado[0].estoqueLidoEm, "string");
    conferir("consultarEstoque: codigo que nao existe", (await executar("consultarEstoque", { skus: ["ZZ-IA-X"] })).resultado, [{ sku: "ZZ-IA-X", encontrado: false }]);
    conferir("consultarPreco", (await executar("consultarPreco", { skus: ["ZZ-IA-UNO", "ZZ-IA-NANO"] })).resultado, [{ sku: "ZZ-IA-UNO", precoVenda: 38.9 }, { sku: "ZZ-IA-NANO", precoVenda: 29.9 }]);
    const comparados = (await executar("compararProdutos", { skus: ["ZZ-IA-UNO", "ZZ-IA-ESP32"] })).resultado;
    conferir(
      "compararProdutos alinha a ficha pelo nome da caracteristica",
      [comparados.caracteristicas.find((c) => c.nome === "Tensão").valores, comparados.caracteristicas.find((c) => c.nome === "Wi-Fi").valores],
      [{ "ZZ-IA-UNO": "5V", "ZZ-IA-ESP32": "5V" }, { "ZZ-IA-UNO": null, "ZZ-IA-ESP32": "2.4GHz" }],
    );
    conferir("compararProdutos pede pelo menos 2", (await executar("compararProdutos", { skus: ["ZZ-IA-UNO"] })).ok, false);
    conferir("similares pela ferramenta", (await executar("buscarProdutosSimilares", { sku: "ZZ-IA-UNO" })).resultado.map((p) => p.sku).filter((s) => s.startsWith("ZZ-IA-")), ["ZZ-IA-NANO"]);

    // Acessos (lancamento 1, Tarefa 9): as ferramentas seguem os dados sensiveis da pessoa. "Se ve custo na tela, ve
    // custo no chat"; sem a permissao, o campo vem marcado como restrito (o modelo sabe o que dizer).
    const negando = (...ids) => ({ perfil: "admin", usuario: "ZZ-IA-T9", pode: (id) => !ids.includes(id) });
    const semCusto = (await executar("consultarProduto", { sku: "ZZ-IA-UNO" }, negando("dado.custo"))).resultado;
    conferir("sem dado.custo: custo e fornecedores restritos, o preco fica", [semCusto.custo, semCusto.fornecedores, typeof semCusto.preco, Array.isArray(semCusto.concorrentes)], ["[restrito]", "[restrito]", "number", true]);
    const semOutros = (await executar("consultarProduto", { sku: "ZZ-IA-UNO" }, negando("dado.localizacao", "dado.concorrentes"))).resultado;
    conferir("sem localizacao e concorrentes: os dois restritos, o custo fica", [semOutros.localizacao, semOutros.concorrentes, typeof semOutros.custo], ["[restrito]", "[restrito]", "number"]);
    const semQuantidade = (await executar("consultarEstoque", { skus: ["ZZ-IA-UNO", "ZZ-IA-NANO"] }, negando("dado.estoqueExato"))).resultado;
    conferir("sem estoque exato: so a faixa, e o saldo do Bling restrito", semQuantidade.map((linha) => [linha.estoque, linha.blingSaldo]), [["disponível", "[restrito]"], ["em falta", "[restrito]"]]);
    const buscaSemQuantidade = (await executar("buscarProdutos", { termos: "zzia nano" }, negando("dado.estoqueExato"))).resultado;
    conferir("buscar sem estoque exato tambem devolve a faixa", buscaSemQuantidade.filter((p) => p.sku === "ZZ-IA-NANO").map((p) => p.estoque), ["em falta"]);
    const busca = await import("../src/lib/riseAi/busca.js");
    conferir("faixa de estoque", [0, -2, 1, 3, 4, null].map((n) => busca.faixaDeEstoque?.(n)), ["em falta", "em falta", "poucas unidades", "poucas unidades", "disponível", "em falta"]);
    conferir("cartao sem pode: como antes (numero)", typeof busca.cartaoDoProduto({ sku: "X", id: "x", tituloBase: "X", estoque: 2 }).estoque, "number");
  }

  // -------------------------------------------------------------------------
  // Tarefa 8 — Conhecimento aprovado
  // -------------------------------------------------------------------------
  {
    const { criarConhecimento, aprovarConhecimento, rejeitarConhecimento, editarConhecimento, listarConhecimento, recuperarConhecimento, textoDoConhecimentoParaPrompt } =
      await import("../src/lib/riseAi/conhecimento.js");
    const { definicoesParaProvedor, executarFerramenta } = await import("../src/lib/riseAi/ferramentas/index.js");
    console.log("\nConhecimento");

    // O banco do dono vai ter notas de verdade: so as `ZZ-IA` interessam nas conferencias.
    const deTeste = (notas) => notas.filter((nota) => nota.assunto.startsWith("ZZ-IA"));
    const ids = (notas) => deTeste(notas).map((nota) => nota.id);

    const aprovada = await criarConhecimento({
      assunto: "ZZ-IA Nano x Uno para iniciante",
      conteudo: "Projeto simples (LED, botão): indicar Nano ou Uno; Mega só com muitos pinos.",
      produtos: ["zz-ia-uno", "ZZ-IA-NANO", "ZZ-IA-UNO", "  "],
      status: "APROVADO",
      criadoPor: "ZZ-IA-TESTE",
      aprovadoPor: "ZZ-IA-TESTE",
    });
    const rascunho = await criarConhecimento({ assunto: "ZZ-IA rascunho", conteudo: "arduino para iniciante usa Mega", criadoPor: "ZZ-IA-TESTE" });
    conferir(
      "criada aprovada: quem e quando; produtos sem repetir, em maiusculas",
      [aprovada.status, aprovada.aprovadoPor, aprovada.aprovadoEm instanceof Date, aprovada.produtos, aprovada.visibilidade, aprovada.versao],
      ["APROVADO", "ZZ-IA-TESTE", true, ["ZZ-IA-UNO", "ZZ-IA-NANO"], "ADMIN", 1],
    );
    conferir("o rascunho nasce RASCUNHO", [rascunho.status, rascunho.aprovadoPor], ["RASCUNHO", null]);

    const pergunta = "qual arduino serve para iniciante acender um led?";
    conferir("so aprovado entra", ids(await recuperarConhecimento({ texto: pergunta })), [aprovada.id]);
    conferir("recupera sem acento tambem", ids(await recuperarConhecimento({ texto: "qual arduino serve para iniciante, so acender um led com botao" })), [aprovada.id]);
    conferir("pergunta sem relacao nao traz a nota", ids(await recuperarConhecimento({ texto: "fonte chaveada 12v 5a bivolt para fita" })), []);
    conferir("nota ligada ao produto entra mesmo sem palavra em comum", ids(await recuperarConhecimento({ texto: "zzzzqx", skus: ["zz-ia-uno"] })), [aprovada.id]);
    conferir("publico nao ve nota ADMIN", ids(await recuperarConhecimento({ texto: pergunta, perfil: "publico" })), []);
    conferir("teto de caracteres", ids(await recuperarConhecimento({ texto: pergunta, maxCaracteres: 10 })), []);
    conferir("limite de notas", (await recuperarConhecimento({ texto: pergunta, skus: ["ZZ-IA-UNO"], limite: 1 })).length <= 1, true);
    const notas = await recuperarConhecimento({ texto: pergunta });
    const texto = textoDoConhecimentoParaPrompt(deTeste(notas));
    conferir(
      "texto para o prompt",
      [texto.startsWith("Conhecimento aprovado pela loja"), texto.includes("[ZZ-IA Nano x Uno para iniciante]"), texto.includes("ZZ-IA-UNO, ZZ-IA-NANO")],
      [true, true, true],
    );
    conferir("sem notas, sem texto", textoDoConhecimentoParaPrompt([]), "");

    // Vida da nota: aprovar, editar, rejeitar.
    const virouAprovada = await aprovarConhecimento(rascunho.id, { usuario: "ZZ-IA-DONO" });
    conferir("aprovar: quem aprovou e quando", [virouAprovada.status, virouAprovada.aprovadoPor, virouAprovada.aprovadoEm instanceof Date], ["APROVADO", "ZZ-IA-DONO", true]);
    conferir("aprovada, passa a ser recuperada", ids(await recuperarConhecimento({ texto: "arduino para iniciante usa Mega" })).includes(rascunho.id), true);
    const editada = await editarConhecimento(rascunho.id, { conteudo: "arduino para iniciante: indicar Uno ou Nano", categoria: "arduino" }, { usuario: "ZZ-IA-OUTRO" });
    conferir("editar sobe a versao e o editor passa a ser quem aprova", [editada.versao, editada.conteudo, editada.categoria, editada.status, editada.aprovadoPor], [2, "arduino para iniciante: indicar Uno ou Nano", "arduino", "APROVADO", "ZZ-IA-OUTRO"]);
    const rejeitada = await rejeitarConhecimento(rascunho.id);
    conferir("rejeitar tira a aprovacao", [rejeitada.status, rejeitada.aprovadoPor, rejeitada.aprovadoEm], ["REJEITADO", null, null]);
    conferir("rejeitada nao e recuperada", ids(await recuperarConhecimento({ texto: "arduino para iniciante" })).includes(rascunho.id), false);
    conferir("nota que nao existe", await aprovarConhecimento("nao-existe", { usuario: "x" }).then(() => "aprovou", () => "recusou"), "recusou");

    // Validacao do que se grava.
    const recusa = (dados) => criarConhecimento({ criadoPor: "ZZ-IA-TESTE", ...dados }).then(() => "criou", (erro) => erro.message);
    conferir("assunto curto demais", await recusa({ assunto: "ab", conteudo: "xxxx" }), "O assunto precisa ter de 3 a 120 caracteres.");
    conferir("conteudo grande demais", await recusa({ assunto: "ZZ-IA grande", conteudo: "x".repeat(4001) }), "O conteúdo precisa ter de 3 a 4000 caracteres.");
    conferir("aprovada sem dizer quem aprovou", await recusa({ assunto: "ZZ-IA sem quem", conteudo: "yyy", status: "APROVADO" }), "Nota aprovada precisa de quem aprovou.");
    conferir("sem quem criou", await criarConhecimento({ assunto: "ZZ-IA sem dono", conteudo: "yyy" }).then(() => "criou", (erro) => erro.message), "Informe quem está criando a nota.");

    const lista = await listarConhecimento({ busca: "ZZ-IA", status: "APROVADO" });
    conferir("listar filtra por status e busca", [lista.some((nota) => nota.id === aprovada.id), lista.some((nota) => nota.id === rascunho.id)], [true, false]);

    // A ferramenta do modelo.
    const pelaFerramenta = await executarFerramenta("buscarConhecimento", { termos: "arduino para iniciante acender led" }, { perfil: "admin" });
    conferir("ferramenta buscarConhecimento", [pelaFerramenta.ok, deTeste(pelaFerramenta.resultado).map((nota) => nota.id), Object.keys(pelaFerramenta.resultado[0]).sort()], [true, [aprovada.id], ["assunto", "conteudo", "id", "produtos"]]);
    conferir("buscarConhecimento tambem serve ao perfil publico", definicoesParaProvedor("publico").map((d) => d.nome).includes("buscarConhecimento"), true);
    conferir("a ferramenta recusa termos vazios", (await executarFerramenta("buscarConhecimento", { termos: "" }, { perfil: "admin" })).ok, false);
  }

  // -------------------------------------------------------------------------
  // Tarefa 9 — Resposta, prompt e o laco da conversa
  // -------------------------------------------------------------------------
  {
    const { produtosCitados, tituloDaConversa, estimarTokens, cortarHistorico, extrairJson } = await import("../src/lib/riseAi/resposta.js");
    const { montarSistema, mensagemDeConhecimento, SISTEMA_FIXO, SISTEMA_DO_CLIENTE, PROMPT_ATENDIMENTO_PADRAO, PROMPT_INTERNO_PADRAO } = await import("../src/lib/riseAi/prompt.js");
    const { mensagensParaOpenAI } = await import("../src/lib/riseAi/provedores/openaiCompativel.js");
    const { responder } = await import("../src/lib/riseAi/conversa.js");
    const { carregarConversa, listarConversas, renomearConversa, excluirConversa, avaliarMensagem } = await import("../src/lib/riseAi/conversas.js");
    const { configuracaoPadrao } = await import("../src/lib/riseAi/configuracao.js");
    const { criarLimitador } = await import("../src/lib/riseAi/limite.js");
    const { criarConhecimento } = await import("../src/lib/riseAi/conhecimento.js");
    const { criarProvedorFalso } = await import("./lib/provedorFalso.js");

    console.log("\nResposta e prompt");

    const candidatos = [
      { sku: "100101", nome: "PLACA UNO R3 SMD CH340" },
      { sku: "100210", nome: "PLACA NANO V3 CH340" },
      { sku: "100340", nome: "ESP32 DEVKIT V1" },
    ];
    const citacao = produtosCitados("O Uno R3 SMD (100101) serve; o Nano está sem estoque.", candidatos);
    conferir("produto citado por codigo e por nome (as palavras que so ele tem)", [citacao.citados.map((p) => p.sku), citacao.outros.map((p) => p.sku)], [["100101", "100210"], ["100340"]]);
    conferir("citado so pelo codigo", produtosCitados("Veja o 100340.", candidatos).citados.map((p) => p.sku), ["100340"]);
    conferir("palavra em comum nao basta", produtosCitados("Essa placa CH340 e boa.", candidatos).citados, []);
    conferir("sem nada citado", produtosCitados("nao achei", candidatos).citados, []);
    conferir("titulo de 60", [tituloDaConversa("a".repeat(80)).length, tituloDaConversa("  qual\narduino  serve? "), tituloDaConversa("   ")], [61, "qual arduino serve?", "Nova conversa"]);
    conferir("estimar tokens", estimarTokens("abcdefgh"), 2);
    conferir(
      "historico cortado mantem o par assistente+ferramenta",
      cortarHistorico(
        [
          { papel: "usuario", conteudo: "x".repeat(400) },
          { papel: "assistente", conteudo: "", chamadas: [{ id: "1", nome: "f", argumentos: {} }] },
          { papel: "ferramenta", chamadaId: "1", nome: "f", conteudo: "{}" },
          { papel: "assistente", conteudo: "ok" },
        ],
        20,
      ).map((m) => m.papel),
      ["assistente", "ferramenta", "assistente"],
    );
    conferir(
      "ferramenta orfa no comeco do corte sai",
      cortarHistorico([{ papel: "assistente", conteudo: "x".repeat(400), chamadas: [{ id: "1", nome: "f", argumentos: {} }] }, { papel: "ferramenta", chamadaId: "1", nome: "f", conteudo: "{}" }, { papel: "assistente", conteudo: "ok" }], 3).map((m) => m.papel),
      ["assistente"],
    );
    conferir("historico que cabe inteiro", cortarHistorico([{ papel: "usuario", conteudo: "oi" }, { papel: "assistente", conteudo: "ola" }], 100).length, 2);
    conferir("sistema estavel entre pedidos", montarSistema({ perfil: "admin" }) === montarSistema({ perfil: "admin" }), true);
    conferir("sistema = regras fixas + estilo da equipe", montarSistema({}) === `${SISTEMA_FIXO}\n\n${PROMPT_INTERNO_PADRAO}`, true);
    conferir("o estilo da tela substitui o padrao, nunca as regras fixas", montarSistema({ promptInterno: "ESTILO NOVO" }).startsWith(SISTEMA_FIXO) && montarSistema({ promptInterno: "ESTILO NOVO" }).endsWith("ESTILO NOVO"), true);
    conferir("as regras fixas nao exigem mais os dois titulos e seguem proibindo custo no texto ao cliente", [SISTEMA_FIXO.includes("### Resposta para o cliente"), SISTEMA_FIXO.includes("### Para a equipe"), /custo/i.test(SISTEMA_FIXO)], [false, false, true]);
    conferir("o interno pede texto corrido e deixa usar negrito e lista", [/corrido/i.test(SISTEMA_FIXO), SISTEMA_FIXO.includes("**negrito**")], [true, true]);
    conferir("sistema do cliente = regras do cliente + estilo ao cliente", montarSistema({ modo: "cliente" }) === `${SISTEMA_DO_CLIENTE}\n\n${PROMPT_ATENDIMENTO_PADRAO}`, true);
    conferir("sistema do cliente: texto puro e sem convite ao negrito", [/texto puro/i.test(montarSistema({ modo: "cliente" })), montarSistema({ modo: "cliente" }).includes("**negrito**")], [true, false]);
    conferir("o estilo salvo para o cliente troca so o estilo", montarSistema({ modo: "cliente", promptCliente: "ESTILO CLIENTE" }) === `${SISTEMA_DO_CLIENTE}\n\nESTILO CLIENTE`, true);
    conferir("internet ligada acrescenta a regra da pesquisa, so no interno", [montarSistema({ internet: true }).includes("pesquisarNaInternet"), montarSistema({}).includes("pesquisarNaInternet"), montarSistema({ modo: "cliente", internet: true }).includes("pesquisarNaInternet")], [true, false, false]);
    conferir("as mesmas opcoes dao o mesmo texto (cache do prefixo)", montarSistema({ internet: true }) === montarSistema({ internet: true }), true);
    conferir("sistema sem data nem nome (estavel para o cache de prefixo)", /\b20\d\d\b/.test(montarSistema({})), false);
    // Visto na tela em 11/10/2026: o modelo escreveu **negrito** no texto do cliente, e no WhatsApp os asteriscos aparecem.
    conferir("o estilo pede texto puro, sem markdown (o cliente le no WhatsApp)", [/texto puro/i.test(PROMPT_ATENDIMENTO_PADRAO), /markdown/i.test(PROMPT_ATENDIMENTO_PADRAO)], [true, true]);
    conferir("mensagem de conhecimento", [mensagemDeConhecimento("Conhecimento aprovado..."), mensagemDeConhecimento("")], [{ papel: "usuario", conteudo: "Conhecimento aprovado..." }, null]);
    conferir("extrairJson", [extrairJson('bla {"a":1,"b":{"c":"}"}} bla'), extrairJson("sem json"), extrairJson('```json\n{"x":2}\n```')], [{ a: 1, b: { c: "}" } }, null, { x: 2 }]);
    conferir(
      "o adaptador OpenAI funde mensagens seguidas do usuario (o template do Gemma recusa duas)",
      mensagensParaOpenAI("S", [{ papel: "usuario", conteudo: "a" }, { papel: "usuario", conteudo: "b" }, { papel: "assistente", conteudo: "c" }, { papel: "usuario", conteudo: "d" }]),
      [{ role: "system", content: "S" }, { role: "user", content: "a\n\nb" }, { role: "assistant", content: "c" }, { role: "user", content: "d" }],
    );

    console.log("\nLaco da conversa");
    const deps = (padrao, reserva, ajustes = {}) => ({
      configuracao: {
        ...configuracaoPadrao("pc"),
        padrao: { provedor: "lmstudio", modelo: "falso-1" },
        tempoLimite: { primeiroTokenMs: 50, totalMs: 2000 },
        ...ajustes,
      },
      criarProvedor: (id) => (id === "lmstudio" ? padrao : reserva),
      provedorDisponivel: async () => true,
      limitador: criarLimitador({ porMinuto: 1000 }),
      // O orcamento (Entrega A1) olha o gasto do mes: um mes falso sem nada, para o gasto real do dono nao entrar na conta.
      agoraDoOrcamento: () => Date.UTC(2025, 0, 15, 15),
    });
    const falsoReservaOk = (usoDaReserva = { entrada: 1000, saida: 1000 }) =>
      criarProvedorFalso({ id: "anthropic", roteiro: [{ texto: "### Resposta para o cliente\nReserva.\n\n### Para a equipe\n-", uso: usoDaReserva }] });

    const minhaNota = await criarConhecimento({
      assunto: "ZZ-IA Arduino para ligar LED",
      conteudo: "Para ligar um LED num projeto simples, o Uno ou o Nano bastam; o Mega é exagero.",
      status: "APROVADO",
      criadoPor: "ZZ-IA-TESTE",
      aprovadoPor: "ZZ-IA-TESTE",
    });

    const eventos = [];
    const falsoPadrao = criarProvedorFalso({
      roteiro: [
        { chamadas: [{ nome: "buscarProdutos", argumentos: { termos: "placa zzia uno ch340" } }, { nome: "consultarEstoque", argumentos: { skus: ["ZZ-IA-NANO"] } }] },
        { texto: "### Resposta para o cliente\nOlá! O PLACA ZZIA UNO R3 CH340 serve.\n\n### Para a equipe\nNano sem estoque.", uso: { entrada: 1000, saida: 100 } },
      ],
    });
    const r1 = await responder({
      texto: "Cliente (54) 98899-0008 pergunta: qual arduino para ligar um LED?",
      usuario: "ZZ-IA-TESTE",
      aoEvento: (nome) => eventos.push(nome),
      dependencias: deps(falsoPadrao, falsoReservaOk()),
    });
    conferir("cartoes vem das ferramentas", r1.mensagem.estruturado.produtos.map((p) => p.sku), ["ZZ-IA-UNO"]);
    conferir("o cartao da tela nao leva custo nem localizacao", ["custo" in r1.mensagem.estruturado.produtos[0], "localizacao" in r1.mensagem.estruturado.produtos[0], r1.mensagem.estruturado.produtos[0].urlLoja], [false, false, "https://www.4hobby.com.br/placa-zzia-uno"]);
    conferir("mensagem nova: sem os dois quadros, com o modo e as fontes", ["respostaCliente" in r1.mensagem.estruturado, "paraEquipe" in r1.mensagem.estruturado, "outrosConsultados" in r1.mensagem.estruturado, r1.mensagem.estruturado.modo, r1.mensagem.estruturado.fontes], [false, false, false, "interno", []]);
    conferir("mensagem nova: o texto inteiro do modelo fica no conteudo e o aviso sem_separacao nao existe mais", [r1.mensagem.conteudo.includes("Nano sem estoque."), r1.mensagem.avisos.includes("sem_separacao")], [true, false]);
    conferir("os produtos citados levam so o que a tela e os links precisam", Object.keys(r1.mensagem.estruturado.produtos[0]).sort(), ["nome", "sku", "urlLoja"]);
    conferir("modelo e custo zero no local", [r1.mensagem.provedor, r1.mensagem.modelo, Number(r1.mensagem.custoBrl), r1.mensagem.motivoDaReserva], ["lmstudio", "falso-1", 0, null]);
    conferir("uso somado das duas rodadas", [r1.mensagem.tokensEntrada, r1.mensagem.tokensSaida], [1100, 120]);
    conferir("eventos na ordem", eventos.filter((nome) => nome !== "texto"), ["inicio", "ferramenta", "ferramenta", "ferramenta", "ferramenta", "fim"]);
    conferir(
      "auditoria por chamada, sem o prompt",
      await prisma.logIntegracao.count({ where: { servico: "LM_STUDIO", endpoint: "falso-1", requestResumo: { not: { contains: "LED" } } } }),
      2,
    );
    conferir(
      "a pergunta e gravada mascarada",
      (await prisma.mensagemIA.findFirst({ where: { conversaId: r1.conversaId, papel: "USUARIO" } })).conteudo.includes("9****-**08"),
      true,
    );
    conferir("a resposta lista o que foi mascarado", r1.mensagem.estruturado.mascarados, ["telefone"]);
    conferir("conhecimento usado vai na mensagem", r1.mensagem.estruturado.conhecimentoUsado.some((nota) => nota.id === minhaNota.id), true);
    conferir(
      "o provedor recebeu o conhecimento e a pergunta mascarada, nunca o telefone",
      falsoPadrao.pedidos[0].mensagens.some((m) => m.conteudo?.startsWith("Conhecimento aprovado")) && !JSON.stringify(falsoPadrao.pedidos[0]).includes("98899-0008"),
      true,
    );
    conferir(
      "o sistema e as ferramentas chegam ao provedor",
      [falsoPadrao.pedidos[0].sistema === montarSistema({}), falsoPadrao.pedidos[0].ferramentas.map((f) => f.nome).includes("buscarProdutos")],
      [true, true],
    );
    conferir("o resultado da ferramenta volta ao modelo como mensagem de ferramenta", falsoPadrao.pedidos[1].mensagens.filter((m) => m.papel === "ferramenta").length, 2);
    const conversaDoR1 = await carregarConversa(r1.conversaId, { usuario: "ZZ-IA-TESTE" });
    conferir("a conversa tem dono e o titulo sai do texto ja mascarado", [conversaDoR1.usuario, conversaDoR1.titulo.startsWith("Cliente (54)"), conversaDoR1.titulo.includes("98899")], ["ZZ-IA-TESTE", true, false]);

    // O historico da conversa volta ao modelo na pergunta seguinte, e nunca comeca por resposta da IA.
    const falsoSeguinte = criarProvedorFalso({ roteiro: [{ texto: "### Resposta para o cliente\nSim." }] });
    await responder({ conversaId: r1.conversaId, texto: "e com bateria 9V?", usuario: "ZZ-IA-TESTE", dependencias: deps(falsoSeguinte, falsoReservaOk()) });
    const historico = falsoSeguinte.pedidos[0].mensagens.filter((m) => !m.conteudo?.startsWith("Conhecimento aprovado"));
    conferir(
      "historico: a pergunta anterior, a resposta e a nova",
      [historico[0].papel, historico.map((m) => m.papel).slice(0, 3), historico.at(-1).conteudo],
      ["usuario", ["usuario", "assistente", "usuario"], "e com bateria 9V?"],
    );

    // Reserva: conexao recusada, primeiro token lento, ferramenta quebrada duas vezes, sem modelo, provedor fora do ar.
    const r2 = await responder({ texto: "tem esp32?", usuario: "ZZ-IA-TESTE", dependencias: deps(criarProvedorFalso({ roteiro: [{ erro: "conexao" }] }), falsoReservaOk()) });
    conferir("cai para a reserva", [r2.mensagem.provedor, r2.mensagem.modelo, r2.mensagem.motivoDaReserva], ["anthropic", "claude-haiku-5-5", "conexao"]);
    conferir("custo da reserva (haiku, 1000+1000 tokens)", [Number(r2.mensagem.custoUsd), Number(r2.mensagem.custoBrl)], [0.0006, 0.0036]);
    const r3 = await responder({
      texto: "tem esp32?",
      usuario: "ZZ-IA-TESTE",
      dependencias: deps(criarProvedorFalso({ roteiro: [{ atrasoMs: 300, texto: "### Resposta para o cliente\nx" }] }), falsoReservaOk()),
    });
    conferir("primeiro token lento vira reserva", r3.mensagem.motivoDaReserva, "tempo");
    const r4 = await responder({
      texto: "tem esp32?",
      usuario: "ZZ-IA-TESTE",
      dependencias: deps(criarProvedorFalso({ roteiro: [{ texto: "### Resposta para o cliente\nComeçou", erroDepoisDoTexto: "conexao" }] }), falsoReservaOk()),
    });
    conferir("erro depois do texto nao usa a reserva (nunca duas vozes numa resposta)", [r4.mensagem.avisos.includes("erro"), r4.mensagem.motivoDaReserva, r4.mensagem.provedor], [true, null, "lmstudio"]);
    const r5 = await responder({
      texto: "tem esp32?",
      usuario: "ZZ-IA-TESTE",
      dependencias: deps(criarProvedorFalso({ roteiro: [{ chamadas: [{ malformada: true }] }, { chamadas: [{ malformada: true }] }] }), falsoReservaOk()),
    });
    conferir("duas ferramentas quebradas seguidas viram reserva", r5.mensagem.motivoDaReserva, "ferramenta_malformada");
    const umaQuebrada = criarProvedorFalso({ roteiro: [{ chamadas: [{ malformada: true }] }, { texto: "### Resposta para o cliente\nOk." }] });
    const r5b = await responder({ texto: "tem esp32?", usuario: "ZZ-IA-TESTE", dependencias: deps(umaQuebrada, falsoReservaOk()) });
    conferir("uma ferramenta quebrada o modelo corrige sozinho", [r5b.mensagem.motivoDaReserva, r5b.mensagem.provedor], [null, "lmstudio"]);
    const semModelo = criarProvedorFalso({ roteiro: [] });
    const r5c = await responder({ texto: "tem esp32?", usuario: "ZZ-IA-TESTE", dependencias: deps(semModelo, falsoReservaOk(), { padrao: { provedor: "lmstudio", modelo: "" } }) });
    conferir("padrao sem modelo escolhido vai para a reserva", [r5c.mensagem.motivoDaReserva, semModelo.pedidos.length], ["padrao_sem_modelo", 0]);
    const foraDoAr = criarProvedorFalso({ roteiro: [] });
    const dForaDoAr = deps(foraDoAr, falsoReservaOk());
    dForaDoAr.provedorDisponivel = async () => false;
    const r5d = await responder({ texto: "tem esp32?", usuario: "ZZ-IA-TESTE", dependencias: dForaDoAr });
    conferir("provedor fora do ar nem e chamado (a reserva responde sem esperar o tempo limite)", [r5d.mensagem.motivoDaReserva, foraDoAr.pedidos.length], ["padrao_indisponivel", 0]);
    const r5e = await responder({ texto: "tem esp32?", usuario: "ZZ-IA-TESTE", dependencias: deps(criarProvedorFalso({ roteiro: [{ erro: "conexao" }] }), falsoReservaOk(), { reserva: null }) });
    conferir("sem reserva configurada o erro e claro", [r5e.mensagem.avisos, r5e.mensagem.conteudo.includes("Configure")], [["erro"], true]);
    const r5f = await responder({
      texto: "tem esp32?",
      usuario: "ZZ-IA-TESTE",
      dependencias: deps(criarProvedorFalso({ roteiro: [{ erro: "conexao" }] }), criarProvedorFalso({ id: "anthropic", roteiro: [{ erro: "autenticacao" }] })),
    });
    conferir("padrao e reserva falharam: um aviso, nada travado", [r5f.mensagem.avisos, r5f.mensagem.motivoDaReserva], [["erro"], "conexao"]);

    // Sem resultado, sem separacao, ferramenta invalida, limite de ferramentas.
    const r6 = await responder({
      texto: "tem zzxqv 48V 40A?",
      usuario: "ZZ-IA-TESTE",
      dependencias: deps(criarProvedorFalso({ roteiro: [{ chamadas: [{ nome: "buscarProdutos", argumentos: { termos: "zzxqv 48v 40a" } }] }, { texto: "Não encontrei no catálogo." }] }), falsoReservaOk()),
    });
    conferir("aviso sem_resultado (e nenhum sem_separacao)", [...r6.mensagem.avisos].sort(), ["sem_resultado"]);
    conferir("sem resultado: nenhum cartao inventado", r6.mensagem.estruturado.produtos, []);
    const muitas = Array.from({ length: 9 }, () => ({ chamadas: [{ nome: "consultarPreco", argumentos: { skus: ["ZZ-IA-UNO"] } }] }));
    const r7 = await responder({
      texto: "preco",
      usuario: "ZZ-IA-TESTE",
      dependencias: deps(criarProvedorFalso({ roteiro: [...muitas, { texto: "### Resposta para o cliente\nR$ 38,90" }] }), falsoReservaOk()),
    });
    conferir("limite de ferramentas: 8 executadas e o aviso", [r7.mensagem.avisos.includes("limite_de_ferramentas"), r7.mensagem.estruturado.ferramentas.length], [true, 8]);
    const r8 = await responder({
      texto: "ficha do produto",
      usuario: "ZZ-IA-TESTE",
      dependencias: deps(criarProvedorFalso({ roteiro: [{ chamadas: [{ nome: "consultarProduto", argumentos: { sku: "x".repeat(500) } }] }, { texto: "### Resposta para o cliente\nNão achei esse código." }] }), falsoReservaOk()),
    });
    conferir("ferramenta recusada pelo zod nao derruba o laco", [r8.mensagem.estruturado.ferramentas[0].ok, r8.mensagem.avisos.includes("erro")], [false, false]);

    // Uma resposta por vez por conversa, dono da conversa, limite por minuto, entrada invalida.
    const lento = criarProvedorFalso({ roteiro: [{ atrasoMs: 200, texto: "### Resposta para o cliente\nA" }, { texto: "### Resposta para o cliente\nB" }] });
    const dLento = deps(lento, falsoReservaOk(), { tempoLimite: { primeiroTokenMs: 5000, totalMs: 5000 } });
    const [primeira, segunda] = await Promise.allSettled([
      responder({ conversaId: r1.conversaId, texto: "1", usuario: "ZZ-IA-TESTE", dependencias: dLento }),
      responder({ conversaId: r1.conversaId, texto: "2", usuario: "ZZ-IA-TESTE", dependencias: dLento }),
    ]);
    conferir("uma resposta por vez por conversa", [primeira.status, segunda.status === "rejected" ? segunda.reason.message : "respondeu"], ["fulfilled", "Espere a resposta anterior terminar."]);
    conferir("a conversa fica livre depois", (await responder({ conversaId: r1.conversaId, texto: "3", usuario: "ZZ-IA-TESTE", dependencias: deps(criarProvedorFalso({ roteiro: [] }), falsoReservaOk()) })).mensagem.papel, "ASSISTENTE");
    conferir(
      "outro usuario nao continua a conversa",
      await responder({ conversaId: r1.conversaId, texto: "oi", usuario: "ZZ-IA-OUTRO", dependencias: deps(falsoPadrao, falsoReservaOk()) }).then(() => "respondeu", (erro) => erro.message),
      "Conversa não encontrada.",
    );
    const dLim = deps(falsoPadrao, falsoReservaOk());
    dLim.limitador = criarLimitador({ porMinuto: 1 });
    await responder({ texto: "a", usuario: "ZZ-IA-LIM", dependencias: dLim }).catch(() => {});
    conferir("limite por minuto", await responder({ texto: "b", usuario: "ZZ-IA-LIM", dependencias: dLim }).then(() => "passou", (erro) => erro.message), "Muitas perguntas seguidas: espere um minuto.");
    conferir("pergunta vazia", await responder({ texto: "   ", usuario: "ZZ-IA-TESTE", dependencias: deps(falsoPadrao, falsoReservaOk()) }).then(() => "respondeu", (erro) => erro.message), "Escreva a pergunta.");
    conferir("pergunta grande demais", await responder({ texto: "x".repeat(8001), usuario: "ZZ-IA-TESTE", dependencias: deps(falsoPadrao, falsoReservaOk()) }).then(() => "respondeu", (erro) => erro.message), "A pergunta passa de 8.000 caracteres.");

    // Conversas: listar, buscar, renomear, avaliar, excluir.
    conferir("lista so as proprias", (await listarConversas({ usuario: "ZZ-IA-TESTE" })).every((c) => c.usuario === "ZZ-IA-TESTE"), true);
    conferir("busca pelo conteudo das mensagens", (await listarConversas({ usuario: "ZZ-IA-TESTE", busca: "ligar um LED" })).some((c) => c.id === r1.conversaId), true);
    conferir("administrador ve todas quando pede", (await listarConversas({ usuario: "ZZ-IA-OUTRO", administrador: true, todas: true })).some((c) => c.id === r1.conversaId), true);
    conferir("administrador sem pedir ve so as dele", (await listarConversas({ usuario: "ZZ-IA-OUTRO", administrador: true })).some((c) => c.id === r1.conversaId), false);
    conferir("administrador le a conversa de outro", (await carregarConversa(r1.conversaId, { usuario: "ZZ-IA-OUTRO", administrador: true }))?.id, r1.conversaId);
    conferir("quem nao e dono nao le", await carregarConversa(r1.conversaId, { usuario: "ZZ-IA-OUTRO" }), null);
    conferir("a conversa vem com as mensagens em ordem", (await carregarConversa(r1.conversaId, { usuario: "ZZ-IA-TESTE" })).mensagens.map((m) => m.papel).slice(0, 2), ["USUARIO", "ASSISTENTE"]);
    await renomearConversa(r1.conversaId, "  Arduino para LED  ", { usuario: "ZZ-IA-TESTE" });
    conferir("renomear", (await carregarConversa(r1.conversaId, { usuario: "ZZ-IA-TESTE" })).titulo, "Arduino para LED");
    conferir("so o dono renomeia", await renomearConversa(r1.conversaId, "x", { usuario: "ZZ-IA-OUTRO" }).then(() => "renomeou", () => "recusou"), "recusou");
    conferir("titulo vazio e recusado", await renomearConversa(r1.conversaId, "   ", { usuario: "ZZ-IA-TESTE" }).then(() => "renomeou", () => "recusou"), "recusou");
    const avaliada = await avaliarMensagem(r1.mensagem.id, { avaliacao: -1, comentario: "indicou caro demais", usuario: "ZZ-IA-TESTE" });
    conferir("avaliar", [avaliada.avaliacao, avaliada.comentario, avaliada.avaliadoPor, avaliada.avaliadoEm instanceof Date], [-1, "indicou caro demais", "ZZ-IA-TESTE", true]);
    conferir("avaliacao invalida", await avaliarMensagem(r1.mensagem.id, { avaliacao: 5, usuario: "ZZ-IA-TESTE" }).then(() => "avaliou", () => "recusou"), "recusou");
    conferir("so o dono avalia", await avaliarMensagem(r1.mensagem.id, { avaliacao: 1, usuario: "ZZ-IA-OUTRO" }).then(() => "avaliou", () => "recusou"), "recusou");
    conferir("tirar a avaliacao", (await avaliarMensagem(r1.mensagem.id, { avaliacao: null, usuario: "ZZ-IA-TESTE" })).avaliacao, null);
    // Revisao final (11/10/2026): o comentario do 👎 e digitado pela esposa, que cola o telefone do cliente ("o cliente (54)
    // 98899-0008 reclamou"). Era gravado como veio; a regra de LGPD do Rise AI e "nunca guardar o dado pessoal colado".
    const comDadoPessoal = await avaliarMensagem(r1.mensagem.id, { avaliacao: -1, comentario: "o cliente (54) 98899-0008 e joao@exemplo.com reclamou do preco", usuario: "ZZ-IA-TESTE" });
    conferir(
      "o comentario do 👎 e mascarado antes de gravar",
      [comDadoPessoal.comentario.includes("98899"), comDadoPessoal.comentario.includes("joao@"), comDadoPessoal.comentario.includes("reclamou do preco"), (await prisma.mensagemIA.findUnique({ where: { id: r1.mensagem.id } })).comentario.includes("98899")],
      [false, false, true, false],
    );
    await avaliarMensagem(r1.mensagem.id, { avaliacao: -1, comentario: "indicou caro demais", usuario: "ZZ-IA-TESTE" });

    // Excluir a conversa: leva as mensagens, mas o conhecimento que nasceu dela fica (so perde a origem).
    const paraExcluir = await responder({ texto: "so para excluir", usuario: "ZZ-IA-EXCLUI", dependencias: deps(criarProvedorFalso({ roteiro: [] }), falsoReservaOk()) });
    const notaDaConversa = await criarConhecimento({ assunto: "ZZ-IA nasceu da conversa", conteudo: "regra", criadoPor: "ZZ-IA-EXCLUI", origemMensagemId: paraExcluir.mensagem.id });
    conferir("so o dono exclui", await excluirConversa(paraExcluir.conversaId, { usuario: "ZZ-IA-OUTRO" }).then(() => "excluiu", () => "recusou"), "recusou");
    await excluirConversa(paraExcluir.conversaId, { usuario: "ZZ-IA-EXCLUI" });
    conferir(
      "excluir leva as mensagens e a nota fica sem origem",
      [await prisma.mensagemIA.count({ where: { conversaId: paraExcluir.conversaId } }), (await prisma.conhecimentoIA.findUnique({ where: { id: notaDaConversa.id } })).origemMensagemId],
      [0, null],
    );
    // Para os testes seguintes (Revisao): a conversa r1, a r2 (reserva) e a r1.mensagem ficam.
    compartilhado.r1 = r1;
    compartilhado.r2 = r2;
  }

  // -------------------------------------------------------------------------
  // Tarefa 10 — Rota de streaming e acoes de conversa (a parte que roda em Node puro)
  // -------------------------------------------------------------------------
  {
    const { eventoSSE, fluxoDeEventos } = await import("../src/lib/riseAi/sse.js");
    const { ErroDeUso } = await import("../src/lib/riseAi/erros.js");
    const { carregarMensagem, mensagemParaTela } = await import("../src/lib/riseAi/conversas.js");
    const { responder } = await import("../src/lib/riseAi/conversa.js");
    console.log("\nSSE e mensagem para a tela");

    conferir("evento SSE", eventoSSE("texto", { delta: "a" }), 'event: texto\ndata: {"delta":"a"}\n\n');
    conferir("evento SSE: quebra de linha e acento viram JSON valido numa linha so", eventoSSE("texto", { delta: "olá\nmundo" }), 'event: texto\ndata: {"delta":"olá\\nmundo"}\n\n');

    const ler = async (fluxo) => {
      const leitor = fluxo.getReader();
      const decodificador = new TextDecoder();
      let texto = "";
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) return texto;
        texto += decodificador.decode(value, { stream: true });
      }
    };
    conferir(
      "o fluxo entrega os eventos na ordem e fecha",
      await ler(fluxoDeEventos(async (enviar) => { enviar("inicio", { a: 1 }); enviar("fim", {}); })),
      'event: inicio\ndata: {"a":1}\n\nevent: fim\ndata: {}\n\n',
    );
    conferir(
      "erro de uso vira evento `erro` com a mensagem (a tela mostra o que fazer)",
      await ler(fluxoDeEventos(async () => { throw new ErroDeUso("Escreva a pergunta."); })),
      'event: erro\ndata: {"mensagem":"Escreva a pergunta."}\n\n',
    );
    const inesperados = [];
    conferir(
      "erro inesperado vira aviso generico: a mensagem interna nao chega a tela",
      await ler(fluxoDeEventos(async () => { throw new Error("ECONNREFUSED 127.0.0.1:5432 senha=abc"); }, { aoErroInesperado: (erro) => inesperados.push(erro.message) })),
      'event: erro\ndata: {"mensagem":"Não foi possível responder agora. Tente de novo em instantes."}\n\n',
    );
    conferir("o erro inesperado vai para o log do servidor", inesperados, ["ECONNREFUSED 127.0.0.1:5432 senha=abc"]);
    conferir(
      "cliente que fechou a conexao nao derruba a resposta",
      await (async () => {
        let terminou = false;
        const fluxo = fluxoDeEventos(async (enviar) => { enviar("inicio", {}); await new Promise((r) => setTimeout(r, 30)); enviar("fim", {}); terminou = true; });
        const leitor = fluxo.getReader();
        await leitor.read();
        await leitor.cancel();
        await new Promise((r) => setTimeout(r, 80));
        return terminou;
      })(),
      true,
    );

    // As cinco entradas invalidas do laco sao erros de uso (a tela os mostra); o resto nao.
    const mensagemDe = (promessa) => promessa.then(() => "ok", (erro) => [erro instanceof ErroDeUso, erro.message]);
    conferir("responder: pergunta vazia e erro de uso", await mensagemDe(responder({ texto: " ", usuario: "ZZ-IA-TESTE" })), [true, "Escreva a pergunta."]);
    conferir("responder: conversa alheia e erro de uso", await mensagemDe(responder({ conversaId: "nao-existe", texto: "oi", usuario: "ZZ-IA-TESTE", dependencias: { configuracao: (await import("../src/lib/riseAi/configuracao.js")).configuracaoPadrao("pc"), limitador: { permitir: () => true } } })), [true, "Conversa não encontrada."]);

    // A mensagem como a tela a recebe: so JSON simples (Decimal e Date nao atravessam a Server Action).
    const { r1 } = compartilhado;
    const noBanco = await prisma.mensagemIA.findUnique({ where: { id: r1.mensagem.id } });
    const paraATela = mensagemParaTela(noBanco);
    conferir(
      "mensagem para a tela: numeros e texto simples",
      [typeof paraATela.custoBrl, typeof paraATela.custoUsd, typeof paraATela.criadoEm, paraATela.papel, paraATela.provedor, paraATela.conteudo.includes("Olá!"), Array.isArray(paraATela.avisos)],
      ["number", "number", "string", "ASSISTENTE", "lmstudio", true, true],
    );
    conferir("mensagem para a tela: sem custo vira null, nao zero", mensagemParaTela({ ...noBanco, custoBrl: null, custoUsd: null }).custoBrl, null);
    conferir("a mensagem de um dono: o dono carrega", (await carregarMensagem(r1.mensagem.id, { usuario: "ZZ-IA-TESTE" }))?.id, r1.mensagem.id);
    conferir("quem nao e dono nao carrega", await carregarMensagem(r1.mensagem.id, { usuario: "ZZ-IA-OUTRO" }), null);
    conferir("administrador carrega a de outro", (await carregarMensagem(r1.mensagem.id, { usuario: "ZZ-IA-OUTRO", administrador: true }))?.id, r1.mensagem.id);
    conferir("mensagem que nao existe", await carregarMensagem("nao-existe", { usuario: "ZZ-IA-TESTE" }), null);
  }

  // -------------------------------------------------------------------------
  // Tarefa 11 — O que a tela do chat usa e roda em Node (leitura do fluxo SSE, formatos)
  // -------------------------------------------------------------------------
  {
    const { eventosDoFluxo } = await import("../src/components/riseAi/fluxo.js");
    const { custoEmTexto, duracaoEmTexto, idadeDoSaldo, rotuloDoMotivo, rotuloDoProvedor, ehLocal, reais } = await import("../src/components/riseAi/formatos.js");
    const { eventoSSE } = await import("../src/lib/riseAi/sse.js");
    console.log("\nFluxo e formatos da tela do chat");

    const corpoDe = (...pedacos) =>
      new ReadableStream({
        start(controle) {
          for (const pedaco of pedacos) controle.enqueue(typeof pedaco === "string" ? new TextEncoder().encode(pedaco) : pedaco);
          controle.close();
        },
      });
    const lerTudo = async (corpo) => {
      const lidos = [];
      for await (const evento of eventosDoFluxo(corpo)) lidos.push(evento);
      return lidos;
    };

    conferir(
      "varios eventos num pedaco so",
      await lerTudo(corpoDe(eventoSSE("inicio", { a: 1 }) + eventoSSE("texto", { delta: "Olá" }) + eventoSSE("fim", {}))),
      [{ nome: "inicio", dados: { a: 1 } }, { nome: "texto", dados: { delta: "Olá" } }, { nome: "fim", dados: {} }],
    );
    const bytes = new TextEncoder().encode(eventoSSE("texto", { delta: "Olá, tudo bem?" }) + eventoSSE("fim", { ok: true }));
    const corte = bytes.indexOf(0xc3) + 1; // no meio do "á"
    conferir(
      "evento e acento partidos entre pedacos de rede",
      await lerTudo(corpoDe(bytes.slice(0, 9), bytes.slice(9, corte), bytes.slice(corte))),
      [{ nome: "texto", dados: { delta: "Olá, tudo bem?" } }, { nome: "fim", dados: { ok: true } }],
    );
    conferir("fim de linha CRLF (proxy)", await lerTudo(corpoDe('event: texto\r\ndata: {"delta":"x"}\r\n\r\n')), [{ nome: "texto", dados: { delta: "x" } }]);
    conferir("comentario e JSON quebrado sao ignorados", await lerTudo(corpoDe(': keep-alive\n\nevent: texto\ndata: {quebrado\n\n' + eventoSSE("fim", {}))), [{ nome: "fim", dados: {} }]);
    conferir("evento sem a linha em branco final ainda sai", await lerTudo(corpoDe('event: fim\ndata: {"x":1}')), [{ nome: "fim", dados: { x: 1 } }]);
    conferir("corpo vazio", await lerTudo(corpoDe()), []);

    conferir("custo: preco desconhecido nao e zero", [custoEmTexto(null), custoEmTexto(undefined), custoEmTexto(0), custoEmTexto(0.0036), custoEmTexto(1.5)], ["preço não cadastrado", "preço não cadastrado", "R$ 0,00", "R$ 0,0036", "R$ 1,50"]);
    conferir("duracao", [duracaoEmTexto(420), duracaoEmTexto(4210), duracaoEmTexto(12000)], ["420 ms", "4,2 s", "12 s"]);
    conferir("idade do saldo do Bling", [idadeDoSaldo(null), idadeDoSaldo(0), idadeDoSaldo(20), idadeDoSaldo(90), idadeDoSaldo(60 * 30)], ["estoque do cadastro", "lido agora há pouco", "lido há 20 min", "lido há 1 h", "lido há 1 d"]);
    conferir("motivos da reserva viram frase", [rotuloDoMotivo("conexao"), rotuloDoMotivo("tempo"), rotuloDoMotivo("desconhecido-xyz")], ["sem conexão com o modelo padrão", "o modelo padrão demorou demais para começar", "o modelo padrão falhou"]);
    conferir("rotulo e local", [rotuloDoProvedor("lmstudio"), rotuloDoProvedor("anthropic"), ehLocal("lmstudio"), ehLocal("anthropic"), ehLocal("nao-existe")], ["LM Studio", "Anthropic", true, false, false]);
    conferir("reais", reais(38.9), "R$ 38,90");
  }

  // -------------------------------------------------------------------------
  // Tarefa 12 — Sugestao ao polegar para baixo, propor correcao e revisao do dia
  // -------------------------------------------------------------------------
  {
    const { gerarSugestaoParaMensagem, aprovarSugestao, rejeitarSugestao, listarSugestoes, proporCorrecao } = await import("../src/lib/riseAi/sugestoes.js");
    const { conversasDoDia, marcarRevisada, resumoDoDia, limitesDoDia } = await import("../src/lib/riseAi/revisao.js");
    const { avaliarMensagem } = await import("../src/lib/riseAi/conversas.js");
    const { criarConhecimento } = await import("../src/lib/riseAi/conhecimento.js");
    const { configuracaoPadrao } = await import("../src/lib/riseAi/configuracao.js");
    const { criarProvedorFalso } = await import("./lib/provedorFalso.js");
    console.log("\nSugestoes e revisao");

    const { r1, r2 } = compartilhado;
    const deps = (padrao, reserva) => ({
      configuracao: { ...configuracaoPadrao("pc"), padrao: { provedor: "lmstudio", modelo: "falso-1" }, tempoLimite: { primeiroTokenMs: 50, totalMs: 2000 } },
      criarProvedor: (id) => (id === "lmstudio" ? padrao : reserva),
      provedorDisponivel: async () => true,
    });
    const json = (extra = {}) =>
      JSON.stringify({ tipo: "resposta_errada", problema: "placa cara", correcaoSugerida: "Projeto simples: Nano ou Uno", justificativa: "regra da loja", produtos: ["ZZ-IA-UNO"], confianca: 80, ...extra });
    const reservaIntacta = () => criarProvedorFalso({ id: "anthropic", roteiro: [{ texto: json() }] });
    const quebrado = () => criarProvedorFalso({ roteiro: [{ erro: "conexao" }] });
    const mensagemDe = (promessa) => promessa.then(() => "ok", (erro) => erro.message);
    const doBanco = (id) => prisma.mensagemIA.findUnique({ where: { id } });

    // Os limites de um dia de Sao Paulo (UTC-3): perto da meia-noite o UTC ja e o dia seguinte.
    const limites = limitesDoDia("2026-10-11");
    conferir("o dia vai de 03:00 UTC a 03:00 UTC do dia seguinte", [limites.inicio.toISOString(), limites.fim.toISOString()], ["2026-10-11T03:00:00.000Z", "2026-10-12T03:00:00.000Z"]);
    conferir("dia invalido", [await mensagemDe(Promise.resolve().then(() => limitesDoDia("ontem"))), await mensagemDe(Promise.resolve().then(() => limitesDoDia("2026-13-45")))], ["Dia inválido.", "Dia inválido."]);

    await criarConhecimento({ assunto: "ZZ-IA Nota ligada ao Uno", conteudo: "O Uno e a placa padrao para ligar LED.", produtos: ["ZZ-IA-UNO"], status: "APROVADO", criadoPor: "ZZ-IA-TESTE", aprovadoPor: "ZZ-IA-TESTE" });
    await avaliarMensagem(r1.mensagem.id, { avaliacao: -1, comentario: "indicou caro demais", usuario: "ZZ-IA-TESTE" });

    // --- gerar a sugestao ---
    const padrao1 = criarProvedorFalso({ roteiro: [{ texto: json() }] });
    const sugestao = await gerarSugestaoParaMensagem(r1.mensagem.id, { comentario: "indicou caro demais", dependencias: deps(padrao1, reservaIntacta()) });
    conferir("sugestao pendente com os campos", [sugestao.status, sugestao.origem, sugestao.produtos, sugestao.confianca], ["PENDENTE", "SINALIZACAO", ["ZZ-IA-UNO"], 80]);
    conferir("a sugestao guarda a conversa, a mensagem e o modelo que a propos", [sugestao.conversaId, sugestao.mensagemId, sugestao.fontes?.geradaPor.provedor, sugestao.fontes?.geradaPor.modelo], [r1.conversaId, r1.mensagem.id, "lmstudio", "falso-1"]);
    const pedido = padrao1.pedidos[0];
    const textoDoPedido = pedido.mensagens.map((mensagem) => mensagem.conteudo).join("\n");
    conferir(
      "o pedido leva a conversa, o comentario e o conhecimento aprovado, sem ferramentas e sem dado pessoal",
      [pedido.ferramentas.length, textoDoPedido.includes("indicou caro demais"), textoDoPedido.includes("qual arduino para ligar um LED"), textoDoPedido.includes("ZZ-IA Nota ligada ao Uno"), textoDoPedido.includes("98899"), /JSON/.test(pedido.sistema)],
      [0, true, true, true, false, true],
    );

    // 👎 duas vezes seguidas nao gasta uma segunda chamada nem duplica a sugestao pendente.
    const intocado = criarProvedorFalso({ roteiro: [{ texto: json() }] });
    const repetida = await gerarSugestaoParaMensagem(r1.mensagem.id, { dependencias: deps(intocado, reservaIntacta()) });
    conferir("sugestao pendente da mesma resposta e reaproveitada", [repetida.id, intocado.pedidos.length, await prisma.sugestaoIA.count({ where: { mensagemId: r1.mensagem.id } })], [sugestao.id, 0, 1]);

    // --- falhas ---
    conferir("falha dos dois provedores", await mensagemDe(gerarSugestaoParaMensagem(r2.mensagem.id, { dependencias: deps(quebrado(), quebrado()) })).then((texto) => texto.startsWith("Não foi possível gerar a sugestão")), true);
    conferir("falha marca a mensagem e nao cria sugestao", [(await doBanco(r2.mensagem.id)).avisos.includes("sugestao_nao_gerada"), await prisma.sugestaoIA.count({ where: { mensagemId: r2.mensagem.id } })], [true, 0]);
    const viaReserva = criarProvedorFalso({ id: "anthropic", roteiro: [{ texto: json({ problema: "reserva usada sem necessidade" }) }] });
    const sugestaoDaReserva = await gerarSugestaoParaMensagem(r2.mensagem.id, { dependencias: deps(quebrado(), viaReserva) });
    conferir("padrao fora do ar: a reserva propoe", [sugestaoDaReserva.problema, sugestaoDaReserva.fontes?.geradaPor.provedor], ["reserva usada sem necessidade", "anthropic"]);
    conferir("gerar de novo com sucesso limpa o aviso", (await doBanco(r2.mensagem.id)).avisos.includes("sugestao_nao_gerada"), false);

    const respostasDeR1 = await prisma.mensagemIA.findMany({ where: { conversaId: r1.conversaId, papel: "ASSISTENTE" }, orderBy: [{ criadoEm: "asc" }, { id: "asc" }] });
    const outraResposta = respostasDeR1[1];
    const semJson = await mensagemDe(gerarSugestaoParaMensagem(outraResposta.id, { dependencias: deps(criarProvedorFalso({ roteiro: [{ texto: "nao sei o que errou" }] }), reservaIntacta()) }));
    conferir("resposta do modelo sem JSON nao vira sugestao", [semJson, (await doBanco(outraResposta.id)).avisos.includes("sugestao_nao_gerada")], ["Não foi possível gerar a sugestão: o modelo não devolveu uma sugestão válida.", true]);
    const cortada = await mensagemDe(gerarSugestaoParaMensagem(outraResposta.id, { dependencias: deps(criarProvedorFalso({ roteiro: [{ texto: '{"tipo":"resposta_errada","problema":"placa ca', motivoParada: "max_tokens" }] }), reservaIntacta()) }));
    conferir("resposta cortada pelo limite de tokens diz isso (um modelo que pensa muito estoura o limite)", cortada, "Não foi possível gerar a sugestão: a resposta do modelo foi cortada antes de terminar.");
    const semCorrecao = await mensagemDe(gerarSugestaoParaMensagem(outraResposta.id, { dependencias: deps(criarProvedorFalso({ roteiro: [{ texto: json({ correcaoSugerida: "  " }) }] }), reservaIntacta()) }));
    conferir("JSON sem a correcao nao vira sugestao", semCorrecao.startsWith("Não foi possível gerar a sugestão"), true);
    const doUsuario = await prisma.mensagemIA.findFirst({ where: { conversaId: r1.conversaId, papel: "USUARIO" } });
    conferir("so resposta da IA pode ser sinalizada", await mensagemDe(gerarSugestaoParaMensagem(doUsuario.id, { dependencias: deps(quebrado(), quebrado()) })), "Mensagem não encontrada.");
    const deErro = await prisma.mensagemIA.create({ data: { conversaId: r2.conversaId, papel: "ASSISTENTE", conteudo: "falhou", avisos: ["erro"] } });
    conferir("mensagem de erro nao tem o que corrigir", await mensagemDe(gerarSugestaoParaMensagem(deErro.id, { dependencias: deps(quebrado(), quebrado()) })), "Essa mensagem é um aviso de erro: não há resposta para corrigir.");
    await prisma.mensagemIA.delete({ where: { id: deErro.id } });

    // --- aprovar, rejeitar, listar ---
    const sugestaoDeLista = await gerarSugestaoParaMensagem(outraResposta.id, { dependencias: deps(criarProvedorFalso({ roteiro: [{ texto: json({ problema: "ZZ-IA bateria 9V" }) }] }), reservaIntacta()) });
    const pendentes = await listarSugestoes({ status: "PENDENTE" });
    const naLista = pendentes.find((item) => item.id === sugestaoDeLista.id);
    const todasDeR1 = await prisma.mensagemIA.findMany({ where: { conversaId: r1.conversaId }, orderBy: [{ criadoEm: "asc" }, { id: "asc" }] });
    const perguntaEsperada = todasDeR1[todasDeR1.findIndex((mensagem) => mensagem.id === outraResposta.id) - 1].conteudo;
    conferir(
      "a lista traz a conversa, a pergunta e a resposta originais",
      [naLista?.conversa.titulo === (await prisma.conversaIA.findUnique({ where: { id: r1.conversaId } })).titulo, naLista?.pergunta, naLista?.resposta === (outraResposta.estruturado?.respostaCliente || outraResposta.conteudo)],
      [true, perguntaEsperada, true],
    );
    conferir("a lista das pendentes traz as duas e nenhuma decidida", [pendentes.some((item) => item.id === sugestao.id), pendentes.some((item) => item.id === sugestaoDaReserva.id), pendentes.every((item) => item.status === "PENDENTE")], [true, true, true]);

    const aprovada2 = await aprovarSugestao(sugestao.id, { usuario: "ZZ-IA-TESTE", edicao: { assunto: "ZZ-IA Projeto simples" } });
    const notaAprovada = await prisma.conhecimentoIA.findUnique({ where: { id: aprovada2.conhecimentoId } });
    conferir("aprovar cria conhecimento aprovado e liga", [aprovada2.status, notaAprovada.status], ["APROVADA", "APROVADO"]);
    conferir(
      "a nota leva a edicao, a correcao, os produtos e a origem",
      [notaAprovada.assunto, notaAprovada.conteudo, notaAprovada.produtos, notaAprovada.origemMensagemId, notaAprovada.aprovadoPor, aprovada2.decididoPor],
      ["ZZ-IA Projeto simples", "Projeto simples: Nano ou Uno", ["ZZ-IA-UNO"], r1.mensagem.id, "ZZ-IA-TESTE", "ZZ-IA-TESTE"],
    );
    conferir("aprovar duas vezes", await mensagemDe(aprovarSugestao(sugestao.id, { usuario: "ZZ-IA-TESTE" })), "Esta sugestão já foi decidida.");
    const semEdicao = await aprovarSugestao(sugestaoDeLista.id, { usuario: "ZZ-IA-TESTE" });
    conferir("sem edicao, o problema vira o assunto", (await prisma.conhecimentoIA.findUnique({ where: { id: semEdicao.conhecimentoId } })).assunto, "ZZ-IA bateria 9V");

    const rejeitada = await rejeitarSugestao(sugestaoDaReserva.id, { usuario: "ZZ-IA-TESTE", motivo: "nao e regra, foi so desse cliente" });
    conferir("rejeitar guarda quem, quando e por que", [rejeitada.status, rejeitada.decididoPor, rejeitada.motivoRejeicao, rejeitada.decididoEm instanceof Date, rejeitada.conhecimentoId], ["REJEITADA", "ZZ-IA-TESTE", "nao e regra, foi so desse cliente", true, null]);
    conferir("rejeitar decidida", await mensagemDe(rejeitarSugestao(sugestaoDaReserva.id, { usuario: "ZZ-IA-TESTE", motivo: "" })), "Esta sugestão já foi decidida.");
    conferir(
      "a rejeitada sai das pendentes e aparece nas rejeitadas",
      [(await listarSugestoes({ status: "PENDENTE" })).some((item) => item.id === sugestaoDaReserva.id), (await listarSugestoes({ status: "REJEITADA" })).some((item) => item.id === sugestaoDaReserva.id)],
      [false, true],
    );

    // --- propor correcao (o administrador escreve a regra) ---
    const correcao = await proporCorrecao({ mensagemId: r1.mensagem.id, problema: "ZZ-IA Mega para LED", regra: "Mega so com muitos pinos", produtos: ["zz-ia-uno", "ZZ-IA-UNO"], usuario: "ZZ-IA-TESTE" });
    conferir("propor correcao ja e aprovado", [correcao.status, correcao.aprovadoPor, correcao.origemMensagemId], ["APROVADO", "ZZ-IA-TESTE", r1.mensagem.id]);
    conferir("propor correcao: assunto, conteudo e produtos sem repetir", [correcao.assunto, correcao.conteudo, correcao.produtos], ["ZZ-IA Mega para LED", "Mega so com muitos pinos", ["ZZ-IA-UNO"]]);
    conferir("propor correcao sem mensagem de origem", (await proporCorrecao({ problema: "ZZ-IA regra solta", regra: "Regra escrita direto pelo dono", usuario: "ZZ-IA-TESTE" })).origemMensagemId, null);
    conferir("propor correcao: mensagem que nao existe", await mensagemDe(proporCorrecao({ mensagemId: "nao-existe", problema: "ZZ-IA x", regra: "regra", usuario: "ZZ-IA-TESTE" })), "Mensagem não encontrada.");
    conferir("propor correcao: assunto curto demais", await mensagemDe(proporCorrecao({ problema: "ab", regra: "regra valida", usuario: "ZZ-IA-TESTE" })), "O assunto precisa ter de 3 a 120 caracteres.");

    // --- a revisao do dia ---
    const dia = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const doDia = await conversasDoDia(dia, { administrador: true });
    const grupo = (conversa) => (conversa.sinalizada ? 0 : conversa.suspeita ? 1 : 2);
    conferir("sinalizada vem antes da suspeita", doDia.findIndex((conversa) => conversa.id === r1.conversaId) < doDia.findIndex((conversa) => conversa.id === r2.conversaId), true);
    conferir("a lista segue a ordem: sinalizadas, suspeitas, demais", doDia.map(grupo), [...doDia.map(grupo)].sort((a, b) => a - b));
    conferir("suspeita por reserva", doDia.find((conversa) => conversa.id === r2.conversaId).suspeita, true);
    const deR1 = doDia.find((conversa) => conversa.id === r1.conversaId);
    conferir(
      "a conversa traz titulo, quem, hora, respostas, modelos e custo",
      [typeof deR1.titulo, deR1.usuario, /^\d\d:\d\d$/.test(deR1.horaInicio), deR1.respostas >= 1, deR1.modelos.includes("lmstudio/falso-1"), typeof deR1.custoBrl, deR1.sinalizada, deR1.revisadaEm],
      ["string", "ZZ-IA-TESTE", true, true, true, "number", true, null],
    );
    conferir("nao administrador nao lista", await mensagemDe(conversasDoDia(dia, { administrador: false })), "Só administradores do Rise AI podem ver a revisão.");
    const resumo = await resumoDoDia(dia);
    conferir("resumo do dia soma custo e conta respostas por modelo", [typeof resumo.custoBrl, resumo.respostasPorModelo["lmstudio/falso-1"] >= 1, resumo.respostasPorModelo["anthropic/claude-haiku-5-5"] >= 1], ["number", true, true]);

    const antes = (await prisma.conversaIA.findUnique({ where: { id: r2.conversaId } })).atualizadoEm;
    await marcarRevisada(r2.conversaId, "ZZ-IA-TESTE");
    const depois = await prisma.conversaIA.findUnique({ where: { id: r2.conversaId } });
    conferir("marcar revisada grava quem e quando, sem mexer na ordem da lista de quem conversou", [depois.revisadaPor, depois.revisadaEm instanceof Date, depois.atualizadoEm.getTime()], ["ZZ-IA-TESTE", true, antes.getTime()]);
    conferir("a conversa revisada aparece com a hora", (await conversasDoDia(dia, { administrador: true })).find((conversa) => conversa.id === r2.conversaId).revisadaEm !== null, true);
    await prisma.mensagemIA.create({ data: { conversaId: r2.conversaId, papel: "USUARIO", conteudo: "mais uma pergunta depois da revisao", criadoEm: new Date(Date.now() + 5000) } });
    conferir("mensagem nova depois da revisao volta a conversa para a fila", (await conversasDoDia(dia, { administrador: true })).find((conversa) => conversa.id === r2.conversaId).revisadaEm, null);
    conferir("marcar revisada: conversa que nao existe", await mensagemDe(marcarRevisada("nao-existe", "ZZ-IA-TESTE")), "Conversa não encontrada.");

    // As acoes, paginas e rotas do Rise AI nao rodam em Node puro (next/cache, next/headers). O que se garante aqui
    // (Acessos, lancamento 1): TODA acao exportada passa por `executarComAcesso` com um recurso do catalogo e um nivel
    // valido; toda pagina, layout e rota confere o acesso antes de ler; o involucro antigo e o acesso.js sumiram.
    {
      const { readFileSync, existsSync, readdirSync, statSync } = await import("node:fs");
      const { join } = await import("node:path");
      const { recursoPorId, validarNivel } = await import("../src/lib/acessos/recursos.js");
      const { RECURSO_DA_ABA } = await import("../src/lib/riseAi/abasDeConfiguracao.js");
      const { fileURLToPath } = await import("node:url");
      const raiz = fileURLToPath(new URL("../", import.meta.url));
      const ler = (caminho) => readFileSync(join(raiz, caminho), "utf8").replace(/\r\n/g, "\n");
      const acoesDe = (fonte) => [...fonte.matchAll(/export async function (\w+)\([^)]*\) \{\n([\s\S]*?)\n\}\n/g)];
      for (const [arquivo, minimo] of [["src/app/rise-ai/acoes.js", 5], ["src/app/rise-ai/revisao/acoes.js", 10], ["src/app/rise-ai/configuracoes/acoes.js", 5]]) {
        const acoes = acoesDe(ler(arquivo));
        conferir(`${arquivo}: tem as acoes esperadas`, acoes.length >= minimo, true);
        const fora = acoes.filter(([, , corpo]) => {
          // O recurso e um literal do catalogo ou, na acao que salva uma aba, o da aba (`RECURSO_DA_ABA[aba]`): nesse caso as quatro valem.
          const casou = /^\s*return executarComAcesso\(("[\w.]+"|RECURSO_DA_ABA\[aba\]), "(\w+)",/.exec(corpo);
          if (!casou) return true;
          const recursos = casou[1] === "RECURSO_DA_ABA[aba]" ? Object.values(RECURSO_DA_ABA) : [casou[1].slice(1, -1)];
          return recursos.some((id) => !recursoPorId(id) || !validarNivel(id, casou[2]));
        });
        conferir(`${arquivo}: toda acao passa por executarComAcesso com recurso e nivel do catalogo`, fora.map(([, nome]) => nome), []);
      }
      const arquivosDe = (pasta) =>
        readdirSync(join(raiz, pasta)).flatMap((nome) => {
          const caminho = `${pasta}/${nome}`;
          return statSync(join(raiz, caminho)).isDirectory() ? arquivosDe(caminho) : [caminho];
        });
      const telas = [...arquivosDe("src/app/rise-ai"), ...arquivosDe("src/app/api/rise-ai")].filter((caminho) => /\/(page|layout)\.jsx$|\/route\.js$/.test(caminho));
      conferir("as paginas, layouts e rotas do Rise AI que o guarda olha", telas.length >= 7, true);
      conferir(
        "toda pagina, layout e rota do Rise AI confere o acesso",
        telas.filter((caminho) => {
          const fonte = ler(caminho);
          return caminho.endsWith("route.js") ? !(fonte.includes("sessaoDeAcessos(") && fonte.includes("recusarRota(")) : !fonte.includes("exigirAcessoNaPagina(");
        }),
        [],
      );
      conferir("o involucro antigo e o acesso.js sairam", [existsSync(join(raiz, "src/app/rise-ai/administrador.js")), existsSync(join(raiz, "src/lib/riseAi/acesso.js"))], [false, false]);
    }

    // --- o que as telas da revisao usam (puro: roda no servidor e as acoes o chamam) ---
    const { codigosDoTexto, camposDoFormulario } = await import("../src/lib/riseAi/formularios.js");
    const { hojeEmSaoPaulo } = await import("../src/lib/riseAi/revisao.js");
    const { conhecimentoParaTela, listarConhecimento } = await import("../src/lib/riseAi/conhecimento.js");
    conferir("codigos do texto: virgula, ponto e virgula, espaco e quebra de linha; sem vazios", [codigosDoTexto(" a, B;c\n d ,,"), codigosDoTexto(null), codigosDoTexto("")], [["a", "B", "c", "d"], [], []]);
    const formulario = new FormData();
    formulario.set("assunto", "  Titulo  ");
    formulario.set("conteudo", "   ");
    formulario.set("produtos", "a, b");
    conferir(
      "campos do formulario: so o que foi preenchido (vazio nao e edicao), aparado",
      camposDoFormulario(formulario, ["assunto", "conteudo", "fonte"]),
      { assunto: "Titulo" },
    );
    conferir("hoje em Sao Paulo e o dia que a revisao abre", [hojeEmSaoPaulo(), /^\d{4}-\d{2}-\d{2}$/.test(hojeEmSaoPaulo())], [dia, true]);
    const notasDaTela = (await listarConhecimento({ busca: "ZZ-IA Projeto simples" })).map(conhecimentoParaTela);
    conferir(
      "a nota vai para a tela so com texto e numeros simples",
      [notasDaTela.length, typeof notasDaTela[0].atualizadoEm, notasDaTela[0].aprovadoPor, notasDaTela[0].produtos, notasDaTela[0].versao, "origemMensagemId" in notasDaTela[0]],
      [1, "string", "ZZ-IA-TESTE", ["ZZ-IA-UNO"], 1, false],
    );
  }

  // -------------------------------------------------------------------------
  // Tarefa 13 — Configuracoes e Consumo
  // -------------------------------------------------------------------------
  {
    const { consumoPorDia, totaisDoPeriodo, periodoDosUltimosDias } = await import("../src/lib/riseAi/consumo.js");
    const { parcialDaConfiguracao, idsDosModelos } = await import("../src/lib/riseAi/formularios.js");
    const { configuracaoPadrao, validarConfiguracao } = await import("../src/lib/riseAi/configuracao.js");
    const { PROMPT_ATENDIMENTO_PADRAO, PROMPT_INTERNO_PADRAO } = await import("../src/lib/riseAi/prompt.js");
    console.log("\nConsumo");

    // --- o consumo por dia, provedor e modelo (as conversas dos blocos anteriores estao no banco) ---
    const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const linhas = await consumoPorDia({ de: hoje, ate: hoje });
    const doFalso = linhas.filter((linha) => linha.provedor === "lmstudio" && linha.modelo === "falso-1");
    conferir("agrega por dia e modelo", doFalso.length === 1 && doFalso[0].respostas >= 1 && doFalso[0].dia === hoje, true);
    conferir("conta reservas e negativas", linhas.some((linha) => linha.reservas >= 1) && linhas.some((linha) => linha.negativas >= 1), true);
    conferir("conta as falhas", linhas.some((linha) => linha.falhas >= 1), true);
    const daReserva = linhas.find((linha) => linha.provedor === "anthropic" && linha.modelo === "claude-haiku-5-5");
    conferir(
      "tokens e custo do dia sao numeros (a reserva tem preco)",
      [typeof daReserva.tokensEntrada, typeof daReserva.custoBrl, typeof daReserva.custoUsd, typeof daReserva.duracaoMediaMs, daReserva.custoBrl > 0, daReserva.semCusto],
      ["number", "number", "number", "number", true, 0],
    );
    const { limitesDoDia: limitesDeHoje } = await import("../src/lib/riseAi/revisao.js");
    const doDiaNoBanco = { papel: "ASSISTENTE", provedor: "lmstudio", modelo: "falso-1", criadoEm: { gte: limitesDeHoje(hoje).inicio, lt: limitesDeHoje(hoje).fim } };
    conferir(
      "resposta de erro conta como falha, nao como resposta",
      [doFalso[0].respostas + doFalso[0].falhas, doFalso[0].falhas],
      [await prisma.mensagemIA.count({ where: doDiaNoBanco }), await prisma.mensagemIA.count({ where: { ...doDiaNoBanco, avisos: { has: "erro" } } })],
    );
    conferir("o dia vem em texto AAAA-MM-DD (fuso de Sao Paulo)", linhas.every((linha) => /^\d{4}-\d{2}-\d{2}$/.test(linha.dia)), true);
    conferir("dia sem conversa: lista vazia", await consumoPorDia({ de: "2020-01-01", ate: "2020-01-02" }), []);
    conferir(
      "periodo invalido",
      [
        await consumoPorDia({ de: hoje, ate: "2020-01-01" }).then(() => "ok", (erro) => erro.message),
        await consumoPorDia({ de: "ontem", ate: hoje }).then(() => "ok", (erro) => erro.message),
        await consumoPorDia({ de: "2020-01-01", ate: hoje }).then(() => "ok", (erro) => erro.message),
      ],
      ["Período inválido.", "Dia inválido.", "O período passa de 366 dias."],
    );

    const totais = totaisDoPeriodo([
      { respostas: 2, tokensEntrada: 100, tokensSaida: 10, custoBrl: 0.5, custoUsd: 0.1, duracaoMediaMs: 1000, reservas: 1, falhas: 0, negativas: 1, semResultado: 0, semCusto: 0 },
      { respostas: 6, tokensEntrada: 300, tokensSaida: 30, custoBrl: 0.25, custoUsd: 0.05, duracaoMediaMs: 2000, reservas: 0, falhas: 1, negativas: 0, semResultado: 1, semCusto: 3 },
    ], [{ brl: 0.1209 }, { brl: 0.5 }]);
    conferir(
      "totais do periodo somam e ponderam o tempo medio pelas respostas",
      totais,
      { respostas: 8, tokensEntrada: 400, tokensSaida: 40, custoBrl: 0.75, custoUsd: 0.15, outrosBrl: 0.6209, duracaoMediaMs: 1750, reservas: 1, falhas: 1, negativas: 1, semResultado: 1, semCusto: 3 },
    );
    conferir("totais de nada", [totaisDoPeriodo([]).respostas, totaisDoPeriodo([]).outrosBrl], [0, 0]);
    conferir("a coluna e a contagem Sem separacao sairam do consumo", [linhas.some((linha) => "semSeparacao" in linha), "semSeparacao" in totais], [false, false]);
    conferir("os ultimos 7 dias incluem hoje", [periodoDosUltimosDias(7, "2026-10-11"), periodoDosUltimosDias(30, "2026-03-05")], [{ de: "2026-10-05", ate: "2026-10-11" }, { de: "2026-02-04", ate: "2026-03-05" }]);

    // --- o formulario de configuracoes vira o parcial que `gravarConfiguracao` entende ---
    const formulario = (campos) => {
      const dados = new FormData();
      for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor);
      return dados;
    };
    conferir("formulario vazio: nada para gravar", parcialDaConfiguracao(formulario({})), {});
    conferir(
      "formulario: padrao, reserva, tempos, limites e endereco",
      parcialDaConfiguracao(
        formulario({
          padraoProvedor: "ollama",
          padraoModelo: " qwen3:4b ",
          reservaProvedor: "anthropic",
          reservaModelo: "claude-haiku-5-5",
          primeiroTokenMs: "30000",
          totalMs: "120000",
          maxChamadasDeFerramenta: "6",
          maxTokensResposta: "1200",
          contextoMaxTokens: "10000",
          taxaPorUsuarioPorMinuto: "15",
          "endpoint.lmstudio": " http://192.168.0.5:1234/v1 ",
        }),
      ),
      {
        padrao: { provedor: "ollama", modelo: "qwen3:4b" },
        reserva: { provedor: "anthropic", modelo: "claude-haiku-5-5" },
        tempoLimite: { primeiroTokenMs: 30000, totalMs: 120000 },
        maxChamadasDeFerramenta: 6,
        maxTokensResposta: 1200,
        contextoMaxTokens: 10000,
        taxaPorUsuarioPorMinuto: 15,
        endpoints: { lmstudio: "http://192.168.0.5:1234/v1" },
      },
    );
    conferir("reserva sem provedor = sem reserva", parcialDaConfiguracao(formulario({ reservaProvedor: "", reservaModelo: "claude-haiku-5-5" })), { reserva: null });
    conferir("prompt igual ao padrao do codigo = nulo (uma melhoria futura do padrao chega a quem nunca mexeu)", parcialDaConfiguracao(formulario({ promptAtendimento: `  ${PROMPT_ATENDIMENTO_PADRAO}\r\n` })), { prompts: { atendimento: null } });
    conferir("prompt interno igual ao padrao do codigo = nulo", parcialDaConfiguracao(formulario({ promptInterno: `  ${PROMPT_INTERNO_PADRAO}\r\n` })), { prompts: { interno: null } });
    conferir("os dois prompts no mesmo formulario", parcialDaConfiguracao(formulario({ promptInterno: "A", promptAtendimento: "B" })), { prompts: { atendimento: "B", interno: "A" } });
    conferir("os dois prompts nascem nulos", configuracaoPadrao("pc").prompts, { atendimento: null, interno: null });
    conferir("prompt interno acima de 12000 caracteres e recusado no campo", Object.keys(validarConfiguracao({ ...configuracaoPadrao("pc"), prompts: { atendimento: null, interno: "x".repeat(12001) } }).erros ?? {}), ["prompts.interno"]);
    conferir("prompt vazio = nulo", parcialDaConfiguracao(formulario({ promptAtendimento: "   " })), { prompts: { atendimento: null } });
    conferir("prompt proprio vai aparado e com quebras de linha do Unix", parcialDaConfiguracao(formulario({ promptAtendimento: "  Tom: formal.\r\nSem emoji.  " })), { prompts: { atendimento: "Tom: formal.\nSem emoji." } });
    conferir("numero em branco ou com letra nao e aceito (o aviso do campo vem da validacao)", [parcialDaConfiguracao(formulario({ totalMs: "" })).tempoLimite.totalMs, parcialDaConfiguracao(formulario({ maxTokensResposta: "mil" })).maxTokensResposta].map(Number.isNaN), [true, true]);
    const invalida = validarConfiguracao({ ...configuracaoPadrao("pc"), ...parcialDaConfiguracao(formulario({ maxTokensResposta: "mil" })) });
    conferir("e a validacao diz qual campo", [invalida.ok, invalida.erros?.maxTokensResposta], [false, "Tokens por resposta: informe um número."]);
    conferir(
      "ids dos modelos marcados: sem vazios nem repetidos, aparados",
      idsDosModelos((() => { const dados = new FormData(); for (const id of [" a ", "b", "", "a", "c"]) dados.append("modelo", id); return dados; })()),
      ["a", "b", "c"],
    );
  }

  // -------------------------------------------------------------------------
  // Tarefa 14 — Trava de renovacao do token e estoque automatico
  // -------------------------------------------------------------------------
  {
    const { comTravaDeRenovacao, obterTokenSobTrava } = await import("../src/lib/integracoes/travaDeRenovacao.js");
    const { deveSincronizarEstoque, rodarSincronizacaoDeEstoque } = await import("../src/lib/riseAi/estoqueAutomatico.js");
    const { lerConexao, lerSegredo } = await import("../src/lib/integracoes/conexoes.js");
    console.log("\nTrava de renovacao e estoque automatico");

    const ordem = [];
    await Promise.all([
      comTravaDeRenovacao("zz-ia-teste", async () => {
        ordem.push("a-entrou");
        await new Promise((resolver) => setTimeout(resolver, 300));
        ordem.push("a-saiu");
      }),
      (async () => {
        await new Promise((resolver) => setTimeout(resolver, 50));
        await comTravaDeRenovacao("zz-ia-teste", async () => {
          ordem.push("b-entrou");
        });
      })(),
    ]);
    conferir("segunda renovacao espera a primeira", ordem, ["a-entrou", "a-saiu", "b-entrou"]);

    const outraChave = [];
    await Promise.all([
      comTravaDeRenovacao("zz-ia-teste-a", async () => {
        outraChave.push("a-entrou");
        await new Promise((resolver) => setTimeout(resolver, 300));
        outraChave.push("a-saiu");
      }),
      (async () => {
        await new Promise((resolver) => setTimeout(resolver, 50));
        await comTravaDeRenovacao("zz-ia-teste-b", async () => {
          outraChave.push("b-entrou");
        });
      })(),
    ]);
    conferir("chaves diferentes nao se esperam", outraChave, ["a-entrou", "b-entrou", "a-saiu"]);
    conferir("a funcao recebe a transacao e o valor volta", await comTravaDeRenovacao("zz-ia-teste", async (tx) => [typeof tx.$queryRaw, 42].join(":")), "function:42");
    conferir("erro dentro da trava solta a trava e propaga", [await comTravaDeRenovacao("zz-ia-teste", async () => { throw new Error("falhou"); }).then(() => "ok", (erro) => erro.message), await comTravaDeRenovacao("zz-ia-teste", async () => "livre")], ["falhou", "livre"]);

    // O que aconteceu em 08/10/2026: dois processos renovam o token ao mesmo tempo, o segundo usa um refresh token que o
    // primeiro ja queimou, e a conexao morre. Com a trava, quem espera RELE o estado e encontra o token novo.
    const estado = { token: "velho", expiraEm: 0 };
    let renovacoes = 0;
    const renovar = async () => {
      renovacoes++;
      await new Promise((resolver) => setTimeout(resolver, 150));
      estado.token = `novo-${renovacoes}`;
      estado.expiraEm = Date.now() + 3600000;
      return estado.token;
    };
    const tokens = await Promise.all(
      [0, 1, 2, 3].map(() =>
        obterTokenSobTrava("zz-ia-teste-token", {
          ler: async () => ({ ...estado }),
          tokenValido: (lido) => (lido.expiraEm > Date.now() ? lido.token : null),
          renovar,
        }),
      ),
    );
    conferir("quatro pedidos ao mesmo tempo, uma renovacao so, todos com o token novo", [renovacoes, tokens], [1, ["novo-1", "novo-1", "novo-1", "novo-1"]]);
    conferir(
      "token que ainda vale nem pede a trava",
      await obterTokenSobTrava("zz-ia-teste-token", { ler: async () => ({ ...estado }), tokenValido: (lido) => lido.token, renovar: async () => { throw new Error("nao devia renovar"); } }),
      "novo-1",
    );
    conferir("o erro de quem le (nao conectado) sobe sem renovar", await obterTokenSobTrava("zz-ia-teste-token", { ler: async () => ({}), tokenValido: () => { throw new Error("nao conectado"); }, renovar }).then(() => "ok", (erro) => erro.message), "nao conectado");

    // lerSegredo e lerConexao aceitam a transacao e leem o mesmo (a conexao OLLAMA e a do teste: a do dono e devolvida no fim).
    conferir("ler com a transacao = ler sem ela", await prisma.$transaction(async (tx) => [await lerConexao("OLLAMA", tx), await lerSegredo("OLLAMA", tx)]), [await lerConexao("OLLAMA"), await lerSegredo("OLLAMA")]);

    conferir("desligado nao roda", deveSincronizarEstoque({ agora: 10, ultimaEm: 0, ligado: false, blingConectado: true }), { deve: false, motivo: "desligado" });
    conferir("bling desconectado nao roda", deveSincronizarEstoque({ agora: 1e9, ultimaEm: 0, blingConectado: false }), { deve: false, motivo: "bling_desconectado" });
    conferir("cedo demais", deveSincronizarEstoque({ agora: 1000, ultimaEm: 0, blingConectado: true }), { deve: false, motivo: "cedo" });
    conferir("na hora", deveSincronizarEstoque({ agora: 3600001, ultimaEm: 0, blingConectado: true }), { deve: true, motivo: null });
    conferir("exatamente uma hora depois ja vale", deveSincronizarEstoque({ agora: 3600000, ultimaEm: 0, blingConectado: true }), { deve: true, motivo: null });
    conferir("intervalo proprio", deveSincronizarEstoque({ agora: 1000, ultimaEm: 0, intervaloMs: 500, blingConectado: true }), { deve: true, motivo: null });
    conferir("rodar com a variavel desligada", await rodarSincronizacaoDeEstoque({ env: { ESTOQUE_AUTOMATICO_BLING: "false" } }), { rodou: false, motivo: "desligado" });
    conferir("a variavel vale sem diferenciar caixa nem espacos", await rodarSincronizacaoDeEstoque({ env: { ESTOQUE_AUTOMATICO_BLING: " FALSE " } }), { rodou: false, motivo: "desligado" });
  }

  // -------------------------------------------------------------------------
  // Tarefa 15 — Tunel do PC (SSH reverso ate o LM Studio)
  // -------------------------------------------------------------------------
  {
    const { argumentosDoTunel, proximaEspera, lerEstadoDoTunel, gravarEstadoDoTunel, textoDoEstadoDoTunel } = await import("../src/lib/riseAi/tunelPc.js");
    const { mkdtempSync, readdirSync, rmSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    console.log("\nTunel do PC");

    conferir(
      "argumentos do ssh",
      argumentosDoTunel({ chave: "k", vps: "rise@vps" }),
      ["-N", "-R", "172.17.0.1:1234:127.0.0.1:1234", "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3", "-i", "k", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15", "rise@vps"],
    );
    conferir("bind e porta proprios", argumentosDoTunel({ bind: "172.18.0.1", porta: 11434, chave: "k", vps: "v" }).slice(0, 3), ["-N", "-R", "172.18.0.1:11434:127.0.0.1:11434"]);
    const recusa = (opcoes) => { try { argumentosDoTunel({ chave: "k", vps: "v", ...opcoes }); return "aceitou"; } catch (erro) { return erro.message; } };
    conferir(
      "a porta do PC nunca abre para a internet: bind aberto, vazio ou que nao e IP e recusado",
      [recusa({ bind: "0.0.0.0" }), recusa({ bind: "*" }), recusa({ bind: "" }), recusa({ bind: "localhost" }), recusa({ bind: "172.17.0.1; rm" })],
      Array(5).fill("O endereço do túnel na VPS tem que ser um IP fechado (como 172.17.0.1), nunca 0.0.0.0."),
    );
    conferir("porta invalida", [recusa({ porta: 0 }), recusa({ porta: 70000 }), recusa({ porta: "abc" })], Array(3).fill("A porta do túnel tem que ser um número de 1 a 65535."));
    conferir("sem chave ou sem destino", [recusa({ chave: "" }), recusa({ vps: "" })], ["Informe a chave SSH e o destino (usuario@host).", "Informe a chave SSH e o destino (usuario@host)."]);

    conferir("espera cresce ate 2 min", [proximaEspera(0), proximaEspera(1), proximaEspera(2), proximaEspera(3), proximaEspera(4), proximaEspera(5), proximaEspera(9)], [5000, 10000, 20000, 40000, 80000, 120000, 120000]);
    conferir("espera: valor estranho volta ao comeco", [proximaEspera(-3), proximaEspera(Number.NaN), proximaEspera(undefined)], [5000, 5000, 5000]);

    const agora = new Date("2026-10-11T18:00:00Z");
    conferir(
      "texto do estado: no ar (hora de Sao Paulo)",
      textoDoEstadoDoTunel({ inicioEm: "2026-10-11T17:02:00.000Z", conectadoEm: "2026-10-11T17:02:00.000Z", quedas: 0 }, agora),
      "Túnel do Rise AI: no ar desde 14:02",
    );
    conferir("texto do estado: no ar desde outro dia traz a data", textoDoEstadoDoTunel({ inicioEm: "2026-10-09T17:02:00.000Z", conectadoEm: "2026-10-09T17:02:00.000Z", quedas: 0 }, agora), "Túnel do Rise AI: no ar desde 09/10 14:02");
    conferir(
      "texto do estado: caiu e esta religando",
      textoDoEstadoDoTunel({ inicioEm: "2026-10-11T17:02:00.000Z", conectadoEm: "2026-10-11T17:02:00.000Z", fimEm: "2026-10-11T17:40:00.000Z", motivo: "ssh saiu com 255", quedas: 1 }, agora),
      "Túnel do Rise AI: caiu às 14:40 (religando)",
    );
    conferir(
      "texto do estado: religou depois de cair (a conexao nova e mais recente que a queda)",
      textoDoEstadoDoTunel({ inicioEm: "2026-10-11T17:02:00.000Z", conectadoEm: "2026-10-11T17:41:00.000Z", fimEm: "2026-10-11T17:40:00.000Z", quedas: 1 }, agora),
      "Túnel do Rise AI: no ar desde 14:41",
    );
    conferir("texto do estado: ainda conectando", textoDoEstadoDoTunel({ inicioEm: "2026-10-11T17:59:00.000Z", quedas: 0 }, agora), "Túnel do Rise AI: conectando…");
    conferir("texto do estado: nunca rodou", textoDoEstadoDoTunel(null, agora), "Túnel do Rise AI: parado");
    conferir("texto do estado: encerrado de proposito", textoDoEstadoDoTunel({ inicioEm: "2026-10-11T17:02:00.000Z", conectadoEm: "2026-10-11T17:02:00.000Z", fimEm: "2026-10-11T17:50:00.000Z", motivo: "encerrado" }, agora), "Túnel do Rise AI: parado");
    conferir(
      "texto do estado: o processo morreu sem avisar (estado velho nao vale)",
      textoDoEstadoDoTunel({ inicioEm: "2026-10-11T17:02:00.000Z", conectadoEm: "2026-10-11T17:02:00.000Z", quedas: 0 }, agora, { vivo: false }),
      "Túnel do Rise AI: parado",
    );

    // O sshd da VPS (GatewayPorts no, medido em 11/10/2026) ACEITA o -R com o IP da ponte mas abre a porta so no loopback:
    // o ssh fica conectado e inutil, e sem esta conferencia o script diria "tunel no ar". `ss -ltn` na VPS diz onde abriu.
    const { portaNaPonte, argumentosDeConferencia } = await import("../src/lib/riseAi/tunelPc.js");
    const cabecalho = "State  Recv-Q Send-Q Local Address:Port Peer Address:Port Process\n";
    conferir(
      "porta aberta na ponte do Docker",
      [
        portaNaPonte(`${cabecalho}LISTEN 0 128 172.17.0.1:1234 0.0.0.0:*\nLISTEN 0 128 0.0.0.0:22 0.0.0.0:*\n`, "172.17.0.1", 1234),
        portaNaPonte(`${cabecalho}LISTEN 0 128 0.0.0.0:1234 0.0.0.0:*\n`, "172.17.0.1", 1234),
      ],
      ["ok", "ok"],
    );
    conferir(
      "porta aberta so no loopback: o conteiner nao alcanca",
      [portaNaPonte(`${cabecalho}LISTEN 0 128 127.0.0.1:1234 0.0.0.0:*\nLISTEN 0 128 [::1]:1234 [::]:*\n`, "172.17.0.1", 1234), portaNaPonte(`${cabecalho}LISTEN 0 128 [::1]:1234 [::]:*\n`, "172.17.0.1", 1234)],
      ["so_loopback", "so_loopback"],
    );
    conferir(
      "porta nao aberta, ou outra porta, ou texto vazio",
      [portaNaPonte(`${cabecalho}LISTEN 0 128 0.0.0.0:22 0.0.0.0:*\nLISTEN 0 128 127.0.0.1:12345 0.0.0.0:*\n`, "172.17.0.1", 1234), portaNaPonte("", "172.17.0.1", 1234), portaNaPonte(null, "172.17.0.1", 1234)],
      ["ausente", "ausente", "ausente"],
    );
    conferir("a ponte vence o loopback quando as duas existem", portaNaPonte(`${cabecalho}LISTEN 0 128 127.0.0.1:1234 0.0.0.0:*\nLISTEN 0 128 172.17.0.1:1234 0.0.0.0:*\n`, "172.17.0.1", 1234), "ok");
    conferir("porta com final igual de outra nao conta (11234 nao e 1234)", portaNaPonte(`${cabecalho}LISTEN 0 128 172.17.0.1:11234 0.0.0.0:*\n`, "172.17.0.1", 1234), "ausente");
    conferir(
      "conferencia: ssh de leitura, sem -R e sem -N",
      argumentosDeConferencia({ chave: "k", vps: "rise@vps" }),
      ["-i", "k", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15", "rise@vps", "ss -ltn"],
    );
    conferir(
      "texto do estado: conectado mas a porta so abriu no loopback da VPS",
      textoDoEstadoDoTunel({ inicioEm: "2026-10-11T17:02:00.000Z", conectadoEm: "2026-10-11T17:02:00.000Z", alcance: "so_loopback", quedas: 0 }, agora),
      "Túnel do Rise AI: conectado, mas a VPS abriu a porta só em 127.0.0.1 e o Rise não a alcança (falta GatewayPorts clientspecified)",
    );
    conferir(
      "texto do estado: alcance conferido",
      textoDoEstadoDoTunel({ inicioEm: "2026-10-11T17:02:00.000Z", conectadoEm: "2026-10-11T17:02:00.000Z", alcance: "ok", quedas: 0 }, agora),
      "Túnel do Rise AI: no ar desde 14:02",
    );

    const pasta = mkdtempSync(join(tmpdir(), "rise-ia-pc-"));
    try {
      conferir("estado que nunca foi gravado", lerEstadoDoTunel(pasta), null);
      gravarEstadoDoTunel(pasta, { pid: 123, inicioEm: "2026-10-11T17:02:00.000Z", conectadoEm: null, quedas: 2, fimEm: null, motivo: null });
      conferir("grava e le de volta", lerEstadoDoTunel(pasta), { pid: 123, inicioEm: "2026-10-11T17:02:00.000Z", conectadoEm: null, quedas: 2, fimEm: null, motivo: null });
      conferir("a gravacao nao deixa arquivo temporario", readdirSync(pasta), ["ia-pc.estado.json"]);
      writeFileSync(join(pasta, "ia-pc.estado.json"), "{ pela metade");
      conferir("arquivo quebrado vale como sem estado", lerEstadoDoTunel(pasta), null);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  }

  // -------------------------------------------------------------------------
  // Entrega A1, Tarefa 1 — Banco: GastoIA, ReservaDeGastoIA, VersaoDePromptIA e MensagemIA.interrompida
  // -------------------------------------------------------------------------
  console.log("\nEntrega A: banco");
  {
    const conversaA = await prisma.conversaIA.create({ data: { titulo: "ZZ-IA A1 banco", usuario: "ZZ-IA-TESTE" } });
    const cortada = await prisma.mensagemIA.create({
      data: { conversaId: conversaA.id, papel: "ASSISTENTE", conteudo: "texto parcial", interrompida: true, avisos: [] },
    });
    const normal = await prisma.mensagemIA.create({ data: { conversaId: conversaA.id, papel: "ASSISTENTE", conteudo: "inteira", avisos: [] } });
    conferir("mensagem interrompida", (await prisma.mensagemIA.findUnique({ where: { id: cortada.id } })).interrompida, true);
    conferir("interrompida nasce falsa", (await prisma.mensagemIA.findUnique({ where: { id: normal.id } })).interrompida, false);

    const gasto = await prisma.gastoIA.create({
      data: { tipo: "BUSCA", provedor: "anthropic", valorUsd: 0.01, valorBrl: 0.06, referencia: "ZZ-IA-ref", detalhe: { buscas: 1 } },
    });
    conferir("gasto nasce INTERNO", gasto.escopo, "INTERNO");
    conferir("gasto guarda o valor em reais", Number(gasto.valorBrl), 0.06);
    conferir("gasto guarda o detalhe", (await prisma.gastoIA.findUnique({ where: { id: gasto.id } })).detalhe, { buscas: 1 });

    await prisma.reservaDeGastoIA.create({ data: { escopo: "INTERNO", valorBrl: 1.5, dono: "ZZ-IA-dono", expiraEm: new Date(Date.now() + 60000) } });
    conferir("reserva gravada", await prisma.reservaDeGastoIA.count({ where: { dono: "ZZ-IA-dono" } }), 1);

    await prisma.versaoDePromptIA.create({ data: { canal: "zz-ia-interno", texto: "prompt", alteradoPor: "ZZ-IA-TESTE" } });
    conferir("versao de prompt gravada", await prisma.versaoDePromptIA.count({ where: { canal: "zz-ia-interno" } }), 1);
  }

  // -------------------------------------------------------------------------
  // Entrega A1, Tarefa 2 — Configuracao: orcamentos e internet
  // -------------------------------------------------------------------------
  console.log("\nEntrega A: configuracao");
  {
    const { configuracaoPadrao, validarConfiguracao, gravarConfiguracao, lerConfiguracao } = await import("../src/lib/riseAi/configuracao.js");
    const { parcialDaConfiguracao } = await import("../src/lib/riseAi/formularios.js");
    await prisma.configuracaoIA.deleteMany({ where: { id: "unica" } });

    conferir("padrao: orcamentos 70 e 30", configuracaoPadrao("pc").orcamentos, { clientesBrl: 70, internoBrl: 30 });
    conferir("padrao: internet desligada", configuracaoPadrao("pc").internet, false);

    const base = configuracaoPadrao("pc");
    const errosDe = (mudanca) => validarConfiguracao({ ...base, ...mudanca }).erros ?? {};
    conferir("orcamento negativo e recusado no campo certo", Object.keys(errosDe({ orcamentos: { clientesBrl: 70, internoBrl: -1 } })), ["orcamentos.internoBrl"]);
    conferir("orcamento NaN e recusado", Object.keys(errosDe({ orcamentos: { clientesBrl: 70, internoBrl: Number.NaN } })), ["orcamentos.internoBrl"]);
    conferir("orcamento acima de 5000 e recusado", Object.keys(errosDe({ orcamentos: { clientesBrl: 6000, internoBrl: 30 } })), ["orcamentos.clientesBrl"]);
    conferir("orcamento com 3 casas e recusado", Object.keys(errosDe({ orcamentos: { clientesBrl: 70, internoBrl: 10.123 } })), ["orcamentos.internoBrl"]);
    conferir("internet precisa ser booleano", Object.keys(errosDe({ internet: "sim" })), ["internet"]);
    conferir("orcamento valido passa", validarConfiguracao({ ...base, orcamentos: { clientesBrl: 70, internoBrl: 45.5 } }).ok, true);

    conferir("gravar o interno mantem o dos clientes", (await gravarConfiguracao({ orcamentos: { internoBrl: 45 } }, { usuario: "ZZ-IA-TESTE" })).ok, true);
    const lida = await lerConfiguracao("pc");
    conferir("lida: interno 45, clientes 70", lida.orcamentos, { clientesBrl: 70, internoBrl: 45 });
    conferir("salvar o orcamento nao mexe no padrao", lida.padrao, base.padrao);
    conferir("so o salvo e gravado", Object.keys((await prisma.configuracaoIA.findUnique({ where: { id: "unica" } })).dados), ["orcamentos"]);

    await prisma.configuracaoIA.update({ where: { id: "unica" }, data: { dados: { maxChamadasDeFerramenta: 5 } } });
    const antiga = await lerConfiguracao("pc");
    conferir("configuracao salva antes das chaves novas le com os padroes novos", [antiga.orcamentos, antiga.internet, antiga.maxChamadasDeFerramenta], [{ clientesBrl: 70, internoBrl: 30 }, false, 5]);

    const formulario = (campos) => {
      const dados = new FormData();
      for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor);
      return dados;
    };
    conferir("formulario: virgula decimal", parcialDaConfiguracao(formulario({ orcamentoInternoBrl: "45,50" })), { orcamentos: { internoBrl: 45.5 } });
    conferir("formulario: dos dois orcamentos", parcialDaConfiguracao(formulario({ orcamentoClientesBrl: "70", orcamentoInternoBrl: "30" })), { orcamentos: { clientesBrl: 70, internoBrl: 30 } });
    conferir("formulario: internet ligada", parcialDaConfiguracao(formulario({ internet: "true" })), { internet: true });
    conferir("formulario: internet desligada", parcialDaConfiguracao(formulario({ internet: "false" })), { internet: false });
    const vazio = await gravarConfiguracao(parcialDaConfiguracao(formulario({ orcamentoInternoBrl: "" })), { usuario: "ZZ-IA-TESTE" });
    conferir("orcamento vazio: erro no campo, nada gravado", [vazio.ok, vazio.erros?.["orcamentos.internoBrl"]], [false, "Orçamento interno: informe um número."]);
    const lixo = await gravarConfiguracao(parcialDaConfiguracao(formulario({ internet: "talvez" })), { usuario: "ZZ-IA-TESTE" });
    conferir("internet com valor estranho e recusada", [lixo.ok, Object.keys(lixo.erros ?? {})], [false, ["internet"]]);

    await prisma.configuracaoIA.deleteMany({ where: { id: "unica" } });
  }

  // -------------------------------------------------------------------------
  // Entrega A1, Tarefa 3 — Preco do GPT-4.1 mini e o adaptador da OpenAI
  // -------------------------------------------------------------------------
  console.log("\nEntrega A: OpenAI");
  {
    const { custoDaChamada, MODELOS_SUGERIDOS } = await import("../src/lib/riseAi/modelos.js");
    const { criarProvedorOpenAICompativel } = await import("../src/lib/riseAi/provedores/openaiCompativel.js");
    const { cotacaoDoDolar } = await import("../src/lib/cotacaoDolar.js");

    const milhao = custoDaChamada({ provedor: "openai", modelo: "gpt-4.1-mini", tokensEntrada: 1e6, tokensSaida: 1e6 });
    conferir("gpt-4.1-mini: US$ 0,40 de entrada + US$ 1,60 de saida por milhao", milhao?.usd, 2);
    conferir("gpt-4.1-mini em reais pela cotacao do sistema", milhao?.brl, Math.round(2 * cotacaoDoDolar().valor * 1e4) / 1e4);
    conferir("a tela sugere o gpt-4.1-mini para a OpenAI", MODELOS_SUGERIDOS.openai, ["gpt-4.1-mini"]);

    const sseCurto = `data: ${JSON.stringify({ choices: [{ delta: { content: "x" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`;
    const corpoDe = async (id) => {
      const guardado = [];
      const provedor = criarProvedorOpenAICompativel({
        id,
        rotulo: id,
        endpoint: "http://falso/v1",
        chave: id === "openai" ? "sk-falsa" : null,
        fetchImpl: async (url, init) => {
          guardado.push(JSON.parse(init.body));
          return new Response(sseCurto, { status: 200 });
        },
      });
      await provedor.conversar({ modelo: "m", sistema: "S", mensagens: [{ papel: "usuario", conteudo: "oi" }], maxTokens: 1500 });
      return guardado[0];
    };
    const daOpenai = await corpoDe("openai");
    conferir("openai: max_completion_tokens e sem max_tokens", [daOpenai.max_completion_tokens, "max_tokens" in daOpenai], [1500, false]);
    conferir("openai: sem temperature (os modelos novos recusam)", "temperature" in daOpenai, false);
    const doLocal = await corpoDe("lmstudio");
    conferir("lmstudio continua com max_tokens e temperature", [doLocal.max_tokens, typeof doLocal.temperature, "max_completion_tokens" in doLocal], [1500, "number", false]);
  }

  // -------------------------------------------------------------------------
  // Entrega A1, Tarefa 4 — Cotacao do dia (PTAX)
  // -------------------------------------------------------------------------
  console.log("\nEntrega A: cotacao");
  {
    const { cotacaoDoDolar, definirCotacaoDoDia, esquecerCotacaoDoDia, COTACAO_DOLAR_FIXA } = await import("../src/lib/cotacaoDolar.js");
    const { garantirCotacaoDoDia, esquecerFalhaDaCotacao } = await import("../src/lib/cotacaoDoDia.js");
    const hora = 60 * 60 * 1000;
    const t0 = Date.UTC(2026, 9, 13, 15, 0, 0);
    const respostaDoBc = (venda) =>
      new Response(JSON.stringify({ value: [{ cotacaoCompra: venda - 0.0065, cotacaoVenda: venda, dataHoraCotacao: "2026-10-09 13:03:00.0" }] }), { status: 200 });
    const contador = (fabrica) => {
      const chamadas = [];
      return { chamadas, buscar: async (url) => (chamadas.push(url), fabrica()) };
    };

    esquecerCotacaoDoDia();
    conferir("sem cotacao do dia vale a fixa", cotacaoDoDolar(t0), { valor: COTACAO_DOLAR_FIXA, origem: "fixa" });

    const bom = contador(() => respostaDoBc(5.1575));
    const lida = await garantirCotacaoDoDia({ buscar: bom.buscar, agora: t0 });
    conferir("PTAX lido: a venda mais recente", lida, { valor: 5.1575, origem: "ptax", data: "2026-10-09" });
    conferir("cotacaoDoDolar passa a devolver o PTAX", cotacaoDoDolar(t0 + 1000), { valor: 5.1575, origem: "ptax", data: "2026-10-09" });
    conferir("a consulta nao leva $select (o BC da 403 a partir da VPS)", bom.chamadas.some((url) => url.includes("$select")), false);
    await garantirCotacaoDoDia({ buscar: bom.buscar, agora: t0 + 30 * 60 * 1000 });
    conferir("dentro de 1 hora nao consulta de novo", bom.chamadas.length, 1);
    await garantirCotacaoDoDia({ buscar: bom.buscar, agora: t0 + 61 * 60 * 1000 });
    conferir("depois de 1 hora consulta de novo", bom.chamadas.length, 2);
    conferir("cotacao com mais de 36 horas vale a fixa", cotacaoDoDolar(t0 + 61 * 60 * 1000 + 37 * hora).origem, "fixa");

    esquecerCotacaoDoDia();
    esquecerFalhaDaCotacao();
    const caido = contador(() => {
      throw new Error("rede fora");
    });
    const semRede = await garantirCotacaoDoDia({ buscar: caido.buscar, agora: t0 });
    conferir("rede fora: fica na fixa sem lancar", [semRede.valor, semRede.origem], [COTACAO_DOLAR_FIXA, "fixa"]);
    await garantirCotacaoDoDia({ buscar: caido.buscar, agora: t0 + 60 * 1000 });
    conferir("depois de uma falha espera 5 minutos para tentar", caido.chamadas.length, 1);
    await garantirCotacaoDoDia({ buscar: caido.buscar, agora: t0 + 6 * 60 * 1000 });
    conferir("passados 5 minutos tenta de novo", caido.chamadas.length, 2);

    esquecerCotacaoDoDia();
    esquecerFalhaDaCotacao();
    const vazio = contador(() => new Response(JSON.stringify({ value: [] }), { status: 200 }));
    conferir("resposta sem linha boa: fixa", (await garantirCotacaoDoDia({ buscar: vazio.buscar, agora: t0 })).origem, "fixa");
    esquecerFalhaDaCotacao();
    const erroHttp = contador(() => new Response("", { status: 403 }));
    conferir("HTTP 403: fixa, sem lancar", (await garantirCotacaoDoDia({ buscar: erroHttp.buscar, agora: t0 + 10 * 60 * 1000 })).origem, "fixa");

    esquecerFalhaDaCotacao();
    definirCotacaoDoDia({ valor: 5, data: "2026-10-09" }, t0);
    conferir("definida e fresca", cotacaoDoDolar(t0 + hora).valor, 5);
    esquecerCotacaoDoDia();
    conferir("esquecida volta a fixa", cotacaoDoDolar(t0).valor, COTACAO_DOLAR_FIXA);
  }

  // -------------------------------------------------------------------------
  // Entrega A1, Tarefa 5 — Orcamento e GastoIA (meses falsos de 2025: o gasto real do dono nunca entra na conta)
  // -------------------------------------------------------------------------
  console.log("\nEntrega A: orcamento");
  {
    const { mesDeSaoPaulo, gastoDoMes, estadoDoOrcamento, reservarOrcamento, liquidarReserva, registrarGasto, estimarCustoMaximoBrl } = await import("../src/lib/riseAi/orcamento.js");
    const config = (internoBrl, clientesBrl = 70) => ({ orcamentos: { clientesBrl, internoBrl } });
    const dono = await prisma.conversaIA.create({ data: { titulo: "ZZ-IA orcamento", usuario: "ZZ-IA-ORC" } });
    const mensagem = (custoBrl, criadoEm, { provedor = "anthropic", modelo = "claude-haiku-5-5", avisos = [] } = {}) =>
      prisma.mensagemIA.create({ data: { conversaId: dono.id, papel: "ASSISTENTE", conteudo: "r", provedor, modelo, custoBrl, avisos, criadoEm: new Date(criadoEm) } });

    // O mes de Sao Paulo
    const virada = mesDeSaoPaulo(new Date("2026-10-01T02:00:00Z"));
    conferir("2026-10-01 02h UTC ainda e setembro em Sao Paulo", virada.mes, "2026-09");
    const marco = mesDeSaoPaulo(new Date("2025-03-15T15:00:00Z"));
    conferir("limites de marco em UTC", [marco.mes, marco.inicio.toISOString(), marco.fim.toISOString()], ["2025-03", "2025-03-01T03:00:00.000Z", "2025-04-01T03:00:00.000Z"]);

    // Gasto do mes: MensagemIA + GastoIA, so do mes certo
    await mensagem(5, "2025-03-10T12:00:00Z");
    await mensagem(1, "2025-04-01T02:30:00Z"); // 31/03 23h30 em Sao Paulo: ainda marco
    await mensagem(100, "2025-02-28T12:00:00Z"); // fevereiro
    await mensagem(100, "2025-04-01T03:30:00Z"); // 01/04 00h30 em Sao Paulo: abril
    await mensagem(null, "2025-03-11T12:00:00Z"); // API sem preco cadastrado
    await mensagem(null, "2025-03-11T13:00:00Z", { provedor: "lmstudio", modelo: "local" }); // local nao conta como sem preco
    await mensagem(null, "2025-03-11T14:00:00Z", { avisos: ["erro"] }); // mensagem de erro nao conta como sem preco
    await registrarGasto({ tipo: "BUSCA", escopo: "INTERNO", provedor: "anthropic", valorUsd: 0.5, valorBrl: 3.2, referencia: "ZZ-IA-m1", detalhe: { buscas: 3 } });
    await prisma.gastoIA.updateMany({ where: { referencia: "ZZ-IA-m1" }, data: { criadoEm: new Date("2025-03-12T12:00:00Z") } });
    await registrarGasto({ tipo: "BUSCA", escopo: "CLIENTES", provedor: "openai", valorUsd: 1, valorBrl: 6, referencia: "ZZ-IA-m2" });
    await prisma.gastoIA.updateMany({ where: { referencia: "ZZ-IA-m2" }, data: { criadoEm: new Date("2025-03-12T12:00:00Z") } });
    const agoraMarco = Date.UTC(2025, 2, 15, 15, 0, 0);
    const interno = await gastoDoMes("INTERNO", { agora: agoraMarco });
    conferir("INTERNO soma as respostas e o GastoIA do mes (5 + 1 + 3,2)", interno.gastoBrl, 9.2);
    conferir("INTERNO: sem reserva e uma resposta sem preco", [interno.reservadoBrl, interno.semPreco], [0, 1]);
    conferir("CLIENTES soma so o GastoIA CLIENTES", (await gastoDoMes("CLIENTES", { agora: agoraMarco })).gastoBrl, 6);

    // Niveis (julho de 2025)
    const agoraJulho = Date.UTC(2025, 6, 15, 15, 0, 0);
    const gastar = async (valor, ref) => {
      await registrarGasto({ tipo: "BUSCA", provedor: "anthropic", valorUsd: valor / 6, valorBrl: valor, referencia: ref });
      await prisma.gastoIA.updateMany({ where: { referencia: ref }, data: { criadoEm: new Date("2025-07-10T12:00:00Z") } });
    };
    await gastar(23.7, "ZZ-IA-n1");
    let estado = await estadoDoOrcamento("INTERNO", { agora: agoraJulho, config: config(30) });
    conferir("79% do teto: normal", [estado.percentual, estado.nivel, estado.tetoBrl], [79, "normal", 30]);
    await gastar(0.3, "ZZ-IA-n2");
    estado = await estadoDoOrcamento("INTERNO", { agora: agoraJulho, config: config(30) });
    conferir("80% do teto: aviso", [estado.percentual, estado.nivel], [80, "aviso"]);
    await gastar(6, "ZZ-IA-n3");
    estado = await estadoDoOrcamento("INTERNO", { agora: agoraJulho, config: config(30) });
    conferir("100% do teto: esgotado", [estado.percentual, estado.nivel], [100, "esgotado"]);
    conferir("teto zero: esgotado", (await estadoDoOrcamento("INTERNO", { agora: agoraJulho, config: config(0) })).nivel, "esgotado");
    conferir("o teto dos clientes e o outro", (await estadoDoOrcamento("CLIENTES", { agora: agoraJulho, config: config(30, 70) })).tetoBrl, 70);

    // Reservas (maio de 2025)
    const agoraMaio = Date.UTC(2025, 4, 15, 15, 0, 0);
    await gastar(4, "ZZ-IA-r0");
    await prisma.gastoIA.updateMany({ where: { referencia: "ZZ-IA-r0" }, data: { criadoEm: new Date("2025-05-10T12:00:00Z") } });
    const r1 = await reservarOrcamento("INTERNO", 5, { dono: "ZZ-IA-r1", agora: agoraMaio, config: config(10) });
    conferir("cabe no teto: reserva feita", [r1.ok, typeof r1.reservaId], [true, "string"]);
    const r2 = await reservarOrcamento("INTERNO", 2, { dono: "ZZ-IA-r2", agora: agoraMaio, config: config(10) });
    conferir("a reserva conta: 4 + 5 + 2 passa de 10", [r2.ok, r2.motivo], [false, "esgotado"]);
    await prisma.reservaDeGastoIA.create({ data: { escopo: "INTERNO", valorBrl: 100, dono: "ZZ-IA-exp", criadaEm: new Date(agoraMaio - 3600000), expiraEm: new Date(agoraMaio - 1000) } });
    conferir("reserva expirada nao conta", (await gastoDoMes("INTERNO", { agora: agoraMaio })).reservadoBrl, 5);
    await liquidarReserva(r1.reservaId);
    const r3 = await reservarOrcamento("INTERNO", 2, { dono: "ZZ-IA-r3", agora: agoraMaio, config: config(10) });
    conferir("liquidar devolve o espaco", r3.ok, true);
    await liquidarReserva(r3.reservaId);
    const zero = await reservarOrcamento("INTERNO", 0, { dono: "ZZ-IA-r4", agora: agoraMaio, config: config(0) });
    conferir("estimativa zero (modelo local) passa mesmo com teto zero e nao grava nada", [zero.ok, zero.reservaId, await prisma.reservaDeGastoIA.count({ where: { dono: "ZZ-IA-r4" } })], [true, null, 0]);
    await liquidarReserva(null);

    // Concorrencia (junho de 2025): 20 pedidos de R$ 1 contra um teto de R$ 10 e gasto zero
    const agoraJunho = Date.UTC(2025, 5, 15, 15, 0, 0);
    const juntos = await Promise.all(Array.from({ length: 20 }, (_, i) => reservarOrcamento("INTERNO", 1, { dono: `ZZ-IA-c${i}`, agora: agoraJunho, config: config(10) })));
    conferir("20 pedidos simultaneos: exatamente 10 passam", juntos.filter((r) => r.ok).length, 10);
    conferir("a soma das reservas e o teto", (await gastoDoMes("INTERNO", { agora: agoraJunho })).reservadoBrl, 10);

    // Estimativa do custo maximo
    const cotacao = (await import("../src/lib/cotacaoDolar.js")).cotacaoDoDolar().valor;
    conferir("local custa zero", estimarCustoMaximoBrl({ provedor: "lmstudio", modelo: "qualquer", tokensEntrada: 5000, maxTokensSaida: 1500 }), 0);
    conferir("modelo de API sem preco: zero", estimarCustoMaximoBrl({ provedor: "anthropic", modelo: "claude-x", tokensEntrada: 5000, maxTokensSaida: 1500 }), 0);
    conferir("provedor desconhecido (o falso dos testes): zero", estimarCustoMaximoBrl({ provedor: "falso", modelo: "falso-1", tokensEntrada: 5000, maxTokensSaida: 1500 }), 0);
    conferir(
      "gpt-4.1-mini: entrada + saida maxima, em reais",
      estimarCustoMaximoBrl({ provedor: "openai", modelo: "gpt-4.1-mini", tokensEntrada: 10000, maxTokensSaida: 1500 }),
      Math.round(((10000 / 1e6) * 0.4 + (1500 / 1e6) * 1.6) * cotacao * 1e4) / 1e4,
    );

    const gasto = await registrarGasto({ tipo: "TRANSCRICAO", escopo: "CLIENTES", provedor: "openai", modelo: "m", valorUsd: 0.003, valorBrl: 0.018, referencia: "ZZ-IA-g1", detalhe: { segundos: 60 } });
    conferir("registrarGasto grava a linha", [gasto.tipo, gasto.escopo, Number(gasto.valorBrl), gasto.detalhe], ["TRANSCRICAO", "CLIENTES", 0.018, { segundos: 60 }]);
  }

  // -------------------------------------------------------------------------
  // Entrega A1, Tarefa 6 — O laco da conversa respeita o teto (mes falso: setembro de 2025)
  // -------------------------------------------------------------------------
  console.log("\nEntrega A: laco com orcamento");
  {
    const { responder } = await import("../src/lib/riseAi/conversa.js");
    const { configuracaoPadrao } = await import("../src/lib/riseAi/configuracao.js");
    const { criarLimitador } = await import("../src/lib/riseAi/limite.js");
    const { criarProvedorFalso } = await import("./lib/provedorFalso.js");
    const { reservarOrcamento } = await import("../src/lib/riseAi/orcamento.js");
    const agoraFalso = Date.UTC(2025, 8, 15, 15, 0, 0);
    const montar = (padrao, reserva, { internoBrl = 1000, escolha = { provedor: "openai", modelo: "gpt-4.1-mini" } } = {}) => ({
      configuracao: {
        ...configuracaoPadrao("pc"),
        padrao: escolha,
        reserva: { provedor: "anthropic", modelo: "claude-haiku-5-5" },
        tempoLimite: { primeiroTokenMs: 2000, totalMs: 5000 },
        orcamentos: { clientesBrl: 70, internoBrl },
      },
      criarProvedor: (id) => (id === escolha.provedor ? padrao : reserva),
      provedorDisponivel: async () => true,
      limitador: criarLimitador({ porMinuto: 1000 }),
      agoraDoOrcamento: () => agoraFalso,
    });
    const reservaIntocada = () => criarProvedorFalso({ id: "anthropic", roteiro: [{ texto: "reserva" }] });
    const usuario = "ZZ-IA-ORC2";

    // Teto de R$ 0,01: a primeira chamada ja nao cabe. Nada e chamado, nem a reserva.
    {
      const padrao = criarProvedorFalso({ id: "openai", roteiro: [{ texto: "oi" }] });
      const reserva = reservaIntocada();
      const r = await responder({ texto: "oi", usuario, dependencias: montar(padrao, reserva, { internoBrl: 0.01 }) });
      conferir("teto estourado: mensagem de erro com o aviso do orcamento", [...r.mensagem.avisos].sort(), ["erro", "orcamento_esgotado"]);
      conferir("teto estourado: o provedor nem e chamado, e a reserva tambem nao", [padrao.pedidos.length, reserva.pedidos.length], [0, 0]);
      conferir("o texto diz que so o administrador aumenta", r.mensagem.conteudo.includes("Só o administrador pode aumentá-lo em Configurações"), true);
    }

    // Teto folgado: responde e devolve toda reserva.
    {
      const padrao = criarProvedorFalso({ id: "openai", roteiro: [{ texto: "Oi!", uso: { entrada: 1000, saida: 100 } }] });
      const r = await responder({ texto: "oi", usuario, dependencias: montar(padrao, reservaIntocada()) });
      conferir("teto folgado: responde normalmente", [r.mensagem.avisos.includes("erro"), r.mensagem.conteudo], [false, "Oi!"]);
      conferir("a reserva de cada chamada e liquidada", await prisma.reservaDeGastoIA.count({ where: { dono: r.conversaId } }), 0);
      conferir("o custo real fica na resposta (gpt-4.1-mini, 1000 + 100 tokens)", Number(r.mensagem.custoUsd), 0.00056);
    }

    // Estouro no MEIO do laco: a primeira rodada ja custou mais que o teto (3 milhoes de tokens de entrada = R$ 7,20).
    {
      const padrao = criarProvedorFalso({
        id: "openai",
        roteiro: [{ chamadas: [{ nome: "consultarPreco", argumentos: { skus: ["ZZ-IA-UNO"] } }], uso: { entrada: 3_000_000, saida: 0 } }, { texto: "nunca chega aqui" }],
      });
      const reserva = reservaIntocada();
      const r = await responder({ texto: "preco do uno", usuario, dependencias: montar(padrao, reserva, { internoBrl: 3 }) });
      conferir("estouro no meio do laco: so a primeira rodada foi chamada", [padrao.pedidos.length, reserva.pedidos.length], [1, 0]);
      conferir("estouro no meio do laco: aviso do orcamento e nenhum erro lancado", [...r.mensagem.avisos].sort(), ["erro", "orcamento_esgotado"]);
      conferir("o que a primeira rodada gastou fica registrado na mensagem de erro", [r.mensagem.tokensEntrada, Number(r.mensagem.custoBrl)], [3_000_000, 7.2]);
      conferir("nada fica reservado", await prisma.reservaDeGastoIA.count({ where: { dono: r.conversaId } }), 0);
    }

    // Modelo local nunca e barrado, nem com teto zero; modelo de API sem preco tambem nao (nao ha o que reservar).
    {
      const local = criarProvedorFalso({ id: "lmstudio", roteiro: [{ texto: "local" }] });
      const r = await responder({ texto: "oi", usuario, dependencias: montar(local, reservaIntocada(), { internoBrl: 0, escolha: { provedor: "lmstudio", modelo: "falso-1" } }) });
      conferir("modelo local com teto zero responde", [r.mensagem.avisos.includes("erro"), r.mensagem.conteudo], [false, "local"]);
      const semPreco = criarProvedorFalso({ id: "anthropic", roteiro: [{ texto: "sem preco" }] });
      const s = await responder({ texto: "oi", usuario, dependencias: montar(semPreco, semPreco, { internoBrl: 0, escolha: { provedor: "anthropic", modelo: "claude-x" } }) });
      conferir("modelo de API sem preco com teto zero responde, com custo nulo", [s.mensagem.avisos.includes("erro"), s.mensagem.custoBrl], [false, null]);
    }

    // O padrao cai e a RESERVA e que esbarra no teto: mesmo recado, e o padrao foi chamado uma vez.
    {
      const padrao = criarProvedorFalso({ id: "lmstudio", roteiro: [{ erro: "conexao" }] });
      const reserva = reservaIntocada();
      const r = await responder({ texto: "oi", usuario, dependencias: montar(padrao, reserva, { internoBrl: 0.0001, escolha: { provedor: "lmstudio", modelo: "falso-1" } }) });
      conferir("a reserva barrada pelo teto: recado do orcamento", [...r.mensagem.avisos].sort(), ["erro", "orcamento_esgotado"]);
      conferir("a reserva barrada: o padrao foi chamado e a reserva nao", [padrao.pedidos.length, reserva.pedidos.length], [1, 0]);
    }

    // O que a resposta em andamento ja gastou entra na conta da proxima chamada.
    {
      const config = { orcamentos: { clientesBrl: 70, internoBrl: 10 } };
      const negada = await reservarOrcamento("INTERNO", 1, { dono: "ZZ-IA-j1", agora: agoraFalso, config, jaGastoBrl: 9.5 });
      conferir("jaGastoBrl entra na conta", [negada.ok, negada.motivo], [false, "esgotado"]);
      const aceita = await reservarOrcamento("INTERNO", 1, { dono: "ZZ-IA-j2", agora: agoraFalso, config, jaGastoBrl: 8 });
      conferir("jaGastoBrl menor deixa passar", aceita.ok, true);
      await prisma.reservaDeGastoIA.deleteMany({ where: { dono: "ZZ-IA-j2" } });
    }
  }

  // -------------------------------------------------------------------------
  // Entrega A1, Tarefa 8 — Perfil cliente seguro e o modo "texto para o cliente"
  // -------------------------------------------------------------------------
  console.log("\nEntrega A: perfil cliente");
  {
    const { pedidoParaOCliente, limparTextoParaOCliente } = await import("../src/lib/riseAi/modoCliente.js");
    const { FERRAMENTAS, PERFIS, definicoesParaProvedor, executarFerramenta } = await import("../src/lib/riseAi/ferramentas/index.js");
    const { responder } = await import("../src/lib/riseAi/conversa.js");
    const { montarSistema } = await import("../src/lib/riseAi/prompt.js");
    const { configuracaoPadrao } = await import("../src/lib/riseAi/configuracao.js");
    const { criarLimitador } = await import("../src/lib/riseAi/limite.js");
    const { criarProvedorFalso } = await import("./lib/provedorFalso.js");

    // --- o pedido de texto para o cliente ---
    conferir(
      "pedidoParaOCliente: o que e pedido de texto",
      ["Escreva a resposta para o cliente", "redija uma mensagem pro cliente sobre o Uno", "Prepare o texto para o cliente", "responda ao cliente"].map(pedidoParaOCliente),
      [true, true, true, true],
    );
    conferir(
      "pedidoParaOCliente: o que NAO e",
      ["qual o custo do Uno?", "o cliente perguntou se o Nano serve, o que respondo?", "como escrever para o cliente?", "", null].map(pedidoParaOCliente),
      [false, false, false, false, false],
    );

    // --- o filtro de saida ---
    const filtrado = limparTextoParaOCliente("**Olá!** Veja https://evil.com/x e https://4hobby.com.br/uno.\nLink: https://evil.com/y\n# Título\n- item", { linksPermitidos: ["https://4hobby.com.br/uno"] });
    conferir("filtro: sem marcas de markdown", [filtrado.texto.includes("**"), filtrado.texto.includes("# ")], [false, false]);
    conferir("filtro: tira o endereco de fora e mantem o permitido", [filtrado.texto.includes("evil.com"), filtrado.texto.includes("https://4hobby.com.br/uno")], [false, true]);
    conferir("filtro: aviso do link removido e nenhum termo interno", filtrado.avisos, ["link_removido"]);
    conferir("filtro: linha que ficou so com 'Link:' sai", filtrado.texto.split("\n").some((linha) => linha.trim() === "Link:"), false);
    conferir("filtro: termo interno avisa", limparTextoParaOCliente("O custo e R$ 20", {}).avisos, ["termo_interno"]);
    conferir("filtro: link em markdown vira texto", limparTextoParaOCliente("Veja [aqui](https://evil.com/z)", {}).texto.includes("evil.com"), false);

    // --- perfis: nunca ha um padrao ---
    conferir("os perfis do codigo", PERFIS, ["admin", "publico"]);
    conferir("definicoes sem perfil lancam", (() => { try { definicoesParaProvedor(); return "nao lancou"; } catch { return "lancou"; } })(), "lancou");
    conferir("definicoes de perfil desconhecido lancam", (() => { try { definicoesParaProvedor("x"); return "nao lancou"; } catch { return "lancou"; } })(), "lancou");
    const semPerfil = await executarFerramenta("buscarProdutos", { termos: "x" }, {});
    conferir("executar sem perfil nunca assume admin", [semPerfil.ok, semPerfil.erro], [false, "Perfil desconhecido."]);
    const semContexto = await executarFerramenta("buscarProdutos", { termos: "x" });
    conferir("executar sem contexto tambem recusa", [semContexto.ok, semContexto.erro], [false, "Perfil desconhecido."]);
    conferir("consultarEstoque nao e oferecida ao perfil cliente", definicoesParaProvedor("publico").some((d) => d.nome === "consultarEstoque"), false);

    // --- a guarda: nenhuma ferramenta publica mostra o que e interno ---
    const base = { ativo: true, conferido: true };
    const fornecedor = await prisma.fornecedor.create({ data: { nome: "ZZ-IA Forn", estrangeiro: true } });
    const pub = await prisma.produto.create({
      data: {
        ...base, sku: "ZZ-IA-CPUB", tituloBase: "PLACA ZZIA CLIENTE PUBLICADA", precoVenda: 50, custo: 12.34, estoque: 7, localizacao: "ZZ-IA-LOC-9",
        urlLojaIntegrada: "https://www.4hobby.com.br/zzia-cliente-pub", descricaoBase: "PLACA ZZIA CLIENTE\nEspecificações técnicas:\n- Tensão: 5V;",
        fornecedores: { create: { fornecedorId: fornecedor.id, precoCusto: 12.34, padrao: true } },
      },
    });
    const priv = await prisma.produto.create({
      data: { ...base, sku: "ZZ-IA-CPRIV", tituloBase: "PLACA ZZIA CLIENTE PRIVADA", precoVenda: 49, custo: 11, estoque: 3, descricaoBase: "Especificações técnicas:\n- Tensão: 5V;" },
    });
    const kit = await prisma.produto.create({
      data: {
        ...base, sku: "ZZ-IA-CKIT", tituloBase: "KIT ZZIA CLIENTE", tipo: "COMPOSICAO", precoVenda: 120, estoque: 2, urlLojaIntegrada: "https://www.4hobby.com.br/zzia-cliente-kit",
        componentes: { create: [{ componenteId: pub.id, quantidade: 1, ordem: 0 }, { componenteId: priv.id, quantidade: 2, ordem: 1 }] },
      },
    });
    const argumentos = {
      buscarProdutos: { termos: "zzia cliente" },
      consultarProduto: { sku: kit.sku },
      consultarPreco: { skus: [pub.sku, priv.sku] },
      compararProdutos: { skus: [pub.sku, kit.sku] },
      buscarProdutosSimilares: { sku: pub.sku },
      buscarConhecimento: { termos: "zzia" },
    };
    const publicas = FERRAMENTAS.filter((ferramenta) => ferramenta.perfis.includes("publico"));
    conferir("toda ferramenta publica tem argumentos no guarda", publicas.map((f) => f.nome).filter((nome) => !argumentos[nome]), []);
    const proibidos = ['"custo"', '"localizacao"', '"fornecedores"', '"concorrentes"', '"urlRise"', '"blingSaldo"', '"margem"', "12.34", "ZZ-IA-LOC-9", "ZZ-IA Forn", '"estoque":7', "PRIVADA"];
    for (const ferramenta of publicas) {
      // `pode` liberando tudo: o perfil cliente nao pode depender da permissao de quem pergunta.
      const r = await executarFerramenta(ferramenta.nome, argumentos[ferramenta.nome], { perfil: "publico", usuario: "ZZ-IA-T", pode: () => true });
      const texto = JSON.stringify(r);
      conferir(`perfil cliente: ${ferramenta.nome} roda e nao mostra nada interno`, [r.ok, proibidos.filter((p) => texto.includes(p))], [true, []]);
    }
    const buscaPublica = (await executarFerramenta("buscarProdutos", { termos: "zzia cliente" }, { perfil: "publico", pode: () => true })).resultado;
    conferir("busca do cliente: so o publicado, com o estoque em faixa", buscaPublica.map((p) => [p.sku, p.estoque]).filter(([s]) => s.startsWith("ZZ-IA-C")), [["ZZ-IA-CKIT", "poucas unidades"], ["ZZ-IA-CPUB", "disponível"]]);
    const consultaKit = (await executarFerramenta("consultarProduto", { sku: kit.sku }, { perfil: "publico", pode: () => true })).resultado;
    conferir("kit do cliente: a peca nao publicada some", consultaKit.kit.map((peca) => peca.sku), ["ZZ-IA-CPUB"]);
    const consultaPriv = await executarFerramenta("consultarProduto", { sku: priv.sku }, { perfil: "publico" });
    conferir("produto fora da loja nao existe para o cliente", [consultaPriv.ok, consultaPriv.erro], [false, "Não existe produto com o código ZZ-IA-CPRIV."]);
    const similaresDoPriv = await executarFerramenta("buscarProdutosSimilares", { sku: priv.sku }, { perfil: "publico" });
    conferir("similares de produto fora da loja: tambem nao existe", similaresDoPriv.ok, false);
    conferir("o administrador continua vendo custo e localizacao", JSON.stringify((await executarFerramenta("consultarProduto", { sku: pub.sku }, { perfil: "admin", pode: () => true })).resultado).includes("ZZ-IA-LOC-9"), true);

    // --- o modo cliente no laco ---
    const deps = (padrao) => ({
      configuracao: { ...configuracaoPadrao("pc"), padrao: { provedor: "lmstudio", modelo: "falso-1" }, tempoLimite: { primeiroTokenMs: 2000, totalMs: 5000 } },
      criarProvedor: () => padrao,
      provedorDisponivel: async () => true,
      limitador: criarLimitador({ porMinuto: 1000 }),
      agoraDoOrcamento: () => Date.UTC(2025, 9, 15, 15),
    });
    const usuario = "ZZ-IA-MODO";
    const interno = criarProvedorFalso({ roteiro: [{ texto: "O custo do Uno e R$ 12,34, fornecedor ZZ-IA Forn." }] });
    const primeira = await responder({ texto: "qual o custo do Uno?", usuario, dependencias: deps(interno) });
    conferir("pergunta comum roda no modo interno", [primeira.mensagem.estruturado.modo, interno.pedidos[0].sistema === montarSistema({ modo: "interno" })], ["interno", true]);

    const cliente = criarProvedorFalso({
      roteiro: [
        { chamadas: [{ nome: "buscarProdutos", argumentos: { termos: "zzia cliente publicada" } }] },
        { texto: "**Olá!** O PLACA ZZIA CLIENTE PUBLICADA (ZZ-IA-CPUB) custa R$ 50,00.\nLink: https://www.4hobby.com.br/zzia-cliente-pub\nVeja também https://evil.com/x. O custo para nós é R$ 12." },
      ],
    });
    const pedido = await responder({ conversaId: primeira.conversaId, texto: "escreva a resposta para o cliente sobre a placa zzia cliente", usuario, dependencias: deps(cliente) });
    const visto = cliente.pedidos[0];
    conferir("modo cliente: o sistema e o do cliente", visto.sistema === montarSistema({ modo: "cliente" }), true);
    conferir("modo cliente: sem consultarEstoque nem internet", visto.ferramentas.map((f) => f.nome).filter((nome) => ["consultarEstoque", "pesquisarNaInternet"].includes(nome)), []);
    conferir("modo cliente: o historico leva so o que a equipe escreveu, nunca as respostas anteriores da IA", [JSON.stringify(visto.mensagens).includes("12,34"), JSON.stringify(visto.mensagens).includes("qual o custo do Uno?")], [false, true]);
    conferir("modo cliente: a mensagem fica marcada e o texto sai limpo", [pedido.mensagem.estruturado.modo, pedido.mensagem.conteudo.includes("**"), pedido.mensagem.conteudo.includes("evil.com"), pedido.mensagem.conteudo.includes("https://www.4hobby.com.br/zzia-cliente-pub")], ["cliente", false, false, true]);
    conferir("modo cliente: avisos do filtro", ["link_removido", "termo_interno"].every((a) => pedido.mensagem.avisos.includes(a)), true);
    conferir("a conversa continua da equipe no banco", (await prisma.conversaIA.findUnique({ where: { id: pedido.conversaId } })).perfil, "ADMIN");

    const volta = criarProvedorFalso({ roteiro: [{ texto: "ok" }] });
    await responder({ conversaId: primeira.conversaId, texto: "quanto custa o Uno para nós?", usuario, dependencias: deps(volta) });
    conferir("depois do modo cliente, a pergunta comum volta ao interno", volta.pedidos[0].sistema === montarSistema({ modo: "interno" }), true);

    // modo explicito vale sobre a frase
    const forcado = criarProvedorFalso({ roteiro: [{ texto: "ok" }] });
    await responder({ conversaId: primeira.conversaId, texto: "oi", usuario, modo: "cliente", dependencias: deps(forcado) });
    conferir("modo explicito", forcado.pedidos[0].sistema === montarSistema({ modo: "cliente" }), true);
  }

  // -------------------------------------------------------------------------
  // Entrega A1, Tarefa 9 — Botao Parar (servidor)
  // -------------------------------------------------------------------------
  console.log("\nEntrega A: Parar");
  {
    const { responder } = await import("../src/lib/riseAi/conversa.js");
    const { configuracaoPadrao } = await import("../src/lib/riseAi/configuracao.js");
    const { criarLimitador } = await import("../src/lib/riseAi/limite.js");
    const { fluxoDeEventos } = await import("../src/lib/riseAi/sse.js");
    const { pararResposta, registrarResposta, MOTIVO_PARADA } = await import("../src/lib/riseAi/paradas.js");
    const { criarProvedorOpenAICompativel } = await import("../src/lib/riseAi/provedores/openaiCompativel.js");
    const { criarProvedorAnthropic } = await import("../src/lib/riseAi/provedores/anthropic.js");
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const { criarProvedorFalso } = await import("./lib/provedorFalso.js");
    const usuario = "ZZ-IA-PARAR";

    conferir("o motivo do Parar", MOTIVO_PARADA, "interrompida");

    const deps = (padrao, reserva) => ({
      configuracao: { ...configuracaoPadrao("pc"), padrao: { provedor: "lmstudio", modelo: "falso-1" }, tempoLimite: { primeiroTokenMs: 5000, totalMs: 10000 } },
      criarProvedor: (id) => (id === "lmstudio" ? padrao : reserva),
      provedorDisponivel: async () => true,
      limitador: criarLimitador({ porMinuto: 1000 }),
      agoraDoOrcamento: () => Date.UTC(2025, 10, 15, 15),
    });
    const reservaIntocada = () => criarProvedorFalso({ id: "anthropic", roteiro: [{ texto: "reserva" }] });
    /** Comeca uma resposta sem esperar o fim, e deixa esperar por um evento. */
    const comecar = (dependencias, extra = {}) => {
      const eventos = [];
      const esperas = [];
      const aoEvento = (nome, dados) => {
        eventos.push({ nome, dados });
        for (const espera of esperas.filter((candidata) => candidata.nome === nome)) espera.resolver(dados);
      };
      const esperar = (nome) =>
        new Promise((resolver) => {
          const ja = eventos.find((evento) => evento.nome === nome);
          if (ja) resolver(ja.dados);
          else esperas.push({ nome, resolver });
        });
      const promessa = responder({ texto: "uma pergunta que a equipe vai interromper", usuario, aoEvento, dependencias, ...extra });
      return { promessa, eventos, esperar };
    };

    // Parar no meio do texto: o que ja apareceu fica gravado, marcado, com custo estimado, e a reserva NAO entra.
    {
      const padrao = criarProvedorFalso({ roteiro: [{ texto: "Resposta parcial que o Parar corta", atrasoDepoisDoTextoMs: 5000, uso: { entrada: 100, saida: 20 } }] });
      const reserva = reservaIntocada();
      const a = comecar(deps(padrao, reserva));
      const inicio = await a.esperar("inicio");
      await a.esperar("texto");
      conferir("pararResposta durante a resposta", pararResposta(inicio.conversaId, { usuario }), { parou: true });
      const r = await a.promessa;
      conferir("interrompida: marcada, com o texto parcial", [r.mensagem.interrompida, r.mensagem.conteudo], [true, "Resposta parcial que o Parar corta"]);
      conferir("interrompida: sem aviso de erro, custo marcado como estimado", [r.mensagem.avisos.includes("erro"), r.mensagem.estruturado.custoEstimado, r.mensagem.motivoDaReserva], [false, true, null]);
      conferir("interrompida: a reserva (outro provedor) nao foi chamada", reserva.pedidos.length, 0);
      conferir("interrompida: o custo vira tokens estimados pelos caracteres", [r.mensagem.tokensEntrada > 0, r.mensagem.tokensSaida], [true, Math.ceil("Resposta parcial que o Parar corta".length / 4)]);
      const fim = a.eventos.find((evento) => evento.nome === "fim")?.dados;
      conferir("o evento fim diz que foi interrompida", [fim?.interrompida, fim?.custoEstimado, fim?.mensagemId === r.mensagem.id], [true, true, true]);
      conferir("nada fica reservado", await prisma.reservaDeGastoIA.count({ where: { dono: inicio.conversaId } }), 0);
      conferir("parar de novo, depois do fim, nao faz nada", pararResposta(inicio.conversaId, { usuario }), { parou: false });

      // A conversa fica livre: uma pergunta nova na mesma conversa funciona.
      const livre = await responder({ conversaId: inicio.conversaId, texto: "e agora?", usuario, dependencias: deps(criarProvedorFalso({ roteiro: [{ texto: "agora sim" }] }), reservaIntocada()) });
      conferir("a conversa fica livre depois de parar", [livre.mensagem.conteudo, livre.mensagem.interrompida], ["agora sim", false]);
    }

    // Parar antes do primeiro token: mensagem vazia, marcada.
    {
      const padrao = criarProvedorFalso({ roteiro: [{ atrasoMs: 5000, texto: "nunca chega" }] });
      const b = comecar(deps(padrao, reservaIntocada()));
      const inicio = await b.esperar("inicio");
      pararResposta(inicio.conversaId, { usuario });
      const r = await b.promessa;
      conferir("parar antes do primeiro token: mensagem vazia, marcada", [r.mensagem.conteudo, r.mensagem.interrompida, r.mensagem.avisos.includes("erro")], ["", true, false]);
    }

    // Outra pessoa nao para a resposta; a segunda aba nao entra; sem resposta nao ha o que parar.
    {
      const padrao = criarProvedorFalso({ roteiro: [{ texto: "completa", atrasoDepoisDoTextoMs: 400 }, { texto: "segunda" }] });
      const c = comecar(deps(padrao, reservaIntocada()));
      const inicio = await c.esperar("inicio");
      await c.esperar("texto");
      conferir("outra pessoa nao para a resposta", pararResposta(inicio.conversaId, { usuario: "ZZ-IA-OUTRO" }), { parou: false });
      const segundaAba = await responder({ conversaId: inicio.conversaId, texto: "outra aba", usuario, dependencias: deps(padrao, reservaIntocada()) }).then(() => "respondeu", (erro) => erro.message);
      conferir("a segunda aba recebe o aviso e a primeira nao e afetada", segundaAba, "Espere a resposta anterior terminar.");
      const r = await c.promessa;
      conferir("a resposta terminou inteira", [r.mensagem.conteudo, r.mensagem.interrompida], ["completa", false]);
    }
    conferir("conversa que nao existe: nada a parar", pararResposta("nao-existe", { usuario }), { parou: false });
    {
      const controle = new AbortController();
      const desregistrar = registrarResposta("ZZ-IA-reg", usuario, controle);
      desregistrar();
      conferir("resposta desregistrada nao e mais parada", [pararResposta("ZZ-IA-reg", { usuario }), controle.signal.aborted], [{ parou: false }, false]);
    }

    // Recarregar a pagina (o cliente do fluxo some) NAO para a resposta: ela termina e e gravada.
    {
      const padrao = criarProvedorFalso({ roteiro: [{ texto: "Resposta que termina sozinha", atrasoDepoisDoTextoMs: 300 }] });
      let idDaConversa = null;
      const fluxo = fluxoDeEventos(async (enviar) => {
        await responder({
          texto: "pergunta de quem recarrega",
          usuario,
          aoEvento: (nome, dados) => {
            if (nome === "inicio") idDaConversa = dados.conversaId;
            enviar(nome, dados);
          },
          dependencias: deps(padrao, reservaIntocada()),
        });
      });
      const leitor = fluxo.getReader();
      await leitor.read();
      await leitor.cancel();
      await new Promise((resolver) => setTimeout(resolver, 1200));
      const gravadas = await prisma.mensagemIA.findMany({ where: { conversaId: idDaConversa, papel: "ASSISTENTE" } });
      conferir("fechar a conexao nao para: a resposta termina e e gravada", [gravadas.length, gravadas[0]?.interrompida, gravadas[0]?.conteudo], [1, false, "Resposta que termina sozinha"]);
    }

    // Os adaptadores: o motivo do aborto decide entre Parar e tempo.
    {
      const abortavel = (url, init) =>
        new Promise((resolver, rejeitar) => {
          init.signal.addEventListener("abort", () => rejeitar(Object.assign(new Error("abortado"), { name: "AbortError" })), { once: true });
        });
      const lendo = (url, init) =>
        Promise.resolve(
          new Response(
            new ReadableStream({
              start(controle) {
                init.signal.addEventListener("abort", () => controle.error(Object.assign(new Error("abortado"), { name: "AbortError" })), { once: true });
              },
            }),
            { status: 200 },
          ),
        );
      const pedidoSimples = { modelo: "m", sistema: "S", mensagens: [{ papel: "usuario", conteudo: "oi" }], maxTokens: 5 };
      const tipoDo = async (provedor, motivo) => {
        const controle = new AbortController();
        const promessa = provedor.conversar({ ...pedidoSimples, sinal: controle.signal }).then(() => "nao lancou", (erro) => erro.tipo);
        await new Promise((resolver) => setTimeout(resolver, 20));
        if (motivo === undefined) controle.abort();
        else controle.abort(motivo);
        return promessa;
      };
      const naRede = criarProvedorOpenAICompativel({ id: "openai", endpoint: "http://falso/v1", chave: "k", fetchImpl: abortavel });
      const noFluxo = criarProvedorOpenAICompativel({ id: "openai", endpoint: "http://falso/v1", chave: "k", fetchImpl: lendo });
      conferir("openai (esperando a rede): Parar", await tipoDo(naRede, "interrompida"), "interrompida");
      conferir("openai (esperando a rede): aborto comum e tempo", await tipoDo(naRede, undefined), "tempo");
      conferir("openai (lendo o fluxo): Parar", await tipoDo(noFluxo, "interrompida"), "interrompida");
      conferir("openai (lendo o fluxo): aborto comum e tempo", await tipoDo(noFluxo, undefined), "tempo");

      const sdkFalso = {
        messages: {
          stream: () => ({
            on() {
              return this;
            },
            finalMessage: async () => {
              throw new Anthropic.APIUserAbortError();
            },
          }),
        },
        models: { list: async () => ({ data: [] }) },
      };
      const daAnthropic = criarProvedorAnthropic({ chave: "x", cliente: sdkFalso });
      const controleA = new AbortController();
      controleA.abort("interrompida");
      conferir("anthropic: Parar", await daAnthropic.conversar({ ...pedidoSimples, sinal: controleA.signal }).then(() => "nao lancou", (erro) => erro.tipo), "interrompida");
      const controleB = new AbortController();
      controleB.abort();
      conferir("anthropic: aborto comum e tempo", await daAnthropic.conversar({ ...pedidoSimples, sinal: controleB.signal }).then(() => "nao lancou", (erro) => erro.tipo), "tempo");
    }
  }

  // -------------------------------------------------------------------------
  // Entrega A1, Tarefa 10 — Analisador de texto seguro (o que o modelo escreve nunca vira HTML)
  // -------------------------------------------------------------------------
  console.log("\nEntrega A: texto seguro");
  {
    const { blocosDoTexto, textoPuroDoTexto, ehEnderecoSeguro } = await import("../src/lib/riseAi/textoSeguro.js");
    const { readFileSync } = await import("node:fs");
    const trechosDe = (texto, opcoes) => blocosDoTexto(texto, opcoes).flatMap((bloco) => (bloco.tipo === "lista" ? bloco.itens.flat() : bloco.trechos));
    const tipos = (texto, opcoes) => [...new Set(trechosDe(texto, opcoes).map((trecho) => trecho.tipo))];
    const juntos = (texto, opcoes) => trechosDe(texto, opcoes).map((trecho) => trecho.texto ?? "").join("");

    // HTML e imagem nunca viram elemento
    conferir("script fica como texto", [tipos("<script>alert(1)</script>"), juntos("<script>alert(1)</script>")], [["texto"], "<script>alert(1)</script>"]);
    conferir("img com onerror fica como texto", [tipos("<img src=x onerror=alert(1)>"), juntos("<img src=x onerror=alert(1)>")], [["texto"], "<img src=x onerror=alert(1)>"]);
    conferir("imagem em markdown vira so o texto alternativo", [tipos("![x](https://a.com/p.png)"), juntos("![x](https://a.com/p.png)")], [["texto"], "x"]);

    // Endereco
    conferir("javascript: nunca vira link, e o endereco some", [tipos("[ver](javascript:alert(1))"), juntos("[ver](javascript:alert(1))")], [["texto"], "ver"]);
    conferir("link cujo texto mente o dominio mostra o dominio real", juntos("[4hobby.com.br](https://evil.com/x)"), "4hobby.com.br (evil.com)");
    conferir("fora da lista permitida nao ha href", tipos("[4hobby.com.br](https://evil.com/x)"), ["texto"]);
    conferir("na lista permitida vira link com o dominio", trechosDe("[4hobby.com.br](https://evil.com/x)", { linksPermitidos: ["https://evil.com/x"] }), [{ tipo: "link", texto: "4hobby.com.br", href: "https://evil.com/x", dominio: "evil.com" }]);
    conferir("endereco solto permitido e o ponto final fica de fora", trechosDe("Veja https://www.4hobby.com.br/uno.", { linksPermitidos: ["https://www.4hobby.com.br/uno"] }), [
      { tipo: "texto", texto: "Veja " },
      { tipo: "link", texto: "https://www.4hobby.com.br/uno", href: "https://www.4hobby.com.br/uno", dominio: "www.4hobby.com.br" },
      { tipo: "texto", texto: "." },
    ]);
    conferir("endereco solto nao permitido e so texto", [tipos("Veja https://evil.com/x agora"), juntos("Veja https://evil.com/x agora")], [["texto"], "Veja https://evil.com/x agora"]);
    conferir(
      "ehEnderecoSeguro",
      ["https://www.4hobby.com.br/uno", "http://a.com", "javascript:alert(1)", "data:text/html,x", "ftp://x.com", "https://localhost", "https://user:pass@host.com/", "https://a b.com", ""].map(ehEnderecoSeguro),
      [true, true, false, false, false, false, false, false, false],
    );

    // Formatacao
    conferir("negrito", trechosDe("**R$ 89,90**"), [{ tipo: "negrito", texto: "R$ 89,90" }]);
    conferir("italico com asterisco e com sublinhado", [trechosDe("*oi*")[0].tipo, trechosDe("_oi_")[0].tipo], ["italico", "italico"]);
    conferir("snake_case nao vira italico", tipos("o campo SELLER_SKU e outro_nome"), ["texto"]);
    conferir("codigo", trechosDe("use `analogRead`"), [{ tipo: "texto", texto: "use " }, { tipo: "codigo", texto: "analogRead" }]);
    conferir("titulo", blocosDoTexto("### Título"), [{ tipo: "titulo", trechos: [{ tipo: "texto", texto: "Título" }] }]);
    const lista = blocosDoTexto("- a\n- b");
    conferir("lista com marcador", [lista.length, lista[0].tipo, lista[0].ordenada, lista[0].itens.length], [1, "lista", false, 2]);
    const ordenada = blocosDoTexto("1. um\n2. dois");
    conferir("lista numerada", [ordenada[0].tipo, ordenada[0].ordenada, ordenada[0].itens.length], ["lista", true, 2]);
    conferir("paragrafos separados por linha em branco", blocosDoTexto("um\n\ndois").map((bloco) => bloco.tipo), ["paragrafo", "paragrafo"]);
    conferir("quebra simples dentro do paragrafo", trechosDe("um\ndois").map((trecho) => trecho.tipo), ["texto", "quebra", "texto"]);
    conferir("CRLF vale como LF", JSON.stringify(blocosDoTexto("um\r\n\r\ndois")), JSON.stringify(blocosDoTexto("um\n\ndois")));
    conferir("marcacao aberta no meio do fluxo aparece como esta", trechosDe("**negr"), [{ tipo: "texto", texto: "**negr" }]);
    conferir("lista de bolinha com asterisco", blocosDoTexto("* a\n* b")[0].itens.length, 2);

    // Robustez: texto enorme e padroes que fariam regex patologica
    {
      const inicio = Date.now();
      blocosDoTexto("palavra ".repeat(6500));
      blocosDoTexto("* ".repeat(20000));
      blocosDoTexto("**a ".repeat(10000));
      blocosDoTexto("[x](".repeat(8000));
      blocosDoTexto("_a ".repeat(15000));
      conferir("texto enorme e padroes patologicos analisam sem travar", Date.now() - inicio < 3000, true);
    }

    // O que o Copiar copia
    conferir("texto puro: sem marcas, lista com hifen", textoPuroDoTexto("**R$ 89,90**\n- a\n- b"), "R$ 89,90\n- a\n- b");
    conferir("texto puro: lista numerada e titulo", textoPuroDoTexto("### Título\n1. um\n2. dois"), "Título\n1. um\n2. dois");
    conferir("texto puro: link em markdown mantem o endereco", textoPuroDoTexto("Veja [o Uno](https://www.4hobby.com.br/uno)"), "Veja o Uno (https://www.4hobby.com.br/uno)");
    conferir("texto puro: endereco perigoso some", textoPuroDoTexto("[ver](javascript:alert(1))"), "ver");
    conferir("texto puro: o endereco escrito a mao fica", textoPuroDoTexto("Link: https://www.4hobby.com.br/uno"), "Link: https://www.4hobby.com.br/uno");

    // O componente nunca injeta HTML
    const fonteDoComponente = readFileSync(new URL("../src/components/riseAi/TextoDaIA.jsx", import.meta.url), "utf8");
    conferir("TextoDaIA nao usa dangerouslySetInnerHTML", fonteDoComponente.includes("dangerouslySetInnerHTML"), false);
    conferir("TextoDaIA so abre link com noopener noreferrer", [fonteDoComponente.includes('rel="noopener noreferrer"'), /<a\s/.test(fonteDoComponente)], [true, true]);
  }

  // -------------------------------------------------------------------------
  // Entrega A1, Tarefa 11 — A resposta em texto corrido: o que a barra da resposta escreve
  // -------------------------------------------------------------------------
  console.log("\nEntrega A: barra da resposta");
  {
    const { custoEmTexto, rotuloDaFerramenta } = await import("../src/components/riseAi/formatos.js");
    conferir("custo normal", custoEmTexto(0.0036), "R$ 0,0036");
    conferir("custo estimado leva o til", custoEmTexto(0.0036, { estimado: true }), "~R$ 0,0036");
    conferir("custo zero do modelo local nao ganha til", custoEmTexto(0, { estimado: true }), "R$ 0,00");
    conferir("sem preco cadastrado nao vira zero nem estimado", custoEmTexto(null, { estimado: true }), "preço não cadastrado");
    conferir(
      "linha de estado por ferramenta",
      ["pesquisarNaInternet", "buscarProdutos", "buscarConhecimento", "compararProdutos", "algumaNova"].map(rotuloDaFerramenta),
      ["pesquisando na internet…", "consultando produtos…", "consultando o conhecimento…", "consultando produtos…", "consultando…"],
    );
  }

  // -------------------------------------------------------------------------
  // Entrega A1, Tarefa 12 — O campo de texto, Enviar/Parar e o cabecalho: o fluxo e o estado que o cabecalho le
  // -------------------------------------------------------------------------
  console.log("\nEntrega A: chat");
  {
    const { eventosDoFluxo } = await import("../src/components/riseAi/fluxo.js");
    const { eventoSSE } = await import("../src/lib/riseAi/sse.js");
    const { estadoDoChat } = await import("../src/lib/riseAi/orcamento.js");
    const lerTudo = async (corpo) => {
      const eventos = [];
      for await (const evento of eventosDoFluxo(corpo)) eventos.push(evento);
      return eventos;
    };
    const fim = { mensagemId: "m1", uso: { entrada: 10, saida: 5 }, custo: { usd: 0.0001, brl: 0.0006 }, produtos: [], avisos: [], interrompida: true, custoEstimado: true };
    const bytes = new TextEncoder().encode(eventoSSE("texto", { delta: "Olá" }) + eventoSSE("fim", fim));
    const inteiro = new ReadableStream({ start(controle) { controle.enqueue(bytes); controle.close(); } });
    conferir("o evento fim chega com interrompida e custoEstimado", (await lerTudo(inteiro)).at(-1), { nome: "fim", dados: fim });

    // Um pedaco de rede parte o evento fim ao meio (e um acento no meio de outro).
    const corte = Math.floor(bytes.length * 0.8);
    const picado = new ReadableStream({ start(controle) { controle.enqueue(bytes.slice(0, corte)); controle.enqueue(bytes.slice(corte)); controle.close(); } });
    const partidos = await lerTudo(picado);
    conferir("fim partido entre dois pedacos de rede", [partidos.map((e) => e.nome), partidos.at(-1).dados.interrompida], [["texto", "fim"], true]);

    // O cabecalho: modelo padrao, internet e orcamento, lidos no servidor.
    const estado = await estadoDoChat();
    conferir("o estado do chat traz o padrao, a internet e o orcamento", [Object.keys(estado).sort(), typeof estado.internet, ["normal", "aviso", "esgotado"].includes(estado.orcamento.nivel), typeof estado.orcamento.percentual], [["internet", "orcamento", "padrao"], "boolean", true, "number"]);
  }

  // -------------------------------------------------------------------------
  // Entrega A1, Tarefa 13 — A ferramenta "pesquisar na internet" (busca falsa: nenhuma chamada paga)
  // -------------------------------------------------------------------------
  console.log("\nEntrega A: internet");
  {
    const { pesquisarComAnthropic } = await import("../src/lib/ia/pesquisaGeral.js");
    const { FERRAMENTAS, definicoesParaProvedor, executarFerramenta } = await import("../src/lib/riseAi/ferramentas/index.js");
    const { responder } = await import("../src/lib/riseAi/conversa.js");
    const { montarSistema } = await import("../src/lib/riseAi/prompt.js");
    const { configuracaoPadrao } = await import("../src/lib/riseAi/configuracao.js");
    const { criarLimitador } = await import("../src/lib/riseAi/limite.js");
    const { criarProvedorFalso } = await import("./lib/provedorFalso.js");

    // --- a chamada a Anthropic, com um SDK falso ---
    const sdkFalso = (respostas) => {
      const chamadas = [];
      return {
        chamadas,
        messages: {
          create: async (parametros) => {
            chamadas.push(structuredClone(parametros));
            const proxima = respostas.shift();
            if (proxima instanceof Error) throw proxima;
            return proxima;
          },
        },
      };
    };
    const erroHttp = (status) => Object.assign(new Error(`HTTP ${status}`), { status });
    const resposta = (content, extra = {}) => ({
      content,
      stop_reason: "end_turn",
      usage: { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: 2 } },
      model: "claude-haiku-5-5",
      ...extra,
    });
    const resultados = { type: "web_search_tool_result", tool_use_id: "s1", content: [{ type: "web_search_result", url: "https://a.com/1", title: "A" }, { type: "web_search_result", url: "https://b.com/2", title: "B" }] };
    const comCitacao = { type: "text", text: "O ATmega328P roda a 16 MHz.", citations: [{ type: "web_search_result_location", url: "https://www.microchip.com/x", title: "Microchip" }, { type: "web_search_result_location", url: "https://www.microchip.com/x", title: "Microchip" }] };

    const sdk1 = sdkFalso([resposta([{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "q" } }, resultados, comCitacao])]);
    const achado = await pesquisarComAnthropic({ consulta: "clock do atmega328p", cliente: sdk1 });
    conferir("pesquisa: resumo, fonte citada (sem repetir), buscas e uso", [achado.resumo, achado.fontes, achado.buscas, achado.uso, achado.modelo], ["O ATmega328P roda a 16 MHz.", [{ titulo: "Microchip", url: "https://www.microchip.com/x" }], 2, { entrada: 1000, saida: 100 }, "claude-haiku-5-5"]);
    conferir(
      "pesquisa: a ferramenta e a busca basica com limite, e nunca web_fetch",
      [sdk1.chamadas[0].tools, sdk1.chamadas[0].model, JSON.stringify(sdk1.chamadas[0]).includes("web_fetch")],
      [[{ type: "web_search_20250305", name: "web_search", max_uses: 3 }], "claude-haiku-5-5", false],
    );
    const semCitacao = await pesquisarComAnthropic({ consulta: "x", cliente: sdkFalso([resposta([resultados, { type: "text", text: "Sem citacao." }])]) });
    conferir("sem citacao, as fontes sao os resultados da busca", semCitacao.fontes.map((f) => f.url), ["https://a.com/1", "https://b.com/2"]);
    const perigosa = await pesquisarComAnthropic({
      consulta: "x",
      cliente: sdkFalso([resposta([{ type: "text", text: "ok", citations: [{ type: "web_search_result_location", url: "javascript:alert(1)", title: "x" }, { type: "web_search_result_location", url: "https://ok.com/p", title: "ok" }] }])]),
    });
    conferir("fonte com endereco perigoso fica de fora", perigosa.fontes.map((f) => f.url), ["https://ok.com/p"]);
    const longa = await pesquisarComAnthropic({ consulta: "x", cliente: sdkFalso([resposta([{ type: "text", text: "a".repeat(5000) }])]) });
    conferir("resumo cortado em 3000 caracteres", longa.resumo.length, 3000);

    const pausada = sdkFalso([resposta([{ type: "text", text: "parte" }], { stop_reason: "pause_turn" }), resposta([{ type: "text", text: "fim" }])]);
    const continuada = await pesquisarComAnthropic({ consulta: "x", cliente: pausada });
    conferir("pause_turn: continua devolvendo a mensagem pausada", [pausada.chamadas.length, pausada.chamadas[1].messages.at(-1).role, continuada.resumo], [2, "assistant", "partefim"]);

    const fallback = sdkFalso([erroHttp(400), resposta([{ type: "text", text: "pelo sonnet" }], { model: "claude-sonnet-5-5" })]);
    const doSonnet = await pesquisarComAnthropic({ consulta: "x", cliente: fallback });
    conferir("o Haiku recusa a ferramenta: tenta o Sonnet", [fallback.chamadas.map((c) => c.model), doSonnet.modelo], [["claude-haiku-5-5", "claude-sonnet-5-5"], "claude-sonnet-5-5"]);
    conferir("os dois recusam: erro", await pesquisarComAnthropic({ consulta: "x", cliente: sdkFalso([erroHttp(400), erroHttp(404)]) }).then(() => "nao lancou", (erro) => erro.status), 404);
    conferir("erro de rede nao tenta outro modelo", await pesquisarComAnthropic({ consulta: "x", cliente: sdkFalso([erroHttp(500), resposta([{ type: "text", text: "nao devia" }])]) }).then(() => "nao lancou", (erro) => erro.status), 500);
    conferir("recusa do modelo vira erro", await pesquisarComAnthropic({ consulta: "x", cliente: sdkFalso([resposta([{ type: "text", text: "" }], { stop_reason: "refusal" })]) }).then(() => "nao lancou", () => "lancou"), "lancou");
    conferir("resposta sem texto vira erro", await pesquisarComAnthropic({ consulta: "x", cliente: sdkFalso([resposta([resultados])]) }).then(() => "nao lancou", () => "lancou"), "lancou");

    // --- quem recebe a ferramenta ---
    const nomes = (perfil, internet) => definicoesParaProvedor(perfil, { internet }).map((d) => d.nome);
    conferir("internet ligada, perfil admin: a ferramenta vai por ultimo", nomes("admin", true).at(-1), "pesquisarNaInternet");
    conferir("internet desligada: nao ha ferramenta", nomes("admin", false).includes("pesquisarNaInternet"), false);
    conferir("perfil cliente nunca recebe, nem com a internet ligada", nomes("publico", true).includes("pesquisarNaInternet"), false);
    conferir("a lista e a mesma de uma pergunta para outra (cache do prefixo)", JSON.stringify(nomes("admin", true)) === JSON.stringify(nomes("admin", true)), true);
    conferir("a ferramenta nao esta no catalogo comum (o guarda do perfil cliente nao a enxerga)", FERRAMENTAS.some((f) => f.nome === "pesquisarNaInternet"), false);

    // --- a ferramenta: custo, orcamento e fontes ---
    let buscasFeitas = 0;
    const pesquisarFalso = async ({ consulta }) => {
      buscasFeitas++;
      return { resumo: `achei sobre ${consulta}`, fontes: [{ titulo: "Microchip", url: "https://www.microchip.com/x" }], buscas: 2, uso: { entrada: 1000, saida: 100 }, modelo: "claude-haiku-5-5" };
    };
    const contexto = (internoBrl, extra = {}) => ({
      perfil: "admin", usuario: "ZZ-IA-NET", internet: true, conversaId: "ZZ-IA-net1", agoraDoOrcamento: Date.UTC(2025, 11, 15, 15),
      config: { orcamentos: { clientesBrl: 70, internoBrl } }, pesquisar: pesquisarFalso, ...extra,
    });
    const feita = await executarFerramenta("pesquisarNaInternet", { consulta: "clock do atmega328p" }, contexto(100));
    conferir("a ferramenta devolve o resumo e as fontes", [feita.ok, feita.resultado?.resumo, feita.resultado?.fontes], [true, "achei sobre clock do atmega328p", [{ titulo: "Microchip", url: "https://www.microchip.com/x" }]]);
    const gasto = await prisma.gastoIA.findFirst({ where: { referencia: "ZZ-IA-net1" } });
    conferir("GastoIA BUSCA: tokens + 2 buscas de US$ 0,01, em reais pela cotacao", [gasto?.tipo, gasto?.escopo, gasto?.provedor, Number(gasto?.valorUsd), Number(gasto?.valorBrl), ord(gasto?.detalhe)], ["BUSCA", "INTERNO", "anthropic", 0.02015, 0.1209, ord({ buscas: 2, entrada: 1000, saida: 100 })]);
    conferir("a reserva da pesquisa foi devolvida", await prisma.reservaDeGastoIA.count({ where: { dono: "ZZ-IA-net1" } }), 0);

    const antes = buscasFeitas;
    const barrada = await executarFerramenta("pesquisarNaInternet", { consulta: "outra" }, contexto(0));
    conferir("teto zerado: a ferramenta recusa e a busca nem sai", [barrada.ok, barrada.erro, buscasFeitas - antes], [false, "Orçamento interno do mês esgotado.", 0]);
    const desligada = await executarFerramenta("pesquisarNaInternet", { consulta: "x" }, contexto(100, { internet: false }));
    conferir("internet desligada: a ferramenta nao existe", [desligada.ok, desligada.erro], [false, "Ferramenta desconhecida: pesquisarNaInternet."]);
    const noCliente = await executarFerramenta("pesquisarNaInternet", { consulta: "x" }, contexto(100, { perfil: "publico" }));
    conferir("perfil cliente: nem com o interruptor", noCliente.ok, false);
    conferir("consulta curta demais e recusada", (await executarFerramenta("pesquisarNaInternet", { consulta: "x" }, contexto(100))).ok, false);

    // --- no laco da conversa ---
    const usuario = "ZZ-IA-NETL";
    const deps = (padrao, { internet = true } = {}) => ({
      configuracao: { ...configuracaoPadrao("pc"), padrao: { provedor: "lmstudio", modelo: "falso-1" }, tempoLimite: { primeiroTokenMs: 2000, totalMs: 5000 }, internet },
      criarProvedor: () => padrao,
      provedorDisponivel: async () => true,
      limitador: criarLimitador({ porMinuto: 1000 }),
      agoraDoOrcamento: () => Date.UTC(2025, 11, 15, 15),
      pesquisarNaInternet: pesquisarFalso,
    });
    const comBusca = criarProvedorFalso({ roteiro: [{ chamadas: [{ nome: "pesquisarNaInternet", argumentos: { consulta: "clock do atmega328p" } }] }, { texto: "O clock e 16 MHz (fonte: Microchip)." }] });
    const r = await responder({ texto: "qual o clock do atmega328p?", usuario, dependencias: deps(comBusca) });
    conferir("laco: a ferramenta foi oferecida, o sistema tem a regra e a resposta guarda as fontes", [comBusca.pedidos[0].ferramentas.map((f) => f.nome).at(-1), comBusca.pedidos[0].sistema === montarSistema({ internet: true }), ord(r.mensagem.estruturado.fontes)], ["pesquisarNaInternet", true, ord([{ titulo: "Microchip", url: "https://www.microchip.com/x" }])]);
    conferir("laco: a pesquisa aparece na trilha de ferramentas", r.mensagem.estruturado.ferramentas.map((f) => [f.nome, f.ok]), [["pesquisarNaInternet", true]]);
    const semNet = criarProvedorFalso({ roteiro: [{ texto: "ok" }] });
    await responder({ texto: "oi", usuario, dependencias: deps(semNet, { internet: false }) });
    conferir("laco: internet desligada, sem ferramenta e sem a regra", [semNet.pedidos[0].ferramentas.some((f) => f.nome === "pesquisarNaInternet"), semNet.pedidos[0].sistema === montarSistema({})], [false, true]);
    const modoCliente = criarProvedorFalso({ roteiro: [{ texto: "ok" }] });
    await responder({ texto: "oi", usuario, modo: "cliente", dependencias: deps(modoCliente) });
    conferir("laco: modo cliente nunca recebe a internet, mesmo ligada", modoCliente.pedidos[0].ferramentas.some((f) => f.nome === "pesquisarNaInternet"), false);
  }

  // -------------------------------------------------------------------------
  // Entrega A, Tarefa 15 — as quatro abas de configuracao (lib, auditoria e versoes dos prompts)
  // -------------------------------------------------------------------------
  console.log("\nEntrega A: abas de configuracao");
  {
    const { ABAS, RECURSO_DA_ABA, salvarAba } = await import("../src/lib/riseAi/abasDeConfiguracao.js");
    const { registrarVersaoDePrompt, versaoAnterior } = await import("../src/lib/riseAi/versoesDePrompt.js");
    const { gravarConfiguracao, lerConfiguracao } = await import("../src/lib/riseAi/configuracao.js");
    const { ErroDeUso } = await import("../src/lib/riseAi/erros.js");
    const quem = "ZZ-IA-ABAS";
    const formulario = (campos) => {
      const dados = new FormData();
      for (const [nome, valor] of Object.entries(campos)) dados.set(nome, valor);
      return dados;
    };
    const recursosDasAbas = Object.values(RECURSO_DA_ABA);
    const podeTudo = (id) => recursosDasAbas.includes(id) || id === "riseAi.configuracoes.promptCliente";
    const semPromptCliente = (id) => recursosDasAbas.includes(id);
    const auditorias = (oQue) => prisma.auditoriaDeAcesso.findMany({ where: { quem, oQue }, orderBy: { quando: "asc" } });

    conferir("as abas e os recursos de Acessos de cada uma", [ABAS, RECURSO_DA_ABA], [
      ["modelos", "orcamentos", "canais", "atendimento"],
      { modelos: "riseAi.configuracoes.modelos", orcamentos: "riseAi.configuracoes.orcamentos", canais: "riseAi.configuracoes.canais", atendimento: "riseAi.configuracoes.atendimento" },
    ]);

    // Estado conhecido: o que o dono tem fica guardado e volta no fim.
    await prisma.configuracaoIA.deleteMany({ where: { id: "unica" } });
    await gravarConfiguracao({ padrao: { provedor: "ollama", modelo: "zz-modelo" }, internet: false }, { usuario: quem });

    // --- orcamentos ---
    const r1 = await salvarAba("orcamentos", formulario({ orcamentoClientesBrl: "80", orcamentoInternoBrl: "45,50", internet: "true", padraoModelo: "outro", promptInterno: "nao e desta aba" }), { usuario: quem, pode: podeTudo });
    const c1 = await lerConfiguracao();
    conferir("orcamentos grava so os orcamentos (o padrao, a internet e os prompts ficam)", [r1.ok, ord(c1.orcamentos), c1.internet, ord(c1.padrao), c1.prompts.interno], [true, ord({ clientesBrl: 80, internoBrl: 45.5 }), false, ord({ provedor: "ollama", modelo: "zz-modelo" }), null]);
    const a1 = await auditorias("rise-ai.orcamentos");
    conferir("auditoria do orcamento: antes e depois so dos campos tocados, na tabela certa", [a1.length, a1[0]?.alvo, ord(a1[0]?.antes), ord(a1[0]?.depois)], [1, "ConfiguracaoIA", ord({ clientesBrl: 70, internoBrl: 30 }), ord({ clientesBrl: 80, internoBrl: 45.5 })]);

    const invalido = await salvarAba("orcamentos", formulario({ orcamentoInternoBrl: "-1" }), { usuario: quem, pode: podeTudo });
    conferir("orcamento negativo: erro no campo, nada gravado e nada auditado", [invalido.ok, typeof invalido.erros?.["orcamentos.internoBrl"], ord((await lerConfiguracao()).orcamentos), (await auditorias("rise-ai.orcamentos")).length], [false, "string", ord({ clientesBrl: 80, internoBrl: 45.5 }), 1]);
    const igual = await salvarAba("orcamentos", formulario({ orcamentoClientesBrl: "80", orcamentoInternoBrl: "45,50" }), { usuario: quem, pode: podeTudo });
    conferir("salvar os mesmos valores nao gera linha de auditoria", [igual.ok, (await auditorias("rise-ai.orcamentos")).length], [true, 1]);

    // --- canais ---
    const r2 = await salvarAba("canais", formulario({ internet: "true" }), { usuario: quem, pode: podeTudo });
    const a2 = await auditorias("rise-ai.internet");
    conferir("canais grava a internet e audita", [r2.ok, (await lerConfiguracao()).internet, a2.length, ord(a2[0]?.antes), ord(a2[0]?.depois)], [true, true, 1, ord({ internet: false }), ord({ internet: true })]);
    const talvez = await salvarAba("canais", formulario({ internet: "talvez" }), { usuario: quem, pode: podeTudo });
    conferir("internet com valor estranho: erro no campo e nada muda", [talvez.ok, typeof talvez.erros?.internet, (await lerConfiguracao()).internet], [false, "string", true]);

    // --- atendimento: os dois prompts e as versoes ---
    const p1 = await salvarAba("atendimento", formulario({ promptInterno: "Seja direto." }), { usuario: quem, pode: podeTudo });
    conferir("o prompt interno e gravado e a primeira versao nao tem anterior", [p1.ok, (await lerConfiguracao()).prompts.interno, await versaoAnterior("interno")], [true, "Seja direto.", null]);
    const p2 = await salvarAba("atendimento", formulario({ promptInterno: "Seja direto e curto." }), { usuario: quem, pode: podeTudo });
    const anterior = await versaoAnterior("interno");
    conferir("depois do segundo salvamento a versao anterior e a primeira, com quem e quando", [p2.ok, anterior?.texto, anterior?.alteradoPor, anterior?.alteradoEm instanceof Date], [true, "Seja direto.", quem, true]);
    const ap = await auditorias("rise-ai.prompt");
    conferir("a auditoria do prompt leva so o canal e o tamanho, nunca o texto", [ap.length, ord(ap[1]?.antes), ord(ap[1]?.depois), JSON.stringify(ap).includes("Seja direto")], [2, ord({ canal: "interno", tamanho: 12 }), ord({ canal: "interno", tamanho: 20 }), false]);
    await salvarAba("atendimento", formulario({ promptInterno: "Seja direto e curto." }), { usuario: quem, pode: podeTudo });
    conferir("prompt igual ao salvo: nenhuma versao nova", await prisma.versaoDePromptIA.count({ where: { canal: "interno" } }), 2);

    const semPermissao = await salvarAba("atendimento", formulario({ promptInterno: "Nao deve gravar", promptCliente: "Tom formal." }), { usuario: quem, pode: semPromptCliente });
    const c2 = await lerConfiguracao();
    conferir(
      "prompt do cliente sem a permissao: recusado e NADA daquela aba e gravado",
      [semPermissao.ok, semPermissao.erro, c2.prompts.interno, c2.prompts.atendimento, await prisma.versaoDePromptIA.count({ where: { canal: "cliente" } })],
      [false, "Só o administrador altera o prompt das respostas ao cliente.", "Seja direto e curto.", null, 0],
    );
    const comPermissao = await salvarAba("atendimento", formulario({ promptCliente: "Tom formal." }), { usuario: quem, pode: podeTudo });
    conferir("prompt do cliente com a permissao: grava e guarda a versao", [comPermissao.ok, (await lerConfiguracao()).prompts.atendimento, (await prisma.versaoDePromptIA.findMany({ where: { canal: "cliente" } })).map((v) => v.texto)], [true, "Tom formal.", ["Tom formal."]]);

    // --- as 20 versoes mais recentes por canal ---
    for (let i = 1; i <= 21; i++) await registrarVersaoDePrompt("zz-ia-cap", "v" + i, quem);
    const guardadas = (await prisma.versaoDePromptIA.findMany({ where: { canal: "zz-ia-cap" } })).map((v) => v.texto);
    conferir("a 21a versao apaga a mais antiga", [guardadas.length, guardadas.includes("v1"), guardadas.includes("v2"), guardadas.includes("v21")], [20, false, true, true]);
    conferir("a anterior de um canal com 20 versoes e a 20a", (await versaoAnterior("zz-ia-cap"))?.texto, "v20");

    // --- recusas ---
    conferir("aba que nao existe: erro de uso", await salvarAba("inexistente", formulario({}), { usuario: quem, pode: podeTudo }).then(() => "nao lancou", (erro) => erro instanceof ErroDeUso), true);
    conferir("nada para salvar: erro de uso", await salvarAba("canais", formulario({ outraCoisa: "x" }), { usuario: quem, pode: podeTudo }).then(() => "nao lancou", (erro) => erro instanceof ErroDeUso), true);
    const antesDeRecusar = ord(await lerConfiguracao());
    const semAba = await salvarAba("canais", formulario({ internet: "false" }), { usuario: quem, pode: (id) => id !== "riseAi.configuracoes.canais" });
    conferir("sem o recurso da aba em editar: recusado e nada muda", [semAba.ok, ord(await lerConfiguracao())], [false, antesDeRecusar]);

    // --- salvar Modelos nao mexe no resto ---
    const modelos = await salvarAba("modelos", formulario({ padraoProvedor: "ollama", padraoModelo: "zz-modelo-2", orcamentoInternoBrl: "1", internet: "false", promptInterno: "nao deve gravar" }), { usuario: quem, pode: podeTudo });
    const c3 = await lerConfiguracao();
    conferir("salvar Modelos nao mexe em orcamentos, internet nem prompts", [modelos.ok, c3.padrao.modelo, ord(c3.orcamentos), c3.internet, c3.prompts.interno], [true, "zz-modelo-2", ord({ clientesBrl: 80, internoBrl: 45.5 }), true, "Seja direto e curto."]);
  }

  // -------------------------------------------------------------------------
  // Entrega A, Tarefa 17 — Consumo com os orcamentos: a coluna Outros (GastoIA por dia)
  // -------------------------------------------------------------------------
  console.log("\nEntrega A: consumo com os orcamentos");
  {
    const { gastosOutrosPorDia, linhasComOutros } = await import("../src/lib/riseAi/consumo.js");
    // Meses de 2025, sem nenhum gasto real: o teste so enxerga o que ele mesmo grava.
    const gasto = (tipo, brl, usd, criadoEm) => ({ tipo, escopo: "INTERNO", provedor: "anthropic", valorUsd: usd, valorBrl: brl, referencia: "ZZ-IA-consumo", criadoEm: new Date(criadoEm) });
    await prisma.gastoIA.createMany({
      data: [
        // 23h do dia 1 em Sao Paulo = 02h UTC do dia 2: conta no dia 1
        gasto("BUSCA", 0.1209, 0.02015, "2025-10-02T02:00:00Z"),
        gasto("EMBEDDING", 0.05, 0.01, "2025-10-01T15:00:00Z"),
        gasto("TRANSCRICAO", 0.2, 0.04, "2025-10-02T12:00:00Z"),
        // fora do periodo pedido
        gasto("BUSCA", 9, 2, "2025-11-15T12:00:00Z"),
      ],
    });
    const outros = await gastosOutrosPorDia({ de: "2025-10-01", ate: "2025-10-31" });
    conferir(
      "gastos Outros por dia de Sao Paulo, por tipo, do mais recente ao mais antigo, sem outros meses",
      outros.map((dia) => [dia.dia, dia.brl, dia.usd, dia.porTipo]),
      [
        ["2025-10-02", 0.2, 0.04, { TRANSCRICAO: 0.2, EMBEDDING: 0, BUSCA: 0 }],
        ["2025-10-01", 0.1709, 0.03015, { TRANSCRICAO: 0, EMBEDDING: 0.05, BUSCA: 0.1209 }],
      ],
    );
    conferir("sem gasto no periodo: lista vazia", await gastosOutrosPorDia({ de: "2020-01-01", ate: "2020-01-02" }), []);
    conferir(
      "periodo invalido nos Outros",
      [await gastosOutrosPorDia({ de: "2025-10-05", ate: "2025-10-01" }).then(() => "ok", (erro) => erro.message), await gastosOutrosPorDia({ de: "ontem", ate: "2025-10-01" }).then(() => "ok", (erro) => erro.message)],
      ["Período inválido.", "Dia inválido."],
    );

    // --- as linhas da tabela: o valor do dia aparece na primeira linha dele; dia so com Outros ganha uma linha sem modelo ---
    const resposta = (dia, modelo) => ({ dia, provedor: "anthropic", modelo, respostas: 1, tokensEntrada: 10, tokensSaida: 1, custoBrl: 0.01, custoUsd: 0.002, duracaoMediaMs: 500, reservas: 0, falhas: 0, negativas: 0, semResultado: 0, semCusto: 0 });
    const juntas = linhasComOutros([resposta("2025-10-03", "claude-haiku-5-5"), resposta("2025-10-01", "claude-haiku-5-5"), resposta("2025-10-01", "claude-sonnet-5-5")], outros);
    conferir(
      "dias do mais recente ao mais antigo, o valor do dia so na primeira linha, e o dia so com Outros sem modelo",
      juntas.map((linha) => [linha.dia, linha.modelo, linha.outros?.brl ?? null, Boolean(linha.semModelo)]),
      [["2025-10-03", "claude-haiku-5-5", null, false], ["2025-10-02", null, 0.2, true], ["2025-10-01", "claude-haiku-5-5", 0.1709, false], ["2025-10-01", "claude-sonnet-5-5", null, false]],
    );
    conferir("a linha de so Outros nao conta respostas", [juntas[1].respostas, juntas[1].custoBrl], [0, 0]);
    conferir("sem Outros, as linhas ficam como vieram", linhasComOutros([resposta("2025-10-01", "x")], []).map((linha) => [linha.dia, linha.outros]), [["2025-10-01", null]]);
  }

  // ---- novos blocos entram antes desta linha ----
} finally {
  await limpar();
  await devolverOQueEraDoDono();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes do Rise AI OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);
