import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";

/**
 * Um cartao por secao de edicao do anuncio do ML (pedido do dono em 26/10/2026: "cards bem definidos para cada sessao de
 * edicao, hoje parece uma unica coisa"). O titulo mora numa faixa propria, separada do corpo por uma borda, para o olho
 * achar onde cada grupo de campos comeca. A explicacao vai na bolha "i" (Padrao visual, regra 2), e a acao da secao, se
 * houver, fica a direita do titulo.
 */
export default function SecaoDoAnuncio({ titulo, ajuda = null, acao = null, children, className = "" }) {
  return (
    <section className={`rounded-lg border border-borda bg-superficie ${className}`}>
      <header className="flex min-h-10 items-center justify-between gap-3 rounded-t-lg border-b border-borda bg-fundo/70 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-sm font-semibold text-texto">{titulo}</h3>
          {ajuda && <BolhaDeAjuda variante="inline" texto={ajuda} />}
        </div>
        {acao}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Uma linha "rotulo: valor" de leitura (Status, Garantia, Peso e medidas), no desenho das abas de leitura da LI. */
export function LinhaDeDado({ rotulo, children, nota = null }) {
  return (
    <div className="grid grid-cols-[11rem_1fr] items-baseline gap-3 border-b border-borda py-2 text-sm last:border-b-0">
      <span className="text-suave">{rotulo}</span>
      <span className="min-w-0">
        {children ?? <span className="text-suave italic">vazio</span>}
        {nota && <span className="ml-2 text-xs text-suave">{nota}</span>}
      </span>
    </div>
  );
}
