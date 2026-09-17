import { camposPreenchidos, ROTULOS_CAMPOS } from "./campos";
import { podeVisitar, registrarResposta, USER_AGENT } from "./buscar";
import { obter } from "./http";

/**
 * Portal de fornecedor na plataforma Add Suite (ASP.NET WebForms), com LOGIN e
 * varrido POR CATEGORIA. Primeiro caso: a Santana (santanaimport.com.br), em
 * 17/09/2026. As regras da fonte (ritmo, itens por pagina) estao em
 * fornecedores.js; aqui fica so a leitura.
 *
 * O QUE FOI MEDIDO NO SITE:
 * - Sem login a vitrine diz "Faca o login para visualizar o preco".
 * - Login: GET /minhaconta/identificacao, POST com os campos ocultos
 *   (__VIEWSTATE...), __EVENTTARGET = lkEntrar, tblogin e tbSenha. Responde 302
 *   para PainelCliente, e a sessao e o cookie ASP.NET_SessionId. Sem captcha.
 * - A pagina da categoria nao traz produto no HTML: chama
 *   /handlers/departamento/CategoriaResult.ashx, que devolve JSON com `html` da
 *   vitrine e `total_registros`. Cada item ja tem link COM ?sku=, codigo, preco,
 *   IPI, ST, preco com impostos, caixa inner/master, faixas de quantidade,
 *   multiplo de venda e o botao de comprar — a pagina do produto nao e aberta.
 * - A PAGINACAO REPETE E PULA PRODUTOS. A ordem tem empates que o site nao
 *   desempata: na Componentes (7.068) a pagina 40 de 100 veio inteira com itens
 *   das paginas 34 e 35. Por isso a leitura nunca para na pagina repetida, vai ate
 *   a ultima pelo `total_registros`, e repassa em outra ordenacao enquanto faltar.
 * - Cada item traz foto embutida em base64 (~150 KB). O teto de corpo e alto
 *   por isso, e a foto e descartada antes de ler.
 */

/// Uma lista de 50 itens tem ~8 MB com as fotos embutidas. Folga para 100.
const TETO_CORPO = 64 * 1024 * 1024;
/// Lista grande e lenta de servir; a pagina de 100 levou ate 7 s.
const TEMPO_POR_PEDIDO_MS = 120000;
/// O que aparece nos campos que a lista nao traz.
const NA_PAGINA_DO_PRODUTO = "nao vem na lista: veja no link do produto";
/// As tres ordenacoes que o site aceita. Cada uma empata em lugares diferentes.
const ORDENACOES = ["0", "1", "2"];

const esperar = (ms, sinal) =>
  new Promise((ok, falha) => {
    if (sinal?.aborted) return falha(sinal.reason ?? new Error("Cancelado"));
    const relogio = setTimeout(() => {
      sinal?.removeEventListener("abort", aoAbortar);
      ok();
    }, ms);
    const aoAbortar = () => {
      clearTimeout(relogio);
      falha(sinal.reason ?? new Error("Cancelado"));
    };
    sinal?.addEventListener("abort", aoAbortar, { once: true });
  });

const decodificar = (texto) =>
  String(texto ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const semTags = (html) => decodificar(String(html ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/** "R$ 1.234,56" -> 1234.56; sem valor, null. */
const reais = (texto) => {
  const achado = /R\$\s*([\d.]+,\d{2})/.exec(texto ?? "");
  return achado ? Number(achado[1].replace(/\./g, "").replace(",", ".")) : null;
};

/**
 * O link da categoria vira os parametros do CategoriaResult.ashx: o ultimo
 * trecho e a `subcategoria` e o penultimo a `categoria`; com um trecho so, ele e
 * a `categoria`. Medido nos tres niveis:
 *   componentes.html                       -> categoria=componentes
 *   componentes/roboticos.html             -> categoria=componentes, subcategoria=roboticos
 *   antenas/amplificadores-de-sinal/satelite-finder.html
 *                                          -> categoria=amplificadores-de-sinal, subcategoria=satelite-finder
 *
 * @returns {{origem: string, url: string, caminho: string, categoria: string, subcategoria: string}|null}
 */
export function parametrosDaCategoria(endereco) {
  let alvo;
  try {
    alvo = new URL(/^https?:\/\//i.test(endereco) ? endereco : `https://${endereco}`);
  } catch {
    return null;
  }
  // Categoria termina em .html; PRODUTO em .htm (?sku=). Aceitar os dois
  // cadastraria uma pagina de produto como categoria.
  if (!/\.html$/i.test(alvo.pathname)) return null;

  const caminho = alvo.pathname.replace(/\.html$/i, "").replace(/^\/+|\/+$/g, "");
  const trechos = caminho.split("/").filter(Boolean);
  if (trechos.length === 0) return null;

  return {
    origem: alvo.origin,
    // Sem o ?p=1 e sem ancora: o mesmo link colado duas vezes e a mesma categoria.
    url: `${alvo.origin}/${caminho}.html`,
    caminho,
    categoria: trechos.length === 1 ? trechos[0] : trechos.at(-2),
    subcategoria: trechos.length === 1 ? "" : trechos.at(-1),
  };
}

/**
 * Os produtos do `html` da vitrine, ja no formato de normalizar.js.
 *
 * @param {string} html
 * @param {object} contexto
 * @param {string} contexto.categoria  caminho da categoria, vira `category`
 * @param {{name: string, type: string}} contexto.fonte
 */
export function produtosDaVitrine(html, { categoria = null, fonte = null } = {}) {
  // A foto em base64 e 95% do texto e nao interessa aqui.
  const leve = String(html ?? "")
    .replace(/data:[a-z/+.-]+;base64,[A-Za-z0-9+/=]+/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "");
  const origem = "lista da categoria no portal (com login)";

  return leve
    .split(/<li\b/)
    .slice(1)
    .map((bloco) => {
      const titulo = /<div class="titulo">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(bloco);
      if (!titulo) return null;

      const linhaDoDetalhe = (rotulo) => {
        const achado = new RegExp(`<span[^>]*>\\s*${rotulo}[\\s\\S]*?</span\\s*>\\s*<p>([\\s\\S]*?)</p>`, "i").exec(
          bloco,
        );
        return achado ? semTags(achado[1]) : null;
      };

      // So produto compravel tem data-sku; o esgotado mostra o codigo em "Ref:".
      const codigo = /data-sku="([^"]+)"/.exec(bloco)?.[1] ?? /Ref:\s*([^<]+)/.exec(bloco)?.[1]?.trim() ?? null;
      const preco = reais(/<span class="valor">([^<]+)</.exec(bloco)?.[1]);
      const comImpostos = reais(linhaDoDetalhe("PRE[ÇC]O UNIT\\. COM IMP\\."));
      const ipiPercentual = Number((/IPI[\s\S]*?<strong>([\d.,]+)%<\/strong>/.exec(bloco)?.[1] ?? "").replace(",", ".")) || 0;
      const st = reais(linhaDoDetalhe("ST"));
      const multiplo = Number(/adicionarMaisVitrini\('[^']*',\s*(\d+)\)/.exec(bloco)?.[1] ?? 1);
      const caixaInner = Number(/CX\. INNER<\/span>\s*<p>\s*(\d+)/.exec(bloco)?.[1] ?? 0);
      const caixaMaster = Number(/CX\. MASTER<\/span>\s*<p>\s*(\d+)/.exec(bloco)?.[1] ?? 0);
      const compravel = /id="bt_comprar_/.test(bloco);
      const foto = /<img[^>]+src="(https?:[^"]+)"/.exec(bloco)?.[1];

      // "10 - 19 Unidades" e ">20 Unidades": o rotulo fica como o portal escreve,
      // e os limites vao em numero para a tela e para quem comparar depois.
      const faixas = [...bloco.matchAll(/<span>\s*([^<]*Unidades)\s*<\/span>\s*<p>\s*(R\$\s*[\d.,]+)/gi)]
        .map((m) => {
          const rotulo = decodificar(m[1]).replace(/\s+/g, " ").trim();
          const numeros = (rotulo.match(/\d+/g) ?? []).map(Number);
          return {
            rotulo,
            minimo: numeros[0] ?? null,
            maximo: numeros.length > 1 ? numeros[1] : null,
            preco: reais(m[2]),
          };
        })
        .filter((faixa) => faixa.preco !== null);

      // Preco zero e produto sem preco, nao gratis: e o que o portal mostra no
      // item fora de linha, sem botao de comprar.
      const normal = preco > 0 ? preco : null;

      // O ST vem em reais; vira percentual do preco para caber em `taxes`, que
      // a tela soma e descreve ("IPI 7% + ST 1,5%").
      const impostos = [];
      if (ipiPercentual > 0) impostos.push({ nome: "IPI", percentual: ipiPercentual });
      if (st > 0 && normal) impostos.push({ nome: "ST", percentual: Math.round((st / normal) * 10000) / 100 });

      // Faixa de preco e multiplo de venda NAO sao caracteristica do produto
      // (o dono, 17/09/2026): sao regra de compra, com campo e caixa proprios.
      const especificacoes = [];
      if (caixaInner > 0) especificacoes.push({ nome: "Caixa inner", valor: `${caixaInner} un.` });
      if (caixaMaster > 0) especificacoes.push({ nome: "Caixa master", valor: `${caixaMaster} un.` });

      return {
        name: semTags(titulo[2]),
        code: codigo ?? "N/A",
        mpn: null,
        ean: null,
        brand: null,
        model: null,
        category: categoria,
        ncm: null,
        url: decodificar(titulo[1]),
        images: foto && !/sem_img\./i.test(foto) ? [foto] : [],
        prices: {
          normal,
          promotional: null,
          reserva: null,
          // O que o PORTAL calcula, e nao a nossa conta: inclui o ST em reais.
          comImpostos: normal && comImpostos > 0 ? comImpostos : null,
        },
        taxes: impostos,
        precosPorQuantidade: normal ? faixas : [],
        multiploVenda: multiplo > 0 ? multiplo : null,
        // Sem quantidade: o portal so diz se da para comprar.
        stock: { status: compravel ? "IN_STOCK" : "OUT_OF_STOCK", quantity: null, aChegar: null },
        description: null,
        specifications: especificacoes,
        documentos: [],
        variants: [],
        seo: {},
        collectedAt: new Date().toISOString(),
        origens: {
          code: codigo ? origem : "sem codigo na lista — marcado N/A",
          name: origem,
          // Marca e codigo de barras existem so na PAGINA do produto. O dono
          // decidiu (17/09/2026) nao abri-la na varredura — seria uma visita de
          // 1,5 MB por produto a 30 s — e sim dizer no campo onde o dado esta.
          // So este leitor grava o aviso: vale apenas para a Santana.
          brand: NA_PAGINA_DO_PRODUTO,
          ean: NA_PAGINA_DO_PRODUTO,
          ...(normal !== null ? { price: origem } : {}),
        },
        fonte,
      };
    })
    .filter(Boolean);
}

/**
 * Sessao de um portal Add Suite: cookies, ritmo e login.
 *
 * O ritmo vale entre TODOS os pedidos desta sessao, login incluido. Conexao
 * cortada vira erro com recado claro e nao se insiste: foi assim que a Santana
 * sinalizou o bloqueio.
 */
export function criarSessao({ origem, usuario, senha, ritmoMs, sinal = null }) {
  const host = new URL(origem).hostname;
  const cookies = new Map();
  let ultimoPedidoEm = 0;
  let pedidos = 0;

  async function pedir(endereco, { metodo = "GET", corpo = null } = {}) {
    let url = endereco;
    for (let saltos = 0; saltos <= 5; saltos++) {
      const espera = ultimoPedidoEm + ritmoMs - Date.now();
      if (espera > 0) await esperar(espera, sinal);

      const teto = AbortSignal.timeout(TEMPO_POR_PEDIDO_MS);
      let resposta;
      try {
        resposta = await obter(url, {
          metodo: saltos === 0 ? metodo : "GET",
          corpo: saltos === 0 ? corpo : null,
          seguir: false,
          sinal: sinal ? AbortSignal.any([teto, sinal]) : teto,
          tetoDoCorpo: (status) => (status >= 200 && status < 300 ? TETO_CORPO : 0),
          cabecalhos: {
            "User-Agent": USER_AGENT,
            Cookie: [...cookies].map(([nome, valor]) => `${nome}=${valor}`).join("; "),
            ...(corpo !== null && saltos === 0 ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
          },
        });
      } catch (erro) {
        if (sinal?.aborted) throw erro;
        if (erro?.code === "ECONNRESET") {
          throw new Error(
            "o portal cortou a conexao (ECONNRESET) — costuma ser bloqueio por excesso de acesso; a varredura para aqui",
          );
        }
        throw new Error(teto.aborted ? "o portal nao respondeu em 2 minutos" : `falha de rede: ${erro?.message ?? erro}`);
      } finally {
        ultimoPedidoEm = Date.now();
        pedidos++;
        // O vigia do worker olha isto: com 30 s entre pedidos, e o que prova
        // que a varredura anda.
        registrarResposta(host);
      }

      for (const linha of resposta.setCookie ?? []) {
        const [par] = linha.split(";");
        const posicao = par.indexOf("=");
        if (posicao > 0) cookies.set(par.slice(0, posicao).trim(), par.slice(posicao + 1).trim());
      }

      if (resposta.status >= 300 && resposta.status < 400 && resposta.localizacao) {
        url = new URL(resposta.localizacao, url).toString();
        continue;
      }

      return {
        status: resposta.status,
        texto: resposta.bytes ? resposta.bytes.toString("utf-8") : "",
        urlFinal: url,
      };
    }
    throw new Error("redirecionamentos demais");
  }

  async function entrar() {
    const pagina = await pedir(`${origem}/minhaconta/identificacao`);
    if (pagina.status !== 200) throw new Error(`pagina de login respondeu HTTP ${pagina.status}`);

    const campos = new Map();
    for (const [input] of pagina.texto.matchAll(/<input[^>]*type="hidden"[^>]*>/gi)) {
      const nome = /name="([^"]+)"/i.exec(input)?.[1];
      if (nome && !campos.has(nome)) campos.set(nome, decodificar(/value="([^"]*)"/i.exec(input)?.[1] ?? ""));
    }
    if (!campos.has("__VIEWSTATE")) throw new Error("a pagina de login mudou: nao ha __VIEWSTATE");

    campos.set("__EVENTTARGET", "ctl00$ContentPlaceHolder1$lkEntrar");
    campos.set("__EVENTARGUMENT", "");
    campos.set("ctl00$ContentPlaceHolder1$tblogin", usuario);
    campos.set("ctl00$ContentPlaceHolder1$tbSenha", senha);

    const depois = await pedir(`${origem}/minhaconta/identificacao`, {
      metodo: "POST",
      corpo: new URLSearchParams([...campos]).toString(),
    });
    // "SAIR" so aparece para quem entrou; "PainelCliente" aparece tambem no anonimo.
    if (!/>\s*SAIR\s*</i.test(depois.texto)) {
      throw new Error("o portal recusou o login — confira o e-mail e a senha guardados na fonte");
    }
  }

  /** Uma pagina da vitrine de uma categoria. */
  async function lerPagina({ categoria, subcategoria, pagina, porPagina, ordenacao = "0" }) {
    const consulta = new URLSearchParams({
      subcategoria,
      categoria,
      qtdePorPagina: String(porPagina),
      paginaAtual: String(pagina),
      ordenacao,
      busca: "",
      precoMin: "0",
      precoMax: "0",
      filtros: "",
      vitrine: "",
    });
    const resposta = await pedir(`${origem}/handlers/departamento/CategoriaResult.ashx?${consulta}`);
    if (resposta.status !== 200) throw new Error(`a lista da categoria respondeu HTTP ${resposta.status}`);

    let dados;
    try {
      dados = JSON.parse(resposta.texto);
    } catch {
      throw new Error("a lista da categoria nao veio em JSON — o portal pode ter mudado");
    }
    return {
      html: dados.html ?? "",
      total: Number(dados.total_registros) || 0,
      // A sessao caiu: a vitrine volta a pedir login no lugar do preco.
      semSessao: /Login para visualizar o/i.test(dados.html ?? ""),
    };
  }

  return { entrar, lerPagina, pedidos: () => pedidos };
}

/**
 * Le as categorias informadas, produto por produto via `aoGuardar`.
 *
 * @param {object} opcoes
 * @param {{usuario: string, senha: string}} opcoes.credencial
 * @param {{url: string}[]} opcoes.categorias
 * @param {{name: string, type: string}} opcoes.fonte
 * @param {number} opcoes.ritmoMs
 * @param {number} opcoes.porPagina
 * @param {number} [opcoes.limite]
 * @param {AbortSignal} [opcoes.sinal]
 * @param {(produto: object) => void} [opcoes.aoGuardar]
 * @param {(andamento: {total: number|null, feitas: number, visitadas: number}) => void} [opcoes.aoProgredir]
 */
export async function colherPortal({
  credencial,
  categorias,
  fonte,
  ritmoMs,
  porPagina,
  limite = Infinity,
  sinal = null,
  aoGuardar,
  aoProgredir,
}) {
  const lidas = categorias.map((item) => parametrosDaCategoria(item.url)).filter(Boolean);
  if (lidas.length === 0) throw new Error("nenhuma categoria valida cadastrada nesta fonte");
  if (!credencial?.usuario || !credencial?.senha) throw new Error("fonte sem login guardado");

  const permissao = await podeVisitar(lidas[0].url);
  if (!permissao.permitido) throw new Error(`o robots.txt do portal nos bloqueia: ${permissao.motivo}`);

  const sessao = criarSessao({ origem: lidas[0].origem, ...credencial, ritmoMs, sinal });
  await sessao.entrar();

  const vistos = new Set();
  const totais = new Map();
  const porCategoria = [];
  const somaDosTotais = () => (totais.size > 0 ? [...totais.values()].reduce((a, b) => a + b, 0) : null);
  const avisar = () => aoProgredir?.({ total: somaDosTotais(), feitas: vistos.size, visitadas: sessao.pedidos() });

  for (const categoria of lidas) {
    const daCategoria = new Set();
    let total = null;

    for (const ordenacao of ORDENACOES) {
      if (vistos.size >= limite) break;
      // Todos os itens da categoria ja vieram: outra ordenacao so repetiria.
      if (total !== null && daCategoria.size >= total) break;

      let ultimaPagina = Infinity;
      for (let pagina = 1; pagina <= ultimaPagina; pagina++) {
        if (sinal?.aborted) throw sinal.reason ?? new Error("Cancelado");

        let lida = await sessao.lerPagina({ ...categoria, pagina, porPagina, ordenacao });
        if (lida.semSessao) {
          // Sessao expirada no meio: entra de novo UMA vez e repete a pagina.
          await sessao.entrar();
          lida = await sessao.lerPagina({ ...categoria, pagina, porPagina, ordenacao });
          if (lida.semSessao) throw new Error("o portal voltou a pedir login logo depois de entrar");
        }

        if (pagina === 1) {
          total = lida.total;
          totais.set(categoria.url, total);
          ultimaPagina = Math.ceil(total / porPagina);
        }

        const produtos = produtosDaVitrine(lida.html, { categoria: categoria.caminho, fonte });
        for (const produto of produtos) {
          // Sem codigo, o endereco identifica: dois "N/A" sao produtos diferentes.
          const chave = produto.code !== "N/A" ? produto.code : produto.url;
          daCategoria.add(chave);
          if (vistos.has(chave) || vistos.size >= limite) continue;
          vistos.add(chave);
          aoGuardar?.(produto);
        }
        avisar();

        if (produtos.length === 0 || vistos.size >= limite) break;
      }
    }

    porCategoria.push({ url: categoria.url, total, lidos: daCategoria.size });
  }

  return {
    produtos: vistos.size,
    visitas: sessao.pedidos(),
    produtosNoSite: somaDosTotais(),
    porCategoria,
  };
}

/**
 * "Buscar dados" do cadastro para um portal com login: entra, le UMA pagina
 * curta da categoria e devolve no formato de testarFonte. Nada e gravado.
 */
export async function testarPortal({ url, usuario, senha, nome, tipo }) {
  const passos = [];
  const passo = (nomeDoPasso, ok, detalhe) => passos.push({ nome: nomeDoPasso, ok, detalhe: detalhe ?? null });
  const plataforma = {
    id: "addsuite",
    nome: "Add Suite (portal de fornecedor com login)",
    familia: null,
    confianca: "alta",
    sinais: ["regra do fornecedor em fornecedores.js"],
    alternativas: [],
    conferidaEm: "2026-09-17",
    entrega: {
      resumo:
        "O preco so aparece com login. A lista de cada categoria ja traz preco, IPI, ST, preco com impostos, faixas de quantidade e multiplo de venda, sem abrir a pagina do produto. Sem quantidade em estoque: so se da para comprar.",
      cuidados: [
        "Varrido so pelas categorias cadastradas na fonte, uma pagina a cada 30 s.",
        "O login fica cifrado na fonte e nunca volta para a tela.",
      ],
    },
  };
  const falha = (motivo) => ({
    resultado: "FALHA",
    motivo,
    passos,
    produtos: [],
    campos: null,
    formatos: [],
    plataforma,
    catalogoPublico: null,
    produtosNoSite: null,
    produtosNoSiteParcial: false,
  });

  const categoria = parametrosDaCategoria(url);
  if (!categoria) {
    passo("Link de categoria", false, "use o link de uma categoria do portal, terminado em .html");
    return falha("Informe o link de uma CATEGORIA (ex.: https://santanaimport.com.br/componentes.html).");
  }
  passo(
    "Link de categoria",
    true,
    `categoria=${categoria.categoria}${categoria.subcategoria ? ` · subcategoria=${categoria.subcategoria}` : ""}`,
  );

  if (!usuario?.trim() || !senha) {
    passo("Login", false, "informe o e-mail e a senha do portal");
    return falha("Este fornecedor so mostra preco com login. Informe o e-mail e a senha do portal.");
  }

  const permissao = await podeVisitar(categoria.url);
  passo("robots.txt analisado", permissao.permitido, permissao.motivo ?? "permite a coleta");
  if (!permissao.permitido) return falha(`O robots.txt deste site nos bloqueia: ${permissao.motivo}`);

  // Ritmo curto aqui: sao quatro pedidos, com alguem esperando na tela.
  const sessao = criarSessao({ origem: categoria.origem, usuario: usuario.trim(), senha, ritmoMs: 3000 });
  try {
    await sessao.entrar();
    passo("Login", true, "entrou no portal");
  } catch (erro) {
    passo("Login", false, erro.message);
    return falha(erro.message);
  }

  const fonte = { name: nome || "Portal", type: tipo || "FORNECEDOR" };
  let lida;
  try {
    lida = await sessao.lerPagina({ ...categoria, pagina: 1, porPagina: 12 });
  } catch (erro) {
    passo("Lista da categoria", false, erro.message);
    return falha(erro.message);
  }

  const produtos = produtosDaVitrine(lida.html, { categoria: categoria.caminho, fonte });
  const comPreco = produtos.filter((produto) => produto.prices.normal !== null);
  passo(
    "Lista da categoria",
    produtos.length > 0,
    `${lida.total.toLocaleString("pt-BR")} produto(s) na categoria · ${produtos.length} lidos na primeira pagina, ${comPreco.length} com preco`,
  );
  if (lida.semSessao) passo("Sessao", false, "a lista voltou pedindo login");

  if (produtos.length === 0) return falha("A categoria nao trouxe produtos.");

  // A previa mostra quem tem preco: e o que o login precisava provar.
  const amostra = [...comPreco, ...produtos.filter((p) => p.prices.normal === null)].slice(0, 3);

  const presentes = {};
  for (const produto of produtos) {
    for (const [campo, tem] of Object.entries(camposPreenchidos(produto))) {
      presentes[campo] = presentes[campo] || tem;
    }
  }
  const encontrados = Object.entries(presentes).filter(([, tem]) => tem).map(([campo]) => ROTULOS_CAMPOS[campo]);
  const ausentes = Object.entries(presentes).filter(([, tem]) => !tem).map(([campo]) => ROTULOS_CAMPOS[campo]);

  return {
    resultado: comPreco.length > 0 ? "PARCIAL" : "FALHA",
    motivo: comPreco.length > 0 ? null : "A lista veio sem preco: o login pode nao ter valido.",
    passos,
    produtos: amostra,
    formatos: ["lista do portal"],
    campos: { encontrados, ausentes },
    plataforma,
    catalogoPublico: null,
    produtosNoSite: lida.total,
    produtosNoSiteParcial: false,
    categoria: { url: categoria.url, total: lida.total },
  };
}
