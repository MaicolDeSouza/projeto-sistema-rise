/**
 * Regras da fila de coleta que o worker e a tela precisam enxergar igual.
 *
 * Fora de acoes.js porque arquivo "use server" so exporta funcao assincrona — uma
 * constante ali faz o Next recusar o modulo inteiro.
 */

/// Job PROCESSANDO sem noticia ha mais que isso e de um worker que morreu.
///
/// O worker grava andamento a cada produto novo, e nem a loja mais lenta — o
/// Eletrogate e o Impacto CNC pedem 10 s entre visitas — passa meia hora sem achar
/// um. Menos que isso arriscaria dar por morto um worker que so esta devagar.
export const ORFAO_APOS_MS = 30 * 60 * 1000;

/// O mesmo, mas na PARTIDA do worker, onde a espera pode ser menor.
///
/// Quem acabou de subir nao esta processando nada, entao job em andamento e de
/// processo que morreu — e o Node morre: o `undici` derrubou o worker inteiro no
/// meio da Casa da Robotica em 16/09/2026, com um assert interno. Esperar meia
/// hora para retomar seria meia hora de noite jogada fora.
///
/// Nao e zero porque pode haver OUTRO worker vivo: dez minutos passam folgado de
/// qualquer intervalo normal entre duas gravacoes de progresso, inclusive nas
/// lojas que pedem 10 s entre visitas.
export const ORFAO_NA_PARTIDA_MS = 10 * 60 * 1000;

/** O job foi largado pelo worker? */
export function jobOrfao(job, agora = Date.now()) {
  return (
    job.status === "PROCESSANDO" &&
    agora - new Date(job.atualizadoEm).getTime() > ORFAO_APOS_MS
  );
}
