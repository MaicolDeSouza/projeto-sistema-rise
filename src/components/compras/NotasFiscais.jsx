"use client";

import { useRef, useState, useTransition } from "react";
import { FileCode2, FileText, Loader2, Trash2, Upload } from "lucide-react";

import SecaoDoAnuncio from "@/components/anuncios/ml/SecaoDoAnuncio";
import { anexarNotaFiscalAcao, excluirNotaFiscalAcao } from "@/app/compras/acoes";
import { propsDoFundo } from "@/lib/fundoDaJanela";

import { moeda } from "./formato";

const DIA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

/** "NF 12345 · série 1 · 05/11/2026 · R$ 990,90 · EMITENTE", so com o que o XML trouxe; PDF e foto: o nome do arquivo. */
function resumo(nota) {
  if (!nota.numero) return nota.nomeOriginal ?? "Nota fiscal";
  return [
    `NF ${nota.numero}`,
    nota.serie ? `série ${nota.serie}` : null,
    nota.emitidaEm ? DIA.format(new Date(nota.emitidaEm)) : null,
    nota.valorTotal !== null && nota.valorTotal !== undefined ? moeda.format(nota.valorTotal) : null,
    nota.emitenteNome,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * As notas fiscais do pedido de compra, num bloco proprio ao lado de Pagamento (pedido do dono em 11/11/2026, Opcao 1: a nota
 * e da mercadoria e da entrada no estoque, nao do pagamento). Varias por pedido, anexadas e excluidas na hora, em qualquer
 * situacao. PDF, XML, JPG ou PNG ate 20 MB, conferidos pelos bytes no servidor; do XML da NF-e a linha mostra numero, data,
 * valor e emitente (a chave fica no `title`). A exclusao pergunta antes, com o nome (padrao do Rise).
 */
export default function NotasFiscais({ pedidoId, inicial = [], podeEditar = false }) {
  const entrada = useRef(null);
  const [lista, setLista] = useState(inicial);
  const [erro, setErro] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [pendente, iniciar] = useTransition();

  // Sem nota e sem poder anexar: o bloco some (regra 4 do padrao visual).
  if (!podeEditar && lista.length === 0) return null;

  function escolher(evento) {
    const arquivos = [...(evento.target.files ?? [])];
    evento.target.value = "";
    if (arquivos.length === 0) return;
    setErro(null);
    iniciar(async () => {
      // Uma por vez: cada envio devolve a lista inteira, e um arquivo recusado nao derruba os outros.
      const recusados = [];
      for (const arquivo of arquivos) {
        const dados = new FormData();
        dados.set("pedidoId", pedidoId);
        dados.set("arquivo", arquivo);
        const resposta = await anexarNotaFiscalAcao(dados);
        if (resposta?.ok) setLista(resposta.notas);
        else recusados.push(`${arquivo.name}: ${resposta?.erro ?? "não foi possível anexar."}`);
      }
      if (recusados.length > 0) setErro(recusados.join(" "));
    });
  }

  function confirmarExclusao() {
    const alvo = excluindo;
    iniciar(async () => {
      const resposta = await excluirNotaFiscalAcao(pedidoId, alvo.id);
      if (resposta?.ok) {
        setLista(resposta.notas);
        setErro(null);
      } else {
        setErro(resposta?.erro ?? "Não foi possível excluir.");
      }
      setExcluindo(null);
    });
  }

  return (
    <SecaoDoAnuncio titulo="Nota fiscal" ajuda="PDF, XML, JPG ou PNG, até 20 MB cada. Do XML da NF-e o Rise lê número, data, valor e emitente, e a busca da lista acha o pedido pelo número ou pela chave da nota.">
      <div className="space-y-2">
        {lista.map((nota) => (
          <div key={nota.id} className="flex items-center gap-2 rounded-md border border-borda px-3 py-2 text-sm">
            {nota.xml ? <FileCode2 size={16} className="shrink-0 text-suave" /> : <FileText size={16} className="shrink-0 text-suave" />}
            <a
              href={`/api/compras/${pedidoId}/notas/${nota.id}`}
              target="_blank"
              rel="noreferrer"
              title={[nota.chave ? `Chave ${nota.chave}` : null, nota.nomeOriginal].filter(Boolean).join("\n") || undefined}
              className="min-w-0 flex-1 truncate hover:text-acento hover:underline"
            >
              {resumo(nota)}
            </a>
            {podeEditar && (
              <button
                type="button"
                onClick={() => setExcluindo(nota)}
                disabled={pendente}
                aria-label={`Excluir a nota ${nota.numero ?? nota.nomeOriginal ?? ""}`}
                title="Excluir a nota"
                className="rounded p-1 text-suave hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
        {podeEditar && (
          <>
            <input ref={entrada} type="file" multiple accept="application/pdf,image/jpeg,image/png,.xml,text/xml,application/xml" onChange={escolher} className="hidden" />
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              disabled={pendente}
              title="PDF, XML, JPG ou PNG, até 20 MB cada"
              className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50"
            >
              {pendente ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Anexar nota fiscal
            </button>
          </>
        )}
        {erro && <p className="text-xs text-red-700">{erro}</p>}
      </div>

      {excluindo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" {...propsDoFundo(() => setExcluindo(null))}>
          <div role="alertdialog" aria-modal="true" aria-label="Excluir nota fiscal" className="w-full max-w-sm overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl">
            <div className="space-y-1 p-4 text-sm">
              <p className="font-semibold">Excluir nota fiscal?</p>
              <p className="truncate text-suave">{resumo(excluindo)}</p>
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
    </SecaoDoAnuncio>
  );
}
