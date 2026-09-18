"use client";

import { useImperativeHandle, useState, useTransition } from "react";
import {
  CheckSquare,
  ExternalLink,
  Pencil,
  Plus,
  Square,
  Trash2,
  X,
} from "lucide-react";

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

/** Mesma regra de src/app/produtos/acoes.js: so http/https vira link. */
function ehUrlSegura(valor) {
  if (!valor) return true;
  try {
    return ["http:", "https:"].includes(new URL(valor).protocol);
  } catch {
    return false;
  }
}

/**
 * Confere o rascunho no navegador, no MODO RASCUNHO (produto ainda nao
 * existe): o servidor valida de novo com o mesmo schema ao salvar o produto,
 * esta e so para o operador ver o erro na hora, sem esperar o Salvar.
 */
function validarRascunho(dados) {
  const erros = {};
  if (!dados.nome.trim()) erros.nome = "Informe o fornecedor.";
  if (dados.precoCusto !== "" && (Number.isNaN(Number(dados.precoCusto)) || Number(dados.precoCusto) < 0)) {
    erros.precoCusto = "Informe um numero valido.";
  }
  if (dados.link && !ehUrlSegura(dados.link)) {
    erros.link = "Informe um endereco http ou https.";
  }
  return erros;
}

/**
 * Do mais barato para o mais caro, pedido do dono em 18/09/2026: e o que
 * importa para escolher o fornecedor. Sem preco fica por ultimo — nao e o
 * mais barato, e nao ha o que comparar.
 */
function porCustoAscendente(a, b) {
  if (a.precoCusto == null && b.precoCusto == null) return 0;
  if (a.precoCusto == null) return 1;
  if (b.precoCusto == null) return -1;
  return a.precoCusto - b.precoCusto;
}

/**
 * Fornecedores do produto.
 *
 * Os campos NAO levam atributo `name`: esta tabela vive dentro do <form> do
 * produto, e campo nomeado seria enviado junto no salvamento.
 *
 * **Modo rascunho** (`modoRascunho`, produto ainda nao salvo, pedido do dono em
 * 18/09/2026): cada linha grava na lista do FORMULARIO (`aoMudarRascunho`), e
 * nao pela propria acao — o produto so ganha id no Salvar, e e so entao que os
 * vinculos de verdade sao criados (`gravarFornecedoresRascunho`, mesmo padrao
 * de documentos e certificado). Num produto ja salvo, cada linha continua
 * gravando pela propria acao, no mesmo padrao do envio de arquivos.
 *
 * **Fornecedor marcado na lupa entra sozinho** (pedido do dono em 18/09/2026,
 * depois de ver uma lista separada pedindo clique — ele queria direto na
 * tabela). `sincronizarSugestoes` e chamada pelo FORMULARIO quando a janela da
 * lupa fecha (`ref`), e nao aqui dentro: e o fechar que marca "terminei de
 * escolher", e sincronizar a cada marcacao criaria linha a cada clique na
 * janela, antes do operador decidir o conjunto.
 */
export default function Fornecedores({
  ref,
  produtoId,
  vinculos,
  catalogo,
  aoFalhar,
  modoRascunho = false,
  aoMudarRascunho,
  sugestoes = [],
}) {
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

  /** Campos do fornecedor a partir de uma referencia marcada na lupa do Nome. */
  function dadosDaSugestao(item) {
    return {
      nome: item.fonte ?? "",
      descricao: item.nome ?? "",
      codigo: item.codigo && item.codigo !== "N/A" ? item.codigo : "",
      precoCusto: item.preco != null ? String(item.preco) : "",
      link: item.url ?? "",
    };
  }

  /** Rascunho (strings) -> vinculo pronto para a lista, nulos no lugar de "". */
  function paraVinculo(dados) {
    return {
      nome: dados.nome.trim(),
      descricao: dados.descricao.trim() || null,
      codigo: dados.codigo.trim() || null,
      precoCusto: dados.precoCusto === "" ? null : Number(dados.precoCusto),
      link: dados.link.trim() || null,
    };
  }

  function salvar() {
    if (modoRascunho) {
      const erros = validarRascunho(rascunho);
      if (Object.keys(erros).length > 0) {
        setErros(erros);
        return;
      }

      const dados = paraVinculo(rascunho);
      aoMudarRascunho((atual) =>
        editando === "novo"
          ? [...atual, { id: crypto.randomUUID(), ...dados, padrao: atual.length === 0 }]
          : atual.map((item) => (item.id === editando ? { ...item, ...dados } : item)),
      );
      setEditando(null);
      setErros({});
      return;
    }

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

  /**
   * Adiciona uma referencia marcada direto na lista, sem passar pela linha de
   * edicao — pedido do dono em 18/09/2026: um clique em "Adicionar" basta. So
   * abre a linha (com o erro a vista) se a referencia nao servir sozinha:
   * fornecedor sem nome, ou o servidor recusando (ex.: ja vinculado).
   */
  function adicionarSugestao(item) {
    const dados = dadosDaSugestao(item);

    if (modoRascunho) {
      const erros = validarRascunho(dados);
      if (Object.keys(erros).length > 0) {
        setRascunho(dados);
        setErros(erros);
        setEditando("novo");
        return;
      }

      const vinculo = paraVinculo(dados);
      aoMudarRascunho((atual) => [
        ...atual,
        { id: crypto.randomUUID(), ...vinculo, padrao: atual.length === 0 },
      ]);
      return;
    }

    iniciarTransicao(async () => {
      const resultado = await salvarFornecedorDoProduto(produtoId, null, dados);
      if (!resultado.ok) {
        // Nao serviu sozinho (nome invalido, ja vinculado...): abre a linha
        // preenchida, com o erro a vista, para o operador ajustar e confirmar.
        setRascunho(dados);
        setErros(resultado.erros ?? {});
        setEditando("novo");
        if (resultado.erro) aoFalhar?.(resultado.erro);
      }
    });
  }

  useImperativeHandle(ref, () => ({
    sincronizarSugestoes: () => {
      for (const item of sugestoes) adicionarSugestao(item);
    },
  }));

  function definirPadrao(vinculo) {
    if (modoRascunho) {
      aoMudarRascunho((atual) =>
        atual.map((item) => ({ ...item, padrao: item.id === vinculo.id })),
      );
      return;
    }
    iniciarTransicao(async () => {
      const r = await definirFornecedorPadrao(vinculo.id);
      if (!r.ok) aoFalhar?.(r.erro);
    });
  }

  function remover(vinculo) {
    if (modoRascunho) {
      aoMudarRascunho((atual) => {
        const restante = atual.filter((item) => item.id !== vinculo.id);
        if (vinculo.padrao && restante.length > 0) restante[0] = { ...restante[0], padrao: true };
        return restante;
      });
      return;
    }
    iniciarTransicao(async () => {
      const r = await removerFornecedorDoProduto(vinculo.id);
      if (!r.ok) aoFalhar?.(r.erro);
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

            {[...vinculos].sort(porCustoAscendente).map((vinculo) =>
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
                      onClick={() => definirPadrao(vinculo)}
                      aria-label={
                        vinculo.padrao
                          ? `${vinculo.nome} e o fornecedor padrao`
                          : `Usar ${vinculo.nome} como fornecedor padrao`
                      }
                      title={
                        vinculo.padrao
                          ? "E deste fornecedor que sai o custo do produto"
                          : "Usar o custo deste fornecedor"
                      }
                      className={`inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-xs font-medium ${
                        vinculo.padrao
                          ? "bg-emerald-50 text-emerald-700"
                          : "text-suave hover:bg-fundo hover:text-texto"
                      }`}
                    >
                      {vinculo.padrao ? (
                        <CheckSquare size={16} className="shrink-0 fill-emerald-600 text-white" />
                      ) : (
                        <Square size={16} className="shrink-0" />
                      )}
                      {vinculo.padrao && "Padrao"}
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
                        onClick={() => remover(vinculo)}
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
