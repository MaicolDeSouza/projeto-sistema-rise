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

const { prisma } = await import("../src/lib/db.js");
const { Prisma } = await import("@/generated/prisma/client");
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

/** O codigo do erro do Prisma (P2002...) ou a mensagem; `null` quando a promessa deu certo. */
async function codigoDoErro(promessa) {
  try {
    await promessa;
    return null;
  } catch (erro) {
    return erro?.code ?? String(erro?.message ?? erro);
  }
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

/** Apaga tudo o que os testes criam. Tokens e codigos saem junto com o cliente (Cascade). */
async function limpar() {
  await prisma.chamadaMcp.deleteMany({ where: { login: { startsWith: "zz-mcp-" } } });
  await prisma.clienteMcp.deleteMany({ where: { nome: { startsWith: "ZZ-MCP" } } });
  await prisma.conversaIA.deleteMany({ where: { usuario: { startsWith: "zz-mcp-" } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-MCP-" } } });
  // Usuarios antes das funcoes (o vinculo sai junto com o usuario).
  await prisma.usuarioRise.deleteMany({ where: { login: { startsWith: "zz-mcp-" } } });
  await prisma.funcaoRise.deleteMany({ where: { nome: { startsWith: "ZZ-MCP" } } });
}

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

  // -------------------------------------------------------------------------
  // Tarefa 2 — Banco: clientes OAuth, codigos e tokens (so hash), ChamadaMcp e o canal da conversa
  // -------------------------------------------------------------------------
  {
    console.log("\nBanco");
    const agora = new Date();
    const depois = (ms) => new Date(agora.getTime() + ms);
    const cliente = await prisma.clienteMcp.create({ data: { nome: "ZZ-MCP Teste", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] } });
    const token = await prisma.tokenMcp.create({
      data: { hashAcesso: "zz-mcp-acesso-1", hashRenovacao: "zz-mcp-renovacao-1", familia: "zz-mcp-familia-1", clienteId: cliente.id, login: "zz-mcp-um", escopos: ["consultar"], expiraEm: depois(3600e3), renovacaoExpiraEm: depois(30 * 864e5) },
    });
    const codigo = await prisma.codigoMcp.create({
      data: { hash: "zz-mcp-codigo-1", clienteId: cliente.id, login: "zz-mcp-um", redirectUri: "https://claude.ai/api/mcp/auth_callback", codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", resource: "https://rise.teste/mcp", escopos: ["consultar"], expiraEm: depois(300e3) },
    });
    conferir("cliente com token e codigo, nada revogado nem usado", [token.revogadoEm, token.substituidoEm, codigo.usadoEm, cliente.redirectUris], [null, null, null, ["https://claude.ai/api/mcp/auth_callback"]]);
    const repetido = (campos) => prisma.tokenMcp.create({ data: { hashAcesso: "zz-mcp-acesso-2", hashRenovacao: "zz-mcp-renovacao-2", familia: "zz-mcp-familia-1", clienteId: cliente.id, login: "zz-mcp-um", escopos: [], expiraEm: agora, renovacaoExpiraEm: agora, ...campos } });
    conferir("hash do acesso e da renovacao sao unicos", [await codigoDoErro(repetido({ hashAcesso: "zz-mcp-acesso-1" })), await codigoDoErro(repetido({ hashRenovacao: "zz-mcp-renovacao-1" }))], ["P2002", "P2002"]);
    conferir("hash do codigo e unico", await codigoDoErro(prisma.codigoMcp.create({ data: { ...codigo, id: undefined } })), "P2002");
    await prisma.clienteMcp.delete({ where: { id: cliente.id } });
    conferir("apagar o cliente leva os tokens e os codigos dele", [await prisma.tokenMcp.count({ where: { id: token.id } }), await prisma.codigoMcp.count({ where: { id: codigo.id } })], [0, 0]);

    const conversa = await prisma.conversaIA.create({ data: { titulo: "ZZ-MCP teste", usuario: "zz-mcp-um" } });
    const doMcp = await prisma.conversaIA.create({ data: { titulo: "ZZ-MCP duvidas", usuario: "zz-mcp-um", canal: "MCP" } });
    conferir("conversa sem canal nasce CHAT; a do MCP guarda MCP", [conversa.canal, doMcp.canal], ["CHAT", "MCP"]);

    const chamada = await prisma.chamadaMcp.create({ data: { login: "zz-mcp-um", clienteId: null, clienteNome: "Claude", ferramenta: "buscarProdutos", argumentos: Prisma.DbNull, ok: true, duracaoMs: 12 } });
    conferir("ChamadaMcp grava sem argumentos e com a hora", [chamada.argumentos, chamada.erro, chamada.quando instanceof Date], [null, null, true]);
  }

  // -------------------------------------------------------------------------
  // Tarefa 3 — Regras puras do OAuth (metadados, redirects, registro, pedido de autorizacao, PKCE, hashes, Host/Origin)
  // -------------------------------------------------------------------------
  {
    console.log("\nOAuth puro");
    const oauth = await import("../src/lib/mcp/oauth.js");
    const origem = "https://rise.teste";

    conferir("validades e escopo", [oauth.ESCOPO, oauth.VALIDADE_DO_CODIGO_MS, oauth.VALIDADE_DO_ACESSO_S, oauth.VALIDADE_DA_RENOVACAO_MS], ["consultar", 300000, 3600, 2592000000]);
    conferir("metadados do recurso (RFC 9728)", oauth.metadadosDoRecurso(origem), {
      resource: "https://rise.teste/mcp",
      authorization_servers: ["https://rise.teste"],
      scopes_supported: ["consultar"],
      bearer_methods_supported: ["header"],
      resource_name: "Rise",
    });
    conferir("metadados do servidor de autorizacao (RFC 8414)", oauth.metadadosDoServidor(origem), {
      issuer: "https://rise.teste",
      authorization_endpoint: "https://rise.teste/mcp/oauth/authorize",
      token_endpoint: "https://rise.teste/mcp/oauth/token",
      registration_endpoint: "https://rise.teste/mcp/oauth/register",
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["consultar"],
      authorization_response_iss_parameter_supported: true,
    });

    const bons = [
      "https://claude.ai/api/mcp/auth_callback",
      "https://chatgpt.com/connector_platform_oauth_redirect",
      "https://chatgpt.com/connector/oauth/abc_123-X",
      "http://localhost/callback",
      "http://127.0.0.1:51234/callback",
    ];
    const ruins = [
      "https://claude.ai/outra",
      "http://claude.ai/api/mcp/auth_callback",
      "https://claude.ai.atacante.com/api/mcp/auth_callback",
      "https://user@claude.ai/api/mcp/auth_callback",
      "https://claude.ai/api/mcp/auth_callback#x",
      "https://chatgpt.com/connector/oauth/",
      "https://chatgpt.com/connector/oauth/a/b",
      "http://localhost/x",
      "https://localhost/callback",
      "http://localhost.atacante.com/callback",
      "javascript:alert(1)",
      "nao e url",
    ];
    conferir("redirects permitidos", bons.map(oauth.redirectPermitido), bons.map(() => true));
    conferir("redirects recusados", ruins.map(oauth.redirectPermitido), ruins.map(() => false));
    conferir(
      "mesmo redirect: porta do loopback nao conta, o resto e exato",
      [
        oauth.mesmoRedirect("http://localhost/callback", "http://localhost:51234/callback"),
        oauth.mesmoRedirect("http://localhost/callback", "http://127.0.0.1/callback"),
        oauth.mesmoRedirect("https://claude.ai/api/mcp/auth_callback", "https://claude.ai/api/mcp/auth_callback"),
        oauth.mesmoRedirect("https://claude.ai/api/mcp/auth_callback", "https://chatgpt.com/connector_platform_oauth_redirect"),
      ],
      [true, false, true, false],
    );

    const doClaude = { client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" };
    conferir("registro do claude.ai e aceito", oauth.validarRegistro(doClaude), { ok: true, cliente: { nome: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] } });
    conferir("registro sem nome vira 'Cliente MCP'; nome longo e cortado em 60", [oauth.validarRegistro({ redirect_uris: ["http://localhost/callback"] }).cliente?.nome, oauth.validarRegistro({ ...doClaude, client_name: "x".repeat(80) }).cliente?.nome.length], ["Cliente MCP", 60]);
    conferir(
      "registro recusado: sem redirect, redirect de fora, segredo de cliente, grant e response desconhecidos, corpo que nao e objeto",
      [
        oauth.validarRegistro({ ...doClaude, redirect_uris: [] }).erro,
        oauth.validarRegistro({ ...doClaude, redirect_uris: ["https://atacante.com/cb"] }).erro,
        oauth.validarRegistro({ ...doClaude, token_endpoint_auth_method: "client_secret_basic" }).erro,
        oauth.validarRegistro({ ...doClaude, grant_types: ["client_credentials"] }).erro,
        oauth.validarRegistro({ ...doClaude, response_types: ["token"] }).erro,
        oauth.validarRegistro(null).erro,
      ],
      ["invalid_redirect_uri", "invalid_redirect_uri", "invalid_client_metadata", "invalid_client_metadata", "invalid_client_metadata", "invalid_client_metadata"],
    );

    const cliente = { id: "cliente-1", nome: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback", "http://localhost/callback"] };
    const desafio = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    const pedidoBom = { response_type: "code", client_id: "cliente-1", redirect_uri: "https://claude.ai/api/mcp/auth_callback", code_challenge: desafio, code_challenge_method: "S256", state: "abc", resource: "https://rise.teste/mcp", scope: "consultar" };
    const validar = (mudancas) => oauth.validarPedidoDeAutorizacao({ ...pedidoBom, ...mudancas }, cliente, { recursoEsperado: "https://rise.teste/mcp" });
    conferir("pedido de autorizacao bom", validar({}), {
      ok: true,
      pedido: { clientId: "cliente-1", redirectUri: "https://claude.ai/api/mcp/auth_callback", codeChallenge: desafio, state: "abc", resource: "https://rise.teste/mcp", escopos: ["consultar"] },
    });
    conferir("aceita URLSearchParams, sem scope e sem resource (vale o esperado)", oauth.validarPedidoDeAutorizacao(new URLSearchParams({ ...pedidoBom, scope: "", resource: "" }), cliente, { recursoEsperado: "https://rise.teste/mcp" }).pedido?.resource, "https://rise.teste/mcp");
    conferir("loopback do Claude Code com outra porta passa", validar({ redirect_uri: "http://localhost:4567/callback" }).pedido?.redirectUri, "http://localhost:4567/callback");
    const resumo = (resultado) => [resultado.ok, resultado.erro, resultado.redirecionavel];
    conferir(
      "pedidos recusados, e quais podem voltar ao cliente com o erro",
      [
        resumo(validar({ code_challenge: "" })),
        resumo(validar({ code_challenge_method: "plain" })),
        resumo(validar({ code_challenge: "curto" })),
        resumo(validar({ redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect" })),
        resumo(validar({ redirect_uri: "" })),
        resumo(validar({ resource: "https://rise.teste/outro" })),
        resumo(validar({ scope: "consultar escrever" })),
        resumo(validar({ client_id: "outro" })),
        resumo(validar({ response_type: "token" })),
        resumo(oauth.validarPedidoDeAutorizacao(pedidoBom, null, { recursoEsperado: "https://rise.teste/mcp" })),
      ],
      [
        [false, "invalid_request", true],
        [false, "invalid_request", true],
        [false, "invalid_request", true],
        [false, "invalid_request", false],
        [false, "invalid_request", false],
        [false, "invalid_target", true],
        [false, "invalid_scope", true],
        [false, "invalid_client", false],
        [false, "unsupported_response_type", true],
        [false, "invalid_client", false],
      ],
    );

    // O par do RFC 7636, apendice B.
    conferir(
      "PKCE S256",
      [oauth.conferirPkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk", desafio), oauth.conferirPkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXl", desafio), oauth.conferirPkce("curto", desafio), oauth.conferirPkce(undefined, desafio)],
      [true, false, false, false],
    );
    const segredo = oauth.gerarSegredo();
    conferir(
      "segredo aleatorio em base64url e hash sha-256 hex",
      [/^[A-Za-z0-9_-]{43}$/.test(segredo), segredo === oauth.gerarSegredo(), oauth.hashDoSegredo("abc"), oauth.hashDoSegredo(segredo) === segredo],
      [true, false, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", false],
    );

    conferir(
      "url de retorno com code, state e iss; a de erro com error e error_description",
      [
        oauth.urlDeRetorno("https://claude.ai/api/mcp/auth_callback", { code: "c1", state: "s 1", iss: origem }),
        oauth.urlDeRetorno("http://localhost:4567/callback?x=1", { code: "c1", iss: origem }),
        oauth.urlDeErro("https://claude.ai/api/mcp/auth_callback", { erro: "access_denied", descricao: "Recusado.", state: "s", iss: origem }),
      ],
      [
        "https://claude.ai/api/mcp/auth_callback?code=c1&state=s+1&iss=https%3A%2F%2Frise.teste",
        "http://localhost:4567/callback?x=1&code=c1&iss=https%3A%2F%2Frise.teste",
        "https://claude.ai/api/mcp/auth_callback?error=access_denied&error_description=Recusado.&state=s&iss=https%3A%2F%2Frise.teste",
      ],
    );
    const json = oauth.respostaJson(400, { error: "invalid_request" });
    conferir("resposta JSON sem cache", [json.status, json.headers.get("content-type"), json.headers.get("cache-control"), await json.json()], [400, "application/json", "no-store", { error: "invalid_request" }]);
    conferir(
      "desafio do WWW-Authenticate",
      [oauth.cabecalhoDeDesafio(origem), oauth.cabecalhoDeDesafio(origem, { erro: "invalid_token", descricao: 'Token "inválido".' }), oauth.cabecalhoDeDesafio(origem, { erro: "insufficient_scope", escopo: "consultar" })],
      [
        'Bearer resource_metadata="https://rise.teste/.well-known/oauth-protected-resource/mcp"',
        'Bearer resource_metadata="https://rise.teste/.well-known/oauth-protected-resource/mcp", error="invalid_token", error_description="Token inválido."',
        'Bearer resource_metadata="https://rise.teste/.well-known/oauth-protected-resource/mcp", error="insufficient_scope", scope="consultar"',
      ],
    );

    const pedido = (url, cabecalhos = {}) => new Request(url, { headers: cabecalhos });
    const vps = { APP_URL_PUBLICA: "https://rise.4hobby.com.br/" };
    conferir(
      "origem do Rise: APP_URL_PUBLICA sem a barra; sem ela, a do pedido",
      [oauth.origemDoRise(pedido("http://app:3000/mcp"), vps), oauth.origemDoRise(pedido("https://localhost:3000/mcp"), {})],
      ["https://rise.4hobby.com.br", "https://localhost:3000"],
    );
    conferir(
      "Host: na VPS so o da APP_URL_PUBLICA; no PC so localhost e 127.0.0.1",
      [
        oauth.hostPermitido(pedido("http://app:3000/mcp", { host: "rise.4hobby.com.br" }), vps),
        oauth.hostPermitido(pedido("http://app:3000/mcp", { host: "RISE.4hobby.com.br" }), vps),
        oauth.hostPermitido(pedido("http://app:3000/mcp", { host: "atacante.com" }), vps),
        oauth.hostPermitido(pedido("https://localhost:3000/mcp", { host: "localhost:3000" }), {}),
        oauth.hostPermitido(pedido("https://127.0.0.1:3000/mcp", { host: "127.0.0.1:3000" }), {}),
        oauth.hostPermitido(pedido("https://localhost:3000/mcp", { host: "rebinding.atacante.com:3000" }), {}),
      ],
      [true, true, false, true, true, false],
    );
    conferir(
      "Origin: ausente passa; so a do proprio Rise; 'null' e outro site nao",
      [
        oauth.originPermitida(pedido("https://rise.4hobby.com.br/mcp"), vps),
        oauth.originPermitida(pedido("https://rise.4hobby.com.br/mcp", { origin: "https://rise.4hobby.com.br" }), vps),
        oauth.originPermitida(pedido("https://rise.4hobby.com.br/mcp", { origin: "https://atacante.com" }), vps),
        oauth.originPermitida(pedido("https://rise.4hobby.com.br/mcp", { origin: "null" }), vps),
      ],
      [true, true, false, false],
    );
  }

  // -------------------------------------------------------------------------
  // Tarefa 4 — Clientes, codigos e tokens no banco (so hash), com rotacao e revogacao por familia
  // -------------------------------------------------------------------------
  {
    console.log("\nOAuth no banco");
    const banco = await import("../src/lib/mcp/oauthBanco.js");
    const { hashDoSegredo } = await import("../src/lib/mcp/oauth.js");
    const login = "zz-mcp-andrea";
    const verificador = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const desafio = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
    const retorno = "https://claude.ai/api/mcp/auth_callback";
    const recurso = "https://rise.teste/mcp";
    const agora = Date.now();

    const registrado = await banco.registrarCliente({ nome: "ZZ-MCP Claude", redirectUris: [retorno] });
    conferir("registrar e carregar o cliente", await banco.carregarCliente(registrado.clientId), { id: registrado.clientId, nome: "ZZ-MCP Claude", redirectUris: [retorno] });
    conferir("cliente inexistente ou id que nao e texto", [await banco.carregarCliente("nao-existe"), await banco.carregarCliente(undefined), await banco.carregarCliente({ id: 1 })], [null, null, null]);

    const novoCodigo = () => banco.emitirCodigo({ clienteId: registrado.clientId, login, redirectUri: retorno, codeChallenge: desafio, resource: recurso, escopos: ["consultar"] }, { agora });
    const trocar = (codigo, mudancas = {}, opcoes = { agora }) =>
      banco.trocarCodigo({ codigo, clientId: registrado.clientId, redirectUri: retorno, codeVerifier: verificador, resource: recurso, ...mudancas }, opcoes);

    const codigo = await novoCodigo();
    const guardado = await prisma.codigoMcp.findFirst({ where: { clienteId: registrado.clientId } });
    conferir("o banco guarda so o hash do codigo", [guardado.hash === codigo, guardado.hash === hashDoSegredo(codigo), guardado.expiraEm.getTime() - agora], [false, true, 300000]);

    const troca = await trocar(codigo);
    conferir("troca boa devolve acesso e renovacao", [troca.ok, troca.tokens?.token_type, troca.tokens?.expires_in, troca.tokens?.scope, typeof troca.tokens?.access_token, typeof troca.tokens?.refresh_token], [true, "Bearer", 3600, "consultar", "string", "string"]);
    conferir(
      "o token vale e o banco nao tem o texto dele",
      [(await banco.validarTokenDeAcesso(troca.tokens.access_token, { agora }))?.login, (await banco.validarTokenDeAcesso(troca.tokens.access_token, { agora }))?.clienteNome, await prisma.tokenMcp.count({ where: { OR: [{ hashAcesso: troca.tokens.access_token }, { hashRenovacao: troca.tokens.refresh_token }] } })],
      [login, "ZZ-MCP Claude", 0],
    );
    conferir("acesso vence em 1 hora", await banco.validarTokenDeAcesso(troca.tokens.access_token, { agora: agora + 3601e3 }), null);

    const reuso = await trocar(codigo);
    conferir("codigo usado de novo: invalid_grant e o token da primeira troca cai", [reuso.erro, await banco.validarTokenDeAcesso(troca.tokens.access_token, { agora })], ["invalid_grant", null]);

    const recusas = [
      await trocar(await novoCodigo(), { codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXl" }),
      await trocar(await novoCodigo(), { redirectUri: "http://localhost/callback" }),
      await trocar(await novoCodigo(), { resource: "https://rise.teste/outro" }),
      await trocar(await novoCodigo(), {}, { agora: agora + 6 * 60e3 }),
      await trocar(await novoCodigo(), { clientId: "outro-cliente" }),
      await trocar("codigo-que-nao-existe"),
      await trocar(undefined),
    ];
    conferir(
      "troca recusada: PKCE, retorno, recurso, codigo vencido, outro cliente, codigo inventado e sem codigo",
      recusas.map((resultado) => [resultado.ok, resultado.erro]),
      [[false, "invalid_grant"], [false, "invalid_grant"], [false, "invalid_grant"], [false, "invalid_grant"], [false, "invalid_grant"], [false, "invalid_grant"], [false, "invalid_request"]],
    );
    conferir("troca sem resource vale o do codigo", (await trocar(await novoCodigo(), { resource: undefined })).ok, true);

    const primeiro = (await trocar(await novoCodigo())).tokens;
    const renovado = await banco.renovarToken({ refreshToken: primeiro.refresh_token, clientId: registrado.clientId }, { agora });
    conferir(
      "renovacao gira o par: o antigo cai, o novo vale",
      [renovado.ok, renovado.tokens.refresh_token !== primeiro.refresh_token, await banco.validarTokenDeAcesso(primeiro.access_token, { agora }), (await banco.validarTokenDeAcesso(renovado.tokens.access_token, { agora }))?.login],
      [true, true, null, login],
    );
    const roubada = await banco.renovarToken({ refreshToken: primeiro.refresh_token, clientId: registrado.clientId }, { agora });
    conferir("renovacao ja trocada usada de novo: invalid_grant e a familia inteira cai", [roubada.erro, await banco.validarTokenDeAcesso(renovado.tokens.access_token, { agora })], ["invalid_grant", null]);

    const outro = (await trocar(await novoCodigo())).tokens;
    conferir(
      "renovacao recusada: outro cliente, vencida (31 dias), inventada e sem texto",
      [
        (await banco.renovarToken({ refreshToken: outro.refresh_token, clientId: "outro-cliente" }, { agora })).erro,
        (await banco.renovarToken({ refreshToken: outro.refresh_token, clientId: registrado.clientId }, { agora: agora + 31 * 864e5 })).erro,
        (await banco.renovarToken({ refreshToken: "inventada", clientId: registrado.clientId }, { agora })).erro,
        (await banco.renovarToken({ refreshToken: undefined, clientId: registrado.clientId }, { agora })).erro,
      ],
      ["invalid_grant", "invalid_grant", "invalid_grant", "invalid_request"],
    );
    conferir("a renovacao recusada por outro cliente nao derruba a conexao", Boolean(await banco.validarTokenDeAcesso(outro.access_token, { agora })), true);

    // Conexoes: so as familias vivas do login. Os blocos acima deixaram algumas vivas: revogar todas e montar duas do zero
    // deixa a conta exata.
    await prisma.tokenMcp.updateMany({ where: { login }, data: { revogadoEm: new Date(agora) } });
    const familiaViva = (await trocar(await novoCodigo())).tokens;
    const familiaRevogada = (await trocar(await novoCodigo())).tokens;
    const doToken = async (token) => (await banco.validarTokenDeAcesso(token.access_token, { agora })).familia;
    const revogar = await doToken(familiaRevogada);
    conferir("desconectar uma conexao de outro login nao revoga nada", (await banco.revogarConexao(revogar, "zz-mcp-outra", { agora })).revogados, 0);
    conferir("desconectar a propria conexao revoga a familia", (await banco.revogarConexao(revogar, login, { agora })).revogados, 1);
    await banco.renovarToken({ refreshToken: familiaViva.refresh_token, clientId: registrado.clientId }, { agora: agora + 1000 });
    const conexoes = await banco.listarConexoesDoLogin(login, { agora: agora + 2000 });
    conferir(
      "conexoes: so a viva, uma linha mesmo depois de renovar, com a data em que nasceu",
      [conexoes.length, conexoes[0]?.familia === (await prisma.tokenMcp.findFirst({ where: { hashAcesso: hashDoSegredo(familiaViva.access_token) } }))?.familia, conexoes[0]?.clienteNome, conexoes[0]?.criadoEm instanceof Date],
      [1, true, "ZZ-MCP Claude", true],
    );
    conferir("conexoes de quem nao tem nenhuma", await banco.listarConexoesDoLogin("zz-mcp-ninguem", { agora }), []);
  }

  // -------------------------------------------------------------------------
  // Tarefa 5 — A sessao de Acessos pelo login do token e o portao 401/403 do /mcp
  // -------------------------------------------------------------------------
  {
    console.log("\nPortão");
    const { permissoesDoLogin } = await import("../src/lib/acessos/banco.js");
    const { exigirTokenMcp, autenticacaoParaSdk } = await import("../src/lib/mcp/portao.js");
    const banco = await import("../src/lib/mcp/oauthBanco.js");
    const agora = Date.now();
    const env = { APP_URL_PUBLICA: "https://rise.teste", RISE_PRODUCAO: "1" };

    const funcao = await prisma.funcaoRise.create({
      data: { nome: "ZZ-MCP Atendimento", permissoes: { create: [{ recurso: "tela.riseAi", nivel: "ver" }, { recurso: "riseAi.chat", nivel: "editar" }, { recurso: "dado.estoqueExato", nivel: "ver" }] } },
    });
    const soTela = await prisma.funcaoRise.create({ data: { nome: "ZZ-MCP So tela", permissoes: { create: [{ recurso: "tela.riseAi", nivel: "ver" }] } } });
    const usuario = (login, funcaoId, extra = {}) => prisma.usuarioRise.create({ data: { login, nome: login, ...extra, funcoes: { create: [{ funcaoId }] } } });
    await usuario("zz-mcp-andrea", funcao.id);
    await usuario("zz-mcp-sem", soTela.id);
    await usuario("zz-mcp-inativa", funcao.id, { ativo: false });
    await usuario("zz-mcp-excecao", funcao.id, { excecoes: { create: [{ recurso: "dado.custo", nivel: "ver" }] } });

    const andrea = await permissoesDoLogin("zz-mcp-andrea", { env });
    conferir(
      "sessao pelo login: a funcao vale, sem custo, estoque exato liberado",
      [andrea.estado, andrea.administrador, andrea.pode("riseAi.chat", "editar"), andrea.pode("dado.custo", "ver"), andrea.pode("dado.estoqueExato", "ver")],
      ["ok", false, true, false, true],
    );
    conferir("a excecao pessoal vale como na tela", (await permissoesDoLogin("zz-mcp-excecao", { env })).pode("dado.custo", "ver"), true);
    conferir(
      "inativo, nao cadastrado e vazio",
      [(await permissoesDoLogin("zz-mcp-inativa", { env })).estado, (await permissoesDoLogin("zz-mcp-ninguem", { env })).estado, (await permissoesDoLogin("", { env })).estado],
      ["inativo", "nao-cadastrado", "nao-cadastrado"],
    );
    conferir(
      "administrador pelo .env; 'pc' so e administrador no Rise do PC",
      [
        (await permissoesDoLogin("zz-mcp-andrea", { env: { ...env, RISE_AI_ADMINS: "ZZ-MCP-Andrea" } })).administrador,
        (await permissoesDoLogin("pc", { env: {} })).administrador,
        (await permissoesDoLogin("pc", { env })).estado,
      ],
      [true, true, "nao-cadastrado"],
    );

    const cliente = await banco.registrarCliente({ nome: "ZZ-MCP Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] });
    const tokenDe = async (login) => {
      const codigo = await banco.emitirCodigo({ clienteId: cliente.clientId, login, redirectUri: "https://claude.ai/api/mcp/auth_callback", codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", resource: "https://rise.teste/mcp", escopos: ["consultar"] }, { agora });
      return (await banco.trocarCodigo({ codigo, clientId: cliente.clientId, redirectUri: "https://claude.ai/api/mcp/auth_callback", codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk" }, { agora })).tokens.access_token;
    };
    const pedido = (autorizacao) => new Request("https://rise.teste/mcp", { method: "POST", headers: autorizacao ? { authorization: autorizacao } : {} });
    const portao = (autorizacao, opcoes = {}) => exigirTokenMcp(pedido(autorizacao), { env, agora, ...opcoes });
    const resumo = async (resultado) =>
      resultado.ok ? ["ok"] : [resultado.resposta.status, resultado.resposta.headers.get("www-authenticate"), (await resultado.resposta.json()).error];
    const desafio = 'Bearer resource_metadata="https://rise.teste/.well-known/oauth-protected-resource/mcp"';
    const invalido = `${desafio}, error="invalid_token", error_description="Token inválido ou vencido."`;

    const tokenAndrea = await tokenDe("zz-mcp-andrea");
    conferir("sem Authorization: 401 com o desafio (sem error)", await resumo(await portao(null)), [401, desafio, "unauthorized"]);
    conferir("Authorization que nao e Bearer: 401 invalid_token", await resumo(await portao("Basic eDp5")), [401, invalido, "invalid_token"]);
    conferir("token inventado: 401 invalid_token", await resumo(await portao("Bearer inventado")), [401, invalido, "invalid_token"]);
    conferir("token vencido: 401 invalid_token", await resumo(await portao(`Bearer ${tokenAndrea}`, { agora: agora + 2 * 3600e3 })), [401, invalido, "invalid_token"]);
    conferir("usuario inativo: 401 igual ao do token vencido (nao revela o motivo)", await resumo(await portao(`Bearer ${await tokenDe("zz-mcp-inativa")}`)), [401, invalido, "invalid_token"]);
    conferir("login que nao existe mais: 401", (await resumo(await portao(`Bearer ${await tokenDe("zz-mcp-ninguem")}`)))[0], 401);
    conferir(
      "sem o Acesso pelo Claude e ChatGPT: 403 insufficient_scope",
      await resumo(await portao(`Bearer ${await tokenDe("zz-mcp-sem")}`)),
      [403, `${desafio}, error="insufficient_scope", error_description="Sem acesso ao Rise pelo Claude ou ChatGPT.", scope="consultar"`, "insufficient_scope"],
    );

    const bom = await portao(`Bearer ${tokenAndrea}`);
    conferir(
      "token bom: a autenticacao com o login, o cliente e as permissoes",
      [bom.ok, bom.autenticacao?.login, bom.autenticacao?.clienteNome, bom.autenticacao?.administrador, bom.autenticacao?.pode("dado.custo", "ver"), bom.autenticacao?.pode("riseAi.chat", "editar")],
      [true, "zz-mcp-andrea", "ZZ-MCP Claude", false, false, true],
    );
    conferir("'bearer' minusculo tambem vale (RFC 6750)", (await portao(`bearer ${tokenAndrea}`)).ok, true);

    await prisma.usuarioRise.update({ where: { login: "zz-mcp-andrea" }, data: { ativo: false } });
    conferir("desativar o usuario corta o token que ja estava valendo, na hora", (await resumo(await portao(`Bearer ${tokenAndrea}`)))[0], 401);
    await prisma.usuarioRise.update({ where: { login: "zz-mcp-andrea" }, data: { ativo: true } });

    const foraDoAr = await portao(`Bearer ${tokenAndrea}`, { dependencias: { permissoesDoLogin: async () => ({ estado: "erro-banco", pode: () => false }) } });
    conferir("banco fora do ar: 503 (um 401 mandaria o Claude pedir login de novo)", [foraDoAr.resposta?.status, foraDoAr.resposta?.headers.get("retry-after")], [503, "30"]);
    const lancou = await portao(`Bearer ${tokenAndrea}`, { dependencias: { validarTokenDeAcesso: async () => { throw new Error("banco"); } } });
    conferir("erro ao ler o token tambem vira 503", lancou.resposta?.status, 503);

    const sdk = autenticacaoParaSdk(bom.autenticacao);
    conferir(
      "authInfo do SDK sem o texto do token, com a validade em segundos",
      [sdk.token, sdk.clientId, sdk.scopes, sdk.expiresAt === Math.floor(bom.autenticacao.expiraEm.getTime() / 1000), sdk.extra.autenticacao.login],
      ["", cliente.clientId, ["consultar"], true, "zz-mcp-andrea"],
    );
  }

  // -------------------------------------------------------------------------
  // Tarefa 6 — Rotas publicas do protocolo: os dois metadados, o registro dinamico e o endpoint de token
  // -------------------------------------------------------------------------
  {
    console.log("\nRotas do OAuth");
    // As rotas leem o process.env (como no servidor): a origem publica de teste so durante este bloco.
    const appUrlAntes = process.env.APP_URL_PUBLICA;
    process.env.APP_URL_PUBLICA = "https://rise.teste";
    try {
      const recurso = await import("../src/app/.well-known/oauth-protected-resource/[[...resto]]/route.js");
      const servidor = await import("../src/app/.well-known/oauth-authorization-server/route.js");
      const registro = await import("../src/app/mcp/oauth/register/route.js");
      const token = await import("../src/app/mcp/oauth/token/route.js");
      const banco = await import("../src/lib/mcp/oauthBanco.js");
      const { metadadosDoRecurso, metadadosDoServidor } = await import("../src/lib/mcp/oauth.js");
      const params = (resto) => ({ params: Promise.resolve(resto === undefined ? {} : { resto }) });
      const get = (caminho, cabecalhos = {}) => new Request(`https://rise.teste${caminho}`, { headers: cabecalhos });

      const metadadoRaiz = await recurso.GET(get("/.well-known/oauth-protected-resource"), params(undefined));
      const metadadoMcp = await recurso.GET(get("/.well-known/oauth-protected-resource/mcp"), params(["mcp"]));
      conferir(
        "metadado do recurso na raiz e em /mcp, com cache curto e CORS",
        [metadadoRaiz.status, await metadadoRaiz.json(), metadadoMcp.status, await metadadoMcp.json(), metadadoMcp.headers.get("cache-control"), metadadoMcp.headers.get("access-control-allow-origin")],
        [200, metadadosDoRecurso("https://rise.teste"), 200, metadadosDoRecurso("https://rise.teste"), "public, max-age=300", "*"],
      );
      conferir("metadado do recurso com outro sufixo: 404", (await recurso.GET(get("/.well-known/oauth-protected-resource/outro"), params(["outro"]))).status, 404);
      const metadadoServidor = await servidor.GET(get("/.well-known/oauth-authorization-server"));
      conferir("metadado do servidor de autorizacao", [metadadoServidor.status, await metadadoServidor.json()], [200, metadadosDoServidor("https://rise.teste")]);
      conferir("Host de outro nome: 421", [(await servidor.GET(get("/.well-known/oauth-authorization-server", { host: "atacante.com" }))).status, (await recurso.GET(get("/.well-known/oauth-protected-resource", { host: "atacante.com" }), params(undefined))).status], [421, 421]);
      const opcoes = await servidor.OPTIONS(get("/.well-known/oauth-authorization-server"));
      conferir("OPTIONS dos metadados: 204 com CORS", [opcoes.status, opcoes.headers.get("access-control-allow-origin"), opcoes.headers.get("access-control-allow-methods")], [204, "*", "GET, OPTIONS"]);

      const registrar = (corpo, cabecalhos = {}) =>
        registro.POST(new Request("https://rise.teste/mcp/oauth/register", { method: "POST", headers: { "content-type": "application/json", ...cabecalhos }, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) }));
      const doClaude = { client_name: "ZZ-MCP Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none" };
      const respostaRegistro = await registrar(doClaude);
      const registrado = await respostaRegistro.json();
      conferir(
        "registro do claude.ai: 201 com o client_id, que existe no banco",
        [respostaRegistro.status, registrado.client_name, registrado.redirect_uris, registrado.token_endpoint_auth_method, typeof registrado.client_id_issued_at, Boolean(await banco.carregarCliente(registrado.client_id))],
        [201, "ZZ-MCP Claude", ["https://claude.ai/api/mcp/auth_callback"], "none", "number", true],
      );
      const ruim = await registrar({ ...doClaude, redirect_uris: ["https://atacante.com/cb"] });
      conferir("registro com retorno de fora: 400 invalid_redirect_uri", [ruim.status, (await ruim.json()).error], [400, "invalid_redirect_uri"]);
      conferir("registro com corpo que nao e JSON: 400", [(await registrar("{nao e json")).status], [400]);
      conferir("registro com Host de outro nome: 421", (await registrar(doClaude, { host: "atacante.com" })).status, 421);
      // Ja foram 3 pedidos neste minuto (o de Host errado nao conta: e recusado antes do limite). O limite e 10 por minuto.
      const extras = [];
      for (let vez = 0; vez < 8; vez++) extras.push((await registrar({ ...doClaude, client_name: `ZZ-MCP extra ${vez}` })).status);
      conferir("do 4.o ao 10.o registro passam; o 11.o no mesmo minuto leva 429", extras, [201, 201, 201, 201, 201, 201, 201, 429]);

      const verificador = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
      const retorno = "https://claude.ai/api/mcp/auth_callback";
      const novoCodigo = () => banco.emitirCodigo({ clienteId: registrado.client_id, login: "zz-mcp-andrea", redirectUri: retorno, codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", resource: "https://rise.teste/mcp", escopos: ["consultar"] });
      const pedirToken = (campos, { json = false, cabecalhos = {} } = {}) =>
        token.POST(
          new Request("https://rise.teste/mcp/oauth/token", {
            method: "POST",
            headers: { "content-type": json ? "application/json" : "application/x-www-form-urlencoded", ...cabecalhos },
            body: json ? JSON.stringify(campos) : new URLSearchParams(campos).toString(),
          }),
        );
      const bom = await pedirToken({ grant_type: "authorization_code", code: await novoCodigo(), code_verifier: verificador, client_id: registrado.client_id, redirect_uri: retorno, resource: "https://rise.teste/mcp" });
      const tokens = await bom.json();
      conferir("troca do codigo pelo formulario: 200, Bearer, 3600 s, sem cache", [bom.status, tokens.token_type, tokens.expires_in, typeof tokens.refresh_token, bom.headers.get("cache-control")], [200, "Bearer", 3600, "string", "no-store"]);
      const peloJson = await pedirToken({ grant_type: "authorization_code", code: await novoCodigo(), code_verifier: verificador, client_id: registrado.client_id, redirect_uri: retorno }, { json: true });
      conferir("troca do codigo por JSON tambem vale", peloJson.status, 200);
      const renovado = await pedirToken({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: registrado.client_id });
      conferir("renovacao: 200 com um refresh novo", [renovado.status, (await renovado.json()).refresh_token !== tokens.refresh_token], [200, true]);
      const resumo = async (resposta) => [resposta.status, (await resposta.json()).error];
      conferir(
        "token recusado: grant desconhecido, sem grant, cliente inventado, codigo errado, refresh reusado",
        [
          await resumo(await pedirToken({ grant_type: "password", client_id: registrado.client_id })),
          await resumo(await pedirToken({ client_id: registrado.client_id })),
          await resumo(await pedirToken({ grant_type: "authorization_code", code: "x", code_verifier: verificador, client_id: "inventado", redirect_uri: retorno })),
          await resumo(await pedirToken({ grant_type: "authorization_code", code: "x", code_verifier: verificador, client_id: registrado.client_id, redirect_uri: retorno })),
          await resumo(await pedirToken({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: registrado.client_id })),
        ],
        [[400, "unsupported_grant_type"], [400, "invalid_request"], [401, "invalid_client"], [400, "invalid_grant"], [400, "invalid_grant"]],
      );
      conferir("token com Host de outro nome: 421", (await pedirToken({ grant_type: "refresh_token" }, { cabecalhos: { host: "atacante.com" } })).status, 421);
    } finally {
      if (appUrlAntes === undefined) delete process.env.APP_URL_PUBLICA;
      else process.env.APP_URL_PUBLICA = appUrlAntes;
    }
  }

  // -------------------------------------------------------------------------
  // Tarefa 7 — A tela Autorizar: o pedido conferido, a decisao que emite o codigo e a volta ao cliente
  // -------------------------------------------------------------------------
  {
    console.log("\nAutorizar");
    const { prepararAutorizacao, decidirAutorizacao } = await import("../src/lib/mcp/autorizacao.js");
    const { origemPelosCabecalhos } = await import("../src/lib/mcp/oauth.js");
    const banco = await import("../src/lib/mcp/oauthBanco.js");
    const origem = "https://rise.teste";
    const retorno = "https://claude.ai/api/mcp/auth_callback";
    const cliente = await banco.registrarCliente({ nome: "ZZ-MCP Claude", redirectUris: [retorno, "http://localhost/callback"] });
    const params = {
      response_type: "code",
      client_id: cliente.clientId,
      redirect_uri: retorno,
      code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      code_challenge_method: "S256",
      state: "estado-1",
      resource: "https://rise.teste/mcp",
      scope: "consultar",
    };

    conferir(
      "preparar: o nome do cliente e para onde o codigo volta",
      await prepararAutorizacao(params, { origem }),
      { ok: true, cliente: { nome: "ZZ-MCP Claude" }, destino: "claude.ai", params: { client_id: cliente.clientId, redirect_uri: retorno, code_challenge: params.code_challenge, code_challenge_method: "S256", state: "estado-1", resource: "https://rise.teste/mcp", scope: "consultar" } },
    );
    conferir("preparar: retorno local aparece como este computador", (await prepararAutorizacao({ ...params, redirect_uri: "http://localhost:4567/callback" }, { origem })).destino, "este computador (Claude Code)");
    conferir(
      "preparar: cliente desconhecido e retorno fora do registro ficam na tela, sem endereco de volta",
      [await prepararAutorizacao({ ...params, client_id: "inventado" }, { origem }), (await prepararAutorizacao({ ...params, redirect_uri: "https://chatgpt.com/connector_platform_oauth_redirect" }, { origem })).url],
      [{ ok: false, motivo: "Cliente desconhecido." }, undefined],
    );
    const escopoRuim = await prepararAutorizacao({ ...params, scope: "escrever" }, { origem });
    conferir("preparar: escopo errado volta ao cliente com o erro", [escopoRuim.ok, new URL(escopoRuim.url).searchParams.get("error"), new URL(escopoRuim.url).searchParams.get("state")], [false, "invalid_scope", "estado-1"]);

    const autorizado = await decidirAutorizacao({ params, login: "zz-mcp-andrea", decisao: "autorizar", origem });
    const volta = new URL(autorizado.url);
    conferir("autorizar: volta ao claude.ai com code, state e iss", [autorizado.ok, `${volta.origin}${volta.pathname}`, volta.searchParams.get("state"), volta.searchParams.get("iss"), Boolean(volta.searchParams.get("code"))], [true, retorno, "estado-1", origem, true]);
    const troca = await banco.trocarCodigo({ codigo: volta.searchParams.get("code"), clientId: cliente.clientId, redirectUri: retorno, codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk" });
    conferir("o codigo da tela troca por um token do login que autorizou", (await banco.validarTokenDeAcesso(troca.tokens?.access_token))?.login, "zz-mcp-andrea");

    const recusado = new URL((await decidirAutorizacao({ params, login: "zz-mcp-andrea", decisao: "recusar", origem })).url);
    conferir("recusar: volta com access_denied e o state, sem codigo", [recusado.searchParams.get("error"), recusado.searchParams.get("state"), recusado.searchParams.has("code")], ["access_denied", "estado-1", false]);
    conferir(
      "decidir recusa sem endereco de volta: cliente desconhecido, retorno de fora, decisao estranha, sem login",
      [
        await decidirAutorizacao({ params: { ...params, client_id: "inventado" }, login: "zz-mcp-andrea", decisao: "autorizar", origem }),
        (await decidirAutorizacao({ params: { ...params, redirect_uri: "https://atacante.com/cb" }, login: "zz-mcp-andrea", decisao: "autorizar", origem })).url,
        await decidirAutorizacao({ params, login: "zz-mcp-andrea", decisao: "talvez", origem }),
        await decidirAutorizacao({ params, login: "", decisao: "autorizar", origem }),
      ],
      [{ ok: false, motivo: "Cliente desconhecido." }, undefined, { ok: false, motivo: "Decisão inválida." }, { ok: false, motivo: "Entre no Rise para autorizar." }],
    );
    conferir("decidir com escopo errado nao emite codigo", [await prisma.codigoMcp.count({ where: { clienteId: cliente.clientId } }), (await decidirAutorizacao({ params: { ...params, scope: "escrever" }, login: "zz-mcp-andrea", decisao: "autorizar", origem })).ok, await prisma.codigoMcp.count({ where: { clienteId: cliente.clientId } })], [1, false, 1]);

    const cabecalhos = (mapa) => new Headers(mapa);
    conferir(
      "origem pela requisicao da tela: APP_URL_PUBLICA; sem ela, o host e o protocolo do pedido",
      [
        origemPelosCabecalhos(cabecalhos({ host: "app:3000" }), { APP_URL_PUBLICA: "https://rise.4hobby.com.br/" }),
        origemPelosCabecalhos(cabecalhos({ host: "localhost:3000" }), {}),
        origemPelosCabecalhos(cabecalhos({ host: "localhost:3000", "x-forwarded-proto": "http" }), {}),
      ],
      ["https://rise.4hobby.com.br", "https://localhost:3000", "http://localhost:3000"],
    );
  }

  // -------------------------------------------------------------------------
  // Tarefa 8 — O servidor MCP: as ferramentas de leitura com o pode() do login, o registro de cada chamada e anotarDuvida
  // -------------------------------------------------------------------------
  {
    console.log("\nServidor MCP");
    const { responderMcp, INSTRUCOES } = await import("../src/lib/mcp/servidor.js");
    const { argumentosParaRegistro } = await import("../src/lib/mcp/registro.js");
    await prisma.produto.create({ data: { ativo: true, conferido: true, sku: "ZZ-MCP-1", tituloBase: "PLACA ZZMCP TESTE", precoVenda: 20, custo: 10, estoque: 7 } });

    const login = "zz-mcp-andrea";
    const restritos = ["dado.custo", "dado.margem", "dado.concorrentes", "dado.financeiro"];
    const autenticacao = (pode, quem = login) => ({ login: quem, clienteId: "zz-mcp-cliente", clienteNome: "Claude", escopos: ["consultar"], familia: "zz-mcp-familia", expiraEm: new Date(Date.now() + 3600e3), administrador: false, pode });
    const andrea = autenticacao((id) => !restritos.includes(id));
    let id = 100;
    const chamar = async (nome, argumentos, quem = andrea) =>
      (await lerRespostaMcp(await responderMcp(pedidoMcp("tools/call", { name: nome, arguments: argumentos }, { id: id++ }), quem)))?.result ?? null;
    const textoDe = (resultado) => resultado?.content?.[0]?.text ?? "";
    const chamadas = () => prisma.chamadaMcp.findMany({ where: { login }, orderBy: { quando: "asc" } });

    const descoberta = (await lerRespostaMcp(await responderMcp(pedidoMcp("server/discover", {}, { id: id++ }), andrea)))?.result;
    const lista = (await lerRespostaMcp(await responderMcp(pedidoMcp("tools/list", {}, { id: id++ }), andrea)))?.result?.tools ?? [];
    conferir(
      "as 7 ferramentas de leitura e a anotarDuvida, nas instrucoes a ordem de anotar",
      [
        lista.map((ferramenta) => ferramenta.name).sort(),
        lista.filter((ferramenta) => ferramenta.annotations?.readOnlyHint).length,
        descoberta?.instructions === INSTRUCOES && INSTRUCOES.includes("anotarDuvida"),
      ],
      [["anotarDuvida", "buscarConhecimento", "buscarProdutos", "buscarProdutosSimilares", "compararProdutos", "consultarEstoque", "consultarPreco", "consultarProduto"], 7, true],
    );

    const ficha = await chamar("consultarProduto", { sku: "ZZ-MCP-1" });
    conferir(
      "consultarProduto pelo login sem custo: preco sim, custo restrito",
      [ficha?.isError ?? false, textoDe(ficha).includes('"preco":20'), textoDe(ficha).includes('"custo":"[restrito]"'), textoDe(ficha).includes('"custo":10')],
      [false, true, true, false],
    );
    const fichaDoDono = await chamar("consultarProduto", { sku: "ZZ-MCP-1" }, autenticacao(() => true, "zz-mcp-dono"));
    conferir("o mesmo produto para quem ve custo traz o custo", textoDe(fichaDoDono).includes('"custo":10'), true);

    await chamar("buscarProdutos", { termos: "zzmcp ligar 54988990008" });
    const inexistente = await chamar("consultarProduto", { sku: "ZZ-MCP-NAO-EXISTE" });
    conferir("produto que nao existe: isError com a mensagem da ferramenta", [inexistente?.isError, textoDe(inexistente).includes("ZZ-MCP-NAO-EXISTE")], [true, true]);
    const internet = await lerRespostaMcp(await responderMcp(pedidoMcp("tools/call", { name: "pesquisarNaInternet", arguments: { consulta: "arduino" } }, { id: id++ }), andrea));
    conferir("pesquisarNaInternet nao existe pelo MCP", Boolean(internet?.error || internet?.result?.isError), true);

    const registradas = await chamadas();
    conferir(
      "cada chamada registrada (quem, cliente, ferramenta, ok, tempo), com o telefone mascarado e sem a que nao existe",
      [
        registradas.map((chamada) => [chamada.ferramenta, chamada.ok, chamada.clienteNome]),
        JSON.stringify(registradas.map((chamada) => chamada.argumentos)).includes("54988990008"),
        registradas.every((chamada) => Number.isInteger(chamada.duracaoMs)),
      ],
      [[["consultarProduto", true, "Claude"], ["buscarProdutos", true, "Claude"], ["consultarProduto", false, "Claude"]], false, true],
    );
    conferir("argumentos longos sao cortados para o registro", argumentosParaRegistro({ texto: "x".repeat(5000) }).cortado, true);

    const anotada = await chamar("anotarDuvida", {
      pergunta: "Tem o ZZ-MCP-1? Fale com ana@exemplo.com",
      resposta: "Temos 7 unidades por R$ 20,00.",
      anexos: [{ nome: "lista.pdf", tipo: "application/pdf", texto: "Item 1: ZZ-MCP-1 (54988990008)" }],
    });
    const conversas = await prisma.conversaIA.findMany({ where: { usuario: login, canal: "MCP" }, include: { mensagens: { orderBy: [{ criadoEm: "asc" }, { id: "asc" }] } } });
    const [pergunta, resposta] = conversas[0]?.mensagens ?? [];
    conferir(
      "anotarDuvida grava a conversa do dia do canal MCP com a pergunta mascarada e o anexo como texto",
      [anotada?.isError ?? false, conversas.length, conversas[0]?.titulo.startsWith("Dúvidas pelo Claude · "), pergunta?.papel, pergunta?.conteudo.includes("ana@exemplo.com"), pergunta?.estruturado?.anexos?.[0]?.nome, JSON.stringify(pergunta?.estruturado).includes("54988990008")],
      [false, 1, true, "USUARIO", false, "lista.pdf", false],
    );
    conferir(
      "a resposta fica como do assistente 'mcp/Claude', custo zero (nao nulo) e com as ferramentas usadas antes",
      [resposta?.papel, resposta?.provedor, resposta?.modelo, Number(resposta?.custoBrl), resposta?.custoBrl === null, resposta?.estruturado?.ferramentas?.map((ferramenta) => ferramenta.nome)],
      ["ASSISTENTE", "mcp", "Claude", 0, false, ["consultarProduto", "buscarProdutos", "consultarProduto"]],
    );

    await chamar("consultarPreco", { skus: ["ZZ-MCP-1"] });
    await chamar("anotarDuvida", { pergunta: "E o preço?", resposta: "R$ 20,00." });
    const depois = await prisma.conversaIA.findMany({ where: { usuario: login, canal: "MCP" }, include: { mensagens: { orderBy: [{ criadoEm: "asc" }, { id: "asc" }] } } });
    conferir(
      "a segunda duvida do dia entra na mesma conversa, so com as ferramentas desde a anotacao anterior",
      [depois.length, depois[0]?.mensagens.length, depois[0]?.mensagens[3]?.estruturado?.ferramentas?.map((ferramenta) => ferramenta.nome)],
      [1, 4, ["consultarPreco"]],
    );

    const muitos = await chamar("anotarDuvida", { pergunta: "x", resposta: "y", anexos: Array.from({ length: 6 }, (_, n) => ({ nome: `a${n}.txt`, texto: "t" })) });
    const grande = await chamar("anotarDuvida", { pergunta: "x", resposta: "y", anexos: [{ nome: "a.txt", texto: "t".repeat(20001) }] });
    conferir(
      "mais de 5 anexos ou anexo acima de 20.000 caracteres: isError e nada gravado",
      [muitos?.isError, grande?.isError, await prisma.mensagemIA.count({ where: { conversaId: depois[0]?.id } })],
      [true, true, 4],
    );
  }

  // -------------------------------------------------------------------------
  // Tarefa 9 — A rota /mcp: so POST com token; GET e DELETE 405; Origin e Host conferidos; as duas eras do protocolo
  // -------------------------------------------------------------------------
  {
    console.log("\nRota /mcp");
    const appUrlAntes = process.env.APP_URL_PUBLICA;
    process.env.APP_URL_PUBLICA = "https://rise.teste";
    try {
      const rota = await import("../src/app/mcp/route.js");
      const banco = await import("../src/lib/mcp/oauthBanco.js");
      // Os logins zz-mcp-andrea (com o acesso) e zz-mcp-inativa vem do bloco do portao (Tarefa 5); o ZZ-MCP-1, da Tarefa 8.
      const cliente = await banco.registrarCliente({ nome: "ZZ-MCP Rota", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] });
      const tokenDe = async (login) => {
        const codigo = await banco.emitirCodigo({ clienteId: cliente.clientId, login, redirectUri: "https://claude.ai/api/mcp/auth_callback", codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", resource: "https://rise.teste/mcp", escopos: ["consultar"] });
        return (await banco.trocarCodigo({ codigo, clientId: cliente.clientId, redirectUri: "https://claude.ai/api/mcp/auth_callback", codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk" })).tokens.access_token;
      };
      const tokenAndrea = await tokenDe("zz-mcp-andrea");
      const comToken = (token, cabecalhos = {}) => ({ authorization: `Bearer ${token}`, ...cabecalhos });

      const semToken = await rota.POST(pedidoMcp("server/discover", {}, { id: 1 }));
      conferir("POST sem token: 401 com o desafio para o claude.ai iniciar o login", [semToken.status, semToken.headers.get("www-authenticate")], [401, 'Bearer resource_metadata="https://rise.teste/.well-known/oauth-protected-resource/mcp"']);

      const descoberta = await rota.POST(pedidoMcp("server/discover", {}, { id: 2, cabecalhos: comToken(tokenAndrea) }));
      conferir("POST com token, era nova: o discover responde com as instrucoes", [descoberta.status, Boolean((await lerRespostaMcp(descoberta))?.result?.instructions)], [200, true]);
      const antigo = await rota.POST(
        pedidoMcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "antigo", version: "1" } }, { era: "antiga", id: 3, cabecalhos: comToken(tokenAndrea, { "mcp-session-id": "qualquer" }) }),
      );
      conferir("cliente de 2025 (initialize com Mcp-Session-Id) tambem e atendido", [antigo.status, typeof (await lerRespostaMcp(antigo))?.result?.protocolVersion], [200, "string"]);

      const antes = await prisma.chamadaMcp.count({ where: { login: "zz-mcp-andrea" } });
      const chamada = await rota.POST(pedidoMcp("tools/call", { name: "consultarEstoque", arguments: { skus: ["ZZ-MCP-1"] } }, { id: 4, cabecalhos: comToken(tokenAndrea) }));
      conferir(
        "tools/call pela rota executa e registra a chamada",
        [chamada.status, (await lerRespostaMcp(chamada))?.result?.isError ?? false, (await prisma.chamadaMcp.count({ where: { login: "zz-mcp-andrea" } })) - antes],
        [200, false, 1],
      );

      const get = await rota.GET(new Request("https://rise.teste/mcp", { headers: comToken(tokenAndrea) }));
      const del = await rota.DELETE(new Request("https://rise.teste/mcp", { method: "DELETE", headers: comToken(tokenAndrea) }));
      conferir("GET e DELETE: 405 com Allow: POST (sem sessoes)", [get.status, get.headers.get("allow"), del.status], [405, "POST", 405]);

      const deOutroSite = await rota.POST(pedidoMcp("server/discover", {}, { id: 5, cabecalhos: comToken(tokenAndrea, { origin: "https://atacante.com" }) }));
      const outroNome = await rota.POST(pedidoMcp("server/discover", {}, { id: 6, cabecalhos: comToken(tokenAndrea, { host: "atacante.com" }) }));
      conferir("Origin de outro site: 403; Host de outro nome: 421", [deOutroSite.status, outroNome.status], [403, 421]);

      const tokenInativa = await tokenDe("zz-mcp-inativa");
      const inativa = await rota.POST(pedidoMcp("tools/call", { name: "consultarProduto", arguments: { sku: "ZZ-MCP-1" } }, { id: 7, cabecalhos: comToken(tokenInativa) }));
      conferir("usuario inativo: 401 e nenhuma chamada registrada", [inativa.status, await prisma.chamadaMcp.count({ where: { login: "zz-mcp-inativa" } })], [401, 0]);
    } finally {
      if (appUrlAntes === undefined) delete process.env.APP_URL_PUBLICA;
      else process.env.APP_URL_PUBLICA = appUrlAntes;
    }
  }

  // -------------------------------------------------------------------------
  // Tarefa 10 — Caddyfile: o protocolo publico, a tela Autorizar atras do login
  // -------------------------------------------------------------------------
  {
    console.log("\nCaddyfile");
    const { readFileSync } = await import("node:fs");
    const caddy = readFileSync(new URL("../deploy/caddy/Caddyfile", import.meta.url), "utf8");
    // O bloco @mcp e o handle dele, e o handle sem matcher (o do login) que vem depois.
    const matcher = /@mcp \{\s*path ([^\n}]+)\r?\n\s*\}/.exec(caddy);
    const caminhos = (matcher?.[1] ?? "").trim().split(/\s+/);
    const ramo = /handle @mcp \{([\s\S]*?)\n\t\}/.exec(caddy)?.[1] ?? "";
    conferir(
      "o ramo publico tem so os caminhos do protocolo",
      caminhos,
      ["/mcp", "/mcp/oauth/token", "/mcp/oauth/register", "/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/*", "/.well-known/oauth-authorization-server", "/.well-known/oauth-authorization-server/*"],
    );
    conferir("a tela Autorizar (e qualquer outro /mcp/*) NAO esta no ramo publico", caminhos.some((caminho) => caminho.includes("authorize") || caminho === "/mcp/*" || caminho === "/mcp/oauth/*"), false);
    conferir("o ramo publico so repassa ao app: sem forward_auth e sem o segredo de borda", [ramo.includes("reverse_proxy app:3000"), ramo.includes("forward_auth"), ramo.includes("X-Rise-Borda")], [true, false, false]);
    conferir(
      "o @mcp vem antes do handle com login, e os Remote-* e o X-Rise-Borda de fora continuam saindo para todos",
      [caddy.indexOf("handle @mcp") > 0 && caddy.indexOf("handle @mcp") < caddy.lastIndexOf("\thandle {"), caddy.includes("request_header -Remote-User"), caddy.includes("request_header -X-Rise-Borda")],
      [true, true, true],
    );
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
