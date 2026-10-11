"use client";

import { useState } from "react";
import { BookOpen, Check, Copy, RotateCcw } from "lucide-react";

import Avaliacao from "./Avaliacao";
import CartaoDeProduto from "./CartaoDeProduto";
import SeloDoModelo from "./SeloDoModelo";
import { custoEmTexto, duracaoEmTexto, rotuloDoMotivo } from "./formatos";

const ROTULOS_DOS_AVISOS = {
  sem_separacao: "sem separação cliente/equipe",
  sem_resultado: "sem resultado no catálogo",
  limite_de_ferramentas: "limite de consultas",
  resposta_cortada: "resposta cortada",
  recusa: "recusa do modelo",
  sugestao_nao_gerada: "sugestão não gerada",
};

function BotaoCopiar({ texto }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sem permissão de área de transferência: a pessoa seleciona e copia à mão.
    }
  }
  return (
    <button type="button" onClick={copiar} className="inline-flex items-center gap-1 rounded-md border border-borda bg-superficie px-2 py-1 text-xs hover:bg-fundo" title="Copiar só este texto">
      {copiado ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

/**
 * O quadro com o texto que vai para o cliente (esboço 1A): destacado do resto, com o botão Copiar que copia SÓ ele.
 * Também desenha o texto que ainda está chegando (`gerando`), à medida que o modelo escreve.
 */
export function QuadroDoCliente({ texto, gerando = false }) {
  return (
    <div className="rounded-md border border-l-4 border-borda border-l-acento bg-superficie p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-medium tracking-wide text-suave uppercase">
          Resposta pronta para o cliente{gerando ? " — escrevendo…" : ""}
        </span>
        {!gerando && texto && <BotaoCopiar texto={texto} />}
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-line">{texto}</p>
    </div>
  );
}

/**
 * A resposta da IA, montada dos dados gravados na mensagem (`estruturado`): o texto do cliente em destaque, os produtos
 * que a resposta usou, "para a equipe" recolhido e, no rodapé, quem respondeu, quanto levou e custou, o conhecimento
 * usado e a avaliação. `children` é o lugar do que só o administrador vê (Propor correção).
 *
 * @param {{ mensagem: object, aoTentarDeNovo?: () => void, children?: import("react").ReactNode }} props
 */
export default function MensagemDaIA({ mensagem, aoTentarDeNovo, children }) {
  const estruturado = mensagem.estruturado ?? {};
  const ehErro = mensagem.avisos?.includes("erro");
  const tokens = (mensagem.tokensEntrada ?? 0) + (mensagem.tokensSaida ?? 0);
  const avisos = (mensagem.avisos ?? []).filter((aviso) => ROTULOS_DOS_AVISOS[aviso]);

  if (ehErro) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p>{mensagem.conteudo}</p>
        {aoTentarDeNovo && (
          <button type="button" onClick={aoTentarDeNovo} className="mt-3 inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-800 hover:bg-red-100">
            <RotateCcw size={13} /> Tentar de novo
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borda bg-fundo p-4">
      {mensagem.motivoDaReserva && (
        <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
          Esta resposta veio do modelo de <strong>reserva</strong>: {rotuloDoMotivo(mensagem.motivoDaReserva)}.
        </p>
      )}

      <QuadroDoCliente texto={estruturado.respostaCliente || mensagem.conteudo} />

      {estruturado.produtos?.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium tracking-wide text-suave uppercase">Produtos usados na resposta</p>
          <div className="flex flex-col gap-2">
            {estruturado.produtos.map((produto) => (
              <CartaoDeProduto key={produto.sku} produto={produto} />
            ))}
          </div>
        </div>
      )}

      {estruturado.outrosConsultados?.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-suave">Outros produtos consultados ({estruturado.outrosConsultados.length})</summary>
          <div className="mt-2 flex flex-col gap-2">
            {estruturado.outrosConsultados.map((produto) => (
              <CartaoDeProduto key={produto.sku} produto={produto} esmaecido />
            ))}
          </div>
        </details>
      )}

      {estruturado.paraEquipe && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-suave">Para a equipe</summary>
          <p className="mt-2 rounded-md border border-borda bg-superficie p-3 text-sm whitespace-pre-line">{estruturado.paraEquipe}</p>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-borda pt-3 text-xs text-suave">
        {mensagem.provedor && mensagem.modelo && <SeloDoModelo provedor={mensagem.provedor} modelo={mensagem.modelo} reserva={Boolean(mensagem.motivoDaReserva)} />}
        {mensagem.duracaoMs !== null && <span>{duracaoEmTexto(mensagem.duracaoMs)}</span>}
        {tokens > 0 && <span>{tokens.toLocaleString("pt-BR")} tokens</span>}
        <span>{custoEmTexto(mensagem.custoBrl)}</span>
        {estruturado.conhecimentoUsado?.length > 0 && (
          <span className="inline-flex items-center gap-1" title="Conhecimento aprovado pela loja que entrou nesta resposta">
            <BookOpen size={13} /> usou o conhecimento: {estruturado.conhecimentoUsado.map((nota) => nota.assunto).join("; ")}
          </span>
        )}
        {avisos.map((aviso) => (
          <span key={aviso} className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
            {ROTULOS_DOS_AVISOS[aviso]}
          </span>
        ))}
      </div>

      <Avaliacao mensagem={mensagem} />
      {children}
    </div>
  );
}
