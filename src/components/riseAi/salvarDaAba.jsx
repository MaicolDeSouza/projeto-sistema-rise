"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { salvarAbaAcao } from "@/app/rise-ai/configuracoes/acoes";

/** O motivo que aparece no `title` do que fica travado para quem só pode ver a aba. */
export const MOTIVO_SO_LEITURA = "Você pode ver esta aba, mas não alterá-la. Peça a um administrador.";

/**
 * O envio de uma aba de Configurações: manda os campos (um `FormData`), guarda o erro de cada campo e o aviso do resultado,
 * e relê a página no fim para a tela mostrar o que ficou gravado. Envio manual com `startTransition`: o React 19 limpa um
 * formulário depois de uma action, e o que foi digitado voltaria ao valor antigo.
 *
 * @param {string} aba
 */
export function useSalvarAba(aba) {
  const router = useRouter();
  const [erros, setErros] = useState({});
  const [aviso, setAviso] = useState(null);
  const [pendente, iniciar] = useTransition();

  function salvar(dados) {
    setAviso(null);
    setErros({});
    iniciar(async () => {
      const resultado = await salvarAbaAcao(aba, dados);
      if (!resultado.ok) {
        setErros(resultado.erros ?? {});
        return setAviso({ tipo: "erro", texto: resultado.erro });
      }
      setAviso({ tipo: "ok", texto: "Salvo." });
      router.refresh();
    });
  }

  return { erros, aviso, pendente, salvar, limparAviso: () => setAviso(null) };
}

/** O fim de cada aba: o Salvar (a ação principal) e o resultado ao lado. Sem permissão de editar, o botão fica travado e diz por quê. */
export function RodapeDaAba({ pendente, aviso, podeEditar, sujo = true }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pendente || !podeEditar || !sujo}
        title={podeEditar ? (sujo ? undefined : "Nada para salvar.") : MOTIVO_SO_LEITURA}
        className="h-10 rounded-md bg-acento px-4 text-sm font-medium text-white transition-[opacity] duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
      >
        {pendente ? "Salvando…" : "Salvar"}
      </button>
      {aviso && (
        <span className={`text-sm ${aviso.tipo === "ok" ? "text-emerald-700" : "text-red-700"}`} role="status">
          {aviso.texto}
        </span>
      )}
    </div>
  );
}
