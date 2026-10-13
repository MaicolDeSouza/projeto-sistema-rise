"use client";

import { RotateCcw } from "lucide-react";

import { textoPuroDoTexto } from "@/lib/riseAi/textoSeguro";
import BarraDaResposta from "./BarraDaResposta";
import TextoDaIA from "./TextoDaIA";
import { rotuloDoMotivo } from "./formatos";

/**
 * O texto que a IA está escrevendo, enquanto chega (o `Chat` o usa até a Tarefa 12 trocar o fluxo): texto corrido, sem caixa.
 * Existe só para o `Chat` de hoje continuar funcionando; sai quando o `Chat` passar a desenhar a resposta com `TextoDaIA`.
 */
export function QuadroDoCliente({ texto }) {
  return <TextoDaIA texto={texto} />;
}

/** Os endereços que podem ser clicáveis nesta resposta: o link da loja dos produtos citados e as fontes da pesquisa. */
function linksDaResposta(estruturado) {
  return [...(estruturado.produtos ?? []).map((produto) => produto.urlLoja), ...(estruturado.fontes ?? []).map((fonte) => fonte.url)].filter(Boolean);
}

/**
 * A resposta da IA como texto corrido, sem caixa (spec §5a.1), com a barra da resposta embaixo. `children` é o lugar do que
 * só quem ensina vê (Propor correção).
 *
 * Mensagens da Entrega 1 guardavam o texto com os títulos "### Resposta para o cliente" e "### Para a equipe" no `conteudo`:
 * elas são desenhadas pelo `estruturado.respostaCliente`, e o "Para a equipe" cru não aparece mais.
 *
 * @param {{ mensagem: object, aoTentarDeNovo?: () => void, children?: import("react").ReactNode }} props
 */
export default function MensagemDaIA({ mensagem, aoTentarDeNovo, children }) {
  const estruturado = mensagem.estruturado ?? {};
  const ehErro = mensagem.avisos?.includes("erro");

  if (ehErro) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <p>{mensagem.conteudo}</p>
        {aoTentarDeNovo && (
          <button
            type="button"
            onClick={aoTentarDeNovo}
            className="mt-3 inline-flex h-10 items-center gap-1 rounded-md border border-red-300 bg-white px-3 text-xs font-medium text-red-800 transition-[background-color,border-color,opacity] duration-150 hover:bg-red-100 focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
          >
            <RotateCcw size={13} /> Tentar de novo
          </button>
        )}
      </div>
    );
  }

  // Formato da Entrega 1: o texto do cliente já vem separado em `respostaCliente`.
  const texto = estruturado.respostaCliente || mensagem.conteudo;

  return (
    <div className="flex flex-col gap-1">
      {mensagem.motivoDaReserva && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Esta resposta veio do modelo de <strong>reserva</strong>: {rotuloDoMotivo(mensagem.motivoDaReserva)}.
        </p>
      )}
      {texto ? <TextoDaIA texto={texto} linksPermitidos={linksDaResposta(estruturado)} /> : <p className="text-sm text-suave">(sem texto)</p>}
      <BarraDaResposta mensagem={mensagem} textoParaCopiar={textoPuroDoTexto(texto)}>
        {children}
      </BarraDaResposta>
    </div>
  );
}
