import { prisma } from "@/lib/db";

/**
 * Cliente HTTP unico das integracoes.
 *
 * Faz tres coisas que nenhuma chamada externa pode ficar sem:
 *  1. registra tudo em LogIntegracao (e o que permite depurar uma rejeicao
 *     depois que ela aconteceu);
 *  2. mascara credenciais antes de gravar o log;
 *  3. respeita a fila de limite de requisicoes de cada servico.
 */

const CAMPOS_SIGILOSOS =
  /(authorization|client_secret|access_token|refresh_token|chave_api|chave_aplicacao|\bcode\b|password|secret)/i;

/**
 * Substitui valores sigilosos por "***" antes de gravar no log.
 * Trabalha recursivamente porque o segredo costuma estar aninhado.
 */
export function mascarar(valor) {
  if (valor === null || valor === undefined) return valor;

  if (typeof valor === "string") {
    // Mascara pares "chave=valor" e "chave: valor" dentro de strings soltas.
    return valor.replace(
      /((?:authorization|client_secret|access_token|refresh_token|chave_api|chave_aplicacao|code|password|secret)\s*[=:]\s*)([^\s&,;"']+)/gi,
      "$1***",
    );
  }

  if (Array.isArray(valor)) return valor.map(mascarar);

  if (typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor).map(([chave, item]) => [
        chave,
        CAMPOS_SIGILOSOS.test(chave) ? "***" : mascarar(item),
      ]),
    );
  }

  return valor;
}

function resumir(valor, limite = 1500) {
  if (valor === null || valor === undefined) return null;
  const texto =
    typeof valor === "string" ? valor : JSON.stringify(mascarar(valor));
  return texto.length > limite ? `${texto.slice(0, limite)}…` : texto;
}

/** Grava o log sem nunca derrubar a chamada que o originou. */
async function registrar(dados) {
  try {
    await prisma.logIntegracao.create({ data: dados });
  } catch (erro) {
    console.error("Falha ao gravar LogIntegracao:", erro.message);
  }
}

// ---------------------------------------------------------------------------
// Fila de limite de requisicoes, por servico
// ---------------------------------------------------------------------------

const filas = new Map();

/**
 * Serializa a espera: cada chamador entra na fila e so recebe vaga quando
 * houver menos de `max` requisicoes na ultima janela.
 *
 * O Bling limita 3 req/s **da conta inteira**, nao por endpoint — por isso a
 * janela e por servico e nao por caminho.
 */
export function limitar(servico, max, janelaMs = 1000) {
  let fila = filas.get(servico);
  if (!fila) {
    fila = { historico: [], corrente: Promise.resolve() };
    filas.set(servico, fila);
  }

  fila.corrente = fila.corrente.then(async () => {
    for (;;) {
      const agora = Date.now();
      fila.historico = fila.historico.filter((t) => agora - t < janelaMs);

      if (fila.historico.length < max) {
        fila.historico.push(agora);
        return;
      }

      await new Promise((resolver) =>
        setTimeout(resolver, janelaMs - (agora - fila.historico[0]) + 10),
      );
    }
  });

  return fila.corrente;
}

// ---------------------------------------------------------------------------
// Requisicao
// ---------------------------------------------------------------------------

/**
 * @param {object} opcoes
 * @param {string} opcoes.servico   valor do enum Servico, usado no log
 * @param {string} opcoes.url
 * @param {string} [opcoes.metodo]
 * @param {object} [opcoes.headers]
 * @param {*}      [opcoes.corpo]   objeto (JSON) ou URLSearchParams
 * @param {number} [opcoes.timeoutMs]
 * @param {number} [opcoes.tentativas] total de tentativas em 429/5xx
 */
export async function requisitar({
  servico,
  url,
  metodo = "GET",
  headers = {},
  corpo,
  timeoutMs = 20000,
  tentativas = 3,
}) {
  const alvo = new URL(url);
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    const inicio = Date.now();
    const abortar = AbortController ? new AbortController() : null;
    const relogio = setTimeout(() => abortar?.abort(), timeoutMs);

    try {
      const ehForm = corpo instanceof URLSearchParams;
      const resposta = await fetch(alvo, {
        method: metodo,
        headers: {
          Accept: "application/json",
          ...(corpo
            ? {
                "Content-Type": ehForm
                  ? "application/x-www-form-urlencoded"
                  : "application/json",
              }
            : {}),
          ...headers,
        },
        ...(corpo
          ? { body: ehForm ? corpo.toString() : JSON.stringify(corpo) }
          : {}),
        signal: abortar?.signal,
        cache: "no-store",
      });

      clearTimeout(relogio);
      const duracaoMs = Date.now() - inicio;

      const texto = await resposta.text();
      let dados = null;
      if (texto) {
        try {
          dados = JSON.parse(texto);
        } catch {
          dados = { textoBruto: texto.slice(0, 1000) };
        }
      }

      await registrar({
        servico,
        metodo,
        endpoint: `${alvo.origin}${alvo.pathname}`,
        statusHttp: resposta.status,
        duracaoMs,
        requestResumo: resumir({ query: Object.fromEntries(alvo.searchParams) }),
        responseResumo: resumir(dados),
        erro: resposta.ok ? null : resumir(dados, 400),
      });

      // 429 e 5xx merecem nova tentativa; 4xx nao — o pedido esta errado.
      const valeRetentar = resposta.status === 429 || resposta.status >= 500;
      if (!resposta.ok && valeRetentar && tentativa < tentativas) {
        const sugerido = Number(resposta.headers.get("retry-after"));
        await new Promise((resolver) =>
          setTimeout(
            resolver,
            Number.isFinite(sugerido) && sugerido > 0
              ? sugerido * 1000
              : 2 ** tentativa * 500,
          ),
        );
        continue;
      }

      return { ok: resposta.ok, status: resposta.status, duracaoMs, dados };
    } catch (erro) {
      clearTimeout(relogio);
      ultimoErro = erro;

      await registrar({
        servico,
        metodo,
        endpoint: `${alvo.origin}${alvo.pathname}`,
        statusHttp: null,
        duracaoMs: Date.now() - inicio,
        requestResumo: resumir({ query: Object.fromEntries(alvo.searchParams) }),
        responseResumo: null,
        erro:
          erro.name === "AbortError"
            ? `Tempo esgotado apos ${timeoutMs}ms`
            : resumir(erro.message, 400),
      });

      if (tentativa < tentativas) {
        await new Promise((resolver) =>
          setTimeout(resolver, 2 ** tentativa * 500),
        );
        continue;
      }
    }
  }

  throw new Error(
    `Falha ao chamar ${alvo.origin}${alvo.pathname}: ${ultimoErro?.message ?? "erro desconhecido"}`,
  );
}
