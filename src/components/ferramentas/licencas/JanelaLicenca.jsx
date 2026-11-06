"use client";

import { useMemo, useState, useTransition } from "react";

import { criarLicencaAcao, editarLicencaAcao, excluirLicencaAcao, oQueSaiComALicencaAcao } from "@/app/ferramentas/licencas/acoes";
import Pergunta from "@/components/compras/Pergunta";

import { CLASSE_CAMPO, CLASSE_PRINCIPAL, diaParaCampo } from "./formato";
import Janela from "./Janela";

const Rotulo = ({ children }) => <span className="mb-1 block text-xs font-medium text-suave">{children}</span>;

/**
 * Nova licenca e Editar licenca (spec §6.6). A chave (ou o nome licenciado do Mach3) so se digita na criacao e e unica
 * no programa; no programa de arquivo o arquivo e obrigatorio. Editar mexe no que o dono digita (tipo, datas,
 * observacoes, arquivar); o que o portal leu nao passa por aqui. Excluir lista antes o que sai junto.
 */
export default function JanelaLicenca({ programa, licenca = null, tipos = [], podeExcluir, aoFechar }) {
  const ehChave = programa.identificacao === "CHAVE";
  const inicial = useMemo(
    () => ({
      identificador: "",
      tipo: licenca?.tipo ?? "",
      compradaEm: diaParaCampo(licenca?.compradaEm),
      renovadaEm: diaParaCampo(licenca?.renovadaEm),
      observacoes: licenca?.observacoes ?? "",
      arquivada: licenca?.arquivada ?? false,
    }),
    [licenca],
  );
  const [campos, setCampos] = useState(inicial);
  const [arquivo, setArquivo] = useState(null);
  const [erro, setErro] = useState(null);
  const [saida, setSaida] = useState(null);
  const [ocupado, iniciar] = useTransition();
  // A leitura do que sai com a licenca tem o proprio estado: com o mesmo do Salvar, o botao dizia "Salvando…".
  const [lendo, iniciarLeitura] = useTransition();
  const mudar = (campo, valor) => setCampos((atuais) => ({ ...atuais, [campo]: valor }));
  const alterado = JSON.stringify(campos) !== JSON.stringify(inicial) || Boolean(arquivo);

  function salvar(evento) {
    evento.preventDefault();
    setErro(null);
    iniciar(async () => {
      let resultado;
      if (licenca) {
        resultado = await editarLicencaAcao(licenca.id, campos);
      } else {
        const dados = new FormData();
        dados.set("softwareId", programa.id);
        for (const [campo, valor] of Object.entries(campos)) if (campo !== "arquivada") dados.set(campo, String(valor ?? ""));
        if (arquivo) dados.set("arquivo", arquivo);
        resultado = await criarLicencaAcao(dados);
      }
      if (resultado?.ok) aoFechar();
      else setErro(resultado?.erro ?? "Não foi possível salvar.");
    });
  }

  function perguntarExclusao() {
    setErro(null);
    iniciarLeitura(async () => {
      const resposta = await oQueSaiComALicencaAcao(licenca.id);
      if (resposta?.ok) setSaida(resposta.resumo);
      else setErro(resposta?.erro ?? "Não foi possível ler a licença.");
    });
  }

  function excluir() {
    iniciar(async () => {
      const resultado = await excluirLicencaAcao(licenca.id);
      setSaida(null);
      if (resultado?.ok) aoFechar();
      else setErro(resultado?.erro ?? "Não foi possível excluir.");
    });
  }

  const nomeDoCampo = ehChave ? "Chave" : "Nome licenciado";

  return (
    <Janela
      titulo={licenca ? "Editar licença" : `Nova licença do ${programa.nome}`}
      subtitulo={licenca?.identificador}
      alterado={alterado}
      aoFechar={aoFechar}
      rodape={(pedirFechar) => (
        <>
          {licenca && podeExcluir && (
            <button type="button" onClick={perguntarExclusao} disabled={ocupado || lendo} className="rounded-md px-2 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50">
              Excluir licença
            </button>
          )}
          <button type="button" onClick={pedirFechar} className="ml-auto rounded-md px-3 py-1.5 text-sm text-suave transition-colors hover:bg-fundo hover:text-texto">
            Cancelar
          </button>
          <button type="submit" form="form-licenca" disabled={ocupado} className={CLASSE_PRINCIPAL}>
            {ocupado ? "Salvando…" : "Salvar"}
          </button>
        </>
      )}
    >
      <form id="form-licenca" onSubmit={salvar} className="grid grid-cols-2 gap-x-4 gap-y-3">
        {!licenca && (
          <label className="col-span-2 block">
            <Rotulo>{nomeDoCampo}</Rotulo>
            <input
              required
              autoFocus
              value={campos.identificador}
              onChange={(e) => mudar("identificador", e.target.value)}
              placeholder={ehChave ? "XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXX" : "Mach3 XXXX"}
              className={`${CLASSE_CAMPO} ${ehChave ? "font-mono text-[13px] uppercase" : ""}`}
            />
          </label>
        )}
        {ehChave && (
          <label className="block">
            <Rotulo>Tipo</Rotulo>
            <input list="tipos-de-licenca" value={campos.tipo} onChange={(e) => mudar("tipo", e.target.value)} placeholder="Core ou Pro" className={CLASSE_CAMPO} />
            <datalist id="tipos-de-licenca">
              {[...new Set([...tipos, "Core", "Pro"])].map((tipo) => (
                <option key={tipo} value={tipo} />
              ))}
            </datalist>
          </label>
        )}
        <label className="block">
          <Rotulo>Comprada em</Rotulo>
          <input type="date" value={campos.compradaEm} onChange={(e) => mudar("compradaEm", e.target.value)} className={`${CLASSE_CAMPO} tabular-nums`} />
        </label>
        {ehChave && (
          <label className="block">
            <Rotulo>Renovada em</Rotulo>
            <input type="date" value={campos.renovadaEm} onChange={(e) => mudar("renovadaEm", e.target.value)} className={`${CLASSE_CAMPO} tabular-nums`} />
          </label>
        )}
        {!licenca && !ehChave && (
          <label className="col-span-2 block">
            <Rotulo>Arquivo da licença</Rotulo>
            <input type="file" required onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-borda file:bg-superficie file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-fundo" />
          </label>
        )}
        <label className="col-span-2 block">
          <Rotulo>Observações</Rotulo>
          <textarea rows={2} value={campos.observacoes} onChange={(e) => mudar("observacoes", e.target.value)} className={`${CLASSE_CAMPO} resize-y`} />
        </label>
        {licenca && (
          <label className="col-span-2 inline-flex items-center gap-2 text-sm" title="Fora da lista normal (chave perdida, devolvida); nada é apagado">
            <input type="checkbox" checked={campos.arquivada} onChange={(e) => mudar("arquivada", e.target.checked)} className="h-4 w-4 accent-acento" />
            Arquivar esta licença
          </label>
        )}
        {erro && (
          <p role="alert" className="col-span-2 text-sm text-red-600">
            {erro}
          </p>
        )}
      </form>

      {saida && (
        <Pergunta titulo={`Excluir a licença ${saida.identificador}?`} confirmar="Excluir" destrutiva ocupado={ocupado} aoRecuar={() => setSaida(null)} aoConfirmar={excluir}>
          {saida.linhas + saida.ativacoes + saida.arquivos.length === 0 ? (
            <span className="block">A licença não tem linhas de cliente, PCs lidos do portal nem arquivo.</span>
          ) : (
            <>
              <span className="block">Sai do Rise junto com ela:</span>
              <ul className="mt-1 list-disc pl-5">
                {saida.linhas > 0 && <li>{saida.linhas === 1 ? "1 linha de cliente" : `${saida.linhas} linhas de cliente`}</li>}
                {saida.ativacoes > 0 && <li>{saida.ativacoes === 1 ? "1 PC lido do portal" : `${saida.ativacoes} PCs lidos do portal`}</li>}
                {saida.arquivos.map((versao) => (
                  <li key={versao.versao}>
                    Arquivo v{versao.versao}: {versao.nomeOriginal}
                  </li>
                ))}
              </ul>
              <span className="mt-1 block">Os clientes continuam no cadastro.</span>
            </>
          )}
        </Pergunta>
      )}
    </Janela>
  );
}
