import { TEXTO_DO_GRUPO, textoDaReputacao } from "@/lib/pedidos/reclamacoesTextos";
import { mascararDadosPessoais } from "@/lib/riseAi/mascarar";

/**
 * O texto dos avisos do Telegram (spec do agente, §5a.7): texto puro, sem `parse_mode`, no maximo 4 linhas, com o
 * trecho de dado de cliente mascarado e cortado, e com `@`, `://` e a barra no comeco da linha neutralizados, para o
 * aviso nunca virar um comando, uma mencao ou um link que nao e nosso. Regras puras: a tela, o worker e o teste leem.
 */

export const LIMITE_DE_LINHAS = 4;
export const LIMITE_DO_TRECHO = 120;
/// A nova venda lista os produtos (pedido do dono em 19/11/2026): cabecalho, cliente, ate 8 itens, "e mais N" e o total.
/// Com 50 caracteres por nome o texto cabe nos 1.024 da legenda de uma foto do Telegram.
export const MAXIMO_DE_ITENS_DA_VENDA = 8;
export const LIMITE_DE_LINHAS_DA_VENDA = MAXIMO_DE_ITENS_DA_VENDA + 4;
/// O resumo das 20h abre com as vendas (19/11/2026): titulo, total, ate 4 canais, lucro, consultas e IA. A linha das
/// varreduras saiu em 20/11/2026 (pedido do dono: "pode remover a varredura da mensagem").
/// Desde 22/11/2026 (pedido do dono: "A mensagem de produto zerado deve mostrar junto com o relatorio das 20hrs") o
/// resumo fecha com os produtos que zeraram: uma linha de titulo, ate 15 produtos e "e mais N".
export const MAXIMO_DE_CANAIS_DO_RESUMO = 4;
export const MAXIMO_DE_ZERADOS_DO_RESUMO = 15;
export const LIMITE_DE_LINHAS_DO_RESUMO = MAXIMO_DE_CANAIS_DO_RESUMO + 5 + MAXIMO_DE_ZERADOS_DO_RESUMO + 2;
const LIMITE_POR_TIPO = { novaVenda: LIMITE_DE_LINHAS_DA_VENDA, resumoDoDia: LIMITE_DE_LINHAS_DO_RESUMO };

/** Quantas linhas o aviso de um tipo pode ter: 4, menos a nova venda (lista os itens) e o resumo do dia (as vendas). */
export function limiteDeLinhasDoTipo(tipo) {
  return LIMITE_POR_TIPO[tipo] ?? LIMITE_DE_LINHAS;
}

/**
 * `@` vira U+FF20 (o Telegram nao faz mencao), `://` vira `:∕∕` (U+2215, nao vira link) e `/` no comeco de uma
 * linha vira `∕` (nao vira comando). O resto do texto fica como esta.
 */
export function neutralizar(texto) {
  return String(texto ?? "")
    .replace(/@/g, "＠")
    .replace(/:\/\//g, ":∕∕")
    .replace(/(^|\n)\//g, "$1∕");
}

/** Um trecho de texto de terceiro (nome de produto, erro, mensagem): mascarado, numa linha so, cortado e neutralizado. */
export function trechoSeguro(texto, limite = LIMITE_DO_TRECHO) {
  const { texto: mascarado } = mascararDadosPessoais(String(texto ?? ""));
  const numaLinha = mascarado.replace(/\s*\r?\n\s*/g, " ").trim();
  const cortado = numaLinha.length > limite ? `${numaLinha.slice(0, limite)}…` : numaLinha;
  return neutralizar(cortado);
}

/** `1234.5` -> `1.234,50`. */
function formatarReais(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "0,00";
  const [inteiro, centavos] = numero.toFixed(2).split(".");
  return `${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${centavos}`;
}

/** "2× 100101 Módulo Relé 5V · R$ 25,80": o que o cliente comprou (kit conta como 1), o nosso código e o valor da linha. */
function linhaDoItemDaVenda({ quantidade, sku, nome, total }) {
  const produto = [sku ? trechoSeguro(sku, 20) : "", trechoSeguro(nome, 50)].filter(Boolean).join(" ");
  return `${Number(quantidade) || 1}× ${produto} · R$ ${formatarReais(total)}`;
}

const VENDAS_VAZIAS = { pedidos: 0, valor: 0, lucro: 0, semLucro: 0, canais: [] };
const quantasVendas = (quantas) => `${quantas} ${quantas === 1 ? "venda" : "vendas"}`;

/**
 * O bloco dos produtos que zeraram, no fim do resumo: "Produtos que zeraram: 2" e uma linha por produto (codigo e nome),
 * ate 15, depois "e mais N". Lista vazia: "Produtos que zeraram: nenhum". Sem lista (`null`: o aviso esta desmarcado na
 * aba Canais): sem bloco. Um numero (quem so tem a contagem): so a linha do total.
 */
function linhasDosZerados(zerados) {
  if (zerados === null || zerados === undefined) return [];
  if (!Array.isArray(zerados)) return [`Produtos que zeraram: ${Number(zerados) || 0}`];
  if (zerados.length === 0) return ["Produtos que zeraram: nenhum"];
  const resto = zerados.length - MAXIMO_DE_ZERADOS_DO_RESUMO;
  return [
    `Produtos que zeraram: ${zerados.length}`,
    ...zerados.slice(0, MAXIMO_DE_ZERADOS_DO_RESUMO).map(({ sku, nome }) => `• ${[trechoSeguro(sku, 20), trechoSeguro(nome, 50)].filter(Boolean).join(" ")}`),
    resto > 0 ? `e mais ${resto} ${resto === 1 ? "produto" : "produtos"}` : "",
  ];
}

const ESCOPO = { CLIENTES: "dos clientes", INTERNO: "interno" };
const NOME_DO_CANAL = { MERCADO_LIVRE: "Mercado Livre", LOJA_INTEGRADA: "Loja Integrada", BLING: "Bling", SHOPEE: "Shopee" };

/** Cada tipo monta as linhas e diz para onde o botao "Abrir no Rise" leva. `dados` vem de quem calculou o aviso. */
const TIPOS = {
  produtoZerou: ({ id, sku, nome }) => ({
    linhas: [`Produto zerou: ${sku}`, trechoSeguro(nome, 60)],
    caminho: `/produtos/${id}`,
  }),
  orcamento: ({ escopo, estado, percentual, tetoBrl }) => ({
    linhas: [
      `IA: orçamento ${ESCOPO[escopo] ?? escopo} em ${Math.round(Number(percentual))}% do teto de R$ ${formatarReais(tetoBrl)}`,
      ...(estado === "esgotado" ? ["Respostas pagas param até o teto subir."] : []),
    ],
    caminho: "/rise-ai/configuracoes",
  }),
  varreduraPeloPc: ({ fonteNome, pedidoHa }) => ({
    linhas: [`Varredura pelo PC esperando: ${trechoSeguro(fonteNome, 60)}`, `Pedida há ${pedidoHa}; o Rise do PC não responde.`],
    caminho: "/mercados/fontes",
  }),
  varreduraFalhou: ({ fonteNome, erro }) => ({
    linhas: [`Varredura falhou: ${trechoSeguro(fonteNome, 60)}`, trechoSeguro(erro)],
    caminho: "/mercados/fontes",
  }),
  catalogoML: ({ anuncioId, sku, texto }) => ({
    linhas: [`Mercado Livre: anúncio do ${trechoSeguro(sku, 40)} ${trechoSeguro(texto)}`, "Confira se o catálogo é o certo para o produto."],
    caminho: `/canais-de-venda/mercado-livre/${anuncioId}`,
  }),
  // Pedidos de venda (fase 2): o nome do cliente passa pelo trecho seguro (mascara telefone/documento se vierem juntos).
  // Desde 19/11/2026 (pedido do dono) lista cada produto: quantidade, nome e valor; o canal fica no cabecalho.
  novaVenda: ({ pedidoId, canal, numero, cliente, total, itens = [] }) => ({
    linhas: [
      `Nova venda ${NOME_DO_CANAL[canal] ?? canal} ${trechoSeguro(numero, 40)}`,
      cliente ? `Cliente: ${trechoSeguro(cliente, 60)}` : "",
      ...itens.slice(0, MAXIMO_DE_ITENS_DA_VENDA).map(linhaDoItemDaVenda),
      itens.length > MAXIMO_DE_ITENS_DA_VENDA ? `e mais ${itens.length - MAXIMO_DE_ITENS_DA_VENDA} ${itens.length - MAXIMO_DE_ITENS_DA_VENDA === 1 ? "item" : "itens"}` : "",
      `Total: R$ ${formatarReais(total)}`,
    ],
    caminho: `/pedidos/${pedidoId}`,
  }),
  // Reclamacao aberta no ML (20/11/2026): o grupo do motivo, o que o comprador disse e o efeito na reputacao.
  reclamacaoML: ({ pedidoId, numero, total, grupo, motivo, afeta }) => ({
    linhas: [
      `Reclamação no Mercado Livre: pedido ${trechoSeguro(numero, 40)}`,
      `${TEXTO_DO_GRUPO[grupo] ?? "Reclamação"}${motivo ? `: ${trechoSeguro(motivo, 80)}` : ""}${textoDaReputacao(afeta) ? ` (${textoDaReputacao(afeta)})` : ""}`,
      `R$ ${formatarReais(total)} fora do faturamento e do lucro até a mediação fechar.`,
    ],
    caminho: `/pedidos/${pedidoId}`,
  }),
  // Devolucao postada (20/11/2026): emitir a nota de devolucao agora, antes de saber se o produto chega.
  notaDevolucao: ({ pedidoId, numero, total }) => ({
    linhas: [
      `Devolução postada: pedido ${trechoSeguro(numero, 40)}`,
      `Emita a nota de devolução de R$ ${formatarReais(total)} no faturador do Mercado Livre e marque no Rise.`,
    ],
    caminho: `/pedidos/${pedidoId}`,
  }),
  aguardandoPecas: ({ pedidoId, numero, pecas }) => ({
    linhas: [`Pedido ${trechoSeguro(numero, 40)} aguardando peças`, trechoSeguro(pecas)],
    caminho: `/pedidos/${pedidoId}`,
  }),
  saudeDoRise: ({ rotulo, detalhe }) => ({
    linhas: [`Saúde do Rise: ${trechoSeguro(rotulo, 60)}`, trechoSeguro(detalhe)],
    caminho: "/configuracoes/saude",
  }),
  // Desde 19/11/2026 (pedido do dono) abre com as vendas do dia: o total, cada canal e o lucro. Os canais vem de quem
  // calculou (Mercado Livre, Loja Integrada e Bling sempre, mesmo com zero). Sem a linha das varreduras desde 20/11/2026.
  resumoDoDia: ({ dia, vendas = VENDAS_VAZIAS, consultas, anotadas, zerados, ia }) => ({
    linhas: [
      `Resumo de ${dia}`,
      `Vendas do dia: ${vendas.pedidos} · R$ ${formatarReais(vendas.valor)}`,
      ...vendas.canais.slice(0, MAXIMO_DE_CANAIS_DO_RESUMO).map((canal) => `${NOME_DO_CANAL[canal.canal] ?? canal.canal}: ${quantasVendas(canal.pedidos)}${canal.pedidos > 0 ? ` · R$ ${formatarReais(canal.valor)}` : ""}`),
      `Lucro do dia: R$ ${formatarReais(vendas.lucro)}${vendas.semLucro > 0 ? ` (fora ${quantasVendas(vendas.semLucro)} sem custo)` : ""}`,
      `Consultas pelo Claude/ChatGPT: ${consultas} (${anotadas} anotadas)`,
      `IA no mês: R$ ${formatarReais(ia.gastoBrl)} de R$ ${formatarReais(ia.tetoBrl)}`,
      ...linhasDosZerados(zerados),
    ],
    caminho: "/rise-ai/revisao",
  }),
};

/**
 * @param {keyof typeof TIPOS} tipo
 * @returns {{ texto: string, caminho: string }} o texto pronto (ja neutralizado inteiro: o `@` de um nome de loja
 *   tambem sai neutro) e o caminho do Rise do botao.
 */
export function mensagemDoAviso(tipo, dados) {
  const montar = TIPOS[tipo];
  if (!montar) throw new Error(`Tipo de aviso desconhecido: ${tipo}`);
  const { linhas, caminho } = montar(dados ?? {});
  const texto = neutralizar(linhas.filter((linha) => linha !== "").slice(0, limiteDeLinhasDoTipo(tipo)).join("\n"));
  return { texto, caminho };
}

/** O endereco do botao "Abrir no Rise": a `APP_URL_PUBLICA` mais o caminho; `null` sem base (o PC nao tem). */
export function linkAbrirNoRise(base, caminho) {
  const raiz = String(base ?? "").trim().replace(/\/+$/, "");
  if (!raiz) return null;
  return `${raiz}${caminho.startsWith("/") ? "" : "/"}${caminho}`;
}
