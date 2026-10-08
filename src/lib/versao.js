/**
 * Versao do Rise mostrada no pe do menu. Sem imports: e lido pelo next.config.mjs (no build), pela barra
 * lateral e pelo teste.
 *
 * A versao e a HORA DO DEPLOY no formato DD.MM.AAAA.HH.MM (pedido do dono em 07/10/2026), carimbada pelo
 * script de deploy da VPS e repetida na tag do git (vps-DD.MM.AAAA.HH.MM). Sem ela o processo e uma copia
 * de desenvolvimento, e a tela diz "dev": numero inventado no PC faria a copia parecer a producao.
 */

const FORMATO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  // Sem isto alguns motores escrevem a meia-noite como "24".
  hourCycle: "h23",
});

/// A hora de Sao Paulo, e nao a do servidor: a VPS pode estar em UTC, e o dono le a versao no relogio dele.
export function formatarVersao(data) {
  const partes = Object.fromEntries(FORMATO.formatToParts(data).map((parte) => [parte.type, parte.value]));
  return `${partes.day}.${partes.month}.${partes.year}.${partes.hour}.${partes.minute}`;
}

function texto(valor) {
  const limpo = typeof valor === "string" ? valor.trim() : "";
  return limpo || null;
}

/// Le RISE_VERSAO e RISE_COMMIT do ambiente do build. Variavel em branco conta como ausente.
export function versaoDoDeploy(env) {
  return {
    versao: texto(env?.RISE_VERSAO) ?? "dev",
    commit: texto(env?.RISE_COMMIT),
  };
}
