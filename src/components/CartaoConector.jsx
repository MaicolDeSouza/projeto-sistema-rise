"use client";

import { useState, useTransition } from "react";
import {
  Cable,
  CircleCheck,
  CircleX,
  ExternalLink,
  Loader,
  Lock,
  RefreshCw,
  Unplug,
} from "lucide-react";

import Card from "./ui/Card";
import Badge from "./ui/Badge";
import {
  desconectarAction,
  salvarChavesAction,
  testarConexao,
} from "@/app/integracoes/acoes";

const TONS = {
  CONECTADO: "sucesso",
  ERRO: "erro",
  EXPIRADO: "alerta",
  NAO_CONFIGURADO: "neutro",
};

const ROTULOS = {
  CONECTADO: "Conectado",
  ERRO: "Erro",
  EXPIRADO: "Expirado",
  NAO_CONFIGURADO: "Não configurado",
};

function formatarData(valor) {
  if (!valor) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(valor));
}

export default function CartaoConector({
  conector,
  conexao,
  tokenPertoDoVencimento = false,
}) {
  const [pendente, iniciarTransicao] = useTransition();
  const [resultado, setResultado] = useState(null);

  const status = conexao?.status ?? "NAO_CONFIGURADO";
  const conectado = status === "CONECTADO";

  function aoTestar() {
    iniciarTransicao(async () => {
      setResultado(await testarConexao(conector.id));
    });
  }

  function aoDesconectar() {
    iniciarTransicao(async () => {
      await desconectarAction(conector.id);
      setResultado(null);
    });
  }

  function aoSalvar(formData) {
    iniciarTransicao(async () => {
      setResultado(await salvarChavesAction(conector.id, formData));
    });
  }

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-md bg-fundo p-2 text-acento">
            <Cable size={18} />
          </span>
          <div>
            <p className="font-medium">{conector.nome}</p>
            <p className="text-sm text-suave">{conector.descricao}</p>
          </div>
        </div>
        <Badge tom={TONS[status]}>{ROTULOS[status]}</Badge>
      </div>

      <dl className="mt-4 space-y-1 text-sm">
        {conexao?.contaExterna && (
          <div className="flex gap-2">
            <dt className="text-suave">Conta:</dt>
            <dd className="min-w-0 truncate font-medium">{conexao.contaExterna}</dd>
          </div>
        )}
        {conexao?.expiraEm && (
          <div className="flex gap-2">
            <dt className="text-suave">Token expira:</dt>
            <dd>{formatarData(conexao.expiraEm)}</dd>
          </div>
        )}
        {conexao?.ultimoTesteEm && (
          <div className="flex gap-2">
            <dt className="text-suave">Último teste:</dt>
            <dd>
              {formatarData(conexao.ultimoTesteEm)}{" "}
              {conexao.ultimoTesteOk ? "· ok" : "· falhou"}
            </dd>
          </div>
        )}
      </dl>

      {tokenPertoDoVencimento && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          Token da Loja Integrada próximo do vencimento. Renove-o no painel da loja.
        </p>
      )}

      {!conector.configurado && (
        <p className="mt-3 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          Faltam variáveis no .env: {conector.faltando.join(", ")}
        </p>
      )}

      {conexao?.ultimoErro && !resultado && (
        <p className="mt-3 rounded bg-red-50 p-2 text-xs break-words text-red-800">
          {conexao.ultimoErro}
        </p>
      )}

      {resultado && (
        <div
          className={`mt-3 flex items-start gap-2 rounded p-2 text-xs ${
            resultado.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"
          }`}
        >
          {resultado.ok ? (
            <CircleCheck size={14} className="mt-0.5 shrink-0" />
          ) : (
            <CircleX size={14} className="mt-0.5 shrink-0" />
          )}
          <span className="break-words">
            {resultado.ok
              ? `${resultado.conta}${resultado.detalhe ? ` — ${resultado.detalhe}` : ""} (${resultado.latenciaMs}ms)`
              : `${resultado.erro}${resultado.detalheTecnico ? ` — ${resultado.detalheTecnico}` : ""}`}
          </span>
        </div>
      )}

      {conector.bloqueado && (
        <div className="mt-4 rounded border border-borda bg-fundo p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <Lock size={13} className="shrink-0" />
            Indisponível no momento
          </p>
          <p className="mt-1.5 text-xs text-suave">{conector.bloqueado.motivo}</p>
          <p className="mt-1.5 text-xs text-suave">{conector.bloqueado.saida}</p>
        </div>
      )}

      {["chaves_estaticas", "personal_token"].includes(conector.tipoAuth) && !conectado && !conector.bloqueado && (
        <form action={aoSalvar} className="mt-4 space-y-3">
          {conector.campos.map((campo) => (
            <div key={campo.nome}>
              <label
                htmlFor={`${conector.id}-${campo.nome}`}
                className="block text-xs font-medium"
              >
                {campo.rotulo}
              </label>
              <input
                id={`${conector.id}-${campo.nome}`}
                name={campo.nome}
                type={campo.tipo ?? "password"}
                autoComplete="off"
                className="mt-1 w-full rounded border border-borda px-2 py-1.5 text-sm focus:border-acento focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-suave">{campo.ajuda}</p>
            </div>
          ))}
          <button
            type="submit"
            disabled={pendente}
            className="w-full rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {pendente ? "Salvando…" : "Salvar e testar"}
          </button>
        </form>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {conector.tipoAuth === "oauth2" && !conectado && (
          <a
            href={`${conector.origemOAuth}/api/oauth/${conector.id === "BLING" ? "bling" : "mercadolivre"}/iniciar`}
            className="rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Conectar
          </a>
        )}

        {conectado && (
          <>
            <button
              type="button"
              onClick={aoTestar}
              disabled={pendente}
              className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50"
            >
              {pendente ? (
                <Loader size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              Testar conexão
            </button>
            <button
              type="button"
              onClick={aoDesconectar}
              disabled={pendente}
              className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <Unplug size={14} />
              Desconectar
            </button>
          </>
        )}

        {/* O painel da plataforma onde se cadastra o app da API; abre em outra aba, conectado ou nao. */}
        {conector.painel && (
          <a
            href={conector.painel.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo"
          >
            <ExternalLink size={14} />
            {conector.painel.rotulo}
          </a>
        )}
      </div>
    </Card>
  );
}
