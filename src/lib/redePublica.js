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

/// Endereco http(s) que vale buscar: sem usuario, sem porta, sem IP escrito e sem nome interno. IP escrito nao
/// passa por `lookup` (o Node o usa direto), entao so a recusa aqui o barra.
export function enderecoPublico(valor) {
  let url;
  try {
    url = new URL(valor);
  } catch {
    throw new ErroDeRecusa("Endereço do documento inválido.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new ErroDeRecusa("Endereço do documento inválido.");
  }
  // O `URL` devolve o host de IPv6 COM colchetes ("[::1]"), e o `isIP` so reconhece sem eles: sem tirar, o
  // endereco `http://[::1]/` passava, e como IP escrito ele nao passa pelo `lookup` (achado pelo teste, 08/10/2026).
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || /\.(local|localhost|internal|test)$/.test(host) || isIP(host) || url.port) {
    throw new ErroDeRecusa("O documento precisa estar em um endereço público.");
  }
  return url;
}

/// IP que a internet roteia: fora loopback, rede privada, link-local, CGNAT (100.64/10), multicast, o IPv6 de
/// rede interna e o IPv4 embutido em IPv6 (`::ffff:`), que contornaria a conferencia do IPv4.
export function ipPublico(ip) {
  const valor = String(ip).toLowerCase();
  if (valor.includes(":")) {
    return !(/^(::1|::|fe80:|fc|fd)/.test(valor) || valor.startsWith("::ffff:"));
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
      return retorno(new ErroDeRecusa("O servidor do documento não tem endereço público válido."));
    }
    if (opcoes?.all) return retorno(null, enderecos);
    return retorno(null, enderecos[0].address, enderecos[0].family);
  });
}

/// Para o `validar` do `obter`: confere o endereco de CADA salto do redirecionamento, que pode apontar direto
/// para um IP interno (o `lookup` nao e chamado para IP escrito).
export function validarEnderecoPublico(url) {
  enderecoPublico(url.href);
}
