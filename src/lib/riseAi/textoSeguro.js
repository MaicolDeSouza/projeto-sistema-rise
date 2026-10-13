/**
 * O texto que o modelo escreve, desenhado com segurança (spec §5): o que vem do modelo é DADO, nunca HTML. Este analisador
 * transforma o texto em blocos e trechos simples (parágrafo, título, lista; texto, negrito, itálico, código, link), e o
 * componente `TextoDaIA` desenha só isso — sem `dangerouslySetInnerHTML`.
 *
 * Regras que importam:
 *  - HTML cru (`<script>`, `<img onerror=...>`) e imagem (`![x](url)`) nunca viram elemento: ficam como TEXTO (a imagem, só o
 *    texto alternativo);
 *  - `javascript:`, `data:` e qualquer coisa que não seja http/https nunca viram link;
 *  - só é clicável o endereço que está em `linksPermitidos` (o `urlLoja` dos produtos que as ferramentas devolveram e as
 *    fontes da pesquisa na internet); os links de produto são montados pelo código, não pelo modelo. Qualquer outro endereço
 *    aparece como texto, com o domínio à vista, e `[texto](url)` mostra sempre o domínio REAL ao lado do texto;
 *  - marcação aberta no meio do fluxo (`**negr`, a resposta ainda chegando) aparece como está até fechar.
 *
 * Puro e SEM imports: o navegador (que desenha a resposta) e o servidor (o teste) usam o mesmo arquivo.
 *
 * @typedef {{ tipo: "texto" | "negrito" | "italico" | "codigo", texto: string } | { tipo: "quebra" } | { tipo: "link", texto: string, href: string, dominio: string }} Trecho
 * @typedef {{ tipo: "paragrafo" | "titulo", trechos: Trecho[] } | { tipo: "lista", ordenada: boolean, itens: Trecho[][] }} Bloco
 */

/** http/https, domínio com ponto, sem usuário:senha@ e sem espaço. */
export function ehEnderecoSeguro(url) {
  const texto = String(url ?? "");
  if (!texto || texto.length > 2000 || /\s/.test(texto)) return false;
  let endereco;
  try {
    endereco = new URL(texto);
  } catch {
    return false;
  }
  return (endereco.protocol === "http:" || endereco.protocol === "https:") && endereco.hostname.includes(".") && !endereco.username && !endereco.password;
}

/** Compara endereços sem diferença de barra final, pontuação colada ou caixa. */
const comoEndereco = (url) => String(url).replace(/[.,;:!?]+$/, "").replace(/\/+$/, "").toLowerCase();

// As marcas que o analisador reconhece dentro de uma linha, na ordem em que valem quando começam no mesmo ponto.
// Grupos: 1-2 imagem (alt, url); 3-4 link (texto, url); 5 código; 6 negrito; 7 itálico com asterisco; 8 itálico com sublinhado.
// O endereço solto não tem grupo (é o match inteiro). Todas as classes são negadas e preguiçosas: sem retrocesso patológico.
const ENDERECO_DENTRO = String.raw`((?:[^()\s]|\([^()\s]*\))+)`;
const ESPECIAL_FONTE = [
  String.raw`!\[([^\]\n]*)\]\(` + ENDERECO_DENTRO + String.raw`\)`,
  String.raw`\[([^\]\n]+)\]\(` + ENDERECO_DENTRO + String.raw`\)`,
  "`([^`\\n]+)`",
  String.raw`\*\*([^*\n]+?)\*\*`,
  String.raw`(?<![\w*])\*(?![\s*])([^*\n]+?)(?<![\s*])\*(?![\w*])`,
  String.raw`(?<!\w)_(?![\s_])([^_\n]+?)(?<![\s_])_(?!\w)`,
  String.raw`https?:\/\/[^\s<>"'` + "`" + "]+",
].join("|");

/** Um link vira clicável só se estiver na lista permitida; senão é texto com o domínio à vista. */
function ligar(textoVisivel, url, solto, permitidos) {
  const limpa = String(url).trim();
  if (!ehEnderecoSeguro(limpa)) return { tipo: "texto", texto: solto ? limpa : textoVisivel };
  const dominio = new URL(limpa).hostname;
  if (permitidos.has(comoEndereco(limpa))) return { tipo: "link", texto: textoVisivel, href: limpa, dominio };
  return { tipo: "texto", texto: solto ? limpa : `${textoVisivel} (${dominio})` };
}

/** Os trechos de UMA linha (a quebra entre linhas é do bloco). */
function trechosDaLinha(linha, permitidos) {
  const saida = [];
  const empurrar = (trecho) => {
    if (trecho.tipo === "texto") {
      if (!trecho.texto) return;
      const ultimo = saida.at(-1);
      if (ultimo?.tipo === "texto") ultimo.texto += trecho.texto;
      else saida.push({ ...trecho });
    } else {
      saida.push(trecho);
    }
  };

  const regra = new RegExp(ESPECIAL_FONTE, "g");
  let fim = 0;
  let achado;
  while ((achado = regra.exec(linha)) !== null) {
    empurrar({ tipo: "texto", texto: linha.slice(fim, achado.index) });
    fim = achado.index + achado[0].length;
    if (achado[2] !== undefined) {
      empurrar({ tipo: "texto", texto: achado[1] });
    } else if (achado[4] !== undefined) {
      empurrar(ligar(achado[3], achado[4], false, permitidos));
    } else if (achado[5] !== undefined) {
      empurrar({ tipo: "codigo", texto: achado[5] });
    } else if (achado[6] !== undefined) {
      empurrar({ tipo: "negrito", texto: achado[6] });
    } else if (achado[7] !== undefined || achado[8] !== undefined) {
      empurrar({ tipo: "italico", texto: achado[7] ?? achado[8] });
    } else {
      // Endereço solto: a pontuação colada no fim ("...uno.") não faz parte dele.
      const sobra = /[.,;:!?)\]]+$/.exec(achado[0])?.[0] ?? "";
      const url = achado[0].slice(0, achado[0].length - sobra.length);
      empurrar(ligar(url, url, true, permitidos));
      fim = achado.index + url.length;
      regra.lastIndex = fim;
    }
  }
  empurrar({ tipo: "texto", texto: linha.slice(fim) });
  return saida;
}

const TITULO = /^ {0,3}#{1,6}\s+(.*)$/;
const ITEM_DE_BOLINHA = /^\s*[-*•]\s+(.*)$/;
const ITEM_NUMERADO = /^\s*\d{1,3}[.)]\s+(.*)$/;

/**
 * @param {string} texto
 * @param {{ linksPermitidos?: string[] }} [opcoes]
 * @returns {Bloco[]}
 */
export function blocosDoTexto(texto, { linksPermitidos = [] } = {}) {
  const permitidos = new Set(linksPermitidos.filter(Boolean).map(comoEndereco));
  const linhas = String(texto ?? "").replace(/\r\n?/g, "\n").split("\n");
  /** @type {Bloco[]} */
  const blocos = [];
  let atual = null;

  const fechar = () => {
    atual = null;
  };
  for (const linha of linhas) {
    if (linha.trim() === "") {
      fechar();
      continue;
    }
    const titulo = TITULO.exec(linha);
    if (titulo) {
      blocos.push({ tipo: "titulo", trechos: trechosDaLinha(titulo[1], permitidos) });
      fechar();
      continue;
    }
    const bolinha = ITEM_DE_BOLINHA.exec(linha);
    const numerado = bolinha ? null : ITEM_NUMERADO.exec(linha);
    if (bolinha || numerado) {
      const ordenada = Boolean(numerado);
      if (atual?.tipo !== "lista" || atual.ordenada !== ordenada) {
        atual = { tipo: "lista", ordenada, itens: [] };
        blocos.push(atual);
      }
      atual.itens.push(trechosDaLinha((bolinha ?? numerado)[1], permitidos));
      continue;
    }
    if (atual?.tipo === "paragrafo") {
      atual.trechos.push({ tipo: "quebra" }, ...trechosDaLinha(linha, permitidos));
    } else {
      atual = { tipo: "paragrafo", trechos: trechosDaLinha(linha, permitidos) };
      blocos.push(atual);
    }
  }
  return blocos;
}

/**
 * O que o botão Copiar copia: o texto sem as marcas de formatação, listas com "- " e "1. ". O endereço escrito à mão fica
 * como está; o `[texto](url)` seguro vira "texto (url)" (quem cola num WhatsApp precisa do endereço) e o perigoso, só o texto.
 */
export function textoPuroDoTexto(texto) {
  const linhas = String(texto ?? "").replace(/\r\n?/g, "\n").split("\n");
  const puras = linhas.map((linha) => {
    let atual = linha;
    const titulo = TITULO.exec(atual);
    if (titulo) atual = titulo[1];
    const bolinha = /^(\s*)[*•]\s+(.*)$/.exec(atual);
    if (bolinha) atual = `${bolinha[1]}- ${bolinha[2]}`;
    return atual.replace(new RegExp(ESPECIAL_FONTE, "g"), (achado, alt, urlDaImagem, textoDoLink, urlDoLink, codigo, negrito, italicoEstrela, italicoSublinhado) => {
      if (urlDaImagem !== undefined) return alt;
      if (urlDoLink !== undefined) return ehEnderecoSeguro(urlDoLink) ? `${textoDoLink} (${urlDoLink})` : textoDoLink;
      return codigo ?? negrito ?? italicoEstrela ?? italicoSublinhado ?? achado;
    });
  });
  return puras.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
