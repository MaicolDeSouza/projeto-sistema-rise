"use client";

import { ImageOff } from "lucide-react";

import { LinhaDeFoto } from "@/components/anuncios/ml/AbaImagens";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";

/**
 * Aba Imagens do anúncio da Loja Integrada (pedido do dono em 07/10/2026): escolher e ordenar as fotos do
 * produto que vão para a loja (a primeira é a capa). O ENVIO das fotos espera a VPS: a LI só aceita imagem
 * por endereço público, e hoje as fotos moram no PC. A escolha já fica guardada no anúncio
 * (`rascunho.imagens`, ids de ProdutoArquivo) e não entra na assinatura nem no Sincronizar até lá.
 *
 * As fotos são as validadas do cadastro (`contexto.fotos`, sem a reserva). A linha é a mesma da aba
 * Imagens do Mercado Livre.
 */
export default function AbaImagens({ rascunho, contexto, alterar }) {
  const produto = contexto.produto ?? {};
  const disponiveis = (contexto.fotos ?? []).map((foto) => ({ ...foto, sku: produto.sku, titulo: produto.tituloBase }));
  const porId = new Map(disponiveis.map((foto) => [foto.id, foto]));
  const marcadas = Array.isArray(rascunho.imagens) ? rascunho.imagens : [];
  const naoUsadas = disponiveis.filter((foto) => !marcadas.includes(foto.id));

  // Marcar põe a foto no fim da fila; desmarcar tira e as de baixo sobem.
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
      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <p className="font-medium">O envio das fotos à Loja Integrada fica para quando o Rise estiver na VPS.</p>
        <p className="mt-0.5 text-xs">
          A loja só aceita imagem por endereço público, e hoje as fotos estão neste computador. A escolha e a ordem daqui já ficam guardadas no anúncio. As
          fotos da loja continuam as que estão lá.
        </p>
      </div>

      <div>
        <div className="flex items-center gap-1 text-sm font-semibold">
          Fotos do anúncio ({marcadas.length})
          <BolhaDeAjuda
            variante="inline"
            texto="A ordem daqui é a ordem de envio: a primeira é a capa. A Loja Integrada recomenda JPG de até 4 MB e 2500x2500 px, com nome de arquivo sem acento; as fotos do Rise (1024x1024, JPG) já atendem."
          />
        </div>
        {marcadas.length > 0 ? (
          <ul className="mt-2 divide-y divide-borda rounded border border-borda">
            {marcadas.map((id, posicao) => (
              <LinhaDeFoto key={id} id={id} foto={porId.get(id)} posicao={posicao} total={marcadas.length} aoAlternar={alternar} aoMover={mover} />
            ))}
          </ul>
        ) : disponiveis.length > 0 ? (
          <p className="mt-2 text-sm text-suave">Nenhuma foto marcada. Marque abaixo as que vão para a loja.</p>
        ) : (
          <p className="mt-2 flex items-center gap-2 rounded border border-borda bg-fundo px-3 py-2 text-sm text-suave">
            <ImageOff size={16} className="shrink-0" />
            O produto não tem foto validada. Envie e valide as fotos no cadastro do produto.
          </p>
        )}
      </div>

      {naoUsadas.length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">Fotos do produto fora do anúncio ({naoUsadas.length})</p>
            <button
              type="button"
              onClick={() => alterar({ imagens: [...marcadas, ...naoUsadas.map((foto) => foto.id)] })}
              className="text-xs text-acento hover:underline"
            >
              Marcar todas
            </button>
          </div>
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
