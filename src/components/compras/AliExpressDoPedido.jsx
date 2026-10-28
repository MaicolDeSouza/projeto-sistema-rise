"use client";

import { useState, useTransition } from "react";
import { ExternalLink, Loader2, Package, RefreshCw } from "lucide-react";

import { casarLinhaAliExpressAcao, reenviarAoVirtualAcao } from "@/app/compras/acoes";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import FotoComLupa from "@/components/ui/FotoComLupa";
import BuscaDeItem from "./BuscaDeItem";
import { moeda, soDigitos } from "./formato";

const dataCurta = (valor) =>
  valor ? new Date(valor).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : null;

/**
 * O que o pedido do AliExpress mostra a mais (spec 2026-10-28, §6.4). Linha-guia: o operador ve primeiro o que falta
 * casar e o rastreio de cada item; a acao principal continua "Lancar estoque" (a coluna Chegada de sempre).
 */

/** Dentro do cartao Fornecedor: loja, numero no AliExpress (abre o pedido no site), situacao la e data. */
export function ResumoAliExpress({ aliexpress }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-suave">
      {aliexpress.loja && <span>{aliexpress.loja}</span>}
      <a href={aliexpress.linkDoPedido} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-texto hover:text-acento">
        AliExpress {aliexpress.numero} <ExternalLink size={12} />
      </a>
      <span>
        {aliexpress.statusTexto}
        {aliexpress.dataDoPedido && <span className="tabular-nums"> · comprado em {dataCurta(aliexpress.dataDoPedido)}</span>}
      </span>
    </p>
  );
}

/** Os avisos ambar do pedido (entregue sem lancar, itens sem produto, Virtual pendente), com o "Reenviar ao Virtual". */
export function AvisosAliExpress({ avisos, aliexpress, podeCasar, aoAtualizar }) {
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();
  if (!avisos?.length && !erro) return null;

  const reenviar = (linhaId) =>
    iniciar(async () => {
      setErro(null);
      const resposta = await reenviarAoVirtualAcao(linhaId);
      if (!resposta?.ok) return setErro(resposta?.erro ?? "O Bling recusou de novo.");
      if (resposta.pedido) aoAtualizar(resposta.pedido);
    });

  return (
    <div className="mb-5 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
      {avisos.map((aviso) => (
        <p key={aviso} className="text-pretty">
          {aviso}
        </p>
      ))}
      {podeCasar &&
        aliexpress.virtualPendentes.map((pendente) => (
          <div key={pendente.linhaId} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="min-w-0 truncate" title={pendente.erro}>
              {pendente.titulo}: {pendente.erro}
            </span>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => reenviar(pendente.linhaId)}
              className="inline-flex items-center gap-1 rounded border border-amber-300 px-2 py-0.5 font-medium hover:bg-amber-100 disabled:opacity-50"
            >
              {ocupado ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Reenviar ao Virtual
            </button>
          </div>
        ))}
      {erro && (
        <p className="text-rose-700" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Uma linha do AliExpress sem produto: escolher o produto e o fator e casar. */
function LinhaPendente({ linha, pedidoId, fornecedor, podeCasar, aoAtualizar }) {
  const [produto, setProduto] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [fator, setFator] = useState("1");
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();
  const fatorNumero = Number(fator);
  const quantidadeNoRise = linha.quantidadeComprada * (fatorNumero || 1);

  const casar = () =>
    iniciar(async () => {
      setErro(null);
      const resposta = await casarLinhaAliExpressAcao(linha.id, produto.produtoId, fatorNumero);
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível casar.");
      if (resposta.pedido) aoAtualizar(resposta.pedido);
    });

  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white" title="Sem produto do Rise">
        !
      </span>
      {linha.urlDaFoto ? <FotoComLupa src={linha.urlDaFoto} alt={linha.titulo} className="h-10 w-10" /> : <span className="block h-10 w-10 rounded border border-dashed border-borda" />}
      <div className="min-w-0 flex-1 basis-60">
        <p className="truncate font-medium" title={linha.titulo}>
          {linha.urlDoItem ? (
            <a href={linha.urlDoItem} target="_blank" rel="noreferrer" className="hover:text-acento">
              {linha.titulo}
            </a>
          ) : (
            linha.titulo
          )}
        </p>
        <p className="text-xs text-suave tabular-nums">
          {linha.opcao && <span>{linha.opcao} · </span>}
          {linha.quantidadeComprada} comprado{linha.quantidadeComprada === 1 ? "" : "s"}
          {linha.precoComprado !== null && linha.precoComprado !== undefined && <span> · {moeda.format(linha.precoComprado)} cada</span>}
        </p>
      </div>
      {podeCasar && (
        <div className="flex flex-wrap items-center gap-2">
          {produto ? (
            <button type="button" onClick={() => setBuscando(true)} className="max-w-56 truncate rounded border border-borda px-2 py-1 text-left text-sm hover:bg-fundo" title="Trocar o produto">
              <span className="font-mono text-xs text-suave">{produto.sku}</span> {produto.nome}
            </button>
          ) : (
            <button type="button" onClick={() => setBuscando(true)} className="rounded border border-dashed border-borda px-2 py-1 text-sm text-suave hover:border-acento hover:text-acento">
              Escolher produto
            </button>
          )}
          <label className="flex items-center gap-1 text-xs text-suave">
            Fator
            <input
              inputMode="numeric"
              value={fator}
              onChange={(evento) => setFator(soDigitos(evento.target.value, 6))}
              aria-label="Fator: 1 comprado vale quantas unidades no Rise"
              className="w-16 rounded border border-borda bg-superficie px-2 py-1 text-right text-sm tabular-nums focus:border-acento focus:outline-none"
            />
            <BolhaDeAjuda variante="inline" texto="Quantas unidades do Rise vêm em 1 comprado: kit de 100 peças = 100. A quantidade entra multiplicada e o preço dividido." />
          </label>
          <button
            type="button"
            onClick={casar}
            disabled={!produto || !fatorNumero || ocupado}
            aria-label="Casar"
            title={!produto ? "Escolha o produto" : `Entra ${quantidadeNoRise} no pedido`}
            className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100"
          >
            {ocupado && <Loader2 size={13} className="animate-spin" />} Casar
          </button>
        </div>
      )}
      {buscando && (
        <div className="basis-full">
          <BuscaDeItem
            pedidoId={pedidoId}
            fornecedor={fornecedor}
            aoEscolher={(achado) => {
              setProduto(achado);
              setBuscando(false);
            }}
            aoFechar={() => setBuscando(false)}
            permitirRepetido
          />
        </div>
      )}
      {erro && (
        <p className="basis-full text-sm text-rose-600" role="alert">
          {erro}
        </p>
      )}
    </li>
  );
}

/** As linhas sem produto, no topo do cartao de itens. */
export function LinhasPendentesAliExpress({ aliexpress, pedidoId, fornecedor, podeCasar, aoAtualizar }) {
  if (!aliexpress?.linhasPendentes?.length) return null;
  return (
    <ul className="-mx-4 -mt-4 mb-4 divide-y divide-borda border-b border-borda bg-amber-50/40 px-4">
      {aliexpress.linhasPendentes.map((linha) => (
        <LinhaPendente key={linha.id} linha={linha} pedidoId={pedidoId} fornecedor={fornecedor} podeCasar={podeCasar} aoAtualizar={aoAtualizar} />
      ))}
    </ul>
  );
}

/** A celula "Rastreio" de um item: codigo (abre o rastreio no AliExpress), transportadora, ultimo evento e previsao. */
export function CelulaDeRastreio({ pacotes, linkDoRastreio }) {
  if (!pacotes?.length) return <span className="text-xs text-suave">—</span>;
  return (
    <div className="space-y-1.5">
      {pacotes.map((pacote) => (
        <div key={pacote.codigo} className="min-w-44 text-xs leading-snug">
          <a href={linkDoRastreio} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono font-medium text-texto hover:text-acento" title={pacote.transportadora ?? undefined}>
            <Package size={12} className="shrink-0 text-suave" /> {pacote.codigo}
          </a>
          {pacote.ultimoEvento && (
            <p className="truncate text-suave" title={pacote.ultimoEvento}>
              {dataCurta(pacote.ultimoEventoEm)} · {pacote.ultimoEvento}
            </p>
          )}
          {pacote.previsaoTexto && <p className="text-suave">Previsão {pacote.previsaoTexto}</p>}
        </div>
      ))}
    </div>
  );
}
