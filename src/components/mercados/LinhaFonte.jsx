"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, ExternalLink, Loader, Pause, Pencil, Play, Trash2 } from "lucide-react";

import Badge from "@/components/ui/Badge";
import {
  alternarFonte,
  contarPaginas,
  editarFonte,
  excluirFonte,
} from "@/app/mercados/acoes";

/// Quantas colunas a tabela tem. As linhas de apoio (erro, confirmacao, edicao)
/// abrem embaixo com colSpan, e um numero errado aqui desalinha a tabela toda.
const COLUNAS = 6;

function comoData(valor) {
  if (!valor) return "nunca";
  return new Date(valor).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function comoNumero(valor) {
  return typeof valor === "number" ? valor.toLocaleString("pt-BR") : "—";
}

export default function LinhaFonte({ fonte }) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [confirmando, setConfirmando] = useState(null);
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState(null);

  // O endereco completo, para o link abrir o site. O dominio guardado nao tem
  // esquema, e <a href="www.loja.com"> vira caminho relativo do nosso proprio
  // site — o clique levaria a /mercados/www.loja.com.
  const enderecoDoSite = `https://${fonte.dominio}${fonte.prefixoUrl ?? ""}`;

  function alternar() {
    setErro(null);
    iniciarTransicao(async () => {
      const resultado = await alternarFonte(fonte.id);
      if (!resultado.ok) setErro(resultado.erro);
      else router.refresh();
    });
  }

  /**
   * Excluir apaga a fonte E as paginas dela. Pausar so interrompe a varredura.
   *
   * Sao coisas diferentes de proposito, e a contagem aparece antes: apagar tres
   * mil paginas de historico porque alguem quis parar de acompanhar uma loja
   * seria um estrago silencioso.
   */
  function pedirExclusao() {
    setErro(null);
    iniciarTransicao(async () => {
      setConfirmando(await contarPaginas(fonte.id));
    });
  }

  function excluir() {
    iniciarTransicao(async () => {
      await excluirFonte(fonte.id);
      setConfirmando(null);
      router.refresh();
    });
  }

  function salvarEdicao(evento) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);

    setErro(null);
    iniciarTransicao(async () => {
      const resultado = await editarFonte(fonte.id, {
        nome: dados.get("nome"),
        url: dados.get("url"),
      });

      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }

      setEditando(false);
      router.refresh();
    });
  }

  const botao =
    "inline-flex items-center gap-1 rounded border border-borda px-2 py-1 text-xs hover:bg-fundo disabled:opacity-50";

  return (
    <>
      <tr className={fonte.robotsPermite ? "" : "bg-amber-50/40"}>
        <td className="px-3 py-2.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0">
              <p className="font-medium">
                {fonte.nome}{" "}
                <span className="font-normal text-suave">
                  ({fonte.tipo === "FORNECEDOR" ? "Fornecedor" : "Concorrente"})
                </span>
              </p>

              <a
                href={enderecoDoSite}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-acento hover:underline"
              >
                {fonte.dominio}
                {fonte.prefixoUrl ?? ""}
                <ExternalLink size={11} />
              </a>
            </div>

            <button
              type="button"
              onClick={() => {
                setErro(null);
                setEditando((antes) => !antes);
              }}
              className="rounded border border-borda p-1 text-suave hover:bg-fundo"
              title="Editar nome e endereco"
              aria-label={`Editar ${fonte.nome}`}
            >
              <Pencil size={13} />
            </button>
          </div>
        </td>

        <td className="px-3 py-2.5">
          {!fonte.robotsPermite ? (
            <span className="inline-flex items-center gap-1 text-xs text-amber-800">
              <Ban size={13} /> robots.txt bloqueia
            </span>
          ) : fonte.ativa ? (
            <Badge tom="sucesso">Ativa</Badge>
          ) : (
            <Badge tom="alerta">Pausada</Badge>
          )}
        </td>

        {/*
          Os dois numeros lado a lado sao o ponto da tela: 2732 coletados nao diz
          nada sozinho, mas 2732 de 5000 diz que falta metade.
        */}
        <td className="px-3 py-2.5 text-right tabular-nums">
          {comoNumero(fonte.produtosNoSite)}
          {fonte.produtosNoSiteParcial && typeof fonte.produtosNoSite === "number" && (
            <span title="A leitura do sitemap parou no teto; o catalogo e maior">+</span>
          )}
        </td>

        <td className="px-3 py-2.5 text-right tabular-nums">
          {comoNumero(fonte.coletados)}
        </td>

        <td className="px-3 py-2.5 text-suave">{comoData(fonte.ultimaVarreduraEm)}</td>

        <td className="px-3 py-2.5">
          <div className="flex flex-wrap justify-end gap-1.5">
            <button
              type="button"
              onClick={alternar}
              disabled={pendente || !fonte.robotsPermite}
              className={botao}
              title={
                fonte.robotsPermite
                  ? "Pausar mantem tudo que ja foi coletado"
                  : "O robots.txt deste site nos bloqueia"
              }
            >
              {fonte.ativa ? <Pause size={12} /> : <Play size={12} />}
              {fonte.ativa ? "Pausar" : "Retomar"}
            </button>

            <button
              type="button"
              onClick={pedirExclusao}
              disabled={pendente}
              className={`${botao} text-red-700`}
            >
              {pendente ? <Loader size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Excluir
            </button>
          </div>
        </td>
      </tr>

      {editando && (
        <tr>
          <td colSpan={COLUNAS} className="px-3 pb-3">
            <form
              onSubmit={salvarEdicao}
              className="flex flex-wrap items-end gap-2 rounded border border-borda bg-fundo px-3 py-2.5"
            >
              <label className="flex-1 text-xs">
                <span className="mb-1 block text-suave">Nome da loja</span>
                <input
                  name="nome"
                  defaultValue={fonte.nome}
                  className="w-full rounded border border-borda bg-superficie px-2 py-1 text-sm"
                />
              </label>

              <label className="flex-1 text-xs">
                <span className="mb-1 block text-suave">Endereco</span>
                <input
                  name="url"
                  defaultValue={fonte.dominio}
                  className="w-full rounded border border-borda bg-superficie px-2 py-1 font-mono text-sm"
                />
              </label>

              <button
                type="submit"
                disabled={pendente}
                className="rounded bg-acento px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="rounded border border-borda px-2.5 py-1.5 text-xs"
              >
                Cancelar
              </button>

              {/*
                Trocar o dominio nao move o que ja foi coletado: as paginas
                antigas continuam apontando para o endereco anterior. Dizer isso
                aqui evita a descoberta depois da varredura seguinte.
              */}
              <p className="w-full text-xs text-suave">
                Mudar o endereco revalida o robots.txt do site novo. As paginas ja
                coletadas continuam com o endereco antigo.
              </p>
            </form>
          </td>
        </tr>
      )}

      {(confirmando !== null || erro) && (
        <tr>
          <td colSpan={COLUNAS} className="px-3 pb-3">
            {erro && <p className="text-xs text-red-700">{erro}</p>}

            {confirmando !== null && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                <p>
                  Excluir <strong>{fonte.nome}</strong> apaga tambem{" "}
                  <strong>{confirmando} pagina(s)</strong> coletada(s) e todo o historico de
                  preco delas. Para so parar de coletar, use Pausar.
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={excluir}
                    disabled={pendente}
                    className="rounded bg-red-700 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Excluir mesmo assim
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(null)}
                    className="rounded border border-red-300 px-2.5 py-1 text-xs"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
