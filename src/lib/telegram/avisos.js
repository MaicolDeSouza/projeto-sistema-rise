import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { caminhoDe } from "@/lib/arquivos";
import { permissoesDoLogin } from "@/lib/acessos/banco";
import { pcSemResposta, sinalDoVigiaDoPc } from "@/lib/coleta/fila";
import { hojeEmSaoPaulo } from "@/lib/ferramentas/cotacao";
import { lerSegredo } from "@/lib/integracoes/conexoes";
import { lucroQueConta } from "@/lib/pedidos/banco";
import { lerConfiguracao } from "@/lib/riseAi/configuracao";
import { ESCOPOS, estadoDoOrcamento, mesDeSaoPaulo } from "@/lib/riseAi/orcamento";
import { limitesDoDia } from "@/lib/riseAi/revisao";
import { coletarSaude, itensEmFalha } from "@/lib/saude/coletar";
import { avisoDeCatalogoPendente, textoDoAvisoDeCatalogo } from "@/lib/canaisDeVenda/ml/estadoNoML";
import { TIPOS_DE_AVISO } from "./avisosTipos";
import { MAXIMO_DE_FOTOS, criarClienteTelegram } from "./cliente";
import { SERVICO_TELEGRAM } from "./estado";
import { limiteDeLinhasDoTipo, mensagemDoAviso } from "./texto";

/**
 * Os avisos do Telegram (Rise AI, Entrega C1), mandados pelo worker NORMAL a cada minuto (o unico processo longo da VPS).
 *
 * Cada fato vira uma linha de `AvisoTelegram` com uma `chave` unica (`<fato>:<chatId>`): reinicio do worker, volta do
 * processo ou duas voltas no mesmo minuto nunca mandam o mesmo aviso duas vezes. A rotina grava primeiro o que e devido
 * e depois manda o que ainda nao saiu, ate 3 tentativas por aviso. Nunca lanca: falha do Telegram ou do banco vira o
 * resultado, e o worker segue.
 */

export const AVISOS_TELEGRAM_MS = 60 * 1000;
/** Mensagens por volta: o Telegram recusa rajada a um mesmo chat (429), e o que sobra sai no minuto seguinte. */
export const MAXIMO_POR_VOLTA = 10;
const PAUSA_ENTRE_MENSAGENS_MS = 1000;
const TENTATIVAS = 3;
const HORA_DO_RESUMO = 20;
/** A marca de que a linha de base dos produtos zerados ja foi tirada (ver `produtosZerados`). */
export const CHAVE_DA_BASE = "produto-zerou-base";
const CHAT_DA_BASE = "base";
const UM_DIA_MS = 24 * 60 * 60 * 1000;

const FUSO = "America/Sao_Paulo";
const horaEmSaoPaulo = (agora) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: FUSO, hour: "2-digit", hour12: false }).format(new Date(agora)));
const diaEMes = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** O resumo sai a partir das 20h de Sao Paulo, uma vez por dia; religado no dia seguinte, o de ontem nao sai. Pura. */
export function deveMandarResumo({ agora, jaMandadoHoje }) {
  return !jaMandadoHoje && horaEmSaoPaulo(agora) >= HORA_DO_RESUMO;
}

/**
 * A janela do resumo de um dia: das 20h da vespera as 20h do dia, em Sao Paulo (pedido do dono em 20/11/2026: "vendas
 * após as 20hrs contabiliza para o dia seguinte"). Ate ali era o dia do calendario, e a venda feita entre a hora do
 * resumo e a meia-noite nao entrava em resumo nenhum. A janela e fixa, nao "ate agora": o resumo que sai atrasado
 * (worker parado as 20h) conta o mesmo, e o que veio depois das 20h fica para o de amanha, sem repetir. Pura.
 */
export function janelaDoResumo(dia) {
  const { inicio } = limitesDoDia(dia);
  const fim = new Date(inicio.getTime() + HORA_DO_RESUMO * 60 * 60 * 1000);
  return { inicio: new Date(fim.getTime() - UM_DIA_MS), fim };
}

/** Quem recebe: usuario ativo, com chat vinculado e com a aba Canais (nao delegavel: o Administrador). */
export async function destinatarios({ env = process.env } = {}) {
  const usuarios = await prisma.usuarioRise.findMany({
    where: { ativo: true, telegramChatId: { not: null } },
    select: { login: true, telegramChatId: true },
    orderBy: { login: "asc" },
  });
  const lista = [];
  for (const usuario of usuarios) {
    const sessao = await permissoesDoLogin(usuario.login, { env });
    if (sessao.pode("riseAi.configuracoes.canais", "ver")) lista.push({ login: usuario.login, chatId: usuario.telegramChatId });
  }
  return lista;
}

const minutosDesde = (data, agora) => {
  const minutos = Math.max(1, Math.round((agora - new Date(data).getTime()) / 60000));
  return minutos < 60 ? `${minutos} min` : `${Math.round(minutos / 60)} h`;
};

/**
 * Produto ativo com estoque zero. Na PRIMEIRA volta com o aviso ligado, os que ja estao zerados viram a linha de base
 * (gravados como "ja enviados", sem mensagem): senao o dono receberia o catalogo inteiro de uma vez. Produto que volta a
 * ter estoque perde as linhas dele, e o proximo zero avisa de novo.
 */
async function produtosZerados() {
  const zerados = await prisma.produto.findMany({ where: { ativo: true, estoque: { lte: 0 } }, select: { id: true, sku: true, tituloBase: true } });
  const zeradoAgora = new Set(zerados.map((produto) => produto.id));

  // Rearma quem voltou a ter estoque: as linhas de produto-zerou de quem nao esta mais zerado saem.
  const comAviso = await prisma.avisoTelegram.findMany({ where: { tipo: "produtoZerou" }, select: { id: true, chave: true } });
  const idDaChave = (chave) => chave.split(":")[1];
  const rearmar = comAviso.filter((linha) => !zeradoAgora.has(idDaChave(linha.chave))).map((linha) => linha.id);
  if (rearmar.length) await prisma.avisoTelegram.deleteMany({ where: { id: { in: rearmar } } });

  const base = await prisma.avisoTelegram.findUnique({ where: { chave: CHAVE_DA_BASE } });
  if (!base) {
    const agora = new Date();
    await prisma.avisoTelegram.createMany({
      data: zerados.map((produto) => ({ chave: `produto-zerou:${produto.id}:${CHAT_DA_BASE}`, tipo: "produtoZerou", chatId: CHAT_DA_BASE, texto: "linha de base: já estava zerado ao ligar o aviso", enviadoEm: agora })),
      skipDuplicates: true,
    });
    await prisma.avisoTelegram.create({ data: { chave: CHAVE_DA_BASE, tipo: "base", chatId: CHAT_DA_BASE, texto: "linha de base dos produtos zerados", enviadoEm: agora } });
    return [];
  }

  const rearmados = new Set(rearmar);
  const jaTratados = new Set(comAviso.filter((linha) => !rearmados.has(linha.id)).map((linha) => idDaChave(linha.chave)));
  return zerados
    .filter((produto) => !jaTratados.has(produto.id))
    .map((produto) => ({ chave: `produto-zerou:${produto.id}`, dados: { id: produto.id, sku: produto.sku, nome: produto.tituloBase } }));
}

async function orcamentosNoLimite({ agora, config }) {
  const { mes } = mesDeSaoPaulo(new Date(agora));
  const devidos = [];
  for (const escopo of ESCOPOS) {
    const estado = await estadoDoOrcamento(escopo, { agora, config });
    if (estado.nivel === "normal") continue;
    devidos.push({ chave: `orcamento:${escopo}:${mes}:${estado.nivel}`, dados: { escopo, estado: estado.nivel, percentual: estado.percentual, tetoBrl: estado.tetoBrl } });
  }
  return devidos;
}

/** Pedido de varredura pelo PC esperando, com o Rise do PC sem dar sinal (a mesma regra da tela Fontes). */
async function pedidosDoPcEsperando({ agora }) {
  const fontes = await prisma.fonteColeta.findMany({ where: { varridaNoPc: true }, select: { id: true, nome: true } });
  if (fontes.length === 0) return [];
  const nomes = new Map(fontes.map((fonte) => [fonte.id, fonte.nome]));
  const pedidos = await prisma.job.findMany({ where: { tipo: "coleta", status: "PENDENTE", fonteId: { in: [...nomes.keys()] } }, select: { id: true, fonteId: true, criadoEm: true } });
  if (pedidos.length === 0) return [];
  const sinalEm = await sinalDoVigiaDoPc();
  return pedidos
    .filter((pedido) => pcSemResposta({ pedidoEm: pedido.criadoEm, sinalEm, agora }))
    .map((pedido) => ({ chave: `pc-esperando:${pedido.id}`, dados: { fonteNome: nomes.get(pedido.fonteId) ?? "fonte", pedidoHa: minutosDesde(pedido.criadoEm, agora) } }));
}

/** Varredura que falhou nas ultimas 24 h (job de teste fica de fora, como no worker). */
async function varredurasQueFalharam({ agora }) {
  const jobs = await prisma.job.findMany({
    where: { tipo: "coleta", status: "FALHOU", atualizadoEm: { gte: new Date(agora - UM_DIA_MS), lte: new Date(agora) } },
    select: { id: true, fonteId: true, payload: true, erro: true },
  });
  const reais = jobs.filter((job) => job.payload?.teste !== true);
  if (reais.length === 0) return [];
  const fonteDoJob = (job) => job.fonteId ?? job.payload?.fonteId ?? null;
  const ids = [...new Set(reais.map(fonteDoJob).filter(Boolean))];
  const nomes = new Map((await prisma.fonteColeta.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((fonte) => [fonte.id, fonte.nome]));
  return reais.map((job) => ({ chave: `varredura-falhou:${job.id}`, dados: { fonteNome: nomes.get(fonteDoJob(job)) ?? "fonte", erro: job.erro ?? "sem mensagem de erro" } }));
}

/// Os canais que o resumo sempre mostra, nesta ordem, mesmo sem venda no dia; outro canal (Shopee) so entra com venda.
const CANAIS_DO_RESUMO = ["MERCADO_LIVRE", "LOJA_INTEGRADA", "BLING"];
const centavos = (valor) => Math.round(valor * 100) / 100;

/**
 * As vendas de um periodo (pedido do dono em 19/11/2026: "número de vendas em cada canal. Valor financeiro de venda e
 * lucro do dia"; o resumo passa a janela das 20h as 20h), pela regra da tela Vendas e do relatorio do MCP: cancelado nao entra, o valor e o total
 * do pedido (com o frete cobrado) e o lucro e o real do pedido fechado ou devolvido e o estimado dos outros
 * (`lucroQueConta`). `semLucro` conta as vendas sem lucro calculado (item sem custo): ficam fora da soma, e o texto diz.
 */
export async function vendasDoDia({ inicio, fim }) {
  const pedidos = await prisma.pedidoDeVenda.findMany({
    where: { dataDaVenda: { gte: inicio, lt: fim }, status: { not: "CANCELADO" } },
    select: { canal: true, status: true, total: true, lucroFechado: true, lucroEstimado: true, lucroReal: true },
  });
  const porCanal = new Map(CANAIS_DO_RESUMO.map((canal) => [canal, { canal, pedidos: 0, valor: 0 }]));
  let valor = 0;
  let lucro = 0;
  let semLucro = 0;
  for (const pedido of pedidos) {
    const linha = porCanal.get(pedido.canal) ?? { canal: pedido.canal, pedidos: 0, valor: 0 };
    linha.pedidos += 1;
    linha.valor = centavos(linha.valor + Number(pedido.total));
    porCanal.set(pedido.canal, linha);
    valor += Number(pedido.total);
    const doPedido = lucroQueConta(pedido);
    if (doPedido === null) semLucro += 1;
    else lucro += doPedido;
  }
  return { pedidos: pedidos.length, valor: centavos(valor), lucro: centavos(lucro), semLucro, canais: [...porCanal.values()] };
}

/**
 * O que o resumo das 20h conta: das 20h da vespera as 20h do dia de Sao Paulo de `agora` (`janelaDoResumo`). As
 * consultas e os produtos que zeraram seguem a mesma janela das vendas, para o resumo falar de um periodo so. As
 * varreduras sairam da mensagem em 20/11/2026 (pedido do dono).
 */
export async function resumoDoDia({ agora = Date.now(), config } = {}) {
  const dia = hojeEmSaoPaulo(new Date(agora));
  const { inicio, fim } = janelaDoResumo(dia);
  const naJanela = { gte: inicio, lt: fim };
  const [vendas, consultas, anotadas, zerados, ia] = await Promise.all([
    vendasDoDia({ inicio, fim }),
    prisma.chamadaMcp.count({ where: { quando: naJanela } }),
    prisma.chamadaMcp.count({ where: { quando: naJanela, ferramenta: "anotarDuvida" } }),
    prisma.avisoTelegram.findMany({ where: { tipo: "produtoZerou", chatId: { not: CHAT_DA_BASE }, criadoEm: naJanela }, select: { chave: true } }),
    estadoDoOrcamento("CLIENTES", { agora, config }),
  ]);
  return {
    dia: diaEMes(dia),
    vendas,
    consultas,
    anotadas,
    zerados: new Set(zerados.map((linha) => linha.chave.split(":")[1])).size,
    ia: { gastoBrl: ia.gastoBrl, tetoBrl: ia.tetoBrl },
  };
}

async function resumosDevidos({ agora, config }) {
  const dia = hojeEmSaoPaulo(new Date(agora));
  const jaMandadoHoje = (await prisma.avisoTelegram.count({ where: { chave: { startsWith: `resumo:${dia}:` } } })) > 0;
  if (!deveMandarResumo({ agora, jaMandadoHoje })) return [];
  return [{ chave: `resumo:${dia}`, dados: await resumoDoDia({ agora, config }) }];
}

/// A Saude do Rise e lida no maximo a cada 5 min (le disco, banco e conexoes; a rotina roda a cada minuto). O que ficou
/// vermelho vira um aviso por item e por dia de Sao Paulo: nada de repetir a cada volta enquanto o problema continua.
const LER_SAUDE_MS = 5 * 60 * 1000;
/// Itens que ja tem aviso proprio (pedido do PC esperando, orcamento da IA): sem eles, o mesmo fato chegaria duas vezes.
const SAUDE_COM_AVISO_PROPRIO = new Set(["pc", "orcamento-CLIENTES", "orcamento-INTERNO"]);
let saudeLidaEm = 0;

async function saudeEmVermelho({ agora }) {
  if (agora - saudeLidaEm < LER_SAUDE_MS) return [];
  saudeLidaEm = agora;
  const dia = hojeEmSaoPaulo(new Date(agora));
  return itensEmFalha(await coletarSaude({ agora }))
    .filter((item) => !SAUDE_COM_AVISO_PROPRIO.has(item.id))
    .map((item) => ({ chave: `saude:${item.id}:${dia}`, dados: { rotulo: item.rotulo, detalhe: item.detalhe } }));
}

/** Anuncio do ML que entrou, saiu ou trocou de catalogo e o dono ainda nao abriu (25/10/2026); um aviso por mudanca. */
async function catalogosDoML() {
  const anuncios = await prisma.anuncio.findMany({
    where: { canal: "MERCADO_LIVRE", status: "PUBLICADO", idExterno: { not: null } },
    select: { id: true, dados: true, produto: { select: { sku: true } } },
  });
  return anuncios
    .filter((anuncio) => avisoDeCatalogoPendente(anuncio.dados?.publicacao?.estadoML))
    .map((anuncio) => {
      const aviso = anuncio.dados.publicacao.estadoML.catalogoAviso;
      return { chave: `catalogo-ml:${anuncio.id}:${String(aviso.em ?? "").replace(/\D/g, "")}`, dados: { anuncioId: anuncio.id, sku: anuncio.produto?.sku ?? "", texto: textoDoAvisoDeCatalogo(aviso) } };
    });
}

/// Nova venda: so o pedido lido ha pouco (2 h) e vendido ha pouco (24 h). A carga inicial e as releituras criam linhas
/// de vendas antigas, e o aviso de uma venda de ontem nao serve para nada.
const DUAS_HORAS_MS = 2 * 60 * 60 * 1000;
const SETE_DIAS_MS = 7 * UM_DIA_MS;

async function novasVendas({ agora }) {
  const pedidos = await prisma.pedidoDeVenda.findMany({
    where: { criadoEm: { gte: new Date(agora - DUAS_HORAS_MS) }, dataDaVenda: { gte: new Date(agora - UM_DIA_MS) }, status: { not: "CANCELADO" } },
    select: {
      id: true,
      canal: true,
      numero: true,
      nomeDoComprador: true,
      total: true,
      itens: { orderBy: { ordem: "asc" }, select: { titulo: true, quantidade: true, quantidadeDoKit: true, total: true, produto: { select: { sku: true } } } },
    },
    orderBy: { dataDaVenda: "asc" },
  });
  return pedidos.map((p) => ({
    chave: `nova-venda:${p.id}`,
    dados: { pedidoId: p.id, canal: p.canal, numero: p.numero, cliente: p.nomeDoComprador, total: Number(p.total), itens: p.itens.map(itemDoAviso) },
  }));
}

/// O item como o cliente comprou: a `quantidade` do banco e em unidades do produto, entao 1 "Kit de 20" esta gravado
/// como 20; o aviso mostra 1 (o titulo do anuncio ja diz que e kit).
function itemDoAviso(item) {
  const kit = Number(item.quantidadeDoKit) > 1 ? Number(item.quantidadeDoKit) : 1;
  const vendidos = item.quantidade % kit === 0 ? item.quantidade / kit : item.quantidade;
  return { quantidade: vendidos, sku: item.produto?.sku ?? null, nome: item.titulo, total: Number(item.total) };
}

/// O Telegram recusa foto acima de 10 MB. As do Rise sao padronizadas e ficam bem abaixo; uma antiga pode passar.
const MAXIMO_DA_FOTO_BYTES = 10 * 1024 * 1024;
const TIPO_DA_FOTO = { png: "image/png", webp: "image/webp" };

async function lerFotoDoDisco(sku, arquivo) {
  const caminho = caminhoDe(sku, "IMAGEM", arquivo);
  if (!caminho) throw new Error(`caminho inválido para a foto ${arquivo}`);
  return readFile(caminho);
}

/**
 * As fotos do aviso de nova venda (pedido do dono em 19/11/2026: uma foto por produto vendido): a principal de cada
 * produto, na ordem dos itens, sem repetir produto e ate 10 (o album do Telegram). Item que nao esta no Rise, produto
 * sem foto e arquivo que nao abre ficam de fora: a foto e complemento, e o aviso sai so em texto quando nenhuma serve.
 * Lida na hora do envio, porque a linha do aviso guarda so o texto.
 *
 * @returns {Promise<Array<{ bytes: Buffer, nome: string, tipo: string }>>}
 */
export async function fotosDaVenda(pedidoId, { lerFoto = lerFotoDoDisco } = {}) {
  const itens = await prisma.itemDoPedidoDeVenda.findMany({ where: { pedidoId, produtoId: { not: null } }, orderBy: { ordem: "asc" }, select: { produtoId: true } });
  const produtoIds = [...new Set(itens.map((item) => item.produtoId))].slice(0, MAXIMO_DE_FOTOS);
  if (produtoIds.length === 0) return [];
  const arquivos = await prisma.produtoArquivo.findMany({
    where: { produtoId: { in: produtoIds }, tipo: "IMAGEM", papel: "FOTO" },
    orderBy: [{ principal: "desc" }, { ordem: "asc" }],
    select: { produtoId: true, arquivo: true, produto: { select: { sku: true } } },
  });
  const fotos = [];
  for (const produtoId of produtoIds) {
    const arquivo = arquivos.find((linha) => linha.produtoId === produtoId);
    if (!arquivo) continue;
    try {
      const bytes = await lerFoto(arquivo.produto.sku, arquivo.arquivo);
      if (!bytes?.length || bytes.length > MAXIMO_DA_FOTO_BYTES) continue;
      const extensao = String(arquivo.arquivo).split(".").pop().toLowerCase();
      fotos.push({ bytes, nome: arquivo.arquivo, tipo: TIPO_DA_FOTO[extensao] ?? "image/jpeg" });
    } catch {
      // Foto que sumiu do disco: o aviso segue com as outras (ou so com o texto).
    }
  }
  return fotos;
}

/** "falta 2× 900211 (previsão 12/11); falta 1× 100101" a partir do `pecas` gravado no pedido. */
function linhaDasFaltas(pecas) {
  return (pecas?.pecas ?? [])
    .filter((peca) => Number(peca?.falta) > 0)
    .map((peca) => `falta ${peca.falta}× ${peca.sku ?? "peça"}${peca.previsao ? ` (previsão ${peca.previsao})` : ""}`)
    .join("; ");
}

/** Pedido parado esperando peca, vendido na ultima semana: um aviso por pedido (a chave nao repete). */
async function pedidosAguardandoPecas({ agora }) {
  const pedidos = await prisma.pedidoDeVenda.findMany({
    where: { status: "AGUARDANDO_PECAS", dataDaVenda: { gte: new Date(agora - SETE_DIAS_MS) } },
    select: { id: true, numero: true, pecas: true },
  });
  return pedidos.map((p) => ({ chave: `aguardando-pecas:${p.id}`, dados: { pedidoId: p.id, numero: p.numero, pecas: linhaDasFaltas(p.pecas) } }));
}

const CALCULO = {
  novaVenda: novasVendas,
  aguardandoPecas: pedidosAguardandoPecas,
  catalogoML: () => catalogosDoML(),
  saudeDoRise: saudeEmVermelho,
  resumoDoDia: resumosDevidos,
  produtoZerou: () => produtosZerados(),
  orcamento: orcamentosNoLimite,
  varreduraPeloPc: pedidosDoPcEsperando,
  varreduraFalhou: varredurasQueFalharam,
};

/** Os avisos devidos de um tipo, ainda SEM o destinatario (a chave final e `<chave>:<chatId>`). */
export function avisosDevidos(tipo, contexto) {
  return CALCULO[tipo](contexto);
}

/** O caminho do botao "Abrir no Rise", tirado da chave (o texto gravado nao guarda o link). */
export function caminhoDoAviso(chave) {
  const [fato, id] = chave.split(":");
  if (fato === "nova-venda" || fato === "aguardando-pecas") return `/pedidos/${id}`;
  if (fato === "produto-zerou") return `/produtos/${id}`;
  if (fato === "orcamento") return "/rise-ai/configuracoes";
  if (fato === "pc-esperando" || fato === "varredura-falhou") return "/mercados/fontes";
  if (fato === "resumo") return "/rise-ai/revisao";
  if (fato === "saude") return "/configuracoes/saude";
  if (fato === "catalogo-ml") return `/canais-de-venda/mercado-livre/${id}`;
  return null;
}

const esperar = (ms) => (ms > 0 ? new Promise((resolver) => setTimeout(resolver, ms)) : Promise.resolve());

/**
 * Uma volta da rotina. `cliente` (o teste passa o Telegram falso), `filtrarDestinatarios` (o teste fica so com os dele),
 * `pausaMs` e `lerFoto` (a foto do produto sem o disco) sao para o teste; na vida real o cliente nasce do token cadastrado.
 *
 * @returns {Promise<{ ok: boolean, mandados: number, falhas: number, motivo?: string }>}
 */
export async function rodarAvisosDoTelegram({ agora = Date.now(), env = process.env, cliente = null, filtrarDestinatarios = (lista) => lista, pausaMs = PAUSA_ENTRE_MENSAGENS_MS, lerFoto = undefined } = {}) {
  try {
    const config = await lerConfiguracao();
    if (!config.telegram?.ligado) return { ok: true, mandados: 0, falhas: 0, motivo: "desligado" };
    const segredo = await lerSegredo(SERVICO_TELEGRAM);
    if (!segredo?.token) return { ok: true, mandados: 0, falhas: 0, motivo: "sem-token" };
    const quem = filtrarDestinatarios(await destinatarios({ env }));
    if (quem.length === 0) return { ok: true, mandados: 0, falhas: 0, motivo: "sem-destinatario" };
    const bot = cliente ?? criarClienteTelegram({ token: segredo.token });

    for (const tipo of TIPOS_DE_AVISO) {
      if (!config.telegram.avisos?.[tipo]) continue;
      const devidos = await avisosDevidos(tipo, { agora, config });
      if (devidos.length === 0) continue;
      await prisma.avisoTelegram.createMany({
        data: devidos.flatMap(({ chave, dados }) => {
          const { texto } = mensagemDoAviso(tipo, dados);
          return quem.map(({ chatId }) => ({ chave: `${chave}:${chatId}`, tipo, chatId, texto }));
        }),
        skipDuplicates: true,
      });
    }

    // Manda o que ainda nao saiu, so a quem recebe hoje (quem foi desvinculado nao recebe o atrasado).
    const pendentes = await prisma.avisoTelegram.findMany({
      where: { enviadoEm: null, tentativas: { lt: TENTATIVAS }, chatId: { in: quem.map((destino) => destino.chatId) } },
      orderBy: { criadoEm: "asc" },
      take: MAXIMO_POR_VOLTA,
    });
    let mandados = 0;
    let falhas = 0;
    for (const [indice, aviso] of pendentes.entries()) {
      if (indice > 0) await esperar(pausaMs);
      const opcoes = { caminho: caminhoDoAviso(aviso.chave), limiteDeLinhas: limiteDeLinhasDoTipo(aviso.tipo) };
      let resposta = null;
      if (aviso.tipo === "novaVenda") {
        const fotos = await fotosDaVenda(aviso.chave.split(":")[1], { lerFoto }).catch(() => []);
        if (fotos.length > 0) resposta = await bot.enviarFotos(aviso.chatId, fotos, aviso.texto, opcoes);
      }
      // Sem foto, ou com a foto recusada (arquivo que o Telegram nao aceita): o texto sai do mesmo jeito. Chat que
      // bloqueou o bot nao ganha a segunda tentativa.
      if (!resposta?.ok && !resposta?.bloqueado) resposta = await bot.enviarMensagem(aviso.chatId, aviso.texto, opcoes);
      if (resposta.ok) {
        mandados++;
        await prisma.avisoTelegram.update({ where: { id: aviso.id }, data: { enviadoEm: new Date(), tentativas: { increment: 1 }, erro: null } });
      } else {
        falhas++;
        // Chat que bloqueou o bot nao recebe mais nada daquele aviso: nao adianta insistir.
        await prisma.avisoTelegram.update({
          where: { id: aviso.id },
          data: resposta.bloqueado ? { tentativas: TENTATIVAS, erro: resposta.erro } : { tentativas: { increment: 1 }, erro: resposta.erro },
        });
      }
    }
    return { ok: true, mandados, falhas };
  } catch (erro) {
    console.error("[telegram] falha na rotina de avisos:", erro?.message ?? erro);
    return { ok: false, mandados: 0, falhas: 0, motivo: "erro" };
  }
}
