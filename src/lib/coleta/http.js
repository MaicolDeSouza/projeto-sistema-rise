import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";

/**
 * Cliente HTTP da coleta, sobre `node:http`/`node:https` — e NAO sobre `fetch`.
 *
 * POR QUE NAO FETCH (16/09/2026). O `fetch` do Node e o `undici`, e o undici
 * derruba o PROCESSO INTEIRO com `AssertionError: assert(!this.paused)` em
 * `Parser.finish`: quando o site responde sem tamanho declarado e fecha a
 * conexao (`Connection: close`) no instante em que o leitor do corpo esta
 * pausado por contrapressao. Nenhum try/catch alcanca — a excecao nasce de um
 * evento interno do socket, e logo depois o libuv aborta com
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`.
 *
 * Medido: derrubou o worker na Casa da Robotica e depois TRES vezes em 13 minutos,
 * com tres lojas varrendo em paralelo (cada queda recomeca as varreduras do
 * zero). Reproduzido com 12 conexoes simultaneas lendo o corpo normalmente, no
 * undici do Node 24 (7.29.0) E no mais novo publicado (8.10.2) — atualizar nao
 * resolve. O cliente HTTP do proprio Node e outro codigo (llhttp nativo, com
 * contrapressao do stream comum), e o mesmo teste passa. O teste esta em
 * scripts/teste-worker.js.
 *
 * O que o fetch fazia de graca e aqui e feito a mao: seguir redirecionamento,
 * descompactar gzip/deflate/br, teto de tempo ate o ultimo byte e teto de tamanho.
 */

/// Conexoes reaproveitadas por dominio, como o fetch fazia. Sem isto cada pagina
/// abriria um TLS novo — lento para nos e caro para a loja.
const agenteHttp = new http.Agent({ keepAlive: true, maxSockets: 4 });
const agenteHttps = new https.Agent({ keepAlive: true, maxSockets: 4 });

const MAXIMO_REDIRECIONAMENTOS = 5;

/**
 * Descompacta conforme o Content-Encoding. Codificacao desconhecida passa como
 * veio: melhor bytes crus do que resposta perdida.
 */
function descompactar(resposta) {
  const codificacao = String(resposta.headers["content-encoding"] ?? "").trim().toLowerCase();
  const opcoes = { flush: zlib.constants.Z_SYNC_FLUSH, finishFlush: zlib.constants.Z_SYNC_FLUSH };
  if (codificacao === "gzip" || codificacao === "x-gzip") return resposta.pipe(zlib.createGunzip(opcoes));
  if (codificacao === "deflate") return resposta.pipe(zlib.createInflate(opcoes));
  if (codificacao === "br") return resposta.pipe(zlib.createBrotliDecompress());
  return resposta;
}

/** Um GET, sem seguir redirecionamento. Resolve quando chegam os cabecalhos. */
function pedir(url, { cabecalhos, sinal }) {
  return new Promise((resolver, rejeitar) => {
    const cliente = url.protocol === "https:" ? https : http;
    const pedido = cliente.request(url, {
      method: "GET",
      headers: { "Accept-Encoding": "gzip, deflate, br", ...cabecalhos },
      agent: url.protocol === "https:" ? agenteHttps : agenteHttp,
    });

    const abortar = () => pedido.destroy(sinal.reason ?? new Error("Cancelado"));
    if (sinal) {
      if (sinal.aborted) return abortar();
      sinal.addEventListener("abort", abortar, { once: true });
    }

    pedido.on("response", (resposta) => {
      sinal?.removeEventListener("abort", abortar);
      resolver({ pedido, resposta });
    });
    pedido.on("error", (erro) => {
      sinal?.removeEventListener("abort", abortar);
      rejeitar(sinal?.aborted ? (sinal.reason ?? erro) : erro);
    });
    pedido.end();
  });
}

/**
 * Le o corpo ate `teto` bytes (ja descompactados). Passou do teto: para de ler,
 * descarta o resto e marca `truncado`. O sinal interrompe a leitura no meio.
 */
function lerCorpo(resposta, { teto, sinal }) {
  return new Promise((resolver, rejeitar) => {
    const fluxo = descompactar(resposta);
    const pedacos = [];
    let total = 0;
    let terminou = false;

    const encerrar = (erro, truncado = false) => {
      if (terminou) return;
      terminou = true;
      sinal?.removeEventListener("abort", aoAbortar);
      if (erro) {
        resposta.destroy();
        fluxo.destroy?.();
        return rejeitar(erro);
      }
      if (truncado) {
        resposta.destroy();
        fluxo.destroy?.();
      }
      resolver({ bytes: Buffer.concat(pedacos, total), truncado });
    };
    const aoAbortar = () => encerrar(sinal.reason ?? new Error("Cancelado"));

    if (sinal) {
      if (sinal.aborted) return aoAbortar();
      sinal.addEventListener("abort", aoAbortar, { once: true });
    }

    fluxo.on("data", (pedaco) => {
      if (terminou) return;
      if (total + pedaco.length > teto) {
        pedacos.push(pedaco.subarray(0, teto - total));
        total = teto;
        return encerrar(null, true);
      }
      pedacos.push(pedaco);
      total += pedaco.length;
    });
    fluxo.on("end", () => encerrar(null));
    fluxo.on("error", (erro) => encerrar(erro));
    resposta.on("error", (erro) => encerrar(erro));
    // Conexao fechada antes do fim declarado: resposta pela metade nao e resposta.
    resposta.on("close", () => {
      if (!resposta.complete) encerrar(new Error("A conexao caiu no meio da resposta"));
    });
  });
}

/** Cabecalhos como objeto de nomes minusculos (o que o Node ja entrega). */
function cabecalhosDe(resposta) {
  const cabecalhos = {};
  for (const [nome, valor] of Object.entries(resposta.headers)) {
    if (nome === "set-cookie") continue;
    cabecalhos[nome] = Array.isArray(valor) ? valor.join(", ") : String(valor);
  }
  return cabecalhos;
}

/**
 * GET completo: segue redirecionamento, descompacta e le o corpo com teto.
 *
 * @param {string|URL} endereco
 * @param {object} opcoes
 * @param {Record<string,string>} [opcoes.cabecalhos]
 * @param {AbortSignal} [opcoes.sinal] teto de tempo + cancelamento; vale ate o
 *   ultimo byte do corpo
 * @param {(status: number) => number} [opcoes.tetoDoCorpo] quantos bytes ler para
 *   este status; 0 descarta o corpo sem ler
 * @param {boolean} [opcoes.mesmoDominio] redirecionamento para outro dominio NAO e
 *   seguido: devolve `redirecionouPara`
 * @returns {Promise<{status: number, cabecalhos: Record<string,string>,
 *   cookies: string[], urlFinal: string, bytes: Buffer|null, truncado: boolean,
 *   redirecionouPara: string|null}>}
 */
export async function obter(
  endereco,
  { cabecalhos = {}, sinal = null, tetoDoCorpo = () => 0, mesmoDominio = false } = {},
) {
  let url = new URL(endereco);
  const hostOriginal = url.hostname;

  for (let saltos = 0; ; saltos++) {
    const { resposta } = await pedir(url, { cabecalhos, sinal });
    const status = resposta.statusCode ?? 0;
    const local = resposta.headers.location;

    if (status >= 300 && status < 400 && status !== 304 && local) {
      // Redirecionamento nao tem corpo que interesse: descartado antes de seguir.
      resposta.resume();
      if (saltos >= MAXIMO_REDIRECIONAMENTOS) throw new Error("Redirecionamentos demais");

      const proxima = new URL(local, url);
      if (mesmoDominio && proxima.hostname !== hostOriginal) {
        return {
          status,
          cabecalhos: cabecalhosDe(resposta),
          cookies: [],
          urlFinal: url.toString(),
          bytes: null,
          truncado: false,
          redirecionouPara: proxima.hostname,
        };
      }
      url = proxima;
      continue;
    }

    const cookies = (resposta.headers["set-cookie"] ?? [])
      .map((linha) => linha.split("=")[0].trim())
      .filter(Boolean);

    const teto = tetoDoCorpo(status);
    let corpo = { bytes: null, truncado: false };
    if (teto > 0) {
      corpo = await lerCorpo(resposta, { teto, sinal });
    } else {
      // Corpo que nao interessa e CONSUMIDO e descartado, nunca largado: resposta
      // sem leitor segura a conexao do pool aberta.
      resposta.resume();
    }

    return {
      status,
      cabecalhos: cabecalhosDe(resposta),
      cookies,
      urlFinal: url.toString(),
      bytes: corpo.bytes,
      truncado: corpo.truncado,
      redirecionouPara: null,
    };
  }
}
