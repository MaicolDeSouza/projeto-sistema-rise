import http from "node:http";

import { eventoSSE } from "../sse";
import { ErroDoAtendimento } from "./cerebro";
import { foraDoHorario } from "./configuracaoDoCanal";
import { criarLimites } from "./limites";
import { normalizarPedido, textoDaSituacao } from "./pedido";
import { emitirPasse, passeVale } from "./turnstile";
import { NOME_DO_WIDGET } from "./widgetPublicado";

/**
 * A PORTA do chat da loja: as rotas que a janela do chat usa (spec de 19/11/2026, §5.4 e §8; `/pedido` desde a fase 3).
 * E o unico pedaco do Rise alcancavel da internet sem login, entao tudo aqui falha FECHADO:
 *
 *  - rota que nao e uma das conhecidas: 404, sem corpo;
 *  - pedido de outra origem que nao a loja: 403 (o navegador de outro site nao usa o chat da 4hobby);
 *  - chat desligado, sem a chave da IA, sem o segredo do Turnstile ou com o banco fora do ar: `/status` diz desligado e
 *    `/chat` responde 503 com o WhatsApp;
 *  - sem passar pela verificacao de robo: 403;
 *  - acima dos limites: 429 (visitante ou IP), 503 "lotado" (respostas ao mesmo tempo) ou 409 (a mesma sessao ja tem
 *    uma resposta em andamento).
 *
 * O visitante que fecha a aba NAO cancela a resposta: o cerebro termina, grava e a vaga e liberada no `finally`.
 * Erro interno nunca vai ao visitante: so um aviso generico; o detalhe fica no log do servico.
 */

const TETO_DO_CORPO = 16 * 1024;
const CACHE_DA_CONFIGURACAO_MS = 30 * 1000;
const SESSAO = /^[a-f0-9]{32}$/;
const AVISO_GENERICO = "Não consegui responder agora. Tente de novo em instantes ou fale com a gente pelo WhatsApp.";

class CorpoGrande extends Error {}

/** O corpo do pedido, com teto: acima dele a leitura para e o pedido e recusado (413). */
function lerCorpo(requisicao) {
  return new Promise((resolver, rejeitar) => {
    const pedacos = [];
    let total = 0;
    let estourou = false;
    requisicao.on("data", (pedaco) => {
      if (estourou) return;
      total += pedaco.length;
      if (total > TETO_DO_CORPO) {
        estourou = true;
        rejeitar(new CorpoGrande());
        return;
      }
      pedacos.push(pedaco);
    });
    requisicao.on("end", () => {
      if (!estourou) resolver(Buffer.concat(pedacos).toString("utf8"));
    });
    requisicao.on("error", rejeitar);
  });
}

/**
 * @param {{
 *   dados: { configuracaoDoCanal: () => Promise<object>, segredos: () => Promise<object> },
 *   responder: (pedido: { sessaoId: string, mensagem: string, contexto: object, aoEvento: Function, limites: object }) => Promise<unknown>,
 *   avaliar: (mensagemId: string, sessaoId: string, nota: 1 | -1) => Promise<boolean>,
 *   verificarRobo: (pedido: { token: string, ip: string, segredo: string }) => Promise<boolean>,
 *   chaveHex: string, origens: string[], versao?: string, agora?: () => number
 * }} dependencias
 * @returns {http.Server & { limites: object }}
 */
export function criarServidorDoAssistente({ dados, responder, avaliar, verificarRobo, chaveHex, origens, versao = "dev", agora = Date.now, widgets = new Map() }) {
  // Os limites vivem na memoria deste processo; os NUMEROS acompanham o que o dono salvar (relidos junto com a configuracao).
  const numerosDosLimites = {};
  const limites = criarLimites({ limites: numerosDosLimites, agora });
  let emCache = null;

  /** A configuracao e os segredos, relidos no maximo a cada 30 s. Banco fora do ar: `null` (o chat fica desligado). */
  async function estado() {
    const instante = agora();
    if (emCache && instante - emCache.lidoEm < CACHE_DA_CONFIGURACAO_MS) return emCache.valor;
    try {
      const [config, segredos] = await Promise.all([dados.configuracaoDoCanal(), dados.segredos()]);
      const canal = config.canal;
      Object.assign(numerosDosLimites, canal.limites);
      const ligado = Boolean(canal.ligado && canal.turnstileSiteKey && segredos.turnstile && segredos[canal.principal?.provedor]);
      emCache = { lidoEm: instante, valor: { canal, ligado, segredoDoRobo: segredos.turnstile ?? null } };
      return emCache.valor;
    } catch (erro) {
      console.error("[ia] nao leu a configuracao do canal:", erro?.message ?? erro);
      return null;
    }
  }

  function cabecalhosDaOrigem(origem) {
    return origem
      ? { "Access-Control-Allow-Origin": origem, Vary: "Origin", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "600" }
      : {};
  }

  function json(resposta, status, corpo, cabecalhos = {}) {
    const texto = corpo === null ? "" : JSON.stringify(corpo);
    resposta.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", ...cabecalhos });
    resposta.end(texto);
  }

  /** O endereco do visitante: o ultimo que o Caddy acrescentou (so ele alcanca este servico). */
  function ipDe(requisicao) {
    const encaminhado = String(requisicao.headers["x-forwarded-for"] ?? "").split(",").map((parte) => parte.trim()).filter(Boolean);
    return encaminhado.at(-1) ?? requisicao.socket.remoteAddress ?? "desconhecido";
  }

  async function corpoJson(requisicao) {
    const texto = await lerCorpo(requisicao);
    const corpo = JSON.parse(texto);
    if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) throw new SyntaxError("corpo");
    return corpo;
  }

  /** O passe assinado ainda vale, ou o Turnstile aprova agora (e sai um passe novo). Vale para o `/chat` e o `/pedido`. */
  async function conferirRobo(corpo, sessaoId, ip, atual) {
    if (passeVale(corpo.passe, sessaoId, chaveHex, agora())) return { ok: true, passeNovo: null };
    const humano = typeof corpo.turnstileToken === "string" && corpo.turnstileToken.length <= 4096 && (await verificarRobo({ token: corpo.turnstileToken, ip, segredo: atual.segredoDoRobo }));
    return humano ? { ok: true, passeNovo: emitirPasse(sessaoId, chaveHex, agora()) } : { ok: false };
  }

  /**
   * O acompanhar pedido (fase 3): o formulario da janela, SEM a IA e sem gravar nada da conversa. O servico so chama a
   * funcao do banco. Todo limite (do visitante, do IP ou do banco) responde 429 com o WhatsApp comercial, para a janela
   * mostrar o texto e o link (pedido do dono em 22/11/2026, ao aprovar o plano).
   */
  async function aoPedido(requisicao, resposta, cors) {
    const corpo = await corpoJson(requisicao);
    const sessaoId = String(corpo.sessaoId ?? "");
    if (!SESSAO.test(sessaoId)) return json(resposta, 400, { erro: "sessao" }, cors);

    const atual = await estado();
    const whatsapp = atual?.canal.whatsapp || null;
    if (!atual?.ligado) return json(resposta, 503, { erro: "desligado", whatsapp }, cors);

    const pedido = normalizarPedido({ numero: corpo.numero, prova: corpo.prova });
    if (pedido.erro) return json(resposta, 400, { erro: pedido.erro }, cors);

    const ip = ipDe(requisicao);
    const robo = await conferirRobo(corpo, sessaoId, ip, atual);
    if (!robo.ok) return json(resposta, 403, { erro: "robo" }, cors);
    const comPasse = robo.passeNovo ? { passe: robo.passeNovo } : {};

    if (!limites.consultarPedido(sessaoId, ip).ok) return json(resposta, 429, { situacao: "limite", whatsapp, ...comPasse }, cors);
    let resultado;
    try {
      resultado = await dados.situacaoDoPedido(pedido.numero, pedido.prova);
    } catch (erro) {
      console.error("[ia] nao consultou o pedido:", erro?.message ?? erro);
      return json(resposta, 503, { erro: "indisponivel", whatsapp }, cors);
    }
    if (resultado?.situacao === "achado" && resultado.pedido) return json(resposta, 200, { situacao: "achado", ...textoDaSituacao(resultado.pedido), ...comPasse }, cors);
    if (resultado?.situacao === "limite") return json(resposta, 429, { situacao: "limite", whatsapp, ...comPasse }, cors);
    limites.anotarErroDePedido(sessaoId);
    return json(resposta, 200, { situacao: "nao_achado", ...comPasse }, cors);
  }

  async function aoStatus(resposta, cors) {
    const atual = await estado();
    if (!atual) return json(resposta, 200, { ligado: false }, { ...cors, "Cache-Control": "public, max-age=60" });
    const { canal, ligado } = atual;
    json(
      resposta,
      200,
      { ligado, nome: canal.nome, boasVindas: canal.boasVindas, whatsapp: canal.whatsapp || null, foraDoHorario: foraDoHorario(canal.horario, agora()), turnstileSiteKey: canal.turnstileSiteKey || null, publico: canal.publico === true, versao },
      { ...cors, "Cache-Control": "public, max-age=60" },
    );
  }

  async function aoChat(requisicao, resposta, cors) {
    const corpo = await corpoJson(requisicao);
    const sessaoId = String(corpo.sessaoId ?? "");
    if (!SESSAO.test(sessaoId)) return json(resposta, 400, { erro: "sessao" }, cors);

    const atual = await estado();
    const whatsapp = atual?.canal.whatsapp || null;
    if (!atual?.ligado) return json(resposta, 503, { erro: "desligado", whatsapp }, cors);

    const mensagem = typeof corpo.mensagem === "string" ? corpo.mensagem.trim() : "";
    if (!mensagem) return json(resposta, 400, { erro: "vazia" }, cors);
    if (mensagem.length > atual.canal.limites.caracteresPorMensagem) return json(resposta, 400, { erro: "longa" }, cors);

    const ip = ipDe(requisicao);
    const robo = await conferirRobo(corpo, sessaoId, ip, atual);
    if (!robo.ok) return json(resposta, 403, { erro: "robo" }, cors);
    const passeNovo = robo.passeNovo;

    const vez = limites.entrar(sessaoId, ip);
    if (!vez.ok) {
      if (vez.motivo === "ocupada") return json(resposta, 409, { erro: "ocupada" }, cors);
      if (vez.motivo === "lotado") return json(resposta, 503, { erro: "lotado", whatsapp }, cors);
      return json(resposta, 429, { erro: "limite", whatsapp }, cors);
    }

    // Daqui em diante a resposta e um fluxo de eventos. Se o visitante fechar a aba, `enviar` passa a nao fazer nada e o
    // cerebro TERMINA do mesmo jeito (a conversa fica gravada e a reserva do orcamento volta).
    let aberto = true;
    let fluxoAberto = false;
    const enviar = (nome, dadosDoEvento) => {
      if (!aberto) return;
      try {
        resposta.write(eventoSSE(nome, dadosDoEvento));
      } catch {
        aberto = false;
      }
    };
    // A vaga ja foi tomada: TUDO daqui em diante fica dentro do try, para ela ser devolvida mesmo se abrir o fluxo falhar
    // (fora dele, a sessao ficava "ocupada" ate o servico reiniciar).
    try {
      resposta.on("close", () => {
        aberto = false;
      });
      resposta.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff", ...cors });
      fluxoAberto = true;
      if (passeNovo) enviar("passe", { passe: passeNovo });
      const contexto = corpo.contexto && typeof corpo.contexto === "object" ? { pagina: String(corpo.contexto.pagina ?? "").slice(0, 40), skuAberto: String(corpo.contexto.skuAberto ?? "").slice(0, 64) } : {};
      await responder({ sessaoId, mensagem, contexto, aoEvento: enviar, limites });
    } catch (erro) {
      // O fluxo nem abriu: nao ha como avisar por evento; quem chamou responde o erro generico (500), sem detalhe.
      if (!fluxoAberto) throw erro;
      if (erro instanceof ErroDoAtendimento) {
        enviar("erro", { motivo: erro.motivo, mensagem: erro.message, whatsapp: erro.whatsapp ?? whatsapp });
      } else {
        console.error("[ia] erro inesperado na conversa:", erro?.stack ?? erro);
        enviar("erro", { motivo: "indisponivel", mensagem: AVISO_GENERICO, whatsapp });
      }
    } finally {
      vez.sair();
      if (fluxoAberto && aberto) resposta.end();
    }
  }

  async function aoAvaliar(requisicao, resposta, cors) {
    const corpo = await corpoJson(requisicao);
    const sessaoId = String(corpo.sessaoId ?? "");
    const mensagemId = String(corpo.mensagemId ?? "");
    if (!SESSAO.test(sessaoId) || !mensagemId || mensagemId.length > 64 || (corpo.nota !== 1 && corpo.nota !== -1)) return json(resposta, 400, { erro: "avaliacao" }, cors);
    // 204 sempre: nao revela se a mensagem existe nem de quem e.
    await avaliar(mensagemId, sessaoId, corpo.nota).catch((erro) => console.error("[ia] nao gravou a avaliacao:", erro?.message ?? erro));
    resposta.writeHead(204, cors);
    resposta.end();
  }

  const servidor = http.createServer(async (requisicao, resposta) => {
    try {
      const caminho = new URL(requisicao.url ?? "/", "http://interno").pathname;
      const origem = requisicao.headers.origin ?? null;
      const origemDaLoja = origem && origens.includes(origem) ? origem : null;
      const cors = cabecalhosDaOrigem(origemDaLoja);
      const rota = `${requisicao.method} ${caminho}`;

      // O arquivo da janela do chat: publico por natureza, entao responde a qualquer origem (a conferencia de
      // integridade do navegador EXIGE o CORS aberto). So GET, so o nome no formato certo, so o que foi publicado; como o
      // nome traz a versao, o navegador pode guardar para sempre.
      if (NOME_DO_WIDGET.test(caminho.slice(1))) {
        const arquivo = requisicao.method === "GET" ? widgets.get(caminho.slice(1)) : null;
        if (!arquivo) {
          resposta.writeHead(404);
          return resposta.end();
        }
        resposta.writeHead(200, {
          "Content-Type": "text/javascript; charset=utf-8",
          "Content-Length": arquivo.length,
          "Cache-Control": "public, max-age=31536000, immutable",
          "Access-Control-Allow-Origin": "*",
          "X-Content-Type-Options": "nosniff",
        });
        return resposta.end(arquivo);
      }
      if (!["/status", "/chat", "/avaliar", "/pedido"].includes(caminho)) {
        resposta.writeHead(404);
        return resposta.end();
      }
      // De outra origem, nada. Sem origem so passa o `GET /status` (e como o deploy confere que o servico subiu).
      if (origem ? !origemDaLoja : rota !== "GET /status") {
        resposta.writeHead(403);
        return resposta.end();
      }
      if (requisicao.method === "OPTIONS") {
        resposta.writeHead(204, cors);
        return resposta.end();
      }
      if (rota === "GET /status") return await aoStatus(resposta, cors);
      if (rota === "POST /chat") return await aoChat(requisicao, resposta, cors);
      if (rota === "POST /avaliar") return await aoAvaliar(requisicao, resposta, cors);
      if (rota === "POST /pedido") return await aoPedido(requisicao, resposta, cors);
      resposta.writeHead(404);
      resposta.end();
    } catch (erro) {
      if (resposta.headersSent) return resposta.end();
      if (erro instanceof CorpoGrande) {
        resposta.writeHead(413, { Connection: "close" });
        return resposta.end();
      }
      if (erro instanceof SyntaxError) {
        resposta.writeHead(400);
        return resposta.end();
      }
      console.error("[ia] erro inesperado na porta:", erro?.stack ?? erro);
      resposta.writeHead(500);
      resposta.end();
    }
  });
  // Conexao que nao manda o pedido inteiro em 15 s e solta: quem segura conexoes abertas nao trava o servico.
  servidor.requestTimeout = 15000;
  servidor.headersTimeout = 10000;
  servidor.limites = limites;
  return servidor;
}
