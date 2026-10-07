"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import EditorAnuncioLI from "./EditorAnuncioLI";

/**
 * O editor da Loja Integrada montado numa pagina. No primeiro Salvar de um anuncio novo a URL passa
 * a ser a do anuncio salvo (`replace`, para o Voltar do navegador nao cair no "novo"); enquanto a
 * navegacao nao termina o editor fica `inert` (a remontagem perderia o que fosse digitado). Mesmo
 * desenho do `EditorNaPagina` do Mercado Livre.
 */
export default function EditorNaPagina({ anuncioId, rascunhoInicial, contextoInicial, status, vinculo }) {
  const router = useRouter();
  const [abrindo, iniciarNavegacao] = useTransition();

  return (
    <div inert={abrindo} aria-busy={abrindo} className={abrindo ? "cursor-wait opacity-70" : undefined}>
      <EditorAnuncioLI
        anuncioId={anuncioId}
        rascunhoInicial={rascunhoInicial}
        contextoInicial={contextoInicial}
        status={status}
        vinculo={vinculo}
        modo="pagina"
        aoSalvar={(id) => {
          if (!anuncioId) iniciarNavegacao(() => router.replace(`/canais-de-venda/loja-integrada/${id}`));
        }}
      />
    </div>
  );
}
