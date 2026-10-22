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
  return modalidade === "RESERVA"
    ? { endereco: `${ORIGEM}/api/estoque-reserva`, minimo: 200, lista: "Lista de Reserva" }
    : { endereco: `${ORIGEM}/api/estoque`, minimo: 1000, lista: "Pronta Entrega" };
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
