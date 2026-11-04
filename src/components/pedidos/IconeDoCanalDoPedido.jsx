import Image from "next/image";

import { CANAIS } from "@/lib/canais";

import { AVISOS_GRAVES, textoDosAvisos } from "./textos";

const LOGO = Object.fromEntries(CANAIS.map((canal) => [canal.id, canal]));

/**
 * O canal do pedido na lista: o logotipo (22 px) e o "!" no canto quando ha aviso, no desenho da coluna Canais de
 * Produtos. O `title` lista os motivos, um por linha; o "!" fica vermelho para fraude e NF a cancelar. `doRise`: a venda
 * veio de um anuncio criado pelo Rise, e o "R" verde fica no canto superior esquerdo (pedido do dono em 04/11/2026).
 */
export default function IconeDoCanalDoPedido({ canal, avisos = [], doRise = false }) {
  const dados = LOGO[canal];
  const motivos = textoDosAvisos(avisos);
  const grave = avisos.some((aviso) => AVISOS_GRAVES.has(aviso));
  const nome = dados?.nome ?? canal;
  const titulo = [doRise ? `${nome}: venda de anúncio do Rise` : nome, motivos].filter(Boolean).join("\n");
  return (
    <span className="relative inline-flex h-[22px] w-[22px] shrink-0" title={titulo} aria-label={titulo.replace(/\n/g, ". ")}>
      {dados?.logo ? <Image src={dados.logo} alt="" width={22} height={22} className="rounded" /> : <span className="h-[22px] w-[22px] rounded bg-fundo" />}
      {doRise && (
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -left-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-600 text-[9px] leading-none font-bold text-white ring-2 ring-superficie"
        >
          R
        </span>
      )}
      {avisos.length > 0 && (
        <span
          aria-hidden="true"
          className={`absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] leading-none font-bold ring-2 ring-superficie ${
            grave ? "bg-red-600 text-white" : "bg-amber-400 text-amber-950"
          }`}
        >
          !
        </span>
      )}
    </span>
  );
}
