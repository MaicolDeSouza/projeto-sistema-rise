"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, Fragment } from "react";

import { BarraDeAbas, Painel } from "@/components/cadastros/Abas";
import Janela from "./Janela";

/**
 * As abas de Configurações do Rise AI (spec §5a.5). Todas ficam montadas e só escondidas, como nos formulários de
 * Cadastros: o que a pessoa digitou numa aba não se perde ao olhar outra. Cada aba tem o próprio formulário e o próprio
 * Salvar; aqui só se troca de aba e se avisa quando a que está aberta tem alteração que ainda não foi salva.
 *
 * Quem sabe se há alteração é a aba: ela chama `useAlteracaoDaAba(id, sujo)`. O aviso só olha isso na hora do clique, então
 * nada aqui re-renderiza a cada tecla.
 */

const Alteracoes = createContext(null);

/** Cada aba diz se tem alteração não salva (`sujo`). Sem o contexto (fora das abas), não faz nada. */
export function useAlteracaoDaAba(aba, sujo) {
  const alteracoes = useContext(Alteracoes);
  useEffect(() => {
    alteracoes?.marcar(aba, sujo);
    return () => alteracoes?.marcar(aba, false);
  }, [alteracoes, aba, sujo]);
}

/**
 * @param {{ abas: { id: string, rotulo: string }[], paineis: Record<string, import("react").ReactNode> }} props
 *   `abas` só traz as que a pessoa pode ver (a página decide no servidor); `paineis` é o conteúdo de cada uma.
 */
export default function ConfiguracoesEmAbas({ abas, paineis }) {
  const [aba, setAba] = useState(abas[0].id);
  // Sobe a cada "Sair": o conteúdo da aba é remontado e volta ao que está salvo.
  const [versoes, setVersoes] = useState({});
  const [destino, setDestino] = useState(null);
  const sujas = useRef({});
  const alteracoes = useMemo(() => ({ marcar: (id, sujo) => { sujas.current[id] = sujo; } }), []);

  function trocarPara(proxima) {
    if (proxima === aba) return;
    if (sujas.current[aba]) return setDestino(proxima);
    setAba(proxima);
  }

  function sair() {
    setVersoes((atuais) => ({ ...atuais, [aba]: (atuais[aba] ?? 0) + 1 }));
    setAba(destino);
    setDestino(null);
  }

  return (
    <Alteracoes.Provider value={alteracoes}>
      <div className="rounded-lg border border-borda bg-superficie">
        <BarraDeAbas abas={abas} aba={aba} aoMudar={trocarPara} comErro={() => false} />
        <div className="p-5">
          {abas.map((item) => (
            <Painel key={item.id} id={item.id} aba={aba}>
              <Fragment key={versoes[item.id] ?? 0}>{paineis[item.id]}</Fragment>
            </Painel>
          ))}
        </div>
      </div>
      {destino && (
        <Janela titulo="Sair sem salvar?" aoFechar={() => setDestino(null)}>
          <p className="text-sm text-suave">O que você mudou em {abas.find((item) => item.id === aba)?.rotulo} ainda não foi salvo.</p>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => setDestino(null)}
              className="h-10 rounded-md border border-borda px-4 text-sm font-medium transition-[background-color] duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={sair}
              className="h-10 rounded-md bg-red-600 px-4 text-sm font-medium text-white transition-[opacity] duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Sair
            </button>
          </div>
        </Janela>
      )}
    </Alteracoes.Provider>
  );
}
