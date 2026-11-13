"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";

import { anexarArquivoDoClienteAcao, excluirArquivoDoClienteAcao } from "@/app/cadastros/acoes-clientes";
import Pergunta from "@/components/compras/Pergunta";

const TIPOS = { FICHA_CADASTRAL: "Ficha cadastral", OUTRO: "Outro documento" };

/**
 * A ficha cadastral do cliente (cartao CNPJ) e outros documentos (pedido do dono em 13/11/2026). O envio e na hora, fora
 * do Salvar do cadastro: o `<input type="file">` nao tem `name`, entao nao entra no formulario do cliente.
 */
export default function ArquivosDoCliente({ clienteId, arquivosIniciais, editar }) {
  const [arquivos, setArquivos] = useState(arquivosIniciais ?? []);
  const [erro, setErro] = useState(null);
  const [apagar, setApagar] = useState(null);
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef(null);
  const [tipo, setTipo] = useState("FICHA_CADASTRAL");

  const enviar = (lista) =>
    iniciar(async () => {
      setErro(null);
      const dados = new FormData();
      dados.set("clienteId", clienteId);
      dados.set("tipo", tipo);
      for (const arquivo of lista) dados.append("arquivo", arquivo);
      const resposta = await anexarArquivoDoClienteAcao(dados);
      if (entrada.current) entrada.current.value = "";
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível enviar.");
      setArquivos(resposta.arquivos);
    });
  const excluir = () =>
    iniciar(async () => {
      const resposta = await excluirArquivoDoClienteAcao(clienteId, apagar.id);
      setApagar(null);
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível excluir.");
      setArquivos(resposta.arquivos);
    });

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Ficha cadastral e documentos</span>
        {editar && (
          <>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo do arquivo" className="ml-auto rounded border border-borda bg-superficie px-2 py-1.5 text-sm">
              {Object.entries(TIPOS).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>{rotulo}</option>
              ))}
            </select>
            <button type="button" onClick={() => entrada.current?.click()} disabled={ocupado} className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50">
              {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Enviar arquivo
            </button>
            <input ref={entrada} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls,.ods,.docx" className="hidden" onChange={(e) => e.target.files?.length && enviar([...e.target.files])} />
          </>
        )}
      </div>
      {arquivos.length === 0 ? (
        <p className="rounded border border-dashed border-borda px-3 py-3 text-sm text-suave">Nenhum arquivo. Envie o cartão CNPJ que o cliente mandou.</p>
      ) : (
        <ul className="divide-y divide-borda rounded border border-borda">
          {arquivos.map((arquivo) => (
            <li key={arquivo.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <FileText size={16} className="shrink-0 text-suave" />
              <a href={`/api/clientes/arquivos/${arquivo.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate text-acento hover:underline">
                {arquivo.nomeOriginal}
              </a>
              <span className="shrink-0 text-xs text-suave">{TIPOS[arquivo.tipo] ?? arquivo.tipo}</span>
              <span className="shrink-0 text-xs tabular-nums text-suave">{new Date(arquivo.criadoEm).toLocaleDateString("pt-BR")}</span>
              {editar && (
                <button type="button" onClick={() => setApagar(arquivo)} aria-label={`Excluir ${arquivo.nomeOriginal}`} title="Excluir o arquivo" className="rounded p-1 text-suave hover:bg-rose-50 hover:text-rose-600">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {erro && <p className="mt-1 text-sm text-rose-600" role="alert">{erro}</p>}
      {apagar && (
        <Pergunta titulo="Excluir o arquivo?" confirmar="Excluir" destrutiva ocupado={ocupado} aoRecuar={() => setApagar(null)} aoConfirmar={excluir}>
          {apagar.nomeOriginal} ({TIPOS[apagar.tipo] ?? apagar.tipo}). Não dá para desfazer.
        </Pergunta>
      )}
    </div>
  );
}
