"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { filtrarDigitacaoDeTelefone, formatarTelefone, telefoneValido } from "@/lib/telefone";

const VAZIO = { nome: "", cargo: "", telefone: "", email: "" };

const CLASSE_INPUT =
  "w-full rounded border border-borda bg-superficie px-2 py-1.5 text-sm focus:border-acento focus:outline-none";

/**
 * Pessoas de contato do cliente (comprador, financeiro...). A lista mora no
 * estado da tela e vai no envio como UM campo oculto JSON (`contatos`): o servidor
 * troca a lista inteira, entao nao ha uma acao por contato, e um cliente novo
 * pode ganhar contatos antes de existir.
 *
 * Os campos de digitacao NAO levam `name`: estao dentro do <form> do cliente, e
 * campo nomeado seria enviado junto no Salvar. Enter neles inclui o contato, e
 * nao envia o formulario.
 */
export default function ContatosDoCliente({ inicial, erro }) {
  const [lista, setLista] = useState(inicial ?? []);
  const [rascunho, setRascunho] = useState(VAZIO);
  const [editando, setEditando] = useState(null); // indice na lista, ou null
  const [aviso, setAviso] = useState(null);

  function limpar() {
    setRascunho(VAZIO);
    setEditando(null);
    setAviso(null);
  }

  function confirmar() {
    const contato = {
      nome: rascunho.nome.trim(),
      cargo: rascunho.cargo.trim(),
      telefone: formatarTelefone(rascunho.telefone),
      email: rascunho.email.trim(),
    };

    if (!contato.nome) {
      setAviso("Informe o nome do contato.");
      return;
    }
    if (contato.telefone && !telefoneValido(contato.telefone)) {
      setAviso("Informe um telefone valido, com DDD: (54) 98899-0008.");
      return;
    }
    if (contato.email && !/^\S+@\S+\.\S+$/.test(contato.email)) {
      setAviso("Informe um e-mail valido.");
      return;
    }

    setLista((atual) =>
      editando === null
        ? [...atual, contato]
        : atual.map((item, indice) => (indice === editando ? contato : item)),
    );
    limpar();
  }

  function editar(indice) {
    setRascunho({ ...VAZIO, ...lista[indice] });
    setEditando(indice);
    setAviso(null);
  }

  function remover(indice) {
    setLista((atual) => atual.filter((_, i) => i !== indice));
    // Remover o contato que estava sendo editado cancela a edicao.
    if (editando === indice) limpar();
    else if (editando !== null && indice < editando) setEditando(editando - 1);
  }

  const aoTeclar = (evento) => {
    if (evento.key === "Enter") {
      evento.preventDefault();
      confirmar();
    }
  };

  // `filtrar` limpa a cada tecla e `formatar` arruma ao sair do campo (ver
  // ListaDeValores: formatar a cada tecla trava o apagar).
  const campo = (nome, rotulo, { filtrar, formatar, ...extras } = {}) => (
    <div>
      <label className="text-xs font-semibold" htmlFor={`contato-${nome}`}>
        {rotulo}
      </label>
      <input
        id={`contato-${nome}`}
        value={rascunho[nome]}
        onChange={(evento) =>
          setRascunho({
            ...rascunho,
            [nome]: filtrar ? filtrar(evento.target.value) : evento.target.value,
          })
        }
        onBlur={
          formatar
            ? () => setRascunho((atual) => ({ ...atual, [nome]: formatar(atual[nome]) }))
            : undefined
        }
        onKeyDown={aoTeclar}
        className={`mt-1 ${CLASSE_INPUT}`}
        {...extras}
      />
    </div>
  );

  // Contato digitado mas ainda nao incluido entra junto no Salvar: quem preenche
  // os quatro campos e clica direto em Salvar espera que o contato fique, e
  // descarta-lo em silencio seria perder o que acabou de escrever. Na edicao de um
  // contato da lista isso nao vale (sao dois textos para o mesmo item).
  const pendente =
    editando === null && rascunho.nome.trim()
      ? {
          nome: rascunho.nome.trim(),
          cargo: rascunho.cargo.trim(),
          telefone: rascunho.telefone.trim(),
          email: rascunho.email.trim(),
        }
      : null;

  return (
    <div>
      <input
        type="hidden"
        name="contatos"
        value={JSON.stringify(pendente ? [...lista, pendente] : lista)}
      />

      {lista.length > 0 && (
        <div className="mb-3 overflow-x-auto rounded-lg border border-borda">
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
              <tr>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Cargo</th>
                <th className="px-3 py-2 font-medium">Telefone</th>
                <th className="px-3 py-2 font-medium">E-mail</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {lista.map((contato, indice) => (
                <tr key={indice} className={editando === indice ? "bg-fundo" : ""}>
                  <td className="px-3 py-2 font-medium">{contato.nome}</td>
                  <td className="px-3 py-2 text-suave">{contato.cargo || "—"}</td>
                  <td className="px-3 py-2 text-suave">{contato.telefone || "—"}</td>
                  <td className="px-3 py-2 text-suave">{contato.email || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => editar(indice)}
                        aria-label={`Editar contato ${contato.nome}`}
                        className="rounded p-1.5 text-suave hover:bg-fundo hover:text-texto"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remover(indice)}
                        aria-label={`Remover contato ${contato.nome}`}
                        className="rounded p-1.5 text-suave hover:bg-fundo hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4">
        {campo("nome", "Nome do contato")}
        {campo("cargo", "Cargo ou setor")}
        {campo("telefone", "Telefone / WhatsApp", {
          inputMode: "tel",
          placeholder: "(00) 00000-0000",
          maxLength: 20,
          filtrar: filtrarDigitacaoDeTelefone,
          formatar: formatarTelefone,
        })}
        {campo("email", "E-mail", { type: "email" })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={confirmar}
          className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline"
        >
          <Plus size={15} />
          {editando === null ? "incluir" : "atualizar contato"}
        </button>
        {editando !== null && (
          <button type="button" onClick={limpar} className="text-sm text-suave hover:text-texto">
            cancelar edicao
          </button>
        )}
        {(aviso || erro) && <span className="text-xs text-red-700">{aviso ?? erro}</span>}
        {pendente && !aviso && !erro && (
          <span className="text-xs text-suave">
            Este contato sera incluido ao salvar o cliente.
          </span>
        )}
      </div>
    </div>
  );
}
