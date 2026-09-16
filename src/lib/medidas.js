/**
 * Peso, dimensoes e NCM lidos das especificacoes de produtos coletados, para o
 * cadastro oferecer como opcao (pedido do dono em 16/09/2026).
 *
 * Sem imports: e testado em `npm run teste:extracao`, sem banco nem rede.
 *
 * Medido nas fichas coletadas em 16/09/2026 — cada loja escreve de um jeito:
 *   "12,3g", "0,049 kg"                                  peso
 *   "Altura: 32mm", "Comprimento: ~28cm"                 uma medida por campo
 *   "Dimensões (CxLxA): 54 x 30,5 x 17mm"                ordem no rotulo
 *   "35mm (Altura) x 50mm (Largura) x 15mm (profundidade)" ordem no valor
 *   "68mm Largura x 32mm Profundidade x 17mm Altura"
 *   "31 x 15 x 18mm"                                     sem ordem declarada
 * Nada aqui inventa: o que nao casa num desses formatos fica de fora.
 */

/** "12,3" -> 12.3; "0.049" -> 0.049; "1.500,5" -> 1500.5. */
function numero(texto) {
  const limpo = String(texto).trim();
  const valor = limpo.includes(",")
    ? Number(limpo.replace(/\./g, "").replace(",", "."))
    : Number(limpo);
  return Number.isFinite(valor) ? valor : null;
}

const arredondar = (valor, casas) => Math.round(valor * 10 ** casas) / 10 ** casas;

/// Especificacoes de peso. "Peso com embalagem" entra, com o rotulo, para o
/// operador escolher entre o da peca e o do pacote.
const ROTULO_PESO = /^peso\b/i;

/** Peso em kg a partir de "12,3g", "0,049 kg", "500 mg". */
export function pesoEmKg(texto) {
  const casamento = /(\d+(?:[.,]\d+)?)\s*(mg|kg|g)\b/i.exec(String(texto ?? ""));
  if (!casamento) return null;
  const valor = numero(casamento[1]);
  if (valor === null) return null;
  const fator = { mg: 0.000001, g: 0.001, kg: 1 }[casamento[2].toLowerCase()];
  const kg = arredondar(valor * fator, 3);
  // Abaixo de 1 g o campo (3 casas em kg) viraria zero.
  return kg > 0 && kg < 1000 ? kg : null;
}

const EIXO_POR_PALAVRA = {
  altura: "altura",
  espessura: "altura",
  largura: "largura",
  comprimento: "comprimento",
  profundidade: "comprimento",
};
const EIXO_POR_LETRA = { a: "altura", e: "altura", l: "largura", c: "comprimento", p: "comprimento" };

/// Rotulos de especificacao que descrevem o CORPO da peca. "Comprimento do cabo",
/// "largura do canal" e "comprimento da rosca" ficam de fora: sao outra coisa.
const ROTULO_UMA_MEDIDA = /^(altura|largura|comprimento|profundidade|espessura)( total)?$/i;
const ROTULO_VARIAS = /^(dimens(õ|o)es|dimens(ã|a)o|tamanho|medidas)\b/i;

function emCm(valor, unidade) {
  const fator = { mm: 0.1, cm: 1, m: 100 }[String(unidade ?? "mm").toLowerCase()];
  const cm = arredondar(valor * fator, 2);
  return cm > 0 && cm < 1000 ? cm : null;
}

/**
 * Medidas em cm de UMA especificacao: { altura?, largura?, comprimento? }, mais
 * `presumida` quando a ordem nao foi declarada nem no rotulo nem no valor.
 */
export function medidasDaEspecificacao(nome, valor) {
  const rotulo = String(nome ?? "").trim();
  const texto = String(valor ?? "").replace(/~|aprox\.?/gi, "");

  const umaMedida = ROTULO_UMA_MEDIDA.exec(rotulo);
  if (umaMedida) {
    const casamento = /(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/i.exec(texto);
    if (!casamento) return null;
    const cm = emCm(numero(casamento[1]), casamento[2]);
    return cm ? { [EIXO_POR_PALAVRA[umaMedida[1].toLowerCase()]]: cm } : null;
  }

  if (!ROTULO_VARIAS.test(rotulo)) return null;
  // Medida da embalagem nao e do produto; o peso com embalagem entra, a caixa nao.
  if (/embalagem|caixa/i.test(rotulo)) return null;

  const partes = texto.split(/\s*[x×*]\s*/i).filter((parte) => /\d/.test(parte));
  if (partes.length < 2 || partes.length > 3) return null;

  // A unidade costuma vir so no fim ("31 x 15 x 18mm") e vale para todas.
  const unidadeGeral = /(mm|cm|m)\b[^a-z]*$/i.exec(texto)?.[1] ?? /(mm|cm|m)\b/i.exec(texto)?.[1];
  if (!unidadeGeral) return null;

  const letras = /\(([a-z](?:x[a-z]){1,2})\)/i.exec(rotulo)?.[1].toLowerCase().split("x");

  const medidas = {};
  let presumida = false;
  const ordemPadrao = ["comprimento", "largura", "altura"];

  partes.forEach((parte, indice) => {
    const casamento = /(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?\b/i.exec(parte);
    if (!casamento) return;
    const cm = emCm(numero(casamento[1]), casamento[2] ?? unidadeGeral);
    if (!cm) return;

    const palavra = /(altura|largura|comprimento|profundidade|espessura)/i.exec(parte)?.[1];
    let eixo = palavra ? EIXO_POR_PALAVRA[palavra.toLowerCase()] : null;
    if (!eixo && letras?.[indice]) eixo = EIXO_POR_LETRA[letras[indice]];
    if (!eixo) {
      eixo = ordemPadrao[indice];
      presumida = true;
    }
    if (eixo && medidas[eixo] === undefined) medidas[eixo] = cm;
  });

  if (Object.keys(medidas).length === 0) return null;
  return presumida ? { ...medidas, presumida: true } : medidas;
}

/** "85423190" ou "8542.31.90" -> "8542.31.90"; outra coisa -> null. */
export function ncmFormatado(valor) {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (digitos.length !== 8) return null;
  return `${digitos.slice(0, 4)}.${digitos.slice(4, 6)}.${digitos.slice(6)}`;
}

// ---------------------------------------------------------------------------
// As linhas do padrao da descricao — escrever e ler de volta
// ---------------------------------------------------------------------------

/** 30.5 -> "30,5"; 68 -> "68". */
const decimalBr = (valor, casas = 1) =>
  Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: casas, useGrouping: false });

/**
 * "- Dimensões(CxLxA): 68x53x10mm;" — o formato que o dono definiu em
 * 16/09/2026 (sem espaco antes do parentese nem em volta do "x"), escrito SEMPRE
 * assim para ser lido de volta sem ambiguidade. Com medida faltando, a letra dela
 * sai do rotulo ("(CxL): 68x53mm"), e a leitura continua certa.
 *
 * @param {{comprimentoCm?: number, larguraCm?: number, alturaCm?: number}} medidas
 */
export function linhaDeDimensoes({ comprimentoCm, larguraCm, alturaCm }) {
  const eixos = [
    ["C", comprimentoCm],
    ["L", larguraCm],
    ["A", alturaCm],
  ].filter(([, valor]) => Number(valor) > 0);
  if (eixos.length === 0) return null;
  const letras = eixos.map(([letra]) => letra).join("x");
  const valores = eixos.map(([, valor]) => decimalBr(Number(valor) * 10)).join("x");
  return `Dimensões(${letras}): ${valores}mm`;
}

/** "- Peso: 55g;" (acima de 1 kg, "1,2kg"). */
export function linhaDePeso(pesoKg) {
  const kg = Number(pesoKg);
  if (!(kg > 0)) return null;
  // kg com ate 3 casas: o campo guarda gramas inteiras (1,25 kg nao vira 1,3).
  return kg >= 1 ? `Peso: ${decimalBr(kg, 3)}kg` : `Peso: ${decimalBr(kg * 1000)}g`;
}

/**
 * As linhas "- Nome: valor;" de um texto, como especificacoes.
 *
 * Existe porque loja publica medida so no TEXTO da descricao: a Usinainfo escreve
 * "- Dimensões (CxLxE): ~54x29x5mm;" e "- Peso: 11g." na descricao e deixa a
 * ficha sem nenhuma medida — lendo so a ficha, o dado existia e nao aparecia.
 */
export function linhasDeEspecificacao(texto) {
  const especificacoes = [];
  for (const linha of String(texto ?? "").split(/\r?\n/)) {
    const casamento = /^\s*[-•]\s*([^:]{2,60}):\s*(.+?)\s*[;.]?\s*$/.exec(linha);
    if (casamento) especificacoes.push({ nome: casamento[1].trim(), valor: casamento[2] });
  }
  return especificacoes;
}

/**
 * Peso e medidas de um produto coletado: ficha primeiro, descricao depois. A
 * ordem importa porque quem le fica com a primeira ocorrencia.
 */
export function medidasDoProdutoColetado({ especificacoes, descricao }) {
  const daFicha = Array.isArray(especificacoes) ? especificacoes : [];
  return medidasDasEspecificacoes([...daFicha, ...linhasDeEspecificacao(descricao)]);
}

/**
 * Le peso e dimensoes de volta de uma descricao no padrao da loja (ou de
 * qualquer texto com linhas "- Nome: valor;"), para preencher os campos.
 * Vale a PRIMEIRA ocorrencia de cada medida.
 *
 * @returns {{pesoKg?: number, alturaCm?: number, larguraCm?: number, comprimentoCm?: number}}
 */
export function medidasDaDescricao(texto) {
  const achados = medidasDasEspecificacoes(linhasDeEspecificacao(texto));
  const resultado = {};
  if (achados.peso[0]) resultado.pesoKg = achados.peso[0].valor;
  if (achados.altura[0]) resultado.alturaCm = achados.altura[0].valor;
  if (achados.largura[0]) resultado.larguraCm = achados.largura[0].valor;
  if (achados.comprimento[0]) resultado.comprimentoCm = achados.comprimento[0].valor;
  return resultado;
}

/**
 * Tudo o que uma lista de especificacoes oferece: peso, altura, largura e
 * comprimento, cada um com o texto de onde saiu.
 */
export function medidasDasEspecificacoes(especificacoes) {
  const achados = { peso: [], altura: [], largura: [], comprimento: [] };

  for (const item of Array.isArray(especificacoes) ? especificacoes : []) {
    const nome = String(item?.nome ?? "").trim();
    const valor = String(item?.valor ?? "").trim();
    if (!nome || !valor) continue;
    const origem = `${nome}: ${valor}`.slice(0, 120);

    if (ROTULO_PESO.test(nome)) {
      const kg = pesoEmKg(valor);
      if (kg) achados.peso.push({ valor: kg, origem });
      continue;
    }

    const medidas = medidasDaEspecificacao(nome, valor);
    if (!medidas) continue;
    for (const eixo of ["altura", "largura", "comprimento"]) {
      if (medidas[eixo] !== undefined) {
        achados[eixo].push({
          valor: medidas[eixo],
          origem: medidas.presumida ? `${origem} (ordem presumida C x L x A)` : origem,
        });
      }
    }
  }

  return achados;
}
