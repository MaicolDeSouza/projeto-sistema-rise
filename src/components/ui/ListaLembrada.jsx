"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { marcarTelaIniciada } from "@/components/mercados/NavegacaoDoTopo";
import { guardarListaDaTela, lerListaDaTela } from "@/lib/ultimaListaDaTela";

/**
 * A lista de uma tela lembrada nesta aba (pedido do dono em 09/11/2026): a lista guarda o proprio endereco (100 por
 * pagina, filtros, pagina, ordem) e a seta do detalhe volta para ele. Ver src/lib/ultimaListaDaTela.js.
 */

/** Invisivel, na lista: guarda o endereco atual a cada mudanca. */
export function LembrarLista({ caminho }) {
  const consulta = useSearchParams().toString();
  useEffect(() => {
    guardarListaDaTela(caminho, consulta);
  }, [caminho, consulta]);
  return null;
}

// O sessionStorage nao avisa mudanca: o endereco e lido ao desenhar, e o servidor desenha a lista limpa.
const naoAvisa = () => () => {};

/** A seta do cabecalho do detalhe, no desenho do PageHeader, que volta para a lista como ela estava. */
export function SetaParaLista({ caminho, rotulo = "Voltar" }) {
  const endereco = useSyncExternalStore(naoAvisa, () => lerListaDaTela(caminho), () => caminho);
  return (
    <Link
      href={endereco}
      // Quem recarregou o detalhe e volta pela seta continua no mesmo trabalho: o 100 nao volta a 25.
      onClick={marcarTelaIniciada}
      aria-label={rotulo}
      title={rotulo}
      className="-ml-1 rounded p-1 text-suave hover:bg-fundo hover:text-texto"
    >
      <ArrowLeft size={22} />
    </Link>
  );
}
