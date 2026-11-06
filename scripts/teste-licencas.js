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
// Importacao: leitura da planilha (puro, pelas fixtures de scripts/fixtures/licencas/)
// ---------------------------------------------------------------------------

console.log("\nImportacao: leitura da planilha");
const { readFileSync } = await import("node:fs");
const I = await import("../src/lib/ferramentas/licencas/importacao.js");
const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/licencas/${n}.json`, import.meta.url), "utf8"));
const FIX_GERAL_ENTRADAS = 12;
const FIX_LB_LICENCAS = 9;
const FIX_CHAVE_ARRASTAO = "AAAAAA-000000-000000-000000-000000-000002";
const FIX_CHAVE_TRIPLA = "AAAAAA-000000-000000-000000-000000-000003";
const FIX_CHAVE_ANTIGA = "AAAAAA-000000-000000-000000-000000-000004";
const FIX_CHAVE_ENCERRADA = "AAAAAA-000000-000000-000000-000000-000005";
const FIX_CHAVE_SETE = "AAAAAA-000000-000000-000000-000000-000007";
const FIX_CHAVE_MAQUINA = "BBBBBB-000000-000000-000000-000000-000002";
conferir("mescladas preenchidas para baixo", I.preencherMescladas([["K1", "a"], ["", "b"], ["K2", "c"]], ["A1:A2"]).map((l) => l[0]), ["K1", "K1", "K2"]);
conferir("celula", [I.valorDaCelula("#"), I.valorDaCelula("  "), I.valorDaCelula("USUARIO-PC\t\r")], [null, null, "USUARIO-PC"]);
conferir("datas", [I.lerDataDaPlanilha("29/10/2026").data, I.lerDataDaPlanilha("30/11/22").data, I.lerDataDaPlanilha("06/20"), I.lerDataDaPlanilha("#"), I.lerDataDaPlanilha("2023")], ["2026-10-29", "2022-11-30", { data: null, observacao: "Data na planilha: 06/20" }, { data: null, observacao: null }, { data: null, observacao: "Data na planilha: 2023" }]);
conferir("documento: CPF, CNPJ, 10 digitos ganha zero, invalido, ausente", [I.lerDocumentoDaPlanilha("CPF 52998224725").documento, I.lerDocumentoDaPlanilha("CNPJ 11222333000181").documento, I.lerDocumentoDaPlanilha("CPF 1234567890").documento, I.lerDocumentoDaPlanilha("CPF 00000000000").motivo, I.lerDocumentoDaPlanilha("#").motivo], ["529.982.247-25", "11.222.333/0001-81", "012.345.678-90", "CPF inválido na planilha: CPF 00000000000", "sem CPF na planilha"]);
conferir("documento com pontos no lugar do hifen", I.lerDocumentoDaPlanilha("CPF 529.982.247.25").documento, "529.982.247-25");
conferir("endereco no molde e fora dele", [I.lerEnderecoDaPlanilha("Rua das Violetas 124 124, Foz do Iguaçu - CEP: 85853540, Paraná"), I.lerEnderecoDaPlanilha("Rua Cisplatina, 126 - Vargem Grande Paulista - São Paulo - CP: 06740556").cidade], [{ logradouro: "Rua das Violetas 124 124", cidade: "Foz do Iguaçu", uf: "PR", cep: "85853-540" }, null]);
conferir("canal", [I.canalDaPlanilha("ML"), I.canalDaPlanilha("ML4H"), I.canalDaPlanilha("4H"), I.canalDaPlanilha("loja").canal, I.canalDaPlanilha("")], [{ canal: "MERCADO_LIVRE", observacao: null }, { canal: "MERCADO_LIVRE", observacao: "Canal na planilha: ML4H" }, { canal: "DIRETA", observacao: "Canal na planilha: 4H" }, "DIRETA", { canal: null, observacao: null }]);
conferir("situacao", ["Nao usa mais", "Não usa mais", "nao usa +", "Em uso", "Ajustado", ""].map(I.situacaoDaPlanilha), ["ENCERRADA", "ENCERRADA", "ENCERRADA", "ATIVA", "ATIVA", "ATIVA"]);
const geral = I.lerAbaGeral(I.preencherMescladas(fx("geral").linhas, fx("geral").mesclas));
conferir("aba geral: N entradas, chave herdada, linha so com # ignorada", [geral.length, geral[1].chave === geral[0].chave, geral.some((e) => e.nome === null && e.data === null)], [FIX_GERAL_ENTRADAS, true, false]);
const plano = I.montarPlano({ geral, maquinas: I.lerAbaMaquinas(fx("maquinas").linhas), mach3: I.lerAbaMach3(fx("mach3").linhas), arquivosMach3: [{ identificador: "Mach3 VD60", nomeOriginal: "Mach1Lic.dat", bytes: dat }, { identificador: "ALTAVE V53T", nomeOriginal: "Mach1Lic.dat", bytes: dat }] });
const doPlano = (identificador) => plano.licencas.find((l) => l.identificador === identificador);
conferir("plano: licencas por programa", [plano.licencas.filter((l) => l.software === "lightburn").length, plano.licencas.filter((l) => l.software === "mach3").length], [FIX_LB_LICENCAS, 2]);
conferir("plano: arrastao usa o primeiro CPF nas tres linhas", new Set(doPlano(FIX_CHAVE_ARRASTAO).linhas.map((x) => x.cliente.documento)).size, 1);
conferir("plano: linhas identicas entram todas; sem CPF vira nomeAnotado", [doPlano(FIX_CHAVE_TRIPLA).linhas.length, doPlano(FIX_CHAVE_ANTIGA).linhas[0]], [3, { ordem: 1, cliente: null, nomeAnotado: "Fulano Antigo", data: "2020-03-01", canal: "DIRETA", nomeDoPc: "DESKTOP-TESTE1", equipamento: "01Cuia /01plana", observacoes: "Canal na planilha: 4H; sem CPF na planilha", situacao: "ATIVA" }]);
conferir("plano: aba das maquinas (renovada dia, loja, pedido bling)", doPlano(FIX_CHAVE_MAQUINA).renovadaEm, "2022-11-30");
conferir("plano: pasta sem planilha vira nomeAnotado", doPlano("ALTAVE V53T").linhas[0].nomeAnotado, "ALTAVE");
const k1 = doPlano("AAAAAA-000000-000000-000000-000000-000001");
conferir("plano: tipo, renovacao mesclada, nome do PC limpo, observacao da coluna M, status puro fora da observacao", [k1.tipo, k1.renovadaEm, k1.linhas[1].nomeDoPc, k1.linhas[0].observacoes, k1.linhas[1].observacoes, k1.linhas[0].cliente.documento], ["Pro", "2026-12-01", "USUARIO-PC", "Licença do fulano expirou. Peguei essa.", null, "11.222.333/0001-81"]);
conferir("plano: canal mesclado leva a observacao a todas as linhas; 'Ajustado' fica", doPlano(FIX_CHAVE_ARRASTAO).linhas.map((x) => x.observacoes), ["Canal na planilha: ML4H", "Canal na planilha: ML4H; Ajustado", "Canal na planilha: ML4H"]);
const encerrada = doPlano(FIX_CHAVE_ENCERRADA).linhas[0];
conferir("plano: 06/20 sem data, 10 digitos, endereco fora do molde, 'Nao usa mais' encerra", [encerrada.data, encerrada.cliente.documento, encerrada.cliente.endereco.cidade, encerrada.situacao, encerrada.observacoes], [null, "012.345.678-90", null, "ENCERRADA", "Data na planilha: 06/20; Canal na planilha: Loja"]);
conferir("plano: CPF invalido vira nomeAnotado com o motivo; 'nao usa +' encerra", doPlano(FIX_CHAVE_SETE).linhas.map((x) => [x.nomeAnotado, x.cliente?.documento ?? null, x.situacao, x.observacoes]), [["Pessoa Sete", null, "ENCERRADA", "Data na planilha: 2023; Canal na planilha: Direta; CPF inválido na planilha: CPF 00000000000"], [null, "529.982.247-25", "ENCERRADA", "Canal na planilha: Direta"]]);
conferir("plano: aba antiga sem documento e com a renovacao na Loja", [doPlano("BBBBBB-000000-000000-000000-000000-000001").linhas[0].observacoes, doPlano(FIX_CHAVE_MAQUINA).linhas[0].observacoes, doPlano(FIX_CHAVE_MAQUINA).linhas[0].equipamento, doPlano("BBBBBB-000000-000000-000000-000000-000003").linhas[0].canal], ["Data na planilha: 06/20; sem CPF na planilha", "Renovada dia 30/11/22", "Cuia", "DIRETA"]);
conferir("plano: Mach3 com arquivo e linha da planilha; sem pasta vira aviso", [doPlano("Mach3 VD60").arquivo.nomeOriginal, doPlano("Mach3 VD60").linhas[0].cliente.documento, plano.avisos], ["Mach1Lic.dat", "529.982.247-25", ["Mach3: \"Mach3 SEMPASTA\" está na planilha e não tem pasta nem zip."]]);
conferir("nome anotado da pasta", [I.nomeAnotadoDaPasta("ALTAVE V53T"), I.nomeAnotadoDaPasta("ASSOCIACAO SAO BENTO DE ENSINO/Mach3 2FHX"), I.nomeAnotadoDaPasta("Olessandro Teste Silva 2QRZ")], ["ALTAVE", "ASSOCIACAO SAO BENTO DE ENSINO", "Olessandro Teste Silva"]);

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

const { prisma } = await import("../src/lib/db.js");
const inicioDoTeste = new Date();

/** Apaga so o que o teste cria. Arquivos antes das licencas e licencas antes dos programas: os dois sao Restrict. */
async function limpar() {
  await prisma.logIntegracao.deleteMany({ where: { servico: "LIGHTBURN", criadoEm: { gte: inicioDoTeste } } });
  await prisma.leituraDoPortal.deleteMany({ where: { software: { slug: { startsWith: "zz-lic-" } } } });
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

  console.log("\nBanco: arquivo da licenca");
  const chaveLicId = (await B.criarLicenca({ softwareId: chaveId, identificador: "ZZ-LIC-CHAVE-X" })).id;
  const m1 = await B.criarLicenca({ softwareId: arquivoId, identificador: "ZZ-LIC-M1", arquivo: { nome: "Mach1Lic.dat", bytes: dat }, enviadoPor: "teste" });
  let lic = await B.lerLicenca(m1.id);
  conferir("arquivo v1 atual, 201 B, sha", [lic.arquivos.length, lic.arquivoAtual.versao, lic.arquivoAtual.tamanhoBytes, lic.arquivoAtual.sha256 === A.sha256Hex(dat)], [1, 1, 201, true]);
  conferir("mesmo conteudo de novo: recusado", (await B.enviarArquivo(m1.id, { nome: "Mach1Lic.dat", bytes: dat })).erro, "Este arquivo já é a versão atual (mesmo conteúdo).");
  const dat2 = Buffer.concat([dat, Buffer.from("2")]);
  conferir("v2 pelo zip", (await B.enviarArquivo(m1.id, { nome: "x.zip", bytes: A.montarZipDoArquivo({ identificador: "ZZ-LIC-M1", nomeOriginal: "Mach1Lic.dat", bytes: dat2 }).bytes })).versao, 2);
  lic = await B.lerLicenca(m1.id);
  conferir("duas versoes, so a 2 atual, a 1 continua", [lic.arquivos.map((a) => [a.versao, a.atual]).sort((a, b) => a[0] - b[0]), lic.arquivoAtual.tamanhoBytes], [[[1, false], [2, true]], 202]);
  conferir("duas versoes ao mesmo tempo: uma vira 3 e a outra 4", (await Promise.all([B.enviarArquivo(m1.id, { nome: "a.dat", bytes: Buffer.from("v3") }), B.enviarArquivo(m1.id, { nome: "a.dat", bytes: Buffer.from("v4") })])).map((r) => r.versao).sort(), [3, 4]);
  conferir("depois da corrida, uma so versao atual", await prisma.arquivoDeLicenca.count({ where: { licencaId: m1.id, atual: true } }), 1);
  conferir("baixar: atual e versao 1", [(await B.lerArquivoParaBaixar(m1.id)).bytes.length, (await B.lerArquivoParaBaixar(m1.id, 1)).bytes.equals(dat)], [2, true]);
  await prisma.arquivoDeLicenca.updateMany({ where: { licencaId: m1.id, versao: 1 }, data: { sha256: "0".repeat(64) } });
  conferir("soma que nao confere: recusa", (await B.lerArquivoParaBaixar(m1.id, 1)).erro, "Soma de verificação não confere: avise antes de entregar.");
  conferir("versao que nao existe e licenca sem arquivo", [(await B.lerArquivoParaBaixar(m1.id, 9)).ok, (await B.lerArquivoParaBaixar(chaveLicId)).ok], [false, false]);
  conferir("programa CHAVE nao recebe arquivo", (await B.enviarArquivo(chaveLicId, { nome: "a.dat", bytes: dat })).erro, "Este programa não usa arquivo de licença.");
  conferir("excluir licenca com arquivos: o popup lista as versoes e a exclusao leva tudo", [(await B.oQueSaiComALicenca(m1.id)).arquivos.length, (await B.excluirLicenca(m1.id)).ok, await prisma.arquivoDeLicenca.count({ where: { licencaId: m1.id } })], [4, true, 0]);
  const pdf = Buffer.from("%PDF-1.4 instrucoes de teste");
  conferir("PDF de instrucoes: grava e le", [(await B.salvarSoftware(arquivoId, { instrucoes: { nome: "Instruções Mach3.pdf", bytes: pdf, tipo: "application/pdf" } })).ok, (await B.lerInstrucoes(arquivoId))?.nome, (await B.lerInstrucoes(arquivoId))?.bytes.equals(pdf), await B.lerInstrucoes(chaveId)], [true, "Instruções Mach3.pdf", true, null]);

  console.log("\nLeitura do portal");
  const P = await import("../src/lib/ferramentas/licencas/portal.js");
  const E = await import("../src/lib/ferramentas/licencas/esquema.js");
  const K = await import("../src/lib/ferramentas/licencas/chave.js");
  const p1Id = (await B.criarLicenca({ softwareId: chaveId, identificador: "ZZ-LIC-P1", tipo: "Core", renovadaEm: R.lerDataIso("2026-10-01"), observacoes: "digitado" })).id;
  await B.criarLinha(p1Id, { clienteId: comDoc, nomeDoPc: "desktop-zz" });
  /** O corpo que a extensao manda: P1 (com DESKTOP-ZZ e PC-2) e P2 sem PC, no programa de teste. */
  function payload(opcoes = {}) {
    const pcs = [{ idNoPortal: "pc-1", hostname: "DESKTOP-ZZ", so: "windows 11.0", criadaEm: "2026-10-01T10:00:00.000Z", ultimaSincronizacaoEm: "2026-11-01T10:00:00.000Z", leaseExpiraEm: null, dados: {} }];
    if (!opcoes.semPc2) pcs.push({ idNoPortal: "pc-2", hostname: "PC-2", so: "windows 10.0", criadaEm: "2026-10-02T10:00:00.000Z", ultimaSincronizacaoEm: "2026-10-20T10:00:00.000Z", leaseExpiraEm: null, dados: {} });
    const licencas = [{ idNoPortal: "lic-p1", chave: opcoes.chaveP1 ?? "ZZ-LIC-P1", situacao: "ACTIVE", expiraEm: "2027-01-01T00:00:00.000Z", criadaEm: "2026-01-01T00:00:00.000Z", ativacoesUsadas: pcs.length, ativacoesPermitidas: 3, ...(opcoes.semTipo ? {} : { tipo: "Pro" }), dados: { type: "node-locked" }, ativacoes: pcs }];
    if (!opcoes.semP2) licencas.push({ idNoPortal: "lic-p2", chave: "ZZ-LIC-P2", situacao: "ACTIVE", expiraEm: "2027-02-01T00:00:00.000Z", criadaEm: "2026-02-01T00:00:00.000Z", ativacoesUsadas: 0, ativacoesPermitidas: 3, dados: {}, ativacoes: [] });
    return { softwareSlug: "zz-lic-chave", versao: "1.0.0", lidoEm: new Date().toISOString(), completa: opcoes.completa ?? true, licencas };
  }
  conferir("esquema: chave curta e hostname vazio recusados; chave desconhecida descartada", [E.lerCorpoDaLeitura({ ...payload(), licencas: [{ ...payload().licencas[0], chave: "AB" }] }).erro?.startsWith("licencas.0.chave"), E.lerCorpoDaLeitura({ ...payload(), licencas: [{ ...payload().licencas[0], ativacoes: [{ hostname: "" }] }] }).ok, "email" in (E.lerCorpoDaLeitura({ ...payload(), email: "x" }).dados ?? {})], [true, false, false]);
  conferir("esquema: data do portal com microssegundos aceita", E.lerCorpoDaLeitura({ ...payload(), licencas: [{ ...payload().licencas[0], expiraEm: "2025-10-06T17:58:20.256388Z" }] }).ok, true);
  const r1 = await P.aplicarLeituraDoPortal({ ...payload({ chaveP1: " zz-lic-p1 " }), registrar: false });
  conferir("1a leitura: P1 casa com a existente (outra caixa), P2 nasce do portal", [r1.resumo.licencas, r1.resumo.novas, (await B.lerLicenca(p1Id)).origem, (await prisma.licenca.findFirst({ where: { identificador: "ZZ-LIC-P2" } }))?.origem], [2, 1, "manual", "portal"]);
  let p1 = await B.lerLicenca(p1Id);
  conferir("P1: portal gravado, tipo do portal venceu, digitado intacto, PC casou com a linha, 1 PC sem cliente, 1 livre", [p1.portalSituacao, p1.tipo, p1.observacoes, p1.renovadaEm?.toISOString().slice(0, 10), p1.linhas[0].ativacao?.hostname, p1.pcsSemCliente.map((a) => a.hostname), p1.vagas], ["ACTIVE", "Pro", "digitado", "2026-10-01", "DESKTOP-ZZ", ["PC-2"], { permitidas: 3, usadas: 2, livres: 1, lida: true }]);
  const r2 = await P.aplicarLeituraDoPortal({ ...payload({ semPc2: true, completa: false }), registrar: false });
  conferir("leitura incompleta: atualiza, nao marca sumido", [r2.resumo.sumiram, (await B.lerLicenca(p1Id)).vagas.usadas], [0, 2]);
  const r3 = await P.aplicarLeituraDoPortal({ ...payload({ semPc2: true, semP2: true }), registrar: false });
  p1 = await B.lerLicenca(p1Id);
  conferir("leitura completa: PC-2 sumiu (nao conta, fica no banco), P2 sumiu do portal, 'alteradas' conta P1", [r3.resumo.sumiram, p1.vagas.usadas, await prisma.ativacaoDeLicenca.count({ where: { licencaId: p1Id } }), (await prisma.licenca.findFirst({ where: { identificador: "ZZ-LIC-P2" } })).portalSumiuEm !== null, r3.resumo.alteradas >= 1], [1, 1, 2, true, true]);
  await P.aplicarLeituraDoPortal({ ...payload(), registrar: false });
  conferir("reaparecer limpa sumiuEm e portalSumiuEm", [(await B.lerLicenca(p1Id)).vagas.usadas, (await prisma.licenca.findFirst({ where: { identificador: "ZZ-LIC-P2" } })).portalSumiuEm], [2, null]);
  conferir("a leitura nunca toca linhas nem renovadaEm", [(await B.lerLicenca(p1Id)).linhas.length, (await B.lerLicenca(p1Id)).renovadaEm?.toISOString().slice(0, 10)], [1, "2026-10-01"]);
  await P.aplicarLeituraDoPortal({ ...payload({ semTipo: true }), registrar: false });
  conferir("tipo ausente no payload nao apaga o gravado", (await B.lerLicenca(p1Id)).tipo, "Pro");
  conferir("a licenca sem portal (CHAVE-X) nao e marcada como sumida", (await prisma.licenca.findFirst({ where: { identificador: "ZZ-LIC-CHAVE-X" } })).portalSumiuEm, null);
  conferir("tipos do programa (sugestoes da janela)", await B.tiposDoPrograma(chaveId), ["Pro"]);
  const { chave } = await K.gerarChaveDaExtensao();
  const req = (auth) => new Request("https://x/api", { headers: auth ? { authorization: auth } : {} });
  conferir("chave: prefixo, confere, recusa", [chave.startsWith("rise_lb_"), (await K.conferirChaveDaExtensao(req(`Bearer ${chave}`))).ok, (await K.conferirChaveDaExtensao(req("Bearer rise_lb_errada"))).status, (await K.conferirChaveDaExtensao(req(null))).status], [true, true, 401, 401]);
  conferir("estado da leitura", typeof (await P.estadoDaLeitura()).licencasNoRise, "number");

  console.log("\nAba do cliente e cartao");
  conferir("licencas do cliente para a aba trazem a P1", (await B.licencasDoCliente(comDoc)).some((l) => l.software.slug === "zz-lic-chave" && l.identificador === "ZZ-LIC-P1"), true);
  conferir("estado da chave LIGHTBURN e ultima leitura", [(await K.estadoDaChave()).configurada, (await B.listarLeituras(chaveId, 1)).length], [true, 1]);
  const { ultimaLeituraDoPortal } = await import("../src/lib/ferramentas/licencas/portal.js");
  conferir("ultima leitura para o cartao de Integracoes", Object.keys((await ultimaLeituraDoPortal("zz-lic-chave")) ?? {}), ["lidaEm", "completa", "resumo"]);

  console.log("\nImportacao: aplicar e idempotencia");
  const linhaZZ = (ordem, extra) => ({ ordem, cliente: null, nomeAnotado: null, data: "2026-11-01", canal: "MERCADO_LIVRE", nomeDoPc: `PC-ZZ-${ordem}`, equipamento: null, observacoes: null, situacao: "ATIVA", ...extra });
  const enderecoFoz = I.lerEnderecoDaPlanilha("Rua das Violetas 124 124, Foz do Iguaçu - CEP: 85853540, Paraná");
  const clienteCriado = { nome: "ZZ LIC Criado", documento: "012.345.678-90", telefone: "(46) 98201-0550", email: "zz-lic-criado@teste.com", endereco: enderecoFoz };
  const montarPlanoZZ = (bytesM2 = Buffer.from("outro arquivo zz")) => ({
    avisos: [],
    licencas: [
      {
        software: "zz-lic-chave", identificador: "zz-lic-imp-1", tipo: "Pro", renovadaEm: "2026-10-15", observacoes: null, arquivo: null,
        linhas: [
          linhaZZ(1, { cliente: { nome: "ZZ LIC Outro Nome", documento: "529.982.247-25", telefone: "(11) 912345678", email: null, endereco: null } }),
          linhaZZ(2, { cliente: clienteCriado }),
          linhaZZ(3, { nomeAnotado: "ZZ LIC Sem CPF", observacoes: "Canal na planilha: 4H; sem CPF na planilha" }),
        ],
      },
      { software: "zz-lic-arquivo", identificador: "ZZ-LIC-IMP-M1", tipo: null, renovadaEm: null, observacoes: null, arquivo: { nomeOriginal: "Mach1Lic.dat", bytes: dat }, linhas: [linhaZZ(1, { cliente: clienteCriado, canal: "DIRETA" })] },
      { software: "zz-lic-arquivo", identificador: "ZZ-LIC-IMP-M2", tipo: null, renovadaEm: null, observacoes: null, arquivo: { nomeOriginal: "Mach1Lic.dat", bytes: bytesM2 }, linhas: [linhaZZ(1, { nomeAnotado: "ZZ LIC Pasta", observacoes: "sem CPF na planilha" })] },
    ],
  });
  const planoZZ = montarPlanoZZ();
  const ri1 = await B.aplicarPlanoDeImportacao(planoZZ);
  conferir("aplicar: cria licencas, linhas, clientes; existente ligado sem mexer", [ri1.licencas.novas, ri1.linhas.novas, ri1.clientes.criados, ri1.clientes.ligados, ri1.semCliente.length, ri1.arquivos.novos], [3, 5, 1, 1, 2, 2]);
  conferir("sem cliente com o motivo", ri1.semCliente, [{ identificador: "ZZ-LIC-IMP-1", nome: "ZZ LIC Sem CPF", motivo: "sem CPF na planilha" }, { identificador: "ZZ-LIC-IMP-M2", nome: "ZZ LIC Pasta", motivo: "sem CPF na planilha" }]);
  conferir("cliente criado com endereco e telefone so digitos", await prisma.cliente.findUnique({ where: { documento: "012.345.678-90" }, select: { telefone: true, enderecos: { select: { tipo: true, uf: true, cep: true } } } }), { telefone: "46982010550", enderecos: [{ tipo: "GERAL", uf: "PR", cep: "85853-540" }] });
  conferir("cliente existente: nome e telefone intactos", await prisma.cliente.findUnique({ where: { id: comDoc }, select: { nome: true, telefone: true } }), { nome: "ZZ LIC Com Documento", telefone: null });
  const imp1 = await prisma.licenca.findFirst({ where: { identificador: "ZZ-LIC-IMP-1" }, select: { id: true, origem: true, tipo: true, renovadaEm: true } });
  conferir("licenca da planilha: chave normalizada, origem, tipo e renovacao", [imp1.origem, imp1.tipo, imp1.renovadaEm.toISOString().slice(0, 10)], ["planilha", "Pro", "2026-10-15"]);
  const ri2 = await B.aplicarPlanoDeImportacao(planoZZ);
  conferir("idempotente: segunda vez nao cria nada", [ri2.licencas.novas, ri2.linhas.novas, ri2.clientes.criados, ri2.arquivos.novos], [0, 0, 0, 0]);
  await B.editarLicenca(imp1.id, { tipo: "Core" });
  const m2 = await prisma.licenca.findFirst({ where: { identificador: "ZZ-LIC-IMP-M2" }, select: { id: true } });
  const ri3 = await B.aplicarPlanoDeImportacao(montarPlanoZZ(Buffer.from("arquivo novo da planilha")));
  conferir("de novo com outro arquivo: tipo digitado fica, arquivo entra como versao nova sem tirar a atual", [(await B.lerLicenca(imp1.id)).tipo, ri3.arquivos.novos, (await B.lerLicenca(m2.id)).arquivos.map((a) => [a.versao, a.atual])], ["Core", 1, [[2, false], [1, true]]]);
  const planoZZ2 = { avisos: [], licencas: [{ software: "zz-lic-chave", identificador: "ZZ-LIC-SIM", tipo: null, renovadaEm: null, observacoes: null, arquivo: null, linhas: [linhaZZ(1, { cliente: { nome: "ZZ LIC Simulado", documento: "529.982.247-25", telefone: null, email: null, endereco: null } })] }] };
  conferir("simular nao grava", [(await B.aplicarPlanoDeImportacao(planoZZ2, { simular: true })).licencas.novas, await prisma.licenca.count({ where: { identificador: "ZZ-LIC-SIM" } })], [1, 0]);
  conferir("programa que nao existe vira aviso", (await B.aplicarPlanoDeImportacao({ avisos: [], licencas: [{ ...planoZZ2.licencas[0], software: "zz-lic-nao-existe" }] }, { simular: true })).avisos, ['Programa "zz-lic-nao-existe" não existe no Rise: ZZ-LIC-SIM ficou de fora.']);

  // Marcador: os blocos de banco seguintes entram acima desta linha.
} finally {
  if (!manter) await devolverConexao();
  if (!manter) await limpar();
  await prisma.$disconnect();
}

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);
