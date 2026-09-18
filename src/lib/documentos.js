/**
 * CPF e CNPJ: conferencia dos digitos verificadores e formatacao.
 *
 * Sem import de React, de Next ou do Prisma: a acao (servidor), o formulario
 * (navegador) e o script de teste usam o mesmo codigo, e o teste roda em Node
 * puro. Duplicar a conta faria a tela aceitar o que o servidor recusa.
 */

const soDigitos = (valor) => String(valor ?? "").replace(/\D/g, "");

/** Sequencia de um digito so (111.111.111-11) passa na conta, mas nao e documento. */
const repetido = (digitos) => /^(\d)\1+$/.test(digitos);

/** Digito verificador: soma ponderada dos `base` primeiros digitos, modulo 11. */
function digitoVerificador(digitos, pesos) {
  const soma = pesos.reduce((total, peso, i) => total + Number(digitos[i]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function validarCpf(valor) {
  const d = soDigitos(valor);
  if (d.length !== 11 || repetido(d)) return false;

  const primeiro = digitoVerificador(d, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digitoVerificador(d, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return primeiro === Number(d[9]) && segundo === Number(d[10]);
}

export function validarCnpj(valor) {
  const d = soDigitos(valor);
  if (d.length !== 14 || repetido(d)) return false;

  const primeiro = digitoVerificador(d, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digitoVerificador(d, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return primeiro === Number(d[12]) && segundo === Number(d[13]);
}

export function formatarCpf(valor) {
  const d = soDigitos(valor);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

export function formatarCnpj(valor) {
  const d = soDigitos(valor);
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

export function formatarCep(valor) {
  const d = soDigitos(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Os 27 estados, na ordem alfabetica da sigla, para a lista de UF. */
export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
];
