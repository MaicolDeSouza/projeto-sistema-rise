import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { responder } from "@/lib/riseAi/conversa";
import { fluxoDeEventos } from "@/lib/riseAi/sse";
import { envioDoProprioRise } from "@/lib/sessao";

/**
 * `POST /api/rise-ai/conversar`: o chat. Responde um fluxo de eventos (Server-Sent Events) — o texto aparece à medida
 * que o modelo escreve, e os eventos de ferramenta e de reserva dizem o que está acontecendo (spec §5.4). Server Action
 * não serve para fluxo; por isso a rota.
 *
 * Fica atrás do login do Caddy (só `/api/arquivos` é público) e, como `/api/sair`, só aceita o envio do próprio Rise
 * (`Origin` igual ao `Host`): outra página não consegue fazer o navegador de quem está logado perguntar à IA.
 * O dono da conversa é o nome do login; quem manda `usuario` no corpo é ignorado. Sem o recurso "Rise AI › Chat" em
 * editar (Acessos), 403 sem corpo.
 */

export const dynamic = "force-dynamic";

const CABECALHOS_DO_FLUXO = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  Connection: "keep-alive",
  // O Caddy e outros proxies não seguram o fluxo para "otimizar": cada pedaço de texto sai na hora.
  "X-Accel-Buffering": "no",
};

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

  let corpo;
  try {
    corpo = await pedido.json();
  } catch {
    return new Response("Pedido inválido.", { status: 400 });
  }
  const texto = typeof corpo?.texto === "string" ? corpo.texto : "";
  const conversaId = typeof corpo?.conversaId === "string" && corpo.conversaId ? corpo.conversaId : null;
  const usuario = acesso.login ?? "desconhecido";

  const fluxo = fluxoDeEventos(async (enviar) => {
    // As ferramentas seguem os dados sensiveis de quem pergunta (Acessos): se ve custo na tela, ve custo no chat.
    await responder({ conversaId, texto, usuario, pode: acesso.pode, aoEvento: enviar });
  });
  return new Response(fluxo, { headers: CABECALHOS_DO_FLUXO });
}
