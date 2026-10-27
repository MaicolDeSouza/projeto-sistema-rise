"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ExternalLink, Loader } from "lucide-react";

import { cancelarAcao, concluirAcao, darBaixaAcao, reenviarAcao } from "@/app/estoque/producao/acoes";
import IconeDeEstoque from "@/components/produtos/IconeDeEstoque";
import FotoComLupa from "@/components/ui/FotoComLupa";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { propsDoFundo } from "@/lib/fundoDaJanela";
import { custoDasPecas } from "@/lib/producao/regras";

const PASSOS = [
  { situacao: "ABERTA", texto: "Aberta", data: "criadoEm" },
  { situacao: "EM_PRODUCAO", texto: "Em produção", data: "baixaEm" },
  { situacao: "CONCLUIDA", texto: "Concluída", data: "concluidaEm" },
];

const reais = (valor) => (valor === null || valor === undefined ? "—" : Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const data = (valor) => (valor ? new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : null);
const numero = (valor) => Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Janela simples de confirmacao no padrao do projeto (fundo com `propsDoFundo`, Esc fecha). */
function Janela({ titulo, children, aoFechar }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...propsDoFundo(aoFechar)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={titulo}
        onKeyDown={(evento) => evento.key === "Escape" && aoFechar()}
        className="w-full max-w-md rounded-lg bg-superficie p-5 shadow-xl"
      >
        <h2 className="text-base font-semibold">{titulo}</h2>
        {children}
      </div>
    </div>
  );
}

/**
 * Uma ordem de producao (spec 2026-10-26-producao-pecas-proprias-design.md). Linha-guia: o operador ve primeiro em que
 * passo a ordem esta e se as pecas tem estoque; a acao principal e a do passo (Dar baixa, depois Concluir).
 */
export default function OrdemDeProducao({ ordem, podeMovimentar }) {
  const router = useRouter();
  const [rodando, iniciar] = useTransition();
  const [erro, setErro] = useState(null);
  const [faltas, setFaltas] = useState(null);
  const [avisosDoBling, setAvisosDoBling] = useState([]);
  const [janela, setJanela] = useState(null);
  const [produzida, setProduzida] = useState(String(ordem.quantidadePlanejada));

  const executar = (acao) =>
    iniciar(async () => {
      setErro(null);
      setFaltas(null);
      const resultado = await acao();
      if (!resultado.ok) {
        setErro(resultado.erro);
        setFaltas(resultado.faltas ?? null);
        return;
      }
      setJanela(null);
      setAvisosDoBling((resultado.bling ?? []).filter((item) => !item.ok));
      router.refresh();
    });

  const atual = PASSOS.findIndex((passo) => passo.situacao === ordem.situacao);
  const custo = custoDasPecas(ordem.itens.map((item) => ({ custo: item.custoUnitario, quantidade: item.quantidadePorUnidade })));
  const perda = Math.max(0, ordem.quantidadePlanejada - (Number(produzida) || 0));
  const aberta = ordem.situacao === "ABERTA";
  const emProducao = ordem.situacao === "EM_PRODUCAO";

  const acaoPrincipal = !podeMovimentar ? null : aberta ? (
    <button
      type="button"
      onClick={() => executar(() => darBaixaAcao(ordem.id))}
      disabled={rodando}
      className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
    >
      {rodando && <Loader size={14} className="animate-spin" />}
      Dar baixa nas peças
    </button>
  ) : emProducao ? (
    <button
      type="button"
      onClick={() => setJanela("concluir")}
      disabled={rodando}
      className="rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
    >
      Concluir produção
    </button>
  ) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-borda bg-superficie px-4 py-3">
        {ordem.situacao === "CANCELADA" ? (
          <p className="flex-1 text-sm text-suave">Ordem cancelada em {data(ordem.canceladaEm)}.</p>
        ) : (
          <ol className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" aria-label="Situação da ordem">
            {PASSOS.map((passo, indice) => {
              const feito = indice < atual || ordem.situacao === "CONCLUIDA";
              const agora = indice === atual && ordem.situacao !== "CONCLUIDA";
              return (
                <li key={passo.situacao} className="flex shrink-0 items-center gap-2" aria-current={agora ? "step" : undefined}>
                  {indice > 0 && <span className={`h-px w-8 sm:w-14 ${indice <= atual ? "bg-acento" : "bg-borda"}`} aria-hidden="true" />}
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      feito ? "bg-acento text-white" : agora ? "bg-acento/10 text-acento ring-2 ring-acento" : "bg-fundo text-suave ring-1 ring-borda"
                    }`}
                  >
                    {feito ? <Check size={13} strokeWidth={3} /> : indice + 1}
                  </span>
                  <span className={`text-sm ${agora ? "font-semibold" : feito ? "" : "text-suave"}`}>
                    {passo.texto}
                    {indice <= atual && data(ordem[passo.data]) && <span className="ml-1.5 text-xs text-suave">{data(ordem[passo.data])}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {podeMovimentar && (aberta || emProducao) && (
          <button
            type="button"
            onClick={() => setJanela("cancelar")}
            disabled={rodando}
            className="text-sm text-red-700 hover:underline disabled:opacity-50"
          >
            Cancelar ordem
          </button>
        )}
        {acaoPrincipal}
      </div>

      {erro && (
        <div role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="font-medium">{erro}</p>
          {faltas?.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {faltas.map((falta) => (
                <li key={falta.sku}>
                  {falta.sku} · {falta.descricao}: precisa {falta.necessario}, tem {falta.disponivel}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {avisosDoBling.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Gravado no Rise; o Bling não recebeu o ajuste de:</p>
          <ul className="mt-1 list-disc pl-5">
            {avisosDoBling.map((aviso) => (
              <li key={aviso.produtoId}>
                {aviso.sku}: {aviso.erro}
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={rodando}
            onClick={() => executar(() => reenviarAcao(ordem.id))}
            className="mt-2 rounded border border-amber-400 px-2.5 py-1 text-xs font-medium hover:bg-amber-100 disabled:opacity-50"
          >
            Reenviar ao Bling
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-borda bg-superficie p-4">
          <p className="text-xs font-semibold uppercase text-suave">Produto</p>
          <Link href={`/produtos/${ordem.produto.id}`} target="_blank" className="mt-1 inline-flex items-center gap-1 font-medium hover:text-acento">
            <span className="font-mono text-xs">{ordem.produto.sku}</span>
            <ExternalLink size={12} className="text-suave" />
          </Link>
          <p className="text-sm">{ordem.produto.tituloBase}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-suave">
            Estoque hoje: {ordem.produto.estoque}
            <IconeDeEstoque estoque={ordem.produto.estoque} estoqueMinimo={ordem.produto.estoqueMinimo} estoqueMaximo={ordem.produto.estoqueMaximo} />
          </p>
        </div>
        <div className="rounded-lg border border-borda bg-superficie p-4">
          <p className="text-xs font-semibold uppercase text-suave">Quantidade</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{ordem.quantidadePlanejada}</p>
          {ordem.quantidadeProduzida !== null && (
            <p className="text-sm">
              Produzidas: <strong>{ordem.quantidadeProduzida}</strong>
              {ordem.quantidadeProduzida < ordem.quantidadePlanejada && (
                <span className="text-amber-700"> · perda {ordem.quantidadePlanejada - ordem.quantidadeProduzida}</span>
              )}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-borda bg-superficie p-4">
          <p className="text-xs font-semibold uppercase text-suave">Custo</p>
          <p className="mt-1 text-sm">
            Por unidade: <strong>{custo.incompleto ? <span className="text-amber-700">incompleto</span> : reais(custo.total)}</strong>
          </p>
          <p className="text-sm">
            Da ordem:{" "}
            <strong>{custo.incompleto ? <span className="text-amber-700">incompleto</span> : reais(custo.total * ordem.quantidadePlanejada)}</strong>
          </p>
          {ordem.observacao && <p className="mt-2 text-xs text-suave">{ordem.observacao}</p>}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
        <table className="w-full text-sm">
          <thead className="bg-fundo text-left text-xs font-semibold uppercase text-suave">
            <tr>
              <th className="w-14 px-3 py-2">Foto</th>
              <th className="px-3 py-2">Peça</th>
              <th className="px-3 py-2 text-right">Por unidade</th>
              <th className="px-3 py-2 text-right">
                <span className="inline-flex items-center gap-1">
                  Total
                  <BolhaDeAjuda variante="inline" texto="Por unidade × quantidade planejada, arredondado para cima (o estoque é inteiro)." />
                </span>
              </th>
              <th className="px-3 py-2 text-right">Custo unit.</th>
              <th className="px-3 py-2 text-right">Custo total</th>
              <th className="px-3 py-2 text-right">Estoque hoje</th>
              <th className="w-14 px-3 py-2" aria-label="Situação do estoque" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {ordem.itens.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2">{item.foto ? <FotoComLupa src={item.foto} alt={item.descricao} className="h-10 w-10" /> : <span className="text-suave">—</span>}</td>
                <td className="px-3 py-2">
                  {item.sku && <span className="mr-2 font-mono text-xs text-suave">{item.sku}</span>}
                  {item.descricao}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{numero(item.quantidadePorUnidade)}</td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{item.quantidadeTotal}</td>
                <td className="px-3 py-2 text-right tabular-nums">{reais(item.custoUnitario)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {item.custoUnitario === null ? "—" : reais(item.custoUnitario * item.quantidadePorUnidade * ordem.quantidadePlanejada)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{item.componenteId ? item.estoqueAtual : <span className="text-suave">—</span>}</td>
                <td className="px-3 py-2 text-center">
                  {item.componenteId && <IconeDeEstoque estoque={item.estoqueAtual} estoqueMinimo={item.estoqueMinimo} estoqueMaximo={item.estoqueMaximo} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!podeMovimentar && <p className="text-xs text-suave">Somente leitura: você pode ver a ordem, mas não movimentar o estoque.</p>}

      {janela === "concluir" && (
        <Janela titulo="Concluir produção" aoFechar={() => setJanela(null)}>
          <label className="mt-3 block text-sm font-semibold" htmlFor="quantidade-produzida">
            Quantas ficaram prontas?
          </label>
          <input
            id="quantidade-produzida"
            type="number"
            min="1"
            max={ordem.quantidadePlanejada}
            step="1"
            autoFocus
            value={produzida}
            onChange={(evento) => setProduzida(evento.target.value)}
            onKeyDown={(evento) => ["e", "E", "+", "-", ".", ","].includes(evento.key) && evento.preventDefault()}
            className="mt-1 w-32 rounded border border-borda px-2.5 py-2 text-sm focus:border-acento focus:outline-none"
          />
          <p className="mt-1 text-xs text-suave">
            Planejadas: {ordem.quantidadePlanejada}
            {perda > 0 && <span className="text-amber-700"> · perda: {perda}</span>}
          </p>
          {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setJanela(null)} className="rounded border border-borda px-3 py-2 text-sm hover:bg-fundo">
              Voltar
            </button>
            <button
              type="button"
              disabled={rodando}
              onClick={() => executar(() => concluirAcao(ordem.id, { quantidadeProduzida: produzida }))}
              className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {rodando && <Loader size={14} className="animate-spin" />}
              Lançar no estoque
            </button>
          </div>
        </Janela>
      )}
      {janela === "cancelar" && (
        <Janela titulo={`Cancelar ${ordem.numero}?`} aoFechar={() => setJanela(null)}>
          <p className="mt-2 text-sm text-suave">
            {emProducao ? "As peças baixadas voltam ao estoque." : "Nenhum estoque foi movimentado ainda."}
          </p>
          {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" autoFocus onClick={() => setJanela(null)} className="rounded border border-borda px-3 py-2 text-sm hover:bg-fundo">
              Voltar
            </button>
            <button
              type="button"
              disabled={rodando}
              onClick={() => executar(() => cancelarAcao(ordem.id))}
              className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Cancelar ordem
            </button>
          </div>
        </Janela>
      )}
    </div>
  );
}

