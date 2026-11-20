/**
 * UMA conversa completa do chat da loja rodando como o usuario de banco `rise_ia` de verdade. So o
 * `scripts/teste-ia-isolamento.js` chama este arquivo, como processo filho, com a `DATABASE_URL` do papel e um ambiente
 * limpo (sem ENCRYPTION_KEY, sem tokens): prova que o cerebro inteiro funciona so com as concessoes do papel e sem
 * nenhuma chave do Rise, e que o mesmo processo NAO alcanca a tabela de produtos.
 *
 * Nao carrega o `.env` de proposito. Provedor falso: sem rede e sem IA paga. Imprime UMA linha JSON no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("../resolver-alias.js", import.meta.url), pathToFileURL("./"));

const saida = { ok: false };
try {
  const { prisma } = await import("../../src/lib/db.js");
  const { criarDadosDoCliente } = await import("../../src/lib/riseAi/cliente/dados.js");
  const { responderAoCliente } = await import("../../src/lib/riseAi/cliente/cerebro.js");
  const { criarProvedorFalso } = await import("./provedorFalso.js");

  saida.usuarioDoBanco = (await prisma.$queryRawUnsafe("SELECT current_user AS u"))[0].u;
  saida.chavesDoRiseNoAmbiente = Object.keys(process.env).filter((nome) => /^(ENCRYPTION_KEY|RISE_SEGREDO_DE_BORDA|POSTGRES_PASSWORD|BLING_|ML_|LI_|TINYAUTH_)/.test(nome));

  const roteiro = [
    { chamadas: [{ nome: "buscarProdutos", argumentos: { termos: "zz loja produto publicado" } }] },
    { chamadas: [{ nome: "mostrarProdutos", argumentos: { itens: [{ sku: "ZZ-LOJA-PUB", papel: "produto" }] } }] },
    { texto: "Veja o produto acima." },
  ];
  const provedor = criarProvedorFalso({ id: "openai", roteiro });
  const resposta = await responderAoCliente({
    canal: "LOJA",
    sessaoId: process.argv[2],
    mensagem: "tem o zz loja produto publicado?",
    dependencias: { dados: criarDadosDoCliente({ baseDasFotos: "https://rise.exemplo", chaveHex: "ab".repeat(32) }), criarProvedor: async () => provedor },
  });
  saida.cartoes = resposta.cartoes.map((cartao) => cartao.sku);
  saida.texto = resposta.texto;
  saida.conversaId = resposta.conversaId;
  saida.custoBrl = resposta.custoBrl;

  // O mesmo cliente do Prisma, o mesmo processo: a tabela de produtos (com o custo) esta fechada.
  try {
    await prisma.produto.findFirst({ select: { sku: true, custo: true } });
    saida.leuProduto = true;
  } catch (erro) {
    saida.leuProduto = false;
    saida.erroAoLerProduto = /permission denied|permiss/i.test(String(erro?.message)) ? "permissao negada" : String(erro?.message).slice(0, 200);
  }
  await prisma.$disconnect();
  saida.ok = true;
} catch (erro) {
  saida.erro = String(erro?.stack ?? erro).slice(0, 1500);
}
console.log(`RESULTADO ${JSON.stringify(saida)}`);
process.exit(saida.ok ? 0 : 1);
