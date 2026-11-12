import { prisma } from "@/lib/db";
import { custoDoFornecedor } from "@/lib/coleta/impostos";
import { rascunhoVale } from "@/lib/fornecedorRascunho";
import { garantirPadraoDoUnico } from "@/lib/fornecedorPadraoBanco";

/**
 * MARCAR AS REFERENCIAS de um produto (pedido do dono em 25/10/2026): a LLM escolhe os fornecedores e concorrentes no
 * acervo coletado, pelo roteiro de referencias, e os deixa vinculados ao produto para o dono conferir. A lupa marca
 * sozinha, na primeira busca, quem esta vinculado; a aba Fornecedores / Concorrentes mostra as linhas.
 *
 * Grava como a lupa grava ao fechar a janela, com duas diferencas de proposito:
 * - fornecedor nao entra como padrao: o custo do produto nao muda e o rascunho do Bling continua valendo
 *   (`rascunhoVale`); quem escolhe o padrao entre varios e o dono, na tela. A excecao e a regra do dono de 08/11/2026:
 *   o UNICO fornecedor do produto (sem rascunho do Bling valendo) vira padrao sozinho (`garantirPadraoDoUnico`);
 * - nada vai ao Bling, a Loja Integrada ou ao Mercado Livre (o Salvar do produto e que envia).
 *
 * Cada item e achado no acervo pela fonte (o nome, como `buscarNoMercado` devolve) e pelo codigo, ou pelo endereco
 * quando a loja nao tem codigo. Item que nao serve volta em `recusados` com o motivo; os outros seguem.
 */

const texto = (valor) => String(valor ?? "").trim();
const numero = (valor) => (valor == null ? null : Number(valor));

// "N/A" e a marca de "sem codigo" da coleta (SEM_CODIGO), nunca um codigo: casar por ele pegava o primeiro item sem codigo da
// fonte (12/11/2026: o motor N20 da NexMind virou o UNO R3). Sem codigo, o item e achado pelo endereco ou pelo nome exato.
const semCodigo = (codigo) => !texto(codigo) || texto(codigo).toUpperCase() === "N/A";

async function acharColetado({ fonte, codigo, url, nome }) {
  const ondeFonte = { nome: { equals: texto(fonte), mode: "insensitive" } };
  if (!semCodigo(codigo)) {
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
  if (semCodigo(codigo) && texto(nome)) {
    return prisma.produtoColetado.findFirst({
      where: { nome: { equals: texto(nome), mode: "insensitive" }, fonte: ondeFonte },
      include: { fonte: { select: { nome: true, tipo: true } } },
    });
  }
  return null;
}

const rotulo = (item) => `${texto(item.fonte)} ${semCodigo(item.codigo) ? texto(item.url) || texto(item.nome) : texto(item.codigo)}`.trim();
// A linha do fornecedor e a mesma do item: pelo codigo; sem codigo, pela descricao (o nome na lista, como o custo segue a lista).
const mesmaLinha = (linha, codigo, nome) =>
  semCodigo(codigo) ? semCodigo(linha.codigo) && texto(linha.descricao).toLowerCase() === texto(nome).toLowerCase() : texto(linha.codigo) === texto(codigo);

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
    select: { id: true, fornecedorRascunho: true, fornecedores: { select: { id: true, fornecedorId: true, codigo: true, descricao: true, padrao: true } } },
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

  // --- fornecedores: uma linha por fornecedor + codigo, sem padrao (o unico vira padrao no fim, regra do dono)
  const linhas = [...produto.fornecedores];
  for (const item of plano?.fornecedores?.adicionar ?? []) {
    const coletado = await acharColetado(item);
    if (!coletado) { recusar(item, "não achei no acervo coletado (confira a fonte e o código como buscarNoMercado devolve)"); continue; }
    if (coletado.fonte.tipo !== "FORNECEDOR") { recusar(item, `${coletado.fonte.nome} é concorrente, não fornecedor`); continue; }
    const fornecedor = await prisma.fornecedor.findFirst({ where: { nome: { equals: coletado.fonte.nome, mode: "insensitive" } }, select: { id: true, nome: true } });
    if (!fornecedor) { recusar(item, `o fornecedor "${coletado.fonte.nome}" não tem cadastro no Rise`); continue; }
    // "N/A" vira codigo vazio, como a tela de Fornecedores grava (senao o custo que segue a lista casaria todo "N/A").
    const codigo = semCodigo(coletado.codigo) ? null : texto(coletado.codigo);
    if (linhas.some((linha) => linha.fornecedorId === fornecedor.id && mesmaLinha(linha, codigo, coletado.nome))) {
      feitos.push({ acao: "fornecedor já estava marcado", fonte: fornecedor.nome, codigo, nome: coletado.nome });
      continue;
    }
    const preco = custoDoFornecedor(
      {
        comImpostos: numero(coletado.precoComImpostos),
        normal: numero(coletado.precoNormal),
        // Fortek: quem so esta a chegar (reserva) ou em montagem tem so esse preco (09/11/2026).
        reserva: numero(coletado.precoReserva),
        montagem: numero(coletado.precoMontagem),
        promotional: numero(coletado.precoPromocional),
      },
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
      select: { id: true, fornecedorId: true, codigo: true, descricao: true, padrao: true },
    });
    linhas.push(criada);
    feitos.push({ acao: "fornecedor marcado", fonte: fornecedor.nome, codigo, nome: coletado.nome, custo: preco });
  }
  for (const item of plano?.fornecedores?.remover ?? []) {
    const fornecedor = await prisma.fornecedor.findFirst({ where: { nome: { equals: texto(item.fonte), mode: "insensitive" } }, select: { id: true, nome: true } });
    if (semCodigo(item.codigo) && !texto(item.nome)) { recusar(item, "sem código: diga o nome do produto na lista"); continue; }
    const alvo = fornecedor && linhas.find((linha) => linha.fornecedorId === fornecedor.id && mesmaLinha(linha, item.codigo, item.nome));
    if (!alvo) { recusar(item, "não estava marcado neste produto"); continue; }
    // O padrao e o custo do produto: so o dono troca, na tela.
    if (alvo.padrao) { recusar(item, "é o fornecedor padrão do produto: só o dono tira, na tela"); continue; }
    await prisma.produtoFornecedor.delete({ where: { id: alvo.id } });
    linhas.splice(linhas.indexOf(alvo), 1);
    feitos.push({ acao: "fornecedor desmarcado", fonte: fornecedor.nome, codigo: alvo.codigo });
  }
  // O unico fornecedor e sempre o padrao (pedido do dono em 08/11/2026): com um so, nao ha o que o dono escolher.
  if (await garantirPadraoDoUnico(produto.id)) {
    const unica = linhas.length === 1 ? linhas[0] : null;
    if (unica) unica.padrao = true;
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
