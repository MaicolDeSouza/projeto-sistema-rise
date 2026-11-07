/**
 * Correcoes da descricao: as regras puras (spec docs/superpowers/specs/2026-11-07-correcoes-da-descricao-design.md).
 * Pedido do dono em 07/11/2026: "criar um RAG no rise para descricao e eu alimentar esse RAG com os detalhes que tem que
 * ajustar". Cada correcao e uma TROCA (errado -> certo, que o Rise aplica no texto de toda descricao) ou uma REGRA
 * (instrucao de estilo, que so vai para a IA). Sem import de banco: o formulario do produto usa o diff no navegador.
 */

export const TIPOS = ["TROCA", "REGRA"];
export const MAXIMO_TEXTO = 120;
export const MAXIMO_EXPLICACAO = 500;
export const MAXIMO_PAR = 60;
export const TETO_DO_BLOCO = 6000;

const LETRA_OU_NUMERO = /[\p{L}\p{N}]/u;
// Numero "solto": nao colado a uma letra ou numero ANTES (o 32 de "ESP32" nao e numero; o 5 de "5V" e).
const NUMERO = /(?<![\p{L}\p{N}])\d+(?:[.,]\d+)?/gu;
const GRUPO_DO_NUMERO = "(\\d+(?:[.,]\\d+)?)";

const limpo = (valor) => (typeof valor === "string" ? valor.trim() : "");
const escapar = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Confere e limpa uma correcao vinda do chat, do popup do Salvar ou da tela de gestao. */
export function validarCorrecao(dados = {}) {
  const tipo = limpo(dados.tipo).toUpperCase();
  const certo = limpo(dados.certo);
  const errado = tipo === "TROCA" ? limpo(dados.errado) : "";
  const explicacao = limpo(dados.explicacao);
  const promptNome = limpo(dados.promptNome);
  const erros = {};
  if (!TIPOS.includes(tipo)) erros.tipo = "Escolha TROCA ou REGRA.";
  if (!certo) erros.certo = tipo === "REGRA" ? "Escreva a regra." : "Escreva o texto certo.";
  else if (certo.length > MAXIMO_TEXTO) erros.certo = `Até ${MAXIMO_TEXTO} caracteres.`;
  else if (/[\r\n]/.test(certo)) erros.certo = "Uma linha só.";
  if (tipo === "TROCA") {
    if (!errado) erros.errado = "Escreva o texto errado.";
    else if (errado.length > MAXIMO_TEXTO) erros.errado = `Até ${MAXIMO_TEXTO} caracteres.`;
    else if (/[\r\n]/.test(errado)) erros.errado = "Uma linha só.";
    else if (errado === certo) erros.errado = "O errado tem de ser diferente do certo.";
  }
  if (explicacao.length > MAXIMO_EXPLICACAO) erros.explicacao = `Até ${MAXIMO_EXPLICACAO} caracteres.`;
  if (promptNome.length > MAXIMO_TEXTO) erros.promptNome = `Até ${MAXIMO_TEXTO} caracteres.`;
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return { ok: true, dados: { tipo, errado: errado || null, certo, explicacao: explicacao || null, promptNome: promptNome || null } };
}

/** Os numeros soltos de um texto, com a posicao. */
function numerosDe(texto) {
  return [...texto.matchAll(NUMERO)].map((achado) => ({ texto: achado[0], inicio: achado.index, fim: achado.index + achado[0].length }));
}

/** A primeira letra na outra caixa ("voltagem" <-> "Voltagem"); sem letra no inicio, null. */
function comOutraPrimeira(texto) {
  const primeira = texto[0];
  if (!primeira || !/\p{L}/u.test(primeira)) return null;
  const maiuscula = primeira.toLocaleUpperCase("pt-BR");
  const trocada = primeira === maiuscula ? primeira.toLocaleLowerCase("pt-BR") : maiuscula;
  return trocada === primeira ? null : trocada + texto.slice(1);
}

/**
 * Prepara uma TROCA: as variantes de caixa do "errado", cada uma com a sua expressao, e como montar o "certo".
 * O numero solto vira curinga so quando os dois lados tem os mesmos numeros na mesma ordem: "5 V" -> "5V" vale para
 * "3,3 V" e "12 V"; "90 dias" -> "3 meses" e "3.3V" -> "3,3V" ficam literais (o numero e o que se troca).
 */
function prepararTroca(correcao) {
  const errado = correcao.errado;
  const certo = correcao.certo;
  const numerosErrado = numerosDe(errado);
  const numerosCerto = numerosDe(certo);
  const curinga = numerosErrado.length > 0
    && numerosErrado.length === numerosCerto.length
    && numerosErrado.every((numero, indice) => numero.texto === numerosCerto[indice].texto);

  // Fronteira so onde a ponta e letra ou numero (como o \b, que nao serve em texto com acento): "voltagem" nao casa em
  // "voltagens"; "+5V" casa depois de qualquer coisa.
  const antes = LETRA_OU_NUMERO.test(errado[0]) ? "(?<![\\p{L}\\p{N}])" : "";
  const depois = LETRA_OU_NUMERO.test(errado[errado.length - 1]) ? "(?![\\p{L}\\p{N}])" : "";
  const corpo = (variante) => {
    if (!curinga) return escapar(variante);
    // As variantes so mudam a caixa das letras: os numeros ficam nas mesmas posicoes.
    let saida = "";
    let cursor = 0;
    for (const numero of numerosErrado) {
      saida += escapar(variante.slice(cursor, numero.inicio)) + GRUPO_DO_NUMERO;
      cursor = numero.fim;
    }
    return saida + escapar(variante.slice(cursor));
  };

  const temLetra = /\p{L}/u.test(errado);
  const maiusculas = errado.toLocaleUpperCase("pt-BR");
  const variantes = [...new Set([errado, comOutraPrimeira(errado), temLetra && maiusculas !== errado ? maiusculas : null].filter(Boolean))];

  const montarCerto = (capturados) => {
    if (!curinga) return certo;
    let saida = "";
    let cursor = 0;
    numerosCerto.forEach((numero, indice) => {
      saida += certo.slice(cursor, numero.inicio) + capturados[indice];
      cursor = numero.fim;
    });
    return saida + certo.slice(cursor);
  };

  // A caixa do "certo" segue a do que casou, como a troca fixa de "voltagem" (normalizarTerminologiaEletrica). Uma letra
  // so em maiuscula ("É" no inicio da frase) e primeira letra, nao texto todo em maiusculas.
  const variasLetras = (errado.match(/\p{L}/gu) ?? []).length > 1;
  const comCaixa = (montado, casou) => {
    if (variasLetras && casou === casou.toLocaleUpperCase("pt-BR") && errado !== maiusculas) return montado.toLocaleUpperCase("pt-BR");
    const primeiraErrado = errado[0];
    const primeiraCasou = casou[0];
    if (primeiraErrado !== primeiraCasou && /\p{L}/u.test(primeiraErrado ?? "")) {
      const primeira = montado[0] ?? "";
      const ajustada = primeiraCasou === primeiraCasou.toLocaleUpperCase("pt-BR") ? primeira.toLocaleUpperCase("pt-BR") : primeira.toLocaleLowerCase("pt-BR");
      return ajustada + montado.slice(1);
    }
    return montado;
  };

  return {
    expressoes: variantes.map((variante) => new RegExp(antes + corpo(variante) + depois, "gu")),
    certo: (casou, capturados) => comCaixa(montarCerto(capturados), casou),
  };
}

/**
 * Onde o texto ja esta como o "certo", nao troca: o Salvar aplica a lista a cada gravacao, e "ESP32" -> "ESP32-S3" (ou
 * "Arduino" -> "Placa Arduino") viraria "ESP32-S3-S3" na segunda. Confere toda posicao em que o "errado" aparece dentro
 * do "certo".
 */
function jaEstaCerto(texto, indice, casou, montado) {
  for (let deslocamento = montado.indexOf(casou); deslocamento >= 0; deslocamento = montado.indexOf(casou, deslocamento + 1)) {
    if (indice - deslocamento >= 0 && texto.startsWith(montado, indice - deslocamento)) return true;
  }
  return false;
}

/**
 * Aplica as TROCAs no texto (REGRA e ignorada: e so instrucao). A mais longa primeiro, e cada trecho e trocado uma vez:
 * o que uma troca escreveu vira um marcador que as seguintes nao enxergam ("5 V DC" -> "5VDC" nao vira "5VDC" e depois
 * algo de "5 V"). Devolve o texto e quantas vezes cada correcao trocou.
 */
export function aplicarCorrecoes(texto, correcoes = []) {
  let atual = typeof texto === "string" ? texto : "";
  const trocas = (Array.isArray(correcoes) ? correcoes : [])
    .filter((item) => item?.tipo === "TROCA" && typeof item.errado === "string" && item.errado && typeof item.certo === "string" && item.certo && item.errado !== item.certo)
    .sort((a, b) => b.errado.length - a.errado.length);
  if (!atual || trocas.length === 0) return { texto: atual, aplicadas: [] };

  // Marcador com caractere de uso privado (nem letra nem numero): nao casa com nada e nao inventa fronteira de palavra.
  const guardados = [];
  const marcador = (indice) => `\u0000${String.fromCharCode(0xe000 + indice)}\u0000`;
  const aplicadas = [];

  for (const correcao of trocas) {
    const { expressoes, certo } = prepararTroca(correcao);
    let vezes = 0;
    for (const expressao of expressoes) {
      atual = atual.replace(expressao, (...partes) => {
        const casou = partes[0];
        const temGrupos = typeof partes[partes.length - 1] === "object";
        const fimDosGrupos = partes.length - (temGrupos ? 3 : 2);
        const capturados = partes.slice(1, fimDosGrupos);
        const indice = partes[fimDosGrupos];
        const original = partes[fimDosGrupos + 1];
        const montado = certo(casou, capturados);
        if (jaEstaCerto(original, indice, casou, montado)) return casou;
        vezes++;
        guardados.push(montado);
        return marcador(guardados.length - 1);
      });
    }
    if (vezes > 0) aplicadas.push({ id: correcao.id, vezes });
  }

  atual = atual.replace(/\u0000([-])\u0000/g, (_, codigo) => guardados[codigo.charCodeAt(0) - 0xe000]);
  return { texto: atual, aplicadas };
}

const CABECALHO_DO_BLOCO = "Correções do dono (valem sempre, mesmo que o prompt diga outra coisa):";

function linhaDoBloco(correcao) {
  const explicacao = correcao.explicacao ? ` (${correcao.explicacao})` : "";
  if (correcao.tipo === "TROCA") return `- Escreva "${correcao.certo}", nunca "${correcao.errado}"${explicacao}`;
  return `- ${correcao.certo}${explicacao}`;
}

/**
 * O bloco "Correcoes do dono" que vai depois do prompt da IA do Rise e na leitura da proposta do Claude. A mais recente
 * primeiro; passando do teto, as mais antigas ficam de fora (a tela avisa quantas, para o dono consolidar).
 */
export function blocoDeCorrecoes(correcoes = [], { teto = TETO_DO_BLOCO } = {}) {
  const validas = (Array.isArray(correcoes) ? correcoes : [])
    .filter((item) => (item?.tipo === "TROCA" && item.errado && item.certo) || (item?.tipo === "REGRA" && item.certo))
    .sort((a, b) => new Date(b.criadoEm ?? 0) - new Date(a.criadoEm ?? 0));
  if (validas.length === 0) return { texto: "", foraDoTeto: 0 };
  let texto = CABECALHO_DO_BLOCO;
  let cabem = 0;
  for (const correcao of validas) {
    const proximo = `${texto}\n${linhaDoBloco(correcao)}`;
    if (proximo.length > teto) break;
    texto = proximo;
    cabem++;
  }
  return { texto: cabem > 0 ? texto : "", foraDoTeto: validas.length - cabem };
}

/** O prompt com o bloco das correcoes no fim (ou o prompt como veio, sem correcao). */
export function instrucoesComCorrecoes(prompt, correcoes = []) {
  const { texto } = blocoDeCorrecoes(correcoes);
  if (!texto) return prompt;
  return [prompt, texto].filter(Boolean).join("\n\n");
}

/** O aviso da tela de gestao quando o bloco nao cabe inteiro na instrucao. */
export function avisoDoTeto(correcoes = [], opcoes = {}) {
  const { foraDoTeto } = blocoDeCorrecoes(correcoes, opcoes);
  if (foraDoTeto === 0) return null;
  return foraDoTeto === 1
    ? "1 correção fora da instrução por tamanho; consolide ou desligue."
    : `${foraDoTeto} correções fora da instrução por tamanho; consolide ou desligue.`;
}

const ehLetraOuNumero = (caractere) => Boolean(caractere) && LETRA_OU_NUMERO.test(caractere);

/**
 * Os pares "antes -> depois" que o popup do Salvar oferece: o que o dono mudou a mao na descricao que a IA ou a proposta
 * escreveu. So linha mudada no lugar (mesmo numero de linhas), o menor trecho diferente esticado ate a fronteira da
 * palavra ("5 V" -> "5V", "Voltagem" -> "Tensao"), ate 60 caracteres por lado. Linha acrescentada ou reescrita nao vira
 * candidato: nao e uma correcao, e o texto novo.
 */
export function candidatosDoDiff(antes, depois) {
  const linhasAntes = String(antes ?? "").replace(/\r\n/g, "\n").split("\n");
  const linhasDepois = String(depois ?? "").replace(/\r\n/g, "\n").split("\n");
  if (linhasAntes.length !== linhasDepois.length) return [];
  const candidatos = [];
  const vistos = new Set();
  linhasAntes.forEach((linhaAntes, indice) => {
    const linhaDepois = linhasDepois[indice];
    if (linhaAntes === linhaDepois) return;
    const menor = Math.min(linhaAntes.length, linhaDepois.length);
    let prefixo = 0;
    while (prefixo < menor && linhaAntes[prefixo] === linhaDepois[prefixo]) prefixo++;
    let sufixo = 0;
    while (sufixo < menor - prefixo && linhaAntes[linhaAntes.length - 1 - sufixo] === linhaDepois[linhaDepois.length - 1 - sufixo]) sufixo++;
    while (prefixo > 0 && ehLetraOuNumero(linhaAntes[prefixo - 1])) prefixo--;
    while (sufixo > 0 && ehLetraOuNumero(linhaAntes[linhaAntes.length - sufixo])) sufixo--;
    const parAntes = linhaAntes.slice(prefixo, linhaAntes.length - sufixo).trim();
    const parDepois = linhaDepois.slice(prefixo, linhaDepois.length - sufixo).trim();
    if (!parAntes || !parDepois || parAntes === parDepois) return;
    if (parAntes.length > MAXIMO_PAR || parDepois.length > MAXIMO_PAR) return;
    const chave = `${parAntes}\u0000${parDepois}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    candidatos.push({ antes: parAntes, depois: parDepois, contexto: linhaAntes });
  });
  return candidatos;
}
