"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2, Loader } from "lucide-react";

import { gerarRelatorioAgoraAcao } from "@/app/relatorios/acoes";

/**
 * "Gerar agora": o relatorio dos ultimos 7 dias com o que ja esta no banco, sem varrer nada. A rodada de verdade e a de
 * sabado 00:00; este botao serve para ver o formato ou quando a rodada nao rodou.
 */
export default function GerarAgora() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pendente}
        title="Monta o relatório dos últimos 7 dias com o que já está no banco, sem varrer as lojas"
        onClick={() => {
          setErro(null);
          iniciar(async () => {
            const resultado = await gerarRelatorioAgoraAcao();
            if (!resultado.ok) {
              setErro(resultado.erro);
              return;
            }
            router.refresh();
          });
        }}
        className="inline-flex items-center gap-1.5 rounded border border-borda bg-superficie px-3 py-2 text-sm font-medium hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendente ? <Loader size={15} className="animate-spin" /> : <FilePlus2 size={15} />}
        Gerar agora
      </button>
      {erro && <p role="alert" className="text-xs text-red-700">{erro}</p>}
    </div>
  );
}
