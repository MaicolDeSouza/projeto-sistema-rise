"use client";

import Link from "next/link";

import Campo, { bordaDoCampo } from "@/components/cadastros/Campo";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { montarDescricaoML } from "@/lib/canaisDeVenda/ml/descricao";
import MensagensDoCampo, { problemasDoCampo } from "./MensagensDoCampo";

const ROTA_DE_CONFIGURACOES = "/canais-de-venda/mercado-livre/configuracoes";

const NUMERO = new Intl.NumberFormat("pt-BR");

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

/**
 * Aba Descricao: o texto-base (editavel), as frases fixas do canal (so leitura aqui; se editam
 * em Configuracoes) e a previa do texto final que vai ao Mercado Livre.
 */
export default function AbaDescricao({ rascunho, contexto, alterar, problemas }) {
  const descricao = rascunho.descricao ?? "";
  const emKit = Boolean(rascunho.composicao);
  const frases = (Array.isArray(contexto.frases) ? contexto.frases : []).map((frase) => String(frase ?? "").trim()).filter(Boolean);
  const erroDaDescricao = problemasDoCampo(problemas, "descricao").some((problema) => problema.bloqueante);

  const textoFinal = montarDescricaoML({ descricao, frases });

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
        ajuda="Texto puro, sem formatacao: o Mercado Livre mostra os simbolos como estao. As frases fixas entram depois dele, no texto final."
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
        <Titulo ajuda="Somente leitura. Entram em todo anuncio do canal, depois da descricao. Ao editar em Configuracoes, reabra o anuncio para ver a mudanca.">
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
        <Titulo ajuda="Somente leitura. E exatamente o texto que seria enviado ao Mercado Livre: descricao e frases fixas.">
          Texto final
        </Titulo>
        <p className="mt-1 text-[11px] text-suave tabular-nums">{NUMERO.format(textoFinal.length)} caracteres</p>
        <pre className="mt-2 max-h-[28rem] overflow-y-auto rounded border border-borda bg-fundo px-3 py-2.5 font-sans text-[15px] leading-relaxed break-words whitespace-pre-wrap">
          {textoFinal || <span className="text-suave">Escreva a descricao para ver o texto final.</span>}
        </pre>
      </div>
    </div>
  );
}
