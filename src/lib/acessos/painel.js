/**
 * O Painel filtrado pela funcao (spec de Acessos, §5.6). Puro e SEM imports: o Painel e o teste o usam.
 *
 * O Painel e a tela inicial de todos (decisao do dono): ele nunca da 404, so mostra os cartoes liberados e, sem
 * nenhum, uma frase dizendo por que.
 */

/** Quais cartoes do Painel a pessoa ve. `algum` diz se ha o que desenhar. */
export function cartoesDoPainel(pode) {
  const cartoes = {
    produtos: pode("cartao.painel.produtos", "ver"),
    anunciosPublicados: pode("cartao.painel.anunciosPublicados", "ver"),
    anunciosComErro: pode("cartao.painel.anunciosComErro", "ver"),
    blocos: pode("cartao.painel.blocos", "ver"),
  };
  return { ...cartoes, algum: Object.values(cartoes).some(Boolean) };
}

/**
 * A frase do Painel vazio. `semAdministrador` (ninguem administra na VPS) vence tudo, porque e o unico caso que a
 * pessoa nao resolve pedindo acesso. Inativo vale como nao cadastrado: dizer "seu login foi desativado" contaria algo
 * que a pessoa nao precisa saber para pedir acesso.
 */
export function avisoDoPainel({ estado, semAdministrador = false }) {
  if (semAdministrador) return { texto: "O Rise está sem administrador. Na VPS, rode npm run acessos:admin -- <login>.", tom: "erro" };
  if (estado === "erro-banco") return { texto: "Não foi possível ler os acessos no banco.", tom: "erro" };
  if (estado === "nao-cadastrado" || estado === "inativo" || estado === "sem-login" || estado === "sem-segredo") {
    return { texto: "Seu login ainda não foi cadastrado no Rise. Peça acesso ao administrador.", tom: "neutro" };
  }
  return { texto: "Nada liberado para o seu acesso ainda. Peça ao administrador.", tom: "neutro" };
}
