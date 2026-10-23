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

/** O texto sem diferenca de quebra de linha (CRLF do navegador, LF do banco). */
const semQuebras = (texto) => String(texto ?? "").replace(/\r\n?/g, "\n").trim();

/** Mesmo valor para o campo: a descricao compara o texto, o resto pela regra de `mesmoValor`. */
function igual(campo, a, b) {
  return campo === "descricaoBase" ? semQuebras(a) === semQuebras(b) : mesmoValor(campo, a, b);
}

/**
 * Os valores que a proposta tem para cada campo do formulario: `{ campo: { secao, valor, origem } }`. So entra valor
 * de verdade (vazio quer dizer "nada confiavel", nunca "apague").
 */
export function valoresDaProposta(secoes) {
  const valores = {};
  const por = (secao, campo, valor, origem) => {
    if (temValor(valor)) valores[campo] = { secao, valor, origem: String(origem ?? "") };
  };
  por("descricao", "descricaoBase", secoes?.descricao?.texto, "");
  const preco = secoes?.preco?.recomendada;
  if (preco) por("preco", "precoVenda", preco.preco, textoDoPreco(preco));
  const ean = secoes?.ean?.escolhido;
  if (ean) por("ean", "ean", ean.valor, ean.origem);
  for (const [campo, item] of Object.entries(secoes?.campos ?? {})) {
    const destino = CAMPO_DO_FORMULARIO[campo];
    if (destino) por("campos", destino, item?.valor, item?.origem);
  }
  return valores;
}

/**
 * A proposta direto no formulario (pedido do dono em 22/10/2026; plano `2026-10-22-proposta-no-formulario.md`), CAMPO A
 * CAMPO (pedido do dono em 23/10/2026: "os campos que eu ajustei deixam de ser recarregados pela proposta; os que eu nao
 * mexi podem ser recarregados"). `aplicadas` guarda, a cada Salvar (`decisoesDosCampos`), o que ficou com o valor da
 * proposta (`daProposta`) e o que o dono mudou (`editados`). Ao abrir:
 * - campo que o dono EDITOU e salvou: nunca e preenchido; se difere, a proposta so vai para a lista do icone;
 * - campo VAZIO: recebe o valor da proposta (marca "PROPOSTA");
 * - campo que ainda tem o valor que a proposta pos antes (o dono nao mexeu) e a proposta mudou: recebe o novo;
 * - a descricao que nunca passou por um Salvar com a proposta troca (decisao D); depois disso, vale a regra acima;
 * - campo com valor do proprio dono (de antes da proposta): a proposta so vai para a lista do icone;
 * - o codigo so vale para produto sem SKU; o titulo nunca (as 3 opcoes ficam em "Escolher o titulo").
 *
 * @param {Record<string, any>} secoes `PropostaDeProduto.secoes`
 * @param {Record<string, unknown>} produto os valores do formulario agora (campo do formulario -> valor)
 * @param {{ editados?: string[], daProposta?: Record<string, unknown> }} [aplicadas] `PropostaDeProduto.aplicadas`
 * @returns {{ preencher: Record<string, unknown>, nasListas: Record<string, { valor: unknown, origem: string, rotulo: string }>, secoes: string[] }}
 */
export function propostaNoFormulario(secoes, produto = {}, aplicadas = {}) {
  const editados = new Set(Array.isArray(aplicadas?.editados) ? aplicadas.editados : []);
  const anteriores = aplicadas?.daProposta && typeof aplicadas.daProposta === "object" ? aplicadas.daProposta : {};
  const preencher = {};
  const nasListas = {};
  const preenchidas = new Set();
  for (const [campo, { secao, valor, origem }] of Object.entries(valoresDaProposta(secoes))) {
    const atual = produto[campo];
    if (campo === "sku" && temValor(atual)) continue;
    if (igual(campo, atual, valor)) continue;
    const intocado =
      !editados.has(campo) &&
      (!temValor(atual) ||
        (Object.hasOwn(anteriores, campo) && igual(campo, atual, anteriores[campo])) ||
        (campo === "descricaoBase" && !Object.hasOwn(anteriores, campo)));
    if (intocado) {
      preencher[campo] = valor;
      preenchidas.add(secao);
    } else if (campo !== "descricaoBase" && temValor(atual)) {
      nasListas[campo] = { valor, origem, rotulo: ROTULO_DO_CAMPO[campo] ?? campo };
    }
  }
  return { preencher, nasListas, secoes: [...preenchidas] };
}

/**
 * Depois do Salvar: o que cada campo da proposta virou (pedido do dono em 23/10/2026). Campo salvo com o valor da
 * proposta vai para `daProposta` (pode ser recarregado se a proposta mudar); campo que veio da proposta (preenchido
 * nesta abertura ou num Salvar anterior) e foi MUDADO pelo dono vai para `editados` (nunca mais recarregado, ate o dono
 * escolher o valor da proposta de novo). Campo com valor proprio do dono que nunca veio da proposta nao entra.
 *
 * @param {Record<string, any>} secoes `PropostaDeProduto.secoes`
 * @param {Record<string, unknown>} salvo o produto gravado (campo do formulario -> valor)
 * @param {{ editados?: string[], daProposta?: Record<string, unknown> }} aplicadas o que estava guardado
 * @param {string[]} preenchidosAgora os campos que a proposta preencheu ao abrir esta edicao
 * @returns {{ editados: string[], daProposta: Record<string, unknown> }}
 */
export function decisoesDosCampos(secoes, salvo, aplicadas = {}, preenchidosAgora = []) {
  const editados = new Set(Array.isArray(aplicadas?.editados) ? aplicadas.editados : []);
  const daProposta = { ...(aplicadas?.daProposta && typeof aplicadas.daProposta === "object" ? aplicadas.daProposta : {}) };
  const agora = new Set(preenchidosAgora);
  for (const [campo, { valor }] of Object.entries(valoresDaProposta(secoes))) {
    if (igual(campo, salvo?.[campo], valor)) {
      daProposta[campo] = valor;
      editados.delete(campo);
    } else if (agora.has(campo) || Object.hasOwn(daProposta, campo)) {
      editados.add(campo);
      delete daProposta[campo];
    }
  }
  return { editados: [...editados], daProposta };
}
