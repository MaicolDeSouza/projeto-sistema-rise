/**
 * "Aplicar escolhidos ao formulario" (spec 2026-10-16, Como a tela mostra): o que cada secao marcada da proposta poe nos
 * campos do cadastro. Sem imports: roda no navegador (o FormularioProduto preenche os campos com isto e nada e gravado
 * ate o Salvar).
 *
 * Valor ausente ou vazio na proposta NAO entra: aplicar nunca apaga o que o produto tem (o EAN vazio, por exemplo, quer
 * dizer "nada confiavel", e nao "apague o EAN").
 */

/** As secoes que preenchem campos. Fotos tem o proprio "Aplicar" na aba Imagens; documentos e relatorio so se leem. */
export const SECOES_APLICAVEIS = ["descricao", "titulos", "campos", "preco", "ean"];

const temValor = (valor) => valor !== null && valor !== undefined && String(valor).trim() !== "";

/**
 * A secao tem o que pôr no formulario? O EAN vazio ("nada confiavel"), o preco sem recomendada nem opcao e campos sem
 * nenhum valor nao preenchem nada: nao ganham caixa na tela nem contam como pendentes no Conferido.
 */
export function temOQueAplicar(secao, conteudo) {
  if (!SECOES_APLICAVEIS.includes(secao) || !conteudo) return false;
  if (secao === "ean") return temValor(conteudo.escolhido?.valor);
  if (secao === "preco") return (conteudo.opcoes ?? []).some((opcao) => temValor(opcao?.preco)) || temValor(conteudo.recomendada?.preco);
  if (secao === "campos") return Object.values(conteudo).some((item) => temValor(item?.valor));
  if (secao === "titulos") return (conteudo.opcoes ?? []).some(temValor);
  return temValor(conteudo.texto);
}

/** Campos da secao `campos` e o campo do formulario de cada um (`codigo` vai para o SKU). */
const CAMPO_DO_FORMULARIO = {
  marca: "marca", modelo: "modelo", unidade: "unidade", garantiaMeses: "garantiaMeses", codigo: "sku", ncm: "ncm",
  origem: "origem", pesoKg: "pesoKg", alturaCm: "alturaCm", larguraCm: "larguraCm", comprimentoCm: "comprimentoCm",
};

/**
 * @param {Record<string, any>} secoes `PropostaDeProduto.secoes`
 * @param {{ secoes?: string[], titulo?: number, preco?: number }} escolhas secoes marcadas; `titulo` = indice da opcao
 *   (sem ele, a recomendada); `preco` = margem da opcao (sem ela, a recomendada)
 * @param {{ sku?: string }} produto o produto na tela: o codigo da proposta so entra sem SKU
 * @returns {{ campos: Record<string, unknown>, secoes: string[] }} campos para o `aplicar` do formulario e as secoes
 *   que de fato puseram algum campo (vao no Salvar, que as marca como aplicadas)
 */
export function camposDoFormularioDaProposta(secoes, escolhas = {}, produto = {}) {
  const marcadas = (escolhas.secoes ?? SECOES_APLICAVEIS).filter((secao) => SECOES_APLICAVEIS.includes(secao) && secoes?.[secao]);
  const campos = {};
  const aplicadas = [];
  const por = (secao, novos) => {
    const comValor = Object.entries(novos).filter(([, valor]) => temValor(valor));
    if (comValor.length === 0) return;
    Object.assign(campos, Object.fromEntries(comValor));
    aplicadas.push(secao);
  };

  for (const secao of marcadas) {
    const conteudo = secoes[secao];
    if (secao === "descricao") por(secao, { descricaoBase: conteudo.texto });
    if (secao === "titulos") {
      const indice = Number.isInteger(escolhas.titulo) ? escolhas.titulo : conteudo.recomendada;
      por(secao, { tituloBase: conteudo.opcoes?.[indice] });
    }
    if (secao === "preco") {
      const opcao = escolhas.preco === undefined || escolhas.preco === null
        ? conteudo.recomendada
        : [...(conteudo.opcoes ?? []), conteudo.recomendada].find((item) => item?.margem === escolhas.preco);
      por(secao, { precoVenda: opcao?.preco });
    }
    if (secao === "ean") por(secao, { ean: conteudo.escolhido?.valor });
    if (secao === "campos") {
      const novos = {};
      for (const [campo, item] of Object.entries(conteudo)) {
        const destino = CAMPO_DO_FORMULARIO[campo];
        if (!destino) continue;
        // O codigo so vale para produto sem SKU (regra do dono: com codigo, nao se mexe).
        if (destino === "sku" && temValor(produto.sku)) continue;
        novos[destino] = item?.valor;
      }
      por(secao, novos);
    }
  }
  return { campos, secoes: aplicadas };
}
