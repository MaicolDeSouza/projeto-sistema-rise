"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, KeyRound, Loader, Plus, Trash2 } from "lucide-react";

import { adicionarCategoria, removerCategoria, salvarLoginDaFonte } from "@/app/mercados/acoes";

function comoData(valor) {
  if (!valor) return null;
  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * As categorias de um fornecedor com PORTAL DE LOGIN (a Santana), e o login.
 *
 * Pedido do dono em 17/09/2026: a fonte e cadastrada testando UMA categoria, e as
 * outras entram depois, aqui. A varredura le so as categorias desta lista.
 *
 * Adicionar nao abre o site: com 30 s entre pedidos, conferir cada link na hora
 * seria esperar minutos por clique. O total aparece depois da proxima varredura.
 */
export default function CategoriasDaFonte({ fonte }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [novaUrl, setNovaUrl] = useState("");
  const [trocandoLogin, setTrocandoLogin] = useState(!fonte.temLogin);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);

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

  function adicionar(evento) {
    evento.preventDefault();
    executar(
      () => adicionarCategoria(fonte.id, novaUrl),
      () => {
        setNovaUrl("");
        setAviso("Categoria adicionada. Ela entra na próxima varredura.");
      },
    );
  }

  function salvarLogin(evento) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    executar(
      () => salvarLoginDaFonte(fonte.id, { usuario: dados.get("usuario"), senha: dados.get("senha") }),
      () => {
        setTrocandoLogin(false);
        setAviso("Login guardado.");
      },
    );
  }

  const categorias = fonte.categorias ?? [];

  return (
    <div className="space-y-3 rounded border border-borda bg-fundo px-3 py-3">
      <div>
        <p className="text-sm font-medium">Categorias varridas ({categorias.length})</p>
        <p className="text-xs text-suave">
          Portal com login: só as categorias abaixo são lidas, uma página a cada 30 segundos.
        </p>
      </div>

      <ul className="divide-y divide-borda rounded border border-borda bg-superficie">
        {categorias.map((categoria) => (
          <li key={categoria.url} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <a
                href={categoria.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 font-mono text-xs break-all text-acento hover:underline"
              >
                {categoria.url.replace(/^https?:\/\/(www\.)?/, "")}
                <ExternalLink size={11} className="shrink-0" />
              </a>
              <p className="text-xs text-suave">
                {typeof categoria.total === "number"
                  ? `${categoria.total.toLocaleString("pt-BR")} produto(s) no portal`
                  : "total aparece na próxima varredura"}
                {typeof categoria.lidos === "number" && ` · ${categoria.lidos.toLocaleString("pt-BR")} lido(s)`}
                {categoria.varridaEm && ` · varrida em ${comoData(categoria.varridaEm)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => executar(() => removerCategoria(fonte.id, categoria.url))}
              disabled={pendente || categorias.length <= 1}
              title={
                categorias.length <= 1
                  ? "A fonte precisa de pelo menos uma categoria. Para parar, use Pausar."
                  : "Tirar esta categoria da varredura (os produtos já coletados ficam)"
              }
              className="inline-flex items-center gap-1 rounded border border-borda px-2 py-1 text-xs text-red-700 hover:bg-fundo disabled:opacity-40"
            >
              <Trash2 size={12} />
              Remover
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={adicionar} className="flex flex-wrap items-end gap-2">
        <label className="min-w-64 flex-1 text-xs">
          <span className="mb-1 block text-suave">Adicionar categoria (link do portal)</span>
          <input
            type="url"
            value={novaUrl}
            onChange={(evento) => setNovaUrl(evento.target.value)}
            placeholder={`https://${fonte.dominio}/componentes/roboticos.html`}
            className="w-full rounded border border-borda bg-superficie px-2 py-1.5 font-mono text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pendente || !novaUrl.trim()}
          className="inline-flex items-center gap-1 rounded bg-acento px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pendente ? <Loader size={12} className="animate-spin" /> : <Plus size={12} />}
          Adicionar
        </button>
      </form>

      <div className="border-t border-borda pt-3">
        {trocandoLogin ? (
          <form onSubmit={salvarLogin} className="flex flex-wrap items-end gap-2">
            <label className="flex-1 text-xs">
              <span className="mb-1 block text-suave">E-mail do portal</span>
              <input
                name="usuario"
                type="email"
                autoComplete="off"
                className="w-full rounded border border-borda bg-superficie px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex-1 text-xs">
              <span className="mb-1 block text-suave">Senha do portal</span>
              <input
                name="senha"
                type="password"
                autoComplete="new-password"
                className="w-full rounded border border-borda bg-superficie px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={pendente}
              className="rounded bg-acento px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              Guardar login
            </button>
            {fonte.temLogin && (
              <button
                type="button"
                onClick={() => setTrocandoLogin(false)}
                className="rounded border border-borda px-2.5 py-1.5 text-xs"
              >
                Cancelar
              </button>
            )}
          </form>
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-xs text-suave">
            <KeyRound size={13} />
            Login guardado (cifrado){fonte.credencialAtualizadaEm && `, atualizado em ${comoData(fonte.credencialAtualizadaEm)}`}.
            <button
              type="button"
              onClick={() => setTrocandoLogin(true)}
              className="text-acento hover:underline"
            >
              Trocar login
            </button>
          </p>
        )}
      </div>

      {aviso && <p className="text-xs text-emerald-700">{aviso}</p>}
      {erro && <p className="text-xs text-red-700">{erro}</p>}
    </div>
  );
}
