"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader, X } from "lucide-react";

import { salvarAnuncioML } from "@/app/canais-de-venda/mercado-livre/acoes";
import { BarraDeAbas, Painel } from "@/components/cadastros/Abas";
import Badge from "@/components/ui/Badge";
import { STATUS_ML } from "@/lib/canaisDeVenda/ml/rotulos";
import { ABAS_ML, validarRascunhoML } from "@/lib/canaisDeVenda/ml/validacao";
import AbaDescricao from "./AbaDescricao";
import AbaEnvio from "./AbaEnvio";
import AbaFichaTecnica from "./AbaFichaTecnica";
import AbaGeral from "./AbaGeral";
import AbaImagens from "./AbaImagens";
import AbaPrecoEstoque from "./AbaPrecoEstoque";
import AbaPrevia from "./AbaPrevia";

// Uma aba por id de `ABAS_ML`: aba nova na validacao pede o componente aqui.
const ABAS_PRONTAS = {
  geral: AbaGeral,
  preco: AbaPrecoEstoque,
  imagens: AbaImagens,
  descricao: AbaDescricao,
  ficha: AbaFichaTecnica,
  envio: AbaEnvio,
  previa: AbaPrevia,
};

const MOTIVO_DA_FASE = "A publicacao entra na fase 3.";

const CLASSE_DA_MENSAGEM = {
  erro: "border-red-200 bg-red-50 text-red-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

const semBlingId = (produto) => Boolean(produto) && !String(produto.blingId ?? "").trim();

/**
 * Editor de um anuncio do Mercado Livre: a casca (abas, Salvar, Publicar) e o estado que as abas
 * compartilham. Montado pela pagina (`modo="pagina"`, rodape fixo na base da tela) e pela janela
 * da lista de Produtos (`modo="janela"`, que ele mesmo desenha, com Esc e confirmacao de saida).
 *
 * O estado e todo controlado, sem `<form>`: cada aba le `rascunho` e `contexto` e escreve por
 * `alterar` e `setContexto`. Todas as abas ficam montadas e so escondidas (`Painel`).
 *
 * - `anuncioId`: `null` num anuncio novo. Depois do primeiro Salvar o editor guarda o id que a
 *   acao devolveu, e os proximos Salvar atualizam o mesmo anuncio.
 * - `aoSalvar(id)`: quem monta decide o que fazer (a pagina navega, a janela volta a lista).
 * - `aoFechar()`: so no modo janela.
 * - O estado nasce das props e nao as acompanha: quem monta troca o `key` ao abrir outro anuncio.
 *
 * Cada aba recebe `{ rascunho, contexto, alterar, setContexto, problemas, irPara, anuncioId }`.
 * `alterar(parcial)` mescla raso; `parcial` pode ser uma funcao `(atual) => parcial`, para quem
 * decide depois de esperar o servidor e nao pode desfazer o que foi digitado nesse meio tempo.
 * `problemas` ja vem filtrado pela aba. So a Previa recebe tambem `todosProblemas`, a lista
 * inteira da validacao (ela mostra as de todas as abas).
 */
export default function EditorAnuncioML({
  anuncioId,
  rascunhoInicial,
  contextoInicial,
  status,
  modo = "pagina",
  aoSalvar,
  aoFechar,
}) {
  const [rascunho, setRascunho] = useState(rascunhoInicial);
  const [contexto, setContexto] = useState(contextoInicial);
  const [aba, setAba] = useState(ABAS_ML[0].id);
  const [mensagem, setMensagem] = useState(null);
  // `null` e "anuncio novo"; as acoes recusam `undefined` (prop esquecida) como "Pedido invalido.".
  const [idAtual, setIdAtual] = useState(anuncioId ?? null);
  // O que foi salvo por ultimo. "Alterado" e o rascunho ser outro objeto: assim, o dono que
  // continua digitando enquanto o Salvar espera o servidor segue com alteracao pendente.
  const [salvo, setSalvo] = useState(rascunhoInicial);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const [salvando, iniciarSalvamento] = useTransition();
  const caixaDaMensagem = useRef(null);

  const alterado = rascunho !== salvo;
  const janela = modo === "janela";
  const problemas = useMemo(() => validarRascunhoML(rascunho, contexto), [rascunho, contexto]);

  // O erro aparece no topo: com o rodape fixo, o dono clica em Salvar com a pagina rolada.
  useEffect(() => {
    if (mensagem?.tipo === "erro") caixaDaMensagem.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [mensagem]);

  const pedirFechamento = useCallback(() => {
    if (salvando) return;
    if (alterado) setConfirmandoSaida(true);
    else aoFechar?.();
  }, [salvando, alterado, aoFechar]);

  useEffect(() => {
    if (!janela) return undefined;
    function aoTeclar(evento) {
      // Esc segurado repete o evento: sem ignorar, o aviso abriria e fecharia a cada repeticao.
      if (evento.key !== "Escape" || evento.repeat) return;
      // Esc fecha so o aviso quando ele esta aberto, e nao a janela inteira por baixo.
      if (confirmandoSaida) setConfirmandoSaida(false);
      else pedirFechamento();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [janela, confirmandoSaida, pedirFechamento]);

  function alterar(parcial) {
    setRascunho((atual) => ({ ...atual, ...(typeof parcial === "function" ? parcial(atual) : parcial) }));
    // "Rascunho salvo." deixa de ser verdade com a primeira tecla; o erro fica ate o proximo Salvar.
    setMensagem((atual) => (atual?.tipo === "ok" ? null : atual));
  }

  function salvar() {
    setMensagem(null);
    const enviado = rascunho;
    iniciarSalvamento(async () => {
      let resultado;
      try {
        resultado = await salvarAnuncioML(idAtual, enviado);
      } catch {
        // Excecao solta numa transicao iria ao error boundary e levaria o que foi digitado.
        resultado = { ok: false, erro: "Nao foi possivel falar com o servidor. O que esta na tela continua aqui: tente salvar de novo." };
      }
      // Recusa (produto que deixou de ser Conferido, por exemplo): so o recado. Nada do estado muda.
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

  const bloqueantes = problemas.filter((problema) => problema.bloqueante).length;
  const idsDosProdutos = rascunho.composicao
    ? (Array.isArray(rascunho.composicao.itens) ? rascunho.composicao.itens : []).map((item) => item.produtoId)
    : [rascunho.produtoId];
  const motivosSemPublicar = [
    MOTIVO_DA_FASE,
    ...(idsDosProdutos.some((id) => semBlingId(contexto.produtos[id])) ? ["Produto sem blingId."] : []),
    ...(bloqueantes > 0 ? [`${bloqueantes} problema(s) bloqueante(s) na Previa.`] : []),
  ];

  const propsDasAbas = { rascunho, contexto, alterar, setContexto, irPara: setAba, anuncioId: idAtual };
  const rotuloDoStatus = STATUS_ML[status] ?? (idAtual ? STATUS_ML.RASCUNHO : { rotulo: "Novo", tom: "neutro" });

  const aviso = mensagem && (
    <div
      ref={caixaDaMensagem}
      role={mensagem.tipo === "erro" ? "alert" : "status"}
      className={`rounded border px-3 py-2 text-sm ${CLASSE_DA_MENSAGEM[mensagem.tipo]}`}
    >
      {mensagem.texto}
    </div>
  );

  const barra = (
    <BarraDeAbas
      abas={ABAS_ML}
      aba={aba}
      aoMudar={setAba}
      comErro={(id) => problemas.some((problema) => problema.aba === id && problema.bloqueante)}
    />
  );

  const paineis = ABAS_ML.map(({ id }) => {
    const Aba = ABAS_PRONTAS[id];
    return (
      <Painel key={id} id={id} aba={aba}>
        <Aba
          {...propsDasAbas}
          problemas={problemas.filter((problema) => problema.aba === id)}
          {...(id === "previa" ? { todosProblemas: problemas } : {})}
        />
      </Painel>
    );
  });

  const rodape = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="flex items-center gap-2 text-xs">
        <Badge tom={rotuloDoStatus.tom}>{rotuloDoStatus.rotulo}</Badge>
        {alterado ? (
          <span className="text-amber-700">Alteracoes nao salvas</span>
        ) : (
          idAtual && <span className="text-suave">Tudo salvo</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {salvando && <Loader size={14} className="animate-spin" />}
          Salvar
        </button>
        <button
          type="button"
          disabled
          title={motivosSemPublicar.join(" ")}
          className="rounded border border-borda px-4 py-2 text-sm text-suave disabled:cursor-not-allowed disabled:opacity-60"
        >
          Publicar
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
        {/* Fixo na base da tela: o Salvar fica ao alcance em qualquer aba, por mais que ela role. */}
        <div className="sticky bottom-0 z-10 rounded-lg border border-borda bg-superficie shadow-lg">{rodape}</div>
      </div>
    );
  }

  const principal = contexto.produtos[rascunho.produtoId];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) pedirFechamento();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Anuncio do Mercado Livre"
        className="flex max-h-full w-full max-w-5xl flex-col rounded-lg border border-borda bg-superficie shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-borda px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Anuncio do Mercado Livre</p>
            {principal && (
              <p className="mt-0.5 truncate text-xs text-suave">
                <span className="font-mono">{principal.sku}</span> · {principal.tituloBase}
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
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ml-sair-titulo"
            className="w-full max-w-sm rounded-lg border border-borda bg-superficie p-4 shadow-2xl"
          >
            <p id="ml-sair-titulo" className="text-sm font-semibold">
              Sair sem salvar?
            </p>
            <p className="mt-1 text-sm text-suave">As alteracoes deste anuncio ainda nao foram salvas e serao perdidas.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmandoSaida(false)}
                className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo"
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={() => aoFechar?.()}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Sair sem salvar
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
