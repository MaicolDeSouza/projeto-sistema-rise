/**
 * Os limites do chat da loja contra abuso e gasto (spec de 19/11/2026, §8): mensagens por visitante e por IP por hora,
 * gasto por visitante por dia, respostas ao mesmo tempo, e uma resposta por vez por visitante.
 *
 * Em MEMORIA, de proposito: o servico `ia` e um processo so, e o IP do visitante nunca vai para o banco. Reiniciar zera a
 * contagem, o que so deixa passar uma hora de mensagens; o dinheiro tem outra tranca, que nao se perde (o orcamento dos
 * clientes, reservado no banco antes de cada chamada).
 *
 * Sem imports; o relogio entra por parametro, para o teste nao esperar uma hora de verdade.
 */

const UMA_HORA_MS = 60 * 60 * 1000;
const UM_DIA_MS = 24 * UMA_HORA_MS;
// Acima disto, as chaves sem movimento na janela saem do mapa (uma varredura de IPs nao pode faze-lo crescer para sempre).
const FAXINA_A_PARTIR_DE = 2000;

const centavos = (valor) => Math.round(Number(valor) * 100);

/**
 * Os limites do acompanhar pedido (spec §8; fase 3). Do lado do servico: erros por visitante no dia e consultas por IP na
 * hora. Os do banco (erros por numero, teto geral) moram na funcao `ia_situacao_do_pedido`. Fixos por enquanto: a tela
 * Canais ainda nao os mostra.
 */
export const LIMITES_DO_PEDIDO = { errosPorSessaoPorDia: 5, consultasPorIpPorHora: 10 };

/** Arquivos por visitante no dia (fase 3). Conta toda tentativa que passou pela verificacao de robo, lida ou nao. */
export const ANEXOS_POR_SESSAO_POR_DIA = 5;

/**
 * @param {{ limites: { mensagensPorSessaoPorHora: number, mensagensPorIpPorHora: number, respostasAoMesmoTempo: number, brlPorSessaoPorDia: number }, agora?: () => number }} opcoes
 */
export function criarLimites({ limites, agora = Date.now }) {
  /** @type {Map<string, number[]>} */
  const porSessao = new Map();
  /** @type {Map<string, number[]>} */
  const porIp = new Map();
  /** @type {Map<string, { dia: number, centavos: number }>} */
  const custos = new Map();
  const ativas = new Set();
  /** @type {Map<string, { dia: number, erros: number }>} */
  const errosDePedido = new Map();
  /** @type {Map<string, number[]>} */
  const pedidosPorIp = new Map();
  /** @type {Map<string, { dia: number, anexos: number }>} */
  const anexos = new Map();

  const recentes = (mapa, chave, instante) => (mapa.get(chave) ?? []).filter((quando) => quando > instante - UMA_HORA_MS);

  function faxina(instante) {
    for (const mapa of [porSessao, porIp, pedidosPorIp]) {
      if (mapa.size <= FAXINA_A_PARTIR_DE) continue;
      for (const [chave, instantes] of mapa) if (!instantes.some((quando) => quando > instante - UMA_HORA_MS)) mapa.delete(chave);
    }
    if (custos.size > FAXINA_A_PARTIR_DE) {
      const hoje = Math.floor(instante / UM_DIA_MS);
      for (const [chave, custo] of custos) if (custo.dia !== hoje) custos.delete(chave);
    }
    for (const mapa of [errosDePedido, anexos]) {
      if (mapa.size <= FAXINA_A_PARTIR_DE) continue;
      const hoje = Math.floor(instante / UM_DIA_MS);
      for (const [chave, contagem] of mapa) if (contagem.dia !== hoje) mapa.delete(chave);
    }
  }

  const errosDePedidoHoje = (sessaoId, instante) => {
    const contagem = errosDePedido.get(sessaoId);
    return contagem && contagem.dia === Math.floor(instante / UM_DIA_MS) ? contagem.erros : 0;
  };

  function custoDaSessaoHoje(sessaoId, instante = agora()) {
    const custo = custos.get(sessaoId);
    return custo && custo.dia === Math.floor(instante / UM_DIA_MS) ? custo.centavos / 100 : 0;
  }

  return {
    /**
     * Pede a vez de uma resposta. Quem entra PRECISA chamar `sair()` no fim (com sucesso, erro ou visitante que fechou a aba).
     * A recusa nao conta como mensagem.
     * @returns {{ ok: true, sair: () => void } | { ok: false, motivo: "ocupada" | "sessao" | "ip" | "lotado" }}
     */
    entrar(sessaoId, ip) {
      const instante = agora();
      faxina(instante);
      if (ativas.has(sessaoId)) return { ok: false, motivo: "ocupada" };
      if (centavos(custoDaSessaoHoje(sessaoId, instante)) >= centavos(limites.brlPorSessaoPorDia)) return { ok: false, motivo: "sessao" };
      const daSessao = recentes(porSessao, sessaoId, instante);
      if (daSessao.length >= limites.mensagensPorSessaoPorHora) return { ok: false, motivo: "sessao" };
      const doIp = recentes(porIp, ip, instante);
      if (doIp.length >= limites.mensagensPorIpPorHora) return { ok: false, motivo: "ip" };
      if (ativas.size >= limites.respostasAoMesmoTempo) return { ok: false, motivo: "lotado" };

      porSessao.set(sessaoId, [...daSessao, instante]);
      porIp.set(ip, [...doIp, instante]);
      ativas.add(sessaoId);
      let saiu = false;
      return {
        ok: true,
        sair() {
          if (saiu) return;
          saiu = true;
          ativas.delete(sessaoId);
        },
      };
    },
    /** O que a resposta custou, somado ao dia do visitante (o teto de R$ por visitante por dia). */
    somarCusto(sessaoId, brl) {
      const instante = agora();
      const hoje = Math.floor(instante / UM_DIA_MS);
      const atual = custos.get(sessaoId);
      custos.set(sessaoId, { dia: hoje, centavos: (atual && atual.dia === hoje ? atual.centavos : 0) + centavos(brl || 0) });
    },
    custoDaSessaoHoje: (sessaoId) => custoDaSessaoHoje(sessaoId),
    /**
     * Pede uma consulta de pedido. A recusa NAO conta; a consulta aceita conta no IP (achou ou nao).
     * @returns {{ ok: true } | { ok: false, motivo: "sessao" | "ip" }}
     */
    consultarPedido(sessaoId, ip) {
      const instante = agora();
      faxina(instante);
      if (errosDePedidoHoje(sessaoId, instante) >= LIMITES_DO_PEDIDO.errosPorSessaoPorDia) return { ok: false, motivo: "sessao" };
      const doIp = recentes(pedidosPorIp, ip, instante);
      if (doIp.length >= LIMITES_DO_PEDIDO.consultasPorIpPorHora) return { ok: false, motivo: "ip" };
      pedidosPorIp.set(ip, [...doIp, instante]);
      return { ok: true };
    },
    /** Pede a vez de mandar um arquivo; a aceita ja conta. @returns {boolean} */
    registrarAnexo(sessaoId) {
      const instante = agora();
      faxina(instante);
      const hoje = Math.floor(instante / UM_DIA_MS);
      const atual = anexos.get(sessaoId);
      const usados = atual && atual.dia === hoje ? atual.anexos : 0;
      if (usados >= ANEXOS_POR_SESSAO_POR_DIA) return false;
      anexos.set(sessaoId, { dia: hoje, anexos: usados + 1 });
      return true;
    },
    /** O pedido nao foi achado: conta um erro do visitante no dia. */
    anotarErroDePedido(sessaoId) {
      const instante = agora();
      errosDePedido.set(sessaoId, { dia: Math.floor(instante / UM_DIA_MS), erros: errosDePedidoHoje(sessaoId, instante) + 1 });
    },
    /** Quantas respostas estao em andamento agora (o sinal de vida do servico mostra). */
    emAndamento: () => ativas.size,
  };
}
