"use server";

import { negarSemAcessos, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { acessosDoEditorML, projetarContextoML } from "@/lib/acessos/projecoes";

import { revalidatePath } from "next/cache";

import { LIMITE_TITULO } from "@/lib/anuncios/canais/mercadolivre";
import { clienteBling } from "@/lib/blingSync/cliente";
import { prepararPublicacaoML, publicarAnuncioML, validarNoML } from "@/lib/canaisDeVenda/ml/publicar";
import { gravarFrases } from "@/lib/canaisDeVenda/configuracao";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";
import {
  buscarCatalogos,
  catalogosDosMeusAnuncios,
  comResumo,
  contarVendedores,
  lerConcorrentesDoCatalogo,
  lerVendedores,
  topDoCatalogo,
} from "@/lib/canaisDeVenda/ml/catalogo";
import {
  acompanharCatalogoML,
  lerConcorrentesML,
  marcarConcorrentesMLVistos,
  pararDeAcompanharML,
  relerCatalogoDoProduto,
} from "@/lib/canaisDeVenda/ml/concorrentes";
import { LIMITES_ML, RascunhoMLSchema } from "@/lib/canaisDeVenda/ml/esquema";
import { preencherFicha, sugerirCategoria, sugerirTitulos } from "@/lib/canaisDeVenda/ml/inteligencia";
import { lerCategoria, lerCategoriaCompleta, lerCustosDoAnuncio, precoPorMargemNoML, textoDoErroML } from "@/lib/canaisDeVenda/ml/leitura";
import {
  anunciosMLDoProduto,
  buscarProdutoParaAnuncio,
  carregarAnuncioML,
  codigoEmUso,
  contextoDosProdutos,
  novoRascunhoML,
  salvarRascunhoML,
  sugerirCodigoDeKit,
} from "@/lib/canaisDeVenda/ml/banco";

/**
 * Acoes do servidor do canal Mercado Livre (Canais de Venda). Finas, no molde de
 * `produtos/acoes-edicao-rapida.js`: a regra e a gravacao moram em `lib/canaisDeVenda`, onde o
 * teste (scripts/teste-anuncios-ml.js) as alcanca sem o Next, e aqui ficam so o que depende
 * do servidor do Next: conferir o que vem do navegador, revalidar a tela e nao deixar
 * excecao nenhuma chegar ao cliente.
 *
 * Toda acao devolve `{ ok, ... }`. Acao que so le nao revalida. So o Publicar e o "Validar no ML"
 * (fase 3) escrevem fora do banco local, e sempre sob as travas ML_PUBLICACAO e BLING_ESCRITA (e as
 * listas de codigos liberados), conferidas antes da primeira escrita.
 */

const PEDIDO_INVALIDO = { ok: false, erro: "Pedido inválido." };

// Um id e texto que o navegador manda: tipo errado ou vazio nao pode chegar a consulta.
// O Prisma le `where: { id: undefined }` como "sem filtro", entao um id ausente nao e so um
// "nao achou": poderia devolver o registro de qualquer um.
const ehId = (valor) => typeof valor === "string" && valor !== "";

// O anuncio novo ainda nao tem id: a tela manda `null` (nunca `undefined`).
const ehIdOuNulo = (valor) => valor === null || ehId(valor);

/**
 * Cobre a chamada inteira: o que a lib deixa subir (falha de banco ao ler, bug) vira recado
 * generico, com o erro no log do servidor. Excecao solta chegaria ao navegador como uma tela
 * de erro do Next, e o que o operador digitou no editor se perderia.
 */
async function protegendo(trabalho) {
  try {
    return await trabalho();
  } catch (erro) {
    console.error("[canais de venda]", erro);
    return { ok: false, erro: "Não foi possível concluir. Tente de novo." };
  }
}

/**
 * Acao que grava. A lista do canal e a de Produtos (o icone do canal na linha do produto
 * sai dos anuncios) mostram o que acabou de mudar.
 */
function revalidando(resultado) {
  if (resultado.ok) {
    revalidatePath("/canais-de-venda/mercado-livre");
    revalidatePath("/produtos");
  }
  return resultado;
}

/**
 * O que o editor recebe ao abrir (pop-up e pagina): os acessos dele (somente leitura, publicar, custos, concorrentes) e o
 * contexto sem o custo dos produtos quando a pessoa nao ve o custo (Acessos: o dado nao sai do servidor).
 */
async function comAcessosDoEditor(resultado) {
  if (!resultado?.ok) return resultado;
  const { pode } = await sessaoDeAcessos();
  return { ...resultado, contexto: projetarContextoML(resultado.contexto, pode), acessos: acessosDoEditorML(pode) };
}

/** Rascunho novo de anuncio simples para o produto. Nao grava: so o Salvar cria o anuncio. */
export async function abrirNovoAnuncioML(produtoId) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "ver"]);
  if (negado) return negado;
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(async () => comAcessosDoEditor(await novoRascunhoML(produtoId)));
}

export async function abrirAnuncioML(id) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "ver"]);
  if (negado) return negado;
  if (!ehId(id)) return PEDIDO_INVALIDO;
  return protegendo(async () => comAcessosDoEditor(await carregarAnuncioML(id)));
}

/**
 * Os anuncios ML do produto, com o que a janela da lista precisa saber dele: se ainda e
 * Conferido (so Conferido vira anuncio) e o nome para o titulo da janela.
 */
export async function listarAnunciosDoProdutoML(produtoId) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "ver"]);
  if (negado) return negado;
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(async () => {
    const [produtos, anuncios] = await Promise.all([contextoDosProdutos([produtoId]), anunciosMLDoProduto(produtoId)]);
    // Excluido depois de a lista de Produtos ter carregado: a janela diz isso em vez de abrir vazia.
    // `hasOwn` porque o id vem do navegador: "constructor" acharia a funcao do objeto, nao um produto.
    if (!Object.hasOwn(produtos, produtoId)) return { ok: false, erro: "Produto não encontrado. Ele pode ter sido excluído." };

    const { id, sku, tituloBase, conferido } = produtos[produtoId];
    // Os avisos de concorrencia so com o dado Concorrentes; sem editar, a janela nao oferece anuncio novo.
    const { pode } = await sessaoDeAcessos();
    const acessos = acessosDoEditorML(pode);
    const linhas = acessos.concorrentes ? anuncios : anuncios.map((anuncio) => ({ ...anuncio, avisosML: [] }));
    return { ok: true, produto: { id, sku, tituloBase, conferido }, anuncios: linhas, acessos };
  });
}

/** `id` e o anuncio que ja existe, ou `null` para criar um novo. */
export async function salvarAnuncioML(id, rascunho) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "editar"]);
  if (negado) return negado;
  if (!ehIdOuNulo(id)) return PEDIDO_INVALIDO;
  return protegendo(async () => revalidando(await salvarRascunhoML(id, rascunho)));
}

/** Acha o produto pelo codigo para entrar na composicao do kit. Devolve o resultado da lib como esta. */
export async function buscarItemDeComposicao(codigo) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "ver"]);
  if (negado) return negado;
  return protegendo(() => buscarProdutoParaAnuncio(codigo));
}

/** Quem ja usa o codigo do kit, ou `null` se esta livre. `anuncioId` e o anuncio aberto (ou `null`). */
export async function conferirCodigoDeKit(codigo, anuncioId, itens) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "ver"]);
  if (negado) return negado;
  if (!ehIdOuNulo(anuncioId)) return PEDIDO_INVALIDO;
  return protegendo(async () => ({ ok: true, codigoEmUso: await codigoEmUso(codigo, { anuncioId, itens }) }));
}

export async function sugerirCodigoKit() {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "ver"]);
  if (negado) return negado;
  return protegendo(async () => {
    const codigo = await sugerirCodigoDeKit();
    if (codigo === null) return { ok: false, erro: "A faixa 25xxxx acabou." };
    return { ok: true, codigo };
  });
}

export async function salvarFrasesFixas(texto) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre.frases", "editar"]);
  if (negado) return negado;
  // Vem do navegador: `gravarFrases` converte qualquer coisa em texto (um objeto viraria "[object Object]") e gravaria lixo.
  if (typeof texto !== "string") return PEDIDO_INVALIDO;
  return protegendo(async () => revalidando(await gravarFrases(texto)));
}

// ---------------------------------------------------------------------------
// Fase 2: inteligencia do ML (so leitura). Nada daqui escreve no ML nem no Bling: as leituras sao
// GET (o conector bloqueia o resto) e a IA so devolve sugestoes, que o dono aplica na tela.
// Acao que so le nao revalida. Toda acao com produto confere no servidor que ele e Conferido.
// ---------------------------------------------------------------------------

const CATEGORIA_ML = /^MLB\d+$/;
const ehCategoria = (valor) => typeof valor === "string" && CATEGORIA_ML.test(valor);

/** Erro do ML (com HTTP) ou da IA, no texto que a tela mostra. Nunca sobe ao navegador. */
function falhaDeLeitura(erro, onde) {
  console.error(`[canais de venda] ${onde}`, erro);
  return { ok: false, erro: textoDoErroML(erro) || "Não foi possível consultar o Mercado Livre." };
}

/** O produto do anuncio, so se existir e for Conferido; senao `{ erro }` com o motivo. */
async function produtoConferido(produtoId) {
  const produtos = await contextoDosProdutos([produtoId]);
  if (!Object.hasOwn(produtos, produtoId)) return { erro: "Produto não encontrado. Ele pode ter sido excluído." };
  const produto = produtos[produtoId];
  if (produto.conferido !== true) return { erro: `O produto ${produto.sku} ainda não foi Conferido. Só produto Conferido vira anúncio.` };
  return { produto };
}

/** O rascunho inteiro vem do navegador: passa pelo mesmo esquema do Salvar e pelo produto Conferido. */
async function rascunhoConferido(rascunho) {
  const lido = RascunhoMLSchema.safeParse(rascunho);
  if (!lido.success) return { erro: PEDIDO_INVALIDO.erro };
  const { erro } = await produtoConferido(lido.data.produtoId);
  if (erro) return { erro };
  if (!ehCategoria(lido.data.categoriaId)) return { erro: "Escolha a categoria do Mercado Livre antes de ler os custos." };
  if (!(Number(lido.data.preco) > 0)) return { erro: "Informe o preço de venda antes de ler os custos." };
  return { rascunho: lido.data };
}

/** A categoria com os atributos, para o editor validar e montar a ficha. */
export async function lerCategoriaML(categoriaId) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "ver"]);
  if (negado) return negado;
  if (!ehCategoria(categoriaId)) return PEDIDO_INVALIDO;
  try {
    const categoria = await lerCategoriaCompleta(clienteML(), categoriaId);
    return categoria ? { ok: true, categoria } : { ok: false, erro: "Categoria não encontrada no Mercado Livre." };
  } catch (erro) {
    return falhaDeLeitura(erro, "ler categoria");
  }
}

/** Categorias candidatas pelo titulo (ML), com a recomendacao da IA ou a pesquisa na internet. */
export async function sugerirCategoriaML(produtoId, titulo) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "editar"], ["acao.produtos.gerarTextoComIA", "executar"]);
  if (negado) return negado;
  if (!ehId(produtoId) || typeof titulo !== "string" || titulo.length > LIMITES_ML.titulo) return PEDIDO_INVALIDO;
  try {
    const { produto, erro } = await produtoConferido(produtoId);
    if (erro) return { ok: false, erro };
    return { ok: true, ...(await sugerirCategoria(clienteML(), { titulo: titulo.trim() || produto.tituloBase, produto })) };
  } catch (erro) {
    return falhaDeLeitura(erro, "sugerir categoria");
  }
}

// O kit chega da tela so para o pedido a IA: `{ unidades, itens: [nome] }` ou `null`.
function kitValido(kit) {
  if (kit === null || kit === undefined) return true;
  return (
    Number.isInteger(kit?.unidades) &&
    kit.unidades > 0 &&
    Array.isArray(kit.itens) &&
    kit.itens.length <= LIMITES_ML.itensDaComposicao &&
    kit.itens.every((item) => typeof item === "string" && item.length <= LIMITES_ML.titulo)
  );
}

/** Titulos pela IA, no limite da categoria (ou 60 sem ela) e com as palavras em alta dela. */
export async function sugerirTitulosML(produtoId, { categoriaId = null, kit = null } = {}) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "editar"], ["acao.produtos.gerarTextoComIA", "executar"]);
  if (negado) return negado;
  if (!ehId(produtoId) || (categoriaId !== null && !ehCategoria(categoriaId)) || !kitValido(kit)) return PEDIDO_INVALIDO;
  try {
    const { produto, erro } = await produtoConferido(produtoId);
    if (erro) return { ok: false, erro };
    const cliente = clienteML();
    const categoria = categoriaId ? await lerCategoria(cliente, categoriaId) : null;
    const limite = Number(categoria?.limiteTitulo) > 0 ? categoria.limiteTitulo : LIMITE_TITULO;
    return { ok: true, titulos: await sugerirTitulos(cliente, { produto, kit: kit ?? null, categoriaId, limite }) };
  } catch (erro) {
    return falhaDeLeitura(erro, "sugerir titulo");
  }
}

/** Sugestoes da IA para os atributos em branco da categoria. Nao grava: o dono escolhe na tela. */
export async function preencherFichaML(produtoId, { categoriaId, atributos, internet } = {}) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "editar"], ["acao.produtos.gerarTextoComIA", "executar"]);
  if (negado) return negado;
  const valores = RascunhoMLSchema.shape.atributos.safeParse(atributos ?? {});
  if (!ehId(produtoId) || !ehCategoria(categoriaId) || !valores.success || typeof internet !== "boolean") return PEDIDO_INVALIDO;
  try {
    const { produto, erro } = await produtoConferido(produtoId);
    if (erro) return { ok: false, erro };
    return { ok: true, sugestoes: await preencherFicha(clienteML(), { produto, categoriaId, valoresAtuais: valores.data, internet }) };
  } catch (erro) {
    return falhaDeLeitura(erro, "preencher ficha");
  }
}

/** Comissao, tarifa fixa e frete do vendedor para o rascunho como esta na tela. */
export async function lerCustosML(rascunho) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "ver"], ["dado.custo", "ver"], ["dado.margem", "ver"]);
  if (negado) return negado;
  try {
    const conferido = await rascunhoConferido(rascunho);
    if (conferido.erro) return { ok: false, erro: conferido.erro };
    return { ok: true, custosML: await lerCustosDoAnuncio(clienteML(), conferido.rascunho) };
  } catch (erro) {
    return falhaDeLeitura(erro, "ler custos");
  }
}

/**
 * O preco que da a margem pedida com as taxas reais do ML. O custo vem da tela (e o mesmo que ela
 * mostra, do fornecedor padrao ou a soma do kit): serve so a uma sugestao, que o dono confere.
 */
export async function precoPorMargemML(rascunho, { custo, margem } = {}) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "ver"], ["dado.custo", "ver"], ["dado.margem", "ver"]);
  if (negado) return negado;
  const valor = Number(margem?.valor);
  if (
    !(Number(custo) > 0) ||
    !["percentual", "reais"].includes(margem?.tipo) ||
    !Number.isFinite(valor) ||
    valor < 0 ||
    valor > 1_000_000
  ) {
    return PEDIDO_INVALIDO;
  }
  try {
    const conferido = await rascunhoConferido({ ...rascunho, preco: Number(rascunho?.preco) > 0 ? rascunho.preco : 1 });
    if (conferido.erro) return { ok: false, erro: conferido.erro };
    const resultado = await precoPorMargemNoML(clienteML(), conferido.rascunho, { custo: Number(custo), margem: { tipo: margem.tipo, valor } });
    return resultado ? { ok: true, ...resultado } : { ok: false, erro: "Margem inatingível com estas taxas." };
  } catch (erro) {
    return falhaDeLeitura(erro, "preco por margem");
  }
}

// ---------------------------------------------------------------------------
// Publicar (fase 3)
// ---------------------------------------------------------------------------

const clientes = () => ({ ml: clienteML(), bling: clienteBling() });

/** A pre-checagem e o resumo da janela de confirmacao. So le o ML, o Bling e o banco. */
export async function prepararPublicacaoMLAcao(anuncioId) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "editar"]);
  if (negado) return negado;
  if (!ehId(anuncioId)) return { ...PEDIDO_INVALIDO, motivos: [PEDIDO_INVALIDO.erro] };
  return protegendo(() => prepararPublicacaoML(anuncioId, clientes()));
}

/**
 * Publica, ou retoma da etapa que falhou. `recriar` so com o dono tendo conferido no ML que a criacao
 * incerta nao chegou la. Revalida sempre: mesmo a publicacao que falhou mudou o status do anuncio.
 */
export async function publicarAnuncioMLAcao(anuncioId, { recriar = false } = {}) {
  const negado = await negarSemAcessos(["acao.mercadoLivre.publicar", "executar"]);
  if (negado) return negado;
  if (!ehId(anuncioId)) return PEDIDO_INVALIDO;
  return protegendo(async () => {
    const resultado = await publicarAnuncioML(anuncioId, { ...clientes(), recriar: recriar === true });
    revalidatePath("/canais-de-venda/mercado-livre");
    revalidatePath("/produtos");
    return resultado;
  });
}

/** "Validar no ML": sobe as fotos que faltam e roda o validador do ML, sem criar o anuncio. */
export async function validarNoMLAcao(anuncioId) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "editar"]);
  if (negado) return negado;
  if (!ehId(anuncioId)) return PEDIDO_INVALIDO;
  return protegendo(() => validarNoML(anuncioId, clientes()));
}

// ---------------------------------------------------------------------------
// Concorrentes do ML pelo catalogo (spec 2026-10-21-concorrentes-ml-catalogo-design.md). So GET no ML; gravam so as
// tabelas de concorrentes do banco local. Nao revalidam: o bloco do editor recebe a tela pronta na resposta.
// ---------------------------------------------------------------------------

const LIMITE_DO_TERMO = 120;
const ehCatalogo = (valor) => typeof valor === "string" && /^MLB\d{1,15}$/.test(valor.trim());

/** Produtos de catalogo parecidos com o termo (o titulo do anuncio, editavel). */
export async function buscarCatalogosMLAcao(termo) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "ver"], ["dado.concorrentes", "ver"]);
  if (negado) return negado;
  if (typeof termo !== "string" || termo.length > LIMITE_DO_TERMO) return PEDIDO_INVALIDO;
  try {
    // Cada catalogo com "N anuncios · M vendedores": uma leitura a mais por catalogo, so GET.
    const ml = clienteML();
    return { ok: true, catalogos: await comResumo(ml, await buscarCatalogos(ml, termo)) };
  } catch (erro) {
    return falhaDeLeitura(erro, "buscar catalogo");
  }
}

/** Os catalogos dos anuncios do dono para o SKU do produto: sugeridos no topo da busca. So leitura. */
export async function catalogosDosMeusAnunciosMLAcao(produtoId) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "ver"], ["dado.concorrentes", "ver"]);
  if (negado) return negado;
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  try {
    const produtos = await contextoDosProdutos([produtoId]);
    const sku = produtos[produtoId]?.sku;
    if (!sku) return { ok: true, catalogos: [] };
    const ml = clienteML();
    return { ok: true, catalogos: await comResumo(ml, await catalogosDosMeusAnuncios(ml, sku)) };
  } catch (erro) {
    return falhaDeLeitura(erro, "catalogos dos meus anuncios");
  }
}

/** A previa do catalogo: os anuncios na ordem do ML, com o vendedor, e quais seriam acompanhados (o top). Nao grava. */
export async function preverCatalogoMLAcao(catalogoId) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "ver"], ["dado.concorrentes", "ver"]);
  if (negado) return negado;
  if (!ehCatalogo(catalogoId)) return PEDIDO_INVALIDO;
  try {
    const ml = clienteML();
    const lido = await lerConcorrentesDoCatalogo(ml, catalogoId.trim(), { meuSellerId: await ml.usuarioId() });
    const top = topDoCatalogo(lido.itens);
    const vendedores = await lerVendedores(ml, lido.itens.filter((item) => !item.meu).map((item) => item.vendedorId));
    return {
      ok: true,
      total: lido.total,
      resumo: { anuncios: lido.total, vendedores: contarVendedores(lido.itens), completo: lido.itens.length >= lido.total },
      topIds: top.map((item) => item.itemId),
      itens: lido.itens.map((item) => ({ ...item, vendedor: vendedores.get(item.vendedorId) ?? null })),
    };
  } catch (erro) {
    return falhaDeLeitura(erro, "prever catalogo");
  }
}

/** Le a tela dos concorrentes e marca como visto (os avisos passam a contar daqui). */
export async function lerConcorrentesMLAcao(produtoId) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "ver"], ["dado.concorrentes", "ver"]);
  if (negado) return negado;
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(async () => {
    const tela = await lerConcorrentesML(produtoId);
    if (!tela) return { ok: false, erro: "Produto não encontrado. Ele pode ter sido excluído." };
    await marcarConcorrentesMLVistos(produtoId);
    return { ok: true, tela };
  });
}

/** Passa a acompanhar o catalogo (ou troca de catalogo) e faz a primeira leitura. So Produto Conferido. */
export async function acompanharCatalogoMLAcao(produtoId, { catalogoId, catalogoNome } = {}) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "editar"], ["dado.concorrentes", "ver"]);
  if (negado) return negado;
  if (!ehId(produtoId) || !ehCatalogo(catalogoId) || (catalogoNome !== undefined && typeof catalogoNome !== "string")) return PEDIDO_INVALIDO;
  return protegendo(async () => {
    const { erro } = await produtoConferido(produtoId);
    if (erro) return { ok: false, erro };
    const feito = await acompanharCatalogoML(clienteML(), produtoId, { catalogoId: catalogoId.trim(), catalogoNome: String(catalogoNome ?? "").slice(0, 200) });
    await marcarConcorrentesMLVistos(produtoId);
    return { ok: feito.ok, erro: feito.erro, tela: await lerConcorrentesML(produtoId) };
  });
}

/** "Reler agora": a mesma rotina da rodada diaria, so para este produto. */
export async function relerConcorrentesMLAcao(produtoId) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "editar"], ["dado.concorrentes", "ver"]);
  if (negado) return negado;
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(async () => {
    const feito = await relerCatalogoDoProduto(clienteML(), produtoId);
    await marcarConcorrentesMLVistos(produtoId);
    return { ok: feito.ok, erro: feito.erro, tela: await lerConcorrentesML(produtoId) };
  });
}

/** Para de acompanhar: zera o catalogo; os concorrentes ficam como ausentes (nada e apagado). */
export async function pararDeAcompanharMLAcao(produtoId) {
  const negado = await negarSemAcessos(["tela.canaisDeVenda.mercadoLivre", "editar"], ["dado.concorrentes", "ver"]);
  if (negado) return negado;
  if (!ehId(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(async () => {
    await pararDeAcompanharML(produtoId);
    return { ok: true, tela: await lerConcorrentesML(produtoId) };
  });
}
