"use client";

import { propsDoFundo } from "@/lib/fundoDaJanela";
import { useState, useTransition } from "react";
import { Loader, X } from "lucide-react";

import { alternarConferido } from "@/app/produtos/acoes";
import MarcaNaoAnunciar from "./MarcaNaoAnunciar";

// Provisorio, a pedido do dono: o codigo real vem depois. Fica no cliente de
// proposito, e so um controle interno de conferencia, nao uma protecao.
const CODIGO_PROVISORIO = "123";

// Nomes das secoes da proposta automatica na pergunta do Conferido (os mesmos do quadro "Proposta" do cadastro).
const NOMES_DAS_SECOES = {
  titulos: "Título", descricao: "Descrição", campos: "Campos", preco: "Preço", ean: "EAN", fotos: "Fotos",
};

/**
 * Marca "produto totalmente conferido" — controle interno do dono. Clicar abre
 * um popup que pede o codigo; so com o codigo certo a marca alterna.
 *
 * Grava no banco (pedido do dono em 22/09/2026, `Produto.conferido`): antes
 * vivia so na tela e sumia ao recarregar, o que impedia contar "quantos ja
 * foram verificados" de verdade. `produto.conferido` e o valor vindo do
 * servidor; o clique confirma no popup e so entao chama a acao.
 */
export default function ConferidoProduto({ produto }) {
  const conferido = produto.conferido;
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState(false);
  // Secoes da proposta automatica ainda nao aplicadas (a pergunta antes de apagar a proposta). Null = sem pergunta.
  const [pendentes, setPendentes] = useState(null);
  const [pendente, iniciarTransicao] = useTransition();

  function abrir() {
    setCodigo("");
    setErro(false);
    setAberto(true);
  }

  function confirmar(evento) {
    evento.preventDefault();
    if (codigo.trim() !== CODIGO_PROVISORIO) {
      setErro(true);
      return;
    }
    iniciarTransicao(async () => {
      const resposta = await alternarConferido(produto.id, !conferido);
      // Proposta automatica com secao nao aplicada: a janela vira a pergunta, e nada foi conferido ainda.
      if (resposta?.pendentes) {
        setPendentes(resposta.pendentes);
        return;
      }
      setAberto(false);
    });
  }

  function conferirEApagar() {
    iniciarTransicao(async () => {
      await alternarConferido(produto.id, true, { apagarProposta: true });
      setPendentes(null);
      setAberto(false);
    });
  }

  function fechar() {
    setPendentes(null);
    setAberto(false);
  }

  // Cor e selo sozinhos nao dizem o estado: o mesmo texto vai no nome acessivel e na dica.
  const pecasAlteradas = produto.pecasAlteradas ?? 0;
  // Proposta pronta esperando o Conferido (pedido do dono em 22/10/2026): o "P" no canto superior ESQUERDO.
  const propostaPronta = Boolean(produto.propostaPronta) && !conferido;
  const partes = [propostaPronta ? "Proposta pronta, aguardando aprovação" : conferido ? "conferido" : "não conferido (clique para marcar)"];
  if (pecasAlteradas > 0) {
    partes.push(
      `${pecasAlteradas === 1 ? "uma peça do kit mudou" : `${pecasAlteradas} peças do kit mudaram`} desde o último Salvar (abra o kit para ver)`,
    );
  }
  // Produto inativo (28/10/2026): o X vermelho em todos os icones da linha, este incluido.
  const inativo = produto.ativo === false;
  const rotuloDoIcone = `Rise: ${partes.join(" e ")}${inativo ? " (produto inativo)" : ""}`;

  return (
    <>
      {/* Icone "Rise" na coluna Canais, no molde dos outros: verde = conferido, fosco = nao. O selo "!"
          (uma peca do kit mudou desde o ultimo Salvar) fica no canto, como nos icones dos canais. */}
      <button
        type="button"
        onClick={abrir}
        aria-label={rotuloDoIcone}
        title={rotuloDoIcone}
        className="relative shrink-0 rounded hover:ring-2 hover:ring-sky-200 focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className={`flex h-[22px] w-[22px] items-center justify-center rounded text-[13px] leading-none font-bold text-white ${
            conferido ? "bg-emerald-600" : "bg-neutral-500 opacity-70"
          }`}
        >
          R
        </span>
        {inativo && <MarcaNaoAnunciar />}
        {propostaPronta && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -left-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[9px] leading-none font-bold text-amber-950 ring-2 ring-superficie"
          >
            P
          </span>
        )}
        {pecasAlteradas > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-400 text-[10px] leading-none font-bold text-amber-950 ring-2 ring-superficie"
          >
            !
          </span>
        )}
      </button>

      {aberto && pendentes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-left"
          {...propsDoFundo(fechar)}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`pendentes-${produto.id}`}
            className="w-full max-w-sm overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl"
          >
            <div className="space-y-2 p-4 text-sm">
              <h2 id={`pendentes-${produto.id}`} className="font-semibold">
                {pendentes.length === 1 ? "Há 1 item da proposta não aplicado" : `Há ${pendentes.length} itens da proposta não aplicados`}
              </h2>
              <p className="text-suave">Conferir apaga a proposta, e o que não foi aplicado se perde:</p>
              <ul className="list-disc pl-5">
                {pendentes.map((secao) => (
                  <li key={secao}>{NOMES_DAS_SECOES[secao] ?? secao}</li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end gap-2 border-t border-borda p-3">
              <button
                type="button"
                onClick={fechar}
                autoFocus
                disabled={pendente}
                className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={conferirEApagar}
                disabled={pendente}
                className="inline-flex items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {pendente && <Loader size={13} className="animate-spin" />}
                Conferir e apagar
              </button>
            </div>
          </section>
        </div>
      )}

      {aberto && !pendentes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-left"
          {...propsDoFundo(() => setAberto(false))}
        >
          <form
            onSubmit={confirmar}
            role="dialog"
            aria-modal="true"
            aria-label="Código de conferência"
            className="w-full max-w-sm overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-borda p-3">
              <span className="text-sm font-semibold">
                {conferido ? "Desmarcar conferência" : "Marcar como conferido"}
              </span>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Cancelar"
                className="rounded p-1 text-suave hover:bg-fundo"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 p-3 text-sm">
              <p className="truncate font-medium">{produto.tituloBase}</p>
              <label className="block text-xs text-suave" htmlFor={`codigo-${produto.id}`}>
                Digite o código para continuar
              </label>
              <input
                id={`codigo-${produto.id}`}
                type="password"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={codigo}
                onChange={(evento) => {
                  setCodigo(evento.target.value);
                  setErro(false);
                }}
                aria-invalid={erro}
                className={`w-full rounded border bg-superficie px-2.5 py-1.5 ${
                  erro ? "border-red-500" : "border-borda"
                }`}
              />
              {erro && <p className="text-xs text-red-700">Código incorreto.</p>}
            </div>

            <div className="flex justify-end gap-2 border-t border-borda p-3">
              <button
                type="button"
                onClick={() => setAberto(false)}
                disabled={pendente}
                className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pendente}
                className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {pendente && <Loader size={13} className="animate-spin" />}
                Confirmar
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
