import { z } from "zod";

import { formatarCnpj, validarCnpj } from "@/lib/documentos";

/**
 * Pecas de validacao de formulario compartilhadas pelas acoes.
 *
 * Nasceram privadas em src/app/produtos/acoes.js. Ficam aqui porque um arquivo
 * "use server" so pode exportar funcao assincrona, entao as acoes de Cadastros
 * nao teriam como importa-las de la. `produtos/acoes.js` ainda tem a copia
 * dele; unificar as duas e trabalho de outra hora.
 */

/**
 * "" e campo AUSENTE viram null. Vazio chega como string vazia; ausente e o campo
 * desabilitado (a Inscricao Estadual com "IE isento" marcada), que o navegador
 * simplesmente nao envia — sem tratar `undefined`, o formulario inteiro era
 * recusado com "expected string, received undefined".
 */
export const opcional = (esquema) =>
  z.preprocess((valor) => (valor === "" || valor === undefined ? null : valor), esquema.nullable());

export const decimal = () =>
  opcional(
    z.coerce
      .number({ message: "Informe um numero valido." })
      .min(0, "Nao pode ser negativo."),
  );

/** Aceita apenas http/https — protocolo perigoso em campo que vira link. */
export function ehUrlSegura(valor) {
  if (!valor) return true;
  try {
    return ["http:", "https:"].includes(new URL(valor).protocol);
  } catch {
    return false;
  }
}

/**
 * CNPJ opcional, conferido pelos digitos verificadores e guardado sempre
 * formatado — "11222333000181" e "11.222.333/0001-81" nao viram dois textos
 * diferentes na busca.
 */
export const cnpjOpcional = () =>
  opcional(z.string().refine(validarCnpj, "CNPJ invalido.").transform(formatarCnpj));

/**
 * Caixa de marcacao ou campo oculto: chega "on" quando marcado e NAO chega
 * quando nao esta (o navegador nao envia o desmarcado nem o desabilitado).
 */
export const marcado = () => z.preprocess((valor) => valor === "on", z.boolean());

/**
 * CNPJ do fornecedor: obrigatorio, salvo para o estrangeiro, que nao tem (pedido
 * do dono em 04/10/2026). Recebe o schema do fornecedor com `cnpj` (`cnpjOpcional`)
 * e `estrangeiro` (`marcado`).
 *
 * O erro vai no campo `cnpj`, para a tela mostrar embaixo dele. E quem esta marcado
 * como estrangeiro tem o CNPJ ZERADO aqui: o campo fica desabilitado na tela, mas
 * o valor digitado antes da marcacao nao pode ir junto, senao o cadastro ficaria
 * estrangeiro e com CNPJ ao mesmo tempo.
 */
export const exigirCnpjSalvoEstrangeiro = (esquema) =>
  esquema
    .refine((dados) => dados.estrangeiro || dados.cnpj, {
      path: ["cnpj"],
      message: "Informe o CNPJ ou marque Estrangeiro.",
    })
    .transform((dados) => (dados.estrangeiro ? { ...dados, cnpj: null } : dados));

/** Texto do formulario, aparado: "  " tem que valer como vazio. */
export function lerCampos(formData) {
  const campos = {};
  for (const [chave, valor] of formData.entries()) {
    if (typeof valor === "string") campos[chave] = valor.trim();
  }
  return campos;
}

/** Primeiro erro de cada campo, no formato que o formulario mostra. */
export function errosPorCampo(resultado) {
  const erros = {};
  for (const problema of resultado.error.issues) {
    const campo = problema.path[0];
    if (campo && !erros[campo]) erros[campo] = problema.message;
  }
  return erros;
}
