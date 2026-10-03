"use client";

import { useState, useTransition } from "react";
import { Loader, Save } from "lucide-react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { salvarFrasesFixas } from "@/app/canais-de-venda/mercado-livre/acoes";

// Os mesmos limites de `lib/canaisDeVenda/configuracao.js`. Ficam aqui copiados porque aquele
// arquivo importa o Prisma e nao pode ir para o navegador; o servidor continua sendo quem decide,
// e o que esta aqui so avisa antes de enviar.
const MAXIMO_DE_FRASES = 10;
const MAXIMO_DA_FRASE = 200;

// Mesma limpeza do servidor: uma frase por linha, vazia sai, repetida vira uma so.
function frasesDoTexto(texto) {
  return [...new Set(texto.split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean))];
}

const CLASSE_DA_MENSAGEM = {
  erro: "border-red-200 bg-red-50 text-red-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

/**
 * Frases fixas do canal Mercado Livre: caixa de texto com uma frase por linha. O que o servidor
 * devolve depois de gravar (limpo e sem repetidas) volta para a caixa, para o operador ver o que
 * ficou valendo. Salvar recusado nao mexe no texto digitado.
 */
export default function FrasesFixas({ frasesIniciais }) {
  const [texto, setTexto] = useState(() => frasesIniciais.join("\n"));
  const [mensagem, setMensagem] = useState(null);
  const [salvando, iniciarSalvamento] = useTransition();

  const frases = frasesDoTexto(texto);
  const longa = frases.findIndex((frase) => frase.length > MAXIMO_DA_FRASE);
  const excede = frases.length > MAXIMO_DE_FRASES;
  const avisoLocal =
    longa >= 0
      ? `A frase ${longa + 1} tem ${frases[longa].length} caracteres. O limite e ${MAXIMO_DA_FRASE}.`
      : excede
        ? `Use ate ${MAXIMO_DE_FRASES} frases.`
        : null;

  function alterar(valor) {
    setTexto(valor);
    // Tanto o "Frases salvas." quanto o erro falavam do texto de antes da tecla: nenhum dos dois vale mais.
    setMensagem(null);
  }

  function salvar() {
    setMensagem(null);
    const enviado = texto;
    iniciarSalvamento(async () => {
      let resultado;
      try {
        resultado = await salvarFrasesFixas(enviado);
      } catch {
        // Excecao solta numa transicao iria ao error boundary e levaria o que foi digitado.
        resultado = { ok: false, erro: "Nao foi possivel falar com o servidor. O texto continua aqui: tente salvar de novo." };
      }
      if (!resultado.ok) {
        setMensagem({ tipo: "erro", texto: resultado.erro });
        return;
      }
      setTexto(resultado.frases.join("\n"));
      setMensagem({ tipo: "ok", texto: "Frases salvas." });
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="ml-frases-fixas" className="flex items-center gap-1 text-sm font-semibold">
          Frases fixas
          <BolhaDeAjuda
            variante="inline"
            texto={`Uma frase por linha. Linha vazia e frase repetida sao descartadas. No maximo ${MAXIMO_DE_FRASES} frases de ${MAXIMO_DA_FRASE} caracteres cada.`}
          />
        </label>
        <p className="mt-0.5 text-sm text-suave">Estas frases entram em todo anuncio, depois da descricao do produto.</p>
      </div>

      <textarea
        id="ml-frases-fixas"
        value={texto}
        onChange={(evento) => alterar(evento.target.value)}
        rows={8}
        className={`w-full resize-y rounded border px-3 py-2.5 text-[15px] leading-relaxed focus:outline-none ${
          avisoLocal || mensagem?.tipo === "erro" ? "border-red-400" : "border-borda focus:border-acento"
        }`}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`text-xs tabular-nums ${excede ? "font-medium text-red-700" : "text-suave"}`}>
          {frases.length} de {MAXIMO_DE_FRASES} frases
        </p>
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {salvando ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar
        </button>
      </div>

      {/* O servidor repete o mesmo texto ao recusar: um aviso so. */}
      {avisoLocal && avisoLocal !== mensagem?.texto && (
        <p role="alert" className="text-xs text-red-700">
          {avisoLocal}
        </p>
      )}
      {mensagem && (
        <p
          role={mensagem.tipo === "erro" ? "alert" : "status"}
          className={`rounded border px-3 py-2 text-sm ${CLASSE_DA_MENSAGEM[mensagem.tipo]}`}
        >
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
