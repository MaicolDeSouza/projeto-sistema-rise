/**
 * O servico `ia`: o chat da loja (o Hobi), separado do Rise (spec docs/superpowers/specs/2026-11-19-chat-ia-na-loja-design.md).
 *
 *   npm run ia            (no compose da VPS: `command: ["node", "scripts/ia-processo.js"]`)
 *
 * E o unico processo do Rise que atende a internet sem login. Por isso:
 *
 *  - NAO carrega o `.env` (nada de `dotenv` aqui): o ambiente dele e o `deploy/ia.env`, com a URL do usuario de banco
 *    restrito (`rise_ia`) e o segredo proprio. Se encontrar no ambiente qualquer chave do Rise (ENCRYPTION_KEY, tokens do
 *    Bling, do Mercado Livre, da Loja Integrada, o segredo de borda), ele NAO SOBE (sai com codigo 2).
 *  - o ambiente e conferido ANTES de qualquer outro modulo ser carregado e antes de tocar no banco.
 *  - nao monta `dados/` e nao escreve em disco: o estado dele e o banco (as conversas do canal) e a memoria (os limites).
 *
 * Da sinal de vida a cada 15 s (`SinalDoAssistente`); a Saude do Rise le dali. SIGTERM: para de aceitar pedido novo e
 * espera ate 30 s as respostas em andamento.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { conferirAmbiente, lerAmbiente } = await import("../src/lib/riseAi/cliente/ambiente.js");

const problemas = conferirAmbiente(process.env);
if (problemas.length) {
  console.error("O serviço do chat da loja não subiu:");
  for (const problema of problemas) console.error(` - ${problema}`);
  process.exit(2);
}
const ambiente = lerAmbiente(process.env);
const versao = process.env.RISE_VERSAO || "dev";

const { prisma } = await import("../src/lib/db.js");
const { criarDadosDoCliente } = await import("../src/lib/riseAi/cliente/dados.js");
const { responderAoCliente } = await import("../src/lib/riseAi/cliente/cerebro.js");
const { criarConversasDoCanal } = await import("../src/lib/riseAi/cliente/conversasDoCanal.js");
const { criarOrcamentoDoCliente } = await import("../src/lib/riseAi/cliente/orcamentoDoCliente.js");
const { derivarChave } = await import("../src/lib/riseAi/cliente/segredos.js");
const { criarServidorDoAssistente } = await import("../src/lib/riseAi/cliente/servidorHttp.js");
const { verificarTurnstile } = await import("../src/lib/riseAi/cliente/turnstile.js");
const { lerPublicados } = await import("../src/lib/riseAi/cliente/widgetPublicado.js");

const SINAL_MS = 15 * 1000;
const ESPERA_AO_SAIR_MS = 30 * 1000;
const log = (texto) => console.log(`${new Date().toISOString()} [ia] ${texto}`);

// O IA_SEGREDO nao e usado direto: cada parte recebe so a chave do seu uso (abrir os segredos; assinar o passe do robo).
const dados = criarDadosDoCliente({ baseDasFotos: ambiente.baseDasFotos, chaveHex: derivarChave(ambiente.chaveHex, "segredos") });
const conversas = criarConversasDoCanal();
const orcamento = criarOrcamentoDoCliente();

const servidor = criarServidorDoAssistente({
  dados,
  responder: ({ sessaoId, mensagem, contexto, aoEvento, limites }) =>
    responderAoCliente({ canal: "LOJA", sessaoId, mensagem, contexto, aoEvento, dependencias: { dados, conversas, orcamento, limites } }),
  avaliar: (mensagemId, sessaoId, nota) => conversas.avaliar(mensagemId, sessaoId, nota),
  verificarRobo: verificarTurnstile,
  chaveHex: derivarChave(ambiente.chaveHex, "passe"),
  origens: ambiente.origens,
  versao,
  // A janela do chat, lida da imagem uma vez na partida (o conteiner so le o disco).
  widgets: lerPublicados().arquivos,
});

let ultimoErro = null;
let encerrando = false;
async function darSinal() {
  try {
    await dados.darSinal({ emAndamento: servidor.limites.emAndamento(), versao, ultimoErro });
  } catch (erro) {
    // Banco fora do ar: o servico continua de pe (o `/status` ja responde desligado) e tenta de novo no proximo sinal.
    console.error("[ia] nao deu o sinal de vida:", erro?.message ?? erro);
  }
}
const relogio = setInterval(darSinal, SINAL_MS);

async function sair(motivo, codigo = 0) {
  if (encerrando) return;
  encerrando = true;
  log(`encerrando (${motivo})`);
  clearInterval(relogio);
  servidor.close();
  const limite = Date.now() + ESPERA_AO_SAIR_MS;
  while (servidor.limites.emAndamento() > 0 && Date.now() < limite) await new Promise((resolver) => setTimeout(resolver, 250));
  await prisma.$disconnect().catch(() => null);
  process.exit(codigo);
}
process.on("SIGTERM", () => sair("SIGTERM"));
process.on("SIGINT", () => sair("SIGINT"));
// Erro fora de qualquer try: registra e sai; o Docker religa. Ficar de pe num estado desconhecido seria pior.
process.on("uncaughtException", (erro) => {
  console.error("[ia] erro fatal:", erro?.stack ?? erro);
  sair("erro fatal", 1);
});
process.on("unhandledRejection", (erro) => {
  ultimoErro = String(erro?.message ?? erro).slice(0, 300);
  console.error("[ia] promessa rejeitada sem tratamento:", erro?.stack ?? erro);
});

servidor.listen(ambiente.porta, "0.0.0.0", () => {
  log(`no ar na porta ${ambiente.porta}, versao ${versao}, origens ${ambiente.origens.join(", ")}`);
  darSinal();
});
