"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { excluirProgramaAcao, salvarProgramaAcao } from "@/app/ferramentas/licencas/acoes";
import Pergunta from "@/components/compras/Pergunta";
import EscolhaEntreOpcoes from "@/components/ui/EscolhaEntreOpcoes";

import { CLASSE_BOTAO, CLASSE_CAMPO, CLASSE_PRINCIPAL } from "./formato";
import Janela from "./Janela";

const IDENTIFICACOES = [
  { valor: "CHAVE", rotulo: "Chave" },
  { valor: "ARQUIVO", rotulo: "Arquivo" },
];

function Campo({ rotulo, erro, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-suave">{rotulo}</span>
      {children}
      {erro && <span className="mt-0.5 block text-xs text-red-600">{erro}</span>}
    </label>
  );
}

/** O formulario de um programa (novo quando `programa` e null). */
function FormularioDoPrograma({ programa, aoVoltar, aoAlterar }) {
  const router = useRouter();
  const [identificacao, setIdentificacao] = useState(programa?.identificacao ?? "CHAVE");
  const [erros, setErros] = useState({});
  const [ocupado, iniciar] = useTransition();

  function salvar(evento) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    dados.set("identificacao", identificacao);
    setErros({});
    iniciar(async () => {
      const resultado = await salvarProgramaAcao(dados);
      if (resultado?.ok) {
        router.refresh();
        aoVoltar();
      }
      else setErros(resultado?.erros ?? { geral: resultado?.erro ?? "Não foi possível salvar." });
    });
  }

  return (
    // Formulario sem estado controlado: qualquer `input` (que sobe ate aqui) marca alterado, para o "Sair sem salvar?".
    <form onSubmit={salvar} onInput={aoAlterar} onChange={aoAlterar} className="grid grid-cols-2 gap-x-4 gap-y-3">
      <input type="hidden" name="id" value={programa?.id ?? ""} />
      <Campo rotulo="Nome" erro={erros.nome} className="col-span-2">
        <input name="nome" required autoFocus defaultValue={programa?.nome ?? ""} className={CLASSE_CAMPO} />
      </Campo>
      <div>
        <span className="mb-1 block text-xs font-medium text-suave">A licença é</span>
        <EscolhaEntreOpcoes
          nome="identificacaoVisivel"
          rotulo="Como a licença se identifica"
          opcoes={IDENTIFICACOES}
          valor={identificacao}
          aoMudar={(valor) => {
            setIdentificacao(valor);
            aoAlterar();
          }}
        />
        {erros.identificacao && <span className="mt-0.5 block text-xs text-red-600">{erros.identificacao}</span>}
      </div>
      <label className="inline-flex items-center gap-2 self-end pb-1.5 text-sm">
        <input type="checkbox" name="temPortal" defaultChecked={programa?.temPortal ?? false} className="h-4 w-4 accent-acento" />
        Tem portal de licenças
      </label>
      <Campo rotulo="PCs por licença (vazio = sem limite)" erro={erros.ativacoesPermitidas}>
        <input name="ativacoesPermitidas" type="number" min={1} defaultValue={programa?.ativacoesPermitidas ?? ""} className={`${CLASSE_CAMPO} tabular-nums`} />
      </Campo>
      <Campo rotulo="Linhas de cliente de saída" erro={erros.linhasIniciais}>
        <input name="linhasIniciais" type="number" min={1} max={10} required defaultValue={programa?.linhasIniciais ?? 1} className={`${CLASSE_CAMPO} tabular-nums`} />
      </Campo>
      <Campo rotulo="Link do portal" className="col-span-2">
        <input name="linkPortal" type="url" defaultValue={programa?.linkPortal ?? ""} className={CLASSE_CAMPO} />
      </Campo>
      <Campo rotulo="Link do site" className="col-span-2">
        <input name="linkSite" type="url" defaultValue={programa?.linkSite ?? ""} className={CLASSE_CAMPO} />
      </Campo>
      <Campo rotulo={programa?.instrucoesNome ? `PDF de instruções (hoje: ${programa.instrucoesNome})` : "PDF de instruções (até 5 MB)"} erro={erros.instrucoes} className="col-span-2">
        <input name="instrucoes" type="file" accept="application/pdf,.pdf" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-borda file:bg-superficie file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-fundo" />
      </Campo>
      {programa?.instrucoesNome && (
        <label className="col-span-2 inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="apagarInstrucoes" className="h-4 w-4 accent-acento" />
          Tirar o PDF de instruções
        </label>
      )}
      <Campo rotulo="Ordem das abas" erro={erros.ordem}>
        <input name="ordem" type="number" defaultValue={programa?.ordem ?? 0} className={`${CLASSE_CAMPO} tabular-nums`} />
      </Campo>
      <label className="inline-flex items-center gap-2 self-end pb-1.5 text-sm">
        <input type="checkbox" name="ativo" defaultChecked={programa?.ativo ?? true} className="h-4 w-4 accent-acento" />
        Ativo (aparece nas abas)
      </label>
      {erros.geral && <p className="col-span-2 text-sm text-red-600">{erros.geral}</p>}
      <div className="col-span-2 flex justify-end gap-2 pt-1">
        <button type="button" onClick={aoVoltar} className="rounded-md px-3 py-1.5 text-sm text-suave transition-colors hover:bg-fundo hover:text-texto">
          Voltar
        </button>
        <button type="submit" disabled={ocupado} className={CLASSE_PRINCIPAL}>
          {ocupado ? "Salvando…" : "Salvar programa"}
        </button>
      </div>
    </form>
  );
}

/**
 * O cadastro dos programas (so quem edita): a lista com ✎ e o formulario. Programa com licencas nao sai (o botao diz
 * quantas tem); o sem licencas sai pelo popup.
 */
export default function JanelaProgramas({ programas, podeExcluir, aoFechar }) {
  const router = useRouter();
  const [editando, setEditando] = useState(undefined);
  const [alterado, setAlterado] = useState(false);
  const [excluindo, setExcluindo] = useState(null);
  const voltarParaALista = () => {
    setAlterado(false);
    setEditando(undefined);
  };
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();

  function excluir() {
    iniciar(async () => {
      const resultado = await excluirProgramaAcao(excluindo.id);
      setExcluindo(null);
      if (!resultado?.ok) setErro(resultado?.erro ?? "Não foi possível excluir.");
      else router.refresh();
    });
  }

  return (
    <Janela titulo={editando === undefined ? "Programas" : editando ? `Editar ${editando.nome}` : "Novo programa"} alterado={alterado} aoFechar={aoFechar} largura="max-w-xl">
      {editando !== undefined ? (
        <FormularioDoPrograma programa={editando} aoVoltar={voltarParaALista} aoAlterar={() => setAlterado(true)} />
      ) : (
        <div className="space-y-3">
          <ul className="divide-y divide-borda rounded-md border border-borda">
            {programas.map((programa) => (
              <li key={programa.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-medium ${programa.ativo ? "" : "text-suave"}`}>{programa.nome}</span>
                  <span className="text-xs text-suave">
                    {programa.identificacao === "CHAVE" ? "Chave" : "Arquivo"}
                    {programa.temPortal ? ", com portal" : ""}
                    {programa.ativo ? "" : ", inativo"}
                    {`, ${programa.totalLicencas === 1 ? "1 licença" : `${programa.totalLicencas} licenças`}`}
                  </span>
                </span>
                <button type="button" onClick={() => setEditando(programa)} aria-label={`Editar ${programa.nome}`} className="rounded p-1.5 text-suave transition-colors hover:bg-fundo hover:text-texto">
                  <Pencil size={14} />
                </button>
                {podeExcluir && (
                  <button
                    type="button"
                    disabled={programa.totalLicencas > 0}
                    title={programa.totalLicencas > 0 ? `Este programa tem ${programa.totalLicencas} licença(s)` : `Excluir ${programa.nome}`}
                    aria-label={`Excluir ${programa.nome}`}
                    onClick={() => setExcluindo(programa)}
                    className="rounded p-1.5 text-suave transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-suave"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
          <button type="button" onClick={() => setEditando(null)} className={CLASSE_BOTAO}>
            <Plus size={14} aria-hidden="true" /> Novo programa
          </button>
        </div>
      )}

      {excluindo && (
        <Pergunta titulo={`Excluir o programa ${excluindo.nome}?`} confirmar="Excluir" destrutiva ocupado={ocupado} aoRecuar={() => setExcluindo(null)} aoConfirmar={excluir}>
          Ele não tem licenças. Sai do Rise junto com o histórico de leituras do portal dele.
        </Pergunta>
      )}
    </Janela>
  );
}
