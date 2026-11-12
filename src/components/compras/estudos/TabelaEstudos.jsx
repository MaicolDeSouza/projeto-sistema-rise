"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FlaskConical, Trash2 } from "lucide-react";

import { excluirEstudoAcao } from "@/app/compras/estudos/acoes";
import Pergunta from "@/components/compras/Pergunta";
import CabecalhoOrdenavel, { parametrosDaOrdenacao } from "@/components/ui/CabecalhoOrdenavel";
import FotoComLupa from "@/components/ui/FotoComLupa";

import SeloDoVeredito from "./SeloDoVeredito";
import { data, moeda } from "./formato";

const FILTROS = [
  ["NA_FILA", "Na fila"],
  ["CONCLUIDO", "Concluídos"],
];

/**
 * A lista dos estudos de viabilidade. Linha-guia: o operador ve primeiro o veredito de cada produto; a acao principal e
 * abrir o relatorio. Chips filtram a situacao (`?situacao=` repetido; nenhum = todos) e cada coluna de dado ordena.
 */
export default function TabelaEstudos({ linhas, situacao, podeExcluir = false }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [excluindo, setExcluindo] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();

  function alternar(filtro) {
    const params = new URLSearchParams(searchParams);
    const atuais = new Set(params.getAll("situacao"));
    if (filtro === null) atuais.clear();
    else if (atuais.has(filtro)) atuais.delete(filtro);
    else atuais.add(filtro);
    params.delete("situacao");
    params.delete("pagina");
    for (const valor of atuais) params.append("situacao", valor);
    router.push(`${pathname}?${params}`);
  }

  const ordenar = searchParams.get("ordenar");
  const direcao = searchParams.get("direcao") === "desc" ? "desc" : "asc";
  const coluna = (campo, rotulo) => ({
    campo,
    rotulo,
    ordenar,
    direcao,
    aoClicar: (escolhida) => router.push(`${pathname}?${parametrosDaOrdenacao(searchParams, escolhida, ordenar, direcao)}`),
  });
  const chip = (ativo) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition-colors ${ativo ? "border-acento bg-acento/10 text-acento" : "border-borda text-suave hover:text-texto"}`;

  const confirmarExclusao = () =>
    iniciar(async () => {
      const resposta = await excluirEstudoAcao(excluindo.id);
      setExcluindo(null);
      setErro(resposta?.ok ? null : (resposta?.erro ?? "Não foi possível excluir."));
      router.refresh();
    });

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar pela situação">
        <button type="button" onClick={() => alternar(null)} className={chip(situacao.length === 0)} aria-pressed={situacao.length === 0}>
          Todos
        </button>
        {FILTROS.map(([filtro, rotulo]) => (
          <button key={filtro} type="button" onClick={() => alternar(filtro)} className={chip(situacao.includes(filtro))} aria-pressed={situacao.includes(filtro)}>
            {rotulo}
          </button>
        ))}
      </div>

      {linhas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-borda bg-superficie px-6 py-12 text-center">
          <FlaskConical size={30} className="text-suave" />
          <p className="font-medium">Nenhum estudo aqui.</p>
          <p className="text-sm text-suave">Marque produtos no Scraper e clique em Enviar para estudo.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
              <tr>
                <th className="w-14 px-3 py-2.5">
                  <span className="sr-only">Foto</span>
                </th>
                <CabecalhoOrdenavel {...coluna("nome", "Produto")} />
                <CabecalhoOrdenavel {...coluna("veredito", "Veredito")} className="w-40" />
                <CabecalhoOrdenavel {...coluna("preco", "Preço no ML")} className="w-32 text-right" />
                <CabecalhoOrdenavel {...coluna("custo", "Custo")} className="w-28 text-right" />
                <CabecalhoOrdenavel {...coluna("lucro", "Lucro")} className="w-28 text-right" />
                <CabecalhoOrdenavel {...coluna("quantidade", "Comprar")} className="w-24 text-right" />
                <CabecalhoOrdenavel {...coluna("data", "Data")} className="w-28" />
                {podeExcluir && (
                  <th className="w-12 px-2 py-2.5">
                    <span className="sr-only">Excluir</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhas.map((linha) => {
                const contas = linha.contas;
                const lucro = contas?.lucro?.lucro ?? null;
                return (
                  <tr key={linha.id} className="cursor-pointer hover:bg-fundo/60" onClick={() => router.push(`/compras/estudos/${linha.id}`)}>
                    <td className="px-3 py-2" onClick={(evento) => evento.stopPropagation()}>
                      {linha.miniatura ? <FotoComLupa src={linha.miniatura} alt={linha.nome} /> : <span className="block h-11 w-11 rounded bg-fundo" />}
                    </td>
                    <td className="max-w-0 px-3 py-2">
                      <Link href={`/compras/estudos/${linha.id}`} onClick={(evento) => evento.stopPropagation()} className="block truncate font-medium hover:text-acento">
                        {linha.nome}
                      </Link>
                      <span className="block truncate text-xs text-suave">
                        {linha.fonteTipo === "FORNECEDOR" ? "F" : "C"} · {linha.fonteNome}
                        {linha.codigo ? ` · ${linha.codigo}` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <SeloDoVeredito situacao={linha.situacao} veredito={linha.veredito} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{moeda(contas?.mercado?.precoReferencia)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{moeda(contas?.custo?.custo)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${lucro !== null && lucro < 0 ? "text-rose-600" : ""}`}>{moeda(lucro)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{linha.situacao === "CONCLUIDO" ? (linha.quantidadeInicial ?? "—") : "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-suave tabular-nums">{data(linha.concluidoEm ?? linha.criadoEm)}</td>
                    {podeExcluir && (
                      <td className="px-2 py-1.5" onClick={(evento) => evento.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setExcluindo(linha)}
                          aria-label={`Excluir o estudo de ${linha.nome}`}
                          title="Excluir estudo"
                          className="inline-flex rounded-md p-2 text-suave transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {erro && (
        <p className="mt-3 text-sm text-rose-600" role="alert">
          {erro}
        </p>
      )}
      {excluindo && (
        <Pergunta
          titulo="Excluir este estudo?"
          confirmar="Excluir estudo"
          destrutiva
          ocupado={ocupado}
          aoConfirmar={confirmarExclusao}
          aoRecuar={() => setExcluindo(null)}
        >
          {excluindo.nome}
          {excluindo.codigo ? ` (${excluindo.codigo})` : ""}, de {excluindo.fonteNome}. O relatório sai do histórico.
        </Pergunta>
      )}
    </>
  );
}
