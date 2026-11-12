"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";

import { criarPropostaAcao, excluirPropostaAcao } from "@/app/propostas/acoes";
import Pergunta from "@/components/compras/Pergunta";
import CabecalhoOrdenavel, { parametrosDaOrdenacao } from "@/components/ui/CabecalhoOrdenavel";
import { COR_DA_SITUACAO, SITUACOES, dataBR, numeroDaProposta } from "@/lib/propostas/regras";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function SeloDaSituacao({ situacao }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-2 w-2 shrink-0 rounded-full ${COR_DA_SITUACAO[situacao]}`} aria-hidden="true" />
      {SITUACOES[situacao]}
    </span>
  );
}

/** O "!" do contato: a data chegou e a proposta esta aberta. */
export function AlertaDeContato({ titulo = "Contatar o cliente hoje" }) {
  return (
    <span
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white"
      title={titulo}
      aria-label={titulo}
    >
      !
    </span>
  );
}

/** "Nova proposta": cria o rascunho (com o numero) e abre o editor. */
export function BotaoNovaProposta() {
  const router = useRouter();
  const [ocupado, iniciar] = useTransition();
  const [erro, setErro] = useState(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={ocupado}
        onClick={() =>
          iniciar(async () => {
            const resposta = await criarPropostaAcao();
            if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível criar a proposta.");
            router.push(`/propostas/${resposta.numero}`);
          })
        }
        className="inline-flex items-center gap-1.5 rounded-md bg-acento px-3.5 py-2 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-acento/90 active:scale-[0.97] disabled:opacity-60"
      >
        {ocupado ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Nova proposta
      </button>
      {erro && <p className="text-xs text-rose-600" role="alert">{erro}</p>}
    </div>
  );
}

/**
 * A lista das propostas. Chips no topo: "Contatar hoje" (o "!"), "Abertas" e cada situacao (parametro repetido
 * `?situacao=`; nenhum = todas). Cabecalho que ordena em cada coluna (padrao do Rise).
 */
export default function TabelaPropostas({ linhas, situacoes, contatar, abertas, contagem, podeExcluir }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [excluindo, setExcluindo] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();

  function irCom(mudar) {
    const params = new URLSearchParams(searchParams);
    mudar(params);
    params.delete("pagina");
    router.push(`${pathname}?${params}`);
  }
  const alternarSituacao = (valor) =>
    irCom((params) => {
      const atuais = new Set(params.getAll("situacao"));
      if (valor === null) {
        atuais.clear();
        params.delete("contatar");
        params.delete("abertas");
      } else if (atuais.has(valor)) atuais.delete(valor);
      else atuais.add(valor);
      params.delete("situacao");
      for (const s of atuais) params.append("situacao", s);
    });
  const alternarChave = (chave, ligado) => irCom((params) => (ligado ? params.delete(chave) : params.set(chave, "1")));

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
  const nenhum = situacoes.length === 0 && !contatar && !abertas;

  const confirmarExclusao = () =>
    iniciar(async () => {
      const resposta = await excluirPropostaAcao(excluindo.numero);
      setExcluindo(null);
      if (!resposta?.ok) setErro(resposta?.erro ?? "Não foi possível excluir.");
      router.refresh();
    });

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar as propostas">
        <button type="button" onClick={() => alternarSituacao(null)} className={chip(nenhum)} aria-pressed={nenhum}>
          Todas
        </button>
        <button type="button" onClick={() => alternarChave("contatar", contatar)} className={`${chip(contatar)} inline-flex items-center gap-1.5`} aria-pressed={contatar}>
          {contagem.contatar > 0 && <AlertaDeContato titulo={`${contagem.contatar} para contatar`} />}
          Contatar hoje
          <span className="tabular-nums text-suave">{contagem.contatar}</span>
        </button>
        <button type="button" onClick={() => alternarChave("abertas", abertas)} className={chip(abertas)} aria-pressed={abertas}>
          Abertas
        </button>
        {Object.keys(SITUACOES).map((s) => (
          <button key={s} type="button" onClick={() => alternarSituacao(s)} className={chip(situacoes.includes(s))} aria-pressed={situacoes.includes(s)}>
            {SITUACOES[s]} <span className="tabular-nums text-suave">{contagem[s] ?? 0}</span>
          </button>
        ))}
      </div>

      {linhas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-borda bg-superficie px-6 py-12 text-center">
          <FileText size={30} className="text-suave" />
          <p className="font-medium">Nenhuma proposta aqui.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
              <tr>
                <CabecalhoOrdenavel {...coluna("numero", "Número")} className="w-px whitespace-nowrap" />
                <CabecalhoOrdenavel {...coluna("cliente", "Cliente")} />
                <CabecalhoOrdenavel {...coluna("situacao", "Situação")} className="w-40" />
                <CabecalhoOrdenavel {...coluna("total", "Total")} className="w-32 text-right" />
                <CabecalhoOrdenavel {...coluna("validade", "Validade")} className="w-28" />
                <CabecalhoOrdenavel {...coluna("contato", "Próximo contato")} className="w-36" />
                <CabecalhoOrdenavel {...coluna("quem", "Quem fez")} className="w-32" />
                <CabecalhoOrdenavel {...coluna("atualizada", "Atualizada")} className="w-28" />
                {podeExcluir && <th className="w-12 px-2 py-2.5"><span className="sr-only">Excluir</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhas.map((linha) => (
                <tr key={linha.numero} className="cursor-pointer hover:bg-fundo/60" onClick={() => router.push(`/propostas/${linha.numero}`)}>
                  <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-semibold">
                    <Link href={`/propostas/${linha.numero}`} className="hover:text-acento" onClick={(e) => e.stopPropagation()}>
                      {linha.numero}
                    </Link>
                  </td>
                  <td className="max-w-0 truncate px-3 py-2.5" title={linha.provisorio ? `${linha.cliente} (sem cadastro)` : linha.cliente}>
                    {linha.cliente}
                    {linha.provisorio && linha.cliente !== "—" && <span className="ml-1.5 text-xs text-suave">sem cadastro</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <SeloDaSituacao situacao={linha.situacao} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{moeda.format(linha.total)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-suave">{dataBR(linha.validadeAte)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      {linha.precisaContato && <AlertaDeContato />}
                      <span className={linha.precisaContato ? "font-medium text-amber-700" : "text-suave"}>{linha.proximoContato ? dataBR(linha.proximoContato) : "—"}</span>
                    </span>
                  </td>
                  <td className="max-w-0 truncate px-3 py-2.5 text-suave">{linha.quem}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-suave">{new Date(linha.atualizadoEm).toLocaleDateString("pt-BR")}</td>
                  {podeExcluir && (
                    <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        disabled={linha.situacao !== "RASCUNHO"}
                        onClick={() => setExcluindo(linha)}
                        title={linha.situacao === "RASCUNHO" ? `Excluir a proposta ${linha.numero}` : "Só o rascunho pode ser excluído"}
                        aria-label={linha.situacao === "RASCUNHO" ? `Excluir a proposta ${linha.numero}` : "Só o rascunho pode ser excluído"}
                        className="inline-flex rounded-md p-2 text-suave transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-suave"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {erro && <p className="mt-3 text-sm text-rose-600" role="alert">{erro}</p>}
      {excluindo && (
        <Pergunta
          titulo={`Excluir a ${numeroDaProposta(excluindo.numero)}?`}
          confirmar="Excluir proposta"
          destrutiva
          ocupado={ocupado}
          aoRecuar={() => setExcluindo(null)}
          aoConfirmar={confirmarExclusao}
        >
          Rascunho de {excluindo.cliente}, com {excluindo.itens} {excluindo.itens === 1 ? "item" : "itens"}. A proposta e os anexos somem; não dá para desfazer.
        </Pergunta>
      )}
    </>
  );
}
