"use client";

import { useState } from "react";

import Campo from "@/components/cadastros/Campo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import BarraDeOrcamento from "./BarraDeOrcamento";
import { useAlteracaoDaAba } from "./ConfiguracoesEmAbas";
import { MOTIVO_SO_LEITURA, RodapeDaAba, useSalvarAba } from "./salvarDaAba";

/** "45,50", "1.234,50" e "45.5" valem o mesmo que o servidor lê; em branco ou com letra não vale nada (`null`). */
function reaisDoTexto(texto) {
  const limpo = String(texto).replace(/R\$|\s/g, "");
  if (!limpo) return null;
  const normal = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : null;
}

/** Digitar "70" onde estava "70,00" não é uma alteração. */
const mudou = (digitado, salvo) => reaisDoTexto(digitado) !== reaisDoTexto(salvo);

function CartaoDoOrcamento({ titulo, ajuda, campo, valor, aoMudar, erro, estado }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-borda p-4">
      <div className="flex items-center gap-1">
        <h2 className="text-base font-semibold">{titulo}</h2>
        <BolhaDeAjuda variante="inline" texto={ajuda} />
      </div>
      <Campo
        nome={campo}
        rotulo="Teto do mês (R$)"
        erro={erro}
        inputMode="decimal"
        autoComplete="off"
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        className={`mt-1 h-10 w-full max-w-48 rounded border px-2.5 text-[15px] font-medium tabular-nums focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${erro ? "border-red-400" : "border-borda focus:border-acento"}`}
      />
      <BarraDeOrcamento rotulo="Gasto neste mês" gastoBrl={estado.gastoBrl} tetoBrl={estado.tetoBrl} percentual={estado.percentual} nivel={estado.nivel} />
      {estado.semPreco > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {estado.semPreco === 1 ? "1 resposta sem preço cadastrado não entra na conta." : `${estado.semPreco} respostas sem preço cadastrado não entram na conta.`}
        </p>
      )}
    </section>
  );
}

/**
 * A aba Orçamentos: o teto de gasto do mês dos clientes e o interno, cada um com a barra do que já foi gasto. A barra mostra o
 * teto SALVO; o campo, o que está sendo digitado.
 *
 * @param {{ podeEditar: boolean, inicial: { clientes: string, interno: string }, cotacao: string,
 *   estados: Record<"clientes" | "interno", { gastoBrl: number, tetoBrl: number, percentual: number, nivel: string, semPreco: number }> }} props
 */
export default function AbaOrcamentos({ podeEditar, inicial, cotacao, estados }) {
  const [clientes, setClientes] = useState(inicial.clientes);
  const [interno, setInterno] = useState(inicial.interno);
  const { erros, aviso, pendente, salvar } = useSalvarAba("orcamentos");

  const sujo = mudou(clientes, inicial.clientes) || mudou(interno, inicial.interno);
  useAlteracaoDaAba("orcamentos", sujo);

  function aoEnviar(evento) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("orcamentoClientesBrl", clientes);
    dados.set("orcamentoInternoBrl", interno);
    salvar(dados);
  }

  return (
    <form onSubmit={aoEnviar}>
      <fieldset disabled={!podeEditar} title={podeEditar ? undefined : MOTIVO_SO_LEITURA} className="flex min-w-0 flex-col gap-5">
        <div className="grid gap-4 xl:grid-cols-2">
          <CartaoDoOrcamento
            titulo="Clientes (WhatsApp)"
            ajuda="O teto de gasto do mês com o atendimento automático aos clientes pelo WhatsApp. O WhatsApp ainda não está ligado: esta barra fica em zero por enquanto."
            campo="orcamentoClientesBrl"
            valor={clientes}
            aoMudar={setClientes}
            erro={erros["orcamentos.clientesBrl"]}
            estado={estados.clientes}
          />
          <CartaoDoOrcamento
            titulo="Interno (chat, Telegram, anúncios)"
            ajuda="O teto de gasto do mês da equipe: o chat do Rise AI, a pesquisa na internet e, nas próximas entregas, o Telegram e os anúncios. Quando acaba, o chat avisa e o campo de texto trava até o mês virar ou o teto subir."
            campo="orcamentoInternoBrl"
            valor={interno}
            aoMudar={setInterno}
            erro={erros["orcamentos.internoBrl"]}
            estado={estados.interno}
          />
        </div>
        <p className="text-xs text-suave">Dólar nas contas: {cotacao}.</p>
        <RodapeDaAba pendente={pendente} aviso={aviso} podeEditar={podeEditar} sujo={sujo} />
      </fieldset>
    </form>
  );
}
