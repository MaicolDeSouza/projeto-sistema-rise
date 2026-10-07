"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";

import { excluirCliente } from "@/app/cadastros/acoes-clientes";
import Badge from "@/components/ui/Badge";
import CampoBusca from "@/components/ui/CampoBusca";
import PopupExclusao from "./PopupExclusao";

/**
 * Lista de clientes. A busca vive na URL (`?q=`), como nas outras listas de
 * Cadastros, e procura por nome, documento e e-mail no servidor.
 */
export default function TabelaClientes({ linhas, busca }) {
  const [alvo, setAlvo] = useState(null);
  const [erro, setErro] = useState(null);
  const [pendente, iniciarTransicao] = useTransition();

  function fechar() {
    setAlvo(null);
    setErro(null);
  }

  function excluir() {
    iniciarTransicao(async () => {
      const resultado = await excluirCliente(alvo.id);
      if (resultado.ok) fechar();
      else setErro(resultado.erro);
    });
  }

  return (
    <>
      <CampoBusca valorInicial={busca} rotulo="Buscar por nome, CPF/CNPJ ou e-mail" />

      {linhas.length === 0 ? (
        <p className="rounded-lg border border-dashed border-borda bg-superficie px-4 py-8 text-center text-sm text-suave">
          {busca ? `Nenhum resultado para "${busca}".` : "Nenhum cliente cadastrado ainda. Use o botão Novo cliente."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
          <table className="w-full text-sm">
            <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
              <tr className="divide-x divide-borda">
                <th className="px-3 py-2.5 font-medium">Nome</th>
                <th className="px-3 py-2.5 font-medium">CPF / CNPJ</th>
                <th className="px-3 py-2.5 font-medium">Tipo</th>
                <th className="px-3 py-2.5 font-medium">Contato</th>
                <th className="px-3 py-2.5 font-medium">Cidade</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-borda">
              {linhas.map((linha) => (
                <tr key={linha.id} className="align-top">
                  <td className="px-3 py-2.5">
                    <Link href={`/cadastros/clientes/${linha.id}`} className="font-medium hover:text-acento">
                      {linha.nome}
                    </Link>
                    {linha.nomeFantasia && (
                      <span className="block text-xs text-suave">{linha.nomeFantasia}</span>
                    )}
                    {!linha.ativo && (
                      <span className="ml-2 align-middle">
                        <Badge>Inativo</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-suave">{linha.documento || "—"}</td>
                  <td className="px-3 py-2.5">
                    <Badge tom={linha.tipoPessoa === "JURIDICA" ? "info" : "neutro"}>
                      {linha.tipoPessoa === "JURIDICA" ? "Jurídica" : "Física"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-suave">{linha.contato || "—"}</td>
                  <td className="px-3 py-2.5 text-suave">{linha.cidade || "—"}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/cadastros/clientes/${linha.id}`}
                        aria-label={`Editar ${linha.nome}`}
                        className="rounded p-1.5 text-suave hover:bg-fundo hover:text-texto"
                      >
                        <Pencil size={15} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setAlvo(linha)}
                        aria-label={`Excluir ${linha.nome}`}
                        className="rounded p-1.5 text-suave hover:bg-fundo hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {alvo && (
        <PopupExclusao
          titulo="Excluir cliente?"
          nome={alvo.nome}
          aviso="Os endereços e contatos deste cliente também serão apagados."
          erro={erro}
          pendente={pendente}
          aoConfirmar={excluir}
          aoCancelar={fechar}
        />
      )}
    </>
  );
}
