"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2 } from "lucide-react";

import { salvarUsuarioAcao } from "@/app/configuracoes/acoes";
import { BarraDeAbas, Painel } from "@/components/cadastros/Abas";
import Janela from "@/components/riseAi/Janela";
import Badge from "@/components/ui/Badge";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import PageHeader from "@/components/ui/PageHeader";
import { filtrarRecursos } from "@/lib/acessos/matriz";
import { gruposDaMatriz, recursoPorId } from "@/lib/acessos/recursos";
import EntradaNoRise from "./EntradaNoRise";
import HistoricoDoUsuario from "./HistoricoDoUsuario";
import VinculoTelegram from "./VinculoTelegram";
import VerComo from "./JanelaVerComo";
import SeletorDeNivel from "./SeletorDeNivel";

const ABAS = [
  { id: "dados", rotulo: "Dados" },
  { id: "acesso", rotulo: "Acesso" },
];
// A aba Historico so existe no usuario ja salvo (lancamento 2).
const ABA_DO_HISTORICO = { id: "historico", rotulo: "Histórico" };
const ABA_DO_CAMPO = { login: "dados", nome: "dados", assinatura: "dados", ativo: "dados", funcoes: "acesso", excecoes: "acesso" };
const GRUPOS = gruposDaMatriz();

const PRINCIPAL =
  "inline-flex h-10 items-center rounded-md bg-acento px-4 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50";
const SECUNDARIO =
  "inline-flex h-10 items-center gap-1.5 rounded-md border border-borda bg-superficie px-3 text-sm transition-[background-color] duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none";
const CAMPO = "w-full rounded-md border border-borda bg-superficie px-3 py-2 text-sm focus-visible:border-acento focus-visible:outline-none aria-[invalid=true]:border-red-400";

function Rotulo({ texto, ajuda }) {
  return (
    <span className="mb-1 flex items-center gap-1 text-sm font-medium">
      {texto}
      {ajuda && <BolhaDeAjuda variante="inline" texto={ajuda} />}
    </span>
  );
}

const ErroDoCampo = ({ erro }) => (erro ? <span className="mt-1 block text-xs text-red-700">{erro}</span> : null);

/**
 * O usuario (spec de Acessos, §5.5). Linha-guia: o dono ve primeiro quem e a pessoa e o que ela pode; a acao principal
 * e Salvar. Duas abas montadas e escondidas (Dados e Acesso); o erro do servidor leva a primeira aba com erro e poe o
 * ponto no titulo dela (o molde do cadastro de Cliente). Sem Excluir (so Desativar). O Telegram (Entrega C1) e do usuario salvo. No usuario salvo, o
 * "Ver como" no cabecalho e a aba Historico (lancamento 2).
 */
export default function FormularioUsuario({ usuario, funcoes, ultimoAdministrador = false, entrada = null, telegram = null }) {
  const router = useRouter();
  const [aba, setAba] = useState("dados");
  const [login, setLogin] = useState(usuario.login);
  const [nome, setNome] = useState(usuario.nome);
  const [assinatura, setAssinatura] = useState(usuario.assinatura);
  const [ativo, setAtivo] = useState(usuario.ativo);
  const [marcadas, setMarcadas] = useState(usuario.funcoes);
  const [excecoes, setExcecoes] = useState(usuario.excecoes);
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState(null);
  const [janelaAberta, setJanelaAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const [pendente, iniciar] = useTransition();

  const abas = usuario.id ? [...ABAS, ABA_DO_HISTORICO] : ABAS;
  // "Ver como" calcula do que esta SALVO: com alteracao na tela, o botao espera o Salvar.
  const ordenado = (lista) => JSON.stringify([...lista].sort());
  const alterado =
    login !== usuario.login ||
    nome !== usuario.nome ||
    assinatura !== usuario.assinatura ||
    ativo !== usuario.ativo ||
    ordenado(marcadas) !== ordenado(usuario.funcoes) ||
    JSON.stringify(excecoes) !== JSON.stringify(usuario.excecoes);

  const travaDoAtivo = usuario.peloEnv ? "Este login vem de RISE_AI_ADMINS; tire-o lá na VPS." : ultimoAdministrador ? "Último administrador ativo." : null;

  function alternarFuncao(id) {
    setMarcadas((atuais) => (atuais.includes(id) ? atuais.filter((outra) => outra !== id) : [...atuais, id]));
  }

  function adicionarExcecao(recurso) {
    setExcecoes((atuais) => (atuais.some((excecao) => excecao.recurso === recurso.id) ? atuais : [...atuais, { recurso: recurso.id, nivel: "nenhum" }]));
    setJanelaAberta(false);
    setBusca("");
  }

  function salvar() {
    const dados = new FormData();
    dados.set("login", login);
    dados.set("nome", nome);
    dados.set("assinatura", assinatura);
    if (ativo) dados.set("ativo", "on");
    for (const id of marcadas) dados.append("funcao", id);
    dados.set("excecoes", JSON.stringify(excecoes));
    iniciar(async () => {
      const resultado = await salvarUsuarioAcao(usuario.id, dados);
      if (!resultado.ok) {
        const novos = resultado.erros ?? {};
        setErros(novos);
        setErro(resultado.erro ?? null);
        const primeira = Object.keys(novos).map((campo) => ABA_DO_CAMPO[campo]).find(Boolean);
        if (primeira) setAba(primeira);
        return;
      }
      setErros({});
      setErro(null);
      if (!usuario.id) router.replace(`/configuracoes/usuarios/${resultado.id}`);
      else router.refresh();
    });
  }

  const comErro = (id) => Object.keys(erros).some((campo) => ABA_DO_CAMPO[campo] === id);
  const achados = busca.trim() ? filtrarRecursos(GRUPOS, busca) : [];

  return (
    <>
      <PageHeader
        titulo={usuario.id ? usuario.nome : "Novo usuário"}
        voltarPara="/configuracoes/usuarios"
        voltarRotulo="Usuários e funções"
        acao={
          <div className="flex flex-wrap items-center gap-2">
            {usuario.id && <VerComo tipo="usuario" id={usuario.id} alterado={alterado} />}
            <button type="button" onClick={salvar} disabled={pendente} className={PRINCIPAL}>
              {pendente ? "Salvando…" : "Salvar"}
            </button>
          </div>
        }
      />

      {erro && (
        <p className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {erro}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-borda bg-superficie">
        <BarraDeAbas abas={abas} aba={aba} aoMudar={setAba} comErro={comErro} />

        <Painel id="dados" aba={aba}>
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,14rem)_auto]">
            <label className="block">
              <Rotulo texto="Nome" />
              <input value={nome} onChange={(evento) => setNome(evento.target.value)} maxLength={80} className={CAMPO} aria-invalid={Boolean(erros.nome)} />
              <ErroDoCampo erro={erros.nome} />
            </label>
            <label className="block">
              <Rotulo texto="Login" ajuda="O login do Rise, em minúsculas. A senha da tela de entrada é definida embaixo, em Entrada no Rise." />
              <input
                value={login}
                onChange={(evento) => setLogin(evento.target.value.toLowerCase())}
                maxLength={60}
                autoCapitalize="none"
                spellCheck={false}
                className={CAMPO}
                aria-invalid={Boolean(erros.login)}
              />
              <ErroDoCampo erro={erros.login} />
            </label>
            <label className="block">
              <Rotulo texto="Assinatura" ajuda="Nome que assina as respostas no WhatsApp; nasce com o primeiro nome." />
              <input value={assinatura} onChange={(evento) => setAssinatura(evento.target.value)} maxLength={40} className={CAMPO} />
            </label>
            <div>
              <Rotulo texto="Ativo" />
              <div className="flex h-[38px] items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={ativo}
                  aria-label="Ativo"
                  disabled={Boolean(travaDoAtivo)}
                  title={travaDoAtivo ?? undefined}
                  onClick={() => setAtivo((valor) => !valor)}
                  className={`relative h-6 w-11 rounded-full transition-[background-color] duration-150 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${ativo ? "bg-emerald-600" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${ativo ? "translate-x-5" : ""}`} />
                </button>
                {usuario.peloEnv && <Badge tom="sucesso">Administrador pelo .env</Badge>}
              </div>
              <ErroDoCampo erro={erros.ativo} />
            </div>
          </div>
          {/* O login de entrada e do usuario JA salvo (com o login e o Ativo gravados), e nao do que esta sendo digitado. */}
          {usuario.id && entrada && (
            <EntradaNoRise
              usuarioId={usuario.id}
              login={usuario.login}
              nomeSugerido={usuario.nome.toLowerCase() === usuario.login ? usuario.nome : usuario.login}
              ativo={usuario.ativo}
              entrada={entrada}
            />
          )}
          {usuario.id && telegram && (
            <VinculoTelegram usuarioId={usuario.id} ativo={usuario.ativo} vinculado={Boolean(usuario.telegramVinculado)} temToken={telegram.temToken} />
          )}
        </Painel>

        <Painel id="acesso" aba={aba}>
          <div className="space-y-6 p-5">
            <section>
              <h2 className="mb-2 text-base font-semibold">Funções</h2>
              <ul className="divide-y divide-borda/60 rounded-lg border border-borda">
                {funcoes.map((funcao) => (
                  <li key={funcao.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-[background-color] duration-150 hover:bg-fundo">
                      <input type="checkbox" checked={marcadas.includes(funcao.id)} onChange={() => alternarFuncao(funcao.id)} className="h-4 w-4 accent-emerald-600" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{funcao.nome}</span>
                        {funcao.descricao && <span className="block truncate text-xs text-suave">{funcao.descricao}</span>}
                      </span>
                      <span className="shrink-0 text-xs text-suave tabular-nums">
                        {funcao.telasLiberadas.liberados} de {funcao.telasLiberadas.total} telas
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <ErroDoCampo erro={erros.funcoes} />
              {marcadas.length === 0 && excecoes.length === 0 && <p className="mt-2 text-xs text-suave">Sem função: vê só o Painel vazio.</p>}
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">Exceções</h2>
                <button type="button" onClick={() => setJanelaAberta(true)} className={SECUNDARIO}>
                  <Plus size={15} aria-hidden="true" /> Adicionar exceção
                </button>
              </div>
              {excecoes.length > 0 && (
                <ul className="divide-y divide-borda/60 rounded-lg border border-borda">
                  {excecoes.map((excecao) => {
                    const recurso = recursoPorId(excecao.recurso);
                    if (!recurso) return null;
                    return (
                      <li key={excecao.recurso} className="flex flex-wrap items-center justify-between gap-3 px-4 py-1.5">
                        <span className="min-w-0 truncate text-sm" title={recurso.dica ?? recurso.rotulo}>
                          {recurso.rotulo}
                        </span>
                        <div className="flex items-center gap-1">
                          <SeletorDeNivel
                            recurso={recurso}
                            valor={excecao.nivel}
                            aoMudar={(nivel) => setExcecoes((atuais) => atuais.map((outra) => (outra.recurso === excecao.recurso ? { ...outra, nivel } : outra)))}
                          />
                          <button
                            type="button"
                            onClick={() => setExcecoes((atuais) => atuais.filter((outra) => outra.recurso !== excecao.recurso))}
                            aria-label={`Tirar a exceção de ${recurso.rotulo}`}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-suave transition-[background-color,color] duration-150 hover:bg-red-50 hover:text-red-700 focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
                          >
                            <Trash2 size={16} aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <ErroDoCampo erro={erros.excecoes} />
            </section>
          </div>
        </Painel>

        {usuario.id && (
          <Painel id="historico" aba={aba}>
            <HistoricoDoUsuario usuarioId={usuario.id} ativa={aba === "historico"} />
          </Painel>
        )}
      </div>

      {janelaAberta && (
        <Janela titulo="Adicionar exceção" aoFechar={() => setJanelaAberta(false)} largura="max-w-lg">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-suave" aria-hidden="true" />
            <input
              type="search"
              autoFocus
              value={busca}
              onChange={(evento) => setBusca(evento.target.value)}
              placeholder="Buscar tela, dado ou ação…"
              aria-label="Buscar recurso"
              className="w-full rounded-md border border-borda bg-fundo py-2 pr-2 pl-8 text-sm focus-visible:border-acento focus-visible:outline-none"
            />
          </div>
          <ul className="mt-3 max-h-72 overflow-y-auto">
            {achados.map((recurso) => (
              <li key={recurso.id}>
                <button
                  type="button"
                  onClick={() => adicionarExcecao(recurso)}
                  className="w-full rounded-md px-3 py-2 text-left text-sm transition-[background-color] duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
                >
                  <span className="text-suave">{recurso.grupoRotulo} › </span>
                  {recurso.rotulo}
                </button>
              </li>
            ))}
          </ul>
        </Janela>
      )}
    </>
  );
}
