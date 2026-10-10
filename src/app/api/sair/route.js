import { ambienteDoRise, envioDoProprioRise } from "@/lib/sessao";

/**
 * "Sair" do menu (pedido do dono em 10/10/2026): encerra a sessao do login e volta para a pagina inicial, que, sem
 * sessao, cai na tela de login do Tinyauth.
 *
 * O login mora em outro conteiner (`auth`), e o cookie da sessao vale para rise.4hobby.com.br inteiro, entao chega
 * aqui. A rota repassa o cookie ao `POST /api/user/logout` do Tinyauth (medido na VPS em 10/10/2026: e esse o
 * caminho; `/logout` e so a pagina dele, que pediria mais um clique) e devolve ao navegador o `Set-Cookie` que ele
 * manda para apagar a sessao. O endereco do login e fixo (rede interna do Docker), nunca vem do pedido.
 *
 * No PC nao ha login: a rota so volta para a pagina inicial.
 */

const LOGIN_INTERNO = process.env.TINYAUTH_INTERNO_URL || "http://auth:3000";

/// `Location: /` relativo: atras do Caddy, o endereco que o Next ve e o do conteiner, nao o publico.
const voltarAoInicio = (cookies = []) => {
  const cabecalhos = new Headers({ Location: "/", "Cache-Control": "no-store" });
  for (const cookie of cookies) cabecalhos.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers: cabecalhos });
};

export async function POST(pedido) {
  if (ambienteDoRise(process.env) !== "vps") return voltarAoInicio();

  const origem = {
    origin: pedido.headers.get("origin"),
    host: pedido.headers.get("host"),
    secFetchSite: pedido.headers.get("sec-fetch-site"),
  };
  if (!envioDoProprioRise(origem)) {
    return new Response("Pedido recusado: o Sair só vale pelo botão do próprio Rise.", { status: 403 });
  }

  let resposta;
  try {
    resposta = await fetch(`${LOGIN_INTERNO}/api/user/logout`, {
      method: "POST",
      headers: { cookie: pedido.headers.get("cookie") ?? "" },
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return new Response("Não consegui encerrar a sessão: o login não respondeu. Tente de novo.", {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  if (!resposta.ok) {
    return new Response(`Não consegui encerrar a sessão: o login respondeu ${resposta.status}. Tente de novo.`, {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return voltarAoInicio(resposta.headers.getSetCookie?.() ?? []);
}
