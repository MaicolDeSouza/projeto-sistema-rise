import { lerDoLote } from "@/lib/imagens/lote";

const CONTEUDO = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * Serve as fotos do lote de um produto que ainda nao foi salvo:
 * dados/temporarios/<lote>/<pasta>/<nome>, com pasta em imagens, originais ou previas.
 *
 * Os tres segmentos sao validados ANTES de o disco ser tocado (`lerDoLote` recusa lote que
 * nao e UUID, pasta fora da lista e nome fora do formato que o sistema gera). Sem isso, um
 * caminho como "../../.env" viraria leitura de arquivo arbitrario.
 *
 * SEM cache: o nome da foto padronizada continua o mesmo depois de "Melhorar" ou "Voltar
 * ao original", e o navegador mostraria a versao velha.
 */
export async function GET(_requisicao, { params }) {
  const { caminho } = await params;

  if (!Array.isArray(caminho) || caminho.length !== 3) {
    return new Response("Caminho invalido.", { status: 400 });
  }

  const [lote, pasta, nome] = caminho;
  const bytes = await lerDoLote(lote, pasta, nome);
  if (!bytes) return new Response("Arquivo nao encontrado.", { status: 404 });

  const extensao = nome.slice(nome.lastIndexOf(".") + 1);
  return new Response(bytes, {
    headers: {
      "Content-Type": CONTEUDO[extensao] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    },
  });
}
