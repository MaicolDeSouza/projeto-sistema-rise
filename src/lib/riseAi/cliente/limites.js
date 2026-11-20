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

  const recentes = (mapa, chave, instante) => (mapa.get(chave) ?? []).filter((quando) => quando > instante - UMA_HORA_MS);

  function faxina(instante) {
    for (const mapa of [porSessao, porIp]) {
      if (mapa.size <= FAXINA_A_PARTIR_DE) continue;
      for (const [chave, instantes] of mapa) if (!instantes.some((quando) => quando > instante - UMA_HORA_MS)) mapa.delete(chave);
    }
    if (custos.size > FAXINA_A_PARTIR_DE) {
      const hoje = Math.floor(instante / UM_DIA_MS);
      for (const [chave, custo] of custos) if (custo.dia !== hoje) custos.delete(chave);
    }
  }

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
    /** Quantas respostas estao em andamento agora (o sinal de vida do servico mostra). */
    emAndamento: () => ativas.size,
  };
}
