"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { idadeDoSaldo, reais } from "./formatos";

/**
 * "Agora", em minutos, para dizer há quanto tempo o estoque foi lido do Bling. `useSyncExternalStore` (e não efeito
 * com estado): o servidor não sabe a hora do navegador, então o primeiro desenho sai sem a idade (snapshot `null`) e
 * ela aparece ao hidratar, sem divergência entre servidor e cliente.
 */
function assinarOMinuto(aviso) {
  const relogio = setInterval(aviso, 60_000);
  return () => clearInterval(relogio);
}
const minutoAtual = () => Math.floor(Date.now() / 60_000);

/**
 * O produto que a resposta usou, como os DADOS das ferramentas o trouxeram (nunca o texto do modelo): nome, código,
 * preço, estoque com a idade da leitura, e os links. `esmaecido` marca o que só foi consultado.
 *
 * @param {{ produto: { sku: string, nome: string, preco: number | null, estoque: number, estoqueLidoEm: string | null,
 *   urlLoja: string | null, urlRise?: string }, esmaecido?: boolean }} props
 */
export default function CartaoDeProduto({ produto, esmaecido = false }) {
  const agora = useSyncExternalStore(assinarOMinuto, minutoAtual, () => null);
  const lidoEm = produto.estoqueLidoEm ? Math.floor(new Date(produto.estoqueLidoEm).getTime() / 60_000) : null;
  const minutos = lidoEm !== null && agora !== null ? Math.max(0, agora - lidoEm) : null;
  const idade = lidoEm !== null && agora === null ? "" : idadeDoSaldo(minutos);
  // Sem `dado.estoqueExato` (Acessos) o estoque chega como faixa ("disponível", "poucas unidades", "em falta").
  const faixa = typeof produto.estoque === "string" ? produto.estoque : null;
  const semEstoque = faixa ? faixa === "em falta" : produto.estoque <= 0;

  return (
    <div className={`flex items-start gap-3 rounded-lg border border-borda bg-superficie p-3 ${esmaecido ? "opacity-75" : ""}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {produto.nome} <span className="text-xs font-normal text-suave">· {produto.sku}</span>
        </p>
        <p className="mt-0.5 text-sm text-suave">
          {produto.preco === null ? "sem preço" : reais(produto.preco)} ·{" "}
          <span className={`font-medium ${semEstoque ? "text-red-700" : "text-emerald-700"}`}>
            {faixa ?? (semEstoque ? "sem estoque" : `${produto.estoque} em estoque`)}
          </span>
          {idade && <span className="text-xs"> ({idade})</span>}
        </p>
        <p className="mt-1 flex flex-wrap gap-x-4 text-xs">
          {produto.urlRise && (
            <Link href={produto.urlRise} className="text-acento hover:underline" target="_blank" rel="noopener noreferrer">
              Abrir no Rise
            </Link>
          )}
          {produto.urlLoja ? (
            <a href={produto.urlLoja} className="inline-flex items-center gap-1 text-acento hover:underline" target="_blank" rel="noopener noreferrer">
              Ver na loja <ExternalLink size={11} />
            </a>
          ) : (
            <span className="text-suave">fora da loja</span>
          )}
        </p>
      </div>
    </div>
  );
}
