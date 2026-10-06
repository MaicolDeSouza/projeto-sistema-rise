"use client";

import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
} from "react";
import { ArrowRight, Check, ExternalLink, Loader, Sparkles, Trash2, WandSparkles, X } from "lucide-react";

import {
  buscarDescricoesParaProduto,
  criarDescricaoIA,
  promptDaDescricao,
  salvarPromptDaDescricao,
} from "@/app/produtos/acoes";
import { linhasDeEspecificacao, medidasDaDescricao } from "@/lib/medidas";
import { adicionarEspecificacao, formatarLinhaTecnica, garantirSecaoEspecificacoes, inserirEspecificacaoNaPosicao, moverEspecificacao, moverEspecificacaoPorPasso, organizarDescricao, removerEspecificacao, trocarParagrafo } from "@/lib/ia/revisaoDescricao";
import LinhasDescricao from "./LinhasDescricao";

/// Cor do ponto de cada aba: verde fornecedor, amarelo concorrente — as mesmas
/// cores dos selos da janela da lupa.
const ROTULO_TIPO = {
  FORNECEDOR: { ponto: "bg-emerald-500" },
  CONCORRENTE: { ponto: "bg-amber-500" },
  ATUAL: { ponto: "bg-sky-500" },
  OUTRO: { ponto: "bg-slate-400" },
};

/**
 * O texto e a ficha que uma loja publica para o produto marcado, em DUAS
 * sub-abas (pedido do dono em 22/09/2026): Descricao (o texto original da
 * pagina) e Especificacoes, com a quantidade entre parenteses no rotulo —
 * antes vinham empilhadas, e uma ficha longa empurrava a descricao para
 * baixo da rolagem.
 */
function ConteudoReferencia({ item, aoAdicionar, podeAdicionar, aoLevar, podeLevar }) {
  const [subaba, setSubaba] = useState("descricao");
  const quantas = item.especificacoes.length;

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{item.nome ?? "(sem nome)"}</p>
          <p className="mt-0.5 text-xs text-suave">
            {item.codigo && <span className="font-mono">{item.codigo}</span>}
            {item.marca && <> · Marca: <strong className="text-texto">{item.marca}</strong></>}
            {item.modelo && <> · Modelo: <strong className="text-texto">{item.modelo}</strong></>}
          </p>
        </div>
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-acento hover:underline"
          >
            Abrir <ExternalLink size={12} />
          </a>
        )}
      </div>

      <div role="tablist" className="flex gap-1 border-b border-borda">
        {[
          { id: "descricao", rotulo: "Descricao" },
          { id: "especificacoes", rotulo: `Especificacoes (${quantas})` },
        ].map((aba) => (
          <button
            key={aba.id}
            type="button"
            role="tab"
            aria-selected={subaba === aba.id}
            onClick={() => setSubaba(aba.id)}
            className={`-mb-px border-b-2 px-2.5 py-1.5 text-xs font-medium ${
              subaba === aba.id
                ? "border-acento text-texto"
                : "border-transparent text-suave hover:text-texto"
            }`}
          >
            {aba.rotulo}
          </button>
        ))}
        {/* Pedido do dono em 06/10/2026: levar a descricao atual, ou a de qualquer loja, para a area de edicao. */}
        {subaba === "descricao" && item.descricao && (
          <button
            type="button"
            disabled={!podeLevar}
            onClick={() => aoLevar(item.descricao)}
            title={podeLevar ? "Levar este texto para a area de edicao" : "Aguarde a geracao terminar"}
            className="mb-1 ml-auto inline-flex items-center gap-1 rounded border border-borda bg-superficie px-2 py-1 text-xs font-medium text-acento hover:border-acento disabled:cursor-not-allowed disabled:opacity-40"
          >
            Levar para edição <ArrowRight size={13} />
          </button>
        )}
      </div>

      {subaba === "descricao" ? (
        item.descricao ? (
          <p className="whitespace-pre-wrap text-texto">{item.descricao}</p>
        ) : (
          <p className="text-suave">
            {item.tipo === "ATUAL" ? "Este produto ainda não tem descrição salva." : "Esta loja nao publica descricao."}
          </p>
        )
      ) : quantas > 0 ? (
        <ul className="space-y-0.5">
          {item.especificacoes.map((linha, indice) => (
            <li key={indice} className="group/fonte flex items-start gap-1">
              <span className="min-w-0 flex-1">- {linha.nome ? <strong>{linha.nome}: </strong> : null}{linha.valor}</span>
              <button
                type="button"
                disabled={!podeAdicionar}
                onClick={() => aoAdicionar(linha)}
                title={podeAdicionar ? "Adicionar a especificacao na descricao" : "Gere a descricao antes de adicionar"}
                aria-label={`Adicionar ${linha.nome || linha.valor} a descricao`}
                className="shrink-0 rounded p-0.5 text-acento hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-30"
              ><ArrowRight size={16} /></button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-suave">Esta loja nao publica ficha tecnica.</p>
      )}
    </div>
  );
}

/**
 * Os produtos marcados LADO A LADO, em abas no topo — desenho do dono em
 * 16/09/2026 (antes era uma lista de secoes empilhadas, que obrigava a rolar
 * para achar a segunda loja). Cada aba diz o tipo pela cor e a loja pelo nome.
 */
function AbasDeReferencias({ itens, descricaoAtual, produto, aoRemover, aoAdicionar, podeAdicionar, aoLevar, podeLevar }) {
  const [ativa, setAtiva] = useState(0);
  const abaAtual = descricaoAtual === null ? null : {
    id: "descricao-atual",
    tipo: "ATUAL",
    fonte: "Descrição atual",
    nome: produto.titulo,
    codigo: produto.sku,
    descricao: descricaoAtual,
    especificacoes: linhasDeEspecificacao(descricaoAtual),
  };
  const abas = abaAtual ? [...itens, abaAtual] : itens;
  const item = abas[Math.min(ativa, abas.length - 1)];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" className="flex flex-wrap gap-1.5 border-b border-borda pb-2">
        {abas.map((referencia, indice) => {
          const tipo = ROTULO_TIPO[referencia.tipo] ?? ROTULO_TIPO.OUTRO;
          const selecionada = indice === ativa;
          return (
            <span
              key={referencia.id}
              className={`group/aba inline-flex max-w-44 items-center gap-1 rounded-md border pl-2.5 text-xs font-medium ${
                selecionada
                  ? "border-acento bg-sky-50 text-texto"
                  : "border-borda text-suave hover:border-acento/50 hover:text-texto"
              }`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selecionada}
                onClick={() => setAtiva(indice)}
                title={referencia.nome ?? ""}
                className="min-w-0 truncate py-1.5"
              >
                <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${tipo.ponto}`} />
                {referencia.fonte}
                {referencia.codigo && (
                  <span className="ml-1 font-mono opacity-70">{referencia.codigo}</span>
                )}
              </button>
              {referencia.tipo !== "ATUAL" && (
                <button
                  type="button"
                  onClick={() => {
                    aoRemover(referencia);
                    setAtiva((atual) => Math.max(0, Math.min(atual, abas.length - 2)));
                  }}
                  title={"Remover " + referencia.fonte + " das referencias"}
                  aria-label={"Remover " + referencia.fonte + " das referencias"}
                  className="shrink-0 rounded p-1 text-suave opacity-0 group-hover/aba:opacity-100 hover:bg-red-50 hover:text-red-700 focus:opacity-100"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </span>
          );
        })}
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto pt-3 pr-1">
        <ConteudoReferencia
          key={item.id}
          item={item}
          aoAdicionar={aoAdicionar}
          podeAdicionar={podeAdicionar}
          aoLevar={aoLevar}
          podeLevar={podeLevar}
        />
      </div>
    </div>
  );
}

/**
 * Janela "Criar descricao" — pedido do dono em 16/09/2026.
 *
 * A esquerda, os produtos encontrados no catalogo das lojas, em abas lado a lado, com a
 * descricao e a ficha de cada loja; a direita, a criacao com IA no padrao da loja
 * (titulo, 2 paragrafos de ate 4 linhas, Especificacoes tecnicas, Itens inclusos, Garantia),
 * em texto puro.
 *
 * O texto gerado aparece EDITAVEL antes de ir para o campo: a descricao vai para
 * o anuncio, e o operador confere especificacao por especificacao. Nada substitui
 * o texto do formulario ate "Usar esta descricao".
 *
 * O formulario abre pelo `ref` (`abrir`). `lerProduto` devolve o Nome e o Codigo
 * NO MOMENTO da geracao: titulo e "Itens inclusos: (Cod:...)" saem deles.
 */
export default function JanelaDescricao({ ref, ids, descricaoAtual = null, lerProduto, aoUsar }) {
  const [aberta, setAberta] = useState(false);
  const [detalhes, setDetalhes] = useState(null);
  const [lendo, iniciarLeitura] = useTransition();
  const [gerando, iniciarGeracao] = useTransition();
  const [texto, setTexto] = useState("");
  const [divergencias, setDivergencias] = useState([]);
  const [selecoes, setSelecoes] = useState({});
  const [opcoesRestantes, setOpcoesRestantes] = useState({});
  const [confirmadas, setConfirmadas] = useState(() => new Set());
  const [editandoTexto, setEditandoTexto] = useState(false);
  const [erro, setErro] = useState(null);
  const [produto, setProduto] = useState({ titulo: "", sku: "" });
  const leituraAtual = useRef(0);
  const geracaoAtual = useRef(0);
  const rolagemDescricao = useRef(null);
  // Referencias tiradas so DESTA geracao (pedido do dono em 22/09/2026: "nao
  // excluir fonte" — a marcacao de verdade continua na lupa, e reabrir a
  // janela traz tudo de volta). Guarda so o id, resetado em `abrir()`.
  const [excluidos, setExcluidos] = useState(() => new Set());
  // O aviso "Sair sem usar?" (ver `pedirFechamento`).
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  // As 3 opcoes de cada um dos 2 primeiros paragrafos (pedido do dono em 04/10/2026), `[[p1a, p1b, p1c],
  // [p2a, p2b, p2c]]`, e qual esta no texto agora em cada grupo. O texto nasce com a primeira de cada.
  const [opcoesParagrafos, setOpcoesParagrafos] = useState([]);
  const [escolhidosParagrafos, setEscolhidosParagrafos] = useState([0, 0]);
  // O texto de uma aba da esquerda esperando o "Substituir?" (ver `pedirLevar`).
  const [textoParaLevar, setTextoParaLevar] = useState(null);
  // O prompt de escrita que vai para a IA (pedido do dono em 06/10/2026, no molde do Nano Banana): a caixa
  // nasce com o salvo; editar sem salvar vale so para as geracoes desta janela. `null` = ainda lendo.
  const [prompt, setPrompt] = useState(null);
  const [promptSalvo, setPromptSalvo] = useState(null);
  const [promptPadrao, setPromptPadrao] = useState("");
  const [maximoPrompt, setMaximoPrompt] = useState(0);
  const [erroPrompt, setErroPrompt] = useState(null);
  const [salvandoPrompt, iniciarSalvarPrompt] = useTransition();

  function abrir() {
    const leitura = ++leituraAtual.current;
    const atual = lerProduto();
    setAberta(true);
    setConfirmandoSaida(false);
    setTextoParaLevar(null);
    setErro(null);
    setProduto(atual);
    setDetalhes(null);
    setTexto("");
    setOpcoesParagrafos([]);
    setEscolhidosParagrafos([0, 0]);
    setDivergencias([]);
    setSelecoes({});
    setOpcoesRestantes({});
    setConfirmadas(new Set());
    setEditandoTexto(false);
    geracaoAtual.current++;
    // So desta ABERTURA (pedido do dono em 22/09/2026): excluir uma
    // referencia aqui nao desmarca ela na lupa nem em lugar nenhum do
    // formulario, so tira da geracao de agora. Reabrir a janela traz todas
    // de volta — por isso reseta aqui, e nao junto de `detalhes` (que so
    // muda quando a busca termina).
    setExcluidos(new Set());
    setPrompt(null);
    setPromptSalvo(null);
    setErroPrompt(null);
    // O prompt chega sozinho, sem esperar as referencias (a busca leva segundos).
    promptDaDescricao()
      .then((resposta) => {
        if (leitura !== leituraAtual.current) return;
        setPrompt(resposta.texto);
        setPromptSalvo(resposta.texto);
        setPromptPadrao(resposta.padrao);
        setMaximoPrompt(resposta.maximo);
      })
      .catch(() => {
        if (leitura === leituraAtual.current) setErroPrompt("Nao deu para ler o prompt salvo. A geracao usa o salvo mesmo assim.");
      });
    iniciarLeitura(async () => {
      try {
        const resposta = await buscarDescricoesParaProduto(atual.titulo, ids);
        if (leitura === leituraAtual.current) setDetalhes(resposta);
      } catch (falha) {
        if (leitura === leituraAtual.current) {
          setDetalhes({ ok: false, erro: falha?.message ?? "Falha ao ler as referencias." });
        }
      }
    });
  }

  useImperativeHandle(ref, () => ({ abrir }));

  function fechar() {
    leituraAtual.current++;
    geracaoAtual.current++;
    setConfirmandoSaida(false);
    setAberta(false);
  }

  /**
   * Todo caminho de fechar (clique fora, X e Esc) passa por aqui (pedido do dono em 04/10/2026: clicar
   * fora fechava a janela e perdia a descricao sem perguntar). Pergunta so quando ha o que perder: texto
   * ja gerado, ou geracao em andamento (fechar a descarta, e ela e paga). Janela sem nada gerado fecha
   * direto, senao o aviso viraria ruido. Com o aviso ja aberto, o Esc o fecha e volta para a edicao.
   */
  function pedirFechamento() {
    if (textoParaLevar !== null) {
      setTextoParaLevar(null);
      return;
    }
    if (confirmandoSaida) {
      setConfirmandoSaida(false);
      return;
    }
    if (texto.trim() || gerando) setConfirmandoSaida(true);
    else fechar();
  }
  const fecharPeloTeclado = useEffectEvent(pedirFechamento);

  useEffect(() => {
    if (!aberta) return;
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
  }, [aberta]);

  /**
   * Tira uma referencia SO DESTA geracao (pedido do dono em 22/09/2026: "nao
   * excluir fonte" — nada e desmarcado no formulario nem na lupa). So soma o
   * id a `excluidos`; `abrir()` reseta isso na proxima vez que a janela abre.
   */
  function removerReferencia(item) {
    setExcluidos((atual) => new Set(atual).add(item.id));
  }

  function gerar() {
    const geracao = ++geracaoAtual.current;
    setErro(null);
    // Nome e Codigo lidos na hora de gerar: sao os que entram no texto.
    const atual = lerProduto();
    setProduto(atual);
    iniciarGeracao(async () => {
      try {
        // O prompt da caixa; sem ele (ainda lendo, ou a leitura falhou) o servidor usa o salvo.
        const resultado = await criarDescricaoIA(idsParaGerar, atual, prompt ?? undefined);
        if (geracao !== geracaoAtual.current) return;
        if (!resultado.ok) {
          setErro(resultado.erro);
          return;
        }
        setTexto((resultado.divergencias?.length ?? 0) > 0
          ? garantirSecaoEspecificacoes(resultado.texto)
          : resultado.texto);
        // O texto usa a primeira opcao de cada paragrafo; o dono troca na lista de opcoes.
        setOpcoesParagrafos(resultado.opcoesParagrafos ?? []);
        setEscolhidosParagrafos([0, 0]);
        setDivergencias(resultado.divergencias ?? []);
        setSelecoes({});
        setConfirmadas(new Set());
        setOpcoesRestantes(Object.fromEntries((resultado.divergencias ?? []).map((item) => [
          item.id, item.opcoes.map((_, indice) => indice),
        ])));
        setEditandoTexto(false);
      } catch (falha) {
        if (geracao === geracaoAtual.current) setErro(falha?.message ?? "Falha ao chamar a IA.");
      }
    });
  }

  /**
   * Poe no texto a opcao `indice` do paragrafo `grupo` (0 = primeiro, 1 = segundo). Troca a LINHA do
   * paragrafo que esta la agora; se o dono editou essa linha a mao, nao acha e avisa, em vez de escrever a
   * opcao em lugar errado (ver `trocarParagrafo`).
   */
  function escolherParagrafo(grupo, indice) {
    const lista = opcoesParagrafos[grupo] ?? [];
    const atual = lista[escolhidosParagrafos[grupo]];
    const novo = lista[indice];
    if (!novo || indice === escolhidosParagrafos[grupo]) return;

    const trocado = trocarParagrafo(texto, atual, novo);
    if (trocado === null) {
      setErro("Este paragrafo foi editado no texto e nao da para trocar por uma opcao. Edite la, ou gere de novo.");
      return;
    }
    setErro(null);
    setTexto(trocado);
    setEscolhidosParagrafos((anteriores) => anteriores.map((valor, posicao) => (posicao === grupo ? indice : valor)));
  }

  function excluirOpcao(divergencia, indice) {
    const restantes = (opcoesRestantes[divergencia.id] ?? []).filter((item) => item !== indice);
    setOpcoesRestantes((atual) => ({ ...atual, [divergencia.id]: restantes }));
    if (selecoes[divergencia.id] === indice) {
      setSelecoes((atual) => {
        const proximo = { ...atual };
        delete proximo[divergencia.id];
        return proximo;
      });
    }
  }

  // Troca o texto de uma opcao ANTES da escolha (pedido do dono em 04/10/2026): a linha editada e a
  // que entra na descricao se for a selecionada. Fontes, valor e recomendacao da IA ficam como estavam.
  function editarOpcao(divergencia, indice, linha) {
    setDivergencias((atual) => atual.map((item) => item.id !== divergencia.id ? item : {
      ...item,
      opcoes: item.opcoes.map((opcao, posicao) => posicao === indice ? { ...opcao, linha } : opcao),
    }));
  }

  function organizar() {
    let novoTexto = texto;
    const novasConfirmadas = new Set(confirmadas);
    const ignoradas = divergencias
      .filter((item) => confirmadas.has(item.id) && Number.isInteger(selecoes[item.id]))
      .map((item) => formatarLinhaTecnica(item.opcoes[selecoes[item.id]].linha));
    for (const divergencia of [...divergencias].sort((a, b) => a.posicao - b.posicao)) {
      if (novasConfirmadas.has(divergencia.id)) continue;
      const restantes = opcoesRestantes[divergencia.id] ?? [];
      const escolhida = selecoes[divergencia.id];
      if (restantes.length > 0 && !restantes.includes(escolhida)) continue;
      if (Number.isInteger(escolhida)) {
        const linha = divergencia.opcoes[escolhida].linha;
        novoTexto = inserirEspecificacaoNaPosicao(
          novoTexto, linha, divergencia.posicao ?? Number.POSITIVE_INFINITY, ignoradas,
        );
        ignoradas.push(formatarLinhaTecnica(linha));
        setOpcoesRestantes((atual) => ({ ...atual, [divergencia.id]: [escolhida] }));
      }
      novasConfirmadas.add(divergencia.id);
    }
    setConfirmadas(novasConfirmadas);
    setTexto(organizarDescricao(novoTexto));
  }

  /**
   * Leva a descricao atual, ou a de uma loja, para a area de edicao (pedido do dono em 06/10/2026), no
   * lugar de gerar com IA. Abre no texto completo: o texto da loja nao segue o padrao, e e la que se ajusta.
   * As opcoes de paragrafo e as divergencias eram da geracao anterior e nao valem para este texto.
   * Se ja houver texto na area, pergunta antes de substituir.
   */
  function pedirLevar(fonte) {
    if (texto.trim()) setTextoParaLevar(fonte);
    else levarParaEdicao(fonte);
  }

  function levarParaEdicao(fonte) {
    setTextoParaLevar(null);
    setErro(null);
    setTexto(fonte.trim());
    setOpcoesParagrafos([]);
    setEscolhidosParagrafos([0, 0]);
    setDivergencias([]);
    setSelecoes({});
    setOpcoesRestantes({});
    setConfirmadas(new Set());
    setEditandoTexto(true);
  }

  /** "Salvar prompt": o texto da caixa passa a ser o prompt de toda descricao gerada. */
  function salvarPrompt() {
    setErroPrompt(null);
    iniciarSalvarPrompt(async () => {
      try {
        const resposta = await salvarPromptDaDescricao(prompt);
        if (!resposta.ok) {
          setErroPrompt(resposta.erro);
          return;
        }
        setPrompt(resposta.texto);
        setPromptSalvo(resposta.texto);
      } catch (falha) {
        setErroPrompt(falha?.message ?? "Falha ao salvar o prompt.");
      }
    });
  }

  function adicionarDaFonte(linha) {
    const especificacao = linha.nome ? `${linha.nome}: ${linha.valor}` : linha.valor;
    setTexto((atual) => adicionarEspecificacao(atual, especificacao));
  }

  function excluirLinha(indice) {
    const linha = texto.split("\n")[indice];
    setTexto((atual) => removerEspecificacao(atual, indice));
    for (const divergencia of divergencias) {
      if (formatarLinhaTecnica(divergencia.opcoes[selecoes[divergencia.id]]?.linha ?? "") === linha) {
        setSelecoes((atual) => ({ ...atual, [divergencia.id]: null }));
        setOpcoesRestantes((atual) => ({ ...atual, [divergencia.id]: [] }));
      }
    }
  }

  function moverPorPasso(indice, direcao) {
    setTexto((atual) => moverEspecificacaoPorPasso(atual, indice, direcao));
  }

  function moverLinha(origem, destino) {
    setTexto((atual) => moverEspecificacao(atual, origem, destino));
  }

  function usar() {
    const final = organizarDescricao(texto);
    const lidas = medidasDaDescricao(final);
    const camposEscolhidos = {};
    if (Number.isInteger(selecoes.dimensoes)) {
      for (const campo of ["comprimentoCm", "larguraCm", "alturaCm"]) {
        camposEscolhidos[campo] = lidas[campo] ?? "";
      }
    }
    if (Number.isInteger(selecoes.peso)) camposEscolhidos.pesoKg = lidas.pesoKg ?? "";
    aoUsar(final, { camposEscolhidos });
    setConfirmandoSaida(false);
    setAberta(false);
  }

  if (!aberta) return null;

  // Removidas SO desta geracao ficam de fora da lista mostrada e do que vai
  // para a IA — mas continuam marcadas de verdade (`ids` inteiro), entao
  // reabrir a janela (que reseta `excluidos`) as traz de volta.
  const itens = detalhes?.ok ? detalhes.itens.filter((item) => !excluidos.has(item.id)) : [];
  const idsParaGerar = itens.map((item) => item.id);
  const pendentes = divergencias.filter((item) => !confirmadas.has(item.id)).length;
  const prontasParaOrganizar = divergencias.filter((item) =>
    !confirmadas.has(item.id) && Number.isInteger(selecoes[item.id])).length;
  // Prompt vazio ou acima do teto nao gera nem salva (o servidor confere de novo).
  const promptValido = prompt === null || (prompt.trim().length > 0 && prompt.trim().length <= maximoPrompt);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) pedirFechamento();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Criar descricao"
        className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-borda p-3">
          <span className="text-sm font-semibold">Criar descricao</span>
          <button
            type="button"
            onClick={pedirFechamento}
            aria-label="Fechar criar descricao"
            className="rounded p-1 text-suave hover:bg-fundo"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-3 lg:grid-cols-2">
          {/* ---------- Referencias ---------- */}
          <div className="flex min-h-0 flex-col">
            <p className="mb-2 text-xs font-semibold tracking-wide text-suave uppercase">
              Produtos encontrados ({itens.length}
              {excluidos.size > 0 && ` de ${detalhes?.itens?.length ?? 0}`})
            </p>
            <div className="flex min-h-0 flex-1 flex-col">
              {lendo || !detalhes ? (
                <p className="flex items-center gap-2 text-sm text-suave">
                  <Loader size={14} className="animate-spin" /> Lendo as referencias...
                </p>
              ) : !detalhes.ok && descricaoAtual === null ? (
                <p className="text-sm text-red-700">{detalhes.erro}</p>
              ) : itens.length === 0 && excluidos.size > 0 && descricaoAtual === null ? (
                <p className="text-sm text-suave">
                  Todas as referencias foram removidas desta geracao.{" "}
                  <button
                    type="button"
                    onClick={() => setExcluidos(new Set())}
                    className="text-acento hover:underline"
                  >
                    Trazer de volta
                  </button>
                </p>
              ) : itens.length === 0 && descricaoAtual === null ? (
                <p className="text-sm text-suave">
                  Nenhuma descricao encontrada para este Nome nos fornecedores e concorrentes cadastrados.
                </p>
              ) : (
                <>
                  {!detalhes.ok && <p className="mb-2 text-sm text-red-700">{detalhes.erro}</p>}
                  {itens.length === 0 && excluidos.size > 0 && (
                    <button
                      type="button"
                      onClick={() => setExcluidos(new Set())}
                      className="mb-2 self-start text-xs text-acento hover:underline"
                    >
                      Trazer referências de volta
                    </button>
                  )}
                  <AbasDeReferencias
                    itens={itens}
                    descricaoAtual={descricaoAtual}
                    produto={produto}
                    aoRemover={removerReferencia}
                    aoAdicionar={adicionarDaFonte}
                    podeAdicionar={Boolean(texto)}
                    aoLevar={pedirLevar}
                    podeLevar={!gerando}
                  />
                </>
              )}
            </div>
            {detalhes?.ok && detalhes.encontrados > 0 && (
              <p className="mt-2 text-xs text-suave">
                Foram encontrados {detalhes.encontrados} produtos em {detalhes.fontes} lojas.
                A geracao usa o mais relevante de cada loja, ate {detalhes.limite} referencias.
                Voce pode remover uma aba antes de gerar.
              </p>
            )}
          </div>

          {/* ---------- Criar com IA ---------- */}
          <div className="flex min-h-0 flex-col rounded-lg border border-borda bg-fundo p-3">
            <p className="mb-1 text-xs font-semibold tracking-wide text-suave uppercase">
              Criar a descricao com IA
            </p>
            {/* O prompt que vai para a IA (pedido do dono em 06/10/2026), no lugar do texto informativo. */}
            <div className="mb-2 space-y-1 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-medium text-suave">Prompt enviado à IA</span>
                {prompt !== null && (
                  <span className={`ml-auto ${prompt.trim().length > maximoPrompt ? "font-medium text-red-700" : "text-suave"}`}>
                    {prompt.trim().length}/{maximoPrompt}
                  </span>
                )}
              </div>
              <textarea
                value={prompt ?? ""}
                onChange={(evento) => setPrompt(evento.target.value)}
                disabled={prompt === null || gerando || salvandoPrompt}
                placeholder={prompt === null ? "Lendo o prompt salvo..." : ""}
                rows={5}
                aria-label="Prompt enviado à IA"
                className="w-full resize-y rounded border border-borda bg-superficie p-2 text-xs leading-relaxed focus:border-acento focus:outline-none disabled:opacity-60"
              />
              <p className="text-suave">
                O Nome, o Código, as referências, as medidas e as divergências entram sozinhos antes dele.
                Editar sem salvar vale só para esta janela.
              </p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={salvarPrompt}
                  disabled={prompt === null || prompt === promptSalvo || !promptValido || gerando || salvandoPrompt}
                  title="Guarda este texto como o prompt de toda descricao gerada"
                  className="inline-flex items-center gap-1 rounded border border-acento px-2 py-1 text-xs text-acento hover:bg-superficie disabled:opacity-40"
                >
                  {salvandoPrompt && <Loader size={12} className="animate-spin" />}
                  Salvar prompt
                </button>
                <button
                  type="button"
                  onClick={() => setPrompt(promptSalvo)}
                  disabled={prompt === null || prompt === promptSalvo || gerando || salvandoPrompt}
                  title="Descarta o que voce editou e volta ao prompt salvo"
                  className="rounded border border-borda px-2 py-1 text-xs hover:bg-superficie disabled:opacity-40"
                >
                  Voltar ao salvo
                </button>
                <button
                  type="button"
                  onClick={() => setPrompt(promptPadrao)}
                  disabled={prompt === null || prompt === promptPadrao || gerando || salvandoPrompt}
                  title="Poe na caixa o prompt original do sistema (para valer sempre, clique depois em Salvar prompt)"
                  className="rounded border border-borda px-2 py-1 text-xs hover:bg-superficie disabled:opacity-40"
                >
                  Restaurar padrão
                </button>
              </div>
              {erroPrompt && <p className="text-red-700">{erroPrompt}</p>}
            </div>

            <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
              <dt className="text-suave">Titulo:</dt>
              <dd className={produto.titulo ? "font-medium" : "text-amber-700"}>
                {produto.titulo || "preencha o Nome antes de gerar"}
              </dd>
              <dt className="text-suave">Codigo:</dt>
              <dd className={produto.sku ? "font-mono" : "text-amber-700"}>
                {produto.sku || "sem codigo: \"Itens inclusos\" sai sem (Cod:)"}
              </dd>
            </dl>

            <div className="mb-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={gerar}
                disabled={gerando || idsParaGerar.length === 0 || !promptValido}
                className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {gerando ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {gerando ? "Escrevendo..." : texto ? "Gerar de novo" : "Gerar com IA"}
              </button>
              <button
                type="button"
                onClick={organizar}
                disabled={!texto.trim() || gerando}
                className="inline-flex items-center gap-1.5 rounded border border-borda bg-superficie px-3 py-1.5 text-sm font-medium hover:border-acento disabled:cursor-not-allowed disabled:opacity-50"
              >
                <WandSparkles size={14} /> Organizar descrição
              </button>
            </div>

            {erro && <p className="mb-2 text-sm text-red-700">{erro}</p>}

            <div ref={rolagemDescricao} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {texto && opcoesParagrafos.some((opcoes) => opcoes.length > 1) && (
                <section aria-label="Opcoes dos paragrafos">
                  <h3 className="mb-2 text-sm font-semibold">Escolha os 2 primeiros paragrafos</h3>
                  {opcoesParagrafos.map((opcoes, grupo) =>
                    opcoes.length === 0 ? null : (
                      <div key={grupo} role="radiogroup" aria-label={`Opcoes do paragrafo ${grupo + 1}`} className="mb-3">
                        <p className="mb-1 text-xs font-semibold text-suave">Paragrafo {grupo + 1}</p>
                        <ul className="space-y-1">
                          {opcoes.map((opcao, indice) => {
                            const escolhida = escolhidosParagrafos[grupo] === indice;
                            return (
                              <li key={opcao}>
                                <button
                                  type="button"
                                  role="radio"
                                  aria-checked={escolhida}
                                  onClick={() => escolherParagrafo(grupo, indice)}
                                  className={`flex w-full items-start gap-2 rounded border px-3 py-2 text-left text-sm ${
                                    escolhida
                                      ? "border-acento bg-sky-50"
                                      : "border-borda bg-superficie hover:border-acento"
                                  }`}
                                >
                                  <span
                                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                      escolhida ? "border-acento bg-acento text-white" : "border-borda"
                                    }`}
                                  >
                                    {escolhida && <Check size={11} strokeWidth={3} />}
                                  </span>
                                  <span className="min-w-0 flex-1">{opcao}</span>
                                  <span className="shrink-0 text-[11px] text-suave tabular-nums">
                                    {opcao.length}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ),
                  )}
                </section>
              )}
              {texto ? (
                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Descricao para revisar</h3>
                    <button
                      type="button"
                      onClick={() => setEditandoTexto((atual) => !atual)}
                      className="text-xs text-acento hover:underline"
                    >
                      {editandoTexto ? "Revisar linha por linha" : "Editar texto completo"}
                    </button>
                  </div>
                  {editandoTexto ? (
                    <textarea
                      value={texto}
                      onChange={(evento) => setTexto(evento.target.value)}
                      className="min-h-80 w-full resize-y rounded border border-borda bg-superficie p-2.5 font-mono text-sm leading-relaxed focus:border-acento focus:outline-none"
                    />
                  ) : (
                    <LinhasDescricao
                      texto={texto}
                      divergencias={divergencias}
                      opcoesRestantes={opcoesRestantes}
                      selecoes={selecoes}
                      confirmadas={confirmadas}
                      aoSelecionar={(id, indice) => setSelecoes((atual) => ({ ...atual, [id]: indice }))}
                      aoEditarOpcao={editarOpcao}
                      aoExcluirOpcao={excluirOpcao}
                      aoExcluirLinha={excluirLinha}
                      aoMover={moverLinha}
                      aoMoverPasso={moverPorPasso}
                      rolagem={rolagemDescricao}
                    />
                  )}
                </section>
              ) : (
                <p className="rounded border border-borda bg-superficie p-3 font-mono text-sm text-suave">
                  A descricao gerada aparece aqui para revisao antes de usar.
                  Ou leve uma descricao da esquerda com &quot;Levar para edição&quot;.
                </p>
              )}
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[11px] text-suave">
                {prontasParaOrganizar > 0
                  ? prontasParaOrganizar + " escolha(s) marcada(s); clique em Organizar descrição."
                  : pendentes > 0
                    ? pendentes + " parâmetro(s) aguardam escolha."
                    : "Substitui o texto da aba Descricao."}
              </span>
              <button
                type="button"
                onClick={usar}
                disabled={!texto.trim() || pendentes > 0}
                className="rounded bg-acento px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Usar esta descricao
              </button>
            </div>
          </div>
        </div>
      </section>

      {textoParaLevar !== null && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) setTextoParaLevar(null);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="descricao-levar-titulo"
            className="w-full max-w-md rounded-lg border border-borda bg-superficie p-4 shadow-2xl"
          >
            <p id="descricao-levar-titulo" className="text-sm font-semibold">
              Substituir o texto da area de edicao?
            </p>
            <p className="mt-1 text-sm text-suave">
              O texto que esta la agora sera trocado por esta descricao.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setTextoParaLevar(null)}
                className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => levarParaEdicao(textoParaLevar)}
                className="rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Substituir
              </button>
            </div>
          </section>
        </div>
      )}

      {confirmandoSaida && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) setConfirmandoSaida(false);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="descricao-sair-titulo"
            className="w-full max-w-md rounded-lg border border-borda bg-superficie p-4 shadow-2xl"
          >
            <p id="descricao-sair-titulo" className="text-sm font-semibold">
              Sair sem usar a descricao?
            </p>
            <p className="mt-1 text-sm text-suave">
              {texto.trim()
                ? "O texto desta janela ainda nao foi usado e sera perdido."
                : "A descricao ainda esta sendo escrita e sera perdida."}
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmandoSaida(false)}
                className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo"
              >
                Continuar editando
              </button>
              <button
                type="button"
                onClick={fechar}
                className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Sair sem usar
              </button>
              {/* O "salvar" desta janela: o mesmo botao de baixo, que poe o texto na aba Descricao. */}
              <button
                type="button"
                onClick={usar}
                disabled={!texto.trim() || pendentes > 0}
                title={pendentes > 0 ? `${pendentes} parametro(s) aguardam escolha.` : undefined}
                className="rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Usar esta descricao
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
