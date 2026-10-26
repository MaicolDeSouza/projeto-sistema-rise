import { prisma } from "@/lib/db";
import { formatarCep, formatarCnpj, validarCnpj } from "@/lib/documentos";
import { telefoneParaGravar, telefoneValido } from "@/lib/telefone";

/**
 * Os dados da 4hobby que vao no pedido de compra (PDF). Uma linha so (id "empresa"), semeada pela migration com os dados
 * da Receita. CNPJ e CEP gravados formatados e telefone so em digitos, os padroes do Rise.
 */

const ID = "empresa";
const CAMPOS = ["razaoSocial", "nomeFantasia", "cnpj", "inscricaoEstadual", "endereco", "numero", "complemento", "bairro", "cidade", "uf", "cep", "telefone", "email"];
const OBRIGATORIOS = { razaoSocial: "Informe a razão social.", cnpj: "Informe o CNPJ.", endereco: "Informe o endereço.", cidade: "Informe a cidade.", uf: "Informe a UF.", cep: "Informe o CEP." };
const LIMITES = { razaoSocial: 150, nomeFantasia: 150, inscricaoEstadual: 30, endereco: 200, numero: 20, complemento: 100, bairro: 100, cidade: 100, email: 150 };

export async function lerDadosDaEmpresa() {
  return prisma.dadosDaEmpresa.findUnique({ where: { id: ID } });
}

/** @returns {Promise<{ ok: true } | { ok: false, erros: Record<string, string> }>} */
export async function salvarDadosDaEmpresa(entrada) {
  const dados = {};
  for (const campo of CAMPOS) {
    const valor = String(entrada?.[campo] ?? "").trim();
    dados[campo] = valor || null;
  }
  const erros = {};
  for (const [campo, mensagem] of Object.entries(OBRIGATORIOS)) if (!dados[campo]) erros[campo] = mensagem;
  for (const [campo, limite] of Object.entries(LIMITES)) if (dados[campo] && dados[campo].length > limite) erros[campo] = `Até ${limite} caracteres.`;

  if (dados.cnpj) {
    if (validarCnpj(dados.cnpj)) dados.cnpj = formatarCnpj(dados.cnpj);
    else erros.cnpj = "CNPJ inválido.";
  }
  if (dados.cep) {
    if (dados.cep.replace(/\D/g, "").length === 8) dados.cep = formatarCep(dados.cep);
    else erros.cep = "CEP com 8 dígitos.";
  }
  if (dados.uf) {
    dados.uf = dados.uf.toUpperCase();
    if (!/^[A-Z]{2}$/.test(dados.uf)) erros.uf = "UF com 2 letras.";
  }
  if (dados.telefone) {
    if (telefoneValido(dados.telefone)) dados.telefone = telefoneParaGravar(dados.telefone);
    else erros.telefone = `Telefone inválido: ${dados.telefone}.`;
  }
  if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) erros.email = "E-mail inválido.";

  if (Object.keys(erros).length) return { ok: false, erros };
  await prisma.dadosDaEmpresa.upsert({ where: { id: ID }, update: dados, create: { id: ID, ...dados } });
  return { ok: true };
}
