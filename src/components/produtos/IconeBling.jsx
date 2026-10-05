"use client";

import Image from "next/image";

import { CANAIS } from "@/lib/canais";

/**
 * O icone do Bling na coluna Canais da lista de Produtos: a logo, que e COLORIDA quando o produto ja
 * foi sincronizado e em preto fosco quando nunca foi, e, a parte, um selo "?" no canto superior
 * direito quando o Rise e o Bling podem estar diferentes (campo alterado depois da ultima
 * sincronizacao ou ajuste de estoque ainda nao enviado). Cor e selo sao independentes: o selo
 * aparece sobre as duas.
 *
 * O estado vem pronto do servidor (`iconeBlingDoProduto`, so do banco; nada aqui fala com o Bling).
 * Este arquivo nao importa `lib/blingSync/estado.js`, que e so de servidor (usa `node:crypto`); o
 * texto do estado mora aqui.
 */

const CANAL_BLING = CANAIS.find((canal) => canal.id === "BLING");

/**
 * O estado em palavras. Cor e selo sozinhos nao dizem nada a quem nao os ve, entao o mesmo texto vai
 * no nome acessivel e na dica. Um produto nunca sincronizado pode ainda ter ajuste pendente: os dois
 * fatos aparecem, juntos.
 */
function rotuloDoIconeBling({ cor, motivos }) {
  const partes = [];
  if (cor === "cinza") partes.push("nunca sincronizado");
  if (motivos.includes("campos")) partes.push("divergencia em campos");
  if (motivos.includes("estoque")) partes.push("ajuste de estoque pendente");
  if (partes.length === 0) partes.push("em dia");
  return `Bling: ${partes.join(" e ")}`;
}

/**
 * @param {object} props
 * @param {{cor: "cinza"|"verde", divergente: boolean, motivos: string[]}} props.iconeBling
 * @param {() => void} props.aoClicar abre a janela do Bling deste produto.
 */
export default function IconeBling({ iconeBling, aoClicar }) {
  const rotulo = rotuloDoIconeBling(iconeBling);

  return (
    <button
      type="button"
      onClick={aoClicar}
      title={rotulo}
      aria-label={rotulo}
      className="relative shrink-0 rounded hover:ring-2 hover:ring-sky-200 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
    >
      {/* Colorido so depois de sincronizado; as mesmas classes do fosco dos outros canais. */}
      <Image
        src={CANAL_BLING.logo}
        alt=""
        width={22}
        height={22}
        className={`rounded ${iconeBling.cor === "verde" ? "" : "opacity-70 brightness-50 grayscale"}`}
      />
      {iconeBling.divergente && (
        // O texto do estado ja esta no botao: o selo e so desenho, e o leitor de tela nao o le.
        <span
          aria-hidden="true"
          className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[10px] leading-none font-bold text-amber-950 ring-2 ring-superficie"
        >
          ?
        </span>
      )}
    </button>
  );
}
