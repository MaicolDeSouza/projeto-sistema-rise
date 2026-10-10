/**
 * Quem esta usando o Rise, para o rodape do menu e o botao "Sair" (pedido do dono em 10/10/2026).
 *
 * Na VPS o login e o Tinyauth, na frente de tudo: o Caddy apaga qualquer Remote-* que venha de fora e so o
 * `forward_auth` grava o `Remote-User` verdadeiro (deploy/caddy/Caddyfile). O Rise so LE esse nome; quem decide se a
 * pessoa entra continua sendo o login. No PC nao ha login nem Caddy: o rodape diz isso, sem botao "Sair".
 *
 * SEM imports: lido pelo layout, pela rota /api/sair e pelo teste (`npm run teste:vps`).
 */

/** Na VPS (a imagem de producao carrega RISE_PRODUCAO=1) ou no PC de desenvolvimento. */
export function ambienteDoRise(env) {
  const valor = String(env?.RISE_PRODUCAO ?? "").trim();
  return valor !== "" && valor !== "0" ? "vps" : "pc";
}

/**
 * `{ambiente, nome}` para o menu. O nome vem do `Remote-User` so na VPS (no PC qualquer um na rede local poderia
 * mandar o cabecalho); curto e sem caractere de controle, porque vai para a tela.
 */
export function sessaoDoRise(cabecalhos, env) {
  const ambiente = ambienteDoRise(env);
  if (ambiente !== "vps") return { ambiente, nome: null };
  const bruto = typeof cabecalhos?.get === "function" ? cabecalhos.get("remote-user") : null;
  const nome = String(bruto ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 60);
  return { ambiente, nome: nome || null };
}

/** A letra do circulo do usuario: a primeira letra do nome, maiuscula ("Maicol" -> "M"). */
export function inicialDoNome(nome) {
  const letra = String(nome ?? "").trim().charAt(0);
  return letra ? letra.toLocaleUpperCase("pt-BR") : "?";
}

/**
 * O "Sair" e um formulario que faz POST para /api/sair. A rota so aceita o envio vindo do proprio Rise: sem isso,
 * qualquer pagina poderia deslogar o dono com um formulario escondido. Vale o `Origin` (os navegadores mandam em todo
 * POST de formulario); sem ele, o `Sec-Fetch-Site` tem que dizer "same-origin".
 */
export function envioDoProprioRise({ origin, host, secFetchSite }) {
  const hostAtual = String(host ?? "").trim().toLowerCase();
  if (!hostAtual) return false;
  if (origin && origin !== "null") {
    try {
      return new URL(origin).host.toLowerCase() === hostAtual;
    } catch {
      return false;
    }
  }
  return String(secFetchSite ?? "").toLowerCase() === "same-origin";
}
