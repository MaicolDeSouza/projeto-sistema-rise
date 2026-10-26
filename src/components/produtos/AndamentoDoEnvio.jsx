"use client";

import { useEffect, useRef } from "react";
import { Circle, CircleCheck, CircleX, Loader } from "lucide-react";

import { propsDoFundo } from "@/lib/fundoDaJanela";

const TEXTOS = {
  bling: {
    sincronizar: { andando: "Sincronizando com o Bling", ok: "Sincronização concluída", falhou: "Sincronização interrompida" },
    cadastrar: { andando: "Cadastrando no Bling", ok: "Cadastro concluído", falhou: "Cadastro interrompido" },
  },
  // O mesmo popup serve ao editor da Loja Integrada (26/10/2026).
  li: {
    sincronizar: { andando: "Sincronizando com a Loja Integrada", ok: "Sincronização concluída", falhou: "Sincronização interrompida" },
    cadastrar: { andando: "Cadastrando na Loja Integrada", ok: "Cadastro concluído", falhou: "Cadastro interrompido" },
  },
  // E ao "Enviar ao ML" do anuncio publicado (26/10/2026).
  ml: {
    sincronizar: { andando: "Enviando ao Mercado Livre", ok: "Envio concluído", falhou: "Envio interrompido" },
  },
};

/// O ícone de cada estado de etapa: o check verde de quem terminou, o círculo girando de quem está rodando, o X de quem falhou
/// e o círculo cinza de quem espera. O estado vai também em texto para leitor de tela (a cor sozinha não chega).
function IconeDaEtapa({ estado }) {
  if (estado === "feito") return <CircleCheck size={20} className="shrink-0 text-emerald-600" aria-label="Concluída" />;
  if (estado === "andando") return <Loader size={20} className="shrink-0 animate-spin text-acento" aria-label="Em andamento" />;
  if (estado === "falhou") return <CircleX size={20} className="shrink-0 text-red-600" aria-label="Falhou" />;
  return <Circle size={20} className="shrink-0 text-suave" aria-label="Aguardando" />;
}

/**
 * O popup de andamento do Sincronizar e do Cadastrar da janela do Bling (pedido do dono em 26/10/2026: "um popup mostrando
 * cada etapa e um check conforme for finalizando as etapas e, no final, um botão fechar que fecha os popups"). Fica por cima da
 * janela do Bling e mostra as etapas na ordem do envio: check verde nas concluídas, o círculo girando na atual, cinza nas que
 * esperam e X vermelho, com o motivo, na que falhou.
 *
 * Termina de dois jeitos (`fim`): `ok` mostra o resumo e o **Fechar**, que fecha este popup E a janela do Bling (`aoFechar`);
 * `falhou` mostra o que já tinha ido ao Bling e o **Voltar à janela** (`aoVoltar`), que fecha só este popup: a janela fica
 * aberta, com o erro à vista, para o operador decidir (a mesma regra do aviso de sucesso, que só o sucesso fecha tudo).
 *
 * Enquanto roda, nada fecha: o Esc e o clique no fundo são engolidos, para não largar a janela no meio de uma escrita no Bling.
 * O Esc é ouvido na CAPTURA e para ali (a janela de baixo o escuta no `document`).
 *
 * `canal` ("bling" ou "li") escolhe os titulos. `acoesDoFim`, quando passado, desenha no lugar do botao unico "Fechar" quando o
 * envio deu certo (a Loja Integrada traz tres: abrir o painel, abrir o anuncio e fechar); o foco vai ao elemento com
 * `data-fechar` dentro dele. `larga` abre o popup um pouco mais largo (as tres acoes lado a lado).
 *
 * @param {{canal?: "bling"|"li", tipo: "sincronizar"|"cadastrar", sku: string, etapas: {id: string, rotulo: string, estado: "espera"|"andando"|"feito"|"falhou", detalhe?: string|null}[],
 *   fim: null|"ok"|"falhou", resumo: {titulo: string, linhas: string[]}|null, aviso?: string|null, aoFechar: () => void, aoVoltar: () => void,
 *   acoesDoFim?: import("react").ReactNode, larga?: boolean}} props
 */
export default function AndamentoDoEnvio({ canal = "bling", tipo, sku, etapas, fim, resumo, aviso = null, aoFechar, aoVoltar, acoesDoFim = null, larga = false }) {
  const textos = (TEXTOS[canal] ?? TEXTOS.bling)[tipo] ?? TEXTOS.bling.sincronizar;
  const acaoFinal = fim === "ok" ? aoFechar : fim === "falhou" ? aoVoltar : null;
  const botao = useRef(null);
  const caixa = useRef(null);

  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key !== "Escape" && evento.key !== "Enter") return;
      evento.stopPropagation();
      evento.preventDefault();
      acaoFinal?.();
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [acaoFinal]);

  // O foco vai ao botão quando o envio termina, para o Enter fechar sem o mouse.
  useEffect(() => {
    if (fim) (botao.current ?? caixa.current?.querySelector("[data-fechar]"))?.focus();
  }, [fim]);

  const titulo = fim === "ok" ? textos.ok : fim === "falhou" ? textos.falhou : textos.andando;
  const corDoTitulo = fim === "ok" ? "text-emerald-700" : fim === "falhou" ? "text-red-700" : "text-texto";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
      {...propsDoFundo(() => acaoFinal?.())}
    >
      <section
        ref={caixa}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="andamento-do-envio-titulo"
        aria-busy={!fim}
        className={`w-full ${larga ? "max-w-xl" : "max-w-md"} rounded-lg border border-borda bg-superficie p-6 shadow-2xl`}
      >
        <p id="andamento-do-envio-titulo" className={`text-lg font-semibold ${corDoTitulo}`}>
          {titulo}
        </p>
        <p className="mt-0.5 font-mono text-sm text-suave">{sku}</p>

        <ol className="mt-5 space-y-3" aria-live="polite">
          {etapas.map((etapa) => (
            <li key={etapa.id}>
              <div className={`flex items-center gap-3 text-base ${etapa.estado === "espera" ? "text-suave" : "text-texto"}`}>
                <IconeDaEtapa estado={etapa.estado} />
                <span className="min-w-0 flex-1">{etapa.rotulo}</span>
                {etapa.estado === "feito" && etapa.detalhe && <span className="shrink-0 text-sm text-suave">{etapa.detalhe}</span>}
              </div>
              {etapa.estado === "falhou" && etapa.detalhe && (
                <p role="alert" className="mt-1 max-h-32 overflow-y-auto pl-8 text-sm text-red-700">
                  {etapa.detalhe}
                </p>
              )}
            </li>
          ))}
        </ol>

        {fim && resumo && (
          <div className="mt-5 border-t border-borda pt-4 text-sm text-suave">
            <p>{resumo.titulo}</p>
            {resumo.linhas.length > 0 && (
              <ul className="mt-2 max-h-36 list-disc space-y-0.5 overflow-y-auto pl-5 text-texto">
                {resumo.linhas.map((linha, indice) => (
                  <li key={`${indice}-${linha}`}>{linha}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {fim === "ok" && aviso && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{aviso}</p>}

        <div className="mt-5 flex justify-end">
          {fim === "ok" && acoesDoFim}
          {fim === "ok" && !acoesDoFim && (
            <button ref={botao} type="button" onClick={aoFechar} className="min-w-28 rounded-md bg-acento px-5 py-2.5 text-base font-medium text-white hover:opacity-90">
              Fechar
            </button>
          )}
          {fim === "falhou" && (
            <button ref={botao} type="button" onClick={aoVoltar} className="min-w-28 rounded-md border border-borda px-5 py-2.5 text-base hover:bg-fundo">
              Voltar à janela
            </button>
          )}
          {!fim && (
            <button type="button" disabled className="min-w-28 cursor-not-allowed rounded-md border border-borda px-5 py-2.5 text-base text-suave opacity-70">
              Enviando…
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
