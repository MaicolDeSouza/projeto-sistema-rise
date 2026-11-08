"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus } from "lucide-react";

import { desfazerLancamentoAcao, mudarStatusAcao, reenviarAoBlingAcao } from "@/app/compras/acoes";
import ConclusaoDoEnvio from "@/components/ui/ConclusaoDoEnvio";
import { faltaLancar, todosLancados } from "@/lib/compras/regras";
import ArquivoDaProposta from "./ArquivoDaProposta";
import CelulaDeLancamento from "./CelulaDeLancamento";
import LinkDoPdf from "./LinkDoPdf";
import LinkPublico from "./LinkPublico";
import EditorPedido from "./EditorPedido";
import Pergunta from "./Pergunta";
import PopupLancarEstoque from "./PopupLancarEstoque";
import PopupLancarTodos from "./PopupLancarTodos";

/**
 * O editor com as pecas das tarefas seguintes ligadas: a coluna "Chegada" (lancar estoque e desfazer), o arquivo da
 * proposta e o PDF. Fica separado para o EditorPedido nao conhecer cada uma delas.
 */
export default function EditorDoPedidoCompleto({ pedidoInicial, transportadoras, podeEditar, podeLancar, podeCasar = false }) {
  const router = useRouter();
  const [lancando, setLancando] = useState(null);
  const [lancandoTodos, setLancandoTodos] = useState(null);
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
    arquivoDaProposta: (props) => <ArquivoDaProposta {...props} />,
    // "Link público" ao lado do Baixar PDF (pedido do dono em 07/11/2026, o lugar marcado no print).
    linkDoPdf: (props) => (
      <span className="inline-flex items-center gap-4">
        <LinkDoPdf {...props} />
        <LinkPublico pedido={props.pedido} alterado={props.alterado} />
      </span>
    ),
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
    // "Lançar estoque" de todos os itens de uma vez (pedido do dono em 07/11/2026), em cima da coluna Chegada. Some quando
    // nada falta lancar ou o pedido nao esta a caminho (regra 4: botao sem acao nao aparece).
    chegadaDeTodos: ({ pedido, aplicar, alterado }) => {
      const comFalta = pedido.itens.filter((item) => faltaLancar(item) > 0).length;
      if (!lancavel || !["ENVIADO", "PARCIAL"].includes(pedido.status) || comFalta === 0) return null;
      return (
        <button
          type="button"
          onClick={() => setLancandoTodos({ itens: pedido.itens, aplicar })}
          disabled={alterado}
          title={alterado ? "Salve as alterações antes de lançar" : `Lançar o que falta dos ${comFalta} itens de uma vez`}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-acento px-2 py-1.5 text-xs font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-acento/90 active:scale-[0.97] disabled:opacity-50"
        >
          <PackagePlus size={13} /> Lançar todos ({comFalta})
        </button>
      );
    },
    janelas: ({ pedido, aplicar }) => (
      <>
        {lancandoTodos && (
          <PopupLancarTodos
            itens={lancandoTodos.itens}
            aoFechar={() => setLancandoTodos(null)}
            aoTerminar={({ pedido: novo, avisos: novosAvisos }) => {
              if (novo) lancandoTodos.aplicar(novo);
              setAvisos((antes) => ({ ...antes, ...novosAvisos }));
              router.refresh();
              if (novo && novo.status === "PARCIAL" && todosLancados(novo.itens)) setPerguntarFinalizar(true);
            }}
          />
        )}
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
        {perguntarFinalizar && !conclusao && !lancandoTodos && (
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

  return <EditorPedido pedidoInicial={pedidoInicial} transportadoras={transportadoras} podeEditar={podeEditar} podeCasar={podeCasar} extras={extras} />;
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
