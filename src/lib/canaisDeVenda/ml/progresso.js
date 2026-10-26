import { ETAPAS_DO_ENVIO_ML } from "./etapasDoEnvio";

/**
 * O andamento do "Enviar ao ML", etapa por etapa, para o popup do editor (pedido do dono em 26/10/2026, igual ao da LI:
 * `li/progresso.js`). O envio marca aqui o que esta fazendo e a tela consulta a rota `/api/mercado-livre/progresso/<id>` (uma
 * Server Action nao serve: elas rodam uma de cada vez, e a consulta esperaria o envio terminar).
 *
 * Na MEMORIA do processo, no `globalThis` (o Next carrega a lib uma vez para a Server Action e outra para a rota). A chave e o
 * anuncio: so um envio por anuncio roda de cada vez (`emAndamento`). Nada vai ao banco. Etapas do servidor = todas menos
 * "conferir", que e a releitura da tela.
 */

const CHAVE = Symbol.for("rise.progressoDoEnvioAoML");
const mapa = (globalThis[CHAVE] ??= new Map());
/// Numera cada envio: a tela so confia no andamento de numero maior que o de antes de enviar.
const SEQUENCIA = Symbol.for("rise.progressoDoEnvioAoML.sequencia");
globalThis[SEQUENCIA] ??= 0;

const VALIDADE_MS = 15 * 60 * 1000;

/** Abre o andamento de um envio e devolve as marcas que o envio usa. */
export function iniciarProgressoML(anuncioId) {
  const agora = Date.now();
  for (const [chave, item] of mapa) if (agora - item.em > VALIDADE_MS) mapa.delete(chave);

  globalThis[SEQUENCIA] += 1;
  const item = {
    numero: globalThis[SEQUENCIA],
    em: agora,
    etapas: ETAPAS_DO_ENVIO_ML.filter((etapa) => etapa.id !== "conferir").map((etapa) => ({ id: etapa.id, estado: "espera", detalhe: null })),
    terminou: false,
  };
  mapa.set(String(anuncioId), item);

  const etapa = (id) => item.etapas.find((candidata) => candidata.id === id);
  return {
    andando(id) {
      const alvo = etapa(id);
      if (alvo) alvo.estado = "andando";
    },
    feita(id, detalhe = null) {
      const alvo = etapa(id);
      if (!alvo) return;
      alvo.estado = "feito";
      alvo.detalhe = detalhe;
    },
    /// A que estava andando falhou (sem nenhuma andando, a primeira que ainda esperava). Uma que ja falhou nao e sobrescrita.
    falhou(motivo) {
      if (item.etapas.some((candidata) => candidata.estado === "falhou")) return;
      const alvo = item.etapas.find((candidata) => candidata.estado === "andando") ?? item.etapas.find((candidata) => candidata.estado === "espera") ?? item.etapas.at(-1);
      alvo.estado = "falhou";
      alvo.detalhe = motivo;
    },
    fim() {
      item.terminou = true;
    },
  };
}

/** O andamento atual do anuncio, ou null se nenhum envio foi aberto (ou ja passou da validade). */
export function lerProgressoML(anuncioId) {
  const item = mapa.get(String(anuncioId));
  if (!item || Date.now() - item.em > VALIDADE_MS) return null;
  return { numero: item.numero, terminou: item.terminou, etapas: item.etapas.map((etapa) => ({ ...etapa })) };
}
