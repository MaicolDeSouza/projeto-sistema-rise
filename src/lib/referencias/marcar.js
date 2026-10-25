import { prisma } from "@/lib/db";
import { custoDoFornecedor } from "@/lib/coleta/impostos";
import { rascunhoVale } from "@/lib/fornecedorRascunho";

/**
 * MARCAR AS REFERENCIAS de um produto (pedido do dono em 25/10/2026): a LLM escolhe os fornecedores e concorrentes no
 * acervo coletado, pelo roteiro de referencias, e os deixa vinculados ao produto para o dono conferir. A lupa marca
 * sozinha, na primeira busca, quem esta vinculado; a aba Fornecedores / Concorrentes mostra as linhas.
 *
 * Grava como a lupa grava ao fechar a janela, com duas diferencas de proposito:
 * - fornecedor NUNCA entra como padrao: o custo do produto nao muda e o rascunho do Bling continua valendo
 *   (`rascunhoVale`); quem escolhe o padrao e o dono, na tela;
 * - nada vai ao Bling, a Loja Integrada ou ao Mercado Livre (o Salvar do produto e que envia).
 *
 * Cada item e achado no acervo pela fonte (o nome, como `buscarNoMercado` devolve) e pelo codigo, ou pelo endereco
 * quando a loja nao tem codigo. Item que nao serve volta em `recusados` com o motivo; os outros seguem.
 */

const texto = (valor) => String(valor ?? "").trim();
const numero = (valor) => (valor == null ? null : Number(valor));

async function acharColetado({ fonte, codigo, url }) {
  const ondeFonte = { nome: { equals: texto(fonte), mode: "insensitive" } };
  if (texto(codigo)) {
    const porCodigo = await prisma.produtoColetado.findFirst({
      where: { codigo: texto(codigo), fonte: ondeFonte },
      include: { fonte: { select: { nome: true, tipo: true } } },
    });
    if (porCodigo) return porCodigo;
  }
  if (texto(url)) {
    return prisma.produtoColetado.findFirst({
      where: { url: texto(url), fonte: ondeFonte },
      include: { fonte: { select: { nome: true, tipo: true } } },
    });
  }
  return null;
}

const rotulo = (item) => `${texto(item.fonte)} ${texto(item.codigo) || texto(item.url)}`.trim();

/**
 * @param {string} sku
 * @param {{
 *   concorrentes?: { adicionar?: object[], remover?: object[] },
 *   fornecedores?: { adicionar?: object[], remover?: object[] },
 * }} plano  cada item: { fonte, codigo?, url? }
 */
export async function marcarReferencias(sku, plano) {
  const produto = await prisma.produto.findUnique({
    where: { sku },
    select: { id: true, fornecedorRascunho: true, fornecedores: { select: { id: true, fornecedorId: true, codigo: true, padrao: true } } },
  });
  if (!produto) return { ok: false, erro: `O produto ${sku} não existe no Rise.` };

  const feitos = [];
  const recusados = [];
  const recusar = (item, motivo) => recusados.push({ item: rotulo(item), motivo });

  // --- concorrentes: o vinculo e a referencia ao produto coletado (o preco a tela le de hoje)
  for (const item of plano?.concorrentes?.adicionar ?? []) {
    const coletado = await acharColetado(item);
    if (!coletado) { recusar(item, "não achei no acervo coletado (confira a fonte e o código como buscarNoMercado devolve)"); continue; }
    if (coletado.fonte.tipo !== "CONCORRENTE") { recusar(item, `${coletado.fonte.nome} é fornecedor, não concorrente`); continue; }
    const cadastro = await prisma.concorrente.findFirst({ where: { nome: { equals: coletado.fonte.nome, mode: "insensitive" } }, select: { id: true } });
    if (!cadastro) { recusar(item, `o concorrente "${coletado.fonte.nome}" não tem cadastro no Rise`); continue; }
    await prisma.produtoConcorrente.upsert({
      where: { produtoId_produtoColetadoId: { produtoId: produto.id, produtoColetadoId: coletado.id } },
      create: { produtoId: produto.id, produtoColetadoId: coletado.id },
      update: {},
    });
    feitos.push({ acao: "concorrente marcado", fonte: coletado.fonte.nome, codigo: coletado.codigo, nome: coletado.nome });
  }
  for (const item of plano?.concorrentes?.remover ?? []) {
    const coletado = await acharColetado(item);
    const apagados = coletado
      ? (await prisma.produtoConcorrente.deleteMany({ where: { produtoId: produto.id, produtoColetadoId: coletado.id } })).count
      : 0;
    if (apagados === 0) { recusar(item, "não estava marcado neste produto"); continue; }
    feitos.push({ acao: "concorrente desmarcado", fonte: coletado.fonte.nome, codigo: coletado.codigo, nome: coletado.nome });
  }

  // --- fornecedores: uma linha por fornecedor + codigo, nunca padrao
  const linhas = [...produto.fornecedores];
  for (const item of plano?.fornecedores?.adicionar ?? []) {
    const coletado = await acharColetado(item);
    if (!coletado) { recusar(item, "não achei no acervo coletado (confira a fonte e o código como buscarNoMercado devolve)"); continue; }
    if (coletado.fonte.tipo !== "FORNECEDOR") { recusar(item, `${coletado.fonte.nome} é concorrente, não fornecedor`); continue; }
    const fornecedor = await prisma.fornecedor.findFirst({ where: { nome: { equals: coletado.fonte.nome, mode: "insensitive" } }, select: { id: true, nome: true } });
    if (!fornecedor) { recusar(item, `o fornecedor "${coletado.fonte.nome}" não tem cadastro no Rise`); continue; }
    const codigo = texto(coletado.codigo) || null;
    if (linhas.some((linha) => linha.fornecedorId === fornecedor.id && texto(linha.codigo) === texto(codigo))) {
      feitos.push({ acao: "fornecedor já estava marcado", fonte: fornecedor.nome, codigo, nome: coletado.nome });
      continue;
    }
    const preco = custoDoFornecedor(
      { comImpostos: numero(coletado.precoComImpostos), normal: numero(coletado.precoNormal), promotional: numero(coletado.precoPromocional) },
      coletado.impostos,
    );
    const criada = await prisma.produtoFornecedor.create({
      data: {
        produtoId: produto.id,
        fornecedorId: fornecedor.id,
        descricao: coletado.nome ?? null,
        codigo,
        precoFornecedor: preco,
        precoCusto: preco,
        link: coletado.url ?? null,
        padrao: false,
      },
      select: { id: true, fornecedorId: true, codigo: true, padrao: true },
    });
    linhas.push(criada);
    feitos.push({ acao: "fornecedor marcado", fonte: fornecedor.nome, codigo, nome: coletado.nome, custo: preco });
  }
  for (const item of plano?.fornecedores?.remover ?? []) {
    const fornecedor = await prisma.fornecedor.findFirst({ where: { nome: { equals: texto(item.fonte), mode: "insensitive" } }, select: { id: true, nome: true } });
    const alvo = fornecedor && linhas.find((linha) => linha.fornecedorId === fornecedor.id && texto(linha.codigo) === texto(item.codigo));
    if (!alvo) { recusar(item, "não estava marcado neste produto"); continue; }
    // O padrao e o custo do produto: so o dono troca, na tela.
    if (alvo.padrao) { recusar(item, "é o fornecedor padrão do produto: só o dono tira, na tela"); continue; }
    await prisma.produtoFornecedor.delete({ where: { id: alvo.id } });
    linhas.splice(linhas.indexOf(alvo), 1);
    feitos.push({ acao: "fornecedor desmarcado", fonte: fornecedor.nome, codigo: alvo.codigo });
  }

  const concorrentes = await prisma.produtoConcorrente.count({ where: { produtoId: produto.id } });
  return {
    ok: true,
    feitos,
    recusados,
    vinculados: { concorrentes, fornecedores: linhas.length },
    rascunhoDoBling: rascunhoVale(linhas, produto.fornecedorRascunho) ? produto.fornecedorRascunho.nome : null,
    aviso: "Se o produto estiver aberto numa aba, o dono precisa abrir de novo antes de Salvar: a aba antiga apagaria as marcações novas.",
  };
}
