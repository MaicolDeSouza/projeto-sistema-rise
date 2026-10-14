"use client";

import { useState } from "react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { useAlteracaoDaAba } from "./ConfiguracoesEmAbas";
import { MOTIVO_SO_LEITURA, RodapeDaAba, useSalvarAba } from "./salvarDaAba";

/**
 * A aba Canais: por enquanto só o interruptor "Pesquisar na internet" do chat da equipe. Os cartões do WhatsApp e do Telegram
 * chegam com as entregas deles. Ligado, a IA do chat interno ganha a ferramenta de pesquisa (cada pesquisa sai do orçamento
 * interno); o atendimento aos clientes nunca pesquisa.
 *
 * @param {{ podeEditar: boolean, internet: boolean }} props
 */
export default function AbaCanais({ podeEditar, internet }) {
  const [ligada, setLigada] = useState(internet);
  const { erros, aviso, pendente, salvar } = useSalvarAba("canais");

  const sujo = ligada !== internet;
  useAlteracaoDaAba("canais", sujo);

  function aoEnviar(evento) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("internet", String(ligada));
    salvar(dados);
  }

  return (
    <form onSubmit={aoEnviar}>
      <fieldset disabled={!podeEditar} title={podeEditar ? undefined : MOTIVO_SO_LEITURA} className="flex min-w-0 flex-col gap-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={ligada}
            aria-labelledby="rotulo-internet"
            onClick={() => setLigada((atual) => !atual)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-[background-color] duration-150 motion-reduce:transition-none before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${ligada ? "bg-acento" : "bg-slate-300"}`}
          >
            <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-[translate] duration-150 motion-reduce:transition-none ${ligada ? "translate-x-5" : "translate-x-0"}`} />
          </button>
          <span id="rotulo-internet" className="flex items-center gap-1 text-sm font-semibold">
            Pesquisar na internet no chat interno
            <BolhaDeAjuda
              variante="inline"
              texto="Quando ligado, a IA do chat da equipe pode pesquisar um dado técnico na internet e cita as fontes. Cada pesquisa gasta do orçamento interno. O atendimento aos clientes pelo WhatsApp nunca pesquisa."
            />
          </span>
        </div>
        {erros.internet && <p className="-mt-3 text-[11px] text-red-700">{erros.internet}</p>}
        <RodapeDaAba pendente={pendente} aviso={aviso} podeEditar={podeEditar} sujo={sujo} />
      </fieldset>
    </form>
  );
}
