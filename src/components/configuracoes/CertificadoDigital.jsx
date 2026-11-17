"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, ShieldCheck, Trash2, Upload } from "lucide-react";

import { enviarCertificadoAcao, removerCertificadoAcao } from "@/app/configuracoes/empresa/acoes-certificado";
import { CLASSE_CAMPO } from "@/components/cadastros/Campo";
import PopupExclusao from "@/components/cadastros/PopupExclusao";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import Card from "@/components/ui/Card";

const dataBR = (iso) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));

/**
 * Certificado digital da empresa (e-CNPJ A1, 17/11/2026): assina o PDF das propostas marcadas "Assinar digitalmente".
 * Nesta tela o operador precisa ver primeiro QUEM assina e ATE QUANDO; a acao principal e enviar (ou trocar) o .pfx com a
 * senha. A senha nunca volta do servidor: o campo some depois do envio.
 */
export default function CertificadoDigital({ inicial = null, podeEditar }) {
  const [situacao, setSituacao] = useState(inicial);
  const [trocando, setTrocando] = useState(!inicial);
  const [arquivo, setArquivo] = useState(null);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [removendo, setRemovendo] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef(null);

  function enviar(evento) {
    evento.preventDefault();
    setErro(null);
    const dados = new FormData();
    if (arquivo) dados.set("arquivo", arquivo);
    dados.set("senha", senha);
    iniciar(async () => {
      const resposta = await enviarCertificadoAcao(dados);
      if (!resposta?.ok) {
        setErro(resposta?.erro ?? "Não foi possível enviar o certificado.");
        return;
      }
      setSituacao(resposta.situacao);
      setTrocando(false);
      setArquivo(null);
      setSenha("");
    });
  }

  function remover() {
    iniciar(async () => {
      const resposta = await removerCertificadoAcao();
      if (!resposta?.ok) {
        setErro(resposta?.erro ?? "Não foi possível remover o certificado.");
        return;
      }
      setSituacao(null);
      setTrocando(true);
      setRemovendo(false);
    });
  }

  function cancelarTroca() {
    setTrocando(false);
    setErro(null);
    setArquivo(null);
    setSenha("");
  }

  const corDaValidade = !situacao ? "" : situacao.vencido ? "text-rose-600" : situacao.diasParaVencer <= 30 ? "text-amber-700" : "text-suave";

  return (
    <Card>
      <div className="mb-4 flex items-center gap-1.5">
        <h2 className="font-semibold">Certificado digital</h2>
        <BolhaDeAjuda
          variante="inline"
          texto="O e-CNPJ A1 da empresa (arquivo .pfx ou .p12). Assina o PDF das propostas marcadas “Assinar digitalmente”. Fica guardado cifrado; a senha não volta para a tela."
        />
      </div>

      {situacao && (
        <div className="flex flex-wrap items-center gap-3">
          <ShieldCheck size={20} className={situacao.vencido ? "text-rose-600" : "text-emerald-600"} aria-hidden="true" />
          <div className="min-w-0">
            <div className="font-medium">{situacao.razaoSocial}</div>
            <div className="text-sm">
              {situacao.cnpj && <span className="text-suave">CNPJ: {situacao.cnpj} · </span>}
              <span className={corDaValidade}>{situacao.vencido ? `Vencido em ${dataBR(situacao.validoAte)}` : `Vale até ${dataBR(situacao.validoAte)}`}</span>
            </div>
          </div>
          {podeEditar && !trocando && (
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTrocando(true)}
                disabled={ocupado}
                className="inline-flex items-center gap-1.5 rounded-md border border-acento/50 px-3 py-2 text-sm font-semibold text-acento hover:bg-acento/5 disabled:opacity-50"
              >
                <Upload size={15} />
                Trocar certificado
              </button>
              <button
                type="button"
                onClick={() => setRemovendo(true)}
                disabled={ocupado}
                aria-label="Remover o certificado"
                title="Remover o certificado"
                className="rounded p-2 text-suave hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              >
                <Trash2 size={15} />
              </button>
            </div>
          )}
        </div>
      )}

      {!situacao && !podeEditar && <p className="text-sm text-suave">Nenhum certificado cadastrado.</p>}

      {podeEditar && trocando && (
        <form onSubmit={enviar} className={`flex flex-wrap items-end gap-3 ${situacao ? "mt-4 border-t border-borda pt-4" : ""}`}>
          <input
            ref={entrada}
            type="file"
            accept=".pfx,.p12,application/x-pkcs12"
            className="hidden"
            onChange={(evento) => {
              setArquivo(evento.target.files?.[0] ?? null);
              setErro(null);
              evento.target.value = "";
            }}
          />
          <div>
            <span className="mb-1 block text-xs font-medium text-suave">Arquivo</span>
            <button type="button" onClick={() => entrada.current?.click()} className="inline-flex max-w-64 items-center gap-1.5 rounded-md border border-borda px-3 py-2 text-sm hover:bg-fundo">
              <Upload size={15} className="shrink-0" />
              <span className="truncate">{arquivo ? arquivo.name : "Escolher .pfx ou .p12"}</span>
            </button>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-suave">Senha do certificado</span>
            <input type="password" autoComplete="off" aria-label="Senha do certificado" value={senha} onChange={(evento) => setSenha(evento.target.value)} className={`${CLASSE_CAMPO} w-56`} />
          </label>
          <button
            type="submit"
            disabled={ocupado || !arquivo || !senha}
            className="inline-flex items-center gap-1.5 rounded-md bg-acento px-4 py-2 text-sm font-semibold text-white hover:bg-acento/90 disabled:opacity-50"
          >
            {ocupado && <Loader2 size={15} className="animate-spin" />}
            Enviar certificado
          </button>
          {situacao && (
            <button type="button" onClick={cancelarTroca} className="px-2 py-2 text-sm text-suave hover:text-texto">
              Cancelar
            </button>
          )}
        </form>
      )}

      {erro && <p className="mt-2 text-sm text-rose-600">{erro}</p>}

      {removendo && (
        <PopupExclusao
          titulo="Remover o certificado digital?"
          nome={`${situacao?.razaoSocial ?? ""}${situacao?.cnpj ? ` · CNPJ: ${situacao.cnpj}` : ""}`}
          aviso="As propostas marcadas “Assinar digitalmente” passam a sair sem assinatura."
          rotulo="Remover"
          pendente={ocupado}
          erro={null}
          aoConfirmar={remover}
          aoCancelar={() => setRemovendo(false)}
        />
      )}
    </Card>
  );
}
