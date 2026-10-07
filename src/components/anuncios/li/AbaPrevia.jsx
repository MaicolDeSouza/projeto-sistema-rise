"use client";

import { ABAS_LI } from "@/lib/canaisDeVenda/li/validacao";

const CLASSE_DO_PROBLEMA = {
  bloqueante: "border-red-200 bg-red-50 text-red-800",
  alerta: "border-amber-200 bg-amber-50 text-amber-800",
};

const dataEHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

const ROTULO_DA_SITUACAO = { ATIVA: "ativo na loja", PAUSADA: "inativo na loja", ENCERRADA: "encerrado", DESCONHECIDA: "situacao desconhecida" };

function agruparPorAba(problemas) {
  return ABAS_LI.map((aba) => {
    const dela = problemas.filter((problema) => problema.aba === aba.id);
    return { aba, problemas: [...dela.filter((p) => p.bloqueante), ...dela.filter((p) => !p.bloqueante)] };
  }).filter((grupo) => grupo.problemas.length > 0);
}

/**
 * Aba Previa e sincronizacao: os problemas de todas as abas (cada um leva a aba que o resolve) e a
 * situacao do vinculo com a loja. Nao envia nada: Cadastrar e Sincronizar ficam no icone da Loja
 * Integrada na lista de Produtos, que le a loja na hora e mostra as diferencas antes.
 */
export default function AbaPrevia({ irPara, todosProblemas, vinculo }) {
  const grupos = agruparPorAba(todosProblemas);
  const bloqueantes = todosProblemas.filter((problema) => problema.bloqueante).length;
  const alertas = todosProblemas.length - bloqueantes;
  const linkSeguro = /^https?:\/\//i.test(String(vinculo?.urlExterna ?? ""));

  return (
    <div className="space-y-6">
      <div className="rounded border border-borda bg-fundo p-3 text-sm">
        <p className="font-semibold">Sincronizacao</p>
        {vinculo?.idExterno ? (
          <div className="mt-1 space-y-0.5">
            <p>
              Na loja: id {vinculo.idExterno} ({ROTULO_DA_SITUACAO[vinculo.situacaoCanal] ?? "situacao desconhecida"})
              {linkSeguro && (
                <>
                  {" · "}
                  <a href={vinculo.urlExterna} target="_blank" rel="noreferrer" className="text-acento hover:underline">
                    abrir na loja
                  </a>
                </>
              )}
            </p>
            <p className="text-suave">Ultima sincronizacao: {vinculo.sincronizadoEm ? dataEHora.format(new Date(vinculo.sincronizadoEm)) : "nunca"}</p>
            {vinculo.erro && <p className="text-red-700">Ultimo envio falhou: {vinculo.erro}</p>}
          </div>
        ) : (
          <p className="mt-1 text-suave">Sem vinculo com a loja ainda.</p>
        )}
        <p className="mt-2 text-xs text-suave">
          Cadastrar e Sincronizar ficam no icone da Loja Integrada na lista de Produtos: ele le a loja na hora e mostra o que muda antes de enviar.
        </p>
      </div>

      {bloqueantes > 0 ? (
        <p className="text-sm font-semibold text-red-700">
          {bloqueantes} problema(s) bloqueante(s) e {alertas} alerta(s)
        </p>
      ) : (
        <div>
          <p className="text-sm font-semibold text-emerald-700">Nada impede enviar para a Loja Integrada.</p>
          {alertas > 0 && <p className="mt-1 text-xs text-amber-700">{alertas} alerta(s) abaixo para conferir; eles nao impedem o envio.</p>}
        </div>
      )}

      {grupos.map(({ aba, problemas }) => (
        <div key={aba.id}>
          <p className="text-sm font-semibold">{aba.rotulo}</p>
          <ul className="mt-2 space-y-2">
            {problemas.map((item, posicao) => (
              <li
                key={posicao}
                className={`flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2 text-sm ${CLASSE_DO_PROBLEMA[item.bloqueante ? "bloqueante" : "alerta"]}`}
              >
                <span className="min-w-0 flex-1">{item.problema}</span>
                <button
                  type="button"
                  onClick={() => irPara(aba.id)}
                  className="shrink-0 rounded border border-borda bg-superficie px-2 py-1 text-xs text-texto hover:bg-fundo"
                >
                  Ir para {aba.rotulo}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
