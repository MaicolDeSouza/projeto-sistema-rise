"use client";

import { useState } from "react";
import { BookOpen, Check, Copy } from "lucide-react";

import Badge from "@/components/ui/Badge";
import Avaliacao from "./Avaliacao";
import SeloDoModelo from "./SeloDoModelo";
import { custoEmTexto, duracaoEmTexto } from "./formatos";

const ROTULOS_DOS_AVISOS = {
  sem_resultado: "sem resultado no catálogo",
  limite_de_ferramentas: "limite de consultas",
  resposta_cortada: "resposta cortada",
  recusa: "recusa do modelo",
  sugestao_nao_gerada: "sugestão não gerada",
  link_removido: "link removido do texto",
  termo_interno: "fala em dado interno",
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
    <button
      type="button"
      onClick={copiar}
      disabled={!texto}
      title="Copiar o texto desta resposta, sem formatação"
      className="inline-flex h-10 items-center gap-1.5 rounded-md border border-transparent px-2.5 text-xs font-medium text-suave transition-[background-color,border-color,opacity] duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:opacity-50"
    >
      {copiado ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
      {copiado ? "Copiado" : "Copiar"}
    </button>
  );
}

/**
 * A barra embaixo de cada resposta (spec §5a.1): Copiar, 👍, 👎 e "Propor correção" (o `children`, só para quem pode
 * ensinar) à esquerda; à direita, quem respondeu, quanto levou e quanto custou. Tem altura reservada (`min-h-10`), então a
 * resposta crescendo não faz nada pular. As caixas de comentário e de correção abrem numa linha própria embaixo.
 *
 * @param {{ mensagem: object, textoParaCopiar: string, children?: import("react").ReactNode }} props
 */
export default function BarraDaResposta({ mensagem, textoParaCopiar, children }) {
  const estruturado = mensagem.estruturado ?? {};
  const tokens = (mensagem.tokensEntrada ?? 0) + (mensagem.tokensSaida ?? 0);
  const avisos = (mensagem.avisos ?? []).filter((aviso) => ROTULOS_DOS_AVISOS[aviso]);
  const assuntos = (estruturado.conhecimentoUsado ?? []).map((nota) => nota.assunto);
  const estimado = Boolean(estruturado.custoEstimado);

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-x-1 gap-y-1 text-xs text-suave">
      <BotaoCopiar texto={textoParaCopiar} />
      <Avaliacao mensagem={mensagem} />
      {children}

      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1 tabular-nums">
        {mensagem.interrompida && <Badge>interrompida</Badge>}
        {estruturado.modo === "cliente" && <Badge tom="info">texto para o cliente</Badge>}
        {avisos.map((aviso) => (
          <Badge key={aviso} tom="alerta">
            {ROTULOS_DOS_AVISOS[aviso]}
          </Badge>
        ))}
        {assuntos.length > 0 && (
          <span className="inline-flex max-w-64 items-center gap-1" title={`Conhecimento aprovado que entrou nesta resposta: ${assuntos.join("; ")}`}>
            <BookOpen size={13} className="shrink-0" />
            <span className="truncate">{assuntos[0]}</span>
            {assuntos.length > 1 && <span className="shrink-0">+{assuntos.length - 1}</span>}
          </span>
        )}
        {mensagem.provedor && mensagem.modelo && <SeloDoModelo provedor={mensagem.provedor} modelo={mensagem.modelo} reserva={Boolean(mensagem.motivoDaReserva)} />}
        {mensagem.duracaoMs !== null && mensagem.duracaoMs !== undefined && <span>{duracaoEmTexto(mensagem.duracaoMs)}</span>}
        <span title={`${estimado ? "Estimado pelos caracteres (a resposta foi cortada). " : ""}${tokens.toLocaleString("pt-BR")} tokens`}>
          {custoEmTexto(mensagem.custoBrl, { estimado })}
        </span>
      </div>
    </div>
  );
}
