"use client";

/**
 * Poucas opcoes lado a lado (padrao do projeto: "Escolha entre poucas opções", nascido no tipo da pessoa do Cliente).
 * Sao <input type="radio"> de verdade, escondidos (o rotulo e o alvo do clique): entram no envio com o `nome`, como um
 * <select> entraria, e o teclado (setas, Tab) continua funcionando.
 *
 * @param {{ nome: string, rotulo: string, opcoes: {valor: string, rotulo: string}[], valor: string|null, aoMudar: (valor: string) => void }} props
 */
export default function EscolhaEntreOpcoes({ nome, rotulo, opcoes, valor, aoMudar }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="inline-flex overflow-hidden rounded border border-borda text-sm">
      {opcoes.map((opcao) => (
        <label
          key={opcao.valor}
          className={`cursor-pointer px-3 py-1 font-medium whitespace-nowrap has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-acento ${
            valor === opcao.valor ? "bg-acento text-white" : "bg-superficie text-suave hover:bg-fundo"
          }`}
        >
          <input type="radio" name={nome} value={opcao.valor} checked={valor === opcao.valor} onChange={() => aoMudar(opcao.valor)} className="sr-only" />
          {opcao.rotulo}
        </label>
      ))}
    </div>
  );
}
