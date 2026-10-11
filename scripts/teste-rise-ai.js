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

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

/** O que e do dono e os testes mexem: lido antes e devolvido no fim (a linha unica da configuracao e a Conexao OLLAMA). */
const guardados = {
  configuracao: await prisma.configuracaoIA.findUnique({ where: { id: "unica" } }),
  ollama: await prisma.conexao.findUnique({ where: { servico: "OLLAMA" } }),
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
}

/** Apaga tudo o que os testes criam. Roda no comeco (resto de uma execucao que caiu) e no fim. */
async function limpar() {
  await prisma.conversaIA.deleteMany({ where: { usuario: { startsWith: "ZZ-IA-" } } });
  await prisma.conhecimentoIA.deleteMany({ where: { assunto: { startsWith: "ZZ-IA" } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-IA-" } } });
  await prisma.logIntegracao.deleteMany({ where: { endpoint: "falso-1" } });
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
    const { ehAdministrador, usuarioDaSessao, exigirAdministrador } = await import("../src/lib/riseAi/acesso.js");
    const { configuracaoPadrao, validarConfiguracao, lerConfiguracao, gravarConfiguracao, lerChave, gravarChave, estadoDasChaves } =
      await import("../src/lib/riseAi/configuracao.js");
    const { criarLimitador } = await import("../src/lib/riseAi/limite.js");
    console.log("\nAcesso e configuracao");

    conferir("PC: todo mundo e admin", ehAdministrador("ana", {}), true);
    conferir(
      "VPS: so quem esta na lista",
      [
        ehAdministrador("Maicol", { RISE_PRODUCAO: "1", RISE_AI_ADMINS: "maicol, outro" }),
        ehAdministrador("ana", { RISE_PRODUCAO: "1", RISE_AI_ADMINS: "maicol" }),
      ],
      [true, false],
    );
    conferir("VPS sem lista: ninguem", ehAdministrador("Maicol", { RISE_PRODUCAO: "1" }), false);
    conferir("VPS sem nome: ninguem", ehAdministrador("", { RISE_PRODUCAO: "1", RISE_AI_ADMINS: "," }), false);
    conferir(
      "usuario da sessao: PC e VPS",
      [
        usuarioDaSessao(new Headers(), {}),
        usuarioDaSessao(new Headers({ "remote-user": "Maicol" }), { RISE_PRODUCAO: "1" }),
        usuarioDaSessao(new Headers(), { RISE_PRODUCAO: "1" }),
      ],
      ["pc", "Maicol", "desconhecido"],
    );
    conferir(
      "exigirAdministrador lanca",
      (() => {
        try {
          exigirAdministrador({ administrador: false });
          return "passou";
        } catch (erro) {
          return erro.message;
        }
      })(),
      "Só administradores do Rise AI podem fazer isso.",
    );
    conferir("exigirAdministrador deixa passar o admin", exigirAdministrador({ administrador: true }), undefined);

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
    conferir("publico nao recebe ferramenta de produto", definicoesParaProvedor("publico").map((d) => d.nome).filter((nome) => nome !== "buscarConhecimento"), []);

    const executar = (nome, args, contexto = { perfil: "admin" }) => executarFerramenta(nome, args, contexto);
    conferir("zod recusa argumento invalido", (await executar("consultarProduto", { sku: "x".repeat(500) })).ok, false);
    conferir("zod recusa limite fora da faixa", (await executar("buscarProdutos", { termos: "zzia", limite: 50 })).ok, false);
    conferir("ferramenta inexistente", (await executar("apagarTudo", {})).ok, false);
    conferir("perfil sem permissao", (await executar("consultarProduto", { sku: "ZZ-IA-UNO" }, { perfil: "publico" })).ok, false);
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
    conferir("buscarConhecimento tambem serve ao perfil publico", definicoesParaProvedor("publico").map((d) => d.nome), ["buscarConhecimento"]);
    conferir("a ferramenta recusa termos vazios", (await executarFerramenta("buscarConhecimento", { termos: "" }, { perfil: "admin" })).ok, false);
  }

  // -------------------------------------------------------------------------
  // Tarefa 9 — Resposta, prompt e o laco da conversa
  // -------------------------------------------------------------------------
  {
    const { separarResposta, produtosCitados, tituloDaConversa, estimarTokens, cortarHistorico, extrairJson } = await import("../src/lib/riseAi/resposta.js");
    const { montarSistema, mensagemDeConhecimento, SISTEMA_FIXO, PROMPT_ATENDIMENTO_PADRAO } = await import("../src/lib/riseAi/prompt.js");
    const { mensagensParaOpenAI } = await import("../src/lib/riseAi/provedores/openaiCompativel.js");
    const { responder } = await import("../src/lib/riseAi/conversa.js");
    const { carregarConversa, listarConversas, renomearConversa, excluirConversa, avaliarMensagem } = await import("../src/lib/riseAi/conversas.js");
    const { configuracaoPadrao } = await import("../src/lib/riseAi/configuracao.js");
    const { criarLimitador } = await import("../src/lib/riseAi/limite.js");
    const { criarConhecimento } = await import("../src/lib/riseAi/conhecimento.js");
    const { criarProvedorFalso } = await import("./lib/provedorFalso.js");

    console.log("\nResposta e prompt");
    conferir(
      "separa os dois blocos",
      separarResposta("### Resposta para o cliente\nOlá!\n\n### Para a equipe\nUsei o Uno."),
      { respostaCliente: "Olá!", paraEquipe: "Usei o Uno.", semSeparacao: false },
    );
    conferir("sem marcador", separarResposta("Olá! Serve o Uno."), { respostaCliente: "Olá! Serve o Uno.", paraEquipe: "", semSeparacao: true });
    conferir(
      "marcador em negrito, sem acento e em outra caixa",
      separarResposta("**Resposta Para O Cliente:**\nOi\n\n## para a equipe\nNota"),
      { respostaCliente: "Oi", paraEquipe: "Nota", semSeparacao: false },
    );
    conferir(
      "so o marcador da equipe: o que vem antes ainda e do cliente, nunca da equipe",
      separarResposta("Texto do cliente.\n### Para a equipe\nInterno: custo R$ 20"),
      { respostaCliente: "Texto do cliente.", paraEquipe: "Interno: custo R$ 20", semSeparacao: true },
    );
    conferir("resposta vazia", separarResposta(""), { respostaCliente: "", paraEquipe: "", semSeparacao: true });

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
    conferir("sistema = regras fixas + estilo", montarSistema({}) === `${SISTEMA_FIXO}\n\n${PROMPT_ATENDIMENTO_PADRAO}`, true);
    conferir("o estilo da tela substitui o padrao, nunca as regras fixas", montarSistema({ promptAtendimento: "ESTILO NOVO" }).startsWith(SISTEMA_FIXO) && montarSistema({ promptAtendimento: "ESTILO NOVO" }).endsWith("ESTILO NOVO"), true);
    conferir("as regras fixas dizem o formato e proibem custo", [SISTEMA_FIXO.includes("### Resposta para o cliente"), SISTEMA_FIXO.includes("### Para a equipe"), /custo/i.test(SISTEMA_FIXO)], [true, true, true]);
    conferir("sistema sem data nem nome (estavel para o cache de prefixo)", /\b20\d\d\b/.test(montarSistema({})), false);
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
    conferir("quadro do cliente e equipe", [r1.mensagem.estruturado.respostaCliente.startsWith("Olá!"), r1.mensagem.estruturado.paraEquipe], [true, "Nano sem estoque."]);
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
    conferir("avisos sem_resultado e sem_separacao", [...r6.mensagem.avisos].sort(), ["sem_resultado", "sem_separacao"]);
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
      [typeof paraATela.custoBrl, typeof paraATela.custoUsd, typeof paraATela.criadoEm, paraATela.papel, paraATela.provedor, paraATela.estruturado.respostaCliente.startsWith("Olá!"), Array.isArray(paraATela.avisos)],
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

  // ---- novos blocos entram antes desta linha ----
} finally {
  await limpar();
  await devolverOQueEraDoDono();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes do Rise AI OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);
