"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

const comparavel = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

/**
 * Campo de texto com lista (pedidos do dono em 17/11/2026: o A/C com os contatos do cliente e a transportadora com as
 * cadastradas, os dois "selecionavel, mas tambem digitar manualmente"). A seta abre a lista inteira; digitar filtra. O
 * texto digitado igual (sem caixa nem acento) ao nome de uma opcao liga a ela; o resto fica so como texto.
 *
 * @param {{ id: string, nome: string, detalhe?: string|null }[]} opcoes
 * @param {(escolha: { id: string, texto: string }) => void} aoMudar  id vazio = texto livre
 */
export default function CampoComLista({ opcoes, id, texto, editar, aoMudar, placeholder, rotuloDaSeta, tituloDoLivre, className = "" }) {
  const [aberto, setAberto] = useState(false);
  const [filtrando, setFiltrando] = useState(false);
  const [marcado, setMarcado] = useState(-1);
  const caixa = useRef(null);
  const idDaLista = useId();

  useEffect(() => {
    if (!aberto) return undefined;
    const fora = (evento) => {
      if (!caixa.current?.contains(evento.target)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const termo = comparavel(texto);
  const lista = filtrando && termo ? opcoes.filter((o) => comparavel(o.nome).includes(termo)) : opcoes;
  const abrir = (filtrar) => {
    if (!opcoes.length) return;
    setFiltrando(filtrar);
    setMarcado(-1);
    setAberto(true);
  };
  const escolher = (opcao) => {
    aoMudar({ id: opcao.id, texto: opcao.nome });
    setAberto(false);
  };
  const digitar = (valor) => {
    const igual = opcoes.find((o) => comparavel(o.nome) === comparavel(valor));
    aoMudar({ id: igual?.id ?? "", texto: valor });
    abrir(true);
  };
  const tecla = (evento) => {
    if (evento.key === "Escape" && aberto) {
      evento.stopPropagation();
      setAberto(false);
    } else if (evento.key === "ArrowDown") {
      evento.preventDefault();
      if (!aberto) return abrir(false);
      setMarcado((i) => Math.min(i + 1, lista.length - 1));
    } else if (evento.key === "ArrowUp" && aberto) {
      evento.preventDefault();
      setMarcado((i) => Math.max(i - 1, 0));
    } else if (evento.key === "Enter" && aberto && lista[marcado]) {
      evento.preventDefault();
      escolher(lista[marcado]);
    }
  };

  return (
    // self-start: numa coluna de grid esticada, a seta (absolute, bottom) desceria junto.
    <div ref={caixa} className="relative self-start">
      <input
        value={texto}
        disabled={!editar}
        onChange={(e) => digitar(e.target.value.slice(0, 120))}
        onKeyDown={tecla}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={aberto}
        aria-controls={idDaLista}
        aria-autocomplete="list"
        title={texto && !id ? tituloDoLivre : undefined}
        className={`${className} ${opcoes.length ? "pr-8" : ""}`}
      />
      {editar && opcoes.length > 0 && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={rotuloDaSeta}
          title={rotuloDaSeta}
          onClick={() => (aberto ? setAberto(false) : abrir(false))}
          className="absolute top-0 right-1 bottom-0 my-auto flex size-8 items-center justify-center rounded text-suave hover:text-texto"
        >
          <ChevronDown size={16} className={`transition-transform duration-150 ${aberto ? "rotate-180" : ""}`} />
        </button>
      )}
      {aberto && lista.length > 0 && (
        <ul id={idDaLista} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-borda bg-superficie py-1 shadow-lg">
          {lista.map((o, indice) => (
            <li key={o.id} role="option" aria-selected={o.id === id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(o)}
                className={`flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-fundo ${indice === marcado ? "bg-fundo" : ""} ${o.id === id ? "font-medium text-acento" : ""}`}
              >
                <span className="min-w-0 truncate">{o.nome}</span>
                {o.detalhe && <span className="shrink-0 text-xs text-suave">{o.detalhe}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
