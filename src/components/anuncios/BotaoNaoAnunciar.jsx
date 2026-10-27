"use client";

import { useState, useTransition } from "react";
import { Ban, Loader, RotateCcw } from "lucide-react";

import { marcarNaoAnunciar } from "@/app/produtos/acoes-nao-anunciar";
import { rotuloDoBotao } from "@/lib/canaisDeVenda/naoAnunciar";

/**
 * O botao "Não anunciar no ML / na LI / na Shopee" do rodape do popup do canal (pedido do dono em 27/10/2026: "ao abrir o
 * pop mostra esse botão no rodapé junto com os outros botões e o ícone fica com um X em vermelho"). Grava na hora
 * (`marcarNaoAnunciar`), e a lista de Produtos atras se redesenha com o X. Marcado, vira "Voltar a anunciar".
 * Mesmo desenho dos outros botoes do rodape (contornado, sem competir com a acao principal azul).
 */
// `aoMudar` avisa quem abriu o popup (a janela guarda a marca: o rodape troca de lugar entre a lista e o editor).
export default function BotaoNaoAnunciar({ produtoId, canal, marcado, aoMudar }) {
  const [agora, setAgora] = useState(Boolean(marcado));
  const [erro, setErro] = useState(null);
  const [gravando, iniciar] = useTransition();

  function alternar() {
    setErro(null);
    iniciar(async () => {
      let resultado;
      try {
        resultado = await marcarNaoAnunciar(produtoId, canal, !agora);
      } catch {
        resultado = { ok: false, erro: "Não foi possível falar com o servidor. Tente de novo." };
      }
      if (resultado.ok) {
        const marcadoAgora = resultado.naoAnunciarEm.includes(canal);
        setAgora(marcadoAgora);
        aoMudar?.(marcadoAgora);
      }
      else setErro(resultado.erro);
    });
  }

  const Icone = gravando ? Loader : agora ? RotateCcw : Ban;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={alternar}
        disabled={gravando}
        title={agora ? "Tira o X do ícone: o produto volta a poder ser anunciado neste canal" : "Põe um X vermelho no ícone deste canal na lista de Produtos"}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3.5 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
          agora ? "border-borda text-acento hover:bg-fundo" : "border-red-200 text-red-700 hover:bg-red-50"
        }`}
      >
        <Icone size={14} className={gravando ? "animate-spin" : ""} />
        {rotuloDoBotao(canal, agora)}
      </button>
      {erro && (
        <span role="alert" className="text-xs text-red-700">
          {erro}
        </span>
      )}
    </span>
  );
}
