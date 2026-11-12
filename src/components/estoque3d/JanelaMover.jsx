"use client";

import { ArrowRight, Loader, MapPin, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { lerParaMoverAcao, moverProdutoAcao, sugerirLugarAcao } from "@/app/estoque/mapa/acoes";
import ConclusaoDoEnvio from "@/components/ui/ConclusaoDoEnvio";
import { propsDoFundo } from "@/lib/fundoDaJanela";

import { CLASSE_DO_CAMPO } from "./Pecas";

const DATA = (iso) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * Janela "Mover / Onde guardar" (Mapa do estoque, fase 2). Linha-guia: o operador ve primeiro as 3 sugestoes do estoque
 * escolhido; a acao principal e "Guardar aqui". O lugar a mao fica embaixo, para quem ja sabe onde quer.
 *
 * Abre no Estoque 2 quando o produto esta no Estoque 1 ou sem lugar (os do Estoque 1 ficam como estao, decisao do dono em
 * 12/11/2026: mover de la e escolha dele, peca por peca).
 */
export default function JanelaMover({ produtoId, aoFechar }) {
  const router = useRouter();
  const [dados, setDados] = useState(null);
  const [localId, setLocalId] = useState(null);
  // As sugestoes por estoque: trocar de estoque e voltar nao pergunta de novo, e "procurando" e so a falta da resposta.
  const [sugestoes, setSugestoes] = useState({});
  const [mao, setMao] = useState({ letra: "", prateleira: "", posicao: "", modeloCaixinhaId: "" });
  const [erro, setErro] = useState(null);
  const [feito, setFeito] = useState(null);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    lerParaMoverAcao(produtoId).then((resposta) => {
      if (!vivo) return;
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível abrir.");
      setDados(resposta);
      // Ja num estoque com regras: abre nele (arrumar dentro do mesmo). No Estoque 1 ou sem lugar: o primeiro com regras.
      const atual = resposta.locais.find((local) => local.id === resposta.localAtualId);
      const comRegras = atual?.aplicaRegras ? atual : (resposta.locais.find((local) => local.aplicaRegras) ?? resposta.locais[0]);
      setLocalId(comRegras?.id ?? null);
      setMao((atual) => ({ ...atual, modeloCaixinhaId: resposta.produto.modeloCaixinhaId ?? "" }));
    });
    return () => {
      vivo = false;
    };
  }, [produtoId]);

  useEffect(() => {
    if (!localId) return undefined;
    let vivo = true;
    sugerirLugarAcao(produtoId, localId).then((resposta) => {
      if (!vivo) return;
      setSugestoes((atual) => ({ ...atual, [localId]: resposta?.ok ? resposta : { sugestoes: [], motivo: resposta?.erro ?? "Não foi possível sugerir." } }));
    });
    return () => {
      vivo = false;
    };
  }, [produtoId, localId]);

  function mover(destino) {
    setErro(null);
    iniciar(async () => {
      const resposta = await moverProdutoAcao(produtoId, destino);
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível mover.");
      setFeito(resposta);
      router.refresh();
    });
  }

  if (feito) {
    return (
      <ConclusaoDoEnvio
        titulo="Caixinha movida"
        mensagem={`${dados?.produto.sku} agora está em ${feito.para} (${feito.estoque}).`}
        linhas={["Localização gravada no Rise."]}
        aviso="A Localização vai ao Bling no próximo Sincronizar do produto."
        aoFechar={aoFechar}
      />
    );
  }

  const sugestao = localId ? (sugestoes[localId] ?? null) : null;
  const buscando = Boolean(localId) && !sugestao;
  const local = dados?.locais.find((item) => item.id === localId) ?? null;
  const colunasDoLocal = dados?.colunas.filter((coluna) => coluna.localId === localId) ?? [];
  const colunaEscolhida = colunasDoLocal.find((coluna) => coluna.letra === mao.letra) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" {...propsDoFundo(aoFechar)}>
      <section role="dialog" aria-modal="true" aria-label="Onde guardar" className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-borda p-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Onde guardar {dados ? <span className="tabular-nums">{dados.produto.sku}</span> : ""}</p>
            {dados && (
              <p className="truncate text-xs text-suave">
                {dados.produto.nome} · hoje em {dados.produto.localizacao || "nenhum lugar"}
                {dados.produto.familia ? ` · ${dados.produto.familia}` : ""}
              </p>
            )}
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={16} />
          </button>
        </header>

        {!dados ? (
          <p className="p-6 text-sm text-suave">{erro ?? "Carregando…"}</p>
        ) : (
          <div className="overflow-y-auto">
            <nav aria-label="Estoque" className="flex gap-1.5 border-b border-borda px-3 py-2">
              {dados.locais.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setLocalId(item.id);
                    setMao((atual) => ({ ...atual, letra: "", prateleira: "", posicao: "" }));
                  }}
                  aria-pressed={item.id === localId}
                  title={item.descricao ?? undefined}
                  className={`rounded-full border px-3 py-1 text-sm ${item.id === localId ? "border-acento bg-acento/10 font-medium text-acento" : "border-borda text-suave hover:bg-fundo"}`}
                >
                  {item.nome}
                </button>
              ))}
            </nav>

            <div className="p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-suave">{local?.aplicaRegras ? "Sugestões pelas regras" : "Sugestões"}</p>
              {buscando && (
                <p className="flex items-center gap-2 text-sm text-suave">
                  <Loader size={14} className="animate-spin" /> Procurando lugar…
                </p>
              )}
              {sugestao && !sugestao.sugestoes.length && <p className="rounded border border-borda bg-fundo px-3 py-2 text-sm text-suave">{sugestao.motivo}</p>}
              {sugestao?.sugestoes.length > 0 && (
                <ul className="space-y-1.5">
                  {sugestao.sugestoes.map((item, indice) => (
                    <li key={item.codigo} className="flex items-center gap-3 rounded border border-borda px-3 py-2">
                      <MapPin size={16} className={indice === 0 ? "text-acento" : "text-suave"} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold">
                          {item.codigo} <span className="font-normal text-suave">· {item.posicao}ª da esquerda</span>
                        </p>
                        <p className="truncate text-xs text-suave">{item.motivos.join(" · ")}</p>
                      </div>
                      <button
                        type="button"
                        disabled={pendente}
                        onClick={() => mover({ letra: item.letra, prateleira: item.prateleira, posicao: item.posicao, modeloCaixinhaId: sugestao.modelo?.id ?? "" })}
                        className={`shrink-0 rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${indice === 0 ? "bg-acento text-white" : "border border-borda hover:bg-fundo"}`}
                      >
                        Guardar aqui
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {sugestao?.modelo && sugestao.modelo.id !== dados.produto.modeloCaixinhaId && sugestao.sugestoes.length > 0 && (
                <p className="mt-1.5 text-xs text-suave">A caixinha passa a ser a {sugestao.modelo.nome}.</p>
              )}
            </div>

            <form
              className="border-t border-borda p-3"
              onSubmit={(evento) => {
                evento.preventDefault();
                mover(mao);
              }}
            >
              <p className="mb-2 text-xs font-semibold uppercase text-suave">Escolher o lugar</p>
              <div className="grid grid-cols-4 items-end gap-2">
                <label className="text-sm font-semibold">
                  Coluna
                  <select value={mao.letra} onChange={(evento) => setMao({ ...mao, letra: evento.target.value, prateleira: "" })} className={CLASSE_DO_CAMPO} required>
                    <option value="">—</option>
                    {colunasDoLocal.map((coluna) => (
                      <option key={coluna.id} value={coluna.letra}>
                        {coluna.letra}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Prateleira
                  <select value={mao.prateleira} onChange={(evento) => setMao({ ...mao, prateleira: evento.target.value })} className={CLASSE_DO_CAMPO} required disabled={!colunaEscolhida}>
                    <option value="">—</option>
                    {Array.from({ length: colunaEscolhida?.prateleiras ?? 0 }, (_, indice) => indice + 1).map((numero) => (
                      <option key={numero} value={numero}>
                        {numero}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold">
                  Posição
                  <input type="number" min="1" value={mao.posicao} onChange={(evento) => setMao({ ...mao, posicao: evento.target.value })} placeholder="no fim" className={CLASSE_DO_CAMPO} />
                </label>
                <label className="text-sm font-semibold">
                  Caixinha
                  <select value={mao.modeloCaixinhaId} onChange={(evento) => setMao({ ...mao, modeloCaixinhaId: evento.target.value })} className={CLASSE_DO_CAMPO}>
                    <option value="">Manter</option>
                    {dados.modelos.map((modelo) => (
                      <option key={modelo.id} value={modelo.id}>
                        {modelo.nome}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-2 flex justify-end">
                <button type="submit" disabled={pendente || !mao.letra || !mao.prateleira} className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm font-medium hover:bg-fundo disabled:opacity-50">
                  {pendente ? <Loader size={14} className="animate-spin" /> : <ArrowRight size={14} />} Mover para {mao.letra && mao.prateleira ? `${mao.letra}${mao.prateleira}` : "…"}
                </button>
              </div>
            </form>

            {erro && <p className="border-t border-borda px-3 py-2 text-sm text-red-700">{erro}</p>}

            {dados.historico.length > 0 && (
              <div className="border-t border-borda p-3">
                <p className="mb-1 text-xs font-semibold uppercase text-suave">Trocas de lugar</p>
                <ul className="space-y-0.5 text-xs text-suave">
                  {dados.historico.map((item) => (
                    <li key={item.id} className="tabular-nums">
                      {DATA(item.em)} · {item.de ?? "sem lugar"} → <span className="font-medium text-texto">{item.para}</span>
                      {item.usuario ? ` · ${item.usuario}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
