"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { EllipsisVertical, ImageOff } from "lucide-react";

import { CANAIS } from "@/lib/canais";
import JanelaAnuncioML from "@/components/anuncios/ml/JanelaAnuncioML";
import { rotuloDoIconeML } from "@/lib/canaisDeVenda/ml/icone";
import Copiar from "@/components/ui/Copiar";
import ConferidoProduto from "./ConferidoProduto";
import { CelulaEditavel, PopupEstoque, PopupLocalizacao, PopupPreco } from "./EdicaoRapida";
import IconeBling from "./IconeBling";

/// O produto sem estado conhecido do Bling: cinza, sem selo (nunca sincronizado e sem pendencia).
const ICONE_BLING_PADRAO = { cor: "cinza", divergente: false, motivos: [] };

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
  pendentes,
  iconeML = { publicado: false, rascunho: false },
  selecionado = false,
  aoAlternarSelecao,
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [janelaML, setJanelaML] = useState(false);
  // O valor so e lido na Tarefa 11, que renderiza a janela do Bling (`abrirJanelaBling`); por ora o
  // clique no icone so guarda o estado.
  const [, setJanelaBling] = useState(false);
  // Qual popup de edicao rapida esta aberto: "localizacao", "preco" ou "estoque".
  const [editando, setEditando] = useState(null);
  const fecharEdicao = () => setEditando(null);
  // Cor e ponto sozinhos nao dizem o estado: o mesmo texto vai no nome acessivel e na dica.
  const rotuloML = rotuloDoIconeML(iconeML);
  // Calculado no servidor (`page.jsx`) e entregue dentro do produto, que e o que `TabelaProdutos`
  // repassa a linha.
  const iconeBling = produto.iconeBling ?? ICONE_BLING_PADRAO;

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

      <td className="px-3 py-2.5 text-center">
        <ConferidoProduto produto={produto} />
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs">{produto.sku}</span>
          <Copiar texto={produto.sku} rotulo="o codigo" />
        </div>
      </td>

      {/* Localizacao, preco e estoque abrem a edicao rapida (pedido do dono em
          30/09/2026): um popup por campo, gravando so neste sistema. */}
      <td className="px-3 py-2.5 text-suave">
        <CelulaEditavel titulo="Editar localizacao" aoClicar={() => setEditando("localizacao")}>
          {produto.localizacao || "—"}
        </CelulaEditavel>
      </td>

      <td className="px-3 py-2.5 tabular-nums">
        <CelulaEditavel titulo="Editar preco de venda" aoClicar={() => setEditando("preco")}>
          {produto.precoVenda === null ? (
            "—"
          ) : (
            <span className="font-medium text-emerald-700">
              {moeda.format(produto.precoVenda)}
            </span>
          )}
        </CelulaEditavel>
      </td>

      <td
        className={`px-3 py-2.5 tabular-nums ${
          produto.estoque === 0 ? "font-medium text-red-700" : ""
        }`}
      >
        <CelulaEditavel titulo="Ajustar estoque" aoClicar={() => setEditando("estoque")}>
          {produto.estoque}
        </CelulaEditavel>
      </td>

      {/* O Mercado Livre e o Bling refletem o estado real e sao botoes (o ML abre o anuncio em
          pop-up; o Bling, a janela da sincronizacao). Provisorio, a pedido do dono: Loja
          Integrada e Shopee seguem em preto fosco, sem ligar ao estado de integracao (a
          situacao real deles volta aqui depois). */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          {CANAIS.map((canal) =>
            canal.id === "BLING" ? (
              <IconeBling key={canal.id} iconeBling={iconeBling} aoClicar={() => setJanelaBling(true)} />
            ) : canal.id === "MERCADO_LIVRE" ? (
              <button
                key={canal.id}
                type="button"
                onClick={() => setJanelaML(true)}
                title={rotuloML}
                aria-label={rotuloML}
                className="relative shrink-0 rounded hover:ring-2 hover:ring-sky-200 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
              >
                {/* Colorido so com anuncio publicado e ativo; o ponto ambar avisa que algum
                    anuncio do produto ainda pede atencao (rascunho, erro, pausado...). */}
                <Image
                  src={canal.logo}
                  alt=""
                  width={22}
                  height={22}
                  className={`rounded ${iconeML.publicado ? "" : "opacity-70 brightness-50 grayscale"}`}
                />
                {iconeML.rascunho && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-superficie"
                  />
                )}
              </button>
            ) : (
              <Image
                key={canal.id}
                src={canal.logo}
                alt={canal.nome}
                title={canal.nome}
                width={22}
                height={22}
                className="shrink-0 rounded opacity-70 brightness-50 grayscale"
              />
            ),
          )}
        </div>
      </td>

      <td className="relative px-3 py-2.5 text-right">
        {editando === "localizacao" && <PopupLocalizacao produto={produto} aoFechar={fecharEdicao} />}
        {editando === "preco" && <PopupPreco produto={produto} aoFechar={fecharEdicao} />}
        {editando === "estoque" && <PopupEstoque produto={produto} aoFechar={fecharEdicao} />}
        {janelaML && <JanelaAnuncioML produtoId={produto.id} aoFechar={() => setJanelaML(false)} />}

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
