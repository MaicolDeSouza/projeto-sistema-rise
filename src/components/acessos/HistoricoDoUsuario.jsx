"use client";

import { useEffect, useState } from "react";
import { History, Loader } from "lucide-react";

import { historicoDoUsuarioAcao } from "@/app/configuracoes/acoes";
import EmptyState from "@/components/ui/EmptyState";

const QUANDO = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const BOTAO =
  "inline-flex h-8 items-center rounded-md border border-borda bg-superficie px-3 text-sm transition-[background-color] duration-150 hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-50";

/**
 * A aba Historico do usuario (spec de Acessos, §5.5): a trilha de auditoria dele, a mais recente primeiro, 100 por pagina:
 * Quando · Quem · O quê · Antes → Depois. Le do servidor quando a aba abre (e de novo a cada abertura, para mostrar o
 * Salvar de agora).
 */
export default function HistoricoDoUsuario({ usuarioId, ativa }) {
  const [pagina, setPagina] = useState(1);
  const [estado, setEstado] = useState(null);

  useEffect(() => {
    if (!ativa) return undefined;
    let vivo = true;
    (async () => {
      let resultado;
      try {
        resultado = await historicoDoUsuarioAcao(usuarioId, pagina);
      } catch {
        resultado = { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
      }
      if (vivo) setEstado(resultado);
    })();
    return () => {
      vivo = false;
    };
  }, [ativa, pagina, usuarioId]);

  if (!estado) {
    return (
      <p className="flex items-center gap-2 p-5 text-sm text-suave">
        <Loader size={14} className="animate-spin" aria-hidden="true" />
        Lendo o histórico…
      </p>
    );
  }
  if (!estado.ok) {
    return (
      <p role="alert" className="m-5 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
        {estado.erro}
      </p>
    );
  }
  if (estado.total === 0) {
    return (
      <div className="p-5">
        <EmptyState icone={History} titulo="Nenhuma alteração registrada." />
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="overflow-x-auto rounded-lg border border-borda">
        <table className="w-full text-sm">
          <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
            <tr>
              <th className="px-3 py-2 font-medium">Quando</th>
              <th className="px-3 py-2 font-medium">Quem</th>
              <th className="px-3 py-2 font-medium">O quê</th>
              <th className="px-3 py-2 font-medium">Antes → Depois</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {estado.linhas.map((linha) => (
              <tr key={linha.id} className="align-top">
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{QUANDO.format(new Date(linha.quando))}</td>
                <td className="px-3 py-2 whitespace-nowrap">{linha.quem}</td>
                <td className="px-3 py-2 whitespace-nowrap">{linha.oQue}</td>
                <td className="px-3 py-2">
                  {linha.mudancas.length === 0 ? (
                    <span className="text-suave">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {linha.mudancas.map((mudanca) => (
                        <li key={mudanca.campo} className="text-pretty">
                          <span className="font-medium">{mudanca.campo}:</span> <span className="text-suave">{mudanca.antes}</span> → {mudanca.depois}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {estado.totalPaginas > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-suave">
          <span className="tabular-nums">
            Página {estado.pagina} de {estado.totalPaginas}
          </span>
          <button type="button" onClick={() => setPagina(estado.pagina - 1)} disabled={estado.pagina <= 1} className={BOTAO}>
            Anterior
          </button>
          <button type="button" onClick={() => setPagina(estado.pagina + 1)} disabled={estado.pagina >= estado.totalPaginas} className={BOTAO}>
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
