"use client";

import { ExternalLink } from "lucide-react";

const BASE = "flex min-h-14 flex-col items-start justify-center rounded-md border px-4 py-2.5 text-left";

/** Um link que abre em outra aba: o titulo diz O QUE abre (com o icone de "sai daqui") e a linha pequena, PARA QUE serve. */
function BotaoDeLink({ href, titulo, subtitulo, dica, semEndereco }) {
  const conteudo = (
    <>
      <span className="inline-flex items-center gap-1.5 text-base font-medium">
        {titulo}
        <ExternalLink size={15} aria-hidden="true" />
      </span>
      <span className="text-xs text-suave">{href ? subtitulo : semEndereco}</span>
    </>
  );
  if (!href) {
    return (
      <span aria-disabled="true" title={semEndereco} className={`${BASE} cursor-not-allowed border-borda text-suave opacity-60`}>
        {conteudo}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={dica}
      className={`${BASE} border-borda text-acento transition-colors duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none`}
    >
      {conteudo}
    </a>
  );
}

/**
 * O fim de um Sincronizar ou Cadastrar que deu certo, no popup de andamento da Loja Integrada (pedido do dono em 26/10/2026):
 * tres botoes que nao se confundem. Dois abrem outra aba, contornados e com o icone de saida: o painel da loja (onde se ajustam
 * origem e tipo de producao, que a API nao grava) e o anuncio no site. O terceiro, azul e no pe, fecha este popup E a janela
 * do editor. O `data-fechar` e por onde o popup leva o foco ao que fecha, para o Enter fechar sem o mouse.
 */
// Os textos da Loja Integrada; o editor do Mercado Livre passa os dele em `textos` (26/10/2026).
const TEXTOS_DA_LI = {
  painel: { titulo: "Abrir painel da loja", subtitulo: "ajustar dados fiscais", dica: "Abre o produto no painel de controle da Loja Integrada, em outra aba" },
  site: { titulo: "Abrir anúncio na loja", subtitulo: "ver como o cliente vê", dica: "Abre a página do produto no site da loja, em outra aba (produto pausado ainda não aparece para o cliente)" },
};

export default function AcoesDoFimDoEnvio({ linkDoPainel, linkDoSite, aoFechar, textos = TEXTOS_DA_LI }) {
  return (
    <div className="w-full space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <BotaoDeLink href={linkDoPainel} {...textos.painel} semEndereco="painel indisponível" />
        <BotaoDeLink href={linkDoSite} {...textos.site} semEndereco="endereço ainda indisponível" />
      </div>
      <button
        data-fechar
        type="button"
        onClick={aoFechar}
        className="w-full rounded-md bg-acento px-5 py-2.5 text-base font-medium text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Fechar
      </button>
    </div>
  );
}
