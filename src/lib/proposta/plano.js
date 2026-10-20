/**
 * Validacao do plano de UMA secao da proposta automatica de produto (spec 2026-10-16), antes de qualquer escrita.
 * Sem imports: o script da sessao, o banco e o teste usam a mesma regra.
 *
 * Plano: `{ secao, conteudo }`. O formato do `conteudo` de cada secao esta em `VALIDADORES` e no roteiro da sessao
 * (docs/superpowers/roteiros/proposta-de-produto.md).
 */

export const SECOES = ["descricao", "titulos", "fotos", "campos", "preco", "ean", "documentos", "relatorio"];

/** Campos que a proposta pode sugerir (o resto do cadastro e do dono: estoque, localizacao, CEST...). */
export const CAMPOS_DA_PROPOSTA = [
  "marca", "modelo", "unidade", "garantiaMeses", "codigo", "ncm", "origem", "pesoKg", "alturaCm", "larguraCm", "comprimentoCm",
];

export const LIMITE_DO_TITULO = 60;
export const FOTOS_MINIMAS = 6;
export const FOTOS_MAXIMAS = 8;

const texto = (valor) => typeof valor === "string" && valor.trim() !== "";
const erro = (mensagem) => ({ ok: false, erro: mensagem });

function validarTitulos(conteudo) {
  const opcoes = conteudo?.opcoes;
  if (!Array.isArray(opcoes) || opcoes.length !== 3) return erro("titulos: são exatamente 3 opções.");
  const ruim = opcoes.find((opcao) => !texto(opcao) || opcao.trim().length > LIMITE_DO_TITULO);
  if (ruim !== undefined) return erro(`titulos: cada opção tem texto e até ${LIMITE_DO_TITULO} caracteres ("${String(ruim).slice(0, 70)}").`);
  if (![0, 1, 2].includes(conteudo.recomendada)) return erro("titulos: a recomendada é a opção 0, 1 ou 2.");
  if (conteudo.concorrentes !== undefined && !Array.isArray(conteudo.concorrentes)) return erro("titulos: concorrentes é uma lista.");
  return { ok: true };
}

function validarFotos(conteudo) {
  const candidatas = conteudo?.candidatas;
  if (!Array.isArray(candidatas)) return erro("fotos: candidatas é uma lista.");
  const ids = new Set();
  const ordens = new Set();
  for (const candidata of candidatas) {
    if (!texto(candidata?.id)) return erro("fotos: toda candidata tem id.");
    if (ids.has(candidata.id)) return erro(`fotos: id repetido (${candidata.id}).`);
    ids.add(candidata.id);
    if (!texto(candidata.origem?.loja)) return erro(`fotos: a candidata ${candidata.id} não diz de que loja veio.`);
    if (typeof candidata.escolhida !== "boolean") return erro(`fotos: a candidata ${candidata.id} não diz se foi escolhida.`);
    if (!texto(candidata.motivo)) return erro(`fotos: a candidata ${candidata.id} não diz o motivo.`);
    if (candidata.escolhida) {
      if (!Number.isInteger(candidata.ordem) || candidata.ordem < 0) return erro(`fotos: a escolhida ${candidata.id} precisa da ordem.`);
      if (ordens.has(candidata.ordem)) return erro(`fotos: ordem ${candidata.ordem} repetida.`);
      ordens.add(candidata.ordem);
    }
  }
  const escolhidas = candidatas.filter((c) => c.escolhida).length;
  // Com menos de 6 candidatas nao ha como chegar a 6: vale escolher todas, com aviso no relatorio.
  if (candidatas.length < FOTOS_MINIMAS) {
    if (escolhidas !== candidatas.length) return erro(`fotos: com só ${candidatas.length} candidatas, todas entram.`);
    return { ok: true, aviso: candidatas.length === 0 ? null : `só ${candidatas.length} candidatas: menos que as ${FOTOS_MINIMAS} pedidas.` };
  }
  if (escolhidas < FOTOS_MINIMAS || escolhidas > FOTOS_MAXIMAS) return erro(`fotos: são de ${FOTOS_MINIMAS} a ${FOTOS_MAXIMAS} escolhidas (vieram ${escolhidas}).`);
  return { ok: true };
}

function validarCampos(conteudo) {
  if (!conteudo || typeof conteudo !== "object" || Array.isArray(conteudo)) return erro("campos: é um objeto.");
  for (const [campo, item] of Object.entries(conteudo)) {
    if (!CAMPOS_DA_PROPOSTA.includes(campo)) return erro(`campos: ${campo} não é um campo da proposta.`);
    if (!item || typeof item !== "object" || !("valor" in item)) return erro(`campos: ${campo} sem valor.`);
    if (!texto(item.origem)) return erro(`campos: ${campo} sem origem.`);
  }
  return { ok: true };
}

function validarPreco(conteudo) {
  if (!Array.isArray(conteudo?.opcoes)) return erro("preco: opcoes é uma lista.");
  if (conteudo.recomendada === null && !texto(conteudo.motivoSemRecomendada)) return erro("preco: sem recomendada, diga o motivo.");
  return { ok: true };
}

function validarEan(conteudo) {
  if (!conteudo || !Array.isArray(conteudo.descartados)) return erro("ean: descartados é uma lista.");
  const escolhido = conteudo.escolhido;
  if (escolhido !== null && escolhido !== undefined) {
    if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(String(escolhido.valor ?? ""))) return erro("ean: o escolhido tem 8, 12, 13 ou 14 dígitos.");
    if (!texto(escolhido.origem)) return erro("ean: o escolhido sem origem.");
  }
  return { ok: true };
}

function validarDocumentos(conteudo) {
  if (!Array.isArray(conteudo?.itens)) return erro("documentos: itens é uma lista.");
  const ids = new Set();
  for (const item of conteudo.itens) {
    if (!texto(item?.id) || ids.has(item.id)) return erro("documentos: todo item tem id único.");
    ids.add(item.id);
    if (!texto(item.titulo)) return erro(`documentos: o item ${item.id} sem título.`);
  }
  return { ok: true };
}

const VALIDADORES = {
  descricao: (conteudo) => (texto(conteudo?.texto) ? { ok: true } : erro("descricao: o texto está vazio.")),
  titulos: validarTitulos,
  fotos: validarFotos,
  campos: validarCampos,
  preco: validarPreco,
  ean: validarEan,
  documentos: validarDocumentos,
  relatorio: (conteudo) => (texto(conteudo?.texto) ? { ok: true } : erro("relatorio: o texto está vazio.")),
};

/**
 * @param {{ secao: string, conteudo: unknown }} plano
 * @returns {{ ok: true, secao: string, aviso?: string|null } | { ok: false, erro: string }}
 */
export function validarPlano(plano) {
  const secao = plano?.secao;
  if (!SECOES.includes(secao)) return erro(`seção desconhecida: ${secao}. Use uma de: ${SECOES.join(", ")}.`);
  const resultado = VALIDADORES[secao](plano.conteudo);
  return resultado.ok ? { ok: true, secao, aviso: resultado.aviso ?? null } : resultado;
}
