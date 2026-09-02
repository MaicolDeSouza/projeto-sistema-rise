"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

/**
 * Botao flutuante que devolve o operador ao topo da pagina.
 *
 * Irmao do que existe dentro do pop-up de produto (TabelaMercados), com uma
 * diferenca que importa: la o que rola e uma <div> com ref proprio; aqui e a
 * JANELA — o <main> do layout nao tem overflow, entao o scroll e do documento.
 * Usar ref de elemento aqui nao moveria nada.
 *
 * SO APARECE DEPOIS DE ROLAR. Botao fixo na tela desde o primeiro instante
 * cobre conteudo para resolver um problema que ainda nao existe.
 */
const ALTURA_PARA_APARECER = 400;

export default function VoltarAoTopo() {
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    function aoRolar() {
      setVisivel(window.scrollY > ALTURA_PARA_APARECER);
    }

    // Confere ja na montagem: quem chega por link com ancora, ou volta pelo
    // botao do navegador, pode cair no meio da pagina sem rolar nada.
    aoRolar();

    // `passive` porque o ouvinte nao cancela o gesto — sem isso o navegador
    // espera a funcao terminar antes de desenhar a rolagem.
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, []);

  /**
   * Sobe suave, e se o navegador ignorar, sobe de qualquer jeito.
   *
   * `behavior: "smooth"` NAO FALHA COM ERRO quando nao e atendido — ele nao faz
   * nada. Medido no navegador embutido do ambiente de desenvolvimento: a pagina
   * ficava exatamente onde estava, sem excecao no console, enquanto
   * `scrollTo(0, 0)` funcionava na mesma hora. Um botao que as vezes nao faz
   * nada e pior que um botao sem animacao.
   *
   * Se em 300ms a pagina nao saiu do lugar, o suave nao foi atendido e o salto
   * seco resolve. Se a animacao estiver correndo, `scrollY` ja mudou e nada
   * acontece aqui — a checagem nao atropela o caso bom.
   */
  function subir() {
    const antes = window.scrollY;
    window.scrollTo({ top: 0, behavior: "smooth" });

    /*
      Esconde por conta propria, sem esperar o evento de scroll.

      O destino e conhecido — o topo —, entao nao ha por que perguntar ao
      navegador onde paramos. E ha navegador que nao responde: no embutido deste
      ambiente, `scrollTo` NAO dispara evento de scroll (medido: evento
      despachado a mao atualiza o estado, rolagem programatica nao), e o botao
      ficava boiando no topo da pagina, oferecendo levar para onde ja se estava.
    */
    setVisivel(false);

    setTimeout(() => {
      if (window.scrollY === antes && antes > 0) window.scrollTo(0, 0);
    }, 300);
  }

  if (!visivel) return null;

  return (
    <button
      type="button"
      onClick={subir}
      title="Voltar ao topo"
      aria-label="Voltar ao topo"
      className="fixed right-5 bottom-5 z-40 rounded-full border border-borda bg-superficie p-2.5 text-suave shadow-lg transition hover:text-texto"
    >
      <ArrowUp size={16} />
    </button>
  );
}
