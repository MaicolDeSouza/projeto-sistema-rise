"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";

import Campo, { CLASSE_CAMPO, bordaDoCampo } from "./Campo";

/**
 * O endereco digitado, se der para abrir; senao `null`. So http e https: o campo
 * vira link, e `javascript:` num `href` executaria codigo (o servidor recusa o mesmo
 * em `ehUrlSegura`, mas o link aparece antes de salvar).
 */
function enderecoParaAbrir(valor) {
  const texto = valor.trim();
  try {
    return ["http:", "https:"].includes(new URL(texto).protocol) ? texto : null;
  } catch {
    return null;
  }
}

/**
 * Site do cadastro, com o botao "Abrir site" ao lado (pedido do dono em 04/10/2026:
 * o campo tem que levar ao site do fornecedor).
 *
 * O proprio campo continua sendo de digitar: clicar dentro dele para corrigir o
 * endereco nao pode sair da tela. Por isso o link e um botao ao lado, que le o que
 * esta escrito AGORA (nao o salvo) e abre em outra aba, sem perder o formulario.
 * Sem endereco valido o botao fica apagado.
 */
export default function CampoSite({ erro, siteInicial = "", ajuda }) {
  const [site, setSite] = useState(siteInicial);
  const destino = enderecoParaAbrir(site);

  return (
    <Campo nome="site" rotulo="Site" erro={erro} ajuda={ajuda}>
      <div className="flex gap-2">
        <input
          id="site"
          name="site"
          value={site}
          onChange={(evento) => setSite(evento.target.value)}
          placeholder="https://"
          className={`${CLASSE_CAMPO} ${bordaDoCampo(erro)} min-w-0 flex-1`}
        />
        {destino ? (
          <a
            href={destino}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex shrink-0 items-center gap-1.5 rounded border border-borda px-3 text-sm font-medium whitespace-nowrap text-acento hover:bg-fundo"
          >
            <ExternalLink size={15} />
            Abrir site
          </a>
        ) : (
          <span
            aria-disabled="true"
            title="Informe um endereço com http ou https para abrir o site."
            className="mt-1 inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded border border-borda px-3 text-sm font-medium whitespace-nowrap text-suave opacity-50"
          >
            <ExternalLink size={15} />
            Abrir site
          </span>
        )}
      </div>
    </Campo>
  );
}
