/**
 * Provedor de IA FALSO para os testes do Rise AI: segue o contrato dos provedores (`src/lib/riseAi/provedores`), mas
 * responde por um roteiro em memória. Sem rede e sem processo. NÃO importa nada de `src/` — o teste também prova que o
 * laço da conversa só depende do contrato, não de um adaptador.
 *
 * Cada item do `roteiro` responde a UMA chamada de `conversar`, na ordem:
 *   { texto?, chamadas?: [{ nome, argumentos } | { malformada: true }], uso?, atrasoMs?,
 *     erro?: "conexao" | "autenticacao" | ..., erroDepoisDoTexto?: "conexao" | ... }
 * Roteiro esgotado responde um texto fixo. `pedidos` guarda uma CÓPIA do que cada chamada recebeu (o laço acrescenta
 * mensagens à mesma lista ao longo das rodadas).
 */

/** Erro no formato que o laço reconhece (o `ErroDoProvedor` real tem o mesmo `tipo`). */
function erroFalso(tipo) {
  return Object.assign(new Error(`provedor falso: ${tipo}`), { name: "ErroDoProvedor", tipo, status: null });
}

/** Espera `ms`, mas desiste (como o provedor real) se o sinal de cancelamento disparar. */
function esperar(ms, sinal) {
  return new Promise((resolver, rejeitar) => {
    const aoCancelar = () => {
      clearTimeout(relogio);
      rejeitar(erroFalso("tempo"));
    };
    const relogio = setTimeout(() => {
      sinal?.removeEventListener("abort", aoCancelar);
      resolver();
    }, ms);
    if (sinal?.aborted) return aoCancelar();
    sinal?.addEventListener("abort", aoCancelar, { once: true });
  });
}

export function criarProvedorFalso({ id = "falso", roteiro = [] } = {}) {
  const pedidos = [];
  let proximo = 0;

  return {
    id,
    rotulo: id,
    endpoint: `falso://${id}`,
    pedidos,
    async listarModelos() {
      return [{ id: "falso-1", nome: "falso-1" }];
    },
    async testar() {
      return { ok: true, latenciaMs: 1, modelos: [{ id: "falso-1", nome: "falso-1" }], erro: null };
    },
    async conversar(pedido) {
      pedidos.push(structuredClone({ modelo: pedido.modelo, sistema: pedido.sistema, mensagens: pedido.mensagens, ferramentas: pedido.ferramentas ?? [] }));
      const passo = roteiro[proximo] ?? { texto: "### Resposta para o cliente\n(fim do roteiro)" };
      const numero = ++proximo;

      if (passo.atrasoMs) await esperar(passo.atrasoMs, pedido.sinal);
      if (passo.erro) throw erroFalso(passo.erro);

      // O texto chega em dois pedaços, como o fluxo de verdade.
      if (passo.texto) {
        const meio = Math.ceil(passo.texto.length / 2);
        pedido.aoTexto?.(passo.texto.slice(0, meio));
        pedido.aoTexto?.(passo.texto.slice(meio));
      }
      if (passo.erroDepoisDoTexto) throw erroFalso(passo.erroDepoisDoTexto);

      const chamadasDeFerramenta = (passo.chamadas ?? []).map((chamada, indice) =>
        chamada.malformada
          ? { id: `quebrada_${numero}_${indice}`, nome: "buscarProdutos", argumentos: {}, malformada: true, bruto: '{"termos": ' }
          : { id: `chamada_${numero}_${indice}`, nome: chamada.nome, argumentos: chamada.argumentos ?? {} },
      );
      return {
        texto: passo.texto ?? "",
        chamadasDeFerramenta,
        uso: passo.uso ?? { entrada: 100, saida: 20 },
        motivoParada: chamadasDeFerramenta.length ? "ferramenta" : "fim",
        modelo: pedido.modelo,
      };
    },
  };
}
