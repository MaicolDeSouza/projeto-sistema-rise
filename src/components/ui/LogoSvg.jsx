/**
 * Logo em SVG com duas aparencias: as CORES ORIGINAIS e a FOSCA (cinza e meio
 * transparente). Pedido do dono em 20/09/2026, para mostrar, por exemplo, o
 * logo do Bling fosco quando o canal esta com falha e colorido quando esta tudo
 * certo. QUANDO usar cada uma ainda nao foi decidido: por isso o componente so
 * oferece o `estado`, e nenhuma tela existente o usa ainda.
 *
 * O fosco e um FILTRO CSS sobre o mesmo arquivo, nao um segundo SVG: nao ha
 * versao para gerar, guardar nem manter em dia, e serve a qualquer logo (o
 * cinza vem de `grayscale`, a transparencia de `opacity`).
 *
 * Quem ja usa `next/image` ou `<img>` por conta propria (a coluna Canais, por
 * exemplo) nao precisa deste componente: basta somar `CLASSE_LOGO_FOSCO` ao
 * className.
 */
export const CLASSE_LOGO_FOSCO = "grayscale opacity-50";

export default function LogoSvg({ src, alt, largura, altura, estado = "original", className = "" }) {
  return (
    // <img> simples: SVG nao passa pelo otimizador do next/image, e o endereco
    // pode ser um blob: da propria tela.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={largura}
      height={altura}
      className={`transition ${estado === "fosco" ? CLASSE_LOGO_FOSCO : ""} ${className}`}
    />
  );
}
