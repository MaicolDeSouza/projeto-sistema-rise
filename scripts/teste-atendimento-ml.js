import "dotenv/config";

/**
 * Testes do Atendimento do Mercado Livre, fase 1: perguntas dos anuncios (spec
 * docs/superpowers/specs/2026-11-24-atendimento-ml-design.md; plano
 * docs/superpowers/plans/2026-11-24-atendimento-ml-fase-1-perguntas.md).
 *
 *   npm run teste:atendimento-ml
 *   npm run teste:atendimento-ml -- --manter   (deixa as perguntas ZZ-ATD-* para conferir a tela)
 *
 * Postgres local, SEM rede e SEM IA paga: o Mercado Livre (scripts/lib/mlPerguntasFalso.js), o Telegram
 * (scripts/lib/telegramFalso.js) e o provedor de IA sao falsos. So escreve atendimentos com idExterno `ZZ-ATD-*`, produtos
 * `ZZ-ATD-*`, usuarios `zz-atd-*` e as linhas do bot com chat `zz-atd-*`; a ConfiguracaoIA, a Conexao TELEGRAM e o estado do
 * bot do dono sao lidos no comeco e devolvidos no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");

const MANTER = process.argv.includes("--manter");

let falhas = 0;
let total = 0;
function conferir(nome, obtido, esperado) {
  total++;
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
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

async function limpar() {
  await prisma.atendimentoML.deleteMany({ where: { idExterno: { startsWith: "ZZ-ATD-" } } });
}

try {
  await limpar();

  // ---------------------------------------------------------------------------------------------------------------
  console.log("\n# Tarefa 1: banco");
  {
    const base = { tipo: "PERGUNTA", textoDoCliente: "Tem em estoque?", situacaoNoML: "UNANSWERED", recebidaEm: new Date() };
    const criada = await prisma.atendimentoML.create({ data: { ...base, idExterno: "ZZ-ATD-1" } });
    conferir("pergunta nasce ABERTA", criada.status, "ABERTA");
    conferir("a mesma pergunta nao entra duas vezes", await codigoDoErro(prisma.atendimentoML.create({ data: { ...base, idExterno: "ZZ-ATD-1" } })), "P2002");
    await limpar();
  }

  // ---------------------------------------------------------------------------------------------------------------
  console.log("\n# Tarefa 2: filtro e etiquetas");
  {
    const { trocarEtiquetas } = await import("../src/lib/atendimentoML/etiquetas.js");
    const { filtrarResposta, linkDoMercadoLivre } = await import("../src/lib/atendimentoML/filtro.js");
    const URL_KIT = "https://produto.mercadolivre.com.br/MLB-111-x";

    const troca = trocarEtiquetas("Kit de 10: [ANUNCIO:MLB111]", [{ itemId: "MLB111", url: URL_KIT }]);
    conferir("etiqueta vira link", [troca.texto, troca.links], [`Kit de 10: ${URL_KIT}`, [URL_KIT]]);
    const semAnuncio = trocarEtiquetas("veja [ANUNCIO:MLB999] aqui", []);
    conferir("etiqueta desconhecida sai do texto", [semAnuncio.desconhecidas, semAnuncio.texto], [["MLB999"], "veja aqui"]);
    conferir("etiqueta com hifen e minuscula", trocarEtiquetas("[anuncio:mlb-111]", [{ itemId: "MLB111", url: URL_KIT }]).texto, URL_KIT);

    conferir("host do ML", [linkDoMercadoLivre("https://www.mercadolivre.com.br/p/MLB1"), linkDoMercadoLivre("https://mercadolivre.com.br/x"), linkDoMercadoLivre("http://www.mercadolivre.com.br/x"), linkDoMercadoLivre("https://mercadolivre.com.br.evil.com/x"), linkDoMercadoLivre("https://evilmercadolivre.com.br/x"), linkDoMercadoLivre("nada")], [true, true, false, false, false, false]);

    const f = (texto, origem = "DONO", extra = {}) => filtrarResposta({ texto, origem, limite: 2000, ...extra });
    conferir("dono: link do ML passa", f("Segue: https://www.mercadolivre.com.br/p/MLB1.").ok, true);
    conferir("dono: link de fora barra", [f("veja https://4hobby.com.br/x").ok, f("veja https://4hobby.com.br/x").barrados[0]], [false, { trecho: "https://4hobby.com.br/x", motivo: "link" }]);
    conferir("dominio parecido barra", f("https://mercadolivre.com.br.evil.com/x").ok, false);
    conferir("sem protocolo barra", f("acesse www.4hobby.com.br").barrados[0]?.motivo, "link");
    conferir("dominio solto barra", f("procure 4hobby.com.br no navegador").barrados[0]?.motivo, "link");
    conferir("encurtado barra", f("bit.ly/abc").barrados[0]?.motivo, "link");
    conferir("http do ML barra (so https)", f("http://www.mercadolivre.com.br/p/MLB1").ok, false);
    conferir("IA: link do ML fora da troca barra", f("https://www.mercadolivre.com.br/p/MLB1", "IA").ok, false);
    conferir("IA: link da troca passa", f(`Temos: ${URL_KIT}`, "IA", { linksDaTroca: [URL_KIT] }).ok, true);
    conferir("telefone barra", f("me chama no 54 98122-2300").barrados[0]?.motivo, "telefone");
    conferir("email barra", f("fale em contato@loja.com").barrados.map((b) => b.motivo), ["email"]);
    conferir("cpf barra", f("meu cpf 529.982.247-25").barrados[0]?.motivo, "documento");
    conferir("medida nao e telefone nem link", f("Fonte 12V 5A, 110/220V, 60x40x30 mm, 1000 unidades, modelo HC-SR04 v2.0.").ok, true);
    conferir("tamanho", filtrarResposta({ texto: "a".repeat(11), origem: "DONO", limite: 10 }).barrados[0]?.motivo, "tamanho");
    conferir("vazio", f("   ").barrados[0]?.motivo, "vazio");
  }

  // ---------------------------------------------------------------------------------------------------------------
  console.log("\n# Tarefa 3: a pergunta chega");
  {
    const { conferirNotificacao } = await import("../src/lib/pedidos/webhooks.js");
    const { aplicarPerguntaLida, lerPerguntaDoML, rodarAtendimentoML, ATENDIMENTO_ML_MS } = await import("../src/lib/atendimentoML/perguntas.js");
    const { ROTINAS_DO_WORKER } = await import("../src/lib/saude/regras.js");
    const { criarMlPerguntasFalso } = await import("./lib/mlPerguntasFalso.js");

    const seg = { mlUsuarioId: "212386247", mlClientId: "123" };
    const corpo = JSON.stringify({ resource: "/questions/ZZ-ATD-10", user_id: 212386247, topic: "questions", application_id: 123 });
    conferir("notificacao de pergunta entra na fila", conferirNotificacao({ origem: "MERCADO_LIVRE", corpoTexto: corpo, headers: new Headers(), segredos: seg }).recurso, "/questions/ZZ-ATD-10");
    conferir("a rotina tem linha na Saude e roda a cada 5 min", [ROTINAS_DO_WORKER.some((r) => r.id === "atendimentoML"), ATENDIMENTO_ML_MS], [true, 300000]);

    const ml = criarMlPerguntasFalso();
    const linha = (idExterno) => prisma.atendimentoML.findUnique({ where: { tipo_idExterno: { tipo: "PERGUNTA", idExterno } } });

    ml.porPergunta({ id: "ZZ-ATD-10", texto: "Serve no Arduino Uno?" });
    const primeira = await aplicarPerguntaLida(await lerPerguntaDoML(ml, "ZZ-ATD-10"));
    conferir("pergunta lida nasce ABERTA", [primeira.criada, primeira.status, (await linha("ZZ-ATD-10")).textoDoCliente], [true, "ABERTA", "Serve no Arduino Uno?"]);
    conferir("anuncio desconhecido entra sem produto", [(await linha("ZZ-ATD-10")).itemId, (await linha("ZZ-ATD-10")).anuncioId], ["MLB900000001", null]);
    const repetida = await aplicarPerguntaLida(await lerPerguntaDoML(ml, "ZZ-ATD-10"));
    conferir("a mesma pergunta lida de novo nao duplica", [repetida.criada, await prisma.atendimentoML.count({ where: { idExterno: "ZZ-ATD-10" } })], [false, 1]);

    ml.responderNoApp("ZZ-ATD-10", "Serve sim.");
    const fechada = await aplicarPerguntaLida(await lerPerguntaDoML(ml, "ZZ-ATD-10"));
    const depois = await linha("ZZ-ATD-10");
    conferir("respondida no app do ML fecha a linha", [fechada.status, depois.respondidaVia, depois.respostaEnviada, depois.situacaoNoML], ["FECHADA_FORA", "ML", "Serve sim.", "ANSWERED"]);

    conferir("pergunta que o ML nao tem mais", await lerPerguntaDoML(ml, "ZZ-ATD-404"), null);
    ml.porPergunta({ id: "ZZ-ATD-11", texto: "", status: "BANNED" });
    conferir("pergunta banida (texto vazio) nao entra", [(await aplicarPerguntaLida(await lerPerguntaDoML(ml, "ZZ-ATD-11"))).criada, await linha("ZZ-ATD-11")], [false, null]);
    ml.porPergunta({ id: "ZZ-ATD-12", status: "ANSWERED", resposta: { text: "ok", status: "ACTIVE" } });
    conferir("pergunta que ja chega respondida nao entra", (await aplicarPerguntaLida(await lerPerguntaDoML(ml, "ZZ-ATD-12"))).criada, false);

    // A rotina: a busca de seguranca traz a que nao veio por notificacao e fecha a que foi respondida fora.
    ml.perguntas.clear();
    await limpar();
    ml.porPergunta({ id: "ZZ-ATD-20", texto: "Qual a tensão?" });
    ml.porPergunta({ id: "ZZ-ATD-21", texto: "Tem nota fiscal?" });
    const rodada = await rodarAtendimentoML({ ml, soPrefixo: "ZZ-ATD-" });
    conferir("a busca de seguranca traz as sem resposta", [rodada.ok, rodada.novas, (await linha("ZZ-ATD-21")).status], [true, 2, "ABERTA"]);
    ml.responderNoApp("ZZ-ATD-20");
    ml.perguntas.delete("ZZ-ATD-21");
    const segunda = await rodarAtendimentoML({ ml, soPrefixo: "ZZ-ATD-" });
    conferir("a rotina fecha a respondida no app e a apagada", [segunda.novas, segunda.fechadas, (await linha("ZZ-ATD-20")).status, (await linha("ZZ-ATD-21")).status, (await linha("ZZ-ATD-21")).situacaoNoML], [0, 2, "FECHADA_FORA", "FECHADA_FORA", "DELETED"]);
    const comErro = await rodarAtendimentoML({ ml: { ...ml, get: async () => ({ ok: false, status: 500, dados: {} }) }, soPrefixo: "ZZ-ATD-" });
    conferir("ML fora do ar: a rotina nao lanca", [comErro.ok, typeof comErro.erro], [false, "string"]);
    await limpar();
  }

  // ---------------------------------------------------------------------------------------------------------------
  console.log("\n# Tarefa 4: rascunho, ignorar e o envio unico");
  {
    const { aplicarPerguntaLida } = await import("../src/lib/atendimentoML/perguntas.js");
    const { salvarRascunho, ignorarAtendimento, reabrirAtendimento, listarAtendimentos, contarAbertas, lerAtendimento } = await import("../src/lib/atendimentoML/banco.js");
    const { enviarResposta, idDaPerguntaNoML } = await import("../src/lib/atendimentoML/enviar.js");
    const { criarMlPerguntasFalso } = await import("./lib/mlPerguntasFalso.js");
    const LIGADA = { ML_RESPONDER_PERGUNTAS: "true" };
    const DESLIGADA = { ML_RESPONDER_PERGUNTAS: "false" };
    const por = "zz-atd-dono";

    const ml = criarMlPerguntasFalso();
    const nova = async (idExterno, texto = "Tem em estoque?") => (await aplicarPerguntaLida(ml.porPergunta({ id: idExterno, texto }))).id;
    const enviar = (id, extra = {}) => enviarResposta({ id, por, via: "RISE", ml, env: LIGADA, ...extra });

    conferir("id numerico vai como numero ao ML", [idDaPerguntaNoML("13112345678"), idDaPerguntaNoML("ZZ-ATD-1")], [13112345678, "ZZ-ATD-1"]);

    const a = await nova("ZZ-ATD-30");
    conferir("sem rascunho nao envia", (await enviar(a)).motivo, "sem-rascunho");
    const salvo = await salvarRascunho({ id: a, texto: "Temos sim, pronta entrega.", origem: "DONO", por });
    conferir("rascunho do dono", [salvo.ok, (await lerAtendimento(a)).rascunhoOrigem], [true, "MANUAL"]);

    const travado = await enviar(a, { env: DESLIGADA });
    conferir("trava do .env desligada: nada sai", [travado.ok, travado.motivo, ml.respostasEnviadas.length], [false, "trava", 0]);
    conferir("a mensagem da trava cita a variavel", travado.mensagem.includes("ML_RESPONDER_PERGUNTAS"), true);

    const ok = await enviar(a);
    const enviada = await lerAtendimento(a);
    conferir("envio certo", [ok.ok, enviada.status, enviada.respostaEnviada, enviada.respondidaPor, enviada.respondidaVia, enviada.enviandoDesde], [true, "RESPONDIDA", "Temos sim, pronta entrega.", por, "RISE", null]);
    conferir("um POST com a pergunta certa", ml.respostasEnviadas, [{ question_id: "ZZ-ATD-30", text: "Temos sim, pronta entrega." }]);
    conferir("respondida nao envia de novo", [(await enviar(a)).motivo, ml.respostasEnviadas.length], ["nao-aberta", 1]);
    conferir("auditoria sem o texto do cliente", (await prisma.auditoriaDeAcesso.findFirst({ where: { quem: por, oQue: "atendimentoML.responder" }, orderBy: { quando: "desc" } }))?.alvo, a);

    // Dois envios ao mesmo tempo: um so POST.
    const b = await nova("ZZ-ATD-31");
    await salvarRascunho({ id: b, texto: "Serve sim.", origem: "DONO", por });
    const antes = ml.respostasEnviadas.length;
    const juntos = await Promise.all([enviar(b), enviarResposta({ id: b, por, via: "TELEGRAM", ml, env: LIGADA })]);
    conferir("dois envios juntos: um ok, um POST", [juntos.filter((r) => r.ok).length, juntos.find((r) => !r.ok)?.motivo, ml.respostasEnviadas.length - antes], [1, "ja-enviando", 1]);

    // Respondida pelo app do ML antes do envio.
    const c = await nova("ZZ-ATD-32");
    await salvarRascunho({ id: c, texto: "Sim.", origem: "DONO", por });
    ml.responderNoApp("ZZ-ATD-32", "Já respondi pelo app.");
    const fora = await enviar(c);
    conferir("respondida fora: nada sai e a linha fecha", [fora.motivo, (await lerAtendimento(c)).status, (await lerAtendimento(c)).respostaEnviada], ["fechada-fora", "FECHADA_FORA", "Já respondi pelo app."]);

    // Filtro na hora do envio (o rascunho barrado fica gravado para o dono corrigir).
    const d = await nova("ZZ-ATD-33");
    const barrado = await salvarRascunho({ id: d, texto: "Compre em https://4hobby.com.br/x", origem: "DONO", por });
    conferir("rascunho barrado fica gravado", [barrado.ok, barrado.barrados[0].motivo, (await lerAtendimento(d)).rascunho], [false, "link", "Compre em https://4hobby.com.br/x"]);
    const recusado = await enviar(d);
    conferir("envio recusa o barrado", [recusado.motivo, recusado.barrados[0].trecho], ["filtro", "https://4hobby.com.br/x"]);
    await salvarRascunho({ id: d, texto: "Veja https://www.mercadolivre.com.br/p/MLB1", origem: "DONO", por });
    conferir("link do ML digitado pelo dono sai", (await enviar(d)).ok, true);

    // Erro do ML: a trava solta e o proximo envio funciona.
    const e = await nova("ZZ-ATD-34");
    await salvarRascunho({ id: e, texto: "Sim.", origem: "DONO", por });
    ml.falharNoProximoPost(500);
    const falhou = await enviar(e);
    const comErro = await lerAtendimento(e);
    conferir("erro do ML: linha segue aberta, trava solta", [falhou.motivo, comErro.status, comErro.enviandoDesde, Boolean(comErro.erroDoEnvio)], ["ml", "ABERTA", null, true]);
    conferir("depois do erro, o envio funciona", [(await enviar(e)).ok, (await lerAtendimento(e)).erroDoEnvio], [true, null]);

    // Trava presa ha mais de 2 min (processo morto no meio) e tratada como solta.
    const g = await nova("ZZ-ATD-35");
    await salvarRascunho({ id: g, texto: "Sim.", origem: "DONO", por });
    await prisma.atendimentoML.update({ where: { id: g }, data: { enviandoDesde: new Date(Date.now() - 30 * 1000) } });
    conferir("trava recente segura", (await enviar(g)).motivo, "ja-enviando");
    await prisma.atendimentoML.update({ where: { id: g }, data: { enviandoDesde: new Date(Date.now() - 3 * 60 * 1000) } });
    conferir("trava velha e solta", (await enviar(g)).ok, true);

    // Rascunho da IA editado pelo dono, ignorar e reabrir, lista e contagem.
    const h = await nova("ZZ-ATD-36", "Qual a voltagem?");
    await salvarRascunho({ id: h, texto: "É 12V.", origem: "IA", por });
    conferir("rascunho da IA", (await lerAtendimento(h)).rascunhoOrigem, "IA");
    await salvarRascunho({ id: h, texto: "É 12V, bivolt não.", origem: "DONO", por });
    conferir("IA editada pelo dono", (await lerAtendimento(h)).rascunhoOrigem, "IA_EDITADA");
    const abertasAntes = await contarAbertas("PERGUNTA", { soPrefixo: "ZZ-ATD-" });
    conferir("ignorar", [(await ignorarAtendimento({ id: h, por })).ok, (await lerAtendimento(h)).status, await contarAbertas("PERGUNTA", { soPrefixo: "ZZ-ATD-" })], [true, "IGNORADA", abertasAntes - 1]);
    conferir("ignorada nao aceita rascunho nem envio", [(await salvarRascunho({ id: h, texto: "x", origem: "DONO", por })).motivo, (await enviar(h)).motivo], ["nao-aberta", "nao-aberta"]);
    conferir("reabrir", [(await reabrirAtendimento({ id: h, por })).ok, (await lerAtendimento(h)).status], [true, "ABERTA"]);
    conferir("respondida nao reabre", (await reabrirAtendimento({ id: a, por })).ok, false);
    const lista = await listarAtendimentos({ status: "ABERTA", filtros: { texto: "voltagem" }, soPrefixo: "ZZ-ATD-" });
    conferir("lista filtra pelo texto", [lista.total, lista.linhas[0].idExterno, lista.linhas[0].anuncio], [1, "ZZ-ATD-36", null]);
    const todas = await listarAtendimentos({ soPrefixo: "ZZ-ATD-", ordenar: "recebidaEm", direcao: "asc", porPagina: 3 });
    conferir("lista pagina", [todas.total, todas.linhas.length], [7, 3]);
    conferir("id inexistente", [(await enviar("zz-atd-nao-existe")).motivo, await lerAtendimento("zz-atd-nao-existe")], ["nao-aberta", null]);

    await prisma.auditoriaDeAcesso.deleteMany({ where: { quem: por } });
    await limpar();
  }

  // MARCADOR: blocos novos entram acima desta linha.
} finally {
  if (!MANTER) await limpar();
  await prisma.$disconnect();
}

console.log(`\n${total} asserções, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
