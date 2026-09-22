import ImagemParaSvg from "@/components/ferramentas/ImagemParaSvg";
import LinkDeVolta from "@/components/ui/LinkDeVolta";
import PageHeader from "@/components/ui/PageHeader";

export const metadata = { title: "Imagem para SVG | Sistema Rise" };

export default function ImagemParaSvgPage() {
  return (
    <>
      {/* A barra lateral nao lista as ferramentas (so "Ferramentas"): o caminho de volta e este. */}
      <LinkDeVolta href="/ferramentas" rotulo="Ferramentas" />

      <PageHeader
        titulo="Imagem para SVG"
        descricao="Converte o logo em SVG, com fundo transparente e as cores exatas. Nada e gravado: o arquivo fica so nesta tela."
      />
      <ImagemParaSvg />
    </>
  );
}
