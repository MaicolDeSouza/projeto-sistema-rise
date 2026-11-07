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

// O valor de cada especificacao comeca com letra maiuscula (pedido do dono em 03/11/2026: "apos o ':' das especificacoes as
// vezes comeca com letra minuscula; ajustar para comecar sempre com letra maiuscula"). So a primeira letra depois do primeiro
// ":" e so letra latina minuscula: numero, simbolo, unidade com "µ" e o que ja e maiusculo ficam como estao.
const VALOR_COM_MINUSCULA = /^(\s*(?:[-–]\s*)?[^:\n]+?:\s*)([a-zà-öø-ÿ])/u;

export function maiusculaNoValor(linha) {
  return String(linha).replace(VALOR_COM_MINUSCULA, (_, antes, letra) => antes + letra.toLocaleUpperCase("pt-BR"));
}

// Passa por aqui toda linha tecnica, inclusive as chaves que ligam a linha da descricao a loja de origem: a maiuscula
// entra dos dois lados, e a linha "- Divisivel: Sim" continua achando a loja que publicou "sim".
export function formatarLinhaTecnica(texto) {
  return maiusculaNoValor(normalizarTerminologiaEletrica(compactarUnidades(texto)));
}

/** So as linhas "- Nome: valor" da secao Especificacoes tecnicas, com a maiuscula no valor; o resto do texto fica igual. */
export function maiusculaNasEspecificacoes(texto) {
  const original = String(texto ?? "");
  const { inicio, fim } = limitesEspecificacoes(original);
  if (inicio < 0) return original;
  const linhas = original.split("\n");
  for (let indice = inicio; indice < fim; indice++) {
    if (/^\s*[-–]/.test(linhas[indice])) linhas[indice] = maiusculaNoValor(linhas[indice]);
  }
  return linhas.join("\n");
}

/**
 * Uma linha em branco depois do titulo, sempre (pedido do dono em 03/11/2026: "na descricao as vezes comeca sem o espaco;
 * sempre ter espaco apos o titulo da descricao"). Titulo = a primeira linha, toda em maiusculas, como a loja escreve: texto
 * que nao comeca por um titulo (descricao antiga com "....", texto livre) fica como esta. Mantem o "\r\n" de quem o usa.
 */
export function espacoAposTitulo(texto) {
  const original = String(texto ?? "");
  const linhas = original.split(/\r?\n/);
  const titulo = linhas[0]?.trim() ?? "";
  const ehTitulo = /\p{Lu}/u.test(titulo) && titulo === titulo.toLocaleUpperCase("pt-BR");
  if (!ehTitulo || linhas.length < 2 || !linhas[1].trim()) return original;
  return [linhas[0], "", ...linhas.slice(1)].join(original.includes("\r\n") ? "\r\n" : "\n");
}

/**
 * As linhas "- Nome: valor" das Especificacoes tecnicas pela `formatarLinhaTecnica` inteira (unidade colada, "tensao" no
 * lugar de "voltagem", maiuscula no valor). Passo zero das Correcoes da descricao (spec 2026-11-07): ate aqui so a IA do
 * Rise colava a unidade, e a proposta do Claude e o texto digitado no cadastro gravavam "5 V". So as linhas tecnicas: na
 * prosa "consome 2 A partir de" a regra das unidades leria o "A" como ampere.
 */
export function formatarLinhasTecnicas(texto) {
  const original = String(texto ?? "");
  const { inicio, fim } = limitesEspecificacoes(original);
  if (inicio < 0) return original;
  const linhas = original.split("\n");
  for (let indice = inicio; indice < fim; indice++) {
    if (/^\s*[-–]/.test(linhas[indice])) linhas[indice] = formatarLinhaTecnica(linhas[indice]);
  }
  return linhas.join("\n");
}

/** As regras do texto da loja que valem em todo caminho (IA, editor, proposta e o Salvar do produto). */
export function normalizarDescricao(texto) {
  return maiusculasNosItensInclusos(formatarLinhasTecnicas(espacoAposTitulo(texto)));
}

/**
 * Todos os itens inclusos em MAIUSCULAS (pedido do dono em 03/11/2026: "as outras linhas dos itens inclusos tambem podem ser
 * em letras maiusculas"; o 1o ja e o Nome, em maiusculas). So as linhas "- ..." entre "Itens inclusos:" e a secao seguinte:
 * uma frase solta no meio (descricao antiga com "Nao incluso cabo USB") fica como esta.
 */
export function maiusculasNosItensInclusos(texto) {
  const original = String(texto ?? "");
  const linhas = original.split("\n");
  const secao = linhas.findIndex((linha) => LINHA_DOS_ITENS.test(linha.trim()));
  if (secao < 0) return original;
  let mudou = false;
  for (let indice = secao + 1; indice < linhas.length && !CABECALHO_DE_SECAO.test(linhas[indice].trim()); indice++) {
    if (!/^\s*[-–]/.test(linhas[indice])) continue;
    const maiuscula = linhas[indice].toLocaleUpperCase("pt-BR");
    if (maiuscula !== linhas[indice]) {
      linhas[indice] = maiuscula;
      mudou = true;
    }
  }
  return mudou ? linhas.join("\n") : original;
}

/**
 * A dica das lojas de uma opcao: cada loja numa linha, "Loja: caracteristica como a loja publicou" (pedido do dono em
 * 13/10/2026: "4hobby: Microcontrolador: Atmega328P", e nao o titulo do produto). A dica nativa do navegador quebra
 * no "\n" (o `SeloPosicaoDePreco` ja faz assim). Sem a caracteristica cai no titulo do produto, e sem ele so a loja.
 */
export function dicaDasFontes(fontes) {
  return (Array.isArray(fontes) ? fontes : [])
    .map((fonte) => {
      const texto = fonte?.caracteristica || fonte?.produto;
      return texto ? `${fonte.nome}: ${texto}` : String(fonte?.nome ?? "");
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * A dica do rotulo "Cadastro" / "IA" de uma linha que nenhuma loja confirma (pedido do dono em 13/10/2026): de onde veio
 * o valor. Sobre a "IA", diz o que e verdade: nenhuma loja nem o cadastro traz o valor, e quais referencias ela apontou.
 */
export function dicaDaOrigem(origem) {
  if (!origem) return "";
  if (origem.tipo === "cadastro") return "Este valor está no título ou no cadastro do produto.";
  const linhas = ["Escrito pela IA: nenhuma loja nem o cadastro do produto traz este valor. Confira antes de salvar."];
  const apontadas = (origem.apontadas ?? []).map((item) => (item.produto ? `${item.loja}: ${item.produto}` : item.loja));
  if (apontadas.length > 0) linhas.push("", "A IA apontou, mas o texto não confirma:", ...apontadas);
  return linhas.join("\n");
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

/// Os titulos das secoes: nao se editam nem se excluem pelo lapis e pela lixeira (as secoes dao a estrutura do texto).
const CABECALHO_DE_SECAO = /^(Especificações técnicas|Itens inclusos|Garantia):/i;

/** A linha e o titulo de uma secao? ("Especificações técnicas:", "Itens inclusos: (Cod:...)", "Garantia:") */
export function ehCabecalhoDeSecao(linha) {
  return CABECALHO_DE_SECAO.test(String(linha ?? "").trim());
}

/**
 * O lapis de uma linha qualquer da descricao (titulo, paragrafo, item incluso, garantia; pedido do dono em 10/10/2026:
 * todos os campos com lapis e lixeira). Troca o texto da linha, numa linha so (quebra vira espaco). Linha em branco,
 * titulo de secao ou texto vazio: nao mexe.
 */
export function substituirLinha(texto, indice, nova) {
  const linhas = String(texto).split("\n");
  if (!linhas[indice]?.trim() || ehCabecalhoDeSecao(linhas[indice])) return String(texto);
  const limpa = String(nova ?? "").replace(/\s+/g, " ").trim();
  if (!limpa) return String(texto);
  linhas[indice] = limpa;
  return linhas.join("\n");
}

/**
 * A lixeira de uma linha qualquer. Tira a linha e junta as linhas em branco que ficarem seguidas (excluir o
 * unico paragrafo entre dois espacos nao deixa um buraco). Linha em branco ou titulo de secao: nao mexe.
 */
export function removerLinha(texto, indice) {
  const linhas = String(texto).split("\n");
  if (!linhas[indice]?.trim() || ehCabecalhoDeSecao(linhas[indice])) return String(texto);
  linhas.splice(indice, 1);
  const saida = [];
  for (const linha of linhas) {
    if (!linha.trim() && saida.length > 0 && !saida[saida.length - 1].trim()) continue;
    saida.push(linha);
  }
  return saida.join("\n");
}

/**
 * Excluir uma OPCAO de um dos dois primeiros paragrafos (a lixeira do quadro do paragrafo). Devolve as opcoes novas, qual
 * fica escolhida e as linhas de antes e de depois do paragrafo no texto (iguais se a excluida nao era a escolhida). Se
 * a escolhida sai, a primeira que sobrar assume. Com uma opcao so (ou indice invalido) nao ha o que excluir: `null`.
 */
export function excluirOpcaoDeParagrafo(opcoes, escolhidos, grupo, indice) {
  const lista = opcoes[grupo] ?? [];
  if (lista.length <= 1 || !Number.isInteger(indice) || indice < 0 || indice >= lista.length) return null;
  const nova = lista.filter((_, posicao) => posicao !== indice);
  const escolhido = escolhidos[grupo] ?? 0;
  const novoEscolhido = indice === escolhido ? 0 : indice < escolhido ? escolhido - 1 : escolhido;
  return {
    opcoes: opcoes.map((itens, posicao) => (posicao === grupo ? nova : itens)),
    escolhidos: escolhidos.map((valor, posicao) => (posicao === grupo ? novoEscolhido : valor)),
    linhaAntes: lista[escolhido],
    linhaDepois: nova[novoEscolhido],
  };
}

/**
 * Editar o texto de uma OPCAO de paragrafo (o lapis do quadro). Se ela e a escolhida, o texto da descricao muda junto
 * (`linhaAntes` -> `linhaDepois`). Texto vazio ou indice invalido: `null`.
 */
export function editarOpcaoDeParagrafo(opcoes, escolhidos, grupo, indice, novo) {
  const lista = opcoes[grupo] ?? [];
  const limpo = String(novo ?? "").replace(/\s+/g, " ").trim();
  if (!limpo || !Number.isInteger(indice) || indice < 0 || indice >= lista.length) return null;
  const escolhido = escolhidos[grupo] ?? 0;
  return {
    opcoes: opcoes.map((itens, posicao) => (posicao === grupo ? itens.map((item, i) => (i === indice ? limpo : item)) : itens)),
    linhaAntes: lista[escolhido],
    linhaDepois: indice === escolhido ? limpo : lista[escolhido],
  };
}

const LINHA_DOS_ITENS = /^Itens inclusos:/i;

/** O codigo da linha "Itens inclusos: (Cod:100101)": "100101"; "" se a linha nao traz codigo; null se nao e essa linha. */
export function codigoDosItensInclusos(linha) {
  const texto = String(linha ?? "").trim();
  if (!LINHA_DOS_ITENS.test(texto)) return null;
  // "Cod:" (o que a geracao escreve) ou "Cód:" (como as descricoes antigas do cadastro).
  return texto.match(/\(C[oó]d:([^)]*)\)/i)?.[1].trim() ?? "";
}

/**
 * Troca o codigo da linha "Itens inclusos" (o lapis do codigo, pedido do dono em 10/10/2026: ele vem do codigo do
 * produto, mas fica aberto para editar). Codigo vazio deixa so "Itens inclusos:". Nas outras linhas nao mexe.
 */
export function substituirCodigoDosItens(texto, indice, codigo) {
  const linhas = String(texto).split("\n");
  if (!LINHA_DOS_ITENS.test(String(linhas[indice] ?? "").trim())) return String(texto);
  const limpo = String(codigo ?? "").replace(/[()\r\n]/g, "").trim();
  // Mantem a grafia que a linha ja tinha ("Cód" ou "Cod").
  const rotulo = String(linhas[indice]).match(/\((C[oó]d):/i)?.[1] ?? "Cod";
  linhas[indice] = limpo ? `Itens inclusos: (${rotulo}:${limpo})` : "Itens inclusos:";
  return linhas.join("\n");
}

/// O titulo como a descricao o escreve (`montarDescricao`): espacos simples, em maiusculas e sem o "*SKU" que nomes antigos
/// trazem no fim ("BARRA DE PINOS 15 VIAS *900211"), que a descricao nao repete.
function tituloComoNaDescricao(titulo) {
  return String(titulo ?? "").replace(/\s+\*\S+\s*$/, "").replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");
}

/// O "(Cód. 100265)" que itens inclusos antigos trazem no fim do nome.
const CODIGO_NO_ITEM = /\s*\(C[oó]d[.:][^)]*\)\s*$/i;

/// Para comparar nomes: sem acento e sem o codigo no fim ("MODULO RELE" e "MÓDULO RELÉ" sao o mesmo nome).
const paraComparar = (texto) =>
  tituloComoNaDescricao(String(texto ?? "").replace(CODIGO_NO_ITEM, "")).normalize("NFD").replace(/\p{Diacritic}/gu, "");

/// A primeira linha e um titulo: toda em maiusculas, como a loja escreve, e nao um item nem o titulo de uma secao.
function ehLinhaDeTitulo(linha) {
  const texto = String(linha ?? "").trim();
  return /\p{Lu}/u.test(texto) && texto === texto.toLocaleUpperCase("pt-BR") && !/^[-–]/.test(texto) && !CABECALHO_DE_SECAO.test(texto);
}

/// Um item incluso: "- 01 PLACA;" -> o que vem antes do nome (marcador e quantidade), o nome e o que vem depois.
const ITEM_INCLUSO = /^(\s*-\s*(?:\d+\s+)?)(.*?)(\s*[;.]?\s*)$/;

/**
 * O Nome do produto mudou (pedido do dono em 25/10/2026): a descricao acompanha, no titulo da primeira linha e no
 * PRIMEIRO item de "Itens inclusos". Em 03/11/2026 o dono viu os dois ficarem para tras ("ao mudar o titulo, as vezes nao
 * altera o titulo da descricao e tambem nao altera a primeira linha dos itens inclusos"): a proposta aplica um Nome novo
 * com a descricao do Nome antigo, e acento, espaco ou o "*SKU" do nome antigo impediam o casamento. Agora:
 * - o titulo da descricao (a primeira linha em maiusculas) acompanha SEMPRE o Nome;
 * - o 1o item acompanha quando e o Nome de antes OU o titulo que a descricao trazia (sem acento, codigo ou "*SKU" na
 *   comparacao); um item que diz outra coisa (outro texto, um acessorio no lugar) fica, e a quantidade fica sempre.
 * Sem Nome de antes ou de depois (o Nome apagado de uma vez, ou o primeiro digitado num cadastro vazio), devolve o texto.
 */
export function acompanharTituloNaDescricao(texto, tituloAntes, tituloDepois) {
  const original = String(texto ?? "");
  const depois = tituloComoNaDescricao(tituloDepois);
  if (!tituloComoNaDescricao(tituloAntes) || !depois) return original;

  // O navegador entrega a quebra como "\n", mas a descricao antiga do cadastro pode trazer "\r\n": o "\r" fica onde estava.
  const linhas = original.split("\n");
  const fim = (linha) => (linha.endsWith("\r") ? "\r" : "");
  let mudou = false;

  const primeira = linhas.findIndex((linha) => linha.trim());
  const nomesDeAntes = new Set([paraComparar(tituloAntes)]);
  if (primeira >= 0 && (ehLinhaDeTitulo(linhas[primeira]) || paraComparar(linhas[primeira]) === paraComparar(tituloAntes))) {
    nomesDeAntes.add(paraComparar(linhas[primeira]));
    if (linhas[primeira].replace(/\r$/, "") !== depois) {
      linhas[primeira] = depois + fim(linhas[primeira]);
      mudou = true;
    }
  }

  const secao = linhas.findIndex((linha) => LINHA_DOS_ITENS.test(linha.trim()));
  if (secao >= 0) {
    // So o primeiro item: a linha logo abaixo do titulo da secao, e so se for mesmo um item.
    const linha = linhas[secao + 1] ?? "";
    const partes = ITEM_INCLUSO.exec(linha.replace(/\r$/, ""));
    const codigo = partes?.[2].match(CODIGO_NO_ITEM)?.[0] ?? "";
    const nome = partes ? partes[2].slice(0, partes[2].length - codigo.length) : "";
    if (partes && nome.trim() && nomesDeAntes.has(paraComparar(nome)) && nome !== depois) {
      linhas[secao + 1] = partes[1] + depois + codigo + partes[3] + fim(linha);
      mudou = true;
    }
  }

  return mudou ? linhas.join("\n") : original;
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
  return normalizarDescricao(`${antes}\n${especificacoes.join("\n")}${depois ? `\n\n${depois}` : ""}`.trim());
}
