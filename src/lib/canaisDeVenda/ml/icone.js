/**
 * Estado do icone do Mercado Livre na lista de Produtos. Funcao pura, so importa `estadoNoML.js` (tambem sem imports):
 * a lista (componente de cliente) e o teste leem o mesmo arquivo. Regra do dono em 24/10/2026 (antes, publicado pausado ficava cinza e com o "!"):
 *
 * - `publicado` (verde): algum anuncio PUBLICADO no ML, ativo OU pausado. Ficar sem estoque e normal na loja (a coluna
 *   Estoque ja mostra o zero em vermelho), e o anuncio pausado por isso continua sendo um anuncio publicado.
 * - `erro` (o selo "!"): a publicacao de algum anuncio deu erro ou ficou parada no meio (ERRO ou PUBLICANDO, que inclui o
 *   kit aguardando o Bling). E so o que pede uma acao do dono.
 * - `pausado` e `rascunho`: so para o texto do icone (o mouse e o leitor de tela). Rascunho nao publicado nao acende nada.
 *
 * Varios anuncios do mesmo produto (Classico e Premium) valem juntos: um publicado deixa verde, um com erro poe o "!".
 */

import { LEITURAS_PARA_DIVERGIR, avisoDeCatalogoPendente, faturaPendente, precisaAgirNoML, textoDoAvisoDeCatalogo, textoDoEstadoML } from "./estadoNoML";
// `rotulos.js` tambem nao tem imports: a regra do "Reutilizado" e a mesma do selo da lista.
import { reutilizadoPendente } from "./rotulos";

const ehDoML = (anuncio) => anuncio?.canal === "MERCADO_LIVRE";
const SITUACOES_PUBLICADAS = new Set(["ATIVA", "PAUSADA"]);
// Barrado pelo ML (em revisao, inativo): a situacao do Rise vira DESCONHECIDA, mas o anuncio continua publicado.
const barradoNoML = (anuncio) => anuncio.status === "PUBLICADO" && anuncio.situacaoCanal !== "ENCERRADA" && precisaAgirNoML(anuncio.dados?.publicacao?.estadoML);
const estaPublicado = (anuncio) => anuncio.status === "PUBLICADO" && (SITUACOES_PUBLICADAS.has(anuncio.situacaoCanal) || barradoNoML(anuncio));

// A mesma ordem de `PARTES_DO_ENVIO_ML` (etapasDoEnvio.js); copiada porque este arquivo nao tem imports (a lista e cliente).
// Titulo, preco da loja, prazo e atacado entraram em 09/11/2026: o "!" ja acendia por eles, mas o texto saia sem o nome.
const ORDEM_DAS_PARTES = ["titulo", "descricao", "fotos", "pacote", "precoDaLoja", "preco", "ficha", "prazo", "atacado"];
const NOME_DA_PARTE = {
  titulo: "título",
  descricao: "descrição",
  fotos: "fotos",
  pacote: "peso e medidas",
  precoDaLoja: "preço da loja",
  preco: "preço",
  ficha: "ficha técnica",
  prazo: "prazo",
  atacado: "atacado",
};

/**
 * `anuncio.mudancas` (`{ partes, naoConferido }`) e posto pelo servidor (`mudancasDosAnunciosML`): anuncio publicado que
 * ficou para tras do produto (spec 2026-10-24) tambem poe o "!", com `desatualizado`.
 * @param {{canal: string, status: string, situacaoCanal?: string, mudancas?: {partes: string[], naoConferido: boolean}}[]} anuncios
 *   os anuncios do produto, de todos os canais
 */
// `foraDoRise`: as linhas de `AnuncioForaDoRiseML` do produto (botao "Verificar anuncios antigos", 09/11/2026), so na lista de
// Produtos; o "!" pede o Reaproveitar (o ML nao aceita anuncio duplicado).
export function estadoDoIconeML(anuncios, { foraDoRise = [], agora = new Date() } = {}) {
  const doML = (Array.isArray(anuncios) ? anuncios : []).filter(ehDoML);
  const paraTras = doML.filter((anuncio) => estaPublicado(anuncio) && (anuncio.mudancas?.partes?.length ?? 0) > 0);
  const partes = new Set(paraTras.flatMap((anuncio) => anuncio.mudancas.partes));
  const barrados = doML.filter(barradoNoML);
  const comEstoqueDiferente = doML.filter((anuncio) => estaPublicado(anuncio) && (anuncio.dados?.publicacao?.estadoML?.estoqueDiferenteSeguidas ?? 0) >= LEITURAS_PARA_DIVERGIR);
  const comCatalogoNovo = doML.filter((anuncio) => estaPublicado(anuncio) && avisoDeCatalogoPendente(anuncio.dados?.publicacao?.estadoML));
  // O ML nao fatura o anuncio ha 24 h (11/11/2026): o apto a faturar lido de hora em hora pelo worker.
  const semFatura = doML.filter((anuncio) => estaPublicado(anuncio) && faturaPendente(anuncio.dados?.publicacao?.fatura, agora));
  // O reaproveitado da conta ainda nao revisado (dono, 09/11/2026) nao acende o verde: fica "Reutilizado", com o "!", ate o
  // Publicar do editor. A situacao no canal pode nem ter sido lida ainda (o Reaproveitar nao a grava), por isso o status basta.
  const pendente = (anuncio) => reutilizadoPendente(anuncio.dados?.publicacao);
  const publicados = doML.filter((anuncio) => estaPublicado(anuncio) && !pendente(anuncio));
  return {
    // So quando ha: o objeto do icone sem anuncio antigo fica igual ao de antes.
    ...(Array.isArray(foraDoRise) && foraDoRise.length > 0 ? { foraDoRise: foraDoRise.length } : {}),
    publicado: publicados.length > 0,
    pausado: publicados.some((anuncio) => anuncio.situacaoCanal === "PAUSADA") && !publicados.some((anuncio) => anuncio.situacaoCanal === "ATIVA"),
    erro: doML.some((anuncio) => anuncio.status === "ERRO" || anuncio.status === "PUBLICANDO"),
    rascunho: doML.some((anuncio) => anuncio.status === "RASCUNHO" || anuncio.status === "VALIDADO"),
    reutilizado: doML.some((anuncio) => anuncio.status === "PUBLICADO" && anuncio.situacaoCanal !== "ENCERRADA" && pendente(anuncio)),
    desatualizado: paraTras.length > 0,
    naoConferido: paraTras.some((anuncio) => anuncio.mudancas.naoConferido),
    partesDesatualizadas: ORDEM_DAS_PARTES.filter((parte) => partes.has(parte)),
    // O ML barrou um anuncio publicado (em revisao, inativo, moderado): o "!" e o texto do estado (releitura de hora em
    // hora, `relerEstadoML.js`). Sem estoque nao conta: o Bling repoe.
    precisaAgirNoML: barrados.length > 0,
    // O estoque do anuncio diferente do saldo do Bling em leituras seguidas (25/10/2026).
    estoqueDivergenteNoML: comEstoqueDiferente.length > 0,
    estoquesNoML: comEstoqueDiferente.map((anuncio) => ({ ml: anuncio.dados.publicacao.estadoML.estoque, bling: anuncio.dados.publicacao.estadoML.estoqueBling })),
    estadosNoML: [...new Set(barrados.map((anuncio) => textoDoEstadoML(anuncio.dados.publicacao.estadoML)))],
    // O anuncio entrou, saiu ou trocou de catalogo no ML (25/10/2026): "!" ate o dono abrir o anuncio.
    catalogoMudouNoML: comCatalogoNovo.length > 0,
    // So quando ha, como o `foraDoRise`: o objeto do icone sem o aviso fica igual ao de antes.
    ...(semFatura.length > 0 ? { naoFaturaNoML: true } : {}),
    catalogosNoML: [...new Set(comCatalogoNovo.map((anuncio) => textoDoAvisoDeCatalogo(anuncio.dados.publicacao.estadoML.catalogoAviso)))],
    // O selo "C2" (pedido do dono em 26/10/2026): em quantos catalogos DIFERENTES estao os anuncios publicados do produto.
    catalogos: new Set(doML.filter(estaPublicado).map((anuncio) => anuncio.dados?.publicacao?.estadoML?.catalogo?.id).filter(Boolean)).size,
  };
}

// "descrição", "descrição e fotos", "descrição, fotos e peso e medidas"
function listaDePartes(partes) {
  const nomes = partes.map((parte) => NOME_DA_PARTE[parte] ?? parte);
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}` : (nomes[0] ?? "");
}

/**
 * Texto do icone do ML (nome acessivel e dica ao passar o mouse): a cor e o selo sozinhos nao chegam a quem usa leitor
 * de tela nem a quem so passa o mouse.
 * @param {{publicado: boolean, pausado?: boolean, erro: boolean, rascunho?: boolean}} estado o retorno de `estadoDoIconeML`
 */
// "descricao mudou no produto; preco e ficha tecnica alterados, falta enviar ao ML": as partes do produto mudam no cadastro,
// as do anuncio (preco e ficha, 24/10/2026) foram editadas nele e so falta mandar.
function textoDoDesatualizado(partes) {
  const doAnuncio = new Set(["preco", "ficha", "prazo", "atacado"]);
  const doProduto = (partes ?? []).filter((parte) => !doAnuncio.has(parte));
  const noAnuncio = (partes ?? []).filter((parte) => doAnuncio.has(parte));
  const trechos = [];
  if (doProduto.length) trechos.push(`${listaDePartes(doProduto)} ${doProduto.length > 1 ? "mudaram" : "mudou"} no produto`);
  if (noAnuncio.length) trechos.push(`${listaDePartes(noAnuncio)} ${noAnuncio.length > 1 ? "alterados" : "alterado"}, falta enviar ao ML`);
  return `desatualizado: ${trechos.join("; ")}`;
}

/** O selo "!" do icone: a mesma condicao na lista de Produtos, na lista do ML e em cada linha do popup do produto. */
export function temProblemaNoIconeML(estado) {
  return Boolean(estado?.erro || estado?.foraDoRise > 0 || estado?.reutilizado || estado?.desatualizado || estado?.precisaAgirNoML || estado?.estoqueDivergenteNoML || estado?.catalogoMudouNoML || estado?.naoFaturaNoML);
}

/**
 * Por que o "!" acendeu, em texto, um motivo por item (pedido do dono em 09/11/2026: o popup do produto mostra o "!" no anuncio
 * com problema). A mesma ordem e as mesmas palavras do `rotuloDoIconeML`.
 */
// O texto do reaproveitado ainda nao revisado, o mesmo no "!" do icone, no popup do produto e na lista do ML.
const TEXTO_DA_FATURA = "não apto a faturar no ML";
const TEXTO_DO_REUTILIZADO = "reutilizado da conta, esperando a sua revisão";

// "2 anuncios na conta fora do Rise" (09/11/2026): o motivo do "!" de quem tem anuncio antigo para reaproveitar.
const textoDoForaDoRise = (quantos) => `${quantos} ${quantos === 1 ? "anúncio" : "anúncios"} na conta fora do Rise`;

export function motivosDoProblemaML({ foraDoRise = 0, erro = false, reutilizado = false, desatualizado = false, naoConferido = false, partesDesatualizadas = [], precisaAgirNoML: barrado = false, estadosNoML = [], estoqueDivergenteNoML = false, estoquesNoML = [], catalogoMudouNoML = false, catalogosNoML = [], naoFaturaNoML = false } = {}) {
  const motivos = [];
  if (foraDoRise > 0) motivos.push(textoDoForaDoRise(foraDoRise));
  if (reutilizado) motivos.push(TEXTO_DO_REUTILIZADO);
  if (desatualizado) motivos.push(naoConferido ? "ainda não conferido com o produto" : textoDoDesatualizado(partesDesatualizadas));
  if (barrado) motivos.push(...estadosNoML.map((texto) => texto.charAt(0).toLowerCase() + texto.slice(1)));
  if (estoqueDivergenteNoML) motivos.push(...estoquesNoML.map(({ ml, bling }) => `estoque no ML ${ml}, no Bling ${bling}`));
  if (catalogoMudouNoML) motivos.push(...catalogosNoML);
  if (naoFaturaNoML) motivos.push(TEXTO_DA_FATURA);
  if (erro) motivos.push("com erro na publicação");
  return motivos;
}

export function rotuloDoIconeML({ foraDoRise = 0, publicado, pausado = false, erro, rascunho = false, reutilizado = false, desatualizado = false, naoConferido = false, partesDesatualizadas = [], precisaAgirNoML: barrado = false, estadosNoML = [], estoqueDivergenteNoML = false, estoquesNoML = [], catalogoMudouNoML = false, catalogosNoML = [], naoFaturaNoML = false, catalogos = 0 }) {
  const base = "Anúncio no Mercado Livre";
  const partes = [];
  if (publicado) partes.push(pausado ? "publicado, pausado (sem estoque)" : "publicado");
  if (reutilizado) partes.push(TEXTO_DO_REUTILIZADO);
  if (catalogos > 0) partes.push(`em ${catalogos} ${catalogos === 1 ? "catálogo" : "catálogos"}`);
  if (desatualizado) {
    partes.push(
      naoConferido
        ? "ainda não conferido com o produto"
        : textoDoDesatualizado(partesDesatualizadas),
    );
  }
  if (barrado) partes.push(...estadosNoML.map((texto) => texto.charAt(0).toLowerCase() + texto.slice(1)));
  if (estoqueDivergenteNoML) partes.push(...estoquesNoML.map(({ ml, bling }) => `estoque no ML ${ml}, no Bling ${bling}`));
  if (catalogoMudouNoML) partes.push(...catalogosNoML);
  if (naoFaturaNoML) partes.push(TEXTO_DA_FATURA);
  if (erro) partes.push("com erro na publicação");
  if (foraDoRise > 0) partes.push(textoDoForaDoRise(foraDoRise));
  if (!publicado && !erro && rascunho) partes.push("rascunho, ainda não publicado");
  return partes.length ? `${base}: ${partes.join(", ")}` : `${base}: sem anúncio`;
}
