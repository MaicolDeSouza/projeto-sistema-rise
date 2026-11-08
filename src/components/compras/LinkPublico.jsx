"use client";

import { useState, useTransition } from "react";
import { Check, Link2, Loader2 } from "lucide-react";

import { linkPublicoAcao } from "@/app/compras/acoes";

/**
 * "Link público" do pedido (pedido do dono em 07/11/2026): copia o endereco que o fornecedor abre sem login e que mostra
 * o pedido como no PDF, sempre o ultimo salvo. A chave nasce no primeiro clique e nunca muda (sem "trocar link", decisao
 * do dono). Quem nao ve custo nao tem o botao (a pagina mostra os precos), igual ao Baixar PDF.
 */
export default function LinkPublico({ pedido, alterado }) {
  const [estado, setEstado] = useState(null); // null | "copiado" | { erro }
  const [ocupado, iniciar] = useTransition();
  if (pedido.semPrecos) return null;

  function copiar() {
    iniciar(async () => {
      const resposta = await linkPublicoAcao(pedido.id);
      if (!resposta?.ok) {
        setEstado({ erro: resposta?.erro ?? "Não foi possível criar o link." });
        return;
      }
      try {
        await navigator.clipboard.writeText(resposta.url);
        setEstado("copiado");
        setTimeout(() => setEstado(null), 2500);
      } catch {
        // Navegador que nao deixa copiar: mostra o link para copiar a mao.
        window.prompt("Copie o link público do pedido:", resposta.url);
      }
    });
  }

  const titulo =
    estado?.erro ??
    (alterado ? "Copiar o link do pedido para o fornecedor. Ele mostra o que está salvo: salve para levar as alterações." : "Copiar o link do pedido para o fornecedor (sempre o pedido salvo, sem login)");
  return (
    <button
      type="button"
      onClick={copiar}
      disabled={ocupado}
      title={titulo}
      className={`inline-flex items-center gap-1.5 transition-colors ${estado === "copiado" ? "text-emerald-700" : estado?.erro ? "text-rose-600" : "text-texto hover:text-acento"}`}
    >
      {ocupado ? <Loader2 size={16} className="animate-spin" /> : estado === "copiado" ? <Check size={16} /> : <Link2 size={16} />}
      {estado === "copiado" ? "Link copiado" : "Link público"}
    </button>
  );
}
