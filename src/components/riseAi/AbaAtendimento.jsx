"use client";

import { useState } from "react";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import { useAlteracaoDaAba } from "./ConfiguracoesEmAbas";
import { MOTIVO_SO_LEITURA, RodapeDaAba, useSalvarAba } from "./salvarDaAba";

const MAXIMO = 12000;
const comoLinhasUnix = (valor) => String(valor ?? "").replace(/\r\n?/g, "\n").trim();

/**
 * Um prompt editável: a caixa, o contador, "Restaurar padrão" (põe o texto de fábrica na caixa; só vale ao salvar) e, recolhida,
 * a versão anterior com quem a alterou e quando. "Usar esta versão" também só põe o texto na caixa.
 */
function CampoDePrompt({ nome, rotulo, ajuda, valor, aoMudar, padrao, anterior, erro }) {
  const igualAoPadrao = comoLinhasUnix(valor) === comoLinhasUnix(padrao);
  return (
    <section className="flex flex-col gap-2">
      <Campo nome={nome} rotulo={rotulo} ajuda={ajuda} erro={erro}>
        <textarea
          id={nome}
          name={nome}
          value={valor}
          onChange={(evento) => aoMudar(evento.target.value)}
          rows={10}
          maxLength={MAXIMO}
          spellCheck={false}
          className={`${CLASSE_CAMPO} ${bordaDoCampo(erro)} font-normal leading-relaxed disabled:cursor-not-allowed disabled:opacity-60`}
        />
      </Campo>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-suave">
        <button
          type="button"
          onClick={() => aoMudar(padrao)}
          disabled={igualAoPadrao}
          title={igualAoPadrao ? "A caixa já está com o texto padrão do Rise." : "Põe o texto padrão do Rise na caixa. Só vale depois de Salvar."}
          className="-ml-2 inline-flex h-10 items-center rounded-md px-2 text-sm text-acento transition-[background-color] duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          Restaurar padrão
        </button>
        <span className="tabular-nums">
          {valor.length.toLocaleString("pt-BR")} de {MAXIMO.toLocaleString("pt-BR")}
        </span>
      </div>
      {anterior && (
        <details className="rounded-md border border-borda px-3 text-sm">
          <summary className="-mx-3 cursor-pointer rounded-md px-3 py-2.5 text-suave select-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none focus-visible:ring-inset">
            Versão anterior ({anterior.nota})
          </summary>
          <pre className="max-h-60 overflow-y-auto font-sans text-xs leading-relaxed whitespace-pre-wrap">{anterior.texto}</pre>
          <button
            type="button"
            onClick={() => aoMudar(anterior.texto)}
            className="my-3 inline-flex h-10 items-center rounded-md border border-borda px-3 text-sm transition-[background-color] duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
          >
            Usar esta versão
          </button>
        </details>
      )}
    </section>
  );
}

/**
 * A aba Atendimento: o prompt das respostas ao cliente (o WhatsApp, quando entrar), que só existe para o Administrador (a
 * página só mostra a aba a quem pode, e o servidor confere de novo). O prompt do chat interno saiu com o chat (decisão C1,
 * 20/10/2026). As regras de honestidade e o formato da resposta são do código e não se editam aqui.
 *
 * @param {{ podeEditar: boolean, cliente: { texto: string, padrao: string, anterior: { texto: string, nota: string } | null } }} props
 */
export default function AbaAtendimento({ podeEditar, cliente }) {
  const [textoCliente, setTextoCliente] = useState(cliente.texto);
  const { erros, aviso, pendente, salvar } = useSalvarAba("atendimento");

  const sujo = comoLinhasUnix(textoCliente) !== comoLinhasUnix(cliente.texto);
  useAlteracaoDaAba("atendimento", sujo);

  function aoEnviar(evento) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("promptCliente", textoCliente);
    salvar(dados);
  }

  return (
    <form onSubmit={aoEnviar}>
      <fieldset disabled={!podeEditar} title={podeEditar ? undefined : MOTIVO_SO_LEITURA} className="flex min-w-0 flex-col gap-6">
        <CampoDePrompt
          nome="promptCliente"
          rotulo="Prompt das respostas ao cliente"
          ajuda="O estilo do texto pronto para mandar ao cliente: tom, abertura, fecho e como citar preço e link. Só o administrador altera. As regras de honestidade e o formato são do código."
          valor={textoCliente}
          aoMudar={setTextoCliente}
          padrao={cliente.padrao}
          anterior={cliente.anterior}
          erro={erros["prompts.atendimento"] ?? erros.promptCliente}
        />
        <RodapeDaAba pendente={pendente} aviso={aviso} podeEditar={podeEditar} sujo={sujo} />
      </fieldset>
    </form>
  );
}
