"use client";

import { useState, useTransition } from "react";
import { Calculator, Loader } from "lucide-react";

import { precoPorMargemML } from "@/app/canais-de-venda/mercado-livre/acoes";
import { filtrarDecimal, lerDecimal } from "./numeros";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const CATEGORIA_ML = /^MLB\d+$/;

/**
 * Calculadora do preco por margem (o mesmo icone da do cadastro de Produto): o dono diz o lucro
 * que quer, em % do preco ou em R$, e o Rise devolve o preco necessario com as taxas REAIS do ML
 * (comissao e tarifa fixa sao relidas no preco calculado). "Usar este preco" poe o preco no campo e
 * deixa os custos lidos valendo. Abre como um painel embaixo do preco.
 */
export default function CalculadoraDeMargem({ rascunho, alterar, setContexto, custo }) {
  const [aberta, setAberta] = useState(false);
  const [tipo, setTipo] = useState("percentual");
  const [digitado, setDigitado] = useState("");
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [calculando, iniciarCalculo] = useTransition();

  const motivoDesligado = !(custo.valor > 0)
    ? "Marque um fornecedor padrão com preço de custo para calcular."
    : !CATEGORIA_ML.test(rascunho.categoriaId ?? "")
      ? "Escolha a categoria na aba Geral para calcular com as taxas do ML."
      : null;

  function calcular() {
    const valor = lerDecimal(digitado);
    if (valor === null || valor < 0) {
      setErro("Informe a margem desejada.");
      return;
    }
    setErro(null);
    setResultado(null);
    iniciarCalculo(async () => {
      let resposta;
      try {
        resposta = await precoPorMargemML(rascunho, { custo: custo.valor, margem: { tipo, valor } });
      } catch {
        resposta = { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
      }
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      setResultado(resposta);
    });
  }

  function usar() {
    alterar({ preco: resultado.preco });
    // Os custos que vieram junto foram lidos NESTE preco: a aba os mostra sem pedir outra leitura.
    setContexto((atual) => ({ ...atual, custosML: resultado.custosML }));
    setAberta(false);
    setResultado(null);
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setAberta((atual) => !atual)}
        disabled={Boolean(motivoDesligado)}
        title={motivoDesligado ?? "Calcular o preço a partir da margem desejada, com as taxas do ML"}
        aria-expanded={aberta}
        className="inline-flex items-center gap-1.5 rounded border border-borda px-2 py-1 text-xs hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Calculator size={13} /> Calcular pela margem
      </button>

      {aberta && (
        <div className="mt-2 rounded border border-borda bg-superficie p-3 shadow-sm">
          <p className="text-xs font-semibold">Margem desejada</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {[
              { valor: "percentual", rotulo: "%" },
              { valor: "reais", rotulo: "R$" },
            ].map((opcao) => (
              <label key={opcao.valor} className="flex cursor-pointer items-center gap-1 text-sm">
                <input type="radio" name="ml-tipo-de-margem" checked={tipo === opcao.valor} onChange={() => setTipo(opcao.valor)} className="accent-acento" />
                {opcao.rotulo}
              </label>
            ))}
            <input
              inputMode="decimal"
              autoComplete="off"
              aria-label="Margem desejada"
              placeholder={tipo === "percentual" ? "30" : "20,00"}
              value={digitado}
              onChange={(evento) => setDigitado(filtrarDecimal(evento.target.value, 2))}
              onKeyDown={(evento) => {
                if (evento.key === "Enter") {
                  evento.preventDefault();
                  calcular();
                }
              }}
              className="w-24 rounded border border-borda px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={calcular}
              disabled={calculando}
              className="inline-flex items-center gap-1 rounded bg-acento px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {calculando && <Loader size={12} className="animate-spin" />}
              Calcular
            </button>
          </div>
          {erro && <p className="mt-1.5 text-[11px] text-red-700">{erro}</p>}
          {resultado && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-sm">
                Preço necessário: <strong>{MOEDA.format(resultado.preco)}</strong>
              </p>
              <button type="button" onClick={usar} className="rounded border border-borda px-2.5 py-1 text-xs hover:bg-fundo">
                Usar este preço
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
