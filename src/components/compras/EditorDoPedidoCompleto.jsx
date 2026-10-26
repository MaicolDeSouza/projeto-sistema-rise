"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { desfazerLancamentoAcao, mudarStatusAcao, reenviarAoBlingAcao } from "@/app/compras/acoes";
import ConclusaoDoEnvio from "@/components/ui/ConclusaoDoEnvio";
import { todosLancados } from "@/lib/compras/regras";
import CelulaDeLancamento from "./CelulaDeLancamento";
import EditorPedido from "./EditorPedido";
import Pergunta from "./Pergunta";
import PopupLancarEstoque from "./PopupLancarEstoque";

/**
 * O editor com as pecas das tarefas seguintes ligadas: a coluna "Chegada" (lancar estoque e desfazer), o arquivo da
 * proposta e o PDF. Fica separado para o EditorPedido nao conhecer cada uma delas.
 */
export default function EditorDoPedidoCompleto({ pedidoInicial, transportadoras, podeEditar, podeLancar }) {
  const router = useRouter();
  const [lancando, setLancando] = useState(null);
  const [desfazendo, setDesfazendo] = useState(null);
  const [conclusao, setConclusao] = useState(null);
  const [avisos, setAvisos] = useState({});
  const [perguntarFinalizar, setPerguntarFinalizar] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const lancavel = podeEditar && podeLancar;

  function depoisDoBling(item, resposta, texto, aplicar) {
    if (resposta.pedido) aplicar(resposta.pedido);
    setAvisos((antes) => ({ ...antes, [item.id]: resposta.bling?.ok ? null : resposta.bling?.erro ?? "erro desconhecido" }));
    router.refresh();
    if (resposta.bling?.ok) {
      setConclusao({ titulo: texto, mensagem: `${item.sku} · ${item.nome}` });
      if (resposta.pedido && resposta.pedido.status === "PARCIAL" && todosLancados(resposta.pedido.itens)) setPerguntarFinalizar(true);
    }
  }

  const extras = {
    colunaDeChegada: (item, { pedido, aplicar, alterado }) => (
      <CelulaDeLancamento
        item={item}
        status={pedido.status}
        podeLancar={lancavel}
        alterado={alterado}
        aviso={avisos[item.id]}
        aoLancar={(escolhido) => setLancando({ item: pedido.itens.find((original) => original.id === escolhido.id) ?? escolhido, aplicar })}
        aoDesfazer={(escolhido) => setDesfazendo({ item: pedido.itens.find((original) => original.id === escolhido.id) ?? escolhido, aplicar })}
        aoReenviar={(escolhido) =>
          iniciar(async () => {
            const bling = await reenviarAoBlingAcao(escolhido.produtoId);
            setAvisos((antes) => ({ ...antes, [escolhido.id]: bling?.ok ? null : bling?.erro ?? "erro desconhecido" }));
            if (bling?.ok) setConclusao({ titulo: "Enviado ao Bling", mensagem: `${escolhido.sku} · ${escolhido.nome}` });
          })
        }
      />
    ),
    janelas: ({ pedido, aplicar }) => (
      <>
        {lancando && (
          <PopupLancarEstoque
            item={lancando.item}
            aoFechar={() => setLancando(null)}
            aoConcluir={(resposta, quantidade) => {
              const { item, aplicar } = lancando;
              setLancando(null);
              depoisDoBling(item, resposta, `Entrada de ${quantidade} un. lançada no Bling`, aplicar);
            }}
          />
        )}
        {desfazendo && (
          <Pergunta
            titulo="Desfazer o último lançamento?"
            confirmar="Desfazer"
            destrutiva
            ocupado={ocupado}
            aoRecuar={() => setDesfazendo(null)}
            aoConfirmar={() =>
              iniciar(async () => {
                const { item, aplicar } = desfazendo;
                const resposta = await desfazerLancamentoAcao(item.id);
                setDesfazendo(null);
                if (!resposta?.ok) {
                  setAvisos((antes) => ({ ...antes, [item.id]: null }));
                  setConclusao({ titulo: "Não foi possível desfazer", mensagem: resposta?.erro, tipo: "erro" });
                  return;
                }
                depoisDoBling(item, resposta, "Lançamento desfeito no Bling", aplicar);
              })
            }
          >
            Sai do estoque de {desfazendo.item.sku} a quantidade do último lançamento ({desfazendo.item.lancamentos?.at(-1)?.quantidade} un.), no Rise e no
            Bling.
          </Pergunta>
        )}
        {perguntarFinalizar && !conclusao && (
          <FinalizarAgora pedido={pedido} aplicar={aplicar} aoFechar={() => setPerguntarFinalizar(false)} />
        )}
        {conclusao && (
          <ConclusaoDoEnvio
            titulo={conclusao.titulo}
            mensagem={conclusao.mensagem}
            tipo={conclusao.tipo ?? "sucesso"}
            aoFechar={() => setConclusao(null)}
          />
        )}
      </>
    ),
  };

  return <EditorPedido pedidoInicial={pedidoInicial} transportadoras={transportadoras} podeEditar={podeEditar} extras={extras} />;
}

/** Todos os itens chegaram: pergunta se finaliza (nunca finaliza sozinho: pode haver segunda remessa). */
function FinalizarAgora({ pedido, aplicar, aoFechar }) {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  return (
    <Pergunta
      titulo="Todos os itens chegaram. Finalizar o pedido?"
      confirmar="Finalizar"
      recuar="Agora não"
      ocupado={ocupado}
      aoRecuar={aoFechar}
      aoConfirmar={() =>
        iniciar(async () => {
          const resposta = await mudarStatusAcao(pedido.id, "FINALIZADO");
          if (resposta?.ok && resposta.pedido) aplicar(resposta.pedido);
          aoFechar();
          router.refresh();
        })
      }
    >
      {pedido.codigo} passa a Finalizado. Se ainda vier outra remessa, deixe para depois.
    </Pergunta>
  );
}
