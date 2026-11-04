"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Percent, X } from "lucide-react";

import Pergunta from "@/components/compras/Pergunta";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { salvarTaxasAcao } from "@/app/canais-de-venda/acoes-taxas";
import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * As taxas de venda do canal (Pedidos de venda, spec 5.6): o botao "Taxas de venda" no topo da lista da Loja Integrada
 * abre esta janela. Nesta janela o operador ve primeiro o percentual de cada forma de pagamento, e a acao principal e
 * Salvar. O lucro real do pedido da LI tira a taxa da forma que o comprador usou; sem taxa, a parcela fica "estimado".
 *
 * Percentual na tela em % (0,99) e gravado em fracao (0,0099), para a conta do lucro nao precisar dividir.
 */

const FORMAS = [
  { tipo: "pix", rotulo: "Pix" },
  { tipo: "boleto", rotulo: "Boleto" },
  { tipo: "cartao_credito", rotulo: "Cartão de crédito" },
  { tipo: "cartao_debito", rotulo: "Cartão de débito" },
  { tipo: "outro", rotulo: "Outra forma" },
];

// "0,99" e "0.99" valem; vazio e 0. Devolve null quando o texto nao e numero (a janela recusa antes de enviar).
function lerNumero(texto) {
  const limpo = String(texto ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (limpo === "") return 0;
  const valor = Number(limpo);
  return Number.isFinite(valor) ? valor : null;
}

const mostrar = (valor) => (Number(valor) ? String(Math.round(Number(valor) * 10000) / 10000).replace(".", ",") : "");

function camposDe(taxas) {
  const porTipo = new Map((taxas?.pagamento ?? []).map((linha) => [linha.tipo, linha]));
  return {
    linhas: FORMAS.map(({ tipo }) => ({ tipo, percentual: mostrar((porTipo.get(tipo)?.percentual ?? 0) * 100), fixa: mostrar(porTipo.get(tipo)?.fixa ?? 0) })),
    frete: mostrar(taxas?.padrao?.frete ?? 0),
  };
}

export default function TaxasDoCanal({ canal, nome, taxas, podeEditar }) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-2 text-sm font-medium text-texto transition-[background-color,transform] duration-150 hover:bg-fundo active:scale-[0.97]"
      >
        <Percent size={15} aria-hidden="true" />
        Taxas de venda
      </button>
      {aberta && <Janela canal={canal} nome={nome} taxas={taxas} podeEditar={podeEditar} fechar={() => setAberta(false)} />}
    </>
  );
}

function Janela({ canal, nome, taxas, podeEditar, fechar }) {
  const inicial = useMemo(() => camposDe(taxas), [taxas]);
  const [campos, setCampos] = useState(inicial);
  const [erro, setErro] = useState(null);
  const [perguntando, setPerguntando] = useState(false);
  const [salvando, iniciar] = useTransition();
  const alterado = JSON.stringify(campos) !== JSON.stringify(inicial);

  function tentarFechar() {
    if (alterado && podeEditar) setPerguntando(true);
    else fechar();
  }

  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape" && !perguntando) {
        evento.stopPropagation();
        tentarFechar();
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  });

  function mudarLinha(tipo, campo, valor) {
    setErro(null);
    setCampos((atual) => ({ ...atual, linhas: atual.linhas.map((linha) => (linha.tipo === tipo ? { ...linha, [campo]: valor } : linha)) }));
  }

  function salvar(evento) {
    evento.preventDefault();
    const pagamento = [];
    for (const linha of campos.linhas) {
      const percentual = lerNumero(linha.percentual);
      const fixa = lerNumero(linha.fixa);
      const rotulo = FORMAS.find((f) => f.tipo === linha.tipo)?.rotulo;
      if (percentual === null || fixa === null) return setErro(`${rotulo}: use só números, como 0,99.`);
      if (percentual || fixa) pagamento.push({ tipo: linha.tipo, percentual: Math.round(percentual * 100) / 10000, fixa });
    }
    const frete = lerNumero(campos.frete);
    if (frete === null) return setErro("Frete padrão: use só números, como 12,50.");
    iniciar(async () => {
      const resultado = await salvarTaxasAcao(canal, { pagamento, padrao: { percentual: 0, fixa: 0, frete } });
      if (resultado?.ok) fechar();
      else setErro(resultado?.erro ?? "Não foi possível salvar.");
    });
  }

  const entrada =
    "w-full rounded border border-borda bg-superficie px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-acento disabled:bg-fundo disabled:text-suave";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" {...propsDoFundo(tentarFechar)}>
      <section role="dialog" aria-modal="true" aria-labelledby="taxas-titulo" className="w-full max-w-md rounded-lg border border-borda bg-superficie shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-borda px-5 py-3">
          <div className="flex items-center gap-1.5">
            <h2 id="taxas-titulo" className="font-semibold text-balance">
              Taxas de venda · {nome}
            </h2>
            <BolhaDeAjuda
              variante="inline"
              texto={
                <>
                  <span className="block">O lucro real de cada pedido tira a taxa da forma de pagamento que o comprador usou.</span>
                  <span className="block">Percentual sobre o total pago; fixa em reais por pedido.</span>
                  <span className="block">O frete padrão entra na estimativa quando a loja não informa o frete.</span>
                </>
              }
            />
          </div>
          <button type="button" onClick={tentarFechar} aria-label="Fechar" className="-mr-2 rounded p-2.5 text-suave transition-colors hover:bg-fundo hover:text-texto">
            <X size={18} />
          </button>
        </header>

        <form onSubmit={salvar}>
          <div className="px-5 py-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-suave">
                  <th className="pb-2 text-left font-medium">Forma de pagamento</th>
                  <th className="w-24 pb-2 text-right font-medium">%</th>
                  <th className="w-24 pb-2 pl-2 text-right font-medium">R$ fixo</th>
                </tr>
              </thead>
              <tbody>
                {campos.linhas.map((linha) => {
                  const rotulo = FORMAS.find((f) => f.tipo === linha.tipo)?.rotulo;
                  return (
                    <tr key={linha.tipo}>
                      <td className="py-1 pr-2">{rotulo}</td>
                      <td className="py-1">
                        <input
                          aria-label={`${rotulo}: percentual`}
                          inputMode="decimal"
                          placeholder="0"
                          value={linha.percentual}
                          disabled={!podeEditar}
                          onChange={(e) => mudarLinha(linha.tipo, "percentual", e.target.value)}
                          className={entrada}
                        />
                      </td>
                      <td className="py-1 pl-2">
                        <input
                          aria-label={`${rotulo}: valor fixo em reais`}
                          inputMode="decimal"
                          placeholder="0"
                          value={linha.fixa}
                          disabled={!podeEditar}
                          onChange={(e) => mudarLinha(linha.tipo, "fixa", e.target.value)}
                          className={entrada}
                        />
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t border-borda">
                  <td className="pt-3 pr-2">Frete padrão</td>
                  <td />
                  <td className="pt-3 pl-2">
                    <input
                      aria-label="Frete padrão em reais"
                      inputMode="decimal"
                      placeholder="0"
                      value={campos.frete}
                      disabled={!podeEditar}
                      onChange={(e) => {
                        setErro(null);
                        setCampos((atual) => ({ ...atual, frete: e.target.value }));
                      }}
                      className={entrada}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            {erro && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {erro}
              </p>
            )}
          </div>

          <footer className="flex justify-end gap-2 border-t border-borda px-5 py-3">
            <button type="button" onClick={tentarFechar} className="rounded-md border border-borda px-3 py-2 text-sm hover:bg-fundo">
              {podeEditar ? "Cancelar" : "Fechar"}
            </button>
            {podeEditar && (
              <button
                type="submit"
                disabled={salvando || !alterado}
                title={alterado ? undefined : "Nada mudou desde o último Salvar."}
                className="rounded-md bg-acento px-3 py-2 text-sm font-semibold text-white transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            )}
          </footer>
        </form>
      </section>

      {perguntando && (
        <Pergunta titulo="Sair sem salvar?" confirmar="Sair sem salvar" recuar="Continuar editando" destrutiva aoConfirmar={fechar} aoRecuar={() => setPerguntando(false)}>
          As taxas digitadas serão descartadas.
        </Pergunta>
      )}
    </div>
  );
}
