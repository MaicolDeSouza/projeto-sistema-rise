import { z } from "zod";

import { prisma } from "@/lib/db";
import { documentoValido } from "@/lib/propostas/cliente";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

/**
 * A escrita do dia a dia pelo MCP (pedido do dono em 26/11/2026: "Analise e veja quais ferramentas mcp precisamos criar
 * ... para criarmos tudo de 1 vez"; escolheu os 6 grupos e "implementar tudo direto", com a Opcao A dos dois passos).
 *
 * Toda ferramenta que grava funciona em DOIS PASSOS, na mesma ferramenta: sem `confirmo` ela so confere e devolve a
 * PREVIA do que vai fazer (nada e gravado); com `confirmo: true` e os mesmos dados, grava. As que escrevem no Bling
 * conferem de novo o que a pessoa viu (o total, o saldo), como o `valorConfirmado` da etiqueta: se mudou entre os dois
 * passos, recusam e pedem a previa outra vez. O acesso e o MESMO da tela (o `pode()` do login).
 */

export const ESCRITA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
export const ESCRITA_FORA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
export const LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

export const CONFIRMO = z
  .boolean()
  .optional()
  .describe("Deixe vazio no PRIMEIRO passo (só a prévia, nada é gravado). true SÓ depois de mostrar a prévia à pessoa e ela confirmar");

export const TEXTO_DA_PREVIA = "Prévia: nada foi gravado. Mostre isto à pessoa e, só com o ok dela, chame de novo com os mesmos dados e confirmo: true.";

/** A resposta do primeiro passo: o que vai acontecer, sem gravar nada. */
export const previa = (conteudo) => ({ previa: true, gravado: false, ...conteudo, proximoPasso: TEXTO_DA_PREVIA });

export function exigir(pode, recurso, nivel, motivo) {
  if (typeof pode !== "function" || !pode(recurso, nivel)) throw new ErroDeFerramenta(`Este login não pode ${motivo}.`);
}

/** Recusa de regra (a mesma frase que a tela mostraria) vira erro da ferramenta, sem o "tente de novo" generico. */
export function exigirOk(resultado) {
  if (!resultado?.ok) throw new ErroDeFerramenta(resultado?.erro ?? "Não foi possível concluir.");
  return resultado;
}

/** O produto pelo codigo (SKU), sem diferenca de maiusculas. */
export async function acharProdutoPorSku(sku, select = { id: true, sku: true, tituloBase: true }) {
  const texto = String(sku ?? "").trim();
  if (!texto) throw new ErroDeFerramenta("Informe o código do produto.");
  const achado = await prisma.produto.findFirst({ where: { sku: { equals: texto, mode: "insensitive" } }, select });
  if (!achado) throw new ErroDeFerramenta(`Produto ${texto} não encontrado no Rise.`);
  return achado;
}

/**
 * O cliente pelo CPF/CNPJ (com ou sem pontuacao), pelo id ou pelo nome (igual, sem caixa; senao contendo, se for um so).
 * Com `opcional`, devolve null em vez de recusar quando nao acha.
 */
export async function acharCliente(referencia, { opcional = false } = {}) {
  const texto = String(referencia ?? "").trim();
  if (!texto) throw new ErroDeFerramenta("Informe o cliente (CPF/CNPJ ou nome).");
  const select = { id: true, nome: true, documento: true, tipoPessoa: true, telefone: true, email: true, observacoes: true, blingContatoId: true };
  const doc = documentoValido(texto);
  if (doc) {
    const achado = await prisma.cliente.findUnique({ where: { documento: doc.formatado }, select });
    if (achado || opcional) return achado;
    throw new ErroDeFerramenta(`Nenhum cliente com o documento ${doc.formatado}. Cadastre com cadastrarCliente.`);
  }
  if (/^\d[\d.\-/\s]+$/.test(texto)) throw new ErroDeFerramenta(`CPF/CNPJ inválido: ${texto}.`);
  const porId = /^c[a-z0-9]{20,}$/.test(texto) ? await prisma.cliente.findUnique({ where: { id: texto }, select }) : null;
  if (porId) return porId;
  const iguais = await prisma.cliente.findMany({ where: { nome: { equals: texto, mode: "insensitive" } }, select, take: 3 });
  if (iguais.length === 1) return iguais[0];
  const parecidos = iguais.length ? iguais : await prisma.cliente.findMany({ where: { nome: { contains: texto, mode: "insensitive" } }, select, take: 6 });
  if (parecidos.length === 1) return parecidos[0];
  if (!parecidos.length) {
    if (opcional) return null;
    throw new ErroDeFerramenta(`Cliente "${texto}" não encontrado. Procure com listarClientes ou cadastre com cadastrarCliente.`);
  }
  throw new ErroDeFerramenta(`Mais de um cliente com "${texto}": ${parecidos.map((c) => c.nome).join("; ")}. Informe o CPF/CNPJ.`);
}

/** O cliente para mostrar: sem o documento para quem nao ve dado pessoal. */
export function clienteParaMostrar(cliente, pode) {
  if (!cliente) return null;
  const pessoal = typeof pode === "function" && pode("dado.pessoalDoCliente", "ver");
  return { nome: cliente.nome, documento: pessoal ? (cliente.documento ?? null) : "[restrito]" };
}
