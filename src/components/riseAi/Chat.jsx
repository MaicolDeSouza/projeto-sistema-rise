"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe, Loader, Send, Square } from "lucide-react";

import { carregarMensagemAcao } from "@/app/rise-ai/acoes";
import Badge from "@/components/ui/Badge";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import ControlesDaConversa from "./ControlesDaConversa";
import MensagemDaIA from "./MensagemDaIA";
import ProporCorrecao from "./ProporCorrecao";
import SeloDoModelo from "./SeloDoModelo";
import TextoDaIA from "./TextoDaIA";
import { eventosDoFluxo } from "./fluxo";
import { rotuloDaFerramenta, rotuloDoMotivo } from "./formatos";

const MAXIMO_DA_PERGUNTA = 8000;
const ORCAMENTO_NORMAL = { nivel: "normal", percentual: 0 };
const DICA_DA_INTERNET = "A IA pode pesquisar dado técnico fora do catálogo; desligue em Configurações › Canais.";
const DICA_DO_ORCAMENTO = "Orçamento interno do mês esgotado; só o administrador aumenta.";

/**
 * O chat do Rise AI (spec §5a.1). Manda a pergunta para `POST /api/rise-ai/conversar` e desenha o fluxo de eventos: uma linha
 * de estado ("consultando produtos…") até o primeiro texto e, depois, o texto crescendo no lugar, sem caixa. Ao fim, busca a
 * mensagem gravada (com o modelo, o custo e a barra) e a põe na conversa.
 *
 * Enviar e Parar ocupam o mesmo lugar e o mesmo tamanho. Parar (e a tecla Esc) faz `POST /api/rise-ai/parar` e continua lendo
 * o fluxo até o `fim`, que vem com `interrompida: true`. Recarregar a página NÃO para a resposta.
 *
 * A conversa só nasce na primeira pergunta: o evento `inicio` traz o id e, ao fim, a URL troca para `/rise-ai/<id>`.
 *
 * @param {{ conversaId: string | null, titulo?: string, criadaEm?: string, mensagensIniciais: object[],
 *   padrao: { provedor: string, modelo: string }, podeEnsinar?: boolean, internet?: boolean,
 *   orcamento?: { nivel: "normal" | "aviso" | "esgotado", percentual: number } }} props
 */
export default function Chat({ conversaId, titulo, criadaEm, mensagensIniciais, padrao, podeEnsinar = false, internet = false, orcamento = ORCAMENTO_NORMAL }) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState(mensagensIniciais);
  const [texto, setTexto] = useState("");
  const [fluxo, setFluxo] = useState(null);
  const [erro, setErro] = useState(null);
  const [segundos, setSegundos] = useState(0);
  const [parando, setParando] = useState(false);
  const idDaConversa = useRef(conversaId);
  const ultimaPergunta = useRef("");
  const fimDaLista = useRef(null);
  const campo = useRef(null);
  const respondendo = fluxo !== null;
  const bloqueado = orcamento.nivel === "esgotado";

  // O tempo corre enquanto o modelo pensa: um modelo local lê o prompt por dezenas de segundos antes do primeiro token.
  useEffect(() => {
    if (!respondendo) return undefined;
    const relogio = setInterval(() => setSegundos((atual) => atual + 1), 1000);
    return () => clearInterval(relogio);
  }, [respondendo]);

  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length, fluxo?.texto, fluxo?.ferramenta, erro]);

  // O campo cresce de 1 a 6 linhas (o teto é o `max-h` da classe) e volta a 1 linha depois de enviar.
  useEffect(() => {
    const elemento = campo.current;
    if (!elemento) return;
    elemento.style.height = "auto";
    elemento.style.height = `${elemento.scrollHeight}px`;
  }, [texto]);

  function falhar(mensagem) {
    setFluxo(null);
    setParando(false);
    setErro(mensagem);
  }

  async function concluir(mensagemId) {
    const resultado = await carregarMensagemAcao(mensagemId);
    if (!resultado.ok) return falhar(resultado.erro);
    setMensagens((atuais) => [...atuais, resultado.mensagem]);
    setFluxo(null);
    setParando(false);
    // Conversa nova: troca a URL (a página reabre já com a conversa). Existente: só atualiza a lista lateral e o orçamento.
    if (conversaId) router.refresh();
    else router.replace(`/rise-ai/${idDaConversa.current}`);
  }

  async function enviar(pergunta, { repetindo = false } = {}) {
    ultimaPergunta.current = pergunta;
    setErro(null);
    setSegundos(0);
    setParando(false);
    if (!repetindo) setMensagens((atuais) => [...atuais, { id: `local-${Date.now()}`, papel: "USUARIO", conteudo: pergunta }]);
    setFluxo({ texto: "", ferramenta: null, reserva: null, provedor: padrao.provedor, modelo: padrao.modelo, modo: null, conversaId: idDaConversa.current });

    let resposta;
    try {
      resposta = await fetch("/api/rise-ai/conversar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversaId: idDaConversa.current, texto: pergunta }),
      });
    } catch {
      return falhar("Não consegui falar com o servidor do Rise. Confira a conexão e tente de novo.");
    }
    if (!resposta.ok || !resposta.body) return falhar(`O servidor recusou o pedido (${resposta.status}).`);

    let terminou = false;
    try {
      for await (const { nome, dados } of eventosDoFluxo(resposta.body)) {
        if (nome === "inicio") {
          idDaConversa.current = dados.conversaId;
          setFluxo((atual) => atual && { ...atual, conversaId: dados.conversaId, provedor: dados.provedor, modelo: dados.modelo, modo: dados.modo ?? null });
        } else if (nome === "texto") {
          setFluxo((atual) => atual && { ...atual, texto: atual.texto + dados.delta });
        } else if (nome === "descartar") {
          setFluxo((atual) => atual && { ...atual, texto: "" });
        } else if (nome === "ferramenta") {
          setFluxo((atual) => atual && { ...atual, ferramenta: dados.estado === "inicio" ? dados.nome : null });
        } else if (nome === "reserva") {
          setFluxo((atual) => atual && { ...atual, texto: "", reserva: dados.motivo, provedor: dados.provedor, modelo: dados.modelo });
        } else if (nome === "fim") {
          terminou = true;
          await concluir(dados.mensagemId);
        } else if (nome === "erro") {
          terminou = true;
          falhar(dados.mensagem);
        }
      }
    } catch {
      if (!terminou) return falhar("A conexão caiu no meio da resposta. Atualize a página: a resposta pode ter sido gravada.");
    }
    if (!terminou) falhar("A resposta terminou sem a mensagem final. Atualize a página.");
  }

  /** O botão Parar: pedido explícito ao servidor (fechar a conexão não para nada). O fluxo continua até o `fim`. */
  async function parar() {
    if (!fluxo?.conversaId || parando) return;
    setParando(true);
    try {
      await fetch("/api/rise-ai/parar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversaId: fluxo.conversaId }),
      });
    } catch {
      // Sem resposta do pedido: o fluxo segue e, se a conexão caiu, o aviso vem dele.
    }
  }
  const pararComEsc = useEffectEvent(() => parar());
  useEffect(() => {
    if (!respondendo) return undefined;
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") pararComEsc();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [respondendo]);

  /** Repete a última pergunta (a da sessão, ou, depois de recarregar a página, a última do usuário na conversa). */
  function tentarDeNovo() {
    const pergunta = ultimaPergunta.current || [...mensagens].reverse().find((mensagem) => mensagem.papel === "USUARIO")?.conteudo;
    if (pergunta) enviar(pergunta, { repetindo: true });
  }

  function aoEnviar(evento) {
    evento?.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta || respondendo || bloqueado) return;
    setTexto("");
    enviar(pergunta);
  }

  // O modelo da barra: o que está respondendo agora, senão o da última resposta, senão o padrão da configuração.
  const ultimaDaIA = [...mensagens].reverse().find((mensagem) => mensagem.papel === "ASSISTENTE" && mensagem.modelo);
  const ativo = fluxo ?? (ultimaDaIA ? { provedor: ultimaDaIA.provedor, modelo: ultimaDaIA.modelo } : padrao);
  const botaoDoLugar = "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-[background-color,border-color,opacity] duration-150 focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:opacity-50";

  return (
    <section className="flex h-[75vh] min-h-96 min-w-0 flex-1 flex-col rounded-lg border border-borda bg-superficie lg:h-full">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-borda px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-1">
          <h1 className="truncate text-sm font-semibold [text-wrap:balance]">{titulo ?? "Nova conversa"}</h1>
          {conversaId && titulo && criadaEm && <ControlesDaConversa conversaId={conversaId} titulo={titulo} criadaEm={criadaEm} />}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-suave">
          {internet && (
            <span title={DICA_DA_INTERNET}>
              <Badge tom="info">
                <Globe size={12} className="mr-1" /> Internet ligada
              </Badge>
            </span>
          )}
          {orcamento.nivel === "aviso" && (
            <span title="O gasto do mês com a IA passou de 80% do orçamento interno.">
              <Badge tom="alerta">
                Orçamento interno <span className="ml-1 tabular-nums">{Math.round(orcamento.percentual)} %</span>
              </Badge>
            </span>
          )}
          <span>Respondendo com:</span>
          {ativo.modelo ? (
            <SeloDoModelo provedor={ativo.provedor} modelo={ativo.modelo} reserva={Boolean(fluxo?.reserva)} />
          ) : (
            <Link href="/rise-ai/configuracoes" className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 hover:underline">
              nenhum modelo escolhido — configurar
            </Link>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {mensagens.length === 0 && !respondendo && (
          <div className="m-auto max-w-md text-center text-sm text-suave [text-wrap:pretty]">
            <p className="font-medium text-texto">Pergunte ou cole a mensagem do cliente.</p>
            <p className="mt-1">A resposta vem com preço, estoque e link reais do catálogo.</p>
          </div>
        )}

        {mensagens.map((mensagem) =>
          mensagem.papel === "USUARIO" ? (
            <div key={mensagem.id} className="max-w-[85%] self-end rounded-lg bg-acento/10 px-4 py-2.5 text-sm whitespace-pre-line [text-wrap:pretty]">
              {mensagem.conteudo}
            </div>
          ) : (
            <MensagemDaIA key={mensagem.id} mensagem={mensagem} aoTentarDeNovo={tentarDeNovo}>
              {podeEnsinar && !mensagem.id.startsWith("local-") && <ProporCorrecao mensagem={mensagem} />}
            </MensagemDaIA>
          ),
        )}

        {fluxo && (
          <div className="flex flex-col gap-1">
            {fluxo.reserva && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Usando o modelo de <strong>reserva</strong>: {rotuloDoMotivo(fluxo.reserva)}.
              </p>
            )}
            {fluxo.texto ? (
              <TextoDaIA texto={fluxo.texto} />
            ) : (
              <p className="flex items-center gap-2 text-sm text-suave" role="status">
                <Loader size={15} className="animate-spin motion-reduce:animate-none" />
                {fluxo.ferramenta ? rotuloDaFerramenta(fluxo.ferramenta) : "pensando…"}
                <span className="tabular-nums">{segundos} s</span>
                {fluxo.modo === "cliente" && <Badge tom="info">texto para o cliente</Badge>}
              </p>
            )}
            {/* A altura da barra da resposta fica reservada desde o início: o texto cresce sem empurrar nada. */}
            <div className="min-h-10" aria-hidden="true" />
          </div>
        )}

        {erro && !respondendo && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
            <p>{erro}</p>
            <button
              type="button"
              onClick={tentarDeNovo}
              className="mt-3 inline-flex h-10 items-center rounded-md border border-red-300 bg-white px-3 text-xs font-medium text-red-800 transition-[background-color,border-color,opacity] duration-150 hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
            >
              Tentar de novo
            </button>
          </div>
        )}
        <div ref={fimDaLista} />
      </div>

      {bloqueado && (
        <p className="border-t border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800" role="alert">
          {DICA_DO_ORCAMENTO}
        </p>
      )}
      <form onSubmit={aoEnviar} className="flex items-end gap-2 border-t border-borda p-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="pergunta-rise-ai" className="mb-1 flex items-center gap-1 text-xs font-medium text-suave">
            Pergunta do cliente ou sua
            <BolhaDeAjuda texto="Telefone, e-mail e CPF que você colar aqui são mascarados antes de serem guardados e antes de irem para qualquer IA. A resposta não precisa deles." variante="inline" />
          </label>
          <textarea
            id="pergunta-rise-ai"
            ref={campo}
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter" && !evento.shiftKey) aoEnviar(evento);
            }}
            rows={1}
            maxLength={MAXIMO_DA_PERGUNTA}
            disabled={respondendo || bloqueado}
            title={bloqueado ? DICA_DO_ORCAMENTO : undefined}
            placeholder="Cole a pergunta do cliente ou escreva a sua… (Enter envia, Shift+Enter quebra a linha)"
            className="max-h-36 min-h-10 w-full resize-none overflow-y-auto rounded-md border border-borda bg-superficie px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:opacity-60"
          />
        </div>
        {/* Enviar e Parar no mesmo lugar e do mesmo tamanho: nada salta quando um vira o outro. */}
        <div className="h-10 w-28 shrink-0">
          {respondendo ? (
            <button
              type="button"
              onClick={parar}
              disabled={parando || !fluxo?.conversaId}
              title={!fluxo?.conversaId ? "A conversa ainda está começando" : "Parar a resposta (Esc)"}
              className={`${botaoDoLugar} border border-borda bg-superficie text-texto hover:bg-fundo`}
            >
              <Square size={14} /> {parando ? "Parando…" : "Parar"}
            </button>
          ) : (
            <button
              type="submit"
              disabled={!texto.trim() || bloqueado}
              title={bloqueado ? DICA_DO_ORCAMENTO : !texto.trim() ? "Escreva a pergunta" : undefined}
              className={`${botaoDoLugar} bg-acento text-white`}
            >
              <Send size={15} /> Enviar
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
