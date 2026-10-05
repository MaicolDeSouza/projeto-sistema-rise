"use client";

import { useId, useState, useTransition } from "react";
import { Loader, RefreshCw } from "lucide-react";

import { sincronizarEstoqueComBling } from "@/app/produtos/acoes-bling";
import { resumirEstoqueDaLista } from "@/lib/blingSync/apresentacao";

/**
 * "Sincronizar estoque com Bling", ao lado de "Importar do Bling" na lista de Produtos. Le o saldo de
 * TODOS os produtos do Rise no Bling (so leitura, em lotes de 100 codigos) e grava em cada um o saldo
 * lido e o estoque recalculado (saldo mais os ajustes ainda nao enviados). E o unico jeito de ler o
 * saldo: nada disso roda sozinho. Por isso o botao avisa, antes do clique, o que vai acontecer.
 *
 * A acao devolve `ok: true` mesmo com falhas e mesmo com 0 atualizados (a leitura aconteceu; o que
 * nao deu certo vem em `falhas`). A tela mostra SEMPRE os dois numeros e lista as falhas, e nunca
 * trata o `ok` como "tudo atualizado" (ver `resumirEstoqueDaLista`). A lista de Produtos atras se
 * atualiza sozinha: a acao revalida a pagina quando alguem foi atualizado, o mesmo caminho do
 * "Importar do Bling".
 */

const AVISO_CURTO = "Atualiza o estoque de todos os produtos aqui, lendo o saldo no Bling.";
const AVISO_LONGO =
  "Le o saldo no Bling e atualiza o estoque de TODOS os produtos do Rise neste sistema. Os ajustes ainda nao enviados ao Bling sao preservados. Nada e alterado no Bling.";

export default function BotaoSincronizarEstoque() {
  const [pendente, iniciarTransicao] = useTransition();
  const [resultado, setResultado] = useState(null);
  const idDoAviso = useId();

  function sincronizar() {
    setResultado(null);
    iniciarTransicao(async () => {
      try {
        setResultado(await sincronizarEstoqueComBling());
      } catch {
        // A acao ja devolve `{ ok: false }` para o que da errado no servidor; isto cobre a rede caindo.
        setResultado({ ok: false, erro: "Nao foi possivel falar com o servidor. Tente de novo." });
      }
    });
  }

  const resumo = resultado?.ok ? resumirEstoqueDaLista(resultado) : null;
  const totalDeFalhas = resumo ? resumo.falhas.length + resumo.falhasOcultas : 0;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={sincronizar}
        disabled={pendente}
        title={AVISO_LONGO}
        aria-describedby={idDoAviso}
        className="inline-flex items-center gap-1.5 rounded border border-acento bg-superficie px-3 py-2 text-sm font-medium text-acento hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendente ? <Loader size={16} className="animate-spin" /> : <RefreshCw size={16} />}
        {pendente ? "Atualizando estoque..." : "Sincronizar estoque com Bling"}
      </button>

      <p id={idDoAviso} className="max-w-56 text-right text-[11px] leading-snug text-suave">
        {pendente ? "Lendo o saldo no Bling, em lotes. Aguarde terminar." : AVISO_CURTO}
      </p>

      {resultado && !resultado.ok && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-700">
          {resultado.erro}
        </p>
      )}

      {resumo && (
        <div role="status" className="max-w-xs text-right text-xs">
          <p className={`font-medium ${resumo.tom === "ok" ? "text-emerald-700" : "text-amber-700"}`}>{resumo.linha}</p>
          {totalDeFalhas > 0 && (
            <>
              <p className="mt-1 text-red-700">{totalDeFalhas} com falha:</p>
              <ul className="text-red-700">
                {resumo.falhas.map((falha, indice) => (
                  <li key={`${indice}-${falha.sku}`}>
                    <span className="font-mono">{falha.sku}</span>: {falha.erro}
                  </li>
                ))}
                {resumo.falhasOcultas > 0 && <li>e mais {resumo.falhasOcultas}</li>}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
