import { prisma } from "@/lib/db";

/**
 * O fornecedor das compras do AliExpress (o "Ali" do dono, 28/10/2026). Achado pela marca `Fornecedor.aliexpress`,
 * nunca pelo nome: o dono pode renomear o cadastro, e um concorrente "Ali Store" nao pode virar o fornecedor das
 * compras. So um tem a marca (indice unico parcial na migration 20261028_compras_aliexpress).
 */
export async function fornecedorDoAliExpress(db = prisma) {
  return db.fornecedor.findFirst({
    where: { aliexpress: true },
    select: { id: true, nome: true, prazoEntregaDias: true, ativo: true },
  });
}

/** Troca o fornecedor marcado (cartao AliExpress em Integracoes). Desmarca o anterior na mesma transacao. */
export async function marcarFornecedorDoAliExpress(fornecedorId) {
  const id = String(fornecedorId ?? "");
  try {
    const fornecedor = await prisma.$transaction(async (tx) => {
      await tx.fornecedor.updateMany({ where: { aliexpress: true, NOT: { id } }, data: { aliexpress: false } });
      return tx.fornecedor.update({ where: { id }, data: { aliexpress: true }, select: { id: true, nome: true } });
    });
    return { ok: true, fornecedor };
  } catch (erro) {
    if (erro?.code === "P2025") return { ok: false, erro: "Fornecedor não encontrado." };
    return { ok: false, erro: `Não foi possível marcar o fornecedor: ${erro.message}` };
  }
}
