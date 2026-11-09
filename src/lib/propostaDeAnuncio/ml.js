import { prisma } from "@/lib/db";
import { codigoDaComposicao, custoDaComposicao, errosDaComposicao } from "@/lib/canaisDeVenda/composicao";
import { completarFichaPelaDescricao, problemasDosAtributos } from "@/lib/canaisDeVenda/ml/atributos";
import { contextoDosProdutos, carregarAnuncioML, novoRascunhoML, salvarRascunhoML } from "@/lib/canaisDeVenda/ml/banco";
import { catalogosDosMeusAnuncios, lerPrimeiroDoCatalogo, sugerirCatalogos } from "@/lib/canaisDeVenda/ml/catalogo";
import { eanDoKit } from "@/lib/canaisDeVenda/ml/eanDoKit";
import { LIMITE_DO_PREMIUM, REGRAS_DAS_VARIANTES, ROTULO_DA_VARIANTE, rascunhoDaVariante, varianteDoRascunho } from "@/lib/canaisDeVenda/ml/faixas";
import { anunciosDoSkuNaConta, candidatosParaReaproveitar, reaproveitarAnuncioML } from "@/lib/canaisDeVenda/ml/reaproveitar";
import { ROTULO_DO_TIPO_ML } from "@/lib/canaisDeVenda/ml/rotulos";
import { sugerirCategoria } from "@/lib/canaisDeVenda/ml/inteligencia";
import { lerCategoriaCompleta } from "@/lib/canaisDeVenda/ml/leitura";
import { tituloDoKit } from "@/lib/canaisDeVenda/ml/rascunho";
import { lerReferenciasML } from "@/lib/canaisDeVenda/ml/referencias";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";
import { aplicarProposta, montarProposta } from "./preencher";
import { precoDaPropostaML } from "./preco";
import { VERSAO_ROTEIRO_ML } from "./roteiros";
import { exigirProdutoPronto } from "./situacao";

/**
 * A proposta do anuncio do Mercado Livre (spec 2026-10-23, Entrega 2): categoria, titulo, ficha, os catalogos sugeridos
 * e o preco calculado pelo Rise. So GET no ML; grava so no rascunho do `Anuncio` do Rise (sempre um Classico). Nada vai
 * ao ranking (`CatalogoReferenciaML`): a proposta SUGERE os catalogos, o dono adiciona. Os links achados quando nao ha
 * catalogo ficam so na proposta.
 */

const CANAL = "MERCADO_LIVRE";
const CLASSICO = "gold_special";
const PREMIUM = "gold_pro";
export const MAXIMO_DE_CATALOGOS = 10;
export const MINIMO_DE_ANUNCIOS = 5;
const MAXIMO_DE_LINKS = 5;
// A proposta nunca chama a IA paga do Rise: a sugestao de categoria roda so com o ML e a reserva pelo catalogo.
const SEM_IA = { escolher: async () => null, termos: async () => [] };
// O GTIN nao se deduz (e da peca): fica fora da LLM, como na ficha da fase 2.
const SO_DO_DONO = new Set(["GTIN", "EMPTY_GTIN_REASON", "SELLER_SKU"]);
const PARA_A_LEITURA = new Set([401, 429]);

async function produtoPeloSku(sku) {
  const achado = await prisma.produto.findUnique({ where: { sku }, select: { id: true, tipo: true } });
  if (!achado) throw new ErroDeFerramenta(`Produto ${sku} não encontrado.`);
  return { ...(await contextoDosProdutos([achado.id]))[achado.id], tipo: achado.tipo };
}

const ehComposicao = (produto) => produto.tipo === "COMPOSICAO";
const limparTitulo = (texto) => String(texto ?? "").replace(/\s+/g, " ").trim();

/**
 * O "kit de N" no ML (pedido do dono em 28/10/2026: "crie um anuncio no ML com 10 pecas do 900211, nao quero que voce crie
 * kit no Rise, apenas no ML vinculando o kit ao produto base para controle de estoque"): a composicao do PROPRIO anuncio,
 * como o editor monta (um item, o produto, com N unidades; codigo `{sku}_{N}`). Nenhum produto novo: o estoque e o que o
 * produto base monta. `null` sem quantidade (anuncio de 1 unidade). O produto que ja e kit (Composicao) nao entra: o kit
 * no ML e sempre do produto base.
 */
function kitNoML(produto, quantidade) {
  if (quantidade === undefined || quantidade === null) return null;
  if (ehComposicao(produto)) throw new ErroDeFerramenta(`O produto ${produto.sku} já é um kit (composição): o kit no Mercado Livre é montado a partir do produto base.`);
  const itens = [{ produtoId: produto.id, quantidade: Number(quantidade) }];
  const erros = errosDaComposicao(itens);
  if (erros.length > 0) throw new ErroDeFerramenta(`Kit no Mercado Livre: ${erros.join(" ")}`);
  return { itens, codigo: codigoDaComposicao(produto.sku, quantidade), blingProdutoId: null };
}

/** O custo do anuncio: o do produto, ou no kit a soma quantidade x custo (a mesma conta da aba Preço do editor). */
function custoDoAnuncio(produto, kit) {
  const unitario = produto.custo?.valor ?? null;
  return kit ? custoDaComposicao(kit.itens, { [produto.id]: unitario }).valor : unitario;
}

/**
 * O preco das mesmas unidades na loja (o preco de venda do produto; no kit no ML, N vezes ele), de onde sai o lucro que o
 * preco do ML tem de repetir (pedido do dono em 05/11/2026). `null` sem preco de venda.
 */
function precoNaLojaDoAnuncio(produto, kit) {
  const unitario = Number(produto.precoVenda);
  if (!(unitario > 0)) return null;
  return kit ? unitario * kit.itens[0].quantidade : unitario;
}

const meuVendedor = async (cliente) => (typeof cliente.usuarioId === "function" ? cliente.usuarioId().catch(() => null) : null);
const doCatalogo = (catalogo) => ({ id: catalogo.id, nome: catalogo.nome, total: catalogo.total, primeiro: catalogo.primeiro ? { preco: catalogo.primeiro.preco, meu: Boolean(catalogo.primeiro.meu) } : null });

export async function lerParaPropostaML(cliente, sku, { quantidade } = {}) {
  const produto = await produtoPeloSku(sku);
  const kit = kitNoML(produto, quantidade);
  const avisos = [];
  const sugestao = await sugerirCategoria(cliente, { titulo: produto.tituloBase ?? "", produto, ia: SEM_IA });
  if (sugestao.aviso) avisos.push(sugestao.aviso);
  const provavel = sugestao.candidatas.find((candidata) => candidata.folha) ?? null;
  const categoria = provavel ? await lerCategoriaCompleta(cliente, provavel.categoriaId) : null;

  const meuSellerId = await meuVendedor(cliente);
  let catalogos = [];
  try {
    catalogos = (await sugerirCatalogos(cliente, { categoriaId: provavel?.categoriaId ?? null, titulo: produto.tituloBase ?? "", excluir: [], meuSellerId })).map(doCatalogo);
  } catch (erro) {
    avisos.push(`Os catálogos não foram lidos agora (Mercado Livre respondeu ${erro?.status ?? "erro"}): procure de novo em instantes.`);
  }
  const meusCatalogos = await catalogosDosMeusAnuncios(cliente, sku).catch(() => []);
  // O que ja existe do produto, ANTES de propor (pedido do dono em 08/11/2026: "consultar no ML primeiro se tem anuncio daquele
  // produto e reaproveitar"): os anuncios do codigo na conta fora do Rise e os que o Rise ja tem, com a variante em texto.
  const anunciosNaConta = kit ? [] : await anunciosForaDoRise(cliente, produto, avisos);
  const anunciosNoRise = await anunciosDoProdutoNoRise(produto.id);

  return {
    // `composicao` diz se a LLM pode propor outro titulo (so o kit); nos demais o titulo do anuncio e o `nome`.
    // No kit no ML o custo ja e o das N unidades, e `kit` diz a quantidade, o codigo e o titulo de partida.
    produto: {
      sku: produto.sku,
      nome: produto.tituloBase,
      composicao: ehComposicao(produto) || Boolean(kit),
      marca: produto.marca,
      modelo: produto.modelo,
      descricao: produto.descricaoBase ?? "",
      custo: custoDoAnuncio(produto, kit),
      origemDoCusto: kit ? `${kit.itens[0].quantidade} x o custo do produto (${produto.custo?.origem ?? "sem origem"})` : (produto.custo?.origem ?? null),
      pesoKg: produto.pesoKg,
      kit: kit ? { quantidade: kit.itens[0].quantidade, codigo: kit.codigo, custoUnitario: produto.custo?.valor ?? null, tituloDePartida: limparTitulo(tituloDoKit(produto, kit.itens)) } : null,
    },
    categorias: sugestao.candidatas.map(({ categoriaId, nome, caminho, folha, limiteTitulo }) => ({ categoriaId, nome, caminho, folha, limiteTitulo })),
    atributos: categoria?.atributos ?? [],
    catalogos,
    meusCatalogos,
    referencias: (await lerReferenciasML(produto.id).catch(() => [])).map((referencia) => ({ catalogoId: referencia.catalogoId, nome: referencia.nome })),
    regras: { maximoDeCatalogos: MAXIMO_DE_CATALOGOS, minimoDeAnuncios: MINIMO_DE_ANUNCIOS, maximoDeLinks: MAXIMO_DE_LINKS },
    anunciosNaConta,
    anunciosNoRise,
    regrasDasVariantes: REGRAS_DAS_VARIANTES,
    avisos,
  };
}

/** A ficha de uma categoria para a LLM (quando ela escolhe outra categoria que nao a provavel). */
export async function lerCategoriaML(cliente, categoriaId) {
  const categoria = await lerCategoriaCompleta(cliente, categoriaId);
  if (!categoria) throw new ErroDeFerramenta(`A categoria ${categoriaId} não existe no Mercado Livre.`);
  return { categoriaId, nome: categoria.nome, caminho: categoria.caminho, folha: categoria.folha, limiteTitulo: categoria.limiteTitulo, atributos: categoria.atributos };
}

// O anuncio e do mesmo formato: simples (sem composicao) ou o kit do produto com a mesma quantidade (um item so, ele).
function mesmoFormato(composicao, kit) {
  if (!kit) return !composicao;
  const itens = composicao?.itens ?? [];
  const pedido = kit.itens[0];
  return itens.length === 1 && itens[0].produtoId === pedido.produtoId && Number(itens[0].quantidade) === pedido.quantidade;
}

/**
 * O Classico ainda nao publicado do produto (sem item no ML), do mesmo formato (simples ou o kit de N), para a proposta
 * atualizar em vez de criar outro.
 */
async function classicoEmRascunho(produtoId, kit) {
  return rascunhoEmAberto(produtoId, kit, CLASSICO);
}

/** O rascunho ainda nao publicado do produto, do `tipo` (Classico ou Premium) e do mesmo formato. */
async function rascunhoEmAberto(produtoId, kit, tipo) {
  const anuncios = await prisma.anuncio.findMany({ where: { canal: CANAL, produtoId, status: { notIn: ["PUBLICADO", "PUBLICANDO"] } }, orderBy: { criadoEm: "desc" }, select: { id: true, dados: true } });
  return anuncios.find((anuncio) => (anuncio.dados?.tipoAnuncio ?? CLASSICO) === tipo && mesmoFormato(anuncio.dados?.composicao, kit) && !anuncio.dados?.publicacao?.itemId) ?? null;
}

/** Le o 1o de cada catalogo pedido; fica so o de 5 ou mais anuncios. 401/429 param a leitura (a cota acabou). */
async function lerCatalogos(cliente, ids, avisos) {
  const meuSellerId = await meuVendedor(cliente);
  const aceitos = [];
  for (const id of [...new Set((ids ?? []).map((valor) => String(valor).trim()).filter(Boolean))].slice(0, MAXIMO_DE_CATALOGOS)) {
    let lido;
    try {
      lido = await lerPrimeiroDoCatalogo(cliente, id, { meuSellerId });
    } catch (erro) {
      avisos.push(`O catálogo ${id} não foi lido (Mercado Livre respondeu ${erro?.status ?? "erro"}).`);
      if (PARA_A_LEITURA.has(erro?.status)) break;
      continue;
    }
    if (!lido.primeiro) {
      avisos.push(`O catálogo ${id} não tem anúncios: ficou de fora.`);
      continue;
    }
    if (lido.total < MINIMO_DE_ANUNCIOS) {
      avisos.push(`O catálogo ${id} tem ${lido.total} anúncio(s), menos de ${MINIMO_DE_ANUNCIOS}: ficou de fora.`);
      continue;
    }
    const produto = await cliente.get(`/products/${encodeURIComponent(id)}`).catch(() => null);
    aceitos.push({
      catalogoId: id,
      nome: produto?.ok ? String(produto.dados?.name ?? "") || null : null,
      total: lido.total,
      primeiro: { preco: lido.primeiro.preco, apelido: lido.primeiro.vendedorApelido ?? null, meu: Boolean(lido.primeiro.meu) },
    });
  }
  return aceitos;
}

/**
 * @param {object} cliente  o cliente do ML (so GET)
 * @param {string} sku
 * @param {{ categoriaId: string, titulo?: string, quantidade?: number, atributos?: object, catalogos?: string[], linksSemCatalogo?: { url, titulo, preco }[], relatorio?: string }} entrada
 *   `titulo` so vale para produto com composicao (kit) e para o kit no ML; nos demais o titulo do anuncio e o do produto base.
 *   `quantidade`: o kit de N no ML (ver `kitNoML`).
 */
export async function gravarPropostaML(cliente, sku, { categoriaId, titulo, quantidade, atributos = {}, catalogos = [], linksSemCatalogo = [], relatorio = "" }) {
  await exigirProdutoPronto(sku);
  const produto = await produtoPeloSku(sku);
  const kit = kitNoML(produto, quantidade);

  const categoria = await lerCategoriaCompleta(cliente, String(categoriaId ?? "").trim());
  if (!categoria) throw new ErroDeFerramenta(`A categoria ${categoriaId} não existe no Mercado Livre.`);
  if (!categoria.folha) throw new ErroDeFerramenta(`A categoria ${categoriaId} não é folha (não aceita anúncio): escolha uma das filhas.`);

  const avisos = [];
  // Pedido do dono em 24/10/2026: o titulo do anuncio vem do produto base, e so a composicao (kit) pode ter outro. O kit no
  // ML tambem: sem titulo na chamada, o de partida do editor ("10x BARRA DE PINOS ...").
  const composicao = ehComposicao(produto) || Boolean(kit);
  const tituloDoProduto = limparTitulo(kit ? tituloDoKit(produto, kit.itens) : produto.tituloBase);
  const tituloEnviado = limparTitulo(titulo);
  const tituloLimpo = composicao ? tituloEnviado || tituloDoProduto : tituloDoProduto;
  if (!tituloLimpo) throw new ErroDeFerramenta("O produto não tem nome: o título do anúncio vem dele.");
  if (!composicao && tituloEnviado && tituloEnviado !== tituloDoProduto) {
    avisos.push("O título enviado foi ignorado: o anúncio usa o nome do produto (só produto com composição aceita outro título).");
  }
  if (categoria.limiteTitulo && tituloLimpo.length > categoria.limiteTitulo) {
    if (composicao) throw new ErroDeFerramenta(`O título tem ${tituloLimpo.length} caracteres; esta categoria aceita até ${categoria.limiteTitulo}.`);
    // O nome e do produto: nao se corta aqui, o dono encurta no cadastro dele.
    avisos.push(`O nome do produto tem ${tituloLimpo.length} caracteres e esta categoria aceita até ${categoria.limiteTitulo}: encurte o nome no cadastro do produto, que é o título do anúncio.`);
  }

  // So os atributos da categoria e nunca os do dono (GTIN e o motivo); valor em texto, sem espacos sobrando.
  const idsDaCategoria = new Set(categoria.atributos.map((atributo) => atributo.id));
  const ficha = Object.fromEntries(
    Object.entries(atributos ?? {})
      .filter(([id, valor]) => idsDaCategoria.has(id) && !SO_DO_DONO.has(id) && String(valor ?? "").trim() !== "")
      .map(([id, valor]) => [id, String(valor).trim()]),
  );

  const aceitos = await lerCatalogos(cliente, catalogos, avisos);
  const links = (linksSemCatalogo ?? []).filter((link) => Number(link?.preco) > 0).slice(0, MAXIMO_DE_LINKS).map((link) => ({ url: String(link.url), titulo: String(link.titulo ?? ""), preco: Number(link.preco) }));
  const precosDoRanking = aceitos.length > 0 ? aceitos.filter((c) => !c.primeiro.meu && Number(c.primeiro.preco) > 0).map((c) => Number(c.primeiro.preco)) : links.map((link) => link.preco);
  if (aceitos.length === 0 && links.length > 0) avisos.push("Sem catálogo: o preço foi comparado com os links achados pela pesquisa (preços não conferidos pelo Rise).");

  // Os anuncios do codigo que a conta do ML ja tem e o Rise nao (pedido do dono em 08/11/2026: "Esse item ja tem produto
  // publicado no ML e nao fui informado"). So leitura; o aviso vem primeiro, para o dono reaproveitar em vez de publicar outro.
  const anunciosNaConta = kit ? [] : await anunciosForaDoRise(cliente, produto, avisos);

  const existente = await classicoEmRascunho(produto.id, kit);
  let base;
  if (existente) {
    const carregado = await carregarAnuncioML(existente.id);
    if (!carregado.ok) throw new ErroDeFerramenta(carregado.erro);
    base = carregado.rascunho;
  } else {
    // O kit no ML nasce como o editor o monta: fotos, descricao com os itens inclusos, estoque, peso e medidas do kit.
    const novo = await novoRascunhoML(produto.id, { composicao: kit });
    if (!novo.ok) throw new ErroDeFerramenta(novo.erro);
    base = { ...novo.rascunho, tipoAnuncio: CLASSICO };
  }
  // No rascunho que a proposta cria, tudo o que vem do produto e o ponto de partida: a proposta preenche por cima.
  const opcoes = existente ? {} : { vazio: () => true };

  // Modelo e Microcontrolador que ninguem preencheu saem das especificacoes da descricao (pedido do dono em 03/11/2026), so
  // os que a categoria tem; o que a conversa mandou ou o rascunho ja tinha fica.
  Object.assign(ficha, completarFichaPelaDescricao({ ...base.atributos, ...ficha }, categoria.atributos, produto.descricaoBase));

  const propostos = { categoriaId: categoria.id ?? String(categoriaId).trim(), categoriaNome: categoria.nome };
  // Fora da composicao o titulo nao e proposta: o rascunho fica com o do produto (um rascunho antigo, com outro, volta a ele).
  if (composicao) propostos.titulo = tituloLimpo;
  else base.titulo = tituloDoProduto;
  for (const [id, valor] of Object.entries(ficha)) propostos[`atributos.${id}`] = valor;
  const primeira = aplicarProposta(base, propostos, opcoes);

  const preco = await precoDaPropostaML(cliente, { ...primeira.rascunho, tipoAnuncio: CLASSICO }, { custo: custoDoAnuncio(produto, kit), precoNaLoja: precoNaLojaDoAnuncio(produto, kit), precos: precosDoRanking });
  avisos.push(...preco.avisos);
  // A variante que o preco pede (definicoes do dono em 08/11/2026): sem frete abaixo de R$ 72, com frete gratis de 72 em diante
  // (72-78,99 sobe para R$ 79). O tipo continua Classico; o frete gratis do rascunho acompanha a variante.
  const comVariante = preco.variante ? rascunhoDaVariante(primeira.rascunho, preco.variante) : primeira.rascunho;
  const segunda = preco.valor === null ? { rascunho: comVariante, campos: [], sugestoes: {}, valores: {} } : aplicarProposta(comVariante, { preco: preco.valor }, opcoes);

  // O kit no ML confere a ficha como o editor confere (o GTIN e o EAN interno do kit, nao o da peca).
  const doAnuncio = segunda.rascunho.composicao;
  for (const problema of problemasDosAtributos(segunda.rascunho.atributos ?? {}, categoria.atributos, { kit: Boolean(doAnuncio), gtinDoKit: doAnuncio ? eanDoKit(doAnuncio) : null })) {
    if (problema.campo !== "GTIN") avisos.push(`Ficha: ${problema.problema}`);
  }

  const campos = [...primeira.campos, ...segunda.campos];
  const sugestoes = { ...primeira.sugestoes, ...segunda.sugestoes };
  const valores = { ...primeira.valores, ...segunda.valores };
  const doPreco = (lido) => ({ valor: lido.valor, variante: lido.variante, freteGratis: lido.freteGratis, lucro: lido.lucro, lucroNaLoja: lido.lucroNaLoja, precoNaLoja: lido.precoNaLoja, markup: lido.markup, posicao: lido.posicao, total: lido.total, teto: lido.teto });

  // O Classico da variante que ja esta no Rise publicado (reaproveitado da conta ou publicado antes) nao ganha outro: a proposta
  // avisa e cuida so do que falta (pedido do dono em 08/11/2026: consultar o ML primeiro e reaproveitar).
  const jaPublicado = preco.variante ? await publicadoDaVariante(produto.id, kit, preco.variante) : null;
  let anuncioId = null;
  let propostaDoClassico = null;
  if (jaPublicado) {
    avisos.unshift(`O ${ROTULO_DA_VARIANTE[preco.variante] ?? preco.variante} deste produto já está no Rise (${jaPublicado.idExterno ?? jaPublicado.id}): a proposta não criou outro.`);
  } else {
    const salvo = await salvarRascunhoML(existente?.id ?? null, segunda.rascunho);
    if (!salvo.ok) throw new ErroDeFerramenta(`O rascunho do Mercado Livre não foi gravado: ${salvo.erro}`);
    anuncioId = salvo.id;
  }

  // O Premium (decisao do dono em 08/11/2026): com o Classico a R$ 150 ou mais, o Premium com frete gratis vem junto, com o
  // preco do mesmo lucro (a comissao do Premium e maior), no rascunho Premium do produto (gravar de novo atualiza o mesmo).
  const premium =
    preco.valor !== null && preco.valor >= LIMITE_DO_PREMIUM
      ? await propostaDoPremium(cliente, { produto, kit, rascunhoDoClassico: segunda.rascunho, custo: custoDoAnuncio(produto, kit), precoNaLoja: precoNaLojaDoAnuncio(produto, kit), precos: precosDoRanking, campos, sugestoes, valores, relatorio, aceitos, links, avisos, doPreco })
      : null;

  if (anuncioId) {
    propostaDoClassico = montarProposta({ versaoDoRoteiro: VERSAO_ROTEIRO_ML, campos, sugestoes, valores, relatorio, extras: { avisos, catalogosSugeridos: aceitos, links, preco: doPreco(preco) } });
    await gravarProposta(anuncioId, propostaDoClassico);
  }
  return {
    anuncioId,
    anunciosNaConta,
    titulo: tituloLimpo,
    kit: kit ? { quantidade: kit.itens[0].quantidade, codigo: kit.codigo } : null,
    campos,
    sugestoes,
    preco: propostaDoClassico?.preco ?? doPreco(preco),
    ...(premium ? { premium } : {}),
    catalogosSugeridos: aceitos,
    avisos,
  };
}

/** O anuncio do produto, do mesmo formato, que ja esta no ML (publicado, publicando ou com item criado) na `variante`. */
async function publicadoDaVariante(produtoId, kit, variante) {
  const anuncios = await prisma.anuncio.findMany({ where: { canal: CANAL, produtoId }, select: { id: true, status: true, idExterno: true, situacaoCanal: true, dados: true } });
  return (
    anuncios.find((anuncio) => {
      const noML = ["PUBLICADO", "PUBLICANDO"].includes(anuncio.status) || Boolean(anuncio.dados?.publicacao?.itemId);
      if (!noML || anuncio.situacaoCanal === "ENCERRADA" || !mesmoFormato(anuncio.dados?.composicao, kit)) return false;
      return varianteDoRascunho({ tipoAnuncio: anuncio.dados?.tipoAnuncio, envio: anuncio.dados?.envio, preco: anuncio.dados?.preco }) === variante;
    }) ?? null
  );
}

/**
 * O Premium com frete gratis da proposta: o rascunho do Classico com o tipo Premium e o preco do mesmo lucro, gravado no
 * Premium em rascunho do produto (ou num novo), com a mesma proposta (categoria, ficha, catalogos) e o preco dele. Ja publicado
 * na variante: so o aviso. Sem preco calculavel: aviso e nada gravado.
 */
async function propostaDoPremium(cliente, { produto, kit, rascunhoDoClassico, custo, precoNaLoja, precos, campos, sugestoes, valores, relatorio, aceitos, links, avisos, doPreco }) {
  const variante = "premium_frete_gratis";
  const jaPublicado = await publicadoDaVariante(produto.id, kit, variante);
  if (jaPublicado) {
    avisos.push(`O Premium + frete grátis deste produto já está no Rise (${jaPublicado.idExterno ?? jaPublicado.id}): a proposta não criou outro.`);
    return null;
  }
  const base = rascunhoDaVariante(rascunhoDoClassico, variante);
  const lido = await precoDaPropostaML(cliente, base, { custo, precoNaLoja, precos });
  if (lido.valor === null) {
    avisos.push(`O preço do Premium não foi calculado: ${lido.avisos.join(" ") || "sem taxas do Mercado Livre"}`);
    return null;
  }
  const emAberto = await rascunhoEmAberto(produto.id, kit, PREMIUM);
  const aplicado = aplicarProposta(base, { preco: lido.valor }, emAberto ? {} : { vazio: () => true });
  const salvo = await salvarRascunhoML(emAberto?.id ?? null, aplicado.rascunho);
  if (!salvo.ok) throw new ErroDeFerramenta(`O rascunho Premium do Mercado Livre não foi gravado: ${salvo.erro}`);
  const proposta = montarProposta({
    versaoDoRoteiro: VERSAO_ROTEIRO_ML,
    campos: [...new Set([...campos, ...aplicado.campos])],
    sugestoes: { ...sugestoes, ...aplicado.sugestoes },
    valores: { ...valores, ...aplicado.valores },
    relatorio,
    extras: { avisos: lido.avisos, catalogosSugeridos: aceitos, links, preco: doPreco(lido) },
  });
  await gravarProposta(salvo.id, proposta);
  return { anuncioId: salvo.id, preco: proposta.preco };
}

/**
 * Os anuncios do SKU na conta do ML que nao sao do Rise, com um aviso que lista cada um (MLB, tipo, frete, preco, vendas).
 * Conta que nao responde vira aviso, nunca erro: a proposta segue.
 */
async function anunciosForaDoRise(cliente, produto, avisos) {
  const lidos = await anunciosDoSkuNaConta(cliente, produto.sku);
  if (!lidos.ok) {
    avisos.push(`Não foi possível conferir se a conta do Mercado Livre já tem anúncio deste código: ${lidos.erro}`);
    return [];
  }
  const doRise = await prisma.anuncio.findMany({ where: { canal: CANAL, produtoId: produto.id, idExterno: { not: null } }, select: { idExterno: true } });
  const candidatos = candidatosParaReaproveitar(lidos.itens, { idsDoRise: new Set(doRise.map((anuncio) => anuncio.idExterno)) });
  if (candidatos.length > 0) {
    const reais = (valor) => Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const linhas = candidatos.map((c) =>
      [c.id, ROTULO_DO_TIPO_ML[c.tipoAnuncio] ?? c.tipoAnuncio, c.freteGratis ? "frete grátis" : "sem frete", Number.isFinite(c.preco) ? reais(c.preco) : null, `${c.vendidos} venda(s)`, c.status]
        .filter(Boolean)
        .join(", "),
    );
    avisos.unshift(`A conta do Mercado Livre já tem ${candidatos.length === 1 ? "um anúncio" : `${candidatos.length} anúncios`} deste código fora do Rise: ${linhas.join("; ")}. Reaproveite (reaproveitarAnuncioML, ou no popup do produto) em vez de publicar outro igual.`);
  }
  // A variante em texto ("Clássico + frete grátis"), para a IA e o dono lerem sem decodificar tipo e frete.
  return candidatos.map((candidato) => ({ ...candidato, variante: rotuloDaVariante(candidato.tipoAnuncio, candidato.freteGratis, candidato.preco) }));
}

/**
 * Reaproveitar pela IA (MCP `reaproveitarAnuncioML`, pedido do dono em 08/11/2026): o anuncio do codigo que a conta ja tem vira
 * anuncio PUBLICADO do produto no Rise (`reaproveitarAnuncioML`: rele o item, recusa encerrado, outro SKU e MLB ja no Rise).
 * Nada e escrito no ML nem no Bling. Recusa vira `ErroDeFerramenta` com o motivo.
 */
export async function reaproveitarParaProposta(cliente, sku, itemId) {
  const produto = await produtoPeloSku(sku);
  const resultado = await reaproveitarAnuncioML(produto.id, String(itemId ?? "").trim(), { ml: cliente });
  if (!resultado.ok) throw new ErroDeFerramenta(resultado.erro ?? "O anúncio não foi reaproveitado.");
  const anuncio = await prisma.anuncio.findUnique({ where: { id: resultado.anuncioId }, select: { dados: true } });
  return {
    anuncioId: resultado.anuncioId,
    itemId,
    variante: rotuloDaVariante(anuncio?.dados?.tipoAnuncio, anuncio?.dados?.envio?.freteGratis, anuncio?.dados?.preco),
    preco: anuncio?.dados?.preco ?? null,
    proximo: "O anúncio está no Rise como publicado. O dono revisa no editor do ML, usa Enviar mudanças e decide se move o vínculo do Bling.",
  };
}

const rotuloDaVariante = (tipoAnuncio, freteGratis, preco) => {
  const variante = varianteDoRascunho({ tipoAnuncio, envio: { freteGratis }, preco });
  return ROTULO_DA_VARIANTE[variante] ?? variante;
};

/** Os anuncios do ML do produto que o Rise ja tem (rascunho ou publicado), com a variante em texto e o MLB quando ha. */
async function anunciosDoProdutoNoRise(produtoId) {
  const anuncios = await prisma.anuncio.findMany({ where: { canal: CANAL, produtoId }, orderBy: { criadoEm: "asc" }, select: { id: true, status: true, idExterno: true, situacaoCanal: true, dados: true } });
  return anuncios.map((anuncio) => ({
    id: anuncio.id,
    mlb: anuncio.idExterno ?? anuncio.dados?.publicacao?.itemId ?? null,
    status: anuncio.status,
    situacao: anuncio.situacaoCanal ?? null,
    variante: rotuloDaVariante(anuncio.dados?.tipoAnuncio, anuncio.dados?.envio?.freteGratis, anuncio.dados?.preco),
    preco: anuncio.dados?.preco ?? null,
    kit: anuncio.dados?.composicao ? (anuncio.dados.composicao.codigo ?? true) : null,
  }));
}

/** So a chave `proposta` de `dados`, com a linha travada (o Salvar do editor nao cai no meio). */
async function gravarProposta(anuncioId, proposta) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Anuncio" WHERE id = ${anuncioId} FOR UPDATE`;
    const atual = await tx.anuncio.findUnique({ where: { id: anuncioId }, select: { dados: true } });
    await tx.anuncio.update({ where: { id: anuncioId }, data: { dados: { ...(atual?.dados ?? {}), proposta } } });
  });
}
