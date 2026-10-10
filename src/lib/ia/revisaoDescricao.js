const CABECALHO = "Especificações técnicas:";
const PROXIMA_SECAO = /^(Itens inclusos|Garantia):/i;

export function compactarUnidades(texto) {
  return String(texto).replace(
    /(\d+(?:[.,]\d+)?)\s+(miliampères?|miliamperes?|milímetros?|milimetros?|quilobytes?|kilobytes?|megahertz|gigahertz|volts?|mAh|µA|uA|mA|Vdc|GHz|MHz|kHz|Hz|KB|Kb|MB|Mb|GB|Gb|TB|mm|cm|km|mg|kg|°C|kW|W|V|A|m|g)(?=$|[^\p{L}\p{N}])/gu,
    "$1$2",
  );
}

export function normalizarTerminologiaEletrica(texto) {
  return String(texto).replace(/\b(voltagem|voltagens|amperagem|amperagens)\b/gi, (termo) => {
    const minusculo = termo.toLowerCase();
    const equivalente = minusculo.startsWith("voltag")
      ? (minusculo.endsWith("ens") ? "tensões" : "tensão")
      : (minusculo.endsWith("ens") ? "correntes" : "corrente");
    if (termo === termo.toUpperCase()) return equivalente.toUpperCase();
    return termo[0] === termo[0].toUpperCase()
      ? equivalente[0].toUpperCase() + equivalente.slice(1)
      : equivalente;
  });
}

export function formatarLinhaTecnica(texto) {
  return normalizarTerminologiaEletrica(compactarUnidades(texto));
}

export function limitesEspecificacoes(texto) {
  const linhas = String(texto).split("\n");
  const cabecalho = linhas.findIndex((linha) => linha.trim() === CABECALHO);
  if (cabecalho < 0) return { cabecalho: -1, inicio: -1, fim: -1 };
  let fim = cabecalho + 1;
  while (fim < linhas.length && !PROXIMA_SECAO.test(linhas[fim].trim())) fim++;
  return { cabecalho, inicio: cabecalho + 1, fim };
}

export function garantirSecaoEspecificacoes(texto) {
  if (limitesEspecificacoes(texto).cabecalho >= 0) return String(texto);
  const linhas = String(texto).split("\n");
  let indice = linhas.findIndex((linha) => PROXIMA_SECAO.test(linha.trim()));
  if (indice < 0) indice = linhas.length;
  linhas.splice(indice, 0, CABECALHO, "");
  return linhas.join("\n");
}

export function adicionarEspecificacao(texto, especificacao) {
  const linha = String(especificacao).trim().replace(/^[-–]\s*/, "").replace(/[;\s]+$/, "");
  if (!linha) return String(texto);
  const nova = "- " + formatarLinhaTecnica(linha) + ";";
  const linhas = String(texto).split("\n");
  let { cabecalho, fim } = limitesEspecificacoes(texto);
  if (cabecalho < 0) {
    cabecalho = linhas.findIndex((item) => PROXIMA_SECAO.test(item.trim()));
    if (cabecalho < 0) cabecalho = linhas.length;
    linhas.splice(cabecalho, 0, CABECALHO);
    fim = cabecalho + 1;
  }
  if (linhas.slice(cabecalho + 1, fim).some((item) => item.trim().toLowerCase() === nova.toLowerCase())) {
    return linhas.join("\n");
  }
  while (fim > cabecalho + 1 && !linhas[fim - 1].trim()) fim--;
  linhas.splice(fim, 0, nova);
  return linhas.join("\n");
}

export function inserirEspecificacaoNaPosicao(texto, especificacao, posicao, ignoradas = []) {
  const garantido = garantirSecaoEspecificacoes(texto);
  const linha = String(especificacao).trim().replace(/^[-–]\s*/, "").replace(/[;\s]+$/, "");
  if (!linha) return garantido;
  const nova = "- " + formatarLinhaTecnica(linha) + ";";
  const linhas = garantido.split("\n");
  const { inicio, fim } = limitesEspecificacoes(garantido);
  if (linhas.slice(inicio, fim).some((item) => item.trim().toLowerCase() === nova.toLowerCase())) {
    return garantido;
  }
  const ignorar = new Set(ignoradas);
  let vistas = 0;
  let inserirEm = fim;
  for (let indice = inicio; indice < fim; indice++) {
    if (!linhas[indice].trim()) continue;
    if (!ignorar.has(linhas[indice])) {
      if (vistas >= posicao) {
        inserirEm = indice;
        break;
      }
      vistas++;
    }
  }
  while (inserirEm > inicio && !linhas[inserirEm - 1].trim()) inserirEm--;
  linhas.splice(inserirEm, 0, nova);
  return linhas.join("\n");
}

/**
 * Troca o texto de UMA linha das especificacoes (o lapis das linhas comuns, pedido do dono em 10/10/2026). A linha
 * volta no formato "- Nome: valor;", com a unidade colada. Fora das especificacoes, ou com o texto vazio, nao mexe.
 */
export function substituirEspecificacao(texto, indice, nova) {
  const linhas = String(texto).split("\n");
  const { inicio, fim } = limitesEspecificacoes(texto);
  if (indice < inicio || indice >= fim || !linhas[indice]?.trim()) return String(texto);
  const limpa = String(nova).trim().replace(/^[-–]\s*/, "").replace(/[;.\s]+$/, "");
  if (!limpa) return String(texto);
  linhas[indice] = "- " + formatarLinhaTecnica(limpa) + ";";
  return linhas.join("\n");
}

/**
 * Mover um QUADRO de parametro (pedido do dono em 10/10/2026). A `posicao` do quadro e quantas linhas comuns vem
 * antes dele; quadros na mesma posicao seguem a `ordem` (lista de ids). Devolve o novo estado, sem mexer no de entrada.
 *
 * - `trocarCom`: troca de lugar com o quadro vizinho (posicao e ordem).
 * - senao, `posicao` e a nova posicao, e `lugar` diz onde ele fica entre os que ja estao nela: "fim" (depois deles,
 *   que e o caso de subir por cima de uma linha) ou "inicio" (antes deles, o de descer por cima de uma linha).
 */
export function moverQuadroNoEstado(divergencias, ordem, id, { posicao, trocarCom, lugar } = {}) {
  const minha = divergencias.find((item) => item.id === id);
  if (!minha) return { divergencias, ordem };
  const outro = trocarCom ? divergencias.find((item) => item.id === trocarCom) : null;
  const novas = divergencias.map((item) => {
    if (item.id === id) return { ...item, posicao: outro ? outro.posicao : posicao };
    if (outro && item.id === outro.id) return { ...item, posicao: minha.posicao };
    return item;
  });
  const base = [...new Set([...ordem, ...divergencias.map((item) => item.id)])];
  const aqui = base.indexOf(id);
  if (outro) {
    const ali = base.indexOf(outro.id);
    [base[aqui], base[ali]] = [base[ali], base[aqui]];
  } else {
    base.splice(aqui, 1);
    if (lugar === "inicio") base.unshift(id);
    else base.push(id);
  }
  return { divergencias: novas, ordem: base };
}

export function removerEspecificacao(texto, indice) {
  const linhas = String(texto).split("\n");
  const { inicio, fim } = limitesEspecificacoes(texto);
  if (indice < inicio || indice >= fim || !linhas[indice]?.trim()) return String(texto);
  linhas.splice(indice, 1);
  return linhas.join("\n");
}

export function moverEspecificacao(texto, origem, destino) {
  const linhas = String(texto).split("\n");
  const { inicio, fim } = limitesEspecificacoes(texto);
  if (origem < inicio || origem >= fim || destino < inicio || destino >= fim || !linhas[origem]?.trim() || !linhas[destino]?.trim()) {
    return String(texto);
  }
  const [linha] = linhas.splice(origem, 1);
  linhas.splice(destino, 0, linha);
  return linhas.join("\n");
}

export function moverEspecificacaoPorPasso(texto, origem, direcao) {
  const linhas = String(texto).split("\n");
  const { inicio, fim } = limitesEspecificacoes(texto);
  if (origem < inicio || origem >= fim || !linhas[origem]?.trim()) return String(texto);
  let destino = origem + direcao;
  while (destino >= inicio && destino < fim && !linhas[destino].trim()) destino += direcao;
  return moverEspecificacao(texto, origem, destino);
}

/**
 * Troca um dos dois primeiros paragrafos da descricao por outra opcao (pedido do dono em 04/10/2026: a IA
 * escreve 3 opcoes de cada um e ele escolhe). Cada paragrafo mora numa LINHA, entao e essa linha, igual ao
 * texto do paragrafo atual, que sai.
 *
 * Devolve `null` quando a linha nao existe mais: o dono editou, moveu ou apagou o paragrafo a mao, e trocar
 * "no escuro" poderia escrever a opcao no lugar errado. Quem chama avisa o dono, em vez de adivinhar.
 *
 * @param {string} texto a descricao inteira
 * @param {string} atual o paragrafo que esta no texto agora
 * @param {string} novo a opcao que entra no lugar
 * @returns {string | null}
 */
export function trocarParagrafo(texto, atual, novo) {
  const procurado = String(atual ?? "").trim();
  if (!procurado) return null;
  const linhas = String(texto).split("\n");
  const indice = linhas.findIndex((linha) => linha.trim() === procurado);
  if (indice < 0) return null;
  linhas[indice] = String(novo ?? "").trim();
  return linhas.join("\n");
}

export function organizarDescricao(texto) {
  const linhas = String(texto).replace(/\r\n/g, "\n").split("\n");
  const { inicio, fim } = limitesEspecificacoes(linhas.join("\n"));
  if (inicio < 0) return String(texto).trim();
  const especificacoes = linhas.slice(inicio, fim)
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((linha) => "- " + formatarLinhaTecnica(linha.replace(/^[-–]\s*/, "").replace(/[;\s]+$/, "")) + ";");
  const antes = linhas.slice(0, inicio).join("\n").trimEnd();
  const depois = linhas.slice(fim).join("\n").trim();
  return `${antes}\n${especificacoes.join("\n")}${depois ? `\n\n${depois}` : ""}`.trim();
}
