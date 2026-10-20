"use client";

import { useActionState } from "react";
import { KeyRound, Loader } from "lucide-react";

import { decidirAutorizacaoAcao } from "@/app/mcp/oauth/authorize/acoes";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";

const PRINCIPAL =
  "inline-flex h-10 items-center justify-center gap-2 rounded-md bg-acento px-5 text-sm font-medium text-white transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50";
const SECUNDARIO =
  "inline-flex h-10 items-center justify-center rounded-md border border-borda bg-superficie px-4 text-sm transition-[background-color] duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:opacity-50";

const AJUDA =
  "Cada consulta fica registrada (quem, qual ferramenta e quando) e as dúvidas anotadas aparecem na Revisão do dia do Rise AI. O acesso segue as permissões deste login: o que ele não vê no Rise, o assistente também não vê. Para desconectar, use a página do Rise AI.";

/**
 * O cartão da decisão. Os campos ocultos são os do pedido OAuth (nenhum é segredo); o login vem da sessão, no servidor.
 *
 * @param {{ login: string, cliente: string | null, destino: string | null, params: Record<string, string> | null, motivo: string | null }} props
 */
export default function Autorizar({ login, cliente, destino, params, motivo }) {
  const [estado, enviar, enviando] = useActionState(decidirAutorizacaoAcao, null);

  if (!params) {
    return (
      <section className="mx-auto mt-16 w-full max-w-md rounded-lg border border-borda bg-superficie p-6">
        <h1 className="text-base font-semibold text-balance">Pedido de acesso inválido</h1>
        <p className="mt-2 text-sm text-red-700 text-pretty">{motivo}</p>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-16 w-full max-w-md rounded-lg border border-borda bg-superficie p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-acento/10 text-acento">
          <KeyRound size={18} aria-hidden="true" />
        </span>
        <h1 className="flex items-center gap-1.5 text-base font-semibold text-balance">
          Autorizar o acesso ao Rise
          <BolhaDeAjuda variante="inline" texto={AJUDA} />
        </h1>
      </div>

      <p className="mt-4 text-sm text-pretty">
        <strong className="font-semibold">{cliente}</strong> <span className="text-suave">({destino})</span> quer consultar o Rise como{" "}
        <strong className="font-semibold">{login}</strong>.
      </p>
      <p className="mt-1 text-sm text-suave text-pretty">Pode consultar produtos, preços, estoque e o conhecimento, e anotar as dúvidas. Não altera nada.</p>

      <form action={enviar} className="mt-6 flex flex-wrap items-center gap-3">
        {Object.entries(params).map(([nome, valor]) => (
          <input key={nome} type="hidden" name={nome} value={valor} />
        ))}
        <button type="submit" name="decisao" value="autorizar" disabled={enviando} className={PRINCIPAL} autoFocus>
          {enviando && <Loader size={15} className="animate-spin" aria-hidden="true" />}
          Autorizar
        </button>
        <button type="submit" name="decisao" value="recusar" disabled={enviando} className={SECUNDARIO}>
          Recusar
        </button>
      </form>

      {estado?.erro && (
        <p className="mt-3 text-sm text-red-700" role="alert">
          {estado.erro}
        </p>
      )}
    </section>
  );
}
