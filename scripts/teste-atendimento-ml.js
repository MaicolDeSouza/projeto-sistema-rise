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

  // MARCADOR: blocos novos entram acima desta linha.
} finally {
  if (!MANTER) await limpar();
  await prisma.$disconnect();
}

console.log(`\n${total} asserções, ${falhas} falha(s)`);
process.exit(falhas ? 1 : 0);
