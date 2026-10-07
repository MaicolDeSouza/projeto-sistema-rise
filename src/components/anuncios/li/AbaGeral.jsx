"use client";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import MensagensDoCampo, { problemasDoCampo } from "@/components/anuncios/ml/MensagensDoCampo";
import Badge from "@/components/ui/Badge";
import { LIMITES_LI } from "@/lib/canaisDeVenda/li/esquema";

/**
 * Aba Geral do anuncio da Loja Integrada: o produto, o nome na loja, a marca (com as marcas que a
 * loja ja tem como sugestao: a escolhida e achada sem caixa e sem acento no envio, e so e criada se
 * nao houver nenhuma igual), destaque e video. As categorias tem aba propria (07/10/2026).
 *
 * O nome tambem decide o endereco do produto na loja (slug, aba SEO): mudar o nome muda a URL.
 * A lista de marcas e lida pelo editor ao abrir (`contexto.marcasDaLI`).
 */
export default function AbaGeral({ rascunho, contexto, alterar, problemas }) {
  const produto = contexto.produto;
  const primeiro = (campo) => problemasDoCampo(problemas, campo)[0]?.problema;
  const titulo = rascunho.titulo ?? "";
  const tamanho = titulo.trim().length;
  const erroDoTitulo = primeiro("titulo");

  return (
    <div className="space-y-4">
      <div className="rounded border border-borda bg-fundo p-3">
        <p className="text-xs text-suave">Produto</p>
        {produto ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <span className="font-mono font-medium">{produto.sku}</span>
            <span className="min-w-0 flex-1 truncate">{produto.tituloBase}</span>
            <Badge tom={produto.conferido ? "sucesso" : "erro"}>{produto.conferido ? "Conferido" : "Nao conferido"}</Badge>
          </div>
        ) : (
          <p className="mt-1 text-sm text-red-700">Produto nao encontrado. Ele pode ter sido excluido.</p>
        )}
        <MensagensDoCampo problemas={problemas} campo="produto" />
      </div>

      <Campo nome="li-titulo" rotulo="Nome na loja">
        <input
          id="li-titulo"
          value={titulo}
          maxLength={LIMITES_LI.titulo}
          onChange={(evento) => alterar({ titulo: evento.target.value })}
          className={`${CLASSE_CAMPO} ${bordaDoCampo(erroDoTitulo)}`}
        />
        <div className="mt-1 flex items-start gap-3">
          {erroDoTitulo && <p className="text-[11px] text-red-700">{erroDoTitulo}</p>}
          {!erroDoTitulo && <MensagensDoCampo problemas={problemas} campo="slug" />}
          <span className="ml-auto shrink-0 text-[11px] text-suave tabular-nums">
            {tamanho}/{LIMITES_LI.titulo}
          </span>
        </div>
      </Campo>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Campo
            nome="li-marca"
            rotulo="Marca"
            ajuda="Escolha uma marca que a loja ja tem; uma marca nova e criada na Loja Integrada no Sincronizar."
            value={rascunho.marca ?? ""}
            list="li-marcas-da-loja"
            onChange={(evento) => alterar({ marca: evento.target.value.toUpperCase() })}
          />
          <datalist id="li-marcas-da-loja">
            {(contexto.marcasDaLI ?? []).map((marca) => (
              <option key={marca.id} value={marca.nome.toUpperCase()} />
            ))}
          </datalist>
          <MensagensDoCampo problemas={problemas} campo="marca" />
        </div>
        <Campo
          nome="li-video"
          rotulo="Video (YouTube)"
          placeholder="https://www.youtube.com/watch?v=..."
          value={rascunho.videoUrl ?? ""}
          onChange={(evento) => alterar({ videoUrl: evento.target.value || null })}
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={Boolean(rascunho.destaque)}
          onChange={(evento) => alterar({ destaque: evento.target.checked })}
          className="h-4 w-4 accent-acento"
        />
        Produto em destaque na loja
      </label>
    </div>
  );
}
