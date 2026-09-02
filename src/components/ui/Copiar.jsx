"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Botao de copiar que confirma na propria interface, sem alert.
 *
 * Nasceu na linha de Produtos e subiu para ca quando o detalhe de Mercados
 * precisou do mesmo comportamento — duas copias ja nascem podendo divergir no
 * tempo do visto ou no que fazem quando a area de transferencia e negada.
 *
 * APARECE NA PASSAGEM DO MOUSE, pelo `group` do elemento que o contem: um
 * icone por campo, sempre visivel, encheria a tela de ruido. O foco pelo
 * teclado tambem o revela, senao ele seria inalcancavel sem mouse.
 */
export default function Copiar({ texto, rotulo }) {
  const [copiado, setCopiado] = useState(false);

  /**
   * O clique NAO sobe para quem contem o botao.
   *
   * Na lista de Mercados a linha inteira abre o detalhe: sem isto, copiar o
   * codigo abria a janela junto, e quem so queria o numero levava um pop-up na
   * cara. Copiar nunca deve disparar a acao de quem esta em volta.
   */
  async function copiar(evento) {
    evento.stopPropagation();

    try {
      await navigator.clipboard.writeText(String(texto));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sem permissao de area de transferencia: nao ha o que fazer alem de
      // nao quebrar a tela.
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      title={`Copiar ${rotulo}`}
      aria-label={`Copiar ${rotulo}`}
      className="shrink-0 rounded p-1 text-suave opacity-0 transition group-hover:opacity-100 hover:bg-fundo hover:text-texto focus-visible:opacity-100"
    >
      {copiado ? (
        <Check size={13} className="text-emerald-600" />
      ) : (
        <Copy size={13} />
      )}
    </button>
  );
}
