/**
 * Atributos da categoria do Mercado Livre: as regras puras da ficha tecnica (fase 2). Sem imports:
 * a aba Ficha tecnica, a validacao, a IA e o teste leem o mesmo arquivo.
 *
 * A lista crua e a de `GET /categories/{id}/attributes` (investigacao A2). Os ids de valor
 * (como o 17055159 de "kit ou pack") NUNCA ficam fixos aqui: o ML pode muda-los, entao tudo e
 * achado pelo nome, a cada categoria.
 *
 * No rascunho, cada atributo e `{ [id]: value_name }` (texto). Atributo de lista guarda o NOME
 * oficial do valor, que e o que o payload manda.
 */

const TIPOS = { list: "lista", boolean: "booleano", number: "numero", number_unit: "numero_unidade" };

// Ocultos que o dono preenche. Os demais ocultos (SELLER_SKU, IS_KIT, SELLER_PACKAGE_*) sao do
// payload, e os `read_only` (PACKAGE_*) o proprio ML preenche.
const OCULTOS_QUE_ENTRAM = new Set(["EMPTY_GTIN_REASON"]);

// Codigo de barras nao se deduz da descricao: a IA nunca preenche estes dois.
const FORA_DA_IA = new Set(["GTIN", "EMPTY_GTIN_REASON"]);

const EM_MAIUSCULAS = new Set(["BRAND", "MODEL"]);

const texto = (valor) => String(valor ?? "").trim();

// O Microcontrolador da ficha vem, nesta ordem, destas linhas da descricao. "Chip de Interface USB" (o CH340 de uma placa
// Arduino) e outro chip e nao casa: os nomes sao exatos.
// "Microprocessador" entrou em 11/11/2026 (pedido do dono: "chip, microcontrolador ou microprocessador").
const NOMES_DO_MICROCONTROLADOR = [
  /^microcontrolador$/i,
  /^chip\s*(\(\s*soc\s*\))?$/i,
  /^microprocessador$/i,
  /^ci$/i,
  /^processador(\s*\/\s*cpu)?$/i,
];

// O atributo da categoria que recebe o microcontrolador: o id MICROCONTROLLER ou, em categoria que usa outro id, o atributo
// chamado "Microcontrolador" ou "Microprocessador" (o nome que o dono ve na aba).
const ehAtributoDoMicrocontrolador = (atributo) =>
  atributo?.id === "MICROCONTROLLER" || /^micro(controlador|processador)$/i.test(String(atributo?.nome ?? "").trim());

/**
 * O que a ficha do ML tira das Especificacoes tecnicas da descricao do produto (pedido do dono em 03/11/2026: "caso nao tenha
 * modelo, pode buscar na especificacao o modelo e tambem o microcontrolador; nas especificacoes vai estar como chip, CI ou
 * processador"). Le as linhas "- Nome: valor;"; sem a linha, null.
 */
function linhasDaFicha(descricao) {
  const linhas = [];
  for (const linha of String(descricao ?? "").split(/\r?\n/)) {
    const casou = /^\s*[-•]\s*([^:]{2,60}):\s*(.+?)\s*[;.]?\s*$/.exec(linha);
    if (casou) linhas.push({ nome: casou[1].trim(), valor: casou[2].trim() });
  }
  return linhas;
}

export function fichaDaDescricao(descricao) {
  const linhas = linhasDaFicha(descricao);
  const valorDe = (regra) => linhas.find((linha) => regra.test(linha.nome))?.valor || null;
  let microcontrolador = null;
  for (const regra of NOMES_DO_MICROCONTROLADOR) {
    microcontrolador = valorDe(regra);
    if (microcontrolador) break;
  }
  let tensao = null;
  for (const regra of NOMES_DA_TENSAO) {
    tensao = valorDe(regra);
    if (tensao) break;
  }
  return { MODEL: valorDe(/^modelo$/i), MICROCONTROLLER: microcontrolador, tensaoLimite: tensaoLimite(tensao) };
}

// A tensao de trabalho da placa nas especificacoes, nesta ordem (o nome que cada prompt usa).
const NOMES_DA_TENSAO = [
  /^tens[aã]o de alimenta[cç][aã]o$/i,
  /^tens[aã]o de entrada$/i,
  /^tens[aã]o de trabalho$/i,
  /^tens[aã]o de opera[cç][aã]o$/i,
  /^alimenta[cç][aã]o$/i,
];

// Um valor de tensao: "12V", "3,3V", "30VDC", "240VAC" (o "V" de "VIN" nao tem numero antes e nao conta).
const VALOR_DE_TENSAO = /(\d+(?:[.,]\d+)?)\s*V(?:DC|AC|CC)?\b/gi;

/**
 * A tensao limite da ficha (pedido do dono em 03/11/2026: "verificar na tensao de trabalho se tem, ex.: 5V a 12V, a tensao
 * limite sera 12V; se houver apenas uma tensao, ex.: 5V, a tensao limite tambem sera 5V"). O MAIOR valor da linha; quando a
 * linha ja traz o limite ("7V a 12V por VIN (limite 6V a 20V) / 5V pela USB"), o maior do trecho do limite (20V). Sem
 * tensao com numero, null.
 */
export function tensaoLimite(valor) {
  const linha = String(valor ?? "");
  const trechoDoLimite = /limite([^/)]*)/i.exec(linha)?.[1];
  const maior = (trecho) => {
    let escolhido = null;
    for (const [, numero] of String(trecho ?? "").matchAll(VALOR_DE_TENSAO)) {
      if (!escolhido || Number(numero.replace(",", ".")) > Number(escolhido.replace(",", "."))) escolhido = numero;
    }
    return escolhido;
  };
  const numero = maior(trechoDoLimite) ?? maior(linha);
  return numero ? `${numero}V` : null;
}

// Os atributos de tensao limite das categorias ("Voltagem de entrada limite", MICROCONTROLLER_BOARD_LIMIT_INPUT_VOLTAGE).
const ehTensaoLimite = (id) => /LIMIT/i.test(id) && /VOLTAGE/i.test(id);

const NUMERO_DE_TEMPERATURA = "([-−+]?\\s?\\d+(?:[.,]\\d+)?)";
// "0°C a 40°C", "-10ºC à 85ºC", "-20°C ~ 60°C", "0 °C a +40 °C", "-10 a 60°C": a minima e a maxima, com o °C ao menos na
// segunda. O hifen nao separa as duas (seria o sinal de uma negativa).
const FAIXA_DE_TEMPERATURA = new RegExp(`${NUMERO_DE_TEMPERATURA}\\s*(?:[°º]\\s*C)?\\s*(?:a|à|até|~|to|–)\\s*${NUMERO_DE_TEMPERATURA}\\s*[°º]\\s*C`, "i");
const numeroDaTemperatura = (numero) => numero.replace(/\s/g, "").replace("−", "-").replace(/^\+/, "");

/**
 * A minima e a maxima da linha "Temperatura de Operacao" das especificacoes (pedido do dono em 05/11/2026, nas fontes
 * chaveadas: "nas proximas sim"), em °C e no formato do rascunho ("-10°C", "60°C"). So a faixa antes de " / " (depois vem a
 * temperatura da reducao de potencia). Sem a linha ou sem as duas pontas, null.
 */
export function temperaturaDeOperacao(descricao) {
  const linha = linhasDaFicha(descricao).find((item) => /^temperatura de (opera[cç][aã]o|trabalho)$/i.test(item.nome));
  const casou = FAIXA_DE_TEMPERATURA.exec(String(linha?.valor ?? "").split(" / ")[0]);
  if (!casou) return null;
  const [minima, maxima] = [numeroDaTemperatura(casou[1]), numeroDaTemperatura(casou[2])];
  if (Number(minima.replace(",", ".")) > Number(maxima.replace(",", "."))) return null;
  return { minima: `${minima}°C`, maxima: `${maxima}°C` };
}

// Os atributos de temperatura de operacao das categorias (MIN_OPERATING_TEMPERATURE, MAX_OPERATING_TEMPERATURE), so os que
// aceitam °C (ou nao dizem a unidade).
const PONTA_DA_TEMPERATURA = { MIN: "minima", MAX: "maxima" };
function pontaDaTemperatura(atributo) {
  const casou = /^(MIN|MAX)_(?:[A-Z_]*_)?OPERATING_TEMPERATURE$/.exec(String(atributo?.id ?? ""));
  if (!casou) return null;
  const unidades = atributo.unidades ?? [];
  return unidades.length === 0 || unidades.includes("°C") ? PONTA_DA_TEMPERATURA[casou[1]] : null;
}

/**
 * Os atributos que faltam na ficha e a descricao traz (Modelo, Microcontrolador e a tensao limite), SO os que a categoria tem:
 * o Microcontrolador numa categoria de conectores iria ao ML como atributo que ela nao conhece. Nunca troca valor preenchido.
 * O Fabricante vazio recebe a Marca (pedido do dono em 05/11/2026: "o fabricante e o mesmo que a marca"); "Nao se aplica"
 * marcado conta como preenchido e fica. A temperatura minima e a maxima de operacao saem da linha "Temperatura de Operacao".
 */
export function completarFichaPelaDescricao(atuais, atributosDaCategoria, descricao) {
  const daCategoria = new Set((atributosDaCategoria ?? []).map((atributo) => atributo.id));
  const { tensaoLimite: limite, ...porId } = fichaDaDescricao(descricao);
  const novos = {};
  const { MICROCONTROLLER: microcontrolador, ...outros } = porId;
  for (const [id, valor] of Object.entries(outros)) {
    if (valor && daCategoria.has(id) && !texto(atuais?.[id])) novos[id] = valor;
  }
  for (const atributo of microcontrolador ? atributosDaCategoria ?? [] : []) {
    if (ehAtributoDoMicrocontrolador(atributo) && !texto(atuais?.[atributo.id])) novos[atributo.id] = microcontrolador;
  }
  for (const id of daCategoria) {
    if (limite && ehTensaoLimite(id) && !texto(atuais?.[id])) novos[id] = limite;
  }
  const temperatura = temperaturaDeOperacao(descricao);
  for (const atributo of temperatura ? atributosDaCategoria ?? [] : []) {
    const ponta = pontaDaTemperatura(atributo);
    if (ponta && !texto(atuais?.[atributo.id])) novos[atributo.id] = temperatura[ponta];
  }
  const marca = texto(atuais?.BRAND);
  if (marca && !ehNaoSeAplica(marca) && daCategoria.has("MANUFACTURER") && !texto(atuais?.MANUFACTURER)) novos.MANUFACTURER = marca;
  return novos;
}

/**
 * "Nao se aplica" (pedido do dono em 25/10/2026): o atributo que o produto nao tem (a EEPROM do ESP32). O rascunho guarda
 * "-1", o mesmo `value_id` que o site do ML grava quando o vendedor marca "Nao se aplica": medido em 25/10/2026, 698
 * atributos assim nos 389 anuncios ativos da conta, todos com `value_id: "-1"` e `value_name: null`. O payload manda nesse
 * formato (`atributosDaFicha`).
 */
export const NAO_SE_APLICA = "-1";

export const ehNaoSeAplica = (valor) => texto(valor) === NAO_SE_APLICA;

// O codigo de barras tem o motivo proprio de nao ter (EMPTY_GTIN_REASON): "nao se aplica" nao vale nos dois.
const SEM_NAO_SE_APLICA = new Set(["GTIN", "EMPTY_GTIN_REASON"]);

/** So os opcionais aceitam: o obrigatorio pede um valor (decisao do dono). */
export const aceitaNaoSeAplica = (atributo) => Boolean(atributo?.id) && !atributo.obrigatorio && !SEM_NAO_SE_APLICA.has(atributo.id);

// Unidades que o Rise escreve COLADAS ao numero ("5V", "16MHz": padrao da loja, pedido do dono em
// 24/10/2026). Lista fechada, a mais longa primeiro: "3D" ou "R3" nunca viram numero com unidade.
const UNIDADES = "mAh|VDC|VAC|Vcc|mV|kV|V|mA|A|mW|kW|W|GHz|MHz|kHz|Hz|mm|cm|m|kg|g|KB|MB|GB|TB|Ω|ohms?|°C";
const NUMERO_E_UNIDADE_SEPARADOS = new RegExp(`(\\d)\\s+(${UNIDADES})(?![\\p{L}\\d])`, "gu");
const SO_NUMERO_E_UNIDADE = new RegExp(`^(-?\\d+(?:[.,]\\d+)?)\\s*(${UNIDADES})$`, "u");

/** "5 V" vira "5V" e "7 V a 12 V" vira "7V a 12V": o que a tela mostra e o rascunho guarda. */
export const colarUnidade = (valor) => texto(valor).replace(NUMERO_E_UNIDADE_SEPARADOS, "$1$2");

/**
 * O contrario, so no envio: o atributo numero-com-unidade do ML e "numero unidade" com espaco
 * ("5 V"), o formato que o Rise sempre mandou. Valor que nao e so numero e unidade vai como esta.
 */
export function separarUnidade(valor) {
  const casou = texto(valor).match(SO_NUMERO_E_UNIDADE);
  return casou ? `${casou[1]} ${casou[2]}` : texto(valor);
}

const semAcento = (valor) => texto(valor).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const temLista = (atributo) => (atributo.tipo === "lista" || atributo.tipo === "booleano") && atributo.valores.length > 0;

/**
 * A lista do ML no formato do Rise: `{ id, nome, tipo, obrigatorio, condicional, oculto, valores,
 * unidades, dica }`. Obrigatorios primeiro, depois os condicionais (GTIN), depois o resto, cada
 * grupo na ordem do ML.
 */
export function normalizarAtributosDaCategoria(lista) {
  const normais = [];
  for (const atributo of Array.isArray(lista) ? lista : []) {
    const tags = atributo?.tags ?? {};
    if (!atributo?.id || tags.read_only) continue;
    if (tags.hidden && !OCULTOS_QUE_ENTRAM.has(atributo.id)) continue;
    normais.push({
      id: atributo.id,
      nome: atributo.name ?? atributo.id,
      tipo: TIPOS[atributo.value_type] ?? "texto",
      obrigatorio: Boolean(tags.required || tags.catalog_required),
      condicional: Boolean(tags.conditional_required),
      oculto: Boolean(tags.hidden),
      valores: (atributo.values ?? []).map((valor) => ({ id: String(valor.id), nome: valor.name })),
      unidades: (atributo.allowed_units ?? []).map((unidade) => unidade.id ?? unidade.name),
      dica: atributo.hint ?? atributo.tooltip ?? null,
    });
  }
  const grupo = (atributo) => (atributo.obrigatorio ? 0 : atributo.condicional ? 1 : 2);
  return normais
    .map((atributo, posicao) => [atributo, posicao])
    .sort(([a, posA], [b, posB]) => grupo(a) - grupo(b) || posA - posB)
    .map(([atributo]) => atributo);
}

/**
 * O nome oficial do motivo de "sem GTIN" desta categoria: "kit ou pack" para o kit, "nao tem
 * codigo cadastrado" para o produto simples. `null` se a categoria nao tem o atributo.
 */
export function motivoSemGtin(atributos, { kit }) {
  const motivo = (atributos ?? []).find((atributo) => atributo.id === "EMPTY_GTIN_REASON");
  if (!motivo) return null;
  const procura = kit ? /kit|pack/ : /nao tem codigo/;
  return motivo.valores.find((valor) => procura.test(semAcento(valor.nome)))?.nome ?? null;
}

/**
 * O valor oficial da lista que casa com o texto (sem caixa e sem acento), ou `null` se nao casa.
 * Atributo sem lista devolve o texto aparado.
 */
export function valorDeLista(atributo, valor) {
  if (!temLista(atributo)) return texto(valor);
  const procurado = semAcento(valor);
  return atributo.valores.find((opcao) => semAcento(opcao.nome) === procurado)?.nome ?? null;
}

/**
 * O que falta ou esta errado na ficha, na ordem dos atributos: `{ campo, problema, bloqueante }`.
 * O campo e o id do atributo (a aba mostra a mensagem embaixo dele). GTIN e o motivo de nao ter
 * sao conferidos juntos: a categoria pede um OU outro (`conditional_required`).
 */
// `gtinDoKit`: o EAN interno do kit (`eanDoKit.js`), que vai ao ML no lugar do motivo (27/10/2026): com ele o kit tem GTIN.
export function problemasDosAtributos(valores, atributos, { kit, gtinDoKit = null }) {
  const problemas = [];
  const acrescentar = (campo, problema, bloqueante = true) => problemas.push({ campo, problema, bloqueante });

  for (const atributo of atributos ?? []) {
    const valor = texto(valores?.[atributo.id]);

    if (atributo.id === "GTIN") {
      // O GTIN e da peca avulsa: no kit ele e ignorado, e so o motivo vale.
      if (kit && valor) acrescentar("GTIN", "Kit não leva GTIN: o valor será ignorado.", false);
      const temGtin = kit ? Boolean(gtinDoKit) : Boolean(valor);
      // A ficha inteira preenchida para publicar (pedido do dono em 25/10/2026): o GTIN ou o motivo, mesmo onde a categoria
      // nao o exige.
      if (!temGtin && !texto(valores?.EMPTY_GTIN_REASON)) {
        acrescentar("GTIN", "Informe o GTIN ou o motivo de não ter (EMPTY_GTIN_REASON).");
      }
      continue;
    }

    if (!valor) {
      // O motivo de nao ter GTIN e conferido junto do GTIN (acima): com o GTIN preenchido, ele fica vazio mesmo.
      if (atributo.id === "EMPTY_GTIN_REASON") continue;
      if (atributo.obrigatorio) acrescentar(atributo.id, `Informe ${atributo.nome} (${atributo.id}): obrigatório nesta categoria.`);
      // Opcional vazio tambem barra o Publicar (pedido do dono em 25/10/2026: "nao deixar publicar se algum campo da ficha
      // tecnica nao estiver preenchido"). O que nao existe no produto vai como "Nao se aplica". O Salvar continua livre.
      else if (aceitaNaoSeAplica(atributo)) acrescentar(atributo.id, `Preencha ${atributo.nome} (${atributo.id}) ou marque "Não se aplica".`);
      else acrescentar(atributo.id, `Preencha ${atributo.nome} (${atributo.id}).`);
      continue;
    }
    // "Nao se aplica" e resposta, nao valor de lista. No obrigatorio a tela nao mostra a caixa, mas pode chegar de um
    // rascunho antigo ou da proposta.
    if (ehNaoSeAplica(valor)) {
      if (!aceitaNaoSeAplica(atributo)) acrescentar(atributo.id, `${atributo.nome}: obrigatório nesta categoria, não aceita "não se aplica".`);
      continue;
    }
    if (temLista(atributo) && valorDeLista(atributo, valor) === null) {
      acrescentar(atributo.id, `${atributo.nome}: '${valor}' não está na lista da categoria.`);
    }
  }
  return problemas;
}

/**
 * A resposta da IA (`{ atributos: [{ id, valor }] }`) reduzida ao que pode entrar na ficha: so
 * atributo da categoria, so o que esta em branco no rascunho (a IA completa, nao troca), valor de
 * lista trocado pelo nome oficial (o que nao casa sai), Marca e Modelo em maiusculas, sem repetir.
 */
export function limparAtributosDaIA(resposta, atributos, valoresAtuais) {
  const porId = new Map((atributos ?? []).map((atributo) => [atributo.id, atributo]));
  const vistos = new Set();
  const limpos = [];
  for (const item of Array.isArray(resposta?.atributos) ? resposta.atributos : []) {
    const id = texto(item?.id);
    const atributo = porId.get(id);
    if (!atributo || FORA_DA_IA.has(id) || vistos.has(id) || texto(valoresAtuais?.[id])) continue;

    let valor = texto(item?.valor);
    if (valor && temLista(atributo)) valor = valorDeLista(atributo, valor);
    else valor = colarUnidade(valor);
    if (!valor) continue;
    if (EM_MAIUSCULAS.has(id)) valor = valor.toLocaleUpperCase("pt-BR");

    vistos.add(id);
    limpos.push({ id, nome: atributo.nome, valor });
  }
  return limpos;
}

function descreverAtributo(atributo) {
  if (temLista(atributo)) return `valores permitidos: ${atributo.valores.map((valor) => valor.nome).join("; ")}`;
  if (atributo.unidades.length > 0) return `número com unidade (${atributo.unidades.join(", ")})`;
  return atributo.tipo === "numero" ? "número" : "texto livre";
}

/** O pedido a IA: o produto e uma linha por atributo EM BRANCO (`id | nome | tipo | valores`). */
export function montarPedidoDaFicha({ titulo = "", marca = "", modelo = "", descricao = "", especificacoes = [], atributos = [], valoresAtuais = {} }) {
  const emBranco = atributos.filter((atributo) => !FORA_DA_IA.has(atributo.id) && !texto(valoresAtuais?.[atributo.id]));
  const linhas = emBranco.map((atributo) => `${atributo.id} | ${atributo.nome} | ${atributo.tipo} | ${descreverAtributo(atributo)}`);
  const ficha = especificacoes.map((linha) => `- ${linha.nome}: ${linha.valor}`).join("\n");
  return (
    "Preencha a ficha técnica deste produto para um anúncio do Mercado Livre.\n\n" +
    "Regras:\n" +
    "- preencha só o que as informações do produto sustentam; não invente;\n" +
    "- atributo com valores permitidos: use exatamente um deles;\n" +
    "- número com unidade: escreva o número e a unidade colados, sem espaço (ex.: 5V, 16MHz);\n" +
    "- deixe de fora o atributo que você não souber.\n\n" +
    `Produto: ${titulo}\nMarca: ${marca || "(sem)"}\nModelo: ${modelo || "(sem)"}\n\n` +
    `Especificações:\n${ficha || "(nenhuma)"}\n\n` +
    `Descrição:\n${String(descricao ?? "").slice(0, 3000) || "(vazia)"}\n\n` +
    `Atributos em branco (id | nome | tipo | valores):\n${linhas.join("\n")}\n\n` +
    'Responda no formato {"atributos": [{"id": "...", "valor": "..."}]}.'
  );
}
