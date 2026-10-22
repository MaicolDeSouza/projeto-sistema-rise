"use client";

import { ImageOff } from "lucide-react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import FotoComLupa from "@/components/ui/FotoComLupa";

/**
 * Aba Imagens do anúncio da Loja Integrada. Desde 21/10/2026 (pedido do dono: "todas as fotos sempre vão para a
 * LI") não há escolha: vão TODAS as fotos validadas do produto, na ordem do cadastro, a principal como capa
 * (`contexto.fotos`, sem a reserva). O Sincronizar troca as da loja por elas (`li/fotos.js`). A LI só aceita
 * imagem por endereço público: sem APP_URL_PUBLICA (o Rise do PC) as fotos não vão.
 */
export default function AbaImagens({ contexto }) {
  const produto = contexto.produto ?? {};
  const fotos = contexto.fotos ?? [];

  return (
    <div className="space-y-4">
      {!contexto.urlPublica && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Este Rise não tem endereço público: as fotos só vão para a loja pelo Sincronizar da VPS.
        </p>
      )}

      <div>
        <div className="flex items-center gap-1 text-sm font-semibold">
          Fotos que vão para a loja ({fotos.length})
          <BolhaDeAjuda
            variante="inline"
            texto="Vão todas as fotos validadas do produto, na ordem do cadastro: a primeira é a capa. Para mudar, edite as fotos no cadastro do produto. O Sincronizar troca as fotos da loja por estas."
          />
        </div>
        {fotos.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-3">
            {fotos.map((foto, posicao) => (
              <li key={foto.id} className="flex flex-col items-center gap-1">
                <FotoComLupa src={foto.url} alt={`${produto.sku ?? ""} foto ${posicao + 1}`} className="h-20 w-20" />
                <span className={`text-[11px] ${posicao === 0 ? "rounded-full bg-sky-100 px-2 text-sky-800" : "text-suave"}`}>
                  {posicao === 0 ? "Capa" : posicao + 1}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 flex items-center gap-2 rounded border border-borda bg-fundo px-3 py-2 text-sm text-suave">
            <ImageOff size={16} className="shrink-0" />
            O produto não tem foto validada: as fotos da loja ficam como estão. Envie e valide as fotos no cadastro do produto.
          </p>
        )}
      </div>
    </div>
  );
}
