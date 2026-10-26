import { ETAPAS_DO_ENVIO_LI } from "./apresentacao";

/**
 * O andamento do Sincronizar e do Cadastrar da Loja Integrada, etapa por etapa, para o popup do editor (pedido do dono em
 * 26/10/2026, igual ao do Bling: `blingSync/progresso.js`). O envio marca aqui o que esta fazendo e a tela consulta a rota
 * `/api/loja-integrada/progresso/<id>` a cada instante (uma Server Action nao serve: elas rodam uma de cada vez, e a consulta
 * esperaria o envio terminar).
 *
 * Fica na MEMORIA do processo, no `globalThis` (o Next carrega a lib uma vez para a Server Action e outra para a rota, e um
 * `Map` de modulo seriam dois mapas). So um envio por produto roda de cada vez (`umPorVez`), entao a chave e o produto. Nada vai
 * ao banco; uma queda do servidor no meio do envio so faz o popup perder o andamento (o resultado vem da propria acao).
 *
 * Etapas do servidor = as de `ETAPAS_DO_ENVIO_LI` menos "conferir", que e a releitura da tela.
 */

const CHAVE = Symbol.for("rise.progressoDoEnvioALoja");
const mapa = (globalThis[CHAVE] ??= new Map());
/// Numera cada envio aberto: a tela guarda o numero de ANTES de enviar e so confia no andamento de numero maior, para nunca
/// mostrar como seu o andamento de um envio anterior (a acao pode ser recusada antes de abrir o dela).
const SEQUENCIA = Symbol.for("rise.progressoDoEnvioALoja.sequencia");
globalThis[SEQUENCIA] ??= 0;

const VALIDADE_MS = 15 * 60 * 1000;

/** Abre o andamento de um envio e devolve as marcas que o envio usa. */
export function iniciarProgresso(produtoId, tipo) {
  const agora = Date.now();
  for (const [chave, item] of mapa) if (agora - item.em > VALIDADE_MS) mapa.delete(chave);

  globalThis[SEQUENCIA] += 1;
  const item = {
    numero: globalThis[SEQUENCIA],
    tipo,
    em: agora,
    etapas: ETAPAS_DO_ENVIO_LI[tipo].filter((etapa) => etapa.id !== "conferir").map((etapa) => ({ id: etapa.id, estado: "espera", detalhe: null })),
    terminou: false,
  };
  mapa.set(String(produtoId), item);

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
    /// A que estava andando falhou (sem nenhuma andando, a primeira que ainda esperava); as seguintes ficam em espera. Uma etapa que ja
    /// falhou com o motivo nao e sobrescrita.
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

/**
 * Roda um envio com o andamento aberto: o que `executar` devolver com `ok: false` marca a etapa que falhou com o `erro`, uma
 * excecao tambem, e o andamento sempre termina. `executar` recebe as marcas.
 */
export async function comProgresso(produtoId, tipo, executar) {
  const progresso = iniciarProgresso(produtoId, tipo);
  try {
    const resultado = await executar(progresso);
    if (resultado?.ok === false) progresso.falhou(resultado.erro ?? "O envio não foi concluído.");
    return resultado;
  } catch (erro) {
    progresso.falhou(erro?.message ?? "O envio não foi concluído.");
    throw erro;
  } finally {
    progresso.fim();
  }
}

/** O andamento atual do produto, ou null se nenhum envio foi aberto (ou ja passou da validade). */
export function lerProgresso(produtoId) {
  const item = mapa.get(String(produtoId));
  if (!item || Date.now() - item.em > VALIDADE_MS) return null;
  return { numero: item.numero, tipo: item.tipo, terminou: item.terminou, etapas: item.etapas.map((etapa) => ({ ...etapa })) };
}
