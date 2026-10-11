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

  // ---- novos blocos entram antes desta linha ----
} finally {
  await limpar();
  await devolverOQueEraDoDono();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes do Rise AI OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);
