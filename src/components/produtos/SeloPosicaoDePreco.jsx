const reais = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * "2º de 10": a posicao de preco do produto entre os concorrentes (pedido do dono em 06/10/2026), ao lado de
 * "Preco venda" e do titulo "Concorrentes". O calculo e de `posicaoDePreco` (lib/posicaoDePreco.js).
 *
 * Cor: VERDE quando e o mais barato, AMBAR quando e o mais caro, cinza no meio. Sem vermelho: ser o mais caro
 * pode ser estrategia, e nao erro. Passar o mouse mostra a distancia: o mais barato, o que falta para ser o 1º e
 * os vizinhos de cada lado.
 */
export default function SeloPosicaoDePreco({ posicao }) {
  if (!posicao) return null;

  const cor = posicao.primeiro
    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
    : posicao.ultimo
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : "border-borda bg-fundo text-suave";

  const linhas = [`Posicao de preco: ${posicao.posicao}º de ${posicao.total} (1º = o mais barato).`];
  if (posicao.primeiro) {
    linhas.push(posicao.empatados > 0 ? "Empatado com o mais barato." : "Voce e o mais barato.");
  } else {
    linhas.push(`Mais barato: ${reais(posicao.maisBarato.preco)} (${posicao.maisBarato.loja}).`);
    linhas.push(`Para ser o 1º: abaixo de ${reais(posicao.maisBarato.preco)}.`);
  }
  if (posicao.abaixo && posicao.abaixo.loja !== posicao.maisBarato?.loja) {
    linhas.push(`Logo abaixo de voce: ${reais(posicao.abaixo.preco)} (${posicao.abaixo.loja}).`);
  }
  if (posicao.acima) linhas.push(`Logo acima de voce: ${reais(posicao.acima.preco)} (${posicao.acima.loja}).`);
  if (posicao.empatados > 0) linhas.push(`Mesmo preco que ${posicao.empatados} loja(s).`);
  linhas.push("Conta cada loja uma vez, pelo menor preco dela; so concorrentes com preco.");

  return (
    <span
      title={linhas.join("\n")}
      aria-label={linhas.join(" ")}
      className={`ml-1 inline-flex items-center rounded border px-1.5 py-px text-[11px] font-semibold tabular-nums ${cor}`}
    >
      {posicao.posicao}º de {posicao.total}
      {posicao.empatados > 0 && <span className="ml-1 font-normal">(empatado)</span>}
    </span>
  );
}
