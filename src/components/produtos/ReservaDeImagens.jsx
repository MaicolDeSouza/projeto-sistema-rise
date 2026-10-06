"use client";

import { useEffect, useState } from "react";
import { Check, Loader, Sparkles, Trash2, X } from "lucide-react";

/**
 * A RESERVA de imagens do produto (Nano Banana, 05/10/2026): o que o dono ja trabalhou e nao escolheu como
 * foto do produto (a original que chegou e as versoes geradas do Photoroom e do Nano Banana). Fica escondida
 * atras do botao "Reserva (N)" do painel de fotos; so aparece em produto que ja existe.
 *
 * Cada miniatura traz a etiqueta da versao e tres acoes:
 *  - "Escolher essa": traz a imagem para o carrossel (a foto do mesmo grupo sai de la e desce para a
 *    reserva, no Salvar);
 *  - "Gerar com Nano Banana": so nas de versao `original`, abre a janela de fotos ja nela, na aba Nano
 *    Banana (a geracao parte da original verdadeira);
 *  - "Excluir": pede um segundo clique e MARCA a exclusao; so apaga de verdade no Salvar do produto, como o
 *    resto do formulario, e o Cancelar do produto nao grava nada.
 */

const ROTULO_DA_VERSAO = { original: "Original", photoroom: "Photoroom", nanobanana: "Nano Banana" };

export default function ReservaDeImagens({ reserva, aoEscolher, aoGerar, aoExcluir, aoFechar, ocupado }) {
  // A imagem que o dono clicou uma vez em "Excluir": o segundo clique confirma.
  const [paraConfirmar, setParaConfirmar] = useState(null);

  // O Esc fecha a reserva (e so ela: a janela de fotos nao esta aberta junto).
  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  function excluir(item) {
    if (paraConfirmar !== item.id) {
      setParaConfirmar(item.id);
      return;
    }
    setParaConfirmar(null);
    aoExcluir(item);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Reserva de imagens"
        className="flex max-h-[90vh] w-[min(95vw,52rem)] flex-col overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b border-borda px-4 py-2.5">
          <h2 className="text-sm font-semibold">Reserva de imagens</h2>
          <span className="text-xs text-suave">{reserva.length} guardada{reserva.length === 1 ? "" : "s"}</span>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="ml-auto rounded p-1 text-suave hover:bg-fundo">
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p className="mb-3 text-xs text-suave">
            Aqui ficam a original e as versoes que voce ja trabalhou e nao usou como foto. Elas nao entram no
            anuncio. Excluir so vale quando voce salvar o produto.
          </p>
          {reserva.length === 0 ? (
            <p className="py-10 text-center text-sm text-suave">A reserva esta vazia.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {reserva.map((item) => (
                <li key={item.id} className="flex flex-col gap-1.5 rounded border border-borda p-2">
                  <div className="relative aspect-square overflow-hidden rounded bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt={`Reserva: ${ROTULO_DA_VERSAO[item.versao] ?? item.versao}`} className="h-full w-full object-contain" />
                    <span className="absolute top-1 left-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {ROTULO_DA_VERSAO[item.versao] ?? item.versao}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => aoEscolher(item)}
                    disabled={ocupado}
                    title="Traz esta imagem para as fotos do produto"
                    className="inline-flex items-center justify-center gap-1 rounded bg-emerald-600 px-2 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {ocupado ? <Loader size={12} className="animate-spin" /> : <Check size={12} strokeWidth={3} />} Escolher essa
                  </button>
                  {item.versao === "original" && (
                    <button
                      type="button"
                      onClick={() => aoGerar(item)}
                      disabled={ocupado}
                      title="Abre a janela de fotos nesta original, na aba Nano Banana"
                      className="inline-flex items-center justify-center gap-1 rounded border border-acento px-2 py-1.5 text-xs font-medium text-acento hover:bg-fundo disabled:opacity-50"
                    >
                      <Sparkles size={12} /> Gerar com Nano Banana
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => excluir(item)}
                    disabled={ocupado}
                    className={`inline-flex items-center justify-center gap-1 rounded border px-2 py-1.5 text-xs disabled:opacity-50 ${
                      paraConfirmar === item.id
                        ? "border-red-600 bg-red-600 font-medium text-white hover:opacity-90"
                        : "border-borda text-red-700 hover:bg-red-50"
                    }`}
                  >
                    <Trash2 size={12} /> {paraConfirmar === item.id ? "Clique de novo para confirmar" : "Excluir"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex justify-end border-t border-borda px-4 py-2">
          <button type="button" onClick={aoFechar} className="rounded border border-borda px-4 py-2 text-sm hover:bg-fundo">
            Fechar
          </button>
        </footer>
      </section>
    </div>
  );
}
