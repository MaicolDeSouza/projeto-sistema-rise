/**
 * A ultima lista de Produtos aberta NESTA ABA (pedido do dono em 20/10/2026: pesquisar, abrir um produto e Cancelar
 * apagava a pesquisa). A lista guarda o proprio endereco (pesquisa, pagina, ordem, Pesquisa profunda) no
 * `sessionStorage`, e o Cancelar, o Salvar e a seta do cadastro voltam para ele. Fechar a aba esquece: a proxima volta
 * e para a lista limpa. Sem imports: roda no navegador e no teste.
 */

const CHAVE = "rise:produtos:ultimaLista";
const LISTA = "/produtos";

/** Parametros que valem uma vez so (o destaque do produto novo e os avisos do Salvar): nao voltam com a lista. */
const PASSAGEIROS = ["novo", "fotos", "documentos", "fornecedores", "concorrentes"];

/** O endereco da lista a partir da consulta (`?q=cabo&pagina=2`), sem os parametros passageiros. */
export function enderecoDaLista(consulta) {
  const parametros = new URLSearchParams(String(consulta ?? ""));
  for (const nome of PASSAGEIROS) parametros.delete(nome);
  const texto = parametros.toString();
  return texto ? `${LISTA}?${texto}` : LISTA;
}

/** So endereco da propria lista vale (nada de outra tela, de outro site ou de um produto); senao, a lista limpa. */
export function ultimaListaValida(endereco) {
  return typeof endereco === "string" && /^\/produtos(\?[^#\s]*)?$/.test(endereco) ? endereco : LISTA;
}

/** A lista guardada com parametros a mais (o destaque `novo` e os avisos, depois de salvar um produto novo). */
export function listaComParametros(endereco, extras) {
  const [caminho, consulta = ""] = ultimaListaValida(endereco).split("?");
  const parametros = new URLSearchParams(consulta);
  for (const [nome, valor] of Object.entries(extras ?? {})) if (valor) parametros.set(nome, valor);
  const texto = parametros.toString();
  return texto ? `${caminho}?${texto}` : caminho;
}

/** Guarda a lista desta aba. Armazenamento indisponivel (janela privada, cheio) so tira o recurso. */
export function guardarUltimaLista(consulta) {
  try {
    sessionStorage.setItem(CHAVE, enderecoDaLista(consulta));
  } catch {
    // sem sessionStorage: a volta e para a lista limpa, como antes
  }
}

/** A lista guardada desta aba, ou a lista limpa. */
export function lerUltimaLista() {
  try {
    return ultimaListaValida(sessionStorage.getItem(CHAVE));
  } catch {
    return LISTA;
  }
}
