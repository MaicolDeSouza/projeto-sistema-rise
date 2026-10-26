"use client";

import { PackagePlus, RotateCcw } from "lucide-react";

import { faltaLancar } from "@/lib/compras/regras";

const dataHora = (valor) =>
  new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * A celula "Chegada" de um item do pedido enviado: lancar o que chegou, quanto ja foi lancado e desfazer o ultimo. O
 * aviso do Bling que recusou fica aqui, na linha do item, com "Reenviar".
 */
export default function CelulaDeLancamento({ item, status, podeLancar, aviso, aoLancar, aoDesfazer, aoReenviar, alterado }) {
  if (!["ENVIADO", "PARCIAL", "FINALIZADO"].includes(status)) return null;
  const falta = faltaLancar(item);
  const ultimo = item.lancamentos?.at(-1);
  const aberto = ["ENVIADO", "PARCIAL"].includes(status) && podeLancar;
  const bloqueio = alterado ? "Salve as alterações antes de lançar" : undefined;

  return (
    <div className="w-52 space-y-1 text-xs">
      {item.quantidadeLancada > 0 && (
        <p className={falta === 0 ? "font-medium text-emerald-700" : "text-texto"}>
          Lançado {item.quantidadeLancada} de {item.quantidade}
          {ultimo && <span className="block text-suave">{dataHora(ultimo.lancadoEm)}</span>}
        </p>
      )}
      {aberto && (
        <div className="flex flex-wrap items-center gap-1.5">
          {falta > 0 && (
            <button
              type="button"
              onClick={() => aoLancar(item)}
              disabled={alterado}
              title={bloqueio}
              className="inline-flex items-center gap-1 rounded-md border border-acento/50 px-2 py-1.5 font-semibold text-acento transition-[background-color,transform] duration-150 hover:bg-acento/5 active:scale-[0.97] disabled:opacity-50"
            >
              <PackagePlus size={13} /> {item.quantidadeLancada > 0 ? "Lançar resto" : "Lançar estoque"}
            </button>
          )}
          {status === "PARCIAL" && item.quantidadeLancada > 0 && (
            <button
              type="button"
              onClick={() => aoDesfazer(item)}
              disabled={alterado}
              title={bloqueio ?? `Desfazer o último lançamento (${ultimo?.quantidade} un.)`}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-suave hover:bg-fundo hover:text-texto disabled:opacity-50"
            >
              <RotateCcw size={13} /> Desfazer
            </button>
          )}
        </div>
      )}
      {aviso && (
        <p className="rounded bg-amber-50 px-2 py-1 text-amber-800" title={`O Bling recusou: ${aviso}`}>
          <span className="line-clamp-3">
          Entrada gravada no Rise; o Bling recusou: {aviso}</span>{" "}
          <button type="button" onClick={() => aoReenviar(item)} className="font-semibold underline-offset-2 hover:underline">
            Reenviar
          </button>
        </p>
      )}
    </div>
  );
}
