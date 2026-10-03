"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Loader } from "lucide-react";

import { outroVersiculo } from "@/app/canais-de-venda/mercado-livre/acoes";
import Campo, { bordaDoCampo } from "@/components/cadastros/Campo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { montarDescricaoML, restoDaDescricao } from "@/lib/canaisDeVenda/ml/descricao";
import { linhaDoVersiculo, referenciaDoVersiculo } from "@/lib/canaisDeVenda/versiculos";
import MensagensDoCampo, { problemasDoCampo } from "./MensagensDoCampo";

const ROTA_DE_CONFIGURACOES = "/canais-de-venda/mercado-livre/configuracoes";

const NUMERO = new Intl.NumberFormat("pt-BR");
const PERCENTUAL = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const CLASSE_DO_AVISO = {
  erro: "border-red-200 bg-red-50 text-red-800",
  alerta: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-borda bg-fundo text-suave",
};

// Link para Configuracoes abre em outra aba: sair desta tela perderia o que ainda nao foi salvo.
function LinkDeConfiguracoes({ children }) {
  return (
    <Link
      href={ROTA_DE_CONFIGURACOES}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-acento underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}

function Titulo({ children, ajuda }) {
  return (
    <div className="flex items-center gap-1 text-sm font-semibold">
      {children}
      <BolhaDeAjuda variante="inline" texto={ajuda} />
    </div>
  );
}

// O rascunho guarda so o que a descricao usa. A acao devolve a linha do banco, com `id`, e o
// `fim` ausente significa "um versiculo so".
function versiculoDoRascunho(versiculo) {
  return {
    livro: versiculo.livro,
    capitulo: versiculo.capitulo,
    inicio: versiculo.inicio,
    fim: versiculo.fim ?? versiculo.inicio,
    texto: versiculo.texto,
  };
}

// Quanto da descricao final o versiculo ocupa. Contas inteiras, e nao `linha / total >= 0.25`: o
// vermelho tem que cair exatamente onde a validacao deixa de aceitar (`cabeNaDescricao`, que
// pede 4 x linha < total), sem arredondamento de ponto flutuante no limite.
function ocupacaoDoVersiculo(linha, total) {
  if (!linha || total === 0) return null;
  const tom = 4 * linha >= total ? "erro" : 5 * linha > total ? "alerta" : "ok";
  return { tom, percentual: (linha / total) * 100 };
}

const CLASSE_DA_OCUPACAO = { erro: "font-semibold text-red-700", alerta: "font-semibold text-amber-700", ok: "text-suave" };

/**
 * Aba Descricao: o texto-base (editavel), as frases fixas do canal e o versiculo (so leitura aqui;
 * as frases se editam em Configuracoes e o versiculo se troca por sorteio) e a previa do texto
 * final que vai ao Mercado Livre, com quanto o versiculo ocupa dele.
 */
export default function AbaDescricao({ rascunho, contexto, alterar, problemas }) {
  const [aviso, setAviso] = useState(null);
  const [sorteando, iniciarSorteio] = useTransition();

  const descricao = rascunho.descricao ?? "";
  const versiculo = rascunho.versiculo ?? null;
  const emKit = Boolean(rascunho.composicao);
  const frases = (Array.isArray(contexto.frases) ? contexto.frases : []).map((frase) => String(frase ?? "").trim()).filter(Boolean);
  const erroDaDescricao = problemasDoCampo(problemas, "descricao").some((problema) => problema.bloqueante);

  const textoFinal = montarDescricaoML({ descricao, frases, versiculo });
  const ocupacao = versiculo ? ocupacaoDoVersiculo(linhaDoVersiculo(versiculo).length, textoFinal.length) : null;

  function sortearOutro() {
    setAviso(null);
    // Recusa o que esta na tela: sem isso o sorteio poderia devolver o mesmo versiculo.
    const excluir = [versiculo && referenciaDoVersiculo(versiculo)].filter(Boolean);
    const resto = restoDaDescricao({ descricao, frases });
    iniciarSorteio(async () => {
      let resultado;
      try {
        resultado = await outroVersiculo(excluir, resto);
      } catch {
        // Excecao solta numa transicao iria ao error boundary e levaria o que foi digitado.
        resultado = { ok: false, erro: "Nao foi possivel falar com o servidor. Tente sortear de novo." };
      }
      if (!resultado.ok) {
        setAviso({ tipo: "erro", texto: resultado.erro });
        return;
      }
      // Sem outro que caiba: o versiculo que ja esta no anuncio continua, so o motivo aparece.
      if (!resultado.versiculo) {
        setAviso({ tipo: "alerta", texto: resultado.motivo });
        return;
      }
      // Escreve so o versiculo, sobre o rascunho de agora: o que foi digitado enquanto o servidor
      // respondia nao se desfaz.
      alterar({ versiculo: versiculoDoRascunho(resultado.versiculo) });
      if (resultado.reiniciou) {
        setAviso({ tipo: "info", texto: "Todos os versiculos da lista ja foram usados: o ciclo recomecou." });
      }
    });
  }

  return (
    <div className="space-y-6">
      {emKit && (
        <div className="rounded border border-borda bg-fundo px-3 py-2 text-sm text-suave">
          Num kit, o bloco &quot;Itens inclusos&quot; da descricao e refeito quando a composicao muda.
        </div>
      )}

      <Campo
        nome="ml-descricao"
        rotulo="Descricao"
        ajuda="Texto puro, sem formatacao: o Mercado Livre mostra os simbolos como estao. As frases fixas e o versiculo entram depois dele, no texto final."
      >
        <textarea
          id="ml-descricao"
          value={descricao}
          onChange={(evento) => alterar({ descricao: evento.target.value })}
          className={`mt-1 min-h-[40rem] w-full resize-y rounded border px-3 py-2.5 text-[15px] leading-relaxed focus:outline-none ${bordaDoCampo(erroDaDescricao)}`}
        />
        <p className="mt-1 text-[11px] text-suave tabular-nums">{NUMERO.format(descricao.length)} caracteres nesta descricao</p>
        <MensagensDoCampo problemas={problemas} campo="descricao" />
      </Campo>

      <div>
        <Titulo ajuda="Somente leitura. Entram em todo anuncio do canal, depois da descricao e antes do versiculo. Ao editar em Configuracoes, reabra o anuncio para ver a mudanca.">
          Frases fixas
        </Titulo>
        {frases.length > 0 ? (
          <>
            <ul className="mt-2 divide-y divide-borda rounded border border-borda bg-fundo text-sm">
              {frases.map((frase, posicao) => (
                <li key={posicao} className="px-3 py-2">
                  {frase}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px]">
              <LinkDeConfiguracoes>Editar em Configuracoes</LinkDeConfiguracoes>
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-suave">
            Nenhuma frase fixa. Cadastre em <LinkDeConfiguracoes>Configuracoes</LinkDeConfiguracoes>.
          </p>
        )}
      </div>

      <div>
        <Titulo ajuda="Citacao da NVI (Salmos ou Proverbios) na ultima linha da descricao. Ela precisa ficar abaixo de 25% do texto final. O sorteio nao consome a lista: o versiculo so conta como usado quando o anuncio for publicado.">
          Versiculo
        </Titulo>
        <div className="mt-2 rounded border border-borda bg-fundo px-3 py-2 text-sm">
          {versiculo ? (
            linhaDoVersiculo(versiculo)
          ) : (
            <span className="text-suave">
              Este anuncio esta sem versiculo. Use Outro versiculo para sortear um. Se nenhum aparecer, a lista pode estar vazia
              (Configuracoes) ou a descricao e curta demais para a citacao ficar abaixo de 25%.
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={sortearOutro}
            disabled={sorteando}
            className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50"
          >
            {sorteando && <Loader size={14} className="animate-spin" />}
            Outro versiculo
          </button>
          {aviso && (
            <p
              role={aviso.tipo === "erro" ? "alert" : "status"}
              className={`rounded border px-3 py-1.5 text-xs ${CLASSE_DO_AVISO[aviso.tipo]}`}
            >
              {aviso.texto}
            </p>
          )}
        </div>
        <MensagensDoCampo problemas={problemas} campo="versiculo" />
      </div>

      <div>
        <Titulo ajuda="Somente leitura. E exatamente o texto que seria enviado ao Mercado Livre: descricao, frases fixas e versiculo.">
          Texto final
        </Titulo>
        <p className="mt-1 text-[11px] text-suave tabular-nums">
          {NUMERO.format(textoFinal.length)} caracteres
          {ocupacao ? (
            <>
              {" · "}
              <span className={CLASSE_DA_OCUPACAO[ocupacao.tom]}>
                versiculo: {PERCENTUAL.format(ocupacao.percentual)}% do texto (o limite e abaixo de 25%)
              </span>
            </>
          ) : (
            " · sem versiculo"
          )}
        </p>
        <pre className="mt-2 max-h-[28rem] overflow-y-auto rounded border border-borda bg-fundo px-3 py-2.5 font-sans text-[15px] leading-relaxed break-words whitespace-pre-wrap">
          {textoFinal || <span className="text-suave">Escreva a descricao para ver o texto final.</span>}
        </pre>
      </div>
    </div>
  );
}
