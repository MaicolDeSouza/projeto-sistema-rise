import { ETAPAS_DO_ENVIO } from "@/lib/blingSync/apresentacao";

/**
 * O andamento do Sincronizar e do Cadastrar, etapa por etapa, para o popup da janela do Bling. O envio marca aqui o que
 * esta fazendo e a tela consulta a rota `/api/bling/progresso/<id>` a cada instante (uma Server Action nao serve: elas
 * rodam uma de cada vez, e a consulta esperaria o envio terminar).
 *
 * Fica na MEMORIA do processo, no `globalThis`: o Next carrega a lib uma vez para a Server Action e outra para a rota, e
 * um `Map` de modulo seriam dois mapas. So um envio por produto roda de cada vez (`umPorVez`), entao a chave e o produto.
 * Nada daqui vai ao banco, e uma queda do servidor no meio do envio apenas faz o popup perder o andamento (o resultado
 * continua vindo da propria acao).
 *
 * Etapas do servidor = as de `ETAPAS_DO_ENVIO` menos "conferir", que e a releitura da tela.
 */

const CHAVE = Symbol.for("rise.progressoDoEnvioAoBling");
const mapa = (globalThis[CHAVE] ??= new Map());
/// Numera cada envio aberto: a tela guarda o numero de ANTES de enviar e so confia no andamento de numero maior, para nunca
/// mostrar como seu o andamento de um envio anterior (a acao pode ser recusada antes de abrir o dela).
const SEQUENCIA = Symbol.for("rise.progressoDoEnvioAoBling.sequencia");
globalThis[SEQUENCIA] ??= 0;

const VALIDADE_MS = 15 * 60 * 1000;

/** Abre o andamento de um envio e devolve as quatro marcas que o envio usa. */
export function iniciarProgresso(produtoId, tipo) {
  const agora = Date.now();
  for (const [chave, item] of mapa) if (agora - item.em > VALIDADE_MS) mapa.delete(chave);

  globalThis[SEQUENCIA] += 1;
  const item = {
    numero: globalThis[SEQUENCIA],
    tipo,
    em: agora,
    etapas: ETAPAS_DO_ENVIO[tipo].filter((etapa) => etapa.id !== "conferir").map((etapa) => ({ id: etapa.id, estado: "espera", detalhe: null })),
    atual: null,
    terminou: false,
  };
  mapa.set(String(produtoId), item);

  const etapa = (id) => item.etapas.find((candidata) => candidata.id === id);
  return {
    andando(id) {
      const alvo = etapa(id);
      if (!alvo) return;
      alvo.estado = "andando";
      item.atual = id;
    },
    feita(id, detalhe = null) {
      const alvo = etapa(id);
      if (!alvo) return;
      alvo.estado = "feito";
      alvo.detalhe = detalhe;
    },
    /// A etapa que estava andando falhou; as seguintes ficam em espera.
    falhou(motivo) {
      const alvo = etapa(item.atual) ?? item.etapas[0];
      alvo.estado = "falhou";
      alvo.detalhe = motivo;
    },
    fim() {
      item.terminou = true;
    },
  };
}

/** O andamento atual do produto, ou null se nenhum envio foi aberto (ou ja passou da validade). */
export function lerProgresso(produtoId) {
  const item = mapa.get(String(produtoId));
  if (!item || Date.now() - item.em > VALIDADE_MS) return null;
  return { numero: item.numero, tipo: item.tipo, terminou: item.terminou, etapas: item.etapas.map((etapa) => ({ ...etapa })) };
}
