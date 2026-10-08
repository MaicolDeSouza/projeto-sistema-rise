"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import EditorAnuncioML from "./EditorAnuncioML";

/**
 * O editor do Mercado Livre montado numa pagina (`modo="pagina"`). O anuncio novo ainda nao
 * tem endereco: no primeiro Salvar a URL passa a ser a do anuncio salvo (`replace`, e nao `push`,
 * para o Voltar do navegador nao cair de novo no "novo" e criar um segundo anuncio). Nos Salvar
 * seguintes a pagina ja e a do anuncio e nada navega.
 *
 * `/novo` e `/[id]` sao rotas diferentes, entao a navegacao desmonta este editor e monta outro a
 * partir do banco (a aba volta para Geral). Tentou-se so trocar o endereco com
 * `history.replaceState` para manter o editor montado, e nao serve: o Next passa a tratar a pagina
 * como `[id]` e, no Salvar seguinte, a resposta da Server Action (que revalida a lista) troca a
 * arvore e remonta o editor no meio do trabalho. Por isso a remontagem acontece uma vez, aqui.
 *
 * Enquanto a navegacao nao termina (em `next dev` a primeira visita a `[id]` compila a rota, e
 * leva segundos) o editor fica `inert`: o que fosse digitado nesse intervalo se perderia na
 * remontagem, e o rodape diria "Tudo salvo" sem ser verdade.
 */
export default function EditorNaPagina({ anuncioId, rascunhoInicial, contextoInicial, status, publicacaoInicial = null }) {
  const router = useRouter();
  const [abrindo, iniciarNavegacao] = useTransition();

  return (
    <div inert={abrindo} aria-busy={abrindo} className={abrindo ? "cursor-wait opacity-70" : undefined}>
      <EditorAnuncioML
        anuncioId={anuncioId}
        rascunhoInicial={rascunhoInicial}
        contextoInicial={contextoInicial}
        status={status}
        publicacaoInicial={publicacaoInicial}
        modo="pagina"
        aoSalvar={(id) => {
          if (!anuncioId) iniciarNavegacao(() => router.replace(`/canais-de-venda/mercado-livre/${id}`));
        }}
      />
    </div>
  );
}
