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

/**
 * "Aplicar fotos" (aba Imagens): a lista do painel depois de aplicar as fotos escolhidas da proposta. As escolhidas
 * vem primeiro, VALIDADAS, na ordem das `escolhas` (a primeira e a principal); as outras fotos continuam no painel sem
 * o check, e a que ja era do produto (`arquivoId`) leva `paraReserva`, para o Salvar a guardar na reserva em vez de
 * apagar (regra do dono: as atuais que saem nao se perdem). Nada some do painel: o dono ainda pode mudar antes do Salvar.
 *
 * @param {Array<{ base: string, arquivoId?: string, finalizada?: boolean }>} painel as fotos do painel agora
 * @param {Array<{ base: string, candidataId: string }>} novas as que `trazerFotosDaProposta` acabou de pôr no lote
 * @param {Array<{ candidataId?: string, arquivoId?: string }>} escolhas na ordem: candidata baixada ou foto atual
 */
/**
 * Arrastar na janela "Fotos da proposta" (pedido do dono em 21/10/2026, "levar a foto 5 para ser a 1"): so as
 * ESCOLHIDAS tem ordem. Soltar `id` sobre a escolhida `alvoId` poe `id` na posicao dela (as outras andam uma casa);
 * se `id` nao estava escolhida, ela entra escolhida ali. Soltar sobre uma nao escolhida, ou sobre ela mesma, nao muda
 * nada. Devolve uma lista nova.
 */
export function moverNaOrdem(ordem, id, alvoId) {
  const destino = ordem.indexOf(alvoId);
  if (destino < 0 || id === alvoId) return [...ordem];
  const sem = ordem.filter((item) => item !== id);
  return [...sem.slice(0, destino), id, ...sem.slice(destino)];
}

export function fotosDoPainelComAProposta(painel, novas, escolhas) {
  const escolhidas = [];
  const usadas = new Set();
  for (const escolha of escolhas ?? []) {
    const foto = escolha.arquivoId
      ? painel.find((item) => item.arquivoId === escolha.arquivoId)
      : novas.find((item) => item.candidataId === escolha.candidataId);
    if (!foto || usadas.has(foto.base)) continue;
    usadas.add(foto.base);
    escolhidas.push({ ...foto, finalizada: true, paraReserva: false });
  }
  const resto = [...painel, ...novas]
    .filter((item) => !usadas.has(item.base))
    .map((item) => ({ ...item, finalizada: false, paraReserva: Boolean(item.arquivoId) }));
  return [...escolhidas, ...resto];
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

/** Os campos que o formulario mostra para cada um de `CAMPO_DO_FORMULARIO`, mais preco, EAN e descricao. */
const ROTULO_DO_CAMPO = {
  marca: "Marca", modelo: "Modelo", unidade: "Unidade", garantiaMeses: "Garantia", sku: "Código", ncm: "NCM", origem: "Origem",
  pesoKg: "Peso", alturaCm: "Altura", larguraCm: "Largura", comprimentoCm: "Comprimento", precoVenda: "Preço", ean: "GTIN / EAN",
  descricaoBase: "Descrição",
};

// Mesmo valor escrito de outro jeito ("0.007" e 0,007; "8537.10.20" e "85371020"; caixa) nao e sugestao nova.
function mesmoValor(campo, a, b) {
  if (campo === "ncm" || campo === "ean") return String(a ?? "").replace(/\D/g, "") === String(b ?? "").replace(/\D/g, "");
  const numeroA = Number(String(a ?? "").replace(",", "."));
  const numeroB = Number(String(b ?? "").replace(",", "."));
  if (temValor(a) && temValor(b) && Number.isFinite(numeroA) && Number.isFinite(numeroB)) return Math.abs(numeroA - numeroB) < 1e-9;
  return String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();
}

/** "46% margem · 5º de 9": a margem vem em porcentagem ou, de propostas antigas, em fracao (0,46). */
function textoDoPreco(opcao) {
  const margem = Number(opcao?.margem);
  const partes = [];
  if (Number.isFinite(margem)) partes.push(`${Math.round(Math.abs(margem) <= 1 ? margem * 100 : margem)}% margem`);
  if (opcao?.posicao?.posicao) partes.push(`${opcao.posicao.posicao}º de ${opcao.posicao.total}`);
  return partes.join(" · ");
}

/**
 * A proposta direto no formulario (pedido do dono em 22/10/2026; plano `2026-10-22-proposta-no-formulario.md`). Em vez do
 * quadro "Aplicar escolhidos", ao abrir o produto:
 * - campo VAZIO no produto recebe o valor da proposta (`preencher`, com a marca "PROPOSTA" na tela);
 * - campo JA PREENCHIDO com outro valor leva o da proposta para o topo da lista do icone (`nasListas`);
 * - a descricao sempre troca (decisao D do dono); o titulo nunca (as 3 opcoes ficam na lista "Escolher o titulo");
 * - o codigo so vale para produto sem SKU (regra de antes).
 *
 * @param {Record<string, any>} secoes `PropostaDeProduto.secoes`
 * @param {Record<string, unknown>} produto os valores do formulario agora (campo do formulario -> valor)
 * @returns {{ preencher: Record<string, unknown>, nasListas: Record<string, { valor: unknown, origem: string, rotulo: string }>, secoes: string[] }}
 */
export function propostaNoFormulario(secoes, produto = {}) {
  const preencher = {};
  const nasListas = {};
  const preenchidas = new Set();
  const propor = (secao, campo, valor, origem) => {
    if (!temValor(valor)) return;
    if (!temValor(produto[campo])) {
      preencher[campo] = valor;
      preenchidas.add(secao);
    } else if (!mesmoValor(campo, produto[campo], valor)) {
      nasListas[campo] = { valor, origem: String(origem ?? ""), rotulo: ROTULO_DO_CAMPO[campo] ?? campo };
    }
  };

  const descricao = secoes?.descricao?.texto;
  // A descricao troca sempre (decisao D), menos quando ja e a mesma: produto salvo com a proposta nao abre "nao salvo".
  const semQuebras = (texto) => String(texto ?? "").replace(/\r\n?/g, "\n").trim();
  if (temValor(descricao) && semQuebras(descricao) !== semQuebras(produto.descricaoBase)) {
    preencher.descricaoBase = descricao;
    preenchidas.add("descricao");
  }
  const preco = secoes?.preco?.recomendada;
  if (preco) propor("preco", "precoVenda", preco.preco, textoDoPreco(preco));
  const ean = secoes?.ean?.escolhido;
  if (ean) propor("ean", "ean", ean.valor, ean.origem);
  for (const [campo, item] of Object.entries(secoes?.campos ?? {})) {
    const destino = CAMPO_DO_FORMULARIO[campo];
    if (!destino) continue;
    if (destino === "sku" && temValor(produto.sku)) continue;
    propor("campos", destino, item?.valor, item?.origem);
  }
  return { preencher, nasListas, secoes: [...preenchidas] };
}
