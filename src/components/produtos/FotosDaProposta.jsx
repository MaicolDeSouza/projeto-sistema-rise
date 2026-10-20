"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * Janela "Fotos da proposta" (aba Imagens, spec 2026-10-16): as candidatas que a sessao do Claude baixou e as fotos
 * atuais que ela citou, com o check das escolhidas. A ordem e a dos cliques: as escolhidas pela proposta vem na ordem
 * dela, e marcar uma nova a poe no fim. "Aplicar fotos" so devolve a escolha; quem mexe no painel e o PainelDeImagens,
 * e quem grava e o Salvar.
 *
 * Desenho: nesta janela o operador precisa ver primeiro as fotos e quais estao escolhidas, em que ordem; a acao
 * principal e "Aplicar fotos".
 */
export default function FotosDaProposta({ fotos, urls, aoAplicar, aoFechar, ocupado = false }) {
  const candidatas = fotos?.candidatas ?? [];
  const [ordem, setOrdem] = useState(() =>
    candidatas.filter((c) => c.escolhida).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((c) => c.id),
  );

  useEffect(() => {
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  function alternar(id) {
    setOrdem((atual) => (atual.includes(id) ? atual.filter((item) => item !== id) : [...atual, id]));
  }

  // Escolhidas primeiro (na ordem), depois as outras: e o que o operador confere.
  const visiveis = [...candidatas].sort((a, b) => {
    const pa = ordem.indexOf(a.id);
    const pb = ordem.indexOf(b.id);
    return (pa < 0 ? 999 : pa) - (pb < 0 ? 999 : pb);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" {...propsDoFundo(aoFechar)}>
      <div role="dialog" aria-label="Fotos da proposta" className="mt-6 flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-superficie shadow-xl">
        <header className="flex items-center gap-3 border-b border-borda px-5 py-3">
          <h2 className="font-semibold">Fotos da proposta</h2>
          <span className="text-xs text-suave">
            {ordem.length} {ordem.length === 1 ? "escolhida" : "escolhidas"} de {candidatas.length}
          </span>
          <span className="relative inline-flex">
            <BolhaDeAjuda
              variante="inline"
              texto="Clique numa foto para marcar ou desmarcar; o número é a ordem (a 1ª é a principal). Aplicar põe as marcadas no painel, validadas. As fotos atuais que ficarem de fora vão para a reserva ao salvar."
            />
          </span>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="ml-auto rounded p-1 text-suave hover:bg-fundo">
            <X size={18} />
          </button>
        </header>

        <ul className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3 lg:grid-cols-4">
          {visiveis.map((candidata) => {
            const posicao = ordem.indexOf(candidata.id);
            const marcada = posicao >= 0;
            const url = urls?.[`foto:${candidata.id}`];
            return (
              <li key={candidata.id}>
                <button
                  type="button"
                  onClick={() => alternar(candidata.id)}
                  aria-pressed={marcada}
                  title={candidata.motivo}
                  className={`relative block w-full rounded border-2 p-1.5 text-left ${marcada ? "border-emerald-500" : "border-borda hover:border-suave"}`}
                >
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- foto da pasta da proposta, servida pela rota do Rise
                    <img src={url} alt={`Candidata ${candidata.id}`} loading="lazy" className="aspect-square w-full rounded bg-white object-contain" />
                  ) : (
                    <span className="flex aspect-square w-full items-center justify-center rounded bg-fundo text-xs text-suave">sem imagem</span>
                  )}
                  {marcada && (
                    <span className="absolute top-2.5 left-2.5 inline-flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-emerald-600 px-1.5 text-xs font-semibold text-white">
                      <Check size={12} /> {posicao + 1}
                    </span>
                  )}
                  <span className="mt-1 block truncate text-xs font-medium">{candidata.origem?.loja}</span>
                  <span className="line-clamp-2 block text-[11px] text-suave">{candidata.motivo}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <footer className="flex items-center justify-end gap-2 border-t border-borda px-5 py-3">
          <button type="button" onClick={aoFechar} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => aoAplicar(ordem)}
            disabled={ocupado || ordem.length === 0}
            title={ordem.length === 0 ? "Escolha pelo menos uma foto" : undefined}
            className="rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ocupado ? "Aplicando..." : "Aplicar fotos"}
          </button>
        </footer>
      </div>
    </div>
  );
}
