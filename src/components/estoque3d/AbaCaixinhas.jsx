"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { excluirModeloAcao, salvarModeloAcao } from "@/app/estoque/mapa/acoes";
import PopupExclusao from "@/components/cadastros/PopupExclusao";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";

import { CampoDaJanela, Coluna, JanelaDeFormulario, cm, useOrdemDaTabela } from "./Pecas";

const NOVO = { id: null, nome: "", cor: "#2f5d8a", larguraCm: "", alturaCm: "", profundidadeCm: "", fatorUtil: 0.7, pesoVazioKg: "", ativo: true };

/**
 * Aba Caixinhas do Mapa do estoque: os modelos de caixinha plastica. Linha-guia: o operador ve primeiro os modelos com as
 * medidas e em quantos produtos cada um esta; a acao principal e "Novo modelo".
 */
export default function AbaCaixinhas({ modelos, podeEditar }) {
  const router = useRouter();
  const [janela, setJanela] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [erro, setErro] = useState(null);
  const [pendente, iniciar] = useTransition();
  const { ordenadas, cabecalho } = useOrdemDaTabela(modelos);
  const motivoSemEdicao = podeEditar ? undefined : "Sem permissão para editar o Mapa do estoque.";

  function executar(acao, depois) {
    setErro(null);
    iniciar(async () => {
      const resultado = await acao();
      if (!resultado?.ok) return setErro(resultado?.erro ?? "Não foi possível salvar.");
      depois?.();
      router.refresh();
    });
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          disabled={!podeEditar}
          title={motivoSemEdicao}
          onClick={() => {
            setErro(null);
            setJanela(NOVO);
          }}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Plus size={15} /> Novo modelo
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
        <table className="w-full text-sm">
          <thead className="border-b border-borda text-left text-xs text-suave">
            <tr>
              <Coluna cabecalho={cabecalho} campo="nome" rotulo="Modelo" />
              <Coluna cabecalho={cabecalho} campo="larguraCm" rotulo="Largura (cm)" className="text-right" />
              <Coluna cabecalho={cabecalho} campo="alturaCm" rotulo="Altura (cm)" className="text-right" />
              <Coluna cabecalho={cabecalho} campo="profundidadeCm" rotulo="Profund. (cm)" className="text-right" />
              <Coluna cabecalho={cabecalho} campo="fatorUtil" rotulo="Volume útil" className="text-right" />
              <Coluna cabecalho={cabecalho} campo="pesoVazioKg" rotulo="Peso vazia (kg)" className="text-right" />
              <Coluna cabecalho={cabecalho} campo="produtos" rotulo="Produtos" className="text-right" />
              <th className="w-20 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((modelo) => (
              <tr key={modelo.id} className={`border-b border-borda last:border-0 ${modelo.ativo ? "" : "text-suave"}`}>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span className="h-4 w-4 shrink-0 rounded-sm border border-borda" style={{ background: modelo.cor }} />
                    {modelo.nome}
                    {!modelo.ativo && <span className="rounded border border-borda px-1.5 text-[11px] font-normal">inativo</span>}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{cm(modelo.larguraCm)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{cm(modelo.alturaCm)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{cm(modelo.profundidadeCm)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Math.round(modelo.fatorUtil * 100)}%</td>
                <td className="px-3 py-2 text-right tabular-nums">{cm(modelo.pesoVazioKg)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{modelo.produtos}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      disabled={!podeEditar}
                      title={motivoSemEdicao ?? "Editar"}
                      aria-label={`Editar o modelo ${modelo.nome}`}
                      onClick={() => {
                        setErro(null);
                        setJanela(modelo);
                      }}
                      className="rounded p-1.5 text-suave hover:bg-fundo disabled:opacity-40"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={!podeEditar || modelo.produtos > 0}
                      title={motivoSemEdicao ?? (modelo.produtos > 0 ? `Está em ${modelo.produtos} produto(s): não pode ser excluído.` : "Excluir")}
                      aria-label={`Excluir o modelo ${modelo.nome}`}
                      onClick={() => {
                        setErro(null);
                        setExcluindo(modelo);
                      }}
                      className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:text-suave disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {ordenadas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-suave">
                  Nenhum modelo de caixinha cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {janela && (
        <JanelaDeFormulario
          titulo={janela.id ? janela.nome : "Novo modelo de caixinha"}
          erro={erro}
          pendente={pendente}
          aoFechar={() => setJanela(null)}
          aoSalvar={(dados) => executar(() => salvarModeloAcao(janela.id, { ...dados, fatorUtil: Number(dados.fatorUtil) / 100, ativo: dados.ativo === "on" }), () => setJanela(null))}
        >
          <CampoDaJanela nome="nome" rotulo="Nome" defaultValue={janela.nome} maxLength={60} required autoFocus={!janela.id} />
          <CampoDaJanela rotulo="Cor no desenho">
            <input type="color" name="cor" defaultValue={janela.cor} className="mt-1 block h-9 w-full cursor-pointer rounded border border-borda" />
          </CampoDaJanela>
          <CampoDaJanela nome="larguraCm" rotulo="Largura (cm)" type="number" step="0.1" min={0} defaultValue={janela.larguraCm} required />
          <CampoDaJanela nome="alturaCm" rotulo="Altura (cm)" type="number" step="0.1" min={0} defaultValue={janela.alturaCm} required />
          <CampoDaJanela nome="profundidadeCm" rotulo="Profundidade (cm)" type="number" step="0.1" min={0} defaultValue={janela.profundidadeCm} required />
          <CampoDaJanela nome="pesoVazioKg" rotulo="Peso vazia (kg)" type="number" step="0.001" min={0} defaultValue={janela.pesoVazioKg ?? ""} />
          <CampoDaJanela
            nome="fatorUtil"
            rotulo={
              <span className="inline-flex items-center gap-1">
                Volume útil (%)
                <BolhaDeAjuda variante="inline" texto="A caixinha é afunilada e tem a boca rebaixada: quanto do volume de fora serve para guardar peça. 70% é o usual." />
              </span>
            }
            type="number"
            min={10}
            max={100}
            defaultValue={Math.round((janela.fatorUtil ?? 0.7) * 100)}
            required
          />
          <label className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="ativo" defaultChecked={janela.ativo} /> Ativo
          </label>
        </JanelaDeFormulario>
      )}

      {excluindo && (
        <PopupExclusao
          titulo="Excluir modelo de caixinha"
          nome={excluindo.nome}
          erro={erro}
          pendente={pendente}
          aoCancelar={() => setExcluindo(null)}
          aoConfirmar={() => executar(() => excluirModeloAcao(excluindo.id), () => setExcluindo(null))}
        />
      )}
    </>
  );
}
