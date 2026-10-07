"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";

import { buscarCotacaoAcao } from "@/app/ferramentas/acoes";
import GraficoCotacao from "@/components/ferramentas/GraficoCotacao";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import Card from "@/components/ui/Card";
import { PERIODOS, dataBr, dataHoraBr } from "@/lib/ferramentas/cotacao";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4 });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ULTIMOS_DIAS_NA_TABELA = 10;

/**
 * Executa a acao de servidor e devolve o erro em vez de deixa-lo escapar: uma
 * excecao nao tratada dentro da transicao derrubaria a pagina inteira (mesmo
 * padrao de `ImagemParaSvg`).
 */
async function tentar(acao) {
  try {
    return await acao();
  } catch (erro) {
    return { ok: false, erro: erro?.message ?? "Falha inesperada ao consultar as cotações." };
  }
}

/**
 * Sobe = vermelho, desce = verde: e o que importa para quem COMPRA em dolar. A
 * alta encarece o custo do fornecedor; o inverso do que um grafico de bolsa mostraria.
 */
function Variacao({ percentual, diferenca, sufixo }) {
  if (percentual === null || percentual === undefined) return null;
  const subiu = percentual > 0;
  const igual = percentual === 0;
  const Seta = subiu ? ArrowUp : ArrowDown;
  const cor = igual ? "text-suave" : subiu ? "text-red-700" : "text-emerald-700";
  return (
    <span className={`inline-flex items-center gap-1 text-sm font-medium tabular-nums ${cor}`}>
      {!igual && <Seta size={14} aria-hidden="true" />}
      {subiu ? "+" : ""}
      {PERCENTUAL.format(percentual)}%
      {typeof diferenca === "number" && (
        <span className="font-normal">
          ({subiu ? "+" : ""}
          {MOEDA.format(diferenca)})
        </span>
      )}
      {sufixo && <span className="font-normal text-suave">{sufixo}</span>}
    </span>
  );
}

/**
 * Cotacao do dolar (Ferramentas): a de agora, o PTAX oficial e um grafico do
 * PTAX por periodo. A primeira carga vem pronta do servidor (`inicial`); depois
 * so se consulta ao trocar o periodo ou apertar Atualizar. Nada e gravado.
 */
export default function CotacaoDolar({ inicial, periodoInicial }) {
  const [periodo, setPeriodo] = useState(periodoInicial);
  const [dados, setDados] = useState(inicial);
  const [pendente, iniciarTransicao] = useTransition();

  function carregar(novoPeriodo, forcar = false) {
    iniciarTransicao(async () => {
      const resposta = await tentar(() => buscarCotacaoAcao(novoPeriodo, forcar));
      // Periodo so muda quando a consulta responde: se falhar, a tela continua
      // com o que ja tinha, coerente com o botao marcado.
      if (resposta.ok) setPeriodo(novoPeriodo);
      setDados(resposta.ok ? resposta : (atual) => ({ ...(atual ?? {}), erroDaUltima: resposta.erro }));
    });
  }

  if (!dados?.ok) {
    return (
      <Card className="space-y-3">
        <p role="alert" className="text-sm text-red-700">
          {dados?.erroDaUltima ?? dados?.erro ?? "Não foi possível consultar as cotações agora."}
        </p>
        <button
          type="button"
          disabled={pendente}
          onClick={() => carregar(periodo, true)}
          className="inline-flex items-center gap-1.5 rounded border border-borda px-4 py-2 text-sm hover:bg-fundo disabled:opacity-60"
        >
          <RefreshCw size={15} className={pendente ? "animate-spin" : ""} />
          Tentar de novo
        </button>
      </Card>
    );
  }

  const { agora, ptax } = dados;
  const rotuloDoPeriodo = PERIODOS.find((item) => item.valor === periodo)?.rotulo ?? "";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* ---------- Agora ---------- */}
        <Card>
          <p className="flex items-center gap-1.5 text-sm text-suave">
            Dólar agora
            <BolhaDeAjuda
              variante="inline"
              texto={
                agora.ok && agora.fonte === "bcb"
                  ? "Último boletim do Banco Central (ele divulga de hora em hora, das 10h às 13h). A cotação em tempo real está indisponível: o token da AwesomeAPI vai na linha AWESOMEAPI_TOKEN do arquivo .env."
                  : "Cotação de mercado, que muda o dia todo. Fonte: AwesomeAPI. Não é o dólar oficial (PTAX)."
              }
            />
          </p>
          {agora.ok ? (
            <>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{MOEDA.format(agora.venda)}</p>
              <p className="mt-1 text-xs text-suave">
                Venda · compra {MOEDA.format(agora.compra)}
                {agora.lidoEm && ` · ${agora.fonte === "bcb" ? "boletim do BC de" : "lido em"} ${dataHoraBr(agora.lidoEm)}`}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Variacao percentual={agora.variacaoPct} sufixo="no dia" />
                {agora.maxima && agora.minima && (
                  <span className="text-xs text-suave tabular-nums">
                    maxima {MOEDA.format(agora.maxima)} · mínima {MOEDA.format(agora.minima)}
                  </span>
                )}
              </div>
            </>
          ) : (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {agora.erro}
            </p>
          )}
        </Card>

        {/* ---------- PTAX ---------- */}
        <Card>
          <p className="flex items-center gap-1.5 text-sm text-suave">
            Dólar oficial (PTAX)
            <BolhaDeAjuda
              variante="inline"
              texto="Taxa de câmbio calculada pelo Banco Central, uma vez por dia útil (por volta das 13h). É a usada em contrato e nota fiscal."
            />
          </p>
          {ptax.ok ? (
            <>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{MOEDA.format(ptax.ultimo.venda)}</p>
              <p className="mt-1 text-xs text-suave">
                Venda · compra {MOEDA.format(ptax.ultimo.compra)} · {dataBr(ptax.ultimo.data)}
              </p>
              <div className="mt-2">
                <Variacao
                  percentual={ptax.variacao?.percentual}
                  diferenca={ptax.variacao?.diferenca}
                  sufixo={`em ${rotuloDoPeriodo}`}
                />
              </div>
            </>
          ) : (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {ptax.erro}
            </p>
          )}
        </Card>
      </div>

      {/* ---------- Grafico ---------- */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Período do gráfico" className="flex overflow-hidden rounded border border-borda text-sm">
            {PERIODOS.map((item) => (
              <button
                key={item.valor}
                type="button"
                aria-pressed={periodo === item.valor}
                disabled={pendente}
                onClick={() => item.valor !== periodo && carregar(item.valor)}
                className={`px-2 py-1.5 font-medium whitespace-nowrap transition disabled:cursor-wait sm:px-3 ${
                  periodo === item.valor ? "bg-acento text-white" : "bg-superficie text-suave hover:bg-fundo"
                }`}
              >
                {item.rotulo}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={pendente}
            onClick={() => carregar(periodo, true)}
            className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-60"
          >
            <RefreshCw size={14} className={pendente ? "animate-spin" : ""} />
            Atualizar
          </button>
        </div>

        {dados.erroDaUltima && (
          <p role="alert" className="text-sm text-red-700">
            {dados.erroDaUltima}
          </p>
        )}

        {ptax.ok ? (
          <div className={`transition-opacity ${pendente ? "opacity-50" : ""}`}>
            <GraficoCotacao serie={ptax.serie} />
          </div>
        ) : (
          <p className="text-sm text-suave">O gráfico depende do Banco Central, que não respondeu agora.</p>
        )}

        <p className="text-xs text-suave">
          Gráfico da <strong>venda</strong> do PTAX, um ponto por dia útil. Alta do dólar tende a encarecer o que a loja
          compra dos fornecedores, por isso a alta aparece em vermelho e a queda em verde.
        </p>
      </Card>

      {/* ---------- Ultimos dias ---------- */}
      {ptax.ok && (
        <div className="overflow-hidden rounded-lg border border-borda bg-superficie">
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <caption className="border-b border-borda px-3 py-2.5 text-left text-xs font-medium tracking-wide text-suave uppercase">
                Últimos dias úteis (PTAX)
              </caption>
              <thead>
                <tr className="text-left text-xs text-suave">
                  <th scope="col" className="px-3 py-2 font-medium">
                    Data
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Compra
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Venda
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...ptax.serie]
                  .reverse()
                  .slice(0, ULTIMOS_DIAS_NA_TABELA)
                  .map((linha) => (
                    <tr key={linha.data} className="border-t border-borda">
                      <td className="px-3 py-2">{dataBr(linha.data)}</td>
                      <td className="px-3 py-2 text-right">{MOEDA.format(linha.compra)}</td>
                      <td className="px-3 py-2 text-right">{MOEDA.format(linha.venda)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
