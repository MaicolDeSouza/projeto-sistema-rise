"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Search, X } from "lucide-react";

import { aprovarConhecimentoAcao, criarConhecimentoAcao, editarConhecimentoAcao, rejeitarConhecimentoAcao } from "@/app/rise-ai/revisao/acoes";
import Janela from "./Janela";

const campo = "w-full rounded-md border border-borda bg-superficie px-2 py-1.5 text-sm";

const STATUS = {
  APROVADO: { rotulo: "aprovado", classe: "bg-emerald-100 text-emerald-800" },
  RASCUNHO: { rotulo: "rascunho", classe: "bg-amber-100 text-amber-800" },
  REJEITADO: { rotulo: "rejeitado", classe: "bg-red-100 text-red-800" },
};

const semAcento = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** O formulário de uma nota, em janela: "Novo conhecimento" (sem `nota`) ou editar. */
function FormularioDaNota({ nota, aoFechar }) {
  const router = useRouter();
  const [assunto, setAssunto] = useState(nota?.assunto ?? "");
  const [conteudo, setConteudo] = useState(nota?.conteudo ?? "");
  const [produtos, setProdutos] = useState(nota?.produtos.join(", ") ?? "");
  const [fonte, setFonte] = useState(nota?.fonte ?? "");
  const [categoria, setCategoria] = useState(nota?.categoria ?? "");
  const [visibilidade, setVisibilidade] = useState(nota?.visibilidade ?? "ADMIN");
  const [aprovar, setAprovar] = useState(true);
  const [erro, setErro] = useState(null);
  const [pendente, iniciar] = useTransition();

  function salvar(evento) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("assunto", assunto);
    dados.set("conteudo", conteudo);
    dados.set("produtos", produtos);
    dados.set("fonte", fonte);
    dados.set("categoria", categoria);
    dados.set("visibilidade", visibilidade);
    if (!nota && aprovar) dados.set("aprovar", "on");
    iniciar(async () => {
      const resultado = nota ? await editarConhecimentoAcao(nota.id, dados) : await criarConhecimentoAcao(dados);
      if (!resultado.ok) return setErro(resultado.erro);
      aoFechar();
      router.refresh();
    });
  }

  return (
    <Janela titulo={nota ? "Editar conhecimento" : "Novo conhecimento"} aoFechar={aoFechar} largura="max-w-xl">
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <label className="text-xs font-medium">
          Assunto
          <input autoFocus value={assunto} onChange={(evento) => setAssunto(evento.target.value)} maxLength={120} className={`${campo} mt-1 font-normal`} placeholder="Ex.: Arduino para ligar LED" />
        </label>
        <label className="text-xs font-medium">
          O que o assistente deve saber
          <textarea value={conteudo} onChange={(evento) => setConteudo(evento.target.value)} rows={5} maxLength={4000} className={`${campo} mt-1 font-normal`} placeholder="Escreva como uma regra: quando perguntarem X, responda Y." />
        </label>
        <label className="text-xs font-medium">
          Produtos ligados (códigos, separados por vírgula)
          <input value={produtos} onChange={(evento) => setProdutos(evento.target.value)} className={`${campo} mt-1 font-normal`} placeholder="100101, 100105" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium">
            Fonte (opcional)
            <input value={fonte} onChange={(evento) => setFonte(evento.target.value)} className={`${campo} mt-1 font-normal`} />
          </label>
          <label className="text-xs font-medium">
            Categoria (opcional)
            <input value={categoria} onChange={(evento) => setCategoria(evento.target.value)} className={`${campo} mt-1 font-normal`} />
          </label>
        </div>
        <label className="text-xs font-medium">
          Quem pode ver na resposta
          <select value={visibilidade} onChange={(evento) => setVisibilidade(evento.target.value)} className={`${campo} mt-1 font-normal`}>
            <option value="ADMIN">Só a equipe (assistente interno)</option>
            <option value="PUBLICO">Também o assistente público</option>
          </select>
        </label>
        {!nota && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={aprovar} onChange={(evento) => setAprovar(evento.target.checked)} />
            Aprovar ao salvar (já vale nas próximas respostas). Desmarcado, fica como rascunho.
          </label>
        )}
        {nota?.status === "APROVADO" && <p className="text-xs text-suave">Esta nota já vale nas respostas: ao salvar, a edição vale na hora e fica no seu nome.</p>}
        {erro && <p className="text-xs text-red-700">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={aoFechar} className="rounded-md border border-borda px-3 py-1.5 text-sm text-suave hover:bg-fundo">
            Cancelar
          </button>
          <button type="submit" disabled={pendente || !assunto.trim() || !conteudo.trim()} className="rounded-md bg-acento px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
            Salvar
          </button>
        </div>
      </form>
    </Janela>
  );
}

/**
 * A aba "Conhecimento": tudo o que o assistente aprendeu, com busca e filtro por situação. Só nota APROVADA entra
 * numa resposta. Editar sobe a versão; rejeitar tira a nota das respostas (e dá para aprovar de novo).
 *
 * @param {{ notas: object[] }} props  `conhecimentoParaTela`
 */
export default function ConhecimentoLista({ notas }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("TODAS");
  const [janela, setJanela] = useState(null); // null | "novo" | { editar: nota }
  const [erro, setErro] = useState(null);
  const [pendente, iniciar] = useTransition();

  const termo = semAcento(busca.trim());
  const mostradas = notas.filter((nota) => (situacao === "TODAS" || nota.status === situacao) && (!termo || semAcento(`${nota.assunto} ${nota.conteudo} ${nota.produtos.join(" ")}`).includes(termo)));

  function mudar(acao, id) {
    setErro(null);
    iniciar(async () => {
      const resultado = await acao(id);
      if (!resultado.ok) return setErro(resultado.erro);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-suave" />
          <input type="search" value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Pesquisar no conhecimento…" aria-label="Pesquisar no conhecimento" className="w-full rounded-md border border-borda bg-fundo py-1.5 pr-2 pl-8 text-sm" />
        </div>
        <select value={situacao} onChange={(evento) => setSituacao(evento.target.value)} aria-label="Situação" className="rounded-md border border-borda bg-fundo px-2 py-1.5 text-sm">
          <option value="TODAS">Todas</option>
          <option value="APROVADO">Aprovadas</option>
          <option value="RASCUNHO">Rascunhos</option>
          <option value="REJEITADO">Rejeitadas</option>
        </select>
        <button type="button" onClick={() => setJanela("novo")} className="inline-flex items-center gap-1.5 rounded-md bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
          <Plus size={14} /> Novo conhecimento
        </button>
      </div>
      {erro && <p className="text-xs text-red-700">{erro}</p>}

      {mostradas.length === 0 && <p className="rounded-lg border border-dashed border-borda p-6 text-center text-sm text-suave">{notas.length === 0 ? "O assistente ainda não aprendeu nada. Aprove uma sugestão ou escreva um novo conhecimento." : "Nenhuma nota encontrada."}</p>}

      <ul className="flex flex-col gap-2">
        {mostradas.map((nota) => (
          <li key={nota.id} className="rounded-lg border border-borda bg-fundo p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {nota.assunto}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-normal ${STATUS[nota.status].classe}`}>{STATUS[nota.status].rotulo}</span>
                  {nota.visibilidade === "PUBLICO" && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-normal text-sky-800">público</span>}
                </p>
                <p className="mt-1 text-sm whitespace-pre-line text-suave">{nota.conteudo}</p>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-suave">
                  {nota.produtos.length > 0 && <span>Produtos: {nota.produtos.join(", ")}</span>}
                  {nota.fonte && <span>Fonte: {nota.fonte}</span>}
                  <span>
                    {nota.aprovadoPor ? `aprovado por ${nota.aprovadoPor}` : `criado por ${nota.criadoPor}`} · versão {nota.versao}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => setJanela({ editar: nota })} className="rounded-md p-1.5 text-suave hover:bg-superficie hover:text-texto" title="Editar" aria-label={`Editar ${nota.assunto}`}>
                  <Pencil size={15} />
                </button>
                {nota.status !== "APROVADO" && (
                  <button type="button" disabled={pendente} onClick={() => mudar(aprovarConhecimentoAcao, nota.id)} className="rounded-md p-1.5 text-suave hover:bg-superficie hover:text-emerald-700" title="Aprovar" aria-label={`Aprovar ${nota.assunto}`}>
                    <Check size={15} />
                  </button>
                )}
                {nota.status !== "REJEITADO" && (
                  <button type="button" disabled={pendente} onClick={() => mudar(rejeitarConhecimentoAcao, nota.id)} className="rounded-md p-1.5 text-suave hover:bg-superficie hover:text-red-700" title="Rejeitar: a nota deixa de valer nas respostas" aria-label={`Rejeitar ${nota.assunto}`}>
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {janela === "novo" && <FormularioDaNota aoFechar={() => setJanela(null)} />}
      {janela?.editar && <FormularioDaNota key={janela.editar.id} nota={janela.editar} aoFechar={() => setJanela(null)} />}
    </div>
  );
}
