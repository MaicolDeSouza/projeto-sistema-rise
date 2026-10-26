"use client";

import { useEffect, useRef, useState } from "react";
import { Calculator, Loader, X } from "lucide-react";

import { precoPorMargemML } from "@/app/canais-de-venda/mercado-livre/acoes";
import { custosDoAnuncio, freteQueConta, precoPorMargem } from "@/lib/canaisDeVenda/ml/custos";
import { IMPOSTO_PADRAO } from "@/lib/margem";
import { filtrarDecimal, lerDecimal } from "./numeros";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const CATEGORIA_ML = /^MLB\d+$/;
// Sem as taxas lidas, a conta vai ao servidor (que le o ML): espera o dono parar de digitar.
const ESPERA_DO_SERVIDOR_MS = 600;

const comVirgula = (numero, casas) => numero.toFixed(casas).replace(".", ",");

// As taxas lidas valem para a conta enquanto categoria, tipo e logistica forem as do rascunho. O PRECO pode ser outro: a
// comissao e um percentual, e a releitura automatica da caixa de custos corrige o frete quando o preco cruza os R$ 79.
function taxasUsaveis(custosML, rascunho) {
  if (!custosML) return null;
  const mesmas =
    String(custosML.categoriaId ?? "").trim() === String(rascunho.categoriaId ?? "").trim() &&
    custosML.tipoAnuncio === rascunho.tipoAnuncio &&
    custosML.logistica === (rascunho.envio?.logistica ?? "xd_drop_off");
  return mesmas ? { percentual: custosML.percentual, tarifaFixa: custosML.tarifaFixa, frete: freteQueConta(custosML, rascunho) } : null;
}

function Campo({ rotulo, prefixo, sufixo, valor, aoMudar, aoSair, desligado }) {
  return (
    <label className="block">
      <span className="block text-xs text-suave">{rotulo}</span>
      <div className="relative mt-0.5">
        {prefixo && <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-suave">{prefixo}</span>}
        <input
          inputMode="decimal"
          autoComplete="off"
          value={valor}
          disabled={desligado}
          onChange={(evento) => aoMudar(evento.target.value)}
          onBlur={aoSair}
          className={`w-full rounded border border-borda py-1.5 text-sm tabular-nums focus:border-acento focus:outline-none disabled:bg-fundo disabled:text-suave ${prefixo ? "pl-7" : "pl-2"} ${sufixo ? "pr-6" : "pr-2"}`}
        />
        {sufixo && <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-suave">{sufixo}</span>}
      </div>
    </label>
  );
}

/**
 * Calculadora do preco do anuncio (pedido do dono em 26/10/2026: "abrir igual temos hoje em produtos, porem no topo o
 * custo total"): painel flutuante com o CUSTO TOTAL em cima (fornecedor + comissao + tarifa + frete + imposto, no preco
 * da tela) e os tres campos presos entre si, Preco de venda, % de lucro (markup sobre o custo total) e Lucro em R$.
 * Mexer em qualquer um muda NA HORA o preco da aba; os outros dois se recalculam. A conta e local com as taxas ja lidas
 * do ML; sem elas (categoria nova, nenhum preco ainda), o % e o R$ vao ao servidor, que le as taxas e devolve o preco.
 */
export default function CalculadoraDeMargem({ rascunho, alterar, setContexto, custo, contexto, children }) {
  const [aberta, setAberta] = useState(false);
  // O campo que o dono esta digitando mostra o texto dele; os outros mostram a conta.
  const [digitado, setDigitado] = useState(null);
  const [erro, setErro] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const caixa = useRef(null);
  const esperaDoServidor = useRef(null);
  const pedidoAtual = useRef(0);

  const motivoDesligado = !(custo.valor > 0)
    ? "Marque um fornecedor padrão com preço de custo para calcular."
    : !CATEGORIA_ML.test(rascunho.categoriaId ?? "")
      ? "Escolha a categoria na aba Características para calcular com as taxas do ML."
      : null;

  const taxas = taxasUsaveis(contexto?.custosML, rascunho);
  const preco = Number(rascunho.preco);
  const conta = taxas && preco > 0 ? custosDoAnuncio({ preco, custo: custo.valor, ...taxas }) : null;
  const custoTotal = conta ? custo.valor + conta.comissao + conta.tarifaFixa + conta.frete + conta.imposto : null;
  const taxasDoML = conta ? conta.comissao + conta.tarifaFixa + conta.frete : null;

  // Fecha ao clicar fora (o painel flutua sobre a aba). Esc e tratado no proprio painel, para nao fechar o editor junto.
  useEffect(() => {
    if (!aberta) return undefined;
    function aoApertar(evento) {
      if (caixa.current && !caixa.current.contains(evento.target)) setAberta(false);
    }
    document.addEventListener("mousedown", aoApertar);
    return () => document.removeEventListener("mousedown", aoApertar);
  }, [aberta]);

  useEffect(() => () => clearTimeout(esperaDoServidor.current), []);

  function porMargem(tipo, valor) {
    setErro(null);
    clearTimeout(esperaDoServidor.current);
    if (taxas) {
      const novo = precoPorMargem({ custo: custo.valor, ...taxas, margem: { tipo, valor } });
      if (novo === null) setErro("Lucro inatingível com estas taxas.");
      else alterar({ preco: novo });
      return;
    }
    // Sem taxas lidas: o servidor le o ML e devolve o preco e os custos lidos nele.
    const numero = ++pedidoAtual.current;
    esperaDoServidor.current = setTimeout(async () => {
      setCalculando(true);
      let resposta;
      try {
        resposta = await precoPorMargemML(rascunho, { custo: custo.valor, margem: { tipo, valor } });
      } catch {
        resposta = { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
      }
      if (numero !== pedidoAtual.current) return;
      setCalculando(false);
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      alterar({ preco: resposta.preco });
      setContexto((atual) => ({ ...atual, custosML: resposta.custosML }));
    }, ESPERA_DO_SERVIDOR_MS);
  }

  function mudar(campo, bruto) {
    const texto = filtrarDecimal(bruto, campo === "percentual" ? 1 : 2);
    setDigitado({ campo, texto });
    const valor = lerDecimal(texto);
    if (valor === null) return;
    if (campo === "preco") {
      setErro(null);
      alterar({ preco: valor });
    } else if (valor >= 0) {
      porMargem(campo === "percentual" ? "percentual" : "reais", valor);
    }
  }

  const mostrado = (campo, numero, casas) =>
    digitado?.campo === campo ? digitado.texto : numero === null || numero === undefined || !Number.isFinite(numero) ? "" : comVirgula(numero, casas);

  return (
    <div className="relative" ref={caixa}>
      {children}
      <button
        type="button"
        onClick={() => setAberta((atual) => !atual)}
        disabled={Boolean(motivoDesligado)}
        title={motivoDesligado ?? "Calcular o preço pelo lucro, com as taxas do ML"}
        aria-label="Calcular o preço pelo lucro"
        aria-expanded={aberta}
        className={`absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-40 ${aberta ? "text-acento" : "text-suave"}`}
      >
        <Calculator size={16} />
      </button>

      {aberta && (
        <div
          role="dialog"
          aria-label="Margem"
          onKeyDown={(evento) => {
            if (evento.key !== "Escape") return;
            evento.stopPropagation();
            setAberta(false);
          }}
          className="absolute top-full right-0 z-30 mt-1 w-72 rounded-lg border border-borda bg-superficie p-2 shadow-lg"
        >
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <span className="text-sm font-semibold">Margem</span>
            <button type="button" onClick={() => setAberta(false)} aria-label="Fechar margem" className="rounded p-1 text-suave hover:bg-fundo">
              <X size={14} />
            </button>
          </div>

          <div className="space-y-2.5 px-2 pb-2">
            <div className="rounded border border-borda bg-fundo/60 px-2.5 py-2">
              <span className="block text-xs text-suave">Custo total</span>
              <p className="text-lg leading-tight font-semibold tabular-nums">{custoTotal === null ? "—" : MOEDA.format(custoTotal)}</p>
              {conta ? (
                <p className="mt-0.5 text-[11px] text-suave tabular-nums">
                  Fornecedor {MOEDA.format(custo.valor)} · ML {MOEDA.format(taxasDoML)} · Imposto {MOEDA.format(conta.imposto)}
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] text-suave">
                  {taxas ? "Informe o preço ou o lucro." : "Taxas do ML ainda não lidas: informe o lucro e o Rise as lê."}
                </p>
              )}
            </div>

            <Campo rotulo="Preço de venda" prefixo="R$" valor={mostrado("preco", preco > 0 ? preco : null, 2)} aoMudar={(texto) => mudar("preco", texto)} aoSair={() => setDigitado(null)} />
            <Campo
              rotulo="% de lucro (sobre o custo total)"
              sufixo="%"
              valor={mostrado("percentual", conta?.markup ?? null, 1)}
              aoMudar={(texto) => mudar("percentual", texto)}
              aoSair={() => setDigitado(null)}
            />
            <Campo rotulo="Lucro (R$)" prefixo="R$" valor={mostrado("reais", conta?.lucro ?? null, 2)} aoMudar={(texto) => mudar("reais", texto)} aoSair={() => setDigitado(null)} />

            {calculando && (
              <p className="flex items-center gap-1 text-[11px] text-suave">
                <Loader size={11} className="animate-spin" /> Lendo as taxas do ML...
              </p>
            )}
            {erro && <p className="text-[11px] text-red-700">{erro}</p>}

            <p className="border-t border-borda pt-2 text-[11px] text-suave">
              % de lucro: quanto o preço passa do custo total (fornecedor, comissão, tarifa, frete e imposto de{" "}
              {Math.round(IMPOSTO_PADRAO * 100)}%). As taxas são relidas no ML quando o preço muda.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
