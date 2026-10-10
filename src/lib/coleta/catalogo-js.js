import { buscarPagina } from "./buscar";

/**
 * Catalogo publicado como arquivo JavaScript (R&AC, rac.tec.br).
 *
 * O site nao tem pagina por produto: `index.html` carrega `js/produtos-data.js`
 * (`window.PRODUTOS=[{codigo, descricao, imagem, pagina_pdf, ...}]`) e a busca roda
 * no navegador. Sem preco, sem estoque, sem marca — atacado por orcamento. O
 * coletor de paginas devolveria zero; aqui le-se o arquivo uma vez.
 *
 * Lido como TEXTO e interpretado como JSON, nunca executado.
 */

/** O array literal que `window.PRODUTOS=` recebe, ou null. */
export function listaDoCatalogoJs(texto, variavel = "PRODUTOS") {
  const inicio = new RegExp(`${variavel}\\s*=\\s*\\[`).exec(texto);
  if (!inicio) return null;
  const abre = inicio.index + inicio[0].length - 1;
  const fecha = texto.lastIndexOf("]");
  if (fecha <= abre) return null;
  try {
    const lista = JSON.parse(texto.slice(abre, fecha + 1));
    return Array.isArray(lista) ? lista : null;
  } catch {
    return null;
  }
}

/**
 * As FAMILIAS que o site usa para dar categoria ao item: `const families=[['Buzzers','BUZZER'],...]`
 * em js/catalogo-inicial.js, onde o segundo valor e uma expressao (sem caixa) testada na
 * descricao. A primeira que casa vence; nenhuma = "Componente eletrônico". Lida como texto
 * (nunca executada) a cada coleta, para acompanhar o que o site mostra.
 *
 * @returns {Array<[string, RegExp]>|null}
 */
export function familiasDoCatalogoJs(texto) {
  const inicio = texto.indexOf("const families=[");
  if (inicio < 0) return null;
  const fim = texto.indexOf("];", inicio);
  if (fim < 0) return null;

  const padrao = /\[\s*'((?:\\.|[^'\\])*)'\s*,\s*'((?:\\.|[^'\\])*)'\s*\]/g;
  const familias = [];
  for (const par of texto.slice(inicio, fim + 2).matchAll(padrao)) {
    try {
      familias.push([par[1], new RegExp(par[2], "i")]);
    } catch {
      // Expressao que nao compila: aquela familia e ignorada, as outras valem.
    }
  }
  return familias.length > 0 ? familias : null;
}

const FAMILIA_PADRAO = "Componente eletrônico";

const comoTexto = (valor) => {
  const texto = typeof valor === "string" ? valor.trim() : "";
  return texto === "" ? null : texto;
};

/**
 * Item do catalogo -> produto na forma de trabalho (a de normalizar.js).
 *
 * `imagem_compartilhada` indica que o mesmo arquivo serve a varios codigos (cores
 * de uma chave, por exemplo): a foto vale como referencia, e fica registrado.
 */
export function produtoDoCatalogoJs(item, { base, fonte, familias = null, coletadoEm = new Date() }) {
  const codigo = comoTexto(item?.codigo);
  const nome = comoTexto(item?.descricao);
  if (!codigo || !nome) return null;

  const imagem = comoTexto(item.imagem);
  let foto = null;
  if (imagem) {
    try {
      foto = new URL(imagem, base).toString();
    } catch {
      foto = null;
    }
  }

  // Sem a lista de familias (arquivo fora do ar), categoria vazia: nunca um palpite.
  const categoria = familias ? (familias.find(([, regra]) => regra.test(nome))?.[0] ?? FAMILIA_PADRAO) : null;
  const paginas = [].concat(item.pagina_pdf ?? []).join(", ");

  return {
    name: nome,
    code: codigo,
    mpn: null,
    ean: null,
    brand: null,
    model: null,
    category: categoria,
    ncm: null,
    // O site nao tem endereco por produto: a busca e feita no navegador.
    url: null,
    images: foto ? [foto] : [],
    prices: { normal: null, promotional: null, reserva: null, comImpostos: null },
    taxes: [],
    stock: { status: null, quantity: null, aChegar: null },
    description: null,
    specifications: [],
    documentos: [],
    variants: [],
    seo: {},
    plataforma: { id: "catalogo-js", nome: "Catálogo em arquivo JavaScript", confianca: "alta" },
    collectedAt: coletadoEm.toISOString(),
    origens: {
      ...(categoria ? { category: "família do site, deduzida da descrição" } : {}),
      catalogo: `${fonte?.name ?? "catálogo"}: arquivo de produtos do site${paginas ? `, página(s) ${paginas} do PDF` : ""}`,
      ...(item.imagem_compartilhada ? { imagem: "foto compartilhada com outros códigos" } : {}),
    },
  };
}

/**
 * Baixa o arquivo e devolve os produtos.
 *
 * @returns {Promise<{produtos: object[], visitas: number, erro: string|null}>}
 */
export async function colherCatalogoJs({ urlBase, caminho, caminhoFamilias = null, fonte, sinal }) {
  const base = new URL(urlBase);
  const alvo = new URL(caminho, base).toString();

  // buscarPagina respeita o robots.txt e o ritmo do dominio.
  const resposta = await buscarPagina(alvo, { sinal });
  if (!resposta.ok || !resposta.corpo) {
    return { produtos: [], visitas: 1, erro: resposta.erro ?? `HTTP ${resposta.status}` };
  }

  const lista = listaDoCatalogoJs(resposta.corpo);
  if (!lista) return { produtos: [], visitas: 1, erro: "o arquivo do catálogo não tem o formato esperado" };

  // A categoria e opcional: falhar aqui nao derruba a coleta.
  let familias = null;
  if (caminhoFamilias) {
    const regras = await buscarPagina(new URL(caminhoFamilias, base).toString(), { sinal });
    if (regras.ok && regras.corpo) familias = familiasDoCatalogoJs(regras.corpo);
  }

  const coletadoEm = new Date();
  const vistos = new Set();
  const produtos = [];
  for (const item of lista) {
    const produto = produtoDoCatalogoJs(item, { base, fonte, familias, coletadoEm });
    if (!produto || vistos.has(produto.code)) continue;
    vistos.add(produto.code);
    produtos.push(produto);
  }

  return { produtos, visitas: 1, erro: produtos.length === 0 ? "nenhum produto válido no catálogo" : null };
}
