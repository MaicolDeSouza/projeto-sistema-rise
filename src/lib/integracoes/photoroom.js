/**
 * Photoroom (Image Editing API, `POST /v2/edit`): tratamento da foto do produto NOVO.
 *
 * Decidido com o dono em 20-21/09/2026 depois de testar as fotos dele em sandbox:
 *
 *  - PREVIA antes de COMPRAR. A previa usa a chave de SANDBOX (gratis, ate 100 por dia e
 *    1000 por mes, saida com marca d'agua); a compra repete a mesma chamada com a chave
 *    de PRODUCAO (cobra por imagem, sem marca). O resultado e deterministico: duas
 *    chamadas iguais dao a mesma imagem, e so a posicao da marca d'agua muda.
 *  - NUNCA `beautify`. Foi testado e REDESENHA o produto: numa foto de Arduino Uno com
 *    cabo e pinos, devolveu outra placa e um cabo com USB-A nas duas pontas. Foto de
 *    produto que nao e o produto e o pior defeito possivel numa loja. Nao ha caminho
 *    neste arquivo que envie esse parametro, e o teste confere.
 *  - A iluminacao e a que PRESERVA matiz e saturacao (`ai.preserve-hue-and-saturation`):
 *    a cor do produto nao pode mudar.
 *
 * Duas travas contra gasto acidental, no molde de ML_PUBLICACAO e BLING_ESCRITA:
 *  1. a chave de previa so vale se comecar com `sandbox_` (se alguem colar a de producao
 *     no lugar errado, a "previa gratis" cobraria);
 *  2. a compra so acontece com PHOTOROOM_COMPRA=true. Enquanto o dono estiver testando,
 *     fica false, mesmo com a chave de producao ja colada no .env.
 *
 * Sem banco aqui: a parte de rede e de regras e testavel sem nada ligado. O registro em
 * LogIntegracao fica em `photoroomLog.js`.
 */

export const ENDERECO = "https://image-api.photoroom.com/v2/edit";

/** Preco publicado da Image Editing API (plano Plus), em dolar, por imagem. */
export const CUSTO_COMPRA_USD = 0.1;

/** Limites do sandbox, segundo a documentacao do Photoroom. */
export const LIMITE_PREVIAS_DIA = 100;
export const LIMITE_PREVIAS_MES = 1000;

const TIMEOUT_MS = 120_000;
const PREFIXO_SANDBOX = "sandbox_";

/**
 * O que cada chave permite, lido do ambiente. Devolve MOTIVOS, e nunca o valor da chave.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function avaliarConfiguracao(env = process.env) {
  const chavePrevia = (env.PHOTOROOM_API_KEY ?? "").trim();
  const chaveCompra = (env.PHOTOROOM_API_KEY_PRODUCAO ?? "").trim();
  const compraLigada = (env.PHOTOROOM_COMPRA ?? "").trim().toLowerCase() === "true";

  let previa;
  if (!chavePrevia) {
    previa = {
      ok: false,
      motivo: "Chave de previa ausente: coloque PHOTOROOM_API_KEY (a de sandbox) no arquivo .env e reinicie o servidor.",
    };
  } else if (!chavePrevia.startsWith(PREFIXO_SANDBOX)) {
    previa = {
      ok: false,
      motivo:
        "PHOTOROOM_API_KEY nao e de sandbox (ela deve comecar com sandbox_). A previa e gratis por ser sandbox, e uma chave de producao cobraria a cada previa.",
    };
  } else {
    previa = { ok: true, motivo: null };
  }

  let compra;
  if (!compraLigada) {
    compra = {
      ok: false,
      ligada: false,
      motivo: "Compra desligada (modo teste). Ela so liga com PHOTOROOM_COMPRA=true no .env.",
    };
  } else if (!chaveCompra) {
    compra = {
      ok: false,
      ligada: true,
      motivo: "Chave de producao ausente: coloque PHOTOROOM_API_KEY_PRODUCAO no arquivo .env e reinicie o servidor.",
    };
  } else if (chaveCompra.startsWith(PREFIXO_SANDBOX)) {
    compra = {
      ok: false,
      ligada: true,
      motivo: "PHOTOROOM_API_KEY_PRODUCAO e uma chave de sandbox (comeca com sandbox_): a compra sairia com marca d'agua.",
    };
  } else {
    compra = { ok: true, ligada: true, motivo: null };
  }

  return { previa, compra };
}

/**
 * Os campos do formulario enviado ao Photoroom.
 *
 * @param {{ removerFundo?: boolean, iluminacao?: boolean, ampliar?: boolean }} opcoes
 * @returns {Array<[string, string]>}
 */
export function camposDaEdicao(opcoes = {}) {
  const removerFundo = opcoes.removerFundo === true;
  const iluminacao = opcoes.iluminacao === true;
  const ampliar = opcoes.ampliar === true;

  if (!removerFundo && !iluminacao && !ampliar) {
    throw new Error("Escolha ao menos uma opcao: remover fundo, melhorar iluminacao ou ampliar.");
  }

  const campos = [
    ["removeBackground", removerFundo ? "true" : "false"],
    ["background.color", "FFFFFF"],
  ];

  // Sem `outputSize` quando amplia: essa combinacao deu erro 500 no teste de 20/09/2026,
  // e o quadrado de 1024 sai depois, do nosso padronizador. Sem remover o fundo tambem nao
  // se pede: o enquadramento e nosso, e o do Photoroom deixaria uma emenda entre o fundo
  // da foto e o branco de fora.
  if (!ampliar && removerFundo) {
    campos.push(["outputSize", "1024x1024"], ["padding", "0.05"]);
  }
  if (iluminacao) campos.push(["lighting.mode", "ai.preserve-hue-and-saturation"]);
  // `ai.fast`: o `ai.slow` recusa imagem acima de 262.144 pixels (512x512).
  if (ampliar) campos.push(["upscale.mode", "ai.fast"]);

  return campos;
}

/** Forma canonica das opcoes, para comparar "a previa que o dono viu" com "a que ele compra". */
export function opcoesCanonicas(opcoes = {}) {
  return {
    removerFundo: opcoes.removerFundo === true,
    iluminacao: opcoes.iluminacao === true,
    ampliar: opcoes.ampliar === true,
  };
}

/** Mensagem para a tela a partir do que o Photoroom respondeu. */
export function mensagemDeErro(status, corpo = "") {
  let detalhe = "";
  try {
    detalhe = JSON.parse(corpo)?.error?.message ?? "";
  } catch {
    detalhe = String(corpo).slice(0, 200);
  }

  if (status === 401 || status === 403) return "O Photoroom recusou a chave. Confira o valor no .env.";
  if (status === 402) return "O Photoroom recusou por falta de creditos ou de plano. Confira a conta.";
  if (status === 429) return "Muitas chamadas seguidas ao Photoroom (ou o limite do sandbox acabou). Tente de novo mais tarde.";
  if (status === 400 && /too big|upscale/i.test(detalhe)) {
    return "A foto e grande demais para o Photoroom ampliar (o limite e 1 megapixel, cerca de 1000x1000). Tire a opcao Ampliar.";
  }
  // Erro 500 ao ampliar e PASSAGEIRO: o mesmo 1024x768 falhou uma vez e passou logo depois (21/09/2026).
  if (status === 500 && /upscal/i.test(detalhe)) {
    return "O Photoroom falhou ao ampliar esta foto. Costuma passar tentando de novo.";
  }
  if (status === 400) return `O Photoroom recusou o pedido${detalhe ? `: ${detalhe}` : "."}`;
  return `O Photoroom falhou (HTTP ${status})${detalhe ? `: ${detalhe}` : "."}`;
}

const TIPOS = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * Uma chamada ao Photoroom.
 *
 * @param {{ modo: "previa" | "producao", bytes: Buffer, extensao: "jpg"|"png"|"webp",
 *           opcoes: object, env?: Record<string, string | undefined> }} entrada
 * @returns {Promise<{ ok: true, bytes: Buffer, status: number, duracaoMs: number }
 *   | { ok: false, erro: string, status: number | null, duracaoMs: number }>}
 */
export async function editarImagem({ modo, bytes, extensao, opcoes, env = process.env }) {
  const inicio = Date.now();
  // `enviada`: a chamada chegou a sair. Recusa por chave ou por opcoes (antes do fetch) nao
  // e chamada, entao nao entra no registro nem na contagem do limite do sandbox.
  const falha = (erro, status = null, enviada = false) => ({
    ok: false,
    erro,
    status,
    enviada,
    duracaoMs: Date.now() - inicio,
  });

  if (modo !== "previa" && modo !== "producao") return falha("Modo desconhecido.");

  const configuracao = avaliarConfiguracao(env);
  const permissao = modo === "producao" ? configuracao.compra : configuracao.previa;
  if (!permissao.ok) return falha(permissao.motivo);

  let campos;
  try {
    campos = camposDaEdicao(opcoes);
  } catch (erro) {
    return falha(erro.message);
  }

  const chave = (modo === "producao" ? env.PHOTOROOM_API_KEY_PRODUCAO : env.PHOTOROOM_API_KEY).trim();

  const formulario = new FormData();
  formulario.append("imageFile", new Blob([bytes], { type: TIPOS[extensao] ?? "image/jpeg" }), `foto.${extensao}`);
  for (const [nome, valor] of campos) formulario.append(nome, valor);

  let resposta;
  try {
    resposta = await fetch(ENDERECO, {
      method: "POST",
      headers: { "x-api-key": chave },
      body: formulario,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (erro) {
    return falha(
      erro?.name === "TimeoutError"
        ? "O Photoroom demorou demais para responder."
        : "Nao foi possivel falar com o Photoroom. Confira a conexao.",
      null,
      true,
    );
  }

  if (!resposta.ok) {
    return falha(
      mensagemDeErro(resposta.status, await resposta.text().catch(() => "")),
      resposta.status,
      true,
    );
  }

  return {
    ok: true,
    enviada: true,
    bytes: Buffer.from(await resposta.arrayBuffer()),
    status: resposta.status,
    duracaoMs: Date.now() - inicio,
  };
}
