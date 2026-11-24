"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SlidersHorizontal } from "lucide-react";

import { salvarAjustesAcao } from "@/app/atendimento/acoes";
import { CLASSE_CAMPO } from "@/components/cadastros/Campo";
import { propsDoFundo } from "@/lib/fundoDaJanela";

const BOTAO = "inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";
const MAXIMO_DO_PROMPT = 4000;

/**
 * Os ajustes da sugestao da IA: o estilo que o dono quer nas respostas (saudacao, assinatura, tom) e o limite de
 * caracteres da resposta de pergunta. As regras que impedem a IA de inventar e de escrever o que o ML pune sao do codigo
 * e nao se editam aqui.
 */
export default function AjustesDoAtendimento({ prompt, limite, podeEditar }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(prompt);
  const [maximo, setMaximo] = useState(String(limite));
  const [erro, setErro] = useState(null);
  const [pendente, iniciar] = useTransition();
  const fechar = () => !pendente && setAberto(false);

  function salvar(evento) {
    evento.preventDefault();
    setErro(null);
    iniciar(async () => {
      const resposta = await salvarAjustesAcao({ prompt: texto, limite: Number(maximo) });
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível salvar.");
      setAberto(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="inline-flex items-center gap-1.5 rounded-md border border-borda px-3.5 py-2 text-sm font-medium hover:bg-fundo">
        <SlidersHorizontal size={15} aria-hidden="true" /> Ajustes da IA
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-16" {...propsDoFundo(fechar)}>
          <form onSubmit={salvar} role="dialog" aria-modal="true" aria-label="Ajustes da IA do Atendimento ML" className="w-full max-w-xl rounded-lg border border-borda bg-superficie p-5 shadow-2xl">
            <h2 className="font-semibold">Ajustes da IA</h2>
            <p className="mt-1 text-sm text-suave">Valem para o botão “Sugerir com IA”, na tela e no Telegram.</p>
            <fieldset disabled={!podeEditar || pendente} className="mt-4 flex min-w-0 flex-col gap-4">
              <label className="block text-sm font-semibold">
                Como você quer as respostas
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  rows={7}
                  maxLength={MAXIMO_DO_PROMPT}
                  placeholder={"Ex.: Comece com “Olá!”. Seja direto. Termine com “Equipe 4hobby”."}
                  className={`${CLASSE_CAMPO} border-borda leading-relaxed font-normal`}
                />
                <span className="mt-1 block text-xs font-normal text-suave tabular-nums">
                  {texto.length.toLocaleString("pt-BR")} de {MAXIMO_DO_PROMPT.toLocaleString("pt-BR")}. A IA nunca cita outro site, telefone ou e-mail, mesmo que você peça aqui.
                </span>
              </label>
              <label className="block text-sm font-semibold">
                Limite de caracteres da resposta
                <input type="number" min={100} max={2000} step={1} value={maximo} onChange={(e) => setMaximo(e.target.value)} className={`${CLASSE_CAMPO} w-32 border-borda tabular-nums`} />
                <span className="mt-1 block text-xs font-normal text-suave">De 100 a 2.000. O Mercado Livre recusa resposta longa demais.</span>
              </label>
            </fieldset>
            {!podeEditar && <p className="mt-3 text-sm text-amber-700">Só quem edita as Configurações do Rise AI altera estes ajustes.</p>}
            {erro && (
              <p role="alert" className="mt-3 text-sm text-red-600">
                {erro}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={fechar} className={`${BOTAO} border border-borda hover:bg-fundo`}>
                Cancelar
              </button>
              <button type="submit" disabled={!podeEditar || pendente} className={`${BOTAO} bg-acento text-white hover:bg-acento/90`}>
                {pendente && <Loader2 size={14} className="animate-spin" />} Salvar
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
