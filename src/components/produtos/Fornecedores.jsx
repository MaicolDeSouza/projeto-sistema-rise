"use client";

import { useState, useTransition } from "react";
import { CircleDot, ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";

import {
  definirFornecedorPadrao,
  removerFornecedorDoProduto,
  salvarFornecedorDoProduto,
} from "@/app/produtos/acoes";

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const VAZIO = {
  nome: "",
  descricao: "",
  codigo: "",
  precoCusto: "",
  link: "",
};

/**
 * Fornecedores do produto.
 *
 * Os campos NAO levam atributo `name`: esta tabela vive dentro do <form> do
 * produto, e campo nomeado seria enviado junto no salvamento. Cada linha grava
 * pela propria acao, no mesmo padrao do envio de arquivos.
 */
export default function Fornecedores({ produtoId, vinculos, catalogo, aoFalhar }) {
  const [pendente, iniciarTransicao] = useTransition();
  const [editando, setEditando] = useState(null); // id do vinculo, ou "novo"
  const [rascunho, setRascunho] = useState(VAZIO);
  const [erros, setErros] = useState({});

  function abrirNovo() {
    setRascunho(VAZIO);
    setErros({});
    setEditando("novo");
  }

  function abrirEdicao(vinculo) {
    setRascunho({
      nome: vinculo.nome,
      descricao: vinculo.descricao ?? "",
      codigo: vinculo.codigo ?? "",
      precoCusto: vinculo.precoCusto ?? "",
      link: vinculo.link ?? "",
    });
    setErros({});
    setEditando(vinculo.id);
  }

  function salvar() {
    iniciarTransicao(async () => {
      const resultado = await salvarFornecedorDoProduto(
        produtoId,
        editando === "novo" ? null : editando,
        rascunho,
      );

      if (resultado.ok) {
        setEditando(null);
        setErros({});
      } else {
        setErros(resultado.erros ?? {});
        if (resultado.erro) aoFalhar?.(resultado.erro);
      }
    });
  }

  const campo = (chave) => ({
    value: rascunho[chave],
    onChange: (evento) =>
      setRascunho((atual) => ({ ...atual, [chave]: evento.target.value })),
    className: `w-full rounded border px-2 py-1.5 text-sm focus:outline-none ${
      erros[chave] ? "border-red-400" : "border-borda focus:border-acento"
    }`,
  });

  return (
    <div>
      <div className="overflow-x-auto rounded border border-borda">
        <table className="w-full text-sm">
          <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
            <tr className="divide-x divide-borda">
              <th className="px-3 py-2 font-medium">Fornecedor</th>
              <th className="px-3 py-2 font-medium">Descricao no fornecedor</th>
              <th className="px-3 py-2 font-medium">Codigo no fornecedor</th>
              <th className="px-3 py-2 font-medium">Preco de custo</th>
              <th className="px-3 py-2 font-medium">Link</th>
              <th className="px-3 py-2 font-medium">Padrao</th>
              <th className="w-20 px-3 py-2" />
            </tr>
          </thead>

          <tbody className="divide-y divide-borda">
            {vinculos.length === 0 && editando !== "novo" && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-suave">
                  Nenhum fornecedor cadastrado para este produto.
                </td>
              </tr>
            )}

            {vinculos.map((vinculo) =>
              editando === vinculo.id ? (
                <LinhaEdicao
                  key={vinculo.id}
                  campo={campo}
                  catalogo={catalogo}
                  erros={erros}
                  pendente={pendente}
                  aoSalvar={salvar}
                  aoCancelar={() => setEditando(null)}
                />
              ) : (
                <tr key={vinculo.id} className="divide-x divide-borda">
                  <td className="px-3 py-2 font-medium">{vinculo.nome}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-suave">
                    {vinculo.descricao || "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {vinculo.codigo || "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {vinculo.precoCusto === null
                      ? "—"
                      : moeda.format(vinculo.precoCusto)}
                  </td>
                  <td className="px-3 py-2">
                    {vinculo.link ? (
                      <a
                        href={vinculo.link}
                        target="_blank"
                        rel="noreferrer"
                        title={vinculo.link}
                        className="inline-flex text-acento hover:underline"
                      >
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <span className="text-suave">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      disabled={pendente || vinculo.padrao}
                      onClick={() =>
                        iniciarTransicao(async () => {
                          const r = await definirFornecedorPadrao(vinculo.id);
                          if (!r.ok) aoFalhar?.(r.erro);
                        })
                      }
                      title={
                        vinculo.padrao
                          ? "E deste fornecedor que sai o custo do produto"
                          : "Usar o custo deste fornecedor"
                      }
                      className={
                        vinculo.padrao
                          ? "text-emerald-600"
                          : "text-suave hover:text-texto"
                      }
                    >
                      <CircleDot size={16} />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => abrirEdicao(vinculo)}
                        aria-label="Editar fornecedor"
                        className="rounded p-1 text-suave hover:bg-fundo hover:text-acento"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={pendente}
                        onClick={() =>
                          iniciarTransicao(async () => {
                            const r = await removerFornecedorDoProduto(vinculo.id);
                            if (!r.ok) aoFalhar?.(r.erro);
                          })
                        }
                        aria-label="Remover fornecedor"
                        className="rounded p-1 text-suave hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ),
            )}

            {editando === "novo" && (
              <LinhaEdicao
                campo={campo}
                catalogo={catalogo}
                erros={erros}
                pendente={pendente}
                aoSalvar={salvar}
                aoCancelar={() => setEditando(null)}
              />
            )}
          </tbody>
        </table>
      </div>

      {editando === null && (
        <button
          type="button"
          onClick={abrirNovo}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:underline"
        >
          <Plus size={15} />
          Adicionar fornecedor
        </button>
      )}

      <p className="mt-2 text-[11px] text-suave">
        O custo do produto vem do fornecedor marcado como padrao.
      </p>
    </div>
  );
}

function LinhaEdicao({ campo, catalogo, erros, pendente, aoSalvar, aoCancelar }) {
  return (
    <tr className="divide-x divide-borda bg-fundo/40">
      <td className="px-3 py-2">
        {/* Lista dos ja cadastrados, mas aceita nome novo digitado */}
        <input list="catalogo-fornecedores" {...campo("nome")} />
        <datalist id="catalogo-fornecedores">
          {catalogo.map((f) => (
            <option key={f.id} value={f.nome} />
          ))}
        </datalist>
        {erros.nome && (
          <p className="mt-1 text-[11px] text-red-700">{erros.nome}</p>
        )}
      </td>
      <td className="px-3 py-2">
        <input {...campo("descricao")} />
      </td>
      <td className="px-3 py-2">
        <input {...campo("codigo")} />
      </td>
      <td className="px-3 py-2">
        <input type="number" step="0.01" min="0" {...campo("precoCusto")} />
        {erros.precoCusto && (
          <p className="mt-1 text-[11px] text-red-700">{erros.precoCusto}</p>
        )}
      </td>
      <td className="px-3 py-2" colSpan={2}>
        <input placeholder="https://..." {...campo("link")} />
        {erros.link && (
          <p className="mt-1 text-[11px] text-red-700">{erros.link}</p>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={aoSalvar}
            disabled={pendente}
            className="rounded bg-acento px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
          >
            Salvar
          </button>
          <button
            type="button"
            onClick={aoCancelar}
            aria-label="Cancelar"
            className="rounded p-1 text-suave hover:text-texto"
          >
            <X size={14} />
          </button>
        </div>
      </td>
    </tr>
  );
}
