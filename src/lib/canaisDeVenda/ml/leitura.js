/**
 * Leituras do Mercado Livre para o editor de anuncio (fase 2, so GET): categoria sugerida, a
 * categoria e os atributos dela, taxas, frete do vendedor e termos em alta.
 *
 * Toda funcao recebe o `cliente` (`clienteML()` em `./cliente.js`, ou o ML falso no teste) e
 * devolve o dado ja no formato do Rise. Resposta de erro do ML vira um `Error` com `status` e
 * `dados`, para a acao do servidor traduzir com `textoDoErroML`.
 *
 * Os formatos seguem a investigacao de 03/10/2026
 * (`docs/superpowers/investigacoes/2026-10-01-ml-bling-para-fases-2-e-3.md`, A1 a A5).
 */

import { normalizarAtributosDaCategoria } from "./atributos";
import { freteQueConta, precoPorMargem } from "./custos";
import { medidasFaltando } from "./validacao";

const dinheiro = (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100;

/** Texto do erro para a tela: resposta do ML com o motivo e o HTTP, ou a mensagem do erro. */
export function textoDoErroML(erro) {
  if (typeof erro?.status === "number") {
    return `Mercado Livre: ${erro.dados?.message ?? erro.dados?.error ?? "erro"} (HTTP ${erro.status})`;
  }
  return erro?.message ?? "Falha ao consultar o Mercado Livre.";
}

function falhou({ status, dados }) {
  return Object.assign(new Error(textoDoErroML({ status, dados })), { status, dados });
}

async function ler(cliente, caminho, params) {
  const resposta = await cliente.get(caminho, params);
  if (!resposta.ok) throw falhou(resposta);
  return resposta.dados;
}

const caminhoDaCategoria = (categoriaId) => `/categories/${encodeURIComponent(String(categoriaId ?? "").trim())}`;

/** Categorias que o ML preve para o titulo (`domain_discovery`). Lista vazia quando nao acha nada. */
export async function descobrirCategoria(cliente, titulo) {
  const dados = await ler(cliente, "/sites/MLB/domain_discovery/search", { q: String(titulo ?? "").trim() });
  return (Array.isArray(dados) ? dados : []).map((item) => ({
    categoriaId: item.category_id,
    nome: item.category_name,
    dominioId: item.domain_id,
    dominioNome: item.domain_name,
  }));
}

/**
 * A categoria pelo codigo, ou `null` se o ML nao a conhece (404). `folha` diz se e final: so
 * categoria sem filhas aceita anuncio. O limite do titulo e o maximo de fotos vem dela.
 */
export async function lerCategoria(cliente, categoriaId) {
  const resposta = await cliente.get(caminhoDaCategoria(categoriaId));
  if (resposta.status === 404) return null;
  if (!resposta.ok) throw falhou(resposta);

  const dados = resposta.dados;
  return {
    id: dados.id,
    nome: dados.name,
    caminho: (dados.path_from_root ?? []).map((parte) => parte.name),
    folha: (dados.children_categories ?? []).length === 0,
    limiteTitulo: dados.settings?.max_title_length,
    maxFotos: dados.settings?.max_pictures_per_item,
    condicoes: dados.settings?.item_conditions ?? [],
  };
}

/** Os atributos da categoria, crus, como o ML os devolve. */
export async function lerAtributosDaCategoria(cliente, categoriaId) {
  const dados = await ler(cliente, `${caminhoDaCategoria(categoriaId)}/attributes`);
  return Array.isArray(dados) ? dados : [];
}

/**
 * A categoria com os atributos ja no formato do Rise (`normalizarAtributosDaCategoria`), numa
 * leitura so para o editor; `null` se ela nao existe.
 */
export async function lerCategoriaCompleta(cliente, categoriaId) {
  const categoria = await lerCategoria(cliente, categoriaId);
  if (!categoria) return null;
  return { ...categoria, atributos: normalizarAtributosDaCategoria(await lerAtributosDaCategoria(cliente, categoriaId)) };
}

/**
 * Comissao e tarifa fixa do ML para este preco, categoria, tipo e logistica (`listing_prices`,
 * investigacao A3). Sempre com `logistic_type` e `shipping_mode=me2`: sem eles a tarifa fixa que
 * volta nao e a cobrada. `comissao` e o total que o ML cobra (percentual + tarifa fixa).
 */
export async function lerTaxas(cliente, { preco, categoriaId, tipoAnuncio, logistica }) {
  const dados = await ler(cliente, "/sites/MLB/listing_prices", {
    price: preco,
    category_id: categoriaId,
    listing_type_id: tipoAnuncio,
    logistic_type: logistica,
    shipping_mode: "me2",
  });
  const taxa = Array.isArray(dados) ? dados.find((item) => item.listing_type_id === tipoAnuncio) : dados;
  if (!taxa) throw new Error("O Mercado Livre não devolveu a taxa deste tipo de anúncio.");
  return {
    percentual: Number(taxa.sale_fee_details?.percentage_fee ?? 0) / 100,
    tarifaFixa: dinheiro(taxa.sale_fee_details?.fixed_fee ?? 0),
    comissao: dinheiro(taxa.sale_fee_amount ?? 0),
  };
}

/**
 * Quanto o vendedor paga de frete quando da frete gratis (`shipping_options/free`, A4): uma
 * estimativa do ML. `null` sem as quatro medidas, sem chamar o ML. As medidas vao em inteiros
 * (cm para cima, gramas), como o pacote sera declarado na publicacao.
 */
export async function lerFreteDoVendedor(cliente, { envio, preco, tipoAnuncio, logistica }) {
  if (medidasFaltando(envio).length > 0) return null;
  const cm = (valor) => Math.ceil(Number(valor));
  const dimensions = `${cm(envio.alturaCm)}x${cm(envio.larguraCm)}x${cm(envio.comprimentoCm)},${Math.round(Number(envio.pesoKg) * 1000)}`;

  const usuario = await cliente.usuarioId();
  const dados = await ler(cliente, `/users/${encodeURIComponent(usuario)}/shipping_options/free`, {
    dimensions,
    item_price: preco,
    listing_type_id: tipoAnuncio,
    mode: "me2",
    logistic_type: logistica,
    free_shipping: true,
  });
  const cobertura = dados?.coverage?.all_country;
  if (!cobertura) throw new Error("O Mercado Livre não devolveu o custo do frete.");
  return { custo: dinheiro(cobertura.list_cost), pesoCobrado: cobertura.billable_weight ?? null };
}

// Termos em alta por categoria. Mudam devagar e a IA do titulo os pede a cada clique: 6 h em
// memoria poupam a mesma leitura repetida.
const VALIDADE_DAS_TENDENCIAS_MS = 6 * 60 * 60 * 1000;
const tendenciasGuardadas = new Map();

export function limparCacheDeTendencias() {
  tendenciasGuardadas.clear();
}

/** Os termos em alta da categoria (`/trends`, A5), so as palavras. Categoria sem tendencias: lista vazia. */
export async function lerTendencias(cliente, categoriaId) {
  const chave = String(categoriaId ?? "").trim();
  const guardada = tendenciasGuardadas.get(chave);
  if (guardada && guardada.expiraEm > Date.now()) return guardada.termos;

  const resposta = await cliente.get(`/trends/MLB/${encodeURIComponent(chave)}`);
  if (!resposta.ok && resposta.status !== 404) throw falhou(resposta);
  const termos = resposta.ok && Array.isArray(resposta.dados) ? resposta.dados.map((item) => item.keyword).filter(Boolean) : [];
  tendenciasGuardadas.set(chave, { termos, expiraEm: Date.now() + VALIDADE_DAS_TENDENCIAS_MS });
  return termos;
}

/**
 * Taxas e frete do rascunho numa leitura so, no formato que o editor guarda (`contexto.custosML`)
 * e que `custosValem` confere: o que foi lido e para qual preco, categoria, tipo e logistica.
 */
export async function lerCustosDoAnuncio(cliente, rascunho) {
  const envio = rascunho.envio ?? {};
  const pedido = {
    preco: dinheiro(rascunho.preco),
    categoriaId: String(rascunho.categoriaId ?? "").trim(),
    tipoAnuncio: rascunho.tipoAnuncio,
    logistica: envio.logistica ?? "xd_drop_off",
  };
  const [taxas, frete] = await Promise.all([lerTaxas(cliente, pedido), lerFreteDoVendedor(cliente, { envio, ...pedido })]);
  return {
    ...pedido,
    freteGratis: Boolean(envio.freteGratis),
    percentual: taxas.percentual,
    tarifaFixa: taxas.tarifaFixa,
    frete: frete?.custo ?? null,
    pesoCobrado: frete?.pesoCobrado ?? null,
    lidoEm: Date.now(),
  };
}

/**
 * O preco que da a margem pedida com as taxas REAIS do ML. Comissao e tarifa fixa dependem do
 * preco (a tarifa some acima do limite de frete gratis), entao calcula, rele as taxas no preco
 * novo e repete ate o preco parar de mudar (no maximo 4 voltas). Devolve tambem os custos lidos
 * no preco final, para a tela mostrar. `null` quando nenhum preco chega a margem.
 */
export async function precoPorMargemNoML(cliente, rascunho, { custo, margem }) {
  let preco = Number(rascunho.preco) > 0 ? dinheiro(rascunho.preco) : 1;
  let custosML = await lerCustosDoAnuncio(cliente, { ...rascunho, preco });
  for (let volta = 0; volta < 4; volta++) {
    const novo = precoPorMargem({
      custo,
      percentual: custosML.percentual,
      tarifaFixa: custosML.tarifaFixa,
      frete: freteQueConta(custosML, rascunho),
      margem,
    });
    if (novo === null) return null;
    if (novo === preco) break;
    preco = novo;
    custosML = await lerCustosDoAnuncio(cliente, { ...rascunho, preco });
  }
  return { preco, custosML };
}
