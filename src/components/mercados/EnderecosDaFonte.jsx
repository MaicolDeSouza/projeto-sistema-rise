"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader, Play, Plus, Trash2 } from "lucide-react";

import { adicionarEndereco, removerEndereco, varrerEndereco } from "@/app/mercados/acoes";
import { rotuloDoEndereco } from "@/lib/coleta/enderecos";

/**
 * Os enderecos que uma fonte de SITE varre (20/10/2026): a loja inteira ou categorias da mesma loja. Sem lista, a fonte
 * varre a loja inteira, e essa linha aparece como unica (nao se remove). Adicionar nao abre o site: o total de cada
 * endereco aparece depois da proxima varredura.
 */
export default function EnderecosDaFonte({ fonte }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [novo, setNovo] = useState("");
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);

  const lista = (fonte.categorias ?? []).filter((item) => item?.url);
  const itens = lista.length > 0 ? lista : [{ url: `https://${fonte.dominio}/`, implicito: true }];

  function executar(acao, sucesso) {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const resultado = await acao();
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      sucesso?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded border border-borda bg-fundo px-3 py-3">
      <p className="text-sm font-medium">Endereços varridos ({itens.length})</p>
      <ul className="divide-y divide-borda rounded border border-borda bg-superficie">
        {itens.map((item) => (
          <li key={item.url} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 font-mono text-xs break-all text-acento hover:underline"
              >
                {item.url.replace(/^https?:\/\/(www\.)?/, "")}
                <ExternalLink size={11} className="shrink-0" />
              </a>
              <p className="text-xs text-suave">
                {rotuloDoEndereco(item.url) === "loja inteira" ? "loja inteira" : "categoria"}
                {typeof item.total === "number" && ` · ${item.total.toLocaleString("pt-BR")} produto(s)`}
                {item.implicito && fonte.prefixoUrl ? ` · filtro de texto: ${fonte.prefixoUrl}` : ""}
              </p>
            </div>
            <div className="flex gap-1.5">
            {!item.implicito && itens.length > 1 && (
              <button
                type="button"
                onClick={() => executar(() => varrerEndereco(fonte.id, item.url), () => setAviso("Na fila: só este endereço será varrido."))}
                disabled={pendente}
                title="Varrer só este endereço, sem mexer no resto da fonte"
                className="inline-flex items-center gap-1 rounded border border-borda px-2 py-1 text-xs hover:bg-fundo disabled:opacity-40"
              >
                <Play size={12} />
                Varrer
              </button>
            )}
            <button
              type="button"
              onClick={() => executar(() => removerEndereco(fonte.id, item.url))}
              disabled={pendente || itens.length <= 1}
              title={
                itens.length <= 1
                  ? "A fonte precisa de pelo menos um endereço. Para parar, use Pausar."
                  : "Tirar este endereço da varredura (os produtos já coletados ficam)"
              }
              className="inline-flex items-center gap-1 rounded border border-borda px-2 py-1 text-xs text-red-700 hover:bg-fundo disabled:opacity-40"
            >
              <Trash2 size={12} />
              Remover
            </button>
            </div>
          </li>
        ))}
      </ul>

      <form
        onSubmit={(evento) => {
          evento.preventDefault();
          executar(() => adicionarEndereco(fonte.id, novo), () => setNovo(""));
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <label className="min-w-64 flex-1 text-xs">
          <span className="mb-1 block text-suave">Adicionar endereço (categoria da mesma loja)</span>
          <input
            type="url"
            value={novo}
            onChange={(evento) => setNovo(evento.target.value)}
            placeholder={`https://${fonte.dominio}/categoria`}
            className="w-full rounded border border-borda bg-superficie px-2 py-1.5 font-mono text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pendente || !novo.trim()}
          className="inline-flex items-center gap-1 rounded bg-acento px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pendente ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
          Adicionar
        </button>
      </form>
      {aviso && <p className="text-xs text-emerald-700">{aviso}</p>}
      {erro && <p className="text-xs text-red-700">{erro}</p>}
    </div>
  );
}
