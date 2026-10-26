import Link from "next/link";
import { ShoppingCart } from "lucide-react";

/**
 * O carrinho do produto que ja esta num pedido de compra (decisao do dono em 26/10/2026): azul = so em rascunho,
 * verde = pedido enviado. Leva ao pedido. Sem pedido aberto, nada (regra 4 do padrao visual: so o que tem dado).
 *
 * @param {{ estado: null | { cor: "azul"|"verde", texto: string, pedidos: { pedidoId: string }[] } }} props
 */
export default function IconeCarrinho({ estado }) {
  if (!estado) return null;
  const cor = estado.cor === "verde" ? "text-emerald-600 hover:bg-emerald-50" : "text-sky-600 hover:bg-sky-50";
  const destino = estado.pedidos?.[0]?.pedidoId;
  const icone = <ShoppingCart size={16} strokeWidth={2.25} aria-hidden="true" />;
  if (!destino) {
    return (
      <span className={`inline-flex ${cor}`} title={estado.texto} aria-label={estado.texto}>
        {icone}
      </span>
    );
  }
  return (
    <Link
      href={`/compras/pedidos/${destino}`}
      title={estado.texto}
      aria-label={estado.texto}
      className={`inline-flex rounded-md p-2 transition-colors ${cor}`}
    >
      {icone}
    </Link>
  );
}
