import "dotenv/config";

/**
 * Cria em Cadastros o fornecedor ou concorrente de cada fonte que ja existia em
 * Mercados antes de Cadastros existir.
 *
 * Fonte NOVA ja ganha o cadastro no `salvarFonte`; este script cobre as antigas.
 * Pode rodar quantas vezes quiser: quem ja tem cadastro ligado so e conferido, e
 * nome que ja existe so e ligado, nunca sobrescrito (ver garantirCadastroDaFonte).
 *
 *   node scripts/cadastros-das-fontes.js
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");

register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");
const { garantirCadastroDaFonte } = await import("../src/lib/cadastros.js");

const fontes = await prisma.fonteColeta.findMany({ orderBy: { nome: "asc" } });

let criados = 0;
let ligados = 0;
let semCadastro = 0;

for (const fonte of fontes) {
  if (fonte.tipo === "OUTRO") {
    semCadastro++;
    console.log(`  --  ${fonte.nome} (tipo OUTRO: sem cadastro)`);
    continue;
  }

  const modelo = fonte.tipo === "FORNECEDOR" ? prisma.fornecedor : prisma.concorrente;
  const antes = await modelo.findUnique({ where: { nome: fonte.nome } });
  await garantirCadastroDaFonte(prisma, fonte);

  if (!antes) {
    criados++;
    console.log(`  novo  ${fonte.tipo.toLowerCase()}: ${fonte.nome}`);
  } else if (!antes.fonteId) {
    ligados++;
    console.log(`  liga  ${fonte.tipo.toLowerCase()}: ${fonte.nome} (ja existia)`);
  } else {
    console.log(`  ok    ${fonte.tipo.toLowerCase()}: ${fonte.nome}`);
  }
}

console.log(
  `\n${fontes.length} fonte(s): ${criados} cadastro(s) criado(s), ${ligados} ligado(s), ${semCadastro} sem cadastro.`,
);

await prisma.$disconnect();
