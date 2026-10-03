"use client";

import { useState, useTransition } from "react";
import { Loader, Save } from "lucide-react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { salvarFrasesFixas } from "@/app/canais-de-venda/mercado-livre/acoes";
import { MAXIMO_DA_FRASE, MAXIMO_DE_FRASES, avisoDasFrases, frasesDoTexto } from "@/lib/canaisDeVenda/frases";

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
  const excede = frases.length > MAXIMO_DE_FRASES;
  // O servidor aplica as mesmas regras (`frases.js`) e decide; aqui so se avisa antes de enviar.
  const avisoLocal = avisoDasFrases(frases);
  const erroDoServidor = mensagem?.tipo === "erro" ? mensagem.texto : null;
  const mostraAvisoLocal = avisoLocal && avisoLocal !== erroDoServidor;
  const invalido = Boolean(avisoLocal || erroDoServidor);

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
        <div className="flex items-center gap-1 text-sm font-semibold">
          <label htmlFor="ml-frases-fixas">Frases fixas</label>
          <BolhaDeAjuda
            variante="inline"
            texto={`Uma frase por linha. Linha vazia e frase repetida sao descartadas. No maximo ${MAXIMO_DE_FRASES} frases de ${MAXIMO_DA_FRASE} caracteres cada.`}
          />
        </div>
        <p id="ml-frases-nota" className="mt-0.5 text-sm text-suave">Estas frases entram em todo anuncio, depois da descricao do produto.</p>
      </div>

      <textarea
        id="ml-frases-fixas"
        value={texto}
        onChange={(evento) => alterar(evento.target.value)}
        // Durante o Salvar o texto enviado e o que volta para a caixa: o que fosse digitado agora seria sobrescrito.
        readOnly={salvando}
        rows={8}
        aria-invalid={invalido}
        aria-describedby={`ml-frases-nota${mostraAvisoLocal ? " ml-frases-aviso" : ""}${erroDoServidor ? " ml-frases-erro" : ""}`}
        className={`w-full resize-y rounded border px-3 py-2.5 text-[15px] leading-relaxed focus:outline-none ${
          invalido ? "border-red-400" : "border-borda focus:border-acento"
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

      {mostraAvisoLocal && (
        <p id="ml-frases-aviso" role="alert" className="text-xs text-red-700">
          {avisoLocal}
        </p>
      )}
      {erroDoServidor && (
        <p id="ml-frases-erro" role="alert" className={`rounded border px-3 py-2 text-sm ${CLASSE_DA_MENSAGEM.erro}`}>
          {erroDoServidor}
        </p>
      )}
      {/* Sempre montado: leitor de tela so anuncia texto que entra numa regiao que ja existia. */}
      <p
        role="status"
        aria-live="polite"
        className={mensagem?.tipo === "ok" ? `rounded border px-3 py-2 text-sm ${CLASSE_DA_MENSAGEM.ok}` : undefined}
      >
        {mensagem?.tipo === "ok" ? mensagem.texto : ""}
      </p>
    </div>
  );
}
