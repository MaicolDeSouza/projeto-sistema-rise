"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CircleAlert,
  CircleCheck,
  CircleX,
  CloudUpload,
  DatabaseBackup,
  Loader,
  RefreshCw,
  Server,
} from "lucide-react";

import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { andamentoDaVps, atualizarAVps, atualizarBancoDoPc, situacaoDaVps } from "@/app/integracoes/acoes-vps";
import { PASSOS_DA_COPIA, PASSOS_DO_DEPLOY } from "@/lib/vps/regras";

/// Enquanto algo roda: o deploy leva minutos, e a copia derruba e religa este servidor.
const INTERVALO_MS = 4000;
const MOSTRAR_COMMITS = 8;

const comoHora = (valor) =>
  valor ? new Date(valor).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;

function Lista({ itens, tom }) {
  if (!itens?.length) return null;
  const cores = tom === "erro" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900";
  const Icone = tom === "erro" ? CircleX : CircleAlert;
  return (
    <ul className={`mt-3 space-y-1 rounded border px-3 py-2 text-xs ${cores}`}>
      {itens.map((item) => (
        <li key={item} className="flex items-start gap-1.5">
          <Icone size={13} className="mt-0.5 shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Confirmar({ texto, aoConfirmar, aoCancelar, pendente }) {
  return (
    <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p>{texto}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={aoConfirmar}
          disabled={pendente}
          className="rounded bg-acento px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pendente ? "Enviando..." : "Sim, atualizar"}
        </button>
        <button type="button" onClick={aoCancelar} className="rounded border border-borda px-3 py-1.5 text-xs">
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** O andamento ou o resultado da ultima operacao (deploy ou copia). */
function Operacao({ operacao, servidorFora }) {
  if (!operacao) return null;
  const deploy = operacao.tipo === "deploy";
  const titulo = deploy ? "Atualizar a VPS" : "Atualizar banco do PC";
  const passos = deploy ? PASSOS_DO_DEPLOY.map((item) => item.rotulo) : Object.values(PASSOS_DA_COPIA);

  if (operacao.fase === "rodando") {
    const atual = passos.indexOf(operacao.passo);
    return (
      <div className="mt-4 rounded border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <p className="flex items-center gap-2 font-medium">
          <Loader size={15} className="animate-spin" />
          {titulo}: em andamento desde {comoHora(operacao.inicio)}
        </p>
        <ol className="mt-2 space-y-0.5 text-xs">
          {passos.map((rotulo, indice) => (
            <li
              key={rotulo}
              className={indice === atual ? "font-semibold" : indice < atual ? "text-sky-700/70 line-through" : "text-sky-700/70"}
            >
              {indice + 1}. {rotulo}
            </li>
          ))}
        </ol>
        {operacao.aviso && <p className="mt-2 text-xs">{operacao.aviso}</p>}
        {servidorFora && (
          <p className="mt-2 text-xs font-medium">O servidor do PC está reiniciando. A tela volta sozinha.</p>
        )}
      </div>
    );
  }

  const ok = operacao.fase === "ok";
  return (
    <div
      className={`mt-4 rounded border px-4 py-3 text-sm ${
        ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900"
      }`}
    >
      <p className="flex items-start gap-2 font-medium">
        {ok ? <CircleCheck size={15} className="mt-0.5 shrink-0" /> : <CircleX size={15} className="mt-0.5 shrink-0" />}
        <span>
          {titulo} {ok ? "deu certo" : "deu erro"}
          {operacao.fim ? ` (${comoHora(operacao.fim)})` : ""}: {operacao.mensagem}
        </span>
      </p>
      {!ok && operacao.passo && <p className="mt-1 text-xs">Passo: {operacao.passo}</p>}
      {operacao.servidor && <p className="mt-1 text-xs font-medium">{operacao.servidor}</p>}
      {operacao.outrasPortas && <p className="mt-1 text-xs">{operacao.outrasPortas}</p>}
      {!ok && operacao.ultimas?.length > 0 && (
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-white/70 p-2 text-[11px] text-red-950">
          {operacao.ultimas.join("\n")}
        </pre>
      )}
      {!ok && operacao.voltar?.length > 0 && (
        <div className="mt-2 text-xs">
          <p>Para voltar atrás (na VPS):</p>
          <pre className="mt-1 whitespace-pre-wrap rounded bg-white/70 p-2 text-[11px]">{operacao.voltar.join("\n")}</pre>
        </div>
      )}
      {!ok && (
        <p className="mt-2 text-xs">
          Log: {deploy ? `${operacao.log ?? "?"} (na VPS)` : "dados/logs/vps-copia-botao.log (no PC)"}
        </p>
      )}
    </div>
  );
}

/**
 * Cartao "Servidor VPS" de Integracoes, SO no Rise do PC (localhost): "Atualizar a VPS" (deploy do que esta no
 * GitHub) e "Atualizar banco do PC" (troca o banco do PC por uma copia de agora da VPS). Pedido do dono em 09/10/2026.
 */
export default function CartaoServidorVps() {
  const [situacao, setSituacao] = useState(null);
  const [lendo, setLendo] = useState(true);
  const [operacao, setOperacao] = useState(null);
  const [servidorFora, setServidorFora] = useState(false);
  const [confirmando, setConfirmando] = useState(null);
  const [erro, setErro] = useState(null);
  const [pendente, iniciarTransicao] = useTransition();

  const rodando = operacao?.fase === "rodando";

  function aplicar(resposta) {
    setLendo(false);
    if (!resposta?.ok) {
      setErro(resposta?.erro ?? "Não consegui ler a situação.");
      return;
    }
    setErro(null);
    setSituacao(resposta);
    setOperacao(resposta.operacao ?? null);
  }

  // A situacao e lida ao abrir: leva alguns segundos (busca no GitHub e uma conexao com a VPS).
  useEffect(() => {
    let vivo = true;
    situacaoDaVps()
      .then((resposta) => vivo && aplicar(resposta))
      .catch(() => vivo && aplicar({ ok: false, erro: "O servidor do PC não respondeu." }));
    return () => {
      vivo = false;
    };
  }, []);

  // Enquanto algo roda, pergunta o andamento. Na copia o servidor do PC cai e volta: a pergunta que falha e esperada.
  useEffect(() => {
    if (!rodando) return;
    let vivo = true;
    const relogio = setInterval(async () => {
      try {
        const resposta = await andamentoDaVps();
        if (!vivo) return;
        setServidorFora(false);
        if (!resposta.ok) return;
        setOperacao(resposta.operacao);
        if (resposta.operacao?.fase !== "rodando") {
          // Terminou: le tudo de novo (versao no ar, o que falta subir).
          aplicar(await situacaoDaVps());
        }
      } catch {
        if (vivo) setServidorFora(true);
      }
    }, INTERVALO_MS);
    return () => {
      vivo = false;
      clearInterval(relogio);
    };
  }, [rodando]);

  function conferir() {
    setLendo(true);
    iniciarTransicao(async () => {
      try {
        aplicar(await situacaoDaVps());
      } catch {
        aplicar({ ok: false, erro: "O servidor do PC não respondeu." });
      }
    });
  }

  function executar(tipo) {
    setErro(null);
    iniciarTransicao(async () => {
      const resposta = tipo === "deploy" ? await atualizarAVps() : await atualizarBancoDoPc();
      setConfirmando(null);
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      setOperacao({
        tipo,
        fase: "rodando",
        inicio: new Date().toISOString(),
        passo: tipo === "deploy" ? PASSOS_DO_DEPLOY[0].rotulo : PASSOS_DA_COPIA.dump,
      });
    });
  }

  const vps = situacao?.vps;
  const deploy = situacao?.deploy;
  const copia = situacao?.copia;
  const commits = situacao?.commits ?? [];
  const botao =
    "inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm font-medium hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-fundo p-2 text-acento">
            <Server size={18} />
          </span>
          <div>
            <p className="flex items-center gap-2 font-semibold">
              Servidor VPS
              {lendo ? (
                <Badge>lendo...</Badge>
              ) : vps?.alcancavel ? (
                <Badge tom="sucesso">No ar</Badge>
              ) : (
                <Badge tom="erro">Sem resposta</Badge>
              )}
            </p>
            <p className="text-xs text-suave">rise.4hobby.com.br · só aparece no Rise do PC</p>
          </div>
        </div>
        <button type="button" onClick={conferir} disabled={lendo || pendente || rodando} className={botao}>
          <RefreshCw size={14} className={lendo ? "animate-spin" : ""} />
          Conferir de novo
        </button>
      </div>

      {vps?.alcancavel && (
        <div className="mt-3 space-y-0.5 text-sm">
          <p>
            <span className="text-suave">Na VPS:</span> versão {vps.versaoNoAr ?? "?"} · commit{" "}
            <code>{vps.commitNoAr ?? "?"}</code>
            {vps.disco ? ` · disco ${vps.disco}` : ""}
            {typeof vps.varreduras === "number" ? ` · ${vps.varreduras} varredura(s) agora, ${vps.naFila ?? 0} na fila` : ""}
          </p>
          <p>
            <span className="text-suave">No GitHub:</span> commit <code>{situacao.commitDoGithub ?? "?"}</code>
            {deploy?.nada ? " · igual à VPS" : commits.length ? ` · ${commits.length} commit(s) que a VPS ainda não tem` : ""}
          </p>
        </div>
      )}

      {erro && (
        <p className="mt-3 flex items-start gap-1.5 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          <CircleX size={15} className="mt-0.5 shrink-0" />
          {erro}
        </p>
      )}

      <Operacao operacao={operacao} servidorFora={servidorFora} />

      {situacao && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded border border-borda p-4">
            <p className="flex items-center gap-2 font-medium">
              <CloudUpload size={16} className="text-acento" /> Atualizar a VPS
            </p>
            <p className="mt-1 text-xs text-suave">
              Envia à VPS o código que está no GitHub. O banco da VPS não é copiado nem apagado: as mudanças de banco
              (migrations) só acrescentam, com backup antes.
            </p>
            {commits.length > 0 && (
              <ul className="mt-3 space-y-0.5 text-xs">
                {commits.slice(0, MOSTRAR_COMMITS).map((linha) => (
                  <li key={linha} className="truncate font-mono" title={linha}>
                    {linha}
                  </li>
                ))}
                {commits.length > MOSTRAR_COMMITS && (
                  <li className="text-suave">e mais {commits.length - MOSTRAR_COMMITS} commit(s)</li>
                )}
              </ul>
            )}
            <Lista itens={deploy?.nada ? [] : deploy?.bloqueios} tom="erro" />
            <Lista itens={deploy?.avisos} tom="alerta" />
            {deploy?.nada && <p className="mt-3 text-xs text-suave">A VPS já roda o que está no GitHub.</p>}

            {confirmando === "deploy" ? (
              <Confirmar
                texto="Atualizar a VPS agora? O site continua no ar durante a construção; a troca leva segundos."
                aoConfirmar={() => executar("deploy")}
                aoCancelar={() => setConfirmando(null)}
                pendente={pendente}
              />
            ) : (
              <button
                type="button"
                onClick={() => setConfirmando("deploy")}
                disabled={!deploy?.pode || rodando || pendente || lendo}
                className={`mt-3 ${botao}`}
              >
                <CloudUpload size={14} /> Atualizar a VPS
              </button>
            )}
          </div>

          <div className="rounded border border-borda p-4">
            <p className="flex items-center gap-2 font-medium">
              <DatabaseBackup size={16} className="text-acento" /> Atualizar banco do PC
            </p>
            <p className="mt-1 text-xs text-suave">
              Troca o banco deste PC por uma cópia de agora da VPS. O que foi mudado só no banco do PC se perde (o PC é
              cópia). As conexões do Mercado Livre e do Bling do PC são mantidas. O Rise do PC para e volta sozinho,
              em 1 a 3 minutos.
            </p>
            <Lista itens={copia?.bloqueios} tom="erro" />

            {confirmando === "copia" ? (
              <Confirmar
                texto="Trocar o banco do PC pela cópia de agora da VPS? O Rise do PC fica fora do ar por 1 a 3 minutos e volta sozinho."
                aoConfirmar={() => executar("copia")}
                aoCancelar={() => setConfirmando(null)}
                pendente={pendente}
              />
            ) : (
              <button
                type="button"
                onClick={() => setConfirmando("copia")}
                disabled={!copia?.pode || rodando || pendente || lendo}
                className={`mt-3 ${botao}`}
              >
                <DatabaseBackup size={14} /> Atualizar banco do PC
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
