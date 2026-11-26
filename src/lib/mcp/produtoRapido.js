import { z } from "zod";

import { gravarLocalizacao, gravarPrecoVenda } from "@/lib/ajusteRapido";
import { ajustarESincronizar, lerSaldoParaAjuste } from "@/lib/blingSync/ajusteComBling";
import { MOTIVOS, novoSaldo } from "@/lib/estoque";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

import { CONFIRMO, ESCRITA, ESCRITA_FORA, acharProdutoPorSku, exigir, exigirOk, previa } from "./doisPassos.js";

/**
 * O produto no dia a dia pelo MCP (26/11/2026, grupo "Produto no dia a dia"): preco de venda, localizacao e ajuste de
 * estoque, as tres edicoes rapidas da lista de Produtos, pelas MESMAS funcoes (`lib/ajusteRapido.js` e
 * `ajustarESincronizar`) e com o acesso de cada uma. O ajuste de estoque e o unico que escreve fora: le o saldo no Bling,
 * grava o movimento no Rise e o manda ao Bling, como o popup "Ajustar estoque"; o segundo passo so sai com o saldo que a
 * pessoa viu (`saldoVisto`), para uma venda no meio nao virar ajuste em cima de numero velho.
 */

const TEXTO = (maximo) => z.string().trim().max(maximo);
const SKU = TEXTO(60).min(1).describe("O código do produto (SKU)");
const reais = (valor) => (valor === null || valor === undefined ? null : `R$${Number(valor).toFixed(2).replace(".", ",")}`);

export async function alterarPrecoDeVenda({ sku, preco, confirmo }, { pode }) {
  exigir(pode, "tela.produtos", "editar", "mudar o preço de venda");
  const produto = await acharProdutoPorSku(sku, { id: true, sku: true, tituloBase: true, precoVenda: true, custo: true });
  const antes = produto.precoVenda === null ? null : Number(produto.precoVenda);
  if (antes !== null && Math.round(antes * 100) === Math.round(preco * 100)) throw new ErroDeFerramenta(`O preço do ${produto.sku} já é ${reais(preco)}.`);
  const resumo = {
    produto: `${produto.sku} · ${produto.tituloBase}`,
    precoAntes: reais(antes),
    precoDepois: reais(preco),
    ...(pode("dado.custo", "ver") && Number(produto.custo) > 0 ? { markupDepois: `${Math.round(((preco - Number(produto.custo)) / Number(produto.custo)) * 100)}%` } : {}),
    aviso: "Muda o preço do cadastro do Rise. O Bling, a Loja Integrada e os anúncios do ML recebem pelo Sincronizar de cada canal.",
  };
  if (!confirmo) return previa(resumo);
  exigirOk(await gravarPrecoVenda(produto.id, preco));
  return { gravado: true, ...resumo };
}

export async function alterarLocalizacao({ sku, localizacao, confirmo }, { pode }) {
  exigir(pode, "tela.produtos", "editar", "mudar a localização");
  exigir(pode, "dado.localizacao", "editar", "mudar a localização");
  const produto = await acharProdutoPorSku(sku, { id: true, sku: true, tituloBase: true, localizacao: true });
  const novo = localizacao.trim() || null;
  if ((produto.localizacao ?? null) === novo) throw new ErroDeFerramenta(`A localização do ${produto.sku} já é ${novo ?? "vazia"}.`);
  const resumo = { produto: `${produto.sku} · ${produto.tituloBase}`, localizacaoAntes: produto.localizacao ?? null, localizacaoDepois: novo };
  if (!confirmo) return previa(resumo);
  exigirOk(await gravarLocalizacao(produto.id, novo ?? ""));
  return { gravado: true, ...resumo };
}

export async function ajustarEstoque({ sku, tipo, quantidade, motivo, observacao, saldoVisto, confirmo }, { pode }) {
  exigir(pode, "tela.produtos", "editar", "ajustar estoque");
  exigir(pode, "dado.estoqueExato", "ver", "ajustar estoque (precisa ver o estoque exato)");
  exigir(pode, "acao.produtos.sincronizarBling", "executar", "ajustar estoque (o ajuste vai ao Bling)");
  if (motivo && !MOTIVOS[tipo].includes(motivo)) throw new ErroDeFerramenta(`Motivo inválido para ${tipo}: use ${MOTIVOS[tipo].join(", ")}.`);
  const produto = await acharProdutoPorSku(sku, { id: true, sku: true, tituloBase: true, tipo: true });
  if (produto.tipo === "COMPOSICAO") throw new ErroDeFerramenta("O estoque de um kit é calculado pelas peças. Ajuste o estoque das peças.");

  // O saldo de agora, lido no Bling (o mesmo do popup; regrava o estoque do Rise por ele, sem ajustar nada).
  const saldo = exigirOk(await lerSaldoParaAjuste(produto.id));
  const saldoNovo = novoSaldo(tipo, saldo.estoque, quantidade);
  if (saldoNovo < 0) throw new ErroDeFerramenta(`Saída de ${quantidade} maior que o saldo de ${saldo.estoque}.`);
  const resumo = {
    produto: `${produto.sku} · ${produto.tituloBase}`,
    operacao: { ENTRADA: "Entrada", SAIDA: "Saída", BALANCO: "Balanço" }[tipo],
    quantidade,
    saldoAtual: saldo.estoque,
    saldoDepois: saldoNovo,
    ...(motivo ? { motivo } : {}),
    ondeGrava: saldo.noBling ? "Grava no Rise e manda ao Bling (ERP real) na mesma hora." : "O produto não está no Bling: grava só no Rise.",
  };
  if (!confirmo) return { ...previa(resumo), proximoPasso: `Prévia: nada foi gravado. Mostre à pessoa e, com o ok dela, chame de novo com os mesmos dados, saldoVisto: ${saldo.estoque} e confirmo: true.` };
  if (saldoVisto === undefined || saldoVisto !== saldo.estoque) {
    throw new ErroDeFerramenta(`O saldo agora é ${saldo.estoque}${saldoVisto !== undefined ? `, não ${saldoVisto}` : ""}: mostre a prévia de novo e confirme com saldoVisto igual a ele. Nada foi alterado.`);
  }
  const feito = exigirOk(await ajustarESincronizar(produto.id, { tipo, quantidade, motivo: motivo ?? "", observacao: observacao ?? "" }));
  const bling = { enviado: "enviado ao Bling", fora: "só no Rise (fora do Bling)", pendente: `gravado no Rise, PENDENTE no Bling${feito.motivo ? `: ${feito.motivo}` : ""}` }[feito.bling] ?? feito.bling;
  return { gravado: true, ...resumo, saldoAnterior: feito.saldoAnterior, estoqueAgora: feito.estoque, bling, ...(feito.aviso ? { aviso: feito.aviso } : {}) };
}

export const FERRAMENTAS_DO_PRODUTO_RAPIDO = [
  {
    nome: "alterarPrecoDeVenda",
    descricao:
      "Muda o preço de venda do cadastro de um produto (a edição rápida da lista de Produtos). Os canais recebem pelo Sincronizar de cada um. Dois passos: sem confirmo devolve o preço de antes e o de depois; com confirmo: true grava.",
    esquema: z.object({ sku: SKU, preco: z.number().positive().max(9_999_999.99).describe("Preço novo em R$"), confirmo: CONFIRMO }),
    anotacoes: ESCRITA,
    executar: alterarPrecoDeVenda,
  },
  {
    nome: "alterarLocalizacao",
    descricao:
      "Muda a localização (onde fica no estoque, ex.: \"M2\") de um produto; texto vazio apaga. Kit não tem localização própria. Dois passos: sem confirmo devolve antes e depois; com confirmo: true grava.",
    esquema: z.object({ sku: SKU, localizacao: TEXTO(40), confirmo: CONFIRMO }),
    anotacoes: ESCRITA,
    executar: alterarLocalizacao,
  },
  {
    nome: "ajustarEstoque",
    descricao:
      "Entrada, saída ou balanço de estoque de um produto, como o 'Ajustar estoque' da lista: lê o saldo no Bling, grava no Rise e manda ao BLING (ERP real). Kit não (é pelas peças). Dois passos: sem confirmo devolve o saldo atual e o de depois; com saldoVisto (o saldo da prévia) e confirmo: true, grava. Só com o ok da pessoa.",
    esquema: z.object({
      sku: SKU,
      tipo: z.enum(["ENTRADA", "SAIDA", "BALANCO"]).describe("BALANCO = o saldo passa a ser a quantidade"),
      quantidade: z.number().int().min(0).max(9_999_999),
      motivo: TEXTO(60).optional().describe("ENTRADA: Compra de fornecedor, Devolução de cliente, Outro. SAIDA: Venda fora dos canais, Perda ou avaria, Uso interno, Outro. BALANCO: Contagem de inventário"),
      observacao: TEXTO(200).optional(),
      saldoVisto: z.number().int().optional().describe("O saldo atual mostrado na prévia (obrigatório no segundo passo)"),
      confirmo: CONFIRMO,
    }),
    anotacoes: ESCRITA_FORA,
    executar: ajustarEstoque,
  },
];
