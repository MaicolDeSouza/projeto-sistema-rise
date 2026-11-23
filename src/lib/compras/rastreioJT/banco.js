import { prisma } from "@/lib/db";
import { lerDadosDaEmpresa } from "@/lib/compras/empresa";
import { lerConfigDeFrete } from "@/lib/frete/configuracao";

import { chaveDoPacoteVicio, consultarJT } from "./pacoteVicio";
import { LINK_DO_PACOTEVICIO, codigoDaJT, ehDaJT, encerrado, lerRespostaDoPacoteVicio, mesDaContagem, problema, proximaLeituraDoRastreio, rotuloDaSituacao } from "./regras";

/**
 * O rastreio da J&T gravado no pedido de compra (spec 2026-11-23-rastreio-jt-nas-compras-design.md): o botao "Atualizar
 * rastreio" e a rotina do worker passam por `atualizarRastreioDaCompra`. O documento do destinatario (CNPJ da empresa ou o
 * CPF alternativo de Configuracoes > Envios) so vai ao PacoteVicio: aqui fica so QUAL deles a J&T aceitou.
 */

const SEM_CHAVE = "O rastreio da J&T não está ligado: falta a chave do PacoteVício.";
/** Teto da rotina automatica no mes (o plano Basico tem 1.000); o botao continua consultando. */
function tetoDoMes() {
  const valor = Number.parseInt(process.env.PACOTEVICIO_LIMITE_MES ?? "", 10);
  return Number.isFinite(valor) && valor > 0 ? valor : 900;
}

/** Os documentos a tentar, o que a J&T aceitou da ultima vez primeiro. So digitos, nunca para log. */
async function documentos(preferido) {
  const [empresa, config] = await Promise.all([lerDadosDaEmpresa(), lerConfigDeFrete()]);
  const lista = [
    { tipo: "CNPJ", digitos: String(empresa?.cnpj ?? "").replace(/\D/g, "") },
    { tipo: "CPF", digitos: String(config.documentoRastreioJT ?? "").replace(/\D/g, "") },
  ].filter((documento) => documento.digitos.length === 11 || documento.digitos.length === 14);
  return preferido ? [...lista.filter((d) => d.tipo === preferido), ...lista.filter((d) => d.tipo !== preferido)] : lista;
}

/** Soma consultas cobradas ao mes corrente (o mes novo recomeca do zero), numa escrita so. */
async function contarConsultas(quantas, agora) {
  if (quantas <= 0) return;
  await lerConfigDeFrete();
  await prisma.$executeRaw`
    UPDATE "ConfigDeFrete"
       SET "rastreioConsultasNoMes" = CASE WHEN "rastreioMes" = ${mesDaContagem(agora)} THEN "rastreioConsultasNoMes" + ${quantas} ELSE ${quantas} END,
           "rastreioMes" = ${mesDaContagem(agora)}
     WHERE id = 'frete'`;
}

async function consultasNoMes(agora) {
  const config = await lerConfigDeFrete();
  return config.rastreioMes === mesDaContagem(agora) ? config.rastreioConsultasNoMes : 0;
}

const nomeDaTransportadora = (pedido) => pedido.transportadora?.nome ?? pedido.transportadoraNome ?? null;

/**
 * Le o rastreio da J&T de UM pedido e grava. `manual` = o botao (mostra o erro); a rotina passa `manual: false`.
 * @returns {Promise<{ ok: true, situacao: string, mudou: boolean } | { ok: false, erro: string, passageira?: boolean }>}
 */
export async function atualizarRastreioDaCompra(pedidoId, { agora = new Date() } = {}) {
  if (!chaveDoPacoteVicio()) return { ok: false, erro: SEM_CHAVE };
  const pedido = await prisma.pedidoDeCompra.findUnique({
    where: { id: String(pedidoId ?? "") },
    select: { id: true, rastreio: true, transportadoraNome: true, transportadora: { select: { nome: true } }, rastreioJT: true },
  });
  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
  if (!ehDaJT({ rastreio: pedido.rastreio, transportadora: nomeDaTransportadora(pedido) })) return { ok: false, erro: "O rastreio deste pedido não é da J&T." };
  const codigo = codigoDaJT(pedido.rastreio);
  // Codigo trocado no pedido: a linha antiga era de outro pacote, entao nada dela vale.
  const anterior = pedido.rastreioJT?.codigo === codigo ? pedido.rastreioJT : null;
  const lista = await documentos(anterior?.documento ?? null);
  if (!lista.length) return { ok: false, erro: "Cadastre o CNPJ em Dados da empresa para rastrear a J&T." };

  let cobradas = 0;
  let achado = null;
  let falha = null;
  for (const documento of lista) {
    const resposta = await consultarJT(codigo, documento.digitos);
    if (resposta.cobrado) cobradas++;
    if (resposta.ok) {
      achado = { documento: documento.tipo, ...lerRespostaDoPacoteVicio(resposta.dados) };
      break;
    }
    falha = resposta;
    // So o "nao achou com este documento" passa para o proximo; chave, cota ou fora do ar valem para os dois.
    if (!resposta.naoAchado) break;
  }
  await contarConsultas(cobradas, agora);

  const naoAchouComTodos = !achado && falha?.naoAchado;
  const erro = achado ? null : naoAchouComTodos ? (lista.length > 1 ? "A J&T não achou este código com o CNPJ nem com o CPF." : `A J&T não achou este código com o ${lista[0].tipo}.`) : falha.mensagem;
  const dados = achado
    ? {
        codigo,
        situacao: achado.situacao,
        situacaoEm: achado.situacaoEm,
        entregueEm: achado.entregueEm ?? (achado.situacao === "delivered" ? achado.situacaoEm : null),
        eventos: achado.eventos,
        documento: achado.documento,
        lidoEm: agora,
        proximaLeituraEm: proximaLeituraDoRastreio({ situacao: achado.situacao, achou: true, agora }),
        erro: null,
      }
    : {
        codigo,
        // A leitura que falhou nao apaga o que ja se sabia do mesmo codigo.
        ...(anterior ? {} : { situacao: null, situacaoEm: null, entregueEm: null, eventos: null, documento: null }),
        lidoEm: agora,
        proximaLeituraEm: proximaLeituraDoRastreio({ situacao: null, achou: false, passageira: Boolean(falha?.passageira), agora }),
        erro,
      };
  await prisma.rastreioDaCompra.upsert({
    where: { pedidoDeCompraId: pedido.id },
    create: { pedidoDeCompraId: pedido.id, consultas: cobradas, ...dados },
    update: { ...dados, consultas: anterior ? { increment: cobradas } : cobradas },
  });
  if (!achado) return { ok: false, erro, passageira: Boolean(falha?.passageira) };
  return { ok: true, situacao: achado.situacao, mudou: anterior?.situacao !== achado.situacao || String(anterior?.situacaoEm ?? "") !== String(achado.situacaoEm ?? "") };
}

/**
 * A rotina do worker: os pedidos de compra a caminho (ENVIADO/PARCIAL, feitos no Rise) com rastreio da J&T cuja leitura
 * venceu. Um por vez (o PacoteVicio limita por minuto). Para no teto do mes.
 */
export async function rodarRastreioDasCompras({ agora = new Date() } = {}) {
  if (!chaveDoPacoteVicio()) return { ok: true, motivo: "sem-chave", consultados: 0 };
  const pedidos = await prisma.pedidoDeCompra.findMany({
    where: { status: { in: ["ENVIADO", "PARCIAL"] }, origem: "RISE", rastreio: { not: null } },
    select: { id: true, rastreio: true, transportadoraNome: true, transportadora: { select: { nome: true } }, rastreioJT: { select: { codigo: true, situacao: true, proximaLeituraEm: true } } },
    orderBy: { enviadoEm: "asc" },
  });
  const vencidos = pedidos.filter((pedido) => {
    if (!ehDaJT({ rastreio: pedido.rastreio, transportadora: nomeDaTransportadora(pedido) })) return false;
    const linha = pedido.rastreioJT;
    if (!linha || linha.codigo !== codigoDaJT(pedido.rastreio)) return true;
    if (linha.situacao && encerrado(linha.situacao)) return false;
    return !linha.proximaLeituraEm || linha.proximaLeituraEm <= agora;
  });
  const resumo = { ok: true, consultados: 0, mudados: 0, entregues: 0, problemas: 0, erros: 0, teto: false };
  for (const pedido of vencidos) {
    if ((await consultasNoMes(agora)) >= tetoDoMes()) {
      resumo.teto = true;
      break;
    }
    const lido = await atualizarRastreioDaCompra(pedido.id, { agora });
    resumo.consultados++;
    if (!lido.ok) {
      resumo.erros++;
      continue;
    }
    if (lido.mudou) resumo.mudados++;
    if (lido.situacao === "delivered") resumo.entregues++;
    if (problema(lido.situacao)) resumo.problemas++;
  }
  return resumo;
}

/** O que a tela, a lista e o MCP mostram: sem o documento, nem mesmo o tipo dele. */
export function rastreioParaTela(linha) {
  if (!linha) return null;
  return {
    codigo: linha.codigo,
    situacao: linha.situacao,
    rotulo: linha.situacao ? rotuloDaSituacao(linha.situacao) : null,
    situacaoEm: linha.situacaoEm,
    entregueEm: linha.entregueEm,
    eventos: Array.isArray(linha.eventos) ? linha.eventos : [],
    lidoEm: linha.lidoEm,
    proximaLeituraEm: linha.proximaLeituraEm,
    erro: linha.erro,
    link: LINK_DO_PACOTEVICIO,
  };
}
