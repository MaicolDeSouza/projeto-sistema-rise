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
