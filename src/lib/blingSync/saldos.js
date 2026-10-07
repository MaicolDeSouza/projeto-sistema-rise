import { Prisma } from "@/generated/prisma/client";
import { clienteBling } from "@/lib/blingSync/cliente";
import { estoqueDoRise } from "@/lib/blingSync/estoque";
import { recalcularKitsDasPecas } from "@/lib/composicaoBanco";
import { prisma } from "@/lib/db";

/**
 * A LEITURA dos saldos de estoque do Bling. O botao da lista de Produtos le o saldo de todos os
 * produtos do Rise e recalcula o estoque de cada um (`sincronizarEstoqueDoBling`); e o UNICO jeito de
 * o Rise ler o saldo, nada e automatico (isso fica para a VPS). O envio dos ajustes (`envio.js`)
 * usa a mesma leitura para reler o saldo de um produto depois de enviar (`lerSaldosDoBling`).
 *
 * So le o Bling: so `cliente.get`, nunca `exigirEscrita` nem escrita. No Rise grava, por produto,
 * `blingSaldo` (o `saldoVirtualTotal`, que desconta reservas e pode ser negativo) e
 * `estoque = estoqueDoRise(blingSaldo, pendentes)`, sem subir o `atualizadoEm` (ler o Bling nao e
 * editar o produto, e a lista ordena por ele) e sem criar `MovimentoEstoque` (o saldo lido nao e um
 * ajuste feito aqui).
 *
 * O cliente entra por parametro (`clienteBling()` por padrao), como em toda a sincronizacao: o teste
 * passa o Bling falso. Este arquivo nao importa `envio.js` (e `envio.js` importa este), para nao
 * haver import circular.
 */

/// Codigos por chamada de `GET /estoques/saldos` (Emenda 5). O limite do Bling e o tamanho da URL
/// (entre 6 e 9 mil caracteres, medido em 04/10/2026); 100 codigos dao uns 2 KB, com folga.
const LOTE_DE_SALDOS = 100;

/// `blingSaldo` e `Int` no banco: um saldo fora da faixa derrubaria a gravacao do lote inteiro.
const MAIOR_INTEIRO = 2147483647;

const mensagemDe = (erro) => erro?.message ?? String(erro);

/// Sem caixa e sem espacos nas pontas: o Bling e o Rise nem sempre guardam o SKU com a mesma caixa
/// (a mesma regra da busca por codigo e da lista BLING_ESCRITA_CODIGOS).
const chaveDoCodigo = (codigo) => String(codigo ?? "").trim().toLowerCase();

/// Id do Bling valido (inteiro positivo), ou null.
function idOuNull(valor) {
  const id = Number(valor);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/// O saldo como o Rise o guarda (inteiro, arredondado), ou null se nao veio um numero. `Number(null)`
/// e 0: sem este cuidado, um saldo ausente viraria "zero pecas" e zeraria o estoque.
function saldoLido(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  const inteiro = Math.round(numero);
  return Math.abs(inteiro) <= MAIOR_INTEIRO ? inteiro : null;
}

function semAcento(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

/**
 * Medido no Bling real: pedido por `codigos[]` em que NENHUM codigo resolve (nao existe ou esta
 * inativo) da HTTP 400 `VALIDATION_ERROR` "nenhum produto foi informado", e nao lista vazia. E a
 * resposta "nenhum desses produtos esta la", nao uma falha. Outro 400 (outro motivo) continua sendo
 * falha.
 */
function nenhumResolvido(resposta) {
  if (resposta?.status !== 400) return false;
  const erro = resposta?.dados?.error;
  return semAcento(`${erro?.description ?? ""} ${erro?.message ?? ""}`).includes("nenhum produto");
}

/// O que o Bling disse ao recusar a leitura: HTTP e descricao, e o que o operador pode fazer.
function recusaDaLeitura(resposta) {
  const status = resposta?.status;
  const descricao = resposta?.dados?.error?.description ?? resposta?.dados?.error?.message ?? null;
  let texto = `O Bling recusou a leitura do saldo (HTTP ${status ?? "sem status"}${descricao ? `: ${descricao}` : ""}).`;
  if (status === 429) texto += " O Bling limita a 3 chamadas por segundo na conta inteira: tente de novo em alguns instantes.";
  else if (status === 401 || status === 403) texto += " Reconecte o Bling em Integrações e tente de novo.";
  else if (status >= 500) texto += " Tente de novo em alguns instantes.";
  return texto;
}

/**
 * Le no Bling o saldo destes codigos, numa chamada: `GET /estoques/saldos?codigos[]=...` (a chave
 * repetida; o cliente monta a lista). Quem chama manda no maximo `LOTE_DE_SALDOS` codigos.
 *
 * Codigo que o Bling nao tem, ou que esta inativo la, simplesmente nao volta (`codigos[]` so resolve
 * produto ativo). Por isso o lote em que nenhum resolve, que o Bling responde com 400, volta como
 * lista vazia. Nunca lanca: rede caindo ou recusa do Bling viram `ok: false` com `erro` pronto.
 *
 * Cada item: o `produto.id` e o `produto.codigo` do Bling e o `saldoVirtualTotal` arredondado
 * (`saldo` null quando nao veio um numero).
 *
 * @param {ReturnType<typeof clienteBling>} cliente
 * @param {string[]} codigos
 * @returns {Promise<{ok: true, itens: {id: number|null, codigo: string, saldo: number|null}[]} | {ok: false, erro: string}>}
 */
export async function lerSaldosDoBling(cliente, codigos) {
  // Codigo vazio nem vai: sem nenhum, nao ha o que pedir (e o Bling responderia 400).
  const pedidos = (Array.isArray(codigos) ? codigos : []).map((codigo) => String(codigo ?? "").trim()).filter(Boolean);
  if (pedidos.length === 0) return { ok: true, itens: [] };

  let resposta;
  try {
    resposta = await cliente.get("/estoques/saldos", { "codigos[]": pedidos });
  } catch (erro) {
    return { ok: false, erro: `Não foi possível ler o saldo no Bling: ${mensagemDe(erro)}` };
  }
  if (!resposta?.ok) {
    if (nenhumResolvido(resposta)) return { ok: true, itens: [] };
    return { ok: false, erro: recusaDaLeitura(resposta) };
  }

  const lista = resposta.dados?.data;
  if (!Array.isArray(lista)) return { ok: false, erro: "O Bling respondeu a leitura do saldo sem a lista de saldos. Tente de novo." };
  return {
    ok: true,
    itens: lista.map((item) => ({
      id: idOuNull(item?.produto?.id),
      codigo: String(item?.produto?.codigo ?? ""),
      saldo: saldoLido(item?.saldoVirtualTotal),
    })),
  };
}

/// Os itens lidos por codigo (sem caixa). O mesmo produto repetido na resposta conta uma vez; dois
/// produtos DIFERENTES com o mesmo codigo ficam os dois, e quem usa nao escolhe entre eles.
function porCodigo(itens) {
  const mapa = new Map();
  for (const item of itens) {
    const chave = chaveDoCodigo(item.codigo);
    if (!chave) continue;
    const doCodigo = mapa.get(chave) ?? [];
    if (item.id === null || !doCodigo.some((outro) => outro.id === item.id)) doCodigo.push(item);
    mapa.set(chave, doCodigo);
  }
  return mapa;
}

/**
 * Grava o saldo lido e o estoque recalculado dos produtos achados num lote, numa transacao.
 *
 * As linhas dos produtos sao TRAVADAS (`FOR UPDATE`, em ordem de id) antes de ler os pendentes: um
 * ajuste de estoque feito na lista ao mesmo tempo (que trava a mesma linha) entra antes ou depois,
 * nunca no meio, e o estoque gravado sempre conta os pendentes que existem.
 *
 * `desde` e o instante de antes da leitura do Bling. Um ajuste deste produto marcado como enviado a
 * partir dali pode ou nao estar no saldo lido, e o Rise nao tem como saber: contar de novo dobraria o
 * ajuste, nao contar o perderia. Esse produto nao e regravado e volta como falha ("atualize de
 * novo"). O UPDATE e SQL cru de proposito: o `@updatedAt` do Prisma nao age, e o `atualizadoEm`
 * fica como estava.
 */
async function gravarLote(achados, desde, resultado) {
  const ids = achados.map(({ produto }) => produto.id);
  let gravacoes;
  try {
    gravacoes = await prisma.$transaction(async (tx) => {
      const travados = await tx.$queryRaw`SELECT "id" FROM "Produto" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
      const existem = new Set(travados.map((linha) => linha.id));
      const movimentos = await tx.movimentoEstoque.findMany({
        where: { produtoId: { in: ids }, OR: [{ enviadoAoBlingEm: null }, { enviadoAoBlingEm: { gte: desde } }] },
        orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
        select: { produtoId: true, tipo: true, quantidade: true, enviadoAoBlingEm: true },
      });
      const doProduto = new Map();
      for (const movimento of movimentos) doProduto.set(movimento.produtoId, [...(doProduto.get(movimento.produtoId) ?? []), movimento]);

      const saida = [];
      for (const { produto, saldo } of achados) {
        if (!existem.has(produto.id)) {
          saida.push({ produto, erro: "O produto foi excluído do Rise durante a leitura do saldo." });
          continue;
        }
        const seus = doProduto.get(produto.id) ?? [];
        if (seus.some((movimento) => movimento.enviadoAoBlingEm !== null)) {
          saida.push({
            produto,
            erro: "Um ajuste deste produto foi enviado ao Bling enquanto o saldo era lido, e o saldo lido pode não contê-lo: o estoque não foi alterado. Atualize o estoque de novo.",
          });
          continue;
        }
        // Kit: guarda o saldo do Bling (o pop-up o mostra), mas o estoque do Rise e o CALCULADO pelas
        // pecas daqui, regravado abaixo junto com os outros kits (decisao do dono em 07/10/2026).
        if (produto.tipo === "COMPOSICAO") {
          await tx.$executeRaw`UPDATE "Produto" SET "blingSaldo" = ${saldo} WHERE "id" = ${produto.id}`;
          saida.push({ produto });
          continue;
        }
        // Os pendentes vem do banco em ordem de criadoEm: a ordem em que o Bling os recebera.
        const estoque = estoqueDoRise(saldo, seus);
        await tx.$executeRaw`UPDATE "Produto" SET "blingSaldo" = ${saldo}, "estoque" = ${estoque} WHERE "id" = ${produto.id}`;
        saida.push({ produto });
      }
      // Os kits que usam as pecas deste lote, DEPOIS das pecas gravadas e na mesma transacao: um kit
      // cujas pecas estao em lotes diferentes e regravado de novo a cada lote, e o ultimo vale.
      const pecasGravadas = saida.filter((item) => !item.erro && item.produto.tipo !== "COMPOSICAO").map((item) => item.produto.id);
      await recalcularKitsDasPecas(pecasGravadas, tx);
      return saida;
    });
  } catch (erro) {
    for (const { produto } of achados) {
      resultado.falhas.push({ sku: produto.sku, erro: `O saldo foi lido do Bling, mas não foi gravado no Rise: ${mensagemDe(erro)}` });
    }
    return;
  }

  for (const { produto, erro } of gravacoes) {
    if (erro) resultado.falhas.push({ sku: produto.sku, erro });
    else resultado.atualizados++;
  }
}

/// Um lote: le os saldos no Bling e grava os produtos achados. Erro na leitura vira uma falha por
/// produto do lote (com o mesmo texto), e quem chama segue para o lote seguinte.
async function atualizarLote(cliente, lote, resultado) {
  const desde = new Date();
  const lido = await lerSaldosDoBling(cliente, lote.map((produto) => produto.sku));
  if (!lido.ok) {
    for (const produto of lote) resultado.falhas.push({ sku: produto.sku, erro: lido.erro });
    return;
  }

  const lidos = porCodigo(lido.itens);
  const achados = [];
  for (const produto of lote) {
    const itens = lidos.get(chaveDoCodigo(produto.sku)) ?? [];
    if (itens.length > 1) {
      // O Rise nao escolhe um: o saldo do produto errado viraria o estoque deste.
      resultado.falhas.push({
        sku: produto.sku,
        erro: `Há mais de um produto com o código ${produto.sku} no Bling (${itens.length} encontrados): o estoque não foi alterado. Deixe só um com esse código no Bling.`,
      });
    } else if (itens.length === 0 || itens[0].saldo === null) {
      // Nao existe no Bling, esta inativo la (`codigos[]` nao resolve inativo) ou veio sem saldo.
      resultado.semCodigoNoBling++;
    } else {
      achados.push({ produto, saldo: itens[0].saldo });
    }
  }
  if (achados.length) await gravarLote(achados, desde, resultado);
}

/**
 * Le no Bling o saldo de todos os produtos do Rise, em lotes de 100 codigos
 * (`GET /estoques/saldos?codigos[]=`, Emenda 5), e grava em cada um `blingSaldo` (o
 * `saldoVirtualTotal`, arredondado; pode ser negativo) e `estoque = estoqueDoRise(blingSaldo,
 * pendentes)`, com os pendentes em ordem de `criadoEm`. Casa a resposta pelo codigo, sem caixa.
 *
 * - `atualizados`: produtos gravados.
 * - `semCodigoNoBling`: o codigo nao esta entre os ativos do Bling (nao existe, esta inativo, ou o
 *   lote inteiro deu o 400 "nenhum produto"), veio sem saldo, ou o produto nao tem codigo no Rise. O
 *   estoque desses NAO muda: sem saldo lido, nao ha de onde recalcular.
 * - `falhas`: `{sku, erro}` por produto que nao foi gravado por outro motivo: o lote dele deu erro no
 *   Bling (um item por produto do lote; os outros lotes seguem), o codigo existe duas vezes no Bling,
 *   um ajuste dele foi enviado durante a leitura, ou a gravacao no Rise falhou.
 *
 * Nao cria `MovimentoEstoque` e nao sobe o `atualizadoEm`. So a leitura dos produtos do Rise, antes
 * de tudo, lanca (sem ela nao ha o que fazer); o resto vira `falhas`.
 *
 * `opcoes.produtoIds` restringe a esses produtos (o teste usa so os dele, sem tocar no catalogo
 * real). Sem ele, todos os produtos do Rise.
 *
 * @param {ReturnType<typeof clienteBling>} [cliente]
 * @param {{produtoIds?: string[]}} [opcoes]
 * @returns {Promise<{atualizados: number, semCodigoNoBling: number, falhas: {sku: string, erro: string}[]}>}
 */
export async function sincronizarEstoqueDoBling(cliente = clienteBling(), opcoes = {}) {
  const resultado = { atualizados: 0, semCodigoNoBling: 0, falhas: [] };

  const ids = opcoes?.produtoIds;
  // Um filtro que nao e lista nao pode virar "todos os produtos" por descuido.
  if (ids !== undefined && !Array.isArray(ids)) {
    throw new Error("sincronizarEstoqueDoBling: produtoIds tem que ser uma lista.");
  }

  let produtos;
  try {
    produtos = await prisma.produto.findMany({
      where: ids ? { id: { in: ids.map(String) } } : {},
      // `tipo`: o kit nao tem o estoque regravado pelo saldo, so o `blingSaldo` (ver gravarLote).
      select: { id: true, sku: true, tipo: true },
      orderBy: [{ sku: "asc" }, { id: "asc" }],
    });
  } catch (erro) {
    throw new Error(`Não foi possível ler os produtos do Rise: ${mensagemDe(erro)}`);
  }

  // Sem codigo no Rise nao ha o que pedir ao Bling: conta como sem codigo, e o estoque fica.
  const comCodigo = produtos.filter((produto) => chaveDoCodigo(produto.sku));
  resultado.semCodigoNoBling += produtos.length - comCodigo.length;

  for (let inicio = 0; inicio < comCodigo.length; inicio += LOTE_DE_SALDOS) {
    await atualizarLote(cliente, comCodigo.slice(inicio, inicio + LOTE_DE_SALDOS), resultado);
  }
  return resultado;
}
