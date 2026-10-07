"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Loader, X } from "lucide-react";

import { abrirAnuncioLI, listarCategoriasLI, listarMarcasLI, salvarAnuncioLI } from "@/app/canais-de-venda/loja-integrada/acoes";
import { abrirJanelaLI, cadastrarProdutoNaLI, sincronizarComLI } from "@/app/produtos/acoes-li";
import { BarraDeAbas, Painel } from "@/components/cadastros/Abas";
import Badge from "@/components/ui/Badge";
import { mudouNaLI, resumirEnvioLI } from "@/lib/canaisDeVenda/li/apresentacao";
import { STATUS_LI } from "@/lib/canaisDeVenda/li/rotulos";
import { ABAS_LI, validarRascunhoLI } from "@/lib/canaisDeVenda/li/validacao";
import AbaCategorias from "./AbaCategorias";
import AbaDescricao from "./AbaDescricao";
import AbaDivergencias from "./AbaDivergencias";
import AbaGeral from "./AbaGeral";
import AbaPrevia from "./AbaPrevia";
import AbaSEO from "./AbaSEO";
import { AbaEnvio, AbaFiscal } from "./AbasDeLeitura";

// Uma aba por id de `ABAS_LI`: aba nova na validacao pede o componente aqui.
const ABAS_PRONTAS = {
  geral: AbaGeral,
  descricao: AbaDescricao,
  categorias: AbaCategorias,
  envio: AbaEnvio,
  fiscal: AbaFiscal,
  seo: AbaSEO,
  previa: AbaPrevia,
};

const CLASSE_DA_MENSAGEM = {
  erro: "border-red-200 bg-red-50 text-red-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  atencao: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-borda bg-fundo text-texto",
};

async function chamar(acao, ...argumentos) {
  try {
    return await acao(...argumentos);
  } catch {
    return { ok: false, erro: "Nao foi possivel falar com o servidor." };
  }
}

/** O envio cuja resposta se perdeu pode ter chegado a loja: a mensagem manda conferir antes. */
async function chamarEnvio(acao, produtoId) {
  try {
    return await acao(produtoId);
  } catch {
    return { ok: false, erro: "A resposta do servidor se perdeu. A Loja Integrada pode ter recebido o envio: confira na loja antes de tentar de novo." };
  }
}

/** Diferenca de verdade (o selo do icone): "so tem na loja" nao e divergencia, vazio nunca apaga. */
const divergenciasDe = (leitura) =>
  leitura?.ok && leitura.situacao === "existe" ? (leitura.diferencas ?? []).filter((item) => item.tipo === "diferente").length : 0;

/**
 * Editor do anuncio da Loja Integrada, na casca do editor do Mercado Livre: estado controlado sem
 * `<form>`, as abas montadas e so escondidas, Salvar no rodape, e no modo janela o Esc e o
 * "Sair sem salvar?".
 *
 * Desde 07/10/2026 (pedidos do dono) o editor tambem e o pop-up do icone da lista de Produtos:
 * - ao abrir le a loja (`abrirJanelaLI`, so leitura; na primeira vez de um produto que ja existe la,
 *   grava o vinculo) e, havendo campo diferente, poe a aba "Divergencias" como a PRIMEIRA;
 * - o rodape tem "Sincronizar com a LI" ("Cadastrar na LI" se o produto nao esta na loja), sob as
 *   mesmas travas. O envio le o anuncio SALVO: com alteracao na tela, pergunta "Salvar e
 *   sincronizar" antes (sem a opcao de enviar sem salvar);
 * - "Editar produto" (Descricao, Fiscal, Envio) abre o cadastro na mesma aba e, com alteracao nao
 *   salva, pergunta antes.
 *
 * Tambem le as marcas e as categorias da loja (sugestoes e a validacao de categoria que sumiu).
 * Falha em qualquer leitura nao impede editar nem salvar.
 */
export default function EditorAnuncioLI({ anuncioId, rascunhoInicial, contextoInicial, status, vinculo, modo = "pagina", aoSalvar, aoFechar }) {
  const router = useRouter();
  const [rascunho, setRascunho] = useState(rascunhoInicial);
  const [contexto, setContexto] = useState(contextoInicial);
  const [aba, setAba] = useState(ABAS_LI[0].id);
  const [mensagem, setMensagem] = useState(null);
  const [idAtual, setIdAtual] = useState(anuncioId ?? null);
  const [statusAtual, setStatusAtual] = useState(status);
  const [vinculoAtual, setVinculoAtual] = useState(vinculo ?? null);
  const [salvo, setSalvo] = useState(rascunhoInicial);
  const [leitura, setLeitura] = useState(null);
  const [lendo, setLendo] = useState(true);
  const [envio, setEnvio] = useState(null);
  const [pergunta, setPergunta] = useState(null);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const [ocupado, iniciarTrabalho] = useTransition();
  const [qual, setQual] = useState(null);
  const caixaDaMensagem = useRef(null);
  const secaoDaJanela = useRef(null);
  const montado = useRef(false);
  const abaEscolhida = useRef(false);
  const alteradoRef = useRef(false);

  const produtoId = rascunho.produtoId ?? contexto.produto?.id ?? null;
  const alterado = rascunho !== salvo;
  const janela = modo === "janela";
  // O primeiro Salvar de um anuncio novo na pagina troca a URL e remonta o editor: o que fosse
  // digitado nesse intervalo se perderia (mesma regra do editor do ML).
  const travado = ocupado && idAtual === null && modo === "pagina";
  const problemas = useMemo(
    () => validarRascunhoLI(rascunho, { produto: contexto.produto, categoriasDaLI: contexto.categoriasDaLI ?? null, gtinDaLI: leitura?.daLoja?.gtin ?? null }),
    [rascunho, contexto, leitura],
  );
  const divergencias = divergenciasDe(leitura);
  const abas = useMemo(() => (divergencias > 0 ? [{ id: "divergencias", rotulo: `Divergencias (${divergencias})` }, ...ABAS_LI] : ABAS_LI), [divergencias]);
  const abaVisivel = abas.some((item) => item.id === aba) ? aba : ABAS_LI[0].id;

  useEffect(() => {
    alteradoRef.current = alterado;
  }, [alterado]);

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

  /**
   * Le a loja. Quando a leitura acabou de VINCULAR o produto (categorias e destaque vieram da loja
   * para o anuncio salvo), o editor recarrega o anuncio, se nada foi mexido na tela.
   */
  const lerLoja = useCallback(async () => {
    if (!produtoId) return;
    setLendo(true);
    const lida = await chamar(abrirJanelaLI, produtoId);
    if (!montado.current) return;
    setLeitura(lida);
    setLendo(false);
    if (lida.ok && lida.idExterno) {
      setVinculoAtual((atual) => ({ ...(atual ?? {}), idExterno: lida.idExterno, urlExterna: lida.urlExterna ?? atual?.urlExterna ?? null }));
    }
    if (lida.vinculadoAgora && lida.anuncioId) {
      if (alteradoRef.current) {
        setMensagem({ tipo: "atencao", texto: "O anuncio acabou de ser vinculado a loja: as categorias e o destaque de la foram gravados. Salvar agora troca pelos da tela." });
      } else {
        const aberto = await chamar(abrirAnuncioLI, lida.anuncioId);
        if (!montado.current || !aberto.ok) return;
        setRascunho(aberto.rascunho);
        setSalvo(aberto.rascunho);
        setIdAtual(aberto.anuncioId);
        setStatusAtual(aberto.status);
        setVinculoAtual(aberto.vinculo);
      }
    }
    if (divergenciasDe(lida) > 0 && !abaEscolhida.current) setAba("divergencias");
  }, [produtoId]);

  useEffect(() => {
    montado.current = true;
    (async () => {
      await Promise.all([
        lerLoja(),
        (async () => {
          await recarregarCategorias();
          const marcas = await chamar(listarMarcasLI);
          if (montado.current && marcas.ok) setContexto((atual) => ({ ...atual, marcasDaLI: marcas.marcas }));
        })(),
      ]);
    })();
    return () => {
      montado.current = false;
    };
  }, [recarregarCategorias, lerLoja]);

  useEffect(() => {
    if (mensagem?.tipo === "erro") caixaDaMensagem.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [mensagem]);

  useEffect(() => {
    if (janela) secaoDaJanela.current?.focus();
  }, [janela]);

  const pedirFechamento = useCallback(() => {
    if (ocupado) return;
    if (alterado) setConfirmandoSaida(true);
    else aoFechar?.();
  }, [ocupado, alterado, aoFechar]);

  useEffect(() => {
    if (!janela) return undefined;
    function aoTeclar(evento) {
      if (evento.key !== "Escape" || evento.repeat) return;
      if (pergunta) setPergunta(null);
      else if (confirmandoSaida) setConfirmandoSaida(false);
      else pedirFechamento();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [janela, confirmandoSaida, pergunta, pedirFechamento]);

  function mudarAba(id) {
    abaEscolhida.current = true;
    setAba(id);
  }

  function alterar(parcial) {
    setRascunho((atual) => ({ ...atual, ...(typeof parcial === "function" ? parcial(atual) : parcial) }));
    setMensagem((atual) => (atual?.tipo === "ok" ? null : atual));
  }

  /** Grava o rascunho; devolve o id salvo ou null. `avisar` chama o `aoSalvar` (a pagina troca a URL). */
  async function gravar({ avisar = true } = {}) {
    const enviado = rascunho;
    let resultado;
    try {
      resultado = await salvarAnuncioLI(idAtual, enviado);
    } catch {
      resultado = { ok: false, erro: "Nao foi possivel falar com o servidor. O que esta na tela continua aqui: tente salvar de novo." };
    }
    if (!resultado.ok) {
      setMensagem({ tipo: "erro", texto: resultado.erro });
      return null;
    }
    setIdAtual(resultado.id);
    setSalvo(enviado);
    if (avisar) aoSalvar?.(resultado.id);
    return resultado.id;
  }

  function salvar() {
    setMensagem(null);
    setQual("salvar");
    iniciarTrabalho(async () => {
      if (await gravar()) setMensagem({ tipo: "ok", texto: "Rascunho salvo." });
      setQual(null);
    });
  }

  const tipoDeEnvio = leitura?.ok && leitura.situacao === "nao_existe" ? "cadastrar" : "sincronizar";

  async function enviar() {
    const tipo = tipoDeEnvio;
    setQual("enviar");
    const rotulos = Object.fromEntries((leitura?.diferencas ?? []).map((item) => [item.campo, item.rotulo]));
    const resultado = await chamarEnvio(tipo === "cadastrar" ? cadastrarProdutoNaLI : sincronizarComLI, produtoId);
    if (!montado.current) return;
    const resumo = resumirEnvioLI(tipo, resultado, rotulos);
    setEnvio(resumo ? { ok: resultado.ok === true, titulo: resumo.titulo, linhas: resumo.linhas } : null);
    if (!resultado.ok) setMensagem({ tipo: "erro", texto: resultado.erro ?? "O envio nao foi concluido." });
    if (resultado.ok) setStatusAtual("PUBLICADO");
    if (mudouNaLI(tipo, resultado)) {
      setQual("lendo");
      await lerLoja();
    }
  }

  /** Sincronizar/Cadastrar: com alteracao na tela (ou anuncio novo nunca salvo), salvar vem antes. */
  function pedirEnvio() {
    setMensagem(null);
    setEnvio(null);
    if (alterado || idAtual === null) {
      setPergunta("enviar");
      return;
    }
    iniciarTrabalho(async () => {
      await enviar();
      setQual(null);
    });
  }

  function salvarEEnviar() {
    setPergunta(null);
    setQual("salvar");
    iniciarTrabalho(async () => {
      const novo = idAtual === null;
      const id = await gravar({ avisar: false });
      if (id) {
        await enviar();
        // Anuncio novo na pagina: so agora a URL vira a do anuncio (a troca remonta o editor).
        if (novo) aoSalvar?.(id);
      }
      setQual(null);
    });
  }

  function irParaProduto() {
    if (produtoId) router.push(`/produtos/${produtoId}`);
  }

  /** "Editar produto": com alteracao nao salva, pergunta antes; sem, abre direto (na mesma aba). */
  function abrirProduto() {
    if (alterado) setPergunta("produto");
    else irParaProduto();
  }

  function salvarEAbrirProduto() {
    setPergunta(null);
    setQual("salvar");
    iniciarTrabalho(async () => {
      if (await gravar({ avisar: false })) irParaProduto();
      setQual(null);
    });
  }

  const propsDasAbas = {
    rascunho,
    contexto,
    alterar,
    setContexto,
    irPara: mudarAba,
    anuncioId: idAtual,
    vinculo: vinculoAtual,
    recarregarCategorias,
    leitura,
    abrirProduto,
  };
  const rotuloDoStatus = STATUS_LI[statusAtual] ?? (idAtual ? STATUS_LI.RASCUNHO : { rotulo: "Novo", tom: "neutro" });

  // O estado da loja em uma linha, acima das abas: o que o pop-up do icone dizia.
  let situacaoDaLoja = null;
  if (leitura && !leitura.ok) {
    situacaoDaLoja = { tipo: "erro", texto: leitura.erro ?? "Nao foi possivel ler a Loja Integrada.", lerDeNovo: true };
  } else if (leitura?.ok && leitura.situacao === "nao_existe") {
    situacaoDaLoja = {
      tipo: "info",
      texto: `O codigo ${leitura.sku} nao esta na Loja Integrada. "Cadastrar na LI" cria o produto INATIVO com este anuncio; preco e estoque chegam pelo Bling.`,
    };
  } else if (leitura?.vinculadoAgora) {
    situacaoDaLoja = { tipo: "ok", texto: `Vinculado agora pelo codigo (id ${leitura.idExterno}): as categorias e o destaque vieram da loja.` };
  }

  const avisos = (
    <>
      {mensagem && (
        <div ref={caixaDaMensagem} role={mensagem.tipo === "erro" ? "alert" : "status"} className={`rounded border px-3 py-2 text-sm ${CLASSE_DA_MENSAGEM[mensagem.tipo]}`}>
          {mensagem.texto}
        </div>
      )}
      {envio && (
        <div role="status" className={`rounded border px-3 py-2 text-sm ${CLASSE_DA_MENSAGEM[envio.ok ? "ok" : "atencao"]}`}>
          <p className="flex items-start gap-1.5 font-medium">
            {envio.ok && <CircleCheck size={15} className="mt-0.5 shrink-0" />}
            {envio.titulo}
          </p>
          {envio.linhas.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              {envio.linhas.map((linha, indice) => (
                <li key={`${indice}-${linha}`}>{linha}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {situacaoDaLoja && (
        <div className={`flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-xs ${CLASSE_DA_MENSAGEM[situacaoDaLoja.tipo]}`}>
          <span className="min-w-0 flex-1">{situacaoDaLoja.texto}</span>
          {situacaoDaLoja.lerDeNovo && (
            <button type="button" onClick={lerLoja} disabled={lendo} className="rounded border border-current px-2 py-0.5 hover:bg-white/50 disabled:opacity-60">
              Ler de novo
            </button>
          )}
        </div>
      )}
    </>
  );
  const temAviso = Boolean(mensagem || envio || situacaoDaLoja);

  const barra = (
    <div inert={travado}>
      <BarraDeAbas
        abas={abas}
        aba={abaVisivel}
        aoMudar={mudarAba}
        comErro={(id) => id === "divergencias" || problemas.some((problema) => problema.aba === id && problema.bloqueante)}
      />
    </div>
  );

  const paineis = (
    <div inert={travado} aria-busy={travado} className={travado ? "opacity-70" : undefined}>
      {divergencias > 0 && (
        <Painel id="divergencias" aba={abaVisivel}>
          <AbaDivergencias leitura={leitura} lerLoja={lerLoja} lendo={lendo} />
        </Painel>
      )}
      {ABAS_LI.map(({ id }) => {
        const Aba = ABAS_PRONTAS[id];
        return (
          <Painel key={id} id={id} aba={abaVisivel}>
            <Aba {...propsDasAbas} problemas={problemas.filter((problema) => problema.aba === id)} {...(id === "previa" ? { todosProblemas: problemas } : {})} />
          </Painel>
        );
      })}
    </div>
  );

  let rotuloDoEnvio = tipoDeEnvio === "cadastrar" ? "Cadastrar na LI" : "Sincronizar com a LI";
  if (lendo && !leitura) rotuloDoEnvio = "Lendo a loja...";
  else if (qual === "enviar") rotuloDoEnvio = "Enviando...";
  else if (qual === "lendo") rotuloDoEnvio = "Atualizando...";

  const rodape = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="flex items-center gap-2 text-xs">
        <Badge tom={rotuloDoStatus.tom}>{rotuloDoStatus.rotulo}</Badge>
        {alterado ? <span className="text-amber-700">Alteracoes nao salvas</span> : idAtual && <span className="text-suave">Tudo salvo</span>}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={pedirEnvio}
          disabled={ocupado || (lendo && !leitura) || !produtoId}
          title={leitura?.ok && leitura.escrita?.liberada === false ? leitura.escrita.motivo : undefined}
          className="inline-flex items-center gap-1.5 rounded border border-acento bg-superficie px-4 py-2 text-sm font-medium text-acento hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-50"
        >
          {(qual === "enviar" || qual === "lendo" || (lendo && !leitura)) && <Loader size={14} className="animate-spin" />}
          {rotuloDoEnvio}
        </button>
        <button
          type="button"
          onClick={salvar}
          disabled={ocupado}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {qual === "salvar" && <Loader size={14} className="animate-spin" />}
          {qual === "salvar" ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );

  // Pergunta antes de sincronizar ou de abrir o produto com alteracao nao salva.
  const caixaDePergunta = pergunta && (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) setPergunta(null);
      }}
    >
      <section role="alertdialog" aria-modal="true" aria-labelledby="li-pergunta-titulo" className="w-full max-w-md rounded-lg border border-borda bg-superficie p-4 shadow-2xl">
        {pergunta === "enviar" ? (
          <>
            <p id="li-pergunta-titulo" className="text-sm font-semibold">
              Salvar antes de {tipoDeEnvio === "cadastrar" ? "cadastrar" : "sincronizar"}?
            </p>
            <p className="mt-1 text-sm text-suave">O envio leva o anuncio salvo. As alteracoes da tela precisam ser salvas antes.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setPergunta(null)} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo">
                Cancelar
              </button>
              <button type="button" onClick={salvarEEnviar} className="rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
                {tipoDeEnvio === "cadastrar" ? "Salvar e cadastrar" : "Salvar e sincronizar"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p id="li-pergunta-titulo" className="text-sm font-semibold">
              Abrir o produto com alteracoes nao salvas?
            </p>
            <p className="mt-1 text-sm text-suave">O cadastro do produto abre nesta mesma aba. O que nao for salvo neste anuncio sera perdido.</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" autoFocus onClick={() => setPergunta(null)} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo">
                Cancelar
              </button>
              <button type="button" onClick={irParaProduto} className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
                Abrir sem salvar
              </button>
              <button type="button" onClick={salvarEAbrirProduto} className="rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
                Salvar e abrir o produto
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );

  if (!janela) {
    return (
      <div className="space-y-4">
        {temAviso && <div className="space-y-2">{avisos}</div>}
        <div className="rounded-lg border border-borda bg-superficie">
          {barra}
          <div className="p-5">{paineis}</div>
        </div>
        <div className="sticky bottom-0 z-10 rounded-lg border border-borda bg-superficie shadow-lg">{rodape}</div>
        {caixaDePergunta}
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
        {temAviso && <div className="shrink-0 space-y-2 px-5 pt-3">{avisos}</div>}
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
      {caixaDePergunta}
    </div>
  );
}
