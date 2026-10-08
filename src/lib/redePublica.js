import { lookup as resolverNome } from "node:dns";
import { isIP } from "node:net";

/**
 * O que o SERVIDOR pode buscar sozinho na internet a pedido de um texto que veio de fora: o documento de uma
 * referencia e as fotos dos produtos coletados de concorrente. O endereco vem de pagina de terceiro, e sem
 * filtro o servidor da VPS buscaria `http://app:3000/...`, `http://auth:3000/...` ou um IP da rede interna.
 *
 * Sem imports do projeto: e lido pelas libs, pelo cliente HTTP da coleta e pelo `teste-rede-publica.js`.
 *
 * Por que `lookupPublico` e nao so conferir o IP antes: conferir com um `lookup()` e deixar o `fetch` resolver o
 * nome DE NOVO deixa uma janela (DNS com TTL zero responde IP publico na conferencia e `127.0.0.1` na conexao).
 * Passado como `lookup` do `http.request`, o IP conferido e o IP em que a conexao abre: e a mesma resposta.
 */

/// Recusa que o operador pode ler: a rota devolve a mensagem. Qualquer outro erro e falha nossa ou da rede, e
/// a rota diz so "nao foi possivel", sem repetir texto de excecao (nome de host, mensagem do Prisma).
export class ErroDeRecusa extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroDeRecusa";
  }
}

/// Endereco http(s) que vale buscar: sem usuario, sem IP escrito e sem nome interno, e SEM porta, salvo com
/// `permitirPorta` (foto de loja em porta propria: o filtro de IP da conexao ja barra a rede interna, e a regra da
/// porta existe para o documento). IP escrito nao passa por `lookup` (o Node o usa direto), entao so a recusa aqui
/// o barra.
export function enderecoPublico(valor, { permitirPorta = false } = {}) {
  let url;
  try {
    url = new URL(valor);
  } catch {
    throw new ErroDeRecusa("Endereço inválido.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new ErroDeRecusa("Endereço inválido.");
  }
  // O `URL` devolve o host de IPv6 COM colchetes ("[::1]"), e o `isIP` so reconhece sem eles: sem tirar, o
  // endereco `http://[::1]/` passava, e como IP escrito ele nao passa pelo `lookup` (achado pelo teste, 08/10/2026).
  // O ponto FINAL ("localhost.", "x.internal.") e o mesmo nome para o DNS e escapava das regras de nome interno.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  if (
    !host ||
    host === "localhost" ||
    /\.(local|localhost|internal|test)$/.test(host) ||
    isIP(host) ||
    (url.port && !permitirPorta)
  ) {
    throw new ErroDeRecusa("O endereço precisa ser público.");
  }
  return url;
}

/// IP que a internet roteia: fora loopback, rede privada, link-local, CGNAT (100.64/10) e multicast. IPv6 por LISTA
/// PERMITIDA: so o unicast global (2000::/3, o que o `dns.lookup` devolve com o primeiro grupo de 4 digitos
/// comecando em 2 ou 3), menos o que nele nao e a internet: documentacao (2001:db8::/32), Teredo (2001::/32), 6to4
/// (2002::/16, embute um IPv4 qualquer) e documentacao 3fff::/20. A lista de proibidos de antes deixava passar
/// fe90::/10, fec0::/10, ff00::/8 e o NAT64 64:ff9b::/96. `::` e `::ffff:` (IPv4 embutido) nao comecam por 2 ou 3.
export function ipPublico(ip) {
  const valor = String(ip).toLowerCase();
  if (valor.includes(":")) {
    if (!/^[23][0-9a-f]{3}:/.test(valor)) return false;
    return !/^(2001:0?db8:|2001:0?:|2002:|3fff:)/.test(valor);
  }
  const [a, b] = valor.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * `lookup` para `http.request`/`https.request`: resolve o nome e RECUSA se algum dos IPs nao for publico.
 * O Node chama com `all: true` (autoSelectFamily) e espera uma lista; sem isso, espera um endereco so.
 */
export function lookupPublico(nome, opcoes, retorno) {
  resolverNome(nome, { ...opcoes, all: true }, (erro, enderecos) => {
    if (erro) return retorno(erro);
    if (!enderecos.length || enderecos.some(({ address }) => !ipPublico(address))) {
      return retorno(new ErroDeRecusa("O servidor desse endereço não é público."));
    }
    if (opcoes?.all) return retorno(null, enderecos);
    return retorno(null, enderecos[0].address, enderecos[0].family);
  });
}

/// Para o `validar` do `obter`: confere o endereco de CADA salto do redirecionamento, que pode apontar direto
/// para um IP interno (o `lookup` nao e chamado para IP escrito). A de documento nao aceita porta.
export function validarEnderecoPublico(url) {
  enderecoPublico(url.href);
}

/// A mesma conferencia para FOTO: aceita a porta, porque so o IP da conexao importa para nao chegar a rede interna.
export function validarFotoPublica(url) {
  enderecoPublico(url.href, { permitirPorta: true });
}
