/**
 * A inteligencia da fase 2 do anuncio ML, juntando as leituras do ML e a IA: sugerir categoria,
 * sugerir titulo e preencher a ficha. Recebe o `cliente` do ML e a IA por parametro, para o teste
 * passar o ML falso e funcoes falsas; as acoes do servidor usam os padroes (ML e IA reais).
 *
 * Regra que segura tudo: a IA nunca inventa codigo de categoria. Os codigos vem do ML
 * (`domain_discovery`); a IA so escolhe entre eles ou devolve termos para buscar de novo no ML.
 */

import { escolherCategoriaIA, termosDeBuscaIA } from "../../ia/categoriaML";
import { preencherFichaIA } from "../../ia/fichaML";
import { gerarTitulosML } from "../../ia/tituloML";
import { linhasDeEspecificacao } from "../../medidas";
import { descobrirCategoria, lerCategoria, lerCategoriaCompleta, lerTendencias } from "./leitura";

const SEM_CATEGORIA = "O Mercado Livre não achou categoria para este produto. Digite o código.";

/** As categorias candidatas sem repetir, na ordem em que o ML as devolveu. */
function semRepetir(lista) {
  const vistas = new Set();
  return lista.filter((item) => !vistas.has(item.categoriaId) && vistas.add(item.categoriaId));
}

/**
 * Sugere a categoria: (1) o ML pelo titulo; (2) com 2 ou mais, a IA recomenda uma delas; (3) com
 * nenhuma, a IA pesquisa o produto na internet e os termos que ela devolve voltam ao ML. Cada
 * candidata vem com o caminho e se e final (so categoria final aceita anuncio). Falha da IA nao
 * derruba a sugestao: as candidatas do ML ficam, e o aviso diz o que faltou.
 */
export async function sugerirCategoria(cliente, { titulo, produto, ia = { escolher: escolherCategoriaIA, termos: termosDeBuscaIA } }) {
  let origem = "ml";
  let aviso = null;
  let achadas = semRepetir(await descobrirCategoria(cliente, titulo));

  if (achadas.length === 0) {
    origem = "internet";
    let termos = [];
    try {
      termos = await ia.termos({ produto });
    } catch (erro) {
      return { candidatas: [], origem, aviso: `Não foi possível pesquisar na internet: ${erro.message}. Digite o código da categoria.` };
    }
    for (const termo of termos) achadas.push(...(await descobrirCategoria(cliente, termo)));
    achadas = semRepetir(achadas);
    if (achadas.length === 0) return { candidatas: [], origem, aviso: SEM_CATEGORIA };
  }

  const candidatas = await Promise.all(
    achadas.map(async (achada) => {
      const categoria = await lerCategoria(cliente, achada.categoriaId);
      return {
        categoriaId: achada.categoriaId,
        nome: categoria?.nome ?? achada.nome,
        caminho: categoria?.caminho ?? [achada.nome],
        folha: categoria?.folha ?? true,
        limiteTitulo: categoria?.limiteTitulo ?? null,
        recomendada: false,
        motivo: null,
      };
    }),
  );

  if (candidatas.length >= 2) {
    try {
      const escolha = await ia.escolher({ produto, candidatas });
      const recomendada = candidatas.find((candidata) => candidata.categoriaId === escolha?.categoriaId);
      if (recomendada) Object.assign(recomendada, { recomendada: true, motivo: escolha.motivo || null });
    } catch (erro) {
      aviso = `Não foi possível pedir a recomendação da IA: ${erro.message}`;
    }
  }

  return { candidatas, origem, aviso };
}

/**
 * Titulos pela IA com as palavras em alta da categoria. Sem categoria, ou se o ML nao devolver as
 * tendencias, a IA escreve so com o produto: tendencia e ajuda, nao requisito.
 */
export async function sugerirTitulos(cliente, { produto, kit, categoriaId, limite, ia = gerarTitulosML }) {
  let tendencias = [];
  if (categoriaId) {
    try {
      tendencias = await lerTendencias(cliente, categoriaId);
    } catch {
      tendencias = [];
    }
  }
  return ia({ produto, kit, tendencias, limite });
}

/**
 * A ficha pela IA: le os atributos da categoria e as especificacoes que a descricao do produto ja
 * traz (`- Nome: valor`). Devolve so as sugestoes; quem aplica e o dono, na tela.
 */
export async function preencherFicha(cliente, { produto, categoriaId, valoresAtuais, internet, ia = preencherFichaIA }) {
  const categoria = await lerCategoriaCompleta(cliente, categoriaId);
  if (!categoria) throw new Error("Categoria não encontrada no Mercado Livre.");
  return ia({
    produto,
    especificacoes: linhasDeEspecificacao(produto?.descricaoBase ?? ""),
    atributos: categoria.atributos,
    valoresAtuais: valoresAtuais ?? {},
    internet: Boolean(internet),
  });
}
