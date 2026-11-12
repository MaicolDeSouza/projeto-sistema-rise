"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CloudUpload, Loader2, Search, X } from "lucide-react";

import { buscarClienteAcao, clienteParaPropostaAcao, enviarClienteAoBlingAcao, usarContatoDoBlingAcao } from "@/app/propostas/acoes";
import SecaoDoAnuncio from "@/components/anuncios/ml/SecaoDoAnuncio";
import { formatarTelefone } from "@/lib/telefone";

export const campo =
  "w-full rounded-md border border-borda bg-superficie px-2.5 py-2 text-sm focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/20 disabled:bg-fundo disabled:text-suave aria-[invalid=true]:border-rose-500";

export function Rotulo({ texto, erro, children, className = "" }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-suave">{texto}</span>
      {children}
      {erro && <span className="mt-1 block text-xs text-rose-600">{erro}</span>}
    </label>
  );
}

/**
 * O cliente da proposta. Uma busca so (nome, CPF ou CNPJ): o Rise primeiro, depois o Bling. Sem achar, os campos do
 * cliente PROVISORIO, que ficam so na proposta; com CPF/CNPJ, o Salvar cadastra no Rise e no Bling (regra do dono).
 * Cliente ligado mostra o cadastro e o A/C (as pessoas do cliente).
 */
export default function CartaoCliente({ formulario, cliente, editar, erros, aoMudar, aoLigarCliente, aoDesligarCliente }) {
  const [texto, setTexto] = useState("");
  const [achados, setAchados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();
  const vez = useRef(0);

  useEffect(() => {
    const termo = texto.trim();
    if (termo.length < 2) return undefined;
    const minha = ++vez.current;
    const relogio = setTimeout(async () => {
      setBuscando(true);
      const resposta = await buscarClienteAcao(termo);
      if (minha !== vez.current) return;
      setAchados(resposta);
      setBuscando(false);
    }, 350);
    return () => clearTimeout(relogio);
  }, [texto]);

  const escolherDoRise = (id) =>
    iniciar(async () => {
      const lido = await clienteParaPropostaAcao(id);
      if (!lido) return setErro("Cliente não encontrado.");
      aoLigarCliente(lido);
      setTexto("");
      setAchados(null);
    });
  const escolherDoBling = (blingId) =>
    iniciar(async () => {
      const resposta = await usarContatoDoBlingAcao(blingId);
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível usar o contato do Bling.");
      if (resposta.cliente) aoLigarCliente(resposta.cliente);
      else if (resposta.provisorio) {
        // Sem CPF/CNPJ no Bling: vira provisorio (o cadastro so nasce com documento).
        aoMudar("clienteNome", resposta.provisorio.nome ?? "");
        aoMudar("clienteTelefone", resposta.provisorio.telefone ? formatarTelefone(resposta.provisorio.telefone) : "");
        aoMudar("clienteEmail", resposta.provisorio.email ?? "");
      }
      setTexto("");
      setAchados(null);
    });
  const enviarAoBling = () =>
    iniciar(async () => {
      const resposta = await enviarClienteAoBlingAcao(cliente.id);
      if (!resposta?.ok) return setErro(resposta?.erro ?? "O Bling não recebeu o cliente.");
      setErro(null);
      aoLigarCliente({ ...cliente, blingContatoId: resposta.blingContatoId });
    });

  if (formulario.clienteId && cliente) {
    return (
      <SecaoDoAnuncio
        titulo="Cliente"
        acao={
          editar ? (
            <button type="button" onClick={aoDesligarCliente} className="inline-flex items-center gap-1 text-xs text-suave hover:text-texto">
              <X size={14} /> Trocar cliente
            </button>
          ) : null
        }
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
          <div className="min-w-0 space-y-0.5 text-sm">
            <Link href={`/cadastros/clientes/${cliente.id}`} className="block truncate text-base font-semibold hover:text-acento hover:underline" title="Abrir o cadastro do cliente">
              {cliente.nome}
            </Link>
            <p className="text-suave tabular-nums">
              {[cliente.documento, cliente.telefone ? formatarTelefone(cliente.telefone) : null, cliente.email].filter(Boolean).join(" · ")}
            </p>
            {!cliente.blingContatoId && (
              <p className="flex flex-wrap items-center gap-2 pt-1 text-amber-700">
                Ainda não está no Bling.
                {editar && (
                  <button type="button" onClick={enviarAoBling} disabled={ocupado} className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline disabled:opacity-50">
                    {ocupado ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />} Enviar ao Bling
                  </button>
                )}
              </p>
            )}
            {erro && <p className="text-rose-600" role="alert">{erro}</p>}
          </div>
          <Rotulo texto="A/C">
            <select value={formulario.contatoId} disabled={!editar} onChange={(e) => aoMudar("contatoId", e.target.value)} className={campo}>
              <option value="">{cliente.contatos?.length ? "Sem A/C" : "O cliente não tem contatos"}</option>
              {(cliente.contatos ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                  {c.cargo ? ` (${c.cargo})` : ""}
                </option>
              ))}
            </select>
          </Rotulo>
        </div>
      </SecaoDoAnuncio>
    );
  }

  return (
    <SecaoDoAnuncio titulo="Cliente" ajuda="Busque pelo nome, CPF ou CNPJ: primeiro no Rise, depois no Bling. Sem CPF/CNPJ o cliente fica só nesta proposta; com o documento, o Salvar cadastra no Rise e no Bling.">
      {editar && (
        <div className="relative mb-4 max-w-xl">
          <Search size={16} className="pointer-events-none absolute top-2.5 left-2.5 text-suave" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar cliente por nome, CPF ou CNPJ" className={`${campo} pl-8`} aria-label="Buscar cliente" />
          {buscando && <Loader2 size={16} className="absolute top-2.5 right-2.5 animate-spin text-suave" />}
          {achados && texto.trim().length >= 2 && (
            <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-borda bg-superficie py-1 shadow-lg">
              {achados.rise.length === 0 && achados.bling.length === 0 && !achados.erroBling && <p className="px-3 py-2 text-sm text-suave">Nada achado. Preencha os campos abaixo.</p>}
              {achados.rise.map((c) => (
                <button key={c.id} type="button" disabled={ocupado} onClick={() => escolherDoRise(c.id)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-fundo">
                  <span className="min-w-0 truncate">{c.nome}</span>
                  <span className="shrink-0 text-xs text-suave tabular-nums">{c.documento ?? ""} · Rise</span>
                </button>
              ))}
              {achados.bling.map((c) => (
                <button key={c.blingId} type="button" disabled={ocupado} onClick={() => escolherDoBling(c.blingId)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-fundo">
                  <span className="min-w-0 truncate">{c.nome}</span>
                  <span className="shrink-0 text-xs text-suave tabular-nums">{c.documento ?? "sem documento"} · Bling</span>
                </button>
              ))}
              {achados.erroBling && <p className="px-3 py-2 text-xs text-amber-700">{achados.erroBling}</p>}
            </div>
          )}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Rotulo texto="Nome ou razão social" erro={erros.clienteNome} className="lg:col-span-2">
          <input value={formulario.clienteNome} disabled={!editar} aria-invalid={Boolean(erros.clienteNome)} onChange={(e) => aoMudar("clienteNome", e.target.value)} className={campo} />
        </Rotulo>
        <Rotulo texto="CPF/CNPJ" erro={erros.clienteDocumento}>
          <input value={formulario.clienteDocumento} disabled={!editar} inputMode="numeric" aria-invalid={Boolean(erros.clienteDocumento)} onChange={(e) => aoMudar("clienteDocumento", e.target.value.replace(/[^\d./-]/g, "").slice(0, 18))} className={`${campo} tabular-nums`} />
        </Rotulo>
        <Rotulo texto="Telefone" erro={erros.clienteTelefone}>
          <input
            value={formulario.clienteTelefone}
            disabled={!editar}
            inputMode="tel"
            onChange={(e) => aoMudar("clienteTelefone", e.target.value.replace(/[^\d()+\s-]/g, "").slice(0, 20))}
            onBlur={(e) => aoMudar("clienteTelefone", formatarTelefone(e.target.value))}
            className={`${campo} tabular-nums`}
          />
        </Rotulo>
        <Rotulo texto="E-mail" erro={erros.clienteEmail} className="lg:col-span-2">
          <input type="email" value={formulario.clienteEmail} disabled={!editar} aria-invalid={Boolean(erros.clienteEmail)} onChange={(e) => aoMudar("clienteEmail", e.target.value)} className={campo} />
        </Rotulo>
      </div>
      {erro && <p className="mt-2 text-sm text-rose-600" role="alert">{erro}</p>}
    </SecaoDoAnuncio>
  );
}
