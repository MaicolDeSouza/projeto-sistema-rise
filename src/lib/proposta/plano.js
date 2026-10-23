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
// O dono passou de "6 a 8" para exatamente 6 em 21/10/2026.
export const FOTOS_MAXIMAS = 6;

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
  if (escolhidas < FOTOS_MINIMAS || escolhidas > FOTOS_MAXIMAS) return erro(FOTOS_MINIMAS === FOTOS_MAXIMAS ? `fotos: são ${FOTOS_MINIMAS} escolhidas (vieram ${escolhidas}).` : `fotos: são de ${FOTOS_MINIMAS} a ${FOTOS_MAXIMAS} escolhidas (vieram ${escolhidas}).`);
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
    // O link vem da conversa (LLM) e vai direto para um href na tela: so http(s). Sem isto um "javascript:" passava pelo
    // teste de links (que so testa http) e chegava ao clique do dono (revisao de seguranca de 22/10/2026).
    if (item.url !== undefined && item.url !== null && !/^https?:\/\/\S+$/i.test(String(item.url))) {
      return erro(`documentos: o link do item ${item.id} precisa começar com http:// ou https://.`);
    }
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
  relatorio: validarRelatorio,
};

/**
 * @param {{ secao: string, conteudo: unknown }} plano
 * @returns {{ ok: true, secao: string, aviso?: string|null } | { ok: false, erro: string }}
 */
/*
 * Relatorio em TOPICOS (pedido do dono em 21/10/2026: "um relatorio profissional, com os topicos divididos"):
 * `{ topicos: [{ titulo, itens: [texto], atencao? }] }`, cada topico um titulo curto e uma lista. O formato antigo
 * (`{ texto }`, um bloco corrido) continua valendo para as propostas ja gravadas.
 */
const MAXIMO_DE_TOPICOS = 12;
const MAXIMO_DE_ITENS = 30;
function validarRelatorio(conteudo) {
  if (!Array.isArray(conteudo?.topicos)) return texto(conteudo?.texto) ? { ok: true } : erro("relatorio: mande topicos (ou o texto).");
  const topicos = conteudo.topicos;
  if (topicos.length === 0) return erro("relatorio: nenhum tópico.");
  if (topicos.length > MAXIMO_DE_TOPICOS) return erro(`relatorio: no máximo ${MAXIMO_DE_TOPICOS} tópicos.`);
  for (const [i, topico] of topicos.entries()) {
    if (!texto(topico?.titulo) || String(topico.titulo).trim().length > 60) return erro(`relatorio: o tópico ${i + 1} precisa de um título de até 60 caracteres.`);
    if (!Array.isArray(topico.itens) || topico.itens.length === 0) return erro(`relatorio: o tópico "${topico.titulo}" está sem itens.`);
    if (topico.itens.length > MAXIMO_DE_ITENS) return erro(`relatorio: o tópico "${topico.titulo}" passa de ${MAXIMO_DE_ITENS} itens.`);
    if (topico.itens.some((item) => !texto(item))) return erro(`relatorio: o tópico "${topico.titulo}" tem item vazio.`);
  }
  return { ok: true };
}

export function validarPlano(plano) {
  const secao = plano?.secao;
  if (!SECOES.includes(secao)) return erro(`seção desconhecida: ${secao}. Use uma de: ${SECOES.join(", ")}.`);
  const resultado = VALIDADORES[secao](plano.conteudo);
  return resultado.ok ? { ok: true, secao, aviso: resultado.aviso ?? null } : resultado;
}
