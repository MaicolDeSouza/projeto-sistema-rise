import { prisma } from "@/lib/db";
import { urlDe } from "@/lib/arquivos";
import { codigoDaComposicao, errosDaComposicao, proximoCodigoDaFaixa } from "../composicao";
import { lerConfigML, sortearVersiculoDoBanco } from "../configuracao";
import { custoDoProduto } from "../custo";
import { restoDaDescricao } from "./descricao";
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
      arquivos: { where: { tipo: "IMAGEM" }, orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }], select: { id: true, arquivo: true, principal: true } },
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

const aindaNaoConferido = (sku) => `O produto ${sku} ainda nao foi Conferido. So produto Conferido vira anuncio.`;

/** Acha um produto pelo codigo (SKU, igual) para abrir ou compor um anuncio. */
export async function buscarProdutoParaAnuncio(codigo) {
  const sku = String(codigo ?? "").trim();
  if (!sku) return { ok: false, erro: "Informe o codigo do produto." };

  const achado = await prisma.produto.findUnique({ where: { sku }, select: { id: true } });
  if (!achado) return { ok: false, erro: `Nenhum produto com o codigo ${sku}.` };

  const produto = (await contextoDosProdutos([achado.id]))[achado.id];
  if (!produto.conferido) return { ok: false, erro: aindaNaoConferido(produto.sku) };
  return { ok: true, produto };
}

/** Rascunho de um anuncio simples novo. Nao grava nada: so o Salvar cria o anuncio. */
export async function novoRascunhoML(produtoId) {
  const produtos = await contextoDosProdutos([produtoId]);
  const principal = produtos[produtoId];
  if (!principal) return { ok: false, erro: "Produto nao encontrado." };
  if (!principal.conferido) return { ok: false, erro: aindaNaoConferido(principal.sku) };

  const { frases } = await lerConfigML();
  // O versiculo tem que caber abaixo de 25% do texto final, que depende da descricao que o
  // rascunho traz do produto: monta-se sem versiculo para ler a descricao, e de novo com ele.
  const partida = { principal, produtosPorId: produtos, composicao: null };
  const { descricao } = rascunhoInicial({ ...partida, versiculo: null });
  const sorteio = await sortearVersiculoDoBanco({ resto: restoDaDescricao({ descricao, frases }) });

  return {
    ok: true,
    rascunho: rascunhoInicial({ ...partida, versiculo: sorteio.versiculo }),
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
    preco: dados.preco ?? null,
    estoque: dados.estoque ?? null,
    imagens: dados.imagens ?? [],
    descricao: anuncio.descricao ?? "",
    versiculo: dados.versiculo ?? null,
    atributos: anuncio.atributos ?? {},
    envio: { pesoKg: null, alturaCm: null, larguraCm: null, comprimentoCm: null, modo: "me2", freteGratis: false, retirada: false, ...dados.envio },
    composicao: dados.composicao ?? null,
  };
}

/**
 * Abre um anuncio do Mercado Livre para editar. Produto que deixou de ser Conferido nao
 * impede abrir: a validacao o aponta, e quem recusa e o Salvar.
 */
export async function carregarAnuncioML(id) {
  const naoAchou = { ok: false, erro: "Anuncio nao encontrado." };
  // `where: { id: undefined }` o Prisma le como "sem filtro": um id ausente nao pode chegar la.
  if (typeof id !== "string" || id === "") return naoAchou;
  const anuncio = await prisma.anuncio.findFirst({ where: { id, canal: CANAL } });
  if (!anuncio) return naoAchou;

  const rascunho = rascunhoDoAnuncio(anuncio);
  const { composicao } = rascunho;
  const idsDosProdutos = [rascunho.produtoId, ...(composicao?.itens ?? []).map((item) => item.produtoId)];
  const [produtos, { frases }] = await Promise.all([contextoDosProdutos(idsDosProdutos), lerConfigML()]);
  const emUso = composicao ? await codigoEmUso(composicao.codigo, { anuncioId: anuncio.id, itens: composicao.itens }) : null;

  return { ok: true, anuncioId: anuncio.id, status: anuncio.status, rascunho, contexto: { produtos, frases, codigoEmUso: emUso } };
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
  return outra ? `o anuncio "${outra.titulo || "sem titulo"}" com outra composicao` : null;
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
      if (!existente) return { ok: false, erro: "Anuncio nao encontrado." };
      // Anuncio publicado so muda pelo fluxo de publicacao (fase 3).
      if (existente.canal !== CANAL || existente.status === "PUBLICADO") return { ok: false, erro: "Este anuncio nao pode ser alterado aqui." };
    }

    const ids = [...new Set([rascunho.produtoId, ...itens.map((item) => item.produtoId)].filter(Boolean))];
    const encontrados = new Map((await prisma.produto.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, conferido: true } })).map((p) => [p.id, p]));
    for (const id of ids) {
      const produto = encontrados.get(id);
      if (!produto) return { ok: false, erro: rascunho.composicao ? "Um dos produtos da composicao foi excluido." : "O produto do anuncio foi excluido." };
      if (!produto.conferido) return { ok: false, erro: `O produto ${produto.sku} nao esta mais Conferido. Confira o cadastro antes de salvar o anuncio.` };
    }

    if (rascunho.composicao) {
      const composicao = { ...rascunho.composicao, codigo: rascunho.composicao.codigo.trim() };
      // Kit de um produto so tem um codigo certo, `{sku}_{N}`: o que veio da tela nao vale.
      if (itens.length === 1) composicao.codigo = codigoDaComposicao(encontrados.get(itens[0].produtoId)?.sku, itens[0].quantidade);
      const erros = errosDaComposicao(itens);
      if (erros.length > 0) return { ok: false, erro: erros.join(" ") };

      // A quantidade pode chegar como texto ("3"); gravada, e sempre numero.
      composicao.itens = itens.map(({ produtoId, quantidade }) => ({ produtoId, quantidade: Number(quantidade) }));
      const emUso = await codigoEmUso(composicao.codigo, { anuncioId, itens: composicao.itens });
      if (emUso) return { ok: false, erro: `O codigo ${composicao.codigo} ja esta em uso: ${emUso}.` };
      rascunho.composicao = composicao;
    }

    const { produtoId, titulo, descricao, categoriaId, atributos, ...dados } = rascunho;
    const colunas = { produtoId, titulo, descricao, categoriaExternaId: categoriaId || null, atributos };
    if (!existente) {
      const criado = await prisma.anuncio.create({ data: { ...colunas, canal: CANAL, status: "RASCUNHO", dados }, select: { id: true } });
      return { ok: true, id: criado.id };
    }
    // O que o editor nao conhece (a etapa da publicacao, na fase 3) fica como estava.
    await prisma.anuncio.update({ where: { id: anuncioId }, data: { ...colunas, dados: { ...(existente.dados ?? {}), ...dados } } });
    return { ok: true, id: anuncioId };
  } catch (erro) {
    console.error("[canais de venda]", erro);
    return { ok: false, erro: "Nao foi possivel salvar. Tente de novo." };
  }
}

const DADOS_DA_LINHA = { id: true, titulo: true, status: true, atualizadoEm: true, dados: true, produto: { select: { sku: true } } };

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
