import { gravarAjusteDeEstoque } from "@/lib/ajusteRapido";
import { clienteBling } from "@/lib/blingSync/cliente";
import { enviarAjustesDeEstoque } from "@/lib/blingSync/envio";
import { sincronizarEstoqueDoBling } from "@/lib/blingSync/saldos";
import { recalcularKitsDaPeca } from "@/lib/composicaoBanco";
import { prisma } from "@/lib/db";

/**
 * O "Ajustar estoque" da lista de Produtos JA sincronizando com o Bling (pedido do dono em 20/11/2026: "quero que
 * mudar o estoque no rise tambem mude o bling ... Mas sempre ler saldo atual no bling"). Ate ali o ajuste ficava so no
 * Rise, pendente, ate alguem abrir a janela do Bling e enviar: dois ajustes esquecidos (uma saida e uma entrada que se
 * anulavam) acenderam o "!" do 110304 com 0 e 0 dos dois lados, e ninguem sabia por que.
 *
 * Nao reescreve nada: junta a leitura dos saldos (`saldos.js`), o ajuste do Rise (`ajusteRapido.js`) e o envio dos
 * pendentes (`envio.js`), cada um com as suas travas e os seus testes. O cliente entra por parametro, como em toda a
 * sincronizacao: o teste passa o Bling falso.
 */

const NAO_ACHADO = { ok: false, erro: "Produto não encontrado. Ele pode ter sido excluído." };

async function lerDoRise(produtoId) {
  if (typeof produtoId !== "string" || !produtoId) return null;
  return prisma.produto.findUnique({
    where: { id: produtoId },
    select: { estoque: true, blingSaldo: true, _count: { select: { movimentosEstoque: { where: { enviadoAoBlingEm: null } } } } },
  });
}

/**
 * O saldo para o popup do ajuste: le o Bling AGORA e regrava o estoque do Rise por ele (saldo do Bling mais os
 * ajustes ainda pendentes), a mesma conta do botao "Sincronizar estoque com Bling", so para este produto. So le o
 * Bling: nenhuma trava de escrita e nenhuma escrita.
 *
 * `noBling: false` e o produto cujo codigo nao esta entre os ativos do Bling: o estoque fica como esta no Rise, e a
 * tela avisa que o ajuste nao tem para onde ir.
 *
 * @returns {Promise<{ok: true, noBling: boolean, estoque: number, blingSaldo: number|null, pendentes: number} | {ok: false, erro: string}>}
 */
export async function lerSaldoParaAjuste(produtoId, cliente = clienteBling()) {
  if (!(await lerDoRise(produtoId))) return NAO_ACHADO;

  const lido = await sincronizarEstoqueDoBling(cliente, { produtoIds: [produtoId] });
  if (lido.falhas.length > 0) return { ok: false, erro: lido.falhas[0].erro };

  const produto = await lerDoRise(produtoId);
  if (!produto) return NAO_ACHADO;
  return {
    ok: true,
    noBling: lido.atualizados > 0,
    estoque: produto.estoque,
    blingSaldo: produto.blingSaldo,
    pendentes: produto._count.movimentosEstoque,
  };
}

/**
 * Depois de um envio completo: o estoque do Rise passa a ser o saldo que o Bling devolveu na releitura. Quase sempre
 * ja e (o Rise contava o ajuste, e desde 25/11/2026 o balanco vai ao Bling ja somando as reservas, para o disponivel ficar
 * na contagem); fica como rede para o Bling que devolve outro numero (uma reserva que mudou no meio).
 * A linha e travada, como em todo ajuste; com algum pendente (outro ajuste entrou no meio) nao mexe, porque o saldo
 * relido nao o contem. O kit nunca passa por aqui com ajuste (o Rise recusa antes).
 */
async function igualarAoBling(produtoId) {
  await prisma.$transaction(async (tx) => {
    const linhas = await tx.$queryRaw`SELECT "estoque", "blingSaldo", "tipo"::text AS "tipo" FROM "Produto" WHERE "id" = ${produtoId} FOR UPDATE`;
    const linha = linhas[0];
    if (!linha || linha.tipo === "COMPOSICAO" || linha.blingSaldo === null || linha.estoque === linha.blingSaldo) return;
    const pendentes = await tx.movimentoEstoque.count({ where: { produtoId, enviadoAoBlingEm: null } });
    if (pendentes > 0) return;
    // SQL cru, como na leitura dos saldos: igualar ao Bling nao e editar o produto, e o `atualizadoEm` fica.
    await tx.$executeRaw`UPDATE "Produto" SET "estoque" = ${linha.blingSaldo} WHERE "id" = ${produtoId}`;
    await recalcularKitsDaPeca(produtoId, tx);
  });
}

/**
 * O Confirmar do popup: (1) le o saldo no Bling e acerta o estoque do Rise por ele, (2) grava o ajuste no Rise e
 * (3) envia ao Bling os ajustes pendentes do produto, este e algum antigo que tenha ficado, na ordem.
 *
 * - Sem conseguir ler o Bling, o ajuste NAO e feito: a conta partiria de um saldo que pode estar velho (a saida
 *   conferida contra 7 com 2 de verdade no Bling). `ok: false`, nada gravado.
 * - Ajuste invalido (saida maior que o saldo lido, quantidade zero, kit): `ok: false`, como sempre.
 * - `bling: "enviado"`: o Bling aceitou tudo, e o estoque do Rise termina igual ao saldo relido.
 * - `bling: "pendente"`: o Rise gravou, mas o envio nao saiu ou parou (trava de escrita, deposito por escolher, Bling
 *   recusou). Nada e desfeito: o ajuste fica pendente, com o `motivo`, e a janela do Bling o envia depois. Desfazer
 *   apagaria um ajuste que a pessoa fez de verdade na prateleira.
 * - `bling: "fora"`: o codigo nao esta no Bling; o ajuste fica so no Rise.
 *
 * `saldoAnterior` e o estoque de antes do ajuste (ja lido do Bling) e `estoque` o do Rise no fim.
 *
 * @param {string} produtoId id do `Produto` no Rise.
 * @param {{tipo: string, quantidade: number|string, motivo?: string, observacao?: string}} dados
 * @returns {Promise<{ok: false, erro: string} | {ok: true, bling: "enviado"|"pendente"|"fora", saldoAnterior: number, estoque: number, blingSaldo: number|null, enviados?: number, motivo?: string, aviso?: string}>}
 */
export async function ajustarESincronizar(produtoId, dados, cliente = clienteBling()) {
  const saldo = await lerSaldoParaAjuste(produtoId, cliente);
  if (!saldo.ok) return saldo === NAO_ACHADO ? saldo : { ok: false, erro: `${saldo.erro} Nada foi alterado.` };

  const ajuste = await gravarAjusteDeEstoque(produtoId, dados);
  if (!ajuste.ok) return ajuste;

  const fim = async (extra) => {
    const produto = await lerDoRise(produtoId);
    return { ok: true, bling: extra.bling, saldoAnterior: ajuste.saldoAnterior, estoque: produto?.estoque ?? ajuste.saldoNovo, blingSaldo: produto?.blingSaldo ?? null, ...extra };
  };

  if (!saldo.noBling) return fim({ bling: "fora" });

  const envio = await enviarAjustesDeEstoque(produtoId, cliente);
  if (!envio.ok) return fim({ bling: "pendente", motivo: envio.erro });

  // Com aviso, o saldo novo nao foi relido: o `blingSaldo` guardado e o de antes, e igualar por ele desfaria o ajuste.
  if (!envio.aviso && envio.restantes === 0) await igualarAoBling(produtoId);
  return fim({ bling: "enviado", enviados: envio.enviados, ...(envio.aviso ? { aviso: envio.aviso } : {}) });
}
