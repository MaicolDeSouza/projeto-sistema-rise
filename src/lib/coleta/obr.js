import { caminhoDeCategoria } from "./categoria";
import { baseDaPagina, comoTexto, comoUrlAbsoluta } from "./texto-html";

/**
 * OBR Equipamentos Industriais (obr.com.br, 22/10/2026): catalogo de FABRICANTE, sem preco, sem
 * carrinho e sem dado estruturado de produto. O JSON-LD e so a trilha generica ("Home > Produtos >
 * Produto > nome"), e o og:title e o og:description sao o texto da EMPRESA, iguais em toda pagina
 * ("OBR Equipamentos Industriais Ltda. e referencia..."); o og:image e o logo. O leitor generico
 * recusava toda pagina, e se aceitasse, todo produto sairia com o nome da empresa e o logo de foto.
 *
 * O que a pagina mostra: o nome no <h2> do painel, o texto e as tabelas logo abaixo, a foto ao
 * lado (`col-lg-3 height-img`) e a trilha de categorias no `<ol class="breadcrumb">`. O CODIGO
 * aparece de tres jeitos, medidos nas paginas do site:
 *  - escrito: "Codigo: MPS23CM12-15A08D" (motores, spindles, servos);
 *  - numa tabela de UMA linha, na coluna "Modelo"/"Modelo da Porca" (guias, fusos);
 *  - numa tabela de VARIAS linhas, uma por codigo (suportes "MA5, MA8...", fibra ceramica
 *    "7891, 7892..."): cada linha vira um produto, a mesma regra do resto do Rise ("campo com
 *    mais de um codigo vira mais de um produto"; a Nuvemshop faz o mesmo com as variantes).
 *
 * Reconhecido SO pelo dominio: a leitura de tabela abaixo, aplicada a uma loja qualquer, faria
 * tabela de medidas virar produto.
 */

export function ehObr(url) {
  try {
    return /^(www\.)?obr\.com\.br$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Pagina de produto: `/produtos/item/<id>/<slug>`. Categoria, subcategoria e "divisao" so listam. */
export function ehProdutoDaObr(url) {
  try {
    return ehObr(url) && /^\/produtos\/item\/\d+(\/|$)/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * Subcategoria e "divisao". Quase todas listam produtos, mas 14 delas (medido em 22/10/2026: os
 * mancais BK, BF, FK e FF, os trilhos JM2, rolamentos e buchas da HEPCO) mostram a tabela de
 * modelos NA PROPRIA pagina, sem pagina de produto: sem ler a listagem, 83 codigos ficavam de fora.
 */
export function ehListagemDaObr(url) {
  try {
    return ehObr(url) && /^\/(subcategoria|produtos\/divisao)\//i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Tabelas
// ---------------------------------------------------------------------------

/// colspan/rowspan acima disso e erro de digitacao no editor do site, nao tabela.
const MAXIMO_SPAN = 60;

const span = (atributos, nome) => {
  const valor = Number(new RegExp(`${nome}\\s*=\\s*["']?(\\d+)`, "i").exec(atributos)?.[1]);
  return Number.isInteger(valor) && valor > 1 ? Math.min(valor, MAXIMO_SPAN) : 1;
};

/**
 * A tabela como grade: cada celula com colspan/rowspan ocupa (repetida) todas as posicoes que
 * cobre. A guia linear escreve o cabecalho em duas linhas ("CAPACIDADE DE CARGA" sobre "Dinamica
 * (kgf)" e "Estatica (kgf)"), e a gaxeta poe "CORDA (GAXETA) FG" uma vez para dez codigos: sem
 * abrir os spans, as colunas desalinham e o valor de uma vai parar no rotulo da outra.
 */
export function gradeDaTabela(tabelaHtml) {
  const grade = [];
  const pendentes = [];

  for (const linha of String(tabelaHtml ?? "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const celulas = [];
    let coluna = 0;
    const ocuparPendentes = () => {
      while (pendentes[coluna]?.restantes > 0) {
        celulas[coluna] = pendentes[coluna].texto;
        pendentes[coluna].restantes--;
        coluna++;
      }
    };

    for (const celula of linha[1].matchAll(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi)) {
      ocuparPendentes();
      const texto = (comoTexto(celula[3]) ?? "").replace(/\s+/g, " ").trim();
      const largura = span(celula[2], "colspan");
      const altura = span(celula[2], "rowspan");
      for (let i = 0; i < largura; i++) {
        celulas[coluna] = texto;
        pendentes[coluna] = altura > 1 ? { texto, restantes: altura - 1 } : null;
        coluna++;
      }
    }
    // Rowspan que vem da linha de cima depois da ultima celula escrita nesta.
    while (coluna < pendentes.length) {
      if (pendentes[coluna]?.restantes > 0) {
        celulas[coluna] = pendentes[coluna].texto;
        pendentes[coluna].restantes--;
      }
      coluna++;
    }

    grade.push(Array.from(celulas, (texto) => texto ?? ""));
  }

  return grade;
}

/** Rotulo da coluna que traz o codigo. "Modelo do Fuso" fica de fora: e o fuso que a porca usa. */
const ROTULO_DE_CODIGO = /^(c[oó]d(igo)?\.?|modelo|modelo da porca|refer[eê]ncia|ref\.?|part number|p\/n)$/i;

/** "x" e traco na tabela de medidas dizem "nao se aplica a este modelo", nao sao valor. */
const SEM_VALOR = /^(x|-|–|—)?$/i;

/**
 * Tem cara de codigo: curto, sem frase. Separa "MA5-VA", "8101" e "OBR-A 15 S" de uma linha de
 * secao que caiu na coluna do codigo ("Densidade 1000 (kg/m³)").
 */
export function pareceCodigo(texto) {
  if (typeof texto !== "string") return false;
  const limpo = texto.trim();
  return (
    limpo.length >= 1 &&
    limpo.length <= 30 &&
    /\d/.test(limpo) &&
    // "NMS 12 ..." (a tabela da HEPCO) e um modelo pela metade, nao um codigo.
    !/[():;…]|\.\.\./.test(limpo) &&
    limpo.split(/\s+/).length <= 3
  );
}

const semAcento = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * "Corrente | 1.5 A | | Torque estatico | 12 kgf.cm": o motor de passo escreve DOIS pares por
 * linha, separados por uma celula vazia. Devolve os pares, ou null se a linha nao e de pares.
 */
function paresDaLinha(celulas) {
  const blocos = [];
  let atual = [];
  for (const celula of celulas) {
    if (celula) atual.push(celula);
    else if (atual.length) {
      blocos.push(atual);
      atual = [];
    }
  }
  if (atual.length) blocos.push(atual);
  // O CLP escreve os dois pares sem a celula vazia no meio ("Tensao | 24 VCC | Entradas | 16").
  if (!blocos.length || blocos.some((bloco) => bloco.length % 2 !== 0)) return null;
  const pares = blocos.flatMap((bloco) =>
    Array.from({ length: bloco.length / 2 }, (_, i) => ({ nome: bloco[2 * i].replace(/\s*:\s*$/, ""), valor: bloco[2 * i + 1] })),
  );
  // Nome sem letra e linha de numeros (a tabela de medidas da cremalheira, "1,0 | 1000 | 6,9 ..."),
  // nao par da ficha.
  return pares.every((par) => /[a-zà-ú]/i.test(par.nome)) ? pares : null;
}

/**
 * Le uma tabela e diz o que ela e:
 *  - `codigos`: tabela com coluna de codigo e linhas de dados, cada linha um item
 *    `{ codigo, contexto, campos }`. `contexto` sao as linhas de secao em vigor ("Manta de Fibra
 *    Ceramica 1260ºC", "Densidade 80 (kg/m³)"), que a manta repete no meio da tabela.
 *  - `pares`: ficha "Nome | valor" (o motor de passo, o cabo do spindle, a garra "Modelo | ISO 30").
 *  - `outra`: tabela de medidas sem codigo (a cremalheira, por modulo), que fica no texto.
 */
export function lerTabela(tabelaHtml) {
  const grade = gradeDaTabela(tabelaHtml).filter((linha) => linha.some(Boolean));
  if (!grade.length) return { tipo: "vazia", grade };

  const itens = [];
  let cabecalho = null;
  let contexto = [];
  let ultimaFoiDado = false;

  const entrarNaSecao = (rotulo) => {
    // Secao nova DEPOIS de linhas de dados troca a ultima ("Densidade 80" -> "Densidade 96");
    // secao logo depois de outra e um nivel abaixo dela ("Manta 1260ºC" > "Densidade 80").
    if (ultimaFoiDado && contexto.length) contexto = [...contexto.slice(0, -1), rotulo];
    else if (!contexto.includes(rotulo)) contexto = [...contexto, rotulo];
    ultimaFoiDado = false;
  };

  for (const linha of grade) {
    const distintos = [...new Set(linha.filter(Boolean))];
    const colunaDoCodigo = linha.findIndex((celula) => ROTULO_DE_CODIGO.test(celula));

    // Cabecalho tem tres colunas ou mais: "Modelo | ISO 30" (a garra) e um par da ficha, nao o
    // cabecalho de uma tabela de codigos.
    if (colunaDoCodigo >= 0 && linha.filter(Boolean).length >= 3) {
      // Segunda linha do mesmo cabecalho (rowspan repete o rotulo do codigo na mesma coluna).
      if (cabecalho?.continua && cabecalho.coluna === colunaDoCodigo) {
        cabecalho.rotulos = cabecalho.rotulos.map((rotulo, j) =>
          !linha[j] || linha[j] === rotulo ? rotulo : rotulo ? `${rotulo} - ${linha[j]}` : linha[j],
        );
      } else {
        cabecalho = { coluna: colunaDoCodigo, rotulos: [...linha], continua: true };
      }
      ultimaFoiDado = false;
      continue;
    }

    const codigo = cabecalho ? linha[cabecalho.coluna] : null;
    if (cabecalho && distintos.length >= 2 && pareceCodigo(codigo) && codigo !== cabecalho.rotulos[cabecalho.coluna]) {
      cabecalho.continua = false;
      const campos = [];
      cabecalho.rotulos.forEach((rotulo, j) => {
        const valor = linha[j];
        if (j === cabecalho.coluna || !valor || SEM_VALOR.test(valor) || valor === rotulo) return;
        campos.push({ nome: rotulo || null, valor });
      });
      itens.push({ codigo: codigo.trim(), rotulo: cabecalho.rotulos[cabecalho.coluna], contexto: [...contexto], campos });
      ultimaFoiDado = true;
      continue;
    }

    // Linha de secao: um texto so na linha inteira (colspan), ou o "Nome | Densidade 500" da
    // gaxeta, que fica sobre o cabecalho: o que nao e rotulo de coluna vira secao.
    if (distintos.length <= 2) {
      if (cabecalho) cabecalho.continua = false;
      for (const texto of distintos) {
        if (!/^(nome|descri[cç][aã]o)$/i.test(texto)) entrarNaSecao(texto);
      }
    }
  }

  if (itens.length) return { tipo: "codigos", itens, grade };

  const pares = grade.map(paresDaLinha);
  if (pares.every(Boolean)) return { tipo: "pares", pares: pares.flat(), grade };

  return { tipo: "outra", grade };
}

// ---------------------------------------------------------------------------
// Pagina
// ---------------------------------------------------------------------------

/**
 * O trecho da pagina com o produto, do titulo ate o formulario de contato (`modal-rd`) ou o
 * "Precisando de atendimento?" (`newsletter`). Fica de fora o menu do alto, que repete em toda
 * pagina os links da fibra ceramica.
 *
 * Na pagina de produto o titulo esta dentro do `conteudo-category`; na listagem, no `div.title`
 * logo acima dele. Listagem com link para pagina de produto e so listagem: `null`.
 */
function painelDaPagina(html, url) {
  const listagem = ehListagemDaObr(url);
  if (!listagem && !ehProdutoDaObr(url)) return null;

  const inicio = html.search(listagem ? /<div\b[^>]*class=["']title["']/i : /<div\b[^>]*class=["']conteudo-category\b/i);
  if (inicio < 0) return null;
  // Corta no "<" da tag da marca: cortar na marca deixava um "<div " solto no fim do texto.
  const fins = ['id="modal-rd"', 'id="newsletter"']
    .map((marca) => html.indexOf(marca, inicio))
    .filter((fim) => fim > 0)
    .map((fim) => html.lastIndexOf("<", fim));
  const painel = html.slice(inicio, fins.length ? Math.min(...fins) : undefined);
  if (listagem && /href=["'][^"']*produtos\/item\/\d+/i.test(painel)) return null;
  return { painel, listagem };
}

/**
 * Titulo que e o proprio modelo ("OBR-SFUR-1605-4", "OBR A 15 S", "A0 1", "OL-A"): toda palavra tem
 * numero ou e sigla em maiusculas. "Cremalheira Helicoidal Q6" e "Suporte MA" sao nomes. Sem numero,
 * so sigla com hifen de ate duas palavras (o adaptador "OL-A", "OS-B OBR"): "MPG DDMPG" e nome.
 */
function tituloEhCodigo(titulo) {
  const palavras = titulo.trim().split(/\s+/);
  return (
    titulo.length <= 30 &&
    palavras.length <= 5 &&
    (/\d/.test(titulo) || (palavras.length <= 2 && titulo.includes("-"))) &&
    palavras.every((palavra) => /\d/.test(palavra) || /^[A-Z0-9½¼¾×][A-Z0-9.\-/½¼¾×–]*$/.test(palavra))
  );
}

function contem(maior, menor) {
  return Boolean(menor) && semAcento(maior).includes(semAcento(menor));
}

/**
 * Nome de um produto que saiu de uma linha da tabela da familia. Codigo com letra e o modelo
 * ("Suporte MA - MA5"); codigo so de numeros e interno, entao o nome leva o que distingue a linha
 * ("Manta de Fibra Ceramica 1260ºC - Densidade 80 (kg/m³) - 25,4 x 610 x 7.620 mm").
 */
function nomeDoItem(titulo, item) {
  // Secao que repete o titulo com mais detalhe ("Manta de Fibra Ceramica 1260ºC") toma o lugar dele.
  const maisCompleto = item.contexto.find((secao) => contem(secao, titulo));
  const partes = [maisCompleto ?? titulo, ...item.contexto.filter((secao) => secao !== maisCompleto && !contem(titulo, secao))];
  const nomeNaTabela = item.campos.find((campo) => /^(nome|descri[cç][aã]o)$/i.test(campo.nome ?? ""))?.valor;
  if (nomeNaTabela && !contem(partes.join(" "), nomeNaTabela)) partes.push(nomeNaTabela);
  if (/[a-z]/i.test(item.codigo)) partes.push(item.codigo);
  else {
    const primeiro = item.campos.find((campo) => !/^(nome|descri[cç][aã]o)$/i.test(campo.nome ?? ""))?.valor;
    partes.push(primeiro ?? item.codigo);
  }
  return partes.filter(Boolean).join(" - ");
}

/** Fotos do painel, do proprio site: a principal (ao lado do texto) e os desenhos no meio do texto. */
function fotosDoPainel(painel, base) {
  const principal = /<div\b[^>]*class=["'][^"']*height-img[^"']*["'][^>]*>([\s\S]*?)<\/div>/i.exec(painel)?.[1] ?? "";
  const todas = [principal, painel]
    .flatMap((trecho) => [...trecho.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((achado) => achado[1].trim()))
    // So o que mora nas pastas de produto (e, na listagem, a foto da subcategoria): o resto e icone
    // do site (PDF, WhatsApp, interrogacao).
    .filter((endereco) => /(^|\/)uploads\/(produtos|arquivos|subcategoria|divisao)\//i.test(endereco))
    .map((endereco) => comoUrlAbsoluta(endereco, base))
    .filter(Boolean);
  return [...new Set(todas)];
}

/**
 * Le a pagina de produto da OBR. `null` fora dela (outro site, listagem, pagina sem o painel).
 *
 * Devolve os produtos ja no formato de campos do normalizador (`name`, `code`, `description`,
 * `specifications`, `images`, `category`, `model`), cada um com a origem de cada campo.
 */
export function produtosDaObr(html, url) {
  if (typeof html !== "string") return null;
  const pagina = painelDaPagina(html, url);
  if (!pagina) return null;
  const { painel, listagem } = pagina;

  const titulo = comoTexto(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i.exec(painel)?.[1])?.replace(/\s+/g, " ") ?? null;
  if (!titulo) return null;

  const base = baseDaPagina(html, url);
  const corpo = painel.slice(painel.search(/<\/h2>/i) + 5).split(/<div\b[^>]*class=["'][^"']*height-img/i)[0];

  const tabelas = [...corpo.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((achado) => ({
    html: achado[0],
    lida: lerTabela(achado[0]),
  }));
  const lidos = tabelas.flatMap((tabela) => (tabela.lida.tipo === "codigos" ? tabela.lida.itens : []));
  const pares = tabelas.flatMap((tabela) => (tabela.lida.tipo === "pares" ? tabela.lida.pares : []));
  // Listagem so vira produto pela tabela de modelos; sem ela e pagina de navegacao.
  if (listagem && !lidos.length) return null;

  // TABELA DE COMPATIBILIDADE: no adaptador "OL-A" e na graxeira "G-PT1/8" a coluna "Modelo" traz as
  // GUIAS em que a peca serve ("MSA20 – MSB20", "OBR-A 45") e a propria peca aparece numa coluna ao
  // lado. Dividir por ela fazia quatro adaptadores diferentes (OL-A, OL-B, OS-A, OS-B) virarem os
  // mesmos produtos "MSA20 – MSB20": a chave do banco e o codigo, e os quatro se juntariam num so.
  // A peca pode vir so com o comeco do titulo: "OL-A" na tabela do "OL-A OBR".
  const ehAPropriaPeca = (valor) => {
    const peca = semAcento(valor);
    return /[a-z]/.test(peca) && (peca === semAcento(titulo) || semAcento(titulo).startsWith(`${peca} `));
  };
  const compativeis = lidos.some((item) => item.campos.some((campo) => ehAPropriaPeca(campo.valor)));
  // O mesmo codigo duas vezes na pagina (a manta repete o 8061 em duas densidades; o JM2-55 tem duas
  // linhas) fica com a primeira linha: seriam dois produtos com a mesma chave no banco.
  const vistos = new Set();
  const itens = compativeis
    ? []
    : lidos.filter((item) => !vistos.has(item.codigo.toUpperCase()) && vistos.add(item.codigo.toUpperCase()));
  const compatibilidade = compativeis
    ? [{
        nome: `${lidos[0].rotulo || "Modelo"} (serve em)`,
        valor: [...new Set(lidos.flatMap((item) => [
          item.codigo,
          ...item.campos.filter((campo) => campo.nome === item.rotulo).map((campo) => campo.valor),
        ]))].join(", "),
      }]
    : [];

  // Texto da pagina sem os botoes (WhatsApp, "Download dos arquivos em 3D", que abrem formulario de
  // contato) e sem as tabelas que viraram codigo e ficha; tabela de medidas sem codigo fica, linha a
  // linha, com " | " entre as colunas (sem isso os numeros de colunas diferentes se misturavam).
  let texto = corpo
    .replace(/<a\b[^>]*class=["'][^"']*btn[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, " ")
    // "Download dos arquivos em 3D: .step" no meio do texto leva a um formulario de cadastro
    // (Bitrix24), nao ao arquivo.
    .replace(/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?Download dos arquivos em 3D[\s\S]*?<\/p>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  for (const tabela of tabelas) {
    const substituta =
      tabela.lida.tipo === "outra" ? `<p>${tabela.lida.grade.map((linha) => linha.join(" | ")).join("<br>")}</p>` : " ";
    texto = texto.replace(tabela.html, () => substituta);
  }
  const description = comoTexto(texto);

  const degraus = [...(/<ol\b[^>]*class=["'][^"']*breadcrumb[^"']*["'][^>]*>([\s\S]*?)<\/ol>/i.exec(html)?.[1] ?? "")
    .matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)]
    .filter((degrau) => !/\bactive\b/i.test(degrau[1]))
    .map((degrau) => comoTexto(degrau[2])?.replace(/\s+/g, " "));
  // Sem o nome do produto: o degrau dele (`active`) ja saiu, e com o nome a regra de "tirar o
  // produto do fim da trilha" levava junto "Motor de Passo" do "Motor de Passo NEMA 23 (12kgf.cm)".
  const category = caminhoDeCategoria(degraus);

  const images = fotosDoPainel(painel, base);

  const comum = {
    description,
    category,
    images,
    origens: {
      name: "titulo da pagina da OBR (h2)",
      ...(description ? { description: "texto da pagina da OBR" } : {}),
      ...(category ? { category: "breadcrumb da pagina" } : {}),
      ...(images.length ? { images: `${images.length} foto(s) do painel do produto` } : {}),
    },
  };

  const modeloDe = (campos) => campos.find((campo) => /^modelo$/i.test(campo.nome ?? ""))?.valor ?? null;

  // Familia: um produto por codigo da tabela.
  if (itens.length > 1) {
    return itens
      .map((item) => {
        const specifications = [
          ...item.contexto.filter((secao) => !contem(titulo, secao)).map((secao) => ({ nome: null, valor: secao })),
          ...item.campos,
          ...pares,
        ];
        return {
          ...comum,
          name: nomeDoItem(titulo, item),
          code: item.codigo,
          model: modeloDe(specifications),
          specifications,
          origens: {
            ...comum.origens,
            name: "titulo da pagina da OBR + a linha da tabela de codigos",
            code: `tabela de codigos da pagina (${itens.length} linhas)`,
            specifications: "linha da tabela de codigos da pagina",
          },
        };
      });
  }

  // O titulo que e o proprio modelo vence a tabela: na pagina do RFSI5010-4.0P a tabela (copiada
  // de outra pagina) diz RFSI2005-4.0P, e o endereco e o titulo dizem 5010.
  const escrito = /C[oó]d(?:igo|\.)?\s*:\s*([^\n]+)/i.exec(description ?? "")?.[1]?.trim();
  const daTabela = itens[0]?.codigo ?? null;
  const [code, origemDoCodigo] = escrito && pareceCodigo(escrito)
    ? [escrito, 'escrito na pagina ("Codigo:")']
    : tituloEhCodigo(titulo)
      ? [titulo, "titulo da pagina, que e o proprio modelo"]
      : daTabela
        ? [daTabela, "tabela do modelo na pagina"]
        : [null, null];

  const specifications = [...(itens[0]?.campos ?? []), ...compatibilidade, ...pares];
  return [
    {
      ...comum,
      name: titulo,
      code,
      model: modeloDe(specifications),
      specifications,
      origens: {
        ...comum.origens,
        ...(code ? { code: origemDoCodigo } : {}),
        ...(specifications.length ? { specifications: "tabelas da pagina" } : {}),
      },
    },
  ];
}

/**
 * O mesmo, no formato de `extrairProduto` (a navegacao e o teste de fonte so querem saber se a
 * pagina e produto, com titulo, codigo e fotos).
 */
export function extracaoDaObr(html, url) {
  const produtos = produtosDaObr(html, url);
  if (!produtos?.length) return null;
  const [primeiro] = produtos;
  return {
    encontrado: true,
    fonte: "pagina da OBR",
    titulo: primeiro.name,
    descricao: primeiro.description,
    marca: null,
    modelo: primeiro.model,
    mpn: null,
    skuFonte: primeiro.code,
    ean: null,
    preco: null,
    disponivel: true,
    imagens: primeiro.images,
    atributos: null,
    bruto: null,
  };
}
