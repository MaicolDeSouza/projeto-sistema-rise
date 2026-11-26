import { z } from "zod";

import { prisma } from "@/lib/db";
import { concluir, criarOrdem, darBaixa, lerOrdem, listarOrdens } from "@/lib/producao/banco";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

import { CONFIRMO, ESCRITA, ESCRITA_FORA, LEITURA, acharProdutoPorSku, exigir, exigirOk, previa } from "./doisPassos.js";

/**
 * Ordens de producao pelo MCP (26/11/2026, grupo "Ordem de producao"): listar, criar, dar a baixa das pecas e concluir,
 * as etapas da tela Estoque > Producao, pelas MESMAS funcoes de `lib/producao/banco.js`. Criar so grava no Rise
 * (`tela.estoque.producao` editar); a baixa e a conclusao movimentam o estoque no Rise e no BLING
 * (`acao.producao.movimentar`), como os botoes da tela. Cancelar fica na tela.
 */

const TEXTO = (maximo) => z.string().trim().max(maximo);
const SITUACOES = { ABERTA: "Aberta", EM_PRODUCAO: "Em produção", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" };
const ORDEM = TEXTO(20).min(1).describe("O número da ordem (OP-0012 ou 12)");

async function acharOrdem(referencia) {
  const numero = Number(String(referencia ?? "").trim().replace(/^OP-?/i, ""));
  if (!Number.isInteger(numero) || numero < 1) throw new ErroDeFerramenta("Informe o número da ordem (ex.: OP-0012).");
  const linha = await prisma.ordemDeProducao.findUnique({ where: { numero }, select: { id: true } });
  if (!linha) throw new ErroDeFerramenta(`Ordem OP-${String(numero).padStart(4, "0")} não encontrada.`);
  return lerOrdem(linha.id);
}

const pecas = (ordem) =>
  ordem.itens.map((item) => ({
    codigo: item.sku ?? null,
    peca: item.descricao,
    quantidade: item.quantidadeTotal,
    estoqueAtual: item.estoqueAtual,
    ...(item.estoqueAtual !== null && item.estoqueAtual < item.quantidadeTotal ? { falta: item.quantidadeTotal - item.estoqueAtual } : {}),
  }));

export async function listarOrdensDeProducao({ situacao, busca, limite = 25 }, { pode }) {
  exigir(pode, "tela.estoque.producao", "ver", "ver as ordens de produção");
  const { ordens, total } = await listarOrdens({ situacao, busca, porPagina: limite });
  return {
    total,
    ordens: ordens.map((o) => ({ ordem: o.numero, produto: `${o.produto.sku} · ${o.produto.tituloBase}`, situacao: SITUACOES[o.situacao] ?? o.situacao, planejada: o.quantidadePlanejada, produzida: o.quantidadeProduzida, criadaEm: o.criadoEm })),
  };
}

export async function criarOrdemDeProducao({ sku, quantidade, observacao, confirmo }, { pode }) {
  exigir(pode, "tela.estoque.producao", "editar", "criar ordens de produção");
  const produto = await acharProdutoPorSku(sku, { id: true, sku: true, tituloBase: true, pecasProprias: true });
  if (!produto.pecasProprias) throw new ErroDeFerramenta(`O ${produto.sku} não é produto com peças próprias: não tem ordem de produção.`);
  const resumo = { produto: `${produto.sku} · ${produto.tituloBase}`, quantidade, observacao: observacao ?? null, ondeGrava: "Cria a ordem ABERTA só no Rise; a baixa das peças é um passo seguinte (darBaixaNaOrdemDeProducao)." };
  if (!confirmo) return previa(resumo);
  const criada = exigirOk(await criarOrdem(produto.id, { quantidade, observacao }));
  const ordem = await lerOrdem(criada.id);
  return { gravado: true, ordem: ordem?.numero ?? null, ...resumo, pecas: ordem ? pecas(ordem) : [] };
}

export async function darBaixaNaOrdemDeProducao({ ordem, confirmo }, { pode }) {
  exigir(pode, "acao.producao.movimentar", "executar", "movimentar ordens de produção");
  const lida = await acharOrdem(ordem);
  if (lida.situacao !== "ABERTA") throw new ErroDeFerramenta(`A ${lida.numero} está ${SITUACOES[lida.situacao].toLowerCase()}: só uma ordem aberta recebe a baixa.`);
  const lista = pecas(lida);
  const resumo = { ordem: lida.numero, produto: `${lida.produto.sku} · ${lida.produto.tituloBase}`, quantidade: lida.quantidadePlanejada, pecasQueSaem: lista, ondeGrava: "Tira as peças do estoque no Rise e no Bling (ERP real)." };
  if (lista.some((p) => p.falta)) resumo.aviso = "Há peça com estoque menor que o necessário.";
  if (!confirmo) return previa(resumo);
  exigirOk(await darBaixa(lida.id));
  return { gravado: true, ...resumo, situacao: "Em produção" };
}

export async function concluirOrdemDeProducao({ ordem, quantidadeProduzida, confirmo }, { pode }) {
  exigir(pode, "acao.producao.movimentar", "executar", "movimentar ordens de produção");
  const lida = await acharOrdem(ordem);
  if (lida.situacao !== "EM_PRODUCAO") throw new ErroDeFerramenta(`A ${lida.numero} está ${SITUACOES[lida.situacao].toLowerCase()}: só uma ordem em produção pode ser concluída.`);
  const resumo = {
    ordem: lida.numero,
    produto: `${lida.produto.sku} · ${lida.produto.tituloBase}`,
    planejada: lida.quantidadePlanejada,
    produzida: quantidadeProduzida,
    ...(quantidadeProduzida < lida.quantidadePlanejada ? { perda: lida.quantidadePlanejada - quantidadeProduzida } : {}),
    ondeGrava: "Dá entrada do produto montado no estoque do Rise e do Bling (ERP real).",
  };
  if (!confirmo) return previa(resumo);
  exigirOk(await concluir(lida.id, quantidadeProduzida));
  return { gravado: true, ...resumo, situacao: "Concluída" };
}

export const FERRAMENTAS_DE_PRODUCAO_LEITURA = [
  {
    nome: "listarOrdensDeProducao",
    descricao: "As ordens de produção dos produtos com peças próprias (Estoque > Produção): número, produto, situação (Aberta, Em produção, Concluída, Cancelada) e quantidades. Filtra por situação e por número, código ou nome do produto.",
    esquema: z.object({
      situacao: z.enum(Object.keys(SITUACOES)).optional(),
      busca: TEXTO(120).optional(),
      limite: z.number().int().min(1).max(100).optional(),
    }),
    anotacoes: LEITURA,
    executar: listarOrdensDeProducao,
  },
];

export const FERRAMENTAS_DE_PRODUCAO_ESCRITA = [
  {
    nome: "criarOrdemDeProducao",
    descricao: "Cria uma ordem de produção ABERTA de um produto com peças próprias (só no Rise). Dois passos: sem confirmo devolve a prévia; com confirmo: true cria e devolve as peças que a baixa vai tirar.",
    esquema: z.object({ sku: TEXTO(60).min(1), quantidade: z.number().int().min(1).max(100000), observacao: TEXTO(500).optional(), confirmo: CONFIRMO }),
    anotacoes: ESCRITA,
    executar: criarOrdemDeProducao,
  },
  {
    nome: "darBaixaNaOrdemDeProducao",
    descricao: "Dá a baixa das peças de uma ordem ABERTA: tira as peças do estoque no Rise e no BLING (ERP real) e a ordem passa a Em produção. Dois passos: sem confirmo devolve as peças e o estoque de cada uma; com confirmo: true movimenta. Só com o ok da pessoa.",
    esquema: z.object({ ordem: ORDEM, confirmo: CONFIRMO }),
    anotacoes: ESCRITA_FORA,
    executar: darBaixaNaOrdemDeProducao,
  },
  {
    nome: "concluirOrdemDeProducao",
    descricao: "Conclui uma ordem Em produção com a quantidade realmente produzida (menos que a planejada = perda): dá entrada do produto montado no estoque do Rise e do BLING (ERP real). Dois passos: sem confirmo devolve a prévia; com confirmo: true conclui. Só com o ok da pessoa.",
    esquema: z.object({ ordem: ORDEM, quantidadeProduzida: z.number().int().min(0).max(100000), confirmo: CONFIRMO }),
    anotacoes: ESCRITA_FORA,
    executar: concluirOrdemDeProducao,
  },
];
