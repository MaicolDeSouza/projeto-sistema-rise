/**
 * Loja MAGAZORD (Proesi, 04/11/2026): a pagina do produto e montada no navegador (React), e o HTML que chega traz o
 * produto inteiro num JSON dentro de um <script>: `const dataProduct = { id: '...', produto: {...} }`.
 *
 * O JSON-LD da pagina so tem a PRIMEIRA foto e a descricao achatada numa linha so ("... Dados Tecnicos: Material PP
 * preto ... Medidas: 35x60x75 mm ..."), entao a ficha que sai da descricao vinha vazia e a 2a foto nunca chegava (pedido
 * do dono: "nao esta importando todas as fotos. As especificacoes tambem nao foram preenchidas"). Daqui saem:
 *   - `midias`: TODAS as fotos, na ordem da loja (a original, sem o `?ims=` de redimensionamento);
 *   - `descricao`: o HTML com <h3> e <p>, que vira texto com uma linha por paragrafo (e a ficha "Dados Tecnicos");
 *   - `caracteristicas`: [{nome, valor}] que a loja declara ("Tamanho: 35X60X75mm");
 *   - `estoque_depositos`: a soma do saldo dos depositos (sem eles, `qtde_estoque`).
 */

/** O objeto JSON que comeca em `inicio` (um "{"), lido respeitando strings e escapes; null se nao fechar. */
function objetoJsonEm(texto, inicio) {
  let profundidade = 0;
  let emString = false;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (emString) {
      if (c === "\\") i++;
      else if (c === '"') emString = false;
      continue;
    }
    if (c === '"') emString = true;
    else if (c === "{") profundidade++;
    else if (c === "}" && --profundidade === 0) return texto.slice(inicio, i + 1);
  }
  return null;
}

/** O `produto` do `dataProduct` da pagina, ou null quando a pagina nao e de produto Magazord. */
export function produtoDaMagazord(html) {
  const ancora = /const\s+dataProduct\s*=\s*\{[\s\S]{0,400}?\bproduto\s*:\s*\{/.exec(html ?? "");
  if (!ancora) return null;
  const json = objetoJsonEm(html, ancora.index + ancora[0].length - 1);
  if (!json) return null;
  try {
    const produto = JSON.parse(json);
    return produto && typeof produto === "object" ? produto : null;
  } catch {
    return null;
  }
}

const TITULO_DE_FICHA = /^(especifica[cç](?:[õo]es|ao|ão)(?: t[eé]cnicas?)?|ficha t[eé]cnica|dados t[eé]cnicos|caracter[ií]sticas t[eé]cnicas)\s*:?$/i;

/** Texto puro de um trecho de HTML (sem tags, entidades desfeitas, espacos juntos). */
function textoDoTrecho(trecho, paraTexto) {
  return (paraTexto(trecho) ?? "").replace(/\s+/g, " ").trim();
}

/**
 * A ficha que a loja escreve na descricao: os paragrafos DEPOIS de um titulo "Dados Tecnicos" / "Especificacoes", ate o
 * proximo titulo. "Medidas: 35x60x75 mm" vira {nome, valor}; linha sem dois-pontos ("Material PP preto (outros sob
 * consulta).") entra sem nome. A regra geral da descricao encerra a ficha nessa linha (linha em branco seguida de algo que
 * nao e par), e aqui o HTML da loja diz exatamente onde a secao comeca e termina.
 */
export function fichaDaDescricaoMagazord(descricaoHtml, paraTexto) {
  if (typeof descricaoHtml !== "string") return [];
  const blocos = [...descricaoHtml.matchAll(/<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => ({
    titulo: /^h/i.test(m[1]),
    texto: textoDoTrecho(m[2], paraTexto),
  }));
  const ficha = [];
  let dentro = false;
  for (const bloco of blocos) {
    if (!bloco.texto) continue;
    if (bloco.titulo) {
      if (dentro) break;
      dentro = TITULO_DE_FICHA.test(bloco.texto);
      continue;
    }
    if (!dentro) continue;
    const par = /^([^:]{1,40}):\s*(.+)$/.exec(bloco.texto);
    ficha.push(par ? { nome: par[1].trim(), valor: par[2].trim() } : { nome: null, valor: bloco.texto });
  }
  return ficha;
}

/** A foto original no CDN: o `?ims=fit-in/600x600/...` e so um redimensionamento (13 KB contra 39 KB da original). */
export function fotoOriginalDaMagazord(endereco) {
  if (typeof endereco !== "string") return endereco;
  try {
    const url = new URL(endereco);
    if (!/(^|\.)magazord\.com\.br$/i.test(url.hostname) || !url.pathname.startsWith("/img/")) return endereco;
    return `${url.origin}${url.pathname}`;
  } catch {
    return endereco;
  }
}

/**
 * O que a pagina Magazord da sobre o produto, ja no vocabulario do normalizador. Campo que a loja nao trouxe fica
 * null ou lista vazia, nunca inventado.
 *
 * @param {string} html
 * @param {(blocoHtml: string) => string|null} paraTexto  o leitor de bloco de descricao do normalizador
 */
export function dadosDaMagazord(html, paraTexto) {
  const produto = produtoDaMagazord(html);
  if (!produto) return null;

  const imagens = (Array.isArray(produto.midias) ? produto.midias : [])
    .filter((midia) => midia && Number(midia.tipo_midia ?? 1) === 1)
    .map((midia) => fotoOriginalDaMagazord(midia.midia_url))
    .filter((endereco) => typeof endereco === "string" && /^https?:\/\//i.test(endereco));

  const descricao = typeof produto.descricao === "string" && produto.descricao.trim() ? paraTexto(produto.descricao) : null;

  const especificacoes = (Array.isArray(produto.caracteristicas) ? produto.caracteristicas : [])
    .filter((item) => item?.exibe !== false)
    .map((item) => {
      const valor = typeof item?.valor === "string" && item.valor.trim()
        ? item.valor.trim()
        : Array.isArray(item?.carlis_valor) ? item.carlis_valor.filter(Boolean).join(", ") : "";
      return { nome: typeof item?.nome === "string" ? item.nome.trim() : null, valor };
    })
    .filter((item) => item.nome && item.valor);
  // Depois das caracteristicas declaradas, a ficha "Dados Tecnicos" escrita na descricao.
  especificacoes.push(...fichaDaDescricaoMagazord(produto.descricao, paraTexto));

  const depositos = Array.isArray(produto.estoque_depositos) ? produto.estoque_depositos : [];
  const saldos = depositos.map((deposito) => Number(deposito?.qtde_estoque)).filter((saldo) => Number.isFinite(saldo));
  // Sem a lista de depositos (`estoque_depositos: null`, o rele 680806 da Proesi), o saldo vem so em `qtde_estoque`: e o
  // numero que a pagina escreve em "Em estoque 1 unidades (loja e site)". Sem ler os dois, so parte dos itens tinha quantidade.
  const direto = Number(produto.qtde_estoque);
  const quantidade = saldos.length > 0
    ? Math.max(0, Math.round(saldos.reduce((soma, saldo) => soma + saldo, 0)))
    : produto.qtde_estoque != null && Number.isFinite(direto) ? Math.max(0, Math.round(direto)) : null;

  return { imagens, descricao, especificacoes, quantidade };
}
