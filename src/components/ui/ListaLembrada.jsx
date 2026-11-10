"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { marcarTelaIniciada } from "@/components/mercados/NavegacaoDoTopo";
import {
  consumirVoltaNaRolagem,
  enderecoDaTela,
  esquecerRolagemDaLista,
  guardarListaDaTela,
  guardarRolagemDaLista,
  lerListaDaTela,
  lerRolagemDaLista,
  pedirVoltaNaRolagem,
} from "@/lib/ultimaListaDaTela";

/**
 * A lista de uma tela lembrada nesta aba (pedido do dono em 09/11/2026): a lista guarda o proprio endereco (100 por
 * pagina, filtros, pagina, ordem) e a seta do detalhe volta para ele. Ver src/lib/ultimaListaDaTela.js.
 */

/** Invisivel, na lista: guarda o endereco atual a cada mudanca, e a altura da rolagem (10/11/2026). */
export function LembrarLista({ caminho }) {
  const consulta = useSearchParams().toString();
  useEffect(() => {
    guardarListaDaTela(caminho, consulta);
  }, [caminho, consulta]);

  // A rolagem: quem volta do detalhe retoma a altura em que a lista estava; quem entra pelo menu comeca no topo.
  // useLayoutEffect, e nao useEffect: a altura volta antes de a tela ser pintada (sem o salto do topo para o meio), e o
  // ouvinte sai na mesma hora em que a lista sai, antes de o Next rolar a tela seguinte para o topo.
  const veioDoDetalhe = useRef(null);
  useLayoutEffect(() => {
    const endereco = () => enderecoDaTela(caminho, window.location.search);
    // Decidido uma vez por montagem: em desenvolvimento o React roda o efeito duas vezes, e a segunda (ja sem o pedido
    // de volta, que e consumido) apagaria a altura que a primeira acabou de retomar.
    if (veioDoDetalhe.current === null) veioDoDetalhe.current = consumirVoltaNaRolagem(caminho);
    if (veioDoDetalhe.current) window.scrollTo(0, lerRolagemDaLista(caminho, endereco()) ?? 0);
    else esquecerRolagemDaLista(caminho);

    // A altura e anotada a cada rolagem e gravada no maximo a cada 150 ms (setTimeout, e nao requestAnimationFrame,
    // que para em aba de fundo). Ao abrir um detalhe o endereco ja mudou quando a tela rola para o topo: essa rolagem
    // nao e da lista e nao e anotada.
    let ultima = null;
    let relogio = 0;
    const gravar = () => {
      relogio = 0;
      if (ultima) guardarRolagemDaLista(caminho, ultima.endereco, ultima.altura);
      ultima = null;
    };
    const aoRolar = () => {
      if (window.location.pathname !== caminho) return;
      ultima = { endereco: endereco(), altura: window.scrollY };
      if (!relogio) relogio = setTimeout(gravar, 150);
    };
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => {
      window.removeEventListener("scroll", aoRolar);
      // Saiu da lista com uma rolagem ainda nao gravada: grava agora, senao a volta perderia o ultimo movimento.
      if (relogio) {
        clearTimeout(relogio);
        gravar();
      }
    };
  }, [caminho]);

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
      // A lista retoma a altura em que estava (LembrarLista); sem isto o Next a rolaria para o topo antes.
      scroll={false}
      // Quem recarregou o detalhe e volta pela seta continua no mesmo trabalho: o 100 nao volta a 25.
      onClick={() => {
        marcarTelaIniciada();
        pedirVoltaNaRolagem(caminho);
      }}
      aria-label={rotulo}
      title={rotulo}
      className="-ml-1 rounded p-1 text-suave hover:bg-fundo hover:text-texto"
    >
      <ArrowLeft size={22} />
    </Link>
  );
}
