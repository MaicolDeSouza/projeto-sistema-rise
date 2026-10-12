import { RECURSOS, maiorNivel, ordemDoNivel, recursoPorId, validarNivel } from "./recursos.js";

/**
 * O nivel EFETIVO de cada recurso para uma pessoa (spec §3, "Resolucao"). Funcao pura: a sessao do servidor, o "Ver
 * como" e o teste usam a mesma conta, para a previa nunca divergir do que o servidor deixa fazer.
 *
 * Regras, nesta ordem:
 * 1. Administrador tem o maior nivel de cada tipo em TODO recurso, delegavel ou nao.
 * 2. Das funcoes vale o maior nivel; a excecao pessoal vence (para mais ou para menos).
 * 3. Recurso que nao esta no catalogo, nivel invalido para o tipo e recurso NAO delegavel sao ignorados: uma linha
 *    gravada para "Usuarios e funcoes" nao da a tela a ninguem (a validacao ja recusa; aqui e a segunda barreira).
 * 4. Recurso cujo `pai` ficou `nenhum` vira `nenhum` (tela fechada fecha as sub-telas, os cartoes e as acoes dela).
 * O que e `nenhum` nao entra no mapa.
 *
 * @param {{ funcoes?: { permissoes: { recurso: string, nivel: string }[] }[], excecoes?: { recurso: string, nivel: string }[], administrador?: boolean }} entrada
 * @returns {Map<string, string>}
 */
export function resolverPermissoes({ funcoes = [], excecoes = [], administrador = false } = {}) {
  if (administrador) return new Map(RECURSOS.map((recurso) => [recurso.id, maiorNivel(recurso.tipo)]));

  const aceita = ({ recurso, nivel }) => validarNivel(recurso, nivel) && recursoPorId(recurso).delegavel;
  const niveis = new Map();
  for (const funcao of funcoes) {
    for (const permissao of funcao?.permissoes ?? []) {
      if (!aceita(permissao)) continue;
      if (ordemDoNivel(permissao.nivel) > ordemDoNivel(niveis.get(permissao.recurso) ?? "nenhum")) {
        niveis.set(permissao.recurso, permissao.nivel);
      }
    }
  }
  for (const excecao of excecoes) {
    if (aceita(excecao)) niveis.set(excecao.recurso, excecao.nivel);
  }

  // O catalogo traz o pai antes do filho: percorrendo em ordem, a poda e transitiva (sub-tela da sub-tela tambem cai).
  const efetivo = new Map();
  for (const recurso of RECURSOS) {
    const nivel = niveis.get(recurso.id);
    if (!nivel || nivel === "nenhum") continue;
    if (recurso.pai && !efetivo.has(recurso.pai)) continue;
    efetivo.set(recurso.id, nivel);
  }
  return efetivo;
}

/** A pessoa tem pelo menos `nivel` em `id`? Nivel pedido invalido (ou "nenhum") e sempre nao: falha fechada. */
export function podeNo(permissoes, id, nivel) {
  const pedido = ordemDoNivel(nivel);
  if (pedido < 1) return false;
  return ordemDoNivel(permissoes.get(id) ?? "nenhum") >= pedido;
}

/** A tela de entrada do bloco (tipo tela, sem pai, grupo = href), ou null. */
function entradaDoBloco(href) {
  return RECURSOS.find((recurso) => recurso.tipo === "tela" && !recurso.pai && recurso.grupo === href) ?? null;
}

/** Os `hrefs` de bloco que a pessoa nao ve. Bloco sem tela de entrada no catalogo fica oculto (falha fechada). */
export function blocosOcultos(permissoes, hrefs) {
  return hrefs.filter((href) => {
    const entrada = entradaDoBloco(href);
    return !entrada || !podeNo(permissoes, entrada.id, "ver");
  });
}

/**
 * Quantos recursos delegaveis estao liberados (acima de `nenhum`): de um grupo (`grupo` = href ou "dados"), ou de todos
 * (`grupo` null), opcionalmente so de um tipo. E o "3/4" do trilho da matriz e o "12 de 31 telas" da lista de funcoes.
 */
export function contarLiberados(permissoes, grupo, { tipo = null } = {}) {
  const alvo = RECURSOS.filter((recurso) => recurso.delegavel && (grupo === null || recurso.grupo === grupo) && (tipo === null || recurso.tipo === tipo));
  return { liberados: alvo.filter((recurso) => permissoes.has(recurso.id)).length, total: alvo.length };
}
