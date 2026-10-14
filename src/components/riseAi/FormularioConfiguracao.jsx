"use client";

import { useState } from "react";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { useAlteracaoDaAba } from "./ConfiguracoesEmAbas";
import { MOTIVO_SO_LEITURA, RodapeDaAba, useSalvarAba } from "./salvarDaAba";

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
          className={`${CLASSE_CAMPO} ${bordaDoCampo(false)} disabled:cursor-not-allowed disabled:opacity-60`}
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
          className={`${CLASSE_CAMPO} ${bordaDoCampo(erro)} disabled:cursor-not-allowed disabled:opacity-60`}
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

const textoDe = (numeros) => JSON.stringify(Object.entries(numeros).map(([nome, valor]) => [nome, String(valor)]));

/**
 * A aba Modelos (a primeira): qual modelo responde (Padrão e Reserva) e os tempos e limites. A linha-guia da tela é essa:
 * o dono entra e vê primeiro QUAL modelo responde. As chaves e o "Testar conexão" ficam nos cartões de provedor, logo abaixo.
 *
 * Envio manual com `startTransition` (o React 19 limpa o formulário depois de uma action). Erro de validação volta por
 * campo, do servidor. Sem permissão de editar, o `fieldset` trava tudo de uma vez e o motivo vai no `title`.
 *
 * @param {{ inicial: { padrao: { provedor: string, modelo: string }, reserva: { provedor: string, modelo: string } | null,
 *   numeros: Record<string, number> }, provedores: { id: string, rotulo: string, habilitados: string[] }[], podeEditar: boolean }} props
 */
export default function FormularioConfiguracao({ inicial, provedores, podeEditar }) {
  const [padrao, setPadrao] = useState(inicial.padrao);
  const [reserva, setReserva] = useState(inicial.reserva ?? { provedor: "", modelo: "" });
  const [numeros, setNumeros] = useState(() => Object.fromEntries(Object.entries(inicial.numeros).map(([nome, valor]) => [nome, String(valor)])));
  const { erros, aviso, pendente, salvar } = useSalvarAba("modelos");

  const sujo =
    padrao.provedor !== inicial.padrao.provedor ||
    padrao.modelo !== inicial.padrao.modelo ||
    reserva.provedor !== (inicial.reserva?.provedor ?? "") ||
    reserva.modelo !== (inicial.reserva?.modelo ?? "") ||
    textoDe(numeros) !== textoDe(inicial.numeros);
  useAlteracaoDaAba("modelos", sujo);

  function aoEnviar(evento) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("padraoProvedor", padrao.provedor);
    dados.set("padraoModelo", padrao.modelo);
    dados.set("reservaProvedor", reserva.provedor);
    dados.set("reservaModelo", reserva.modelo);
    for (const [nome, valor] of Object.entries(numeros)) dados.set(nome, valor);
    salvar(dados);
  }

  return (
    <form onSubmit={aoEnviar}>
      <fieldset disabled={!podeEditar} title={podeEditar ? undefined : MOTIVO_SO_LEITURA} className="flex min-w-0 flex-col gap-5">
        <div className="flex items-center gap-1">
          <h2 className="text-base font-semibold">Qual modelo responde</h2>
          <BolhaDeAjuda
            variante="inline"
            texto="O Padrão responde primeiro. Se ele não estiver no ar ou demorar demais, a Reserva assume (e a resposta mostra qual modelo respondeu). As listas mostram só os modelos habilitados nos cartões abaixo."
          />
        </div>
        <Escolha nome="padrao" rotulo="Padrão" ajuda="O modelo que responde a toda pergunta, enquanto estiver no ar." provedores={provedores} valor={padrao} aoMudar={setPadrao} erro={erros["padrao.modelo"] ?? erros["padrao.provedor"]} />
        <Escolha nome="reserva" rotulo="Reserva" ajuda="Assume quando o Padrão falha antes de começar a responder. Sem reserva, a falha vira uma mensagem de erro." provedores={provedores} valor={reserva} aoMudar={setReserva} erro={erros["reserva.modelo"] ?? erros["reserva.provedor"] ?? erros.reserva} comSemReserva />

        <h2 className="text-base font-semibold">Tempos e limites</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
              className={`${CLASSE_CAMPO} ${bordaDoCampo(erros[campo.erro])} tabular-nums disabled:cursor-not-allowed disabled:opacity-60`}
            />
          ))}
        </div>

        <RodapeDaAba pendente={pendente} aviso={aviso} podeEditar={podeEditar} sujo={sujo} />
      </fieldset>
    </form>
  );
}
