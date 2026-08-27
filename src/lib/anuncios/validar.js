import { obterCanal } from "./canais";

/**
 * Executa as regras do canal e resume o resultado para a tela.
 *
 * Roda inteiramente local: nenhuma chamada externa. E o que permite apontar os
 * problemas no campo certo antes de gastar uma requisicao — e, na Fase B, antes
 * de escrever em plataforma nenhuma.
 */
export function validarAnuncio(produto, anuncio, opcoes = {}) {
  const canal = obterCanal(anuncio?.canal);

  if (!canal?.regras?.validar) {
    return { problemas: [], bloqueantes: 0, podePublicar: false };
  }

  const problemas = canal.regras.validar(
    produto,
    anuncio,
    opcoes.atributosCategoria,
    opcoes.contexto,
  );

  const bloqueantes = problemas.filter((p) => p.bloqueante).length;

  return {
    problemas,
    bloqueantes,
    alertas: problemas.length - bloqueantes,
    podePublicar: bloqueantes === 0 && canal.disponivel,
  };
}

/** Problemas de um campo, para exibir junto do proprio campo no formulario. */
export function problemasDoCampo(problemas, campo) {
  return (problemas ?? []).filter((problema) => problema.campo === campo);
}
