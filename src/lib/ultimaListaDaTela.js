/**
 * A ultima lista de uma tela NESTA ABA (pedido do dono em 09/11/2026, ao marcar "100 por pagina" em Vendas: abrir um
 * pedido e voltar nao pode desfazer o 100 nem os filtros; sair da tela e voltar pelo menu comeca limpa). Mesmo desenho
 * da lista de Produtos (`ultimaListaDeProdutos.js`), para qualquer lista com tela de detalhe. Sem imports: roda no
 * navegador e no teste.
 */

const PREFIXO = "rise:lista:";

/** O endereco da lista a partir da consulta (`?por=100&pagina=2`). */
export function enderecoDaTela(caminho, consulta) {
  const texto = new URLSearchParams(String(consulta ?? "")).toString();
  return texto ? `${caminho}?${texto}` : caminho;
}

/** So endereco da propria lista vale (nada de outra tela ou de outro site); senao, a lista limpa. */
export function listaDaTelaValida(caminho, endereco) {
  if (typeof endereco !== "string") return caminho;
  const resto = endereco.slice(caminho.length);
  const ok = endereco.startsWith(caminho) && (resto === "" || /^\?[^#\s]*$/.test(resto));
  return ok ? endereco : caminho;
}

/** Guarda a lista desta aba. Armazenamento indisponivel (janela privada, cheio) so tira o recurso. */
export function guardarListaDaTela(caminho, consulta) {
  try {
    sessionStorage.setItem(PREFIXO + caminho, enderecoDaTela(caminho, consulta));
  } catch {
    // sem sessionStorage: a volta e para a lista limpa, como antes
  }
}

/** A lista guardada desta aba, ou a lista limpa. */
export function lerListaDaTela(caminho) {
  try {
    return listaDaTelaValida(caminho, sessionStorage.getItem(PREFIXO + caminho));
  } catch {
    return caminho;
  }
}

/*
 * A ROLAGEM da lista (pedido do dono em 10/11/2026, em Vendas: "toda vez que eu abro uma venda e retorno a tela
 * principal, ele me leva para o topo da pagina. Eu quero que ele me leve para onde a tela estava"). A lista guarda a
 * altura em que esta a cada rolagem, junto do endereco (outro filtro ou outra pagina e outra lista), e a seta do detalhe
 * PEDE a volta: so quem volta do detalhe retoma a altura; entrar pelo menu comeca no topo.
 */

const PREFIXO_ROLAGEM = "rise:rolagem:";
const PREFIXO_VOLTA = "rise:rolagem:voltar:";
/** O pedido de volta vale so para a lista que abre em seguida: velho (a navegacao nao aconteceu) nao retoma nada. */
const VOLTA_VALE_MS = 30_000;

/** O texto guardado: a altura e de qual lista ela e. */
export function rolagemParaGuardar(endereco, altura) {
  return JSON.stringify({ endereco, y: Math.max(0, Math.round(Number(altura) || 0)) });
}

/** A altura guardada, so quando e DESTA lista; texto estragado ou de outra lista da null (a lista abre no topo). */
export function rolagemGuardada(texto, endereco) {
  try {
    const guardado = JSON.parse(texto);
    return guardado?.endereco === endereco && Number.isFinite(guardado?.y) && guardado.y >= 0 ? guardado.y : null;
  } catch {
    return null;
  }
}

/** O pedido de volta ainda vale? (guardado como o instante do clique na seta) */
export function voltaPedidaVale(texto, agora) {
  const quando = Number(texto);
  return Number.isFinite(quando) && quando > 0 && agora - quando >= 0 && agora - quando < VOLTA_VALE_MS;
}

export function guardarRolagemDaLista(caminho, endereco, altura) {
  try {
    sessionStorage.setItem(PREFIXO_ROLAGEM + caminho, rolagemParaGuardar(endereco, altura));
  } catch {
    // sem sessionStorage: a lista abre no topo, como antes
  }
}

export function lerRolagemDaLista(caminho, endereco) {
  try {
    return rolagemGuardada(sessionStorage.getItem(PREFIXO_ROLAGEM + caminho), endereco);
  } catch {
    return null;
  }
}

/** Entrou na lista sem vir do detalhe: a altura de uma visita antiga nao vale mais. */
export function esquecerRolagemDaLista(caminho) {
  try {
    sessionStorage.removeItem(PREFIXO_ROLAGEM + caminho);
  } catch {
    // nada a esquecer
  }
}

/** Chamada por quem volta do detalhe (a seta, o Salvar e o Cancelar do editor): a lista que abrir retoma a altura. */
export function pedirVoltaNaRolagem(caminho, agora = Date.now()) {
  try {
    sessionStorage.setItem(PREFIXO_VOLTA + caminho, String(agora));
  } catch {
    // sem sessionStorage: a lista abre no topo
  }
}

/** A lista pergunta ao abrir, uma vez so: o pedido e consumido, para a proxima entrada pelo menu comecar no topo. */
export function consumirVoltaNaRolagem(caminho, agora = Date.now()) {
  try {
    const texto = sessionStorage.getItem(PREFIXO_VOLTA + caminho);
    sessionStorage.removeItem(PREFIXO_VOLTA + caminho);
    return voltaPedidaVale(texto, agora);
  } catch {
    return false;
  }
}
