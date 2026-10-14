"use client";

import { useEffect } from "react";
import { CircleCheck } from "lucide-react";

import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * O aviso padrao de uma sincronizacao ou envio que DEU CERTO (pedido do dono em 14/10/2026: "ao finalizar a
 * sincronizacao, deve mostrar um popup informando que foi bem sucedida e um botao de OK"). Uma janelinha por
 * cima da janela do envio, com o que foi feito e o botao OK; so o sucesso passa por aqui, a falha continua em
 * vermelho dentro da janela (ela precisa ficar a vista enquanto o operador decide o que fazer).
 *
 * Usada pelo Bling (`JanelaBling`) e pela Loja Integrada (`EditorAnuncioLI`); quem sincronizar com outro canal
 * usa o mesmo componente, para a conclusao parecer igual em todo lugar.
 *
 * `aviso` e o que ficou pendente mesmo com o envio aceito (por exemplo, o Bling ainda baixando fotos): vai em
 * ambar abaixo da lista, para nao passar por "tudo certo".
 *
 * O Esc e ouvido na CAPTURA da janela e para ali: a janela do envio escuta o Esc no `document` para se fechar,
 * e sem isto o mesmo Esc fecharia as duas e o operador nao leria o resultado.
 *
 * @param {{titulo: string, mensagem?: string|null, linhas?: string[], aviso?: string|null, aoFechar: () => void}} props
 */
export default function ConclusaoDoEnvio({ titulo, mensagem = null, linhas = [], aviso = null, aoFechar }) {
  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key !== "Escape" && evento.key !== "Enter") return;
      evento.stopPropagation();
      evento.preventDefault();
      aoFechar();
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [aoFechar]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
      {...propsDoFundo(() => aoFechar())}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="conclusao-do-envio-titulo"
        className="w-full max-w-md rounded-lg border border-borda bg-superficie p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CircleCheck size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p id="conclusao-do-envio-titulo" className="text-base font-semibold">
              {titulo}
            </p>
            {mensagem && <p className="mt-0.5 text-sm text-suave">{mensagem}</p>}
          </div>
        </div>

        {linhas.length > 0 && (
          <ul className="mt-3 max-h-48 list-disc space-y-0.5 overflow-y-auto rounded border border-borda bg-fundo/60 py-2 pr-3 pl-7 text-xs">
            {linhas.map((linha, indice) => (
              <li key={`${indice}-${linha}`}>{linha}</li>
            ))}
          </ul>
        )}

        {aviso && <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{aviso}</p>}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            autoFocus
            onClick={aoFechar}
            className="min-w-24 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            OK
          </button>
        </div>
      </section>
    </div>
  );
}
