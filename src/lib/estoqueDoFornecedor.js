import { prisma } from "@/lib/db";

/**
 * Saldo e preco da ultima coleta do item exato de cada fornecedor vinculado, SEM conferir acesso: quem chama confere
 * (a aba Fornecedores do cadastro e o popup de Compras). Extraido de `consultarEstoqueFornecedores` em 26/10/2026.
 *
 * @param {{ id: string, nome: string, codigo?: string|null, link?: string|null }[]} vinculos
 */
export async function estoqueDosFornecedores(vinculos) {
  const lista = (Array.isArray(vinculos) ? vinculos : []).slice(0, 100)
    .filter((item) => typeof item?.id === "string" && typeof item?.nome === "string");
  const criterios = lista.flatMap((item) => {
    const filtros = [];
    if (item.link) filtros.push({ url: item.link });
    if (item.codigo) filtros.push({
      codigo: { equals: item.codigo, mode: "insensitive" },
      fonte: { nome: { equals: item.nome, mode: "insensitive" }, tipo: "FORNECEDOR" },
    });
    return filtros;
  });
  if (!criterios.length) return { ok: true, itens: {} };
  try {
    const produtos = await prisma.produtoColetado.findMany({
      where: { OR: criterios, fonte: { tipo: "FORNECEDOR" } },
      select: {
        id: true, codigo: true, url: true, quantidade: true, aChegar: true, estoqueStatus: true, ausenteDesde: true,
        precoNormal: true, precoComImpostos: true, precoReserva: true, impostos: true,
        precosPorQuantidade: true,
        fonte: { select: { nome: true, dominio: true } },
      },
      orderBy: { vistoEm: "desc" },
      take: 300,
    });
    const itens = Object.fromEntries(lista.map((item) => {
      const nome = item.nome.toLocaleLowerCase("pt-BR");
      const codigo = String(item.codigo ?? "").toLocaleLowerCase("pt-BR");
      const produto = produtos.find((candidato) => item.link && candidato.url === item.link)
        ?? produtos.find((candidato) => codigo && candidato.codigo?.toLocaleLowerCase("pt-BR") === codigo
          && candidato.fonte.nome.toLocaleLowerCase("pt-BR") === nome);
      return [item.id, produto ? {
        // A miniatura da linha (pedido do dono em 23/10/2026): /api/mercados/miniatura/<id>.
        coletadoId: produto.id,
        quantidade: produto.quantidade,
        aChegar: produto.aChegar,
        disponivel: ["AVAILABLE", "IN_STOCK"].includes(produto.estoqueStatus),
        // Os tres campos de `situacaoDeEstoque`, a regra da coluna Estoque dos concorrentes (pedido do dono em
        // 24/10/2026: o mesmo texto nas duas abas). `ativo` falso = saiu da lista do fornecedor.
        estoqueStatus: produto.estoqueStatus,
        ativo: produto.ausenteDesde === null,
        precoNormal: produto.precoNormal == null ? null : Number(produto.precoNormal),
        precoComImpostos: produto.precoComImpostos == null ? null : Number(produto.precoComImpostos),
        precoReserva: produto.precoReserva == null ? null : Number(produto.precoReserva),
        impostos: produto.impostos ?? [],
        precosPorQuantidade: produto.precosPorQuantidade ?? [],
        // Sem URL propria (Fortek: portal fechado, sem pagina publica) o link
        // da linha cai no dominio da fonte — mesma regra de `linkDaFonte` em
        // Mercados (TabelaMercados.jsx), pedido do dono em 22/09/2026 para as
        // duas telas concordarem.
        fonteDominio: produto.fonte.dominio,
      } : null];
    }));
    return { ok: true, itens };
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }
}
