/**
 * As contas do estudo de viabilidade (spec 2026-11-12-estudo-de-viabilidade-design.md). Regras PURAS, sem banco nem
 * rede: o MCP, a tela e o teste leem daqui. Ficam no codigo, e nao com o Claude, para dois estudos usarem sempre a mesma
 * regra (decisao da spec): o Claude so traz o que leu no Mercado Livre e o que apontou como o mesmo produto.
 */

export const VEREDITOS = ["VALE", "VALE_COM_RESSALVA", "NAO_VALE"];
export const CONFIANCAS = ["ALTA", "MEDIA", "BAIXA"];

export const ROTULO_DO_VEREDITO = { VALE: "Vale", VALE_COM_RESSALVA: "Vale com ressalva", NAO_VALE: "Não vale" };
export const ROTULO_DA_CONFIANCA = { ALTA: "Alta", MEDIA: "Média", BAIXA: "Baixa" };
export const ROTULO_DA_SITUACAO = { NA_FILA: "Na fila", CONCLUIDO: "Concluído" };

/** Os limites da spec (aprovada pelo dono em 12/11/2026), num lugar so para a tela e o roteiro citarem os mesmos. */
export const LIMITES = {
  markupBom: 30,
  markupMinimo: 15,
  lucroMinimo: 5,
  demandaForte: 1000,
  demandaMedia: 200,
  mesesDeEstoque: 2,
  diasParaMedirVendas: 7,
  diasDasVendasDaLoja: 90,
  quantidadeSemParecidos: { FORTE: 20, MEDIA: 10, FRACA: 5 },
};

const dinheiro = (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
const numero = (valor) => (valor === null || valor === undefined || valor === "" ? null : Number.isFinite(Number(valor)) ? Number(valor) : null);

/** A mediana (a do meio; com quantidade par, a media das duas do meio). `null` na lista vazia. */
export function mediana(valores) {
  const lista = (valores ?? []).map(numero).filter((valor) => valor !== null).sort((a, b) => a - b);
  if (lista.length === 0) return null;
  const meio = Math.floor(lista.length / 2);
  return lista.length % 2 ? lista[meio] : (lista[meio - 1] + lista[meio]) / 2;
}

/**
 * O PISO da faixa de vendidos que o ML escreve: "+500 vendidos" = 500, "+1mil vendidos" = 1000, "+10 mil" = 10000,
 * "5 vendidos" = 5. Numero ja vem como numero. Sem nada legivel, `null` (nao zero: "nao lido" nao e "nao vendeu").
 */
export function pisoDosVendidos(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) && valor >= 0 ? Math.floor(valor) : null;
  const texto = String(valor ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  const achado = texto.match(/(\d+(?:[.,]\d+)?)\s*(mil|k)?/);
  if (!achado) return null;
  const base = Number(achado[1].replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  if (!Number.isFinite(base)) return null;
  return Math.floor(achado[2] ? base * 1000 : base);
}

/** Forte, Media ou Fraca pela soma dos vendidos (piso). Sem nenhum vendido lido: `null`. */
export function nivelDaDemanda(somaDosVendidos) {
  if (somaDosVendidos === null || somaDosVendidos === undefined) return null;
  if (somaDosVendidos >= LIMITES.demandaForte) return "FORTE";
  if (somaDosVendidos >= LIMITES.demandaMedia) return "MEDIA";
  return "FRACA";
}

/** O preco POR UNIDADE do anuncio (o "kit com 10" divide por 10). */
export function precoPorUnidade(anuncio) {
  const preco = numero(anuncio?.preco);
  const unidades = Math.max(1, Math.floor(numero(anuncio?.unidades) ?? 1));
  return preco === null || !(preco > 0) ? null : dinheiro(preco / unidades);
}

/** O id MLB do link do anuncio (MLB-123..., MLB123..., /p/MLB...), para casar o mesmo anuncio entre dois estudos. */
export function idDoAnuncio(anuncio) {
  const achado = String(anuncio?.url ?? anuncio?.id ?? "").toUpperCase().match(/MLBU?-?(\d{6,})/);
  return achado ? `MLB${achado[1]}` : null;
}

/** O mercado no Mercado Livre: so os anuncios do MESMO produto contam. */
export function resumoDoMercado(anuncios) {
  const iguais = (anuncios ?? []).filter((anuncio) => anuncio?.mesmoProduto === true);
  const precos = iguais.map(precoPorUnidade).filter((preco) => preco !== null);
  const vendidos = iguais.map((anuncio) => pisoDosVendidos(anuncio.vendidos)).filter((valor) => valor !== null);
  const vendedores = new Set(iguais.map((anuncio) => String(anuncio.vendedor ?? "").trim().toLowerCase()).filter(Boolean));
  const soma = vendidos.length ? vendidos.reduce((total, valor) => total + valor, 0) : null;
  const referencia = mediana(precos);
  return {
    lidos: (anuncios ?? []).length,
    iguais: iguais.length,
    comVendidos: vendidos.length,
    precoReferencia: referencia === null ? null : dinheiro(referencia),
    precoMenor: precos.length ? Math.min(...precos) : null,
    precoMaior: precos.length ? Math.max(...precos) : null,
    vendidosSomados: soma,
    demanda: nivelDaDemanda(soma),
    vendedores: vendedores.size,
    comFull: iguais.filter((anuncio) => anuncio.full === true).length,
  };
}

/** Alta com 5 ou mais anuncios do mesmo produto COM vendidos lidos; Media com 2 a 4; Baixa com 1 ou nenhum. */
export function confiancaDoEstudo(mercado) {
  const base = Math.min(mercado?.iguais ?? 0, mercado?.comVendidos ?? 0);
  if (base >= 5) return "ALTA";
  if (base >= 2) return "MEDIA";
  return "BAIXA";
}

/**
 * Vendas por MES do mercado, comparando os mesmos anuncios (pelo MLB) com um estudo anterior de pelo menos 7 dias. O ML
 * so mostra o acumulado, e em faixas ("+500"): a conta usa o piso, entao so ve o salto de faixa. `null` quando nao da
 * para medir (sem estudo anterior, intervalo curto ou nenhum anuncio em comum).
 */
export function vendasPorMesEntre(anterior, atual) {
  if (!anterior?.anuncios || !anterior?.em || !atual?.anuncios || !atual?.em) return null;
  const dias = (new Date(atual.em) - new Date(anterior.em)) / 86_400_000;
  if (!(dias >= LIMITES.diasParaMedirVendas)) return null;
  const antes = new Map(
    anterior.anuncios.filter((anuncio) => anuncio?.mesmoProduto).map((anuncio) => [idDoAnuncio(anuncio), pisoDosVendidos(anuncio.vendidos)]),
  );
  let diferenca = 0;
  let emComum = 0;
  for (const anuncio of atual.anuncios.filter((item) => item?.mesmoProduto)) {
    const id = idDoAnuncio(anuncio);
    const agora = pisoDosVendidos(anuncio.vendidos);
    if (!id || agora === null || !antes.has(id) || antes.get(id) === null) continue;
    emComum++;
    diferenca += Math.max(0, agora - antes.get(id));
  }
  if (emComum === 0) return null;
  return { porMes: Math.round((diferenca / dias) * 30), dias: Math.round(dias), anunciosEmComum: emComum };
}

/** O custo do fornecedor apontado: o menor; com estoque de pronta entrega vence quem tem estoque no mesmo preco. */
export function melhorFornecedor(fornecedores) {
  const comCusto = (fornecedores ?? []).filter((fornecedor) => numero(fornecedor?.custo) > 0);
  if (comCusto.length === 0) return null;
  return [...comCusto].sort((a, b) => a.custo - b.custo || Number(Boolean(b.temEstoque)) - Number(Boolean(a.temEstoque)))[0];
}

/** Arredonda PARA CIMA no multiplo de venda do fornecedor (a Santana vende de 5 em 5). */
export function arredondarNoMultiplo(quantidade, multiplo) {
  const passo = Math.max(1, Math.floor(numero(multiplo) ?? 1));
  return Math.ceil(Math.max(0, quantidade) / passo) * passo;
}

/**
 * A quantidade inicial: a mediana das vendas mensais dos parecidos da 4hobby no ML x 2 meses; sem parecidos com venda,
 * 20, 10 ou 5 pela demanda (Fraca quando nao lida). Arredonda no multiplo do fornecedor escolhido.
 */
export function quantidadeInicial({ parecidos, demanda, multiplo }) {
  const mensais = (parecidos ?? []).map((parecido) => numero(parecido?.vendasPorMes)).filter((valor) => valor !== null && valor > 0);
  const base = mensais.length
    ? Math.ceil(mediana(mensais) * LIMITES.mesesDeEstoque)
    : LIMITES.quantidadeSemParecidos[demanda ?? "FRACA"] ?? LIMITES.quantidadeSemParecidos.FRACA;
  return { quantidade: arredondarNoMultiplo(base, multiplo), origem: mensais.length ? "parecidos" : "demanda", base };
}

/**
 * O veredito pelos criterios da spec, com os motivos (a tela e o Claude mostram o porque). O Claude pode gravar outro,
 * mas so dizendo o motivo da diferenca.
 */
export function vereditoPelasRegras(contas) {
  const motivos = [];
  const markup = contas?.lucro?.markup ?? null;
  const lucro = contas?.lucro?.lucro ?? null;
  const demanda = contas?.mercado?.demanda ?? null;
  const fornecedores = contas?.custo?.fornecedores ?? [];

  if (fornecedores.length === 0 || contas?.custo?.custo === null || contas?.custo?.custo === undefined) motivos.push("Nenhum fornecedor com custo.");
  if (markup === null || lucro === null) motivos.push("Sem preço do mercado para calcular o lucro.");
  if (motivos.length) return { veredito: "NAO_VALE", motivos };

  if (markup < LIMITES.markupMinimo) motivos.push(`Markup de ${markup}% (abaixo de ${LIMITES.markupMinimo}%).`);
  if (lucro < LIMITES.lucroMinimo) motivos.push(`Lucro de R$ ${lucro.toFixed(2).replace(".", ",")} por unidade (abaixo de R$ ${LIMITES.lucroMinimo}).`);
  if (motivos.length) return { veredito: "NAO_VALE", motivos };

  if (markup < LIMITES.markupBom) motivos.push(`Markup de ${markup}% (abaixo de ${LIMITES.markupBom}%).`);
  if (demanda === "FRACA" || demanda === null) motivos.push(demanda === null ? "Vendidos não lidos." : "Demanda fraca.");
  if (fornecedores.length === 1) motivos.push("Um fornecedor só.");
  if (!fornecedores.some((fornecedor) => fornecedor.temEstoque)) motivos.push("Nenhum fornecedor com estoque de pronta entrega.");
  if (contas?.lucro?.freteEstimado) motivos.push("Frete estimado (sem as medidas do pacote).");
  const minimo = contas?.lucro?.precoMinimo ?? null;
  const menor = contas?.mercado?.precoMenor ?? null;
  if (minimo !== null && menor !== null && menor < minimo) motivos.push(`Menor preço do mercado (R$ ${menor.toFixed(2).replace(".", ",")}) abaixo do nosso mínimo.`);

  return { veredito: motivos.length ? "VALE_COM_RESSALVA" : "VALE", motivos };
}
