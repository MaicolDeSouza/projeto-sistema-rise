"use client";

import { useState, useTransition } from "react";
import { Eye, Loader } from "lucide-react";

import { verComoAcao } from "@/app/configuracoes/acoes";
import Janela from "@/components/riseAi/Janela";
import Badge from "@/components/ui/Badge";

const SECUNDARIO =
  "inline-flex h-10 items-center gap-1.5 rounded-md border border-borda bg-superficie px-3 text-sm transition-[background-color] duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

const TOM_DO_NIVEL = { ver: "neutro", editar: "info", excluir: "alerta" };

function Nivel({ nivel }) {
  return <Badge tom={TOM_DO_NIVEL[nivel] ?? "neutro"}>{nivel}</Badge>;
}

/** Uma secao da janela (cartoes, dados, acoes, Rise AI): some quando nao ha nada liberado. */
function Secao({ titulo, itens }) {
  if (itens.length === 0) return null;
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-xs font-medium text-suave">{titulo}</h3>
      <ul className="space-y-1">
        {itens.map((item) => (
          <li key={item.rotulo} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{item.rotulo}</span>
            {item.nivel && <Nivel nivel={item.nivel} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

const TEXTO_DO_ESTADO = {
  inativo: "Usuário inativo: não entra no Rise.",
};

/**
 * "Ver como" (spec de Acessos, §5.5): o botao do cabecalho do usuario e da funcao e a janela larga "O que <nome> vê",
 * calculada no servidor do que esta SALVO (a mesma resolucao do `pode()`). So leitura: nunca troca a sessao. Com
 * alteracao nao salva o botao fica desabilitado com o motivo (regra 8 do Padrao visual).
 */
export default function VerComo({ tipo, id, alterado = false }) {
  const [visto, setVisto] = useState(null);
  const [erro, setErro] = useState(null);
  const [calculando, iniciar] = useTransition();

  function abrir() {
    setErro(null);
    iniciar(async () => {
      let resultado;
      try {
        resultado = await verComoAcao(tipo, id);
      } catch {
        resultado = { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
      }
      if (!resultado.ok) setErro(resultado.erro);
      else setVisto(resultado);
    });
  }

  const retrato = visto?.retrato;
  const vazio = retrato && retrato.blocos.length + retrato.cartoes.length + retrato.dados.length + retrato.acoes.length + retrato.capacidades.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        disabled={alterado || calculando}
        title={alterado ? "Salve para calcular" : erro ?? undefined}
        className={SECUNDARIO}
      >
        {calculando ? <Loader size={14} className="animate-spin" aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
        Ver como
      </button>
      {erro && !visto && (
        <span role="alert" className="text-xs text-red-700">
          {erro}
        </span>
      )}

      {visto && (
        <Janela titulo={`O que ${visto.nome} vê`} aoFechar={() => setVisto(null)} largura="max-w-2xl">
          {TEXTO_DO_ESTADO[visto.estado] && <p className="mb-3 text-sm text-amber-800">{TEXTO_DO_ESTADO[visto.estado]}</p>}
          {vazio && !TEXTO_DO_ESTADO[visto.estado] && <p className="text-sm text-suave">Nada liberado: vê só o Painel vazio.</p>}

          {retrato.blocos.length > 0 && (
            <section>
              <h3 className="mb-1.5 text-xs font-medium text-suave">Menu</h3>
              <ul className="divide-y divide-borda rounded-md border border-borda">
                {retrato.blocos.map((bloco) => (
                  <li key={bloco.rotulo} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-3 text-sm font-medium">
                      <span>{bloco.rotulo}</span>
                      <Nivel nivel={bloco.nivel} />
                    </div>
                    {bloco.subs.length > 0 && (
                      <ul className="mt-1 space-y-1 pl-4">
                        {bloco.subs.map((sub) => (
                          <li key={sub.rotulo} className="flex items-center justify-between gap-3 text-sm text-suave">
                            <span className="min-w-0 truncate">{sub.rotulo}</span>
                            <Nivel nivel={sub.nivel} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Secao titulo="Cartões do Painel" itens={retrato.cartoes.map((rotulo) => ({ rotulo }))} />
          <Secao titulo="Dados sensíveis" itens={retrato.dados} />
          <Secao titulo="Ações" itens={retrato.acoes.map((rotulo) => ({ rotulo }))} />
          <Secao titulo="Rise AI e outras capacidades" itens={retrato.capacidades} />

          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => setVisto(null)} className={SECUNDARIO}>
              Fechar
            </button>
          </div>
        </Janela>
      )}
    </>
  );
}
