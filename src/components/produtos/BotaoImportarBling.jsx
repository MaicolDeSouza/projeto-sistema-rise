"use client";

import { useState, useTransition } from "react";
import { Download, Loader } from "lucide-react";

import { importarDoBling } from "@/app/produtos/acoes";

/**
 * Traz do Bling os proximos 5 produtos em ordem de codigo.
 *
 * O clique demora alguns segundos: o Bling nao ordena por codigo, entao o
 * catalogo inteiro e lido antes de escolher os cinco. Sem o estado de espera, o
 * botao pareceria nao ter respondido e levaria um segundo clique.
 */
export default function BotaoImportarBling() {
  const [pendente, iniciarTransicao] = useTransition();
  const [resultado, setResultado] = useState(null);

  function importar() {
    setResultado(null);
    iniciarTransicao(async () => {
      setResultado(await importarDoBling());
    });
  }

  const recusadas =
    resultado?.importados?.reduce((soma, item) => soma + item.recusadas.length, 0) ?? 0;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={importar}
        disabled={pendente}
        className="inline-flex items-center gap-1.5 rounded border border-acento bg-superficie px-3 py-2 text-sm font-medium text-acento hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pendente ? (
          <Loader size={16} className="animate-spin" />
        ) : (
          <Download size={16} />
        )}
        {pendente ? "Importando..." : "Importar do Bling"}
      </button>

      {resultado && !resultado.ok && (
        <p className="max-w-xs text-right text-xs text-red-700">{resultado.erro}</p>
      )}

      {resultado?.ok && (
        <div className="max-w-xs text-right text-xs text-suave">
          <p>
            {resultado.importados.length === 0 && resultado.falhas.length === 0
              ? "Nenhum produto novo: todos os do Bling ja estao aqui."
              : `${resultado.importados.length} produto(s) importado(s): ${resultado.importados
                  .map((item) => item.sku)
                  .join(", ")}`}
          </p>
          {/*
            Foto fora do tamanho aceito pelo Mercado Livre nao e trazida. Sem
            dizer quantas, o produto aparece sem imagem e parece falha da
            importacao.
          */}
          {recusadas > 0 && (
            <p className="text-amber-700">
              {recusadas} imagem(ns) nao trazida(s): fora de 500 a 1920px ou formato
              nao aceito.
            </p>
          )}
          {resultado.falhas.map((falha) => (
            <p key={falha.sku} className="text-red-700">
              {falha.sku}: {falha.erro}
            </p>
          ))}
          <p>Faltam {resultado.restantes} de {resultado.totalBling} no Bling.</p>
        </div>
      )}
    </div>
  );
}
