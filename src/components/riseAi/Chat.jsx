"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader, Send } from "lucide-react";

import { carregarMensagemAcao } from "@/app/rise-ai/acoes";
import { separarResposta } from "@/lib/riseAi/resposta";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import ControlesDaConversa from "./ControlesDaConversa";
import MensagemDaIA, { QuadroDoCliente } from "./MensagemDaIA";
import SeloDoModelo from "./SeloDoModelo";
import { eventosDoFluxo } from "./fluxo";
import { rotuloDoMotivo } from "./formatos";

const MAXIMO_DA_PERGUNTA = 8000;

/**
 * O chat do Rise AI. Manda a pergunta para `POST /api/rise-ai/conversar` e desenha o fluxo de eventos: o texto à medida
 * que o modelo escreve, "consultando produtos…" quando ele chama uma ferramenta, a faixa da reserva quando o modelo
 * padrão falha. Ao fim, busca a mensagem gravada (com os cartões, o modelo e o custo) e a põe na conversa.
 *
 * A conversa só nasce na primeira pergunta: o evento `inicio` traz o id e, ao fim, a URL troca para `/rise-ai/<id>`.
 *
 * @param {{ conversaId: string | null, titulo?: string, criadaEm?: string, mensagensIniciais: object[],
 *   padrao: { provedor: string, modelo: string }, administrador: boolean }} props
 */
export default function Chat({ conversaId, titulo, criadaEm, mensagensIniciais, padrao }) {
  const router = useRouter();
  const [mensagens, setMensagens] = useState(mensagensIniciais);
  const [texto, setTexto] = useState("");
  const [fluxo, setFluxo] = useState(null);
  const [erro, setErro] = useState(null);
  const [segundos, setSegundos] = useState(0);
  const idDaConversa = useRef(conversaId);
  const ultimaPergunta = useRef("");
  const fimDaLista = useRef(null);
  const respondendo = fluxo !== null;

  // O tempo corre enquanto o modelo pensa: um modelo local lê o prompt por dezenas de segundos antes do primeiro token.
  useEffect(() => {
    if (!respondendo) return undefined;
    const relogio = setInterval(() => setSegundos((atual) => atual + 1), 1000);
    return () => clearInterval(relogio);
  }, [respondendo]);

  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length, fluxo?.texto, fluxo?.ferramenta, erro]);

  function falhar(mensagem) {
    setFluxo(null);
    setErro(mensagem);
  }

  async function concluir(mensagemId) {
    const resultado = await carregarMensagemAcao(mensagemId);
    if (!resultado.ok) return falhar(resultado.erro);
    setMensagens((atuais) => [...atuais, resultado.mensagem]);
    setFluxo(null);
    // Conversa nova: troca a URL (a página reabre já com a conversa). Existente: só atualiza a lista lateral.
    if (conversaId) router.refresh();
    else router.replace(`/rise-ai/${idDaConversa.current}`);
  }

  async function enviar(pergunta, { repetindo = false } = {}) {
    ultimaPergunta.current = pergunta;
    setErro(null);
    setSegundos(0);
    if (!repetindo) setMensagens((atuais) => [...atuais, { id: `local-${Date.now()}`, papel: "USUARIO", conteudo: pergunta }]);
    setFluxo({ texto: "", ferramenta: null, reserva: null, provedor: padrao.provedor, modelo: padrao.modelo });

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
          setFluxo((atual) => atual && { ...atual, provedor: dados.provedor, modelo: dados.modelo });
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

  /** Repete a última pergunta (a da sessão, ou, depois de recarregar a página, a última do usuário na conversa). */
  function tentarDeNovo() {
    const pergunta = ultimaPergunta.current || [...mensagens].reverse().find((mensagem) => mensagem.papel === "USUARIO")?.conteudo;
    if (pergunta) enviar(pergunta, { repetindo: true });
  }

  function aoEnviar(evento) {
    evento?.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta || respondendo) return;
    setTexto("");
    enviar(pergunta);
  }

  // O modelo da barra: o que está respondendo agora, senão o da última resposta, senão o padrão da configuração.
  const ultimaDaIA = [...mensagens].reverse().find((mensagem) => mensagem.papel === "ASSISTENTE" && mensagem.modelo);
  const ativo = fluxo ?? (ultimaDaIA ? { provedor: ultimaDaIA.provedor, modelo: ultimaDaIA.modelo } : padrao);
  const parcial = fluxo ? separarResposta(fluxo.texto) : null;

  return (
    <section className="flex h-[75vh] min-h-96 min-w-0 flex-1 flex-col rounded-lg border border-borda bg-superficie lg:h-full">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-borda px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-1">
          <h1 className="truncate text-sm font-semibold">{titulo ?? "Nova conversa"}</h1>
          {conversaId && titulo && criadaEm && <ControlesDaConversa conversaId={conversaId} titulo={titulo} criadaEm={criadaEm} />}
        </div>
        <div className="flex items-center gap-2 text-xs text-suave">
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
          <div className="m-auto max-w-md text-center text-sm text-suave">
            <p className="font-medium text-texto">Cole a pergunta do cliente aqui.</p>
            <p className="mt-1">O Rise AI procura no catálogo, confere preço e estoque e escreve a resposta pronta para você copiar e enviar.</p>
          </div>
        )}

        {mensagens.map((mensagem) =>
          mensagem.papel === "USUARIO" ? (
            <div key={mensagem.id} className="max-w-[85%] self-end rounded-lg bg-acento/10 px-4 py-2.5 text-sm whitespace-pre-line">
              {mensagem.conteudo}
            </div>
          ) : (
            <MensagemDaIA key={mensagem.id} mensagem={mensagem} aoTentarDeNovo={tentarDeNovo} />
          ),
        )}

        {fluxo && (
          <div className="flex flex-col gap-3 rounded-lg border border-borda bg-fundo p-4">
            {fluxo.reserva && (
              <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                Usando o modelo de <strong>reserva</strong>: {rotuloDoMotivo(fluxo.reserva)}.
              </p>
            )}
            {parcial.respostaCliente ? (
              <QuadroDoCliente texto={parcial.respostaCliente} gerando />
            ) : (
              <p className="flex items-center gap-2 text-sm text-suave" role="status">
                <Loader size={15} className="animate-spin" />
                {fluxo.ferramenta ? "Consultando produtos…" : "Pensando…"} {segundos} s
              </p>
            )}
          </div>
        )}

        {erro && !respondendo && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
            <p>{erro}</p>
            <button
              type="button"
              onClick={tentarDeNovo}
              className="mt-3 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
            >
              Tentar de novo
            </button>
          </div>
        )}
        <div ref={fimDaLista} />
      </div>

      <form onSubmit={aoEnviar} className="flex items-end gap-2 border-t border-borda p-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="pergunta-rise-ai" className="mb-1 flex items-center gap-1 text-xs font-medium text-suave">
            Pergunta do cliente ou sua
            <BolhaDeAjuda texto="Telefone, e-mail e CPF que você colar aqui são mascarados antes de serem guardados e antes de irem para qualquer IA. A resposta não precisa deles." variante="inline" />
          </label>
          <textarea
            id="pergunta-rise-ai"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
            onKeyDown={(evento) => {
              if (evento.key === "Enter" && !evento.shiftKey) aoEnviar(evento);
            }}
            rows={2}
            maxLength={MAXIMO_DA_PERGUNTA}
            disabled={respondendo}
            placeholder="Cole a pergunta do cliente ou escreva a sua… (Enter envia, Shift+Enter quebra a linha)"
            className="w-full resize-none rounded-md border border-borda bg-superficie px-3 py-2 text-sm disabled:opacity-60"
          />
        </div>
        <button type="submit" disabled={respondendo || !texto.trim()} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-acento px-4 text-sm font-medium text-white disabled:opacity-50">
          <Send size={15} /> Enviar
        </button>
      </form>
    </section>
  );
}
