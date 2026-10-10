/**
 * Fundo escuro das janelas (popups) do sistema: fecha SO quando o clique comeca e termina no fundo (pedido do dono
 * em 10/10/2026).
 *
 * O defeito que isto corrige: o navegador dispara o `click` no ancestral comum de onde o botao foi apertado e de
 * onde foi solto. Quem apertava o mouse DENTRO da janela (por exemplo para selecionar o texto de um campo) e
 * arrastava para fora soltava o botao no fundo, e o `click` caia no fundo: a janela fechava e o que estava digitado
 * se perdia. Aqui o `mousedown` lembra onde o clique comecou, e o `click` so fecha se comecou no fundo tambem.
 *
 * O mesmo vale ao contrario: apertar no fundo e soltar dentro da janela tambem gera um `click` no fundo. Por isso o
 * `mouseup` lembra onde o botao foi SOLTO, e a janela so fecha se os dois pontos foram no fundo.
 *
 * Uso: `<div className="fixed inset-0 ..." {...propsDoFundo(fechar)}>` no elemento do fundo, com a janela dentro.
 *
 * O estado e POR ELEMENTO (`WeakMap` pelo `currentTarget`), e nao uma variavel do modulo: ha janelas dentro de
 * janelas (o "Gerenciar prompts" dentro do "Criar descricao"), e o `mousedown` borbulha do fundo de dentro para o de
 * fora. Com um estado so, o de fora sobrescreveria o de dentro e o clique no fundo interno nunca fecharia.
 *
 * @param {(evento: import("react").MouseEvent) => void} aoFechar
 */
const gestos = new WeakMap();

export function propsDoFundo(aoFechar) {
  return {
    onMouseDown: (evento) => {
      gestos.set(evento.currentTarget, { comecou: evento.target === evento.currentTarget, terminou: false });
    },
    onMouseUp: (evento) => {
      const gesto = gestos.get(evento.currentTarget);
      if (gesto) gesto.terminou = evento.target === evento.currentTarget;
    },
    onClick: (evento) => {
      const gesto = gestos.get(evento.currentTarget);
      gestos.delete(evento.currentTarget);
      if (gesto?.comecou && gesto.terminou && evento.target === evento.currentTarget) aoFechar(evento);
    },
  };
}
