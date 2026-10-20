"use client";

import { useState, useTransition } from "react";
import { Check, Copy, PlugZap } from "lucide-react";

import { desconectarAcao, desconectarDaEquipeAcao } from "@/app/rise-ai/acoes";
import PopupExclusao from "@/components/cadastros/PopupExclusao";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import EmptyState from "@/components/ui/EmptyState";

const PASSOS =
  "No claude.ai: Configurações › Conectores › Adicionar conector personalizado, cole este endereço e conecte. " +
  "No ChatGPT: Configurações › Aplicativos e conectores › Criar, com o mesmo endereço. " +
  "O Rise abre a tela Autorizar com o seu login: clique em Autorizar. As consultas usam as permissões do seu login.";

const CABECALHO = "px-4 py-2 font-medium";

/** dd/mm/aaaa hh:mm no fuso de São Paulo (as datas chegam em texto ISO). */
function dataHora(iso) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * A aba Conexões do Rise AI: nesta tela a pessoa precisa ver primeiro o endereço do Rise para o Claude e o ChatGPT, e a
 * ação principal é copiá-lo. Embaixo, as conexões vivas DELA (cliente, quando conectou, até quando vale sem usar), com
 * Desconectar atrás de um popup que nomeia o cliente. Sem permissão de editar, o Desconectar fica desabilitado com o
 * motivo no `title`. Para o Administrador, `equipe` traz as conexoes das outras pessoas (com o login), que ele tambem pode
 * desconectar; para os demais vem `null` e a secao nao existe.
 */
export default function Conexoes({ endereco, conexoes, podeEditar, equipe = null }) {
  const [copiado, setCopiado] = useState(false);
  const [desconectando, setDesconectando] = useState(null);
  const [erro, setErro] = useState("");
  const [pendente, iniciar] = useTransition();

  async function copiar() {
    try {
      await navigator.clipboard.writeText(endereco);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sem permissão de área de transferência: o endereço continua à vista para copiar à mão.
    }
  }

  function confirmar() {
    iniciar(async () => {
      // A conexao de outra pessoa (tem `login`) vai pela acao do Administrador; a propria, pela de sempre.
      const resultado = await (desconectando.login ? desconectarDaEquipeAcao : desconectarAcao)(desconectando.familia);
      if (resultado.ok) {
        setDesconectando(null);
        setErro("");
      } else {
        setErro(resultado.erro);
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <section className="rounded-lg border border-borda bg-superficie p-5">
        <h1 className="flex items-center gap-1.5 text-sm font-semibold">
          Endereço do Rise para o Claude e o ChatGPT
          <BolhaDeAjuda variante="inline" texto={PASSOS} />
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md border border-borda bg-fundo px-3 py-2 text-sm">{endereco}</code>
          <button
            type="button"
            onClick={copiar}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-acento px-3 text-sm font-medium text-white transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {copiado ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
            {copiado ? "Copiado" : "Copiar endereço"}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-borda bg-superficie">
        <h2 className="px-4 pt-4 text-sm font-semibold">Suas conexões</h2>
        {conexoes.length === 0 ? (
          <div className="p-4">
            <EmptyState icone={PlugZap} titulo="Nenhuma conexão ainda." />
          </div>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-borda text-left text-xs tracking-wide text-suave uppercase">
                  <th className={CABECALHO}>Cliente</th>
                  <th className={CABECALHO}>Conectado em</th>
                  <th className={CABECALHO}>
                    <span className="inline-flex items-center gap-1">
                      Vale até
                      <BolhaDeAjuda variante="inline" texto="Sem uso até essa data, a conexão vence e é preciso conectar de novo. Cada uso renova o prazo." />
                    </span>
                  </th>
                  <th className={CABECALHO}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {conexoes.map((conexao) => (
                  <tr key={conexao.familia} className="border-b border-borda last:border-0">
                    <td className="px-4 py-2 font-medium">{conexao.cliente}</td>
                    <td className="px-4 py-2 tabular-nums">{dataHora(conexao.conectadoEm)}</td>
                    <td className="px-4 py-2 tabular-nums">{dataHora(conexao.valeAte)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setErro("");
                          setDesconectando(conexao);
                        }}
                        disabled={!podeEditar}
                        title={podeEditar ? undefined : "Sem permissão para desconectar."}
                        className="rounded-md px-2 py-1 text-sm text-red-700 transition-[background-color] duration-150 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none"
                      >
                        Desconectar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {equipe && (
        <section className="rounded-lg border border-borda bg-superficie">
          <h2 className="flex items-center gap-1 px-4 pt-4 text-sm font-semibold">
            Conexões da equipe
            <BolhaDeAjuda variante="inline" texto="As conexões das outras pessoas com o Claude ou o ChatGPT. Só o Administrador vê esta lista e pode desconectar. O que cada uma consultou fica na Revisão do dia, aba Consultas." />
          </h2>
          {equipe.length === 0 ? (
            <p className="px-4 py-4 text-sm text-suave">Ninguém mais da equipe conectou ainda.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-borda text-left text-xs tracking-wide text-suave uppercase">
                    <th className={CABECALHO}>Pessoa</th>
                    <th className={CABECALHO}>Cliente</th>
                    <th className={CABECALHO}>Conectado em</th>
                    <th className={CABECALHO}>Vale até</th>
                    <th className={CABECALHO}><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {equipe.map((conexao) => (
                    <tr key={conexao.familia} className="border-b border-borda last:border-0">
                      <td className="px-4 py-2 font-medium">{conexao.login}</td>
                      <td className="px-4 py-2">{conexao.cliente}</td>
                      <td className="px-4 py-2 tabular-nums">{dataHora(conexao.conectadoEm)}</td>
                      <td className="px-4 py-2 tabular-nums">{dataHora(conexao.valeAte)}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setErro("");
                            setDesconectando(conexao);
                          }}
                          className="rounded-md px-2 py-1 text-sm text-red-700 transition-[background-color] duration-150 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none"
                        >
                          Desconectar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {desconectando && (
        <PopupExclusao
          titulo="Desconectar?"
          nome={`${desconectando.login ? `${desconectando.login} · ` : ""}${desconectando.cliente} · conectado em ${dataHora(desconectando.conectadoEm)}`}
          aviso="As consultas por essa conexão param na hora. Para voltar, conecte de novo."
          erro={erro}
          pendente={pendente}
          rotulo="Desconectar"
          aoConfirmar={confirmar}
          aoCancelar={() => setDesconectando(null)}
        />
      )}
    </div>
  );
}
