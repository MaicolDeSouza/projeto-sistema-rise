"use client";

import { useState } from "react";
import {
  CircleAlert,
  ExternalLink,
  Lock,
  Pause,
  RefreshCw,
  Send,
  TriangleAlert,
} from "lucide-react";

import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import BadgeCanal, { resumirSituacao } from "./BadgeCanal";

function formatarData(valor) {
  if (!valor) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}

/** Campo somente leitura desta fase, que ja mostra o motivo quando travado. */
function Campo({ rotulo, valor, travado, motivo, herdado, problemas = [] }) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-medium">
        {rotulo}
        {travado && <Lock size={11} className="text-suave" />}
      </label>
      <div
        className={`mt-1 rounded border px-2 py-1.5 text-sm ${
          travado
            ? "border-borda bg-fundo text-suave"
            : "border-borda bg-superficie"
        } ${problemas.length ? "border-red-300" : ""}`}
      >
        {valor || <span className="text-suave">nao informado</span>}
      </div>
      {herdado && (
        <p className="mt-1 text-[11px] text-suave">Herdado da aba Base</p>
      )}
      {travado && motivo && (
        <p className="mt-1 text-[11px] text-suave">{motivo}</p>
      )}
      {problemas.map((problema) => (
        <p
          key={problema.problema}
          className={`mt-1 text-[11px] ${
            problema.bloqueante ? "text-red-700" : "text-amber-700"
          }`}
        >
          {problema.problema}
        </p>
      ))}
    </div>
  );
}

function AbaBase({ base }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Campo rotulo="SKU" valor={base.sku} />
      <Campo rotulo="EAN / GTIN" valor={base.ean} />
      <Campo rotulo="Marca" valor={base.marca} />
      <Campo rotulo="Modelo" valor={base.modelo} />
      <div className="sm:col-span-2">
        <Campo rotulo="Titulo base" valor={base.tituloBase} />
      </div>
      <div className="sm:col-span-2">
        <Campo rotulo="Descricao base" valor={base.descricaoBase} />
      </div>
      <Campo
        rotulo="Custo"
        valor={base.custo ? `R$ ${base.custo.toFixed(2)}` : null}
      />
      <Campo
        rotulo="Preco de venda"
        valor={base.precoVenda ? `R$ ${base.precoVenda.toFixed(2)}` : null}
      />
      <Campo rotulo="Estoque" valor={String(base.estoque)} />
      <Campo
        rotulo="Garantia"
        valor={base.garantiaMeses ? `${base.garantiaMeses} meses` : null}
      />
      <div className="sm:col-span-2">
        <Campo
          rotulo="Imagens"
          valor={
            base.imagens.length
              ? `${base.imagens.length} imagem(ns)`
              : null
          }
          problemas={
            base.imagens.length
              ? []
              : [{ problema: "Sem imagem cadastrada.", bloqueante: true }]
          }
        />
      </div>
    </div>
  );
}

function AbaCanal({ aba }) {
  const { anuncio, validacao, editaveis, payload } = aba;

  if (!aba.disponivel) {
    return (
      <div className="rounded border border-borda bg-fundo p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Lock size={14} />
          Canal indisponivel
        </p>
        <p className="mt-1 text-sm text-suave">{aba.motivoIndisponivel}</p>
      </div>
    );
  }

  const bloqueantes = validacao.problemas.filter((p) => p.bloqueante);
  const alertas = validacao.problemas.filter((p) => !p.bloqueante);
  const problemasDe = (campo) =>
    validacao.problemas.filter((p) => p.campo === campo);

  return (
    <div className="space-y-5">
      {aba.viaBling && (
        <p className="rounded border border-borda bg-fundo p-3 text-sm text-suave">
          Este canal e sincronizado pelo Bling: o produto publicado la aparece
          aqui automaticamente, sem chamada direta a API da Loja Integrada.
        </p>
      )}

      {!anuncio ? (
        <p className="text-sm text-suave">
          Ainda nao existe anuncio deste produto neste canal.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <BadgeCanal anuncio={anuncio} />
            {anuncio.desatualizado && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                <TriangleAlert size={12} />
                Alteracoes nao publicadas
              </span>
            )}
            {anuncio.urlExterna && (
              <a
                href={anuncio.urlExterna}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-acento hover:underline"
              >
                <ExternalLink size={12} />
                Ver no canal
              </a>
            )}
          </div>

          {anuncio.erro && (
            <p className="rounded bg-red-50 p-3 text-xs break-words text-red-800">
              {anuncio.erro}
            </p>
          )}

          {(bloqueantes.length > 0 || alertas.length > 0) && (
            <div className="rounded border border-borda p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <CircleAlert size={13} />
                {bloqueantes.length} problema(s) que impedem publicar
                {alertas.length > 0 && ` · ${alertas.length} alerta(s)`}
              </p>
              <ul className="mt-2 space-y-1">
                {validacao.problemas.map((problema) => (
                  <li
                    key={`${problema.campo}-${problema.problema}`}
                    className={`text-xs ${
                      problema.bloqueante ? "text-red-700" : "text-amber-700"
                    }`}
                  >
                    • {problema.problema}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo
                rotulo="Titulo no canal"
                valor={anuncio.tituloEfetivo}
                herdado={anuncio.tituloHerdado}
                travado={editaveis.titulo && !editaveis.titulo.editavel}
                motivo={editaveis.titulo?.motivo}
                problemas={problemasDe("titulo")}
              />
            </div>
            <Campo
              rotulo="Categoria"
              valor={anuncio.categoriaExternaId}
              travado={editaveis.categoria && !editaveis.categoria.editavel}
              motivo={editaveis.categoria?.motivo}
              problemas={problemasDe("categoria")}
            />
            <Campo rotulo="ID no canal" valor={anuncio.idExterno} />
            <Campo
              rotulo="Publicado em"
              valor={formatarData(anuncio.publicadoEm)}
            />
            <Campo
              rotulo="Sincronizado em"
              valor={formatarData(anuncio.sincronizadoEm)}
            />
            {anuncio.atributos && (
              <div className="sm:col-span-2">
                <p className="text-xs font-medium">Atributos</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {Object.entries(anuncio.atributos).map(([chave, valor]) => (
                    <Badge key={chave} tom="neutro">
                      {chave}: {String(valor)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {payload && (
            <details className="rounded border border-borda">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                Pre-visualizar o que seria enviado
              </summary>
              <pre className="overflow-x-auto border-t border-borda bg-fundo p-3 text-[11px]">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </details>
          )}
        </>
      )}

      {/* Acoes desenhadas e desabilitadas: a publicacao real entra na Fase B.
          Botao visivel com motivo mostra o fluxo completo; botao ausente
          esconderia metade do desenho. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-borda pt-4">
        {[
          { icone: Send, rotulo: "Publicar" },
          { icone: RefreshCw, rotulo: "Sincronizar" },
          { icone: Pause, rotulo: "Pausar" },
        ].map(({ icone: Icone, rotulo }) => (
          <button
            key={rotulo}
            type="button"
            disabled
            title="Disponivel na proxima etapa, quando a publicacao for ligada"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm text-suave opacity-60"
          >
            <Icone size={14} />
            {rotulo}
          </button>
        ))}
        <span className="text-xs text-suave">
          Publicacao ainda desligada nesta etapa.
        </span>
      </div>
    </div>
  );
}

export default function EditorAnuncio({ base, abas }) {
  const [ativa, setAtiva] = useState("BASE");

  const todas = [{ id: "BASE", nome: "Base" }, ...abas];
  const abaAtual = abas.find((aba) => aba.id === ativa);

  return (
    <Card className="p-0">
      <div className="flex overflow-x-auto border-b border-borda">
        {todas.map((aba) => {
          const dados = abas.find((item) => item.id === aba.id);
          const situacao = dados?.anuncio
            ? resumirSituacao(dados.anuncio)
            : null;
          const bloqueantes = dados?.validacao?.bloqueantes ?? 0;

          return (
            <button
              key={aba.id}
              type="button"
              onClick={() => setAtiva(aba.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm whitespace-nowrap ${
                ativa === aba.id
                  ? "border-acento font-medium text-texto"
                  : "border-transparent text-suave hover:text-texto"
              }`}
            >
              {aba.nome}
              {bloqueantes > 0 && (
                <span className="rounded-full bg-red-100 px-1.5 text-[10px] text-red-700">
                  {bloqueantes}
                </span>
              )}
              {situacao && bloqueantes === 0 && dados.anuncio.desatualizado && (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              )}
            </button>
          );
        })}
      </div>

      <div className="p-5">
        {ativa === "BASE" ? (
          <>
            <p className="mb-4 text-sm text-suave">
              Conteudo neutro de canal. E daqui que cada anuncio deriva — mudar
              algo aqui marca os canais publicados como desatualizados.
            </p>
            <AbaBase base={base} />
          </>
        ) : (
          abaAtual && <AbaCanal aba={abaAtual} />
        )}
      </div>
    </Card>
  );
}
