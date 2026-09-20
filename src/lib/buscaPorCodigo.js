import { prisma } from "@/lib/db";
import { imagensDaOrigem } from "@/lib/imagensImportadas";
import { normalizar } from "@/lib/texto";

/**
 * Procura um codigo no banco inteiro para preencher o cadastro de produto novo:
 * nos produtos da Rise e nos produtos coletados de fornecedores e concorrentes.
 *
 * Devolve TODOS os casamentos, nao o primeiro. O mesmo codigo pode estar num
 * fornecedor e num concorrente, com nome e descricao diferentes — quem escolhe de
 * onde copiar e o operador.
 *
 * Casa por codigo, EAN ou MPN, sempre por igualdade (sem caixa). "Contem"
 * devolveria o catalogo inteiro para "100".
 */

const ORDEM = { RISE: 0, FORNECEDOR: 1, CONCORRENTE: 2, OUTRO: 3 };
const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

/// Campos do formulario que valem copiar de outro produto da Rise. Ficam de fora
/// a localizacao (e onde AQUELA peca esta) e o link da Loja Integrada (e a pagina
/// DAQUELE produto). O SKU vem a parte, sempre, como o codigo buscado.
const CAMPOS_RISE = [
  "tituloBase", "descricaoBase", "marca", "modelo", "ean", "unidade", "ativo",
  "numeroHomologacao", "videoUrl", "garantiaMeses", "estoqueMinimo", "estoqueMaximo",
  "origem", "ncm", "cest", "spedTipoItem",
];
const CAMPOS_DECIMAIS_RISE = [
  "precoVenda", "pesoKg", "alturaCm", "larguraCm", "comprimentoCm", "percentualTributos",
];

export async function buscarProdutoPorCodigo(codigoBruto) {
  const codigo = String(codigoBruto ?? "").trim();
  if (!codigo) return [];

  const igual = { equals: codigo, mode: "insensitive" };

  const [daRise, coletados] = await Promise.all([
    prisma.produto.findMany({
      where: { OR: [{ sku: igual }, { ean: igual }] },
      take: 10,
    }),
    prisma.produtoColetado.findMany({
      where: { OR: [{ codigo: igual }, { ean: igual }, { mpn: igual }] },
      include: { fonte: { select: { nome: true, tipo: true } } },
      orderBy: { vistoEm: "desc" },
      take: 30,
    }),
  ]);

  /*
    O CODIGO DO PRODUTO ACHADO VAI PARA O SKU, SEMPRE — pedido do dono em
    16/09/2026, inclusive por cima do que ja estava no campo. Quem quer outro
    codigo usa a varinha (25xxxx). Se o codigo ja existir na Rise ou nao servir de
    nome de pasta, o Salvar recusa e diz o motivo: melhor que esconder o codigo.

    Marca e modelo em MAIUSCULAS, como o dono pediu para o cadastro inteiro.
  */
  const maiusculas = (valor) => (valor ? String(valor).toLocaleUpperCase("pt-BR") : valor);

  const resultados = [
    ...daRise.map((produto) => ({
      id: `rise:${produto.id}`,
      tipo: "RISE",
      fonte: "Rise",
      codigo: produto.sku,
      nome: produto.tituloBase,
      preco: numero(produto.precoVenda),
      campos: {
        ...Object.fromEntries(CAMPOS_RISE.map((campo) => [campo, produto[campo]])),
        ...Object.fromEntries(
          CAMPOS_DECIMAIS_RISE.map((campo) => [campo, numero(produto[campo])]),
        ),
        marca: maiusculas(produto.marca),
        modelo: maiusculas(produto.modelo),
        sku: produto.sku,
      },
    })),
    ...coletados.map((item) => {
      // Loja que se declara a propria marca (a Casa da Robotica poe "Casa da
      // Robotica" em `brand`) nao diz nada sobre o fabricante.
      const marcaEhALoja =
        item.marca && normalizar(item.fonte.nome).startsWith(normalizar(item.marca));

      // Sempre o preco NORMAL, e o promocional so na falta dele (regra do dono
      // em 19/09/2026).
      const preco = numero(item.precoNormal ?? item.precoPromocional);

      return {
        id: `coletado:${item.id}`,
        tipo: item.fonte.tipo,
        fonte: item.fonte.nome,
        codigo: item.codigo,
        nome: item.nome,
        preco,
        campos: {
          // Clonar um CONCORRENTE traz o preco dele para o Preco venda, como ponto
          // de partida (pedido do dono em 19/09/2026; antes so aparecia na lista).
          // Preco de FORNECEDOR continua de fora: e custo, e vender por ele e
          // vender sem margem.
          ...(item.fonte.tipo === "CONCORRENTE" && preco !== null
            ? { precoVenda: preco }
            : {}),
          tituloBase: item.nome,
          descricaoBase: item.descricao,
          marca: marcaEhALoja ? null : maiusculas(item.marca),
          modelo: maiusculas(item.modelo),
          ean: item.ean,
          ncm: item.ncm,
          sku: item.codigo && item.codigo !== "N/A" ? item.codigo : null,
        },
      };
    }),
  ];

  // As imagens vem junto: a previa aparece no cadastro, e a copia acontece no
  // Salvar (o produto novo ainda nao tem pasta). O `id` do resultado ja e a
  // referencia de origem que o formulario devolve.
  for (const resultado of resultados) {
    const { previas } = await imagensDaOrigem(resultado.id);
    resultado.imagens = previas;
  }

  return resultados.sort((a, b) => (ORDEM[a.tipo] ?? 9) - (ORDEM[b.tipo] ?? 9));
}
