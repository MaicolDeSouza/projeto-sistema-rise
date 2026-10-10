"use client";

import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
  useTransition,
} from "react";
import { ArrowRight, Check, Copy, ExternalLink, Loader, Pencil, Plus, Sparkles, Trash2, WandSparkles, X } from "lucide-react";

import {
  buscarDescricoesParaProduto,
  criarDescricaoIA,
  criarPromptDaDescricao,
  definirPromptPadraoDaDescricao,
  excluirPromptDaDescricao,
  promptsDaDescricao,
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
          { id: "descricao", rotulo: "Descrição" },
          { id: "especificacoes", rotulo: `Especificações (${quantas})` },
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
            title={podeLevar ? "Levar este texto para a área de edição" : "Aguarde a geração terminar"}
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
            {item.tipo === "ATUAL" ? "Este produto ainda não tem descrição salva." : "Esta loja não publica descrição."}
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
                title={podeAdicionar ? "Adicionar a especificação na descrição" : "Gere a descrição antes de adicionar"}
                aria-label={`Adicionar ${linha.nome || linha.valor} a descrição`}
                className="shrink-0 rounded p-0.5 text-acento hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-30"
              ><ArrowRight size={16} /></button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-suave">Esta loja não publica ficha técnica.</p>
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
                  title={"Remover " + referencia.fonte + " das referências"}
                  aria-label={"Remover " + referencia.fonte + " das referências"}
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

/// O que dizer quando o produto nao tem referencia: desde 07/10/2026 a janela nao procura mais pelo Nome no
/// catalogo das lojas. Desde 10/10/2026 (pedido do dono) a IA gera assim mesmo, a partir do proprio produto.
const SEM_REFERENCIAS =
  "Nenhum concorrente ou fornecedor neste produto: a IA escreve a partir do Nome e dos dados do produto (marca, modelo e descrição atual), sem inventar especificação. Confira as especificações antes de salvar. Para gerar a partir das lojas, adicione na aba Fornecedores / Concorrentes ou marque na lupa do Nome.";

/**
 * Janela "Criar descricao" — pedido do dono em 16/09/2026.
 *
 * A esquerda, os produtos dos fornecedores e concorrentes CADASTRADOS no produto (e os marcados na lupa),
 * em abas lado a lado, com a descricao e a ficha de cada loja; a direita, a criacao com IA no padrao da loja
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
  // A BIBLIOTECA DE PROMPTS (pedido do dono em 09/10/2026): `prompts` e a lista ({id, nome, texto, sistema,
  // padrao}), o "Padrao do sistema" primeiro; `promptId` e o escolhido (o mesmo na janela e no "Gerenciar prompts":
  // fechar o popup deixa a janela com o ultimo aberto nele, decisao do dono em 10/10/2026). `prompt` e `nomePrompt`
  // sao o texto e o nome NA CAIXA. `promptId` null com a lista lida = criando um prompt novo. `null` = ainda lendo.
  const [prompts, setPrompts] = useState(null);
  const [promptId, setPromptId] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [nomePrompt, setNomePrompt] = useState("");
  const [maximoPrompt, setMaximoPrompt] = useState(0);
  // O escolhido antes do "Novo prompt": descartar o novo volta para ele.
  const [anteriorId, setAnteriorId] = useState(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  // Alteracao nao salva + fechar, trocar de prompt ou "Novo prompt": o que fazer depois do Sair (descarta) ou do
  // Salvar da pergunta (pedido do dono em 10/10/2026, no molde do "Sair sem usar?" desta janela).
  const [saidaDoPrompt, setSaidaDoPrompt] = useState(null);
  const [promptCopiado, setPromptCopiado] = useState(false);
  const [erroPrompt, setErroPrompt] = useState(null);
  const [salvandoPrompt, iniciarSalvarPrompt] = useTransition();
  // O "Gerenciar prompts", por cima da janela (pedido do dono em 06/10/2026: a area da descricao precisa do espaco).
  const [editandoPrompt, setEditandoPrompt] = useState(false);

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
    setPrompts(null);
    setPromptId(null);
    setPrompt(null);
    setNomePrompt("");
    setErroPrompt(null);
    setEditandoPrompt(false);
    setAnteriorId(null);
    setSaidaDoPrompt(null);
    setConfirmandoExclusao(false);
    // A lista chega sozinha, sem esperar as referencias (a busca leva segundos), e ja vem com o PADRAO escolhido.
    promptsDaDescricao()
      .then((resposta) => {
        if (leitura !== leituraAtual.current) return;
        if (!resposta.ok) {
          setErroPrompt("Não deu para ler os prompts salvos. A geração usa o padrão mesmo assim.");
          return;
        }
        setMaximoPrompt(resposta.maximo);
        aplicarLista(resposta.prompts, (resposta.prompts.find((item) => item.padrao) ?? resposta.prompts[0]).id);
      })
      .catch(() => {
        if (leitura === leituraAtual.current) setErroPrompt("Não deu para ler os prompts salvos. A geração usa o padrão mesmo assim.");
      });
    iniciarLeitura(async () => {
      try {
        const resposta = await buscarDescricoesParaProduto(ids);
        if (leitura === leituraAtual.current) setDetalhes(resposta);
      } catch (falha) {
        if (leitura === leituraAtual.current) {
          setDetalhes({ ok: false, erro: falha?.message ?? "Falha ao ler as referências." });
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
    // Com o "Gerenciar prompts" aberto, o Esc (e o clique fora) e dele: fecha a pergunta aberta, ou o popup,
    // perguntando antes se ha alteracao nao salva.
    if (editandoPrompt) {
      if (saidaDoPrompt) setSaidaDoPrompt(null);
      else if (confirmandoExclusao) setConfirmandoExclusao(false);
      else comPergunta(fecharPrompt);
      return;
    }
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
      setErro("Este parágrafo foi editado no texto e não dá para trocar por uma opção. Edite lá, ou gere de novo.");
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

  /** Poe a lista nova e escolhe `id` nela (o texto e o nome vao para a caixa). */
  function aplicarLista(lista, id) {
    const escolhido = lista.find((item) => item.id === id) ?? lista[0];
    setPrompts(lista);
    setPromptId(escolhido.id);
    setPrompt(escolhido.texto);
    setNomePrompt(escolhido.nome);
  }

  /** O que esta na caixa difere do salvo? No prompt novo, qualquer nome ou texto escrito conta. */
  function promptAlterado() {
    if (prompt === null || prompts === null) return false;
    if (promptId === null) return Boolean(nomePrompt.trim() || prompt.trim());
    const salvo = prompts.find((item) => item.id === promptId);
    return Boolean(salvo) && (prompt !== salvo.texto || nomePrompt !== salvo.nome);
  }

  /** Fecha o "Gerenciar prompts"; a janela fica com o prompt que estava aberto nele. */
  function fecharPrompt() {
    setEditandoPrompt(false);
    setConfirmandoExclusao(false);
    setErroPrompt(null);
  }

  /** Roda `acao(lista)` direto, ou depois da pergunta quando ha alteracao nao salva. */
  function comPergunta(acao) {
    setConfirmandoExclusao(false);
    if (promptAlterado()) setSaidaDoPrompt(() => acao);
    else acao(prompts);
  }

  /** "Sair" da pergunta: volta a caixa ao salvo (o novo descartado volta ao escolhido antes dele) e segue. */
  function descartarESeguir() {
    const acao = saidaDoPrompt;
    setSaidaDoPrompt(null);
    setErroPrompt(null);
    aplicarLista(prompts, promptId ?? anteriorId);
    acao?.(prompts);
  }

  /** Trocar no seletor do popup (ou da janela): o texto e o nome do escolhido vao para a caixa. */
  function escolherPrompt(id) {
    setErroPrompt(null);
    comPergunta((lista) => aplicarLista(lista, id));
  }

  /** "Novo prompt": a caixa e o nome ficam vazios e o seletor sem escolha, ate o Salvar criar o prompt. */
  function novoPrompt() {
    setErroPrompt(null);
    comPergunta(() => {
      setAnteriorId((atual) => promptId ?? atual);
      setPromptId(null);
      setPrompt("");
      setNomePrompt("");
    });
  }

  /**
   * "Salvar": cria o prompt novo ou grava nome e texto no escolhido (o do sistema inclusive, desde 10/10/2026).
   * `depois(lista)` e o que a pergunta de saida pediu; pelo botao do rodape, o popup fecha (pedido do dono em
   * 06/10/2026: salvar volta para a tela normal).
   */
  function gravarPrompt(depois = fecharPrompt) {
    setErroPrompt(null);
    iniciarSalvarPrompt(async () => {
      try {
        const resposta =
          promptId === null
            ? await criarPromptDaDescricao(nomePrompt, prompt)
            : await salvarPromptDaDescricao(promptId, nomePrompt, prompt);
        setSaidaDoPrompt(null);
        if (!resposta.ok) {
          setErroPrompt(resposta.erro);
          return;
        }
        aplicarLista(resposta.prompts, resposta.prompt.id);
        depois(resposta.prompts);
      } catch (falha) {
        setSaidaDoPrompt(null);
        setErroPrompt(falha?.message ?? "Falha ao gravar o prompt.");
      }
    });
  }

  /** Excluir e "Usar como padrao": rodam a acao e aplicam a lista que ela devolve. */
  function naBiblioteca(acao, escolher, { manterCaixa = false } = {}) {
    setErroPrompt(null);
    iniciarSalvarPrompt(async () => {
      try {
        const resposta = await acao();
        if (!resposta.ok) {
          setErroPrompt(resposta.erro);
          return;
        }
        // `manterCaixa`: so a lista muda; o texto e o nome que estao sendo editados ficam como estao.
        if (manterCaixa) setPrompts(resposta.prompts);
        else aplicarLista(resposta.prompts, escolher(resposta));
        setConfirmandoExclusao(false);
      } catch (falha) {
        setErroPrompt(falha?.message ?? "Falha ao gravar o prompt.");
      }
    });
  }

  /** "Excluir": sai da lista, e a caixa fica com o prompt que ficou como padrao. O do sistema nao se exclui. */
  function excluirPrompt() {
    naBiblioteca(
      () => excluirPromptDaDescricao(promptId),
      (resposta) => (resposta.prompts.find((item) => item.padrao) ?? resposta.prompts[0]).id,
    );
  }

  /** "Usar como padrão": o escolhido passa a vir escolhido ao abrir a janela. O texto da caixa nao muda. */
  function tornarPadrao() {
    naBiblioteca(() => definirPromptPadraoDaDescricao(promptId), () => promptId, { manterCaixa: true });
  }

  async function copiarPrompt() {
    try {
      await navigator.clipboard.writeText(prompt ?? "");
      setPromptCopiado(true);
      setTimeout(() => setPromptCopiado(false), 1500);
    } catch {
      // Sem permissao de area de transferencia: so nao copia.
    }
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
  // O escolhido como esta SALVO (null no prompt novo).
  const promptEscolhido = prompts?.find((item) => item.id === promptId) ?? null;
  const criandoPrompt = prompts !== null && promptId === null;
  const promptEditado = promptAlterado();

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
        aria-label="Criar descrição"
        className="flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-borda p-3">
          <span className="text-sm font-semibold">Criar descrição</span>
          <button
            type="button"
            onClick={pedirFechamento}
            aria-label="Fechar criar descrição"
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
                  <Loader size={14} className="animate-spin" /> Lendo as referências...
                </p>
              ) : !detalhes.ok && descricaoAtual === null ? (
                <p className="text-sm text-red-700">{detalhes.erro}</p>
              ) : itens.length === 0 && excluidos.size > 0 && descricaoAtual === null ? (
                <p className="text-sm text-suave">
                  Todas as referências foram removidas desta geração.{" "}
                  <button
                    type="button"
                    onClick={() => setExcluidos(new Set())}
                    className="text-acento hover:underline"
                  >
                    Trazer de volta
                  </button>
                </p>
              ) : itens.length === 0 && descricaoAtual === null ? (
                <p className="text-sm text-suave">{SEM_REFERENCIAS}</p>
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
                {detalhes.encontrados} produto(s) de {detalhes.fontes} loja(s): os fornecedores e concorrentes
                cadastrados neste produto e os marcados na lupa, até {detalhes.limite}. Você pode remover uma aba
                antes de gerar.
              </p>
            )}
            {/* Com a descricao atual na tela, a lista de referencias some atras dela: o aviso fica aqui embaixo. */}
            {detalhes?.ok && detalhes.encontrados === 0 && descricaoAtual !== null && (
              <p className="mt-2 text-xs text-amber-700">{SEM_REFERENCIAS}</p>
            )}
          </div>

          {/* ---------- Criar com IA ---------- */}
          <div className="flex min-h-0 flex-col rounded-lg border border-borda bg-fundo p-3">
            <p className="mb-1 text-xs font-semibold tracking-wide text-suave uppercase">
              Criar a descrição com IA
            </p>
            {/*
              O prompt que vai para a IA: a LISTA da biblioteca (pedido do dono em 09/10/2026) e o botao "Gerenciar
              prompts" (era "Editar prompt" ate 10/10/2026), que abre o popup por cima (ver `editandoPrompt`).
            */}
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <label htmlFor="descricao-prompt-escolhido" className="font-medium text-suave">
                Prompt:
              </label>
              <select
                id="descricao-prompt-escolhido"
                value={promptId ?? ""}
                onChange={(evento) => escolherPrompt(evento.target.value)}
                disabled={prompts === null || gerando || salvandoPrompt}
                className="max-w-56 min-w-0 rounded border border-borda bg-superficie px-2 py-1 text-xs focus:border-acento focus:outline-none disabled:opacity-60"
              >
                {prompts === null ? (
                  <option value="">lendo...</option>
                ) : (
                  prompts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome}
                      {item.padrao ? " (padrão)" : ""}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                onClick={() => setEditandoPrompt(true)}
                disabled={prompt === null || gerando}
                className="ml-auto inline-flex items-center gap-1 rounded border border-acento bg-superficie px-2 py-1 text-xs font-medium text-acento hover:bg-sky-50 disabled:opacity-40"
              >
                <Pencil size={12} /> Gerenciar prompts
              </button>
              {erroPrompt && !editandoPrompt && <p className="w-full text-red-700">{erroPrompt}</p>}
            </div>

            <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
              <dt className="text-suave">Título:</dt>
              <dd className={produto.titulo ? "font-medium" : "text-amber-700"}>
                {produto.titulo || "preencha o Nome antes de gerar"}
              </dd>
              <dt className="text-suave">Código:</dt>
              <dd className={produto.sku ? "font-mono" : "text-amber-700"}>
                {produto.sku || "sem código: \"Itens inclusos\" sai sem (Cod:)"}
              </dd>
            </dl>

            <div className="mb-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={gerar}
                disabled={gerando || !promptValido || (idsParaGerar.length === 0 && !produto.titulo)}
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
              {/* "Salvar e sair" aqui em cima, a direita (pedido do dono em 09/10/2026; era "Usar esta descrição", no pe
                  da janela): poe o texto na aba Descricao e fecha. */}
              <button
                type="button"
                onClick={usar}
                disabled={!texto.trim() || pendentes > 0}
                title={pendentes > 0 ? `${pendentes} parâmetro(s) aguardam escolha.` : "Substitui o texto da aba Descrição e fecha"}
                className="ml-auto rounded bg-acento px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Salvar e sair
              </button>
            </div>

            {erro && <p className="mb-2 text-sm text-red-700">{erro}</p>}

            <div ref={rolagemDescricao} className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
              {texto && opcoesParagrafos.some((opcoes) => opcoes.length > 1) && (
                <section aria-label="Opções dos parágrafos">
                  <h3 className="mb-2 text-sm font-semibold">Escolha os 2 primeiros parágrafos</h3>
                  {opcoesParagrafos.map((opcoes, grupo) =>
                    opcoes.length === 0 ? null : (
                      <div key={grupo} role="radiogroup" aria-label={`Opções do parágrafo ${grupo + 1}`} className="mb-3">
                        <p className="mb-1 text-xs font-semibold text-suave">Parágrafo {grupo + 1}</p>
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
              {/*
                A caixa fica aberta para digitar desde o inicio (pedido do dono em 10/10/2026), com ou sem referencia.
                E o MESMO <textarea> antes e depois da primeira tecla (mesma posicao na arvore): trocar de elemento
                no meio da digitacao tiraria o cursor da caixa. A primeira tecla liga "Editar texto completo", senao
                a revisao linha a linha tomaria o lugar da caixa.
              */}
              <section>
                {texto && (
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Descrição para revisar</h3>
                    <button
                      type="button"
                      onClick={() => setEditandoTexto((atual) => !atual)}
                      className="text-xs text-acento hover:underline"
                    >
                      {editandoTexto ? "Revisar linha por linha" : "Editar texto completo"}
                    </button>
                  </div>
                )}
                {editandoTexto || !texto ? (
                  <textarea
                    value={texto}
                    onChange={(evento) => {
                      setTexto(evento.target.value);
                      setEditandoTexto(true);
                    }}
                    aria-label="Descrição"
                    placeholder={'Digite a descrição aqui, gere com IA ou leve uma descrição da esquerda com "Levar para edição".'}
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
            </div>

            <p className="mt-2 text-[11px] text-suave">
              {prontasParaOrganizar > 0
                ? prontasParaOrganizar + " escolha(s) marcada(s); clique em Organizar descrição."
                : pendentes > 0
                  ? pendentes + " parâmetro(s) aguardam escolha."
                  : '"Salvar e sair" substitui o texto da aba Descrição.'}
            </p>
          </div>
        </div>
      </section>

      {/*
        "Gerenciar prompts" (desenho do dono em 10/10/2026): no topo o seletor, o "Novo prompt" e o "Usar como
        padrao"; no quadro do texto, o Nome (sempre visivel: renomeia o escolhido ou da nome ao novo), copiar e o
        contador; no rodape so Excluir e Salvar. Fechar (clique fora, X, Esc) pergunta antes se ha o que perder.
      */}
      {editandoPrompt && prompt !== null && (promptEscolhido || criandoPrompt) && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) comPergunta(fecharPrompt);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="descricao-prompt-titulo"
            className="flex h-[85vh] w-full max-w-5xl flex-col rounded-lg border border-borda bg-superficie p-4 shadow-2xl"
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label htmlFor="descricao-prompt-gerenciar" id="descricao-prompt-titulo" className="text-sm font-semibold">
                Prompt:
              </label>
              <select
                id="descricao-prompt-gerenciar"
                value={promptId ?? ""}
                onChange={(evento) => escolherPrompt(evento.target.value)}
                disabled={salvandoPrompt}
                className="w-64 rounded border border-borda bg-superficie px-2 py-1 text-sm focus:border-acento focus:outline-none disabled:opacity-60"
              >
                {/* Criando um prompt novo, o seletor fica vazio (pedido do dono). */}
                {criandoPrompt && <option value="" />}
                {prompts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                    {item.padrao ? " (padrão)" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={novoPrompt}
                disabled={salvandoPrompt || criandoPrompt}
                className="inline-flex items-center gap-1 rounded border border-acento px-2 py-1 text-sm font-medium text-acento hover:bg-sky-50 disabled:opacity-40"
              >
                <Plus size={14} /> Novo prompt
              </button>
              {promptEscolhido?.padrao ? (
                <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">
                  padrão: já vem escolhido ao abrir
                </span>
              ) : (
                promptEscolhido && (
                  <button
                    type="button"
                    onClick={tornarPadrao}
                    disabled={salvandoPrompt}
                    title="Este prompt passa a vir escolhido ao abrir a janela"
                    className="rounded border border-borda px-2 py-0.5 text-[11px] hover:bg-fundo disabled:opacity-40"
                  >
                    Usar como padrão
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => comPergunta(fecharPrompt)}
                aria-label="Fechar o prompt"
                className="ml-auto rounded p-1 text-suave hover:bg-fundo"
              >
                <X size={16} />
              </button>
            </div>

            {/* O quadro do prompt: o Nome na primeira linha, com copiar e o contador; o texto embaixo. */}
            <div className="flex min-h-0 flex-1 flex-col rounded border border-borda bg-white focus-within:border-acento">
              <div className="flex flex-wrap items-center gap-2 border-b border-borda px-3 py-2">
                <label htmlFor="descricao-prompt-nome" className="text-sm font-medium text-suave">
                  Nome:
                </label>
                <input
                  key={promptId ?? "novo"}
                  id="descricao-prompt-nome"
                  value={nomePrompt}
                  onChange={(evento) => setNomePrompt(evento.target.value)}
                  disabled={salvandoPrompt}
                  autoFocus={criandoPrompt}
                  placeholder="Dê um nome ao prompt (ex.: Motor DC)"
                  className="w-72 rounded border border-borda px-2 py-1 text-sm font-semibold focus:border-acento focus:outline-none"
                />
                <button
                  type="button"
                  onClick={copiarPrompt}
                  disabled={!prompt}
                  title="Copiar todo o texto do prompt"
                  aria-label="Copiar todo o texto do prompt"
                  className="ml-auto rounded p-1.5 text-suave hover:bg-fundo hover:text-texto disabled:opacity-40"
                >
                  {promptCopiado ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                </button>
                <span
                  className={`text-xs ${prompt.trim().length > maximoPrompt ? "font-medium text-red-700" : "text-suave"}`}
                >
                  {prompt.trim().length}/{maximoPrompt}
                </span>
              </div>
              <textarea
                value={prompt}
                onChange={(evento) => setPrompt(evento.target.value)}
                disabled={salvandoPrompt}
                autoFocus={!criandoPrompt}
                aria-label="Texto do prompt"
                placeholder={criandoPrompt ? "Escreva aqui as instruções para a IA." : undefined}
                className="min-h-0 flex-1 resize-none rounded-b p-3 text-sm leading-relaxed focus:outline-none disabled:opacity-60"
              />
            </div>
            {erroPrompt && <p className="mt-2 text-sm text-red-700">{erroPrompt}</p>}

            {/* "Excluir": confirma antes; o prompt some da lista e a caixa fica com o padrao. */}
            {confirmandoExclusao && promptEscolhido && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-red-200 bg-red-50 p-2 text-sm">
                <span className="font-medium text-red-800">Excluir o prompt &quot;{promptEscolhido.nome}&quot;?</span>
                <button
                  type="button"
                  onClick={excluirPrompt}
                  disabled={salvandoPrompt}
                  className="rounded bg-red-600 px-3 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Excluir
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoExclusao(false)}
                  className="rounded border border-borda bg-white px-3 py-1 hover:bg-fundo"
                >
                  Cancelar
                </button>
              </div>
            )}

            {/* So Excluir e Salvar (pedido do dono em 10/10/2026). */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmandoExclusao(true)}
                disabled={!promptEscolhido || promptEscolhido.sistema || salvandoPrompt}
                title={
                  promptEscolhido?.sistema
                    ? "O Padrão do sistema não se exclui: ele pode ser editado e salvo."
                    : criandoPrompt
                      ? "O prompt novo ainda não foi salvo."
                      : "Exclui este prompt"
                }
                className="inline-flex items-center gap-1 rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={14} /> Excluir
              </button>
              <button
                type="button"
                onClick={() => gravarPrompt()}
                disabled={!promptEditado || !promptValido || !nomePrompt.trim() || salvandoPrompt}
                title={
                  !nomePrompt.trim()
                    ? "Dê um nome ao prompt antes de salvar"
                    : criandoPrompt
                      ? "Cria o prompt com este nome e texto"
                      : "Grava o nome e o texto neste prompt"
                }
                className="ml-auto inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvandoPrompt && <Loader size={14} className="animate-spin" />}
                Salvar
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Alteracao nao salva no prompt: Sair (descarta) / Salvar / Cancelar, como o "Sair sem usar?" desta janela. */}
      {saidaDoPrompt && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(evento) => {
            if (evento.target === evento.currentTarget) setSaidaDoPrompt(null);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="descricao-prompt-sair-titulo"
            className="w-full max-w-md rounded-lg border border-borda bg-superficie p-4 shadow-2xl"
          >
            <p id="descricao-prompt-sair-titulo" className="text-sm font-semibold">
              Salvar as alterações do prompt?
            </p>
            <p className="mt-1 text-sm text-suave">
              {criandoPrompt
                ? "O prompt novo ainda não foi salvo e será perdido."
                : `O prompt "${promptEscolhido?.nome ?? ""}" tem alterações que ainda não foram salvas.`}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={descartarESeguir}
                title="Descarta as alterações"
                className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Sair
              </button>
              <button
                type="button"
                onClick={() => gravarPrompt(saidaDoPrompt)}
                disabled={!promptValido || !nomePrompt.trim() || salvandoPrompt}
                title={!nomePrompt.trim() ? "Dê um nome ao prompt antes de salvar" : "Salva e continua"}
                className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {salvandoPrompt && <Loader size={14} className="animate-spin" />}
                Salvar
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => setSaidaDoPrompt(null)}
                title="Volta para o prompt, sem perder nada"
                className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo"
              >
                Cancelar
              </button>
            </div>
          </section>
        </div>
      )}

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
              Substituir o texto da área de edição?
            </p>
            <p className="mt-1 text-sm text-suave">
              O texto que está lá agora será trocado por esta descrição.
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
              Sair sem usar a descrição?
            </p>
            <p className="mt-1 text-sm text-suave">
              {texto.trim()
                ? "O texto desta janela ainda não foi usado e será perdido."
                : "A descrição ainda está sendo escrita e será perdida."}
            </p>
            {/* Sair / Salvar / Cancelar, nesta ordem (pedido do dono em 06/10/2026; antes "Sair sem usar",
                "Usar esta descricao" e "Continuar editando"). */}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={fechar}
                title="Fecha a janela e descarta o texto"
                className="rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                Sair
              </button>
              {/* O "salvar" desta janela: o mesmo "Usar esta descricao" de baixo, que poe o texto na aba Descricao. */}
              <button
                type="button"
                onClick={usar}
                disabled={!texto.trim() || pendentes > 0}
                title={pendentes > 0 ? `${pendentes} parâmetro(s) aguardam escolha.` : "Põe o texto na aba Descrição e fecha"}
                className="rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Salvar
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmandoSaida(false)}
                title="Volta para a janela, sem perder nada"
                className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo"
              >
                Cancelar
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
