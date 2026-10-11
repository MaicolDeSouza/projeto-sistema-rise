/**
 * Leitura dos formulários das telas de administração do Rise AI (Server Actions). Sem banco e sem Next: o teste usa
 * o mesmo arquivo.
 */

/** "a, B;c\n d" → ["a", "B", "c", "d"]: códigos de produto separados por vírgula, ponto e vírgula, espaço ou quebra de linha. */
export function codigosDoTexto(valor) {
  return String(valor ?? "")
    .split(/[\s,;]+/)
    .filter(Boolean);
}

/**
 * Os campos de texto PREENCHIDOS do formulário, aparados. Campo em branco fica de fora: numa edição, "não mexi" e
 * "apaguei" são coisas diferentes, e apagar o assunto de uma nota não é o que um campo em branco quer dizer.
 *
 * @param {FormData} dados
 * @param {string[]} nomes
 */
export function camposDoFormulario(dados, nomes) {
  const campos = {};
  for (const nome of nomes) {
    const valor = String(dados.get(nome) ?? "").trim();
    if (valor) campos[nome] = valor;
  }
  return campos;
}
