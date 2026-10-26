import { notFound } from "next/navigation";

import EditorNaPagina from "@/components/anuncios/ml/EditorNaPagina";
import AvisoBanco from "@/components/ui/AvisoBanco";
import LinkDeVolta from "@/components/ui/LinkDeVolta";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { acessosDoEditorML, projetarContextoML } from "@/lib/acessos/projecoes";
import { carregarAnuncioML } from "@/lib/canaisDeVenda/ml/banco";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anúncio | Mercado Livre | Sistema Rise" };

/** Um anuncio do Mercado Livre ja salvo, aberto no editor. Id que nao existe (ou de outro canal) e 404. */
export default async function AnuncioMLPage({ params }) {
  const { id } = await params;
  // Acessos: abrir pede ver; sem editar o editor abre so para leitura. O custo dos produtos sai do contexto sem o dado.
  const { pode } = await exigirAcessoNaPagina("tela.canaisDeVenda.mercadoLivre", "ver");
  const acessos = acessosDoEditorML(pode);

  let carregado = null;
  let erro = null;
  try {
    carregado = await carregarAnuncioML(id);
  } catch (e) {
    erro = e;
  }
  if (!erro && !carregado.ok) notFound();
  // O produto base no subtitulo (pedido do dono em 26/10/2026): o quadro "Produto principal" saiu da aba Caracteristicas.
  const base = carregado?.contexto?.produtos?.[carregado.rascunho.produtoId];

  return (
    <>
      <LinkDeVolta href="/canais-de-venda/mercado-livre" rotulo="Mercado Livre" />
      <PageHeader
        titulo="Anúncio do Mercado Livre"
        descricao={base ? `${base.sku} · ${base.tituloBase} (Produto base)` : carregado?.rascunho.titulo || "Anúncio sem título"}
        somenteLeitura={acessos.editar ? null : "Seu acesso ao Mercado Livre é de leitura"}
      />

      {erro && <AvisoBanco erro={erro} />}

      {carregado && (
        <EditorNaPagina
          // O estado do editor nasce das props: outro anuncio, ou o mesmo recarregado, monta um editor novo.
          key={carregado.anuncioId}
          anuncioId={carregado.anuncioId}
          rascunhoInicial={carregado.rascunho}
          contextoInicial={projetarContextoML(carregado.contexto, pode)}
          acessos={acessos}
          status={carregado.status}
          publicacaoInicial={{ publicacao: carregado.publicacao, idExterno: carregado.idExterno, urlExterna: carregado.urlExterna, mudancas: carregado.mudancas }}
        />
      )}
    </>
  );
}
