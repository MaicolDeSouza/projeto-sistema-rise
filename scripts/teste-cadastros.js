import "dotenv/config";

/**
 * Testes de Cadastros: CPF/CNPJ (sem banco) e a ligacao fonte -> cadastro (usa o
 * Postgres, com fontes de teste que sao apagadas no fim).
 *
 *   npm run teste:cadastros
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");

register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { validarCpf, validarCnpj, formatarCpf, formatarCnpj, formatarCep } = await import(
  "../src/lib/documentos.js"
);
const { garantirCadastroDaFonte } = await import("../src/lib/cadastros.js");
const { prisma } = await import("../src/lib/db.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

// ---------------------------------------------------------------------------
// CPF e CNPJ
// ---------------------------------------------------------------------------

console.log("\nCPF");
conferir("CPF valido com pontuacao", validarCpf("529.982.247-25"), true);
conferir("CPF valido so digitos", validarCpf("52998224725"), true);
conferir("outro CPF valido", validarCpf("111.444.777-35"), true);
conferir("digito verificador errado", validarCpf("529.982.247-24"), false);
conferir("primeiro digito errado", validarCpf("529.982.247-05"), false);
conferir("sequencia repetida 111.111.111-11", validarCpf("111.111.111-11"), false);
conferir("sequencia repetida 00000000000", validarCpf("00000000000"), false);
conferir("curto demais", validarCpf("1234567890"), false);
conferir("comprido demais", validarCpf("529982247251"), false);
conferir("vazio", validarCpf(""), false);
conferir("nulo", validarCpf(null), false);
conferir("letras", validarCpf("abcdefghijk"), false);
conferir("formata CPF", formatarCpf("52998224725"), "529.982.247-25");

console.log("\nCNPJ");
conferir("CNPJ valido com pontuacao", validarCnpj("11.222.333/0001-81"), true);
conferir("CNPJ valido so digitos", validarCnpj("11222333000181"), true);
conferir("outro CNPJ valido", validarCnpj("04.252.011/0001-10"), true);
conferir("digito verificador errado", validarCnpj("11.222.333/0001-82"), false);
conferir("sequencia repetida", validarCnpj("11.111.111/1111-11"), false);
conferir("so zeros", validarCnpj("00000000000000"), false);
conferir("curto demais", validarCnpj("1122233300018"), false);
conferir("CPF nao e CNPJ", validarCnpj("529.982.247-25"), false);
conferir("CNPJ nao e CPF", validarCpf("11.222.333/0001-81"), false);
conferir("vazio", validarCnpj(""), false);
conferir("formata CNPJ", formatarCnpj("11222333000181"), "11.222.333/0001-81");

console.log("\nCEP");
conferir("formata CEP completo", formatarCep("01310100"), "01310-100");
conferir("CEP incompleto fica sem hifen", formatarCep("01310"), "01310");
conferir("ignora o que nao e digito", formatarCep("01.310-100x"), "01310-100");
conferir("corta o excesso", formatarCep("013101009999"), "01310-100");

// ---------------------------------------------------------------------------
// Telefone: grava so os digitos, mostra "(54) 98899-0008"
// ---------------------------------------------------------------------------

console.log("\nTelefone");
const { telefoneValido, telefoneParaGravar, formatarTelefone, filtrarDigitacaoDeTelefone } = await import(
  "../src/lib/telefone.js"
);
conferir("celular com pontuacao", telefoneValido("(54) 98899-0008"), true);
conferir("celular so digitos", telefoneValido("54988990008"), true);
conferir("o formato pedido pelo dono, (xx)9NNNNNNNN, tambem e aceito na entrada", telefoneValido("(54)988990008"), true);
conferir("fixo de 10 digitos", telefoneValido("(54) 3333-4444"), true);
conferir("cola do WhatsApp, com +55", telefoneValido("+55 54 98899-0008"), true);
conferir("DDD 55 com 11 digitos NAO e codigo de pais", telefoneParaGravar("55999998888"), "55999998888");
conferir("13 digitos com 55 na frente: tira o codigo do pais", telefoneParaGravar("5554988990008"), "54988990008");
conferir("sem DDD (9 digitos)", telefoneValido("988990008"), false);
conferir("DDD que nao existe (10)", telefoneValido("10988990008"), false);
conferir("DDD que nao existe (23)", telefoneValido("23988990008"), false);
conferir("celular sem o 9 na frente do numero", telefoneValido("54888990008"), false);
conferir("10 digitos comecando em 9 e celular antigo, sem o nono digito", telefoneValido("5498899000"), false);
conferir("curto demais", telefoneValido("5498899"), false);
conferir("letras no meio recusam (5488990p008u tem so 9 digitos)", telefoneValido("5488990p008u"), false);
conferir("vazio nao e valido (o chamador ignora linha em branco)", telefoneValido(""), false);
conferir("null nao quebra", telefoneValido(null), false);

conferir("grava so os digitos", telefoneParaGravar("(54) 98899-0008"), "54988990008");
conferir("as duas grafias do mesmo numero gravam igual", telefoneParaGravar("(54)98899-0008"), telefoneParaGravar("54 98899 0008"));
conferir("invalido nao grava", telefoneParaGravar("123"), null);

conferir("mostra o celular como (54) 98899-0008", formatarTelefone("54988990008"), "(54) 98899-0008");
conferir("mostra o fixo como (54) 3333-4444", formatarTelefone("5433334444"), "(54) 3333-4444");
conferir("formatar o que ja esta formatado nao muda", formatarTelefone("(54) 98899-0008"), "(54) 98899-0008");
conferir("texto invalido volta como esta, aparado: nao inventa pontuacao", formatarTelefone("  5488 "), "5488");
conferir("gravar e mostrar voltam ao mesmo lugar", formatarTelefone(telefoneParaGravar("(54)988990008")), "(54) 98899-0008");

conferir("filtro tira letras", filtrarDigitacaoDeTelefone("5488990p008u"), "5488990008");
conferir("filtro deixa a pontuacao de telefone", filtrarDigitacaoDeTelefone("+55 (54) 98899-0008"), "+55 (54) 98899-0008");

// ---------------------------------------------------------------------------
// Fonte -> cadastro (banco)
// ---------------------------------------------------------------------------

console.log("\nFonte -> cadastro");

const PREFIXO = "ZZ Teste Cadastros";
const fontesCriadas = [];

async function novaFonte(nome, tipo, dominio) {
  const fonte = await prisma.fonteColeta.create({
    data: { nome, dominio, tipo, ativa: false, proximaVarreduraEm: new Date(Date.now() + 1e12) },
  });
  fontesCriadas.push(fonte.id);
  return fonte;
}

try {
  // Concorrente novo nasce ligado.
  const a = await novaFonte(`${PREFIXO} A`, "CONCORRENTE", "zz-teste-a.invalid");
  await prisma.$transaction((tx) => garantirCadastroDaFonte(tx, a));
  const concorrente = await prisma.concorrente.findUnique({ where: { nome: `${PREFIXO} A` } });
  conferir("concorrente criado", Boolean(concorrente), true);
  conferir("concorrente ligado a fonte", concorrente?.fonteId, a.id);
  conferir("site preenchido", concorrente?.site, "https://zz-teste-a.invalid");
  conferir("nao criou fornecedor", await prisma.fornecedor.count({ where: { nome: `${PREFIXO} A` } }), 0);

  // Fornecedor que ja existe (com dados) so e ligado, sem sobrescrever.
  await prisma.fornecedor.create({
    data: { nome: `${PREFIXO} B`, cnpj: "11.222.333/0001-81", prazoEntregaDias: 5, site: "https://digitado.com.br" },
  });
  const b = await novaFonte(`${PREFIXO} B`, "FORNECEDOR", "zz-teste-b.invalid");
  await prisma.$transaction((tx) => garantirCadastroDaFonte(tx, b));
  const fornecedor = await prisma.fornecedor.findUnique({ where: { nome: `${PREFIXO} B` } });
  conferir("fornecedor existente ligado", fornecedor.fonteId, b.id);
  conferir("cnpj preservado", fornecedor.cnpj, "11.222.333/0001-81");
  conferir("prazo preservado", fornecedor.prazoEntregaDias, 5);
  conferir("site ja digitado preservado", fornecedor.site, "https://digitado.com.br");

  // Cadastro ligado a outra fonte nao e roubado.
  const b2 = await novaFonte(`${PREFIXO} B`, "FORNECEDOR", "zz-teste-b2.invalid");
  await prisma.$transaction((tx) => garantirCadastroDaFonte(tx, b2));
  const depois = await prisma.fornecedor.findUnique({ where: { nome: `${PREFIXO} B` } });
  conferir("nao rouba cadastro de outra fonte", depois.fonteId, b.id);

  // Tipo OUTRO nao cria nada.
  const o = await novaFonte(`${PREFIXO} Outro`, "OUTRO", "zz-teste-o.invalid");
  conferir("OUTRO devolve null", await prisma.$transaction((tx) => garantirCadastroDaFonte(tx, o)), null);
  conferir("OUTRO nao cria concorrente", await prisma.concorrente.count({ where: { nome: `${PREFIXO} Outro` } }), 0);

  // Atomicidade: erro depois do cadastro desfaz a fonte tambem.
  try {
    await prisma.$transaction(async (tx) => {
      const f = await tx.fonteColeta.create({
        data: { nome: `${PREFIXO} Rollback`, dominio: "zz-rollback.invalid", tipo: "CONCORRENTE", ativa: false },
      });
      await garantirCadastroDaFonte(tx, f);
      throw new Error("falha simulada");
    });
  } catch {}
  conferir("rollback: sem fonte", await prisma.fonteColeta.count({ where: { nome: `${PREFIXO} Rollback` } }), 0);
  conferir("rollback: sem concorrente", await prisma.concorrente.count({ where: { nome: `${PREFIXO} Rollback` } }), 0);

  // Excluir a fonte NAO leva o cadastro (SetNull).
  await prisma.fonteColeta.delete({ where: { id: a.id } });
  const sobrou = await prisma.concorrente.findUnique({ where: { nome: `${PREFIXO} A` } });
  conferir("excluir fonte mantem o cadastro", Boolean(sobrou), true);
  conferir("cadastro fica sem fonte", sobrou?.fonteId, null);
} finally {
  await prisma.concorrente.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
  await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: PREFIXO } } });
  await prisma.fonteColeta.deleteMany({ where: { id: { in: fontesCriadas } } });
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
