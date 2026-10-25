"use server";

import { negarSemAcessos } from "@/lib/acessos/servidor";
import { clienteLI } from "@/lib/canaisDeVenda/li/cliente";
import { listarCategoriasDaLI, textoDoErroLI } from "@/lib/canaisDeVenda/li/leitura";
import { seoDosConcorrentes } from "@/lib/canaisDeVenda/li/seoConcorrentes";
import { gerarDescriptionsSeo, sugerirCategoriasIA } from "@/lib/ia/anuncio";
import { novoGasto, resumoDoGasto } from "@/lib/ia/gasto";

/**
 * As ferramentas das abas Categorias e SEO do cadastro de Produto (pedido do dono em 25/10/2026: as duas passaram do editor da
 * Loja Integrada para o produto base). So LEITURA na loja (a arvore ao vivo) e IA; nada daqui grava produto nem escreve na
 * loja: o Salvar do cadastro e quem grava.
 *
 * O texto que a IA usa (nome, marca, descricao) vem do FORMULARIO, e nao do banco: o produto novo ainda nao tem nada
 * salvo, e o dono pode ter acabado de escrever a descricao. Tudo e conferido no tamanho aqui. Cada acao confere o acesso
 * na primeira linha.
 */

const PEDIDO_INVALIDO = { ok: false, erro: "Pedido inválido." };
const MAXIMO_DO_TITULO = 255;
const MAXIMO_DA_MARCA = 120;
const MAXIMO_DA_DESCRICAO = 20_000;

const ehIdOuNulo = (valor) => valor === null || valor === undefined || valor === "" || typeof valor === "string";
const textoAte = (valor, maximo) => typeof valor === "string" && valor.length <= maximo;

/** As categorias da loja, ao vivo (o dono esta renovando a arvore). So leitura. */
export async function categoriasDaLoja() {
  const negado = await negarSemAcessos(["tela.produtos.cadastro", "ver"]);
  if (negado) return negado;
  try {
    return { ok: true, categorias: await listarCategoriasDaLI(clienteLI()) };
  } catch (erro) {
    console.error("[produto] categorias da loja", erro);
    return { ok: false, erro: textoDoErroLI(erro) };
  }
}

/** O SEO (title e description) dos concorrentes salvos no produto, para comparar na aba SEO. Pede o dado Concorrentes. */
export async function seoDosConcorrentesDoProduto(produtoId) {
  const negado = await negarSemAcessos(["tela.produtos.cadastro", "ver"], ["dado.concorrentes", "ver"]);
  if (negado) return negado;
  if (!ehIdOuNulo(produtoId)) return PEDIDO_INVALIDO;
  // Produto novo ainda nao tem concorrente salvo: lista vazia, sem consulta.
  if (!produtoId) return { ok: true, concorrentes: [] };
  try {
    return { ok: true, concorrentes: await seoDosConcorrentes(produtoId) };
  } catch (erro) {
    console.error("[produto] seo dos concorrentes", erro);
    return { ok: false, erro: "Não foi possível ler os concorrentes. Tente de novo." };
  }
}

/** Tres opcoes de Meta Description pela IA (o mesmo `gerarDescriptionsSeo` de antes). O gasto volta tambem no erro. */
export async function gerarSeoDoProduto(produtoId, { titulo, descricao } = {}) {
  const negado = await negarSemAcessos(["tela.produtos.cadastro", "editar"], ["acao.produtos.gerarTextoComIA", "executar"]);
  if (negado) return negado;
  if (!ehIdOuNulo(produtoId) || !textoAte(titulo ?? "", MAXIMO_DO_TITULO) || !textoAte(descricao ?? "", MAXIMO_DA_DESCRICAO)) return PEDIDO_INVALIDO;
  if (!String(titulo ?? "").trim()) return { ok: false, erro: "Dê um nome ao produto antes de gerar a descrição de SEO." };
  const gasto = novoGasto();
  try {
    // Produto novo nao tem concorrente salvo: a IA escreve so com o nome e a descricao.
    const concorrentes = produtoId ? await seoDosConcorrentes(produtoId).catch(() => []) : [];
    const opcoes = await gerarDescriptionsSeo({ titulo: titulo.trim(), descricao: descricao ?? "", concorrentes, gasto });
    return { ok: true, opcoes, gasto: resumoDoGasto(gasto) };
  } catch (erro) {
    console.error("[produto] seo com IA", erro);
    return { ok: false, erro: erro.message || "Não foi possível gerar com a IA. Tente de novo.", gasto: resumoDoGasto(gasto) };
  }
}

/** Categorias pela IA: le a arvore ao vivo e escolhe ate 3. Quem marca e a tela, no "Marcar estas". */
export async function sugerirCategoriasDoProduto({ titulo, marca, descricao } = {}) {
  const negado = await negarSemAcessos(["tela.produtos.cadastro", "editar"], ["acao.produtos.gerarTextoComIA", "executar"]);
  if (negado) return negado;
  if (!textoAte(titulo ?? "", MAXIMO_DO_TITULO) || !textoAte(marca ?? "", MAXIMO_DA_MARCA) || !textoAte(descricao ?? "", MAXIMO_DA_DESCRICAO)) return PEDIDO_INVALIDO;
  if (!String(titulo ?? "").trim()) return { ok: false, erro: "Dê um nome ao produto antes de pedir as categorias." };
  const gasto = novoGasto();
  try {
    const categorias = await listarCategoriasDaLI(clienteLI());
    const sugestoes = await sugerirCategoriasIA({ titulo: titulo.trim(), marca: marca ?? "", descricao: descricao ?? "", categorias, gasto });
    return { ok: true, sugestoes, gasto: resumoDoGasto(gasto) };
  } catch (erro) {
    console.error("[produto] categoria com IA", erro);
    return { ok: false, erro: erro.message || "Não foi possível sugerir com a IA. Tente de novo.", gasto: resumoDoGasto(gasto) };
  }
}
