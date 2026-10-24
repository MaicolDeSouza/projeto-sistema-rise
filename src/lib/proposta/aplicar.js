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
  numeroHomologacao: "numeroHomologacao", tipoProducao: "tipoProducao", cest: "cest", percentualTributos: "percentualTributos",
  spedTipoItem: "spedTipoItem",
};

/**
 * Os campos em que a proposta ESCREVE por cima do que o produto tem (pedido do dono em 24/10/2026: "Proposta escrita
 * direto no campo, com o original na lista": preco, EAN, descricao, unidade, marca, modelo, garantia, homologacao, peso
 * e medidas e toda a aba Tributacao). O valor de antes vai para a lista do icone com a etiqueta "Original". O codigo so
 * entra no produto sem SKU; o titulo nunca (as 3 opcoes ficam em "Escolher o titulo").
 */
export const CAMPOS_QUE_A_PROPOSTA_TROCA = [
  "descricaoBase", "precoVenda", "ean", "unidade", "marca", "modelo", "garantiaMeses", "numeroHomologacao", "pesoKg",
  "comprimentoCm", "larguraCm", "alturaCm", "origem", "tipoProducao", "ncm", "cest", "percentualTributos", "spedTipoItem",
];

/**
 * @param {Record<string, any>} secoes `PropostaDeProduto.secoes`
 * @param {{ secoes?: string[], titulo?: number, preco?: number }} escolhas secoes marcadas; `titulo` = indice da opcao
 *   (sem ele, a recomendada); `preco` = markup da opcao (proposta antiga: a margem; sem ele, a recomendada)
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
        : [...(conteudo.opcoes ?? []), conteudo.recomendada].find((item) => (item?.markup ?? item?.margem) === escolhas.preco);
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
  descricaoBase: "Descrição", numeroHomologacao: "Número de homologação", tipoProducao: "Tipo de produção", cest: "CEST",
  percentualTributos: "% Tributos", spedTipoItem: "Tipo do item",
};

/** O texto da etiqueta do valor que o produto tinha antes de a proposta escrever no campo. */
const ORIGEM_DO_ORIGINAL = "valor antes da proposta";

// Mesmo valor escrito de outro jeito ("0.007" e 0,007; "8537.10.20" e "85371020"; caixa) nao e sugestao nova.
function mesmoValor(campo, a, b) {
  if (campo === "ncm" || campo === "ean") return String(a ?? "").replace(/\D/g, "") === String(b ?? "").replace(/\D/g, "");
  const numeroA = Number(String(a ?? "").replace(",", "."));
  const numeroB = Number(String(b ?? "").replace(",", "."));
  if (temValor(a) && temValor(b) && Number.isFinite(numeroA) && Number.isFinite(numeroB)) return Math.abs(numeroA - numeroB) < 1e-9;
  return String(a ?? "").trim().toUpperCase() === String(b ?? "").trim().toUpperCase();
}

/**
 * "84,7% markup · 5º de 9". Desde 24/10/2026 a proposta grava o `markup` (sobre o custo); as de antes guardaram a `margem`
 * (sobre o preco), em porcentagem ou em fracao (0,46), e aparecem como "margem".
 */
function textoDoPreco(opcao) {
  const ehMarkup = opcao?.markup !== undefined && opcao?.markup !== null;
  const valor = Number(ehMarkup ? opcao.markup : opcao?.margem);
  const partes = [];
  // Uma casa decimal: desde 24/10/2026 a recomendada sai do preco do concorrente, e o percentual vem quebrado (45,6%).
  if (Number.isFinite(valor)) {
    const porcento = !ehMarkup && Math.abs(valor) <= 1 ? valor * 100 : valor;
    partes.push(`${Number(porcento.toFixed(1)).toLocaleString("pt-BR")}% ${ehMarkup ? "markup" : "margem"}`);
  }
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

const objeto = (valor) => (valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {});

/**
 * A proposta direto no formulario, CAMPO A CAMPO. Regra de 24/10/2026 (pedido do dono: "Proposta escrita direto no
 * campo, com o original na lista"; antes so o campo vazio era preenchido). `aplicadas` guarda, a cada Salvar
 * (`decisoesDosCampos`), o que ficou com o valor da proposta (`daProposta`), o que o dono mudou (`editados`) e o valor
 * que o produto tinha antes da proposta (`originais`). Ao abrir, nos `CAMPOS_QUE_A_PROPOSTA_TROCA`:
 * - campo que o dono EDITOU e salvou: nunca e trocado; se difere, a proposta so vai para a lista do icone ("Proposta");
 * - campo com valor diferente do da proposta: recebe o valor da proposta (marca "PROPOSTA"), e o valor de antes vai para
 *   a lista com a etiqueta "Original" (o primeiro valor do dono, mesmo que a proposta ja tenha trocado o campo antes);
 * - campo que ja tem o valor que a proposta pos num Salvar anterior: nao muda, mas CONTINUA marcado (`marcados`; pedido
 *   do dono: "ao salvar some a tag de proposta"), com o original na lista;
 * - o codigo so entra no produto sem SKU; o titulo nunca.
 *
 * @param {Record<string, any>} secoes `PropostaDeProduto.secoes`
 * @param {Record<string, unknown>} produto os valores do formulario agora (campo do formulario -> valor)
 * @param {{ editados?: string[], daProposta?: Record<string, unknown>, originais?: Record<string, unknown> }} [aplicadas]
 * @returns {{ preencher: Record<string, unknown>, marcados: Record<string, unknown>, nasListas: Record<string, { valor: unknown, origem: string, rotulo: string, tipo: "proposta"|"original" }>, secoes: string[] }}
 */
export function propostaNoFormulario(secoes, produto = {}, aplicadas = {}) {
  const editados = new Set(Array.isArray(aplicadas?.editados) ? aplicadas.editados : []);
  const anteriores = objeto(aplicadas?.daProposta);
  const originais = objeto(aplicadas?.originais);
  const trocaveis = new Set(CAMPOS_QUE_A_PROPOSTA_TROCA);
  const preencher = {};
  const marcados = {};
  const nasListas = {};
  const preenchidas = new Set();
  const naLista = (campo, valor, origem, tipo) => {
    nasListas[campo] = { valor, origem, rotulo: ROTULO_DO_CAMPO[campo] ?? campo, tipo };
  };
  for (const [campo, { secao, valor, origem }] of Object.entries(valoresDaProposta(secoes))) {
    const atual = produto[campo];
    if (campo === "sku") {
      if (!temValor(atual)) {
        preencher.sku = valor;
        preenchidas.add(secao);
      }
      continue;
    }
    if (!trocaveis.has(campo)) continue;
    if (editados.has(campo)) {
      if (!igual(campo, atual, valor)) naLista(campo, valor, origem, "proposta");
      continue;
    }
    // O campo ainda tem o valor que a proposta pos num Salvar anterior: o "original" e o guardado naquele Salvar.
    const daPropostaAntes = Object.hasOwn(anteriores, campo) && igual(campo, atual, anteriores[campo]);
    const original = daPropostaAntes ? originais[campo] : atual;
    if (igual(campo, atual, valor)) {
      // Ja tem o valor: so continua marcado quando ele veio da proposta (o produto que ja tinha o mesmo valor, nao).
      if (!daPropostaAntes) continue;
      marcados[campo] = valor;
    } else {
      preencher[campo] = valor;
      preenchidas.add(secao);
    }
    if (temValor(original) && !igual(campo, original, valor)) naLista(campo, original, ORIGEM_DO_ORIGINAL, "original");
  }
  return { preencher, marcados, nasListas, secoes: [...preenchidas] };
}

/**
 * Depois do Salvar: o que cada campo da proposta virou (pedido do dono em 23/10/2026). Campo salvo com o valor da
 * proposta vai para `daProposta` (pode ser recarregado se a proposta mudar, e continua com a marca); campo que veio da
 * proposta (preenchido nesta abertura ou num Salvar anterior) e foi MUDADO pelo dono vai para `editados` (nunca mais
 * trocado, ate o dono escolher o valor da proposta de novo). Campo com valor proprio do dono que nunca veio da proposta
 * nao entra.
 *
 * `originais` (24/10/2026): o valor que o campo tinha ANTES de a proposta escrever nele, lido do produto antes deste
 * Salvar (`antes`). So muda quando o valor de antes nao era o que a proposta tinha posto (senao o original de verdade,
 * guardado num Salvar anterior, se perderia).
 *
 * @param {Record<string, any>} secoes `PropostaDeProduto.secoes`
 * @param {Record<string, unknown>} salvo o produto gravado (campo do formulario -> valor)
 * @param {{ editados?: string[], daProposta?: Record<string, unknown>, originais?: Record<string, unknown> }} aplicadas o que estava guardado
 * @param {string[]} preenchidosAgora os campos que a proposta preencheu ao abrir esta edicao
 * @param {Record<string, unknown>} [antes] o produto como estava antes deste Salvar
 * @returns {{ editados: string[], daProposta: Record<string, unknown>, originais: Record<string, unknown> }}
 */
export function decisoesDosCampos(secoes, salvo, aplicadas = {}, preenchidosAgora = [], antes = {}) {
  const editados = new Set(Array.isArray(aplicadas?.editados) ? aplicadas.editados : []);
  const anteriores = objeto(aplicadas?.daProposta);
  const daProposta = { ...anteriores };
  const originais = { ...objeto(aplicadas?.originais) };
  const agora = new Set(preenchidosAgora);
  for (const [campo, { valor }] of Object.entries(valoresDaProposta(secoes))) {
    if (agora.has(campo) && Object.hasOwn(antes ?? {}, campo)) {
      const valorAntes = antes[campo];
      const eraDaProposta = Object.hasOwn(anteriores, campo) && igual(campo, valorAntes, anteriores[campo]);
      if (!eraDaProposta) {
        if (temValor(valorAntes)) originais[campo] = valorAntes;
        else delete originais[campo];
      }
    }
    if (igual(campo, salvo?.[campo], valor)) {
      daProposta[campo] = valor;
      editados.delete(campo);
    } else if (agora.has(campo) || Object.hasOwn(daProposta, campo)) {
      editados.add(campo);
      delete daProposta[campo];
    }
  }
  return { editados: [...editados], daProposta, originais };
}
