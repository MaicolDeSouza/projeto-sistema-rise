"use client";

import { Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { criarColunasPelaLocalizacaoAcao, excluirColunaAcao, salvarColunaAcao, salvarLocalAcao } from "@/app/estoque/mapa/acoes";
import PopupExclusao from "@/components/cadastros/PopupExclusao";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";

import { CLASSE_DO_CAMPO, CampoDaJanela, Coluna, JanelaDeFormulario, cm, useOrdemDaTabela } from "./Pecas";

/**
 * Aba Colunas do Mapa do estoque. Linha-guia: o operador ve primeiro as colunas de cada estoque e quantos produtos ha em
 * cada uma; a acao principal e "Nova coluna". "Criar pela Localização" faz o primeiro cadastro do Estoque 1 sozinho.
 */
export default function AbaColunas({ locais, colunas, semColuna, podeEditar }) {
  const router = useRouter();
  const [janela, setJanela] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [erro, setErro] = useState(null);
  const [recado, setRecado] = useState(null);
  const [pendente, iniciar] = useTransition();
  const nomeDoLocal = new Map(locais.map((local) => [local.id, local.nome]));
  const linhas = colunas.map((coluna) => ({ ...coluna, estoque: nomeDoLocal.get(coluna.localId) ?? "" }));
  const { ordenadas, cabecalho } = useOrdemDaTabela(linhas);

  function executar(acao, depois) {
    setErro(null);
    iniciar(async () => {
      const resultado = await acao();
      if (!resultado?.ok) return setErro(resultado?.erro ?? "Não foi possível salvar.");
      depois?.(resultado);
      router.refresh();
    });
  }

  const motivoSemEdicao = podeEditar ? undefined : "Sem permissão para editar o Mapa do estoque.";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {locais.map((local) => (
            <label key={local.id} className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={local.primeiraEmbaixo}
                disabled={!podeEditar || pendente}
                title={motivoSemEdicao}
                onChange={(evento) => executar(() => salvarLocalAcao(local.id, { primeiraEmbaixo: evento.target.checked }))}
              />
              {local.nome}: a prateleira 1 é a de baixo
            </label>
          ))}
          <BolhaDeAjuda variante="inline" texto="Desmarcado, a prateleira 1 é a de cima e os números crescem para baixo." />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {semColuna.length > 0 && (
            <button
              type="button"
              disabled={!podeEditar || pendente}
              title={motivoSemEdicao ?? `Cria no Estoque 1 as colunas ${semColuna.map((item) => item.letra).join(", ")}, usadas na Localização dos produtos.`}
              onClick={() => executar(criarColunasPelaLocalizacaoAcao, (resultado) => setRecado(`${resultado.criadas} coluna(s) criada(s) no Estoque 1.`))}
              className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-2 text-sm hover:bg-fundo disabled:opacity-50"
            >
              <Wand2 size={15} /> Criar {semColuna.length} pela Localização
            </button>
          )}
          <button
            type="button"
            disabled={!podeEditar}
            title={motivoSemEdicao}
            onClick={() => {
              setErro(null);
              setJanela({ id: null, localId: locais[0]?.id, letra: "", ordem: colunas.length + 1, prateleiras: 5 });
            }}
            className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Plus size={15} /> Nova coluna
          </button>
        </div>
      </div>
      {recado && <p className="mb-2 text-sm text-emerald-700">{recado}</p>}
      {erro && !janela && !excluindo && <p className="mb-2 text-sm text-red-700">{erro}</p>}

      <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
        <table className="w-full text-sm">
          <thead className="border-b border-borda text-left text-xs text-suave">
            <tr>
              <Coluna cabecalho={cabecalho} campo="letra" rotulo="Coluna" />
              <Coluna cabecalho={cabecalho} campo="estoque" rotulo="Estoque" />
              <Coluna cabecalho={cabecalho} campo="ordem" rotulo="Ordem" className="text-right" />
              <Coluna cabecalho={cabecalho} campo="prateleiras" rotulo="Prateleiras" className="text-right" />
              <Coluna cabecalho={cabecalho} campo="larguraCm" rotulo="Largura (cm)" className="text-right" />
              <Coluna cabecalho={cabecalho} campo="profundidadeCm" rotulo="Profund. (cm)" className="text-right" />
              <Coluna cabecalho={cabecalho} campo="alturaLivreCm" rotulo="Altura livre (cm)" className="text-right" />
              <Coluna cabecalho={cabecalho} campo="pesoMaximoKg" rotulo="Peso máx. (kg)" className="text-right" />
              <Coluna cabecalho={cabecalho} campo="produtos" rotulo="Produtos" className="text-right" />
              <th className="w-20 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {ordenadas.map((coluna) => (
              <tr key={coluna.id} className="border-b border-borda last:border-0">
                <td className="px-3 py-2 font-semibold">{coluna.letra}</td>
                <td className="px-3 py-2">{coluna.estoque}</td>
                <td className="px-3 py-2 text-right tabular-nums">{coluna.ordem}</td>
                <td className="px-3 py-2 text-right tabular-nums">{coluna.prateleiras}</td>
                <td className="px-3 py-2 text-right tabular-nums">{cm(coluna.larguraCm)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{cm(coluna.profundidadeCm)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{cm(coluna.alturaLivreCm)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{cm(coluna.pesoMaximoKg)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{coluna.produtos}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      disabled={!podeEditar}
                      title={motivoSemEdicao ?? "Editar"}
                      aria-label={`Editar a coluna ${coluna.letra}`}
                      onClick={() => {
                        setErro(null);
                        setJanela(coluna);
                      }}
                      className="rounded p-1.5 text-suave hover:bg-fundo disabled:opacity-40"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={!podeEditar || coluna.produtos > 0}
                      title={motivoSemEdicao ?? (coluna.produtos > 0 ? `Tem ${coluna.produtos} produto(s): não pode ser excluída.` : "Excluir")}
                      aria-label={`Excluir a coluna ${coluna.letra}`}
                      onClick={() => {
                        setErro(null);
                        setExcluindo(coluna);
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
                <td colSpan={10} className="px-3 py-10 text-center text-suave">
                  Nenhuma coluna cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {janela && (
        <JanelaDeFormulario
          titulo={janela.id ? `Coluna ${janela.letra}` : "Nova coluna"}
          erro={erro}
          pendente={pendente}
          aoFechar={() => setJanela(null)}
          aoSalvar={(dados) => executar(() => salvarColunaAcao(janela.id, dados), () => setJanela(null))}
        >
          <CampoDaJanela nome="letra" rotulo="Letra" defaultValue={janela.letra} maxLength={2} required autoFocus={!janela.id} />
          <CampoDaJanela rotulo="Estoque">
            <select name="localId" defaultValue={janela.localId} className={CLASSE_DO_CAMPO}>
              {locais.map((local) => (
                <option key={local.id} value={local.id}>
                  {local.nome}
                </option>
              ))}
            </select>
          </CampoDaJanela>
          <CampoDaJanela nome="ordem" rotulo="Ordem na parede" type="number" min={0} defaultValue={janela.ordem} required />
          <CampoDaJanela nome="prateleiras" rotulo="Prateleiras" type="number" min={1} max={40} defaultValue={janela.prateleiras} required />
          <CampoDaJanela nome="larguraCm" rotulo="Largura do vão (cm)" type="number" step="0.1" min={0} defaultValue={janela.larguraCm ?? ""} />
          <CampoDaJanela nome="profundidadeCm" rotulo="Profundidade (cm)" type="number" step="0.1" min={0} defaultValue={janela.profundidadeCm ?? ""} />
          <CampoDaJanela nome="alturaLivreCm" rotulo="Altura livre da prateleira (cm)" type="number" step="0.1" min={0} defaultValue={janela.alturaLivreCm ?? ""} />
          <CampoDaJanela nome="pesoMaximoKg" rotulo="Peso máximo por prateleira (kg)" type="number" step="0.001" min={0} defaultValue={janela.pesoMaximoKg ?? ""} />
        </JanelaDeFormulario>
      )}

      {excluindo && (
        <PopupExclusao
          titulo="Excluir coluna"
          nome={`Coluna ${excluindo.letra} · ${excluindo.estoque}`}
          aviso="A coluna sai do mapa. Nenhum produto é alterado."
          erro={erro}
          pendente={pendente}
          aoCancelar={() => setExcluindo(null)}
          aoConfirmar={() => executar(() => excluirColunaAcao(excluindo.id), () => setExcluindo(null))}
        />
      )}
    </>
  );
}
