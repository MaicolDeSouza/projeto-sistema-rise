import { prisma } from "@/lib/db";

import { gravarPublicacao } from "./banco";
import { clienteML } from "./cliente";
import { situacaoDoItem } from "./respostas";

/**
 * Anuncios publicados SEM ESTOQUE (Opcao 2 do dono em 24/10/2026): o Publicar os deixa pausados e marcados
 * `dados.publicacao.aguardandoEstoque`, e esta rotina, chamada pelo worker de hora em hora, os ativa quando o ML ja
 * mostra estoque no anuncio (o Bling manda o estoque ao ML; o Rise nao mexe na quantidade). So mexe nos marcados: um
 * anuncio que o dono pausou de proposito nunca e ativado por aqui. Ativo ou encerrado no ML, a marca sai.
 *
 * Nunca lanca. 401 ou 429 do ML param a rodada (a proxima hora tenta de novo). Passa pelas travas de escrita do ML.
 *
 * @returns {Promise<{ conferidos: number, ativados: number, falhas: number, parou?: string }>}
 */
export async function ativarAnunciosAguardandoEstoque({ ml = clienteML(), limite = 50 } = {}) {
  const resultado = { conferidos: 0, ativados: 0, falhas: 0 };
  let anuncios;
  try {
    anuncios = await prisma.anuncio.findMany({
      where: { canal: "MERCADO_LIVRE", status: "PUBLICADO", dados: { path: ["publicacao", "aguardandoEstoque"], equals: true } },
      select: { id: true, idExterno: true, dados: true, produto: { select: { sku: true } } },
      take: limite,
    });
  } catch (erro) {
    console.error("[ml aguardando estoque] leitura:", erro.message);
    return { ...resultado, falhas: 1 };
  }

  for (const anuncio of anuncios) {
    const itemId = anuncio.dados?.publicacao?.itemId ?? anuncio.idExterno;
    if (!itemId) continue;
    resultado.conferidos++;
    try {
      const lido = await ml.get(`/items/${itemId}`);
      if (lido.status === 401 || lido.status === 429) return { ...resultado, parou: `HTTP ${lido.status}` };
      if (!lido.ok) {
        resultado.falhas++;
        continue;
      }
      const status = lido.dados?.status;
      if (status === "paused" && Number(lido.dados?.available_quantity) > 0) {
        // No kit o codigo liberado e o do kit; no anuncio simples, o SKU do produto.
        ml.exigirEscrita(anuncio.dados?.composicao?.codigo ?? anuncio.produto?.sku ?? "");
        const resposta = await ml.put(`/items/${itemId}`, { status: "active" });
        if (resposta.status === 401 || resposta.status === 429) return { ...resultado, parou: `HTTP ${resposta.status}` };
        if (!resposta.ok) {
          resultado.falhas++;
          continue;
        }
        const novo = resposta.dados?.status ?? "active";
        await gravarPublicacao(anuncio.id, { statusML: novo, aguardandoEstoque: false }, { situacaoCanal: situacaoDoItem(novo) });
        resultado.ativados++;
      } else if (status && status !== "paused") {
        // Ativado por outro caminho (no painel do ML) ou encerrado: nao ha mais o que esperar.
        await gravarPublicacao(anuncio.id, { statusML: status, aguardandoEstoque: false }, { situacaoCanal: situacaoDoItem(status) });
      }
    } catch (erro) {
      console.error(`[ml aguardando estoque] ${itemId}:`, erro.message);
      resultado.falhas++;
    }
  }
  return resultado;
}
