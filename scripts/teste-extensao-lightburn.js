/**
 * Testes da leitura da extensao "Rise LightBurn" (extensao-lightburn/leitura.js): as respostas da API do portal no
 * formato medido em 05/11/2026 (extensao-lightburn/MEDICAO.md; fixtures anonimizadas em scripts/fixtures/lightburn/)
 * viram o corpo que a extensao manda ao Rise. Puro: sem banco, sem rede, sem Chrome.
 *
 *   npm run teste:extensao-lightburn
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

// A leitura roda na pagina como script comum (sem export): carregada aqui num contexto proprio, como o Chrome faz.
const contexto = {};
contexto.globalThis = contexto;
vm.runInNewContext(readFileSync(new URL("../extensao-lightburn/leitura.js", import.meta.url), "utf8"), contexto);
const L = contexto.RiseLeituraLB;
const fixture = (nome) => JSON.parse(readFileSync(new URL(`./fixtures/lightburn/${nome}.json`, import.meta.url), "utf8"));
// Objetos criados no outro contexto: passam por JSON para comparar com os daqui.
const puro = (valor) => JSON.parse(JSON.stringify(valor));

const FIX_CHAVE_1 = "AAAAAA-BBBBBB-CCCCCC-DDDDDD-EEEEEE-FFFFFF";
const FIX_ID_1 = "lic-1";
const FIX_HOST_1 = "PC-TESTE-1";
const FIX_SO_1 = "windows 11.0";
const FIX_SYNC_1 = "2026-01-15T12:03:44.000Z";
const FIX_DATA_DO_PORTAL = "2025-10-06T17:58:20.256388Z";
const FIX_DATA_ISO = "2025-10-06T17:58:20.256Z";
// O portal nao diz Core nem Pro (MEDICAO.md): o tipo vai nulo e fica o que o dono digitou ou a planilha trouxe.
const FIX_TIPOS = [null, null, null, null];
const ANTES_DE_EXPIRAR = new Date("2026-01-01T00:00:00Z");

console.log("\nLicenca e ativacao");
const lic = puro(L.licencaDoPortal(fixture("licencas")[0], ANTES_DE_EXPIRAR));
conferir("licenca do portal -> payload", [lic.chave, lic.situacao, lic.ativacoesPermitidas, typeof lic.expiraEm, "email" in lic.dados], [FIX_CHAVE_1, "ACTIVE", 3, "string", false]);
conferir("licenca: id, criada, usadas, tipo nulo e o produto nos dados", [lic.idNoPortal, lic.criadaEm, lic.ativacoesUsadas, lic.tipo, lic.dados.productId, lic.dados.type], [FIX_ID_1, FIX_DATA_ISO, 2, null, "52742d92-d1a6-4830-8f69-a36e929741a2", "node-locked"]);
conferir("tipo Core/Pro pela regra medida", fixture("licencas").map((l) => L.tipoDoPortal(l)), FIX_TIPOS);
conferir(
  "situacao: revogada, suspensa, expirada, ativa",
  [L.situacaoDoPortal({ revoked: true }), L.situacaoDoPortal({ suspended: true }), L.situacaoDoPortal({ expiresAt: "2020-01-01T00:00:00Z" }), L.situacaoDoPortal({ expiresAt: "2099-01-01T00:00:00Z" })],
  ["REVOKED", "SUSPENDED", "EXPIRED", "ACTIVE"],
);
conferir("situacao das fixtures num dia fixo (revogada vence suspensa)", fixture("licencas").map((l) => L.situacaoDoPortal(l, ANTES_DE_EXPIRAR)), ["ACTIVE", "EXPIRED", "REVOKED", "SUSPENDED"]);
const at = puro(L.ativacaoDoPortal(fixture("ativacoes")[0]));
conferir("ativacao do portal -> payload", [at.hostname, at.so, at.ultimaSincronizacaoEm], [FIX_HOST_1, FIX_SO_1, FIX_SYNC_1]);
conferir("ativacao: a localizacao do PC nunca vai ao Rise", ["location" in at.dados, Object.keys(at).sort()], [false, ["criadaEm", "dados", "hostname", "idNoPortal", "leaseExpiraEm", "so", "ultimaSincronizacaoEm"]]);
conferir("datas", [L.dataIso(FIX_DATA_DO_PORTAL), L.dataIso(null), L.dataIso("lixo")], [FIX_DATA_ISO, null, null]);
conferir("limpar dados tira e-mail, nome e usuario", Object.keys(puro(L.limparDados({ type: "x", email: "a@b", name: "N", userId: "u", userName: "x", location: {} }))), ["type"]);

console.log("\nCorpo e resumo");
const corpo = puro(L.montarPayload({ licencas: fixture("licencas"), ativacoesPorLicenca: { [FIX_ID_1]: fixture("ativacoes") }, completa: true, versao: "1.0.0" }));
conferir("payload inteiro", [corpo.completa, corpo.licencas.length, corpo.licencas[0].ativacoes.length, Object.keys(corpo).sort()], [true, fixture("licencas").length, fixture("ativacoes").length, ["completa", "licencas", "lidoEm", "versao"]]);
conferir("agrupar as ativacoes da conta por licenca", Object.entries(puro(L.agruparAtivacoes(fixture("ativacoes")))).map(([id, lista]) => [id, lista.length]), [["lic-1", 2], ["lic-2", 1]]);
conferir("resumo", L.textoDoResumo({ licencas: 78, novas: 2, alteradas: 0, sumiram: 1, pcsSemCliente: 3 }), "78 chaves lidas · 2 novas · 1 PC sumiu · 3 PCs sem cliente (abra o Rise)");
conferir("endereco da API so da Cryptlex", [L.baseDaApi("https://api.cryptlex.com"), L.baseDaApi("https://api-eu.cryptlex.com/"), L.baseDaApi("https://evil.example.com"), L.baseDaApi(null)], ["https://api.cryptlex.com", "https://api-eu.cryptlex.com", "https://api.cryptlex.com", "https://api.cryptlex.com"]);

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);
