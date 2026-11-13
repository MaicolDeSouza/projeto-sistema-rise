import { prisma } from "@/lib/db";
import { formatarCep, formatarCnpj, validarCnpj } from "@/lib/documentos";
import { telefoneParaGravar, telefoneValido } from "@/lib/telefone";

/**
 * Os dados da 4hobby que vao no pedido de compra (PDF). Uma linha so (id "empresa"), semeada pela migration com os dados
 * da Receita. CNPJ e CEP gravados formatados e telefone so em digitos, os padroes do Rise.
 */

const ID = "empresa";
// Inscricao municipal e celular/WhatsApp: pedido do dono em 07/11/2026.
const CAMPOS = ["razaoSocial", "nomeFantasia", "cnpj", "inscricaoEstadual", "inscricaoMunicipal", "endereco", "numero", "complemento", "bairro", "cidade", "uf", "cep", "telefone", "celular", "whatsappTecnico", "site", "email"];
const OBRIGATORIOS = { razaoSocial: "Informe a razão social.", cnpj: "Informe o CNPJ.", endereco: "Informe o endereço.", cidade: "Informe a cidade.", uf: "Informe a UF.", cep: "Informe o CEP." };
const LIMITES = { razaoSocial: 150, nomeFantasia: 150, inscricaoEstadual: 30, inscricaoMunicipal: 30, endereco: 200, numero: 20, complemento: 100, bairro: 100, cidade: 100, site: 120, email: 150 };

export async function lerDadosDaEmpresa() {
  const dados = await prisma.dadosDaEmpresa.findUnique({ where: { id: ID } });
  // Decimal do Prisma nao atravessa para a tela (Configuracoes > Dados da empresa): vira numero aqui.
  return dados ? { ...dados, faturamentoMinimo: dados.faturamentoMinimo === null ? null : Number(dados.faturamentoMinimo) } : null;
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
  if (dados.celular) {
    if (telefoneValido(dados.celular)) dados.celular = telefoneParaGravar(dados.celular);
    else erros.celular = `Celular inválido: ${dados.celular}.`;
  }
  // WhatsApp tecnico e site: pedido do dono em 13/11/2026 (cabecalho do PDF da proposta).
  if (dados.whatsappTecnico) {
    if (telefoneValido(dados.whatsappTecnico)) dados.whatsappTecnico = telefoneParaGravar(dados.whatsappTecnico);
    else erros.whatsappTecnico = `WhatsApp inválido: ${dados.whatsappTecnico}.`;
  }
  if (dados.site) {
    // Grava sem o "https://" e sem a barra do fim: o PDF mostra assim e monta o link.
    dados.site = dados.site.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    if (!/^[^\s/]+\.[^\s/]+(\/\S*)?$/.test(dados.site)) erros.site = "Site inválido.";
  }
  if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) erros.email = "E-mail inválido.";

  // Faturamento minimo (13/11/2026): sai em toda proposta ("Valor para faturamento minimo: R$ 50,00").
  const minimo = String(entrada?.faturamentoMinimo ?? "").trim().replace(/^R$s*/i, "");
  if (!minimo) dados.faturamentoMinimo = null;
  else {
    const valor = Number(minimo.includes(",") ? minimo.replace(/./g, "").replace(",", ".") : minimo);
    if (Number.isFinite(valor) && valor >= 0 && valor < 1_000_000) dados.faturamentoMinimo = Math.round(valor * 100) / 100;
    else erros.faturamentoMinimo = "Valor inválido.";
  }

  if (Object.keys(erros).length) return { ok: false, erros };
  await prisma.dadosDaEmpresa.upsert({ where: { id: ID }, update: dados, create: { id: ID, ...dados } });
  return { ok: true };
}
