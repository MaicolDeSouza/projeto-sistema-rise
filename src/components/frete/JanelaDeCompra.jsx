"use client";

import { useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";

import { comprarEtiquetaAcao, conferirPacoteAcao } from "@/app/envios/acoes";
import { bordaDoCampo, CLASSE_CAMPO } from "@/components/cadastros/Campo";
import ConclusaoDoEnvio from "@/components/ui/ConclusaoDoEnvio";
import { propsDoFundo } from "@/lib/fundoDaJanela";
import { formatoDeMoeda } from "@/lib/dinheiro";

const moeda = formatoDeMoeda();
const BOTAO = "inline-flex items-center gap-1.5 rounded px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Comprar a etiqueta (modulo de frete, fase 2), em dois passos. 1) Pacote medido: a caixa, o peso da balanca e o documento
 * (a chave da NF-e vem do pedido; sem nota, declaracao de conteudo). "Conferir preco" cota de novo o mesmo servico com o
 * pacote real. 2) Confirmacao: valor, prazo e saldo antes e depois; "Comprar por R$ X" so com tudo certo. Linha-guia: o
 * operador ve o valor e o saldo ANTES de gastar (anti-goal da spec: nunca comprar sem ver).
 */
export default function JanelaDeCompra({ envio, caixas, chaveDaNota, retomar = false, aoFechar, aoConcluir }) {
  const [passo, setPasso] = useState(retomar ? "confirmar" : "pacote");
  const [campos, setCampos] = useState({
    caixaId: envio.caixaDeEnvioId ?? "",
    pesoKg: String(envio.pesoKg ?? "").replace(".", ","),
    tipoDeDocumento: envio.tipoDeDocumento ?? (chaveDaNota ? "NFE" : "DECLARACAO"),
    chaveNfe: envio.chaveNfe ?? chaveDaNota ?? "",
  });
  const [erros, setErros] = useState({});
  const [conferido, setConferido] = useState(null);
  const [concluido, setConcluido] = useState(null);
  const [pendente, iniciar] = useTransition();
  const mudar = (campo, valor) => {
    setErros({});
    setCampos((atual) => ({ ...atual, [campo]: valor }));
  };
  const fechar = () => !pendente && aoFechar();

  function conferir(evento) {
    evento.preventDefault();
    iniciar(async () => {
      const resposta = await conferirPacoteAcao(envio.id, { ...campos, chaveNfe: campos.tipoDeDocumento === "NFE" ? campos.chaveNfe : null });
      if (!resposta?.ok) return setErros(resposta?.erros ?? { geral: resposta?.erro ?? "Não foi possível conferir." });
      setConferido(resposta);
      setPasso("confirmar");
    });
  }

  function comprar() {
    iniciar(async () => {
      const resposta = await comprarEtiquetaAcao(envio.id);
      if (!resposta?.ok) return setErros({ geral: resposta?.erro ?? "Não foi possível comprar a etiqueta." });
      setConcluido(resposta.envio);
    });
  }

  if (concluido) {
    return (
      <ConclusaoDoEnvio
        titulo="Etiqueta comprada"
        mensagem="Imprima a etiqueta e poste o pacote."
        linhas={[
          concluido.rastreio ? `Rastreio: ${concluido.rastreio}` : "O código de rastreio aparece na próxima consulta.",
          concluido.custo !== null && concluido.custo !== undefined ? `Custo: ${moeda.format(concluido.custo)}` : null,
          concluido.validoAte ? `Postar até ${new Date(concluido.validoAte).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : null,
        ].filter(Boolean)}
        aoFechar={aoConcluir}
      />
    );
  }

  const motivos = conferido?.motivos ?? [];
  const preco = conferido?.preco ?? envio.precoCotado;
  const saldo = conferido?.saldo ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-16" {...propsDoFundo(fechar)}>
      <section role="dialog" aria-modal="true" aria-label="Comprar etiqueta" className="w-full max-w-lg rounded-lg border border-borda bg-superficie shadow-2xl">
        <div className="flex items-center justify-between border-b border-borda px-4 py-3">
          <span className="font-semibold">Comprar etiqueta · {[envio.transportadoraNome, envio.servicoNome].filter(Boolean).join(" ")}</span>
          <button type="button" onClick={fechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={16} />
          </button>
        </div>

        {passo === "pacote" ? (
          <form onSubmit={conferir} className="space-y-4 p-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="text-sm font-semibold">
                Caixa
                <select
                  value={campos.caixaId}
                  onChange={(e) => mudar("caixaId", e.target.value)}
                  className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.caixaId)} bg-superficie`}
                >
                  {caixas.map((caixa) => (
                    <option key={caixa.id} value={caixa.id}>
                      {caixa.nome}
                    </option>
                  ))}
                </select>
                {erros.caixaId && <span className="mt-1 block text-[11px] font-normal text-red-700">{erros.caixaId}</span>}
              </label>
              <label className="text-sm font-semibold">
                Peso na balança (kg)
                <input
                  inputMode="decimal"
                  value={campos.pesoKg}
                  onChange={(e) => mudar("pesoKg", e.target.value.replace(/[^\d.,]/g, ""))}
                  className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.pesoKg)} tabular-nums`}
                />
                {erros.pesoKg && <span className="mt-1 block text-[11px] font-normal text-red-700">{erros.pesoKg}</span>}
              </label>
            </div>

            <fieldset>
              <legend className="text-sm font-semibold">Documento</legend>
              <div className="mt-1 grid grid-cols-2 gap-2">
                {[
                  ["NFE", "NF-e"],
                  ["DECLARACAO", "Declaração de conteúdo"],
                ].map(([valor, rotulo]) => (
                  <label
                    key={valor}
                    className={`cursor-pointer rounded border px-3 py-2 text-sm ${campos.tipoDeDocumento === valor ? "border-acento bg-acento/10 font-medium" : "border-borda hover:bg-fundo"}`}
                  >
                    <input type="radio" name="tipoDeDocumento" value={valor} checked={campos.tipoDeDocumento === valor} onChange={() => mudar("tipoDeDocumento", valor)} className="sr-only" />
                    {rotulo}
                  </label>
                ))}
              </div>
              {erros.tipoDeDocumento && <span className="mt-1 block text-[11px] text-red-700">{erros.tipoDeDocumento}</span>}
            </fieldset>

            {campos.tipoDeDocumento === "NFE" ? (
              <label className="block text-sm font-semibold">
                Chave da NF-e
                <input
                  inputMode="numeric"
                  value={campos.chaveNfe}
                  onChange={(e) => mudar("chaveNfe", e.target.value.replace(/\D/g, "").slice(0, 44))}
                  placeholder="44 dígitos"
                  className={`${CLASSE_CAMPO} ${bordaDoCampo(erros.chaveNfe)} font-mono text-sm tabular-nums`}
                />
                {erros.chaveNfe && <span className="mt-1 block text-[11px] font-normal text-red-700">{erros.chaveNfe}</span>}
              </label>
            ) : (
              <p className="text-sm text-suave">
                {(envio.itensDaDeclaracao ?? []).length} item(ns) do pedido vão na declaração. Imprima a declaração junto da etiqueta.
              </p>
            )}

            {erros.geral && (
              <p role="alert" className="text-sm text-red-600">
                {erros.geral}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-borda pt-4">
              <button type="button" onClick={fechar} className={`${BOTAO} border border-borda hover:bg-fundo`}>
                Cancelar
              </button>
              <button type="submit" disabled={pendente} className={`${BOTAO} bg-acento text-white hover:opacity-90`}>
                {pendente && <Loader2 size={14} className="animate-spin" />}
                Conferir preço
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4 p-4">
            {retomar ? (
              <p className="text-sm">A compra anterior parou no meio. Continuar retoma a mesma etiqueta, sem pagar de novo.</p>
            ) : (
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-suave">Prazo</dt>
                  <dd>{conferido?.envio?.prazoDias ? `${conferido.envio.prazoDias} dias úteis` : "—"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-suave">Valor da etiqueta</dt>
                  <dd className="font-semibold tabular-nums">{moeda.format(preco ?? 0)}</dd>
                </div>
                {saldo !== null && (
                  <>
                    <div className="flex justify-between gap-4">
                      <dt className="text-suave">Saldo na carteira</dt>
                      <dd className="tabular-nums">{moeda.format(saldo)}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-suave">Saldo depois</dt>
                      <dd className={`tabular-nums ${saldo - (preco ?? 0) < 0 ? "text-red-600" : ""}`}>{moeda.format(saldo - (preco ?? 0))}</dd>
                    </div>
                  </>
                )}
              </dl>
            )}
            {motivos.length > 0 && (
              <ul className="space-y-1 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                {motivos.map((motivo) => (
                  <li key={motivo}>{motivo}</li>
                ))}
              </ul>
            )}
            {erros.geral && (
              <p role="alert" className="text-sm text-red-600">
                {erros.geral}
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-borda pt-4">
              {!retomar && (
                <button type="button" onClick={() => setPasso("pacote")} disabled={pendente} className={`${BOTAO} border border-borda hover:bg-fundo`}>
                  Voltar
                </button>
              )}
              <button
                type="button"
                onClick={comprar}
                disabled={pendente || motivos.length > 0}
                title={motivos[0] ?? undefined}
                className={`${BOTAO} bg-acento text-white hover:opacity-90`}
              >
                {pendente && <Loader2 size={14} className="animate-spin" />}
                {retomar ? "Continuar a compra" : `Comprar por ${moeda.format(preco ?? 0)}`}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
