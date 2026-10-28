"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCheck, FileDown, Loader2, MoreVertical, Send } from "lucide-react";

import { adicionarItemAcao, desfazerCasamentoAliExpressAcao, mudarStatusAcao, salvarPedidoAcao } from "@/app/compras/acoes";
import SecaoDoAnuncio from "@/components/anuncios/ml/SecaoDoAnuncio";
import { faltaLancar } from "@/lib/compras/regras";
import { AvisosAliExpress, ResumoAliExpress } from "./AliExpressDoPedido";
import BlocoItens from "./BlocoItens";
import { BlocoFrete, BlocoObservacoes, BlocoPagamento, BlocoProposta, BlocoTotais } from "./BlocosDoPedido";
import { entradaDoFormulario, formularioDoPedido, totaisDoFormulario } from "./formato";
import Pergunta from "./Pergunta";
import SeloDoStatus from "./SeloDoStatus";
import TrilhaDoStatus from "./TrilhaDoStatus";

/**
 * O editor do pedido de compra. Linha-guia: o operador ve primeiro os ITENS e o TOTAL; a acao principal muda com a
 * situacao (rascunho: marcar como enviado; enviado ou parcial: finalizar). Os cartoes seguem a ordem do pedido do
 * Bling: fornecedor, itens, totais, pagamento, frete, proposta, observacoes.
 *
 * `extras` deixa as tarefas seguintes acrescentarem a coluna de chegada (lancar estoque), o arquivo da proposta e o
 * link do PDF sem reescrever este componente.
 */
export default function EditorPedido({ pedidoInicial, transportadoras, podeEditar, podeCasar = false, extras = {} }) {
  const router = useRouter();
  const [pedido, setPedido] = useState(pedidoInicial);
  const [base, setBase] = useState(() => formularioDoPedido(pedidoInicial));
  const [formulario, setFormulario] = useState(base);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [pergunta, setPergunta] = useState(null);
  const [menu, setMenu] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [ocupado, iniciar] = useTransition();

  const veCusto = !pedido.semPrecos;
  const fechado = ["FINALIZADO", "CANCELADO"].includes(pedido.status) || !podeEditar;
  const rascunho = pedido.status === "RASCUNHO" && !fechado;
  const aCaminho = ["ENVIADO", "PARCIAL"].includes(pedido.status) && !fechado;
  const alterado = useMemo(() => JSON.stringify(formulario) !== JSON.stringify(base), [formulario, base]);
  const totais = useMemo(() => totaisDoFormulario(formulario), [formulario]);

  // Fechar a aba com alteracao nao salva: o navegador pergunta.
  useEffect(() => {
    if (!alterado) return undefined;
    const avisar = (evento) => evento.preventDefault();
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [alterado]);

  function aplicar(novo) {
    setPedido(novo);
    const formularioNovo = formularioDoPedido(novo);
    setBase(formularioNovo);
    setFormulario(formularioNovo);
  }

  const mudar = (campo, valor) => setFormulario((antes) => ({ ...antes, [campo]: valor }));
  const mudarItem = (indice, campo, valor) =>
    setFormulario((antes) => ({ ...antes, itens: antes.itens.map((item, posicao) => (posicao === indice ? { ...item, [campo]: valor } : item)) }));
  const removerItem = (indice) => setFormulario((antes) => ({ ...antes, itens: antes.itens.filter((_, posicao) => posicao !== indice) }));

  async function adicionarItem(achado) {
    const resposta = await adicionarItemAcao(pedido.id, achado.produtoId);
    if (!resposta?.ok || !resposta.item) {
      setErroGeral(resposta?.erro ?? "Não foi possível adicionar o item.");
      return;
    }
    // O item ja esta gravado: entra na base e no formulario, sem desfazer o que foi digitado nas outras linhas.
    const [itemNoFormulario] = formularioDoPedido({ ...pedido, itens: [resposta.item] }).itens;
    setBase((antes) => ({ ...antes, itens: [...antes.itens, itemNoFormulario] }));
    setFormulario((antes) => ({ ...antes, itens: [...antes.itens, itemNoFormulario] }));
    setPedido((antes) => ({ ...antes, itens: [...antes.itens, resposta.item] }));
    setBuscando(false);
    setErroGeral(null);
  }

  /** Grava; devolve o pedido salvo ou null (com os erros na tela). */
  async function salvar() {
    setErroGeral(null);
    const resposta = await salvarPedidoAcao(pedido.id, entradaDoFormulario(formulario));
    if (!resposta?.ok) {
      setErros(resposta?.erros ?? {});
      setErroGeral(resposta?.erros ? "Confira os campos marcados em vermelho." : resposta?.erro ?? "Não foi possível salvar.");
      return null;
    }
    setErros({});
    aplicar(resposta.pedido);
    return resposta.pedido;
  }

  const mudarStatus = (para) =>
    iniciar(async () => {
      if (alterado && !(await salvar())) {
        setPergunta(null);
        return;
      }
      const resposta = await mudarStatusAcao(pedido.id, para);
      setPergunta(null);
      if (!resposta?.ok) {
        setErroGeral(resposta?.erro ?? "Não foi possível mudar a situação.");
        return;
      }
      aplicar(resposta.pedido);
      router.refresh();
    });

  const pendentes = pedido.itens.filter((item) => faltaLancar(item) > 0);
  const casavel = podeCasar && podeEditar && !["FINALIZADO", "CANCELADO"].includes(pedido.status);

  // "Trocar produto" do pedido do AliExpress: o item volta a ser linha sem produto (so sem estoque lancado).
  const trocarProduto = (item) =>
    iniciar(async () => {
      const linhaId = pedido.aliexpress?.linhaPorItem?.[item.id];
      if (!linhaId) return;
      const resposta = await desfazerCasamentoAliExpressAcao(linhaId);
      if (!resposta?.ok) return setErroGeral(resposta?.erro ?? "Não foi possível trocar o produto.");
      if (resposta.pedido) aplicar(resposta.pedido);
      router.refresh();
    });

  const perguntas = {
    sair: (
      <Pergunta titulo="Sair sem salvar?" confirmar="Sair sem salvar" recuar="Continuar editando" destrutiva aoRecuar={() => setPergunta(null)} aoConfirmar={() => router.push("/compras/pedidos")}>
        As alterações deste pedido ainda não foram salvas e serão perdidas.
      </Pergunta>
    ),
    enviar: (
      <Pergunta titulo={`Marcar ${pedido.codigo} como enviado?`} confirmar={alterado ? "Salvar e marcar como enviado" : "Marcar como enviado"} ocupado={ocupado} aoRecuar={() => setPergunta(null)} aoConfirmar={() => mudarStatus("ENVIADO")}>
        Depois de enviado, quantidades e preços não mudam mais, e as quantidades passam a contar como estoque a caminho.
      </Pergunta>
    ),
    finalizar: (
      <Pergunta titulo={`Finalizar ${pedido.codigo}?`} confirmar="Finalizar pedido" ocupado={ocupado} aoRecuar={() => setPergunta(null)} aoConfirmar={() => mudarStatus("FINALIZADO")}>
        {pendentes.length === 0 ? (
          "Todos os itens já foram lançados no estoque."
        ) : (
          <>
            Estes itens não chegaram por inteiro e deixam de contar como estoque a caminho:
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-texto">
              {pendentes.map((item) => (
                <li key={item.id}>
                  <span className="font-mono text-xs">{item.sku}</span> · faltam {faltaLancar(item)} de {item.quantidade}
                </li>
              ))}
            </ul>
          </>
        )}
      </Pergunta>
    ),
    cancelar: (
      <Pergunta titulo={`Cancelar ${pedido.codigo}?`} confirmar="Cancelar pedido" recuar="Voltar" destrutiva ocupado={ocupado} aoRecuar={() => setPergunta(null)} aoConfirmar={() => mudarStatus("CANCELADO")}>
        O pedido de {pedido.fornecedor.nome} fica cancelado e as quantidades deixam de contar como estoque a caminho.
      </Pergunta>
    ),
  };

  const podeCancelar = !fechado && ["RASCUNHO", "ENVIADO"].includes(pedido.status);
  const voltarALista = () => (alterado ? setPergunta("sair") : router.push("/compras/pedidos"));
  const salvarAqui = () =>
    iniciar(async () => {
      if (await salvar()) setSalvo(true);
    });

  // A acao da situacao mora no fim da linha da trilha (pedido do dono em 26/10/2026): o proximo passo ao lado do caminho.
  const acaoDaSituacao = rascunho ? (
    <button
      type="button"
      onClick={() => setPergunta("enviar")}
      disabled={ocupado || formulario.itens.length === 0}
      title={formulario.itens.length === 0 ? "Pedido sem itens" : undefined}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-acento px-3.5 py-1.5 text-sm font-semibold text-acento transition-[background-color,transform] duration-150 hover:bg-acento/5 active:scale-[0.97] disabled:opacity-50"
    >
      <Send size={15} /> Marcar como enviado
    </button>
  ) : aCaminho ? (
    <button
      type="button"
      onClick={() => setPergunta("finalizar")}
      disabled={ocupado}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-acento px-3.5 py-1.5 text-sm font-semibold text-acento transition-[background-color,transform] duration-150 hover:bg-acento/5 active:scale-[0.97] disabled:opacity-50"
    >
      <CheckCheck size={15} /> Finalizar pedido
    </button>
  ) : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={voltarALista}
            aria-label="Voltar aos pedidos"
            title="Voltar aos pedidos"
            className="rounded-md p-1.5 text-suave hover:bg-superficie hover:text-texto"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="truncate text-2xl font-semibold text-balance">
            <span className="font-mono">{pedido.codigo}</span> · {pedido.fornecedor.nome}
          </h1>
          <SeloDoStatus status={pedido.status} />
        </div>
        {/* Salvar e Cancelar no topo, no padrao do cadastro de Produto (pedido do dono em 26/10/2026). */}
        <div className="flex flex-wrap items-center gap-2">
          {alterado && <span className="text-sm font-medium text-amber-700">Alterações não salvas</span>}
          {!alterado && salvo && <span className="text-sm text-emerald-700">Pedido salvo.</span>}
          <span className="mx-1 text-sm">
            {extras.linkDoPdf ? (
              extras.linkDoPdf({ pedido, alterado, salvar })
            ) : (
              <span className="inline-flex cursor-not-allowed items-center gap-1.5 text-suave">
                <FileDown size={16} /> Baixar PDF
              </span>
            )}
          </span>
          {!fechado && (
            <button
              type="button"
              onClick={salvarAqui}
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {ocupado && <Loader2 size={14} className="animate-spin" />}
              Salvar
            </button>
          )}
          <button type="button" onClick={voltarALista} className="rounded border border-borda px-4 py-2 text-sm hover:bg-fundo">
            {fechado ? "Voltar" : "Cancelar"}
          </button>
          {podeCancelar && (
          <div className="relative">
            <button type="button" onClick={() => setMenu((aberto) => !aberto)} aria-label="Mais ações" aria-expanded={menu} className="rounded-md p-2 text-suave hover:bg-superficie hover:text-texto">
              <MoreVertical size={18} />
            </button>
            {menu && (
              <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-borda bg-superficie py-1 shadow-lg" onMouseLeave={() => setMenu(false)}>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(false);
                    setPergunta("cancelar");
                  }}
                  className="block w-full px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                >
                  Cancelar pedido
                </button>
              </div>
            )}
          </div>
          )}
        </div>
      </div>

      <TrilhaDoStatus
        status={pedido.status}
        enviadoEm={pedido.enviadoEm}
        finalizadoEm={pedido.finalizadoEm}
        canceladoEm={pedido.canceladoEm}
        acao={acaoDaSituacao}
        rotuloEnviado={pedido.aliexpress ? "Comprado no AliExpress" : undefined}
      />

      {pedido.aliexpress && <AvisosAliExpress avisos={pedido.avisos} aliexpress={pedido.aliexpress} podeCasar={casavel} aoAtualizar={aplicar} />}

      {erroGeral && <p className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700" role="alert">{erroGeral}</p>}

      <div className="space-y-6">
        {/* So o nome, simples e direto (pedido do dono em 26/10/2026); o nome leva ao cadastro do fornecedor. */}
        <SecaoDoAnuncio titulo="Fornecedor">
          <Link href={`/cadastros/fornecedores/${pedido.fornecedor.id}`} className="text-base font-semibold hover:text-acento hover:underline">
            {pedido.fornecedor.nome}
          </Link>
          {pedido.aliexpress && <ResumoAliExpress aliexpress={pedido.aliexpress} />}
        </SecaoDoAnuncio>

        <BlocoItens
          pedidoId={pedido.id}
          fornecedor={pedido.fornecedor.nome}
          itens={formulario.itens}
          editar={rascunho}
          editarPrazo={rascunho || aCaminho}
          veCusto={veCusto}
          erros={erros}
          aoMudar={mudarItem}
          aoRemover={removerItem}
          aoAdicionar={adicionarItem}
          buscando={buscando}
          setBuscando={setBuscando}
          // Chegada so existe depois de enviado: no rascunho a coluna vazia so roubava espaco dos campos.
          aliexpress={pedido.aliexpress}
          podeCasar={casavel}
          aoAtualizar={aplicar}
          aoTrocarProduto={trocarProduto}
          colunaDeChegada={extras.colunaDeChegada && pedido.status !== "RASCUNHO" ? (item) => extras.colunaDeChegada(item, { pedido, aplicar, alterado }) : null}
        />

        {veCusto && <BlocoTotais formulario={formulario} totais={totais} editar={rascunho} erros={erros} aoMudar={mudar} />}

        <div className="grid gap-6 lg:grid-cols-2">
          <BlocoPagamento formulario={formulario} editar={rascunho} erros={erros} aoMudar={mudar} totais={veCusto ? totais : null} editarEntrada={!fechado} />
          <BlocoFrete formulario={formulario} transportadoras={transportadoras} editar={!fechado} aoMudar={mudar} />
          <BlocoProposta formulario={formulario} editar={!fechado} aoMudar={mudar}>
            {extras.arquivoDaProposta?.({ pedido, editar: !fechado, formulario, mudar })}
          </BlocoProposta>
          <BlocoObservacoes formulario={formulario} editar={!fechado} aoMudar={mudar} />
        </div>
      </div>

      {pergunta && perguntas[pergunta]}
      {extras.janelas?.({ pedido, aplicar })}
    </div>
  );
}
