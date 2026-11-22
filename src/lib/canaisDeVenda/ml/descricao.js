/**
 * Texto final da descricao de um anuncio do Mercado Livre: a descricao do produto, em texto puro. As frases fixas
 * do canal sairam do Rise em 22/10/2026 (pedido do dono). Funcao pura: a previa, a validacao e o payload leem o
 * mesmo arquivo.
 */

// O que tem forma de etiqueta HTML (`<b>`, `</b>`, `<br/>`): o ML recusa a descricao inteira com isso
// ("The description must be in plain text", medido em 08/10/2026). Exige letra logo depois do `<` e o
// `>` na mesma linha, entao "<5V", "< 3,3 V" e "a<b" continuam sendo texto.
const ETIQUETA_HTML = /<\/?[a-zA-Z][^<>\n]*>/g;

// Caractere fora do Latin-1 (U+0000 a U+00FF) o ML tambem recusa como "must be in plain text": medido em 27/10/2026 no kit
// 900212, cuja descricao tinha "20mΩ" (os 20 anuncios ja publicados tinham CRLF, acento e "°", e nenhum tinha nada fora do
// Latin-1). Os comuns viram o equivalente em texto; o resto (emoji, outros alfabetos) sai.
const TROCAS_FORA_DO_LATIN1 = {
  "Ω": "Ohm", // Ω (letra grega)
  "Ω": "Ohm", // Ω (simbolo de ohm)
  "μ": "µ", // μ grego -> µ do Latin-1
  "–": "-",
  "—": "-",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  "≤": "<=",
  "≥": ">=",
  "→": "->",
  "•": "-",
  " ": " ",
};
const FORA_DO_LATIN1 = /[^\u0000-ÿ]/gu;

/**
 * A descricao BASE: aparada, sem etiquetas HTML e so com caracteres do Latin-1. Ate 20/11/2026 era o texto inteiro que ia ao
 * ML; hoje e o miolo do texto completo (`montarDescricaoCompletaML`) e continua sendo o que a impressao do anuncio compara
 * (o md5 dela), para o anuncio publicado antes do formato novo nao acender o "!" sozinho.
 */
export function montarDescricaoML({ descricao }) {
  return String(descricao ?? "")
    .trim()
    .replace(ETIQUETA_HTML, "")
    .replace(FORA_DO_LATIN1, (caractere) => TROCAS_FORA_DO_LATIN1[caractere] ?? "");
}

/**
 * O formato do texto que vai ao ML (spec 2026-11-20, "Compre em kit e economize"): 2 = boas-vindas + descricao sem a secao
 * de garantia + bloco dos kits. O anuncio guarda o formato do ultimo envio (`publicacao.enviado.formato`); sem ele, e o antigo.
 */
export const FORMATO_DA_DESCRICAO = 2;

// So hifens: o ML recusa caractere fora do Latin-1, entao nada de linha desenhada. 120 cobre a largura da descricao no
// computador (pedido do dono em 22/11/2026: "as linhas tracejadas devem ir ate final da linha"); 40 ocupava um terco.
const LINHA = "-".repeat(120);

/**
 * As boas-vindas no comeco de todo anuncio (texto do dono em 20/11/2026). Fixo no codigo de proposito: mudar o texto muda a
 * descricao de todos os anuncios ja no formato novo.
 */
export const BOAS_VINDAS_ML = [
  "Bem-vindo(a) à nossa loja!",
  "- Dúvidas? Use o campo de perguntas, respondemos rápido.",
  "- Emitimos NF em todas as vendas, com os dados do seu cadastro no Mercado Livre.",
  "Boas compras!",
  LINHA,
].join("\n");

const TITULO_DA_GARANTIA = /^\s*garantia\s*:?\s*$/i;
const ITEM_DE_LISTA = /^\s*[-*•]/;
const EM_BRANCO = (linha) => linha.trim() === "";

/**
 * A descricao sem a secao "Garantia:" (pedido do dono em 20/11/2026: o ML ja escreve a garantia no fim do anuncio, ficava
 * redundante). Sai o titulo e os itens de lista dele, com as linhas em branco do meio (texto antigo do Bling traz uma entre
 * cada item); o que vem depois fica. So o titulo sozinho na linha conta: "garantia de 12 meses" numa frase nao e a secao.
 */
export function semGarantia(texto) {
  const linhas = String(texto ?? "").split("\n");
  const saida = [];
  for (let i = 0; i < linhas.length; i++) {
    if (!TITULO_DA_GARANTIA.test(linhas[i])) {
      saida.push(linhas[i]);
      continue;
    }
    let fim = i + 1;
    while (fim < linhas.length && (EM_BRANCO(linhas[fim]) || ITEM_DE_LISTA.test(linhas[fim]))) fim++;
    // O que segue a secao continua separado do que vinha antes dela.
    if (fim < linhas.length && saida.length > 0 && !EM_BRANCO(saida.at(-1))) saida.push("");
    i = fim - 1;
  }
  return saida.join("\n").trimEnd();
}

// "R$60,00", sem espaco depois do R$ (pedido do dono) e com o ponto de milhar.
const reais = (valor) => `R$${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * O bloco "Compre em kit e economize" do fim da descricao: uma linha e o link por kit, na ordem recebida (quem escolhe e
 * ordena os kits e `kitsParaOBloco`). Vazio sem kits: o anuncio do maior kit nao tem bloco.
 */
export function blocoDosKits(kits) {
  const lista = Array.isArray(kits) ? kits : [];
  if (lista.length === 0) return "";
  const linhas = [LINHA, "COMPRE EM KIT E ECONOMIZE"];
  for (const kit of lista) {
    const unitario = Math.round((Number(kit.preco) / Number(kit.unidades)) * 100) / 100;
    linhas.push("", `Kit com ${kit.unidades} unidades por ${reais(kit.preco)} (${reais(unitario)} por unidade)${kit.freteGratis ? " + frete grátis" : ""}`, String(kit.link ?? ""));
  }
  // A linha de baixo fecha o bloco (dono em 22/11/2026: "bem dividido"): logo depois o ML escreve a "Garantia do vendedor".
  linhas.push("", LINHA);
  return linhas.join("\n");
}

/**
 * O texto que vai ao Mercado Livre (`plain_text`) no formato 2: as boas-vindas, a descricao base sem a garantia e, quando ha
 * kit maior do mesmo produto, o bloco dos kits. A previa, o Publicar e o Sincronizar leem daqui. Vazio sem descricao (a
 * validacao acusa a falta; boas-vindas sozinhas nao sao descricao).
 */
export function montarDescricaoCompletaML({ descricao, kits = [] }) {
  const base = montarDescricaoML({ descricao: semGarantia(descricao) });
  if (base === "") return "";
  const bloco = blocoDosKits(kits);
  return [BOAS_VINDAS_ML, base, ...(bloco ? [bloco] : [])].join("\n\n");
}
