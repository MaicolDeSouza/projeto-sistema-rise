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

  // MARCADOR-T3 (as tarefas seguintes acrescentam os seus blocos acima desta linha)
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
