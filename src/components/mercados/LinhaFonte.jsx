"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, ExternalLink, Loader, Pause, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";

import Badge from "@/components/ui/Badge";
import ArquivosDaFonte from "@/components/mercados/ArquivosDaFonte";
import {
  alternarFonte,
  contarProdutos,
  editarFonte,
  excluirFonte,
  varrerFonteAgora,
} from "@/app/mercados/acoes";

/// Quantas colunas a tabela tem NESTA aba: a de fornecedor mostra a coluna da
/// lista, a de concorrente nao. Numero errado aqui desalinha as linhas de apoio
/// (erro, confirmacao, edicao), que abrem embaixo com colSpan.
const COLUNAS_BASE = 6;

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

/**
 * Quanto a coleta demorou, em linguagem de gente.
 *
 * Segundos ate um minuto, minuto e segundo acima disso: "82s" faz o leitor
 * dividir de cabeca, e "1min 22s" nao.
 *
 * Coleta antiga nao tem o numero guardado e nao ganha um inventado — devolve
 * null, e a tela nao mostra nada.
 */
function comoDuracao(ms) {
  if (typeof ms !== "number" || ms < 0) return null;

  const segundos = Math.round(ms / 1000);
  if (segundos < 60) return `${segundos}s`;

  const minutos = Math.floor(segundos / 60);
  const resto = segundos % 60;
  return resto === 0 ? `${minutos}min` : `${minutos}min ${resto}s`;
}

/**
 * Quando e a proxima varredura, para ir entre parenteses ao lado da ultima.
 *
 * A fila vale mais que a data: fonte ja varrendo ou esperando a vez mostra isso,
 * e nao uma data que ja passou. Fonte pausada nasce com a proxima a cem anos, e
 * mostrar "2126" nao diria nada — diz "pausada".
 */
function proximaVarredura(fonte) {
  if (fonte.varredura === "VARRENDO") return "varrendo agora";
  if (fonte.varredura === "NA_FILA") return "na fila";
  if (!fonte.ativa || !fonte.robotsPermite) return "pausada";
  if (!fonte.proximaVarreduraEm) return null;
  if (new Date(fonte.proximaVarreduraEm).getTime() <= Date.now()) return "proxima: agora";
  return `proxima: ${comoData(fonte.proximaVarreduraEm)}`;
}

export default function LinhaFonte({ fonte, mostrarLista = false }) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [confirmando, setConfirmando] = useState(null);
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState(null);

  // O endereco completo, para o link abrir o site. O dominio guardado nao tem
  // esquema, e <a href="www.loja.com"> vira caminho relativo do nosso proprio
  // site — o clique levaria a /mercados/www.loja.com.
  const enderecoDoSite = `https://${fonte.dominio}${fonte.prefixoUrl ?? ""}`;

  /** Poe so esta fonte na fila; o worker a varre ao lado das outras. */
  function varrer() {
    setErro(null);
    iniciarTransicao(async () => {
      const resultado = await varrerFonteAgora(fonte.id);
      if (!resultado.ok) setErro(resultado.erro);
      router.refresh();
    });
  }

  function alternar() {
    setErro(null);
    iniciarTransicao(async () => {
      const resultado = await alternarFonte(fonte.id);
      if (!resultado.ok) setErro(resultado.erro);
      else router.refresh();
    });
  }

  /**
   * Excluir apaga a fonte E os produtos dela. Pausar so interrompe a varredura.
   *
   * Sao coisas diferentes de proposito, e a contagem aparece antes: apagar os
   * 1.911 produtos da Fortek e o historico de preco porque alguem quis parar de
   * acompanhar uma loja seria um estrago silencioso.
   */
  function pedirExclusao() {
    setErro(null);
    iniciarTransicao(async () => {
      setConfirmando(await contarProdutos(fonte.id));
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
              {/*
                Sem o tipo ao lado do nome: quem responde isso agora e a aba, e
                repetir "(Fornecedor)" em toda linha de uma aba chamada
                Fornecedores so gasta largura.
              */}
              <p className="font-medium">{fonte.nome}</p>

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
          {comoNumero(fonte.coleta?.total)}
        </td>

        {/*
          A DATA DA ULTIMA COLETA GRAVADA, e nao a da varredura.
          `ultimaVarreduraEm` so e escrito pelo worker; reprocessar a lista pela
          linha de comando nao mexe nele, e a fonte aparecia como "nunca" com
          1.911 produtos guardados. `ultimaColetaEm` e escrito por quem grava.
        */}
        <td className="px-3 py-2.5 text-suave">
          {comoData(fonte.coleta?.coletadoEm ?? fonte.ultimaVarreduraEm)}
          {/*
            QUANTO DEMOROU, ao lado da data. E o que explica por que uma fonte
            demora quatro vezes mais que outra pelo mesmo trabalho — o
            Eletrogate e o Impacto CNC pedem 10s entre visitas, e sem o numero
            a lentidao parece defeito nosso.
          */}
          {comoDuracao(fonte.coleta?.duracaoMs) && (
            <span> ({comoDuracao(fonte.coleta.duracaoMs)})</span>
          )}
          {/* Lista de fornecedor: o dado e do dia em que ELE mandou, nao do
              reprocessamento. Sem isto, lista de tres semanas parece de hoje. */}
          {proximaVarredura(fonte) && (
            <span className="block text-xs">({proximaVarredura(fonte)})</span>
          )}
          {fonte.coleta?.listaEnviadaEm && (
            <span className="block text-xs">
              lista de {comoData(fonte.coleta.listaEnviadaEm)}
            </span>
          )}
        </td>

        {/*
          SO FORNECEDOR MANDA LISTA. Concorrente tem vitrine, e e por ela que se
          varre — na aba dele a coluna nem aparece, em vez de ficar cinco linhas
          de travessao ocupando largura.
        */}
        {mostrarLista && (
          <td className="px-3 py-2.5">
            <ArquivosDaFonte fonte={fonte} />
          </td>
        )}

        <td className="px-3 py-2.5">
          <div className="flex flex-wrap justify-end gap-1.5">
            {/*
              VARREDURA SO DESTA FONTE, sem esperar o ciclo de 30 dias. Com a fonte
              ja na fila ou varrendo, o botao diz isso em vez de aceitar o clique.
            */}
            <button
              type="button"
              onClick={varrer}
              disabled={pendente || !fonte.ativa || !fonte.robotsPermite || Boolean(fonte.varredura)}
              className={botao}
              title={
                !fonte.robotsPermite
                  ? "O robots.txt deste site nos bloqueia"
                  : !fonte.ativa
                    ? "Fonte pausada: use Retomar antes de varrer"
                    : fonte.varredura
                      ? "Esta fonte ja esta na fila ou em varredura"
                      : "Varrer so esta fonte agora"
              }
            >
              {fonte.varredura === "VARRENDO" ? (
                <Loader size={12} className="animate-spin" />
              ) : (
                <RefreshCw size={12} />
              )}
              {fonte.varredura === "VARRENDO"
                ? "Varrendo"
                : fonte.varredura === "NA_FILA"
                  ? "Na fila"
                  : "Varrer agora"}
            </button>

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
          <td colSpan={COLUNAS_BASE + (mostrarLista ? 1 : 0)} className="px-3 pb-3">
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
          <td colSpan={COLUNAS_BASE + (mostrarLista ? 1 : 0)} className="px-3 pb-3">
            {erro && <p className="text-xs text-red-700">{erro}</p>}

            {confirmando !== null && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                <p>
                  Excluir <strong>{fonte.nome}</strong> apaga tambem{" "}
                  <strong>{confirmando} produto(s)</strong> coletado(s) e todo o historico de
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
