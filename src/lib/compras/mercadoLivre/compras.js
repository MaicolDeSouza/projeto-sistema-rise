import { clienteBling } from "@/lib/blingSync/cliente";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";
import { atualizarCustoDosVinculos, casarLinha, entradaDaLinhaNoVirtual, oQueEstaNoVirtual, saidaDaLinhaDoVirtual } from "@/lib/compras/aliexpress/casamento";
import { descontoImplicito, statusNoRise } from "@/lib/compras/aliexpress/regras";
import { proximoNumero } from "@/lib/compras/banco";
import { prisma } from "@/lib/db";

import { agruparPorPacote, codigoDoEnvio, dadosDoPacote, entradaDaCompra, grupoNasceu, linhasDoGrupo, situacaoDoGrupo, totaisDoGrupo } from "./regras";

/**
 * As compras que a conta da loja faz no Mercado Livre viram pedidos de compra do fornecedor "ML" (spec
 * 2026-11-11-compras-do-mercado-livre-design.md). Le pela API com o token de vender (as compras sao da mesma conta,
 * 4HOBBY_STORE) e grava nas MESMAS tabelas do AliExpress (`PedidoAliExpress`, `LinhaAliExpress`, `PacoteAliExpress`),
 * com `PedidoDeCompra.origem` = MERCADO_LIVRE: o casamento, o deposito Virtual, a chegada, o custo do vinculo, a coluna
 * Situacao e a tela do pedido sao os do AliExpress.
 *
 * Cada volta (worker a cada 30 min e o botao "Ler compras do ML") le as compras dos ultimos 120 dias (sao ~2 por mes,
 * uma pagina) e o envio de cada uma ainda aberta no Rise. Sem cursor: o envio muda sem mexer na data da compra.
 * So LEITURA no ML. No Bling, so o deposito Virtual (com as travas de escrita de sempre).
 */

const DIA_MS = 24 * 60 * 60 * 1000;
const JANELA_DIAS = 120;
const PAGINA = 50;
const TETO_DE_PAGINAS = 6;
const ABERTOS = ["ENVIADO", "PARCIAL"];
const FECHADOS = ["FINALIZADO", "CANCELADO"];
const PAUSA_MS = 300;

const espera = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

/** O fornecedor marcado para as compras do ML (o "ML" do dono). Pela marca, nunca pelo nome. */
export async function fornecedorDasComprasDoML(db = prisma) {
  return db.fornecedor.findFirst({ where: { mercadoLivreCompras: true }, select: { id: true, nome: true, prazoEntregaDias: true } });
}

function motivo(resposta) {
  return `HTTP ${resposta?.status ?? "sem status"}${resposta?.dados?.message ? `: ${resposta.dados.message}` : ""}`;
}

async function exigir(promessa, rotulo) {
  const resposta = await promessa;
  if (!resposta?.ok) throw new Error(`${rotulo} falhou (${motivo(resposta)})`);
  return resposta.dados;
}

/** As compras da conta desde `desde`, da mais nova para a mais velha. */
async function listarCompras(ml, conta, desde) {
  const compras = [];
  for (let pagina = 0; pagina < TETO_DE_PAGINAS; pagina += 1) {
    const dados = await exigir(
      ml.get("/orders/search", { buyer: conta, "order.date_created.from": desde.toISOString(), sort: "date_desc", limit: PAGINA, offset: pagina * PAGINA }),
      "GET /orders/search (compras)",
    );
    const lista = Array.isArray(dados?.results) ? dados.results : [];
    compras.push(...lista);
    if (lista.length < PAGINA) break;
  }
  return compras;
}

/** Foto e endereco dos anuncios (em lotes de 20, o teto do GET /items?ids=). Falha so deixa sem foto. */
async function anunciosDasLinhas(ml, mlbs) {
  const mapa = {};
  const lista = [...new Set(mlbs)];
  for (let inicio = 0; inicio < lista.length; inicio += 20) {
    const resposta = await ml.get("/items", { ids: lista.slice(inicio, inicio + 20).join(","), attributes: "id,thumbnail,secure_thumbnail,permalink" }).catch(() => null);
    for (const item of Array.isArray(resposta?.dados) ? resposta.dados : []) {
      const corpo = item?.body;
      if (item?.code === 200 && corpo?.id) mapa[corpo.id] = { foto: corpo.secure_thumbnail ?? corpo.thumbnail ?? null, link: corpo.permalink ?? null };
    }
    await espera(PAUSA_MS);
  }
  return mapa;
}

async function registrar({ inicio, resposta, erro = null }) {
  await prisma.logIntegracao
    .create({
      data: { servico: "MERCADO_LIVRE", metodo: "GET", endpoint: "compras/ler", statusHttp: erro ? 500 : 200, duracaoMs: Date.now() - inicio, requestResumo: "compras da conta", responseResumo: resposta, erro },
    })
    .catch(() => {});
}

/**
 * Le as compras e acerta os pedidos de compra. Devolve `{ ok, lidas, novas, atualizadas, pendentes, virtualPendentes,
 * avisos }` ou `{ ok: false, motivo, erro }`. Nunca lanca por falha do ML ou do Bling (o worker registra e segue).
 */
export async function lerComprasDoML({ ml = clienteML(), cliente = clienteBling(), agora = new Date() } = {}) {
  const inicio = Date.now();
  const fornecedor = await fornecedorDasComprasDoML();
  if (!fornecedor) return { ok: false, motivo: "sem_fornecedor", erro: "Marque o fornecedor das compras do ML (o cadastro \"ML\")." };

  let grupos;
  let envios = {};
  let anuncios = {};
  try {
    const conta = await ml.usuarioId();
    const compras = await listarCompras(ml, conta, new Date(agora.getTime() - JANELA_DIAS * DIA_MS));
    grupos = agruparPorPacote(compras);
    const chaves = grupos.map((grupo) => grupo.chave);
    const conhecidos = await prisma.pedidoAliExpress.findMany({
      where: { externoId: { in: chaves }, pedido: { origem: "MERCADO_LIVRE" } },
      select: { externoId: true, pedido: { select: { status: true } }, linhas: { select: { externoLinhaId: true } } },
    });
    const porChave = new Map(conhecidos.map((conhecido) => [conhecido.externoId, conhecido]));
    // So os grupos que ainda mudam: os conhecidos abertos e os novos (o fechado no Rise nao volta).
    grupos = grupos.map((grupo) => ({ ...grupo, conhecido: porChave.get(grupo.chave) ?? null })).filter((grupo) => !FECHADOS.includes(grupo.conhecido?.pedido.status));
    for (const grupo of grupos) {
      const envioId = grupo.compras.find((compra) => compra?.shipping?.id)?.shipping?.id;
      if (!envioId) continue;
      const resposta = await ml.get(`/shipments/${envioId}`).catch(() => null);
      if (resposta?.ok) envios[grupo.chave] = resposta.dados;
      await espera(PAUSA_MS);
    }
    // A 1a leitura e "em andamento + 30 dias" (decisao do dono): o novo que ja chegou ha mais de 30 dias fica de fora.
    grupos = grupos.filter((grupo) => grupo.conhecido || grupoNasceu(grupo, envios[grupo.chave], agora));
    const novas = grupos.flatMap((grupo) => linhasDoGrupo(grupo).filter((linha) => !grupo.conhecido?.linhas.some((velha) => velha.externoLinhaId === linha.externoLinhaId)));
    anuncios = novas.length ? await anunciosDasLinhas(ml, novas.map((linha) => linha.productId)) : {};
  } catch (erro) {
    const mensagem = `Não foi possível ler as compras do ML: ${erro?.message ?? erro}`;
    await registrar({ inicio, resposta: null, erro: mensagem });
    return { ok: false, motivo: "erro", erro: mensagem };
  }

  const resumo = { lidas: grupos.length, novas: 0, atualizadas: 0, pendentes: 0, virtualPendentes: 0, avisos: [] };
  const paraSair = [];
  const tocados = [];
  try {
    await prisma.$transaction(
      async (tx) => {
        // O worker e o botao ao mesmo tempo: o segundo espera (sem isso, a mesma compra seria criada duas vezes).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('compras.mercadolivre'))`;
        for (const grupo of grupos) {
          const tocado = await gravarGrupo(tx, { grupo, envio: envios[grupo.chave] ?? null, anuncios, fornecedor, agora, resumo, paraSair });
          if (tocado) tocados.push(tocado);
        }
      },
      { timeout: 120_000, maxWait: 120_000 },
    );
  } catch (erro) {
    const mensagem = `Não foi possível gravar as compras do ML: ${erro?.message ?? erro}`;
    await registrar({ inicio, resposta: null, erro: mensagem });
    return { ok: false, motivo: "erro", erro: mensagem };
  }

  // Depois do commit: o Bling. A recusa fica na linha (virtualErro) e a leitura continua valendo.
  for (const { linhaId, dados } of paraSair) await saidaDaLinhaDoVirtual(linhaId, dados, { cliente });
  const abertos = tocados.filter((pedido) => ABERTOS.includes(pedido.status)).map((pedido) => pedido.id);
  const paraEntrar = abertos.length
    ? await prisma.linhaAliExpress.findMany({
        where: { pedidoAliExpressId: { in: abertos }, itemId: { not: null }, virtualLancadoEm: null, virtualErro: null, item: { quantidadeLancada: 0 } },
        select: { id: true },
      })
    : [];
  for (const linha of paraEntrar) {
    const resultado = await entradaDaLinhaNoVirtual(linha.id, { cliente });
    if (!resultado.ok) resumo.virtualPendentes++;
  }
  await registrar({ inicio, resposta: `${resumo.lidas} lidas · ${resumo.novas} novas · ${resumo.pendentes} sem produto · ${resumo.virtualPendentes} sem Virtual` });
  return { ok: true, ...resumo };
}

/** Grava (cria ou atualiza) o pedido de um grupo. Devolve `{ id, status }` do PedidoAliExpress, ou null se ignorado. */
async function gravarGrupo(tx, { grupo, envio, anuncios, fornecedor, agora, resumo, paraSair }) {
  const situacao = situacaoDoGrupo(grupo);
  const totais = totaisDoGrupo(grupo);
  const entrada = entradaDaCompra(grupo, envio);
  const existente = await tx.pedidoAliExpress.findUnique({
    where: { externoId: grupo.chave },
    include: { pedido: { select: { id: true, status: true, origem: true, itens: { select: { quantidadeLancada: true } } } } },
  });
  if (existente && existente.pedido.origem !== "MERCADO_LIVRE") {
    resumo.avisos.push(`Compra ${grupo.chave}: o número já é de outro pedido, ignorada.`);
    return null;
  }

  let ali;
  let status;
  if (!existente) {
    // Aguardando pagamento entra como Rascunho (decisao do dono). Visto ja entregue: a caixa ja chegou e foi lancada a mao
    // (como no AliExpress), nasce FINALIZADO, sem Virtual e sem "falta lancar".
    status = situacao.aguardandoPagamento ? "RASCUNHO" : entrada.entregueEm ? "FINALIZADO" : "ENVIADO";
    const pedido = await tx.pedidoDeCompra.create({
      data: {
        fornecedorId: fornecedor.id,
        numero: await proximoNumero(tx),
        status,
        origem: "MERCADO_LIVRE",
        ...(status !== "RASCUNHO" ? { enviadoEm: entrada.dataDoPedido } : {}),
        ...(status === "FINALIZADO" ? { finalizadoEm: agora } : {}),
      },
      select: { id: true },
    });
    ali = await tx.pedidoAliExpress.create({
      data: {
        pedidoId: pedido.id,
        externoId: grupo.chave,
        loja: entrada.vendedor,
        lojaId: entrada.vendedorId,
        statusTexto: situacao.texto,
        dataDoPedido: entrada.dataDoPedido,
        totalInformado: totais.pago || totais.produtos + totais.frete,
        moeda: "BRL",
        entregueEm: entrada.entregueEm,
      },
    });
    resumo.novas++;
  } else {
    const temLancamento = existente.pedido.itens.some((item) => item.quantidadeLancada > 0);
    const decidido = statusNoRise({ situacao, statusAtual: existente.pedido.status, temLancamento, canal: "Mercado Livre" });
    status = decidido.status;
    // Pagou: o rascunho vira Enviado (o pedido do ML nunca volta de Enviado para Rascunho).
    if (status === "RASCUNHO" && !situacao.aguardandoPagamento && !situacao.cancelado) status = "ENVIADO";
    ali = await tx.pedidoAliExpress.update({
      where: { id: existente.id },
      data: {
        loja: entrada.vendedor ?? existente.loja,
        lojaId: entrada.vendedorId ?? existente.lojaId,
        statusTexto: situacao.texto,
        totalInformado: totais.pago || existente.totalInformado,
        ...(entrada.entregueEm && !existente.entregueEm ? { entregueEm: entrada.entregueEm } : {}),
        ...(situacao.cancelado && !existente.canceladoNoAliExpressEm ? { canceladoNoAliExpressEm: agora } : {}),
      },
    });
    if (status !== existente.pedido.status) {
      await tx.pedidoDeCompra.update({
        where: { id: existente.pedido.id },
        data: { status, ...(status === "CANCELADO" ? { canceladoEm: agora } : {}), ...(status === "ENVIADO" && existente.pedido.status === "RASCUNHO" ? { enviadoEm: entrada.dataDoPedido } : {}) },
      });
      if (status === "CANCELADO") {
        const linhas = await tx.linhaAliExpress.findMany({ where: { pedidoAliExpressId: existente.id }, select: { id: true } });
        for (const linha of linhas) {
          const dados = await oQueEstaNoVirtual(tx, linha.id);
          if (dados) paraSair.push({ linhaId: linha.id, dados: { ...dados, observacao: `Mercado Livre ${grupo.chave} · cancelado` } });
        }
      }
    }
    if (decidido.aviso) resumo.avisos.push(`Compra ${grupo.chave}: ${decidido.aviso}`);
    resumo.atualizadas++;
  }

  // As linhas novas (`upsert` pelo numero da linha: a mesma linha relida nao duplica).
  for (const linha of linhasDoGrupo(grupo)) {
    const anuncio = anuncios[linha.productId] ?? null;
    await tx.linhaAliExpress.upsert({
      where: { externoLinhaId: linha.externoLinhaId },
      update: {},
      create: {
        pedidoAliExpressId: ali.id,
        externoLinhaId: linha.externoLinhaId,
        productId: linha.productId,
        skuId: linha.skuId,
        opcao: linha.opcao,
        titulo: linha.titulo,
        urlDoItem: anuncio?.link ?? linha.urlDoItem,
        urlDaFoto: anuncio?.foto ?? null,
        quantidadeComprada: linha.quantidade,
        precoComprado: linha.preco,
      },
    });
  }

  // O frete e o desconto (cupom) quando o pagamento foi aprovado, uma vez (depois o dono pode mexer na tela).
  if (totais.pago > 0 && !ali.detalheLidoEm) {
    const desconto = descontoImplicito({ produtos: totais.produtos, frete: totais.frete, imposto: 0, total: totais.pago });
    await tx.pedidoDeCompra.update({ where: { id: ali.pedidoId }, data: { frete: totais.frete, descontoTipo: desconto > 0 ? "VALOR" : null, descontoValor: desconto } });
    await tx.pedidoAliExpress.update({ where: { id: ali.id }, data: { detalheLidoEm: agora } });
  }

  // O envio vira o pacote do pedido (um envio por compra no ML), ligado a todas as linhas.
  if (envio?.id) {
    const dados = dadosDoPacote(envio);
    const codigo = codigoDoEnvio(envio);
    const antigo = await tx.pacoteAliExpress.findFirst({ where: { pedidoAliExpressId: ali.id, codigo: { in: [codigo, `envio ${envio.id}`] } }, select: { id: true } });
    const pacote = antigo
      ? await tx.pacoteAliExpress.update({ where: { id: antigo.id }, data: { codigo, ...dados }, select: { id: true } })
      : await tx.pacoteAliExpress.create({ data: { pedidoAliExpressId: ali.id, codigo, ...dados }, select: { id: true } });
    await tx.linhaAliExpress.updateMany({ where: { pedidoAliExpressId: ali.id }, data: { pacoteId: pacote.id } });
    await tx.pedidoAliExpress.update({ where: { id: ali.id }, data: { rastreioLidoEm: agora } });
  }

  // Casa toda linha ainda sem produto (no rascunho tambem: o item ja aparece; o Virtual so depois de pago).
  if (["RASCUNHO", ...ABERTOS].includes(status) || (!existente && status === "FINALIZADO")) {
    const soltas = await tx.linhaAliExpress.findMany({ where: { pedidoAliExpressId: ali.id, itemId: null }, select: { id: true } });
    for (const linha of soltas) {
      const casado = await casarLinha(tx, linha.id);
      if (!casado.ok) resumo.pendentes++;
    }
  }
  if (totais.pago > 0) await atualizarCustoDosVinculos(tx, ali.pedidoId);
  return { id: ali.id, status };
}
