import { z } from "zod";

import { UFS, formatarCep } from "@/lib/documentos";
import { digitosDoTelefone, telefoneParaGravar, telefoneValido } from "@/lib/telefone";
import { opcional } from "@/lib/validacao";

/**
 * Leitura do que o formulario de um cadastro manda no `FormData`, para as acoes de
 * Cliente e de Transportadora usarem a MESMA regra. Nao e um arquivo "use server":
 * aqui podem morar funcoes sincronas e constantes.
 *
 * Cada `ler*` devolve o valor ja limpo e um `erro` (texto) ou `null`, para a acao
 * decidir em que campo mostrar.
 */

const MAXIMO_TELEFONES = 10;
const MAXIMO_EMAILS = 10;
const MAXIMO_CONTATOS = 50;
const EMAIL = z.string().email();

/**
 * Os valores de um campo repetido (um <input> por linha, todos com o mesmo nome),
 * na ordem da tela. Linha em branco sai, e o mesmo valor duas vezes vira um so
 * (`comparar` decide o que e "o mesmo": e-mail nao diferencia caixa).
 */
export function lerLista(formData, nome, comparar = (valor) => valor) {
  const vistos = new Set();
  const lista = [];
  for (const bruto of formData.getAll(nome)) {
    const valor = String(bruto).trim();
    if (!valor || vistos.has(comparar(valor))) continue;
    vistos.add(comparar(valor));
    lista.push(valor);
  }
  return lista;
}

/**
 * Telefones do campo `telefones`, ja em digitos (o padrao de `src/lib/telefone.js`).
 * O primeiro e o principal. Um invalido recusa a lista inteira e aparece no recado.
 */
export function lerTelefones(formData) {
  const digitados = lerLista(formData, "telefones", digitosDoTelefone);
  const invalido = digitados.find((telefone) => !telefoneValido(telefone));
  if (invalido) {
    return {
      telefones: [],
      erro: `Telefone inválido: ${invalido}. Use o DDD e o número, como (54) 98899-0008.`,
    };
  }
  if (digitados.length > MAXIMO_TELEFONES) {
    return { telefones: [], erro: `No máximo ${MAXIMO_TELEFONES} telefones.` };
  }
  return { telefones: digitados.map(telefoneParaGravar), erro: null };
}

/** E-mails do campo `emails`. O primeiro e o principal; repetido (sem caixa) vira um so. */
export function lerEmails(formData) {
  const emails = lerLista(formData, "emails", (valor) => valor.toLowerCase());
  const invalido = emails.find((email) => !EMAIL.safeParse(email).success);
  if (invalido) return { emails: [], erro: `E-mail inválido: ${invalido}` };
  if (emails.length > MAXIMO_EMAILS) return { emails: [], erro: `No máximo ${MAXIMO_EMAILS} e-mails.` };
  return { emails, erro: null };
}

const ContatoSchema = z.object({
  nome: z.string().trim().min(1, "Todo contato precisa de nome."),
  cargo: opcional(z.string().trim()),
  telefone: opcional(z.string().trim().refine(telefoneValido, "Telefone de contato inválido.")),
  email: opcional(z.string().trim().email("E-mail de contato inválido.")),
});

/**
 * As pessoas de contato, montadas na tela e enviadas como JSON num campo oculto
 * (`contatos`). O telefone de cada uma tambem e gravado so em digitos.
 */
export function lerContatos(bruto) {
  try {
    const lista = JSON.parse(bruto || "[]");
    if (!Array.isArray(lista) || lista.length > MAXIMO_CONTATOS) throw new Error("lista inválida");

    const lido = z.array(ContatoSchema).safeParse(lista);
    if (!lido.success) return { contatos: [], erro: lido.error.issues[0].message };

    return {
      contatos: lido.data.map((contato) => ({
        ...contato,
        telefone: telefoneParaGravar(contato.telefone),
      })),
      erro: null,
    };
  } catch {
    return { contatos: [], erro: "A lista de contatos veio inválida. Recarregue a página." };
  }
}

/**
 * Um endereco, lido dos campos `<prefixo>_cep`, `_uf`... do formulario. Devolve
 * `dados` nulo quando o endereco esta em branco (nao se grava linha vazia) e
 * `erros` com a chave do campo ja prefixada, como a tela a usa.
 */
export function lerEndereco(campos, prefixo) {
  const pegar = (nome) => campos[`${prefixo}_${nome}`] || null;
  const dados = {
    cep: pegar("cep"),
    uf: pegar("uf"),
    cidade: pegar("cidade"),
    bairro: pegar("bairro"),
    logradouro: pegar("logradouro"),
    numero: pegar("numero"),
    complemento: pegar("complemento"),
  };
  const erros = {};

  if (dados.cep) {
    if (dados.cep.replace(/\D/g, "").length !== 8) erros[`${prefixo}_cep`] = "O CEP tem 8 dígitos.";
    else dados.cep = formatarCep(dados.cep);
  }
  if (dados.uf && !UFS.includes(dados.uf)) erros[`${prefixo}_uf`] = "Escolha um estado da lista.";

  const vazio = Object.values(dados).every((valor) => valor === null);
  return { dados: vazio ? null : dados, erros };
}
