"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader, X } from "lucide-react";

import { listarCategoriasLI, listarMarcasLI, salvarAnuncioLI } from "@/app/canais-de-venda/loja-integrada/acoes";
import { BarraDeAbas, Painel } from "@/components/cadastros/Abas";
import Badge from "@/components/ui/Badge";
import { STATUS_LI } from "@/lib/canaisDeVenda/li/rotulos";
import { ABAS_LI, validarRascunhoLI } from "@/lib/canaisDeVenda/li/validacao";
import AbaDescricao from "./AbaDescricao";
import AbaGeral from "./AbaGeral";
import AbaPrevia from "./AbaPrevia";
import AbaSEO from "./AbaSEO";
import { AbaEnvio, AbaFiscal } from "./AbasDeLeitura";

// Uma aba por id de `ABAS_LI`: aba nova na validacao pede o componente aqui.
const ABAS_PRONTAS = {
  geral: AbaGeral,
  seo: AbaSEO,
  descricao: AbaDescricao,
  fiscal: AbaFiscal,
  envio: AbaEnvio,
  previa: AbaPrevia,
};

const CLASSE_DA_MENSAGEM = {
  erro: "border-red-200 bg-red-50 text-red-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

async function chamar(acao) {
  try {
    return await acao();
  } catch {
    return { ok: false, erro: "Nao foi possivel falar com o servidor." };
  }
}

/**
 * Editor do anuncio da Loja Integrada, na casca do editor do Mercado Livre: estado controlado sem
 * `<form>`, as seis abas montadas e so escondidas, Salvar no rodape, e no modo janela o Esc e o
 * "Sair sem salvar?". Salvar grava SO o rascunho no banco local; o envio a loja e do icone.
 *
 * Ao abrir le da loja (so leitura) as marcas e as categorias, para as sugestoes da aba Geral e para
 * a validacao acusar categoria que sumiu. Falha nessa leitura nao impede editar nem salvar.
 *
 * Cada aba recebe `{ rascunho, contexto, alterar, setContexto, problemas, irPara, anuncioId, vinculo,
 * slugOriginal, recarregarCategorias }`; so a Previa recebe `todosProblemas`.
 */
export default function EditorAnuncioLI({ anuncioId, rascunhoInicial, contextoInicial, status, vinculo, modo = "pagina", aoSalvar, aoFechar }) {
  const [rascunho, setRascunho] = useState(rascunhoInicial);
  const [contexto, setContexto] = useState(contextoInicial);
  const [aba, setAba] = useState(ABAS_LI[0].id);
  const [mensagem, setMensagem] = useState(null);
  const [idAtual, setIdAtual] = useState(anuncioId ?? null);
  const [salvo, setSalvo] = useState(rascunhoInicial);
  const [slugOriginal] = useState(rascunhoInicial.slug);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const [salvando, iniciarSalvamento] = useTransition();
  const caixaDaMensagem = useRef(null);
  const secaoDaJanela = useRef(null);
  const montado = useRef(false);

  const alterado = rascunho !== salvo;
  const janela = modo === "janela";
  // O primeiro Salvar de um anuncio novo na pagina troca a URL e remonta o editor: o que fosse
  // digitado nesse intervalo se perderia (mesma regra do editor do ML).
  const travado = salvando && idAtual === null && modo === "pagina";
  const problemas = useMemo(
    () => validarRascunhoLI(rascunho, { produto: contexto.produto, categoriasDaLI: contexto.categoriasDaLI ?? null }),
    [rascunho, contexto],
  );

  const recarregarCategorias = useCallback(async () => {
    setContexto((atual) => ({ ...atual, carregandoCategorias: true, erroDasCategorias: null }));
    const resultado = await chamar(listarCategoriasLI);
    if (!montado.current) return;
    setContexto((atual) =>
      resultado.ok
        ? { ...atual, categoriasDaLI: resultado.categorias, carregandoCategorias: false, erroDasCategorias: null }
        : { ...atual, carregandoCategorias: false, erroDasCategorias: resultado.erro },
    );
  }, []);

  useEffect(() => {
    montado.current = true;
    (async () => {
      await recarregarCategorias();
      const marcas = await chamar(listarMarcasLI);
      if (montado.current && marcas.ok) setContexto((atual) => ({ ...atual, marcasDaLI: marcas.marcas }));
    })();
    return () => {
      montado.current = false;
    };
  }, [recarregarCategorias]);

  useEffect(() => {
    if (mensagem?.tipo === "erro") caixaDaMensagem.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [mensagem]);

  useEffect(() => {
    if (janela) secaoDaJanela.current?.focus();
  }, [janela]);

  const pedirFechamento = useCallback(() => {
    if (salvando) return;
    if (alterado) setConfirmandoSaida(true);
    else aoFechar?.();
  }, [salvando, alterado, aoFechar]);

  useEffect(() => {
    if (!janela) return undefined;
    function aoTeclar(evento) {
      if (evento.key !== "Escape" || evento.repeat) return;
      if (confirmandoSaida) setConfirmandoSaida(false);
      else pedirFechamento();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [janela, confirmandoSaida, pedirFechamento]);

  function alterar(parcial) {
    setRascunho((atual) => ({ ...atual, ...(typeof parcial === "function" ? parcial(atual) : parcial) }));
    setMensagem((atual) => (atual?.tipo === "ok" ? null : atual));
  }

  function salvar() {
    setMensagem(null);
    const enviado = rascunho;
    iniciarSalvamento(async () => {
      let resultado;
      try {
        resultado = await salvarAnuncioLI(idAtual, enviado);
      } catch {
        resultado = { ok: false, erro: "Nao foi possivel falar com o servidor. O que esta na tela continua aqui: tente salvar de novo." };
      }
      if (!resultado.ok) {
        setMensagem({ tipo: "erro", texto: resultado.erro });
        return;
      }
      setIdAtual(resultado.id);
      setSalvo(enviado);
      setMensagem({ tipo: "ok", texto: "Rascunho salvo." });
      aoSalvar?.(resultado.id);
    });
  }

  const propsDasAbas = { rascunho, contexto, alterar, setContexto, irPara: setAba, anuncioId: idAtual, vinculo, slugOriginal, recarregarCategorias };
  const rotuloDoStatus = STATUS_LI[status] ?? (idAtual ? STATUS_LI.RASCUNHO : { rotulo: "Novo", tom: "neutro" });

  const aviso = mensagem && (
    <div ref={caixaDaMensagem} role={mensagem.tipo === "erro" ? "alert" : "status"} className={`rounded border px-3 py-2 text-sm ${CLASSE_DA_MENSAGEM[mensagem.tipo]}`}>
      {mensagem.texto}
    </div>
  );

  const barra = (
    <div inert={travado}>
      <BarraDeAbas abas={ABAS_LI} aba={aba} aoMudar={setAba} comErro={(id) => problemas.some((problema) => problema.aba === id && problema.bloqueante)} />
    </div>
  );

  const paineis = (
    <div inert={travado} aria-busy={travado} className={travado ? "opacity-70" : undefined}>
      {ABAS_LI.map(({ id }) => {
        const Aba = ABAS_PRONTAS[id];
        return (
          <Painel key={id} id={id} aba={aba}>
            <Aba {...propsDasAbas} problemas={problemas.filter((problema) => problema.aba === id)} {...(id === "previa" ? { todosProblemas: problemas } : {})} />
          </Painel>
        );
      })}
    </div>
  );

  const rodape = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="flex items-center gap-2 text-xs">
        <Badge tom={rotuloDoStatus.tom}>{rotuloDoStatus.rotulo}</Badge>
        {alterado ? <span className="text-amber-700">Alteracoes nao salvas</span> : idAtual && <span className="text-suave">Tudo salvo</span>}
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-suave md:inline">Enviar a loja: icone da Loja Integrada na lista de Produtos</span>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {salvando && <Loader size={14} className="animate-spin" />}
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );

  if (!janela) {
    return (
      <div className="space-y-4">
        {aviso}
        <div className="rounded-lg border border-borda bg-superficie">
          {barra}
          <div className="p-5">{paineis}</div>
        </div>
        <div className="sticky bottom-0 z-10 rounded-lg border border-borda bg-superficie shadow-lg">{rodape}</div>
      </div>
    );
  }

  const produto = contexto.produto;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) pedirFechamento();
      }}
    >
      <section
        ref={secaoDaJanela}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Anuncio da Loja Integrada"
        className="flex max-h-full w-full max-w-5xl flex-col rounded-lg border border-borda bg-superficie shadow-2xl focus:outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-borda px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Anuncio da Loja Integrada</p>
            {produto && (
              <p className="mt-0.5 truncate text-xs text-suave">
                <span className="font-mono">{produto.sku}</span> · {produto.tituloBase}
              </p>
            )}
          </div>
          <button type="button" onClick={pedirFechamento} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={16} />
          </button>
        </header>
        {aviso && <div className="shrink-0 px-5 pt-3">{aviso}</div>}
        <div className="shrink-0">{barra}</div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{paineis}</div>
        <div className="shrink-0 border-t border-borda">{rodape}</div>
      </section>

      {confirmandoSaida && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) setConfirmandoSaida(false);
          }}
        >
          <section role="alertdialog" aria-modal="true" aria-labelledby="li-sair-titulo" className="w-full max-w-sm rounded-lg border border-borda bg-superficie p-4 shadow-2xl">
            <p id="li-sair-titulo" className="text-sm font-semibold">
              Sair sem salvar?
            </p>
            <p className="mt-1 text-sm text-suave">As alteracoes deste anuncio ainda nao foram salvas e serao perdidas.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setConfirmandoSaida(false)} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo">
                Continuar editando
              </button>
              <button type="button" onClick={() => aoFechar?.()} className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
                Sair sem salvar
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
