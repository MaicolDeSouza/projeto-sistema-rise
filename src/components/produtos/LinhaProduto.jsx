"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { EllipsisVertical, ImageOff } from "lucide-react";

import Copiar from "@/components/ui/Copiar";

/**
 * Imagem do produto.
 *
 * Arquivo local passa pelo next/image (otimizacao e cache). URL externa vai por
 * <img> simples de proposito: o next/image LANCA EXCECAO quando o host nao esta
 * em images.remotePatterns, e uma unica URL invalida derrubaria a lista inteira.
 * Aqui, o pior caso e uma miniatura quebrada numa linha.
 */
function ehLocal(url) {
  return typeof url === "string" && url.startsWith("/api/arquivos/");
}

function Miniatura({ url, alt }) {
  if (!url) {
    return (
      <div className="flex h-11 w-11 items-center justify-center rounded border border-borda bg-fundo text-suave">
        <ImageOff size={16} />
      </div>
    );
  }

  return (
    <div className="relative h-11 w-11 overflow-hidden rounded border border-borda bg-superficie">
      {ehLocal(url) ? (
        <Image src={url} alt={alt} fill sizes="44px" className="object-contain" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}
    </div>
  );
}

export default function LinhaProduto({
  produto,
  integrados,
  pendentes,
  selecionado = false,
  aoAlternarSelecao,
}) {
  const [menuAberto, setMenuAberto] = useState(false);

  const moeda = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return (
    <tr
      className={`group divide-x divide-borda hover:bg-fundo/60 ${
        selecionado ? "bg-sky-50" : ""
      }`}
    >
      <td className="px-3 py-2.5 text-center">
        <input
          type="checkbox"
          checked={selecionado}
          onChange={aoAlternarSelecao}
          aria-label={`Selecionar ${produto.tituloBase}`}
          className="align-middle"
        />
      </td>
      <td className="px-3 py-2.5">
        <Miniatura url={produto.imagemUrl} alt={produto.tituloBase} />
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <Link
            href={`/produtos/${produto.id}`}
            className="min-w-0 font-medium hover:text-acento"
          >
            {produto.tituloBase}
          </Link>
          <Copiar texto={produto.tituloBase} rotulo="o nome" />
        </div>
        {!produto.ativo && (
          <span className="text-[11px] text-suave">inativo</span>
        )}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs">{produto.sku}</span>
          <Copiar texto={produto.sku} rotulo="o codigo" />
        </div>
      </td>

      <td className="px-3 py-2.5 text-suave">{produto.localizacao || "—"}</td>

      <td className="px-3 py-2.5 tabular-nums">
        {produto.precoVenda === null ? (
          "—"
        ) : (
          <span className="font-medium text-emerald-700">
            {moeda.format(produto.precoVenda)}
          </span>
        )}
      </td>

      <td
        className={`px-3 py-2.5 tabular-nums ${
          produto.estoque === 0 ? "font-medium text-red-700" : ""
        }`}
      >
        {produto.estoque}
      </td>

      {/* Canais integrados: cada canal aparece aqui OU no menu, nunca nos dois */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          {integrados.length === 0 ? (
            <span className="text-xs text-suave">—</span>
          ) : (
            integrados.map((canal) => (
              <Link
                key={canal.id}
                href={`/produtos/${produto.id}/canais/${canal.id.toLowerCase()}`}
                title={`${canal.nome} — ${canal.situacaoCanal === "ATIVA" ? "ativo" : canal.status.toLowerCase()}`}
                className="relative transition hover:scale-110"
              >
                <Image
                  src={canal.logo}
                  alt={canal.nome}
                  width={22}
                  height={22}
                  className="rounded"
                />
                {canal.status === "ERRO" && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-superficie" />
                )}
              </Link>
            ))
          )}
        </div>
      </td>

      <td className="relative px-3 py-2.5 text-right">
        {pendentes.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setMenuAberto((aberto) => !aberto)}
              aria-label="Acoes do produto"
              aria-expanded={menuAberto}
              className="rounded p-1 text-suave hover:bg-fundo hover:text-texto"
            >
              <EllipsisVertical size={16} />
            </button>

            {menuAberto && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuAberto(false)}
                  aria-hidden="true"
                />
                <div className="absolute top-full right-3 z-20 mt-1 w-64 rounded-md border border-borda bg-superficie py-1 text-left shadow-lg">
                  {pendentes.map((canal) => (
                    <button
                      key={canal.id}
                      type="button"
                      disabled
                      title={
                        canal.motivo ??
                        "Disponivel na proxima etapa, quando a publicacao for ligada"
                      }
                      className="flex w-full cursor-not-allowed items-start gap-2 px-3 py-2 text-sm opacity-60"
                    >
                      <Image
                        src={canal.logo}
                        alt=""
                        width={16}
                        height={16}
                        className="mt-0.5 shrink-0 rounded"
                      />
                      <span className="min-w-0">
                        <span className="block">
                          {canal.tentouEFalhou ? "Tentar de novo no" : "Cadastrar no"}{" "}
                          {canal.nome}
                        </span>
                        {canal.motivo && (
                          <span className="block text-[11px] text-suave">
                            {canal.motivo}
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                  <p className="mt-1 border-t border-borda px-3 pt-2 pb-1 text-[11px] text-suave">
                    A publicacao entra na proxima etapa.
                  </p>
                </div>
              </>
            )}
          </>
        )}
      </td>
    </tr>
  );
}
