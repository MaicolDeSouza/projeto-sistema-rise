"use client";

import { ChevronDown, ChevronUp, ImageOff } from "lucide-react";

import Badge from "@/components/ui/Badge";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import MensagensDoCampo from "./MensagensDoCampo";

const AVISO_DO_KIT =
  "O kit pede fotos proprias (as dos produtos mostram uma unidade de cada). O envio de fotos do kit entra na fase 3.";

const BOTAO_DA_LINHA =
  "rounded p-1.5 text-suave hover:bg-fundo hover:text-texto disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

// As fotos que o anuncio pode usar: as do produto principal e, no kit, as de cada item. A mesma
// ordem que o rascunho usa ao montar a lista sozinho (`fotosEmOrdem`): produto a produto, a foto
// principal de cada um na frente, e a mesma foto nunca duas vezes.
function fotosDisponiveis(rascunho, contexto) {
  const itens = Array.isArray(rascunho.composicao?.itens) ? rascunho.composicao.itens : [];
  const vistas = new Set();
  const fotos = [];
  for (const produtoId of [rascunho.produtoId, ...itens.map((item) => item?.produtoId)].filter(Boolean)) {
    const produto = contexto.produtos[produtoId];
    const imagens = produto?.imagens ?? [];
    for (const imagem of [...imagens.filter((i) => i.principal), ...imagens.filter((i) => !i.principal)]) {
      if (vistas.has(imagem.id)) continue;
      vistas.add(imagem.id);
      fotos.push({ ...imagem, sku: produto.sku, titulo: produto.tituloBase });
    }
  }
  return fotos;
}

/**
 * Uma foto da lista. `posicao` e o lugar dela na ordem de envio (0 = capa), ou `null` quando
 * nao esta marcada. `foto` e `undefined` quando o rascunho guarda um id que o produto nao tem mais.
 */
function LinhaDeFoto({ id, foto, posicao, total, aoAlternar, aoMover }) {
  const marcada = posicao !== null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2.5">
      {/* O rotulo cobre a miniatura: clicar na foto tambem marca. */}
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={marcada}
          onChange={(evento) => aoAlternar(id, evento.target.checked)}
          aria-label={foto ? `Usar a foto de ${foto.sku}` : "Usar a foto"}
          className="h-4 w-4 shrink-0 accent-acento"
        />
        {foto ? (
          // URL externa vai por <img> simples (como a lista de Produtos): o next/image lanca excecao
          // quando o host nao esta em images.remotePatterns, e uma foto ruim nao pode derrubar a aba.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={foto.url}
            alt={foto.titulo}
            loading="lazy"
            className="h-14 w-14 shrink-0 rounded border border-borda bg-superficie object-contain"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded border border-borda bg-fundo text-suave">
            <ImageOff size={16} aria-hidden="true" />
          </span>
        )}
        <span className="min-w-0">
          {foto ? (
            <>
              <span className="font-mono font-medium">{foto.sku}</span>
              <span className="ml-2 truncate">{foto.titulo}</span>
            </>
          ) : (
            <span className="text-red-700">Foto nao encontrada: ela pode ter sido excluida. Desmarque para tirar do anuncio.</span>
          )}
        </span>
      </label>

      {marcada && (
        <div className="flex items-center gap-2">
          {posicao === 0 ? <Badge tom="info">Capa</Badge> : <span className="text-xs text-suave">Foto {posicao + 1}</span>}
          <div className="flex">
            <button type="button" onClick={() => aoMover(posicao, -1)} disabled={posicao === 0} aria-label="Subir foto" title="Subir" className={BOTAO_DA_LINHA}>
              <ChevronUp size={16} />
            </button>
            <button type="button" onClick={() => aoMover(posicao, 1)} disabled={posicao === total - 1} aria-label="Descer foto" title="Descer" className={BOTAO_DA_LINHA}>
              <ChevronDown size={16} />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Aba Imagens: as fotos que o anuncio envia, na ordem de envio (a primeira e a capa), e as demais
 * fotos disponiveis para marcar. O rascunho guarda so os ids, em ordem.
 */
export default function AbaImagens({ rascunho, contexto, alterar, problemas }) {
  const emKit = Boolean(rascunho.composicao);
  const disponiveis = fotosDisponiveis(rascunho, contexto);
  const porId = new Map(disponiveis.map((foto) => [foto.id, foto]));
  const marcadas = Array.isArray(rascunho.imagens) ? rascunho.imagens : [];
  const naoUsadas = disponiveis.filter((foto) => !marcadas.includes(foto.id));

  // Marcar poe a foto no fim da fila; desmarcar tira e as de baixo sobem.
  function alternar(id, marcada) {
    if (marcada) alterar({ imagens: marcadas.includes(id) ? marcadas : [...marcadas, id] });
    else alterar({ imagens: marcadas.filter((outra) => outra !== id) });
  }

  function mover(posicao, passo) {
    const destino = posicao + passo;
    if (destino < 0 || destino >= marcadas.length) return;
    const reordenadas = [...marcadas];
    [reordenadas[posicao], reordenadas[destino]] = [reordenadas[destino], reordenadas[posicao]];
    alterar({ imagens: reordenadas });
  }

  return (
    <div className="space-y-4">
      {emKit && (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{AVISO_DO_KIT}</div>
      )}

      <div>
        <div className="flex items-center gap-1 text-sm font-semibold">
          Fotos do anuncio ({marcadas.length})
          <BolhaDeAjuda
            variante="inline"
            texto="A ordem daqui e a ordem de envio: a primeira e a capa do anuncio. Use as setas para mudar."
          />
        </div>
        {marcadas.length > 0 ? (
          <ul className="mt-2 divide-y divide-borda rounded border border-borda">
            {marcadas.map((id, posicao) => (
              <LinhaDeFoto key={id} id={id} foto={porId.get(id)} posicao={posicao} total={marcadas.length} aoAlternar={alternar} aoMover={mover} />
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-suave">
            {disponiveis.length > 0 ? "Nenhuma foto marcada." : "Nenhuma foto cadastrada para este anuncio."}
          </p>
        )}
        <MensagensDoCampo problemas={problemas} campo="imagens" />
      </div>

      {naoUsadas.length > 0 && (
        <div>
          <p className="text-sm font-semibold">Fotos disponiveis</p>
          <ul className="mt-2 divide-y divide-borda rounded border border-borda">
            {naoUsadas.map((foto) => (
              <LinhaDeFoto key={foto.id} id={foto.id} foto={foto} posicao={null} total={marcadas.length} aoAlternar={alternar} aoMover={mover} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
