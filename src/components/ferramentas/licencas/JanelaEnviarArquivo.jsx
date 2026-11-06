"use client";

import { useState, useTransition } from "react";

import { enviarArquivoAcao } from "@/app/ferramentas/licencas/acoes";
import ConclusaoDoEnvio from "@/components/ui/ConclusaoDoEnvio";

import { CLASSE_CAMPO, CLASSE_PRINCIPAL } from "./formato";
import Janela from "./Janela";

/**
 * Enviar o arquivo da licenca (Mach3): o `.dat` solto ou um `.zip` com um unico arquivo dentro. Vira a versao seguinte
 * e a atual; as anteriores ficam (nunca se apaga arquivo de licenca). O envio que deu certo termina no ConclusaoDoEnvio.
 */
export default function JanelaEnviarArquivo({ licenca, aoFechar }) {
  const [arquivo, setArquivo] = useState(null);
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState(null);
  const [concluido, setConcluido] = useState(null);
  const [ocupado, iniciar] = useTransition();

  function enviar(evento) {
    evento.preventDefault();
    setErro(null);
    iniciar(async () => {
      const dados = new FormData();
      dados.set("licencaId", licenca.id);
      if (arquivo) dados.set("arquivo", arquivo);
      dados.set("observacao", observacao);
      const resultado = await enviarArquivoAcao(dados);
      if (resultado?.ok) setConcluido(resultado.versao);
      else setErro(resultado?.erro ?? "Não foi possível enviar.");
    });
  }

  if (concluido) {
    return <ConclusaoDoEnvio titulo="Arquivo enviado" mensagem={`${licenca.identificador}: a versão ${concluido} é a atual agora. As anteriores continuam guardadas.`} aoFechar={aoFechar} />;
  }

  return (
    <Janela
      titulo="Enviar arquivo da licença"
      subtitulo={licenca.identificador}
      alterado={Boolean(arquivo) || Boolean(observacao)}
      aoFechar={aoFechar}
      largura="max-w-md"
      rodape={(pedirFechar) => (
        <>
          <button type="button" onClick={pedirFechar} className="ml-auto rounded-md px-3 py-1.5 text-sm text-suave transition-colors hover:bg-fundo hover:text-texto">
            Cancelar
          </button>
          <button type="submit" form="form-arquivo-licenca" disabled={ocupado || !arquivo} title={arquivo ? undefined : "Escolha o arquivo"} className={CLASSE_PRINCIPAL}>
            {ocupado ? "Enviando…" : "Enviar"}
          </button>
        </>
      )}
    >
      <form id="form-arquivo-licenca" onSubmit={enviar} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-suave">Arquivo (.dat ou .zip com um arquivo)</span>
          <input type="file" autoFocus onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-borda file:bg-superficie file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-fundo" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-suave">Observação</span>
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Ex.: troca de PC do cliente" className={CLASSE_CAMPO} />
        </label>
        {erro && (
          <p role="alert" className="text-sm text-red-600">
            {erro}
          </p>
        )}
      </form>
    </Janela>
  );
}
