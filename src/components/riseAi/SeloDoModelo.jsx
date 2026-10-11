import { ehLocal, rotuloDoProvedor } from "./formatos";

/**
 * Qual modelo respondeu (pedido do dono em 11/10/2026: cada mensagem diz isso, para comparar a qualidade e o custo).
 * Verde: modelo LOCAL, no PC do dono (custa zero). Azul: modelo de API (tem custo).
 */
export default function SeloDoModelo({ provedor, modelo, reserva = false }) {
  const cor = ehLocal(provedor) ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800";
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-xs font-medium ${cor}`}
      title={reserva ? "Respondeu o modelo de reserva" : "Respondeu o modelo padrão"}
    >
      <span className="truncate">
        {modelo} · {rotuloDoProvedor(provedor)}
        {reserva ? " (reserva)" : ""}
      </span>
    </span>
  );
}
