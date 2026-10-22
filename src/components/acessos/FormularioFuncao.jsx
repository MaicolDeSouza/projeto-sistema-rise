"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ellipsis, Lock } from "lucide-react";

import { excluirFuncaoAcao, salvarFuncaoAcao } from "@/app/configuracoes/acoes";
import Janela from "@/components/riseAi/Janela";
import Badge from "@/components/ui/Badge";
import PageHeader from "@/components/ui/PageHeader";
import { contarAlteracoes, permissoesParaEnvio } from "@/lib/acessos/matriz";
import VerComo from "./JanelaVerComo";
import MatrizDePermissoes from "./MatrizDePermissoes";

const PRINCIPAL =
  "inline-flex h-10 items-center rounded-md bg-acento px-4 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50";
const SECUNDARIO =
  "inline-flex h-10 items-center rounded-md border border-borda bg-superficie px-4 text-sm transition-[background-color] duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:opacity-50";
const CAMPO = "w-full rounded-md border border-borda bg-superficie px-3 py-2 text-sm read-only:bg-fundo focus-visible:border-acento focus-visible:outline-none";

/**
 * A funcao e a matriz (spec de Acessos, §5.4). Linha-guia: o dono ve primeiro o que a funcao libera, bloco a bloco; a
 * acao principal e Salvar. A Administrador abre so para leitura. Envio manual (`startTransition`), como os cadastros;
 * sair com alteracao nao salva pede confirmacao do navegador.
 */
export default function FormularioFuncao({ funcao }) {
  const router = useRouter();
  const [nome, setNome] = useState(funcao.nome);
  const [descricao, setDescricao] = useState(funcao.descricao);
  const [permissoes, setPermissoes] = useState(funcao.permissoes);
  const [salvo, setSalvo] = useState({ nome: funcao.nome, descricao: funcao.descricao, permissoes: funcao.permissoes });
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [pendente, iniciar] = useTransition();
  const fixa = funcao.fixa;

  const alteracoes = contarAlteracoes(salvo.permissoes, permissoes) + (nome !== salvo.nome ? 1 : 0) + (descricao !== salvo.descricao ? 1 : 0);

  useEffect(() => {
    if (!alteracoes) return undefined;
    const avisar = (evento) => {
      evento.preventDefault();
      evento.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [alteracoes]);

  function salvar() {
    const dados = new FormData();
    dados.set("nome", nome);
    dados.set("descricao", descricao);
    dados.set("permissoes", JSON.stringify(permissoesParaEnvio(permissoes)));
    iniciar(async () => {
      const resultado = await salvarFuncaoAcao(funcao.id, dados);
      if (!resultado.ok) {
        setErros(resultado.erros ?? {});
        setErro(resultado.erro ?? null);
        return;
      }
      setErros({});
      setErro(null);
      setSalvo({ nome, descricao, permissoes });
      if (!funcao.id) router.replace(`/configuracoes/funcoes/${resultado.id}`);
      else router.refresh();
    });
  }

  function cancelar() {
    setNome(salvo.nome);
    setDescricao(salvo.descricao);
    setPermissoes(salvo.permissoes);
    setErros({});
    setErro(null);
  }

  function excluir() {
    iniciar(async () => {
      const resultado = await excluirFuncaoAcao(funcao.id);
      if (!resultado.ok) {
        setErro(resultado.erro);
        setConfirmandoExclusao(false);
        return;
      }
      router.replace("/configuracoes/usuarios?aba=funcoes");
    });
  }

  // "Ver como": alguem so com esta funcao, calculado do que esta salvo (com alteracao na tela, espera o Salvar).
  const verComo = funcao.id && <VerComo tipo="funcao" id={funcao.id} alterado={alteracoes > 0} />;
  const acao = fixa ? (
    <div className="flex items-center gap-2">
      {verComo}
      <Badge>
        <Lock size={11} className="mr-1" aria-hidden="true" />
        Função fixa · vê e edita tudo
      </Badge>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      {verComo}
      {funcao.id && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuAberto((aberto) => !aberto)}
            aria-label="Mais ações"
            aria-expanded={menuAberto}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-suave transition-[background-color,color] duration-150 hover:bg-fundo hover:text-texto focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
          >
            <Ellipsis size={18} aria-hidden="true" />
          </button>
          {menuAberto && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuAberto(false)} aria-hidden="true" />
              <div className="absolute right-0 z-40 mt-1 w-44 rounded-lg border border-borda bg-superficie p-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMenuAberto(false);
                    setConfirmandoExclusao(true);
                  }}
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                >
                  Excluir função
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <button type="button" onClick={salvar} disabled={pendente} className={PRINCIPAL}>
        {pendente ? "Salvando…" : "Salvar"}
      </button>
    </div>
  );

  return (
    <>
      <PageHeader
        titulo={funcao.id ? salvo.nome : "Nova função"}
        voltarPara="/configuracoes/usuarios?aba=funcoes"
        voltarRotulo="Usuários e funções"
        acao={acao}
      />

      {erro && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {erro}
        </p>
      )}

      <div className="mb-4 grid gap-4 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Nome</span>
          <input value={nome} onChange={(evento) => setNome(evento.target.value)} readOnly={fixa} maxLength={60} className={CAMPO} aria-invalid={Boolean(erros.nome)} />
          {erros.nome && <span className="mt-1 block text-xs text-red-700">{erros.nome}</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Descrição</span>
          <input value={descricao} onChange={(evento) => setDescricao(evento.target.value)} readOnly={fixa} maxLength={200} className={CAMPO} />
        </label>
      </div>
      {erros.permissoes && <p className="mb-2 text-xs text-red-700">{erros.permissoes}</p>}

      <MatrizDePermissoes permissoes={permissoes} original={salvo.permissoes} aoMudar={setPermissoes} desabilitada={fixa || pendente} />

      {alteracoes > 0 && !fixa && (
        <div className="sticky bottom-0 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-borda bg-superficie px-4 py-2.5 shadow-sm">
          <span className="text-sm text-suave tabular-nums">
            {alteracoes} {alteracoes === 1 ? "alteração não salva" : "alterações não salvas"}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={cancelar} disabled={pendente} className={SECUNDARIO}>
              Cancelar
            </button>
            <button type="button" onClick={salvar} disabled={pendente} className={PRINCIPAL}>
              {pendente ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
      )}

      {confirmandoExclusao && (
        <Janela titulo={`Excluir a função ${salvo.nome}?`} aoFechar={() => setConfirmandoExclusao(false)}>
          {funcao.usuarios.length ? (
            <>
              <p className="text-sm">Perdem o acesso desta função:</p>
              <ul className="mt-2 list-disc pl-5 text-sm">
                {funcao.usuarios.map((usuario) => (
                  <li key={usuario.id}>{usuario.nome}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-suave">Nenhum usuário tem esta função.</p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmandoExclusao(false)} disabled={pendente} className={SECUNDARIO}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={excluir}
              disabled={pendente}
              className="inline-flex h-10 items-center rounded-md bg-red-600 px-4 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50"
            >
              {pendente ? "Excluindo…" : "Excluir"}
            </button>
          </div>
        </Janela>
      )}
    </>
  );
}
