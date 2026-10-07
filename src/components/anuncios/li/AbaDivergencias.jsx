"use client";

import { Loader, RefreshCw } from "lucide-react";

import { valorParaTela } from "@/lib/canaisDeVenda/li/apresentacao";

/**
 * Aba Divergencias do anuncio da Loja Integrada (pedido do dono em 07/10/2026: o pop-up de
 * diferencas do icone virou esta aba, a PRIMEIRA a esquerda, e so aparece quando a loja e o Rise
 * estao diferentes). O editor le a loja ao abrir (`abrirJanelaLI`, so leitura) e passa o resultado.
 *
 * O que se compara e o anuncio SALVO com o que esta na loja: o Sincronizar envia o salvo. Os
 * campos "so tem na loja" (vazio no Rise) aparecem, mas nao sao enviados: vazio nunca apaga.
 */

function Valor({ campo, valor, quandoVazio }) {
  const texto = valorParaTela(campo, valor);
  if (texto === null) return <span className="text-suave italic">{quandoVazio}</span>;
  return <span className="block max-h-32 overflow-y-auto break-words whitespace-pre-wrap">{texto}</span>;
}

function LinhaDeDiferenca({ item }) {
  const vazioNoRise = item.tipo === "vazioNoRise";
  return (
    <li className={`rounded border p-3 ${vazioNoRise ? "border-borda bg-fundo/60 text-suave" : "border-amber-200 bg-amber-50/50"}`}>
      <p className="text-sm font-medium text-texto">
        {item.rotulo}
        <span className="ml-1.5 text-xs font-normal text-suave">{vazioNoRise ? "só tem na loja" : "diferente"}</span>
      </p>
      <dl className="mt-1.5 grid grid-cols-2 gap-3 text-xs">
        <div className="min-w-0">
          <dt className="text-[11px] text-suave">No Rise (salvo)</dt>
          <dd>
            <Valor campo={item.campo} valor={item.rise} quandoVazio="vazio no Rise (não será enviado)" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-suave">Na Loja Integrada</dt>
          <dd>
            <Valor campo={item.campo} valor={item.li} quandoVazio="vazio na loja" />
          </dd>
        </div>
      </dl>
    </li>
  );
}

export default function AbaDivergencias({ leitura, lerLoja, lendo }) {
  const diferencas = leitura?.diferencas ?? [];
  const avisos = leitura?.avisos ?? [];
  const iguais = leitura?.iguais ?? 0;
  const diferentes = diferencas.filter((item) => item.tipo === "diferente").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-semibold">{diferentes} campo(s) diferente(s)</span> entre o anúncio salvo no Rise e a Loja Integrada.{" "}
          <span className="text-suave">O &quot;Sincronizar com a LI&quot;, no rodapé, envia o que está no Rise.</span>
        </p>
        <button
          type="button"
          onClick={lerLoja}
          disabled={lendo}
          className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-xs hover:bg-fundo disabled:opacity-60"
        >
          {lendo ? <Loader size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Ler a loja de novo
        </button>
      </div>

      <ul className="space-y-2">
        {diferencas.map((item) => (
          <LinhaDeDiferenca key={item.campo} item={item} />
        ))}
      </ul>
      {iguais > 0 && <p className="text-xs text-suave">{iguais} campo(s) igual(is) no Rise e na loja.</p>}

      {avisos.length > 0 && (
        <ul className="space-y-1 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {avisos.map((aviso, indice) => (
            <li key={`${indice}-${aviso}`}>{aviso}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
