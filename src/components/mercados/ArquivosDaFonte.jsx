"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp, Info, Trash2 } from "lucide-react";

import {
  apagarArquivosAcao,
  enviarArquivosDaFonte,
  salvarInstrucoes,
} from "@/app/mercados/acoes";

/**
 * A lista que o fornecedor mandou, guardada na fonte.
 *
 * Fornecedor nao tem vitrine para varrer — a Fortek e um portal atras de login,
 * a Santana so mostra preco a cliente cadastrado. O caminho e o operador trazer
 * o arquivo, e e daqui que ele sobe.
 *
 * O ENVIO NAO PROCESSA. Guardar termina em segundos; ler uma planilha de 15 MB
 * com 459 imagens ancoradas, nao. Quem le e o worker, em "Atualizar tabelas",
 * pelo mesmo caminho da varredura.
 */

/// Teto do corpo de uma Server Action, declarado no next.config.mjs. Conferido
/// aqui ANTES de enviar porque, passando disso, o 413 vem antes do nosso codigo
/// e o operador ve erro de rede sem explicacao. Medido: a Fortek manda 10,8 +
/// 6,0 MB e a Nightech 15,3 MB — cabem, com pouca folga.
const TETO_MB = 24;

const FORMATOS = ".html,.htm,.pdf,.xlsx,.xls,.csv,.json";

function comoData(valor) {
  if (!valor) return null;
  return new Date(valor).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export default function ArquivosDaFonte({ fonte }) {
  const entrada = useRef(null);
  const [erro, setErro] = useState(null);
  const [anotando, setAnotando] = useState(false);
  const [pendente, iniciarTransicao] = useTransition();

  function salvarAnotacao(evento) {
    evento.preventDefault();
    const texto = new FormData(evento.currentTarget).get("instrucoes");

    iniciarTransicao(async () => {
      await salvarInstrucoes(fonte.id, texto);
      setAnotando(false);
    });
  }

  const manifesto = fonte.manifesto;
  const quantos = manifesto?.arquivos?.length ?? 0;

  function escolher(evento) {
    const arquivos = [...(evento.target.files ?? [])];
    if (arquivos.length === 0) return;

    const total = arquivos.reduce((soma, arquivo) => soma + arquivo.size, 0);
    if (total > TETO_MB * 1024 * 1024) {
      setErro(
        `${(total / 1024 / 1024).toFixed(1)} MB passa do teto de ${TETO_MB} MB. ` +
          "Envie um arquivo por vez.",
      );
      evento.target.value = "";
      return;
    }

    setErro(null);
    const dados = new FormData();
    for (const arquivo of arquivos) dados.append("arquivo", arquivo);

    iniciarTransicao(async () => {
      const resposta = await enviarArquivosDaFonte(fonte.id, dados);
      if (!resposta.ok) setErro(resposta.erro);
    });

    evento.target.value = "";
  }

  function apagar() {
    iniciarTransicao(async () => {
      await apagarArquivosAcao(fonte.id);
    });
  }

  return (
    <div className="text-xs">
      <input
        ref={entrada}
        type="file"
        multiple
        accept={FORMATOS}
        onChange={escolher}
        className="hidden"
      />

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => entrada.current?.click()}
          disabled={pendente}
          title="PDF, HTML, Excel ou CSV. Cada envio substitui a lista anterior."
          className="inline-flex items-center gap-1.5 rounded border border-borda px-2 py-1 font-medium hover:bg-fundo disabled:opacity-50"
        >
          <FileUp size={13} />
          {pendente ? "Enviando..." : quantos > 0 ? "Trocar lista" : "Enviar lista"}
        </button>

        {/*
          Como obter a lista: onde baixar, com que login, qual aba exportar.
          Fica marcado quando ja ha anotacao, para se saber que existe sem abrir.
        */}
        <button
          type="button"
          onClick={() => setAnotando((antes) => !antes)}
          title={fonte.instrucoes ?? "Anotar como baixar e enviar a lista"}
          aria-label="Instrucoes desta fonte"
          className={`rounded border p-1 ${
            fonte.instrucoes
              ? "border-acento text-acento"
              : "border-borda text-suave hover:bg-fundo"
          }`}
        >
          <Info size={13} />
        </button>
      </div>

      {anotando && (
        <form
          onSubmit={salvarAnotacao}
          className="mt-1.5 w-64 rounded border border-borda bg-fundo p-2"
        >
          <textarea
            name="instrucoes"
            defaultValue={fonte.instrucoes ?? ""}
            rows={5}
            placeholder="Ex.: entrar no portal, menu Pedidos, Ctrl+S como pagina completa. A lista de reserva vem no mesmo menu."
            className="w-full rounded border border-borda bg-superficie p-1.5 text-xs"
          />
          {/* Senha nao entra aqui: o campo e texto simples e aparece na tela. */}
          <p className="mt-1 text-suave">Nao anote senha aqui.</p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="submit"
              disabled={pendente}
              className="rounded bg-acento px-2 py-1 font-medium text-white disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              type="button"
              onClick={() => setAnotando(false)}
              className="rounded border border-borda px-2 py-1"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/*
        A DATA DA LISTA, e nao a da varredura. Um preco de tres semanas atras
        parece atual na tela sem este numero — a fonte por arquivo pareceria tao
        fresca quanto a vitrine varrida agora.
      */}
      {quantos > 0 && (
        <div className="mt-1 flex items-center gap-1.5 text-suave">
          <span title={manifesto.arquivos.map((a) => a.nome).join(", ")}>
            {quantos} arquivo(s) · {comoData(manifesto.enviadoEm)}
          </span>
          <button
            type="button"
            onClick={apagar}
            disabled={pendente}
            title="Descartar a lista guardada"
            aria-label="Descartar a lista guardada"
            className="rounded p-0.5 hover:bg-fundo hover:text-erro"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}

      {erro && <p className="mt-1 max-w-48 text-erro">{erro}</p>}
    </div>
  );
}
