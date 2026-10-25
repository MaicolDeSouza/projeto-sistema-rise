"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader, RefreshCw } from "lucide-react";

import { resumoDasDivergenciasLI, valorParaTela } from "@/lib/canaisDeVenda/li/apresentacao";

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
            {/* "diferente" com o Rise vazio e campo que o Rise quer em branco (MPN): o Sincronizar limpa. */}
            <Valor campo={item.campo} valor={item.rise} quandoVazio={vazioNoRise ? "vazio no Rise (não será enviado)" : "em branco no Rise (o Sincronizar limpa na loja)"} />
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

export default function AbaDivergencias({ leitura, lerLoja, lendo, linkDoPainel = null, aoConfirmarAjuste = null }) {
  // "Já ajustei no painel": o "!" do ícone sai agora; o worker confere na próxima rodada e o traz de volta se não foi.
  const [confirmacao, setConfirmacao] = useState({ estado: "parado", erro: null });
  async function confirmarAjuste() {
    setConfirmacao({ estado: "enviando", erro: null });
    const resultado = await aoConfirmarAjuste();
    setConfirmacao(resultado?.ok ? { estado: "feito", erro: null } : { estado: "parado", erro: resultado?.erro ?? "Não foi possível registrar." });
  }
  const diferencas = leitura?.diferencas ?? [];
  const avisos = leitura?.avisos ?? [];
  const iguais = leitura?.iguais ?? 0;
  const fotos = leitura?.fotos ?? null;
  const fotosMudam = ["diferentes", "faltam"].includes(fotos?.estado);
  // Os motivos do "!" do icone: campos que o Sincronizar corrige, e o que so o painel da LI corrige (origem e tipo de
  // producao, produto inativo). A aba abre com qualquer um deles (`resumoDasDivergenciasLI`).
  const { diferentes, fiscais, inativo } = resumoDasDivergenciasLI(leitura);
  const soNoPainel = fiscais + (inativo ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          {diferentes > 0 && (
            <>
              <span className="font-semibold">{diferentes} campo(s) diferente(s)</span> entre o anúncio salvo no Rise e a Loja Integrada.{" "}
              <span className="text-suave">O &quot;Sincronizar com a LI&quot;, no rodapé, envia o que está no Rise.</span>{" "}
            </>
          )}
          {soNoPainel > 0 && (
            <>
              <span className="font-semibold">{soNoPainel} ajuste(s) só no painel da LI</span>
              <span className="text-suave"> (o Sincronizar não os grava, a API da loja não deixa).</span>
            </>
          )}
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
        {fotosMudam && (
          <li className="rounded border border-amber-200 bg-amber-50/50 p-3">
            <p className="text-sm font-medium text-texto">
              Fotos<span className="ml-1.5 text-xs font-normal text-suave">diferente</span>
            </p>
            <p className="mt-1 text-xs">{fotos.texto}</p>
          </li>
        )}
      </ul>
      {iguais > 0 && diferentes > 0 && <p className="text-xs text-suave">{iguais} campo(s) igual(is) no Rise e na loja.</p>}

      {(avisos.length > 0 || inativo) && (
        <ul className="space-y-1 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {inativo && <li>O produto está inativo na Loja Integrada: ele não aparece para o cliente. Ative no painel da LI quando for vender.</li>}
          {avisos.map((aviso, indice) => (
            <li key={`${indice}-${aviso}`}>{aviso}</li>
          ))}
        </ul>
      )}
      {soNoPainel > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {linkDoPainel && (
            <a href={linkDoPainel} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-xs text-acento hover:bg-fundo">
              Abrir no painel da LI
              <ExternalLink size={13} />
            </a>
          )}
          {fiscais > 0 && aoConfirmarAjuste && (
            <button
              type="button"
              onClick={confirmarAjuste}
              disabled={confirmacao.estado !== "parado"}
              title="Tira o ! do ícone agora. O Rise confere a loja na próxima rodada e o ! volta se a origem ou o tipo de produção continuarem vazios ou diferentes."
              className="inline-flex items-center gap-1.5 rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {confirmacao.estado === "enviando" ? <Loader size={13} className="animate-spin" /> : <Check size={13} />}
              {confirmacao.estado === "feito" ? "Registrado" : "Já ajustei no painel"}
            </button>
          )}
          {confirmacao.estado === "feito" && <span className="text-xs text-suave">O ! saiu do ícone. O Rise confere a loja na próxima rodada.</span>}
          {confirmacao.erro && <span className="text-xs text-red-700">{confirmacao.erro}</span>}
        </div>
      )}
    </div>
  );
}
