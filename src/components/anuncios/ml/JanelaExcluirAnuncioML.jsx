"use client";

import { useEffect, useRef, useState } from "react";
import { Loader, Trash2 } from "lucide-react";

import { conferirExclusaoMLAcao, excluirAnuncioMLAcao } from "@/app/canais-de-venda/mercado-livre/acoes";
import ConclusaoDoEnvio from "@/components/ui/ConclusaoDoEnvio";
import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * A pergunta antes de excluir um anuncio do ML (pedido do dono em 28/10/2026, Opcao 1) e o resultado. Abre lendo o anuncio
 * no ML (`conferirExclusaoMLAcao`) para dizer o que vai acontecer de verdade: sem venda some do ML, do Bling e do Rise; com
 * venda e encerrado (sem volta) e fica no Rise como Encerrado. Padrao do Rise para o destrutivo: popup com o item listado,
 * Cancelar com o foco e o botao vermelho por ultimo. O sucesso termina no `ConclusaoDoEnvio`; a falha fica aqui, em vermelho,
 * com o que ja foi feito e o "Tentar de novo" (cada passo le antes de escrever, entao repetir continua de onde parou).
 */

async function chamar(acao, argumento) {
  try {
    return await acao(argumento);
  } catch {
    return { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
  }
}

const O_QUE_ACONTECE = {
  rascunho: "Ainda não está no Mercado Livre: só o rascunho do Rise é excluído.",
  apagar: "Sem vendas: o anúncio é encerrado e apagado no Mercado Livre, sai do Bling e sai do Rise.",
  encerrar: "Com vendas: o anúncio é encerrado no Mercado Livre (não volta mais), sai do Bling e fica no Rise como Encerrado.",
};
const ROTULO_DO_BOTAO = { rascunho: "Excluir", apagar: "Excluir", encerrar: "Encerrar" };
const TITULO_DO_FIM = { rascunho: "Rascunho excluído", apagar: "Anúncio excluído", encerrar: "Anúncio encerrado" };

export default function JanelaExcluirAnuncioML({ anuncioId, aoFechar, aoConcluir }) {
  const [conferido, setConferido] = useState(null);
  const [executando, setExecutando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const cancelar = useRef(null);

  useEffect(() => {
    let viva = true;
    chamar(conferirExclusaoMLAcao, anuncioId).then((resposta) => {
      if (viva) setConferido(resposta);
    });
    return () => {
      viva = false;
    };
  }, [anuncioId]);

  useEffect(() => {
    if (conferido) cancelar.current?.focus();
  }, [conferido]);

  // Esc cancela (na captura, para nao fechar tambem o editor de baixo); durante a exclusao nao ha como sair.
  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key !== "Escape" || resultado?.ok) return;
      evento.stopPropagation();
      evento.preventDefault();
      if (!executando) aoFechar();
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [executando, resultado, aoFechar]);

  async function excluir() {
    setExecutando(true);
    setResultado(null);
    const resposta = await chamar(excluirAnuncioMLAcao, anuncioId);
    setExecutando(false);
    setResultado(resposta);
  }

  if (resultado?.ok) {
    return (
      <ConclusaoDoEnvio
        titulo={TITULO_DO_FIM[resultado.destino] ?? "Anúncio excluído"}
        linhas={resultado.feito ?? []}
        aoFechar={() => aoConcluir(resultado)}
      />
    );
  }

  const destino = conferido?.destino;
  const pronto = conferido?.ok && !conferido.jaEncerrado;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case" {...propsDoFundo(() => !executando && aoFechar())}>
      <section role="alertdialog" aria-modal="true" aria-labelledby="titulo-excluir-ml" className="w-full max-w-md rounded-lg border border-borda bg-superficie p-5 shadow-2xl">
        <h2 id="titulo-excluir-ml" className="text-base font-semibold">
          {destino === "encerrar" ? "Encerrar anúncio?" : "Excluir anúncio?"}
        </h2>

        {!conferido && (
          <p role="status" className="mt-3 flex items-center gap-2 text-sm text-suave">
            <Loader size={14} className="animate-spin" /> Conferindo o anúncio no Mercado Livre...
          </p>
        )}

        {conferido && (conferido.titulo || conferido.codigo) && (
          <dl className="mt-3 grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1 rounded border border-borda bg-fundo px-3 py-2 text-sm">
            <dt className="text-suave">Título</dt>
            <dd className="min-w-0 truncate">{conferido.titulo || "Sem título"}</dd>
            <dt className="text-suave">Código</dt>
            <dd className="font-mono text-xs leading-5">{conferido.codigo}</dd>
            {conferido.itemId && (
              <>
                <dt className="text-suave">No ML</dt>
                <dd className="font-mono text-xs leading-5">
                  {conferido.itemId}
                  {conferido.vendas > 0 && <span className="ml-2 font-sans text-amber-800">{conferido.vendas} {conferido.vendas === 1 ? "venda" : "vendas"}</span>}
                </dd>
              </>
            )}
          </dl>
        )}

        {conferido?.ok && <p className="mt-3 text-sm">{conferido.jaEncerrado ? "Já está encerrado no Mercado Livre e fica no Rise como Encerrado (tem vendas)." : O_QUE_ACONTECE[destino]}</p>}

        {conferido && !conferido.ok && (
          <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {conferido.erro}
          </p>
        )}

        {resultado && !resultado.ok && (
          <div role="alert" className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <p>{resultado.erro}</p>
            {resultado.feito?.length > 0 && (
              <ul className="mt-1.5 list-inside list-disc text-xs text-red-900/80">
                {resultado.feito.map((linha) => (
                  <li key={linha}>{linha}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelar} type="button" onClick={aoFechar} disabled={executando} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50">
            {pronto ? "Cancelar" : "Fechar"}
          </button>
          {pronto && (
            <button type="button" onClick={excluir} disabled={executando} className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
              {executando ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
              {executando ? "Excluindo..." : resultado ? "Tentar de novo" : ROTULO_DO_BOTAO[destino]}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
