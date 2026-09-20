"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Copy, Loader, Search, X } from "lucide-react";

import { buscarPorCodigo } from "@/app/produtos/acoes";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";

const ROTULO_TIPO = {
  RISE: { texto: "Rise", classe: "bg-sky-100 text-sky-800" },
  FORNECEDOR: { texto: "Fornecedor", classe: "bg-emerald-100 text-emerald-800" },
  CONCORRENTE: { texto: "Concorrente", classe: "bg-amber-100 text-amber-800" },
  OUTRO: { texto: "Outro", classe: "bg-slate-100 text-slate-700" },
};

const reais = (valor) =>
  valor === null || valor === undefined
    ? null
    : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Busca um codigo no banco e entrega os campos a quem chamou.
 *
 * Um resultado so preenche direto. Mais de um vira lista para escolher: o mesmo
 * codigo num fornecedor e num concorrente traz nome e descricao diferentes, e
 * escolher sozinho seria decidir pelo operador de onde vem o cadastro.
 *
 * `codigoAtual` le o SKU ja digitado no formulario, para nao obrigar a
 * digita-lo de novo.
 */
export default function BuscarPorCodigo({ codigoAtual, aoEscolher }) {
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [resposta, setResposta] = useState(null);
  const [pendente, iniciarTransicao] = useTransition();
  const entrada = useRef(null);

  useEffect(() => {
    if (aberto) entrada.current?.focus();
  }, [aberto]);

  function abrir() {
    setCodigo(codigoAtual?.() ?? "");
    setResposta(null);
    setAberto(true);
  }

  function escolher(resultado) {
    aoEscolher(resultado);
    setAberto(false);
  }

  function buscar() {
    if (!codigo.trim()) return;
    iniciarTransicao(async () => {
      let nova;
      try {
        nova = await buscarPorCodigo(codigo);
      } catch (erro) {
        nova = { ok: false, erro: erro?.message ?? "Falha ao buscar." };
      }
      if (nova.ok && nova.resultados.length === 1) {
        escolher(nova.resultados[0]);
        return;
      }
      setResposta(nova);
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        className="inline-flex items-center gap-1.5 rounded border border-acento bg-superficie px-4 py-2 text-sm font-medium text-acento hover:bg-fundo"
      >
        <Copy size={15} />
        Clonar a partir de um codigo
      </button>
      <BolhaDeAjuda texto="Copia o cadastro de um produto da Rise, de fornecedor ou de concorrente, pelo codigo, EAN ou MPN. Uma nova busca recomeca o cadastro do zero." />

      {aberto && (
        <div className="absolute right-0 z-20 mt-2 w-[28rem] max-w-[calc(100vw-2rem)] rounded-lg border border-borda bg-superficie p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold">Clonar a partir de um codigo</span>
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar"
              className="rounded p-1 text-suave hover:bg-fundo"
            >
              <X size={14} />
            </button>
          </div>

          {/*
            Nao e um <form>: ele ja esta dentro do formulario do produto, e form
            aninhado nao existe em HTML — o Enter salvaria o produto.
          */}
          <div className="flex gap-2">
            <input
              ref={entrada}
              value={codigo}
              onChange={(evento) => setCodigo(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === "Enter") {
                  evento.preventDefault();
                  buscar();
                }
              }}
              placeholder="Codigo, EAN ou MPN"
              className="w-full rounded border border-borda px-2.5 py-2 text-sm focus:border-acento focus:outline-none"
            />
            <button
              type="button"
              onClick={buscar}
              disabled={pendente || !codigo.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {pendente ? <Loader size={14} className="animate-spin" /> : <Search size={14} />}
              Buscar
            </button>
          </div>
          {resposta && !resposta.ok && (
            <p className="mt-2 text-xs text-red-700">{resposta.erro}</p>
          )}

          {resposta?.ok && resposta.resultados.length === 0 && (
            <p className="mt-3 text-sm text-suave">
              Nenhum produto com o codigo &quot;{codigo.trim()}&quot;.
            </p>
          )}

          {resposta?.ok && resposta.resultados.length > 1 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-suave">
                {resposta.resultados.length} produtos com este codigo. Escolha qual clonar:
              </p>
              <ul className="max-h-80 divide-y divide-borda overflow-y-auto rounded border border-borda">
                {resposta.resultados.map((resultado) => {
                  const tipo = ROTULO_TIPO[resultado.tipo] ?? ROTULO_TIPO.OUTRO;
                  return (
                    <li key={resultado.id}>
                      <button
                        type="button"
                        onClick={() => escolher(resultado)}
                        className="block w-full px-3 py-2 text-left hover:bg-fundo"
                      >
                        <span className="flex items-center gap-2 text-xs">
                          <span className={`rounded px-1.5 py-0.5 font-medium ${tipo.classe}`}>
                            {tipo.texto}
                          </span>
                          <span className="text-suave">{resultado.fonte}</span>
                          <span className="font-mono text-suave">{resultado.codigo}</span>
                          {reais(resultado.preco) && (
                            <span className="ml-auto text-emerald-700">
                              {reais(resultado.preco)}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-sm">
                          {resultado.nome ?? "(sem nome)"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
