"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useState, useTransition } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ExternalLink,
  ImageOff,
  Loader,
  Search,
  X,
} from "lucide-react";

import { buscarPorPalavras } from "@/app/produtos/acoes";

const ROTULO_TIPO = {
  FORNECEDOR: { texto: "Fornecedor", classe: "bg-emerald-100 text-emerald-800" },
  CONCORRENTE: { texto: "Concorrente", classe: "bg-amber-100 text-amber-800" },
  OUTRO: { texto: "Outro", classe: "bg-slate-100 text-slate-700" },
};

/// Fornecedor antes de concorrente no primeiro clique em "Tipo" — pedido do
/// dono em 18/09/2026.
const ORDEM_TIPO = { FORNECEDOR: 0, CONCORRENTE: 1, OUTRO: 2 };

/**
 * Colunas ordenaveis da tabela (pedido do dono em 18/09/2026): clicar no
 * cabecalho ordena por ela, ascendente na primeira vez e descendente na
 * segunda — igual nas quatro colunas, so a comparacao muda. Sem coluna
 * escolhida, a lista fica na ordem que o servidor mandou (por parecido).
 */
// `sinal` so inverte a comparacao de verdade — sem preco fica no fim nos dois
// sentidos, senao o segundo clique (decrescente) traria "sem preco" para o
// topo, como se fosse o mais caro.
const COMPARADORES = {
  tipo: (a, b, sinal) => sinal * ((ORDEM_TIPO[a.tipo] ?? 9) - (ORDEM_TIPO[b.tipo] ?? 9)),
  fonte: (a, b, sinal) => sinal * (a.fonte ?? "").localeCompare(b.fonte ?? "", "pt-BR"),
  preco: (a, b, sinal) => {
    if (a.preco == null && b.preco == null) return 0;
    if (a.preco == null) return 1;
    if (b.preco == null) return -1;
    return sinal * (a.preco - b.preco);
  },
  parecido: (a, b, sinal) => sinal * (a.relevancia - b.relevancia),
};

function ordenarItens(itens, ordenacao) {
  if (!ordenacao) return itens;
  const comparador = COMPARADORES[ordenacao.coluna];
  const sinal = ordenacao.direcao === "asc" ? 1 : -1;
  return [...itens].sort((a, b) => comparador(a, b, sinal));
}

/** Seta neutra sem ordenacao; para cima/baixo conforme a coluna ativa. */
function IconeOrdenacao({ ativo, direcao }) {
  if (!ativo) return <ArrowUpDown size={12} className="shrink-0 text-suave" />;
  return direcao === "asc" ? (
    <ArrowUp size={12} className="shrink-0 text-acento" />
  ) : (
    <ArrowDown size={12} className="shrink-0 text-acento" />
  );
}

/** Cabecalho clicavel: ordena a tabela pela coluna, alternando o sentido. */
function CabecalhoOrdenavel({ coluna, ordenacao, aoClicar, direita, titulo, children }) {
  const ativo = ordenacao?.coluna === coluna;
  return (
    <th className={`px-3 py-2 font-medium ${direita ? "text-right" : ""}`} title={titulo}>
      <button
        type="button"
        onClick={() => aoClicar(coluna)}
        className={`inline-flex items-center gap-1 hover:text-texto ${
          direita ? "flex-row-reverse" : ""
        } ${ativo ? "text-texto" : ""}`}
      >
        {children}
        <IconeOrdenacao ativo={ativo} direcao={ordenacao?.direcao} />
      </button>
    </th>
  );
}

/// Espelha MAXIMO_REFERENCIAS de src/lib/ia/anuncio.js, que nao pode ser
/// importado aqui (usa o SDK e o banco). O servidor confere de novo.
export const MAXIMO_MARCADOS = 20;

const reais = (valor) =>
  valor === null || valor === undefined
    ? "—"
    : valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Foto principal do produto coletado.
 *
 * Vem por endereco (`/api/mercados/miniatura/<id>`) com loading="lazy", e nao
 * dentro da resposta da busca: a foto da Nightech e base64 de ate 1 MB, e so as
 * linhas que aparecem na janela precisam dela. <img> e nao next/image, porque a
 * rota pode redirecionar para host de loja que nao esta em remotePatterns.
 */
const enderecoDaFoto = (id) => `/api/mercados/miniatura/${encodeURIComponent(id)}`;

/// Lado da previa que aparece ao passar o mouse.
const LADO_PREVIA = 260;

/**
 * Miniatura com previa ampliada ao passar o mouse e foto grande ao clicar.
 *
 * A previa usa posicao FIXA calculada a partir da miniatura, e nao `absolute`:
 * a lista rola dentro de um contêiner com overflow, que cortaria qualquer coisa
 * que saisse dele.
 *
 * O clique na foto NAO marca a linha (a linha inteira marca): quem clica para
 * ver a peca maior nao esta escolhendo a referencia.
 */
function Foto({ id, alt, aoAmpliar }) {
  const [falhou, setFalhou] = useState(false);
  const [previa, setPrevia] = useState(null);

  if (falhou) {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded border border-borda bg-fundo text-suave">
        <ImageOff size={18} />
      </div>
    );
  }

  function mostrarPrevia(evento) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    // Abaixo da borda da tela, sobe; sem espaco a direita, abre a esquerda.
    const topo = Math.max(8, Math.min(caixa.top, window.innerHeight - LADO_PREVIA - 8));
    const esquerda =
      caixa.right + 8 + LADO_PREVIA < window.innerWidth
        ? caixa.right + 8
        : caixa.left - LADO_PREVIA - 8;
    setPrevia({ topo, esquerda });
  }

  return (
    <>
      <button
        type="button"
        onClick={(evento) => {
          evento.stopPropagation();
          setPrevia(null);
          aoAmpliar({ id, alt });
        }}
        onMouseEnter={mostrarPrevia}
        onMouseLeave={() => setPrevia(null)}
        title="Clique para ver maior"
        aria-label={`Ver foto maior de ${alt || "produto"}`}
        className="relative block h-16 w-16 cursor-zoom-in overflow-hidden rounded border border-borda bg-white hover:border-acento"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={enderecoDaFoto(id)}
          alt={alt}
          loading="lazy"
          onError={() => setFalhou(true)}
          className="absolute inset-0 h-full w-full object-contain p-0.5"
        />
      </button>

      {previa && (
        <div
          className="pointer-events-none fixed z-[60] rounded-lg border border-borda bg-white p-2 shadow-2xl"
          style={{ top: previa.topo, left: previa.esquerda, width: LADO_PREVIA, height: LADO_PREVIA }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enderecoDaFoto(id)} alt="" className="h-full w-full object-contain" />
        </div>
      )}
    </>
  );
}

/** Foto em tamanho grande sobre a janela. Clique em qualquer lugar ou Esc fecha. */
function FotoAmpliada({ foto, aoFechar }) {
  useEffect(() => {
    // Captura na janela e para ali: sem isso o mesmo Esc tambem fecharia a
    // janela de referencias, que escuta no document.
    const aoTeclar = (evento) => {
      if (evento.key !== "Escape") return;
      evento.stopPropagation();
      aoFechar();
    };
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [aoFechar]);

  return (
    <div
      className="fixed inset-0 z-[70] flex cursor-zoom-out flex-col items-center justify-center gap-3 bg-slate-900/80 p-6"
      onClick={aoFechar}
      role="dialog"
      aria-modal="true"
      aria-label="Foto ampliada"
    >
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Fechar foto"
        className="absolute top-4 right-4 rounded-full bg-white/90 p-2 text-slate-800 hover:bg-white"
      >
        <X size={18} />
      </button>
      <div className="rounded-lg bg-white p-3 shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={enderecoDaFoto(foto.id)}
          alt={foto.alt}
          className="max-h-[75vh] max-w-[85vw] min-w-72 object-contain"
        />
      </div>
      {foto.alt && <p className="max-w-3xl text-center text-sm text-white">{foto.alt}</p>}
    </div>
  );
}

/**
 * Janela com os produtos de fornecedores e concorrentes parecidos com o Nome,
 * para marcar os que servem de referencia.
 *
 * So busca e marca. Os botoes de IA ficam no formulario — "Criar titulo com IA"
 * ao lado da lupa, "Criar descricao com IA" na aba Descricao —, pedido do dono
 * em 16/09/2026. Por isso a marcacao e do FORMULARIO (`marcados` chega por
 * prop): os botoes precisam dela com a janela fechada.
 *
 * A marcacao NAO e gravada no banco (decisao do dono): serve so para gerar o
 * texto.
 */
export default function ReferenciasDeMercado({ ref, marcados, aoAlternar, aoLimpar, aoFechar }) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [resposta, setResposta] = useState(null);
  // Links ja abertos NESTA tela. O :visited do navegador sozinho nao serve:
  // ele guarda o historico de meses atras e nao diz o que foi conferido agora.
  const [abertos, setAbertos] = useState(() => new Set());
  const [fotoAmpliada, setFotoAmpliada] = useState(null);
  const [buscando, iniciarBusca] = useTransition();
  const [ordenacao, setOrdenacao] = useState(null); // { coluna, direcao } | null

  function alternarOrdenacao(coluna) {
    setOrdenacao((atual) =>
      atual?.coluna === coluna
        ? { coluna, direcao: atual.direcao === "asc" ? "desc" : "asc" }
        : { coluna, direcao: "asc" },
    );
  }

  function buscar(palavras) {
    const alvo = String(palavras ?? "").trim();
    setAberto(true);
    setTermo(alvo);
    if (!alvo) {
      setResposta(null);
      return;
    }
    iniciarBusca(async () => {
      try {
        setResposta(await buscarPorPalavras(alvo));
      } catch (erro) {
        setResposta({ ok: false, erro: erro?.message ?? "Falha ao buscar." });
      }
    });
  }

  useImperativeHandle(ref, () => ({ buscar }));

  // Fechar avisa o formulario: e quando ele le marca, modelo e homologacao das
  // referencias marcadas, para os icones dos campos ja mostrarem se ha dado.
  function fechar() {
    setAberto(false);
    aoFechar?.();
  }
  const fecharPeloTeclado = useEffectEvent(fechar);

  // Janela aberta: Esc fecha, e a pagina atras nao rola junto com a lista.
  useEffect(() => {
    if (!aberto) return;

    const aoTeclar = (evento) => {
      if (evento.key === "Escape") fecharPeloTeclado();
    };
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", aoTeclar);

    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  function marcarAberto(id) {
    setAbertos((atual) => new Set(atual).add(id));
  }

  if (!aberto) return null;

  const itens = ordenarItens(resposta?.ok ? resposta.itens : [], ordenacao);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={(evento) => {
        // So o clique no fundo escuro fecha; clique dentro da janela nao.
        if (evento.target === evento.currentTarget) fechar();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Referencias de mercado"
        className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-borda p-3">
          <span className="text-sm font-semibold">Referencias de mercado</span>

          {/*
            Nao e um <form>: esta dentro do formulario do produto, e o Enter
            salvaria o produto em vez de buscar.
          */}
          <div className="ml-auto flex min-w-0 flex-1 gap-2 sm:max-w-md">
            <input
              value={termo}
              onChange={(evento) => setTermo(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === "Enter") {
                  evento.preventDefault();
                  buscar(termo);
                }
              }}
              placeholder="Palavras-chave"
              aria-label="Palavras-chave"
              className="w-full min-w-0 rounded border border-borda px-2.5 py-1.5 text-sm focus:border-acento focus:outline-none"
            />
            <button
              type="button"
              onClick={() => buscar(termo)}
              disabled={buscando || !termo.trim()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {buscando ? <Loader size={14} className="animate-spin" /> : <Search size={14} />}
              Buscar
            </button>
          </div>

          <button
            type="button"
            onClick={() => fechar()}
            aria-label="Fechar referencias"
            className="rounded p-1 text-suave hover:bg-fundo"
          >
            <X size={16} />
          </button>
        </div>

        {!termo.trim() && !resposta && (
          <p className="p-4 text-sm text-suave">
            Escreva palavras-chave no Nome (ou aqui) e busque.
          </p>
        )}

        {resposta && !resposta.ok && (
          <p className="p-4 text-sm text-red-700">{resposta.erro}</p>
        )}

        {resposta?.ok && itens.length === 0 && (
          <p className="p-4 text-sm text-suave">
            Nenhum produto de fornecedor ou concorrente parecido. Tente menos palavras, ou o
            modelo da peca (ex.: HC-SR04).
          </p>
        )}

        {itens.length > 0 && (
          <>
            {resposta.total > itens.length && (
              <p className="border-b border-borda bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Mostrando os {itens.length} mais parecidos de {resposta.total}. Acrescente
                palavras para refinar.
              </p>
            )}
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2 font-medium">Foto</th>
                    <th className="px-3 py-2 font-medium">Produto</th>
                    <CabecalhoOrdenavel
                      coluna="tipo"
                      ordenacao={ordenacao}
                      aoClicar={alternarOrdenacao}
                      titulo="Fornecedor primeiro; clique de novo para concorrente primeiro"
                    >
                      Tipo
                    </CabecalhoOrdenavel>
                    <CabecalhoOrdenavel coluna="fonte" ordenacao={ordenacao} aoClicar={alternarOrdenacao}>
                      Fonte
                    </CabecalhoOrdenavel>
                    <CabecalhoOrdenavel
                      coluna="preco"
                      ordenacao={ordenacao}
                      aoClicar={alternarOrdenacao}
                      direita
                    >
                      Preco
                    </CabecalhoOrdenavel>
                    <th className="px-3 py-2 font-medium">Link</th>
                    <CabecalhoOrdenavel
                      coluna="parecido"
                      ordenacao={ordenacao}
                      aoClicar={alternarOrdenacao}
                      direita
                      titulo="Quanto do titulo buscado aparece no nome do produto, com peso maior para modelo e codigo"
                    >
                      Parecido
                    </CabecalhoOrdenavel>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {itens.map((item) => {
                    const tipo = ROTULO_TIPO[item.tipo] ?? ROTULO_TIPO.OUTRO;
                    const marcado = marcados.has(item.id);
                    const cheio = !marcado && marcados.size >= MAXIMO_MARCADOS;
                    const jaAberto = abertos.has(item.id);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => !cheio && aoAlternar(item)}
                        className={`cursor-pointer ${marcado ? "bg-sky-50" : "hover:bg-fundo"} ${
                          cheio ? "cursor-not-allowed opacity-50" : ""
                        }`}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={marcado}
                            disabled={cheio}
                            onChange={() => aoAlternar(item)}
                            onClick={(evento) => evento.stopPropagation()}
                            aria-label={`Marcar ${item.nome ?? "produto"}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Foto id={item.id} alt={item.nome ?? ""} aoAmpliar={setFotoAmpliada} />
                        </td>
                        <td className="px-3 py-2">
                          {item.nome ?? "(sem nome)"}
                          {item.codigo && item.codigo !== "N/A" && (
                            <span className="ml-2 font-mono text-xs text-suave">
                              {item.codigo}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-xs font-medium ${tipo.classe}`}
                          >
                            {tipo.texto}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-suave">{item.fonte}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {reais(item.preco)}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(evento) => {
                                evento.stopPropagation();
                                marcarAberto(item.id);
                              }}
                              // O clique do meio (abrir em nova aba) dispara
                              // auxclick, nao click.
                              onAuxClick={() => marcarAberto(item.id)}
                              title={jaAberto ? "Voce ja abriu este link" : undefined}
                              className={`inline-flex items-center gap-1 hover:underline ${
                                jaAberto ? "text-purple-700" : "text-acento"
                              }`}
                            >
                              {jaAberto && <Check size={12} />}
                              {jaAberto ? "Aberto" : "Abrir"} <ExternalLink size={12} />
                            </a>
                          ) : (
                            // Produto de lista do fornecedor nao tem pagina publica;
                            // link sem destino convidaria a um clique que nao leva a nada.
                            <span className="text-xs text-suave">
                              {item.origem === "arquivo"
                                ? "sem pagina (lista do fornecedor)"
                                : "sem pagina"}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-xs whitespace-nowrap text-suave tabular-nums">
                          {item.relevancia}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-borda p-3">
          <span className="text-sm text-suave">
            {marcados.size} marcado(s)
            {marcados.size >= MAXIMO_MARCADOS && ` · limite de ${MAXIMO_MARCADOS}`}
          </span>
          {marcados.size > 0 && (
            <button
              type="button"
              onClick={aoLimpar}
              className="text-xs text-suave underline hover:text-texto"
            >
              Limpar marcacao
            </button>
          )}

          <button
            type="button"
            onClick={() => fechar()}
            className="ml-auto rounded bg-acento px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            {marcados.size > 0 ? `Usar ${marcados.size} marcado(s)` : "Fechar"}
          </button>
        </div>
      </section>

      {fotoAmpliada && (
        <FotoAmpliada foto={fotoAmpliada} aoFechar={() => setFotoAmpliada(null)} />
      )}
    </div>
  );
}
