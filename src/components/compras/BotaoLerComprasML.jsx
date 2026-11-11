"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

import ConclusaoDoEnvio from "@/components/ui/ConclusaoDoEnvio";
import { lerComprasDoMLAcao } from "@/app/compras/acoes";

/**
 * "Ler compras do ML" (11/11/2026): as compras que a conta da loja fez no Mercado Livre entram agora, sem esperar o worker
 * (que le a cada 30 min). Botao secundario ao lado de "Novo pedido" (regra 1 do padrao visual); o resultado vem no pop-up
 * de sempre (`ConclusaoDoEnvio`), e a recusa no mesmo pop-up em vermelho.
 */
export default function BotaoLerComprasML() {
  const router = useRouter();
  const [resultado, setResultado] = useState(null);
  const [pendente, iniciar] = useTransition();

  function ler() {
    iniciar(async () => {
      const resposta = await lerComprasDoMLAcao();
      setResultado(resposta ?? { ok: false, erro: "Sem resposta do servidor." });
      if (resposta?.ok) router.refresh();
    });
  }

  const linhas = resultado?.ok
    ? [
        `${resultado.lidas} compra(s) dos últimos 120 dias conferida(s)`,
        resultado.novas ? `${resultado.novas} nova(s) na lista` : "Nenhuma compra nova",
        ...(resultado.pendentes ? [`${resultado.pendentes} item(ns) sem produto: abra o pedido e escolha`] : []),
      ]
    : [];

  return (
    <>
      <button
        type="button"
        onClick={ler}
        disabled={pendente}
        title="Traz agora as compras feitas no Mercado Livre pela conta da loja (o Rise também lê sozinho a cada 30 min)"
        className="inline-flex items-center gap-1.5 rounded-md border border-borda bg-superficie px-3 py-2 text-sm font-medium transition-[background-color,transform] duration-150 hover:bg-fundo active:scale-[0.97] disabled:opacity-60"
      >
        {pendente ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
        Ler compras do ML
      </button>
      {resultado && (
        <ConclusaoDoEnvio
          titulo={resultado.ok ? "Compras do ML lidas" : "Compras do ML não lidas"}
          tipo={resultado.ok ? "sucesso" : "erro"}
          mensagem={resultado.ok ? null : resultado.erro}
          linhas={linhas}
          aviso={resultado.ok && resultado.virtualPendentes ? `Entrada no depósito Virtual pendente em ${resultado.virtualPendentes} item(ns).` : null}
          botao={resultado.ok ? "OK" : "Fechar"}
          aoFechar={() => setResultado(null)}
        />
      )}
    </>
  );
}
