"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, Loader2, PackageOpen, X } from "lucide-react";

import { adicionarAoPedidoAcao, fornecedoresParaCompraAcao } from "@/app/compras/acoes";
import FotoComLupa from "@/components/ui/FotoComLupa";
import { numeroDoPedido } from "@/lib/compras/regras";
import { situacaoDeEstoque } from "@/lib/estoqueDoConcorrente";
import { propsDoFundo } from "@/lib/fundoDaJanela";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** O estoque do fornecedor com o mesmo texto da aba Fornecedores do cadastro (`situacaoDeEstoque`). */
function textoDoEstoque(estoque) {
  const situacao = situacaoDeEstoque(estoque);
  if (situacao === "em-estoque") return { texto: estoque.quantidade > 0 ? `${estoque.quantidade} un.` : "Em estoque", cor: "text-emerald-700" };
  if (situacao === "sem-estoque") return { texto: "Sem estoque", cor: "text-rose-600" };
  if (situacao === "fora-da-coleta") return { texto: "Fora da coleta", cor: "text-suave" };
  return { texto: "Não informado", cor: "text-suave" };
}

const soDigitos = (texto) => String(texto ?? "").replace(/\D/g, "").slice(0, 7);

/**
 * Popup "Fornecedores" da lista do estoque minimo. Linha-guia: o operador ve primeiro quem vende mais barato e se tem
 * estoque; a acao principal e "Adicionar ao pedido" com a quantidade ja preenchida (o maximo do produto, editavel).
 * O dado vem de `fornecedoresParaCompraAcao` ao abrir; adicionar manda ao rascunho do fornecedor e a lista de tras
 * recarrega para o carrinho aparecer.
 */
export default function PopupFornecedores({ produto, aoFechar }) {
  const router = useRouter();
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [quantidades, setQuantidades] = useState({});
  const [enviando, setEnviando] = useState(null);
  const [feito, setFeito] = useState(null);
  const [, iniciar] = useTransition();

  // Le ao montar; o `setState` so depois do await (o React 19 barra o sincrono em efeito).
  useEffect(() => {
    let vivo = true;
    fornecedoresParaCompraAcao(produto.id).then((resposta) => {
      if (!vivo) return;
      if (!resposta?.ok) setErro(resposta?.erro ?? "Não foi possível ler os fornecedores.");
      else setDados(resposta);
    });
    return () => {
      vivo = false;
    };
  }, [produto.id]);

  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const quantidadeDe = (linha) => quantidades[linha.vinculoId] ?? String(dados?.produto.sugerida ?? "");

  function adicionar(linha) {
    const quantidade = Number(quantidadeDe(linha));
    setEnviando(linha.vinculoId);
    setFeito(null);
    iniciar(async () => {
      const resposta = await adicionarAoPedidoAcao({ produtoId: produto.id, vinculoId: linha.vinculoId, quantidade });
      setEnviando(null);
      if (!resposta?.ok) {
        setFeito({ erro: resposta?.erro ?? "Não foi possível adicionar." });
        return;
      }
      setDados((antes) => ({
        ...antes,
        linhas: antes.linhas.map((item) =>
          item.fornecedorId === linha.fornecedorId ? { ...item, noRascunho: { pedidoId: resposta.pedidoId, numero: resposta.numero } } : item,
        ),
      }));
      setFeito(resposta);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-[6vh]" {...propsDoFundo(() => aoFechar())}>
      <section role="dialog" aria-modal="true" aria-labelledby="titulo-fornecedores" className="w-full max-w-6xl rounded-lg border border-borda bg-superficie shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-borda px-5 py-4">
          <div className="min-w-0">
            <h2 id="titulo-fornecedores" className="text-base font-semibold">Fornecedores</h2>
            <p className="mt-0.5 truncate text-sm text-suave">
              <span className="font-mono text-xs">{produto.sku}</span> · {produto.nome}
            </p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo hover:text-texto">
            <X size={18} />
          </button>
        </header>

        <div className="px-5 py-4">
          {erro && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}
          {!erro && !dados && (
            <p className="flex items-center gap-2 py-6 text-sm text-suave">
              <Loader2 size={16} className="animate-spin" /> Lendo os fornecedores…
            </p>
          )}
          {dados && dados.linhas.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <PackageOpen size={28} className="text-suave" />
              <p className="text-sm font-medium">Este produto não tem fornecedor vinculado.</p>
              <Link href={`/produtos/${produto.id}`} className="text-sm text-acento hover:underline">
                Cadastrar fornecedor no produto
              </Link>
            </div>
          )}
          {dados && dados.linhas.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-borda">
              <table className="w-full text-sm">
                <thead className="border-b border-borda bg-fundo text-left text-xs text-suave">
                  <tr>
                    <th className="w-14 px-3 py-2 font-medium">Foto</th>
                    <th className="px-3 py-2 font-medium">Fornecedor</th>
                    <th className="px-3 py-2 font-medium">Descrição no fornecedor</th>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Preço un.</th>
                    <th className="px-3 py-2 font-medium">Estoque</th>
                    <th className="w-10 px-3 py-2 font-medium"><span className="sr-only">Link</span></th>
                    <th className="w-20 px-3 py-2 text-right font-medium">Qtde</th>
                    <th className="w-px px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {dados.linhas.map((linha) => {
                    const estoque = textoDoEstoque(linha.estoqueFornecedor);
                    const qtde = quantidadeDe(linha);
                    const valida = Number(qtde) >= 1;
                    return (
                      <tr key={linha.vinculoId} className={linha.padrao ? "bg-sky-50/40" : undefined}>
                        <td className="px-3 py-2">
                          {linha.coletadoId ? (
                            <FotoComLupa src={`/api/mercados/miniatura/${linha.coletadoId}`} alt="" className="h-10 w-10" />
                          ) : (
                            <span className="block h-10 w-10 rounded border border-dashed border-borda" />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span className="font-medium">{linha.fornecedor}</span>
                          {linha.padrao && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">Padrão</span>}
                        </td>
                        <td className="max-w-48 truncate px-3 py-2 text-suave">{linha.descricao || "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs">{linha.codigo || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {linha.precoUnitario === null ? "—" : moeda.format(linha.precoUnitario)}
                          {linha.ipiPercentual > 0 && <span className="block text-[11px] text-suave">+ IPI {linha.ipiPercentual}%</span>}
                        </td>
                        <td className={`whitespace-nowrap px-3 py-2 text-xs ${estoque.cor}`}>{estoque.texto}</td>
                        <td className="px-3 py-2">
                          {linha.link && /^https?:\/\//i.test(linha.link) && (
                            <a href={linha.link} target="_blank" rel="noreferrer" title="Abrir no site do fornecedor" className="inline-flex rounded p-1 text-suave hover:bg-fundo hover:text-acento">
                              <ExternalLink size={15} />
                            </a>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {!linha.noRascunho && (
                            <input
                              type="text"
                              inputMode="numeric"
                              aria-label={`Quantidade para ${linha.fornecedor}`}
                              value={qtde}
                              onChange={(evento) => setQuantidades((antes) => ({ ...antes, [linha.vinculoId]: soDigitos(evento.target.value) }))}
                              className="w-16 rounded-md border border-borda px-2 py-1 text-right tabular-nums focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/20"
                            />
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          {linha.noRascunho ? (
                            <Link href={`/compras/pedidos/${linha.noRascunho.pedidoId}`} className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:underline">
                              No rascunho {numeroDoPedido(linha.noRascunho.numero)} · Abrir
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={() => adicionar(linha)}
                              disabled={!valida || enviando !== null}
                              title={valida ? undefined : "Informe a quantidade"}
                              className="inline-flex items-center gap-1.5 rounded-md bg-acento px-3 py-1.5 text-xs font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-acento/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {enviando === linha.vinculoId && <Loader2 size={13} className="animate-spin" />}
                              Adicionar ao pedido
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {feito && (
          <footer className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-borda px-5 py-3 text-sm ${feito.erro ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`}>
            {feito.erro ? (
              feito.erro
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>{feito.jaEstava ? "Já estava no" : "Adicionado ao"} {numeroDoPedido(feito.numero)}.</span>
                <Link href={`/compras/pedidos/${feito.pedidoId}`} className="font-medium underline-offset-2 hover:underline">
                  Abrir pedido
                </Link>
                {feito.avisoOutroRascunho && <span className="w-full text-amber-700">{feito.avisoOutroRascunho}</span>}
              </>
            )}
          </footer>
        )}
      </section>
    </div>
  );
}
