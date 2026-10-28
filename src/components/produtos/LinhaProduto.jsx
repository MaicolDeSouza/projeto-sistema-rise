"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Copy, EllipsisVertical, ImageOff, Trash2 } from "lucide-react";

import { CANAIS } from "@/lib/canais";
import JanelaAnuncioML from "@/components/anuncios/ml/JanelaAnuncioML";
import JanelaAnuncioLI from "@/components/anuncios/li/JanelaAnuncioLI";
import { rotuloDoIconeML } from "@/lib/canaisDeVenda/ml/icone";
import Copiar from "@/components/ui/Copiar";
import FotoComLupa from "@/components/ui/FotoComLupa";
import ConferidoProduto from "./ConferidoProduto";
import { CelulaEditavel, PopupEstoque, PopupLocalizacao, PopupPecasDoKit, PopupPreco } from "./EdicaoRapida";
import IconeBling from "./IconeBling";
import JanelaBling from "./JanelaBling";
import IconeLojaIntegrada from "./IconeLojaIntegrada";
import JanelaShopee from "./JanelaShopee";
import MarcaNaoAnunciar from "./MarcaNaoAnunciar";
import { naoAnunciaEm } from "@/lib/canaisDeVenda/naoAnunciar";

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

  // Lupa ao passar o mouse e foto grande ao clicar: o padrao do Rise (`FotoComLupa`).
  return (
    <FotoComLupa src={url} alt={alt}>
      {ehLocal(url) ? (
        <Image src={url} alt="" fill sizes="44px" className="object-contain" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-contain" />
      )}
    </FotoComLupa>
  );
}

export default function LinhaProduto({
  produto,
  // Abre a confirmacao de exclusao deste produto (o popup mora na tabela).
  aoExcluir,
  iconeML = { publicado: false, erro: false },
  // Cor e selo do icone do Bling, calculados no servidor (`page.jsx`: a assinatura usa node:crypto).
  iconeBling = ICONE_BLING_PADRAO,
  // Cor e selo do icone da Loja Integrada, tambem do servidor (`iconeLIDoProduto`).
  iconeLI = { cor: "cinza", divergente: false, conferido: false },
  // "Bling 5 · Rise 5 · ML 3 · LI 5" (25/10/2026): a dica da coluna Estoque; nulo sem numero dos canais.
  estoquesNosCanais = null,
  // Busca ampla (09/10/2026): "achado na descrição" quando a palavra nao estava no nome nem no codigo.
  achado = null,
  // Produto recem-criado: fundo verde claro que some sozinho (pedido do dono em 10/10/2026). So CSS, sem estado.
  destacada = false,
  // Acessos (lancamento 2): sem editar, as celulas nao abrem a edicao rapida; sem o dado, a Localizacao nem aparece.
  acessos = { editar: true, excluir: true, clonar: true, verLocalizacao: true, editarLocalizacao: true, estoqueExato: true, margem: true },
}) {
  const [menuAberto, setMenuAberto] = useState(false);
  // Onde o menu dos 3 pontinhos abre (pedido do dono em 28/10/2026): `fixed`, calculado do botao na hora do clique, para
  // nao aumentar a rolagem da tabela (a ultima linha ganhava uma barra de rolagem) e abrir PARA CIMA quando nao cabe embaixo.
  const [posicaoDoMenu, setPosicaoDoMenu] = useState(null);

  // Fixo na tela, o menu nao acompanha a rolagem: rolar ou redimensionar o fecha.
  useEffect(() => {
    if (!menuAberto) return undefined;
    const fechar = () => setMenuAberto(false);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
    };
  }, [menuAberto]);

  function alternarMenu(evento) {
    if (menuAberto) {
      setMenuAberto(false);
      return;
    }
    const caixa = evento.currentTarget.getBoundingClientRect();
    // Altura do menu: o padding, mais ~36 px por item (Clonar e/ou Excluir) e a margem do botao.
    const itens = (acessos.clonar ? 1 : 0) + (acessos.excluir ? 1 : 0);
    const altura = 8 + itens * 36 + 8;
    const paraCima = window.innerHeight - caixa.bottom < altura + 8 && caixa.top > altura;
    setPosicaoDoMenu({
      // `clientWidth` e a largura SEM a barra de rolagem: com `innerWidth` o menu saia 15 px para a esquerda do botao.
      direita: Math.max(8, document.documentElement.clientWidth - caixa.right),
      ...(paraCima ? { bottom: window.innerHeight - caixa.top + 4 } : { top: caixa.bottom + 4 }),
    });
    setMenuAberto(true);
  }
  const [janelaML, setJanelaML] = useState(false);
  const [janelaBling, setJanelaBling] = useState(false);
  const [janelaLI, setJanelaLI] = useState(false);
  const [janelaShopee, setJanelaShopee] = useState(false);
  // "Não anunciar" neste canal (27/10/2026): o X vermelho no icone; o botao que liga e desliga mora no popup do canal.
  const naoML = naoAnunciaEm(produto.naoAnunciarEm, "MERCADO_LIVRE");
  const naoLI = naoAnunciaEm(produto.naoAnunciarEm, "LOJA_INTEGRADA");
  const naoShopee = naoAnunciaEm(produto.naoAnunciarEm, "SHOPEE");
  // Produto inativo (pedido do dono em 28/10/2026): o X vermelho em TODOS os icones da coluna Canais, e o texto
  // "INATIVO" maior embaixo do nome. Nao mexe na marca "Não anunciar" de cada canal (as janelas continuam lendo naoML/naoLI).
  const inativo = !produto.ativo;
  const sufixoInativo = inativo ? " (produto inativo)" : "";
  // Qual popup de edicao rapida esta aberto: "localizacao", "preco" ou "estoque".
  const [editando, setEditando] = useState(null);
  const fecharEdicao = () => setEditando(null);
  // Cor e ponto sozinhos nao dizem o estado: o mesmo texto vai no nome acessivel e na dica.
  const rotuloML = `${naoML ? "Mercado Livre: marcado para não anunciar" : iconeML.proposta ? "Mercado Livre: Proposta pronta, aguardando aprovação" : rotuloDoIconeML(iconeML)}${sufixoInativo}`;

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
          <span className="mt-0.5 inline-block rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold tracking-wide text-red-700">INATIVO</span>
        )}
        {achado && (
          <span className="mt-1 block w-fit rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
            {achado}
          </span>
        )}
      </td>

      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs">{produto.sku}</span>
          <Copiar texto={produto.sku} rotulo="o código" />
        </div>
      </td>

      {/* Localizacao, preco e estoque abrem a edicao rapida (pedido do dono em
          30/09/2026): um popup por campo, gravando so neste sistema. */}
      {acessos.verLocalizacao && (
      <td className={`px-3 py-2.5 text-suave ${produto.tipo === "COMPOSICAO" ? "max-w-44" : ""}`}>
        {/* KIT (pedido do dono em 10/10/2026): a localizacao e automatica (a das pecas), entao a celula NAO tem o
            lapis. Fica numa linha so, sem expandir a coluna (reticencias se nao couber), e clicar abre o popup com
            cada peca e o lugar dela. */}
        {produto.tipo === "COMPOSICAO" ? (
          <button
            type="button"
            onClick={() => setEditando("pecasDoKit")}
            title={`${produto.localizacao || "Sem localização"} — clique para ver as peças e as localizações`}
            aria-label="Ver as peças do kit e as localizações"
            className="-mx-1 block w-[calc(100%+0.5rem)] truncate rounded px-1 py-0.5 text-left hover:bg-sky-50 focus-visible:bg-sky-50"
          >
            {produto.localizacao || "—"}
          </button>
        ) : acessos.editarLocalizacao ? (
          <CelulaEditavel titulo="Editar localização" aoClicar={() => setEditando("localizacao")}>
            {produto.localizacao || "—"}
          </CelulaEditavel>
        ) : (
          produto.localizacao || "—"
        )}
      </td>
      )}

      <td className="px-3 py-2.5 tabular-nums">
        {acessos.editar ? (
          <CelulaEditavel titulo="Editar preço de venda" aoClicar={() => setEditando("preco")}>
            {produto.precoVenda === null ? "—" : <span className="font-medium text-emerald-700">{moeda.format(produto.precoVenda)}</span>}
          </CelulaEditavel>
        ) : produto.precoVenda === null ? (
          "—"
        ) : (
          <span className="font-medium text-emerald-700">{moeda.format(produto.precoVenda)}</span>
        )}
      </td>

      <td
        title={estoquesNosCanais ?? undefined}
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
        ) : acessos.editar && acessos.estoqueExato ? (
          <CelulaEditavel titulo="Ajustar estoque" aoClicar={() => setEditando("estoque")}>
            {produto.estoque}
          </CelulaEditavel>
        ) : (
          produto.estoque
        )}
      </td>

      {/* O Mercado Livre e o Bling refletem o estado real e sao botoes (o ML abre o anuncio em
          pop-up; o Bling, a janela da sincronizacao). A Loja Integrada tambem
          (icone com selo e pop-up de diferencas). Provisorio, a pedido do dono: a Shopee segue em preto fosco, sem ligar ao estado de integracao (a
          situacao real deles volta aqui depois). */}
      {/* O icone "Rise" (Conferido, com o "!" do kit) abre a fila, a esquerda do Bling; o menu ⋮ fecha
          a linha na mesma celula (pedido do dono em 12/10/2026: a coluna Conf. e a coluna vazia ao lado
          de Canais sairam). */}
      <td className="relative px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <ConferidoProduto produto={produto} />
          {CANAIS.map((canal) =>
            canal.id === "BLING" ? (
              <IconeBling key={canal.id} iconeBling={iconeBling} inativo={inativo} aoClicar={() => setJanelaBling(true)} />
            ) : canal.id === "LOJA_INTEGRADA" ? (
              <IconeLojaIntegrada key={canal.id} iconeLI={iconeLI} naoAnunciar={naoLI} inativo={inativo} aoClicar={() => setJanelaLI(true)} />
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
                  className={`rounded ${iconeML.publicado && !naoML ? "" : "opacity-70 brightness-50 grayscale"}`}
                />
                {(naoML || inativo) && <MarcaNaoAnunciar />}
                {iconeML.proposta && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 -left-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[9px] leading-none font-bold text-amber-950 ring-2 ring-superficie"
                  >
                    P
                  </span>
                )}
                {/* O mesmo selo "!" dos outros icones: erro na publicacao, ou anuncio publicado que ficou para tras do
                    produto (descricao, fotos, peso e medidas; spec 2026-10-24). */}
                {(iconeML.erro || iconeML.desatualizado || iconeML.precisaAgirNoML || iconeML.estoqueDivergenteNoML || iconeML.catalogoMudouNoML) && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[10px] leading-none font-bold text-amber-950 ring-2 ring-superficie"
                  >
                    !
                  </span>
                )}
                {/* "C" (pedido do dono em 26/10/2026; era "C2", com a quantidade): algum anuncio publicado concorre num
                    catalogo do ML. Quantos sao fica no texto do icone ("em 2 catalogos"). A mudanca (entrou, saiu, trocou)
                    acende o "!" acima, ate o dono marcar como revisado. */}
                {iconeML.catalogos > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1.5 -bottom-1.5 rounded-full bg-sky-700 px-1 text-[9px] leading-[13px] font-bold text-white ring-2 ring-superficie"
                  >
                    C
                  </span>
                )}
              </button>
            ) : canal.id === "SHOPEE" && acessos.editar ? (
              // A Shopee nao tem integracao: o icone abre um popup so com o "Não anunciar na Shopee" (27/10/2026).
              <button
                key={canal.id}
                type="button"
                onClick={() => setJanelaShopee(true)}
                title={`${naoShopee ? "Shopee: marcado para não anunciar" : canal.nome}${sufixoInativo}`}
                aria-label={`${naoShopee ? "Shopee: marcado para não anunciar" : canal.nome}${sufixoInativo}`}
                className="relative shrink-0 rounded hover:ring-2 hover:ring-sky-200 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
              >
                <Image src={canal.logo} alt="" width={22} height={22} className="rounded opacity-70 brightness-50 grayscale" />
                {(naoShopee || inativo) && <MarcaNaoAnunciar />}
              </button>
            ) : (
              <span key={canal.id} className="relative shrink-0" title={`${naoAnunciaEm(produto.naoAnunciarEm, canal.id) ? `${canal.nome}: marcado para não anunciar` : canal.nome}${sufixoInativo}`}>
                <Image
                  src={canal.logo}
                  alt={canal.nome}
                  width={22}
                  height={22}
                  className="rounded opacity-70 brightness-50 grayscale"
                />
                {(naoAnunciaEm(produto.naoAnunciarEm, canal.id) || inativo) && <MarcaNaoAnunciar />}
              </span>
            ),
          )}

          {(acessos.clonar || acessos.excluir) && (
          <button
            type="button"
            onClick={alternarMenu}
            aria-label="Ações do produto"
            aria-expanded={menuAberto}
            className="ml-auto rounded p-1 text-suave hover:bg-fundo hover:text-texto"
          >
            <EllipsisVertical size={16} />
          </button>
          )}
        </div>

        {editando === "localizacao" && <PopupLocalizacao produto={produto} aoFechar={fecharEdicao} />}
        {editando === "pecasDoKit" && <PopupPecasDoKit produto={produto} aoFechar={fecharEdicao} />}
        {editando === "preco" && <PopupPreco produto={produto} aoFechar={fecharEdicao} />}
        {editando === "estoque" && <PopupEstoque produto={produto} aoFechar={fecharEdicao} />}
        {/* Com anuncio ja publicado no ML o "Nao anunciar no ML" nao tem efeito (pedido do dono em 28/10/2026): some, e so
            fica o "Voltar a anunciar" se o produto ainda estiver marcado. */}
        {janelaML && <JanelaAnuncioML produtoId={produto.id} naoAnunciar={acessos.editar && (naoML || !iconeML.publicado) ? naoML : undefined} aoFechar={() => setJanelaML(false)} />}
        {janelaBling && <JanelaBling produto={produto} aoFechar={() => setJanelaBling(false)} />}
        {/* O pop-up de diferencas virou a aba Divergencias do editor (07/10/2026): o icone abre o editor. */}
        {janelaLI && <JanelaAnuncioLI produtoId={produto.id} naoAnunciar={acessos.editar ? naoLI : undefined} aoFechar={() => setJanelaLI(false)} />}
        {janelaShopee && <JanelaShopee produto={produto} marcado={naoShopee} aoFechar={() => setJanelaShopee(false)} />}

        {/* Acoes do produto (pedido do dono em 09/10/2026): so Clonar e Excluir. Os "Cadastrar no
            Bling/LI/ML/Shopee" desabilitados que moravam aqui sairam; cada canal tem o proprio icone. */}
        {menuAberto && posicaoDoMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuAberto(false)}
              aria-hidden="true"
            />
            <div
              style={{ right: posicaoDoMenu.direita, top: posicaoDoMenu.top, bottom: posicaoDoMenu.bottom }}
              className="fixed z-20 w-44 rounded-md border border-borda bg-superficie py-1 text-left shadow-lg"
            >
              {acessos.clonar && (
              <Link
                href={`/produtos/novo?clonar=${produto.id}`}
                onClick={() => setMenuAberto(false)}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-fundo"
              >
                <Copy size={15} className="shrink-0" />
                Clonar
              </Link>
              )}
              {acessos.excluir && (
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
              )}
            </div>
          </>
        )}
      </td>
    </tr>
  );
}
