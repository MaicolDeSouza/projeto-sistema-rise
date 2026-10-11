"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader, Monitor } from "lucide-react";

import { varrerFontesDoPc } from "@/app/mercados/acoes";

/**
 * So no Rise do PC. Liga o worker do PC para TODAS as fontes marcadas "Varrer pelo PC" na VPS: ele abre o tunel,
 * varre com o IP de casa, grava direto no banco da VPS e desliga sozinho. Nao depende da copia do banco do PC.
 */
export default function BotaoVarrerFontesDoPc({ workerPc }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState(null);
  const rodando = Boolean(workerPc?.rodando);

  function varrer() {
    setErro(null);
    iniciar(async () => {
      const resultado = await varrerFontesDoPc();
      if (!resultado.ok) setErro(resultado.erro);
      router.refresh();
    });
  }

  return (
    <div className="mb-4 flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={varrer}
        disabled={pendente || rodando}
        className="inline-flex items-center gap-1.5 rounded border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-medium text-sky-900 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
        title="Varre pelo seu PC todas as fontes marcadas para isso na VPS e grava direto lá. Desliga sozinho ao terminar."
      >
        {pendente || rodando ? <Loader size={15} className="animate-spin" /> : <Monitor size={15} />}
        {rodando ? `Varrendo pelo PC${workerPc.fonteNome ? ` (${workerPc.fonteNome})` : ""}` : "Varrer fontes do PC"}
      </button>
      {erro && <span className="text-xs text-red-700">{erro}</span>}
    </div>
  );
}
