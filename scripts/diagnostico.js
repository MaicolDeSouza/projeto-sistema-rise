import "dotenv/config";

/**
 * Diagnostico das integracoes por linha de comando.
 *
 * Usa exatamente o mesmo codigo da tela: serve para conferir as conexoes sem
 * abrir o navegador, e para checar rapidamente se algo quebrou.
 *
 * O import e dinamico porque os modulos usam o alias "@/" do Next, que o Node
 * puro nao resolve — o registro abaixo mapeia na mao antes de carregar.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");

register(
  new URL("./resolver-alias.js", import.meta.url),
  pathToFileURL("./"),
);

const { conectores } = await import("../src/lib/integracoes/registro.js");
const { registrarTeste } = await import("../src/lib/integracoes/conexoes.js");
const { prisma } = await import("../src/lib/db.js");

function coluna(texto, largura) {
  const valor = String(texto ?? "");
  return valor.length > largura
    ? `${valor.slice(0, largura - 1)}…`
    : valor.padEnd(largura);
}

const linhas = [];

for (const conector of conectores) {
  // Conector bloqueado por decisao do fornecedor nao e falha nossa: aparece
  // como "bloqueado" e nao entra no codigo de saida. Um check que sempre falha
  // vira um check que todo mundo aprende a ignorar.
  if (conector.bloqueado) {
    linhas.push({
      nome: conector.nome,
      bloqueado: true,
      detalhe: conector.bloqueado.saida,
    });
    continue;
  }

  let resultado;
  try {
    resultado = await conector.testar();
  } catch (erro) {
    resultado = { ok: false, erro: erro.message };
  }

  try {
    await registrarTeste(conector.id, {
      ok: resultado.ok,
      conta: resultado.conta,
      erro: resultado.erro,
    });
  } catch {
    // Sem banco o diagnostico ainda vale: so nao fica registrado.
  }

  linhas.push({ nome: conector.nome, ...resultado });
}

console.log("");
console.log(
  coluna("SERVICO", 18) + coluna("SITUACAO", 12) + coluna("LATENCIA", 10) + "DETALHE",
);
console.log("-".repeat(96));

for (const linha of linhas) {
  const situacao = linha.bloqueado ? "bloqueado" : linha.ok ? "ok" : "FALHOU";
  console.log(
    coluna(linha.nome, 18) +
      coluna(situacao, 12) +
      coluna(linha.latenciaMs ? `${linha.latenciaMs}ms` : "—", 10) +
      (linha.ok || linha.bloqueado
        ? [linha.conta, linha.detalhe].filter(Boolean).join(" · ")
        : linha.erro),
  );
}
console.log("");

await prisma.$disconnect();
process.exit(linhas.every((linha) => linha.ok || linha.bloqueado) ? 0 : 1);
