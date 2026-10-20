"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";

import { definirSenhaAcao, removerLoginAcao } from "@/app/configuracoes/acoes";
import PopupExclusao from "@/components/cadastros/PopupExclusao";
import Janela from "@/components/riseAi/Janela";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";

const SECUNDARIO =
  "inline-flex h-9 items-center gap-1.5 rounded-md border border-borda bg-superficie px-3 text-sm transition-[background-color] duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";
const PRINCIPAL =
  "inline-flex h-10 items-center rounded-md bg-acento px-4 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50";
const CAMPO = "w-full rounded-md border border-borda bg-superficie px-3 py-2 text-sm focus-visible:border-acento focus-visible:outline-none aria-[invalid=true]:border-red-400";

const AJUDA =
  "A senha da tela de entrada do Rise. Só o Administrador define. O Rise guarda só um código da senha (nunca a senha) e o login passa a valer em até 1 minuto, sem deslogar ninguém. Desativar o usuário ou trocar o login dele tira o acesso.";

/**
 * O login da tela de entrada (Tinyauth) de um usuario do Rise (Opcao 1 do dono, 20/10/2026). Mostra como a pessoa entra
 * hoje e, na VPS, "Definir senha" / "Trocar senha" e "Remover login". O login do .env (a reserva de emergencia do dono)
 * aparece so como informacao: muda pelo script da VPS.
 *
 * @param {{ usuarioId: string, login: string, nomeSugerido: string, ativo: boolean, entrada: { onde: "env" | "rise" | "nenhum", nome: string | null, naVps: boolean } }} props
 */
export default function EntradaNoRise({ usuarioId, login, nomeSugerido, ativo, entrada }) {
  const router = useRouter();
  const [aberta, setAberta] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [nome, setNome] = useState(entrada.nome ?? nomeSugerido);
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [pendente, iniciar] = useTransition();

  const motivo = !entrada.naVps ? "Só na VPS: no PC não há tela de entrada." : !ativo ? "Ative o usuário (e salve) antes de definir a senha." : null;

  function abrir() {
    setNome(entrada.nome ?? nomeSugerido);
    setSenha("");
    setRepetir("");
    setErros({});
    setErro(null);
    setAberta(true);
  }

  function salvarSenha(evento) {
    evento.preventDefault();
    if (senha !== repetir) {
      setErros({ repetir: "As senhas não conferem." });
      return;
    }
    const dados = new FormData();
    dados.set("nome", nome);
    dados.set("senha", senha);
    dados.set("repetir", repetir);
    iniciar(async () => {
      const resultado = await definirSenhaAcao(usuarioId, dados);
      if (!resultado.ok) {
        setErros(resultado.erros ?? {});
        setErro(resultado.erros ? (resultado.erros.geral ?? null) : resultado.erro);
        return;
      }
      setSenha("");
      setRepetir("");
      setAberta(false);
      setAviso(`Senha salva. ${resultado.nome} entra em até 1 minuto.`);
      router.refresh();
    });
  }

  function remover() {
    iniciar(async () => {
      const resultado = await removerLoginAcao(usuarioId);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      setRemovendo(false);
      setAviso("Login removido. A pessoa deixa de entrar em até 1 minuto.");
      router.refresh();
    });
  }

  return (
    <section className="border-t border-borda px-5 py-4">
      <h2 className="mb-2 flex items-center gap-1 text-sm font-medium">
        Entrada no Rise
        <BolhaDeAjuda variante="inline" texto={AJUDA} />
      </h2>
      <div className="flex flex-wrap items-center gap-3">
        <KeyRound size={16} className="text-suave" aria-hidden="true" />
        {entrada.onde === "env" ? (
          <span className="text-sm">
            Entra como <strong>{entrada.nome}</strong> pelo .env da VPS
            <span className="ml-1 text-suave">(reserva de emergência; a senha muda pelo script da VPS)</span>
          </span>
        ) : (
          <>
            <span className="text-sm">{entrada.onde === "rise" ? <>Entra como <strong>{entrada.nome}</strong></> : <span className="text-suave">Ainda não entra no Rise</span>}</span>
            <button type="button" onClick={abrir} disabled={Boolean(motivo)} title={motivo ?? undefined} className={SECUNDARIO}>
              {entrada.onde === "rise" ? "Trocar senha" : "Definir senha"}
            </button>
            {entrada.onde === "rise" && (
              <button
                type="button"
                onClick={() => setRemovendo(true)}
                disabled={!entrada.naVps}
                title={entrada.naVps ? undefined : "Só na VPS: no PC não há tela de entrada."}
                className="h-9 rounded-md px-2 text-sm text-red-700 transition-[background-color] duration-150 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                Remover login
              </button>
            )}
          </>
        )}
      </div>
      {aviso && <p className="mt-2 text-xs text-emerald-700" role="status">{aviso}</p>}
      {erro && !aberta && !removendo && <p className="mt-2 text-xs text-red-700" role="alert">{erro}</p>}

      {aberta && (
        <Janela titulo={entrada.onde === "rise" ? "Trocar senha" : "Definir senha"} aoFechar={() => setAberta(false)}>
          <form onSubmit={salvarSenha} className="space-y-3">
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-sm font-medium">
                Nome para entrar
                <BolhaDeAjuda variante="inline" texto={`O que a pessoa digita na tela de entrada, exatamente assim (diferencia maiúsculas). Tem que ser o login ${login}, podendo mudar só maiúsculas e minúsculas.`} />
              </span>
              <input value={nome} onChange={(evento) => setNome(evento.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={40} className={CAMPO} aria-invalid={Boolean(erros.nome)} />
              {erros.nome && <span className="mt-1 block text-xs text-red-700">{erros.nome}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Senha</span>
              <input type="password" value={senha} onChange={(evento) => setSenha(evento.target.value)} autoComplete="new-password" autoFocus className={CAMPO} aria-invalid={Boolean(erros.senha)} />
              {erros.senha && <span className="mt-1 block text-xs text-red-700">{erros.senha}</span>}
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium">Repetir a senha</span>
              <input type="password" value={repetir} onChange={(evento) => setRepetir(evento.target.value)} autoComplete="new-password" className={CAMPO} aria-invalid={Boolean(erros.repetir)} />
              {erros.repetir && <span className="mt-1 block text-xs text-red-700">{erros.repetir}</span>}
            </label>
            {erro && <p className="text-xs text-red-700" role="alert">{erro}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setAberta(false)} className={SECUNDARIO}>
                Cancelar
              </button>
              <button type="submit" disabled={pendente || !senha} className={PRINCIPAL}>
                {pendente ? "Salvando…" : "Salvar senha"}
              </button>
            </div>
          </form>
        </Janela>
      )}

      {removendo && (
        <PopupExclusao
          titulo="Remover login?"
          nome={`${entrada.nome} deixa de entrar no Rise`}
          aviso="O cadastro e as funções ficam. Para voltar, defina uma senha nova."
          erro={erro}
          pendente={pendente}
          rotulo="Remover login"
          aoConfirmar={remover}
          aoCancelar={() => setRemovendo(false)}
        />
      )}
    </section>
  );
}
