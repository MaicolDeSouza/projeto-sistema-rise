"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { cancelarEtiquetaAcao } from "@/app/envios/acoes";
import { CLASSE_CAMPO } from "@/components/cadastros/Campo";
import { numeroDoEnvio } from "@/lib/frete/regras";
import { propsDoFundo } from "@/lib/fundoDaJanela";
import { formatoDeMoeda } from "@/lib/dinheiro";

const moeda = formatoDeMoeda();
const BOTAO = "inline-flex items-center gap-1.5 rounded px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";

/** Cancelar a etiqueta ainda nao postada: diz o que volta a carteira e quando, antes do botao vermelho (regra 9). */
export default function JanelaDeCancelamento({ envio, aoFechar, aoConcluir }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState(null);
  const [pendente, iniciar] = useTransition();
  const fechar = () => !pendente && aoFechar();

  function cancelar() {
    iniciar(async () => {
      const resposta = await cancelarEtiquetaAcao(envio.id, motivo.trim() || "Cancelado pelo Rise");
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível cancelar.");
      aoConcluir();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 pt-24" {...propsDoFundo(fechar)}>
      <section role="alertdialog" aria-modal="true" aria-label="Cancelar etiqueta" className="w-full max-w-md rounded-lg border border-borda bg-superficie p-5 shadow-2xl">
        <h2 className="font-semibold">Cancelar a etiqueta do {numeroDoEnvio(envio.numero)}?</h2>
        <p className="mt-2 text-sm text-suave">
          {envio.custo !== null && envio.custo !== undefined ? `${moeda.format(envio.custo)} voltam` : "O valor volta"} à carteira do Melhor Envio em até 12 horas. Não
          dá para cancelar depois de postado.
        </p>
        <label className="mt-4 block text-sm font-semibold">
          Motivo
          <input value={motivo} maxLength={255} onChange={(e) => setMotivo(e.target.value)} placeholder="Opcional" className={`${CLASSE_CAMPO} border-borda`} />
        </label>
        {erro && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {erro}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={fechar} autoFocus className={`${BOTAO} border border-borda hover:bg-fundo`}>
            Manter
          </button>
          <button type="button" onClick={cancelar} disabled={pendente} className={`${BOTAO} bg-red-600 text-white hover:bg-red-700`}>
            {pendente && <Loader2 size={14} className="animate-spin" />}
            Cancelar etiqueta
          </button>
        </div>
      </section>
    </div>
  );
}
