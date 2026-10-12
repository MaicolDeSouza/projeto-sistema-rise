import "dotenv/config";

/**
 * Torna um login Administrador do Rise (spec de Acessos, §4: "Recuperacao por script"). E o caminho de volta quando
 * ninguem mais administra pela tela; na VPS roda por SSH, dentro do conteiner do app:
 *
 *   npm run acessos:admin -- <login>
 *
 * Cria o usuario (ou o reativa, se estava inativo) e o liga a funcao Administrador. Nao mexe em mais nada.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");
const { promoverAdministrador } = await import("../src/lib/acessos/semeadura.js");

const login = String(process.argv[2] ?? "").trim();
if (!login) {
  console.error("Uso: npm run acessos:admin -- <login>");
  process.exit(2);
}

try {
  const { login: gravado, criado } = await promoverAdministrador({ prisma, login });
  console.log(`${gravado} é Administrador do Rise (${criado ? "criado agora" : "já existia; ficou ativo e com a função"}).`);
} catch (erro) {
  console.error(erro?.message ?? erro);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
