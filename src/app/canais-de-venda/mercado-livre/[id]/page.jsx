import { notFound } from "next/navigation";

import EditorNaPagina from "@/components/anuncios/ml/EditorNaPagina";
import AvisoBanco from "@/components/ui/AvisoBanco";
import LinkDeVolta from "@/components/ui/LinkDeVolta";
import PageHeader from "@/components/ui/PageHeader";
import { carregarAnuncioML } from "@/lib/canaisDeVenda/ml/banco";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anúncio | Mercado Livre | Sistema Rise" };

/** Um anuncio do Mercado Livre ja salvo, aberto no editor. Id que nao existe (ou de outro canal) e 404. */
export default async function AnuncioMLPage({ params }) {
  const { id } = await params;

  let carregado = null;
  let erro = null;
  try {
    carregado = await carregarAnuncioML(id);
  } catch (e) {
    erro = e;
  }
  if (!erro && !carregado.ok) notFound();

  return (
    <>
      <LinkDeVolta href="/canais-de-venda/mercado-livre" rotulo="Mercado Livre" />
      <PageHeader titulo="Anúncio do Mercado Livre" descricao={carregado?.rascunho.titulo || "Anúncio sem título"} />

      {erro && <AvisoBanco erro={erro} />}

      {carregado && (
        <EditorNaPagina
          // O estado do editor nasce das props: outro anuncio, ou o mesmo recarregado, monta um editor novo.
          key={carregado.anuncioId}
          anuncioId={carregado.anuncioId}
          rascunhoInicial={carregado.rascunho}
          contextoInicial={carregado.contexto}
          status={carregado.status}
        />
      )}
    </>
  );
}
