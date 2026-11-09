"use client";

import { useState, useTransition } from "react";
import { Loader, ScanSearch } from "lucide-react";

import ConclusaoDoEnvio from "@/components/ui/ConclusaoDoEnvio";
import { verificarAnunciosAntigosMLAcao } from "@/app/canais-de-venda/mercado-livre/acoes";

const DATA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const plural = (quantos, um, varios) => `${quantos} ${quantos === 1 ? um : varios}`;

/**
 * "Verificar anuncios antigos" (pedido do dono em 09/11/2026: varredura provisoria, "eu clico quando desejo varrer"): le a
 * conta inteira do ML e acende o "!" do icone do ML nos produtos conferidos que tem anuncio fora do Rise. Leva ~1 minuto; o
 * botao gira enquanto le e o resultado sai no popup de OK. A falha fica em vermelho ao lado do botao.
 * @param {{ ultima: {em: string, total: number, produtos: number} | null }} props a ultima verificacao, para o `title`
 */
export default function BotaoVerificarAnunciosAntigos({ ultima = null }) {
  const [lendo, iniciar] = useTransition();
  const [conclusao, setConclusao] = useState(null);
  const [erro, setErro] = useState(null);

  function verificar() {
    setErro(null);
    iniciar(async () => {
      let resultado;
      try {
        resultado = await verificarAnunciosAntigosMLAcao();
      } catch {
        resultado = { ok: false, erro: "Não foi possível falar com o servidor." };
      }
      if (!resultado?.ok) {
        setErro(resultado?.erro ?? "Não foi possível verificar.");
        return;
      }
      setConclusao({
        titulo: "Anúncios antigos verificados",
        mensagem: resultado.foraDoRise > 0 ? "Os produtos com anúncio fora do Rise estão com o \"!\" do Mercado Livre na lista de Produtos." : "Nenhum produto conferido tem anúncio fora do Rise.",
        linhas: [plural(resultado.lidos, "anúncio lido na conta", "anúncios lidos na conta"), `${plural(resultado.foraDoRise, "anúncio fora do Rise", "anúncios fora do Rise")} em ${plural(resultado.produtos, "produto conferido", "produtos conferidos")}`],
        aviso: resultado.semResposta > 0 ? `${plural(resultado.semResposta, "anúncio não respondeu", "anúncios não responderam")} e ficou de fora; verifique de novo mais tarde.` : null,
      });
    });
  }

  const titulo = ultima
    ? `Lê a conta do Mercado Livre e marca com "!" os produtos conferidos com anúncio fora do Rise. Última: ${DATA.format(new Date(ultima.em))}, ${plural(ultima.total, "anúncio", "anúncios")} em ${plural(ultima.produtos, "produto", "produtos")}.`
    : "Lê a conta do Mercado Livre e marca com \"!\" os produtos conferidos com anúncio fora do Rise.";

  return (
    <>
      <span className="inline-flex items-center gap-2">
        {erro && (
          <span role="alert" className="max-w-xs text-xs text-red-700">
            {erro}
          </span>
        )}
        <button
          type="button"
          onClick={verificar}
          disabled={lendo}
          title={titulo}
          className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-2 text-sm font-medium transition-[background-color,transform] duration-150 ease-out hover:bg-fundo active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
        >
          {lendo ? <Loader size={16} className="animate-spin" /> : <ScanSearch size={16} />}
          {lendo ? "Verificando..." : "Verificar anúncios antigos"}
        </button>
      </span>
      {conclusao && <ConclusaoDoEnvio {...conclusao} aoFechar={() => setConclusao(null)} />}
    </>
  );
}
