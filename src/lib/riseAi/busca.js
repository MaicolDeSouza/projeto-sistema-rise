import { prisma } from "@/lib/db";
import { idsDaBuscaDeProdutos } from "@/lib/buscaAmpla";
import { linhasDeEspecificacao } from "@/lib/medidas";
import { PALAVRAS_VAZIAS, indiceDePalavras, normalizar, notasDeRelevancia, palavrasDoTermo } from "@/lib/texto";

/**
 * Busca de produtos do Rise para o assistente. NÃO manda o catálogo ao modelo: acha poucos candidatos pelo banco e o
 * modelo só lê esses (spec §5.6). A ordem, nesta sequência, parando no primeiro passo que acha algo:
 *
 *   1. CÓDIGO exato (SKU, EAN ou modelo), quando o termo é uma palavra só;
 *   2. PALAVRAS no nome, código, marca, modelo e EAN — todas, em qualquer ordem (o índice de trigramas da lista);
 *   3. busca AMPLA: as mesmas palavras também na descrição, onde o cadastro guarda a ficha técnica.
 *
 * Cada passo para na lista vazia seguinte; o que achou é ordenado por relevância (a conta da lupa, `notasDeRelevancia`)
 * e, no empate, por quem tem estoque — o assistente prefere sugerir o que dá para vender. Sem embeddings: ver spec §5.6.
 */

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

const LIMITE_DA_FICHA = 600;

/** A mesma regra da lupa: com até duas palavras todas contam; com mais, metade do peso já parece com o produto. */
const NOTA_MINIMA = 0.5;

/**
 * "Nome: valor; Nome: valor", lido das linhas "- Nome: valor;" da descrição (é onde o cadastro guarda a ficha).
 * Corta em item inteiro, nunca no meio de um valor. Descrição sem ficha devolve "".
 */
export function fichaResumo(descricaoBase) {
  const linhas = linhasDeEspecificacao(descricaoBase).map(({ nome, valor }) => `${nome}: ${valor}`);
  let texto = "";
  for (const linha of linhas) {
    const proximo = texto ? `${texto}; ${linha}` : linha;
    if (proximo.length > LIMITE_DA_FICHA) break;
    texto = proximo;
  }
  return texto || (linhas[0] ?? "").slice(0, LIMITE_DA_FICHA);
}

/** O marcador de um campo que a pessoa não pode ver (Acessos): o modelo sabe dizer "isso eu não posso mostrar". */
export const RESTRITO = "[restrito]";

/** O estoque sem a quantidade, para quem não tem `dado.estoqueExato` (e, na Entrega B, para o cliente). */
export function faixaDeEstoque(quantidade) {
  const n = Number(quantidade);
  if (!Number.isFinite(n) || n <= 0) return "em falta";
  return n <= 3 ? "poucas unidades" : "disponível";
}

/**
 * O produto como o assistente e a tela o veem. Preço, estoque (com a hora em que o saldo foi lido do Bling), se está
 * na loja e os links. O PERFIL decide o resto: só o administrador recebe custo, localização e o link interno — a
 * autorização é daqui, nunca do prompt. Dentro do perfil admin, `pode` (as permissões de Acessos de quem pergunta)
 * restringe os dados sensíveis: sem custo ou localização, o campo vem `RESTRITO`; sem estoque exato, só a faixa.
 */
export function cartaoDoProduto(produto, { perfil = "admin", pode = () => true } = {}) {
  const cartao = {
    sku: produto.sku,
    id: produto.id,
    nome: produto.tituloBase,
    marca: produto.marca ?? null,
    modelo: produto.modelo ?? null,
    preco: numero(produto.precoVenda),
    estoque: pode("dado.estoqueExato", "ver") ? produto.estoque : faixaDeEstoque(produto.estoque),
    // Texto (ISO), não Date: o cartão vai para o JSON da mensagem e para a tela.
    estoqueLidoEm: produto.blingSaldoLidoEm ? new Date(produto.blingSaldoLidoEm).toISOString() : null,
    temNaLoja: Boolean(produto.urlLojaIntegrada),
    urlLoja: produto.urlLojaIntegrada || null,
    fichaResumo: fichaResumo(produto.descricaoBase),
    tipo: produto.tipo,
  };
  if (perfil === "admin") {
    cartao.urlRise = `/produtos/${produto.id}`;
    // O custo do cadastro e, na falta dele, o do rascunho do Bling (de onde vêm os produtos importados).
    cartao.custo = pode("dado.custo", "ver") ? (numero(produto.custo) ?? numero(produto.fornecedorRascunho?.precoCusto)) : RESTRITO;
    cartao.localizacao = pode("dado.localizacao", "ver") ? (produto.localizacao ?? null) : RESTRITO;
  }
  return cartao;
}

function filtros({ apenasComEstoque, precoMaximo, perfil }) {
  const where = { ativo: true };
  if (apenasComEstoque) where.estoque = { gt: 0 };
  // Produto sem preço nunca passa por "até R$ X": null não é menor que nada.
  if (precoMaximo !== null && precoMaximo !== undefined) where.precoVenda = { lte: precoMaximo };
  // O assistente público só alcança o que está publicado na Loja Integrada.
  if (perfil === "publico") where.AND = [{ urlLojaIntegrada: { not: null } }, { urlLojaIntegrada: { not: "" } }];
  return where;
}

const textoDoProduto = (produto) => normalizar([produto.tituloBase, produto.marca, produto.modelo, produto.sku].filter(Boolean).join(" "));

/** Mais relevante primeiro; no empate, quem tem estoque; depois o título mais curto (mais específico) e o código. */
function ordenar(produtos, termo) {
  const palavras = palavrasDoTermo(termo);
  const { notas } = notasDeRelevancia(palavras, produtos.map((produto) => indiceDePalavras(textoDoProduto(produto))));
  return produtos
    .map((produto, indice) => ({ produto, nota: notas[indice] }))
    .sort(
      (a, b) =>
        b.nota - a.nota ||
        Number(b.produto.estoque > 0) - Number(a.produto.estoque > 0) ||
        a.produto.tituloBase.length - b.produto.tituloBase.length ||
        a.produto.sku.localeCompare(b.produto.sku),
    )
    .map(({ produto }) => produto);
}

/** "placa para arduino com cabo" -> "placa arduino cabo": palavra vazia exigida no título não acharia nada. */
function semPalavrasVazias(termos) {
  const uteis = normalizar(termos)
    .split(/\s+/)
    .filter((palavra) => palavra && !PALAVRAS_VAZIAS.has(palavra));
  return uteis.length ? uteis.join(" ") : termos;
}

/**
 * @param {string} termos
 * @param {{ apenasComEstoque?: boolean, precoMaximo?: number | null, limite?: number, perfil?: "admin" | "publico" }} opcoes
 * @returns {Promise<{ produtos: any[], origem: "codigo" | "palavras" | "ampla" | "nenhuma" }>}
 */
export async function buscarProdutosNoCatalogo(termos, { apenasComEstoque = false, precoMaximo = null, limite = 10, perfil = "admin" } = {}) {
  const texto = String(termos ?? "").trim();
  if (!texto) return { produtos: [], origem: "nenhuma" };
  const where = filtros({ apenasComEstoque, precoMaximo, perfil });

  // 1. Uma palavra só pode ser um código: SKU, EAN ou modelo, por igualdade (sem caixa).
  if (!/\s/.test(texto)) {
    const igual = { equals: texto, mode: "insensitive" };
    const exatos = await prisma.produto.findMany({ where: { ...where, OR: [{ sku: igual }, { ean: igual }, { modelo: igual }] }, take: 50 });
    if (exatos.length) return { produtos: ordenar(exatos, texto).slice(0, limite), origem: "codigo" };
  }

  // 2 e 3. As palavras úteis no nome e no código; depois, também na descrição.
  const uteis = semPalavrasVazias(texto);
  for (const ampla of [false, true]) {
    const ids = await idsDaBuscaDeProdutos(uteis, { ampla });
    if (ids === null) break;
    if (ids.length === 0) continue;
    const produtos = await prisma.produto.findMany({ where: { ...where, id: { in: ids } } });
    if (produtos.length) return { produtos: ordenar(produtos, uteis).slice(0, limite), origem: ampla ? "ampla" : "palavras" };
  }
  return { produtos: [], origem: "nenhuma" };
}

/**
 * Produtos parecidos com um (a mesma lógica da lupa, sobre o catálogo ativo): o que tem pelo menos metade do peso das
 * palavras do título, sem o próprio. É a busca de substituto — o Nano quando o Uno acaba, por exemplo.
 */
export async function buscarProdutosParecidos(produto, { limite = 10, perfil = "admin" } = {}) {
  const palavras = palavrasDoTermo([produto.tituloBase, produto.marca, produto.modelo].filter(Boolean).join(" "));
  if (palavras.length === 0) return [];

  const candidatos = await prisma.produto.findMany({
    where: { ...filtros({ perfil }), id: { not: produto.id } },
    select: { id: true, sku: true, tituloBase: true, marca: true, modelo: true, estoque: true },
  });
  const { notas } = notasDeRelevancia(palavras, candidatos.map((candidato) => indiceDePalavras(textoDoProduto(candidato))));
  const minima = palavras.length <= 2 ? 1 : NOTA_MINIMA;

  const escolhidos = candidatos
    .map((candidato, indice) => ({ candidato, nota: notas[indice] }))
    .filter(({ nota }) => nota >= minima - 1e-9)
    .sort(
      (a, b) =>
        b.nota - a.nota ||
        Number(b.candidato.estoque > 0) - Number(a.candidato.estoque > 0) ||
        a.candidato.tituloBase.length - b.candidato.tituloBase.length,
    )
    .slice(0, limite)
    .map(({ candidato }) => candidato.id);
  if (escolhidos.length === 0) return [];

  const completos = await prisma.produto.findMany({ where: { id: { in: escolhidos } } });
  const porId = new Map(completos.map((completo) => [completo.id, completo]));
  return escolhidos.map((id) => porId.get(id)).filter(Boolean);
}
