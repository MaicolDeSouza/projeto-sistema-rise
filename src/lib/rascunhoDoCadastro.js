/**
 * Rascunho automatico do cadastro de produto (pedido do dono em 13/10/2026: "todas as informacoes que eu alterar
 * fossem ficando salvas temporariamente, para evitar que um recarregamento de pagina faca eu perder tudo; salvaria no
 * banco de fato apenas apos o salvar"). Opcao 1 escolhida por ele: o rascunho mora no NAVEGADOR (localStorage), por
 * produto. Sobrevive a recarregar a pagina e a fechar a aba; nao acompanha o dono para outro computador.
 *
 * Este arquivo e so a REGRA (sem React, sem `localStorage`, sem relogio proprio): monta o que vai para o rascunho,
 * confere o que volta e decide o que ainda vale. Quem guarda e quem le o `localStorage` e o `FormularioProduto`.
 *
 * - Entra tudo o que se edita: os campos do formulario, o tipo e as pecas do kit, fornecedores e concorrentes, as
 *   fotos do painel (e o lote temporario delas), os documentos enviados ou excluidos e o gasto com IA da edicao.
 * - NAO entra o que e so tela (lupa marcada, opcoes de titulo, aba aberta).
 * - O banco so muda no Salvar; ao salvar (ou Cancelar) o rascunho some.
 */

export const VERSAO_DO_RASCUNHO = 1;

/// O texto do cadastro vale uma semana: depois disso o produto provavelmente mudou e ninguem lembra do que era.
export const VALIDADE_DO_TEXTO_MS = 7 * 24 * 60 * 60 * 1000;

/// As fotos e os documentos enviados moram em `dados/temporarios/<lote>/`, que o worker apaga com mais de 24 h. Com
/// folga, o rascunho so confia neles por 20 h: depois disso o texto volta e as fotos nao.
export const VALIDADE_DOS_ARQUIVOS_MS = 20 * 60 * 60 * 1000;

/// Campos do formulario que sao ESTADO do React (hidden com JSON) ou do servidor: ficam fora dos campos soltos, e
/// entram no rascunho pelo proprio estado.
const CAMPOS_DE_ESTADO = new Set([
  "arquivosPreservados",
  "arquivosTemporarios",
  "composicao",
  "concorrentesRascunho",
  "documentosExcluidos",
  "fornecedoresRascunho",
  "fotosDoPainelProntas",
  "gastoIA",
  "imagensDoLote",
  "loteTemporario",
  "reservaExcluida",
  "tipo",
]);

/// Um campo de texto do cadastro (a descricao) passa de 10 mil caracteres; acima disto e lixo, nao rascunho.
const MAXIMO_DE_UM_CAMPO = 200_000;

/** Onde mora o rascunho: um por produto, um para o cadastro novo e um por clone. */
export function chaveDoRascunho({ produtoId = null, cloneId = null } = {}) {
  if (produtoId) return `rise:rascunho:produto:${produtoId}`;
  if (cloneId) return `rise:rascunho:clone:${cloneId}`;
  return "rise:rascunho:produto:novo";
}

/**
 * Os campos soltos do formulario (o que `lerFormulario` devolve) sem o que e estado: so texto e o `ativo` (verdadeiro
 * ou falso). Arquivo escolhido num <input type="file"> nao e texto e nao entra.
 */
export function camposParaRascunho(dados) {
  const saida = {};
  for (const [nome, valor] of Object.entries(dados ?? {})) {
    if (CAMPOS_DE_ESTADO.has(nome)) continue;
    if (typeof valor === "boolean") saida[nome] = valor;
    else if (typeof valor === "string" && valor.length <= MAXIMO_DE_UM_CAMPO) saida[nome] = valor;
  }
  return saida;
}

const lista = (valor) => (Array.isArray(valor) ? valor : []);
const objeto = (valor) => (valor && typeof valor === "object" && !Array.isArray(valor) ? valor : null);

/**
 * Monta o que vai para o `localStorage`. `estado` e o do React no momento; `baseEm` e o `atualizadoEm` do produto
 * quando a tela abriu (para saber, ao voltar, se alguem mexeu no produto nesse meio tempo).
 */
export function montarRascunho({ campos, estado, baseEm = null, agora = Date.now() }) {
  return {
    v: VERSAO_DO_RASCUNHO,
    salvoEm: new Date(agora).toISOString(),
    baseEm,
    campos: camposParaRascunho(campos),
    tipo: estado.tipo === "COMPOSICAO" ? "COMPOSICAO" : "SIMPLES",
    pecas: lista(estado.pecas),
    fornecedores: lista(estado.fornecedores),
    concorrentes: lista(estado.concorrentes),
    fotos: {
      lote: typeof estado.lote === "string" ? estado.lote : "",
      imagens: lista(estado.imagens),
      preservadas: lista(estado.preservadas),
      reservaExcluida: lista(estado.reservaExcluida),
    },
    temporarios: lista(estado.temporarios),
    documentosExcluidos: lista(estado.documentosExcluidos),
    gastoDaEdicao: objeto(estado.gastoDaEdicao),
  };
}

/**
 * Le o que estava guardado. Devolve `null` quando nao ha rascunho, esta ilegivel, e de outra versao ou ja passou da
 * validade. Do contrario devolve o rascunho conferido e dois avisos para o banner:
 *
 * - `arquivosExpiraram`: o rascunho tem mais de 20 h, entao as fotos e os documentos enviados foram tirados dele (o
 *   texto, nao);
 * - `produtoMudou`: o produto foi salvo de novo depois do rascunho (outro computador, outra pessoa, o Bling): recuperar
 *   o rascunho sobrescreve o que mudou.
 */
export function lerRascunho(texto, { agora = Date.now(), baseEmAtual = null } = {}) {
  if (typeof texto !== "string" || !texto) return null;
  let bruto;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!objeto(bruto) || bruto.v !== VERSAO_DO_RASCUNHO) return null;

  const salvoEm = Date.parse(bruto.salvoEm);
  if (!Number.isFinite(salvoEm)) return null;
  const idade = agora - salvoEm;
  if (idade > VALIDADE_DO_TEXTO_MS) return null;
  // Relogio do computador voltou: nao confia no que ficou "no futuro".
  if (idade < -60_000) return null;

  const campos = camposParaRascunho(objeto(bruto.campos));
  if (Object.keys(campos).length === 0) return null;

  const arquivosExpiraram = idade > VALIDADE_DOS_ARQUIVOS_MS;
  const fotos = objeto(bruto.fotos) ?? {};
  const imagens = lista(fotos.imagens).filter((imagem) => objeto(imagem) && typeof imagem.base === "string");

  return {
    salvoEm: new Date(salvoEm).toISOString(),
    campos,
    tipo: bruto.tipo === "COMPOSICAO" ? "COMPOSICAO" : "SIMPLES",
    pecas: lista(bruto.pecas),
    fornecedores: lista(bruto.fornecedores),
    concorrentes: lista(bruto.concorrentes),
    fotos: arquivosExpiraram
      ? { lote: "", imagens: [], preservadas: [], reservaExcluida: lista(fotos.reservaExcluida) }
      : {
          lote: typeof fotos.lote === "string" ? fotos.lote : "",
          imagens,
          preservadas: lista(fotos.preservadas),
          reservaExcluida: lista(fotos.reservaExcluida),
        },
    temporarios: arquivosExpiraram ? [] : lista(bruto.temporarios),
    documentosExcluidos: lista(bruto.documentosExcluidos),
    gastoDaEdicao: objeto(bruto.gastoDaEdicao),
    arquivosExpiraram,
    produtoMudou: Boolean(baseEmAtual && bruto.baseEm && baseEmAtual !== bruto.baseEm),
  };
}
