import { dataEmSaoPaulo } from "@/lib/coleta/fotos";
import { prisma } from "@/lib/db";

import { clienteML } from "./cliente";
import { relerCatalogoDoProduto } from "./concorrentes";
import { relerReferenciasDoProduto } from "./referencias";

/**
 * A rodada diaria dos concorrentes do ML pelo catalogo (spec 2026-10-21-concorrentes-ml-catalogo-design.md, 7.5). O
 * worker normal a chama de hora em hora; ela roda de verdade uma vez por dia de Sao Paulo
 * (`ConfigCanal.mlConcorrentesRelidosEm`). Uma leitura por produto acompanhado, com uma pausa entre eles.
 *
 * 429 (cota) ou 401 (token) param a rodada na hora e NAO gravam a data: a hora seguinte tenta de novo, e o que ja foi
 * gravado fica. Outro erro conta como falha daquele produto e a rodada segue. Nunca lanca.
 */

const ESPERA_ENTRE_CATALOGOS_MS = 300;
const PARA_A_RODADA = new Set([401, 429]);

const mesmoDia = (a, b) => {
  const x = dataEmSaoPaulo(a);
  const y = dataEmSaoPaulo(b);
  return x.ano === y.ano && x.mes === y.mes && x.dia === y.dia;
};
const esperar = (ms) => (ms > 0 ? new Promise((resolver) => setTimeout(resolver, ms)) : Promise.resolve());

/**
 * O catalogo do anuncio (se houver) e depois as referencias. 401/429 de qualquer um voltam com o `status` (a rodada para);
 * outra falha das referencias faz o produto contar como falha, mas so depois de reler todas.
 */
async function relerProduto(ml, produto, { agora, espera }) {
  if (produto.mlCatalogoId) {
    const catalogo = await relerCatalogoDoProduto(ml, produto.id, { agora });
    if (!catalogo.ok && PARA_A_RODADA.has(catalogo.status)) return catalogo;
    const referencias = await relerReferenciasDoProduto(ml, produto.id, { agora, espera });
    if (!referencias.ok && PARA_A_RODADA.has(referencias.status)) return referencias;
    return catalogo.ok ? referencias : catalogo;
  }
  return relerReferenciasDoProduto(ml, produto.id, { agora, espera });
}

/**
 * @param {{ cliente?, agora?: Date, forcar?: boolean, espera?: number, produtos?: string[] }} [opcoes] `produtos` limita a
 *   rodada a esses ids (o teste, num banco compartilhado).
 * @returns {Promise<{ rodou: boolean, motivo?: string, produtos: number, ok: number, falhas: number, parou?: string }>}
 */
export async function relerConcorrentesML({ cliente, agora = new Date(), forcar = false, espera = ESPERA_ENTRE_CATALOGOS_MS, produtos } = {}) {
  try {
    const config = await prisma.configCanal.findUnique({ where: { canal: "MERCADO_LIVRE" }, select: { mlConcorrentesRelidosEm: true } });
    if (!forcar && config?.mlConcorrentesRelidosEm && mesmoDia(config.mlConcorrentesRelidosEm, agora)) {
      return { rodou: false, motivo: "já rodou hoje", produtos: 0, ok: 0, falhas: 0 };
    }

    // Os catalogos de referencia do ranking (spec 2026-10-23) entram na mesma rodada: produto so com referencias, sem
    // catalogo do anuncio, tambem e relido.
    const acompanhados = await prisma.produto.findMany({
      where: { OR: [{ mlCatalogoId: { not: null } }, { referenciasML: { some: {} } }], ...(Array.isArray(produtos) ? { id: { in: produtos } } : {}) },
      select: { id: true, mlCatalogoId: true },
      orderBy: { id: "asc" },
    });
    const ml = cliente ?? clienteML();
    let ok = 0;
    let falhas = 0;
    for (const [indice, produto] of acompanhados.entries()) {
      if (indice > 0) await esperar(espera);
      // Erro do banco num produto (a transacao estoura) conta como falha dele: nao pode derrubar a rodada dos outros.
      const resultado = await relerProduto(ml, produto, { agora, espera }).catch((erro) => ({ ok: false, erro: erro?.message ?? String(erro), status: null }));
      if (resultado.ok) {
        ok += 1;
        continue;
      }
      if (PARA_A_RODADA.has(resultado.status)) {
        return { rodou: true, produtos: acompanhados.length, ok, falhas, parou: resultado.erro ?? `HTTP ${resultado.status}` };
      }
      falhas += 1;
    }

    await prisma.configCanal.upsert({
      where: { canal: "MERCADO_LIVRE" },
      create: { canal: "MERCADO_LIVRE", mlConcorrentesRelidosEm: agora },
      update: { mlConcorrentesRelidosEm: agora },
    });
    return { rodou: true, produtos: acompanhados.length, ok, falhas };
  } catch (erro) {
    return { rodou: false, motivo: "erro", erro: erro?.message ?? String(erro), produtos: 0, ok: 0, falhas: 0 };
  }
}
