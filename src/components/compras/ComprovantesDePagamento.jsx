"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";

import { anexarComprovanteAcao, excluirComprovanteAcao } from "@/app/compras/acoes";
import { propsDoFundo } from "@/lib/fundoDaJanela";

const QUANDO = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Comprovantes de pagamento do pedido de compra, no bloco Pagamento (pedido do dono em 09/11/2026: "fazer upload do
 * comprovante de pagamento"; Opcao: varios arquivos). Anexar e excluir valem na hora, sem o Salvar e em qualquer situacao do
 * pedido (o pagamento costuma vir depois de enviado). PDF, JPG ou PNG ate 20 MB, conferidos pelos bytes no servidor; a
 * exclusao pergunta antes, com o nome do arquivo (padrao do Rise).
 */
export default function ComprovantesDePagamento({ pedidoId, inicial = [], podeEditar = false }) {
  const entrada = useRef(null);
  const [lista, setLista] = useState(inicial);
  const [erro, setErro] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [pendente, iniciar] = useTransition();

  if (!podeEditar && lista.length === 0) return null;

  function escolher(evento) {
    const arquivos = [...(evento.target.files ?? [])];
    evento.target.value = "";
    if (arquivos.length === 0) return;
    setErro(null);
    iniciar(async () => {
      // Um por vez: cada envio devolve a lista inteira, e um arquivo recusado nao derruba os outros.
      const recusados = [];
      for (const arquivo of arquivos) {
        const dados = new FormData();
        dados.set("pedidoId", pedidoId);
        dados.set("arquivo", arquivo);
        const resposta = await anexarComprovanteAcao(dados);
        if (resposta?.ok) setLista(resposta.comprovantes);
        else recusados.push(`${arquivo.name}: ${resposta?.erro ?? "não foi possível anexar."}`);
      }
      if (recusados.length > 0) setErro(recusados.join(" "));
    });
  }

  function confirmarExclusao() {
    const alvo = excluindo;
    iniciar(async () => {
      const resposta = await excluirComprovanteAcao(pedidoId, alvo.id);
      if (resposta?.ok) {
        setLista(resposta.comprovantes);
        setExcluindo(null);
      } else {
        setErro(resposta?.erro ?? "Não foi possível excluir.");
        setExcluindo(null);
      }
    });
  }

  return (
    <div className="mt-4 space-y-2">
      <p className="text-xs font-medium text-suave">Comprovantes</p>
      {lista.map((comprovante) => (
        <div key={comprovante.id} className="flex items-center gap-2 rounded-md border border-borda px-3 py-2 text-sm">
          <FileText size={16} className="shrink-0 text-suave" />
          <a
            href={`/api/compras/${pedidoId}/comprovantes/${comprovante.id}`}
            target="_blank"
            rel="noreferrer"
            className="min-w-0 flex-1 truncate hover:text-acento hover:underline"
          >
            {comprovante.nomeOriginal ?? "Comprovante"}
          </a>
          <span className="shrink-0 text-xs text-suave tabular-nums" title={comprovante.enviadoPor ? `Anexado por ${comprovante.enviadoPor}` : undefined}>
            {QUANDO.format(new Date(comprovante.enviadoEm)).replace(",", "")}
          </span>
          {podeEditar && (
            <button
              type="button"
              onClick={() => setExcluindo(comprovante)}
              disabled={pendente}
              aria-label={`Excluir o comprovante ${comprovante.nomeOriginal ?? ""}`}
              title="Excluir o comprovante"
              className="rounded p-1 text-suave hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      ))}
      {podeEditar && (
        <>
          <input ref={entrada} type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={escolher} className="hidden" />
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={pendente}
            title="PDF, JPG ou PNG, até 20 MB cada"
            className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50"
          >
            {pendente ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Anexar comprovante
          </button>
        </>
      )}
      {erro && <p className="text-xs text-red-700">{erro}</p>}

      {excluindo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" {...propsDoFundo(() => setExcluindo(null))}>
          <div role="alertdialog" aria-modal="true" aria-label="Excluir comprovante" className="w-full max-w-sm overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl">
            <div className="space-y-1 p-4 text-sm">
              <p className="font-semibold">Excluir comprovante?</p>
              <p className="truncate text-suave">{excluindo.nomeOriginal ?? "Comprovante"}</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-borda p-3">
              <button type="button" autoFocus onClick={() => setExcluindo(null)} disabled={pendente} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarExclusao}
                disabled={pendente}
                className="inline-flex items-center gap-1.5 rounded bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {pendente && <Loader2 size={13} className="animate-spin" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
