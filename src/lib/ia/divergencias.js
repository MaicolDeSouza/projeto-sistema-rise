import { linhaDeDimensoes, linhaDePeso, linhasDeEspecificacao, medidasDoProdutoColetado } from "../medidas.js";
import { normalizar } from "../texto.js";

const chave = (texto) => normalizar(texto).replace(/[^a-z0-9]/g, "");
const ehMedida = /^(peso|dimens|tamanho|medidas|altura|largura|comprimento|profundidade|espessura)/i;
const ROTULOS_DE_CATALOGO = new Set(["modelo", "marca"]);

function identidadeDoValor(campo, valor) {
  const rotulo = chave(campo);
  const texto = normalizar(valor).replace(/,/g, ".");
  // O mesmo numero com explicacao adicional nao e uma divergencia. A ficha
  // escolhida conserva a redacao mais completa, mas o operador so revisa
  // quando o dado numerico central realmente muda.
  if (["memoriaflash", "sram", "eeprom"].includes(rotulo)) {
    return texto.match(/\d+(?:\.\d+)?\s*(?:k|m)b\b/)?.[0].replace(/\s+/g, "") ?? chave(valor);
  }
  if (["tensaodeoperacao", "nivellogico"].includes(rotulo)) {
    return texto.match(/\d+(?:\.\d+)?\s*v(?:dc)?\b/)?.[0].replace(/\s|dc/g, "") ?? chave(valor);
  }
  if (["entradassaidasdigitais", "portasdigitais", "pinosdigitais"].includes(rotulo)) {
    return texto.match(/\d+/)?.[0] ?? chave(valor);
  }
  return chave(valor);
}

/**
 * A opcao recomendada de uma divergencia, SEMPRE uma (pedido do dono em 10/10/2026: o "Finalizar descricao" usa a
 * recomendada onde o dono nao escolheu, e nao pode travar). Ate ali a recomendacao podia faltar.
 *
 * - A decisao da IA vale quando aponta uma opcao da lista.
 * - Corrente de pico x continua (lojas que misturam as duas): recomendar so o pico seria anunciar a corrente de
 *   pico como valor de operacao. Antes a recomendacao era apagada; agora vai para a opcao que traz a continua.
 * - Sem decisao da IA: a opcao confirmada por mais lojas; no empate, a primeira.
 */
export function recomendacaoDaDivergencia(item, decisao) {
  const opcoes = item?.opcoes ?? [];
  if (opcoes.length === 0) return { recomendada: null, motivo: "" };
  let recomendada = Number.isInteger(decisao?.opcao) && decisao.opcao >= 0 && decisao.opcao < opcoes.length
    ? decisao.opcao
    : null;
  let motivo = String(decisao?.motivo ?? "").slice(0, 300);

  const temContinua = (opcao) => /cont[ií]nu/i.test(opcao.valor);
  const misturaPicoEContinua = /corrente/i.test(item.campo ?? "") &&
    opcoes.some((opcao) => /pico/i.test(opcao.valor) && temContinua(opcao));
  if (misturaPicoEContinua && (recomendada === null || !temContinua(opcoes[recomendada]))) {
    recomendada = opcoes.findIndex(temContinua);
    motivo = "As lojas misturam corrente de pico e corrente contínua: a recomendada traz a contínua, que é o valor de operação. Confira antes de salvar.";
  }

  if (recomendada === null) {
    recomendada = opcoes.reduce(
      (melhor, opcao, indice) => ((opcao.fontes?.length ?? 0) > (opcoes[melhor].fontes?.length ?? 0) ? indice : melhor),
      0,
    );
    motivo = motivo || "A IA não decidiu: recomendada a opção confirmada por mais lojas.";
  }
  return { recomendada, motivo };
}

/** Compara fatos publicados por lojas distintas sem confundir unidade ou ordem dos eixos. */
export function identificarDivergencias(referencias) {
  const campos = new Map();

  function registrar(id, campo, valor, linha, referencia, aviso = null) {
    if (!valor || !linha) return;
    if (!campos.has(id)) campos.set(id, { id, campo, opcoes: new Map() });
    const grupo = campos.get(id);
    const identidade = id.startsWith("spec:") ? identidadeDoValor(campo, valor) : chave(valor);
    if (!grupo.opcoes.has(identidade)) {
      grupo.opcoes.set(identidade, { valor, linha, aviso, fontes: [] });
    }
    const opcao = grupo.opcoes.get(identidade);
    if (!opcao.fontes.some((fonte) => fonte.id === referencia.id)) {
      opcao.fontes.push({ id: referencia.id, nome: referencia.fonte.nome, produto: referencia.nome });
    }
  }

  for (const referencia of referencias) {
    const medidas = medidasDoProdutoColetado(referencia);
    const dimensoes = linhaDeDimensoes({
      comprimentoCm: medidas.comprimento[0]?.valor,
      larguraCm: medidas.largura[0]?.valor,
      alturaCm: medidas.altura[0]?.valor,
    });
    if (dimensoes) {
      const ordemPresumida = ["comprimento", "largura", "altura"]
        .some((eixo) => medidas[eixo][0]?.origem.includes("ordem presumida"));
      registrar("dimensoes", "Dimensoes", dimensoes.split(": ")[1], `- ${dimensoes};`, referencia,
        ordemPresumida ? "Ordem dos eixos presumida; confirme na fonte." : null);
    }
    const peso = linhaDePeso(medidas.peso[0]?.valor);
    if (peso) registrar("peso", "Peso", peso.split(": ")[1], `- ${peso};`, referencia);

    const especificacoes = [
      ...(Array.isArray(referencia.especificacoes) ? referencia.especificacoes : []),
      ...linhasDeEspecificacao(referencia.descricao),
    ];
    const vistosNaFonte = new Set();
    for (const item of especificacoes) {
      const nome = String(item?.nome ?? "").trim();
      const valor = String(item?.valor ?? "").trim().replace(/[;.]$/, "");
      const id = `spec:${chave(nome)}`;
      if (!nome || !valor || ehMedida.test(nome) || ROTULOS_DE_CATALOGO.has(chave(nome)) || vistosNaFonte.has(id)) continue;
      vistosNaFonte.add(id);
      registrar(id, nome, valor, `- ${nome}: ${valor};`, referencia);
    }
  }

  return [...campos.values()]
    .filter((grupo) => grupo.opcoes.size > 1)
    .map((grupo) => ({ ...grupo, opcoes: [...grupo.opcoes.values()] }));
}

export const idDaCaracteristica = (nome) => `spec:${chave(nome)}`;
