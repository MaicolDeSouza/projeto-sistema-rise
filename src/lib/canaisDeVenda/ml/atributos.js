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
export function problemasDosAtributos(valores, atributos, { kit }) {
  const problemas = [];
  const acrescentar = (campo, problema, bloqueante = true) => problemas.push({ campo, problema, bloqueante });

  for (const atributo of atributos ?? []) {
    const valor = texto(valores?.[atributo.id]);

    if (atributo.id === "GTIN") {
      // O GTIN e da peca avulsa: no kit ele e ignorado, e so o motivo vale.
      if (kit && valor) acrescentar("GTIN", "Kit não leva GTIN: o valor será ignorado.", false);
      const temGtin = !kit && Boolean(valor);
      if (atributo.condicional && !temGtin && !texto(valores?.EMPTY_GTIN_REASON)) {
        acrescentar("GTIN", "Informe o GTIN ou o motivo de não ter (EMPTY_GTIN_REASON).");
      }
      continue;
    }

    if (!valor) {
      if (atributo.obrigatorio) acrescentar(atributo.id, `Informe ${atributo.nome} (${atributo.id}): obrigatório nesta categoria.`);
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
    "- número com unidade: escreva o número e a unidade (ex.: 5 V);\n" +
    "- deixe de fora o atributo que você não souber.\n\n" +
    `Produto: ${titulo}\nMarca: ${marca || "(sem)"}\nModelo: ${modelo || "(sem)"}\n\n` +
    `Especificações:\n${ficha || "(nenhuma)"}\n\n` +
    `Descrição:\n${String(descricao ?? "").slice(0, 3000) || "(vazia)"}\n\n` +
    `Atributos em branco (id | nome | tipo | valores):\n${linhas.join("\n")}\n\n` +
    'Responda no formato {"atributos": [{"id": "...", "valor": "..."}]}.'
  );
}
