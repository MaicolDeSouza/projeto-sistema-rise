"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Copy, EllipsisVertical, ImageOff, Trash2 } from "lucide-react";

import { CANAIS } from "@/lib/canais";
import JanelaAnuncioML from "@/components/anuncios/ml/JanelaAnuncioML";
import JanelaAnuncioLI from "@/components/anuncios/li/JanelaAnuncioLI";
import { rotuloDoIconeML } from "@/lib/canaisDeVenda/ml/icone";
import Copiar from "@/components/ui/Copiar";
import ConferidoProduto from "./ConferidoProduto";
import { CelulaEditavel, PopupEstoque, PopupLocalizacao, PopupPreco } from "./EdicaoRapida";
import IconeBling from "./IconeBling";
import JanelaBling from "./JanelaBling";
import IconeLojaIntegrada from "./IconeLojaIntegrada";

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
  // Abre a confirmacao de exclusao deste produto (o popup mora na tabela).
  aoExcluir,
  iconeML = { publicado: false, rascunho: false },
  // Cor e selo do icone do Bling, calculados no servidor (`page.jsx`: a assinatura usa node:crypto).
  iconeBling = ICONE_BLING_PADRAO,
  // Cor e selo do icone da Loja Integrada, tambem do servidor (`iconeLIDoProduto`).
  iconeLI = { cor: "cinza", divergente: false, conferido: false },
  // Busca ampla (09/10/2026): "achado na descrição" quando a palavra nao estava no nome nem no codigo.
  achado = null,
  // Produto recem-criado: fundo verde claro que some sozinho (pedido do dono em 10/10/2026). So CSS, sem estado.
  destacada = false,
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  const [janelaML, setJanelaML] = useState(false);
  const [janelaBling, setJanelaBling] = useState(false);
  const [janelaLI, setJanelaLI] = useState(false);
  // Qual popup de edicao rapida esta aberto: "localizacao", "preco" ou "estoque".
  const [editando, setEditando] = useState(null);
  const fecharEdicao = () => setEditando(null);
  // Cor e ponto sozinhos nao dizem o estado: o mesmo texto vai no nome acessivel e na dica.
  const rotuloML = rotuloDoIconeML(iconeML);

  const moeda = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  return (
    <tr
      className="group divide-x divide-borda hover:bg-fundo/60"
      style={destacada ? { animation: "riseLinhaNova 6s ease-out" } : undefined}
    >
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
        {achado && (
          <span className="mt-1 block w-fit rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
            {achado}
          </span>
        )}
      </td>

      <td className="px-3 py-2.5 text-center">
        <div className="flex items-center gap-1">
          <ConferidoProduto produto={produto} />
          {/* O "!" do kit (pedido do dono em 10/10/2026): uma peca mudou desde o ultimo Salvar do kit. */}
          {produto.pecasAlteradas > 0 && (
            <span
              title={`${produto.pecasAlteradas === 1 ? "Uma peça do kit mudou" : `${produto.pecasAlteradas} peças do kit mudaram`} desde o último Salvar. Abra o kit para ver o que mudou.`}
              aria-label={`${produto.pecasAlteradas} peça(s) do kit mudaram desde o último Salvar`}
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white"
            >
              !
            </span>
          )}
        </div>
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs">{produto.sku}</span>
          <Copiar texto={produto.sku} rotulo="o código" />
        </div>
      </td>

      {/* Localizacao, preco e estoque abrem a edicao rapida (pedido do dono em
          30/09/2026): um popup por campo, gravando so neste sistema. */}
      <td className="px-3 py-2.5 text-suave">
        {/* Kit de uma peca: a localizacao e a da peca e muda junto com ela (pedido do dono em 10/10/2026). */}
        {produto.kitDeUmaPeca ? (
          <span title="Localização do kit: a da peça dele. Mude a localização da peça.">
            {produto.localizacao || "—"}
            <span className="block text-[10px] leading-tight">da peça do kit</span>
          </span>
        ) : (
          <CelulaEditavel titulo="Editar localização" aoClicar={() => setEditando("localizacao")}>
            {produto.localizacao || "—"}
          </CelulaEditavel>
        )}
      </td>

      <td className="px-3 py-2.5 tabular-nums">
        <CelulaEditavel titulo="Editar preço de venda" aoClicar={() => setEditando("preco")}>
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
        {/* Kit: o estoque e calculado pelas pecas (o menor de estoque da peca / quantidade), e um
            ajuste direto seria desfeito no proximo recalculo; a celula so mostra o numero. */}
        {produto.tipo === "COMPOSICAO" ? (
          <span title="Estoque de kit: calculado pelas peças. Ajuste o estoque das peças.">
            {produto.estoque}
            <span className="block text-[10px] font-normal leading-tight text-suave">calculado pelas peças</span>
          </span>
        ) : (
          <CelulaEditavel titulo="Ajustar estoque" aoClicar={() => setEditando("estoque")}>
            {produto.estoque}
          </CelulaEditavel>
        )}
      </td>

      {/* O Mercado Livre e o Bling refletem o estado real e sao botoes (o ML abre o anuncio em
          pop-up; o Bling, a janela da sincronizacao). A Loja Integrada tambem
          (icone com selo e pop-up de diferencas). Provisorio, a pedido do dono: a Shopee segue em preto fosco, sem ligar ao estado de integracao (a
          situacao real deles volta aqui depois). */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          {CANAIS.map((canal) =>
            canal.id === "BLING" ? (
              <IconeBling key={canal.id} iconeBling={iconeBling} aoClicar={() => setJanelaBling(true)} />
            ) : canal.id === "LOJA_INTEGRADA" ? (
              <IconeLojaIntegrada key={canal.id} iconeLI={iconeLI} aoClicar={() => setJanelaLI(true)} />
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
        {janelaBling && <JanelaBling produto={produto} aoFechar={() => setJanelaBling(false)} />}
        {/* O pop-up de diferencas virou a aba Divergencias do editor (07/10/2026): o icone abre o editor. */}
        {janelaLI && <JanelaAnuncioLI produtoId={produto.id} aoFechar={() => setJanelaLI(false)} />}

        {/* Acoes do produto (pedido do dono em 09/10/2026): so Clonar e Excluir. Os "Cadastrar no
            Bling/LI/ML/Shopee" desabilitados que moravam aqui sairam; cada canal tem o proprio icone. */}
        <button
          type="button"
          onClick={() => setMenuAberto((aberto) => !aberto)}
          aria-label="Ações do produto"
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
            <div className="absolute top-full right-3 z-20 mt-1 w-44 rounded-md border border-borda bg-superficie py-1 text-left shadow-lg">
              <Link
                href={`/produtos/novo?clonar=${produto.id}`}
                onClick={() => setMenuAberto(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-fundo"
              >
                <Copy size={15} className="shrink-0" />
                Clonar
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuAberto(false);
                  aoExcluir();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
              >
                <Trash2 size={15} className="shrink-0" />
                Excluir
              </button>
            </div>
          </>
        )}
      </td>
    </tr>
  );
}
