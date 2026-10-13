import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { pararResposta } from "@/lib/riseAi/paradas";
import { envioDoProprioRise } from "@/lib/sessao";

/**
 * `POST /api/rise-ai/parar`: o botão Parar do chat (spec §5). Pede para a resposta em andamento da conversa terminar AGORA:
 * o que já foi escrito fica gravado, marcado "interrompida". É um pedido EXPLÍCITO — fechar a conexão (recarregar a página)
 * não para nada.
 *
 * Mesmas portas da rota `conversar`: só o envio do próprio Rise (`Origin` igual ao `Host`), e quem tem o recurso "Rise AI ›
 * Chat" em editar (senão 403 sem corpo). Só a DONA da conversa para a resposta dela: para qualquer outra pessoa, e para uma
 * conversa que não existe ou não está respondendo, a resposta é a mesma (`{ parou: false }`), sem revelar qual.
 */

export const dynamic = "force-dynamic";

export async function POST(pedido) {
  const origem = {
    origin: pedido.headers.get("origin"),
    host: pedido.headers.get("host"),
    secFetchSite: pedido.headers.get("sec-fetch-site"),
  };
  if (!envioDoProprioRise(origem)) {
    return new Response("Pedido recusado: o chat só aceita o envio do próprio Rise.", { status: 403 });
  }

  const acesso = await sessaoDeAcessos();
  if (!acesso.pode("riseAi.chat", "editar")) return recusarRota();

  let corpo = null;
  try {
    corpo = await pedido.json();
  } catch {
    // corpo ausente ou quebrado: nada a parar
  }
  const conversaId = typeof corpo?.conversaId === "string" ? corpo.conversaId : "";
  return Response.json(pararResposta(conversaId, { usuario: acesso.login ?? "desconhecido" }));
}
