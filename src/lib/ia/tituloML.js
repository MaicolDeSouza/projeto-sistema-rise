import { OPCOES_DE_TITULO, SISTEMA_IA, chamarIA, limparTitulo } from "./anuncio";
import { PADRAO_TITULO } from "./padraoTitulo";

/**
 * Titulos do anuncio do Mercado Livre pela IA (fase 2): o padrao de titulo da loja, os dados do
 * produto (ou do kit) e as palavras em alta da categoria (`/trends`). Mesmo jeito de `gerarTitulos`
 * do cadastro: 3 opcoes, e o que passa do limite volta como recusado numa segunda chamada.
 */

const texto = (valor) => String(valor ?? "").trim();

const FORMATO_TITULOS = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: { titulos: { type: "array", items: { type: "string" } } },
    required: ["titulos"],
    additionalProperties: false,
  },
};

/**
 * O pedido a IA. `kit` e `{ unidades, itens: [nome] }` ou `null`; `tendencias` sao os termos em
 * alta da categoria (podem faltar: sem categoria, ou o ML nao os tem).
 */
export function montarPedidoDeTitulo({ produto, kit, tendencias = [], limite, titulosRecusados = [], jaEscolhidos = [], faltam = OPCOES_DE_TITULO }) {
  const partes = [
    PADRAO_TITULO,
    `Produto: ${texto(produto?.tituloBase)}\nMarca: ${texto(produto?.marca) || "(sem)"}\nModelo: ${texto(produto?.modelo) || "(sem)"}`,
  ];
  if (kit) {
    partes.push(`É um KIT com ${kit.unidades} unidades no total. Itens: ${(kit.itens ?? []).join("; ")}. O título deve deixar claro que é kit e quantas peças.`);
  }
  const descricao = String(produto?.descricao ?? produto?.descricaoBase ?? "").slice(0, 3000);
  if (descricao) partes.push(`Descrição:\n${descricao}`);
  if (tendencias.length > 0) {
    partes.push(`Palavras em alta na categoria do Mercado Livre (use só as que valem para este produto; nunca cite outro produto): ${tendencias.join(", ")}`);
  }
  partes.push(
    `Escreva ${faltam} título(s) DIFERENTES entre si, todos seguindo o padrão e com no máximo ${limite} caracteres. ` +
      "Varie o que ganha espaço (modelo, especificação, compatibilidade, o que acompanha), não só a ordem das palavras.",
  );
  if (jaEscolhidos.length > 0) partes.push(`Já escolhidos (não repita): ${jaEscolhidos.join(" | ")}`);
  if (titulosRecusados.length > 0) partes.push(`Recusados por passar de ${limite} caracteres: ${titulosRecusados.join(" | ")}`);
  partes.push('Responda no formato {"titulos": ["...", "..."]}.');
  return partes.join("\n\n");
}

/** Ate `OPCOES_DE_TITULO` titulos de ate `limite` caracteres, em maiusculas, sem repetir. */
export async function gerarTitulosML({ produto, kit, tendencias = [], limite }) {
  const opcoes = [];
  const recusadas = [];

  for (let tentativa = 1; tentativa <= 2 && opcoes.length < OPCOES_DE_TITULO; tentativa++) {
    const resposta = await chamarIA({
      tarefa: "titulos-ml",
      quantidade: 0,
      sistema: SISTEMA_IA,
      pedido: montarPedidoDeTitulo({
        produto,
        kit,
        tendencias,
        limite,
        titulosRecusados: recusadas,
        jaEscolhidos: opcoes,
        faltam: OPCOES_DE_TITULO - opcoes.length,
      }),
      formato: FORMATO_TITULOS,
    });

    let candidatos;
    try {
      candidatos = JSON.parse(resposta).titulos;
      if (!Array.isArray(candidatos)) throw new Error();
    } catch {
      throw new Error("A IA devolveu os títulos em formato inesperado. Tente de novo.");
    }

    for (const candidato of candidatos) {
      const titulo = limparTitulo(candidato);
      if (!titulo || opcoes.includes(titulo)) continue;
      if (titulo.length > limite) recusadas.push(titulo);
      else if (opcoes.length < OPCOES_DE_TITULO) opcoes.push(titulo);
    }
  }

  if (opcoes.length === 0) throw new Error(`A IA não conseguiu títulos de até ${limite} caracteres. Tente de novo.`);
  return opcoes;
}
