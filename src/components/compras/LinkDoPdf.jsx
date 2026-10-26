"use client";

import { useState, useTransition } from "react";
import { FileDown, Loader2 } from "lucide-react";

import Pergunta from "./Pergunta";

/**
 * "Baixar PDF" do rodape do editor. O PDF sai do banco: com alteracao nao salva, pergunta antes (senao o fornecedor
 * receberia o pedido sem a ultima mudanca). Sem o custo, nao aparece (o PDF leva os precos).
 */
export default function LinkDoPdf({ pedido, alterado, salvar }) {
  const [perguntando, setPerguntando] = useState(false);
  const [ocupado, iniciar] = useTransition();
  if (pedido.semPrecos) return null;
  const endereco = `/api/compras/${pedido.id}/pdf`;

  return (
    <>
      <a
        href={endereco}
        target="_blank"
        rel="noreferrer"
        onClick={(evento) => {
          if (!alterado) return;
          evento.preventDefault();
          setPerguntando(true);
        }}
        className="inline-flex items-center gap-1.5 text-texto hover:text-acento"
      >
        {ocupado ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />} Baixar PDF
      </a>
      {perguntando && (
        <Pergunta
          titulo="Salvar antes de baixar?"
          confirmar="Salvar e baixar"
          ocupado={ocupado}
          aoRecuar={() => setPerguntando(false)}
          aoConfirmar={() =>
            iniciar(async () => {
              const salvo = await salvar();
              setPerguntando(false);
              if (salvo) window.open(endereco, "_blank", "noopener");
            })
          }
        >
          O PDF sai do que está salvo. Salve para ele levar as últimas alterações.
        </Pergunta>
      )}
    </>
  );
}
