"use server";

import {
  URL_AGORA,
  intervaloDoPeriodo,
  lerAgora,
  lerBoletim,
  lerPtax,
  urlBoletins,
  urlPtax,
  variacao,
} from "@/lib/ferramentas/cotacao";
import { converterImagemParaSvg } from "@/lib/ferramentas/imagemParaSvg";
import { TETO_BYTES_SVG, TETO_MB_SVG } from "@/lib/ferramentas/presetsSvg";

/**
 * Converte a imagem enviada em SVG de logo (fundo transparente, cores exatas).
 * Nao grava nada: o SVG volta para a tela, que o mostra e o entrega como
 * download.
 *
 * Recebe FormData porque a Server Action nao aceita `Uint8Array` direto. Toda
 * a validacao que importa (formato pelos bytes, teto de pixels, saida segura)
 * mora em `converterImagemParaSvg`, que e testada sem o Next
 * (`npm run teste:svg`); aqui so se confere o envelope.
 *
 * O `type` que o navegador declara e ignorado de proposito: quem envia o
 * escolhe.
 */
export async function converterImagemAcao(dados) {
  const arquivo = dados.get("arquivo");
  if (!arquivo || typeof arquivo === "string") {
    return { ok: false, erro: "Escolha uma imagem para converter." };
  }

  // Confere pelo tamanho declarado ANTES de ler: nao vale carregar 24 MB na
  // memoria para depois dizer que passou do limite.
  if (arquivo.size > TETO_BYTES_SVG) {
    return {
      ok: false,
      erro: `O arquivo tem ${(arquivo.size / 1024 / 1024).toFixed(1)} MB e o limite é ${TETO_MB_SVG} MB.`,
    };
  }

  return converterImagemParaSvg({ bytes: new Uint8Array(await arquivo.arrayBuffer()) });
}

// ---------------------------------------------------------------- cotacao do dolar

const TEMPO_LIMITE_MS = 8000;
const TETO_RESPOSTA = 2 * 1024 * 1024;
const VALE_PTAX_MS = 60 * 60 * 1000; // o PTAX muda uma vez por dia util
const VALE_AGORA_MS = 60 * 1000;

// Guarda so respostas BOAS: falha de rede nao pode ficar grudada por uma hora.
const memoria = new Map();

async function comMemoria(chave, vale, forcar, buscar) {
  const guardada = memoria.get(chave);
  if (!forcar && guardada && guardada.ate > Date.now()) return guardada.valor;
  const valor = await buscar();
  if (valor.ok) memoria.set(chave, { ate: Date.now() + vale, valor });
  return valor;
}

/** GET de JSON com tempo e tamanho limitados. Lanca em qualquer falha; quem chama traduz. */
async function lerJson(url, cabecalhos = {}) {
  const resposta = await fetch(url, {
    headers: { Accept: "application/json", ...cabecalhos },
    cache: "no-store",
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const texto = await resposta.text();
  if (texto.length > TETO_RESPOSTA) throw new Error("resposta grande demais");
  return JSON.parse(texto);
}

async function buscarPtax(intervalo) {
  try {
    const lido = lerPtax(await lerJson(urlPtax(intervalo)));
    if (!lido.ok) return lido;
    const ultimo = lido.serie[lido.serie.length - 1];
    return { ok: true, serie: lido.serie, ultimo, variacao: variacao(lido.serie) };
  } catch (erro) {
    console.warn("[cotacao] PTAX:", erro?.message);
    return { ok: false, erro: "Não foi possível consultar o Banco Central agora." };
  }
}

// A AwesomeAPI (tempo real) recusa com 429 depois de poucas consultas sem chave
// (medido em 21/09/2026). Recusada, ela fica de lado por 10 min em vez de gastar
// 2 s de espera a cada clique; nesse tempo o "agora" e o ultimo boletim do BC.
// Com uma chave gratuita (`AWESOMEAPI_TOKEN` no .env; cadastro em awesomeapi.com.br)
// o limite sobe para 100 mil consultas por mes. O .env so e lido na partida do
// servidor: depois de trocar o token, reiniciar.
const PAUSA_AWESOMEAPI_MS = 10 * 60 * 1000;
let awesomeApiPausadaAte = 0;

async function buscarAgora() {
  if (Date.now() >= awesomeApiPausadaAte) {
    try {
      const token = process.env.AWESOMEAPI_TOKEN?.trim();
      const lido = lerAgora(await lerJson(URL_AGORA, token ? { "x-api-key": token } : {}));
      if (lido.ok) return lido;
      console.warn("[cotacao] AwesomeAPI:", lido.erro);
    } catch (erro) {
      console.warn("[cotacao] AwesomeAPI:", erro?.message);
    }
    awesomeApiPausadaAte = Date.now() + PAUSA_AWESOMEAPI_MS;
  }

  try {
    return lerBoletim(await lerJson(urlBoletins()));
  } catch (erro) {
    console.warn("[cotacao] boletim do BC:", erro?.message);
    return { ok: false, erro: "Não foi possível consultar a cotação de agora." };
  }
}

/**
 * Cotacao do dolar para a tela de Ferramentas: o historico do PTAX no periodo
 * escolhido e a cotacao de agora. As duas consultas sao independentes — se uma
 * falha, a outra continua valendo; so quando as duas falham a resposta e erro.
 *
 * Nada e gravado. Os enderecos sao fixos: do navegador so vem o periodo, que e
 * conferido contra a lista (`intervaloDoPeriodo`) e nunca vai para a URL como
 * veio. `forcar` ignora a memoria (botao Atualizar).
 *
 * Sem `LogIntegracao`: o enum `Servico` nao tem valor para essas fontes, e
 * acrescentar e migration (o dono pediu sem mexer no schema, 21/09/2026).
 */
export async function buscarCotacaoAcao(valorDoPeriodo, forcar = false) {
  const intervalo = intervaloDoPeriodo(valorDoPeriodo);
  if (!intervalo) return { ok: false, erro: "Período inválido." };

  const [ptax, agora] = await Promise.all([
    comMemoria(`ptax|${intervalo.periodo.valor}|${intervalo.fim}`, VALE_PTAX_MS, forcar === true, () =>
      buscarPtax(intervalo),
    ),
    comMemoria("agora", VALE_AGORA_MS, forcar === true, buscarAgora),
  ]);

  if (!ptax.ok && !agora.ok) {
    return { ok: false, erro: "Não foi possível consultar as cotações agora. Tente de novo em instantes." };
  }
  return { ok: true, periodo: intervalo.periodo.valor, ptax, agora };
}
