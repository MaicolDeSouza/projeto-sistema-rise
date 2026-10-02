/**
 * Versiculos da NVI na descricao do anuncio: referencia, credito, validacao, teto da lista
 * e sorteio. Funcoes puras, sem imports: a descricao, a validacao, a configuracao e o
 * editor leem o mesmo arquivo, e nada aqui toca em banco ou rede.
 *
 * O teto de 500 versiculos, o credito "(NVI)" e a regra de ficar abaixo de 25% do texto
 * vem da licenca da NVI (Biblica): acima disso a citacao precisa de autorizacao escrita.
 * O metodo (lista, ciclo sem repeticao, recomecar quando acaba) e o do artefato
 * "Versiculo Diario". O historico de usados so ganha o versiculo quando o anuncio e
 * publicado (fase 3); sortear nao consome nada.
 *
 * Um versiculo e `{ livro, capitulo, inicio, fim, texto }` (o do banco tambem traz `id`).
 * `usados` e `excluir` sao listas de referencias, no formato de `referenciaDoVersiculo`.
 */

export const LIVROS = ["Salmos", "Provérbios"];
export const CAPITULOS = { Salmos: 150, "Provérbios": 31 };
export const TETO_DE_VERSICULOS = 500;

// A regra e "abaixo de 25%": a citacao precisa ser menor que um quarto do texto final.
const FATOR_DOS_25_POR_CENTO = 4;

// O ultimo versiculo de uma faixa e opcional na digitacao: sem `fim`, vale o `inicio`.
function fimDoVersiculo(v) {
  return v.fim ?? v.inicio;
}

/** Referencia como aparece na descricao: `Salmos 23:1` ou, em faixa, `Provérbios 3:5-6`. */
export function referenciaDoVersiculo(v) {
  const fim = fimDoVersiculo(v);
  const faixa = fim > v.inicio ? `-${fim}` : "";
  return `${v.livro} ${v.capitulo}:${v.inicio}${faixa}`;
}

/** Linha que entra na descricao. O credito "(NVI)" e escrito aqui, nunca digitado. */
export function linhaDoVersiculo(v) {
  return `“${String(v.texto ?? "").trim()}” ${referenciaDoVersiculo(v)} (NVI)`;
}

/**
 * Quantos versiculos a lista tem, contando cada um de uma faixa (`3:5-6` vale 2). Entrada
 * com `fim` antes do `inicio` vale 1: a validacao a recusa, mas a contagem nao pode
 * ficar negativa e esconder o resto da lista enquanto isso.
 */
export function contarVersiculos(lista) {
  return (Array.isArray(lista) ? lista : []).reduce(
    (total, v) => total + Math.max(1, fimDoVersiculo(v) - v.inicio + 1),
    0,
  );
}

/** Motivos pelos quais o versiculo nao pode entrar na lista (vazio = valido). */
export function errosDoVersiculo(v) {
  if (!LIVROS.includes(v.livro)) return ["Use Salmos ou Provérbios."];

  const erros = [];
  const fim = fimDoVersiculo(v);
  if (!Number.isInteger(v.capitulo) || v.capitulo < 1) {
    erros.push("Informe o capitulo (numero inteiro a partir de 1).");
  } else if (v.capitulo > CAPITULOS[v.livro]) {
    erros.push(`${v.livro} tem ${CAPITULOS[v.livro]} capitulos.`);
  }
  if (!Number.isInteger(v.inicio) || v.inicio < 1) {
    erros.push("Informe o versiculo inicial (numero inteiro a partir de 1).");
  } else if (!Number.isInteger(fim)) {
    erros.push("O versiculo final deve ser um numero inteiro.");
  } else if (fim < v.inicio) {
    erros.push("O versiculo final nao pode vir antes do inicial.");
  }
  if (!String(v.texto ?? "").trim()) erros.push("Cole o texto do versiculo.");
  return erros;
}

/** Confere o teto de 500 antes de acrescentar `novo` (a faixa conta cada versiculo). */
export function podeAcrescentar(lista, novo) {
  const total = contarVersiculos(lista) + contarVersiculos([novo]);
  if (total > TETO_DE_VERSICULOS) {
    return {
      ok: false,
      erro: `A lista ficaria com ${total} versiculos. O limite da NVI sem autorizacao da Biblica e ${TETO_DE_VERSICULOS}.`,
    };
  }
  return { ok: true };
}

/**
 * O texto final e o resto da descricao, uma linha em branco e a linha do versiculo.
 * A linha tem que ficar abaixo de 25% dele (estrito: 25% exatos nao servem).
 */
export function cabeNaDescricao(linha, resto) {
  const textoFinal = `${String(resto ?? "").trimEnd()}\n\n${linha}`;
  return FATOR_DOS_25_POR_CENTO * linha.length < textoFinal.length;
}

/**
 * Sorteia um versiculo que caiba na descricao. Elegivel = cabe nos 25% e nao esta em
 * `excluir` (o que o operador acabou de recusar). Dos elegiveis, so entram no sorteio os
 * que ainda nao estao em `usados`; se todos ja foram usados, o ciclo recomeca
 * (`reiniciou: true`) em vez de falhar.
 *
 * Sem versiculo, o motivo diz de quem e a causa: nenhum cabe nos 25% (so um texto maior
 * resolve) ou os que cabem ja foram todos recusados em `excluir` (o operador esgotou as
 * opcoes de "outro versiculo"). Misturar os dois mandaria culpar a descricao por algo
 * que ela nao fez.
 */
export function sortearVersiculo({ lista, usados = [], excluir = [], resto, aleatorio = Math.random }) {
  if (!Array.isArray(lista) || lista.length === 0) {
    return { versiculo: null, motivo: "A lista de versiculos esta vazia. Carregue-a em Configuracoes." };
  }

  const queCabem = lista.filter((v) => cabeNaDescricao(linhaDoVersiculo(v), resto));
  if (queCabem.length === 0) {
    return {
      versiculo: null,
      motivo: "Nenhum versiculo da lista cabe nesta descricao: a NVI pede que a citacao fique abaixo de 25% do texto.",
    };
  }

  const recusados = new Set(excluir);
  const elegiveis = queCabem.filter((v) => !recusados.has(referenciaDoVersiculo(v)));
  if (elegiveis.length === 0) {
    return { versiculo: null, motivo: "Nao ha outro versiculo que caiba nesta descricao." };
  }

  const jaUsados = new Set(usados);
  let candidatos = elegiveis.filter((v) => !jaUsados.has(referenciaDoVersiculo(v)));
  const reiniciou = candidatos.length === 0;
  if (reiniciou) candidatos = elegiveis;

  // O minimo protege de um `aleatorio` que devolva 1 exato: sem ele o indice sairia da lista.
  const indice = Math.min(candidatos.length - 1, Math.floor(aleatorio() * candidatos.length));
  return { versiculo: candidatos[indice], reiniciou };
}
