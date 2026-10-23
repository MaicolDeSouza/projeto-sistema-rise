import { prisma } from "@/lib/db";
import { permissoesDoLogin } from "@/lib/acessos/banco";
import { pcSemResposta, sinalDoVigiaDoPc } from "@/lib/coleta/fila";
import { hojeEmSaoPaulo } from "@/lib/ferramentas/cotacao";
import { lerSegredo } from "@/lib/integracoes/conexoes";
import { lerConfiguracao } from "@/lib/riseAi/configuracao";
import { ESCOPOS, estadoDoOrcamento, mesDeSaoPaulo } from "@/lib/riseAi/orcamento";
import { limitesDoDia } from "@/lib/riseAi/revisao";
import { TIPOS_DE_AVISO } from "./avisosTipos";
import { criarClienteTelegram } from "./cliente";
import { SERVICO_TELEGRAM } from "./estado";
import { mensagemDoAviso } from "./texto";

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

/** O que o resumo das 20h conta, no dia de Sao Paulo de `agora`. */
export async function resumoDoDia({ agora = Date.now(), config } = {}) {
  const dia = hojeEmSaoPaulo(new Date(agora));
  const { inicio, fim } = limitesDoDia(dia);
  const noDia = { gte: inicio, lt: fim };
  const [consultas, anotadas, zerados, concluidas, falhas, ia] = await Promise.all([
    prisma.chamadaMcp.count({ where: { quando: noDia } }),
    prisma.chamadaMcp.count({ where: { quando: noDia, ferramenta: "anotarDuvida" } }),
    prisma.avisoTelegram.findMany({ where: { tipo: "produtoZerou", chatId: { not: CHAT_DA_BASE }, criadoEm: noDia }, select: { chave: true } }),
    prisma.job.count({ where: { tipo: "coleta", status: "CONCLUIDO", atualizadoEm: noDia } }),
    prisma.job.count({ where: { tipo: "coleta", status: "FALHOU", atualizadoEm: noDia } }),
    estadoDoOrcamento("CLIENTES", { agora, config }),
  ]);
  return {
    dia: diaEMes(dia),
    consultas,
    anotadas,
    zerados: new Set(zerados.map((linha) => linha.chave.split(":")[1])).size,
    varreduras: { concluidas, falhas },
    ia: { gastoBrl: ia.gastoBrl, tetoBrl: ia.tetoBrl },
  };
}

async function resumosDevidos({ agora, config }) {
  const dia = hojeEmSaoPaulo(new Date(agora));
  const jaMandadoHoje = (await prisma.avisoTelegram.count({ where: { chave: { startsWith: `resumo:${dia}:` } } })) > 0;
  if (!deveMandarResumo({ agora, jaMandadoHoje })) return [];
  return [{ chave: `resumo:${dia}`, dados: await resumoDoDia({ agora, config }) }];
}

const CALCULO = {
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
function caminhoDoAviso(chave) {
  const [fato, id] = chave.split(":");
  if (fato === "produto-zerou") return `/produtos/${id}`;
  if (fato === "orcamento") return "/rise-ai/configuracoes";
  if (fato === "pc-esperando" || fato === "varredura-falhou") return "/mercados/fontes";
  if (fato === "resumo") return "/rise-ai/revisao";
  return null;
}

const esperar = (ms) => (ms > 0 ? new Promise((resolver) => setTimeout(resolver, ms)) : Promise.resolve());

/**
 * Uma volta da rotina. `cliente` (o teste passa o Telegram falso), `filtrarDestinatarios` (o teste fica so com os dele)
 * e `pausaMs` sao para o teste; na vida real o cliente nasce do token cadastrado.
 *
 * @returns {Promise<{ ok: boolean, mandados: number, falhas: number, motivo?: string }>}
 */
export async function rodarAvisosDoTelegram({ agora = Date.now(), env = process.env, cliente = null, filtrarDestinatarios = (lista) => lista, pausaMs = PAUSA_ENTRE_MENSAGENS_MS } = {}) {
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
      const resposta = await bot.enviarMensagem(aviso.chatId, aviso.texto, { caminho: caminhoDoAviso(aviso.chave) });
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
