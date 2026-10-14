import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { lerRascunho, montarRascunho } from "@/lib/rascunhoDoCadastro";
import {
  apagarRascunhoBruto,
  gravarRascunhoBruto,
  lerRascunhoBruto,
  subscreverRascunhos,
} from "@/lib/rascunhoNoNavegador";

/// Pausa na digitacao antes de gravar: cada tecla nao pode serializar o formulario inteiro.
const PAUSA_MS = 800;

/**
 * O rascunho automatico do cadastro (pedido do dono em 13/10/2026), do lado do React. A regra mora em
 * `lib/rascunhoDoCadastro.js`; aqui ficam o relogio, o `localStorage` e o ciclo de vida.
 *
 * - Grava depois de uma pausa na digitacao (`agendar`, chamado a cada tecla do formulario) e sempre que muda um
 *   dos estados que entram no rascunho. Tambem grava na hora quando a aba some ou a pagina e recarregada, para o
 *   ultimo trecho nao ficar de fora.
 * - So grava com o cadastro ALTERADO (abrir e nao mexer nao deixa rascunho) e nunca enquanto o aviso de
 *   recuperar esta pendente: gravar por cima apagaria o rascunho antigo antes de o dono decidir.
 * - `encerrar` (Salvar ou Cancelar) apaga o rascunho e impede que um temporizador atrasado o recrie.
 *
 * @param {object} opcoes
 * @param {string} opcoes.chave onde guardar (`chaveDoRascunho`).
 * @param {string|null} opcoes.baseEm o `atualizadoEm` do produto quando a tela abriu.
 * @param {{ current: HTMLFormElement | null }} opcoes.formulario
 * @param {(elemento: HTMLFormElement) => object} opcoes.lerCampos os campos soltos do formulario.
 * @param {object} opcoes.estado o estado do React que entra no rascunho (ver `montarRascunho`) mais `alterado`.
 */
export function useRascunhoAutomatico({ chave, baseEm, formulario, lerCampos, estado }) {
  const bruto = useSyncExternalStore(subscreverRascunhos, () => lerRascunhoBruto(chave), () => null);
  const [resolvido, setResolvido] = useState(false);
  const guardado = useMemo(
    () => (resolvido ? null : lerRascunho(bruto, { baseEmAtual: baseEm })),
    [bruto, resolvido, baseEm],
  );
  const [salvoEm, setSalvoEm] = useState(null);

  // O estado mais recente, para o temporizador e os ouvintes de pagina (que vivem alem de uma renderizacao).
  const ultimo = useRef(estado);
  const pendente = useRef(false);
  const encerrado = useRef(false);
  const temporizador = useRef(null);
  useEffect(() => {
    ultimo.current = estado;
    pendente.current = Boolean(guardado);
  });

  const guardar = useCallback(() => {
    const atual = ultimo.current;
    if (encerrado.current || pendente.current || !atual.alterado || !formulario.current) return;
    const texto = JSON.stringify(montarRascunho({ campos: lerCampos(formulario.current), estado: atual, baseEm }));
    if (gravarRascunhoBruto(chave, texto)) {
      setSalvoEm(new Date().toISOString());
      // O que esta no armazenamento agora e o rascunho DESTA tela, e nao um antigo esperando decisao: sem isto o
      // aviso de "recuperar" reaparecia para o proprio rascunho e travava as gravacoes seguintes (achado na tela).
      setResolvido(true);
    }
  }, [chave, baseEm, formulario, lerCampos]);

  const agendar = useCallback(() => {
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(guardar, PAUSA_MS);
  }, [guardar]);

  // Mudou algo que entra no rascunho e nao e um campo solto (esses chegam por `agendar`, no onInput do formulario).
  useEffect(() => {
    if (estado.alterado) agendar();
  }, [
    agendar,
    estado.alterado,
    estado.tipo,
    estado.pecas,
    estado.fornecedores,
    estado.concorrentes,
    estado.lote,
    estado.imagens,
    estado.preservadas,
    estado.reservaExcluida,
    estado.temporarios,
    estado.documentosExcluidos,
    estado.gastoDaEdicao,
  ]);

  // A aba some ou a pagina recarrega: grava o que ainda estava esperando a pausa.
  useEffect(() => {
    const aoEsconder = () => {
      if (document.visibilityState === "hidden") guardar();
    };
    window.addEventListener("pagehide", guardar);
    document.addEventListener("visibilitychange", aoEsconder);
    return () => {
      window.removeEventListener("pagehide", guardar);
      document.removeEventListener("visibilitychange", aoEsconder);
      clearTimeout(temporizador.current);
    };
  }, [guardar]);

  /** Salvar ou Cancelar: o rascunho cumpriu o papel. */
  const encerrar = useCallback(() => {
    encerrado.current = true;
    clearTimeout(temporizador.current);
    apagarRascunhoBruto(chave);
  }, [chave]);

  /** "Descartar" no aviso: apaga e segue com o formulario como abriu. */
  const descartar = useCallback(() => {
    apagarRascunhoBruto(chave);
    setResolvido(true);
  }, [chave]);

  /** "Recuperar": o formulario aplicou o rascunho; daqui em diante grava por cima. */
  const aplicado = useCallback(() => setResolvido(true), []);

  return { guardado, salvoEm, agendar, encerrar, descartar, aplicado };
}
