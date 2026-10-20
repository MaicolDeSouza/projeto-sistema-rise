import { buscarPagina } from "./buscar";
import { camposPreenchidos, ROTULOS_CAMPOS } from "./campos";
import { enderecoComparavel } from "./texto-html";
import { colherProdutos } from "./colher";
import { colherCatalogoJs } from "./catalogo-js";
import { colherCatalogoShopify } from "./catalogo-shopify";
import { catalogoJsDoEndereco, catalogoShopifyDoEndereco } from "./fornecedores";
import { conferirEnderecos, rotuloDoEndereco } from "./enderecos";

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
    dominio: new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname,
    plataforma: null,
    catalogoPublico: null,
    produtosNoSite: colheita.produtos.length,
    produtosNoSiteParcial: false,
  };
}

/**
 * Teste da fonte cuja loja Shopify fica por tras de um site proprio (Prado): le o catalogo
 * inteiro em JSON (a mesma leitura da varredura; 3 paginas de 250) e mostra tres itens.
 */
async function testarCatalogoShopify({ url, nome, tipo, evitar }, catalogo) {
  const colheita = await colherCatalogoShopify({
    loja: catalogo.loja,
    urlProduto: catalogo.urlProduto,
    supabase: catalogo.supabase ?? null,
    fonte: { name: nome, type: tipo },
  });
  const comDocumentos = colheita.produtos.filter((produto) => produto.documentos.length > 0).length;
  const passos = [
    {
      nome: "Catálogo do Shopify lido",
      ok: !colheita.erro,
      detalhe: colheita.erro ?? `${colheita.produtos.length} produto(s) em ${colheita.visitas} página(s) de ${catalogo.loja}`,
    },
    ...(catalogo.supabase
      ? [{
          nome: "Documentos da base do site",
          ok: (colheita.avisos ?? []).length === 0,
          detalhe: (colheita.avisos ?? [])[0] ?? `${comDocumentos} produto(s) com documento(s)`,
        }]
      : []),
  ];
  const dominio = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname;
  const plataforma = { id: "shopify", nome: "Shopify", familia: "SaaS internacional", confianca: "alta", sinais: [], alternativas: [], conferidaEm: "2026-10-11", entrega: null };

  if (colheita.erro) {
    return { resultado: "FALHA", motivo: colheita.erro, passos, produtos: [], campos: null, formatos: ["catalogo-shopify"], plataforma, catalogoPublico: null, produtosNoSite: null, produtosNoSiteParcial: false };
  }

  // "Amostra variada" (o dono, 11/10/2026): os enderecos ja mostrados ficam de fora, e a amostra e
  // tirada do que sobra. Sem isto, o catalogo inteiro vindo na mesma ordem dava sempre os tres primeiros.
  const jaMostrados = new Set((evitar ?? []).map((endereco) => enderecoComparavel(endereco)));
  const candidatos = colheita.produtos.filter((produto) => !produto.url || !jaMostrados.has(enderecoComparavel(produto.url)));
  const amostra = candidatos.slice(0, MINIMO_PRODUTOS);
  const presentes = {};
  for (const produto of amostra) {
    for (const [campo, tem] of Object.entries(camposPreenchidos(produto))) presentes[campo] = presentes[campo] || tem;
  }
  const encontrados = Object.entries(presentes).filter(([, tem]) => tem).map(([campo]) => ROTULOS_CAMPOS[campo]);
  const ausentes = Object.entries(presentes).filter(([, tem]) => !tem).map(([campo]) => ROTULOS_CAMPOS[campo]);
  const bastantes = amostra.length >= MINIMO_PRODUTOS;

  return {
    resultado: bastantes && ausentes.length === 0 ? "SUCESSO" : "PARCIAL",
    motivo: bastantes ? null : `Só foi possível validar ${amostra.length} produto(s); o teste procura ${MINIMO_PRODUTOS}.`,
    passos,
    produtos: amostra,
    formatos: ["catalogo-shopify"],
    campos: { encontrados, ausentes },
    dominio,
    plataforma,
    catalogoPublico: {
      url: `https://${catalogo.loja}/products.json?limit=250`,
      disponivel: true,
      total: colheita.produtos.length,
      itens: colheita.produtos.length,
      campos: "title, handle, body_html, vendor, product_type, variants[] (price, sku, available), images[]",
      observacao: "Loja Shopify por trás do site próprio: só o catálogo em JSON responde; nenhuma página é aberta.",
    },
    produtosNoSite: colheita.produtos.length,
    produtosNoSiteParcial: false,
  };
}

/**
 * Testa a fonte. `urls` (20/10/2026) e a lista de enderecos que a fonte vai varrer: a loja inteira ou categorias, tres
 * produtos de CADA UM. Sem `urls`, vale o `url`.
 */
export async function testarFonte({ url, nome, tipo, evitar, urls }) {
  const lista = (urls ?? []).filter((item) => String(item ?? "").trim());
  if (lista.length > 0) {
    const conferido = conferirEnderecos(lista);
    if (!conferido.ok) return falhaDaLista(conferido.erro);
    const [primeiro] = conferido.enderecos;

    // Loja que so se le por arquivo/catalogo proprio (R&AC, Prado) nao tem listagem de categoria: vale o endereco da loja.
    if (catalogoJsDoEndereco(primeiro.url) || catalogoShopifyDoEndereco(primeiro.url)) {
      return testarUma({ url: primeiro.url, nome, tipo, evitar });
    }
    if (conferido.enderecos.length === 1) {
      return testarUma({ url: primeiro.url, nome, tipo, evitar, categoria: !primeiro.lojaInteira });
    }
    return testarVarias(conferido.enderecos, { nome, tipo, evitar });
  }
  return testarUma({ url, nome, tipo, evitar });
}

function falhaDaLista(motivo) {
  return {
    resultado: "FALHA",
    motivo,
    passos: [{ nome: "Endereços válidos", ok: false, detalhe: motivo }],
    produtos: [],
    campos: null,
    formatos: [],
    plataforma: null,
    catalogoPublico: null,
    produtosNoSite: null,
    produtosNoSiteParcial: false,
  };
}

/**
 * Varios enderecos: cada um e testado sozinho (tres produtos) e o relatorio junta tudo, com cada passo e cada produto
 * dizendo de qual endereco veio. SUCESSO so se TODOS renderam; um que falha deixa a fonte em PARCIAL, e o motivo diz qual.
 */
async function testarVarias(enderecos, { nome, tipo, evitar }) {
  const itens = [];
  for (const endereco of enderecos) {
    const rotulo = rotuloDoEndereco(endereco.url);
    const resultado = await testarUma({ url: endereco.url, nome, tipo, evitar, categoria: !endereco.lojaInteira });
    itens.push({ endereco, rotulo, resultado });
  }

  const vistos = new Set();
  const produtos = [];
  for (const { rotulo, resultado } of itens) {
    for (const produto of resultado.produtos ?? []) {
      const chave = produto.url ? enderecoComparavel(produto.url) : null;
      if (chave && vistos.has(chave)) continue;
      if (chave) vistos.add(chave);
      produtos.push({ ...produto, origemDaLeitura: rotulo });
    }
  }

  const encontrados = new Set();
  const ausentes = new Set();
  for (const { resultado } of itens) for (const campo of resultado.campos?.encontrados ?? []) encontrados.add(campo);
  for (const { resultado } of itens) {
    for (const campo of resultado.campos?.ausentes ?? []) if (!encontrados.has(campo)) ausentes.add(campo);
  }

  const semProduto = itens.filter(({ resultado }) => (resultado.produtos ?? []).length === 0);
  const incompletos = itens.filter(({ resultado }) => (resultado.produtos ?? []).length > 0 && resultado.resultado !== "SUCESSO");
  const motivoDe = ({ rotulo, resultado }) => `${rotulo}: ${resultado.motivo ?? "sem produto"}`;

  let resultado;
  let motivo = null;
  if (produtos.length === 0) {
    resultado = "FALHA";
    motivo = `Nenhum dos ${itens.length} endereços rendeu produto. ${semProduto.map(motivoDe).join(" · ")}`;
  } else if (semProduto.length === 0 && incompletos.length === 0 && ausentes.size === 0) {
    resultado = "SUCESSO";
  } else {
    resultado = "PARCIAL";
    if (semProduto.length > 0) {
      motivo = `${semProduto.length} de ${itens.length} endereços não renderam produto. ${semProduto.map(motivoDe).join(" · ")}`;
    }
  }

  const tamanhos = itens.map(({ resultado: item }) => item.produtosNoSite);
  const todosSabem = tamanhos.every((valor) => typeof valor === "number");
  const comPlataforma = itens.find(({ resultado: item }) => item.plataforma);

  return {
    resultado,
    motivo,
    passos: itens.flatMap(({ rotulo, resultado: item }) => (item.passos ?? []).map((passo) => ({ ...passo, nome: `[${rotulo}] ${passo.nome}` }))),
    produtos,
    formatos: [...new Set(itens.flatMap(({ resultado: item }) => item.formatos ?? []))],
    campos: { encontrados: [...encontrados], ausentes: [...ausentes] },
    dominio: itens.find(({ resultado: item }) => item.dominio)?.resultado.dominio ?? null,
    plataforma: comPlataforma?.resultado.plataforma ?? null,
    catalogoPublico: itens.find(({ resultado: item }) => item.catalogoPublico)?.resultado.catalogoPublico ?? null,
    // So se todos disseram o tamanho: somar uns e esquecer outros daria um total que ninguem provou.
    produtosNoSite: todosSabem ? tamanhos.reduce((soma, valor) => soma + valor, 0) : null,
    produtosNoSiteParcial: itens.some(({ resultado: item }) => item.produtosNoSiteParcial),
    produtosNoSiteFonte: todosSabem ? (itens[0].resultado.produtosNoSiteFonte ?? null) : null,
    porUrl: itens.map(({ endereco, rotulo, resultado: item }) => ({
      url: endereco.url,
      rotulo,
      resultado: item.resultado,
      produtos: (item.produtos ?? []).length,
      produtosNoSite: typeof item.produtosNoSite === "number" ? item.produtosNoSite : null,
      motivo: item.motivo ?? null,
    })),
  };
}

async function testarUma({ url, nome, tipo, evitar, categoria = false }) {
  const catalogoJs = catalogoJsDoEndereco(url);
  if (catalogoJs) return testarCatalogoJs({ url, nome, tipo }, catalogoJs);
  const catalogoShopify = catalogoShopifyDoEndereco(url);
  if (catalogoShopify) return testarCatalogoShopify({ url, nome, tipo, evitar }, catalogoShopify);

  const colheita = await colherProdutos({
    url,
    categoria,
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
      produtosNoSiteFonte: colheita.produtosNoSiteFonte ?? null,
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
    dominio: colheita.dominio,
    plataforma,
    catalogoPublico,
    produtosNoSite: colheita.produtosNoSite ?? null,
    produtosNoSiteParcial: colheita.produtosNoSiteParcial ?? false,
    produtosNoSiteFonte: colheita.produtosNoSiteFonte ?? null,
  };
}
