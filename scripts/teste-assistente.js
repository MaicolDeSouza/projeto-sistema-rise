import "dotenv/config";

/**
 * Testes do chat da loja (o Hobi), fase 1: a fundacao segura (spec docs/superpowers/specs/2026-11-19-chat-ia-na-loja-design.md,
 * plano docs/superpowers/plans/2026-11-19-chat-da-loja-fase-1-fundacao-segura.md).
 *
 *   npm run teste:assistente
 *
 * Postgres local, SEM rede e SEM IA paga: o provedor e falso (scripts/lib/provedorFalso.js) e o Turnstile tambem. So escreve
 * produtos `ZZ-LOJA-*`, conversas `loja:zz-*`, notas "ZZ LOJA *" e gastos com referencia de conversa de teste; a
 * ConfiguracaoIA do dono e lida no comeco e devolvida no fim.
 *
 * O isolamento do usuario de banco `rise_ia` tem teste proprio: `npm run teste:ia-isolamento`.
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

/** Apaga tudo o que os testes criam. Roda no comeco e no fim. */
async function limpar() {
  const conversas = (await prisma.conversaIA.findMany({ where: { usuario: { startsWith: "loja:zz-" } }, select: { id: true } })).map((c) => c.id);
  if (conversas.length) {
    await prisma.gastoIA.deleteMany({ where: { referencia: { in: conversas } } });
    await prisma.reservaDeGastoIA.deleteMany({ where: { dono: { in: conversas } } });
  }
  await prisma.conversaIA.deleteMany({ where: { usuario: { startsWith: "loja:zz-" } } });
  await prisma.conhecimentoIA.deleteMany({ where: { assunto: { startsWith: "ZZ LOJA" } } });
  await prisma.produtoComponente.deleteMany({ where: { kit: { sku: { startsWith: "ZZ-LOJA-" } } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-LOJA-" } } });
  await prisma.segredoDoAssistente.deleteMany({ where: { atualizadoPor: "zz-loja" } });
}

/** `true` se a funcao lancou. */
function lancou(funcao) {
  try {
    funcao();
    return false;
  } catch {
    return true;
  }
}

const configuracaoDoDono = await prisma.configuracaoIA.findUnique({ where: { id: "unica" } });
async function devolverODoDono() {
  if (configuracaoDoDono) {
    await prisma.configuracaoIA.upsert({ where: { id: "unica" }, create: configuracaoDoDono, update: { dados: configuracaoDoDono.dados, atualizadoPor: configuracaoDoDono.atualizadoPor } });
  } else {
    await prisma.configuracaoIA.deleteMany({ where: { id: "unica" } });
  }
}

try {
  await limpar();

  // ---------- Tarefa 1: canais, configuracao do canal e o orcamento interno sem os clientes ----------
  const { CANAIS_DE_CLIENTE } = await import("../src/lib/riseAi/cliente/canais.js");
  const { chatDaLojaPadrao, EsquemaDoChatDaLoja } = await import("../src/lib/riseAi/cliente/configuracaoDoCanal.js");
  const { configuracaoPadrao, validarConfiguracao, lerConfiguracao } = await import("../src/lib/riseAi/configuracao.js");
  const { gastoDoMes } = await import("../src/lib/riseAi/orcamento.js");

  conferir("canais de cliente", CANAIS_DE_CLIENTE, ["LOJA"]);
  conferir("o chat nasce desligado", chatDaLojaPadrao().ligado, false);
  conferir("o nome de fabrica e Hobi", chatDaLojaPadrao().nome, "Hobi");
  conferir("limites de fabrica", chatDaLojaPadrao().limites, {
    mensagensPorSessaoPorHora: 30,
    caracteresPorMensagem: 2000,
    brlPorSessaoPorDia: 0.5,
    mensagensPorIpPorHora: 60,
    respostasAoMesmoTempo: 5,
    brlPorDia: 7,
  });
  conferir("a configuracao padrao traz o grupo", configuracaoPadrao("pc").chatDaLoja, chatDaLojaPadrao());
  conferir("o padrao do grupo valida", EsquemaDoChatDaLoja.safeParse(chatDaLojaPadrao()).success, true);
  conferir("whatsapp fora do wa.me e recusado", EsquemaDoChatDaLoja.safeParse({ ...chatDaLojaPadrao(), whatsapp: "https://exemplo.com/x" }).success, false);
  conferir("whatsapp do wa.me e aceito", EsquemaDoChatDaLoja.safeParse({ ...chatDaLojaPadrao(), whatsapp: "https://wa.me/5554999990000" }).success, true);
  conferir(
    "modelo sem preco cadastrado e recusado",
    EsquemaDoChatDaLoja.safeParse({ ...chatDaLojaPadrao(), principal: { provedor: "openai", modelo: "gpt-inexistente" } }).success,
    false,
  );
  conferir("reserva pode ser nula", EsquemaDoChatDaLoja.safeParse({ ...chatDaLojaPadrao(), reserva: null }).success, true);
  conferir("limite zero e recusado", EsquemaDoChatDaLoja.safeParse({ ...chatDaLojaPadrao(), limites: { ...chatDaLojaPadrao().limites, respostasAoMesmoTempo: 0 } }).success, false);
  conferir("a configuracao inteira com o grupo valida", validarConfiguracao(configuracaoPadrao("pc")).ok, true);

  // Configuracao salva ANTES de o grupo existir (a da VPS hoje): a leitura devolve o padrao do grupo.
  conferir("configuracao salva sem o grupo le o padrao", (await lerConfiguracao()).chatDaLoja?.nome ?? null, configuracaoDoDono?.dados?.chatDaLoja?.nome ?? "Hobi");
  // Salvar SO um campo do grupo nao apaga os outros (nem os limites).
  await prisma.configuracaoIA.upsert({
    where: { id: "unica" },
    create: { id: "unica", dados: { chatDaLoja: { ligado: true, limites: { brlPorDia: 3 } } } },
    update: { dados: { ...(configuracaoDoDono?.dados ?? {}), chatDaLoja: { ligado: true, limites: { brlPorDia: 3 } } } },
  });
  const lida = (await lerConfiguracao()).chatDaLoja;
  conferir("salvar um campo mantem os outros", [lida.ligado, lida.nome, lida.limites.brlPorDia, lida.limites.mensagensPorSessaoPorHora], [true, "Hobi", 3, 30]);
  await devolverODoDono();

  // O custo de uma resposta do canal LOJA nao entra no orcamento INTERNO.
  const antes = (await gastoDoMes("INTERNO")).gastoBrl;
  const conversa = await prisma.conversaIA.create({ data: { titulo: "zz", usuario: "loja:zz-t1", perfil: "PUBLICO", canal: "LOJA" } });
  await prisma.mensagemIA.create({ data: { conversaId: conversa.id, papel: "ASSISTENTE", conteudo: "zz", provedor: "openai", modelo: "gpt-4.1-mini", custoBrl: 1.23 } });
  conferir("resposta da loja fora do orcamento interno", (await gastoDoMes("INTERNO")).gastoBrl, antes);

  // ---------- Tarefa 3: os segredos do servico e a camada de dados sobre as visoes ----------
  const { cifrarSegredo, decifrarSegredo } = await import("../src/lib/riseAi/cliente/segredos.js");
  const { criarDadosDoCliente } = await import("../src/lib/riseAi/cliente/dados.js");
  const { PADRAO_DO_CEREBRO } = await import("../src/lib/riseAi/cliente/configuracaoDoCanal.js");

  const chave = "ab".repeat(32);
  conferir("segredo vai e volta", decifrarSegredo(cifrarSegredo("sk-teste", chave), chave), "sk-teste");
  conferir("chave errada lanca", lancou(() => decifrarSegredo(cifrarSegredo("x", chave), "cd".repeat(32))), true);
  conferir("texto adulterado lanca", lancou(() => decifrarSegredo(cifrarSegredo("sk-teste", chave).replace(/.$/, (c) => (c === "A" ? "B" : "A")), chave)), true);
  conferir("o cifrado nao contem o texto", cifrarSegredo("sk-teste", chave).includes("sk-teste"), false);
  conferir("o mesmo texto cifra diferente a cada vez", cifrarSegredo("sk-teste", chave) === cifrarSegredo("sk-teste", chave), false);
  conferir("chave curta lanca", lancou(() => cifrarSegredo("x", "abc")), true);

  // O que o cerebro le da configuracao geral tem de ser o padrao do Rise (uma fonte so, conferida aqui).
  const padraoDoRise = configuracaoPadrao("vps");
  conferir("padrao do cerebro = padrao do Rise", PADRAO_DO_CEREBRO, {
    tetoClientesBrl: padraoDoRise.orcamentos.clientesBrl,
    tempoLimite: padraoDoRise.tempoLimite,
    maxChamadasDeFerramenta: padraoDoRise.maxChamadasDeFerramenta,
    maxTokensResposta: padraoDoRise.maxTokensResposta,
    contextoMaxTokens: padraoDoRise.contextoMaxTokens,
  });

  const publicado = (sku, tituloBase, extra = {}) =>
    prisma.produto.create({ data: { sku, tituloBase, ativo: true, urlLojaIntegrada: `https://www.4hobby.com.br/${sku.toLowerCase()}`, custo: 9.99, estoque: 10, ...extra } });
  await publicado("ZZ-LOJA-LED", "ZZ LOJA LED vermelho difuso 5mm", { precoVenda: 0.2, localizacao: "Z9", descricaoBase: "LED ZZLOJA\n\nEspecificações técnicas:\n- Cor: Vermelho;\n- Tensão: 2V;\n\nIdeal para zzlojaprojetos." });
  await publicado("ZZ-LOJA-UNO", "ZZ LOJA Arduino UNO R3 placa", { precoVenda: 79.8, modelo: "ZZUNOR3" });
  await publicado("ZZ-LOJA-UNO2", "ZZ LOJA Arduino UNO R3 placa SMD", { precoVenda: 59.9, estoque: 0 });
  await publicado("ZZ-LOJA-R220", "ZZ LOJA resistor 220R", { precoVenda: 0.1 });
  await publicado("ZZ-LOJA-PROTO", "ZZ LOJA protoboard 400 pontos", { precoVenda: 12 });
  await prisma.produto.create({ data: { sku: "ZZ-LOJA-OCULTO", tituloBase: "ZZ LOJA LED vermelho fora da loja", ativo: true, precoVenda: 1, estoque: 5 } });
  const kit = await publicado("ZZ-LOJA-KIT", "ZZ LOJA kit iniciante", { precoVenda: 99, tipo: "COMPOSICAO" });
  const pecaPublica = await prisma.produto.findUnique({ where: { sku: "ZZ-LOJA-LED" } });
  const pecaOculta = await prisma.produto.findUnique({ where: { sku: "ZZ-LOJA-OCULTO" } });
  await prisma.produtoComponente.create({ data: { kitId: kit.id, componenteId: pecaPublica.id, quantidade: 5, ordem: 0 } });
  await prisma.produtoComponente.create({ data: { kitId: kit.id, componenteId: pecaOculta.id, quantidade: 1, ordem: 1 } });
  await prisma.conhecimentoIA.create({ data: { assunto: "ZZ LOJA publica", conteudo: "zz loja garantia de 90 dias contra defeito", visibilidade: "PUBLICO", status: "APROVADO", criadoPor: "zz-loja" } });
  await prisma.conhecimentoIA.create({ data: { assunto: "ZZ LOJA interna", conteudo: "zz loja garantia: o fornecedor troca em 30 dias", visibilidade: "ADMIN", status: "APROVADO", criadoPor: "zz-loja" } });

  const dados = criarDadosDoCliente({ baseDasFotos: "https://rise.exemplo/", chaveHex: chave });
  const achados = await dados.buscarProdutos("zz loja led vermelho");
  conferir("acha o publicado pelo nome", achados.map((p) => p.sku), ["ZZ-LOJA-LED"]);
  conferir("o cartao so tem os campos publicos", Object.keys(achados[0]).sort(), ["faixa", "foto", "liId", "link", "marca", "modelo", "nome", "preco", "sku", "tipo"]);
  conferir("preco e faixa do cartao", [achados[0].preco, achados[0].faixa], [0.2, "disponível"]);
  conferir("o oculto nao e achado nem pelo codigo", await dados.buscarProdutos("ZZ-LOJA-OCULTO"), []);
  conferir("codigo exato, sem caixa", (await dados.buscarProdutos("zz-loja-proto")).map((p) => p.sku), ["ZZ-LOJA-PROTO"]);
  conferir("modelo exato", (await dados.buscarProdutos("zzunor3")).map((p) => p.sku), ["ZZ-LOJA-UNO"]);
  conferir("no empate, quem tem estoque vem antes", (await dados.buscarProdutos("zz loja arduino uno")).map((p) => p.sku), ["ZZ-LOJA-UNO", "ZZ-LOJA-UNO2"]);
  conferir("so com estoque", (await dados.buscarProdutos("zz loja arduino uno", { apenasComEstoque: true })).map((p) => p.sku), ["ZZ-LOJA-UNO"]);
  conferir("preco maximo", (await dados.buscarProdutos("zz loja arduino uno", { precoMaximo: 60 })).map((p) => p.sku), ["ZZ-LOJA-UNO2"]);
  conferir("palavra que so esta na descricao (busca ampla)", (await dados.buscarProdutos("zzlojaprojetos")).map((p) => p.sku), ["ZZ-LOJA-LED"]);
  conferir("a localizacao nao e buscavel", await dados.buscarProdutos("Z9"), []);
  conferir("curinga do LIKE vale como letra", await dados.buscarProdutos("zz lo_a led"), []);
  conferir("por sku mantem a ordem e o nulo", (await dados.produtosPorSku(["ZZ-LOJA-OCULTO", "zz-loja-led"])).map((p) => p?.sku ?? null), [null, "ZZ-LOJA-LED"]);
  const ficha = await dados.fichaDoProduto("ZZ-LOJA-LED");
  conferir("a ficha vem das linhas da descricao", ficha.ficha, [{ nome: "Cor", valor: "Vermelho" }, { nome: "Tensão", valor: "2V" }]);
  conferir("ficha de produto oculto e nula", await dados.fichaDoProduto("ZZ-LOJA-OCULTO"), null);
  conferir("o kit so mostra a peca publicada", (await dados.fichaDoProduto("ZZ-LOJA-KIT")).kit, [{ sku: "ZZ-LOJA-LED", nome: "ZZ LOJA LED vermelho difuso 5mm", quantidade: 5 }]);
  // O catalogo de verdade tambem tem um "Arduino UNO R3": so os de teste entram na conta.
  conferir("similares: o outro Uno, sem o proprio", (await dados.similares("ZZ-LOJA-UNO", { limite: 50 })).map((p) => p.sku).filter((sku) => sku.startsWith("ZZ-LOJA-")), ["ZZ-LOJA-UNO2"]);
  conferir("nota interna fora do conhecimento", (await dados.conhecimento("zz loja garantia contra defeito")).map((n) => n.assunto), ["ZZ LOJA publica"]);
  const doCanal = await dados.configuracaoDoCanal();
  conferir("config do canal vem com o padrao por baixo", [doCanal.canal.nome, doCanal.canal.limites.mensagensPorSessaoPorHora, typeof doCanal.maxTokensResposta, typeof doCanal.tetoClientesBrl], ["Hobi", 30, "number", "number"]);

  await prisma.segredoDoAssistente.create({ data: { nome: "openai", cifrado: cifrarSegredo("sk-zz-loja", chave), atualizadoPor: "zz-loja" } });
  await prisma.segredoDoAssistente.create({ data: { nome: "turnstile", cifrado: cifrarSegredo("ts-zz", "cd".repeat(32)), atualizadoPor: "zz-loja" } });
  conferir("segredos: o que abre vem, o de outra chave vira nulo", await dados.segredos(), { openai: "sk-zz-loja", anthropic: null, turnstile: null });
  await prisma.segredoDoAssistente.deleteMany({ where: { atualizadoPor: "zz-loja" } });
  await dados.darSinal({ emAndamento: 2, versao: "zz-teste" });
  const sinal = await prisma.sinalDoAssistente.findUnique({ where: { id: "unico" } });
  conferir("o sinal de vida e gravado em UTC, agora", [sinal.versao, sinal.emAndamento, Math.abs(Date.now() - sinal.sinalEm.getTime()) < 60000], ["zz-teste", 2, true]);

  // MARCADOR-T4 (as tarefas seguintes acrescentam os seus blocos acima desta linha)
} catch (erro) {
  falhas++;
  console.error("ERRO NAO ESPERADO:", erro);
} finally {
  await devolverODoDono().catch((erro) => console.error("nao devolveu a configuracao do dono:", erro));
  await limpar().catch((erro) => console.error("nao limpou:", erro));
  await prisma.$disconnect();
}

console.log(`\n${total - falhas} de ${total} ok${falhas ? `, ${falhas} FALHA(S)` : ""}`);
process.exit(falhas ? 1 : 0);
