/**
 * Os enderecos que uma fonte varre (20/10/2026).
 *
 * Antes havia o campo "Secao / categoria", um FILTRO DE TEXTO sobre o endereco dos produtos: funcionava em loja que
 * poe a categoria no caminho do produto e nao funcionava em quase nenhuma outra (Patolastore). Agora o operador cola o
 * endereco da CATEGORIA, como a abre no navegador, e pode juntar quantas quiser na mesma fonte ("uma loja = uma fonte").
 *
 * Sem imports: serve ao formulario, as acoes, a coleta e ao teste.
 */

/** Teto de enderecos por fonte: cada um e uma varredura de categoria, e a lista e escrita a mao. */
export const MAXIMO_DE_ENDERECOS = 30;

/**
 * "loja.com.br/gabinetes/" -> endereco completo e normalizado, ou null quando nao e um endereco de site. Tira a ancora,
 * o `www.` nao (a loja pode servir so por ele) e a barra do fim do caminho (a raiz fica "/"). A consulta (`?cat=12`)
 * fica: em algumas lojas ela E a categoria.
 *
 * @returns {{ url: string, host: string, caminho: string, lojaInteira: boolean } | null}
 */
export function enderecoDaLista(texto) {
  const bruto = String(texto ?? "").trim();
  if (!bruto) return null;

  let alvo;
  try {
    alvo = new URL(/^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(alvo.protocol) || !alvo.hostname.includes(".")) return null;

  alvo.hash = "";
  let caminho = alvo.pathname.replace(/\/{2,}/g, "/");
  if (caminho.length > 1) caminho = caminho.replace(/\/+$/, "");
  const consulta = alvo.search;

  return {
    url: `${alvo.protocol}//${alvo.host}${caminho === "/" && !consulta ? "/" : caminho}${consulta}`,
    host: alvo.hostname,
    caminho,
    lojaInteira: caminho === "/" && !consulta,
  };
}

/** "www.loja.com.br" e "loja.com.br" sao o mesmo site para fins de "uma loja = uma fonte". */
export function hostSemWww(host) {
  return String(host ?? "").toLowerCase().replace(/^www\./, "");
}

/** Chave para achar repetido: o mesmo endereco escrito de dois jeitos (com `www`, com barra no fim, outra caixa). */
export function chaveDoEndereco(texto) {
  const endereco = enderecoDaLista(texto);
  if (!endereco) return null;
  return `${hostSemWww(endereco.host)}${endereco.caminho.toLowerCase()}${endereco.url.includes("?") ? endereco.url.slice(endereco.url.indexOf("?")) : ""}`;
}

/**
 * Confere a lista que o operador escreveu: cada endereco valido, todos da MESMA loja, sem repetir e ate o teto.
 * Linha em branco sai sem reclamar (o formulario sempre tem uma linha vazia esperando).
 *
 * @returns {{ ok: true, enderecos: object[] } | { ok: false, erro: string }}
 */
export function conferirEnderecos(textos) {
  const enderecos = [];
  const vistos = new Set();

  for (const texto of textos ?? []) {
    if (!String(texto ?? "").trim()) continue;
    const endereco = enderecoDaLista(texto);
    if (!endereco) return { ok: false, erro: `"${String(texto).trim()}" não é um endereço de site.` };

    if (enderecos.length > 0 && hostSemWww(endereco.host) !== hostSemWww(enderecos[0].host)) {
      return {
        ok: false,
        erro: `"${endereco.host}" é de outro site. Uma fonte varre uma loja só: cadastre ${endereco.host} como outra fonte.`,
      };
    }

    const chave = chaveDoEndereco(texto);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    enderecos.push(endereco);
  }

  if (enderecos.length === 0) return { ok: false, erro: "Informe pelo menos um endereço." };
  if (enderecos.length > MAXIMO_DE_ENDERECOS) {
    return { ok: false, erro: `Uma fonte aceita até ${MAXIMO_DE_ENDERECOS} endereços.` };
  }
  return { ok: true, enderecos };
}

/**
 * O que gravar em `FonteColeta.categorias` para uma fonte de SITE (o portal com login tem a sua lista, outro assunto):
 * so o endereco da loja inteira = nada (varre a loja como sempre varreu); qualquer outro caso guarda a lista.
 */
export function listaParaGravar(enderecos, agora = new Date()) {
  if (enderecos.length === 1 && enderecos[0].lojaInteira) return [];
  return enderecos.map((endereco) => ({ url: endereco.url, total: null, adicionadaEm: agora.toISOString() }));
}

/**
 * Os enderecos a varrer de uma fonte ja gravada: a lista de `categorias`, ou, sem lista, a loja inteira como sempre foi
 * (`base`: o endereco antigo da fonte, com o filtro de texto antigo na `secao`). `categoria` diz se o endereco e o de uma
 * CATEGORIA a ler pela listagem (tudo que nao e a raiz da loja).
 *
 * @returns {{ url: string, categoria: boolean }[]}
 */
export function enderecosDaVarredura(categorias, base) {
  const lista = Array.isArray(categorias) ? categorias : [];
  const entradas = [];
  const vistos = new Set();

  for (const item of lista) {
    const endereco = enderecoDaLista(item?.url);
    if (!endereco) continue;
    const chave = chaveDoEndereco(item.url);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    entradas.push({ url: endereco.url, categoria: !endereco.lojaInteira });
  }

  return entradas.length > 0 ? entradas : [{ url: base, categoria: false }];
}

/** "https://loja.com.br/gabinetes" -> "/gabinetes"; a raiz vira "loja inteira". Rotulo curto de cada endereco na tela. */
export function rotuloDoEndereco(texto) {
  const endereco = enderecoDaLista(texto);
  if (!endereco) return String(texto ?? "");
  return endereco.lojaInteira ? "loja inteira" : `${endereco.caminho}${endereco.url.includes("?") ? endereco.url.slice(endereco.url.indexOf("?")) : ""}`;
}
