"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck, CircleX, RefreshCw } from "lucide-react";

import { testarIntegracoesAgora } from "@/app/configuracoes/saude/acoes";
import { resumoDaSaude } from "@/lib/saude/regras";

/**
 * A tela Saude do Rise. Linha-guia: o dono ve primeiro se esta tudo certo e o que esta vermelho; a acao principal e
 * "Testar integracoes agora". Cor e estado, sem frase de rotina (Padrao visual, regra 2).
 */

const COR_DO_PONTO = {
  ok: "bg-emerald-500",
  atencao: "bg-amber-500",
  falha: "bg-red-500",
  aguardando: "bg-slate-300",
  info: "bg-sky-400",
};
const ROTULO_DO_ESTADO = { ok: "ok", atencao: "atenção", falha: "falha", aguardando: "sem dado", info: "informação" };

const GERAL = {
  ok: { Icone: CircleCheck, classe: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  atencao: { Icone: CircleAlert, classe: "border-amber-200 bg-amber-50 text-amber-800" },
  falha: { Icone: CircleX, classe: "border-red-200 bg-red-50 text-red-800" },
};

const hora = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

function Item({ item }) {
  const rotulo = item.caminho ? (
    <Link href={item.caminho} className="font-medium hover:underline">
      {item.rotulo}
    </Link>
  ) : (
    <span className="font-medium">{item.rotulo}</span>
  );
  return (
    <li className="flex items-start gap-2.5 py-2">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${COR_DO_PONTO[item.estado] ?? COR_DO_PONTO.aguardando}`} title={ROTULO_DO_ESTADO[item.estado]} aria-label={ROTULO_DO_ESTADO[item.estado]} />
      <div className="min-w-0 text-sm">
        {rotulo}
        <p className={`text-xs ${item.estado === "falha" ? "text-red-700" : "text-suave"}`}>{item.detalhe}</p>
      </div>
    </li>
  );
}

export default function PainelDeSaude({ saude, podeTestar }) {
  const router = useRouter();
  const [testando, iniciarTeste] = useTransition();
  const [atualizando, iniciarAtualizacao] = useTransition();
  const [teste, setTeste] = useState(null);

  const itens = saude.grupos.flatMap((grupo) => grupo.itens);
  const geral = GERAL[saude.geral] ?? GERAL.ok;

  function testar() {
    setTeste(null);
    iniciarTeste(async () => {
      setTeste(await testarIntegracoesAgora());
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${geral.classe}`}>
          <geral.Icone size={18} aria-hidden />
          {resumoDaSaude(itens)}
          <span className="font-normal opacity-75">· lido às {hora(saude.em)}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => iniciarAtualizacao(() => router.refresh())}
            disabled={atualizando}
            className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50"
          >
            <RefreshCw size={15} className={atualizando ? "animate-spin" : ""} aria-hidden />
            Atualizar
          </button>
          {podeTestar && (
            <button
              type="button"
              onClick={testar}
              disabled={testando}
              className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {testando ? "Testando..." : "Testar integrações agora"}
            </button>
          )}
        </div>
      </div>

      {teste && (
        <p className={`text-sm ${teste.ok ? "text-suave" : "text-red-700"}`} role="status">
          {!teste.ok
            ? teste.erro
            : teste.resultados.length === 0
              ? "Nenhuma integração conectada para testar."
              : teste.resultados.map((resultado) => (
                  <span key={resultado.id} className={`mr-3 ${resultado.ok ? "text-emerald-700" : "text-red-700"}`}>
                    {resultado.nome}: {resultado.ok ? "ok" : resultado.erro}
                  </span>
                ))}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {saude.grupos.map((grupo) => (
          <section key={grupo.titulo} className="rounded-lg border border-borda bg-superficie px-4 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-suave">{grupo.titulo}</h2>
            <ul className="mt-1 divide-y divide-borda">
              {grupo.itens.map((item) => (
                <Item key={item.id} item={item} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
