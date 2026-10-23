import "dotenv/config";

/**
 * Testes da Entrega C1 do Rise AI, os avisos no Telegram (spec docs/superpowers/specs/2026-10-12-rise-ia-agente-design.md,
 * §7 Entrega C; plano docs/superpowers/plans/2026-10-22-rise-ia-entrega-c1-telegram.md).
 *
 *   npm run teste:telegram
 *
 * Postgres local, SEM rede: o Telegram e falso (scripts/lib/telegramFalso.js) e a unica chamada "de verdade" vai a um
 * host `.invalid`, so para ver a linha de log. So escreve usuarios `zz-tg-*`, avisos com chave ou chat `zz-tg-*`,
 * produtos `ZZ-TG-*` e a auditoria feita por `zz-tg-*`; a Conexao TELEGRAM e a ConfiguracaoIA do dono sao lidas no
 * comeco e devolvidas no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");

let falhas = 0;
let total = 0;
function conferir(nome, obtido, esperado) {
  total++;
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

/** O codigo do erro do Prisma (P2002 = unico violado), ou a mensagem quando nao ha codigo. */
async function codigoDoErro(promessa) {
  try {
    await promessa;
    return null;
  } catch (erro) {
    return erro?.code ?? String(erro?.message ?? erro);
  }
}

/** Apaga tudo o que os testes criam. Roda no comeco e no fim. */
async function limpar() {
  if (prisma.avisoTelegram) {
    await prisma.avisoTelegram.deleteMany({ where: { OR: [{ chave: { startsWith: "zz-tg-" } }, { chatId: { startsWith: "zz-tg-" } }] } });
  }
  await prisma.auditoriaDeAcesso.deleteMany({ where: { quem: { startsWith: "zz-tg-" } } });
  await prisma.usuarioFuncao.deleteMany({ where: { usuario: { login: { startsWith: "zz-tg-" } } } });
  await prisma.usuarioRise.deleteMany({ where: { login: { startsWith: "zz-tg-" } } });
  await prisma.logIntegracao.deleteMany({ where: { servico: "TELEGRAM", endpoint: { contains: "teste-rise.invalid" } } }).catch(() => null);
}

// O que e do dono e volta no fim, como esta.
const conexaoDoDono = await prisma.conexao.findUnique({ where: { servico: "TELEGRAM" } }).catch(() => null);
const configuracaoDoDono = await prisma.configuracaoIA.findUnique({ where: { id: "unica" } });

async function devolverODoDono() {
  if (conexaoDoDono) {
    const { id: _id, servico: _servico, ...dados } = conexaoDoDono;
    await prisma.conexao.upsert({ where: { servico: "TELEGRAM" }, update: dados, create: { servico: "TELEGRAM", ...dados } });
  } else {
    await prisma.conexao.deleteMany({ where: { servico: "TELEGRAM" } }).catch(() => null);
  }
  if (configuracaoDoDono) {
    await prisma.configuracaoIA.update({ where: { id: "unica" }, data: { dados: configuracaoDoDono.dados } });
  } else {
    await prisma.configuracaoIA.deleteMany({ where: { id: "unica" } });
  }
}

await limpar();
try {
  {
    console.log("\nBanco");
    const u = await prisma.usuarioRise.create({ data: { login: "zz-tg-um", nome: "ZZ TG Um", codigoDeVinculoHash: "a".repeat(64), codigoDeVinculoExpiraEm: new Date() } });
    conferir("usuario guarda o hash e a validade do codigo", [u.codigoDeVinculoHash.length, u.codigoDeVinculoExpiraEm instanceof Date], [64, true]);
    await prisma.avisoTelegram.create({ data: { chave: "zz-tg-chave-1", tipo: "produtoZerou", chatId: "zz-tg-chat", texto: "x" } });
    conferir("chave do aviso e unica", await codigoDoErro(prisma.avisoTelegram.create({ data: { chave: "zz-tg-chave-1", tipo: "produtoZerou", chatId: "zz-tg-chat", texto: "y" } })), "P2002");
    conferir("aviso nasce sem envio e com 0 tentativas", (await prisma.avisoTelegram.findUnique({ where: { chave: "zz-tg-chave-1" } })).tentativas, 0);
    conferir("Servico aceita TELEGRAM", (await prisma.logIntegracao.create({ data: { servico: "TELEGRAM", metodo: "GET", endpoint: "https://teste-rise.invalid/bot***/getMe", statusHttp: 200, duracaoMs: 1 } })).servico, "TELEGRAM");
  }

  {
    console.log("\nTexto");
    const { neutralizar, trechoSeguro, mensagemDoAviso, linkAbrirNoRise, LIMITE_DE_LINHAS } = await import("../src/lib/telegram/texto.js");
    conferir("neutraliza @, :// e barra no comeco da linha", neutralizar("/start @fulano http://x.com\n/stop a/b"), "∕start ＠fulano http:∕∕x.com\n∕stop a/b");
    conferir("trecho mascara, achata e corta em 120", trechoSeguro("Cliente 54988990008 " + "a".repeat(200) + "\nfim").length <= 121, true);
    conferir("trecho mascara o telefone", trechoSeguro("liga 54988990008").includes("54988990008"), false);
    conferir("trecho nao tem quebra de linha", trechoSeguro("a\nb\r\nc"), "a b c");
    const zerou = mensagemDoAviso("produtoZerou", { id: "p1", sku: "100101", nome: "Placa Uno" });
    conferir("produto zerou: texto e caminho", zerou, { texto: "Produto zerou: 100101\nPlaca Uno", caminho: "/produtos/p1" });
    const orc = mensagemDoAviso("orcamento", { escopo: "CLIENTES", estado: "esgotado", percentual: 100, tetoBrl: 70 });
    conferir("orcamento esgotado tem 2 linhas", orc.texto.split("\n"), ["IA: orçamento dos clientes em 100% do teto de R$ 70,00", "Respostas pagas param até o teto subir."]);
    conferir("orcamento em aviso tem 1 linha e vai as configuracoes", [mensagemDoAviso("orcamento", { escopo: "INTERNO", estado: "aviso", percentual: 83, tetoBrl: 30 }).texto, orc.caminho], ["IA: orçamento interno em 83% do teto de R$ 30,00", "/rise-ai/configuracoes"]);
    const resumo = mensagemDoAviso("resumoDoDia", { dia: "22/10", consultas: 5, anotadas: 2, zerados: 1, varreduras: { concluidas: 3, falhas: 1 }, ia: { gastoBrl: 12.5, tetoBrl: 70 } });
    conferir("resumo cabe no limite de linhas", resumo.texto.split("\n").length <= LIMITE_DE_LINHAS, true);
    conferir("resumo: linhas", resumo.texto.split("\n"), ["Resumo de 22/10", "Consultas pelo Claude/ChatGPT: 5 (2 anotadas) · Produtos que zeraram: 1", "Varreduras: 3 concluídas, 1 com erro", "IA no mês: R$ 12,50 de R$ 70,00"]);
    conferir("resumo vai a revisao do dia", resumo.caminho, "/rise-ai/revisao");
    conferir("falha com trecho neutralizado", mensagemDoAviso("varreduraFalhou", { fonteNome: "Loja X", erro: "HTTP 403 em https://loja.x/p" }), { texto: "Varredura falhou: Loja X\nHTTP 403 em https:∕∕loja.x/p", caminho: "/mercados/fontes" });
    conferir("varredura pelo PC esperando", mensagemDoAviso("varreduraPeloPc", { fonteNome: "Oceantech", pedidoHa: "7 min" }), { texto: "Varredura pelo PC esperando: Oceantech\nPedida há 7 min; o Rise do PC não responde.", caminho: "/mercados/fontes" });
    conferir("reais com milhar", mensagemDoAviso("orcamento", { escopo: "CLIENTES", estado: "aviso", percentual: 80, tetoBrl: 1234.5 }).texto.endsWith("R$ 1.234,50"), true);
    conferir("link sem base e nulo", [linkAbrirNoRise("", "/produtos/p1"), linkAbrirNoRise(undefined, "/p")], [null, null]);
    conferir("link tira a barra final da base", linkAbrirNoRise("https://rise.4hobby.com.br/", "/produtos/p1"), "https://rise.4hobby.com.br/produtos/p1");
    let lancou = null;
    try {
      mensagemDoAviso("x", {});
    } catch (erro) {
      lancou = erro.message;
    }
    conferir("tipo desconhecido lanca", lancou, "Tipo de aviso desconhecido: x");
  }

  {
    console.log("\nCliente");
    const { criarClienteTelegram, limparToken, tokenValido, mascararToken } = await import("../src/lib/telegram/cliente.js");
    const { criarTelegramFalso } = await import("./lib/telegramFalso.js");
    const TOKEN = "123456789:" + "A".repeat(35);
    conferir("limpa o token colado", limparToken(" bot" + TOKEN + "\n"), TOKEN);
    conferir("limpa espaco no meio", limparToken("123456789: " + "A".repeat(35)), TOKEN);
    conferir("token curto e invalido", [tokenValido("123:abc"), tokenValido(TOKEN), tokenValido("")], [false, true, false]);
    conferir("mascara o token da URL e o literal", mascararToken(`erro em https://api.telegram.org/bot${TOKEN}/getMe e ${TOKEN}`, TOKEN), "erro em https://api.telegram.org/bot***/getMe e ***");
    const update = { update_id: 7, message: { message_id: 1, date: 1, chat: { id: 55, type: "private", first_name: "Maicol", username: "maicol" }, text: "/vincular ABC" } };
    const falso = criarTelegramFalso({ updates: [update] });
    const cliente = criarClienteTelegram({ token: TOKEN, requisitar: falso.requisitar, urlPublica: "https://rise.4hobby.com.br" });
    conferir("getMe devolve a conta do bot", (await cliente.getMe()).dados.username, "rise_bot");
    const lidas = await cliente.getUpdates();
    conferir("getUpdates le as mais recentes sem esperar", [lidas.dados[0].update_id, falso.chamadas[1].metodo, falso.chamadas[1].corpo.offset, falso.chamadas[1].corpo.timeout], [7, "getUpdates", -100, 0]);
    conferir("o falso recebe o token na URL", falso.chamadas[0].token, TOKEN);
    const envio = await cliente.enviarMensagem(55, "Produto zerou: 100101\nPlaca Uno", { caminho: "/produtos/p1" });
    conferir("envia sem parse_mode e com o botao Abrir no Rise", [envio.ok, "parse_mode" in falso.mensagens[0], falso.mensagens[0].disable_web_page_preview, falso.mensagens[0].reply_markup.inline_keyboard[0][0]], [true, false, true, { text: "Abrir no Rise", url: "https://rise.4hobby.com.br/produtos/p1" }]);
    conferir("chat_id vai como texto", falso.mensagens[0].chat_id, "55");
    const semBase = criarClienteTelegram({ token: TOKEN, requisitar: falso.requisitar, urlPublica: "" });
    await semBase.enviarMensagem(55, "x", { caminho: "/p" });
    conferir("sem APP_URL_PUBLICA nao ha botao", "reply_markup" in falso.mensagens[1], false);
    const antes = falso.chamadas.length;
    conferir("recusa 5 linhas sem chamar o Telegram", [(await cliente.enviarMensagem(55, "1\n2\n3\n4\n5", { caminho: "/p" })).erro, falso.chamadas.length === antes], ["Mensagem acima do limite.", true]);
    await cliente.confirmarAtualizacoes(7);
    conferir("confirmar manda o offset seguinte", falso.chamadas.at(-1).corpo, { offset: 8, limit: 1, timeout: 0 });
    const bloqueadoFalso = criarTelegramFalso({ falhas: { sendMessage: { status: 403, description: "Forbidden: bot was blocked by the user" } } });
    const r = await criarClienteTelegram({ token: TOKEN, requisitar: bloqueadoFalso.requisitar }).enviarMensagem(55, "x", {});
    conferir("403 bloqueado vem marcado e sem o token", [r.ok, r.bloqueado, r.erro.includes(TOKEN)], [false, true, false]);
    // Um `requisitar` que lanca (rede fora) com a URL inteira na mensagem, como o fetch faz.
    const foraDoAr = async ({ url }) => {
      throw new Error(`rede fora: ${new URL(url).pathname}`);
    };
    const f = await criarClienteTelegram({ token: TOKEN, requisitar: foraDoAr }).getMe();
    conferir("falha de rede nao lanca e mascara o token", [f.ok, f.erro], [false, "rede fora: /bot***/getMe"]);
    let lancou = null;
    try {
      criarClienteTelegram({ token: "ruim", requisitar: falso.requisitar });
    } catch (erro) {
      lancou = erro.message;
    }
    conferir("token invalido lanca na criacao", lancou, "Token do bot inválido.");
  }
  {
    console.log("\nMascara do token");
    const { requisitar, mascarar } = await import("../src/lib/integracoes/httpClient.js");
    const TOKEN = "123456789:" + "B".repeat(35);
    await requisitar({ servico: "TELEGRAM", url: `https://teste-rise.invalid/bot${TOKEN}/getMe`, timeoutMs: 500, tentativas: 1 }).catch(() => null);
    const linha = await prisma.logIntegracao.findFirst({ where: { servico: "TELEGRAM", endpoint: { contains: "teste-rise.invalid" } }, orderBy: { criadoEm: "desc" } });
    conferir("o endpoint gravado nao leva o token", linha?.endpoint, "https://teste-rise.invalid/bot***/getMe");
    conferir("mascarar(string) tambem cobre a URL do bot", mascarar(`GET /bot${TOKEN}/sendMessage`), "GET /bot***/sendMessage");
  }

  {
    console.log("\nVinculo");
    const v = await import("../src/lib/telegram/vinculo.js");
    const { criarClienteTelegram } = await import("../src/lib/telegram/cliente.js");
    const { criarTelegramFalso } = await import("./lib/telegramFalso.js");
    const TOKEN = "123456789:" + "C".repeat(35);
    const codigo = v.gerarCodigo();
    conferir("codigo com 12 caracteres do alfabeto", [codigo.length, [...codigo].every((c) => v.ALFABETO.includes(c))], [12, true]);
    conferir("dois codigos nao sao iguais", v.gerarCodigo() === codigo, false);
    conferir("hash ignora caixa e espacos", v.hashDoCodigo(" " + codigo.toLowerCase() + " "), v.hashDoCodigo(codigo));
    const agora = Date.now();
    const segundos = (ms) => Math.floor(ms / 1000);
    const msg = (id, chat, text, date = segundos(agora)) => ({ update_id: id, message: { message_id: id, date, chat: { id: chat, type: "private", first_name: "Maicol", username: "maicol" }, text } });
    const hash = v.hashDoCodigo(codigo);
    conferir("acha o chat que mandou o codigo certo", v.avaliarAtualizacoes([msg(1, 55, "oi"), msg(2, 55, `/vincular ${codigo.toLowerCase()}`)], { hash, criadoEm: agora - 1000, agora }), { achado: { chatId: "55", nome: "Maicol", usuario: "maicol", updateId: 2 }, anulado: false, ultimoUpdateId: 2 });
    conferir("mensagem de antes do codigo nao vale", v.avaliarAtualizacoes([msg(3, 55, `/vincular ${codigo}`, segundos(agora) - 60)], { hash, criadoEm: agora, agora }).achado, null);
    const lixo = Array.from({ length: 5 }, (_, i) => msg(10 + i, 99, `/vincular ERRADO${i}`));
    const avaliacao = v.avaliarAtualizacoes([...lixo, msg(20, 99, `/vincular ${codigo}`)], { hash, criadoEm: agora - 1000, agora });
    conferir("5 erros do mesmo chat silenciam o chat e anulam o codigo", [avaliacao.achado, avaliacao.anulado, avaliacao.ultimoUpdateId], [null, true, 20]);
    conferir("4 erros ainda nao anulam", v.avaliarAtualizacoes(lixo.slice(0, 4), { hash, criadoEm: agora - 1000, agora }).anulado, false);
    conferir("grupo nao vale", v.avaliarAtualizacoes([{ update_id: 1, message: { date: segundos(agora), chat: { id: -5, type: "group" }, text: `/vincular ${codigo}` } }], { hash, criadoEm: agora - 1000, agora }).achado, null);
    conferir("sem nenhuma mensagem", v.avaliarAtualizacoes([], { hash, criadoEm: agora, agora }), { achado: null, anulado: false, ultimoUpdateId: null });
    conferir("chat sem @ vem com usuario nulo", v.avaliarAtualizacoes([{ update_id: 4, message: { date: segundos(agora), chat: { id: 7, type: "private", first_name: "Ana" }, text: `/vincular ${codigo}` } }], { hash, criadoEm: agora - 1000, agora }).achado, { chatId: "7", nome: "Ana", usuario: null, updateId: 4 });

    const u = await prisma.usuarioRise.create({ data: { login: "zz-tg-vinc", nome: "ZZ TG Vinc" } });
    const inicio = await v.iniciarVinculo(u.id, { quem: "zz-tg-admin" });
    const gravado = await prisma.usuarioRise.findUnique({ where: { id: u.id } });
    conferir("iniciar grava so o hash e a validade de 10 min", [gravado.codigoDeVinculoHash, Math.round((gravado.codigoDeVinculoExpiraEm - Date.now()) / 60000)], [v.hashDoCodigo(inicio.codigo), 10]);
    const falso = criarTelegramFalso({ updates: [msg(30, 55, `/vincular ${inicio.codigo}`, segundos(Date.now()))] });
    const cliente = criarClienteTelegram({ token: TOKEN, requisitar: falso.requisitar, urlPublica: "https://rise.4hobby.com.br" });
    conferir("localizar devolve nome e @ para o administrador conferir", await v.localizarVinculo(u.id, { cliente }), { ok: true, chat: { chatId: "55", nome: "Maicol", usuario: "maicol" }, ultimoUpdateId: 30 });
    conferir("confirmar com outro chat e recusado", await v.confirmarVinculo(u.id, "56", { cliente, quem: "zz-tg-admin" }), { ok: false, erro: "O chat conferido não é o que enviou o código. Confira de novo." });
    const ok = await v.confirmarVinculo(u.id, "55", { cliente, quem: "zz-tg-admin" });
    const depois = await prisma.usuarioRise.findUnique({ where: { id: u.id } });
    conferir("confirmar grava o chat, zera o codigo e manda a boas-vindas", [ok.ok, depois.telegramChatId, depois.codigoDeVinculoHash, depois.codigoDeVinculoExpiraEm, falso.mensagens.at(-1).text], [true, "55", null, null, "Telegram ligado ao Rise para ZZ TG Vinc.\nOs avisos chegam por aqui."]);
    conferir("confirmou o update_id lido", falso.chamadas.some((c) => c.metodo === "getUpdates" && c.corpo.offset === 31), true);
    conferir("auditoria do vinculo sem o codigo", (await prisma.auditoriaDeAcesso.findMany({ where: { quem: "zz-tg-admin", alvo: u.id }, orderBy: { quando: "asc" } })).map((a) => [a.oQue, JSON.stringify(a.depois ?? {}).includes(inicio.codigo)]), [["telegram.vinculo.iniciar", false], ["telegram.vinculo.confirmar", false]]);
    const u2 = await prisma.usuarioRise.create({ data: { login: "zz-tg-dois", nome: "ZZ TG Dois" } });
    const i2 = await v.iniciarVinculo(u2.id, { quem: "zz-tg-admin" });
    const falso2 = criarTelegramFalso({ updates: [msg(40, 55, `/vincular ${i2.codigo}`, segundos(Date.now()))] });
    conferir("o mesmo chat nao liga a dois usuarios", (await v.confirmarVinculo(u2.id, "55", { cliente: criarClienteTelegram({ token: TOKEN, requisitar: falso2.requisitar }), quem: "zz-tg-admin" })).erro, "Este Telegram já está ligado a outro usuário.");
    conferir("sem codigo", (await v.localizarVinculo(u.id, { cliente })).motivo, "sem-codigo");
    await prisma.usuarioRise.update({ where: { id: u2.id }, data: { codigoDeVinculoExpiraEm: new Date(Date.now() - 1000) } });
    conferir("expirado limpa o hash", [(await v.localizarVinculo(u2.id, { cliente })).motivo, (await prisma.usuarioRise.findUnique({ where: { id: u2.id } })).codigoDeVinculoHash], ["expirado", null]);
    const i3 = await v.iniciarVinculo(u2.id, { quem: "zz-tg-admin" });
    const falso3 = criarTelegramFalso({ updates: [] });
    conferir("ainda nao chegou", (await v.localizarVinculo(u2.id, { cliente: criarClienteTelegram({ token: TOKEN, requisitar: falso3.requisitar }) })).motivo, "nao-chegou");
    // Datas de AGORA: o codigo i3 nasceu depois do `agora` do comeco do bloco, e mensagem anterior ao codigo nao conta.
    const falso4 = criarTelegramFalso({ updates: Array.from({ length: 5 }, (_, i) => msg(50 + i, 77, `/vincular NAO${i}`, segundos(Date.now()))) });
    conferir("anulado pelos 5 erros limpa o hash", [(await v.localizarVinculo(u2.id, { cliente: criarClienteTelegram({ token: TOKEN, requisitar: falso4.requisitar }) })).motivo, (await prisma.usuarioRise.findUnique({ where: { id: u2.id } })).codigoDeVinculoHash, i3.codigo.length], ["anulado", null, 12]);
    await v.iniciarVinculo(u2.id, { quem: "zz-tg-admin" });
    const falso5 = criarTelegramFalso({ falhas: { getUpdates: { status: 401, description: "Unauthorized" } } });
    conferir("telegram fora devolve o erro", await v.localizarVinculo(u2.id, { cliente: criarClienteTelegram({ token: TOKEN, requisitar: falso5.requisitar }) }), { ok: false, motivo: "telegram", erro: "Unauthorized" });
    await prisma.usuarioRise.update({ where: { id: u2.id }, data: { ativo: false } });
    let inativo = null;
    try {
      await v.iniciarVinculo(u2.id, { quem: "zz-tg-admin" });
    } catch (erro) {
      inativo = erro.message;
    }
    conferir("usuario inativo nao inicia vinculo", inativo, "Ative o usuário antes de vincular o Telegram.");
    conferir("vinculos da equipe listam quem tem chat, sem o chatId", (await v.vinculosDaEquipe()).filter((x) => x.login.startsWith("zz-tg-")), [{ usuarioId: u.id, login: "zz-tg-vinc", nome: "ZZ TG Vinc", ativo: true }]);
    await v.desvincular(u.id, { quem: "zz-tg-admin" });
    conferir("desvincular zera o chat e audita", [(await prisma.usuarioRise.findUnique({ where: { id: u.id } })).telegramChatId, (await prisma.auditoriaDeAcesso.findFirst({ where: { quem: "zz-tg-admin", oQue: "telegram.vinculo.remover" } }))?.antes?.chatId], [null, "55"]);
  }

  {
    console.log("\nConfiguracao");
    const { configuracaoPadrao, validarConfiguracao, lerConfiguracao } = await import("../src/lib/riseAi/configuracao.js");
    const { parcialDaConfiguracao } = await import("../src/lib/riseAi/formularios.js");
    const { ABAS, RECURSO_DA_ABA, salvarAba } = await import("../src/lib/riseAi/abasDeConfiguracao.js");
    const { NAO_DELEGAVEIS, recursoPorId } = await import("../src/lib/acessos/recursos.js");
    const { TIPOS_DE_AVISO, ROTULO_DO_AVISO } = await import("../src/lib/telegram/avisosTipos.js");
    const { estadoDoTelegram } = await import("../src/lib/telegram/estado.js");
    const padrao = configuracaoPadrao("pc");
    conferir("padrao: bot desligado e todos os avisos marcados", padrao.telegram, { ligado: false, avisos: { resumoDoDia: true, produtoZerou: true, orcamento: true, varreduraPeloPc: true, varreduraFalhou: true } });
    conferir("os tipos de aviso tem rotulo", TIPOS_DE_AVISO.every((tipo) => typeof ROTULO_DO_AVISO[tipo] === "string" && ROTULO_DO_AVISO[tipo].length > 5), true);
    conferir("zod recusa aviso que nao e booleano", validarConfiguracao({ ...padrao, telegram: { ligado: true, avisos: { ...padrao.telegram.avisos, orcamento: "sim" } } }).ok, false);
    conferir("zod aceita o padrao", validarConfiguracao(padrao).ok, true);
    const dados = new FormData();
    dados.append("telegramLigado", "true");
    dados.append("telegramAviso.orcamento", "false");
    conferir("parcial le os campos da aba", parcialDaConfiguracao(dados).telegram, { ligado: true, avisos: { orcamento: false } });
    conferir("parcial ignora tipo de aviso desconhecido", parcialDaConfiguracao((() => { const d = new FormData(); d.append("telegramAviso.x", "true"); return d; })()).telegram, undefined);
    conferir("aba canais existe e e do Administrador", [ABAS, RECURSO_DA_ABA.canais, NAO_DELEGAVEIS.includes("riseAi.configuracoes.canais"), recursoPorId("riseAi.configuracoes.canais")?.pai], [["modelos", "orcamentos", "canais", "atendimento"], "riseAi.configuracoes.canais", true, "riseAi.configuracoes"]);
    const pode = () => true;
    const r = await salvarAba("canais", dados, { usuario: "zz-tg-admin", pode });
    const lida = await lerConfiguracao("pc");
    conferir("salvar a aba mescla: liga o bot, desliga um aviso e mantem os outros", [r.ok, lida.telegram.ligado, lida.telegram.avisos.orcamento, lida.telegram.avisos.produtoZerou], [true, true, false, true]);
    conferir("auditoria rise-ai.telegram", (await prisma.auditoriaDeAcesso.findFirst({ where: { quem: "zz-tg-admin", oQue: "rise-ai.telegram" } }))?.depois?.ligado, true);
    const so = new FormData();
    so.append("telegramLigado", "false");
    await salvarAba("canais", so, { usuario: "zz-tg-admin", pode });
    conferir("salvar so o interruptor nao apaga os avisos", (await lerConfiguracao("pc")).telegram.avisos.orcamento, false);
    conferir("sem permissao de editar a aba recusa", (await salvarAba("canais", so, { usuario: "zz-tg-x", pode: () => false })).ok, false);
    conferir("campo de outra aba nao entra pela canais", await codigoDoErro(salvarAba("canais", (() => { const d = new FormData(); d.append("orcamentoClientesBrl", "1"); return d; })(), { usuario: "zz-tg-admin", pode })), "Nada para salvar.");
    const estado = await estadoDoTelegram();
    conferir("estado do telegram tem a forma da aba", [typeof estado.token.cadastrada, "em" in estado.token, "usuario" in estado.bot, Array.isArray(estado.vinculados), typeof estado.urlPublica], ["boolean", true, true, true, "boolean"]);
  }

  // MARCADOR: blocos novos entram acima desta linha.
} finally {
  await limpar();
  await devolverODoDono();
  await prisma.$disconnect();
}

console.log(`\n${total} asserções, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
