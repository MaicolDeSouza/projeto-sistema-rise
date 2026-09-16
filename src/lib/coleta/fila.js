/**
 * Regras da fila de coleta que o worker e a tela precisam enxergar igual.
 *
 * Fora de acoes.js porque arquivo "use server" so exporta funcao assincrona — uma
 * constante ali faz o Next recusar o modulo inteiro.
 */

/// De quanto em quanto o worker grava andamento mesmo sem produto novo.
///
/// Gravar so a cada produto novo deixou o Eletrogate duas horas sem noticia em
/// 16/09/2026: com 2.000 produtos achados, o worker seguiu abrindo categoria sem
/// achar nenhum novo, e a tela deu o worker por morto com ele varrendo.
export const SINAL_DE_VIDA_MS = 2 * 60 * 1000;

/// Job PROCESSANDO sem noticia ha mais que isso e de um worker que morreu.
///
/// Folga de quinze sinais de vida (SINAL_DE_VIDA_MS): uma pagina que demora a
/// responder nao basta para dar por morto um worker que so esta devagar.
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
