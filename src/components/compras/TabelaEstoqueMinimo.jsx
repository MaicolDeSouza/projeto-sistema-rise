"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PackageCheck, Truck } from "lucide-react";

import CabecalhoOrdenavel, { parametrosDaOrdenacao } from "@/components/ui/CabecalhoOrdenavel";
import FotoComLupa from "@/components/ui/FotoComLupa";
import IconeCarrinho from "./IconeCarrinho";
import MedidorDeEstoque from "./MedidorDeEstoque";
import PopupFornecedores from "./PopupFornecedores";

/**
 * A lista "abaixo do estoque minimo". Linha-guia: o operador ve primeiro QUAIS produtos faltam e QUANTO; a acao
 * principal de cada linha e "Fornecedores". O resto (carrinho, a caminho) so aparece quando tem dado.
 */
export default function TabelaEstoqueMinimo({ linhas, ordenar, direcao }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [aberto, setAberto] = useState(null);

  const ordenarPor = (campo) => router.push(`${pathname}?${parametrosDaOrdenacao(searchParams, campo, ordenar, direcao)}`);

  if (linhas.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-borda bg-superficie px-6 py-12 text-center">
        <PackageCheck size={30} className="text-emerald-600" />
        <p className="font-medium">Nenhum produto abaixo do mínimo.</p>
        <p className="text-sm text-suave">Os pedidos enviados já contam como estoque a caminho.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
        <table className="w-full text-sm">
          <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
            <tr>
              <th className="w-16 px-3 py-2.5 font-medium">Foto</th>
              <th className="px-3 py-2.5 font-medium">Produto</th>
              <CabecalhoOrdenavel campo="codigo" rotulo="Código" ordenar={ordenar} direcao={direcao} aoClicar={ordenarPor} className="w-px whitespace-nowrap" />
              <CabecalhoOrdenavel campo="estoque" rotulo="Estoque" ordenar={ordenar} direcao={direcao} aoClicar={ordenarPor} className="w-36" />
              <th className="w-20 px-3 py-2.5 text-right font-medium">Mínimo</th>
              <th className="w-20 px-3 py-2.5 text-right font-medium">Máximo</th>
              <CabecalhoOrdenavel campo="falta" rotulo="Falta" ordenar={ordenar} direcao={direcao} aoClicar={ordenarPor} className="w-20 text-right" />
              <th className="w-px px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {linhas.map((linha) => (
              <tr key={linha.id} className="hover:bg-fundo/60">
                <td className="px-3 py-2">
                  {linha.foto ? <FotoComLupa src={linha.foto} alt={linha.nome} /> : <span className="block h-11 w-11 rounded border border-dashed border-borda" />}
                </td>
                <td className="max-w-0 px-3 py-2">
                  <Link href={`/produtos/${linha.id}`} className="block truncate font-medium hover:text-acento" title={linha.nome}>
                    {linha.nome}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{linha.sku}</td>
                <td className="px-3 py-2">
                  <span className="tabular-nums font-semibold">{linha.estoque}</span>
                  {linha.aCaminho > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs text-acento" title="Já pedido e ainda não lançado">
                      <Truck size={12} /> +{linha.aCaminho}
                    </span>
                  )}
                  <MedidorDeEstoque estoque={linha.estoque} aCaminho={linha.aCaminho} minimo={linha.minimo} maximo={linha.maximo} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-suave">{linha.minimo}</td>
                <td className="px-3 py-2 text-right tabular-nums text-suave">{linha.maximo ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-amber-700">{linha.falta}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <IconeCarrinho estado={linha.carrinho} />
                    <button
                      type="button"
                      onClick={() => setAberto({ id: linha.id, sku: linha.sku, nome: linha.nome })}
                      className="rounded-md border border-borda px-3 py-2 text-xs font-semibold text-texto transition-[color,border-color,transform] duration-150 hover:border-acento hover:text-acento active:scale-[0.97]"
                    >
                      Fornecedores
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {aberto && <PopupFornecedores produto={aberto} aoFechar={() => setAberto(null)} />}
    </>
  );
}
