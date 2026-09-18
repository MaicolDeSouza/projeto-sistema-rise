"use client";

import { Fragment, useState, useTransition } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";

import CampoBusca from "@/components/ui/CampoBusca";
import PopupExclusao from "./PopupExclusao";

const VAZIO = { nome: "", observacoes: "" };

/**
 * Cadastro de nome + observacao, com edicao na propria linha (nao ha pagina de
 * cadastro: sao dois campos). Serve a Marcas e a Condicoes de pagamento — eram
 * duas copias do mesmo codigo, e a segunda so mudava os textos. Mesmo desenho da
 * tabela de Fornecedores do cadastro de produto.
 *
 * `salvar(id, dados)` e `excluir(id)` sao as acoes do servidor, passadas pela
 * pagina; devolvem `{ ok, erros | erro }`. `textos` traz a redacao de cada
 * cadastro (a coluna, o botao, o aviso de exclusao).
 *
 * `maiusculas`: mostra o nome em MAIUSCULAS ja ao digitar (marca, como o campo
 * Marca do produto). O servidor converte de novo, mas ver o texto final antes de
 * salvar evita a surpresa de "Elgin" voltar como "ELGIN".
 */
export default function TabelaSimples({ itens, busca, salvar, excluir, textos, maiusculas = false }) {
  const [editando, setEditando] = useState(null); // id, "novo" ou null
  const [rascunho, setRascunho] = useState(VAZIO);
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState(null);
  const [alvo, setAlvo] = useState(null);
  const [pendente, iniciarTransicao] = useTransition();

  function abrirNovo() {
    setRascunho(VAZIO);
    setErros({});
    setErroGeral(null);
    setEditando("novo");
  }

  function abrirEdicao(item) {
    setRascunho({ nome: item.nome, observacoes: item.observacoes ?? "" });
    setErros({});
    setErroGeral(null);
    setEditando(item.id);
  }

  function cancelar() {
    setEditando(null);
    setErros({});
    setErroGeral(null);
  }

  function gravar() {
    iniciarTransicao(async () => {
      const resultado = await salvar(editando === "novo" ? null : editando, rascunho);
      if (resultado.ok) cancelar();
      else {
        setErros(resultado.erros ?? {});
        setErroGeral(resultado.erro ?? null);
      }
    });
  }

  function apagar() {
    iniciarTransicao(async () => {
      const resultado = await excluir(alvo.id);
      if (resultado.ok) {
        setAlvo(null);
        setErroGeral(null);
      } else {
        setErroGeral(resultado.erro);
      }
    });
  }

  function aoTeclar(evento) {
    if (evento.key === "Enter") gravar();
    if (evento.key === "Escape") cancelar();
  }

  const linhaDeEdicao = (
    <tr className="bg-fundo align-top">
      <td className="px-3 py-2">
        <input
          autoFocus
          aria-label={`Nome da ${textos.item}`}
          value={rascunho.nome}
          onChange={(evento) =>
            setRascunho({
              ...rascunho,
              nome: maiusculas ? evento.target.value.toLocaleUpperCase("pt-BR") : evento.target.value,
            })
          }
          onKeyDown={aoTeclar}
          className={`w-full rounded border bg-superficie px-2 py-1.5 text-sm focus:outline-none ${
            erros.nome ? "border-red-400" : "border-borda focus:border-acento"
          }`}
        />
        {erros.nome && <p className="mt-1 text-[11px] text-red-700">{erros.nome}</p>}
        {erroGeral && <p className="mt-1 text-[11px] text-red-700">{erroGeral}</p>}
      </td>
      <td className="px-3 py-2">
        <input
          aria-label={`Observacoes da ${textos.item}`}
          value={rascunho.observacoes}
          onChange={(evento) => setRascunho({ ...rascunho, observacoes: evento.target.value })}
          onKeyDown={aoTeclar}
          className="w-full rounded border border-borda bg-superficie px-2 py-1.5 text-sm focus:border-acento focus:outline-none"
        />
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end gap-1">
          <button
            type="button"
            onClick={gravar}
            disabled={pendente}
            aria-label={`Salvar ${textos.item}`}
            className="rounded p-1.5 text-emerald-700 hover:bg-superficie disabled:opacity-50"
          >
            <Check size={15} />
          </button>
          <button
            type="button"
            onClick={cancelar}
            aria-label="Cancelar edicao"
            className="rounded p-1.5 text-suave hover:bg-superficie"
          >
            <X size={15} />
          </button>
        </div>
      </td>
    </tr>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <CampoBusca valorInicial={busca} rotulo={textos.buscar} className="max-w-sm flex-1" />
        <button
          type="button"
          onClick={abrirNovo}
          disabled={editando !== null}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Plus size={16} />
          {textos.nova}
        </button>
      </div>

      {itens.length === 0 && editando !== "novo" ? (
        <p className="rounded-lg border border-dashed border-borda bg-superficie px-4 py-8 text-center text-sm text-suave">
          {busca ? `Nenhum resultado para "${busca}".` : textos.vazio}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
              <tr className="divide-x divide-borda">
                <th className="px-3 py-2.5 font-medium">{textos.coluna}</th>
                <th className="px-3 py-2.5 font-medium">Observacoes</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {editando === "novo" && linhaDeEdicao}
              {itens.map((item) =>
                editando === item.id ? (
                  <Fragment key={item.id}>{linhaDeEdicao}</Fragment>
                ) : (
                  <tr key={item.id} className="align-top">
                    <td className="px-3 py-2.5 font-medium">{item.nome}</td>
                    <td className="px-3 py-2.5 text-suave">{item.observacoes || "—"}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => abrirEdicao(item)}
                          disabled={editando !== null}
                          aria-label={`Editar ${item.nome}`}
                          className="rounded p-1.5 text-suave hover:bg-fundo hover:text-texto disabled:opacity-40"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setErroGeral(null);
                            setAlvo(item);
                          }}
                          disabled={editando !== null}
                          aria-label={`Excluir ${item.nome}`}
                          className="rounded p-1.5 text-suave hover:bg-fundo hover:text-red-600 disabled:opacity-40"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {alvo && (
        <PopupExclusao
          titulo={textos.tituloExcluir}
          nome={alvo.nome}
          aviso={textos.avisoExcluir}
          erro={erroGeral}
          pendente={pendente}
          aoConfirmar={apagar}
          aoCancelar={() => {
            setAlvo(null);
            setErroGeral(null);
          }}
        />
      )}
    </>
  );
}
