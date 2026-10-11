"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { salvarConfiguracaoAcao } from "@/app/rise-ai/configuracoes/acoes";
import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import Card from "@/components/ui/Card";

const NUMEROS = [
  { nome: "primeiroTokenMs", erro: "tempoLimite.primeiroTokenMs", rotulo: "Tempo até o primeiro token (ms)", ajuda: "Quanto esperar o modelo COMEÇAR a responder antes de passar para a reserva. Um modelo local lê o prompt por dezenas de segundos: 45000 (45 s) é o ponto de partida." },
  { nome: "totalMs", erro: "tempoLimite.totalMs", rotulo: "Tempo total da resposta (ms)", ajuda: "O máximo que uma resposta inteira (com as consultas ao catálogo) pode levar. Precisa ser maior ou igual ao tempo até o primeiro token." },
  { nome: "maxChamadasDeFerramenta", erro: "maxChamadasDeFerramenta", rotulo: "Consultas ao catálogo por resposta", ajuda: "Quantas vezes o modelo pode consultar produtos, estoque e conhecimento antes de ter de responder." },
  { nome: "maxTokensResposta", erro: "maxTokensResposta", rotulo: "Tamanho máximo da resposta (tokens)", ajuda: "O limite de texto que o modelo escreve por rodada. Modelo que PENSA antes (como os da Anthropic) gasta parte disso pensando." },
  { nome: "contextoMaxTokens", erro: "contextoMaxTokens", rotulo: "Contexto máximo (tokens)", ajuda: "Quanto da conversa anterior o modelo relê. Modelo pequeno no PC rende mais com pouco." },
  { nome: "taxaPorUsuarioPorMinuto", erro: "taxaPorUsuarioPorMinuto", rotulo: "Perguntas por minuto (por pessoa)", ajuda: "Trava de quantas perguntas uma pessoa faz por minuto: evita um laço que gaste a API." },
];

/** Uma escolha "provedor + modelo habilitado" (Padrão e Reserva). */
function Escolha({ nome, rotulo, ajuda, provedores, valor, aoMudar, erro, comSemReserva = false }) {
  const doProvedor = provedores.find((provedor) => provedor.id === valor.provedor);
  // O modelo atual aparece mesmo que tenha sido desabilitado depois: a lista nunca mente sobre o que está valendo.
  const modelos = [...new Set([...(doProvedor?.habilitados ?? []), ...(valor.modelo ? [valor.modelo] : [])])];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo nome={`${nome}-provedor`} rotulo={rotulo} ajuda={ajuda}>
        <select
          id={`${nome}-provedor`}
          value={valor.provedor}
          onChange={(evento) => {
            const provedor = provedores.find((candidato) => candidato.id === evento.target.value);
            aoMudar({ provedor: evento.target.value, modelo: provedor?.habilitados[0] ?? "" });
          }}
          className={`${CLASSE_CAMPO} ${bordaDoCampo(false)}`}
        >
          {comSemReserva && <option value="">Sem reserva</option>}
          {provedores.map((provedor) => (
            <option key={provedor.id} value={provedor.id}>
              {provedor.rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <Campo nome={`${nome}-modelo`} rotulo="Modelo" erro={erro}>
        <select
          id={`${nome}-modelo`}
          value={valor.modelo}
          disabled={!valor.provedor}
          onChange={(evento) => aoMudar({ ...valor, modelo: evento.target.value })}
          className={`${CLASSE_CAMPO} ${bordaDoCampo(erro)}`}
        >
          <option value="">{modelos.length ? "Escolha o modelo" : "Habilite um modelo no cartão do provedor"}</option>
          {modelos.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </Campo>
    </div>
  );
}

/**
 * O formulário geral das configurações: Padrão e Reserva, tempos e limites, e o prompt de atendimento (o ESTILO do
 * texto para o cliente; as regras de honestidade e o formato da resposta são do código e não se editam aqui).
 *
 * Envio manual com `startTransition` (o React 19 limpa o formulário depois de uma action). Erro de validação volta por
 * campo, do servidor.
 *
 * @param {{ inicial: { padrao: { provedor: string, modelo: string }, reserva: { provedor: string, modelo: string } | null,
 *   numeros: Record<string, number>, prompt: string }, provedores: { id: string, rotulo: string, habilitados: string[] }[],
 *   promptPadrao: string }} props
 */
export default function FormularioConfiguracao({ inicial, provedores, promptPadrao }) {
  const router = useRouter();
  const [padrao, setPadrao] = useState(inicial.padrao);
  const [reserva, setReserva] = useState(inicial.reserva ?? { provedor: "", modelo: "" });
  const [numeros, setNumeros] = useState(() => Object.fromEntries(Object.entries(inicial.numeros).map(([nome, valor]) => [nome, String(valor)])));
  const [prompt, setPrompt] = useState(inicial.prompt);
  const [erros, setErros] = useState({});
  const [aviso, setAviso] = useState(null);
  const [pendente, iniciar] = useTransition();

  function salvar(evento) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("padraoProvedor", padrao.provedor);
    dados.set("padraoModelo", padrao.modelo);
    dados.set("reservaProvedor", reserva.provedor);
    dados.set("reservaModelo", reserva.modelo);
    for (const [nome, valor] of Object.entries(numeros)) dados.set(nome, valor);
    dados.set("promptAtendimento", prompt);
    setAviso(null);
    setErros({});
    iniciar(async () => {
      const resultado = await salvarConfiguracaoAcao(dados);
      if (!resultado.ok) {
        setErros(resultado.erros ?? {});
        return setAviso({ tipo: "erro", texto: resultado.erro });
      }
      setAviso({ tipo: "ok", texto: "Configurações salvas." });
      router.refresh();
    });
  }

  const promptIgualAoPadrao = prompt.replace(/\r\n?/g, "\n").trim() === promptPadrao.replace(/\r\n?/g, "\n").trim();

  return (
    <form onSubmit={salvar}>
      <Card className="flex flex-col gap-5">
        <div>
          <h2 className="text-base font-semibold">Qual modelo responde</h2>
          <p className="mt-1 text-xs text-suave">O Padrão responde primeiro. Se ele não estiver no ar ou demorar demais, a Reserva assume (e a resposta mostra qual modelo respondeu). As listas mostram só os modelos habilitados nos cartões abaixo.</p>
        </div>
        <Escolha nome="padrao" rotulo="Padrão" ajuda="O modelo que responde a toda pergunta, enquanto estiver no ar." provedores={provedores} valor={padrao} aoMudar={setPadrao} erro={erros["padrao.modelo"] ?? erros["padrao.provedor"]} />
        <Escolha nome="reserva" rotulo="Reserva" ajuda="Assume quando o Padrão falha antes de começar a responder. Sem reserva, a falha vira uma mensagem de erro." provedores={provedores} valor={reserva} aoMudar={setReserva} erro={erros["reserva.modelo"] ?? erros["reserva.provedor"] ?? erros.reserva} comSemReserva />

        <div>
          <h2 className="text-base font-semibold">Tempos e limites</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {NUMEROS.map((campo) => (
            <Campo
              key={campo.nome}
              nome={campo.nome}
              rotulo={campo.rotulo}
              ajuda={campo.ajuda}
              erro={erros[campo.erro]}
              type="number"
              inputMode="numeric"
              step="1"
              value={numeros[campo.nome]}
              onChange={(evento) => setNumeros((atual) => ({ ...atual, [campo.nome]: evento.target.value }))}
            />
          ))}
        </div>

        <div>
          <h2 className="text-base font-semibold">Estilo do texto para o cliente</h2>
          <p className="mt-1 text-xs text-suave">Tom, abertura, fecho e como citar preço e link. As regras de honestidade (nunca inventar preço nem estoque) e o formato da resposta são do código e não mudam aqui.</p>
        </div>
        <Campo nome="promptAtendimento" rotulo="Prompt de atendimento" erro={erros["prompts.atendimento"]}>
          <textarea
            id="promptAtendimento"
            value={prompt}
            onChange={(evento) => setPrompt(evento.target.value)}
            rows={9}
            maxLength={12000}
            className={`${CLASSE_CAMPO} ${bordaDoCampo(erros["prompts.atendimento"])} font-normal`}
            spellCheck={false}
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-suave">
            <span>{promptIgualAoPadrao ? "Igual ao padrão do Rise: vale o padrão, mesmo quando ele for melhorado." : "Texto próprio: vale no lugar do padrão."}</span>
            <button type="button" onClick={() => setPrompt(promptPadrao)} disabled={promptIgualAoPadrao} className="text-acento hover:underline disabled:opacity-50">
              Restaurar padrão
            </button>
          </div>
        </Campo>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pendente} className="rounded-md bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
            {pendente ? "Salvando…" : "Salvar configurações"}
          </button>
          {aviso && (
            <span className={`text-sm ${aviso.tipo === "ok" ? "text-emerald-700" : "text-red-700"}`} role="status">
              {aviso.texto}
            </span>
          )}
        </div>
      </Card>
    </form>
  );
}
