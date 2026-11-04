"use client";

import { useEffect, useState, useTransition } from "react";
import { Search, UserPlus, X } from "lucide-react";

import { buscarClientesAcao, criarClienteDoPedidoAcao, vincularClienteAcao } from "@/app/pedidos/acoes";
import { propsDoFundo } from "@/lib/fundoDaJanela";

import SeloDoNivel from "./SeloDoNivel";

/**
 * Vincular cliente a um pedido sem cliente: busca no cadastro pelo nome ou pelo CPF/CNPJ e um clique liga; "Criar com
 * este nome" cria o cliente com o nome, o contato e o endereco do pedido, mesmo sem documento.
 */
export default function JanelaVincularCliente({ pedido, aoFechar }) {
  const [texto, setTexto] = useState(pedido.nomeDoComprador ?? "");
  const [clientes, setClientes] = useState([]);
  const [buscou, setBuscou] = useState(false);
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();

  useEffect(() => {
    const termo = texto.trim();
    if (termo.length < 2) return;
    const relogio = setTimeout(async () => {
      const resposta = await buscarClientesAcao(termo);
      setClientes(resposta?.clientes ?? []);
      setBuscou(true);
      if (!resposta?.ok) setErro(resposta?.erro ?? null);
    }, 250);
    return () => clearTimeout(relogio);
  }, [texto]);

  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        aoFechar();
      }
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  function concluir(promessa) {
    setErro(null);
    iniciar(async () => {
      const resultado = await promessa();
      if (resultado?.ok) aoFechar();
      else setErro(resultado?.erro ?? "Não foi possível vincular.");
    });
  }

  const mostrarLista = texto.trim().length >= 2;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" {...propsDoFundo(aoFechar)}>
      <section role="dialog" aria-modal="true" aria-labelledby="vincular-titulo" className="w-full max-w-md rounded-lg border border-borda bg-superficie shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-borda px-5 py-3">
          <h2 id="vincular-titulo" className="font-semibold">
            Vincular cliente ao pedido {pedido.numero}
          </h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="-mr-2 rounded p-2.5 text-suave transition-colors hover:bg-fundo hover:text-texto">
            <X size={18} />
          </button>
        </header>

        <div className="px-5 py-4">
          <div className="relative">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-suave" />
            <input
              type="search"
              autoFocus
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              aria-label="Buscar cliente pelo nome ou CPF/CNPJ"
              placeholder="Nome ou CPF/CNPJ"
              className="w-full rounded-md border border-borda bg-superficie py-2 pr-3 pl-8 text-sm outline-none focus:border-acento"
            />
          </div>

          {mostrarLista && (
            <ul className="mt-3 max-h-64 divide-y divide-borda overflow-y-auto rounded-md border border-borda">
              {clientes.map((cliente) => (
                <li key={cliente.id}>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => concluir(() => vincularClienteAcao(pedido.id, cliente.id))}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-fundo disabled:opacity-50"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{cliente.nome}</span>
                      <SeloDoNivel nivel={cliente.nivel} />
                    </span>
                    <span className="shrink-0 text-xs text-suave tabular-nums">{cliente.documento ?? "sem documento"}</span>
                  </button>
                </li>
              ))}
              {buscou && clientes.length === 0 && <li className="px-3 py-2.5 text-sm text-suave">Nenhum cliente com esse nome ou documento.</li>}
            </ul>
          )}

          {erro && (
            <p role="alert" className="mt-3 text-sm text-red-600">
              {erro}
            </p>
          )}
        </div>

        <footer className="flex justify-between gap-2 border-t border-borda px-5 py-3">
          <button
            type="button"
            disabled={ocupado}
            onClick={() => concluir(() => criarClienteDoPedidoAcao(pedido.id))}
            title={`Cria o cliente "${pedido.nomeDoComprador ?? "Sem nome"}" com o contato e o endereço do pedido`}
            className="inline-flex items-center gap-1.5 rounded-md border border-borda px-3 py-2 text-sm font-medium transition-colors hover:bg-fundo disabled:opacity-50"
          >
            <UserPlus size={15} aria-hidden="true" /> Criar com este nome
          </button>
          <button type="button" onClick={aoFechar} className="rounded-md px-3 py-2 text-sm text-suave transition-colors hover:bg-fundo hover:text-texto">
            Cancelar
          </button>
        </footer>
      </section>
    </div>
  );
}
