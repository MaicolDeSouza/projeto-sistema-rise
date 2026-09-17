"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/// Uma varredura leva de minutos a horas: perguntar a cada 15 s basta.
const INTERVALO_MS = 15 * 1000;

/**
 * Recarrega a tela de fontes enquanto ha varredura na fila ou em andamento.
 *
 * Sem isto, o botao "Varrendo" da linha continuava la depois de a loja terminar,
 * e a data da ultima varredura so mudava com F5.
 */
export default function RecarregarEnquantoVarre({ ativo }) {
  const router = useRouter();

  useEffect(() => {
    if (!ativo) return;
    const relogio = setInterval(() => router.refresh(), INTERVALO_MS);
    return () => clearInterval(relogio);
  }, [ativo, router]);

  return null;
}
