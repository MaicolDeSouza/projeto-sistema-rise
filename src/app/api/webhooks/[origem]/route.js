import { conferirNotificacao, ORIGEM_DA_ROTA, registrarNotificacao, segredosDosWebhooks } from "@/lib/pedidos/webhooks";

export const dynamic = "force-dynamic";

const LIMITE_BYTES = 256 * 1024;
const resposta = (status, corpo) => Response.json(corpo, { status });

/**
 * As notificacoes do ML, do Bling e da LI (fase 2 dos Pedidos de venda, spec 5.11). Rota PUBLICA (fora do login, como o
 * /mcp e a extensao do AliExpress; excecao `@webhooks` no Caddyfile): confere quem mandou (`conferirNotificacao(`) e so
 * grava a linha na fila. Nao le o canal nem o pedido aqui: o ML exige resposta em menos de 500 ms e o Bling em 5 s; quem
 * le e o worker, a cada volta.
 */
export async function POST(requisicao, { params }) {
  const { origem: rota } = await params;
  const origem = ORIGEM_DA_ROTA[rota];
  if (!origem) return resposta(404, { erro: "Canal desconhecido." });
  if (Number(requisicao.headers.get("content-length") ?? 0) > LIMITE_BYTES) return resposta(413, { erro: "Corpo acima de 256 KB." });

  const corpoTexto = await requisicao.text();
  if (corpoTexto.length > LIMITE_BYTES) return resposta(413, { erro: "Corpo acima de 256 KB." });

  const conferida = conferirNotificacao({ origem, corpoTexto, headers: requisicao.headers, segredos: await segredosDosWebhooks() });
  if (!conferida.ok) return resposta(conferida.status, { erro: conferida.erro });

  await registrarNotificacao({ origem, recurso: conferida.recurso, payload: conferida.payload });
  return resposta(200, { ok: true });
}
