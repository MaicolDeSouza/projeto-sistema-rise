"use client";

import { useEffect, useState } from "react";

import { listarLeiturasAcao } from "@/app/ferramentas/licencas/acoes";

import { diaEHora } from "./formato";
import Janela from "./Janela";

/** As ultimas 30 leituras do portal (cada "Enviar ao Rise" da extensao), da mais nova para a mais antiga. */
export default function JanelaHistoricoDeLeituras({ programa, aoFechar }) {
  const [leituras, setLeituras] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let vivo = true;
    listarLeiturasAcao(programa.id).then((resposta) => {
      if (!vivo) return;
      if (resposta?.ok) setLeituras(resposta.leituras ?? []);
      else setErro(resposta?.erro ?? "Não foi possível ler o histórico.");
    });
    return () => {
      vivo = false;
    };
  }, [programa.id]);

  const th = "px-2 py-1.5 font-medium";
  const td = "px-2 py-1.5 tabular-nums";
  return (
    <Janela titulo={`Leituras do portal do ${programa.nome}`} aoFechar={aoFechar} largura="max-w-3xl">
      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!erro && leituras === null && <p className="text-sm text-suave">Carregando…</p>}
      {leituras?.length === 0 && <p className="text-sm text-suave">Nenhuma leitura ainda. Abra o portal e clique em &quot;Enviar ao Rise&quot; na extensão.</p>}
      {leituras?.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-borda">
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo text-left text-xs text-suave">
              <tr>
                <th className={th}>Lida em</th>
                <th className={`${th} text-right`}>Chaves</th>
                <th className={`${th} text-right`}>PCs</th>
                <th className={`${th} text-right`}>Novas</th>
                <th className={`${th} text-right`}>Alteradas</th>
                <th className={`${th} text-right`}>PCs sumidos</th>
                <th className={th}>Leitura</th>
                <th className={th}>Extensão</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {leituras.map((leitura) => (
                <tr key={leitura.id}>
                  <td className={td}>{diaEHora(leitura.lidaEm)}</td>
                  <td className={`${td} text-right`}>{leitura.licencas}</td>
                  <td className={`${td} text-right`}>{leitura.ativacoes}</td>
                  <td className={`${td} text-right`}>{leitura.novas || <span className="text-suave">0</span>}</td>
                  <td className={`${td} text-right`}>{leitura.alteradas || <span className="text-suave">0</span>}</td>
                  <td className={`${td} text-right`}>{leitura.sumiram || <span className="text-suave">0</span>}</td>
                  <td className="px-2 py-1.5" title={leitura.completa ? undefined : "Alguma página do portal falhou: nada foi marcado como sumido"}>
                    {leitura.completa ? "completa" : <span className="text-amber-800">incompleta</span>}
                  </td>
                  <td className="px-2 py-1.5 text-suave">{leitura.versaoDaExtensao ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Janela>
  );
}
