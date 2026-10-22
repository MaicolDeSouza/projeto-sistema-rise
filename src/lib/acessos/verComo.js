import { RECURSOS, recursoPorId } from "./recursos.js";

/**
 * "Ver como" e a aba Historico (spec de Acessos, §5.5): regras puras, sem banco, que o navegador, o servidor e o teste
 * usam. So importa o catalogo. "Ver como" so CALCULA o que a pessoa ve, a partir do que esta salvo e pela mesma resolucao
 * do `pode()` (a previa nunca diverge do real); nunca troca a sessao de ninguem.
 */

/** A tela de entrada (o bloco do menu) de um recurso: sobe pelos pais ate a tela sem pai. */
function blocoDe(recurso) {
  let atual = recurso;
  while (atual?.pai) atual = recursoPorId(atual.pai);
  return atual;
}

/** "Cadastros › Clientes" dentro do bloco Cadastros vira "Clientes": o bloco ja esta no titulo do grupo. */
function rotuloDentroDo(bloco, recurso) {
  const prefixo = `${bloco.rotulo} › `;
  return recurso.rotulo.startsWith(prefixo) ? recurso.rotulo.slice(prefixo.length) : recurso.rotulo;
}

/**
 * O que uma pessoa (ou uma funcao) ve, a partir das permissoes JA resolvidas (`resolverPermissoes`, Map recurso -> nivel):
 * os blocos do menu com as sub-telas, os cartoes do Painel, os dados sensiveis, as acoes e as capacidades. O que e
 * `nenhum` nao aparece; tudo na ordem do catalogo (a do menu).
 *
 * @param {Map<string, string>} permissoes
 */
export function retratoDoAcesso(permissoes) {
  const blocos = [];
  const blocoPorId = new Map();
  const cartoes = [];
  const dados = [];
  const acoes = [];
  const capacidades = [];
  for (const recurso of RECURSOS) {
    const nivel = permissoes.get(recurso.id);
    if (!nivel || nivel === "nenhum") continue;
    if (recurso.tipo === "tela" && !recurso.pai) {
      const bloco = { rotulo: recurso.rotulo, nivel, subs: [] };
      blocos.push(bloco);
      blocoPorId.set(recurso.id, bloco);
    } else if (recurso.tipo === "tela") {
      const entrada = blocoDe(recurso);
      blocoPorId.get(entrada?.id)?.subs.push({ rotulo: rotuloDentroDo(entrada, recurso), nivel });
    } else if (recurso.tipo === "cartao") {
      // "Painel › Produtos cadastrados" vira "Produtos cadastrados": a secao ja se chama Cartoes do Painel.
      cartoes.push(rotuloDentroDo(blocoDe(recurso), recurso));
    } else if (recurso.tipo === "dado") {
      dados.push({ rotulo: recurso.rotulo, nivel });
    } else if (recurso.tipo === "acao") {
      acoes.push(recurso.rotulo);
    } else {
      capacidades.push({ rotulo: recurso.rotulo, nivel });
    }
  }
  return { blocos, cartoes, dados, acoes, capacidades };
}

/** Os nomes que a aba Historico mostra para os campos gravados na auditoria. */
const ROTULO_DO_CAMPO = {
  login: "Login",
  nome: "Nome",
  assinatura: "Assinatura",
  ativo: "Ativo",
  funcoes: "Funções",
  excecoes: "Exceções",
  descricao: "Descrição",
  permissoes: "Permissões",
  usuarios: "Usuários",
};

/** O que a auditoria registrou, no texto da aba Historico. */
const ROTULO_DA_ACAO = {
  "usuario.salvar": "Usuário salvo",
  "acessos.login.senha": "Senha definida",
  "acessos.login.remover": "Login removido",
  "funcao.salvar": "Função salva",
  "funcao.excluir": "Função excluída",
};

export function rotuloDaAcao(oQue) {
  return ROTULO_DA_ACAO[oQue] ?? oQue;
}

// "recurso: nivel" com o rotulo do catalogo (o id gravado nao diz nada a quem le).
const textoDaPermissao = (recurso, nivel) => `${recursoPorId(recurso)?.rotulo ?? recurso}: ${nivel}`;

/** Um valor gravado como texto de tela. Listas viram texto ORDENADO: a mesma lista em outra ordem nao e mudanca. */
function textoDoValor(valor) {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sim" : "Não";
  if (Array.isArray(valor)) {
    const itens = valor.map((item) => (item && typeof item === "object" ? textoDaPermissao(item.recurso, item.nivel) : String(item)));
    return itens.length ? itens.sort((a, b) => a.localeCompare(b, "pt-BR")).join(", ") : "—";
  }
  if (typeof valor === "object") {
    const itens = Object.entries(valor).map(([recurso, nivel]) => textoDaPermissao(recurso, nivel));
    return itens.length ? itens.sort((a, b) => a.localeCompare(b, "pt-BR")).join(", ") : "—";
  }
  return String(valor);
}

/**
 * O que mudou entre o retrato de antes e o de depois de uma linha de auditoria: so as chaves que mudaram, com o rotulo do
 * campo e os dois valores como texto. Registro novo (`antes` nulo) mostra o que foi gravado.
 *
 * @returns {{ campo: string, antes: string, depois: string }[]}
 */
export function resumoDaMudanca(antes, depois) {
  const de = antes ?? {};
  const para = depois ?? {};
  // Ordem fixa dos campos (a de ROTULO_DO_CAMPO): o JSONB do Postgres devolve as chaves em outra ordem.
  const ordem = Object.keys(ROTULO_DO_CAMPO);
  const posicao = (chave) => (ordem.includes(chave) ? ordem.indexOf(chave) : ordem.length);
  const chaves = [...new Set([...Object.keys(de), ...Object.keys(para)])].sort((a, b) => posicao(a) - posicao(b));
  const linhas = [];
  for (const chave of chaves) {
    const textoAntes = textoDoValor(de[chave]);
    const textoDepois = textoDoValor(para[chave]);
    if (textoAntes !== textoDepois) linhas.push({ campo: ROTULO_DO_CAMPO[chave] ?? chave, antes: textoAntes, depois: textoDepois });
  }
  return linhas;
}
