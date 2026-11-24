"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader, Pencil, Trash2, Undo2 } from "lucide-react";

import { senhaDoPortalAcao } from "@/app/cadastros/acoes-clientes";
import { CLASSE_CAMPO } from "./Campo";
import PopupExclusao from "./PopupExclusao";

/** A senha mostrada some sozinha depois deste tempo (24/11/2026): fica na tela so o bastante para copiar ou digitar. */
const TEMPO_A_VISTA_MS = 30_000;

/**
 * A senha do portal de compras do cliente (24/11/2026, Opcao 1 do dono: cifrada no Rise). A senha gravada NUNCA vem com a
 * pagina: so `temSenha`. "Mostrar" pede ao servidor (que confere o acesso e registra no Historico); "Trocar" abre o campo
 * `portalSenhaNova`; "Apagar" pergunta e manda `portalSenhaApagar`. Campo em branco no Salvar mantem a gravada.
 */
export default function SenhaDoPortal({ clienteId, nomeDoCliente, temSenha, editar }) {
  const [trocando, setTrocando] = useState(!temSenha);
  const [apagar, setApagar] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [vista, setVista] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const relogio = useRef(null);

  useEffect(() => () => clearTimeout(relogio.current), []);

  function esconder() {
    clearTimeout(relogio.current);
    setVista(null);
  }

  async function mostrar() {
    if (vista !== null) return esconder();
    setErro(null);
    setCarregando(true);
    try {
      const resposta = await senhaDoPortalAcao(clienteId);
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível mostrar a senha.");
      setVista(resposta.senha);
      clearTimeout(relogio.current);
      relogio.current = setTimeout(() => setVista(null), TEMPO_A_VISTA_MS);
    } finally {
      setCarregando(false);
    }
  }

  // 36 px de alvo (o icone e pequeno), da altura do campo ao lado; a cor muda com transicao so de cor.
  const botao =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-suave transition-colors hover:bg-fundo hover:text-texto focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:opacity-50";

  if (trocando) {
    return (
      <div className="flex items-center gap-1">
        <input
          id="portalSenhaNova"
          name="portalSenhaNova"
          type="password"
          autoComplete="new-password"
          maxLength={200}
          aria-label="Senha do portal"
          className={CLASSE_CAMPO}
        />
        {temSenha && (
          <button type="button" onClick={() => setTrocando(false)} title="Manter a senha gravada" aria-label="Manter a senha gravada" className={botao}>
            <Undo2 size={15} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1">
        <span className={`${CLASSE_CAMPO} flex items-center font-mono ${apagar ? "text-suave line-through" : ""}`}>{vista ?? "••••••••"}</span>
        {apagar ? (
          <>
            <input type="hidden" name="portalSenhaApagar" value="on" />
            <button type="button" onClick={() => setApagar(false)} title="Desfazer: manter a senha" aria-label="Desfazer: manter a senha" className={botao}>
              <Undo2 size={15} />
            </button>
          </>
        ) : (
          <>
            {clienteId && (
              <button type="button" onClick={mostrar} disabled={carregando} title={vista !== null ? "Esconder a senha" : "Mostrar a senha"} aria-label={vista !== null ? "Esconder a senha" : "Mostrar a senha"} className={botao}>
                {carregando ? <Loader size={15} className="animate-spin" /> : vista !== null ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            )}
            {editar && (
              <>
                <button type="button" onClick={() => { esconder(); setTrocando(true); }} title="Trocar a senha" aria-label="Trocar a senha" className={botao}>
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={() => setConfirmando(true)} title="Apagar a senha" aria-label="Apagar a senha" className={`${botao} hover:text-red-600`}>
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </>
        )}
      </div>
      {erro && <p className="mt-1 text-sm text-red-600">{erro}</p>}
      {confirmando && (
        <PopupExclusao
          titulo="Apagar a senha do portal?"
          nome={`Senha do portal de ${nomeDoCliente || "este cliente"}`}
          aviso="Sai do cadastro quando você salvar."
          rotulo="Apagar"
          aoCancelar={() => setConfirmando(false)}
          aoConfirmar={() => {
            esconder();
            setApagar(true);
            setConfirmando(false);
          }}
        />
      )}
    </div>
  );
}
