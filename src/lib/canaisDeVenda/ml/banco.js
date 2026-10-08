import { prisma } from "@/lib/db";
import { urlDe } from "@/lib/arquivos";
import { codigoDaComposicao, errosDaComposicao, proximoCodigoDaFaixa } from "../composicao";
import { lerConfigML } from "../configuracao";
import { custoDoProduto } from "../custo";
import { RascunhoMLSchema } from "./esquema";
import { rascunhoInicial } from "./rascunho";

/**
 * O rascunho do anuncio do Mercado Livre no banco: ler o contexto dos produtos, abrir um
 * rascunho novo, carregar e salvar, e listar. Fica aqui, e nao dentro das Server Actions,
 * porque as acoes, as paginas e o teste (scripts/teste-anuncios-ml.js) leem as mesmas funcoes.
 *
 * Quem so le deixa o erro de banco subir (a pagina ou a acao ja tem o aviso de banco). Quem
 * grava, `salvarRascunhoML`, devolve `{ ok, erro }`: a tela mostra o recado e mantem o que
 * esta digitado.
 *
 * Onde mora cada campo do rascunho: titulo, descricao, categoriaId (`categoriaExternaId`),
 * atributos e produtoId tem coluna em `Anuncio`; todo o resto vai no JSON `dados`.
 */

const CANAL = "MERCADO_LIVRE";
const POR_PAGINA = 100;

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

/** Itens como conjunto de {produto, quantidade}: a mesma composicao em qualquer ordem. */
function assinaturaDosItens(itens) {
  return (Array.isArray(itens) ? itens : []).map((item) => `${item?.produtoId}:${Number(item?.quantidade)}`).sort().join("|");
}

/**
 * Contexto de produto por id (o que `rascunho.js` e `validacao.js` leem), com Decimal ja em
 * Number. Id que nao existe fica de fora do resultado.
 */
export async function contextoDosProdutos(ids) {
  const lista = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))];
  if (lista.length === 0) return {};

  const produtos = await prisma.produto.findMany({
    where: { id: { in: lista } },
    select: {
      id: true, sku: true, tituloBase: true, descricaoBase: true, marca: true, modelo: true, ean: true,
      conferido: true, blingId: true, precoVenda: true, estoque: true,
      pesoKg: true, alturaCm: true, larguraCm: true, comprimentoCm: true,
      custo: true, fornecedorRascunho: true,
      fornecedores: { select: { padrao: true, precoCusto: true } },
      arquivos: { where: { tipo: "IMAGEM", papel: "FOTO" }, orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }], select: { id: true, arquivo: true, principal: true } },
    },
  });

  return Object.fromEntries(
    produtos.map((p) => [
      p.id,
      {
        id: p.id,
        sku: p.sku,
        tituloBase: p.tituloBase,
        descricaoBase: p.descricaoBase,
        marca: p.marca,
        modelo: p.modelo,
        ean: p.ean,
        conferido: p.conferido,
        blingId: p.blingId,
        precoVenda: numero(p.precoVenda),
        estoque: p.estoque,
        pesoKg: numero(p.pesoKg),
        alturaCm: numero(p.alturaCm),
        larguraCm: numero(p.larguraCm),
        comprimentoCm: numero(p.comprimentoCm),
        custo: custoDoProduto({ fornecedores: p.fornecedores, fornecedorRascunho: p.fornecedorRascunho, custo: p.custo }),
        imagens: p.arquivos.map((a) => ({ id: a.id, url: urlDe(p.sku, "IMAGEM", a.arquivo), principal: a.principal })),
      },
    ]),
  );
}

const aindaNaoConferido = (sku) => `O produto ${sku} ainda não foi Conferido. Só produto Conferido vira anúncio.`;

/** Acha um produto pelo codigo (SKU, igual) para abrir ou compor um anuncio. */
export async function buscarProdutoParaAnuncio(codigo) {
  const sku = String(codigo ?? "").trim();
  if (!sku) return { ok: false, erro: "Informe o código do produto." };

  const achado = await prisma.produto.findUnique({ where: { sku }, select: { id: true } });
  if (!achado) return { ok: false, erro: `Nenhum produto com o código ${sku}.` };

  const produto = (await contextoDosProdutos([achado.id]))[achado.id];
  if (!produto.conferido) return { ok: false, erro: aindaNaoConferido(produto.sku) };
  return { ok: true, produto };
}

/** Rascunho de um anuncio simples novo. Nao grava nada: so o Salvar cria o anuncio. */
export async function novoRascunhoML(produtoId) {
  const produtos = await contextoDosProdutos([produtoId]);
  const principal = produtos[produtoId];
  if (!principal) return { ok: false, erro: "Produto não encontrado." };
  if (!principal.conferido) return { ok: false, erro: aindaNaoConferido(principal.sku) };

  const { frases } = await lerConfigML();
  return {
    ok: true,
    rascunho: rascunhoInicial({ principal, produtosPorId: produtos, composicao: null }),
    contexto: { produtos, frases, codigoEmUso: null },
  };
}

// Anuncio sem `dados` (gravado por fora do editor) abre com o que falta em branco, e nao quebra a tela.
function rascunhoDoAnuncio(anuncio) {
  const dados = anuncio.dados ?? {};
  return {
    produtoId: anuncio.produtoId,
    titulo: anuncio.titulo ?? "",
    familyName: dados.familyName ?? "",
    tipoAnuncio: dados.tipoAnuncio ?? "gold_special",
    condicao: dados.condicao ?? "new",
    categoriaId: anuncio.categoriaExternaId ?? null,
    categoriaNome: dados.categoriaNome ?? null,
    preco: dados.preco ?? null,
    estoque: dados.estoque ?? null,
    imagens: dados.imagens ?? [],
    descricao: anuncio.descricao ?? "",
    atributos: anuncio.atributos ?? {},
    // `logistica` e da fase 2: o anuncio gravado antes dela abre com o padrao da conta.
    envio: { pesoKg: null, alturaCm: null, larguraCm: null, comprimentoCm: null, modo: "me2", logistica: "xd_drop_off", freteGratis: false, retirada: false, ...dados.envio },
    composicao: dados.composicao ?? null,
  };
}

/**
 * Abre um anuncio do Mercado Livre para editar. Produto que deixou de ser Conferido nao
 * impede abrir: a validacao o aponta, e quem recusa e o Salvar.
 */
export async function carregarAnuncioML(id) {
  const naoAchou = { ok: false, erro: "Anúncio não encontrado." };
  // `where: { id: undefined }` o Prisma le como "sem filtro": um id ausente nao pode chegar la.
  if (typeof id !== "string" || id === "") return naoAchou;
  const anuncio = await prisma.anuncio.findFirst({ where: { id, canal: CANAL } });
  if (!anuncio) return naoAchou;

  const rascunho = rascunhoDoAnuncio(anuncio);
  const { composicao } = rascunho;
  const idsDosProdutos = [rascunho.produtoId, ...(composicao?.itens ?? []).map((item) => item.produtoId)];
  const [produtos, { frases }] = await Promise.all([contextoDosProdutos(idsDosProdutos), lerConfigML()]);
  const emUso = composicao ? await codigoEmUso(composicao.codigo, { anuncioId: anuncio.id, itens: composicao.itens }) : null;

  return {
    ok: true,
    anuncioId: anuncio.id,
    status: anuncio.status,
    rascunho,
    contexto: { produtos, frases, codigoEmUso: emUso },
    publicacao: anuncio.dados?.publicacao ?? null,
    idExterno: anuncio.idExterno ?? null,
    urlExterna: anuncio.urlExterna ?? null,
  };
}

/**
 * Quem ja usa o codigo do kit, ou `null` se esta livre. O codigo e o SKU do kit no Bling, entao
 * nao pode ser o de um produto do cadastro. Em outro anuncio so e aceito com a MESMA composicao
 * (o Classico e o Premium do mesmo kit dividem o produto do Bling); `anuncioId` e o anuncio que
 * esta sendo salvo, que nao conta contra si mesmo.
 */
export async function codigoEmUso(codigo, { anuncioId, itens }) {
  const alvo = String(codigo ?? "").trim();
  if (!alvo) return null;

  const produto = await prisma.produto.findUnique({ where: { sku: alvo }, select: { sku: true } });
  if (produto) return `o produto ${produto.sku} do cadastro`;

  const comOMesmoCodigo = await prisma.anuncio.findMany({
    where: {
      canal: CANAL,
      dados: { path: ["composicao", "codigo"], equals: alvo },
      ...(typeof anuncioId === "string" && anuncioId ? { id: { not: anuncioId } } : {}),
    },
    select: { titulo: true, dados: true },
  });
  const minha = assinaturaDosItens(itens);
  const outra = comOMesmoCodigo.find((anuncio) => assinaturaDosItens(anuncio.dados.composicao.itens) !== minha);
  return outra ? `o anúncio "${outra.titulo || "sem título"}" com outra composição` : null;
}

/**
 * Proximo codigo livre da faixa 25xxxx para um kit novo. Conta os SKUs dos produtos e os
 * codigos de kit dos anuncios, que ainda nao existem no cadastro.
 */
export async function sugerirCodigoDeKit() {
  const [produtos, anuncios] = await Promise.all([
    prisma.produto.findMany({ where: { sku: { startsWith: "25" } }, select: { sku: true } }),
    prisma.anuncio.findMany({ where: { canal: CANAL }, select: { dados: true } }),
  ]);
  return proximoCodigoDaFaixa([...produtos.map((p) => p.sku), ...anuncios.map((a) => a.dados?.composicao?.codigo)]);
}

/**
 * Por que a publicacao impede salvar (ou `null`): durante a publicacao o rascunho mudaria o que esta
 * sendo enviado, e depois que o item existe no ML (pausado) o rascunho ja nao e o que esta la: so
 * "Retomar publicacao" segue dali.
 */
function recusaDaPublicacao(anuncio) {
  if (anuncio?.status === "PUBLICANDO") return "Publicação em andamento: espere terminar.";
  if (anuncio?.dados?.publicacao?.itemId) return "O anúncio já existe no Mercado Livre (pausado). Use Retomar publicação.";
  return null;
}

const PUBLICACAO_VAZIA = {
  feitas: [],
  fotos: {},
  itemId: null,
  permalink: null,
  statusML: null,
  blingKitId: null,
  incerta: false,
  erro: null,
  etapaComErro: null,
};

/** O anuncio do ML e o estado da publicacao dele (`null` enquanto nunca foi publicado). */
export async function lerPublicacao(anuncioId) {
  if (typeof anuncioId !== "string" || anuncioId === "") return { anuncio: null, publicacao: null };
  const anuncio = await prisma.anuncio.findFirst({ where: { id: anuncioId, canal: CANAL } });
  return { anuncio, publicacao: anuncio?.dados?.publicacao ?? null };
}

/**
 * Grava o estado da publicacao (`dados.publicacao`), com a linha do anuncio travada (`FOR UPDATE`):
 * le `dados` de novo, mescla `parcial` (as listas sao trocadas; as fotos sao somadas, uma a uma, para a
 * queda no meio do envio nao perder as que ja subiram) e grava junto as `colunas` do anuncio (`status`,
 * `situacaoCanal`, `idExterno`, `urlExterna`, `erro`, `publicadoEm`, `payloadEnviado`).
 * `opcoes.blingProdutoId` grava o id do kit no Bling dentro de `dados.composicao`. Lanca se o anuncio
 * nao existe (a publicacao para ai).
 */
export async function gravarPublicacao(anuncioId, parcial = {}, colunas = {}, opcoes = {}) {
  if (typeof anuncioId !== "string" || anuncioId === "") throw new Error("Anúncio inválido.");
  return prisma.$transaction(async (tx) => {
    const travado = await tx.$queryRaw`SELECT id FROM "Anuncio" WHERE id = ${anuncioId} FOR UPDATE`;
    if (travado.length === 0) throw new Error("Anúncio não encontrado.");
    const { dados } = await tx.anuncio.findUnique({ where: { id: anuncioId }, select: { dados: true } });
    const anterior = { ...PUBLICACAO_VAZIA, ...(dados?.publicacao ?? {}) };
    const publicacao = {
      ...anterior,
      ...parcial,
      fotos: { ...anterior.fotos, ...(parcial?.fotos ?? {}) },
      atualizadoEm: new Date().toISOString(),
    };
    const novos = { ...(dados ?? {}), publicacao };
    if (opcoes.blingProdutoId !== undefined && novos.composicao) novos.composicao = { ...novos.composicao, blingProdutoId: opcoes.blingProdutoId };
    await tx.anuncio.update({ where: { id: anuncioId }, data: { ...colunas, dados: novos } });
    return publicacao;
  });
}

/**
 * Salva o rascunho: cria o anuncio (`anuncioId` nulo) ou atualiza o que ja existe. Problema da
 * validacao (titulo longo, preco em branco...) NAO impede salvar, e rascunho incompleto e
 * permitido. O que o servidor recusa e o que a tela nao tem como garantir: formato quebrado,
 * produto excluido ou fora do Conferido, composicao ruim e codigo de kit de outro.
 */
export async function salvarRascunhoML(anuncioId, entrada) {
  const lido = RascunhoMLSchema.safeParse(entrada);
  if (!lido.success) return { ok: false, erro: "O rascunho chegou incompleto. Recarregue a tela." };
  const rascunho = lido.data;
  const itens = rascunho.composicao?.itens ?? [];
  // O produto do anuncio e o primeiro item do kit. A tela ja faz isso, mas o servidor nao depende dela.
  if (itens[0]?.produtoId) rascunho.produtoId = itens[0].produtoId;

  try {
    let existente = null;
    if (anuncioId !== null) {
      if (typeof anuncioId === "string" && anuncioId !== "") {
        existente = await prisma.anuncio.findUnique({ where: { id: anuncioId }, select: { canal: true, status: true, dados: true } });
      }
      if (!existente) return { ok: false, erro: "Anúncio não encontrado." };
      // Anuncio publicado so muda pelo fluxo de publicacao (fase 3).
      if (existente.canal !== CANAL || existente.status === "PUBLICADO") return { ok: false, erro: "Este anúncio não pode ser alterado aqui." };
      const recusa = recusaDaPublicacao(existente);
      if (recusa) return { ok: false, erro: recusa };
    }

    const ids = [...new Set([rascunho.produtoId, ...itens.map((item) => item.produtoId)].filter(Boolean))];
    const encontrados = new Map((await prisma.produto.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, conferido: true } })).map((p) => [p.id, p]));
    for (const id of ids) {
      const produto = encontrados.get(id);
      if (!produto) return { ok: false, erro: rascunho.composicao ? "Um dos produtos da composição foi excluído." : "O produto do anúncio foi excluído." };
      if (!produto.conferido) return { ok: false, erro: `O produto ${produto.sku} não está mais Conferido. Confira o cadastro antes de salvar o anúncio.` };
    }

    if (rascunho.composicao) {
      const composicao = { ...rascunho.composicao, codigo: rascunho.composicao.codigo.trim() };
      // Kit de um produto so tem um codigo certo, `{sku}_{N}`: o que veio da tela nao vale.
      if (itens.length === 1) composicao.codigo = codigoDaComposicao(encontrados.get(itens[0].produtoId)?.sku, itens[0].quantidade);
      const erros = errosDaComposicao(itens);
      if (erros.length > 0) return { ok: false, erro: erros.join(" ") };

      // A quantidade pode chegar como texto ("3"); gravada, e sempre numero.
      composicao.itens = itens.map(({ produtoId, quantidade }) => ({ produtoId, quantidade: Number(quantidade) }));
      // O vinculo com o Bling e do servidor (a publicacao, na fase 3, o grava): o que vem da tela nao vale.
      // Anuncio novo nasce sem vinculo. Na atualizacao ele fica enquanto o codigo do kit for o mesmo; com outro
      // codigo e outro kit, e o vinculo antigo apontaria para o produto errado do Bling. Sem isso, um editor
      // desatualizado apagaria o vinculo e a nova tentativa criaria o kit em duplicidade.
      const guardada = existente?.dados?.composicao;
      composicao.blingProdutoId = guardada && String(guardada.codigo ?? "").trim() === composicao.codigo ? (guardada.blingProdutoId ?? null) : null;
      const emUso = await codigoEmUso(composicao.codigo, { anuncioId, itens: composicao.itens });
      if (emUso) return { ok: false, erro: `O código ${composicao.codigo} já está em uso: ${emUso}.` };
      rascunho.composicao = composicao;
    }

    const { produtoId, titulo, descricao, categoriaId, atributos, ...dados } = rascunho;
    const colunas = { produtoId, titulo, descricao, categoriaExternaId: categoriaId || null, atributos };
    if (!existente) {
      const criado = await prisma.anuncio.create({ data: { ...colunas, canal: CANAL, status: "RASCUNHO", dados }, select: { id: true } });
      return { ok: true, id: criado.id };
    }
    // O que o editor nao conhece (o estado da publicacao) fica como estava. Le e grava `dados` com a
    // linha travada: a publicacao grava a etapa no mesmo JSON, e "ler, mesclar, gravar" sem trava
    // podia apagar uma etapa gravada no meio.
    const recusa = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Anuncio" WHERE id = ${anuncioId} FOR UPDATE`;
      const agora = await tx.anuncio.findUnique({ where: { id: anuncioId }, select: { status: true, dados: true } });
      const motivo = agora.status === "PUBLICADO" ? "Este anúncio não pode ser alterado aqui." : recusaDaPublicacao(agora);
      if (motivo) return motivo;
      await tx.anuncio.update({ where: { id: anuncioId }, data: { ...colunas, dados: { ...(agora.dados ?? {}), ...dados } } });
      return null;
    });
    if (recusa) return { ok: false, erro: recusa };
    return { ok: true, id: anuncioId };
  } catch (erro) {
    console.error("[canais de venda]", erro);
    return { ok: false, erro: "Não foi possível salvar. Tente de novo." };
  }
}

const DADOS_DA_LINHA = { id: true, titulo: true, status: true, atualizadoEm: true, dados: true, idExterno: true, urlExterna: true, produto: { select: { sku: true } } };

// O codigo da linha e o do kit, ou o SKU do produto no anuncio simples.
function linhaDoAnuncio(anuncio) {
  return {
    id: anuncio.id,
    codigo: anuncio.dados?.composicao?.codigo || anuncio.produto.sku,
    titulo: anuncio.titulo ?? "",
    tipoAnuncio: anuncio.dados?.tipoAnuncio ?? null,
    preco: anuncio.dados?.preco ?? null,
    status: anuncio.status,
    atualizadoEm: anuncio.atualizadoEm,
    // O anuncio no ML (MLB e link), depois que a publicacao o criou.
    idExterno: anuncio.idExterno ?? null,
    urlExterna: anuncio.urlExterna ?? null,
  };
}

/** Os anuncios do Mercado Livre cujo produto principal e este, o mais recente primeiro. */
export async function anunciosMLDoProduto(produtoId) {
  // `where: { produtoId: undefined }` o Prisma le como "sem filtro": listaria todos os anuncios.
  if (typeof produtoId !== "string" || produtoId === "") return [];
  const anuncios = await prisma.anuncio.findMany({ where: { canal: CANAL, produtoId }, orderBy: { atualizadoEm: "desc" }, select: DADOS_DA_LINHA });
  return anuncios.map(linhaDoAnuncio);
}

/**
 * Lista dos anuncios do Mercado Livre, 100 por pagina, o mais recente primeiro. A busca nao
 * diferencia caixa e olha o titulo, o SKU do produto principal e o codigo do kit. Filtra e
 * pagina aqui, e nao no banco: o codigo do kit mora num JSON, que o Prisma nao filtra sem
 * diferenciar caixa, e a lista so tem os anuncios criados pelo editor (poucos).
 */
export async function listarAnunciosML({ busca, pagina } = {}) {
  const termo = String(busca ?? "").trim().toLowerCase();
  const anuncios = await prisma.anuncio.findMany({ where: { canal: CANAL }, orderBy: { atualizadoEm: "desc" }, select: DADOS_DA_LINHA });
  const achados = termo
    ? anuncios.filter((a) => [a.titulo, a.produto.sku, a.dados?.composicao?.codigo].some((texto) => String(texto ?? "").toLowerCase().includes(termo)))
    : anuncios;

  // Pagina fora do intervalo (link antigo, lista que encolheu) cai na mais proxima, nao numa tela vazia.
  const totalPaginas = Math.max(1, Math.ceil(achados.length / POR_PAGINA));
  const pedida = Number.parseInt(pagina, 10);
  const atual = Math.min(Math.max(Number.isFinite(pedida) ? pedida : 1, 1), totalPaginas);
  return {
    linhas: achados.slice((atual - 1) * POR_PAGINA, atual * POR_PAGINA).map(linhaDoAnuncio),
    total: achados.length,
    pagina: atual,
    totalPaginas,
  };
}
