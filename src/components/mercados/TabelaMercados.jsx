"use client";

import { useState, useTransition } from "react";
import { ExternalLink, ImageOff, Loader, PackageX, TrendingDown, TrendingUp } from "lucide-react";

import Badge from "@/components/ui/Badge";
import { detalhePagina } from "@/app/mercados/acoes";

const MOEDA = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function comoMoeda(valor) {
  return valor === null || valor === undefined ? "—" : MOEDA.format(valor);
}

function comoData(valor) {
  if (!valor) return "—";
  return new Date(valor).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

/**
 * Imagem da pagina do concorrente.
 *
 * SEMPRE <img>, nunca next/image: a imagem vem de host externo arbitrario, e o
 * next/image LANCA EXCECAO quando o host nao esta em images.remotePatterns —
 * uma URL de loja desconhecida derrubaria a tela inteira. Mesma razao do
 * ehLocal em LinhaProduto.jsx.
 */
function Imagem({ url, alt }) {
  if (!url) {
    return (
      <div className="flex h-24 w-24 items-center justify-center rounded border border-borda bg-fundo text-suave">
        <ImageOff size={20} />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt ?? ""}
      className="h-24 w-24 rounded border border-borda bg-superficie object-contain"
    />
  );
}

function VariacaoPreco({ atual, anterior }) {
  if (atual === null || anterior === null || atual === anterior) return null;

  const caiu = atual < anterior;
  const Icone = caiu ? TrendingDown : TrendingUp;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs ${
        caiu ? "text-emerald-700" : "text-red-700"
      }`}
    >
      <Icone size={13} />
      antes {comoMoeda(anterior)}
    </span>
  );
}

/**
 * Painel de detalhe, aberto ABAIXO da tabela.
 *
 * A descricao e renderizada como TEXTO — nunca por dangerouslySetInnerHTML. E
 * HTML de terceiro: renderizar cru transformaria uma pagina de concorrente
 * comprometida em execucao de script dentro do sistema. Como filho de um
 * elemento React, o texto e escapado sozinho.
 */
function Detalhe({ dados, carregando }) {
  if (carregando) {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-borda bg-superficie px-5 py-8 text-sm text-suave">
        <Loader size={15} className="animate-spin" />
        Carregando os dados da pagina...
      </div>
    );
  }

  if (!dados) return null;

  const identificadores = [
    dados.mpn && ["Codigo do fabricante", dados.mpn],
    dados.skuFonte && ["Codigo na loja", dados.skuFonte],
    dados.ean && ["EAN", dados.ean],
    dados.marca && ["Marca", dados.marca],
    dados.modelo && ["Modelo", dados.modelo],
  ].filter(Boolean);

  return (
    <div className="mt-4 rounded-lg border border-borda bg-superficie p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge tom={dados.fonte.tipo === "FORNECEDOR" ? "info" : "neutro"}>
              {dados.fonte.tipo === "FORNECEDOR" ? "Fornecedor" : "Concorrente"}
            </Badge>
            <span className="text-sm text-suave">{dados.fonte.nome}</span>
            {!dados.disponivel && <Badge tom="alerta">Fora do ar</Badge>}
          </div>
          <h2 className="text-lg font-semibold">{dados.titulo ?? "Sem titulo"}</h2>
        </div>

        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums">
            {comoMoeda(dados.precoAtual)}
          </p>
          <VariacaoPreco atual={dados.precoAtual} anterior={dados.precoAnterior} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-5">
        <Imagem url={dados.imagens[0]} alt={dados.titulo} />

        <div className="min-w-0 flex-1 space-y-3">
          {identificadores.length > 0 && (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
              {identificadores.map(([rotulo, valor]) => (
                <div key={rotulo} className="min-w-0">
                  <dt className="text-xs text-suave">{rotulo}</dt>
                  <dd className="truncate">{valor}</dd>
                </div>
              ))}
            </dl>
          )}

          <a
            href={dados.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-acento hover:underline"
          >
            <ExternalLink size={14} />
            Abrir no site {dados.fonte.dominio}
          </a>
        </div>
      </div>

      <div className="mt-5">
        <p className="mb-1.5 text-xs tracking-wide text-suave uppercase">Descricao</p>
        {dados.descricao ? (
          <p className="max-h-72 overflow-y-auto rounded border border-borda bg-fundo p-3 text-sm whitespace-pre-wrap">
            {dados.descricao}
          </p>
        ) : (
          <p className="text-sm text-suave">A loja nao publica descricao nesta pagina.</p>
        )}
      </div>

      {dados.atributos && Object.keys(dados.atributos).length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs tracking-wide text-suave uppercase">
            Ficha tecnica publicada
          </p>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {Object.entries(dados.atributos).map(([nome, valor]) => (
              <div key={nome} className="flex gap-2 border-b border-borda py-1">
                <dt className="text-suave">{nome}:</dt>
                <dd className="min-w-0 truncate">{String(valor)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <p className="mt-4 text-xs text-suave">
        Coletado em {comoData(dados.vistoEm)}
        {dados.mudouEm && ` · ultima mudanca de preco em ${comoData(dados.mudouEm)}`}
      </p>
    </div>
  );
}

export default function TabelaMercados({ linhas }) {
  const [selecionada, setSelecionada] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const [pendente, iniciarTransicao] = useTransition();

  /**
   * Busca o detalhe no clique, e nao junto com a listagem: a descricao tem uns
   * 10 KB por linha, e traze-la para cinquenta resultados seria meio megabyte
   * quase todo nunca lido.
   *
   * O estado e definido dentro da transicao disparada pelo clique — nao em
   * efeito, que o React 19 barra.
   */
  function abrir(id) {
    if (selecionada === id) {
      setSelecionada(null);
      setDetalhe(null);
      return;
    }

    setSelecionada(id);
    setDetalhe(null);
    iniciarTransicao(async () => {
      setDetalhe(await detalhePagina(id));
    });
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
        <table className="w-full text-sm">
          <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
            <tr className="divide-x divide-borda">
              <th className="px-3 py-2.5 font-medium">Fonte</th>
              <th className="px-3 py-2.5 font-medium">Titulo</th>
              <th className="px-3 py-2.5 font-medium">Marca</th>
              <th className="px-3 py-2.5 font-medium">Codigo</th>
              <th className="px-3 py-2.5 text-right font-medium">Valor</th>
              <th className="px-3 py-2.5 font-medium">Visto em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {linhas.map((linha) => (
              <tr
                key={linha.id}
                onClick={() => abrir(linha.id)}
                aria-selected={selecionada === linha.id}
                className={`cursor-pointer hover:bg-fundo ${
                  selecionada === linha.id ? "bg-fundo" : ""
                } ${
                  // Fora do ar aparece esmaecida em vez de sumir: saber que o
                  // concorrente tirou o produto do ar e informacao.
                  linha.disponivel ? "" : "opacity-50"
                }`}
              >
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge tom={linha.fonteTipo === "FORNECEDOR" ? "info" : "neutro"}>
                      {linha.fonteTipo === "FORNECEDOR" ? "Fornecedor" : "Concorrente"}
                    </Badge>
                    <span className="truncate">{linha.fonteNome}</span>
                  </div>
                </td>
                <td className="max-w-md px-3 py-2.5">
                  <span className="line-clamp-2">{linha.titulo ?? "—"}</span>
                  {!linha.disponivel && (
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-suave">
                      <PackageX size={12} /> fora do ar
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">{linha.marca ?? "—"}</td>
                <td className="px-3 py-2.5 font-mono text-xs">
                  {linha.mpn ?? linha.skuFonte ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  {comoMoeda(linha.precoAtual)}
                </td>
                <td className="px-3 py-2.5 text-suave">{comoData(linha.vistoEm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Detalhe dados={detalhe} carregando={pendente} />
    </>
  );
}
