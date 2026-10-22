"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { Loader, RefreshCw } from "lucide-react";

import { lerCustosML } from "@/app/canais-de-venda/mercado-livre/acoes";
import { LIMITE_DO_FRETE_GRATIS } from "@/lib/canaisDeVenda/ml/custos";
import { IMPOSTO_PADRAO } from "@/lib/margem";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const CATEGORIA_ML = /^MLB\d+$/;
// Espera depois da ultima tecla no preco (ou da troca de categoria, tipo, logistica) antes de reler os custos no ML.
const ESPERA_DA_RELEITURA_MS = 900;

const dinheiro = (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100;

function Linha({ rotulo, valor, detalhe, classeDoValor = "" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-suave">
        {rotulo}
        {detalhe && <span className="ml-1 text-[11px]">{detalhe}</span>}
      </span>
      <span className={`tabular-nums ${classeDoValor}`}>{valor}</span>
    </div>
  );
}

// O frete conta SEMPRE (vendas reais de 22/10/2026): abaixo de R$ 79 e o que o ML cobra do vendedor sem frete gratis; dali
// para cima, o frete gratis obrigatorio.
function detalheDoFrete(custosML, preco) {
  if (custosML.frete === null) return "(informe as medidas na aba Envio)";
  const peso = custosML.pesoCobrado ? ` · peso ${custosML.pesoCobrado} g` : "";
  return preco >= LIMITE_DO_FRETE_GRATIS ? `(frete grátis obrigatório${peso})` : `(cobrado pelo ML abaixo de R$ 79${peso})`;
}

/**
 * Custos totais do anuncio numa caixa so (pedido do dono em 22/10/2026): o custo do fornecedor padrao, as taxas do ML
 * detalhadas (comissao, tarifa fixa quando ha, frete do vendedor) e o imposto, e no fim a soma de tudo. As taxas sao LIDAS
 * do ML e ficam no contexto do editor; quando preco, categoria, tipo ou logistica mudam deixam de valer e sao RELIDAS
 * sozinhas (pedido do dono em 22/10/2026), uma vez por combinacao, sem esperar o botao. A margem mora embaixo do preco
 * (`AbaPrecoEstoque`), nao aqui.
 *
 * `custo` e `{ valor, origem, faltam }` da aba; `conta` e o `custosDoAnuncio` ja feito pela aba (null sem taxas validas).
 */
export default function CustosDoML({ rascunho, contexto, setContexto, custo, conta }) {
  const [erro, setErro] = useState(null);
  const [lendo, iniciarLeitura] = useTransition();
  const custosML = contexto.custosML ?? null;
  const preco = Number(rascunho.preco);
  const motivoDesligado = !CATEGORIA_ML.test(rascunho.categoriaId ?? "")
    ? "Escolha a categoria na aba Geral."
    : !(preco > 0)
      ? "Informe o preço de venda."
      : null;

  function ler() {
    setErro(null);
    iniciarLeitura(async () => {
      let resposta;
      try {
        resposta = await lerCustosML(rascunho);
      } catch {
        resposta = { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
      }
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      setContexto((atual) => ({ ...atual, custosML: resposta.custosML }));
    });
  }

  // Releitura automatica: so GET no ML. Uma tentativa por combinacao (preco, categoria, tipo, logistica): um erro nao
  // vira laco de pedidos, e o botao continua para tentar de novo.
  const chave = [preco, rascunho.categoriaId, rascunho.tipoAnuncio, rascunho.envio?.logistica].join("|");
  const ultimaTentativa = useRef(null);
  const lerSozinho = useEffectEvent(() => {
    ultimaTentativa.current = chave;
    ler();
  });
  const precisaLer = !motivoDesligado && !conta && !lendo;
  useEffect(() => {
    if (!precisaLer || ultimaTentativa.current === chave) return undefined;
    const espera = setTimeout(lerSozinho, ESPERA_DA_RELEITURA_MS);
    return () => clearTimeout(espera);
  }, [chave, precisaLer]);

  const temCusto = custo.valor > 0;
  const imposto = conta ? conta.imposto : preco > 0 ? dinheiro(preco * IMPOSTO_PADRAO) : null;
  const taxasDoML = conta ? conta.comissao + conta.tarifaFixa + conta.frete : null;
  // Soma sem uma das partes seria um total enganoso: diz o que falta em vez de parecer completo.
  const faltaNoTotal = [!temCusto && "custo", !conta && "taxas do ML"].filter(Boolean);
  const total = (temCusto ? custo.valor : 0) + (taxasDoML ?? 0) + (imposto ?? 0);

  return (
    // No mesmo formato do campo Preco de venda ao lado (rotulo em cima, caixa com borda), pedido do dono em 22/10/2026.
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Custos totais</p>
        <button
          type="button"
          onClick={ler}
          disabled={lendo || Boolean(motivoDesligado)}
          title={motivoDesligado ?? "Lê comissão, tarifa fixa e frete no Mercado Livre"}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-acento hover:bg-fundo disabled:cursor-not-allowed disabled:text-suave disabled:opacity-60"
        >
          {lendo ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {custosML ? "Atualizar custos" : "Ler custos do ML"}
        </button>
      </div>

      <div className="mt-1 divide-y divide-borda rounded border border-borda bg-superficie px-2.5 py-1">
        <Linha
          rotulo="Custo do fornecedor"
          detalhe={temCusto && custo.origem ? `(${custo.origem})` : null}
          valor={temCusto ? MOEDA.format(custo.valor) : custo.faltam.length > 0 ? `Sem custo de ${custo.faltam.join(", ")}` : "Sem custo"}
          classeDoValor={temCusto ? "" : "text-amber-700"}
        />
        {conta ? (
          <>
            <Linha rotulo="Comissão do ML" detalhe={`(${PERCENTUAL.format(custosML.percentual * 100)}%)`} valor={MOEDA.format(conta.comissao)} />
            {conta.tarifaFixa > 0 && <Linha rotulo="Tarifa fixa do ML" valor={MOEDA.format(conta.tarifaFixa)} />}
            <Linha rotulo="Frete do vendedor" detalhe={detalheDoFrete(custosML, preco)} valor={MOEDA.format(conta.frete)} />
          </>
        ) : (
          <Linha rotulo="Taxas do ML" detalhe={motivoDesligado ? `(${motivoDesligado})` : null} valor="não lidas" classeDoValor="text-suave" />
        )}
        <Linha rotulo="Imposto" detalhe={`(${Math.round(IMPOSTO_PADRAO * 100)}%)`} valor={imposto === null ? "—" : MOEDA.format(imposto)} />
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <span className="text-sm font-semibold">
            Total dos custos
            {faltaNoTotal.length > 0 && <span className="ml-1 text-[11px] font-normal text-amber-700">(sem {faltaNoTotal.join(" e ")})</span>}
          </span>
          <span className="text-lg font-semibold tabular-nums">{MOEDA.format(dinheiro(total))}</span>
        </div>
      </div>
      {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}
      {custosML && !conta && preco > 0 && (
        <p className="mt-1 text-[11px] text-amber-700">Os custos foram lidos para outro preço, categoria, tipo ou logística. Clique em Atualizar custos.</p>
      )}
    </div>
  );
}
