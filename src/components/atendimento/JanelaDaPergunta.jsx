"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Link2, Loader2, Sparkles, X } from "lucide-react";

import { detalhesDaPerguntaAcao, enviarAcao, ignorarAcao, reabrirAcao, salvarRascunhoAcao, sugerirAcao } from "@/app/atendimento/acoes";
import { CLASSE_CAMPO } from "@/components/cadastros/Campo";
import { filtrarResposta, textoDoBarrado } from "@/lib/atendimentoML/filtro";
import { formatoDeMoeda } from "@/lib/dinheiro";
import { propsDoFundo } from "@/lib/fundoDaJanela";

import { haQuanto, SITUACAO_DO_ATENDIMENTO, textoDoKit } from "./formatos";

const moeda = formatoDeMoeda();
const BOTAO = "inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

const AVISO = {
  "produto-fora-do-rise": "Produto não encontrado no Rise: a sugestão usa só os dados do anúncio.",
  "anuncio-nao-lido": "O Mercado Livre não devolveu este anúncio agora: preço e disponibilidade podem faltar.",
  "ml-fora": "Mercado Livre não conectado ou fora do ar: sem os dados do anúncio agora.",
};
// Os avisos da conversa de pos-venda (fase 2).
const AVISO_DA_CONVERSA = {
  "pedido-fora-do-rise": "Pedido não encontrado no Rise: a sugestão usa só a conversa.",
  "ml-fora": "Mercado Livre não conectado ou fora do ar: a conversa abaixo é a última que o Rise guardou.",
};

const horaDaMensagem = (em) => (em ? new Date(em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

/** A conversa em baloes: o comprador a esquerda, a loja a direita, a hora embaixo. Mensagem so com arquivo abre no ML. */
function Conversa({ mensagens, urlNoML, longa }) {
  return (
    <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-md bg-fundo px-3 py-3">
      {longa && <p className="text-center text-xs text-suave">Conversa longa: só as 50 mensagens mais recentes aparecem aqui.</p>}
      {mensagens.map((mensagem) => {
        const daLoja = mensagem.de === "V";
        return (
          <div key={mensagem.id} className={`flex flex-col ${daLoja ? "items-end" : "items-start"}`}>
            <p className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${daLoja ? "bg-acento/10" : "border border-borda bg-superficie"} ${mensagem.retida ? "text-suave italic" : ""}`}>
              {mensagem.texto}
              {mensagem.anexos > 0 && urlNoML && (
                <a href={urlNoML} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs text-acento hover:underline">
                  {mensagem.anexos === 1 ? "1 anexo" : `${mensagem.anexos} anexos`}: abrir no ML <ExternalLink size={11} aria-hidden="true" />
                </a>
              )}
            </p>
            <span className="mt-0.5 text-[11px] text-suave tabular-nums">
              {daLoja ? "Loja" : "Comprador"} · {horaDaMensagem(mensagem.em)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A pergunta aberta: o que o comprador perguntou, o anuncio como esta no ML agora, a caixa da resposta e as tres acoes
 * (Sugerir com IA, Ignorar, Enviar ao ML). A resposta do ML nao pode ser editada depois de enviada: por isso o envio pede
 * uma confirmacao, e o texto que sai e exatamente o que esta na caixa.
 */
export default function JanelaDaPergunta({ linha, aoFechar }) {
  const router = useRouter();
  const [detalhes, setDetalhes] = useState(null);
  const [texto, setTexto] = useState(linha.rascunho ?? "");
  const [barrados, setBarrados] = useState([]);
  const [erro, setErro] = useState(null);
  const [nota, setNota] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [acao, setAcao] = useState(null);

  // Pos-venda (fase 2): a mesma janela, com a conversa e o pedido no lugar do anuncio, e o limite que o ML informou.
  const posVenda = linha.tipo === "POS_VENDA";
  const situacaoAtual = detalhes?.status ?? linha.status;
  const aberta = situacaoAtual === "ABERTA";
  const limite = detalhes?.limite ?? (posVenda ? (linha.limite ?? 350) : 2000);
  const bloqueio = posVenda ? (detalhes?.bloqueio ?? null) : null;
  const passou = texto.length > limite;
  // O mesmo filtro do servidor, enquanto o dono digita: ele ve o trecho que nao pode sair antes de tentar enviar. O
  // servidor confere de novo no envio (e o que ele barrar aparece em `barrados`).
  const aoVivo = useMemo(
    () =>
      texto.trim()
        ? filtrarResposta({ texto, origem: "DONO", limite })
            .barrados.filter((barrado) => barrado.motivo !== "tamanho")
            .map(textoDoBarrado)
        : [],
    [texto, limite],
  );
  const trechosBarrados = barrados.length ? barrados : aoVivo;

  useEffect(() => {
    let vivo = true;
    detalhesDaPerguntaAcao(linha.id).then((resposta) => {
      if (!vivo) return;
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível abrir.");
      setDetalhes(resposta);
      setTexto(resposta.rascunho ?? "");
    });
    return () => {
      vivo = false;
    };
  }, [linha.id]);

  // Rele a conversa sem trocar o que o dono digitou (chegou mensagem nova no meio do envio, ou o ML bloqueou).
  const recarregar = async () => {
    const resposta = await detalhesDaPerguntaAcao(linha.id);
    if (resposta?.ok) setDetalhes(resposta);
  };

  const fechar = () => {
    if (pendente) return;
    // O que foi digitado e nao enviado fica guardado como rascunho (so quando mudou e a pergunta segue aberta).
    if (aberta && detalhes && texto.trim() && texto.trim() !== (detalhes.rascunho ?? "").trim()) salvarRascunhoAcao(linha.id, texto).then(() => router.refresh());
    aoFechar();
  };

  function rodar(nome, trabalho) {
    setErro(null);
    setNota(null);
    setAcao(nome);
    iniciar(async () => {
      await trabalho();
      setAcao(null);
    });
  }

  function sugerir() {
    if (texto.trim() && !window.confirm("Trocar o texto digitado pela sugestão da IA?")) return;
    rodar("sugerir", async () => {
      const resposta = await sugerirAcao(linha.id);
      if (!resposta?.ok) return setErro(resposta?.erro ?? "A IA não respondeu.");
      setTexto(resposta.texto);
      setBarrados(resposta.barrados ?? []);
      setDetalhes((atual) => (atual ? { ...atual, rascunho: resposta.texto } : atual));
      setNota("Sugestão da IA: confira antes de enviar.");
    });
  }

  function enviar() {
    rodar("enviar", async () => {
      const resposta = await enviarAcao(linha.id, texto);
      setConfirmando(false);
      if (!resposta?.ok) {
        setBarrados(resposta?.barrados ?? []);
        setErro(resposta?.erro ?? "Não foi possível enviar.");
        if (resposta?.fechada) router.refresh();
        if (resposta?.recarregar || resposta?.fechada) await recarregar();
        return;
      }
      router.refresh();
      aoFechar();
    });
  }

  function ignorar() {
    rodar("ignorar", async () => {
      const resposta = await ignorarAcao(linha.id);
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível ignorar.");
      router.refresh();
      aoFechar();
    });
  }

  function reabrir() {
    rodar("reabrir", async () => {
      const resposta = await reabrirAcao(linha.id);
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível reabrir.");
      router.refresh();
      aoFechar();
    });
  }

  const inserirLink = (url) => setTexto((atual) => `${atual}${atual && !/\s$/.test(atual) ? " " : ""}${url}`);
  const anuncio = detalhes?.anuncio;
  const titulo = anuncio?.titulo || linha.anuncio?.titulo || "Anúncio fora do Rise";
  const kit = textoDoKit(anuncio?.unidadesDoKit ?? linha.anuncio?.unidadesDoKit);
  const motivoDoEnvio = detalhes?.motivoDoEnvioDesligado ?? null;
  const podeEnviar = aberta && Boolean(detalhes) && texto.trim() !== "" && !passou && !motivoDoEnvio && !bloqueio && aoVivo.length === 0;
  const pedido = detalhes?.pedido ?? null;
  const conversa = detalhes?.conversa?.length ? detalhes.conversa : [{ id: "ultima", de: "C", texto: detalhes?.textoDoCliente ?? linha.textoDoCliente, em: linha.recebidaEm, anexos: 0, retida: false }];
  const tituloDaConversa = pedido?.itens?.length ? `${pedido.itens[0].titulo}${pedido.itens.length > 1 ? ` e mais ${pedido.itens.length - 1}` : ""}` : linha.pedido?.primeiroItem || "Pedido fora do Rise";
  const fechada = posVenda ? { status: situacaoAtual, via: detalhes?.respondidaVia ?? linha.respondidaVia, em: detalhes?.respondidaEm ?? linha.respondidaEm, texto: detalhes?.respostaEnviada ?? linha.respostaEnviada } : { status: linha.status, via: linha.respondidaVia, em: linha.respondidaEm, texto: linha.respostaEnviada };
  const avisosDaJanela = (detalhes?.avisos ?? []).map((aviso) => (posVenda ? AVISO_DA_CONVERSA[aviso] : AVISO[aviso])).filter(Boolean);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-12" {...propsDoFundo(fechar)}>
      <section role="dialog" aria-modal="true" aria-label={posVenda ? "Mensagem de comprador do Mercado Livre" : "Pergunta do Mercado Livre"} className="w-full max-w-2xl rounded-lg border border-borda bg-superficie shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-borda px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs text-suave">
              {posVenda ? "Mensagem recebida" : "Pergunta recebida"} {haQuanto(linha.recebidaEm)} · {SITUACAO_DO_ATENDIMENTO[situacaoAtual]?.texto}
            </p>
            <h2 className="mt-0.5 truncate font-semibold" title={posVenda ? tituloDaConversa : titulo}>
              {posVenda ? tituloDaConversa : titulo}
            </h2>
            {posVenda && (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-suave">
                <span className="font-mono">Pedido {pedido?.numero ?? linha.pedido?.numero ?? linha.idExterno}</span>
                {pedido?.situacao && <span className="rounded bg-fundo px-1.5 py-0.5 font-medium text-texto">{pedido.situacao}</span>}
                {pedido?.envio?.situacao && <span>Envio: {pedido.envio.situacao}</span>}
                {pedido?.envio?.transportadora && <span>{pedido.envio.transportadora}</span>}
                {pedido?.envio?.rastreio && <span className="font-mono">{pedido.envio.rastreio}</span>}
                {pedido?.id && (
                  <a href={`/pedidos/${pedido.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-acento hover:underline">
                    Pedido no Rise <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
                {detalhes?.urlNoML && (
                  <a href={detalhes.urlNoML} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-acento hover:underline">
                    Abrir no ML <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </p>
            )}
            <p className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-suave ${posVenda ? "hidden" : ""}`}>
              {kit && <span className="rounded bg-fundo px-1.5 py-0.5 font-medium text-texto">{kit}</span>}
              <span className="font-mono">{linha.itemId}</span>
              {anuncio?.preco !== null && anuncio?.preco !== undefined && <span className="tabular-nums">{moeda.format(anuncio.preco)}</span>}
              {anuncio?.disponivel === true && <span className="text-emerald-700">Disponível</span>}
              {anuncio?.disponivel === false && <span className="text-amber-700">Indisponível no ML</span>}
              {anuncio?.url && (
                <a href={anuncio.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-acento hover:underline">
                  Abrir no ML <ExternalLink size={12} aria-hidden="true" />
                </a>
              )}
            </p>
          </div>
          <button type="button" onClick={fechar} aria-label="Fechar" className="-mr-1 rounded p-1.5 text-suave hover:bg-fundo hover:text-texto">
            <X size={18} />
          </button>
        </header>

        <div className="flex flex-col gap-4 px-5 py-4">
          {posVenda ? (
            <Conversa mensagens={conversa} urlNoML={detalhes?.urlNoML} longa={Boolean(detalhes?.longa)} />
          ) : (
            <div>
              <p className="text-xs font-semibold text-suave">O comprador perguntou</p>
              <p className="mt-1 rounded-md bg-fundo px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">{linha.textoDoCliente}</p>
            </div>
          )}

          {avisosDaJanela.map((aviso) => (
            <p key={aviso} className="text-sm text-amber-700">
              {aviso}
            </p>
          ))}

          {!detalhes && !erro && (
            <p className="inline-flex items-center gap-2 text-sm text-suave">
              <Loader2 size={14} className="animate-spin" /> {posVenda ? "Lendo a conversa no Mercado Livre…" : "Lendo o anúncio no Mercado Livre…"}
            </p>
          )}

          {aberta && bloqueio ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">{bloqueio}</p>
          ) : aberta ? (
            <div>
              <div className="flex items-end justify-between gap-3">
                <label htmlFor="resposta-ml" className="text-sm font-semibold">
                  Sua resposta
                </label>
                <span className={`text-xs tabular-nums ${passou ? "font-semibold text-red-600" : "text-suave"}`}>
                  {texto.length.toLocaleString("pt-BR")} de {limite.toLocaleString("pt-BR")}
                </span>
              </div>
              <textarea
                id="resposta-ml"
                value={texto}
                onChange={(evento) => {
                  setTexto(evento.target.value);
                  setBarrados([]);
                  setConfirmando(false);
                }}
                rows={6}
                disabled={!detalhes || pendente}
                placeholder="Escreva a resposta ou peça uma sugestão à IA."
                className={`${CLASSE_CAMPO} ${trechosBarrados.length || passou ? "border-amber-400" : "border-borda"} leading-relaxed font-normal disabled:opacity-60`}
              />
              {(detalhes?.outros ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-suave">Inserir o link de:</span>
                  {anuncio?.url && (
                    <button type="button" onClick={() => inserirLink(anuncio.url)} className="inline-flex items-center gap-1 rounded-full border border-borda px-2.5 py-1 text-xs hover:border-acento hover:text-acento">
                      <Link2 size={12} aria-hidden="true" /> este anúncio
                    </button>
                  )}
                  {detalhes.outros.map((outro) => (
                    <button key={outro.itemId} type="button" onClick={() => inserirLink(outro.url)} title={outro.titulo} className="inline-flex items-center gap-1 rounded-full border border-borda px-2.5 py-1 text-xs hover:border-acento hover:text-acento">
                      <Link2 size={12} aria-hidden="true" /> {textoDoKit(outro.unidadesDoKit) ?? "1 unidade"}
                      {outro.preco !== null && <span className="tabular-nums text-suave">{moeda.format(outro.preco)}</span>}
                    </button>
                  ))}
                </div>
              )}
              {trechosBarrados.map((linhaBarrada) => (
                <p key={linhaBarrada} role="alert" className="mt-2 text-sm text-amber-700">
                  {linhaBarrada}
                </p>
              ))}
              {nota && !trechosBarrados.length && <p className="mt-2 text-xs text-suave">{nota}</p>}
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold text-suave">
                {fechada.status === "IGNORADA" ? `Ignorada no Rise (a ${posVenda ? "conversa" : "pergunta"} continua no Mercado Livre)` : `Resposta ${fechada.via === "ML" ? "dada fora do Rise" : "enviada"}${fechada.em ? ` ${haQuanto(fechada.em)}` : ""}`}
              </p>
              {/* Na conversa a resposta ja aparece no ultimo balao da loja. */}
              {fechada.texto && !posVenda && <p className="mt-1 rounded-md border border-borda px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">{fechada.texto}</p>}
            </div>
          )}

          {(detalhes?.erroDoEnvio || erro) && (
            <p role="alert" className="text-sm text-red-600">
              {erro ?? `Último envio falhou: ${detalhes.erroDoEnvio}`}
            </p>
          )}

          {(detalhes?.respondidas ?? []).length > 0 && (
            <details className="rounded-md border border-borda px-3 text-sm">
              <summary className="-mx-3 cursor-pointer rounded-md px-3 py-2.5 text-suave select-none">Respostas anteriores neste anúncio ({detalhes.respondidas.length})</summary>
              <ul className="mb-3 flex flex-col gap-3">
                {detalhes.respondidas.map((item, indice) => (
                  <li key={indice}>
                    <p className="text-suave">{item.pergunta}</p>
                    <p className="mt-0.5">{item.resposta}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>

        <footer className="border-t border-borda px-5 py-4">
          {aberta && motivoDoEnvio && !bloqueio && <p className="mb-3 text-sm text-amber-700">{motivoDoEnvio}</p>}
          {confirmando ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium">Enviar ao Mercado Livre? Depois de enviada não dá para editar.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmando(false)} disabled={pendente} autoFocus className={`${BOTAO} border border-borda hover:bg-fundo`}>
                  Voltar
                </button>
                <button type="button" onClick={enviar} disabled={pendente} className={`${BOTAO} bg-acento text-white hover:bg-acento/90`}>
                  {acao === "enviar" && <Loader2 size={14} className="animate-spin" />} Enviar
                </button>
              </div>
            </div>
          ) : aberta && bloqueio ? (
            <div className="flex justify-end gap-2">
              <button type="button" onClick={ignorar} disabled={pendente} title="Tira a conversa das abertas no Rise. Ela continua no Mercado Livre." className={`${BOTAO} border border-borda hover:bg-fundo`}>
                {acao === "ignorar" && <Loader2 size={14} className="animate-spin" />} Ignorar
              </button>
              <button type="button" onClick={fechar} className={`${BOTAO} border border-borda hover:bg-fundo`}>
                Fechar
              </button>
            </div>
          ) : aberta ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={sugerir}
                disabled={!detalhes || pendente}
                title={posVenda ? "A IA lê a conversa, os itens do pedido e o rastreio. Só roda quando você clica." : "A IA lê o anúncio, o produto e suas respostas anteriores. Só roda quando você clica."}
                className={`${BOTAO} border border-acento text-acento hover:bg-acento/10`}
              >
                {acao === "sugerir" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Sugerir com IA
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={ignorar} disabled={pendente} title="Tira a pergunta das abertas no Rise. Ela continua no Mercado Livre." className={`${BOTAO} border border-borda hover:bg-fundo`}>
                  {acao === "ignorar" && <Loader2 size={14} className="animate-spin" />} Ignorar
                </button>
                <button type="button" onClick={() => setConfirmando(true)} disabled={!podeEnviar || pendente} className={`${BOTAO} bg-acento text-white hover:bg-acento/90`}>
                  Enviar ao ML
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              {situacaoAtual === "IGNORADA" && (
                <button type="button" onClick={reabrir} disabled={pendente} className={`${BOTAO} border border-borda hover:bg-fundo`}>
                  {acao === "reabrir" && <Loader2 size={14} className="animate-spin" />} Reabrir
                </button>
              )}
              <button type="button" onClick={fechar} className={`${BOTAO} border border-borda hover:bg-fundo`}>
                Fechar
              </button>
            </div>
          )}
        </footer>
      </section>
    </div>
  );
}
