import "dotenv/config";

/**
 * Testes das Licencas Softwares (spec 2026-11-05-licencas-softwares-design.md): os programas semeados e os recursos de
 * Acessos; nas tarefas seguintes entram as regras puras, o banco, o arquivo de licenca, a leitura do portal e a
 * importacao das planilhas. SEM rede.
 *
 *   npm run teste:licencas            (apaga o que criou no fim)
 *   npm run teste:licencas -- --manter (deixa os ZZ no banco, para conferir a tela)
 *
 * So escreve licencas ZZ-LIC-*, programas zz-lic-*, clientes "ZZ LIC *" e as leituras do portal deles, apagados no
 * comeco e no fim. A conexao LIGHTBURN (o hash da chave da extensao) volta ao que era.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const manter = process.argv.includes("--manter");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

// ---------------------------------------------------------------------------
// Regras puras (sem banco)
// ---------------------------------------------------------------------------

console.log("\nRegras puras");
const R = await import("../src/lib/ferramentas/licencas/regras.js");
conferir("nome do PC", [R.normalizarNomeDoPc("USUARIO-PC\t\r"), R.normalizarNomeDoPc("  Desktop  M5 "), R.normalizarNomeDoPc(null)], ["usuario-pc", "desktop m5", ""]);
conferir("identificador: chave em maiusculas, arquivo so aparado", [R.normalizarIdentificador(" bfe1ae-16 ", "CHAVE"), R.normalizarIdentificador(" Mach3 VD60 ", "ARQUIVO")], ["BFE1AE-16", "Mach3 VD60"]);
const lb = { ativacoesPermitidas: 3 };
const lida = { portalLidoEm: new Date(), portalAtivacoesPermitidas: null };
const at = (hostname, extra = {}) => ({ id: hostname, hostname, sumiuEm: null, ultimaSincronizacaoEm: null, ...extra });
conferir("vagas: 1 de 3, 2 livres", R.vagasLivres({ software: lb, licenca: lida, ativacoes: [at("A")] }), { permitidas: 3, usadas: 1, livres: 2, lida: true });
conferir("vagas: sumida nao conta", R.vagasLivres({ software: lb, licenca: lida, ativacoes: [at("A"), at("B", { sumiuEm: new Date() })] }).usadas, 1);
conferir("vagas: nunca lida = null, nunca '3 livres'", R.vagasLivres({ software: lb, licenca: { portalLidoEm: null }, ativacoes: [] }), { permitidas: 3, usadas: 0, livres: null, lida: false });
conferir("vagas: portal vence o programa e 4 de 3 da 0", R.vagasLivres({ software: lb, licenca: { ...lida, portalAtivacoesPermitidas: 3 }, ativacoes: [at("A"), at("B"), at("C"), at("D")] }).livres, 0);
conferir("vagas: programa sem limite", R.vagasLivres({ software: { ativacoesPermitidas: null }, licenca: lida, ativacoes: [at("A")] }).livres, null);
const linha = (id, nomeDoPc, situacao = "ATIVA") => ({ id, nomeDoPc, situacao });
const c1 = R.casarLinhasComAtivacoes([linha("l1", "Desktop-A"), linha("l2", null), linha("l3", "PC-X", "ENCERRADA")], [at("desktop-a"), at("PC-X"), at("NOVO")]);
conferir("casamento: por nome sem caixa; encerrada nao casa; sobra = sem cliente", [c1.porLinha.get("l1")?.hostname, c1.porLinha.get("l2"), c1.semCliente.map((a) => a.hostname), c1.empates], ["desktop-a", null, ["PC-X", "NOVO"], []]);
const c2 = R.casarLinhasComAtivacoes([linha("l1", "DESKTOP-PC")], [at("DESKTOP-PC", { id: "a1" }), at("desktop-pc", { id: "a2" })]);
conferir("casamento: dois PCs com o mesmo nome = empate, ninguem casa, nao sao 'sem cliente'", [c2.porLinha.get("l1"), c2.semCliente.length, c2.empates], [null, 0, [{ hostname: "desktop-pc", linhaIds: ["l1"] }]]);
conferir("ultimo uso", R.ultimoUso([at("A", { ultimaSincronizacaoEm: new Date("2026-10-01") }), at("B", { ultimaSincronizacaoEm: new Date("2026-11-01") }), at("C", { ultimaSincronizacaoEm: new Date("2026-12-01"), sumiuEm: new Date() })])?.toISOString(), "2026-11-01T00:00:00.000Z");
const agora = new Date("2026-11-05T12:00:00Z");
const sit = (licenca) => R.situacaoDaLicenca({ licenca: { portalSituacao: "ACTIVE", portalLidoEm: agora, ...licenca }, software: { temPortal: true }, agora });
conferir("situacao: verde > 30 dias", sit({ portalExpiraEm: new Date("2026-12-31T12:00:00Z") }), { cor: "verde", texto: "Expira em 56 dias" });
conferir("situacao: ambar <= 30", sit({ portalExpiraEm: new Date("2026-11-20T12:00:00Z") }).cor, "ambar");
conferir("situacao: expirada", sit({ portalExpiraEm: new Date("2026-10-26T12:00:00Z") }), { cor: "cinza", texto: "Expirada há 10 dias" });
conferir("situacao: suspensa, revogada, outra", [sit({ portalSituacao: "SUSPENDED" }).texto, sit({ portalSituacao: "REVOKED" }).texto, sit({ portalSituacao: "WEIRD" })], ["Suspensa", "Revogada", { cor: "vermelho", texto: "WEIRD" }]);
conferir("situacao: sumiu do portal vence tudo; nunca lida; sem portal", [sit({ portalSumiuEm: agora }).texto, sit({ portalLidoEm: null }), R.situacaoDaLicenca({ licenca: {}, software: { temPortal: false } })], ["Sumiu do portal", { cor: "cinza", texto: "Não lida do portal" }, null]);
conferir("frescor", [R.frescorDaLeitura(null).cor, R.frescorDaLeitura(agora, agora).texto, R.frescorDaLeitura(new Date("2026-11-01T12:00:00Z"), agora), R.frescorDaLeitura(new Date("2026-10-20T12:00:00Z"), agora).cor, R.frescorDaLeitura(new Date("2026-09-01T12:00:00Z"), agora).cor], ["vermelho", "Lido do portal hoje", { cor: "verde", texto: "Lido do portal há 4 dias" }, "ambar", "vermelho"]);
const proj = (identificador, livres, ultimoUso) => ({ identificador, vagas: { livres }, ultimoUso });
conferir("ordem padrao: mais livres, depois uso mais antigo (nunca usada primeiro), depois chave", R.ordenarLicencas([proj("C", 1, null), proj("A", 2, new Date("2026-01-01")), proj("B", 2, null), proj("D", null, null)]).map((p) => p.identificador), ["B", "A", "C", "D"]);
conferir("datas", [R.lerDataIso("2026-11-05")?.toISOString(), R.lerDataIso(""), R.formatarDataCurta(new Date("2026-11-05T00:00:00Z"))], ["2026-11-05T00:00:00.000Z", null, "05/11/26"]);
conferir("resumo da leitura", R.textoDoResumoDaLeitura({ licencas: 78, novas: 2, alteradas: 5, sumiram: 1, pcsSemCliente: 3 }), "78 chaves lidas · 2 novas · 5 alteradas · 1 PC sumiu · 3 PCs sem cliente (abra o Rise)");

// ---------------------------------------------------------------------------
// Arquivos: zip e upload (puro)
// ---------------------------------------------------------------------------

const zlib = await import("node:zlib");
/**
 * Um zip montado aqui, sem o codigo testado: local header + diretorio central + fim, com `deflateRawSync` quando a
 * entrada pede (metodo 8) e o CRC do proprio Node (`zlib.crc32`).
 */
function montarZipDeTeste(entradas) {
  const locais = [];
  const centrais = [];
  let deslocamento = 0;
  for (const entrada of entradas) {
    const nome = Buffer.from(entrada.nome, "utf8");
    const dados = entrada.deflate ? zlib.deflateRawSync(entrada.bytes) : entrada.bytes;
    const crc = zlib.crc32(entrada.bytes);
    const metodo = entrada.deflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(entrada.bytes.length, 22);
    local.writeUInt16LE(nome.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(entrada.bytes.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    locais.push(local, nome, dados);
    centrais.push(central, nome);
    deslocamento += local.length + nome.length + dados.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...locais, diretorio, fim]);
}
/** Troca um byte do CRC do primeiro local header (offset 14). */
function corromperCrc(bytes) {
  const copia = Buffer.from(bytes);
  copia[14] ^= 0xff;
  return copia;
}

console.log("\nArquivos: zip e upload");
const A = await import("../src/lib/ferramentas/licencas/arquivos.js");
const dat = Buffer.from("MACH3-LICENCA-DE-TESTE-".repeat(9)).subarray(0, 201);
conferir("sha256 e crc32 conhecidos", [A.sha256Hex(Buffer.from("abc")), A.crc32(Buffer.from("123456789"))], ["ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", 0xcbf43926]);
const solto = A.lerArquivoEnviado({ nome: "../x/Mach1Lic.dat", bytes: dat });
conferir("dat solto: nome limpo, 201 bytes, sha", [solto.ok, solto.nomeOriginal, solto.tamanhoBytes, solto.sha256 === A.sha256Hex(dat)], [true, "Mach1Lic.dat", 201, true]);
const zip = A.montarZipDoArquivo({ identificador: "Mach3 VD60", nomeOriginal: "Mach1Lic.dat", bytes: dat });
conferir("zip: nome e assinatura", [zip.nome, zip.bytes.subarray(0, 4).toString("hex")], ["Mach3 VD60.zip", "504b0304"]);
const dentro = A.lerZipDeUmArquivo(zip.bytes);
conferir("zip: le o que montou, com a pasta no caminho", [dentro.ok, dentro.nome, dentro.bytes.equals(dat)], [true, "Mach3 VD60/Mach1Lic.dat", true]);
const peloZip = A.lerArquivoEnviado({ nome: "Mach3 VD60.zip", bytes: zip.bytes });
conferir("upload de zip: fica o arquivo de dentro, so o nome base", [peloZip.ok, peloZip.nomeOriginal, peloZip.tamanhoBytes, peloZip.bytes.equals(dat)], [true, "Mach1Lic.dat", 201, true]);
// zip com entrada de pasta + um arquivo deflate: monta com o zlib de verdade (deflateRawSync) para cobrir o metodo 8.
const zipComPasta = montarZipDeTeste([{ nome: "Mach3 VD60/", bytes: Buffer.alloc(0) }, { nome: "Mach3 VD60/Mach1Lic.dat", bytes: dat, deflate: true }]);
conferir("zip com pasta e deflate: aceito", A.lerArquivoEnviado({ nome: "a.zip", bytes: zipComPasta }).nomeOriginal, "Mach1Lic.dat");
conferir("zip com dois arquivos: recusado", A.lerArquivoEnviado({ nome: "a.zip", bytes: montarZipDeTeste([{ nome: "a", bytes: dat }, { nome: "b", bytes: dat }]) }).erro, "O zip precisa ter um único arquivo dentro.");
conferir("zip corrompido (crc errado): recusado", A.lerArquivoEnviado({ nome: "a.zip", bytes: corromperCrc(zip.bytes) }).erro, "Zip corrompido.");
conferir("vazio e acima do teto", [A.lerArquivoEnviado({ nome: "a.dat", bytes: Buffer.alloc(0) }).erro, A.lerArquivoEnviado({ nome: "a.dat", bytes: Buffer.alloc(A.TETO_BYTES_ARQUIVO + 1) }).erro], ["Arquivo vazio.", "Arquivo acima de 1 MB."]);
conferir("zip pequeno que descompacta acima do teto: recusado", A.lerArquivoEnviado({ nome: "a.zip", bytes: montarZipDeTeste([{ nome: "a", bytes: Buffer.alloc(A.TETO_BYTES_ARQUIVO + 1), deflate: true }]) }).erro, "Arquivo acima de 1 MB.");
conferir("nome so de pontos ou vazio vira licenca.dat", [A.limparNomeDeArquivo(".."), A.limparNomeDeArquivo(""), A.limparNomeDeArquivo("C:\\pasta\\Mach1Lic.dat")], ["licenca.dat", "licenca.dat", "Mach1Lic.dat"]);

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

const { prisma } = await import("../src/lib/db.js");
const inicioDoTeste = new Date();

/** Apaga so o que o teste cria. Arquivos antes das licencas e licencas antes dos programas: os dois sao Restrict. */
async function limpar() {
  await prisma.logIntegracao.deleteMany({ where: { servico: "LIGHTBURN", criadoEm: { gte: inicioDoTeste } } });
  await prisma.leituraDoPortal.deleteMany({ where: { OR: [{ software: { slug: { startsWith: "zz-lic-" } } }, { lidaEm: { gte: inicioDoTeste } }] } });
  await prisma.arquivoDeLicenca.deleteMany({ where: { licenca: { identificador: { startsWith: "ZZ-LIC-" } } } });
  await prisma.licenca.deleteMany({ where: { identificador: { startsWith: "ZZ-LIC-" } } });
  await prisma.software.deleteMany({ where: { slug: { startsWith: "zz-lic-" } } });
  await prisma.cliente.deleteMany({ where: { nome: { startsWith: "ZZ LIC " } } });
}

// A conexao LIGHTBURN como estava: o teste gera chaves da extensao e devolve tudo no fim.
const conexaoOriginal = await prisma.conexao.findUnique({ where: { servico: "LIGHTBURN" } });
async function devolverConexao() {
  if (conexaoOriginal) {
    const { id, servico, criadoEm, atualizadoEm, ...dados } = conexaoOriginal;
    void id; void criadoEm; void atualizadoEm;
    await prisma.conexao.update({ where: { servico }, data: dados });
  } else {
    await prisma.conexao.deleteMany({ where: { servico: "LIGHTBURN" } });
  }
}

await limpar();

try {
  console.log("\nBanco: programas semeados e recursos");
  const softwares = await prisma.software.findMany({ orderBy: { ordem: "asc" }, select: { slug: true, identificacao: true, temPortal: true, ativacoesPermitidas: true, linhasIniciais: true } });
  conferir("LightBurn e Mach3 semeados", softwares.filter((s) => ["lightburn", "mach3"].includes(s.slug)), [
    { slug: "lightburn", identificacao: "CHAVE", temPortal: true, ativacoesPermitidas: 3, linhasIniciais: 3 },
    { slug: "mach3", identificacao: "ARQUIVO", temPortal: false, ativacoesPermitidas: null, linhasIniciais: 1 },
  ]);
  conferir("Servico LIGHTBURN existe", Object.keys((await import("@/generated/prisma/enums")).Servico).includes("LIGHTBURN"), true);
  const { recursoPorId } = await import("../src/lib/acessos/recursos.js");
  conferir("recursos de Acessos", [recursoPorId("tela.ferramentas.licencas")?.pai, recursoPorId("acao.ferramentas.licencas.arquivo")?.pai], ["tela.ferramentas", "tela.ferramentas.licencas"]);
  const { FERRAMENTAS } = await import("../src/lib/ferramentas/catalogo.js");
  conferir("cartao em Ferramentas", FERRAMENTAS.find((f) => f.href === "/ferramentas/licencas")?.recurso, "tela.ferramentas.licencas");

  console.log("\nBanco: licencas e linhas");
  const B = await import("../src/lib/ferramentas/licencas/banco.js");
  const chaveId = (await prisma.software.create({ data: { nome: "ZZ Lic Chave", slug: "zz-lic-chave", identificacao: "CHAVE", temPortal: true, ativacoesPermitidas: 3, linhasIniciais: 3, ordem: 90 } })).id;
  const arquivoId = (await prisma.software.create({ data: { nome: "ZZ Lic Arquivo", slug: "zz-lic-arquivo", identificacao: "ARQUIVO", ordem: 91 } })).id;
  const comDoc = (await prisma.cliente.create({ data: { nome: "ZZ LIC Com Documento", documento: "529.982.247-25" } })).id;
  const semDoc = (await prisma.cliente.create({ data: { nome: "ZZ LIC Sem Documento" } })).id;
  conferir("programa: nome repetido recusado, slug derivado", [(await B.salvarSoftware(null, { nome: "ZZ Lic Chave", identificacao: "CHAVE" })).erros?.nome, (await B.listarSoftwares({ soAtivos: false })).find((s) => s.slug === "zz-lic-chave")?.identificacao], ["Já existe um programa com esse nome.", "CHAVE"]);
  const nova = await B.criarLicenca({ softwareId: chaveId, identificador: " zz-lic-aaaa-1 ", tipo: "Core", compradaEm: R.lerDataIso("2026-11-01") });
  conferir("licenca nova: chave em maiusculas e aparada, origem manual", [nova.ok, (await B.lerLicenca(nova.id)).identificador, (await B.lerLicenca(nova.id)).origem], [true, "ZZ-LIC-AAAA-1", "manual"]);
  conferir("licenca repetida (outra caixa) recusada", (await B.criarLicenca({ softwareId: chaveId, identificador: "ZZ-LIC-AAAA-1" })).erro, "A licença ZZ-LIC-AAAA-1 já existe neste programa.");
  conferir("programa ARQUIVO exige o arquivo", (await B.criarLicenca({ softwareId: arquivoId, identificador: "ZZ-LIC-M1" })).erro, "Envie o arquivo da licença.");
  conferir("linha: sem cliente, cliente sem documento, com documento", [(await B.criarLinha(nova.id, {})).erro, (await B.criarLinha(nova.id, { clienteId: semDoc })).erro, (await B.criarLinha(nova.id, { clienteId: comDoc, nomeDoPc: " DESKTOP-ZZ ", canal: "MERCADO_LIVRE", data: R.lerDataIso("2026-11-02") })).ok], ["Escolha o cliente.", "O cliente precisa ter CPF ou CNPJ.", true]);
  let lida = await B.lerLicenca(nova.id);
  conferir("projecao: linha 1 com cliente, 'ainda nao ativou' (sem ativacao), nao lida", [lida.linhas.length, lida.linhas[0].cliente.nome, lida.linhas[0].nomeDoPc, lida.linhas[0].ativacao, lida.vagas.lida, lida.situacao.texto], [1, "ZZ LIC Com Documento", "DESKTOP-ZZ", null, false, "Não lida do portal"]);
  await B.encerrarLinha(lida.linhas[0].id);
  lida = await B.lerLicenca(nova.id);
  conferir("encerrar: sai das linhas, entra no historico; reabrir volta", [lida.linhas.length, lida.historico.length, lida.historico[0].situacao], [0, 1, "ENCERRADA"]);
  await B.reabrirLinha(lida.historico[0].id);
  conferir("reaberta", (await B.lerLicenca(nova.id)).linhas.length, 1);
  const lista = await B.listarLicencas({ softwareId: chaveId, busca: "com documento" });
  conferir("lista: busca pelo nome do cliente acha a chave", lista.linhas.map((l) => l.identificador), ["ZZ-LIC-AAAA-1"]);
  conferir("lista: busca pelos digitos do CPF", (await B.listarLicencas({ softwareId: chaveId, busca: "52998224725" })).total, 1);
  await B.editarLicenca(nova.id, { arquivada: true });
  conferir("arquivada some da lista e volta com mostrarArquivadas; linha nova recusada", [(await B.listarLicencas({ softwareId: chaveId })).total, (await B.listarLicencas({ softwareId: chaveId, mostrarArquivadas: true })).total, (await B.criarLinha(nova.id, { clienteId: comDoc })).erro], [0, 1, "Licença arquivada."]);
  conferir("licencas do cliente", (await B.licencasDoCliente(comDoc)).map((l) => [l.identificador, l.situacao]), [["ZZ-LIC-AAAA-1", "ATIVA"]]);
  conferir("o que sai com a licenca", await B.oQueSaiComALicenca(nova.id), { identificador: "ZZ-LIC-AAAA-1", linhas: 1, ativacoes: 0, arquivos: [] });
  conferir("excluir programa com licencas recusado", (await B.excluirSoftware(chaveId)).erro, "Este programa tem 1 licença(s).");
  conferir("excluir licenca", [(await B.excluirLicenca(nova.id)).ok, await B.lerLicenca(nova.id)], [true, null]);

  // Marcador: os blocos de banco seguintes entram acima desta linha.
} finally {
  if (!manter) await devolverConexao();
  if (!manter) await limpar();
  await prisma.$disconnect();
}

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);
