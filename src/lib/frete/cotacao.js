import { lerDadosDaEmpresa } from "@/lib/compras/empresa";
import { prisma } from "@/lib/db";

import { listarCaixas } from "./caixas";
import { lerConfigDeFrete } from "./configuracao";
import { MENSAGENS } from "./provedores/erro";
import { ErroDoProvedor, obterProvedor, PROVEDOR_PADRAO } from "./provedores/registro";
import { itensIncompletos, lerDecimal, pesoDoPacote, separarServicos, sugerirCaixa } from "./regras";

/**
 * A cotacao que as telas usam (Proposta, Pedido, Ferramentas): confere o que foi digitado, completa com a caixa, a origem
 * (Dados da empresa) e o acrescimo de embalagem, pergunta ao provedor e separa o que atende do que nao atende. Nunca
 * lanca: a tela recebe { ok: false, erro } e continua aberta. Nao grava nada.
 */

const MEDIDAS = ["comprimentoCm", "larguraCm", "alturaCm"];

/** @returns {{ ok: true, pedido } | { ok: false, erros: Record<string, string> }} */
export function validarPedidoDeCotacao(entrada) {
  const erros = {};
  const cepDestino = String(entrada?.cepDestino ?? "").replace(/\D/g, "");
  if (cepDestino.length !== 8) erros.cepDestino = "CEP com 8 dígitos.";

  const pesoKg = lerDecimal(entrada?.pesoKg);
  if (!pesoKg || pesoKg <= 0 || pesoKg > 30) erros.pesoKg = "Informe o peso em kg (até 30).";

  const valorDeclarado = lerDecimal(entrada?.valorDeclarado);
  if (valorDeclarado === null || valorDeclarado > 1000000) erros.valorDeclarado = "Informe o valor dos produtos.";

  const caixaId = typeof entrada?.caixaId === "string" && entrada.caixaId ? entrada.caixaId : null;
  const medidas = {};
  for (const campo of MEDIDAS) {
    if (caixaId) medidas[campo] = null;
    else {
      const valor = lerDecimal(entrada?.[campo]);
      if (!valor || valor <= 0 || valor > 200) erros[campo] = "Medida em cm.";
      medidas[campo] = valor;
    }
  }

  if (Object.keys(erros).length) return { ok: false, erros };
  return { ok: true, pedido: { cepDestino, pesoKg, valorDeclarado, ...medidas, caixaId } };
}

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const comoItem = (produto, quantidade) => ({
  pesoKg: numero(produto?.pesoKg),
  alturaCm: numero(produto?.alturaCm),
  larguraCm: numero(produto?.larguraCm),
  comprimentoCm: numero(produto?.comprimentoCm),
  quantidade,
});
const completo = (produto) => itensIncompletos([comoItem(produto, 1)]) === 0;

/**
 * A caixa e o peso que o Rise sugere para os itens. Kit: o peso e as medidas do proprio kit; sem eles, as pecas (cada
 * uma vezes a quantidade dela no kit). Item sem peso ou medida conta em `incompletos` e a sugestao nao sai.
 * @param {{ produtoId: string, quantidade: number, valorUnitario: number }[]} itens
 */
export async function pacoteSugerido(itens) {
  const lista = itens ?? [];
  const produtos = await prisma.produto.findMany({
    where: { id: { in: lista.map((item) => item.produtoId).filter(Boolean) } },
    select: {
      id: true,
      tipo: true,
      pesoKg: true,
      alturaCm: true,
      larguraCm: true,
      comprimentoCm: true,
      componentes: { select: { quantidade: true, componente: { select: { pesoKg: true, alturaCm: true, larguraCm: true, comprimentoCm: true } } } },
    },
  });
  const porId = new Map(produtos.map((produto) => [produto.id, produto]));

  const paraPacote = lista.flatMap((item) => {
    const quantidade = Number(item.quantidade) > 0 ? Number(item.quantidade) : 1;
    const produto = porId.get(item.produtoId);
    if (produto?.tipo === "COMPOSICAO" && !completo(produto) && produto.componentes.length) {
      return produto.componentes.map((peca) => comoItem(peca.componente, peca.quantidade * quantidade));
    }
    return [comoItem(produto, quantidade)];
  });

  const valorDeclarado = Math.round(lista.reduce((soma, item) => soma + Number(item.valorUnitario ?? 0) * (Number(item.quantidade) || 1), 0) * 100) / 100;
  const incompletos = itensIncompletos(paraPacote);
  const [caixas, config] = await Promise.all([listarCaixas({ soAtivas: true }), lerConfigDeFrete()]);
  const { caixa, motivo } = sugerirCaixa({ itens: paraPacote, caixas });
  const pesoKg = pesoDoPacote({ itens: paraPacote, caixa, percentualDePesoExtra: config.percentualDePesoExtra });

  return { caixaId: caixa?.id ?? null, motivo, pesoKg, incompletos, valorDeclarado };
}

/**
 * @returns {Promise<{ ok: true, origemCep, cotadoEm, pacote, atendem, recusados } | { ok: false, erros?, erro?, codigo? }>}
 */
export async function cotarFrete(entrada) {
  try {
    const validado = validarPedidoDeCotacao(entrada);
    if (!validado.ok) return { ok: false, erros: validado.erros };
    const pedido = validado.pedido;

    let caixa = null;
    if (pedido.caixaId) {
      caixa = (await listarCaixas()).find((item) => item.id === pedido.caixaId) ?? null;
      if (!caixa) return { ok: false, erros: { caixaId: "Caixa não encontrada." } };
    }

    const empresa = await lerDadosDaEmpresa();
    const origemCep = String(empresa?.cep ?? "").replace(/\D/g, "");
    if (origemCep.length !== 8) return { ok: false, erro: "Cadastre o CEP em Configurações › Dados da empresa." };

    const pacote = {
      cepDestino: pedido.cepDestino,
      caixaId: caixa?.id ?? null,
      caixaNome: caixa?.nome ?? null,
      pesoKg: pedido.pesoKg,
      comprimentoCm: caixa?.comprimentoCm ?? pedido.comprimentoCm,
      larguraCm: caixa?.larguraCm ?? pedido.larguraCm,
      alturaCm: caixa?.alturaCm ?? pedido.alturaCm,
      valorDeclarado: pedido.valorDeclarado,
    };

    const config = await lerConfigDeFrete();
    const servicos = await obterProvedor(PROVEDOR_PADRAO).cotar({
      origem: { cep: origemCep },
      destino: { cep: pacote.cepDestino },
      pacote,
      valorDeclarado: pacote.valorDeclarado,
    });
    const { atendem, recusados } = separarServicos(servicos, config.acrescimoDeEmbalagem);
    return { ok: true, origemCep, cotadoEm: new Date().toISOString(), pacote, atendem, recusados };
  } catch (erro) {
    if (erro instanceof ErroDoProvedor) return { ok: false, codigo: erro.codigo, erro: erro.message };
    console.error("[frete] cotacao:", erro?.message ?? erro);
    return { ok: false, codigo: "FORA_DO_AR", erro: MENSAGENS.FORA_DO_AR };
  }
}
