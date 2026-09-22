import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * "← Nome do bloco": o caminho de volta das telas de um bloco que mostra as suas
 * telas como cartoes (Ferramentas, Cadastros). A barra lateral so tem o bloco,
 * sem submenu, entao e este link que leva de volta a lista de cartoes.
 */
export default function LinkDeVolta({ href, rotulo }) {
  return (
    <Link
      href={href}
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-suave hover:text-texto"
    >
      <ArrowLeft size={15} />
      {rotulo}
    </Link>
  );
}
