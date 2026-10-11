import "dotenv/config";

/**
 * Testes do Rise AI (Entrega 1): regras puras e gravacao no Postgres, SEM rede.
 *
 *   npm run teste:rise-ai
 *
 * Um bloco por tarefa do plano `docs/superpowers/plans/2026-10-11-rise-ai-entrega-1.md`. Os dados de teste levam
 * o prefixo `ZZ-IA-` e saem no `finally`; o teste nunca toca na `Conexao` de BLING, MERCADO_LIVRE, LOJA_INTEGRADA,
 * ANTHROPIC nem GEMINI (usa OLLAMA e a apaga) e guarda/restaura a linha `unica` da ConfiguracaoIA.
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

/** Apaga tudo o que os testes criam. Roda no comeco (resto de uma execucao que caiu) e no fim. */
async function limpar() {
  await prisma.conversaIA.deleteMany({ where: { usuario: { startsWith: "ZZ-IA-" } } });
  await prisma.conhecimentoIA.deleteMany({ where: { assunto: { startsWith: "ZZ-IA" } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-IA-" } } });
  await prisma.logIntegracao.deleteMany({ where: { endpoint: "falso-1" } });
  await prisma.conexao.deleteMany({ where: { servico: "OLLAMA" } });
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

  // ---- novos blocos entram antes desta linha ----
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes do Rise AI OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);
