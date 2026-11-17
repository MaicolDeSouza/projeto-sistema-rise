"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FileUp, Loader2, Paperclip, Trash2 } from "lucide-react";

import { anexarCotacaoAcao, conferirPedidoDeVendaAcao, excluirAnexoAcao } from "@/app/propostas/acoes";
import Pergunta from "@/components/compras/Pergunta";
import { MOTIVOS_DE_RECUSA, dataBR, hojeEmSaoPaulo, somarDias } from "@/lib/propostas/regras";
import { campo, Rotulo } from "./CartaoCliente";

/** "Recusar": o motivo e obrigatorio (preco, prazo, comprou de outro, desistiu, outro) e um texto opcional. */
export function JanelaRecusar({ numero, ocupado, aoRecuar, aoConfirmar }) {
  const [motivo, setMotivo] = useState("");
  const [texto, setTexto] = useState("");
  return (
    <Pergunta titulo={`Recusar a proposta ${numero}?`} confirmar="Marcar como recusada" destrutiva ocupado={ocupado || !motivo} aoRecuar={aoRecuar} aoConfirmar={() => motivo && aoConfirmar({ motivo, motivoTexto: texto })}>
      <div className="mt-2 space-y-3 text-texto">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Motivo">
          {Object.entries(MOTIVOS_DE_RECUSA).map(([valor, rotulo]) => (
            <label key={valor} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${motivo === valor ? "border-acento bg-acento/10 font-medium text-acento" : "border-borda text-suave hover:text-texto"}`}>
              <input type="radio" name="motivo" value={valor} checked={motivo === valor} onChange={() => setMotivo(valor)} className="sr-only" />
              {rotulo}
            </label>
          ))}
        </div>
        <textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value.slice(0, 500))} placeholder="Detalhe (opcional)" className={campo} />
      </div>
    </Pergunta>
  );
}

/** "Registrar contato": o que foi falado e a proxima data (atalhos de 2, 7 e 15 dias). */
export function JanelaContato({ numero, contatos = [], ocupado, aoRecuar, aoConfirmar }) {
  const hoje = hojeEmSaoPaulo();
  const [texto, setTexto] = useState("");
  const [proximo, setProximo] = useState(somarDias(hoje, 2));
  return (
    <Pergunta titulo={`Contato da proposta ${numero}`} confirmar="Registrar contato" ocupado={ocupado || !texto.trim()} aoRecuar={aoRecuar} aoConfirmar={() => texto.trim() && aoConfirmar({ texto, proximoContato: proximo })}>
      <div className="mt-2 space-y-3 text-texto">
        <textarea autoFocus rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="O que foi falado" className={campo} />
        <div className="flex flex-wrap items-end gap-2">
          <Rotulo texto="Próximo contato">
            <input type="date" value={proximo} onChange={(e) => setProximo(e.target.value)} className={`${campo} w-40`} />
          </Rotulo>
          {[2, 7, 15].map((dias) => (
            <button key={dias} type="button" onClick={() => setProximo(somarDias(hoje, dias))} className="rounded-md border border-borda px-2.5 py-2 text-xs hover:bg-fundo">
              +{dias} dias
            </button>
          ))}
          <button type="button" onClick={() => setProximo("")} className="rounded-md px-2.5 py-2 text-xs text-suave hover:text-texto">
            Sem data
          </button>
        </div>
        {/* O historico dos contatos dentro da janela (17/11/2026): saiu da aba Contatos do card "Notas e anexos", e sem
            isto o que foi registrado nao aparecia em lugar nenhum. O mais novo primeiro. */}
        {contatos.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-suave">Contatos anteriores ({contatos.length})</p>
            <ol className="max-h-48 space-y-1.5 overflow-y-auto text-sm">
              {contatos.map((c) => (
                <li key={c.id} className="rounded-md border border-borda px-3 py-2">
                  <p className="text-xs text-suave tabular-nums">
                    {new Date(c.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · {c.quem}
                    {c.proximoContato && ` · próximo: ${dataBR(c.proximoContato)}`}
                  </p>
                  <p className="mt-0.5 whitespace-pre-line">{c.texto}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Pergunta>
  );
}

/** "Gerar pedido de venda": lista os impedimentos (lidos no servidor) ou o que vai ao Bling, antes de confirmar. */
export function JanelaPedidoDeVenda({ proposta, ocupado, aoRecuar, aoConfirmar, moeda }) {
  const [impedimentos, setImpedimentos] = useState(null);
  useEffect(() => {
    let vivo = true;
    conferirPedidoDeVendaAcao(proposta.numero).then((r) => vivo && setImpedimentos(r?.ok ? r.impedimentos : [r?.erro ?? "Não foi possível conferir."]));
    return () => {
      vivo = false;
    };
  }, [proposta.numero]);
  const pode = impedimentos && impedimentos.length === 0;
  return (
    <Pergunta titulo="Gerar pedido de venda no Bling?" confirmar="Gerar pedido" ocupado={ocupado || !pode} aoRecuar={aoRecuar} aoConfirmar={() => pode && aoConfirmar()}>
      {!impedimentos ? (
        <span className="inline-flex items-center gap-1.5">
          <Loader2 size={14} className="animate-spin" /> Conferindo…
        </span>
      ) : pode ? (
        <span className="block text-texto">
          {proposta.clienteNome}, {proposta.itens.length} {proposta.itens.length === 1 ? "item" : "itens"}, total {moeda.format(proposta.totais.total)}
          {proposta.ocCliente ? `, OC ${proposta.ocCliente}` : ""}. O pedido volta sozinho para Vendas em alguns minutos.
        </span>
      ) : (
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-rose-700">
          {impedimentos.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </Pergunta>
  );
}

/**
 * Uma lista de anexos da proposta (aba "Anexos" do card "Notas e anexos", 17/11/2026): a OC do cliente ou os gerais.
 * Anexar (varios de uma vez), baixar e excluir; grava na hora, fora do Salvar.
 */
export function AnexosDaProposta({ numero, tipo = "GERAL", titulo, rotuloDoBotao, aceita, anexos, editar, aoAtualizar }) {
  const [erro, setErro] = useState(null);
  const [excluindo, setExcluindo] = useState(null);
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef(null);

  const enviar = (arquivos) =>
    iniciar(async () => {
      const dados = new FormData();
      dados.set("numero", String(numero));
      dados.set("tipo", tipo);
      for (const arquivo of arquivos) dados.append("arquivo", arquivo);
      const resposta = await anexarCotacaoAcao(dados);
      if (entrada.current) entrada.current.value = "";
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível anexar.");
      setErro(null);
      aoAtualizar(resposta.proposta);
    });

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-suave">{titulo}</p>
      {anexos.length === 0 && <p className="text-sm text-suave">Nenhum arquivo.</p>}
      <ul className="space-y-1.5">
        {anexos.map((a) => (
          <li key={a.id} className="flex items-center gap-2 text-sm">
            <Paperclip size={14} className="shrink-0 text-suave" />
            <a href={`/api/propostas/anexos/${a.id}`} target="_blank" rel="noreferrer" className="min-w-0 truncate hover:text-acento hover:underline">
              {a.nomeOriginal}
            </a>
            <span className="shrink-0 text-xs text-suave tabular-nums">{(a.tamanho / 1024).toFixed(0)} KB</span>
            {editar && (
              <button type="button" onClick={() => setExcluindo(a)} aria-label={`Excluir ${a.nomeOriginal}`} title="Excluir" className="rounded p-1 text-suave hover:bg-rose-50 hover:text-rose-600">
                <Trash2 size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editar && (
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-borda px-3 py-2 text-sm hover:bg-fundo">
          {ocupado ? <Loader2 size={15} className="animate-spin" /> : <FileUp size={15} />} {rotuloDoBotao}
          <input ref={entrada} type="file" multiple accept={aceita} className="sr-only" onChange={(e) => e.target.files?.length && enviar([...e.target.files])} />
        </label>
      )}
      {erro && <p className="text-sm text-rose-600" role="alert">{erro}</p>}
      {excluindo && (
        <Pergunta
          titulo="Excluir o anexo?"
          confirmar="Excluir"
          destrutiva
          ocupado={ocupado}
          aoRecuar={() => setExcluindo(null)}
          aoConfirmar={() =>
            iniciar(async () => {
              const resposta = await excluirAnexoAcao(numero, excluindo.id);
              setExcluindo(null);
              if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível excluir.");
              aoAtualizar(resposta.proposta);
            })
          }
        >
          {excluindo.nomeOriginal} sai da proposta; não dá para desfazer.
        </Pergunta>
      )}
    </div>
  );
}
