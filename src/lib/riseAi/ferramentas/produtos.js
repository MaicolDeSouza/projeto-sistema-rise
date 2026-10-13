import { z } from "zod";

import { prisma } from "@/lib/db";
import { linhasDeEspecificacao } from "@/lib/medidas";
import { normalizar } from "@/lib/texto";
import { RESTRITO, buscarProdutosNoCatalogo, buscarProdutosParecidos, cartaoDoProduto, faixaDeEstoque } from "../busca";
import { ErroDeFerramenta } from "./erro";

/**
 * As ferramentas de produto do Rise AI (spec §5.5). SÓ LEITURA: o modelo nunca escreve no catálogo nem alcança o
 * banco — só estas funções, com argumentos validados pelo zod e o perfil conferido antes (`executarFerramenta`).
 * Resultado sempre compacto: nunca a descrição inteira de 20 produtos.
 *
 * `perfis: ["admin"]` nesta entrega: o assistente público (Entrega 4) ganha o dele, com os campos filtrados.
 */

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

const sku = z.string().trim().min(1).max(40).describe("Código (SKU) do produto, como no cadastro");
const listaDeSkus = (minimo, maximo) => z.array(sku).min(minimo).max(maximo);

/** As permissões de Acessos de quem pergunta; quem chama sem elas (sugestões, testes) vê como antes. */
const podeDe = (contexto) => contexto?.pode ?? (() => true);

/** A quantidade, ou só a faixa para quem não tem `dado.estoqueExato`. */
const estoqueVisivel = (quantidade, contexto) => (podeDe(contexto)("dado.estoqueExato", "ver") ? quantidade : faixaDeEstoque(quantidade));

/** O cartão que o modelo lê: sem custo nem localização (o texto do cliente não pode citá-los). */
function cartaoParaOModelo(produto, contexto) {
  const { custo, localizacao, ...resto } = cartaoDoProduto(produto, { perfil: contexto.perfil, pode: podeDe(contexto) });
  void custo;
  void localizacao;
  return resto;
}

/** Os produtos pelos códigos, sem diferenciar caixa, mantendo a ordem pedida (`null` onde não existe). */
async function produtosPorCodigo(skus, extra = {}) {
  const linhas = await prisma.produto.findMany({
    where: { OR: skus.map((codigo) => ({ sku: { equals: codigo, mode: "insensitive" } })) },
    ...extra,
  });
  const porCodigo = new Map(linhas.map((linha) => [linha.sku.toLowerCase(), linha]));
  return skus.map((codigo) => porCodigo.get(codigo.toLowerCase()) ?? null);
}

const semProduto = (codigo) => new ErroDeFerramenta(`Não existe produto com o código ${codigo}.`);

export const FERRAMENTAS_DE_PRODUTO = [
  {
    nome: "buscarProdutos",
    descricao:
      "Procura produtos no catálogo da loja por palavras-chave, código (SKU), EAN ou modelo. Use 2 a 4 palavras-chave " +
      "(ex.: 'arduino uno', 'sensor indutivo 24v'). Se não achar nada, tente de novo com MENOS palavras ou outro nome. " +
      "Devolve até 10 produtos com preço, estoque, ficha resumida e link da loja. Lista vazia = não há no catálogo.",
    perfis: ["admin"],
    esquema: z.object({
      termos: z.string().trim().min(1).max(200).describe("Palavras-chave do produto, código ou EAN"),
      apenasComEstoque: z.boolean().optional().describe("Só produtos com estoque"),
      precoMaximo: z.coerce.number().positive().optional().describe("Preço de venda máximo, em reais"),
      limite: z.coerce.number().int().min(1).max(10).optional().describe("Quantos produtos devolver (1 a 10)"),
    }),
    async executar({ termos, apenasComEstoque, precoMaximo, limite }, contexto) {
      const { produtos } = await buscarProdutosNoCatalogo(termos, { apenasComEstoque, precoMaximo, limite, perfil: contexto.perfil });
      return produtos.map((produto) => cartaoParaOModelo(produto, contexto));
    },
  },
  {
    nome: "consultarProduto",
    descricao:
      "Ficha completa de UM produto pelo código (SKU): descrição, características técnicas, custo, fornecedores, " +
      "concorrentes, fotos, documentos e, se for kit, as peças. Use para conferir detalhes antes de afirmar algo.",
    perfis: ["admin"],
    esquema: z.object({ sku }),
    async executar({ sku: codigo }, contexto) {
      const [produto] = await produtosPorCodigo([codigo], {
        include: {
          fornecedores: { include: { fornecedor: { select: { nome: true } } } },
          concorrentes: {
            include: {
              produtoColetado: { select: { nome: true, precoNormal: true, precoPromocional: true, fonte: { select: { nome: true } } } },
            },
          },
          componentes: { include: { componente: { select: { sku: true, tituloBase: true } } }, orderBy: { ordem: "asc" } },
          arquivos: { select: { tipo: true, papel: true, nomeOriginal: true } },
        },
      });
      if (!produto) throw semProduto(codigo);

      const resultado = {
        ...cartaoDoProduto(produto, { perfil: contexto.perfil, pode: podeDe(contexto) }),
        descricao: (produto.descricaoBase ?? "").slice(0, 3000),
        ficha: linhasDeEspecificacao(produto.descricaoBase),
        fotos: produto.arquivos.filter((arquivo) => arquivo.tipo === "IMAGEM" && arquivo.papel === "FOTO").length,
        documentos: produto.arquivos.filter((arquivo) => arquivo.tipo !== "IMAGEM" && arquivo.nomeOriginal).map((arquivo) => arquivo.nomeOriginal),
        kit: produto.componentes.map((peca) => ({ sku: peca.componente.sku, nome: peca.componente.tituloBase, quantidade: peca.quantidade })),
      };
      if (contexto.perfil === "admin") {
        const pode = podeDe(contexto);
        resultado.fornecedores = !pode("dado.custo", "ver") ? RESTRITO : produto.fornecedores.map((vinculo) => ({
          nome: vinculo.fornecedor.nome,
          custo: numero(vinculo.precoCusto),
          codigo: vinculo.codigo ?? null,
          padrao: vinculo.padrao,
        }));
        // Preço NORMAL do concorrente (regra do sistema); o promocional só na falta dele.
        resultado.concorrentes = !pode("dado.concorrentes", "ver") ? RESTRITO : produto.concorrentes.map((vinculo) => ({
          fonte: vinculo.produtoColetado?.fonte.nome ?? vinculo.fonteManual ?? null,
          nome: vinculo.produtoColetado?.nome ?? vinculo.nomeManual ?? null,
          preco: numero(vinculo.produtoColetado ? (vinculo.produtoColetado.precoNormal ?? vinculo.produtoColetado.precoPromocional) : vinculo.precoManual),
        }));
      }
      return resultado;
    },
  },
  {
    nome: "consultarEstoque",
    descricao:
      "Estoque de até 20 produtos pelos códigos (SKU), com a hora em que o saldo foi lido do Bling. " +
      "Sempre diga ao usuário há quanto tempo o estoque foi lido quando a resposta depender dele.",
    perfis: ["admin"],
    esquema: z.object({ skus: listaDeSkus(1, 20) }),
    async executar({ skus }, contexto) {
      const produtos = await produtosPorCodigo(skus);
      const exato = podeDe(contexto)("dado.estoqueExato", "ver");
      return skus.map((codigo, indice) => {
        const produto = produtos[indice];
        if (!produto) return { sku: codigo, encontrado: false };
        return {
          sku: produto.sku,
          estoque: estoqueVisivel(produto.estoque, contexto),
          estoqueLidoEm: produto.blingSaldoLidoEm ? new Date(produto.blingSaldoLidoEm).toISOString() : null,
          blingSaldo: exato ? (produto.blingSaldo ?? null) : RESTRITO,
        };
      });
    },
  },
  {
    nome: "consultarPreco",
    descricao: "Preço de venda de até 20 produtos pelos códigos (SKU).",
    perfis: ["admin"],
    esquema: z.object({ skus: listaDeSkus(1, 20) }),
    async executar({ skus }) {
      const produtos = await produtosPorCodigo(skus);
      return skus.map((codigo, indice) =>
        produtos[indice] ? { sku: produtos[indice].sku, precoVenda: numero(produtos[indice].precoVenda) } : { sku: codigo, encontrado: false },
      );
    },
  },
  {
    nome: "compararProdutos",
    descricao:
      "Compara de 2 a 5 produtos lado a lado, alinhando as características técnicas pelo nome. " +
      "Característica que um produto não informa vem como null: não invente o valor.",
    perfis: ["admin"],
    esquema: z.object({ skus: listaDeSkus(2, 5) }),
    async executar({ skus }, contexto) {
      const produtos = await produtosPorCodigo(skus);
      produtos.forEach((produto, indice) => {
        if (!produto) throw semProduto(skus[indice]);
      });

      // O nome da característica é a chave (sem caixa nem acento); vale a grafia em que apareceu primeiro.
      const caracteristicas = new Map();
      for (const produto of produtos) {
        for (const { nome, valor } of linhasDeEspecificacao(produto.descricaoBase)) {
          const chave = normalizar(nome);
          if (!caracteristicas.has(chave)) caracteristicas.set(chave, { nome, valores: Object.fromEntries(produtos.map((outro) => [outro.sku, null])) });
          const linha = caracteristicas.get(chave);
          if (linha.valores[produto.sku] === null) linha.valores[produto.sku] = valor;
        }
      }
      return {
        produtos: produtos.map((produto) => ({ sku: produto.sku, nome: produto.tituloBase, preco: numero(produto.precoVenda), estoque: estoqueVisivel(produto.estoque, contexto) })),
        caracteristicas: [...caracteristicas.values()],
      };
    },
  },
  {
    nome: "buscarProdutosSimilares",
    descricao:
      "Produtos parecidos com um produto (pelo código SKU): serve para achar substituto quando o produto pedido está " +
      "sem estoque. Confira a ficha antes de afirmar que o substituto serve.",
    perfis: ["admin"],
    esquema: z.object({ sku }),
    async executar({ sku: codigo }, contexto) {
      const [produto] = await produtosPorCodigo([codigo]);
      if (!produto) throw semProduto(codigo);
      const parecidos = await buscarProdutosParecidos(produto, { perfil: contexto.perfil });
      return parecidos.map((parecido) => cartaoParaOModelo(parecido, contexto));
    },
  },
];
