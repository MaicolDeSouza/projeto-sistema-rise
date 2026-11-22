"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ExternalLink, Loader2, MessageCircle, Printer } from "lucide-react";

import { imprimirEtiquetaAcao, marcarWhatsappAcao, reenviarEmailAcao } from "@/app/envios/acoes";
import { Dado } from "@/components/pedidos/AbaGeral";
import { numeroDoEnvio, servicoCompravel, SITUACAO_DO_ENVIO } from "@/lib/frete/regras";

import JanelaDeCancelamento from "./JanelaDeCancelamento";
import JanelaDeCompra from "./JanelaDeCompra";
import { formatoDeMoeda } from "@/lib/dinheiro";

const moeda = formatoDeMoeda();
const prazo = (dias) => (dias ? `${dias} ${dias === 1 ? "dia útil" : "dias úteis"}` : null);
const dataHora = (valor) =>
  valor ? new Date(valor).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : null;
const dataCurta = (valor) => (valor ? new Date(valor).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }) : null);
export const BOTAO = "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
const PRINCIPAL = `${BOTAO} bg-acento text-white hover:opacity-90`;
const SECUNDARIO = `${BOTAO} border border-borda hover:bg-fundo`;
/** Depois disto um COMPRANDO e uma compra que caiu no meio: o botao "Tentar de novo" retoma (o servidor confere igual). */
const COMPRA_PARADA_MS = 2 * 60 * 1000;

function Situacao({ status }) {
  const situacao = SITUACAO_DO_ENVIO[status] ?? { texto: status, cor: "bg-zinc-300" };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${situacao.cor}`} />
      {situacao.texto}
    </span>
  );
}

/**
 * O envio do Rise em qualquer passo (modulo de frete, fase 2), no pedido de venda e no detalhe do envio. Linha-guia: o
 * operador ve primeiro em que passo o envio esta; a acao principal e o proximo passo (cotar, comprar, imprimir, avisar).
 * `whatsapp`: o link `wa.me` montado no servidor (o telefone do cliente nao vem ao navegador); `temEmail`: se ha e-mail.
 */
export default function PainelDoEnvio({ envio, caixas, travaLiberada, pode, aoCotar, cotando = false, whatsapp = null, temEmail = false, chaveDaNota = null }) {
  const router = useRouter();
  const [janela, setJanela] = useState(null);
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();
  const [agora] = useState(() => Date.now());

  // Sem `aoCotar` (detalhe do envio avulso) nao ha cotar de novo: o servico foi escolhido ao criar o envio.
  const botaoCotar = (principal, rotulo = "Cotar frete") => !aoCotar ? null : (
    <button
      type="button"
      onClick={aoCotar}
      disabled={!pode.cotar || cotando}
      title={pode.cotar ? undefined : "Sem permissão para cotar o frete"}
      className={principal ? PRINCIPAL : SECUNDARIO}
    >
      {cotando && <Loader2 size={14} className="animate-spin" />}
      {rotulo}
    </button>
  );

  if (!envio) {
    return (
      <div className="flex items-center gap-3">
        {botaoCotar(true)}
        <span className="text-sm text-suave">Nenhum serviço escolhido.</span>
      </div>
    );
  }

  function imprimir() {
    setErro(null);
    // A aba e aberta no clique (o navegador bloqueia janela aberta depois de um await) e recebe o endereco depois.
    const aba = window.open("about:blank", "_blank");
    iniciar(async () => {
      const resposta = await imprimirEtiquetaAcao(envio.id);
      if (resposta?.ok && aba) aba.location.href = resposta.url;
      else {
        aba?.close();
        setErro(resposta?.erro ?? "Não foi possível abrir a etiqueta.");
      }
    });
  }

  function reenviar() {
    setErro(null);
    iniciar(async () => {
      const resposta = await reenviarEmailAcao(envio.id);
      if (!resposta?.ok) setErro(resposta?.erro ?? "Não foi possível reenviar.");
      router.refresh();
    });
  }

  function abrirWhatsapp() {
    window.open(whatsapp, "_blank", "noopener");
    iniciar(async () => {
      await marcarWhatsappAcao(envio.id);
      router.refresh();
    });
  }

  const compravel = servicoCompravel({ transportadora: envio.transportadoraNome });
  const motivoDeNaoComprar = !pode.comprar
    ? "Sem permissão para comprar etiqueta"
    : !travaLiberada
      ? "A compra de etiquetas está travada (FRETE_COMPRA)."
      : !compravel.ok
        ? compravel.motivo
        : null;
  const comprado = ["A_POSTAR", "POSTADO", "ENTREGUE", "NAO_ENTREGUE", "COM_PROBLEMA"].includes(envio.status);
  const postado = ["POSTADO", "ENTREGUE", "NAO_ENTREGUE", "COM_PROBLEMA"].includes(envio.status);
  const compraParada = envio.status === "COMPRANDO" && agora - new Date(envio.atualizadoEm).getTime() > COMPRA_PARADA_MS;
  const semAviso = postado && !envio.avisoEmailEm && !envio.avisoWhatsappEm;

  return (
    <>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Dado rotulo="Envio">
          <span className="inline-flex flex-wrap items-center gap-x-2">
            <span className="tabular-nums">{numeroDoEnvio(envio.numero)}</span>
            <span className="text-suave">·</span>
            <Situacao status={envio.status} />
          </span>
        </Dado>
        <Dado rotulo="Serviço">{[envio.transportadoraNome, envio.servicoNome].filter(Boolean).join(" ")}</Dado>
        {comprado ? (
          <>
            <Dado rotulo="Rastreio">
              {envio.rastreio ? (
                envio.linkDoRastreio ? (
                  <a href={envio.linkDoRastreio} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono hover:text-acento hover:underline">
                    {envio.rastreio}
                    <ExternalLink size={13} aria-hidden="true" />
                  </a>
                ) : (
                  <span className="font-mono">{envio.rastreio}</span>
                )
              ) : (
                <span className="text-suave">Ainda sem código</span>
              )}
            </Dado>
            <Dado rotulo="Custo da etiqueta">{envio.custo !== null && envio.custo !== undefined ? moeda.format(envio.custo) : null}</Dado>
            {envio.status === "A_POSTAR" && <Dado rotulo="Postar até">{dataCurta(envio.validoAte)}</Dado>}
          </>
        ) : (
          <>
            <Dado rotulo="Prazo">{prazo(envio.prazoDias)}</Dado>
            <Dado rotulo="Custo cotado">{envio.precoCotado !== null && envio.precoCotado !== undefined ? moeda.format(envio.precoCotado) : null}</Dado>
          </>
        )}
        <Dado rotulo="Caixa e peso">
          <span className="tabular-nums">
            {envio.caixaDeEnvio?.nome ?? `${envio.comprimentoCm} × ${envio.larguraCm} × ${envio.alturaCm} cm`} · {String(envio.pesoKg).replace(".", ",")} kg
            {!envio.medidaConferida && envio.status === "RASCUNHO" && <span className="text-suave"> (estimado)</span>}
          </span>
        </Dado>
      </dl>

      {postado && Array.isArray(envio.eventos) && envio.eventos.length > 0 && (
        <ol className="mt-4 space-y-1.5 border-l border-borda pl-4 text-sm">
          {envio.eventos.map((evento) => (
            <li key={`${evento.status}-${evento.em}`} className="relative">
              <span aria-hidden="true" className="absolute top-1.5 -left-[21px] h-2 w-2 rounded-full bg-sky-500 ring-2 ring-superficie" />
              {evento.descricao} <span className="text-suave tabular-nums">em {dataHora(evento.em)}</span>
            </li>
          ))}
        </ol>
      )}

      {postado && (
        <div className="mt-4 text-sm">
          {envio.avisoEmailEm ? (
            <span className="text-suave">E-mail ao cliente enviado em {dataHora(envio.avisoEmailEm)}.</span>
          ) : envio.avisoEmailErro ? (
            <span className="inline-flex flex-wrap items-center gap-2 text-amber-700">
              <AlertTriangle size={14} aria-hidden="true" />
              {envio.avisoEmailErro}
              {temEmail && pode.avisar && (
                <button type="button" onClick={reenviar} disabled={ocupado} className="font-medium text-acento hover:underline disabled:opacity-50">
                  Reenviar e-mail
                </button>
              )}
            </span>
          ) : (
            <span className="text-suave">E-mail ao cliente sai na próxima consulta do rastreio.</span>
          )}
          {envio.avisoWhatsappEm && <span className="block text-suave">WhatsApp aberto em {dataHora(envio.avisoWhatsappEm)}.</span>}
        </div>
      )}

      {envio.ultimoErro && !postado && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {envio.ultimoErro}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {envio.status === "RASCUNHO" && (
          <>
            <button
              type="button"
              onClick={() => setJanela("compra")}
              disabled={Boolean(motivoDeNaoComprar)}
              title={motivoDeNaoComprar ?? undefined}
              className={PRINCIPAL}
            >
              Comprar etiqueta
            </button>
            {botaoCotar(false, "Cotar de novo")}
            {motivoDeNaoComprar && <span className="text-xs text-suave">{motivoDeNaoComprar}</span>}
          </>
        )}
        {envio.status === "COMPRANDO" &&
          (compraParada ? (
            <button type="button" onClick={() => setJanela("compra")} disabled={!pode.comprar} className={PRINCIPAL}>
              Tentar de novo
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-suave">
              <Loader2 size={14} className="animate-spin" /> Comprando a etiqueta…
            </span>
          ))}
        {(envio.status === "A_POSTAR" || envio.status === "POSTADO") && (
          <button type="button" onClick={imprimir} disabled={ocupado} className={envio.status === "A_POSTAR" ? PRINCIPAL : SECUNDARIO}>
            {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} aria-hidden="true" />}
            Imprimir etiqueta
          </button>
        )}
        {postado && whatsapp && (
          <button type="button" onClick={abrirWhatsapp} disabled={!pode.avisar} className={semAviso ? PRINCIPAL : SECUNDARIO}>
            <MessageCircle size={14} aria-hidden="true" />
            Avisar no WhatsApp
          </button>
        )}
        {semAviso && (
          <span className="inline-flex items-center gap-1 text-xs text-amber-700" title="O cliente ainda não foi avisado da postagem">
            <AlertTriangle size={13} aria-hidden="true" /> Cliente ainda não avisado
          </span>
        )}
        {envio.status === "A_POSTAR" && pode.comprar && (
          <button type="button" onClick={() => setJanela("cancelar")} className="ml-auto text-sm text-red-600 hover:underline">
            Cancelar etiqueta
          </button>
        )}
      </div>

      {erro && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {erro}
        </p>
      )}

      {janela === "compra" && (
        <JanelaDeCompra
          envio={envio}
          caixas={caixas}
          chaveDaNota={chaveDaNota}
          retomar={envio.status === "COMPRANDO"}
          aoFechar={() => setJanela(null)}
          aoConcluir={() => {
            setJanela(null);
            router.refresh();
          }}
        />
      )}
      {janela === "cancelar" && (
        <JanelaDeCancelamento
          envio={envio}
          aoFechar={() => setJanela(null)}
          aoConcluir={() => {
            setJanela(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
