/**
 * Testa o filtro de rede publica (src/lib/redePublica.js) e a parte dele que mora no cliente HTTP da coleta
 * (`lookup` e `validar` do `obter`). SEM internet e SEM banco: os "sites" sao servidores nesta maquina.
 *
 *   npm run teste:rede
 *
 * O que se prova: um endereco que vem de texto de terceiro nao leva o servidor a falar com a rede interna,
 * nem por nome que resolve para IP interno, nem por redirecionamento para um IP escrito.
 */

import "dotenv/config";
import http from "node:http";

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { ErroDeRecusa, enderecoPublico, ipPublico, lookupPublico, validarEnderecoPublico } = await import("../src/lib/redePublica.js");
const { obter } = await import("../src/lib/coleta/http.js");
// As duas libs que usam o filtro (importam o cliente do banco, mas nenhuma consulta e feita aqui).
const { bytesDe } = await import("../src/lib/imagensImportadas.js");
const { baixarDocumento } = await import("../src/lib/documentosReferencias.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}`);
  if (!ok) console.log(`       obtido:   ${JSON.stringify(obtido)}\n       esperado: ${JSON.stringify(esperado)}`);
}

async function recusa(fazer) {
  try {
    await fazer();
    return "aceitou";
  } catch (erro) {
    return erro instanceof ErroDeRecusa ? "ErroDeRecusa" : `outro erro: ${erro.message}`;
  }
}

// ---------------------------------------------------------------- ipPublico
const publicos = [
  "8.8.8.8", "1.1.1.1", "200.147.67.142", "100.63.255.255", "100.128.0.1", "172.15.0.1", "172.32.0.1",
  "2606:4700:4700::1111", "2a00:1450:4001:80b::200e", "2804:14d:1::1", "3000::1",
];
const internos = [
  "0.0.0.0", "10.0.0.5", "127.0.0.1", "127.255.255.254", "169.254.169.254", "172.16.0.1", "172.18.0.2", "172.31.255.255",
  "192.168.1.1", "100.64.0.1", "100.127.255.255", "224.0.0.1", "255.255.255.255",
  // IPv6: o que nao e unicast global (2000::/3) e o que dentro dele nao e a internet.
  "::1", "::", "fe80::1", "fe90::1", "febf::1", "fec0::1", "fc00::1", "fd12:3456::1", "ff02::1", "ff0e::1",
  "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::7f00:1", "2001:db8::1", "2001::1", "2002:7f00:1::1", "3fff::1",
];
conferir("ipPublico: enderecos da internet passam", publicos.map(ipPublico), publicos.map(() => true));
conferir("ipPublico: rede interna, loopback, link-local, CGNAT e multicast nao passam", internos.map(ipPublico), internos.map(() => false));

// ---------------------------------------------------------------- enderecoPublico
conferir("enderecoPublico: https comum", enderecoPublico("https://loja.com.br/doc.pdf").hostname, "loja.com.br");
conferir("enderecoPublico: http comum", enderecoPublico("http://cdn.loja.com.br/foto.jpg").protocol, "http:");
const recusados = [
  "ftp://loja.com/a.pdf", "file:///etc/passwd", "javascript:alert(1)", "nao e url", "",
  "http://localhost/x", "http://localhost:3000/x", "http://127.0.0.1:3000/x", "http://[::1]/x", "http://10.0.0.1/x",
  "http://servidor.local/x", "http://servico.internal/x", "http://x.localhost/x", "http://x.test/x",
  "https://loja.com:8443/x", "https://usuario:senha@loja.com/x", "http://169.254.169.254/latest/meta-data",
  // O ponto final e o mesmo nome para o DNS: nao escapa das regras de nome interno.
  "http://localhost./x", "http://LOCALHOST../x", "http://metadata.internal./x", "http://impressora.local./x",
];
conferir("enderecoPublico: so http(s) sem usuario, sem porta, sem IP escrito e sem nome interno", await Promise.all(recusados.map((e) => recusa(() => enderecoPublico(e)))), recusados.map(() => "ErroDeRecusa"));

// A foto aceita porta propria; o resto da regra (nome interno, IP escrito) vale igual.
conferir("enderecoPublico com permitirPorta: foto de loja em porta propria passa", enderecoPublico("http://loja.com.br:8080/a.jpg", { permitirPorta: true }).port, "8080");
const recusadosComPorta = ["http://localhost:3000/x", "http://127.0.0.1:3000/x", "http://[::1]:3000/x", "http://localhost.:80/x", "http://10.0.0.1:8080/x"];
conferir(
  "enderecoPublico com permitirPorta: nome interno e IP escrito continuam recusados",
  await Promise.all(recusadosComPorta.map((e) => recusa(() => enderecoPublico(e, { permitirPorta: true })))),
  recusadosComPorta.map(() => "ErroDeRecusa"),
);

// ---------------------------------------------------------------- lookupPublico (o nome que resolve para IP interno)
const resolver = (nome, opcoes) => new Promise((resolve) => lookupPublico(nome, opcoes, (erro, a, b) => resolve({ erro, a, b })));
const ehLocal = await resolver("localhost", {});
conferir("lookupPublico: 'localhost' resolve para IP interno e e recusado", ehLocal.erro instanceof ErroDeRecusa, true);
const ehLocalTodos = await resolver("localhost", { all: true });
conferir("lookupPublico: o mesmo com all:true (como o Node chama)", ehLocalTodos.erro instanceof ErroDeRecusa, true);
const inexistente = await resolver("este-nome-nao-existe.invalid", {});
conferir("lookupPublico: nome que nao resolve devolve o erro do DNS, nao uma recusa", [inexistente.erro instanceof Error, inexistente.erro instanceof ErroDeRecusa], [true, false]);

// ---------------------------------------------------------------- obter: lookup e validar, com "sites" locais
function servidor(tratar) {
  const dados = { acessos: 0, porta: 0, servidor: null };
  dados.servidor = http.createServer((req, res) => {
    dados.acessos++;
    tratar(req, res, dados);
  });
  return new Promise((resolve) => dados.servidor.listen(0, "127.0.0.1", () => resolve(Object.assign(dados, { porta: dados.servidor.address().port }))));
}
const fechar = (s) => new Promise((resolve) => s.servidor.close(resolve));

const alvo = await servidor((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("segredo interno");
});

// 1. O nome resolve para 127.0.0.1: com o lookup publico a conexao NEM ABRE (o servidor nao ve acesso nenhum).
const porNome = await recusa(() => obter(`http://localhost:${alvo.porta}/`, { lookup: lookupPublico }));
conferir("obter + lookupPublico: nome que resolve para IP interno e recusado", porNome, "ErroDeRecusa");
conferir("obter + lookupPublico: o servidor interno nao recebeu conexao", alvo.acessos, 0);

// 2. Sem o lookup, o mesmo pedido vai (prova que o teste anterior mede o lookup, e nao outra coisa).
const semFiltro = await obter(`http://localhost:${alvo.porta}/`, { tetoDoCorpo: () => 1000 });
conferir("obter sem lookup: o pedido chega ao servidor local", [semFiltro.status, semFiltro.bytes?.toString(), alvo.acessos], [200, "segredo interno", 1]);

// 3. O lookup recebido e o que a conexao usa: um nome inventado, resolvido pela nossa funcao, abre em 127.0.0.1.
const pinado = await obter(`http://nome-inventado.exemplo:${alvo.porta}/`, {
  lookup: (_nome, opcoes, retorno) => (opcoes?.all ? retorno(null, [{ address: "127.0.0.1", family: 4 }]) : retorno(null, "127.0.0.1", 4)),
  tetoDoCorpo: () => 1000,
});
conferir("obter: o `lookup` informado decide o IP da conexao", [pinado.status, pinado.bytes?.toString()], [200, "segredo interno"]);

// 4. Redirecionamento para um IP escrito: o lookup nao e chamado para IP escrito, so o `validar` o barra.
const redireciona = await servidor((_req, res) => {
  res.writeHead(302, { Location: `http://127.0.0.1:${alvo.porta}/` });
  res.end();
});
const acessosAntes = alvo.acessos;
const validaSalto = (url) => {
  if (url.hostname === "127.0.0.1") throw new ErroDeRecusa("destino interno");
};
const noSalto = await recusa(() => obter(`http://localhost:${redireciona.porta}/`, { validar: validaSalto, tetoDoCorpo: () => 1000 }));
conferir("obter + validar: redirecionamento para IP interno e recusado no salto", noSalto, "ErroDeRecusa");
conferir("obter + validar: o primeiro servidor foi visitado e o destino interno nao", [redireciona.acessos, alvo.acessos - acessosAntes], [1, 0]);

// 5. A mesma recusa vale no primeiro pedido.
const noPrimeiro = await recusa(() => obter(`http://localhost:${alvo.porta}/`, { validar: validarEnderecoPublico }));
conferir("obter + validarEnderecoPublico: localhost com porta recusado antes de sair", [noPrimeiro, alvo.acessos], ["ErroDeRecusa", 2]);

// 6. HEAD sem seguir: so os cabecalhos, e o 30x volta como veio.
const comLocalizacao = await servidor((req, res) => {
  res.writeHead(302, { Location: "/outro", "X-Metodo": req.method });
  res.end();
});
const cabecalhos = await obter(`http://127.0.0.1:${comLocalizacao.porta}/`, { metodo: "HEAD", seguir: false });
conferir("obter HEAD sem seguir: devolve o 30x, a localizacao e o metodo usado", [cabecalhos.status, cabecalhos.localizacao, cabecalhos.cabecalhos["x-metodo"]], [302, "/outro", "HEAD"]);

// 7. Corpo maior que o teto: lido ate o teto e marcado como truncado (e o que as libs usam para recusar).
const grande = await servidor((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/octet-stream" });
  res.end(Buffer.alloc(5000, 1));
});
const lido = await obter(`http://127.0.0.1:${grande.porta}/`, { tetoDoCorpo: () => 1001 });
conferir("obter: corpo acima do teto vem truncado em teto bytes", [lido.bytes?.length, lido.truncado], [1001, true]);

// 8. A LIGACAO do filtro nas libs que buscam endereco de terceiro (a prova de que ele esta ligado, e nao so de que
// as pecas funcionam). "localhost." passa pela primeira camada (nome comum) e so o lookup da conexao o barra; o
// servidor local `alvo` nao pode receber nenhum acesso.
const acessosDoAlvo = alvo.acessos;
const foto = await recusa(() => bytesDe({ tipo: "endereco", endereco: `http://localhost.:${alvo.porta}/foto.jpg` }));
conferir("bytesDe: foto em nome que resolve para IP interno (com porta) e recusada pela conexao", [foto, alvo.acessos - acessosDoAlvo], ["ErroDeRecusa", 0]);
const fotoIp = await recusa(() => bytesDe({ tipo: "endereco", endereco: `http://127.0.0.1:${alvo.porta}/foto.jpg` }));
conferir("bytesDe: foto em IP escrito e recusada antes de sair", [fotoIp, alvo.acessos - acessosDoAlvo], ["ErroDeRecusa", 0]);
const documento = await recusa(() => baixarDocumento({ url: "http://localhost./arquivo.pdf", titulo: "Datasheet" }));
conferir("baixarDocumento: nome que resolve para IP interno e recusado pela conexao", documento, "ErroDeRecusa");
const documentoComPorta = await recusa(() => baixarDocumento({ url: `http://localhost.:${alvo.porta}/arquivo.pdf`, titulo: "Datasheet" }));
conferir("baixarDocumento: documento com porta e recusado, e o servidor local nao recebe acesso", [documentoComPorta, alvo.acessos - acessosDoAlvo], ["ErroDeRecusa", 0]);

for (const s of [alvo, redireciona, comLocalizacao, grande]) await fechar(s);

console.log(falhas === 0 ? "\nTODOS OS TESTES PASSARAM" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
