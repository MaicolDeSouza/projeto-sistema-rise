import "dotenv/config";

/**
 * Testes do servidor MCP do Rise (plano `docs/superpowers/plans/2026-10-20-mcp-rise-e-rumo-do-rise-ai.md`), SEM rede e
 * SEM IA paga:
 *
 *   npm run teste:mcp
 *
 * Um bloco por tarefa do plano. Os dados de teste levam `zz-mcp-*` (logins), `ZZ-MCP *` (funcoes e clientes OAuth) e
 * `ZZ-MCP-*` (produtos), e saem no comeco (resto de uma execucao que caiu) e no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { z } = await import("zod");
const { CLIENT_CAPABILITIES_META_KEY, CLIENT_INFO_META_KEY, McpServer, PROTOCOL_VERSION_META_KEY, createMcpHandler } = await import("@modelcontextprotocol/server");

// A revisao do protocolo sem sessoes (a que o claude.ai fala hoje). O SDK 2.3.1 nao a exporta: `REVISAO_MODERNA` dele
// e a ULTIMA DA ERA ANTIGA (2025-11-25), e mandar essa com o envelope novo da 400 "Unsupported protocol version" (medido).
const REVISAO_MODERNA = "2026-07-28";

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

/** A resposta do /mcp vem em JSON ou em SSE (um evento `data:` com a mensagem JSON-RPC): devolve a mensagem nos dois casos. */
async function lerRespostaMcp(resposta) {
  const texto = await resposta.text();
  if (!(resposta.headers.get("content-type") ?? "").includes("text/event-stream")) return texto ? JSON.parse(texto) : null;
  const dados = texto.split("\n").filter((linha) => linha.startsWith("data:")).map((linha) => linha.slice(5).trim()).filter(Boolean);
  return dados.length ? JSON.parse(dados[dados.length - 1]) : null;
}

/**
 * Um pedido JSON-RPC como o claude.ai manda. `era` "moderna" = revisao 2026-07-28: cabecalhos MCP-Protocol-Version e
 * Mcp-Method, e o envelope `_meta` em todo pedido. "antiga" = os clientes de 2025: sem cabecalho de versao nem envelope.
 */
function pedidoMcp(metodo, parametros = {}, { era = "moderna", id = 1, cabecalhos = {}, url = "https://rise.teste/mcp" } = {}) {
  const moderno = era === "moderna";
  const params = moderno
    ? {
        ...parametros,
        _meta: {
          [PROTOCOL_VERSION_META_KEY]: REVISAO_MODERNA,
          [CLIENT_INFO_META_KEY]: { name: "teste-mcp", version: "1.0.0" },
          [CLIENT_CAPABILITIES_META_KEY]: {},
        },
      }
    : parametros;
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(moderno ? { "mcp-protocol-version": REVISAO_MODERNA, "mcp-method": metodo, ...(parametros.name ? { "mcp-name": parametros.name } : {}) } : {}),
      ...cabecalhos,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: metodo, params }),
  });
}

/** Apaga tudo o que os testes criam. Os blocos que gravam no banco (Tarefa 2 em diante) acrescentam aqui o que apagam. */
async function limpar() {}

try {
  await limpar();

  // -------------------------------------------------------------------------
  // Tarefa 1 — Sondagem do SDK (@modelcontextprotocol/server 2.3.1): a fabrica roda por requisicao, sem estado, nas duas eras
  // -------------------------------------------------------------------------
  // O que a sondagem mostrou (20/10/2026) e o servidor do Rise usa: `createMcpHandler(fabrica, opcoes)` devolve
  // `{ fetch(request, { authInfo }), close }`; a fabrica recebe `{ era: "modern" | "legacy", authInfo, requestInfo }` e roda
  // UMA vez por pedido; `new McpServer(info, { instructions })`; `registerTool(nome, { description, inputSchema: z.object, annotations },
  // (args, ctx) => ...)` com o authInfo em `ctx.http.authInfo`; o zod do inputSchema ja recusa argumento errado (isError);
  // `legacy` padrao "stateless" atende o initialize de 2025 sem sessao; GET responde 405. O modo de resposta padrao ("auto")
  // ja devolve JSON quando a ferramenta nao manda notificacao; o "json" imprime um aviso no console a cada handler criado.
  {
    console.log("\nSondagem do SDK");
    const eras = [];
    const handler = createMcpHandler(
      ({ era }) => {
        eras.push(era);
        const servidor = new McpServer({ name: "rise-teste", version: "0.0.0" }, { instructions: "teste" });
        servidor.registerTool(
          "eco",
          { description: "Devolve o texto.", inputSchema: z.object({ texto: z.string() }), annotations: { readOnlyHint: true } },
          async ({ texto }, ctx) => ({ content: [{ type: "text", text: `${texto}|${ctx?.http?.authInfo?.clientId ?? "sem-auth"}` }] }),
        );
        return servidor;
      },
    );

    const descoberta = await lerRespostaMcp(await handler.fetch(pedidoMcp("server/discover")));
    conferir(
      "server/discover traz as instrucoes, a revisao moderna e a capacidade de ferramentas",
      [descoberta?.result?.instructions, descoberta?.result?.supportedVersions?.includes(REVISAO_MODERNA), Boolean(descoberta?.result?.capabilities?.tools)],
      ["teste", true, true],
    );

    const lista = await lerRespostaMcp(await handler.fetch(pedidoMcp("tools/list", {}, { id: 2 })));
    conferir("tools/list tem a ferramenta eco com readOnlyHint", [lista?.result?.tools?.map((ferramenta) => ferramenta.name), lista?.result?.tools?.[0]?.annotations?.readOnlyHint], [["eco"], true]);

    const chamada = await lerRespostaMcp(
      await handler.fetch(pedidoMcp("tools/call", { name: "eco", arguments: { texto: "oi" } }, { id: 3 }), { authInfo: { token: "", clientId: "cliente-x", scopes: ["consultar"], expiresAt: Math.floor(Date.now() / 1000) + 60 } }),
    );
    conferir("tools/call devolve o texto e o authInfo chega ao handler", chamada?.result?.content?.[0]?.text, "oi|cliente-x");

    const argumentoRuim = await lerRespostaMcp(await handler.fetch(pedidoMcp("tools/call", { name: "eco", arguments: { texto: 5 } }, { id: 4 })));
    conferir("argumento invalido vira isError (o SDK valida pelo zod)", argumentoRuim?.result?.isError ?? Boolean(argumentoRuim?.error), true);

    const antigo = await lerRespostaMcp(
      await handler.fetch(
        pedidoMcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "antigo", version: "1" } }, { era: "antiga", id: 5, cabecalhos: { "mcp-session-id": "qualquer" } }),
      ),
    );
    conferir("cliente de 2025 (initialize) e atendido sem estado", [typeof antigo?.result?.protocolVersion, antigo?.result?.instructions ?? null, antigo?.error ?? null], ["string", "teste", null]);

    const get = await handler.fetch(new Request("https://rise.teste/mcp", { method: "GET", headers: { accept: "text/event-stream" } }));
    conferir("GET no /mcp responde 405", get.status, 405);
    conferir("a fabrica rodou uma vez por pedido, nas duas eras", [eras.length >= 5, eras.includes("modern"), eras.includes("legacy")], [true, true, true]);
    await handler.close();
  }

  // (os blocos das tarefas seguintes entram aqui, antes do finally)
} catch (erro) {
  falhas++;
  console.error("FALHA inesperada:", erro);
} finally {
  await limpar().catch((erro) => console.error("limpeza falhou:", erro));
}

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
