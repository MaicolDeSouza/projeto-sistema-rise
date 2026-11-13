"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Plus, Trash2, X } from "lucide-react";

import { excluirPadraoAcao, salvarPadraoAcao } from "@/app/propostas/acoes-padroes";
import Pergunta from "@/components/compras/Pergunta";
import { propsDoFundo } from "@/lib/fundoDaJanela";
import { FORMAS_DE_PAGAMENTO, TEXTO_DO_FRETE, linhasDasExigencias } from "@/lib/propostas/regras";
import { campo, Rotulo } from "./CartaoCliente";

const VAZIO = {
  nome: "",
  ativo: true,
  validadeDias: "15",
  formaPagamento: "",
  pagamentoTexto: "",
  fretePorConta: "A_COMBINAR",
  garantia: "",
  observacoesCliente: "",
  exigeMarcaModelo: false,
  exigencias: "",
};

const paraFormulario = (padrao) =>
  Object.fromEntries(Object.entries(VAZIO).map(([chave, vazio]) => [chave, padrao[chave] === null || padrao[chave] === undefined ? vazio : typeof vazio === "string" ? String(padrao[chave]) : padrao[chave]]));

const COLUNAS = [
  { chave: "nome", rotulo: "Nome", valor: (p) => p.nome.toLocaleLowerCase("pt-BR") },
  { chave: "validadeDias", rotulo: "Validade", valor: (p) => p.validadeDias, direita: true },
  { chave: "pagamento", rotulo: "Pagamento", valor: (p) => (p.formaPagamento ?? "").toLocaleLowerCase("pt-BR") },
  { chave: "frete", rotulo: "Frete", valor: (p) => p.fretePorConta },
  { chave: "marca", rotulo: "Marca / Modelo", valor: (p) => (p.exigeMarcaModelo ? 1 : 0) },
  { chave: "exigencias", rotulo: "Exigências", valor: (p) => linhasDasExigencias(p.exigencias).length, direita: true },
  { chave: "clientes", rotulo: "Clientes", valor: (p) => p.clientes, direita: true },
  { chave: "ativo", rotulo: "Situação", valor: (p) => (p.ativo ? 0 : 1) },
];

/** A janela do padrao: os campos que ele copia para a proposta e as exigencias do cliente (so na tela). */
function JanelaPadrao({ padrao, podeEditar, aoFechar, aoSalvo }) {
  const [formulario, setFormulario] = useState(() => paraFormulario(padrao ?? VAZIO));
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState(null);
  const [excluir, setExcluir] = useState(false);
  const [sair, setSair] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const inicial = useMemo(() => JSON.stringify(paraFormulario(padrao ?? VAZIO)), [padrao]);
  const alterado = JSON.stringify(formulario) !== inicial;
  const mudar = (chave, valor) => setFormulario((antes) => ({ ...antes, [chave]: valor }));
  const fechar = () => (alterado ? setSair(true) : aoFechar());

  useEffect(() => {
    const aoTeclar = (evento) => {
      if (evento.key === "Escape" && !excluir && !sair) fechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  });

  const salvar = () =>
    iniciar(async () => {
      const resposta = await salvarPadraoAcao(padrao?.id ?? null, formulario);
      if (!resposta?.ok) {
        setErros(resposta?.erros ?? {});
        return setErro(resposta?.erros ? "Confira os campos marcados." : resposta?.erro ?? "Não foi possível salvar.");
      }
      aoSalvo(resposta.padroes);
    });
  const apagar = () =>
    iniciar(async () => {
      const resposta = await excluirPadraoAcao(padrao.id);
      setExcluir(false);
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível excluir.");
      aoSalvo(resposta.padroes);
    });

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" {...propsDoFundo(fechar)}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-padrao" className="w-full max-w-3xl rounded-lg bg-superficie shadow-xl">
        <div className="flex items-center justify-between border-b border-borda px-5 py-3">
          <h2 id="titulo-padrao" className="text-lg font-semibold">{padrao ? padrao.nome : "Novo padrão"}</h2>
          <button type="button" onClick={fechar} aria-label="Fechar" className="rounded p-1.5 text-suave hover:bg-fundo hover:text-texto">
            <X size={18} />
          </button>
        </div>
        <fieldset disabled={!podeEditar} className="m-0 grid gap-4 border-0 p-5 md:grid-cols-6">
          <Rotulo texto="Nome" erro={erros.nome} className="md:col-span-3">
            <input value={formulario.nome} aria-invalid={Boolean(erros.nome)} onChange={(e) => mudar("nome", e.target.value)} className={campo} placeholder="SENAI, Instituto Federal..." />
          </Rotulo>
          <Rotulo texto="Validade (dias)" erro={erros.validadeDias}>
            <input inputMode="numeric" value={formulario.validadeDias} aria-invalid={Boolean(erros.validadeDias)} onChange={(e) => mudar("validadeDias", e.target.value.replace(/\D/g, "").slice(0, 3))} className={`${campo} text-right tabular-nums`} />
          </Rotulo>
          <Rotulo texto="Frete" className="md:col-span-2">
            <select value={formulario.fretePorConta} onChange={(e) => mudar("fretePorConta", e.target.value)} className={campo}>
              {Object.entries(TEXTO_DO_FRETE).map(([valor, texto]) => (
                <option key={valor} value={valor}>{texto}</option>
              ))}
            </select>
          </Rotulo>
          <Rotulo texto="Forma de pagamento" erro={erros.formaPagamento} className="md:col-span-2">
            <select value={formulario.formaPagamento} onChange={(e) => mudar("formaPagamento", e.target.value)} className={campo}>
              <option value="">Não define</option>
              {FORMAS_DE_PAGAMENTO.map((forma) => (
                <option key={forma}>{forma}</option>
              ))}
            </select>
          </Rotulo>
          <Rotulo texto="Condição de pagamento (sai no PDF)" className="md:col-span-4">
            <input value={formulario.pagamentoTexto} onChange={(e) => mudar("pagamentoTexto", e.target.value)} className={campo} placeholder="Ex.: depósito, 15 dias da entrega" />
          </Rotulo>
          <Rotulo texto="Garantia (sai no PDF)" className="md:col-span-3">
            <textarea rows={2} value={formulario.garantia} onChange={(e) => mudar("garantia", e.target.value)} className={`${campo} resize-y`} />
          </Rotulo>
          <Rotulo texto="Observações ao cliente (saem no PDF)" className="md:col-span-3">
            <textarea rows={2} value={formulario.observacoesCliente} onChange={(e) => mudar("observacoesCliente", e.target.value)} className={`${campo} resize-y`} />
          </Rotulo>
          <Rotulo texto="Exigências do cliente (uma por linha; só na tela da proposta, nunca no PDF)" className="md:col-span-6">
            <textarea rows={8} value={formulario.exigencias} onChange={(e) => mudar("exigencias", e.target.value)} className={`${campo} resize-y font-mono text-xs`} />
          </Rotulo>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 md:col-span-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={formulario.exigeMarcaModelo} onChange={(e) => mudar("exigeMarcaModelo", e.target.checked)} className="h-4 w-4 accent-acento" />
              Exige marca e modelo de cada item
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={formulario.ativo} onChange={(e) => mudar("ativo", e.target.checked)} className="h-4 w-4 accent-acento" />
              Ativo
            </label>
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-2 border-t border-borda px-5 py-3">
          {podeEditar && (
            <button type="button" onClick={salvar} disabled={ocupado} className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {ocupado && <Loader2 size={14} className="animate-spin" />} Salvar
            </button>
          )}
          <button type="button" onClick={fechar} className="rounded border border-borda px-4 py-2 text-sm hover:bg-fundo">
            {podeEditar ? "Cancelar" : "Fechar"}
          </button>
          {erro && <span className="text-sm text-rose-600" role="alert">{erro}</span>}
          {podeEditar && padrao && (
            <button
              type="button"
              onClick={() => setExcluir(true)}
              disabled={ocupado || padrao.clientes > 0}
              title={padrao.clientes > 0 ? `É o padrão de ${padrao.clientes} cliente(s): desative em vez de excluir.` : "Excluir o padrão"}
              className="ml-auto inline-flex items-center gap-1 rounded px-2.5 py-2 text-sm text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={15} /> Excluir
            </button>
          )}
        </div>
      </div>
      {excluir && (
        <Pergunta titulo="Excluir o padrão?" confirmar="Excluir" destrutiva ocupado={ocupado} aoRecuar={() => setExcluir(false)} aoConfirmar={apagar}>
          {padrao.nome}. As propostas já feitas com ele não mudam.
        </Pergunta>
      )}
      {sair && (
        <Pergunta titulo="Sair sem salvar?" confirmar="Sair sem salvar" recuar="Continuar editando" destrutiva aoRecuar={() => setSair(false)} aoConfirmar={aoFechar}>
          As alterações deste padrão ainda não foram salvas e serão perdidas.
        </Pergunta>
      )}
    </div>
  );
}

/**
 * A lista dos padroes de proposta (13/11/2026). Clicar na linha abre o padrao; cada coluna ordena (nada -> crescente
 * -> decrescente), em memoria: sao poucos padroes.
 */
export default function PadroesDeProposta({ padroesIniciais, podeEditar }) {
  const [padroes, setPadroes] = useState(padroesIniciais);
  const [aberto, setAberto] = useState(null);
  const [ordem, setOrdem] = useState({ chave: null, direcao: "asc" });

  const linhas = useMemo(() => {
    const coluna = COLUNAS.find((c) => c.chave === ordem.chave);
    if (!coluna) return padroes;
    const sinal = ordem.direcao === "desc" ? -1 : 1;
    return [...padroes].sort((a, b) => {
      const [x, y] = [coluna.valor(a), coluna.valor(b)];
      return (typeof x === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR")) * sinal;
    });
  }, [padroes, ordem]);

  const ordenar = (chave) =>
    setOrdem((antes) => (antes.chave !== chave ? { chave, direcao: "asc" } : antes.direcao === "asc" ? { chave, direcao: "desc" } : { chave: null, direcao: "asc" }));

  return (
    <>
      {podeEditar && (
        <div className="mb-3 flex justify-end">
          <button type="button" onClick={() => setAberto("novo")} className="inline-flex items-center gap-1.5 rounded-md bg-acento px-3.5 py-2 text-sm font-semibold text-white hover:bg-acento/90">
            <Plus size={16} /> Novo padrão
          </button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
        <table className="w-full text-sm">
          <thead className="border-b border-borda text-left text-xs text-suave">
            <tr>
              {COLUNAS.map((coluna) => {
                const ativa = ordem.chave === coluna.chave;
                const Icone = !ativa ? ArrowUpDown : ordem.direcao === "asc" ? ArrowUp : ArrowDown;
                return (
                  <th key={coluna.chave} className={`px-3 py-2.5 font-medium ${coluna.direita ? "text-right" : ""}`} aria-sort={ativa ? (ordem.direcao === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" onClick={() => ordenar(coluna.chave)} className="inline-flex items-center gap-1 hover:text-texto">
                      {coluna.rotulo} <Icone size={12} className={ativa ? "text-acento" : "opacity-50"} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {linhas.length === 0 && (
              <tr>
                <td colSpan={COLUNAS.length} className="px-3 py-6 text-center text-suave">Nenhum padrão.</td>
              </tr>
            )}
            {linhas.map((p) => (
              <tr key={p.id} onClick={() => setAberto(p.id)} className={`cursor-pointer hover:bg-fundo ${p.ativo ? "" : "text-suave"}`}>
                <td className="px-3 py-2.5 font-medium">{p.nome}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.validadeDias} dias</td>
                <td className="max-w-xs truncate px-3 py-2.5" title={p.pagamentoTexto ?? ""}>{[p.formaPagamento, p.pagamentoTexto].filter(Boolean).join(" · ") || "—"}</td>
                <td className="px-3 py-2.5">{p.fretePorConta === "A_COMBINAR" ? "A combinar" : p.fretePorConta === "RETIRA" ? "Retira" : p.fretePorConta}</td>
                <td className="px-3 py-2.5">{p.exigeMarcaModelo ? "Exige" : "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{linhasDasExigencias(p.exigencias).length || "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.clientes}</td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${p.ativo ? "bg-emerald-500" : "bg-zinc-400"}`} /> {p.ativo ? "Ativo" : "Inativo"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {aberto && (
        <JanelaPadrao
          padrao={aberto === "novo" ? null : padroes.find((p) => p.id === aberto)}
          podeEditar={podeEditar}
          aoFechar={() => setAberto(null)}
          aoSalvo={(lista) => {
            setPadroes(lista);
            setAberto(null);
          }}
        />
      )}
    </>
  );
}
