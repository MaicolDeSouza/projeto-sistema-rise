"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Filter, Search } from "lucide-react";

const sem = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Cabecalho de coluna que FILTRA por um menu de marcar (pedido do dono em 07/11/2026: filtro nas colunas Codigo e Local,
 * e a coluna Status juntando o status do pedido e o do envio). Cada grupo e um parametro repetido da URL
 * (`?codigo=A&codigo=B`); nenhuma marcada = todos. Marcar aplica na hora; o menu fica aberto para marcar outra.
 *
 * O menu vai para o `<body>` com posicao fixa: a tabela tem `overflow-x-auto`, que cortaria um menu absoluto dentro dela.
 * Fecha com clique fora, Esc e rolagem da pagina. Com mais de 8 opcoes num grupo, uma caixa filtra a lista pelo texto.
 *
 * `grupos`: [{ parametro, titulo?, opcoes: [{ valor, texto, cor? }], atuais: string[] }].
 */
export default function FiltroDaColuna({ rotulo, grupos, aoMudar, alinhar = "esquerda", className = "" }) {
  const [aberto, setAberto] = useState(false);
  const [procura, setProcura] = useState("");
  const [posicao, setPosicao] = useState(null);
  const botao = useRef(null);
  const menu = useRef(null);

  const marcadas = grupos.reduce((soma, grupo) => soma + grupo.atuais.length, 0);
  const vazio = grupos.every((grupo) => grupo.opcoes.length === 0 && grupo.atuais.length === 0);
  const longo = grupos.some((grupo) => grupo.opcoes.length > 8);

  useLayoutEffect(() => {
    if (!aberto || !botao.current) return;
    const caixa = botao.current.getBoundingClientRect();
    const largura = 240;
    const esquerda = alinhar === "direita" ? caixa.right - largura : caixa.left;
    setPosicao({ top: caixa.bottom + 4, left: Math.max(8, Math.min(esquerda, window.innerWidth - largura - 8)), width: largura });
  }, [aberto, alinhar]);

  useEffect(() => {
    if (!aberto) return undefined;
    const fechar = () => setAberto(false);
    const foraDoMenu = (evento) => {
      if (menu.current?.contains(evento.target) || botao.current?.contains(evento.target)) return;
      fechar();
    };
    const tecla = (evento) => {
      if (evento.key === "Escape") {
        evento.stopPropagation();
        fechar();
        botao.current?.focus();
      }
    };
    // A rolagem DENTRO do menu (lista longa) nao fecha; a da pagina, sim (o menu ficaria solto no lugar errado).
    const rolagem = (evento) => {
      if (!menu.current?.contains(evento.target)) fechar();
    };
    document.addEventListener("mousedown", foraDoMenu);
    document.addEventListener("keydown", tecla, true);
    window.addEventListener("scroll", rolagem, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("mousedown", foraDoMenu);
      document.removeEventListener("keydown", tecla, true);
      window.removeEventListener("scroll", rolagem, true);
      window.removeEventListener("resize", fechar);
    };
  }, [aberto]);

  function alternar(grupo, valor) {
    const atuais = new Set(grupo.atuais);
    if (atuais.has(valor)) atuais.delete(valor);
    else atuais.add(valor);
    aoMudar({ [grupo.parametro]: [...atuais] });
  }

  function limpar() {
    aoMudar(Object.fromEntries(grupos.map((grupo) => [grupo.parametro, []])));
  }

  const dica = vazio ? "Nada para filtrar" : marcadas > 0 ? `${rotulo}: ${marcadas} marcado(s). Clique para mudar` : `Filtrar por ${rotulo.toLowerCase()}`;

  return (
    <th className={`px-2 py-2.5 font-medium ${className}`}>
      <button
        ref={botao}
        type="button"
        onClick={() => {
          setProcura("");
          setAberto((atual) => !atual);
        }}
        disabled={vazio}
        title={dica}
        aria-label={dica}
        aria-expanded={aberto}
        aria-haspopup="true"
        className={`inline-flex items-center gap-1 uppercase hover:text-texto disabled:cursor-default ${marcadas > 0 ? "font-semibold text-acento" : ""}`}
      >
        {rotulo}
        {marcadas > 0 && <span className="rounded-full bg-acento px-1.5 text-[10px] leading-4 text-white tabular-nums">{marcadas}</span>}
        <Filter size={12} aria-hidden="true" className={marcadas > 0 ? "text-acento" : "text-suave"} />
      </button>
      {aberto &&
        posicao &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={`Filtrar ${rotulo}`}
            style={{ top: posicao.top, left: posicao.left, width: posicao.width }}
            className="fixed z-50 rounded-md border border-borda bg-superficie text-left text-sm font-normal tracking-normal normal-case shadow-lg"
          >
            {longo && (
              <div className="relative border-b border-borda p-2">
                <Search size={14} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-suave" />
                <input
                  autoFocus
                  value={procura}
                  onChange={(evento) => setProcura(evento.target.value)}
                  placeholder="Procurar"
                  aria-label={`Procurar em ${rotulo}`}
                  className="w-full rounded border border-borda bg-superficie py-1 pr-2 pl-7 text-sm outline-none focus:border-acento"
                />
              </div>
            )}
            <div className="max-h-72 overflow-y-auto py-1">
              {grupos.map((grupo) => {
                const visiveis = grupo.opcoes.filter((opcao) => !procura || sem(opcao.texto).includes(sem(procura)));
                return (
                  <div key={grupo.parametro} className="py-0.5">
                    {grupo.titulo && <p className="px-3 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-suave uppercase">{grupo.titulo}</p>}
                    {visiveis.length === 0 && <p className="px-3 py-1 text-xs text-suave">Nada com esse texto.</p>}
                    {visiveis.map((opcao) => {
                      const marcada = grupo.atuais.includes(opcao.valor);
                      return (
                        <button
                          key={opcao.valor}
                          type="button"
                          role="menuitemcheckbox"
                          aria-checked={marcada}
                          onClick={() => alternar(grupo, opcao.valor)}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-fundo"
                        >
                          <span
                            aria-hidden="true"
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${marcada ? "border-acento bg-acento text-white" : "border-borda"}`}
                          >
                            {marcada && <Check size={11} strokeWidth={3} />}
                          </span>
                          {opcao.cor && <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${opcao.cor}`} />}
                          <span className="min-w-0 truncate">{opcao.texto}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {marcadas > 0 && (
              <div className="border-t border-borda p-1.5">
                <button type="button" onClick={limpar} className="w-full rounded px-2 py-1 text-xs text-acento hover:bg-fundo">
                  Mostrar todos
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </th>
  );
}
