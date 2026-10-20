/**
 * A rodada semanal da coleta (20/10/2026): todo SABADO as 00:00, horario de Sao Paulo. Sem imports: serve ao worker, a tela
 * e ao teste.
 *
 * Quando o worker esta desligado no sabado, a rodada sai na primeira volta depois que ele voltar, ate o fim do domingo
 * (`JANELA_DA_RODADA_HORAS`). Passado isso, espera o proximo sabado: ligar o worker numa quarta nao dispara uma varredura
 * de todas as lojas sem ninguem ter pedido.
 */

const FUSO = "America/Sao_Paulo";
export const JANELA_DA_RODADA_HORAS = 48;

const DIAS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function partesEmSaoPaulo(instante) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: FUSO,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      weekday: "short",
    })
      .formatToParts(instante)
      .map((parte) => [parte.type, parte.value]),
  );
  return { ano: Number(partes.year), mes: Number(partes.month), dia: Number(partes.day), hora: Number(partes.hour), semana: DIAS[partes.weekday] };
}

/** O instante em que e meia-noite em Sao Paulo no dia `ano-mes-dia` (o Brasil nao tem horario de verao hoje, mas confere). */
function meiaNoiteEmSaoPaulo(ano, mes, dia) {
  let instante = Date.UTC(ano, mes - 1, dia, 3, 0, 0);
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { hora } = partesEmSaoPaulo(new Date(instante));
    if (hora === 0) break;
    instante += (hora > 12 ? 24 - hora : -hora) * 3600 * 1000;
  }
  return new Date(instante);
}

/**
 * O sabado 00:00 mais recente (hoje, se hoje e sabado), com a chave "AAAA-MM-DD" desse sabado.
 *
 * @returns {{ chave: string, inicio: Date }}
 */
export function ultimoSabado(agora = new Date()) {
  const hoje = partesEmSaoPaulo(agora);
  const atras = (hoje.semana - 6 + 7) % 7;
  // Meio-dia UTC do dia de hoje em SP, menos os dias que faltam para o sabado: a data certa sem ficar presa a hora.
  const referencia = new Date(Date.UTC(hoje.ano, hoje.mes - 1, hoje.dia, 12) - atras * 86400000);
  const ano = referencia.getUTCFullYear();
  const mes = referencia.getUTCMonth() + 1;
  const dia = referencia.getUTCDate();
  const chave = `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  return { chave, inicio: meiaNoiteEmSaoPaulo(ano, mes, dia) };
}

/**
 * A rodada que esta devida agora, ou null: o sabado mais recente ja comecou e ainda esta dentro da janela.
 *
 * @returns {{ chave: string, inicio: Date } | null}
 */
export function rodadaDevida(agora = new Date(), janelaHoras = JANELA_DA_RODADA_HORAS) {
  const sabado = ultimoSabado(agora);
  const passou = (agora.getTime() - sabado.inicio.getTime()) / 3600000;
  return passou >= 0 && passou < janelaHoras ? sabado : null;
}

/** "24/10/2026" a partir da chave "2026-10-24"; chave manual ("manual-...") nao tem data propria. */
export function dataDaChave(chave) {
  const achado = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(chave ?? ""));
  return achado ? `${achado[3]}/${achado[2]}/${achado[1]}` : null;
}

/** O proximo sabado 00:00 (o de hoje so conta enquanto ainda nao comecou). */
export function proximoSabado(agora = new Date()) {
  const ultimo = ultimoSabado(agora);
  if (ultimo.inicio.getTime() > agora.getTime()) return ultimo.inicio;
  const seguinte = ultimoSabado(new Date(ultimo.inicio.getTime() + 8 * 86400000));
  return seguinte.inicio;
}
