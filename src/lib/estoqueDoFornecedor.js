import { prisma } from "@/lib/db";

/**
 * Saldo e preco da ultima coleta do item exato de cada fornecedor vinculado, SEM conferir acesso: quem chama confere
 * (a aba Fornecedores do cadastro e o popup de Compras). Extraido de `consultarEstoqueFornecedores` em 26/10/2026.
 *
 * @param {{ id: string, nome: string, codigo?: string|null, link?: string|null, descricao?: string|null }[]} vinculos
 */
export async function estoqueDosFornecedores(vinculos) {
  const lista = (Array.isArray(vinculos) ? vinculos : []).slice(0, 100)
    .filter((item) => typeof item?.id === "string" && typeof item?.nome === "string");
  // A fonte do fornecedor: a de mesmo nome OU a ligada ao cadastro dele (`Fornecedor.fonteId`). So pelo nome, a lista
  // de um fornecedor cuja fonte tem outro nome nunca casava.
  const ligadas = new Map();
  const nomes = [...new Set(lista.map((item) => item.nome))];
  if (nomes.length) {
    // Falha aqui so tira o atalho da fonte ligada; o casamento pelo nome da fonte continua.
    const cadastros = await prisma.fornecedor.findMany({
      where: { OR: nomes.map((nome) => ({ nome: { equals: nome, mode: "insensitive" } })), fonteId: { not: null } },
      select: { nome: true, fonteId: true },
    }).catch(() => []);
    for (const cadastro of cadastros) ligadas.set(cadastro.nome.toLocaleLowerCase("pt-BR"), cadastro.fonteId);
  }
  const fonteDe = (nome) => {
    const fonteId = ligadas.get(nome.toLocaleLowerCase("pt-BR"));
    return fonteId
      ? { OR: [{ nome: { equals: nome, mode: "insensitive" } }, { id: fonteId }], tipo: "FORNECEDOR" }
      : { nome: { equals: nome, mode: "insensitive" }, tipo: "FORNECEDOR" };
  };
  const ehDaFonte = (candidato, nome) =>
    candidato.fonte.nome.toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR")
    || candidato.fonte.id === ligadas.get(nome.toLocaleLowerCase("pt-BR"));
  const criterios = lista.flatMap((item) => {
    const filtros = [];
    if (item.link) filtros.push({ url: item.link });
    if (item.codigo) filtros.push({ codigo: { equals: item.codigo, mode: "insensitive" }, fonte: fonteDe(item.nome) });
    // Sem codigo e sem link (NexMind, lista em dolar sem codigo: o produto e reconhecido pelo NOME, pedido do dono em
    // 06/11/2026 ao ver a linha sem foto), a descricao no fornecedor e o nome do produto na lista dele.
    else if (!item.link && item.descricao?.trim()) {
      filtros.push({ nome: { equals: item.descricao.trim(), mode: "insensitive" }, fonte: fonteDe(item.nome) });
    }
    return filtros;
  });
  if (!criterios.length) return { ok: true, itens: {} };
  try {
    const produtos = await prisma.produtoColetado.findMany({
      where: { OR: criterios, fonte: { tipo: "FORNECEDOR" } },
      select: {
        id: true, codigo: true, nome: true, url: true, quantidade: true, aChegar: true, estoqueStatus: true, ausenteDesde: true,
        aChegarPrevisao: true, emMontagem: true,
        precoNormal: true, precoComImpostos: true, precoReserva: true, precoMontagem: true, impostos: true,
        precosPorQuantidade: true,
        fonte: { select: { id: true, nome: true, dominio: true } },
      },
      orderBy: { vistoEm: "desc" },
      take: 300,
    });
    const itens = Object.fromEntries(lista.map((item) => {
      const codigo = String(item.codigo ?? "").toLocaleLowerCase("pt-BR");
      const descricao = String(item.descricao ?? "").trim().toLocaleLowerCase("pt-BR");
      const produto = produtos.find((candidato) => item.link && candidato.url === item.link)
        ?? produtos.find((candidato) => codigo && candidato.codigo?.toLocaleLowerCase("pt-BR") === codigo
          && ehDaFonte(candidato, item.nome))
        ?? produtos.find((candidato) => !codigo && !item.link && descricao
          && candidato.nome?.toLocaleLowerCase("pt-BR") === descricao && ehDaFonte(candidato, item.nome));
      return [item.id, produto ? {
        // A miniatura da linha (pedido do dono em 23/10/2026): /api/mercados/miniatura/<id>.
        coletadoId: produto.id,
        quantidade: produto.quantidade,
        aChegar: produto.aChegar,
        aChegarPrevisao: produto.aChegarPrevisao,
        // Em montagem (Fortek, 01/11/2026): informacao, NUNCA somada ao disponivel nem ao a chegar.
        emMontagem: produto.emMontagem,
        precoMontagem: produto.precoMontagem == null ? null : Number(produto.precoMontagem),
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
