"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ExternalLink, Search } from "lucide-react";

import { buscarClientesAcao, criarLinhaAcao, editarLinhaAcao, pedidosDoClienteAcao } from "@/app/ferramentas/licencas/acoes";
import EscolhaEntreOpcoes from "@/components/ui/EscolhaEntreOpcoes";
import { CANAIS_DA_LICENCA, rotuloDoCanal } from "@/lib/ferramentas/licencas/regras";

import { CLASSE_CAMPO, CLASSE_PRINCIPAL, diaEmSaoPaulo, diaParaCampo, hojeParaCampo, pedidoCurto } from "./formato";
import Janela from "./Janela";

function Rotulo({ children, extra = null }) {
  return (
    <span className="mb-1 flex items-center justify-between gap-2 text-xs font-medium text-suave">
      {children}
      {extra}
    </span>
  );
}

/**
 * Vincular cliente a uma vaga da licenca (a acao principal da tela) e editar uma linha. O cliente vem do cadastro e
 * precisa de CPF/CNPJ (o sem documento aparece desabilitado); o pedido e opcional, dos ultimos 180 dias do cliente.
 * `nomeDoPcInicial` vem do "Atribuir à linha…" de um PC do portal sem cliente.
 */
export default function JanelaVincularCliente({ licenca, programa, linha = null, nomeDoPcInicial = "", aoFechar }) {
  const inicial = useMemo(
    () => ({
      clienteId: linha?.cliente?.id ?? null,
      data: linha ? diaParaCampo(linha.data) : hojeParaCampo(),
      canal: linha?.canal ?? null,
      pedidoDeVendaId: linha?.pedido?.id ?? "",
      nomeDoPc: linha?.nomeDoPc ?? nomeDoPcInicial ?? "",
      equipamento: linha?.equipamento ?? "",
      observacoes: linha?.observacoes ?? "",
    }),
    [linha, nomeDoPcInicial],
  );
  const [campos, setCampos] = useState(inicial);
  const [cliente, setCliente] = useState(linha?.cliente ? { ...linha.cliente, temDocumento: true } : null);
  const [texto, setTexto] = useState("");
  const [achados, setAchados] = useState([]);
  const [buscou, setBuscou] = useState(false);
  const [pedidos, setPedidos] = useState(linha?.pedido ? [{ ...linha.pedido, dataDaVenda: null }] : []);
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();
  const mudar = (campo, valor) => setCampos((atuais) => ({ ...atuais, [campo]: valor }));
  const alterado = JSON.stringify(campos) !== JSON.stringify(inicial);

  useEffect(() => {
    const termo = texto.trim();
    if (termo.length < 2) return undefined;
    const relogio = setTimeout(async () => {
      const resposta = await buscarClientesAcao(termo);
      setAchados(resposta?.clientes ?? []);
      setBuscou(true);
      if (!resposta?.ok) setErro(resposta?.erro ?? null);
    }, 300);
    return () => clearTimeout(relogio);
  }, [texto]);

  useEffect(() => {
    if (!campos.clienteId) return undefined;
    let vivo = true;
    pedidosDoClienteAcao(campos.clienteId).then((resposta) => {
      if (vivo && resposta?.ok) setPedidos(resposta.pedidos ?? []);
    });
    return () => {
      vivo = false;
    };
  }, [campos.clienteId]);

  function escolher(achado) {
    setCliente(achado);
    setTexto("");
    setAchados([]);
    setBuscou(false);
    setCampos((atuais) => ({ ...atuais, clienteId: achado.id, pedidoDeVendaId: "" }));
  }

  function salvar(evento) {
    evento?.preventDefault();
    setErro(null);
    iniciar(async () => {
      const resultado = linha ? await editarLinhaAcao(linha.id, campos) : await criarLinhaAcao(licenca.id, campos);
      if (resultado?.ok) aoFechar();
      else setErro(resultado?.erro ?? "Não foi possível salvar.");
    });
  }

  const anotado = linha && !linha.cliente && linha.nomeAnotado;

  return (
    <Janela
      titulo={linha ? "Editar linha" : "Vincular cliente"}
      subtitulo={licenca.identificador}
      alterado={alterado}
      aoFechar={aoFechar}
      largura="max-w-xl"
      rodape={(pedirFechar) => (
        <>
          <button type="button" onClick={pedirFechar} className="ml-auto rounded-md px-3 py-1.5 text-sm text-suave transition-colors hover:bg-fundo hover:text-texto">
            Cancelar
          </button>
          <button type="submit" form="form-linha-licenca" disabled={ocupado || (!campos.clienteId && !anotado)} title={!campos.clienteId && !anotado ? "Escolha o cliente" : undefined} className={CLASSE_PRINCIPAL}>
            {ocupado ? "Salvando…" : "Salvar"}
          </button>
        </>
      )}
    >
      <form id="form-linha-licenca" onSubmit={salvar} className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="col-span-2">
          <Rotulo
            extra={
              <a href="/cadastros/clientes/novo" target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-normal text-acento hover:underline">
                Cadastrar cliente <ExternalLink size={12} aria-hidden="true" />
              </a>
            }
          >
            Cliente
          </Rotulo>
          {anotado && !cliente && <p className="mb-1.5 text-xs text-amber-800">Na planilha: {linha.nomeAnotado} (sem CPF/CNPJ). Escolha o cliente do cadastro.</p>}
          {cliente ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-borda bg-fundo/60 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{cliente.nome}</span>
                {cliente.documento && <span className="text-xs text-suave tabular-nums">{cliente.documento}</span>}
              </span>
              <button
                type="button"
                onClick={() => {
                  setCliente(null);
                  setCampos((atuais) => ({ ...atuais, clienteId: null, pedidoDeVendaId: "" }));
                  setPedidos([]);
                }}
                className="shrink-0 text-xs text-acento hover:underline"
              >
                Trocar
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={15} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-suave" />
                <input type="search" autoFocus value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar cliente pelo nome ou CPF/CNPJ" placeholder="Nome ou CPF/CNPJ" className={`${CLASSE_CAMPO} pl-8`} />
              </div>
              {texto.trim().length >= 2 && (
                <ul className="mt-2 max-h-52 divide-y divide-borda overflow-y-auto rounded-md border border-borda">
                  {achados.map((achado) => (
                    <li key={achado.id}>
                      <button
                        type="button"
                        disabled={!achado.temDocumento}
                        title={achado.temDocumento ? undefined : "sem CPF/CNPJ"}
                        onClick={() => escolher(achado)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                      >
                        <span className="truncate">{achado.nome}</span>
                        <span className="shrink-0 text-xs text-suave tabular-nums">{achado.temDocumento ? (achado.documento ?? "com documento") : "sem CPF/CNPJ"}</span>
                      </button>
                    </li>
                  ))}
                  {buscou && achados.length === 0 && <li className="px-3 py-2 text-sm text-suave">Nenhum cliente com esse nome ou documento.</li>}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="col-span-2">
          <Rotulo>Canal</Rotulo>
          <EscolhaEntreOpcoes nome="canal" rotulo="Canal da venda" opcoes={CANAIS_DA_LICENCA} valor={campos.canal} aoMudar={(valor) => mudar("canal", valor)} />
        </div>

        <label className="block">
          <Rotulo>Data</Rotulo>
          <input type="date" value={campos.data} onChange={(e) => mudar("data", e.target.value)} className={`${CLASSE_CAMPO} tabular-nums`} />
        </label>
        <label className="block">
          <Rotulo>Pedido</Rotulo>
          <select value={campos.pedidoDeVendaId} onChange={(e) => mudar("pedidoDeVendaId", e.target.value)} disabled={!campos.clienteId} className={CLASSE_CAMPO}>
            <option value="">{campos.clienteId ? (pedidos.length ? "Nenhum" : "Nenhum pedido nos últimos 180 dias") : "Escolha o cliente primeiro"}</option>
            {pedidos.map((pedido) => (
              <option key={pedido.id} value={pedido.id}>
                {pedidoCurto(pedido.numero)} · {rotuloDoCanal(pedido.canal)}
                {pedido.dataDaVenda ? ` · ${diaEmSaoPaulo(pedido.dataDaVenda)}` : ""}
              </option>
            ))}
          </select>
        </label>

        {programa.temPortal && (
          <label className="block">
            <Rotulo>Nome do PC</Rotulo>
            <input value={campos.nomeDoPc} onChange={(e) => mudar("nomeDoPc", e.target.value)} placeholder="DESKTOP-…" className={`${CLASSE_CAMPO} font-mono text-[13px]`} />
          </label>
        )}
        <label className={`block ${programa.temPortal ? "" : "col-span-2"}`}>
          <Rotulo>Equipamento</Rotulo>
          <input value={campos.equipamento} onChange={(e) => mudar("equipamento", e.target.value)} className={CLASSE_CAMPO} />
        </label>

        <label className="col-span-2 block">
          <Rotulo>Observações</Rotulo>
          <textarea rows={2} value={campos.observacoes} onChange={(e) => mudar("observacoes", e.target.value)} className={`${CLASSE_CAMPO} resize-y`} />
        </label>

        {erro && (
          <p role="alert" className="col-span-2 text-sm text-red-600">
            {erro}
          </p>
        )}
      </form>
    </Janela>
  );
}
