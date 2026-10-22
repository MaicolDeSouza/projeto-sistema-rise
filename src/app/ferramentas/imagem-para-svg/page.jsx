import ImagemParaSvg from "@/components/ferramentas/ImagemParaSvg";
import LinkDeVolta from "@/components/ui/LinkDeVolta";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";

export const metadata = { title: "Imagem para SVG | Sistema Rise" };

export default async function ImagemParaSvgPage() {
  await exigirAcessoNaPagina("tela.ferramentas.imagemParaSvg", "ver");

  return (
    <>
      {/* A barra lateral nao lista as ferramentas (so "Ferramentas"): o caminho de volta e este. */}
      <LinkDeVolta href="/ferramentas" rotulo="Ferramentas" />

      <PageHeader
        titulo="Imagem para SVG"
        descricao="Converte o logo em SVG, com fundo transparente e as cores exatas. Nada é gravado: o arquivo fica só nesta tela."
      />
      <ImagemParaSvg />
    </>
  );
}
