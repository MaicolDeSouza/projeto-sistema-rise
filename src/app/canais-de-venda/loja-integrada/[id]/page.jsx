import { notFound } from "next/navigation";

import EditorNaPagina from "@/components/anuncios/li/EditorNaPagina";
import AvisoBanco from "@/components/ui/AvisoBanco";
import LinkDeVolta from "@/components/ui/LinkDeVolta";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { acessosDoEditorLI } from "@/lib/acessos/projecoes";
import { carregarAnuncioLI } from "@/lib/canaisDeVenda/li/banco";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anúncio | Loja Integrada | Sistema Rise" };

/** Um anuncio da Loja Integrada ja salvo, aberto no editor. Id que nao existe (ou de outro canal) e 404. */
export default async function AnuncioLIPage({ params }) {
  const { id } = await params;
  // Acessos: abrir pede ver; sem editar o editor abre so para leitura.
  const { pode } = await exigirAcessoNaPagina("tela.canaisDeVenda.lojaIntegrada", "ver");
  const acessos = acessosDoEditorLI(pode);

  let carregado = null;
  let erro = null;
  try {
    carregado = await carregarAnuncioLI(id);
  } catch (e) {
    erro = e;
  }
  if (!erro && !carregado.ok) notFound();

  return (
    <>
      <LinkDeVolta href="/canais-de-venda/loja-integrada" rotulo="Loja Integrada" />
      <PageHeader
        titulo="Anúncio da Loja Integrada"
        descricao={carregado?.rascunho.titulo || "Anúncio sem título"}
        somenteLeitura={acessos.editar ? null : "Seu acesso à Loja Integrada é de leitura"}
      />

      {erro && <AvisoBanco erro={erro} />}

      {carregado && (
        <EditorNaPagina
          // O estado do editor nasce das props: outro anuncio, ou o mesmo recarregado, monta um editor novo.
          key={carregado.anuncioId}
          anuncioId={carregado.anuncioId}
          rascunhoInicial={carregado.rascunho}
          contextoInicial={carregado.contexto}
          status={carregado.status}
          vinculo={carregado.vinculo}
          acessos={acessos}
        />
      )}
    </>
  );
}
