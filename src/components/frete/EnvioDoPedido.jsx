"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { pacoteSugeridoAcao } from "@/app/frete/acoes";
import { salvarRascunhoDoEnvioAcao } from "@/app/pedidos/acoes";
import { Dado, Secao } from "@/components/pedidos/AbaGeral";
import { numeroDoEnvio } from "@/lib/frete/regras";

import JanelaDeCotacao from "./JanelaDeCotacao";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const prazo = (dias) => (dias ? `${dias} ${dias === 1 ? "dia útil" : "dias úteis"}` : null);
const BOTAO = "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";

/**
 * "Envio pelo Rise" na aba Envio do pedido do Bling (modulo de frete, fase 1). Linha-guia: o operador ve primeiro em que
 * passo o envio esta; a acao principal e o proximo passo (cotar; com o rascunho, comprar a etiqueta, que chega na fase 2).
 */
export default function EnvioDoPedido({ pedido, envio, caixas, cotacaoDaProposta, podeCotar }) {
  const router = useRouter();
  const [inicial, setInicial] = useState(null);
  const [erro, setErro] = useState(null);
  const [abrindo, iniciarAbertura] = useTransition();
  const [salvando, iniciarSalvar] = useTransition();
  const entrega = pedido.enderecoDeEntrega ?? {};

  function abrir() {
    setErro(null);
    iniciarAbertura(async () => {
      const base = {
        cepDestino: entrega.cep ?? "",
        cidadeDestino: entrega.cidade ? `${entrega.cidade}${entrega.uf ? ` (${entrega.uf})` : ""}` : null,
        valorDeclarado: pedido.totalProdutos,
      };
      // Recotar parte do rascunho; o primeiro cotar, da cotacao da proposta de origem; sem nenhum, da sugestao pelos itens.
      if (envio) return setInicial({ ...base, caixaId: envio.caixaDeEnvioId ?? undefined, pesoKg: envio.pesoKg, valorDeclarado: envio.valorDeclarado });
      if (cotacaoDaProposta) return setInicial({ ...base, caixaId: cotacaoDaProposta.caixaId ?? undefined, pesoKg: cotacaoDaProposta.pesoKg });
      const itens = (pedido.itens ?? []).filter((item) => item.produtoId).map((item) => ({ produtoId: item.produtoId, quantidade: item.quantidade, valorUnitario: item.precoUnitario }));
      const sugerido = itens.length ? await pacoteSugeridoAcao(itens) : null;
      setInicial({
        ...base,
        caixaId: sugerido?.ok ? (sugerido.caixaId ?? undefined) : undefined,
        pesoKg: sugerido?.ok ? sugerido.pesoKg : null,
        incompletos: sugerido?.ok ? sugerido.incompletos + (pedido.itens ?? []).filter((item) => !item.produtoId).length : (pedido.itens ?? []).length,
        motivo: sugerido?.ok ? sugerido.motivo : null,
      });
    });
  }

  function escolher(servico, pacote, cotadoEm) {
    iniciarSalvar(async () => {
      const resposta = await salvarRascunhoDoEnvioAcao(pedido.id, { pacote, servico, cotadoEm });
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível guardar o serviço.");
      setInicial(null);
      router.refresh();
    });
  }

  const botaoCotar = (principal) => (
    <button
      type="button"
      onClick={abrir}
      disabled={!podeCotar || abrindo}
      title={podeCotar ? undefined : "Sem permissão para cotar o frete do pedido"}
      className={`${BOTAO} ${principal ? "bg-acento text-white hover:opacity-90" : "border border-borda hover:bg-fundo"}`}
    >
      {abrindo && <Loader2 size={14} className="animate-spin" />}
      {envio ? "Cotar de novo" : "Cotar frete"}
    </button>
  );

  return (
    <Secao titulo="Envio pelo Rise">
      {!envio ? (
        <div className="flex items-center gap-3">
          {botaoCotar(true)}
          <span className="text-sm text-suave">Nenhum serviço escolhido.</span>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Dado rotulo="Envio">
              <span className="tabular-nums">{numeroDoEnvio(envio.numero)}</span> <span className="text-suave">· rascunho</span>
            </Dado>
            <Dado rotulo="Serviço">{[envio.transportadoraNome, envio.servicoNome].filter(Boolean).join(" ")}</Dado>
            <Dado rotulo="Prazo">{prazo(envio.prazoDias)}</Dado>
            <Dado rotulo="Custo cotado">{envio.precoCotado !== null ? moeda.format(envio.precoCotado) : null}</Dado>
            <Dado rotulo="Caixa e peso">
              <span className="tabular-nums">
                {envio.caixaDeEnvio?.nome ?? `${envio.comprimentoCm} × ${envio.larguraCm} × ${envio.alturaCm} cm`} · {String(envio.pesoKg).replace(".", ",")} kg
              </span>
            </Dado>
            <Dado rotulo="Cotado em">
              <span className="tabular-nums">{new Date(envio.cotadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}</span>
            </Dado>
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" disabled title="Disponível na próxima entrega do módulo de frete" className={`${BOTAO} bg-acento text-white`}>
              Comprar etiqueta
            </button>
            {botaoCotar(false)}
          </div>
        </>
      )}
      {erro && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {erro}
        </p>
      )}
      {salvando && <p className="mt-2 text-sm text-suave">Guardando o serviço…</p>}

      <JanelaDeCotacao
        aberta={Boolean(inicial)}
        aoFechar={() => setInicial(null)}
        titulo={`Cotar frete · Pedido ${pedido.numero}`}
        caixas={caixas}
        inicial={inicial ?? {}}
        aoEscolher={escolher}
        rotuloDaEscolha="Escolher"
      />
    </Secao>
  );
}
