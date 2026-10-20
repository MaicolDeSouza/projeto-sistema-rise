import { z } from "zod";

import { listarProdutos } from "@/lib/coleta/banco";
import { RESTRITO } from "@/lib/riseAi/busca";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

/**
 * A ferramenta `buscarNoMercado` (pedido do dono em 20/10/2026, depois do primeiro teste real: o R13-507 nao estava no
 * catalogo e o MCP nao enxergava os 60 anuncios dele nos fornecedores e concorrentes). Pesquisa os produtos COLETADOS
 * (Scraper), pela mesma busca da tela (`listarProdutos`: todas as palavras, como trecho, com o indice de trigramas).
 *
 * So no MCP, fora do catalogo do Rise AI: o perfil do cliente (WhatsApp) nunca a enxerga. Fornecedores so com
 * `dado.custo` (o preco deles e custo) e concorrentes so com `dado.concorrentes`; sem os dois, recusa sem ler o banco.
 *
 * Precos, pela regra do sistema (preco NORMAL, nunca o promocional no lugar dele): o do concorrente e o normal, e o
 * promocional (pix, campanha) vai so como informacao; o do fornecedor e o que se paga, o com impostos quando a lista o
 * traz (a Fortek cobra o IPI por fora), senao o normal. A lista vem do menor para o maior por esse preco.
 */

const LIMITE_PADRAO = 20;
// A busca pede mais linhas que o limite: o filtro de estoque e a ordem pelo preco com impostos rodam aqui.
const FOLGA_DA_BUSCA = 3;

export const ESQUEMA_MERCADO = z.object({
  termos: z.string().trim().min(1).max(200).describe("Código, modelo ou palavras do produto (ex.: 'r13-507', 'sensor hc-sr04')"),
  tipo: z.enum(["ambos", "fornecedor", "concorrente"]).default("ambos").describe("Onde procurar"),
  apenasComEstoque: z.boolean().optional().describe("Só o que a fonte diz ter em estoque"),
  limite: z.number().int().min(1).max(30).optional().describe("Quantos de cada lado (1 a 30; padrão 20)"),
});

const DESCRICAO = [
  "Procura um produto nos FORNECEDORES (preço de custo) e nos CONCORRENTES (preço de venda deles) que o Rise coleta, mesmo que o produto não esteja no catálogo da loja.",
  "Todas as palavras são exigidas e comparadas como trecho, sem acento nem maiúsculas: pesquise pelo código ou modelo e use o começo das palavras de variante ('vermelh' acha vermelho e vermelha; o mesmo código pode vir escrito 'r13-507' ou 'r 13-507', então tente as duas se uma não achar).",
  "Cada lado vem do menor para o maior preço: no fornecedor, precoQueSePaga (com impostos quando a lista traz); no concorrente, o preço normal (precoPromocional é só informação, como o preço no pix).",
  "Diga sempre de qual fonte é cada preço e há quanto tempo foi visto (vistoEm). '[restrito]' = este login não pode ver aquele lado.",
].join(" ");

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const emTexto = (data) => (data instanceof Date ? data.toISOString() : (data ?? null));
const semEstoque = (linha) => linha.stock.status === "OUT_OF_STOCK" || linha.stock.quantity === 0;
const porPreco = (campo) => (a, b) => (a[campo] ?? Infinity) - (b[campo] ?? Infinity);

function paraFornecedor(linha) {
  const preco = numero(linha.prices.normal);
  const comImpostos = numero(linha.prices.comImpostos);
  return {
    fonte: linha.fonte.nome,
    codigo: linha.code ?? null,
    nome: linha.name ?? null,
    marca: linha.brand ?? null,
    precoQueSePaga: comImpostos ?? preco ?? numero(linha.prices.promotional),
    preco,
    precoComImpostos: comImpostos,
    impostos: linha.taxes ?? [],
    precoReserva: numero(linha.prices.reserva),
    estoque: { status: linha.stock.status ?? null, quantidade: linha.stock.quantity ?? null, aChegar: linha.stock.aChegar ?? null },
    url: linha.url ?? null,
    vistoEm: emTexto(linha.coletadoEm),
    naoVistoDesde: emTexto(linha.naoVistoDesde),
  };
}

function paraConcorrente(linha) {
  const normal = numero(linha.prices.normal);
  const promocional = numero(linha.prices.promotional);
  return {
    fonte: linha.fonte.nome,
    codigo: linha.code ?? null,
    nome: linha.name ?? null,
    marca: linha.brand ?? null,
    // Na falta do normal, o promocional (`normal ?? promocional`); quando os dois existem, o promocional so informa.
    preco: normal ?? promocional,
    precoPromocional: normal === null ? null : promocional,
    estoque: { status: linha.stock.status ?? null, quantidade: linha.stock.quantity ?? null },
    url: linha.url ?? null,
    vistoEm: emTexto(linha.coletadoEm),
    naoVistoDesde: emTexto(linha.naoVistoDesde),
  };
}

async function buscarLado(tipo, { termos, apenasComEstoque, limite }) {
  const { linhas } = await listarProdutos({ tipo, busca: termos, ordem: "menor", porPagina: Math.min(100, limite * FOLGA_DA_BUSCA) });
  const filtradas = apenasComEstoque ? linhas.filter((linha) => !semEstoque(linha)) : linhas;
  return tipo === "FORNECEDOR"
    ? filtradas.map(paraFornecedor).sort(porPreco("precoQueSePaga")).slice(0, limite)
    : filtradas.map(paraConcorrente).sort(porPreco("preco")).slice(0, limite);
}

const menorDe = (lista, campo) => lista.find((linha) => linha[campo] !== null) ?? null;

export async function buscarNoMercado({ termos, tipo = "ambos", apenasComEstoque = false, limite = LIMITE_PADRAO }, { pode }) {
  const veFornecedores = pode("dado.custo", "ver");
  const veConcorrentes = pode("dado.concorrentes", "ver");
  if (!veFornecedores && !veConcorrentes) throw new ErroDeFerramenta("Este login não pode ver fornecedores nem concorrentes.");

  const opcoes = { termos, apenasComEstoque, limite };
  const resultado = {};
  if (tipo !== "concorrente") {
    if (veFornecedores) {
      resultado.fornecedores = await buscarLado("FORNECEDOR", opcoes);
      resultado.menorFornecedor = menorDe(resultado.fornecedores, "precoQueSePaga");
    } else {
      resultado.fornecedores = RESTRITO;
      resultado.menorFornecedor = RESTRITO;
    }
  }
  if (tipo !== "fornecedor") {
    if (veConcorrentes) {
      resultado.concorrentes = await buscarLado("CONCORRENTE", opcoes);
      resultado.menorConcorrente = menorDe(resultado.concorrentes, "preco");
    } else {
      resultado.concorrentes = RESTRITO;
      resultado.menorConcorrente = RESTRITO;
    }
  }
  return resultado;
}

export const FERRAMENTA_MERCADO = {
  nome: "buscarNoMercado",
  descricao: DESCRICAO,
  esquema: ESQUEMA_MERCADO,
  executar: (argumentos, contexto) => buscarNoMercado(argumentos, contexto),
};
