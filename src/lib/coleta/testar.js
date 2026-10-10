import { buscarPagina } from "./buscar";
import { camposPreenchidos, ROTULOS_CAMPOS } from "./campos";
import { colherProdutos } from "./colher";
import { colherCatalogoJs } from "./catalogo-js";
import { catalogoJsDoEndereco } from "./fornecedores";

/**
 * Teste de uma fonte.
 *
 * Responde a uma pergunta so: "consigo abrir este site e tirar informacao util
 * de tres produtos?". Nao e uma varredura — sao TRES produtos, com teto de
 * visitas. A coleta de verdade so comeca depois que a fonte e salva.
 *
 * Verificar HTTP 200 nao responderia nada: toda loja devolve 200 na home. O que
 * decide e conseguir NORMALIZAR produto de verdade, com nome, endereco e preco.
 *
 * A colheita em si mora em colher.js, a mesma usada pela coleta em lote — o que
 * garante que a previa mostre exatamente o que a coleta guarda.
 *
 * Nada e gravado aqui. O cadastro da fonte so acontece depois, com o operador
 * olhando o resultado.
 */

const MINIMO_PRODUTOS = 3;

/** Valor aninhado por caminho: ["paging","total"] em {paging:{total:9}} da 9. */
function porCaminho(objeto, caminho) {
  return caminho.reduce((atual, chave) => (atual == null ? null : atual[chave]), objeto);
}

/**
 * Confere se o catalogo publico da plataforma responde nesta loja.
 *
 * E conferencia, nao coleta: uma pagina, nada gravado. Existe porque a
 * diferenca entre ler o catalogo em JSON e raspar pagina a pagina muda o custo
 * da fonte inteira — a Tray, por exemplo, publica /web_api/products sem token,
 * e uma loja que responde ali entrega 2.296 produtos numa requisicao contra
 * 2.296 visitas.
 *
 * Passa por buscarPagina de proposito: um catalogo publico nao dispensa
 * robots.txt nem o ritmo de uma visita a cada dois segundos. Se o robots
 * bloqueia aquele caminho, o resultado e "bloqueado" — e assim fica.
 *
 * O que se descobre aqui NAO alimenta a coleta. Trocar o caminho da coleta e
 * decisao do dono, e "Testar fonte" so valida.
 */
async function conferirCatalogo(catalogo) {
  if (!catalogo?.url) return null;

  const resposta = await buscarPagina(catalogo.url);

  if (!resposta.ok || !resposta.corpo) {
    return {
      url: catalogo.url,
      disponivel: false,
      motivo: resposta.erro ?? `HTTP ${resposta.status ?? "?"}`,
      observacao: catalogo.observacao ?? null,
    };
  }

  let dados;
  try {
    dados = JSON.parse(resposta.corpo);
  } catch {
    // Respondeu, mas nao em JSON: quase sempre e a pagina de erro da loja
    // devolvida com status 200. Nao e catalogo.
    return {
      url: catalogo.url,
      disponivel: false,
      motivo: "respondeu, mas não em JSON",
      observacao: catalogo.observacao ?? null,
    };
  }

  const lista = catalogo.listaEm ? dados?.[catalogo.listaEm] : dados;
  const total = catalogo.totalEm ? porCaminho(dados, catalogo.totalEm) : null;

  return {
    url: catalogo.url,
    disponivel: true,
    total: typeof total === "number" || typeof total === "string" ? Number(total) : null,
    itens: Array.isArray(lista) ? lista.length : null,
    campos: catalogo.campos ?? null,
    observacao: catalogo.observacao ?? null,
    incerto: catalogo.incerto ?? false,
  };
}

/**
 * Teste da fonte cujo catalogo e um arquivo JavaScript (R&AC): le o arquivo, que e a
 * mesma leitura da varredura, e mostra tres itens. Sem preco por desenho do site.
 */
async function testarCatalogoJs({ url, nome, tipo }, catalogo) {
  const colheita = await colherCatalogoJs({
    urlBase: /^https?:\/\//i.test(url) ? url : `https://${url}`,
    caminho: catalogo.caminho,
    caminhoFamilias: catalogo.familias,
    fonte: { name: nome, type: tipo },
  });
  const passos = [
    { nome: "Catálogo em arquivo lido", ok: !colheita.erro, detalhe: colheita.erro ?? `${colheita.produtos.length} produto(s) em ${catalogo.caminho}` },
  ];

  if (colheita.erro) {
    return { resultado: "FALHA", motivo: colheita.erro, passos, produtos: [], campos: null, formatos: [], plataforma: null, catalogoPublico: null, produtosNoSite: null, produtosNoSiteParcial: false };
  }

  const amostra = colheita.produtos.slice(0, MINIMO_PRODUTOS);
  const presentes = {};
  for (const produto of amostra) {
    for (const [campo, tem] of Object.entries(camposPreenchidos(produto))) presentes[campo] = presentes[campo] || tem;
  }

  return {
    // Fornecedor: preco nao e exigido, e este site nao publica nenhum.
    resultado: "PARCIAL",
    motivo: "O site não publica preço nem estoque (vende por orçamento): a coleta traz código, descrição e foto.",
    passos,
    produtos: amostra,
    formatos: ["catalogo-js"],
    campos: {
      encontrados: Object.entries(presentes).filter(([, tem]) => tem).map(([campo]) => ROTULOS_CAMPOS[campo]),
      ausentes: Object.entries(presentes).filter(([, tem]) => !tem).map(([campo]) => ROTULOS_CAMPOS[campo]),
    },
    prefixoUrl: null,
    dominio: new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname,
    plataforma: null,
    catalogoPublico: null,
    produtosNoSite: colheita.produtos.length,
    produtosNoSiteParcial: false,
  };
}

export async function testarFonte({ url, secao, nome, tipo, evitar }) {
  const catalogoJs = catalogoJsDoEndereco(url);
  if (catalogoJs) return testarCatalogoJs({ url, nome, tipo }, catalogoJs);

  const colheita = await colherProdutos({
    url,
    secao,
    nome,
    tipo,
    // Colhe exatamente o minimo. O teste responde "da para ler este site?", e
    // tres produtos ja respondem — passar disso e coleta, que so acontece
    // depois que a fonte e salva.
    limite: MINIMO_PRODUTOS,
    orcamento: 25,
    // Toggle "Amostra variada" na tela: enderecos ja mostrados num teste
    // anterior, para este pular e trazer tres DIFERENTES. Sem isto (toggle
    // desligado), o teste sempre volta aos mesmos tres — e assim que "Testar
    // fonte" sempre funcionou.
    evitar: evitar && evitar.length > 0 ? new Set(evitar) : null,
  });

  const catalogoPublico = await conferirCatalogo(colheita.catalogo);

  const plataforma = colheita.plataforma
    ? {
        id: colheita.plataforma.id,
        nome: colheita.plataforma.nome,
        familia: colheita.plataforma.familia ?? null,
        confianca: colheita.plataforma.confianca,
        sinais: colheita.plataforma.sinais ?? [],
        alternativas: colheita.plataforma.alternativas ?? [],
        conferidaEm: colheita.plataforma.conferidaEm ?? null,
        entrega: colheita.plataforma.entrega ?? null,
      }
    : null;

  if (!colheita.ok) {
    return {
      resultado: "FALHA",
      motivo: colheita.motivo,
      passos: colheita.passos,
      produtos: [],
      campos: null,
      formatos: colheita.formatos,
      plataforma,
      catalogoPublico,
      produtosNoSite: colheita.produtosNoSite ?? null,
      produtosNoSiteParcial: colheita.produtosNoSiteParcial ?? false,
    };
  }

  const { produtos } = colheita;

  // Relatorio de campos: um campo conta como disponivel se QUALQUER produto o
  // trouxe. Exigir que todos tenham marcaria como ausente algo que a loja
  // publica so em parte do catalogo.
  const presentes = {};
  for (const produto of produtos) {
    for (const [campo, tem] of Object.entries(camposPreenchidos(produto))) {
      presentes[campo] = presentes[campo] || tem;
    }
  }

  const encontrados = Object.entries(presentes)
    .filter(([, tem]) => tem)
    .map(([campo]) => ROTULOS_CAMPOS[campo]);
  const ausentes = Object.entries(presentes)
    .filter(([, tem]) => !tem)
    .map(([campo]) => ROTULOS_CAMPOS[campo]);

  const bastantes = produtos.length >= MINIMO_PRODUTOS;

  return {
    // PARCIAL nao e reprovacao: os produtos sao coletaveis, apenas com menos
    // campos. Quem decide se serve e o operador.
    resultado: bastantes && ausentes.length === 0 ? "SUCESSO" : "PARCIAL",
    motivo: bastantes
      ? null
      : `Só foi possível validar ${produtos.length} produto(s); o teste procura ${MINIMO_PRODUTOS}.`,
    passos: colheita.passos,
    produtos,
    formatos: colheita.formatos,
    campos: { encontrados, ausentes },
    prefixoUrl: colheita.prefixoUrl,
    dominio: colheita.dominio,
    plataforma,
    catalogoPublico,
    produtosNoSite: colheita.produtosNoSite ?? null,
    produtosNoSiteParcial: colheita.produtosNoSiteParcial ?? false,
  };
}
