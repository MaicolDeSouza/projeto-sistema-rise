"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Undo2, Upload, X } from "lucide-react";

import { enviarPropostaAcao } from "@/app/compras/acoes";

/**
 * O arquivo da proposta do fornecedor. Como os documentos do produto: o enviado espera no lote temporario e o excluido
 * so e riscado; os dois so valem no Salvar do pedido. Um arquivo por pedido (enviar outro troca o anterior).
 */
export default function ArquivoDaProposta({ pedido, editar, formulario, mudar }) {
  const entrada = useRef(null);
  const lote = useRef(null);
  const [erro, setErro] = useState(null);
  const [enviando, iniciar] = useTransition();

  const novo = formulario.propostaTemporaria;
  const gravado = pedido.propostaArquivo ? { nomeOriginal: pedido.propostaNomeOriginal ?? "Proposta" } : null;
  const riscado = formulario.removerProposta;

  function escolher(evento) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!arquivo) return;
    setErro(null);
    lote.current ??= crypto.randomUUID();
    const dados = new FormData();
    dados.set("lote", lote.current);
    dados.set("arquivo", arquivo);
    iniciar(async () => {
      const resposta = await enviarPropostaAcao(dados);
      if (!resposta?.ok) {
        setErro(resposta?.erro ?? "Não foi possível enviar.");
        return;
      }
      mudar("propostaTemporaria", { lote: lote.current, nome: resposta.nome, nomeOriginal: resposta.nomeOriginal });
      mudar("removerProposta", false);
    });
  }

  return (
    <div className="mt-4 space-y-2">
      {gravado && !novo && (
        <div className={`flex items-center gap-2 rounded-md border border-borda px-3 py-2 text-sm ${riscado ? "opacity-60" : ""}`}>
          <FileText size={16} className="shrink-0 text-suave" />
          <a
            href={`/api/compras/${pedido.id}/proposta`}
            target="_blank"
            rel="noreferrer"
            className={`min-w-0 flex-1 truncate hover:text-acento hover:underline ${riscado ? "line-through" : ""}`}
          >
            {gravado.nomeOriginal}
          </a>
          {riscado && <span className="text-xs text-rose-600">excluído ao salvar</span>}
          {editar &&
            (riscado ? (
              <button type="button" onClick={() => mudar("removerProposta", false)} className="inline-flex items-center gap-1 text-xs text-suave hover:text-texto">
                <Undo2 size={13} /> Desfazer
              </button>
            ) : (
              <button type="button" onClick={() => mudar("removerProposta", true)} aria-label="Excluir a proposta" className="rounded p-1 text-suave hover:bg-rose-50 hover:text-rose-600">
                <X size={15} />
              </button>
            ))}
        </div>
      )}
      {novo && (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-acento/50 px-3 py-2 text-sm">
          <FileText size={16} className="shrink-0 text-acento" />
          <span className="min-w-0 flex-1 truncate">{novo.nomeOriginal ?? "Proposta"}</span>
          <span className="text-xs text-amber-700">a salvar</span>
          <button type="button" onClick={() => mudar("propostaTemporaria", null)} aria-label="Tirar o arquivo enviado" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={15} />
          </button>
        </div>
      )}
      {editar && (
        <>
          <input ref={entrada} type="file" accept="application/pdf,image/jpeg,image/png" onChange={escolher} className="hidden" />
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={enviando}
            className="inline-flex items-center gap-1.5 rounded-md border border-borda px-3 py-1.5 text-sm hover:border-acento hover:text-acento disabled:opacity-50"
          >
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {gravado || novo ? "Trocar arquivo" : "Enviar arquivo"}
          </button>
        </>
      )}
      {erro && <p className="text-xs text-rose-600">{erro}</p>}
    </div>
  );
}
