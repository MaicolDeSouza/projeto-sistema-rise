/**
 * Telefone brasileiro: validacao, formato de gravacao e formato de tela.
 *
 * PADRAO DO PROJETO (19/09/2026), valido para todo campo de telefone:
 *
 *   - GRAVA so os digitos, com DDD e sem codigo de pais: "54988990008".
 *   - MOSTRA e digita como "(54) 98899-0008" (celular) ou "(54) 3333-4444" (fixo).
 *
 * Por que gravar so digitos, e nao o texto formatado (como se faz com CPF/CNPJ):
 * o telefone e CONSUMIDO. Vira link de WhatsApp (`wa.me/55` + digitos), vai para
 * integracao, e e buscado por quem digita "988990008" sem saber como foi
 * cadastrado. Formatado, cada um desses passos precisaria limpar de novo — e
 * "(54)98899-0008" e "(54) 98899-0008" seriam dois textos para o mesmo numero.
 * O documento, ao contrario, so e exibido e conferido. A formatacao e coisa da
 * tela, nao do dado.
 *
 * Sem imports: a tela, a acao do servidor e o teste usam o mesmo arquivo.
 */

/// DDDs em uso no Brasil (67). Lista fechada de proposito: "10", "20" ou "23"
/// tem cara de DDD e nao existem, e sao o erro de digitacao mais comum.
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Os digitos do numero, sem o codigo do pais. Quem cola "+55 54 98899-0008" (o
 * WhatsApp copia assim) nao deve ser recusado: 12 ou 13 digitos comecando por 55
 * sao codigo do pais + numero. Com 11 digitos "55..." e o DDD 55 (Rio Grande do Sul).
 */
export function digitosDoTelefone(texto) {
  const digitos = String(texto ?? "").replace(/\D/g, "");
  return (digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")
    ? digitos.slice(2)
    : digitos;
}

/**
 * Celular: DDD + 9 + 8 digitos (11). Fixo: DDD + 8 digitos comecando de 2 a 5 (10).
 * Numero de 10 digitos comecando por 6 a 9 e o celular antigo, sem o nono digito, e
 * nao completa mais ligacao — recusar aqui evita gravar um numero que nao funciona.
 */
export function telefoneValido(texto) {
  const digitos = digitosDoTelefone(texto);
  if (digitos.length !== 10 && digitos.length !== 11) return false;
  if (!DDDS.has(Number(digitos.slice(0, 2)))) return false;
  return digitos.length === 11 ? digitos[2] === "9" : /[2-5]/.test(digitos[2]);
}

/**
 * O que gravar: so os digitos, ou null se nao for um telefone valido. O chamador
 * decide o que fazer com o null (recusar o cadastro, ignorar...).
 */
export function telefoneParaGravar(texto) {
  return telefoneValido(texto) ? digitosDoTelefone(texto) : null;
}

/**
 * "(54) 98899-0008" a partir do que foi gravado ou digitado. Numero que nao e
 * valido volta como esta, aparado: formatar um texto pela metade inventaria
 * pontuacao no lugar errado, e a mensagem de erro precisa mostrar o que foi escrito.
 */
export function formatarTelefone(texto) {
  const original = String(texto ?? "").trim();
  if (!telefoneValido(original)) return original;

  const digitos = digitosDoTelefone(original);
  const ddd = digitos.slice(0, 2);
  const numero = digitos.slice(2);
  const corte = numero.length === 9 ? 5 : 4;
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`;
}

/** Enquanto se digita: tira o que nao pode aparecer num telefone (letras, por exemplo). */
export function filtrarDigitacaoDeTelefone(texto) {
  return String(texto ?? "").replace(/[^\d()+\-\s.]/g, "");
}
