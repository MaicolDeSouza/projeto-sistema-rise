import { buscarJson } from "./buscar";

/**
 * Estoque e preco AO VIVO do portal da Benser (Fortek), por cima do arquivo salvo.
 *
 * O portal guarda dentro da pagina uma lista de estoque ANTIGA e, ao abrir no
 * navegador, troca os numeros pelos do Bling deles (`/api/estoque` na Pronta
 * Entrega, `/api/estoque-reserva` na Lista de Reserva). O Ctrl+S salva a pagina
 * com os numeros antigos. Medido em 22/10/2026: dos 1.968 itens da Pronta
 * Entrega, 1.202 tinham outro estoque e 187 apareciam com estoque estando
 * zerados (o 64-380 com 214 no arquivo e 0 no portal); na Reserva, 6 de 16.
 *
 * As regras sao as da propria pagina do portal (`startEstoqueSync`): a resposta
 * so vale com `ok` e um minimo de itens (1.000 / 200), e o item que nao veio
 * nela fica com zero quando faltam no maximo 20% dos itens. So os itens que
 * estao no ARQUIVO mudam: o ao vivo da reserva traz centenas de codigos que a
 * pagina nao mostra aos clientes (sem nome nem descricao), e eles ficam de fora.
 * Preco so troca quando o ao vivo traz um numero maior que zero.
 */

const ORIGEM = "https://benser.com.br";

/** Endereco e minimo de itens do ao vivo, ou null quando o arquivo nao e do portal da Benser. */
export function aoVivoDaBenser(html, modalidade) {
  const doPortal =
    /<meta[^>]+og:url[^>]+benser\.com\.br/i.test(html ?? "") ||
    /<title[^>]*>\s*Benser\s*·/i.test(html ?? "");
  if (!doPortal) return null;
  // A pagina Em Montagem le o MESMO ao vivo da reserva (medido em 01/11/2026: os 490 itens dela estao nos 494 do
  // `/api/estoque-reserva`, e os 4 da Lista de Reserva tambem; as duas listas nao repetem codigo).
  if (modalidade === "MONTAGEM") return { endereco: `${ORIGEM}/api/estoque-reserva`, minimo: 200, lista: "Em Montagem" };
  return modalidade === "RESERVA"
    ? { endereco: `${ORIGEM}/api/estoque-reserva`, minimo: 200, lista: "Lista de Reserva" }
    : { endereco: `${ORIGEM}/api/estoque`, minimo: 1000, lista: "Pronta Entrega" };
}

/**
 * As tres paginas do portal, baixadas pelo Rise sozinho (01/11/2026, pedido do dono: varrer a Fortek sem Ctrl+S).
 *
 * O "login" do portal e so a tela de senha conferida no navegador: a lista inteira vem na pagina (16 MB na Pronta
 * Entrega, com as fotos em base64) e o ao vivo responde sem sessao. Medido em 01/11/2026 sem cookie nenhum: 1.997 itens na
 * Pronta Entrega, 4 na Lista de Reserva e 490 Em Montagem. O nome do arquivo e o que `modalidadeDoArquivo` le se um
 * dia o titulo mudar; o titulo da pagina continua valendo primeiro.
 */
export const PAGINAS_DA_BENSER = [
  { caminho: "/", nome: "benser-pronta-entrega.html", lista: "Pronta Entrega" },
  { caminho: "/reserva/", nome: "benser-lista-de-reserva.html", lista: "Lista de Reserva" },
  { caminho: "/montagem/", nome: "benser-em-montagem.html", lista: "Em Montagem" },
];

/**
 * Baixa as tres paginas. Qualquer uma que falhe derruba o conjunto (`erro`): as listas so fazem sentido juntas — sem
 * a Pronta Entrega, tudo o que so existe nela viraria ausente, e a trava de queda recusaria de qualquer jeito.
 *
 * @param {object} [opcoes]
 * @param {Function} [opcoes.buscar]  `buscarBytes` (teto de 50 MB; a pagina passa dos 2 MB do `buscarPagina`)
 */
export async function baixarListasDaBenser({ buscar, sinal = null } = {}) {
  const arquivos = [];
  for (const pagina of PAGINAS_DA_BENSER) {
    sinal?.throwIfAborted?.();
    const resposta = await buscar(`${ORIGEM}${pagina.caminho}`, { sinal });
    if (!resposta?.ok || !resposta.bytes?.length) {
      return { erro: `${pagina.lista} do portal Benser não baixou: ${resposta?.erro ?? "sem resposta"}` };
    }
    arquivos.push({ nome: pagina.nome, bytes: new Uint8Array(resposta.bytes) });
  }
  return { arquivos };
}

/** Desfaz os escapes de texto JavaScript que o portal usa nos rotulos ("Aéreo Outubro"). */
function textoDoJs(bruto) {
  return bruto.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\(.)/g, "$1");
}

/** Os pares `if(k==='CHAVE')return 'texto'` de uma funcao da pagina. */
function paresDaFuncao(html, nome) {
  const inicio = html.indexOf(`function ${nome}(`);
  if (inicio < 0) return new Map();
  const corpo = html.slice(inicio, html.indexOf("}", inicio) + 1);
  const pares = new Map();
  for (const [, chave, texto] of corpo.matchAll(/k\s*===?\s*'((?:[^'\\]|\\.)*)'\s*\)\s*return\s*'((?:[^'\\]|\\.)*)'/g)) {
    pares.set(textoDoJs(chave).toUpperCase(), textoDoJs(texto));
  }
  return pares;
}

/**
 * Carga e previsao de chegada da Lista de Reserva, por `loc` do item: "Marítimo Outubro — Chegada prevista para a
 * segunda quinzena de outubro". A pagina escreve os dois em funcoes (`cargaLabel` e `cargaPrev`), e nao no dado do
 * item; sao lidas como texto a cada varredura, porque a Benser troca as cargas.
 *
 * @returns {Map<string, string>} chave = `loc` em maiusculas
 */
export function previsoesDaBenser(html) {
  const rotulos = paresDaFuncao(html ?? "", "cargaLabel");
  const previsoes = paresDaFuncao(html ?? "", "cargaPrev");
  const resultado = new Map();
  for (const chave of new Set([...rotulos.keys(), ...previsoes.keys()])) {
    const texto = [rotulos.get(chave), previsoes.get(chave)].filter(Boolean).join(" — ");
    if (texto) resultado.set(chave, texto);
  }
  return resultado;
}

/**
 * Aplica a resposta do ao vivo aos itens brutos do arquivo (`{sku, preco, estoque}`).
 * Devolve os itens novos (nunca muda os de entrada) e o resumo, ou `erro` sem itens.
 */
export function aplicarAoVivo(brutos, resposta, minimo) {
  const saldos = resposta?.saldos;
  if (!resposta || resposta.ok === false || !saldos || typeof saldos !== "object") {
    return { erro: "resposta sem saldos" };
  }
  if (Object.keys(saldos).length < minimo) {
    return { erro: `resposta com ${Object.keys(saldos).length} itens (mínimo ${minimo})` };
  }
  const precos = resposta.precos && typeof resposta.precos === "object" ? resposta.precos : {};
  const tem = (mapa, sku) => Object.prototype.hasOwnProperty.call(mapa, sku);

  const comCodigo = brutos.filter((bruto) => typeof bruto?.sku === "string");
  const faltando = comCodigo.filter((bruto) => !tem(saldos, bruto.sku)).length;
  const zerarAusentes = faltando <= comCodigo.length * 0.2;

  let estoqueMudou = 0;
  let precoMudou = 0;
  const itens = brutos.map((bruto) => {
    if (typeof bruto?.sku !== "string") return bruto;
    const novo = { ...bruto };
    if (tem(saldos, bruto.sku)) {
      const valor = Number(saldos[bruto.sku]);
      if (!Number.isNaN(valor)) novo.estoque = Math.max(0, valor);
    } else if (zerarAusentes) {
      novo.estoque = 0;
    }
    if (tem(precos, bruto.sku)) {
      const preco = Number(precos[bruto.sku]);
      if (!Number.isNaN(preco) && preco > 0) novo.preco = preco;
    }
    if (Number(novo.estoque) !== Number(bruto.estoque)) estoqueMudou++;
    if (Number(novo.preco) !== Number(bruto.preco)) precoMudou++;
    return novo;
  });

  const lidoEm = Number.isFinite(Number(resposta.ts)) ? new Date(Number(resposta.ts)) : null;
  return { itens, estoqueMudou, precoMudou, ausentes: faltando, zerouAusentes: zerarAusentes && faltando > 0, lidoEm };
}

/** "12:16 de 22/10", no horario de Sao Paulo. */
export function horaDaLeitura(data) {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) return null;
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).formatToParts(data);
  const valor = (tipo) => partes.find((parte) => parte.type === tipo)?.value;
  return `${valor("hour")}:${valor("minute")} de ${valor("day")}/${valor("month")}`;
}

/**
 * Le o ao vivo e aplica. Falha nunca derruba a leitura do arquivo: volta `erro`
 * e quem chama mantem os numeros do arquivo com um aviso.
 */
export async function estoqueAoVivoDaBenser(brutos, html, modalidade, { buscar = buscarJson, sinal = null } = {}) {
  const alvo = aoVivoDaBenser(html, modalidade);
  if (!alvo) return null;

  const resposta = await buscar(alvo.endereco, { sinal });
  if (!resposta?.ok) return { ...alvo, erro: resposta?.erro ?? "sem resposta" };

  let dados;
  try {
    dados = JSON.parse(resposta.corpo);
  } catch {
    return { ...alvo, erro: "resposta não é JSON" };
  }
  return { ...alvo, ...aplicarAoVivo(brutos, dados, alvo.minimo) };
}
