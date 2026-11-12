import { prisma } from "@/lib/db";

import { lerLocalizacao, textoDaLocalizacao } from "./regras";

/**
 * A ordem das caixinhas lida nas FOTOS do dono (Mapa do estoque, 12/11/2026): confere cada codigo com o Rise e grava so a
 * posicao na prateleira. Nunca muda a Localizacao: quem esta em outra prateleira no Rise vira duvida.
 *
 * @param {{ coluna: string, prateleiras: Record<string, string[]> }} leitura os codigos da esquerda para a direita, "?" = ilegivel
 * @returns {Promise<{ ok: true, coluna, gravar: object[], duvidas: object[], faltaram: object[] } | { ok: false, erro: string }>}
 */
export async function conferirOrdemDasFotos(leitura, { gravar = false, db = prisma } = {}) {
  const letra = String(leitura?.coluna ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{1,2}$/.test(letra)) return { ok: false, erro: "A coluna do arquivo é uma ou duas letras." };
  const prateleiras = leitura?.prateleiras && typeof leitura.prateleiras === "object" ? leitura.prateleiras : null;
  if (!prateleiras) return { ok: false, erro: "O arquivo não traz as prateleiras." };

  const lidos = Object.entries(prateleiras).flatMap(([numero, codigos]) =>
    (Array.isArray(codigos) ? codigos : []).map((codigo, indice) => ({ numero: Number(numero), posicao: indice + 1, codigo: String(codigo ?? "").trim() })),
  );
  const skus = [...new Set(lidos.map((item) => item.codigo.toUpperCase()).filter((codigo) => codigo && codigo !== "?"))];
  const [produtos, daColuna] = await Promise.all([
    db.produto.findMany({ where: { sku: { in: skus, mode: "insensitive" } }, select: { id: true, sku: true, tituloBase: true, localizacao: true, ativo: true } }),
    db.produto.findMany({ where: { ativo: true, localizacao: { startsWith: letra, mode: "insensitive" } }, select: { id: true, sku: true, tituloBase: true, localizacao: true } }),
  ]);
  const porSku = new Map(produtos.map((produto) => [produto.sku.toUpperCase(), produto]));

  const aGravar = [];
  const duvidas = [];
  const vistos = new Set();
  for (const { numero, posicao, codigo } of lidos) {
    const lugar = `${textoDaLocalizacao(letra, numero)} ${posicao}ª`;
    if (!codigo || codigo === "?") {
      duvidas.push({ lugar, texto: "Código ilegível na foto." });
      continue;
    }
    const produto = porSku.get(codigo.toUpperCase());
    if (!produto) {
      duvidas.push({ lugar, texto: `${codigo}: não existe no Rise.` });
      continue;
    }
    if (vistos.has(produto.id)) {
      duvidas.push({ lugar, texto: `${produto.sku}: aparece mais de uma vez nas fotos.` });
      continue;
    }
    vistos.add(produto.id);
    if (!produto.ativo) duvidas.push({ lugar, texto: `${produto.sku}: está inativo no Rise.` });
    const lida = lerLocalizacao(produto.localizacao);
    if (!lida || lida.letra !== letra || lida.numero !== numero) {
      duvidas.push({ lugar, texto: `${produto.sku}: no Rise a Localização é "${produto.localizacao ?? "vazia"}" (não mudei).` });
      continue;
    }
    aGravar.push({ id: produto.id, sku: produto.sku, localizacao: textoDaLocalizacao(letra, numero), posicao });
  }

  const faltaram = daColuna
    .filter((produto) => lerLocalizacao(produto.localizacao)?.letra === letra && !vistos.has(produto.id))
    .map((produto) => ({ sku: produto.sku, nome: produto.tituloBase, localizacao: produto.localizacao }))
    .sort((a, b) => String(a.localizacao).localeCompare(String(b.localizacao), "pt-BR", { numeric: true }));

  if (gravar && aGravar.length) {
    // SQL direto: so a posicao muda, e o `atualizadoEm` do produto nao (o rascunho automatico do cadastro o compara).
    await db.$transaction(aGravar.map((item) => db.$executeRaw`UPDATE "Produto" SET "ordemNaPrateleira" = ${item.posicao} WHERE "id" = ${item.id}`));
  }
  return { ok: true, coluna: letra, gravar: aGravar.map(({ id: _id, ...item }) => item), duvidas, faltaram };
}
