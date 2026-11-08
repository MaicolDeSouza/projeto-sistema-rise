"use client";

import { useState, useTransition } from "react";
import { Percent } from "lucide-react";

import { recomendacaoDeAtacadoMLAcao } from "@/app/canais-de-venda/mercado-livre/acoes";
import { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import { FAIXAS_PADRAO } from "@/lib/canaisDeVenda/ml/atacado";
import MensagensDoCampo, { problemasDoCampo } from "./MensagensDoCampo";
import { filtrarDecimal, lerDecimal, textoDecimal } from "./numeros";
import SecaoDoAnuncio from "./SecaoDoAnuncio";

const MOEDA = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const AJUDA =
  "O % de cada faixa vem da recomendação do Mercado Livre na publicação; abaixo do recomendado o ML recusa. Só compradores com CNPJ veem esses preços. Faixa com a quantidade vazia sai ao salvar.";

/** O interruptor do Rise (o mesmo desenho do "Ativo" do usuario e do bot do Telegram). */
function Interruptor({ ligado, aoMudar, rotulo }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={() => aoMudar(!ligado)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-[background-color] duration-150 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none ${ligado ? "bg-emerald-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${ligado ? "translate-x-5" : ""}`} />
    </button>
  );
}

// As linhas da tela guardam o TEXTO digitado (uma linha com a quantidade apagada ainda existe enquanto se digita);
// o rascunho so recebe as que tem quantidade inteira de 1 a 100.
const linhasDe = (atacado) => {
  const faixas = atacado?.faixas?.length ? atacado.faixas : FAIXAS_PADRAO.map((quantidade) => ({ quantidade, percentual: null }));
  return faixas.map((faixa) => ({ quantidade: String(faixa.quantidade ?? ""), percentual: textoDecimal(faixa.percentual, 0) }));
};

function faixasDe(linhas) {
  return linhas
    .map((linha) => ({ quantidade: Number(linha.quantidade), percentual: lerDecimal(linha.percentual) }))
    .filter((faixa) => Number.isInteger(faixa.quantidade) && faixa.quantidade >= 1 && faixa.quantidade <= 100)
    .map((faixa) => ({ quantidade: faixa.quantidade, percentual: faixa.percentual === null ? null : Math.min(100, Math.max(0, faixa.percentual)) }));
}

/**
 * Cartao "Precos de atacado (Exclusivo negocios)" da aba Preco (definicao 8 do dono em 08/11/2026). O operador ve primeiro se o
 * atacado esta ligado e quanto fica o preco de cada faixa; a acao principal e o interruptor. Desligado, so a faixa do titulo
 * aparece. As quatro faixas (2, 5, 10 e 20) e os % sao editaveis; % vazio vem da recomendacao do ML no envio. No anuncio que
 * ja existe no ML, "Recomendação do ML" preenche os % vazios ou abaixo do recomendado.
 */
export default function AtacadoDoML({ rascunho, alterar, anuncioId = null, jaNoML = false, problemas }) {
  const ligado = rascunho.atacado?.ligado === true;
  const preco = Number(rascunho.preco);
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState(null);

  // Estado derivado do rascunho: se ele mudou por fora (recarregou do servidor, os % gravados pelo envio), as linhas se refazem;
  // o que a propria tela acabou de mandar nao conta como mudanca (senao a linha em edicao se refaria a cada tecla).
  const chaveDoRascunho = JSON.stringify(rascunho.atacado ?? null);
  const [visto, setVisto] = useState(chaveDoRascunho);
  const [linhas, setLinhas] = useState(() => linhasDe(rascunho.atacado));
  if (visto !== chaveDoRascunho) {
    setVisto(chaveDoRascunho);
    setLinhas(linhasDe(rascunho.atacado));
  }

  function mandar(novasLinhas, novoLigado = ligado) {
    const proximo = { ligado: novoLigado, faixas: faixasDe(novasLinhas) };
    setLinhas(novasLinhas);
    setVisto(JSON.stringify(proximo));
    alterar({ atacado: proximo });
  }

  function mudarLinha(indice, parcial) {
    mandar(linhas.map((linha, i) => (i === indice ? { ...linha, ...parcial } : linha)));
  }

  function recomendar() {
    setErro(null);
    const quantidades = faixasDe(linhas).map((faixa) => faixa.quantidade);
    iniciar(async () => {
      let resposta;
      try {
        resposta = await recomendacaoDeAtacadoMLAcao(anuncioId, { preco, quantidades });
      } catch {
        resposta = { ok: false, erro: "Não foi possível consultar o Mercado Livre." };
      }
      if (!resposta?.ok) {
        setErro(resposta?.erro ?? "Não foi possível ler a recomendação.");
        return;
      }
      const recomendado = new Map(resposta.recomendacoes.map((r) => [Number(r.quantity), Number(r.discount_percentage)]));
      mandar(
        linhas.map((linha) => {
          const minimo = recomendado.get(Number(linha.quantidade));
          if (minimo === undefined) return linha;
          const atual = lerDecimal(linha.percentual) ?? 0;
          return atual >= minimo ? linha : { ...linha, percentual: textoDecimal(minimo, 0) };
        }),
      );
    });
  }

  const motivoDoBotao = !(preco > 0) ? "Informe o preço de venda para ler a recomendação." : null;
  const comErro = problemasDoCampo(problemas, "atacado").some((problema) => problema.bloqueante);

  return (
    <SecaoDoAnuncio
      titulo="Preços de atacado (Exclusivo negócios)"
      ajuda={AJUDA}
      semCorpo={!ligado}
      acao={
        <label className="flex items-center gap-2 text-xs text-suave">
          Oferecer preço de atacado
          <Interruptor ligado={ligado} aoMudar={(valor) => mandar(linhas, valor)} rotulo="Oferecer preço de atacado" />
        </label>
      }
    >
      <div className="grid max-w-md grid-cols-[6.5rem_6.5rem_1fr] items-center gap-x-3 gap-y-2">
        <span className="text-[11px] text-suave">A partir de (un.)</span>
        <span className="text-[11px] text-suave">Desconto (%)</span>
        <span className="text-right text-[11px] text-suave">Preço por unidade</span>
        {linhas.map((linha, indice) => {
          const percentual = lerDecimal(linha.percentual);
          const comDesconto = preco > 0 && percentual !== null && percentual > 0 ? preco * (1 - percentual / 100) : null;
          return (
            <FaixaDoAtacado
              key={indice}
              indice={indice}
              linha={linha}
              comErro={comErro}
              comDesconto={comDesconto}
              aoMudar={(parcial) => mudarLinha(indice, parcial)}
            />
          );
        })}
      </div>
      <MensagensDoCampo problemas={problemas} campo="atacado" />
      {jaNoML && anuncioId && (
        <div className="mt-3">
          <button
            type="button"
            onClick={recomendar}
            disabled={Boolean(motivoDoBotao) || ocupado}
            title={motivoDoBotao ?? "Lê no Mercado Livre o desconto recomendado de cada faixa e preenche os que estão vazios ou abaixo dele"}
            className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm text-acento transition-[background-color,transform] duration-150 ease-out hover:bg-fundo active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <Percent size={14} />
            {ocupado ? "Lendo…" : "Recomendação do ML"}
          </button>
          {erro && <p className="mt-1 text-[11px] text-red-600">{erro}</p>}
        </div>
      )}
    </SecaoDoAnuncio>
  );
}

function FaixaDoAtacado({ indice, linha, comErro, comDesconto, aoMudar }) {
  return (
    <>
      <input
        inputMode="numeric"
        autoComplete="off"
        aria-label={`Quantidade da faixa ${indice + 1}`}
        placeholder="—"
        value={linha.quantidade}
        onChange={(evento) => aoMudar({ quantidade: evento.target.value.replace(/\D/g, "").slice(0, 3) })}
        className={`${CLASSE_CAMPO} text-right tabular-nums ${bordaDoCampo(comErro)}`}
      />
      <input
        inputMode="decimal"
        autoComplete="off"
        aria-label={`Desconto da faixa ${indice + 1} em %`}
        placeholder="ML"
        title="Vazio: o desconto vem da recomendação do Mercado Livre na publicação"
        value={linha.percentual}
        onChange={(evento) => aoMudar({ percentual: filtrarDecimal(evento.target.value, 2) })}
        className={`${CLASSE_CAMPO} text-right tabular-nums ${bordaDoCampo(comErro)}`}
      />
      <span className="text-right text-sm tabular-nums">{comDesconto === null ? <span className="text-suave">—</span> : MOEDA.format(comDesconto)}</span>
    </>
  );
}
