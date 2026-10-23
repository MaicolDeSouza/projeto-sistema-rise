"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyRound, Send } from "lucide-react";

import { removerTokenTelegramAcao, salvarTokenTelegramAcao, testarTelegramAcao } from "@/app/rise-ai/configuracoes/acoes";
import { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import Badge from "@/components/ui/Badge";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { ROTULO_DO_AVISO, TIPOS_DE_AVISO } from "@/lib/telegram/avisosTipos";
import { useAlteracaoDaAba } from "./ConfiguracoesEmAbas";
import { MOTIVO_SO_LEITURA, RodapeDaAba, useSalvarAba } from "./salvarDaAba";

const diaEMes = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const botao = "h-9 rounded-md border border-borda px-3 text-sm transition-[background-color] duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";
const botaoPrincipal = "inline-flex h-9 shrink-0 items-center gap-1 rounded-md bg-acento px-3 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50";

const AJUDA_DO_TOKEN =
  "No Telegram, abra o @BotFather, envie /newbot, escolha o nome e copie o token que ele devolve. O Rise guarda o token cifrado e ele nunca volta para a tela nem aparece nos registros.";
const AJUDA_DOS_AVISOS =
  "O Rise manda cada aviso uma vez, em texto simples de até 4 linhas, com o botão Abrir no Rise. Quem recebe: as pessoas vinculadas em Usuários e funções que são Administrador.";

/** O interruptor do Rise (o desenho do "Ativo" do usuário). */
function Interruptor({ ligado, aoMudar, rotulo }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={() => aoMudar(!ligado)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-[background-color] duration-150 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${ligado ? "bg-emerald-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${ligado ? "translate-x-5" : ""}`} />
    </button>
  );
}

/** O bot: o token (só de escrita), o teste e quem recebe. Cada botão grava por conta própria e relê a tela. */
function CartaoDoBot({ estado, podeEditar }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [teste, setTeste] = useState(null); // { ok, usuario, erro }
  const [aviso, setAviso] = useState(null); // { tipo: "ok" | "erro", texto }
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false);
  const [pendente, iniciar] = useTransition();

  function executar(acao, aoDarCerto) {
    setAviso(null);
    iniciar(async () => {
      const resultado = await acao();
      if (!resultado.ok) return setAviso({ tipo: "erro", texto: resultado.erro });
      aoDarCerto?.(resultado);
      router.refresh();
    });
  }

  function guardar(evento) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("token", token);
    executar(() => salvarTokenTelegramAcao(dados), () => {
      setToken("");
      setTeste(null);
      setAviso({ tipo: "ok", texto: "Token guardado. Use Testar conexão para conferir." });
    });
  }

  function testar() {
    setAviso(null);
    iniciar(async () => {
      const resultado = await testarTelegramAcao();
      if (resultado.ok === false && !("usuario" in resultado)) return setAviso({ tipo: "erro", texto: resultado.erro });
      setTeste({ ok: Boolean(resultado.ok), usuario: resultado.usuario ?? null, erro: resultado.erro ?? null });
      router.refresh();
    });
  }

  function remover() {
    if (!confirmandoRemocao) return setConfirmandoRemocao(true);
    setConfirmandoRemocao(false);
    executar(() => removerTokenTelegramAcao(), () => {
      setTeste(null);
      setAviso({ tipo: "ok", texto: "Token removido. Nenhum aviso sai até cadastrar outro." });
    });
  }

  const ultimoTeste = estado.bot.testadoEm ? `${estado.bot.ok ? "conectou" : "falhou"} em ${diaEMes(estado.bot.testadoEm)}` : null;

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-borda p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Send size={16} className="text-suave" aria-hidden="true" /> Bot do Telegram
          {estado.bot.usuario && estado.bot.ok && <span className="text-sm font-normal text-suave">{estado.bot.usuario}</span>}
        </h2>
        {ultimoTeste && <Badge tom={estado.bot.ok ? "sucesso" : "erro"}>último teste: {ultimoTeste}</Badge>}
      </header>

      <form onSubmit={guardar} className="flex flex-col gap-1.5">
        <label htmlFor="token-telegram" className="flex items-center gap-1 text-sm font-medium">
          Token do bot
          <BolhaDeAjuda variante="inline" texto={AJUDA_DO_TOKEN} />
        </label>
        <div className="flex gap-2">
          <input
            id="token-telegram"
            name="token"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={token}
            disabled={!podeEditar}
            onChange={(evento) => setToken(evento.target.value)}
            placeholder={estado.token.cadastrada ? "••••••••  (cole outro para trocar)" : "Cole o token do BotFather"}
            className={`${CLASSE_CAMPO} ${bordaDoCampo(false)} mt-0`}
          />
          <button type="submit" disabled={pendente || !podeEditar || !token.trim()} title={podeEditar ? undefined : MOTIVO_SO_LEITURA} className={botaoPrincipal}>
            <KeyRound size={14} aria-hidden="true" /> Guardar
          </button>
        </div>
        <p className="text-xs text-suave">
          {estado.token.cadastrada ? `Token cadastrado${estado.token.em ? ` em ${diaEMes(estado.token.em)}` : ""}.` : "Nenhum token cadastrado: nenhum aviso sai enquanto faltar."}
        </p>
      </form>

      <div className="flex flex-wrap items-center gap-3 border-t border-borda pt-3">
        <button type="button" disabled={pendente || !podeEditar || !estado.token.cadastrada} title={!estado.token.cadastrada ? "Cadastre o token antes de testar." : podeEditar ? undefined : MOTIVO_SO_LEITURA} onClick={testar} className={botao}>
          {pendente && !teste ? "Testando…" : "Testar conexão"}
        </button>
        {teste?.ok && <span className="text-sm text-emerald-700">Conectou: {teste.usuario}</span>}
        {teste && !teste.ok && <span className="text-sm text-red-700">{teste.erro}</span>}
        {estado.token.cadastrada && podeEditar && (
          <button type="button" disabled={pendente} onClick={remover} className="ml-auto h-9 rounded-md px-2 text-sm text-red-700 transition-[background-color] duration-150 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none disabled:opacity-50">
            {confirmandoRemocao ? "Clique de novo para remover" : "Remover token"}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5 border-t border-borda pt-3">
        <p className="text-sm font-medium">Quem recebe</p>
        {estado.vinculados.length === 0 ? (
          <p className="text-sm text-suave">Ninguém vinculado ainda.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {estado.vinculados.map((pessoa) => (
              <li key={pessoa.usuarioId}>
                <Link href={`/configuracoes/usuarios/${pessoa.usuarioId}`} className="inline-flex items-center gap-1.5 rounded-md border border-borda px-2.5 py-1 text-sm hover:bg-fundo">
                  {pessoa.nome} <span className="text-suave">· {pessoa.login}</span>
                  {!pessoa.ativo && <Badge tom="neutro">inativo</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/configuracoes/usuarios" className="text-xs text-acento hover:underline">
          Vincular uma pessoa em Usuários e funções
        </Link>
      </div>

      {aviso && (
        <p className={`text-xs ${aviso.tipo === "ok" ? "text-emerald-700" : "text-red-700"}`} role="status">
          {aviso.texto}
        </p>
      )}
    </section>
  );
}

/**
 * A aba Canais (Entrega C1): só o Telegram. Linha-guia: o Administrador vê primeiro SE o bot está pronto (token, teste,
 * quem recebe) e a ação principal é Salvar os interruptores. O recurso `riseAi.configuracoes.canais` não é delegável.
 *
 * @param {{ podeEditar: boolean, inicial: { ligado: boolean, avisos: Record<string, boolean> },
 *   estado: { token: { cadastrada: boolean, em: string|null }, bot: { usuario: string|null, testadoEm: string|null, ok: boolean|null, erro: string|null },
 *     vinculados: { usuarioId: string, login: string, nome: string, ativo: boolean }[], urlPublica: boolean } }} props
 */
export default function AbaCanais({ podeEditar, inicial, estado }) {
  const [ligado, setLigado] = useState(inicial.ligado);
  const [avisos, setAvisos] = useState(inicial.avisos);
  const { aviso, pendente, salvar } = useSalvarAba("canais");

  const sujo = ligado !== inicial.ligado || TIPOS_DE_AVISO.some((tipo) => avisos[tipo] !== inicial.avisos[tipo]);
  useAlteracaoDaAba("canais", sujo);

  function aoEnviar(evento) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("telegramLigado", String(ligado));
    for (const tipo of TIPOS_DE_AVISO) dados.set(`telegramAviso.${tipo}`, String(Boolean(avisos[tipo])));
    salvar(dados);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <CartaoDoBot estado={estado} podeEditar={podeEditar} />

      <form onSubmit={aoEnviar}>
        <fieldset disabled={!podeEditar} title={podeEditar ? undefined : MOTIVO_SO_LEITURA} className="flex min-w-0 flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-lg border border-borda p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1 text-base font-semibold">
                Bot ligado
                <BolhaDeAjuda variante="inline" texto="Desligado, nenhum aviso sai (o token e os vínculos ficam guardados)." />
              </span>
              <Interruptor ligado={ligado} aoMudar={setLigado} rotulo="Bot ligado" />
            </div>
            <div className="flex flex-col gap-2 border-t border-borda pt-3">
              <span className="flex items-center gap-1 text-sm font-medium">
                Avisos
                <BolhaDeAjuda variante="inline" texto={AJUDA_DOS_AVISOS} />
              </span>
              {TIPOS_DE_AVISO.map((tipo) => (
                <div key={tipo} className={`flex items-center justify-between gap-3 text-sm ${ligado ? "" : "text-suave"}`}>
                  <span>{ROTULO_DO_AVISO[tipo]}</span>
                  <Interruptor ligado={Boolean(avisos[tipo])} aoMudar={(valor) => setAvisos((atual) => ({ ...atual, [tipo]: valor }))} rotulo={ROTULO_DO_AVISO[tipo]} />
                </div>
              ))}
            </div>
            {!estado.urlPublica && <p className="text-xs text-amber-800">Sem APP_URL_PUBLICA o aviso vai sem o botão Abrir no Rise (é o caso do PC).</p>}
          </section>
          <RodapeDaAba pendente={pendente} aviso={aviso} podeEditar={podeEditar} sujo={sujo} />
        </fieldset>
      </form>
    </div>
  );
}
