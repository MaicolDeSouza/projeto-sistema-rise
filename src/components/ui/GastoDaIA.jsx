/**
 * Quanto custou a ultima geracao com IA (pedido do dono em 12/10/2026): modelo, tokens e reais, numa linha discreta
 * ao lado do botao que gerou. O numero vem pronto do servidor (`resumoDoGasto`, em `lib/ia/gasto.js`); aqui so se
 * formata. Sem gasto (nada gerado ainda), nao aparece.
 *
 * Os detalhes (quantas chamadas, o valor em dolar e a cotacao) ficam no `title`, para a linha continuar curta.
 */
const inteiro = new Intl.NumberFormat("pt-BR");
const reais = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });

/// "R$ 0,21 · 8.412 tokens", ou "preço não cadastrado" no lugar dos reais.
function valorCurto(gasto) {
  const valor = gasto.brl === null ? "preço não cadastrado" : reais.format(gasto.brl);
  return `${valor} · ${inteiro.format(gasto.total)} tokens`;
}

/**
 * Os dois numeros do cadastro do produto, ao lado do Salvar (pedido do dono em 12/10/2026): o total ja SALVO no
 * produto (somado a cada Salvar) e o desta EDICAO (titulos e descricoes gerados desde que a tela abriu), que so entra
 * no total quando o produto for salvo. Some quando nao ha nenhum dos dois.
 */
export function GastoDoProduto({ salvo, edicao }) {
  if (!salvo && !edicao) return null;
  const quando = salvo?.atualizadoEm ? ` · último Salvar em ${new Date(salvo.atualizadoEm).toLocaleDateString("pt-BR")}` : "";
  return (
    <div className="flex items-center gap-2 text-xs tabular-nums">
      <span
        title={salvo ? `Total gasto com IA neste produto (descrição e título)${quando}` : "Nenhum gasto com IA salvo neste produto"}
        className="rounded border border-borda bg-fundo px-2 py-1 text-suave"
      >
        IA salvo: <span className="font-medium text-texto">{salvo ? valorCurto(salvo) : "—"}</span>
      </span>
      {edicao && (
        <span
          title="Gerado nesta edição. Entra no total quando você clicar em Salvar."
          className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900"
        >
          Nesta edição: <span className="font-medium">{valorCurto(edicao)}</span>
        </span>
      )}
    </div>
  );
}

export default function GastoDaIA({ gasto, className = "" }) {
  if (!gasto) return null;
  const valor = gasto.brl === null ? "preço não cadastrado" : reais.format(gasto.brl);
  const detalhes =
    `${gasto.chamadas} chamada(s) à IA nesta geração · ${inteiro.format(gasto.entrada)} tokens de entrada e ` +
    `${inteiro.format(gasto.saida)} de saída` +
    (gasto.usd === null ? "" : ` · US$ ${gasto.usd.toFixed(4)} (cotação fixa do sistema, sem IOF)`);
  return (
    <p title={detalhes} className={`text-[11px] text-suave tabular-nums ${className}`}>
      {gasto.modelo} · {inteiro.format(gasto.total)} tokens ({inteiro.format(gasto.entrada)} entrada /{" "}
      {inteiro.format(gasto.saida)} saída) · <span className="font-medium text-texto">{valor}</span>
    </p>
  );
}
