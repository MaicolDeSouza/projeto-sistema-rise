import { clienteBling } from "@/lib/blingSync/cliente";
import { proximoNumero } from "@/lib/compras/banco";
import { prisma } from "@/lib/db";
import { lerConexao, registrarTeste } from "@/lib/integracoes/conexoes";

import { casarLinha, entradaDaLinhaNoVirtual, oQueEstaNoVirtual, saidaDaLinhaDoVirtual } from "./casamento";
import { fornecedorDoAliExpress } from "./fornecedor";
import { descontoImplicito, lerData, lerPreco, pacoteDaLinha, situacaoDoAliExpress, statusNoRise } from "./regras";

/**
 * A importacao dos pedidos do AliExpress que a extensao manda (spec 2026-10-28, §6.3), em duas fases:
 * - `importarLista`: cria ou atualiza o PedidoDeCompra de cada pedido (fornecedor marcado, ENVIADO, origem ALIEXPRESS),
 *   casa as linhas com os produtos e, DEPOIS do commit, poe no deposito Virtual do Bling o que casou;
 * - `importarDetalhes`: frete, imposto e desconto do detalhe, e os pacotes do rastreio ligados as linhas.
 * Reimportar nunca duplica (numero do pedido e da linha sao unicos) e nunca escreve nos campos que a tela edita
 * (observacoes, rastreio em texto, transportadora, entrada).
 */

const SERVICO = "ALIEXPRESS";
const DIA_MS = 24 * 60 * 60 * 1000;
const ABERTOS = ["ENVIADO", "PARCIAL"];

/** O corte da proxima leitura: 30 dias na primeira vez; depois, a ultima importacao boa menos 7 dias de margem. */
export async function estadoDaImportacao() {
  const conexao = await lerConexao(SERVICO);
  const ultima = conexao?.ultimoTesteOk && conexao.ultimoTesteEm ? new Date(conexao.ultimoTesteEm) : null;
  const lerDesde = ultima ? new Date(ultima.getTime() - 7 * DIA_MS) : new Date(Date.now() - 30 * DIA_MS);
  const fornecedor = await fornecedorDoAliExpress();
  return { lerDesde: lerDesde.toISOString(), ultimaImportacaoEm: ultima ? ultima.toISOString() : null, fornecedor: fornecedor?.nome ?? null };
}

async function registrar({ endpoint, inicio, pedido, resposta, erro = null }) {
  await prisma.logIntegracao.create({
    data: {
      servico: SERVICO,
      metodo: "POST",
      endpoint,
      statusHttp: erro ? 400 : 200,
      duracaoMs: Date.now() - inicio,
      requestResumo: pedido,
      responseResumo: resposta,
      erro,
    },
  });
}

/** Precisa de rastreio: nao cancelado e ainda a caminho, ou entregue sem a leitura depois da entrega. */
function precisaRastreio(ali) {
  if (ali.canceladoNoAliExpressEm) return false;
  if (!ali.entregueEm) return true;
  return !ali.rastreioLidoEm || ali.rastreioLidoEm < ali.entregueEm;
}

/** Fase `lista`. */
export async function importarLista({ pedidos = [], lidoEm } = {}, { cliente = clienteBling() } = {}) {
  const inicio = Date.now();
  const ali = await fornecedorDoAliExpress();
  if (!ali) return { ok: false, erro: "Marque o fornecedor do AliExpress em Integrações." };
  const agora = new Date();
  const lido = lidoEm ? new Date(lidoEm) : agora;
  const resumo = { novos: 0, atualizados: 0, ignorados: 0, pendentes: 0, virtualPendentes: 0, avisos: [] };
  const paraSair = []; // { linhaId, dados } dos pedidos que viraram CANCELADO
  const pedidosTocados = [];

  try {
    await prisma.$transaction(
      async (tx) => {
        // Dois cliques ao mesmo tempo: o segundo espera o primeiro (sem isso, o mesmo pedido seria criado duas vezes).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('compras.aliexpress'))`;
        for (const entrada of pedidos) {
          const situacao = situacaoDoAliExpress({ codigo: entrada.statusCodigo, texto: entrada.statusTexto });
          if (situacao.aguardandoPagamento) {
            resumo.ignorados++;
            continue;
          }
          if (entrada.moeda !== "BRL") {
            resumo.ignorados++;
            resumo.avisos.push(`Pedido ${entrada.orderId} em ${entrada.moeda} ignorado: a página tem de estar em reais.`);
            continue;
          }
          const existente = await tx.pedidoAliExpress.findUnique({
            where: { externoId: entrada.orderId },
            include: { pedido: { select: { id: true, status: true, itens: { select: { quantidadeLancada: true } } } }, linhas: { select: { externoLinhaId: true } } },
          });
          // Pedido cancelado que o Rise nunca viu nao vira pedido de compra: nao houve compra a acompanhar.
          if (!existente && situacao.cancelado) {
            resumo.ignorados++;
            continue;
          }
          let dataDoPedido = entrada.dataIso ? new Date(entrada.dataIso) : lerData(entrada.dataTexto);
          if (!dataDoPedido) {
            dataDoPedido = lido;
            resumo.avisos.push(`Pedido ${entrada.orderId}: data "${entrada.dataTexto}" não lida, ficou a data da leitura.`);
          }
          const total = lerPreco(entrada.totalTexto) ?? 0;

          let aliexpress;
          // Visto pela primeira vez ja entregue (a 1a importacao traz os ultimos 30 dias): a caixa ja chegou e o dono a
          // lancou a mao, como fazia antes. Nasce FINALIZADO, sem Virtual e sem "falta lancar", para nao lancar em dobro.
          const nasceuEntregue = !existente && situacao.entregue;
          if (!existente) {
            const pedido = await tx.pedidoDeCompra.create({
              data: {
                fornecedorId: ali.id,
                numero: await proximoNumero(tx),
                status: nasceuEntregue ? "FINALIZADO" : "ENVIADO",
                origem: "ALIEXPRESS",
                enviadoEm: dataDoPedido,
                ...(nasceuEntregue ? { finalizadoEm: agora } : {}),
              },
              select: { id: true },
            });
            aliexpress = await tx.pedidoAliExpress.create({
              data: {
                pedidoId: pedido.id,
                externoId: entrada.orderId,
                loja: entrada.loja,
                lojaId: entrada.lojaId,
                statusTexto: entrada.statusTexto,
                statusCodigo: entrada.statusCodigo,
                dataDoPedido,
                totalInformado: total,
                moeda: entrada.moeda,
                entregueEm: situacao.entregue ? lido : null,
              },
            });
            resumo.novos++;
          } else {
            const temLancamento = existente.pedido.itens.some((item) => item.quantidadeLancada > 0);
            const { status, aviso } = statusNoRise({ situacao, statusAtual: existente.pedido.status, temLancamento });
            aliexpress = await tx.pedidoAliExpress.update({
              where: { id: existente.id },
              data: {
                loja: entrada.loja ?? existente.loja,
                lojaId: entrada.lojaId ?? existente.lojaId,
                statusTexto: entrada.statusTexto,
                statusCodigo: entrada.statusCodigo,
                totalInformado: total || existente.totalInformado,
                ...(situacao.entregue && !existente.entregueEm ? { entregueEm: lido } : {}),
                ...(situacao.cancelado && !existente.canceladoNoAliExpressEm ? { canceladoNoAliExpressEm: agora } : {}),
              },
            });
            if (status === "CANCELADO" && existente.pedido.status !== "CANCELADO") {
              await tx.pedidoDeCompra.update({ where: { id: existente.pedido.id }, data: { status: "CANCELADO", canceladoEm: agora } });
              const linhas = await tx.linhaAliExpress.findMany({ where: { pedidoAliExpressId: existente.id }, select: { id: true } });
              for (const linha of linhas) {
                const dados = await oQueEstaNoVirtual(tx, linha.id);
                if (dados) paraSair.push({ linhaId: linha.id, dados: { ...dados, observacao: `AliExpress ${entrada.orderId} · cancelado` } });
              }
            }
            if (aviso) resumo.avisos.push(`Pedido ${entrada.orderId}: ${aviso}`);
            resumo.atualizados++;
          }

          const conhecidas = new Set(existente?.linhas.map((linha) => linha.externoLinhaId) ?? []);
          for (const linha of entrada.linhas) {
            if (conhecidas.has(linha.orderLineId)) continue;
            const preco = lerPreco(linha.precoTexto);
            if (preco === null) resumo.avisos.push(`Pedido ${entrada.orderId}: preço "${linha.precoTexto}" não lido, ficou zero.`);
            // `upsert` pelo numero da linha: a mesma linha num pedido que o AliExpress reapresentou nao duplica.
            await tx.linhaAliExpress.upsert({
              where: { externoLinhaId: linha.orderLineId },
              update: {},
              create: {
                pedidoAliExpressId: aliexpress.id,
                externoLinhaId: linha.orderLineId,
                productId: linha.productId,
                skuId: linha.skuId,
                opcao: linha.opcao,
                titulo: linha.titulo,
                urlDoItem: linha.urlDoItem,
                urlDaFoto: linha.urlDaFoto,
                quantidadeComprada: linha.quantidade,
                precoComprado: preco ?? 0,
              },
            });
          }

          // Casa toda linha ainda sem produto (as novas e as pendentes de antes: o dono pode ter posto o link no Bling).
          const pedidoAtual = await tx.pedidoDeCompra.findUnique({ where: { id: aliexpress.pedidoId }, select: { status: true } });
          if (ABERTOS.includes(pedidoAtual.status) || nasceuEntregue) {
            const soltas = await tx.linhaAliExpress.findMany({ where: { pedidoAliExpressId: aliexpress.id, itemId: null }, select: { id: true } });
            for (const linha of soltas) {
              const casado = await casarLinha(tx, linha.id);
              if (!casado.ok) resumo.pendentes++;
            }
          }
          pedidosTocados.push({ ...aliexpress, status: pedidoAtual.status });
        }
      },
      { timeout: 120_000, maxWait: 120_000 },
    );
  } catch (erro) {
    const mensagem = `Não foi possível importar: ${erro.message}`;
    await registrarTeste(SERVICO, { ok: false, erro: mensagem });
    await registrar({ endpoint: "importar/lista", inicio, pedido: `${pedidos.length} pedidos`, resposta: null, erro: mensagem });
    return { ok: false, erro: mensagem };
  }

  // Depois do commit: o Bling. A recusa fica na linha (virtualErro) e a importacao continua valendo.
  for (const { linhaId, dados } of paraSair) await saidaDaLinhaDoVirtual(linhaId, dados, { cliente });
  const abertos = pedidosTocados.filter((pedido) => ABERTOS.includes(pedido.status)).map((pedido) => pedido.id);
  const paraEntrar = abertos.length
    ? await prisma.linhaAliExpress.findMany({
        where: { pedidoAliExpressId: { in: abertos }, itemId: { not: null }, virtualLancadoEm: null, item: { quantidadeLancada: 0 } },
        select: { id: true },
      })
    : [];
  for (const linha of paraEntrar) {
    const resultado = await entradaDaLinhaNoVirtual(linha.id, { cliente });
    if (!resultado.ok) resumo.virtualPendentes++;
  }

  const porData = [...pedidosTocados].sort((a, b) => b.dataDoPedido - a.dataDoPedido);
  const resultado = {
    ok: true,
    ...resumo,
    precisaDetalhe: porData.filter((pedido) => !pedido.detalheLidoEm && !pedido.canceladoNoAliExpressEm).map((pedido) => pedido.externoId),
    // Pedido fechado no Rise (finalizado ou cancelado) nao precisa mais de rastreio.
    precisaRastreio: porData.filter((pedido) => ABERTOS.includes(pedido.status) && precisaRastreio(pedido)).map((pedido) => pedido.externoId),
  };
  await registrarTeste(SERVICO, { ok: true });
  await registrar({
    endpoint: "importar/lista",
    inicio,
    pedido: `${pedidos.length} pedidos`,
    resposta: `${resumo.novos} novos · ${resumo.atualizados} atualizados · ${resumo.pendentes} sem produto · ${resumo.virtualPendentes} sem Virtual`,
  });
  return resultado;
}

/** Fase `detalhes`. */
export async function importarDetalhes({ detalhes = [], rastreios = [] } = {}) {
  const inicio = Date.now();
  const resumo = { ok: true, detalhados: 0, rastreados: 0, pacotes: 0, avisos: [] };
  const agora = new Date();

  for (const detalhe of detalhes) {
    const ali = await prisma.pedidoAliExpress.findUnique({ where: { externoId: detalhe.orderId }, include: { linhas: { select: { quantidadeComprada: true, precoComprado: true } } } });
    if (!ali) {
      resumo.avisos.push(`Pedido ${detalhe.orderId} não está no Rise: detalhe ignorado.`);
      continue;
    }
    const frete = lerPreco(detalhe.freteTexto) ?? 0;
    const imposto = lerPreco(detalhe.impostoTexto) ?? 0;
    const total = lerPreco(detalhe.totalTexto) ?? Number(ali.totalInformado);
    const produtos = ali.linhas.reduce((soma, linha) => soma + linha.quantidadeComprada * Number(linha.precoComprado), 0);
    const desconto = descontoImplicito({ produtos, frete, imposto, total });
    await prisma.$transaction([
      prisma.pedidoDeCompra.update({
        where: { id: ali.pedidoId },
        data: { frete, imposto, descontoTipo: desconto > 0 ? "VALOR" : null, descontoValor: desconto },
      }),
      prisma.pedidoAliExpress.update({ where: { id: ali.id }, data: { detalheLidoEm: agora, totalInformado: total } }),
    ]);
    resumo.detalhados++;
  }

  for (const rastreio of rastreios) {
    const ali = await prisma.pedidoAliExpress.findUnique({ where: { externoId: rastreio.orderId }, include: { linhas: { select: { id: true, productId: true, skuId: true } } } });
    if (!ali) continue;
    const gravados = new Map();
    for (const pacote of rastreio.pacotes) {
      const eventos = [...pacote.eventos].sort((a, b) => b.em - a.em).slice(0, 30);
      const ultimo = eventos[0] ?? null;
      const dados = {
        codigoOrigem: pacote.codigoOrigem,
        transportadora: pacote.transportadora,
        previsaoTexto: pacote.previsaoTexto,
        previsaoInicio: pacote.previsaoInicio ? new Date(pacote.previsaoInicio) : null,
        previsaoFim: pacote.previsaoFim ? new Date(pacote.previsaoFim) : null,
        ultimoEvento: ultimo?.descricao ?? null,
        ultimoEventoEm: ultimo ? new Date(ultimo.em) : null,
        ultimoCodigo: ultimo?.codigo ?? null,
        eventos,
      };
      const gravado = await prisma.pacoteAliExpress.upsert({
        where: { pedidoAliExpressId_codigo: { pedidoAliExpressId: ali.id, codigo: pacote.codigo } },
        update: dados,
        create: { pedidoAliExpressId: ali.id, codigo: pacote.codigo, ...dados },
        select: { id: true },
      });
      gravados.set(pacote.codigo, gravado.id);
      resumo.pacotes++;
    }
    for (const linha of ali.linhas) {
      const codigo = pacoteDaLinha(rastreio.pacotes, linha);
      if (codigo) await prisma.linhaAliExpress.update({ where: { id: linha.id }, data: { pacoteId: gravados.get(codigo) } });
    }
    await prisma.pedidoAliExpress.update({ where: { id: ali.id }, data: { rastreioLidoEm: agora } });
    resumo.rastreados++;
  }

  await registrar({
    endpoint: "importar/detalhes",
    inicio,
    pedido: `${detalhes.length} detalhes · ${rastreios.length} rastreios`,
    resposta: `${resumo.detalhados} detalhados · ${resumo.pacotes} pacotes`,
  });
  return resumo;
}

/** "Reenviar ao Virtual" do aviso: a entrada que o Bling recusou (ou a saida, se o pedido foi cancelado). */
export async function reenviarAoVirtual(linhaId, { cliente = clienteBling() } = {}) {
  const linha = await prisma.linhaAliExpress.findUnique({
    where: { id: String(linhaId ?? "") },
    include: { pedidoAliExpress: { select: { pedido: { select: { status: true } } } } },
  });
  if (!linha) return { ok: false, erro: "Item do AliExpress não encontrado." };
  if (linha.pedidoAliExpress.pedido.status === "CANCELADO") {
    const dados = await oQueEstaNoVirtual(prisma, linha.id);
    return dados ? saidaDaLinhaDoVirtual(linha.id, dados, { cliente }) : { ok: true };
  }
  const resultado = await entradaDaLinhaNoVirtual(linha.id, { cliente });
  return resultado.ok ? { ok: true } : { ok: false, erro: resultado.erro };
}
