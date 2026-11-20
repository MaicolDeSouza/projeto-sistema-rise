"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { pacoteSugeridoAcao } from "@/app/frete/acoes";
import { salvarRascunhoDoEnvioAcao } from "@/app/pedidos/acoes";
import { Secao } from "@/components/pedidos/AbaGeral";

import JanelaDeCotacao from "./JanelaDeCotacao";
import PainelDoEnvio from "./PainelDoEnvio";

/**
 * "Envio pelo Rise" na aba Envio do pedido do Bling (modulo de frete). Aqui fica o cotar (com a caixa da proposta de
 * origem ou a sugerida pelos itens); o resto do caminho (comprar, imprimir, acompanhar, avisar) e o `PainelDoEnvio`.
 */
export default function EnvioDoPedido({ pedido, envio, caixas, cotacaoDaProposta, podeCotar, podeComprar = false, podeAvisar = false, travaLiberada = false, whatsapp = null, temEmail = false }) {
  const router = useRouter();
  const [inicial, setInicial] = useState(null);
  const [erro, setErro] = useState(null);
  const [abrindo, iniciarAbertura] = useTransition();
  const [salvando, iniciarSalvar] = useTransition();
  const entrega = pedido.enderecoDeEntrega ?? {};

  function abrir() {
    setErro(null);
    iniciarAbertura(async () => {
      const base = {
        cepDestino: entrega.cep ?? "",
        cidadeDestino: entrega.cidade ? `${entrega.cidade}${entrega.uf ? ` (${entrega.uf})` : ""}` : null,
        valorDeclarado: pedido.totalProdutos,
      };
      // Recotar parte do rascunho; o primeiro cotar, da cotacao da proposta de origem; sem nenhum, da sugestao pelos itens.
      if (envio) return setInicial({ ...base, caixaId: envio.caixaDeEnvioId ?? undefined, pesoKg: envio.pesoKg, valorDeclarado: envio.valorDeclarado });
      if (cotacaoDaProposta) return setInicial({ ...base, caixaId: cotacaoDaProposta.caixaId ?? undefined, pesoKg: cotacaoDaProposta.pesoKg });
      const itens = (pedido.itens ?? []).filter((item) => item.produtoId).map((item) => ({ produtoId: item.produtoId, quantidade: item.quantidade, valorUnitario: item.precoUnitario }));
      const sugerido = itens.length ? await pacoteSugeridoAcao(itens) : null;
      setInicial({
        ...base,
        caixaId: sugerido?.ok ? (sugerido.caixaId ?? undefined) : undefined,
        pesoKg: sugerido?.ok ? sugerido.pesoKg : null,
        incompletos: sugerido?.ok ? sugerido.incompletos + (pedido.itens ?? []).filter((item) => !item.produtoId).length : (pedido.itens ?? []).length,
        motivo: sugerido?.ok ? sugerido.motivo : null,
      });
    });
  }

  function escolher(servico, pacote, cotadoEm) {
    iniciarSalvar(async () => {
      const resposta = await salvarRascunhoDoEnvioAcao(pedido.id, { pacote, servico, cotadoEm });
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível guardar o serviço.");
      setInicial(null);
      router.refresh();
    });
  }

  return (
    <Secao titulo="Envio pelo Rise">
      <PainelDoEnvio
        envio={envio}
        caixas={caixas}
        travaLiberada={travaLiberada}
        pode={{ cotar: podeCotar, comprar: podeComprar, avisar: podeAvisar }}
        aoCotar={abrir}
        cotando={abrindo}
        whatsapp={whatsapp}
        temEmail={temEmail}
        chaveDaNota={pedido.nf?.chave ?? null}
      />
      {erro && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {erro}
        </p>
      )}
      {salvando && <p className="mt-2 text-sm text-suave">Guardando o serviço…</p>}

      <JanelaDeCotacao
        aberta={Boolean(inicial)}
        aoFechar={() => setInicial(null)}
        titulo={`Cotar frete · Pedido ${pedido.numero}`}
        caixas={caixas}
        inicial={inicial ?? {}}
        aoEscolher={escolher}
        rotuloDaEscolha="Escolher"
      />
    </Secao>
  );
}
