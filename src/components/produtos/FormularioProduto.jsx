"use client";

import {
  Fragment,
  createContext,
  useActionState,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BadgeDollarSign,
  Calculator,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  Hammer,
  ListChecks,
  Loader,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import GastoDaIA, { GastoDoProduto } from "@/components/ui/GastoDaIA";
import { somarResumos } from "@/lib/ia/gasto";
import { acompanharTituloNaDescricao } from "@/lib/ia/revisaoDescricao";

/** O gasto que foi no Salvar (campo oculto `gastoIA`), para a tela passa-lo ao total quando o servidor ja o gravou. */
function lerGastoEnviado(formData) {
  try {
    return JSON.parse(String(formData.get("gastoIA") || "null"));
  } catch {
    return null;
  }
}
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { UNIDADES } from "@/lib/unidades";
import { ORIGENS, TIPOS_ITEM, TIPOS_PRODUCAO } from "@/lib/fiscal";
import { LIMITE_TITULO_ML, MAXIMO_DOCUMENTO_BYTES, MAXIMO_FOTOS_NO_PAINEL, MAXIMO_IMAGENS } from "@/lib/limites";
import { medidasDaDescricao } from "@/lib/medidas";
import { posicaoDePreco } from "@/lib/posicaoDePreco";
import { gerarEanDoSku } from "@/lib/eanInterno";
import { indisponivel, ordenarPrecosDasReferencias, situacaoDeEstoque } from "@/lib/estoqueDoConcorrente";
import { codigoSugeridoDoKit, localizacaoDoKit, ncmsDasPecas, pesoEMedidasDoKit, totaisDoKit } from "@/lib/composicao";
import { DocumentosDasPecas, FornecedoresDoKit, MedidasDoKit } from "./AbasDoKit";
import BuscarPorCodigo from "./BuscarPorCodigo";
import Composicao from "./Composicao";
import Concorrentes from "./Concorrentes";
import PecasProprias, { custoDaLista, linhaVazia } from "./PecasProprias";
import JanelaProduzir from "@/components/producao/JanelaProduzir";
import EditorDescricao from "./EditorDescricao";
import Fornecedores from "./Fornecedores";
import JanelaDescricao from "./JanelaDescricao";
import PainelDeImagens from "./PainelDeImagens";
import BannerDeRascunho from "./BannerDeRascunho";
import PropostaNoTopo, { DocumentosDaProposta, OlhoDaProposta } from "./QuadroDaProposta";
import { listaComParametros, lerUltimaLista } from "@/lib/ultimaListaDeProdutos";
import { propostaNoFormulario } from "@/lib/proposta/aplicar";
import { useRascunhoAutomatico } from "./useRascunhoAutomatico";
import CategoriasDaLoja from "./CategoriasDaLoja";
import SeoDaLoja from "./SeoDaLoja";
import { chaveDoRascunho } from "@/lib/rascunhoDoCadastro";
import { propsDoFundo } from "@/lib/fundoDaJanela";
import { fornecedoresComRascunho } from "@/lib/fornecedorRascunho";
import ReferenciasDeMercado, { MAXIMO_MARCADOS } from "./ReferenciasDeMercado";
import SeloPosicaoDePreco from "./SeloPosicaoDePreco";
import {
  descartarLoteDeArquivos,
  importarFotosDasReferencias,
  importarImagensDaOrigem,
  prepararFotosDoProduto,
  removerImagensDoLote,
} from "@/app/produtos/acoes-imagens";
import {
  buscarPorPalavras,
  camposDasReferencias,
  consultarSituacaoConcorrentes,
  conferirEanNoMercadoLivre,
  criarTitulosIA,
  anexarDocumentoDaPeca,
  copiarDocumentosParaClone,
  enviarArquivoTemporario,
  gerarSku,
  documentosDasReferencias,
  pecaDeOrigemDoKit,
  removerArquivoTemporario,
  salvarProduto,
} from "@/app/produtos/acoes";

/// O que o formulario faz quando NAO recebe `acessos` (a tela de hoje, sem restricao). O calculo de verdade e
/// `acessosDoCadastro` (src/lib/acessos/produto.js), feito no servidor pelas paginas.
const ACESSO_TOTAL = { editar: true, custo: true, concorrentes: true, referencias: true, ia: true, margem: "sempre", cadastrarFornecedor: true, cadastrarConcorrente: true };

const ABAS = [
  { id: "caracteristicas", rotulo: "Características" },
  // So aparece no produto "Com composicao" (kit); fica montada e escondida como as outras.
  { id: "composicao", rotulo: "Composição" },
  { id: "descricao", rotulo: "Descrição" },
  { id: "fornecedores", rotulo: "Fornecedores / Concorrentes" },
  { id: "documentos", rotulo: "Documentos técnicos" },
  { id: "dimensoes", rotulo: "Peso e dimensões" },
  { id: "tributacao", rotulo: "Tributação" },
  // Categorias e SEO da Loja Integrada, DO PRODUTO (pedido do dono em 25/10/2026): as duas ultimas abas, ao lado de Tributacao.
  { id: "categorias", rotulo: "Categorias" },
  { id: "seo", rotulo: "SEO" },
];

/**
 * Executa uma acao de servidor e devolve o erro em vez de deixa-lo escapar.
 *
 * Sem isso, uma falha dentro de uma transicao vira excecao nao tratada e a
 * pagina inteira cai — foi o que acontecia quando o arquivo estourava o limite
 * de corpo da requisicao: o usuario perdia a tela em vez de ler o motivo.
 */
async function tentar(acao) {
  try {
    return await acao();
  } catch (erro) {
    return {
      ok: false,
      erro:
        erro?.message?.includes("Body exceeded") || erro?.name === "TypeError"
          ? "Falha ao enviar o arquivo. Ele pode ser grande demais para a conexão."
          : (erro?.message ?? "Falha inesperada ao executar a ação."),
    };
  }
}

/**
 * O <input type="number"> do navegador aceita "e", "E", "+" e "-" por causa da
 * notacao cientifica ("1e3"), e o dono achou "-e" digitado na Garantia em
 * 16/09/2026. Nenhum campo do cadastro usa isso: peso, medida, preco e garantia
 * nao sao negativos nem cientificos. Campo de numero inteiro (step="1") tambem
 * recusa ponto e virgula.
 */
function bloquearSimbolosDeNumero(evento, inteiro) {
  const proibidas = inteiro
    ? ["e", "E", "+", "-", ".", ","]
    : ["e", "E", "+", "-"];
  if (proibidas.includes(evento.key)) evento.preventDefault();
}

/** Props extras para qualquer <input> de numero do cadastro. */
function propsDeNumero(props) {
  if (props.type !== "number") return {};
  return {
    onKeyDown: (evento) => {
      bloquearSimbolosDeNumero(evento, String(props.step ?? "") === "1");
      props.onKeyDown?.(evento);
    },
  };
}

const CLASSE_CAMPO =
  "mt-1 w-full rounded border px-2.5 py-2 text-[15px] font-medium focus:outline-none";

/**
 * Os campos que a proposta preencheu ao abrir o produto (pedido do dono em 22/10/2026): `valores` (campo -> valor) e
 * `editados` (campos que o dono ja mexeu). O `Campo` e o `CampoComIcone` leem daqui para pôr a marca "PROPOSTA".
 */
const PropostaNosCampos = createContext(null);

/** A marca "PROPOSTA" embaixo do campo que a proposta preencheu; some quando o dono edita o campo. */
function MarcaDaProposta({ nome }) {
  const proposta = useContext(PropostaNosCampos);
  if (!proposta || !Object.hasOwn(proposta.valores, nome) || proposta.editados.has(nome)) return null;
  return (
    <p
      className="mt-1 text-[10px] font-semibold tracking-wide text-amber-700 uppercase"
      title="Valor preenchido pela proposta: confira e salve."
    >
      Proposta
    </p>
  );
}

/**
 * Escreve um valor num campo do formulario por fora e avisa o formulario como se fosse digitado (marca alterado e agenda o
 * rascunho). Pelo "setter" nativo: a descricao e um <textarea> CONTROLADO, e o React ignora o evento quando o valor e escrito
 * direto (o rastreador dele ja ve o valor novo e nao chama o onChange). Nos campos nao controlados da no mesmo.
 */
function escreverNoCampo(campo, valor) {
  const prototipo = Object.getPrototypeOf(campo);
  Object.getOwnPropertyDescriptor(prototipo, "value")?.set?.call(campo, String(valor));
  campo.dispatchEvent(new Event(campo.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
}

/**
 * Campo SEM lista propria (garantia, unidade, origem, tipo do item, CEST, descricao...; decisao C do dono em 22/10/2026):
 * um icone de lista ao lado do rotulo traz o unico item que a proposta deixou para o campo. Desde 24/10/2026 (pedido do
 * dono: "Proposta escrita direto no campo, com o original na lista") ele e quase sempre o ORIGINAL (o valor de antes da
 * proposta, etiqueta "Original"); no campo que o dono editou, e o da proposta (etiqueta "Proposta"). Escolher escreve no
 * campo e avisa o formulario pelo mesmo evento da digitacao. Numa lista de escolha mostra o texto da opcao.
 */
function IconeDaProposta({ nome }) {
  const sugestao = useContext(PropostaNosCampos)?.listas?.[nome];
  const [aberto, setAberto] = useState(null);
  if (!sugestao) return null;
  const original = sugestao.tipo === "original";

  function abrir(evento) {
    if (aberto) return setAberto(null);
    const campo = evento.currentTarget.form?.elements?.[nome];
    const opcao = campo?.tagName === "SELECT" ? [...campo.options].find((item) => item.value === String(sugestao.valor)) : null;
    setAberto({ texto: opcao?.textContent || String(sugestao.valor) });
  }

  function usar(evento) {
    const campo = evento.currentTarget.form?.elements?.[nome];
    if (campo) escreverNoCampo(campo, sugestao.valor);
    setAberto(null);
  }

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={abrir}
        title={original ? "Ver o valor que o produto tinha antes da proposta" : "A proposta sugere outro valor"}
        aria-label={`${sugestao.rotulo}: ${original ? "valor original" : "sugestão da proposta"}`}
        className={`relative rounded p-0.5 hover:bg-fundo ${COR_DE_USO.referencia}`}
      >
        <ListChecks size={15} />
        <Contador quantidade={1} usado={false} />
      </button>
      {aberto && (
        <ListaFlutuante largura={nome === "descricaoBase" ? "w-[30rem]" : "w-72"} aoFechar={() => setAberto(null)}>
          <button
            type="button"
            onClick={usar}
            className="flex w-full items-start justify-between gap-3 rounded border border-borda px-3 py-2 text-left font-normal hover:border-acento hover:bg-sky-50"
          >
            <span className="min-w-0">
              <span className={`block text-sm font-medium ${nome === "descricaoBase" ? "line-clamp-4 whitespace-pre-line" : ""}`}>{aberto.texto}</span>
              {sugestao.origem && <span className="block truncate text-[11px] text-suave">{sugestao.origem}</span>}
            </span>
            <SeloDaProposta tipo={sugestao.tipo} />
          </button>
        </ListaFlutuante>
      )}
    </span>
  );
}

/**
 * A etiqueta do item da proposta nas listas dos campos: "Proposta" (o valor que a proposta sugere) ou "Original" (o valor
 * que o produto tinha antes de a proposta escrever no campo).
 */
function SeloDaProposta({ tipo = "proposta" }) {
  return tipo === "original" ? (
    <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-semibold text-slate-700">Original</span>
  ) : (
    <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Proposta</span>
  );
}

/** Liga/desliga "Lista personalizada" (era "Pecas proprias") (26/10/2026), na altura dos campos de estoque minimo e maximo. */
function InterruptorPecasProprias({ ligado, aoTrocar }) {
  return (
    <div>
      <span className="flex items-center gap-1 text-sm font-semibold">
        Lista personalizada
        <BolhaDeAjuda
          variante="inline"
          texto="Para produto que você monta: o custo vem das peças, e o estoque entra só pela ordem de produção. Ligado, fornecedores e concorrentes ficam escondidos."
        />
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label="Lista personalizada"
        onClick={aoTrocar}
        className="mt-1 flex h-[42px] items-center gap-2.5 text-sm"
      >
        <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${ligado ? "bg-emerald-600" : "bg-slate-300"}`}>
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${ligado ? "left-[22px]" : "left-0.5"}`} />
        </span>
        <span className={ligado ? "font-medium text-emerald-700" : "text-suave"}>{ligado ? "Ligado" : "Desligado"}</span>
      </button>
    </div>
  );
}

/** Desligar com itens: popup que lista as pecas antes de apagar a lista (pedido do dono, para nao perder o feito). */
function JanelaDesligarPecas({ pecas, aoCancelar, aoConfirmar }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" {...propsDoFundo(aoCancelar)}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-desligar-pecas"
        onKeyDown={(evento) => evento.key === "Escape" && aoCancelar()}
        className="w-full max-w-md rounded-lg bg-superficie p-5 shadow-xl"
      >
        <h2 id="titulo-desligar-pecas" className="text-base font-semibold">
          Desligar lista personalizada?
        </h2>
        <p className="mt-1 text-sm text-suave">
          {pecas.length === 1 ? "A peça abaixo sai" : `As ${pecas.length} peças abaixo saem`} da lista ao salvar o produto.
        </p>
        <ul className="mt-3 max-h-56 divide-y divide-borda overflow-y-auto rounded border border-borda text-sm">
          {pecas.map((peca, indice) => (
            <li key={peca.chave ?? peca.id ?? indice} className="flex gap-2 px-3 py-1.5">
              <span className="w-20 shrink-0 font-mono text-xs leading-5">{peca.sku ?? "manual"}</span>
              <span className="min-w-0 flex-1 truncate">{peca.nome ?? peca.descricao ?? "item manual"}</span>
              <span className="shrink-0 text-suave">× {peca.quantidade}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" autoFocus onClick={aoCancelar} className="rounded border border-borda px-3 py-2 text-sm hover:bg-fundo">
            Cancelar
          </button>
          <button type="button" onClick={aoConfirmar} className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">
            Desligar e apagar
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ nome, rotulo, erro, ajuda, children, ...props }) {
  return (
    <div>
      <label htmlFor={nome} className="flex items-center gap-1 text-sm font-semibold">
        {rotulo}
        {ajuda && <BolhaDeAjuda texto={ajuda} variante="inline" />}
        <IconeDaProposta nome={nome} />
      </label>
      {children ?? (
        <input
          id={nome}
          name={nome}
          className={`${CLASSE_CAMPO} ${
            erro ? "border-red-400" : "border-borda focus:border-acento"
          }`}
          {...props}
          {...propsDeNumero(props)}
        />
      )}
      {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}
      <MarcaDaProposta nome={nome} />
    </div>
  );
}

function Selecao({ nome, rotulo, opcoes, inicial, ajuda, semVazio = false }) {
  return (
    <Campo nome={nome} rotulo={rotulo} ajuda={ajuda}>
      <select
        id={nome}
        name={nome}
        defaultValue={inicial ?? ""}
        className={`${CLASSE_CAMPO} border-borda focus:border-acento`}
      >
        {!semVazio && <option value="">Selecione</option>}
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
    </Campo>
  );
}

/** Interruptor de situacao, no lugar da caixa de selecao. */
function Interruptor({ nome, inicial }) {
  const [ligado, setLigado] = useState(inicial ?? true);

  return (
    <div>
      <span className="block text-sm font-semibold">Situação</span>
      <input type="hidden" name={nome} value={ligado ? "on" : ""} />
      <button
        type="button"
        onClick={() => setLigado((atual) => !atual)}
        role="switch"
        aria-checked={ligado}
        className="mt-2 inline-flex items-center gap-2"
      >
        <span
          className={`relative h-5 w-9 rounded-full transition ${
            ligado ? "bg-emerald-500" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${
              ligado ? "left-4.5" : "left-0.5"
            }`}
          />
        </span>
        <span
          className={`text-[15px] font-medium ${
            ligado ? "text-emerald-700" : "text-suave"
          }`}
        >
          {ligado ? "Ativado" : "Desativado"}
        </span>
      </button>
    </div>
  );
}

/**
 * Uma opcao da lista de titulos: o texto, de onde veio (ou o selo "IA") e quanto ocupa dos 60 do Mercado
 * Livre. Passar de 60 nao impede escolher: o Nome mostra o aviso e o dono edita.
 */
function LinhaDeTitulo({ titulo, origem, selo, aoEscolher }) {
  const passou = titulo.length > LIMITE_TITULO_ML;
  return (
    <li>
      <button
        type="button"
        onClick={() => aoEscolher(titulo)}
        className="flex w-full items-start justify-between gap-3 rounded border border-borda px-3 py-2 text-left hover:border-acento hover:bg-sky-50"
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium break-words">{titulo}</span>
          {(origem || selo) && (
            <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-suave">
              {selo && (
                <span className="inline-flex items-center gap-1 rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-800">
                  <Sparkles size={10} />
                  {selo}
                </span>
              )}
              {origem && <span className="truncate">{origem}</span>}
            </span>
          )}
        </span>
        <span
          className={`shrink-0 pt-0.5 text-[11px] tabular-nums ${passou ? "font-medium text-amber-700" : "text-suave"}`}
        >
          {titulo.length}/{LIMITE_TITULO_ML}
        </span>
      </button>
    </li>
  );
}

/**
 * O titulo do produto, escolhido numa lista (pedido do dono em 04/10/2026), ao lado da lupa. A lista traz,
 * num lugar so:
 *  - os titulos dos produtos de fornecedores e concorrentes MARCADOS na lupa, para escolher UM;
 *  - e a opcao de GERAR o titulo com IA, que escreve 3 opcoes no padrao da loja (a mesma acao e o mesmo
 *    padrao do botao antigo: ver `gerarTitulos`) e as poe na propria lista.
 * Nada vai para o Nome ate o operador clicar numa linha. Substitui o botao "✦", que so gerava com IA e
 * saiu do sistema.
 *
 * Os titulos das referencias entram em MAIUSCULAS, como o padrao da loja (o que o Bling ja usa), e sem
 * repetir: dois fornecedores com o mesmo nome de produto viram uma linha, com as duas origens.
 */
function ListaDeTitulos({ ia, referencias, aoCriar, aoEscolher, usado }) {
  const [aberta, setAberta] = useState(false);
  // `referencias` = as marcadas na lupa E os fornecedores/concorrentes salvos (pedido do dono em 06/10/2026:
  // os titulos aparecem sempre, sem precisar marcar na lupa).
  const quantas = referencias.length;
  const daProposta = ia.propostaTitulos;
  if (quantas === 0 && !daProposta) return null;

  const emCurso = ia.gerando && ia.emCurso === "titulo";
  const opcoesDaIA = ia.opcoesTitulo;

  const porTitulo = new Map();
  for (const item of referencias) {
    const titulo = String(item.nome ?? "").replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");
    if (!titulo) continue;
    const origem = `${item.fonte} (${item.tipo === "FORNECEDOR" ? "fornecedor" : "concorrente"})`;
    if (porTitulo.has(titulo)) porTitulo.get(titulo).push(origem);
    else porTitulo.set(titulo, [origem]);
  }

  function escolher(titulo) {
    setAberta(false);
    aoEscolher(titulo);
  }

  return (
    <div className="relative mt-6 shrink-0">
      <button
        type="button"
        onClick={() => setAberta((atual) => !atual)}
        title={`Escolher o título: das ${quantas} referência(s) (lupa e vínculos salvos), ou gerado com IA`}
        aria-label="Escolher o título"
        aria-expanded={aberta}
        className={`rounded border p-2.5 hover:bg-fundo ${usado ? BORDA_DE_USO.usado : BORDA_DE_USO.funcao}`}
      >
        {emCurso ? <Loader size={18} className="animate-spin" /> : <ListChecks size={18} />}
      </button>
      <BolhaDeAjuda
        texto={`Escolha o título entre os das ${quantas} referência(s) — marcadas na lupa e fornecedores/concorrentes salvos —, ou gere um com IA. Nada vai para o Nome até você clicar numa opção.`}
      />

      {aberta && (
        <ListaFlutuante largura="w-[36rem]" espaco="mt-2" aoFechar={() => setAberta(false)}>
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <span className="text-sm font-semibold">Escolha um título</span>
            <button
              type="button"
              onClick={() => setAberta(false)}
              aria-label="Fechar a lista de títulos"
              className="rounded p-1 text-suave hover:bg-fundo"
            >
              <X size={14} />
            </button>
          </div>

          {daProposta && (
            <>
              <p className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-suave uppercase">Da proposta</p>
              <ul className="mb-2 space-y-1">
                {daProposta.opcoes.map((titulo, indice) => (
                  <LinhaDeTitulo
                    key={titulo}
                    titulo={titulo}
                    selo="IA"
                    origem={indice === daProposta.recomendada ? "recomendada" : undefined}
                    aoEscolher={escolher}
                  />
                ))}
              </ul>
            </>
          )}

          <p className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-suave uppercase">
            Das referências ({porTitulo.size})
          </p>
          {porTitulo.size === 0 ? (
            <p className="px-2 pb-2 text-sm text-suave">As referências não têm título.</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {[...porTitulo].map(([titulo, origens]) => (
                <LinhaDeTitulo key={titulo} titulo={titulo} origem={origens.join(" · ")} aoEscolher={escolher} />
              ))}
            </ul>
          )}

          {/* Com IA so para quem tem a acao (chamada paga; pedido do dono em 20/10/2026). */}
          {ia.permiteIA !== false && (
          <div className="mt-2 border-t border-borda pt-2">
            <p className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-suave uppercase">Com IA</p>
            {opcoesDaIA ? (
              <>
                <ul className="space-y-1">
                  {opcoesDaIA.map((titulo) => (
                    <LinhaDeTitulo key={titulo} titulo={titulo} selo="IA" aoEscolher={escolher} />
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => aoCriar("titulo")}
                  disabled={ia.gerando}
                  className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 text-xs text-acento hover:underline disabled:opacity-60"
                >
                  {emCurso ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {emCurso ? "Escrevendo..." : "Gerar outras opções"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => aoCriar("titulo")}
                disabled={ia.gerando}
                className="flex w-full items-center gap-2 rounded border border-dashed border-acento px-3 py-2 text-left text-sm font-medium text-acento hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {emCurso ? <Loader size={16} className="animate-spin" /> : <Sparkles size={16} />}
                <span>{emCurso ? "Escrevendo os títulos..." : "Gerar título com IA"}</span>
                <span className="ml-auto text-[11px] font-normal text-suave">
                  3 opções, no padrão da loja
                </span>
              </button>
            )}
            {/* Quanto custou a ultima geracao (pedido do dono em 12/10/2026). */}
            <GastoDaIA gasto={ia.gastoTitulo} className="px-2 pt-1" />
          </div>
          )}
        </ListaFlutuante>
      )}
    </div>
  );
}

/// Campos de peso e dimensoes, na ordem da aba "Peso e dimensoes".
const CAMPOS_DE_MEDIDA = ["pesoKg", "alturaCm", "larguraCm", "comprimentoCm"];
const ROTULO_DE_MEDIDA = {
  pesoKg: "Peso",
  alturaCm: "Altura",
  larguraCm: "Largura",
  comprimentoCm: "Comprimento",
};

/// Campos gravados sempre em MAIUSCULAS, pedido do dono em 16/09/2026. O servidor
/// confere de novo (ProdutoSchema), para nada chegar ao banco em caixa mista.
const CAMPOS_MAIUSCULOS = ["marca", "modelo"];
const maiusculas = (valor) => String(valor ?? "").toLocaleUpperCase("pt-BR");

/// O que o formulario tem digitado agora, campo a campo. `ativo` e a unica caixa
/// de marcacao: o FormData a devolve como "on" ou some, e a tela quer booleano.
function lerFormulario(elemento) {
  const dados = Object.fromEntries(new FormData(elemento).entries());
  dados.ativo = dados.ativo === "on";
  return dados;
}

/**
 * Converte para maiusculas ENQUANTO digita, sem jogar o cursor para o fim: quem
 * corrige uma letra no meio do texto continuaria digitando no lugar errado.
 */
function aoDigitarMaiusculo(evento) {
  const campo = evento.currentTarget;
  const convertido = maiusculas(campo.value);
  if (convertido === campo.value) return;
  const inicio = campo.selectionStart;
  const fim = campo.selectionEnd;
  campo.value = convertido;
  campo.setSelectionRange(inicio, fim);
}

/**
 * Cor do icone de preenchimento conforme o uso (pedido do dono em 16/09/2026):
 * AZUL enquanto nao foi usado, VERDE depois. Vale para funcao (lupa, titulo,
 * codigo, preco) e para referencia (marca, modelo, medidas...) — esta chegou a ser
 * vermelha e o dono pediu azul. Icone de referencia sem dado nem aparece.
 */
const COR_DE_USO = {
  usado: "text-emerald-600",
  funcao: "text-acento",
  referencia: "text-acento",
};
const BORDA_DE_USO = {
  usado: "border-emerald-500 bg-emerald-50 text-emerald-600",
  funcao: "border-acento bg-superficie text-acento",
};

const reais = (valor) =>
  valor === null || valor === undefined
    ? "—"
    : Number(valor).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

/**
 * Campo com um icone DENTRO dele, a direita (desenho do dono). Os campos sao
 * nao controlados: o icone escreve direto no <input> e avisa o formulario, sem
 * remontar nada.
 */
function CampoComIcone({
  nome,
  rotulo,
  erro,
  ajuda,
  entrada,
  icone,
  // Campo extra dentro da caixa, a ESQUERDA do icone (pedido do dono em
  // 22/09/2026, para a margem % ao lado do Preco venda). So quando presente o
  // input ganha mais espaco reservado (pr-24 em vez de pr-11) — os demais usos
  // de CampoComIcone nao passam isto e ficam identicos a antes.
  iconeExtra,
  // O espaco reservado a direita quando ha `iconeExtra` (o do olho sozinho cabe em bem menos que o da margem aberta).
  reservaExtra = "pr-56",
  prefixo,
  // O campo ja mostra a sugestao da proposta na lista dele (CampoDeReferencias, CampoPreco): sem o icone generico.
  listaPropria = false,
  children,
  ...props
}) {
  return (
    <div className="relative">
      <label htmlFor={nome} className="flex items-center gap-1 text-sm font-semibold">
        {rotulo}
        {ajuda && <BolhaDeAjuda texto={ajuda} variante="inline" />}
        {!listaPropria && <IconeDaProposta nome={nome} />}
      </label>
      <div className="relative">
        {prefixo && (
          <span className="pointer-events-none absolute top-1/2 left-2.5 mt-0.5 -translate-y-1/2 text-[15px] font-medium text-suave">
            {prefixo}
          </span>
        )}
        <input
          ref={entrada}
          id={nome}
          name={nome}
          className={`${CLASSE_CAMPO} ${iconeExtra ? reservaExtra : "pr-11"} ${prefixo ? "pl-9" : ""} ${
            erro ? "border-red-400" : "border-borda focus:border-acento"
          }`}
          {...props}
          {...propsDeNumero(props)}
        />
        <div className="absolute top-1/2 right-1.5 mt-0.5 flex -translate-y-1/2 items-center gap-1">
          {iconeExtra}
          {icone}
        </div>
      </div>
      {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}
      <MarcaDaProposta nome={nome} />
      {children}
    </div>
  );
}

/**
 * Lista que abre a partir de um icone, sempre DENTRO da tela (pedido do dono em
 * 16/09/2026). Abrindo sempre para baixo e alinhada a direita, a do Peso — campo
 * no pe da pagina e na primeira coluna — saia pela borda de baixo e ficava atras
 * do menu lateral.
 *
 * A posicao e decidida ANTES da pintura (useLayoutEffect): abre acima do campo
 * quando nao cabe embaixo e ha espaco em cima; alinha a esquerda quando, alinhada
 * a direita, invadiria o menu.
 */
function ListaFlutuante({ largura, espaco = "mt-1", aoFechar, children }) {
  const caixa = useRef(null);

  useLayoutEffect(() => {
    const elemento = caixa.current;
    if (!elemento) return;
    const lista = elemento.getBoundingClientRect();
    const ancora = elemento.parentElement.getBoundingClientRect();
    const margem = 8;

    if (
      lista.bottom > window.innerHeight - margem &&
      ancora.top - lista.height - margem > 0
    ) {
      Object.assign(elemento.style, {
        top: "auto",
        bottom: "100%",
        marginTop: "0",
        marginBottom: "4px",
      });
    }
    const inicioDoConteudo =
      elemento.closest("main")?.getBoundingClientRect().left ?? 0;
    if (lista.left < inicioDoConteudo + margem) {
      Object.assign(elemento.style, { right: "auto", left: "0" });
    }
  }, []);

  return (
    <>
      {/* Fundo invisivel: clicar fora fecha a lista sem escolher nada. */}
      <div className="fixed inset-0 z-30" onClick={aoFechar} />
      <div
        ref={caixa}
        className={`absolute top-full right-0 z-40 ${espaco} ${largura} max-w-[calc(100vw-2rem)] rounded-lg border border-borda bg-superficie p-2 shadow-xl`}
      >
        {children}
      </div>
    </>
  );
}

/** Codigo com gerador automatico na faixa 25xxxx. */
function CampoSku({ inicial, erro, aoAlterar, usos, comVarinha = true }) {
  const entrada = useRef(null);
  const [gerando, iniciar] = useTransition();
  const [falha, setFalha] = useState(null);

  function gerar() {
    setFalha(null);
    iniciar(async () => {
      const resultado = await tentar(() => gerarSku());
      if (!resultado.ok) {
        setFalha(resultado.erro);
        return;
      }
      if (entrada.current) entrada.current.value = resultado.sku;
      aoAlterar();
      usos.marcar("sku");
    });
  }

  return (
    <CampoComIcone
      nome="sku"
      rotulo="Código (SKU) *"
      entrada={entrada}
      defaultValue={inicial}
      erro={erro ?? falha}
      ajuda="Letras, números, ponto, hífen e sublinhado. É o nome da pasta de arquivos."
      icone={
        // A varinha sugere o proximo 25xxxx: so para quem edita (pedido do dono em 20/10/2026; dois cadastros abertos
        // juntos recebiam o mesmo numero).
        !comVarinha ? undefined : (
        <button
          type="button"
          onClick={gerar}
          disabled={gerando}
          title="Gerar o próximo código livre (25xxxx)"
          aria-label="Gerar código automático"
          className={`rounded p-1.5 hover:bg-fundo disabled:opacity-50 ${
            usos.tem("sku") ? COR_DE_USO.usado : COR_DE_USO.funcao
          }`}
        >
          {gerando ? (
            <Loader size={16} className="animate-spin" />
          ) : (
            <WandSparkles size={16} />
          )}
        </button>
        )
      }
    />
  );
}

/**
 * "Gerar EAN interno", na linha abaixo do campo GTIN/EAN (o icone de dentro do campo e da lista de referencias). Mesma cor
 * da varinha do SKU: azul ate usar, verde depois.
 */
function BotaoGerarEan({ aoGerar, usado }) {
  return (
    <button
      type="button"
      onClick={aoGerar}
      title="Gera um EAN-13 interno (prefixo 2) a partir do código do produto"
      className={`mt-1 inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:bg-fundo ${
        usado ? COR_DE_USO.usado : COR_DE_USO.funcao
      }`}
    >
      <WandSparkles size={13} />
      Gerar EAN interno
    </button>
  );
}

const ROTULO_PRECO = {
  FORNECEDOR: {
    texto: "Fornecedor · custo",
    classe: "bg-emerald-100 text-emerald-800",
  },
  CONCORRENTE: { texto: "Concorrente", classe: "bg-amber-100 text-amber-800" },
  OUTRO: { texto: "Outro", classe: "bg-slate-100 text-slate-700" },
};

/**
 * O estoque de uma referencia na lista do "$" (pedido do dono em 25/10/2026): a regra e as palavras da coluna Estoque da
 * aba Concorrentes. "Em estoque" traz a quantidade quando a loja a informa; sem informacao nao se escreve nada.
 */
function EstoqueDaReferencia({ estoque }) {
  const estado = situacaoDeEstoque(estoque);
  if (estado === "sem-estoque") return <span className="block text-[11px] font-medium text-red-700">Sem estoque</span>;
  if (estado !== "em-estoque") return null;
  return (
    <span className="block text-[11px] text-suave">
      Em estoque{estoque.quantidade > 0 && ` · ${estoque.quantidade} un.`}
    </span>
  );
}

/**
 * Preco de venda com a lista de precos das referencias marcadas na lupa do Nome
 * (pedido do dono em 16/09/2026). Escolher um preenche o campo; o operador pode
 * ajustar depois.
 *
 * Fornecedor e concorrente ficam separados e rotulados: o preco do fornecedor e
 * CUSTO, e usa-lo como venda seria vender sem margem.
 */
/**
 * Numero no canto do icone: quantas opcoes (ou produtos marcados) ele oferece.
 * Verde quando o icone ja foi usado, azul quando nao — a mesma cor do icone.
 */
function Contador({ quantidade, usado }) {
  if (!(quantidade > 0)) return null;
  return (
    // Canto INFERIOR direito (pedido do dono em 18/09/2026): o superior e do
    // botao de ajuda (BolhaDeAjuda), quando o icone tem um.
    <span
      className={`absolute -bottom-1 -right-1 rounded-full px-1 text-[9px] leading-4 text-white ${
        usado ? "bg-emerald-600" : "bg-acento"
      }`}
    >
      {quantidade}
    </span>
  );
}

/** "49" -> "49.00"; vazio ou invalido fica como esta (o operador ainda digita). */
function comDuasCasas(valor) {
  const numero = Number(valor);
  return valor === "" || valor === null || valor === undefined || Number.isNaN(numero)
    ? valor
    : numero.toFixed(2);
}

/**
 * Imposto embutido no calculo de margem (pedido do dono em 22/09/2026): 6%
 * sobre o preco de venda, FIXO por enquanto — "futuramente faremos esse valor
 * dinamico" (virar campo por produto/categoria e ficar para depois; o painel
 * de margem avisa que e fixo, para nao passar por definitivo).
 */
const IMPOSTO_PADRAO = 0.06;

/**
 * % de lucro = MARKUP sobre o CUSTO (pedido do dono em 24/10/2026: "se eu comprei por R$50 e
 * digitar 100% de lucro, o preco de venda deve ir para R$100"): (preco - custo) / custo, SEM o
 * imposto. Ate ali era a margem liquida sobre o preco de venda (o mesmo produto mostrava 50%
 * onde o dono esperava ~100%). O lucro em reais continua liquido (com o imposto descontado).
 * Custo vazio ou zero nao tem o que calcular: o fornecedor padrao ainda nao foi escolhido.
 * O Mercado Livre e a proposta seguem com a margem sobre o preco (lib/margem.js e custos do ML).
 */
function calcularMarkup(preco, custo) {
  if (!(custo > 0) || !(preco > 0)) return null;
  return ((preco - custo) / custo) * 100;
}

/** Preco que da o markup pedido: `preco = custo * (1 + markup/100)`; markup negativo nao. */
function calcularPrecoDoMarkup(markup, custo) {
  if (!(custo > 0)) return null;
  const m = Math.max(Number(markup) || 0, 0);
  return custo * (1 + m / 100);
}

/**
 * Preco que da o lucro EM REAIS pedido, isolando `preco` de
 * `margemReais = preco*(1-imposto) - custo`: `preco = (margemReais + custo) / (1 - imposto)`.
 */
function calcularPrecoDaMargemReais(margemReais, custo) {
  if (!(custo > 0)) return null;
  const reais = Math.max(Number(margemReais) || 0, -custo);
  return (custo + reais) / (1 - IMPOSTO_PADRAO);
}

/**
 * Cor do indicador de margem (pedido do dono em 22/09/2026): vermelho quando o
 * preco de venda fica ABAIXO do custo do fornecedor (prejuizo, nao margem
 * baixa); amarelo com lucro abaixo de 60%; verde a partir de 60%. Desde 24/10/2026 o
 * percentual e o markup sobre o custo (ver calcularMarkup).
 */
function corDaMargem(preco, custo) {
  if (!(custo > 0) || !(preco > 0)) return "text-suave";
  if (preco < custo) return "text-red-600";
  const margem = calcularMarkup(preco, custo);
  if (margem === null) return "text-suave";
  // "amber" (#b45309) e vermelho (#b91c1c) sao os dois tons queimados demais
  // para diferenciar num texto pequeno — o dono viu 52% e leu como vermelho
  // (pedido de correcao em 22/09/2026). "yellow-600" e amarelo de verdade.
  return margem >= 60 ? "text-emerald-600" : "text-yellow-600";
}

function CampoPreco({
  inicial,
  erro,
  referencias,
  custo,
  precoAtual,
  posicao,
  aoAlterar,
  aoMudarValor,
  usos,
  // `"sempre"` (quem edita: margem e calculadora), `"olho"` (so leitura: a margem aparece ao clicar no olho, e some ao
  // recarregar) ou `"nenhuma"` (sem a permissao Margem). Pedido do dono em 20/10/2026.
  margemModo = "sempre",
  // O "$" (precos das referencias) so existe para quem usa as ferramentas de referencia.
  comReferencias = true,
}) {
  const entrada = useRef(null);
  const [aberto, setAberto] = useState(false);
  const [abertoMargem, setAbertoMargem] = useState(false);
  const [margemVisivel, setMargemVisivel] = useState(false);

  // Campos do PAINEL de margem (ListaFlutuante propria, ver abaixo): tres
  // valores que descrevem o mesmo numero de tres jeitos — preco, % de lucro e
  // lucro em reais — e se mantem sincronizados entre si e com o campo
  // principal. Fornecedor (custo) e so leitura ali: quem muda o custo e o
  // fornecedor padrao na aba Fornecedores, nao aqui.
  const precoNoPainel = useRef(null);
  const lucroPercentual = useRef(null);
  const lucroReais = useRef(null);

  // O item da proposta no topo da lista do "$" (pedido do dono em 22/10/2026): o preco ORIGINAL (o de antes, quando a
  // proposta escreveu o dela no campo; 24/10/2026) ou o da PROPOSTA (o dono ja tinha editado o preco).
  const sugestao = useContext(PropostaNosCampos)?.listas?.precoVenda ?? null;
  // A ordem da aba Concorrentes (pedido do dono em 25/10/2026): do mais barato ao mais caro, e quem esta sem estoque por ultimo.
  const comPreco = ordenarPrecosDasReferencias(
    referencias.filter((item) => item.preco !== null && item.preco !== undefined),
  );

  /**
   * Le o preco de UM lugar e escreve nos outros (campo principal + os dois do
   * painel) — NUNCA no campo `origem`, que e o que o operador esta digitando
   * agora. Escrever nele tambem reescrevia o proprio campo a cada tecla (
   * bug visto pelo dono em 22/09/2026: digitar "60" em "% de lucro" calculava
   * o preco a partir do "6" que ja tinha sido digitado, recalculava a margem
   * de volta para "6.0" e GRAVAVA isso por cima do campo — o "0" seguinte
   * "entrava" depois desse reset e o resultado ficava preso em 6%, nunca 60%.
   */
  function propagarPreco(novoPreco, origem = null) {
    const formatado = Number(novoPreco).toFixed(2);
    if (origem !== "preco" && entrada.current) entrada.current.value = formatado;
    if (origem !== "precoPainel" && precoNoPainel.current) {
      precoNoPainel.current.value = formatado;
    }

    const preco = Number(formatado);
    const margem = calcularMarkup(preco, custo);
    if (origem !== "lucroPercentual" && lucroPercentual.current) {
      lucroPercentual.current.value = margem === null ? "" : margem.toFixed(1);
    }
    if (origem !== "lucroReais" && lucroReais.current) {
      lucroReais.current.value = custo > 0 ? (preco * (1 - IMPOSTO_PADRAO) - custo).toFixed(2) : "";
    }

    aoAlterar();
    aoMudarValor?.(formatado);
    usos.marcar("precoVenda");
  }

  function escolher(preco) {
    propagarPreco(preco);
    setAberto(false);
  }

  /**
   * Sempre duas casas apos a virgula (pedido do dono em 18/09/2026) — so ao
   * SAIR do campo, e nao a cada tecla: reformatar durante a digitacao
   * atropelaria "49.5" virando "49.50" antes do operador terminar.
   */
  function aoSair() {
    if (!entrada.current) return;
    propagarPreco(entrada.current.value || 0, "preco");
  }

  /** Digitar o preco no campo principal so espelha nos outros — sem reformatar a cada tecla. */
  function aoMudarPrecoPrincipal(evento) {
    aoMudarValor?.(evento.target.value);
    const preco = Number(evento.target.value);
    const margem = calcularMarkup(preco, custo);
    if (precoNoPainel.current) precoNoPainel.current.value = evento.target.value;
    if (lucroPercentual.current) {
      lucroPercentual.current.value = margem === null ? "" : margem.toFixed(1);
    }
    if (lucroReais.current) {
      lucroReais.current.value =
        custo > 0 && preco > 0 ? (preco * (1 - IMPOSTO_PADRAO) - custo).toFixed(2) : "";
    }
  }

  function aoMudarPrecoNoPainel(evento) {
    propagarPreco(evento.target.value || 0, "precoPainel");
  }

  /** So reformata (2 casas) ao SAIR do campo — mesma regra do preco principal. */
  function aoSairPrecoNoPainel() {
    if (precoNoPainel.current) propagarPreco(precoNoPainel.current.value || 0);
  }

  function aoMudarLucroPercentual(evento) {
    const novoPreco = calcularPrecoDoMarkup(evento.target.value, custo);
    if (novoPreco !== null) propagarPreco(novoPreco, "lucroPercentual");
  }

  function aoSairLucroPercentual() {
    if (!lucroPercentual.current) return;
    const novoPreco = calcularPrecoDoMarkup(lucroPercentual.current.value, custo);
    if (novoPreco !== null) propagarPreco(novoPreco);
  }

  function aoMudarLucroReais(evento) {
    const novoPreco = calcularPrecoDaMargemReais(evento.target.value, custo);
    if (novoPreco !== null) propagarPreco(novoPreco, "lucroReais");
  }

  function aoSairLucroReais() {
    if (!lucroReais.current) return;
    const novoPreco = calcularPrecoDaMargemReais(lucroReais.current.value, custo);
    if (novoPreco !== null) propagarPreco(novoPreco);
  }

  const margemAtual = calcularMarkup(precoAtual, custo);
  const lucroAtual =
    custo > 0 && precoAtual !== null ? precoAtual * (1 - IMPOSTO_PADRAO) - custo : null;
  const impostoAtual = precoAtual !== null ? precoAtual * IMPOSTO_PADRAO : null;
  const temCusto = custo > 0;
  const corIndicador = corDaMargem(precoAtual, custo);

  return (
    <CampoComIcone
      nome="precoVenda"
      rotulo={
        <>
          Preço venda <SeloPosicaoDePreco posicao={posicao} />
        </>
      }
      type="number"
      step="0.01"
      min="0"
      entrada={entrada}
      defaultValue={comDuasCasas(inicial)}
      prefixo="R$"
      // So para a comparacao com concorrentes em Concorrentes.jsx: o campo
      // continua nao controlado (o React nao decide o que aparece nele), isto
      // so espelha o valor digitado numa variavel de estado, a parte.
      onChange={aoMudarPrecoPrincipal}
      onBlur={aoSair}
      erro={erro}
      reservaExtra={margemModo === "olho" && !margemVisivel ? "pr-20" : "pr-56"}
      iconeExtra={
        margemModo === "nenhuma" ? undefined : (
          <>
            {/* O OLHO (so leitura, pedido do dono em 20/10/2026): a margem fica escondida e aparece ao clicar. Quem edita
                a ve sempre. A margem sai do custo, que esta na aba Fornecedores: o olho e conveniencia de tela, nao barreira. */}
            {margemModo === "olho" && (
              // `span`, e nao `button`: o olho so existe em modo leitura, onde o `fieldset` do formulario esta
              // desabilitado, e um botao ali dentro nao responderia ao clique.
              <span
                role="button"
                tabIndex={0}
                onClick={() => setMargemVisivel((atual) => !atual)}
                onKeyDown={(evento) => {
                  if (evento.key !== "Enter" && evento.key !== " ") return;
                  evento.preventDefault();
                  setMargemVisivel((atual) => !atual);
                }}
                title={margemVisivel ? "Ocultar a margem" : "Mostrar a margem"}
                aria-label={margemVisivel ? "Ocultar a margem" : "Mostrar a margem"}
                aria-pressed={margemVisivel}
                className={`shrink-0 cursor-pointer rounded p-1.5 hover:bg-fundo ${COR_DE_USO.funcao}`}
              >
                {margemVisivel ? <EyeOff size={16} /> : <Eye size={16} />}
              </span>
            )}
            {/* Indicador (percentual de lucro / lucro em reais), pedido do dono em 22/09/2026: vermelho abaixo do
                custo, amarelo com lucro menor que 60%, verde a partir de 60%. So mostra o dado; quem edita e o painel. */}
            {temCusto && margemAtual !== null && margemModo === "sempre" && (
              <button
                type="button"
                onClick={() => setAbertoMargem((atual) => !atual)}
                title={`% de lucro sobre o custo / lucro em reais, já com ${(IMPOSTO_PADRAO * 100).toFixed(0)}% de imposto descontado — clique para editar`}
                className={`shrink-0 text-sm font-semibold tabular-nums whitespace-nowrap hover:underline ${corIndicador}`}
              >
                ({margemAtual.toFixed(1)}% / {reais(lucroAtual)})
              </button>
            )}
            {temCusto && margemAtual !== null && margemModo === "olho" && margemVisivel && (
              <span className={`shrink-0 text-sm font-semibold tabular-nums whitespace-nowrap ${corIndicador}`}>
                ({margemAtual.toFixed(1)}% / {reais(lucroAtual)})
              </span>
            )}
            {margemModo === "sempre" && (
              <button
                type="button"
                onClick={() => setAbertoMargem((atual) => !atual)}
                disabled={!temCusto}
                title={
                  temCusto
                    ? "Calcular a partir do custo do fornecedor padrão"
                    : "Marque um fornecedor padrão com preço de custo para calcular a margem"
                }
                aria-label="Calcular margem a partir do custo do fornecedor"
                className={`relative shrink-0 rounded p-1.5 hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-40 ${COR_DE_USO.funcao}`}
              >
                <Calculator size={16} />
              </button>
            )}
          </>
        )
      }
      listaPropria
      icone={
        !comReferencias && !sugestao ? undefined : (
        <button
          type="button"
          onClick={() => setAberto((atual) => !atual)}
          title={
            comPreco.length > 0 || sugestao
              ? "Ver os preços das referências: marcadas na lupa do Nome e fornecedores/concorrentes salvos"
              : "As referências não trazem preço"
          }
          aria-label="Preços das referências"
          className={`relative rounded p-1.5 hover:bg-fundo ${
            usos.tem("precoVenda") ? COR_DE_USO.usado : COR_DE_USO.funcao
          }`}
        >
          <BadgeDollarSign size={16} />
          <Contador
            quantidade={comPreco.length + (sugestao ? 1 : 0)}
            usado={usos.tem("precoVenda")}
          />
        </button>
        )
      }
    >
      {aberto && (comReferencias || sugestao) && (
        <ListaFlutuante largura="w-[30rem]" aoFechar={() => setAberto(false)}>
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <span className="text-sm font-semibold">Escolha um preço</span>
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar preços"
              className="rounded p-1 text-suave hover:bg-fundo"
            >
              <X size={14} />
            </button>
          </div>

          {sugestao && (
            <button
              type="button"
              onClick={() => escolher(sugestao.valor)}
              className={`mb-1 flex w-full items-center gap-3 rounded border px-3 py-2 text-left hover:border-acento hover:bg-sky-50 ${
                sugestao.tipo === "original" ? "border-slate-300 bg-slate-50" : "border-amber-300 bg-amber-50/60"
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-xs">
                  <SeloDaProposta tipo={sugestao.tipo} />
                  <span className="text-suave">{sugestao.origem}</span>
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-emerald-700 tabular-nums">{reais(sugestao.valor)}</span>
            </button>
          )}
          {comPreco.length === 0 && sugestao ? null : comPreco.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-suave">
              {referencias.length === 0
                ? "Marque produtos de referência na lupa ao lado do Nome, ou vincule fornecedores e concorrentes."
                : "As referências não têm preço coletado."}
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {comPreco.map((item) => {
                const rotulo = ROTULO_PRECO[item.tipo] ?? ROTULO_PRECO.OUTRO;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => escolher(item.preco)}
                      className="flex w-full items-center gap-3 rounded border border-borda px-3 py-2 text-left hover:border-acento hover:bg-sky-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-xs">
                          <span
                            className={`rounded px-1.5 py-0.5 font-medium ${rotulo.classe}`}
                          >
                            {rotulo.texto}
                          </span>
                          <span className="text-suave">{item.fonte}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-sm">
                          {item.nome}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold text-emerald-700 tabular-nums">{reais(item.preco)}</span>
                        <EstoqueDaReferencia estoque={item.estoque} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ListaFlutuante>
      )}

      {/* Painel de margem (pedido do dono em 22/09/2026): Fornecedor (o custo
          de compra, so leitura — quem muda e a aba Fornecedores), Preco de
          venda, % de Lucro e Lucro em R$, os tres ultimos editaveis e presos
          entre si pelo mesmo par de contas de calcularMarkup/
          calcularPrecoDoMarkup. Sem custo do fornecedor padrao nao ha o que
          calcular, e o botao que abre fica desabilitado. */}
      {abertoMargem && temCusto && margemModo === "sempre" && (
        <ListaFlutuante largura="w-72" aoFechar={() => setAbertoMargem(false)}>
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <span className="text-sm font-semibold">Margem</span>
            <button
              type="button"
              onClick={() => setAbertoMargem(false)}
              aria-label="Fechar margem"
              className="rounded p-1 text-suave hover:bg-fundo"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-2.5 px-2 pb-2">
            <div>
              <span className="block text-xs text-suave">Fornecedor (custo de compra)</span>
              <p className="text-sm font-medium tabular-nums">{reais(custo)}</p>
            </div>

            <div>
              <span className="block text-xs text-suave">
                Imposto ({(IMPOSTO_PADRAO * 100).toFixed(0)}% do preço)
              </span>
              <p className="text-sm font-medium tabular-nums">
                {impostoAtual !== null ? reais(impostoAtual) : "—"}
              </p>
            </div>

            <label className="block">
              <span className="block text-xs text-suave">Preço de venda</span>
              <div className="relative mt-0.5">
                <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-suave">
                  R$
                </span>
                <input
                  ref={precoNoPainel}
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={comDuasCasas(precoAtual ?? inicial)}
                  onChange={aoMudarPrecoNoPainel}
                  onBlur={aoSairPrecoNoPainel}
                  className="w-full rounded border border-borda py-1.5 pr-2 pl-7 text-sm tabular-nums focus:border-acento focus:outline-none"
                />
              </div>
            </label>

            <label className="block">
              <span className="block text-xs text-suave">% de lucro (sobre o custo)</span>
              <div className="relative mt-0.5">
                <input
                  ref={lucroPercentual}
                  type="number"
                  step="0.1"
                  min="0"
                  defaultValue={margemAtual !== null ? margemAtual.toFixed(1) : ""}
                  onChange={aoMudarLucroPercentual}
                  onBlur={aoSairLucroPercentual}
                  className="w-full rounded border border-borda py-1.5 pr-6 pl-2 text-sm tabular-nums focus:border-acento focus:outline-none"
                />
                <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-suave">
                  %
                </span>
              </div>
            </label>

            <label className="block">
              <span className="block text-xs text-suave">Margem financeira (líquida)</span>
              <div className="relative mt-0.5">
                <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-suave">
                  R$
                </span>
                <input
                  ref={lucroReais}
                  type="number"
                  step="0.01"
                  defaultValue={lucroAtual !== null ? lucroAtual.toFixed(2) : ""}
                  onChange={aoMudarLucroReais}
                  onBlur={aoSairLucroReais}
                  className="w-full rounded border border-borda py-1.5 pr-2 pl-7 text-sm tabular-nums focus:border-acento focus:outline-none"
                />
              </div>
            </label>

            {/* Nota pedida pelo dono em 22/09/2026: o imposto entra fixo por
                enquanto, e a tela avisa disso em vez de parecer definitivo. */}
            <p className="border-t border-borda pt-2 text-[11px] text-suave">
              % de lucro: quanto o preço passa do custo (R$ 50 com 100% = R$ 100). Imposto de{" "}
              {(IMPOSTO_PADRAO * 100).toFixed(0)}% descontado só da margem em reais. Fixo por enquanto.
            </p>
          </div>
        </ListaFlutuante>
      )}
    </CampoComIcone>
  );
}

/**
 * Campo que oferece os valores publicados pelas referencias marcadas na lupa do
 * Nome — marca, modelo, numero de homologacao. Mesmo desenho do preco.
 *
 * Os valores sao lidos do banco ao ABRIR a lista, e nao na busca: descricao e
 * ficha tecnica sao pesadas, e so interessam para o campo que o operador abriu.
 */
function CampoDeReferencias({
  nome,
  rotulo,
  ajuda,
  inicial,
  ids,
  valores,
  carregando,
  aoAlterar,
  vazio,
  unidade = "",
  usos,
  ...props
}) {
  const entrada = useRef(null);
  const [aberto, setAberto] = useState(false);

  function abrir() {
    setAberto((atual) => !atual);
  }

  const emMaiusculas = CAMPOS_MAIUSCULOS.includes(nome);

  function escolher(valor) {
    if (entrada.current)
      entrada.current.value = emMaiusculas ? maiusculas(valor) : valor;
    aoAlterar();
    usos.marcar(nome);
    setAberto(false);
  }

  // O item da proposta vai NO TOPO da lista (pedido do dono em 22/10/2026) e aparece mesmo sem referencia marcada: o
  // ORIGINAL (o valor de antes, quando a proposta escreveu no campo; 24/10/2026) ou o da PROPOSTA (campo que o dono editou).
  const sugestao = useContext(PropostaNosCampos)?.listas?.[nome] ?? null;
  const daReferencia = Array.isArray(valores) ? valores : [];
  const lista = sugestao
    ? [{ valor: sugestao.valor, origem: sugestao.origem, fontes: [], daProposta: sugestao.tipo ?? "proposta" }, ...daReferencia.filter((item) => String(item.valor) !== String(sugestao.valor))]
    : daReferencia;
  // Icone CINZA quando as referencias marcadas nao trazem este dado — pedido do
  // dono em 16/09/2026: assim se ve sem clicar que nao ha o que escolher.
  const temDado = lista.length > 0;

  return (
    <CampoComIcone
      nome={nome}
      rotulo={rotulo}
      ajuda={ajuda}
      entrada={entrada}
      listaPropria
      {...props}
      defaultValue={emMaiusculas && inicial ? maiusculas(inicial) : inicial}
      onInput={emMaiusculas ? aoDigitarMaiusculo : undefined}
      icone={
        // Sem dado nas referencias marcadas, o icone NAO aparece (pedido do dono).
        carregando && !sugestao ? (
          <Loader size={16} className="mr-1.5 animate-spin text-suave" />
        ) : temDado ? (
          <button
            type="button"
            onClick={abrir}
            title={`Ver ${rotulo.toLowerCase()} das referências: marcadas na lupa do Nome e fornecedores/concorrentes salvos`}
            aria-label={`${rotulo} das referências`}
            className={`relative rounded p-1.5 hover:bg-fundo ${
              usos.tem(nome) ? COR_DE_USO.usado : COR_DE_USO.referencia
            }`}
          >
            <ListChecks size={16} />
            <Contador quantidade={lista.length} usado={usos.tem(nome)} />
          </button>
        ) : null
      }
    >
      {aberto && (
        <ListaFlutuante largura="w-[26rem]" aoFechar={() => setAberto(false)}>
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <span className="text-sm font-semibold">
              Escolha: {rotulo.toLowerCase()}
            </span>
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar"
              className="rounded p-1 text-suave hover:bg-fundo"
            >
              <X size={14} />
            </button>
          </div>

          {ids.length === 0 && !sugestao ? (
            <p className="px-2 pb-2 text-sm text-suave">
              Marque produtos de referência na lupa ao lado do Nome, ou vincule fornecedores e concorrentes na
              aba Fornecedores / Concorrentes.
            </p>
          ) : (carregando || !valores) && !sugestao ? (
            <p className="flex items-center gap-2 px-2 pb-2 text-sm text-suave">
              <Loader size={14} className="animate-spin" /> Lendo as
              referências...
            </p>
          ) : valores?.erro && !sugestao ? (
            <p className="px-2 pb-2 text-sm text-red-700">{valores.erro}</p>
          ) : lista.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-suave">{vazio}</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {lista.map((item) => (
                <li key={item.valor}>
                  <button
                    type="button"
                    onClick={() => escolher(item.valor)}
                    className="flex w-full items-center justify-between gap-3 rounded border border-borda px-3 py-2 text-left hover:border-acento hover:bg-sky-50"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        {/* Numero em formato brasileiro na lista; no campo vai com ponto. */}
                        {unidade
                          ? `${Number(item.valor).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${unidade}`
                          : item.valor}
                      </span>
                      {item.origem && (
                        <span
                          className="block truncate text-[11px] text-suave"
                          title={item.origem}
                        >
                          {item.origem}
                        </span>
                      )}
                    </span>
                    {item.daProposta ? (
                      <SeloDaProposta tipo={item.daProposta} />
                    ) : (
                      <span className="shrink-0 text-right text-[11px] text-suave">
                        {item.fontes.join(", ")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ListaFlutuante>
      )}
    </CampoComIcone>
  );
}

function ErroIA({ ia, qual }) {
  if (ia.erro?.qual !== qual) return null;
  return <p className="mt-1 text-[11px] text-red-700">{ia.erro.texto}</p>;
}

function CampoNome({
  inicial,
  erro,
  aoBuscar,
  ia,
  aoCriarIA,
  aoEscolherTitulo,
  aoAlterarNome,
  referencias,
  usos,
  comLupa = true,
  comTitulos = true,
}) {
  const [tamanho, setTamanho] = useState((inicial ?? "").length);
  const excedeu = tamanho > LIMITE_TITULO_ML;
  const entrada = useRef(null);
  // O Nome de antes de cada digitacao: a descricao so acompanha a linha que ainda e ele. Fica o ULTIMO Nome nao vazio, para
  // quem apaga tudo e digita outro continuar acompanhado. O campo remonta (key) quando o formulario troca o Nome por fora.
  const nomeDeAntes = useRef(inicial ?? "");

  return (
    <div>
      <div className="flex items-start gap-2">
        {/* Metade da coluna de campos: alinha o fim do Nome com o fim do SKU */}
        <div className="min-w-0 flex-1 lg:max-w-[calc(18rem+1.25rem+((100%-18rem-1.25rem)/2))]">
          <div className="flex items-baseline justify-between">
            <label htmlFor="tituloBase" className="block text-sm font-semibold">
              Nome *
            </label>
            <span
              className={`text-[11px] tabular-nums ${
                excedeu ? "font-medium text-amber-700" : "text-suave"
              }`}
            >
              {tamanho}
              {excedeu && ` · acima dos ${LIMITE_TITULO_ML} do Mercado Livre`}
            </span>
          </div>
          <input
            ref={entrada}
            id="tituloBase"
            name="tituloBase"
            defaultValue={inicial ?? ""}
            onChange={(evento) => {
              const nome = evento.target.value;
              setTamanho(nome.length);
              aoAlterarNome?.(nome, nomeDeAntes.current);
              if (nome.trim()) nomeDeAntes.current = nome;
            }}
            className={`${CLASSE_CAMPO} ${
              excedeu ? "border-amber-400" : "border-borda focus:border-acento"
            }`}
          />
          {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}
        </div>
        {/* Busca produtos de fornecedores e concorrentes com as palavras do Nome. So para quem edita e ve custo e
            concorrentes (pedido do dono em 20/10/2026). */}
        {comLupa && (
        <button
          type="button"
          onClick={() => aoBuscar(entrada.current?.value ?? "")}
          title="Buscar referências de mercado com as palavras do Nome"
          aria-label="Buscar referências de mercado"
          // Usada = ha referencias marcadas.
          className={`relative mt-6 shrink-0 rounded border p-2.5 hover:bg-fundo ${
            ia.quantos > 0 ? BORDA_DE_USO.usado : BORDA_DE_USO.funcao
          }`}
        >
          <Search size={18} />
          {/* Quantos produtos estao marcados como referencia. */}
          <Contador quantidade={ia.quantos} usado />
          <BolhaDeAjuda texto="Marca produtos parecidos de fornecedores e concorrentes como referência: preenche preço, marca, modelo e medidas, e cria título e descrição com IA." />
        </button>
        )}
        {/* Aparece depois que produtos foram marcados na janela da lupa. */}
        {comTitulos && (
          <ListaDeTitulos
            usado={usos.tem("titulo")}
            ia={ia}
            referencias={referencias}
            aoCriar={aoCriarIA}
            aoEscolher={aoEscolherTitulo}
          />
        )}
      </div>
      <ErroIA ia={ia} qual="titulo" />
    </div>
  );
}

/// Busca do Cosmos: aceita GTIN, NCM (8 digitos) e nome. O endereco nao foi conferido (o site tem verificacao
/// da Cloudflare); se nao cair na busca, e aqui que se troca.
const BUSCA_DO_COSMOS = (termo) => `https://cosmos.bluesoft.com.br/pesquisar?q=${termo}`;
const SITES_DO_EAN = [
  { nome: "Cosmos", endereco: BUSCA_DO_COSMOS },
  { nome: "EAN-Search", endereco: (termo) => `https://www.ean-search.org/?q=${termo}` },
  // O endereco e o que o dono usou no navegador.
  { nome: "Product-Search", endereco: (termo) => `https://pt.product-search.net/?q=${termo}` },
];
const SITES_DO_NCM = [{ nome: "Cosmos", endereco: BUSCA_DO_COSMOS }];

/**
 * "Consultar em: ..." abaixo de um campo de codigo (pedido do dono em 06/10/2026, no GTIN/EAN e no NCM): abre o
 * site numa aba nova com os digitos do campo como estao AGORA, ou com o Nome do produto se o campo estiver
 * vazio. O endereco e montado no clique porque os campos nao sao controlados.
 */
function LinksDeConsulta({ campo, sites, lerCampo }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-suave">
      Consultar em:
      {sites.map((site) => (
        <a
          key={site.nome}
          href={site.endereco("")}
          target="_blank"
          rel="noreferrer"
          onClick={(evento) => {
            const codigo = lerCampo(campo).replace(/\D/g, "");
            const termo = codigo || lerCampo("tituloBase").trim();
            evento.currentTarget.href = site.endereco(encodeURIComponent(termo));
          }}
          title={`Abre o ${site.nome} numa aba nova com o código do campo (ou o Nome, se o campo estiver vazio)`}
          className="inline-flex items-center gap-0.5 text-acento hover:underline"
        >
          {site.nome} <ExternalLink size={11} />
        </a>
      ))}
    </p>
  );
}

/** Link da Loja Integrada, com botao que abre a pagina quando preenchido. */
function LinkLojaIntegrada({ inicial, dominio, erro }) {
  const [valor, setValor] = useState(inicial ?? "");

  const valido = /^https?:\/\//i.test(valor);
  const outroDominio =
    valido && dominio && !valor.toLowerCase().includes(dominio.toLowerCase());

  return (
    <div>
      <label htmlFor="urlLojaIntegrada" className="block text-sm font-semibold">
        Link na Loja Integrada
      </label>
      <div className="mt-1 flex items-center gap-1.5">
        <input
          id="urlLojaIntegrada"
          name="urlLojaIntegrada"
          value={valor}
          onChange={(evento) => setValor(evento.target.value)}
          placeholder="https://..."
          className={`w-full rounded border px-2.5 py-2 text-[15px] font-medium focus:outline-none ${
            erro ? "border-red-400" : "border-borda focus:border-acento"
          }`}
        />
        {valido && (
          <a
            href={valor}
            target="_blank"
            rel="noreferrer"
            title="Abrir na loja"
            className="shrink-0 rounded border border-borda p-2 text-acento hover:bg-fundo"
          >
            <ExternalLink size={16} />
          </a>
        )}
      </div>
      {outroDominio && (
        <p className="mt-1 text-[11px] text-amber-700">
          Este link não aponta para {dominio}. Confira se é o endereço certo.
        </p>
      )}
      {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}
    </div>
  );
}

// Formatos do seletor de arquivo: Documentos tecnicos aceitam tambem .zip; o certificado nao.
const ACEITA_CERTIFICADO = "application/pdf,image/jpeg,image/png";
const ACEITA_DOCUMENTO = `${ACEITA_CERTIFICADO},.zip,application/zip`;


/** Documentos encontrados nas referencias escolhidas na lupa do Nome. */
function DocumentosDasReferencias({ ids, ativo, produtoId }) {
  const [respostaDocumentos, setRespostaDocumentos] = useState({ chave: "", itens: [], erro: null });
  const chave = `${produtoId ?? ""}|${ids.join("|")}`;
  const temReferencias = Boolean(produtoId || ids.length);
  const carregando = temReferencias && respostaDocumentos.chave !== chave;
  const itens = carregando ? [] : respostaDocumentos.itens;
  const erroBusca = carregando ? null : respostaDocumentos.erro;

  useEffect(() => {
    if (!ativo) return;
    if (!temReferencias) return;
    let cancelado = false;
    const [idProduto, ...idsBusca] = chave.split("|");
    documentosDasReferencias(idsBusca.filter(Boolean), idProduto || null)
      .then((resultado) => {
        if (cancelado) return;
        setRespostaDocumentos({
          chave,
          itens: resultado.ok ? resultado.itens : [],
          erro: resultado.ok ? null : resultado.erro,
        });
      })
      .catch(() => {
        if (!cancelado) setRespostaDocumentos({ chave, itens: [], erro: "Falha ao buscar documentos. Abra a aba novamente para tentar de novo." });
      });
    return () => { cancelado = true; };
  }, [chave, ativo, temReferencias]);

  return (
    <div className="mt-5 border-t border-borda pt-4 sm:col-span-2">
      <h3 className="text-sm font-semibold">Documentos dos fornecedores e concorrentes</h3>
      <p className="mt-1 text-xs text-suave">
        Arquivos dos fornecedores e concorrentes atuais. Baixe o arquivo ou acesse a página do produto na loja.
      </p>
      {!temReferencias && <p className="mt-3 text-sm text-suave">Marque referências na lupa do Nome para buscar documentos.</p>}
      {temReferencias && carregando && <p className="mt-3 text-sm text-suave">Buscando documentos...</p>}
      {temReferencias && !carregando && itens.length === 0 && !erroBusca && (
        <p className="mt-3 text-sm text-suave">Nenhum documento técnico foi coletado dessas referências.</p>
      )}
      {erroBusca && <p className="mt-3 rounded bg-red-50 p-2 text-xs text-red-800">{erroBusca}</p>}
      {itens.length > 0 && (
        <ul className="mt-3 space-y-2">
          {itens.map((item) => (
              <li key={`${item.referenciaId}:${item.indice}`} className="flex flex-wrap items-center gap-2 rounded border border-borda px-3 py-2">
                <FileText size={16} className="shrink-0 text-suave" />
                <div className="min-w-48 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span>{item.titulo}</span>
                    <span className="rounded bg-fundo px-1.5 py-0.5 text-[10px] font-semibold text-suave">{item.formato}</span>
                  </div>
                  <div className="truncate text-xs text-suave" title={item.produto}>
                    {item.site ? (
                      <a href={item.site} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-acento hover:underline">
                        {item.fonte} <ExternalLink size={10} />
                      </a>
                    ) : item.fonte} · {item.produto}
                  </div>
                </div>
                <a
                  href={`/api/produtos/documento-referencia?referenciaId=${encodeURIComponent(item.referenciaId)}&indice=${item.indice}`}
                  className="inline-flex items-center gap-1 rounded border border-borda px-2 py-1 text-xs hover:bg-fundo"
                >
                  <Download size={12} /> Baixar
                </a>
              </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Documentos tecnicos e certificado do produto, NOVO ou JA EXISTENTE (pedido do dono em 10/10/2026: toda mudanca
 * no produto so vale no Salvar, documentos inclusive). Os ja gravados (`salvos`) baixam pelo nome real; Excluir so
 * os RISCA (`excluidos`, aplicado no Salvar) e "Desfazer" volta. Os enviados ou anexados agora vao para a pasta
 * temporaria (`lista`, os `temporarios` do formulario) e entram no produto no Salvar. Cancelar descarta tudo.
 *
 * Sem link para abrir o temporario: ele ainda nao tem endereco, e servir a pasta temporaria abriria uma rota para
 * arquivo de cadastro que nem existe.
 */
function DocumentosDoProduto({
  tipo,
  rotulo,
  ajuda,
  lista,
  aoEnviar,
  aoRemover,
  salvos = [],
  excluidos = [],
  aoAlternarExclusao,
  desabilitado = false,
  ordem = [],
  aoReordenar,
}) {
  const [pendente, iniciarTransicao] = useTransition();
  const [erro, setErro] = useState(null);
  const entrada = useRef(null);
  // Arrastar (pedido do dono em 24/10/2026: setas e "clicando e arrastando", no padrao de mover as caracteristicas).
  const [arrastado, setArrastado] = useState(null);
  // O documento que acabou de mudar de lugar fica verde por alguns segundos (pedido do dono em 24/10/2026: "para eu ver
  // para onde mudou"). Um relogio so: mover de novo reinicia a contagem.
  const [destacado, setDestacado] = useState(null);
  const relogioDoDestaque = useRef(null);
  useEffect(() => () => clearTimeout(relogioDoDestaque.current), []);
  const [destino, setDestino] = useState(null);

  // Gravados e enviados numa lista so, na ordem que o dono deu (`ordem`: "id:<id>" do gravado, "tmp:<nome>" do enviado).
  // O que ainda nao esta na ordem (acabou de chegar) vai para o fim, na ordem de antes. So vale no Salvar.
  const naturais = [
    ...salvos.map((arquivo) => ({ chave: `id:${arquivo.id}`, salvo: arquivo })),
    ...lista.map((arquivo) => ({ chave: `tmp:${arquivo.nome}`, temporario: arquivo })),
  ];
  const posicao = new Map(ordem.map((chave, indice) => [chave, indice]));
  const itens = naturais
    .map((item, indice) => ({ ...item, peso: posicao.get(item.chave) ?? ordem.length + indice }))
    .sort((a, b) => a.peso - b.peso);

  function mover(de, para) {
    if (para < 0 || para >= itens.length || de === para) return;
    const chaves = itens.map((item) => item.chave);
    const [movida] = chaves.splice(de, 1);
    chaves.splice(para, 0, movida);
    aoReordenar?.(chaves);
    setDestacado(movida);
    clearTimeout(relogioDoDestaque.current);
    relogioDoDestaque.current = setTimeout(() => setDestacado(null), 2500);
  }

  function aoEscolher(evento) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    // Conferido AQUI antes de enviar (29/10/2026): acima de 24 MB o Next recusa o envio antes do codigo do Rise, e a tela
    // recebia so "Minified React error #441". O servidor confere de novo (`validarEGravar`).
    if (arquivo.size > MAXIMO_DOCUMENTO_BYTES) {
      const mb = (bytes) => (bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
      setErro(`O arquivo tem ${mb(arquivo.size)} MB; o limite é ${mb(MAXIMO_DOCUMENTO_BYTES)} MB. Comprima o PDF ou divida em partes.`);
      if (entrada.current) entrada.current.value = "";
      return;
    }
    iniciarTransicao(async () => {
      const resultado = await aoEnviar(tipo, arquivo);
      setErro(resultado.ok ? null : resultado.erro);
      if (entrada.current) entrada.current.value = "";
    });
  }

  const riscados = salvos.filter((arquivo) => excluidos.includes(arquivo.id)).length;

  return (
    <div>
      <span className="flex items-center gap-1 text-sm font-semibold">
        {rotulo}
        {ajuda && <BolhaDeAjuda texto={ajuda} variante="inline" />}
      </span>

      <div className="mt-1 space-y-1">
        {itens.map((item, indice) => {
          const podeMover = Boolean(aoReordenar) && !desabilitado && itens.length > 1;
          const setas = podeMover && (
            <span className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => mover(indice, indice - 1)}
                disabled={indice === 0}
                aria-label={`Subir ${item.salvo?.nomeOriginal ?? item.temporario?.nomeOriginal ?? "documento"}`}
                title="Subir"
                className="rounded p-1 text-suave hover:text-acento disabled:opacity-30"
              >
                <ChevronUp size={13} />
              </button>
              <button
                type="button"
                onClick={() => mover(indice, indice + 1)}
                disabled={indice === itens.length - 1}
                aria-label={`Descer ${item.salvo?.nomeOriginal ?? item.temporario?.nomeOriginal ?? "documento"}`}
                title="Descer"
                className="rounded p-1 text-suave hover:text-acento disabled:opacity-30"
              >
                <ChevronDown size={13} />
              </button>
            </span>
          );
          const arraste = podeMover
            ? {
                draggable: true,
                onDragStart: (evento) => {
                  evento.dataTransfer.effectAllowed = "move";
                  evento.dataTransfer.setData("text/plain", item.chave);
                  setArrastado(indice);
                },
                onDragOver: (evento) => {
                  if (arrastado === null) return;
                  evento.preventDefault();
                  if (destino !== indice) setDestino(indice);
                },
                onDrop: (evento) => {
                  evento.preventDefault();
                  if (arrastado !== null) mover(arrastado, indice);
                  setArrastado(null);
                  setDestino(null);
                },
                onDragEnd: () => {
                  setArrastado(null);
                  setDestino(null);
                },
              }
            : {};
          const alca = podeMover && (
            <span className="shrink-0 cursor-grab text-suave" title="Arraste para mudar a ordem" aria-hidden="true">
              <GripVertical size={14} />
            </span>
          );
          const realce =
            destino === indice && arrastado !== null && arrastado !== indice
              ? "ring-2 ring-acento/40"
              : destacado === item.chave
                ? "!border-emerald-400 !bg-emerald-50 ring-2 ring-emerald-300 transition-colors duration-500"
                : "transition-colors duration-500";
          const arquivo = item.salvo;
          if (!arquivo) {
            const temporario = item.temporario;
            return (
              <div
                key={item.chave}
                {...arraste}
                className={`flex items-center gap-2 rounded border border-dashed border-borda px-2 py-1.5 ${realce} ${arrastado === indice ? "opacity-50" : ""}`}
              >
                {alca}
                <FileText size={14} className="shrink-0 text-suave" />
                <span className="min-w-0 flex-1 truncate text-sm" title="Será gravado ao salvar">
                  {temporario.nomeOriginal ?? temporario.nome}
                </span>
                <span className="shrink-0 text-[11px] text-suave">a salvar</span>
                {setas}
                <button
                  type="button"
                  onClick={() => iniciarTransicao(() => aoRemover(temporario))}
                  aria-label="Remover"
                  className="shrink-0 rounded p-1 text-suave hover:bg-red-50 hover:text-red-700"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          }
          const riscado = excluidos.includes(arquivo.id);
          const nome = arquivo.nomeOriginal ?? arquivo.arquivo;
          return (
            <div
              key={item.chave}
              {...arraste}
              className={`flex items-center gap-2 rounded border px-2 py-1.5 ${riscado ? "border-red-200 bg-red-50/60" : "border-borda"} ${realce} ${arrastado === indice ? "opacity-50" : ""}`}
            >
              {alca}
              {riscado ? (
                <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-suave" title="Será excluído ao salvar">
                  <Trash2 size={14} className="shrink-0 text-red-600" />
                  <span className="truncate line-through">{nome}</span>
                  <span className="shrink-0 text-[11px] text-red-700">excluído ao salvar</span>
                </span>
              ) : (
                // BAIXA o arquivo (pedido do dono em 05/10/2026): o icone e o nome no mesmo link, sem `target`
                // (o ZIP abria uma aba em branco) e com `download` levando o nome real.
                <a
                  href={arquivo.url}
                  download={nome}
                  title="Baixar"
                  className="group/doc flex min-w-0 flex-1 items-center gap-2 text-sm hover:text-acento"
                >
                  <Download size={14} className="shrink-0 text-suave group-hover/doc:text-acento" />
                  <span className="truncate">{nome}</span>
                </a>
              )}
              {setas}
              <button
                type="button"
                onClick={() => aoAlternarExclusao?.(arquivo.id)}
                aria-label={riscado ? `Desfazer a exclusão de ${nome}` : `Excluir ${nome} ao salvar`}
                title={riscado ? "Desfazer" : "Excluir (ao salvar)"}
                className={`shrink-0 rounded p-1 text-suave ${riscado ? "hover:bg-fundo hover:text-texto" : "hover:bg-red-50 hover:text-red-700"}`}
              >
                {riscado ? <RotateCcw size={12} /> : <Trash2 size={12} />}
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={pendente || desabilitado}
        title={desabilitado ? "Espere as fotos do produto carregarem." : undefined}
        className="mt-1.5 inline-flex items-center gap-1.5 rounded border border-borda px-2.5 py-1.5 text-xs hover:bg-fundo disabled:opacity-50"
      >
        {pendente ? <Loader size={12} className="animate-spin" /> : <Upload size={12} />}
        Enviar arquivo
      </button>

      <input
        ref={entrada}
        type="file"
        accept={tipo === "DOCUMENTO" ? ACEITA_DOCUMENTO : ACEITA_CERTIFICADO}
        onChange={aoEscolher}
        className="hidden"
      />

      {!erro && (lista.length > 0 || riscados > 0 || ordem.length > 0) && (
        <p className="mt-1 text-[11px] text-suave">As mudanças nos documentos são gravadas ao salvar.</p>
      )}
      {erro && <p className="mt-1 rounded bg-red-50 p-2 text-[11px] text-red-800">{erro}</p>}
    </div>
  );
}

/**
 * As sugestoes do kit em texto, como os campos as guardam (pedidos do dono em 07 e 10/10/2026): peso e medidas
 * (`pesoEMedidasDoKit`), o preco de venda (a venda total das pecas; nula com a soma incompleta), o codigo (uma
 * peca so) e a localizacao. Nulo = nada a sugerir.
 */
function textosDasSugestoes(pecas) {
  const medidas = pesoEMedidasDoKit(pecas);
  const texto = (valor) => (valor === null || valor === undefined ? null : String(valor));
  const venda = totaisDoKit(pecas).venda;
  return {
    pesoKg: texto(medidas.pesoKg),
    comprimentoCm: texto(medidas.comprimentoCm),
    larguraCm: texto(medidas.larguraCm),
    alturaCm: texto(medidas.alturaCm),
    precoVenda: venda === null ? null : venda.toFixed(2),
    sku: codigoSugeridoDoKit(pecas),
    localizacao: localizacaoDoKit(pecas).valor,
  };
}

/** O campo ainda tem a sugestao anterior? Numeros comparam como numero ("6.80" e "6.8" sao o mesmo). */
function mesmaSugestao(atual, sugerido) {
  if (sugerido === null || sugerido === undefined || atual === "") return false;
  if (atual === sugerido) return true;
  const a = Number(atual);
  const b = Number(sugerido);
  return sugerido !== "" && Number.isFinite(a) && Number.isFinite(b) && a === b;
}

/** "falta validar no Rise · integrar com o Bling", ou o caso do kit, que nunca e peca. */
function textoDasFaltas(faltas) {
  const lista = Array.isArray(faltas) ? faltas : [];
  if (lista.length === 1 && lista[0].startsWith("É um kit")) return "é um kit, e kit não pode ser peça";
  return `falta ${lista.join(" · ")}`;
}

export default function FormularioProduto({
  produto,
  arquivos = {},
  fornecedores = [],
  concorrentes = [],
  catalogoFornecedores = [],
  dominioLojaIntegrada = "",
  // "Clonar" da lista (pedido do dono em 09/10/2026): o cadastro novo nasce com os dados de outro produto (ver
  // `dadosParaClone`). `produto` continua null: para o Salvar e para as abas, e um produto novo.
  clone = null,
  // O que a pessoa pode fazer neste cadastro (`acessosDoCadastro`, pedido do dono em 20/10/2026). Sem restricao por
  // padrao: telas que ainda nao passam o prop seguem como eram. A conferencia de verdade e do servidor.
  acessos = ACESSO_TOTAL,
}) {
  const router = useRouter();
  const somenteLeitura = !acessos.editar;
  const [aba, setAba] = useState("caracteristicas");
  const [aberturaDocumentos, setAberturaDocumentos] = useState(0);
  // Tipo do produto e pecas do kit: estado da tela (a aba Composicao edita em memoria, e so o Salvar grava).
  // Controlados, e nao `defaultValue`: o tipo decide quais abas aparecem, e a remontagem dos campos
  // ("Clonar a partir de um codigo", IA) nao pode trocar o tipo nem perder as pecas.
  const [tipo, setTipo] = useState(produto?.tipo ?? clone?.tipo ?? "SIMPLES");
  const [pecas, setPecas] = useState(() => produto?.composicao ?? clone?.composicao ?? []);
  // Pecas proprias (26/10/2026): o liga/desliga da aba Fornecedores / Concorrentes e a lista. Como o kit, so o
  // Salvar grava; desligar com itens pergunta antes (o Salvar apagaria a lista).
  const [pecasLigadas, setPecasLigadas] = useState(() => Boolean(produto?.pecasProprias ?? clone?.campos?.pecasProprias));
  const [pecasProprias, setPecasProprias] = useState(() => produto?.pecas ?? clone?.pecas ?? []);
  const [confirmarDesligar, setConfirmarDesligar] = useState(false);
  // A ordem copia as pecas GRAVADAS: com a lista mexida e nao salva, Produzir espera o Salvar.
  const [pecasGravadas] = useState(() => JSON.stringify({ ligado: Boolean(produto?.pecasProprias), pecas: produto?.pecas ?? [] }));
  // Trocar um kit com pecas para Simples apaga as pecas no Salvar: a tela pergunta antes.
  const [confirmarSimples, setConfirmarSimples] = useState(false);
  // Produto do Rise de onde este cadastro NOVO veio (o "Clonar" da lista ou o "Clonar a partir de um codigo"):
  // ao trocar para kit, ele entra como primeira peca (pedido do dono em 10/10/2026). Produto coletado nao conta.
  const [origemId, setOrigemId] = useState(clone?.origem.id ?? null);
  // Recado da aba Composicao: o produto de origem que nao pode ser peca, e por que.
  const [avisoComposicao, setAvisoComposicao] = useState(null);
  // O que o produto Simples tinha e o kit limpa (pedido do dono em 10/10/2026): fornecedores e concorrentes da
  // peca, EAN, estoque minimo e maximo e as fotos validadas. Volta ao escolher Simples; o Salvar so ve o atual.
  const guardadoDoSimples = useRef(null);
  // A proposta direto no formulario (pedido do dono em 22/10/2026; `propostaNoFormulario`): campo vazio ja nasce com o
  // valor da proposta (marca "PROPOSTA") e campo preenchido recebe a sugestao no topo da lista do icone. Calculado uma
  // vez, ao abrir. So para quem edita.
  const [daProposta] = useState(() =>
    acessos.editar && produto?.proposta ? propostaNoFormulario(produto.proposta.secoes ?? {}, produto, produto.proposta.aplicadas ?? {}) : null,
  );
  const preencheuPelaProposta = Object.keys(daProposta?.preencher ?? {}).length > 0;
  // Os campos com a marca "PROPOSTA": os que a proposta preencheu agora e os que ja tinham o valor dela de um Salvar
  // anterior (pedido do dono em 24/10/2026: "ao salvar some a tag de proposta"; so sai a dos campos que ele mexer).
  const camposComAProposta = daProposta ? { ...(daProposta.marcados ?? {}), ...daProposta.preencher } : {};
  const [editadosDaProposta, setEditadosDaProposta] = useState(() => new Set());
  // O clone ja nasce com o que salvar; o produto que a proposta preencheu tambem (decisao A do dono: conta como alteracao).
  const [alterado, setAlterado] = useState(Boolean(clone) || preencheuPelaProposta);
  // O preenchimento da proposta ao abrir nao e o dono mexendo: sem isto o rascunho automatico guardava a proposta e o
  // aviso "Alteracoes nao salvas" aparecia a cada abertura. So o que ele mexer depois conta para o rascunho.
  const [mexeuDepoisDeAbrir, setMexeuDepoisDeAbrir] = useState(false);
  const marcarAlterado = () => {
    setAlterado(true);
    setMexeuDepoisDeAbrir(true);
  };
  const [erroAcao, setErroAcao] = useState(null);
  const formulario = useRef(null);
  const referencias = useRef(null);
  const janelaDescricao = useRef(null);
  const fornecedoresRef = useRef(null);
  const concorrentesRef = useRef(null);

  // Valores trazidos por "Buscar por codigo" ou pela IA. Os campos sao nao
  // controlados (defaultValue), entao preencher e remontar o corpo do
  // formulario com novos valores iniciais: `versao` muda a key e o React recria
  // os campos.
  const [preenchido, setPreenchido] = useState(() => {
    if (clone) return clone.campos;
    if (!preencheuPelaProposta) return null;
    const daPropostaNosCampos = Object.fromEntries(
      Object.entries(daProposta.preencher).map(([campo, valor]) => [campo, CAMPOS_MAIUSCULOS.includes(campo) ? maiusculas(valor) : valor]),
    );
    return { ...produto, ...daPropostaNosCampos };
  });
  const [versao, setVersao] = useState(0);

  // Como o formulario NASCEU (Unidade "UN", Situacao ativa, o resto vazio). E a
  // base de "Buscar por codigo": clonar outro produto recomeca daqui, em vez de
  // somar ao que a busca anterior deixou. Lido da tela e nao escrito a mao, para
  // acompanhar os padroes dos campos sem duplica-los.
  const valoresIniciais = useRef(null);
  useEffect(() => {
    valoresIniciais.current = lerFormulario(formulario.current);
  }, []);

  // Referencias marcadas na janela da lupa. Moram aqui, e nao na janela, porque
  // os botoes de IA ficam no formulario (ao lado da lupa e na aba Descricao) e
  // precisam delas com a janela fechada.
  //
  // COMECA VAZIA (pedido do dono em 22/09/2026, revertendo uma tentativa
  // anterior de pre-marcar concorrentes ja vinculados ao abrir a pagina): pre-
  // marcar disparava efeitos que so deviam acontecer por acao do operador —
  // o painel de imagens tentou importar fotos de 20 produtos marcados sozinho,
  // so de a pagina ter carregado. Carregar so quando ele clicar Buscar na
  // lupa; a partir dai, ReferenciasDeMercado.jsx marca as referencias que
  // correspondem aos fornecedores/concorrentes salvos na aba — comparar com o
  // ja salvo continua valendo, so nao antes do clique.
  const [marcados, setMarcados] = useState(() => new Map());
  const [gerandoIA, iniciarIA] = useTransition();
  const [iaEmCurso, setIaEmCurso] = useState(null);
  const [erroIA, setErroIA] = useState(null);
  const [opcoesTitulo, setOpcoesTitulo] = useState(null);
  // Quanto custou a ultima geracao de titulos (vem tambem no erro: a chamada que falhou no meio ja foi cobrada).
  const [gastoTitulo, setGastoTitulo] = useState(null);
  // Gasto com IA (pedido do dono em 12/10/2026): o total ja salvo no produto e o desta edicao (titulos e descricoes
  // gerados desde que a tela abriu), que o Salvar soma ao total. O clone nasce sem o do original.
  const [gastoSalvo, setGastoSalvo] = useState(produto?.gastoIA ?? null);
  const [gastoDaEdicao, setGastoDaEdicao] = useState(null);
  // Secoes da proposta automatica aplicadas nesta edicao (vao no Salvar, que as marca como aplicadas).
  // Comeca com as que a proposta preencheu ao abrir (o Salvar as marca como aplicadas). O que cada CAMPO virou (do dono
  // ou da proposta) o Salvar guarda a parte, pelo `propostaPreenchidos` (`registrarDecisoesDoSalvar`).
  const [propostaAplicada, setPropostaAplicada] = useState(() => daProposta?.secoes ?? []);
  const somarAoGastoDaEdicao = (gasto) => {
    if (gasto) setGastoDaEdicao((atual) => somarResumos(atual, gasto));
  };
  // Fotos do produto novo, ja padronizadas no servidor (lote temporario). A ordem e a da lista, e
  // a PRIMEIRA e a principal (pedido do dono em 21/09/2026: ele ordena arrastando as miniaturas,
  // e a mais a esquerda vira a principal). Nao ha estado proprio da principal.
  const [imagensLote, setImagensLote] = useState([]);
  const [importandoImagens, setImportandoImagens] = useState(false);
  const [progressoDaImportacao, setProgressoDaImportacao] = useState(null);
  // Produtos coletados cujas fotos ja foram trazidas para o painel (mesmo os que nao tinham foto
  // nenhuma): fechar a janela da lupa de novo nao pode baixar tudo outra vez.
  const refsComFotos = useRef(new Set());

  // EDITAR um produto usa o MESMO painel do cadastro novo (pedido do dono em 21/09/2026): as fotos
  // dele entram no painel ao abrir a tela, e o Salvar aplica o resultado.
  //  - `carregandoFotosDoProduto`: enquanto elas entram, o Salvar espera (senao mandaria uma lista vazia);
  //  - `fotosProntas`: o painel CARREGOU. Vai no envio (`fotosDoPainelProntas`), e sem ele o servidor
  //    nao mexe nas fotos: se a carga falhar, salvar os dados do produto nao pode apagar as fotos dele;
  //  - `fotosPreservadas`: fotos que nao abriram (arquivo sumido ou ilegivel). Voltam no envio para o
  //    servidor NAO achar que foram excluidas.
  const [carregandoFotosDoProduto, setCarregandoFotosDoProduto] = useState(Boolean(produto));
  const [fotosProntas, setFotosProntas] = useState(false);
  const [fotosPreservadas, setFotosPreservadas] = useState([]);
  // RESERVA de imagens (Nano Banana): so em produto que ja existe (`null` no cadastro novo, que nao tem o
  // botao). `reservaExcluida` sao os ids que o dono excluiu na tela; o servidor so apaga no Salvar.
  const [reserva, setReserva] = useState(null);
  const [reservaExcluida, setReservaExcluida] = useState([]);
  const carregouFotosDoProduto = useRef(false);

  // Funcoes de preenchimento ja usadas neste cadastro, para o icone mudar de cor
  // (pedido do dono em 16/09/2026): sem isso nao da para saber, olhando a tela,
  // se o preco ou a marca vieram das referencias ou foram digitados.
  const [usados, setUsados] = useState(() => new Set());
  const usos = {
    tem: (chave) => usados.has(chave),
    marcar: (chave) =>
      setUsados((atual) =>
        atual.has(chave) ? atual : new Set(atual).add(chave),
      ),
  };

  // Documentos e certificado enviados antes de salvar. O lote (um UUID) nasce no
  // primeiro envio, e nao na montagem: gerado na renderizacao, o valor do
  // servidor e o do navegador seriam diferentes e o React acusaria.
  const [loteTemporario, setLoteTemporario] = useState("");
  const [temporarios, setTemporarios] = useState([]);
  // A ordem dos documentos e do certificado que o dono deu na tela (setas e arrastar, pedido do dono em 24/10/2026):
  // `{ DOCUMENTO: ["id:<id>", "tmp:<nome>"...], CERTIFICADO: [...] }`. Vazia = a ordem gravada. So vale no Salvar.
  const [ordemDosArquivos, setOrdemDosArquivos] = useState({});
  const reordenarArquivos = (tipo, chaves) => {
    setOrdemDosArquivos((atual) => ({ ...atual, [tipo]: chaves }));
    marcarAlterado();
  };
  // Documentos ja gravados que o dono excluiu na tela: so saem no Salvar (pedido do dono em 10/10/2026).
  const [documentosExcluidos, setDocumentosExcluidos] = useState([]);

  // Produto existente: as fotos dele entram no painel ao abrir a tela (ver `carregandoFotosDoProduto`).
  useEffect(() => {
    if (!produto || carregouFotosDoProduto.current) return;
    // Uma vez so: o modo estrito do desenvolvimento roda o efeito duas vezes, e duas copias das fotos
    // no mesmo lote apareceriam em dobro.
    carregouFotosDoProduto.current = true;

    const novoLote = crypto.randomUUID();
    tentar(() => prepararFotosDoProduto(novoLote, produto.id)).then((resposta) => {
      if (resposta.ok) {
        setLoteTemporario(novoLote);
        setImagensLote(resposta.imagens);
        setReserva(resposta.reserva ?? []);
        setFotosPreservadas(resposta.naoCarregadas);
        setFotosProntas(true);
        if (resposta.naoCarregadas.length > 0) {
          setErroAcao(
            `${resposta.naoCarregadas.length} foto(s) do produto não puderam ser abertas e ficam como estão.`,
          );
        }
      } else {
        setErroAcao(`As fotos do produto não carregaram (${resposta.erro}). Salvar não mexe nelas.`);
      }
      setCarregandoFotosDoProduto(false);
    });
  }, [produto]);

  // Clone: as fotos e os documentos do produto de origem entram no lote do cadastro novo ao abrir a tela.
  // As fotos vem VALIDADAS (o check verde), como as de um produto que ja existe: so a validada e salva, e o
  // dono pediu as fotos do original. `doClone` as protege de sair por desmarcar algo na lupa.
  const carregouClone = useRef(false);
  useEffect(() => {
    if (!clone || carregouClone.current) return;
    carregouClone.current = true;

    const novoLote = crypto.randomUUID();
    setLoteTemporario(novoLote);
    setImportandoImagens(true);
    (async () => {
      const avisos = [];
      const fotos = await tentar(() => importarImagensDaOrigem(novoLote, `rise:${clone.origem.id}`));
      if (fotos.ok) {
        // `daOrigem`: ao virar kit, estas fotos passam a ser as da peca de origem, sem baixar de novo.
        setImagensLote(fotos.imagens.map((imagem) => ({ ...imagem, finalizada: true, doClone: true, daOrigem: true })));
        if (fotos.recusadas > 0) avisos.push(`${fotos.recusadas} foto(s) do produto de origem não puderam ser copiadas.`);
      } else {
        avisos.push(`As fotos do produto de origem não foram copiadas (${fotos.erro}).`);
      }
      setImportandoImagens(false);

      const documentos = await tentar(() => copiarDocumentosParaClone(novoLote, clone.origem.id));
      if (documentos.ok) {
        setTemporarios(documentos.temporarios);
        if (documentos.faltaram > 0) avisos.push(`${documentos.faltaram} documento(s) do produto de origem não foram achados no disco.`);
      } else {
        avisos.push(`Os documentos do produto de origem não foram copiados (${documentos.erro}).`);
      }
      if (avisos.length > 0) setErroAcao(avisos.join(" "));
    })();
  }, [clone]);

  // Fornecedores e Concorrentes SO editam em memoria enquanto o formulario
  // esta aberto (pedido do dono em 22/09/2026: "so quero que salve quando eu
  // clicar no botao salvar do produto... caso eu aperte cancelar, tudo deve
  // ser desfeito"). Antes, isso so valia para produto NOVO (nascia sem
  // vinculo nenhum, e o rascunho comecava vazio); agora a lista comeca com o
  // que ja esta gravado — inclusive no produto existente — e vira vinculo de
  // verdade so no Salvar (`gravarFornecedoresRascunho`/
  // `gravarConcorrentesRascunho`, que agora tambem REMOVEM quem saiu da
  // lista). Cancelar nao desfaz nada explicitamente: e so nunca ter gravado —
  // o estado e local, e a pagina de produtos nem chega a ser recarregada.
  //
  // Produto RECEM-IMPORTADO DO BLING (pedido do dono em 22/09/2026, mais
  // antigo que esta mudanca): o fornecedor extraido na importacao mora em
  // `produto.fornecedorRascunho`, sem Fornecedor/ProdutoFornecedor criados.
  // Aqui ele vira a MESMA lista de rascunho — id fixo (nao aleatorio: entra
  // no hidden field renderizado no servidor, e um id sorteado de novo na
  // hidratacao do cliente desencontraria o HTML). So conta enquanto nao ha
  // fornecedor PADRAO de verdade (25/10/2026, `rascunhoVale`): os vinculos
  // que o MCP marca (nunca padrao) entram junto, atras dele; depois de salvo,
  // o rascunho some, substituido pelos vinculos reais.
  const [fornecedoresRascunho, setFornecedoresRascunho] = useState(() =>
    clone ? clone.fornecedores : fornecedoresComRascunho(fornecedores, produto?.fornecedorRascunho),
  );

  function mudarFornecedoresRascunho(atualizador) {
    setFornecedoresRascunho(atualizador);
    marcarAlterado();
  }

  /**
   * Concorrentes vem do servidor num formato "de tela" (`fonte`, `nome`,
   * `codigo`, `preco`, `url`, ja resolvidos do produto coletado ou do
   * manual). O rascunho precisa do formato "de gravacao" tambem
   * (`produtoColetadoId`/`*Manual`), porque e o que `ConcorrenteSchema`
   * espera ao reconciliar no Salvar — sem isto, um concorrente manual
   * existente falharia a validacao no primeiro Salvar (sem `fonteManual`
   * nenhum) e seria apagado pela reconciliacao, sem o operador ter tocado
   * nele.
   */
  function paraRascunho(item) {
    return {
      id: item.id,
      manual: item.manual,
      produtoColetadoId: item.manual ? null : item.produtoColetadoId,
      fonteManual: item.manual ? item.fonte : null,
      nomeManual: item.manual ? item.nome : null,
      codigoManual: item.manual ? item.codigo : null,
      precoManual: item.manual ? item.preco : null,
      linkManual: item.manual ? item.url : null,
      fonte: item.fonte,
      nome: item.nome,
      codigo: item.codigo,
      preco: item.preco,
      url: item.url,
    };
  }

  // Mesma ideia para Concorrentes (pedido do dono em 18/09/2026, depois de
  // Concorrentes ganhar tabela propria — ate entao nao gravava nada).
  const [concorrentesRascunho, setConcorrentesRascunho] = useState(() =>
    (clone?.concorrentes ?? concorrentes).map(paraRascunho),
  );

  function mudarConcorrentesRascunho(atualizador) {
    setConcorrentesRascunho(atualizador);
    marcarAlterado();
  }

  async function enviarTemporario(tipo, arquivo) {
    const lote = loteTemporario || crypto.randomUUID();
    if (!loteTemporario) setLoteTemporario(lote);
    const dados = new FormData();
    dados.set("arquivo", arquivo);
    const resultado = await tentar(() =>
      enviarArquivoTemporario(lote, tipo, dados),
    );
    if (resultado.ok) {
      setTemporarios((atual) => [...atual, resultado.arquivo]);
      marcarAlterado();
    }
    return resultado;
  }

  // O lote (UUID) nasce no primeiro envio, de documento OU de foto. Devolve o lote para
  // quem vai usa-lo agora mesmo: o estado so muda no proximo desenho.
  function garantirLote() {
    if (loteTemporario) return loteTemporario;
    const novoLote = crypto.randomUUID();
    setLoteTemporario(novoLote);
    return novoLote;
  }

  // Esquece os documentos e as fotos enviados antes de salvar e apaga o lote inteiro no
  // servidor. Sem apagar, ficariam no disco ate a limpeza de 24 h, sem ninguem apontando
  // para eles.
  function limparTemporarios() {
    if (loteTemporario) tentar(() => descartarLoteDeArquivos(loteTemporario));
    setTemporarios([]);
    setImagensLote([]);
    setLoteTemporario("");
    refsComFotos.current.clear();
  }

  // As fotos dos fornecedores e concorrentes marcados na lupa entram no painel quando a janela
  // fecha (pedido do dono em 21/09/2026: todas as fotos dos produtos escolhidos, para ele ficar
  // so com as melhores). Fechar e o momento em que ele termina de escolher, como nos
  // fornecedores e concorrentes da aba.
  //  - marcado agora: traz as fotos, uma vez;
  //  - desmarcado: saem as fotos que o dono nao tocou. As que ele ja finalizou ou melhorou (paga)
  //    ficam, e as que vieram do "Clonar" tambem: o que ele pediu antes nao some por causa da lupa.
  function trazerFotosDasReferencias() {
    // Produto existente: so depois de o painel ter carregado as fotos dele (o lote nasce la).
    if (produto && !fotosProntas) return;

    const ids = [...marcados.keys()];
    const marcadosAgora = new Set(ids);

    const sairam = imagensLote.filter(
      (imagem) =>
        imagem.ref &&
        !imagem.doClone &&
        !marcadosAgora.has(imagem.ref) &&
        !imagem.finalizada &&
        // Foto com versao gerada PAGA (Photoroom ou Nano Banana) nao sai por desmarcar na lupa.
        !imagem.versoes?.photoroom &&
        !imagem.versoes?.nanobanana,
    );
    const basesQueSairam = new Set(sairam.map((imagem) => imagem.base));
    if (sairam.length > 0) {
      tentar(() => removerImagensDoLote(loteTemporario, [...basesQueSairam]));
      setImagensLote((anteriores) => anteriores.filter((imagem) => !basesQueSairam.has(imagem.base)));
    }

    // Uma referencia so sai da lista de "ja trazidas" quando nao sobrou foto dela no painel; se
    // sobrou (validada, ou com versao paga), marcar de novo nao pode trazer tudo em dobro.
    for (const ref of [...refsComFotos.current]) {
      if (marcadosAgora.has(ref)) continue;
      const sobrou = imagensLote.some((imagem) => imagem.ref === ref && !basesQueSairam.has(imagem.base));
      if (!sobrou) refsComFotos.current.delete(ref);
    }

    const novas = ids.filter((id) => !refsComFotos.current.has(id));
    if (novas.length === 0) return;
    // Marca antes de esperar a resposta: duas aberturas seguidas da lupa nao podem baixar em dobro.
    for (const id of novas) refsComFotos.current.add(id);

    const lote = garantirLote();
    let vagas = MAXIMO_FOTOS_NO_PAINEL - (imagensLote.length - basesQueSairam.size);
    setImportandoImagens(true);

    // UM PRODUTO POR VEZ, e as fotos dele ja entram no painel quando o servidor responde (pedido do
    // dono em 21/09/2026): a espera e o download das lojas, que varia de 1 a 3 s por foto, e antes o
    // painel ficava vazio ate a ultima chegar. O servidor nao baixa de novo a foto que ja esta no lote
    // (pelo conteudo), entao trazer em chamadas separadas nao duplica.
    (async () => {
      let recusadas = 0;
      let foraDoLimite = 0;
      let trazidas = 0;
      let falhou = null;

      for (const [posicao, id] of novas.entries()) {
        setProgressoDaImportacao(`Trazendo as fotos (produto ${posicao + 1} de ${novas.length})...`);
        const resposta = await tentar(() => importarFotosDasReferencias(lote, [id], vagas));
        if (!resposta.ok) {
          refsComFotos.current.delete(id);
          falhou = resposta.erro;
          continue;
        }
        if (resposta.imagens.length > 0) {
          // Entram no fim da fila: so viram a principal se nao havia nenhuma antes.
          setImagensLote((anteriores) => [...anteriores, ...resposta.imagens]);
          marcarAlterado();
          vagas -= resposta.imagens.length;
          trazidas += resposta.imagens.length;
        }
        recusadas += resposta.recusadas;
        foraDoLimite += resposta.foraDoLimite;
      }

      const avisos = [];
      if (falhou) avisos.push(falhou);
      if (recusadas > 0) {
        avisos.push(
          `${recusadas} foto(s) dos produtos marcados não puderam ser trazidas (ilegível ou o site não respondeu).`,
        );
      }
      if (foraDoLimite > 0) {
        avisos.push(
          `O painel guarda ${MAXIMO_FOTOS_NO_PAINEL} fotos: ${foraDoLimite} dos produtos marcados ficaram de fora.`,
        );
      }
      if (trazidas === 0 && avisos.length === 0) {
        avisos.push("Os produtos marcados não trouxeram nenhuma foto nova.");
      }
      setErroAcao(avisos.length > 0 ? avisos.join(" ") : null);
      setImportandoImagens(false);
      setProgressoDaImportacao(null);
    })();
  }

  async function removerTemporario(item) {
    await tentar(() =>
      removerArquivoTemporario(loteTemporario, item.tipo, item.nome),
    );
    setTemporarios((atual) =>
      atual.filter((outro) => outro.nome !== item.nome),
    );
  }

  // Excluir um documento ja gravado so o risca; o Salvar o apaga (pedido do dono em 10/10/2026). Outro clique desfaz.
  function alternarExclusaoDeDocumento(id) {
    setDocumentosExcluidos((atual) => (atual.includes(id) ? atual.filter((outro) => outro !== id) : [...atual, id]));
    marcarAlterado();
  }

  // "Anexar a este produto" no kit: o documento da peca e copiado para o lote e entra como "a salvar".
  async function anexarDocumento(arquivoId) {
    const lote = garantirLote();
    const resultado = await tentar(() => anexarDocumentoDaPeca(lote, arquivoId));
    if (resultado.ok) {
      setTemporarios((atual) => [...atual, resultado.arquivo]);
      marcarAlterado();
    }
    return resultado;
  }

  // Marca, modelo, homologacao, EAN, medidas e NCM das referencias, para os icones dos campos. Lidos ANTES
  // de abrir qualquer lista, para o icone ja nascer (ou nao) conforme haja dado.
  const [valoresRefs, setValoresRefs] = useState(null);
  const [lendoRefs, iniciarLeituraRefs] = useTransition();
  // As marcadas na lupa, como estavam quando a janela FECHOU: e quando o operador termina de escolher, e
  // cada clique dentro da janela nao relê o banco.
  const [idsDaLupa, setIdsDaLupa] = useState([]);

  function lerValoresRefs() {
    // Fornecedor marcado entra sozinho na aba Fornecedores ao fechar a janela
    // (pedido do dono em 18/09/2026): fechar e o momento em que o operador
    // termina de escolher, e nao cada marcacao dentro da janela.
    fornecedoresRef.current?.sincronizarSugestoes();
    concorrentesRef.current?.sincronizarSugestoes();
    trazerFotosDasReferencias();
    // Os valores sao relidos pelo efeito de `chaveDasIndicacoes`, junto com os dos vinculos salvos.
    setIdsDaLupa([...marcados.keys()]);
  }

  function alternarReferencia(item) {
    setMarcados((atual) => {
      const novo = new Map(atual);
      if (novo.has(item.id)) novo.delete(item.id);
      else if (novo.size < MAXIMO_MARCADOS) novo.set(item.id, item);
      return novo;
    });
  }

  function marcarReferenciasLigadas(itens) {
    setMarcados((atual) => {
      const novo = new Map(atual);
      for (const item of itens) {
        if (!novo.has(item.id) && novo.size < MAXIMO_MARCADOS) novo.set(item.id, item);
      }
      return novo;
    });
  }

  function criarComIA(qual) {
    // As mesmas referencias da lista de titulos: as marcadas na lupa e os vinculos salvos.
    const ids = referenciasDasIndicacoes.map((item) => item.id);
    // As palavras do Nome orientam a IA sobre QUAL produto e o nosso.
    const palavras =
      formulario.current?.elements.namedItem("tituloBase")?.value ?? "";
    setErroIA(null);
    setIaEmCurso(qual);

    if (qual === "titulo") setOpcoesTitulo(null);

    // A descricao tem janela propria (JanelaDescricao); aqui so o titulo.
    iniciarIA(async () => {
      const resultado = await tentar(() => criarTitulosIA(ids, palavras));
      setGastoTitulo(resultado.gasto ?? null);
      somarAoGastoDaEdicao(resultado.gasto);
      if (!resultado.ok) {
        setErroIA({ qual, texto: resultado.erro });
        return;
      }
      // Nada vai para o Nome ainda: o operador escolhe uma das opcoes.
      setOpcoesTitulo({ opcoes: resultado.opcoes, referencias: ids.length });
    });
  }

  function escolherTitulo(titulo) {
    setOpcoesTitulo(null);
    aplicar({ tituloBase: titulo });
    usos.marcar("titulo");
  }

  // O Nome mudou na digitacao (pedido do dono em 25/10/2026): a descricao acompanha, no titulo da primeira linha e no 1o
  // item de "Itens inclusos", enquanto essas linhas ainda forem o Nome de antes. Quem editou uma delas a mao a mantem.
  // Escreve pela via da digitacao, entao "alterado" e o rascunho seguem. A descricao fica montada mesmo em outra aba.
  function acompanharNomeNaDescricao(nome, nomeDeAntes) {
    const campo = formulario.current?.elements.namedItem("descricaoBase");
    if (!campo || campo.disabled) return;
    const texto = acompanharTituloNaDescricao(campo.value, nomeDeAntes, nome);
    if (texto !== campo.value) escreverNoCampo(campo, texto);
  }

  const idsMarcados = [...marcados.keys()];

  const valorDoCampo = (nome) =>
    formulario.current?.elements.namedItem(nome)?.value ?? "";

  // NCM do kit: os NCMs das pecas entram na lista do campo, antes das referencias de mercado.
  const ncmDasPecas = tipo === "COMPOSICAO" && acessos.editar
    ? ncmsDasPecas(pecas).map((grupo) => ({ valor: grupo.ncm, origem: `Peça ${grupo.pecas.join(", ")}`, fontes: ["Peças do kit"] }))
    : [];

  /**
   * Peso e dimensoes lidos das linhas "- Dimensões(CxLxA): ...;" e "- Peso: ...;"
   * da descricao (pedido do dono em 16/09/2026), so para os campos VAZIOS: o que
   * o operador ja digitou nao e sobrescrito por texto.
   */
  function medidasParaCamposVazios(texto) {
    const lidas = medidasDaDescricao(texto);
    const campos = {};
    const nomes = [];
    for (const campo of CAMPOS_DE_MEDIDA) {
      if (lidas[campo] === undefined || valorDoCampo(campo).trim()) continue;
      campos[campo] = String(lidas[campo]);
      nomes.push(ROTULO_DE_MEDIDA[campo]);
    }
    return { campos, nomes };
  }

  /** Descricao colada ou editada a mao: ao sair do campo, le as medidas dela. */
  function lerMedidasDaDescricaoEditada(texto) {
    const { campos, nomes } = medidasParaCamposVazios(texto);
    if (nomes.length === 0) return;
    aplicar(campos);
  }

  const ia = {
    quantos: marcados.size,
    gerando: gerandoIA,
    emCurso: iaEmCurso,
    erro: erroIA,
    opcoesTitulo: opcoesTitulo?.opcoes ?? null,
    gastoTitulo,
    // As 3 opcoes de titulo da proposta automatica (tag IA, com a recomendada), na lista "Escolher o titulo".
    propostaTitulos: acessos.editar ? (produto?.proposta?.secoes?.titulos ?? null) : null,
    // Sem a permissao de gerar texto com IA, a lista de titulos nao oferece o bloco "Com IA".
    permiteIA: acessos.ia,
  };

  // O resultado e tratado dentro da propria acao, e nao num efeito: reagir a
  // mudanca de estado com setState dentro de useEffect provoca renderizacoes em
  // cascata (e a regra do React 19 barra).
  // RASCUNHO AUTOMATICO (pedido do dono em 13/10/2026): o que se edita fica guardado neste navegador
  // (localStorage) e volta depois de recarregar a pagina; o banco so muda no Salvar, e ao salvar ou cancelar o
  // rascunho some. A regra mora em `lib/rascunhoDoCadastro.js` e o relogio em `useRascunhoAutomatico`.
  const rascunho = useRascunhoAutomatico({
    chave: chaveDoRascunho({ produtoId: produto?.id ?? null, cloneId: clone?.origem.id ?? null }),
    baseEm: produto?.atualizadoEm ?? null,
    formulario,
    lerCampos: lerFormulario,
    estado: {
      alterado: alterado && (mexeuDepoisDeAbrir || !preencheuPelaProposta),
      tipo,
      pecas,
      pecasProprias: { ligado: pecasLigadas, pecas: pecasProprias },
      fornecedores: fornecedoresRascunho,
      concorrentes: concorrentesRascunho,
      lote: loteTemporario,
      imagens: imagensLote,
      preservadas: fotosPreservadas,
      reservaExcluida,
      temporarios,
      documentosExcluidos,
      gastoDaEdicao,
    },
  });

  function recuperarRascunho() {
    const guardado = rascunho.guardado;
    if (!guardado) return;
    // Os campos soltos voltam pelo mesmo caminho do Salvar recusado: valores iniciais novos e remontagem.
    setPreenchido((atual) => ({ ...(atual ?? produto ?? {}), ...guardado.campos }));
    setVersao((anterior) => anterior + 1);
    setTipo(guardado.tipo);
    setPecas(guardado.pecas);
    if (guardado.pecasProprias) {
      setPecasLigadas(Boolean(guardado.pecasProprias.ligado));
      setPecasProprias(Array.isArray(guardado.pecasProprias.pecas) ? guardado.pecasProprias.pecas : []);
    }
    setFornecedoresRascunho(guardado.fornecedores);
    setConcorrentesRascunho(guardado.concorrentes);
    // As fotos e os documentos enviados so voltam se o lote temporario ainda existe (rascunho de mais de 20 h perde).
    if (guardado.fotos.lote) {
      setLoteTemporario(guardado.fotos.lote);
      setImagensLote(guardado.fotos.imagens);
      setFotosPreservadas(guardado.fotos.preservadas);
      setReservaExcluida(guardado.fotos.reservaExcluida);
      setTemporarios(guardado.temporarios);
    }
    setDocumentosExcluidos(guardado.documentosExcluidos);
    setGastoDaEdicao(guardado.gastoDaEdicao);
    marcarAlterado();
    rascunho.aplicado();
  }

  const [estado, acao, enviando] = useActionState(
    async (anterior, formData) => {
      // O painel guarda mais fotos do que o produto leva (as candidatas dos produtos marcados na
      // lupa). Lido do que esta sendo ENVIADO, e nao do estado: a acao nao pode enxergar uma foto
      // velha. Recusar aqui evita o servidor cortar as fotos que sobram sem o dono ver.
      // So contam as que serao SALVAS: as sem o check verde (`finalizada: false`) sao excluidas no Salvar.
      let fotosNoEnvio = 0;
      try {
        fotosNoEnvio = JSON.parse(formData.get("imagensDoLote") ?? "[]").filter(
          (foto) => foto?.finalizada !== false,
        ).length;
      } catch {
        // Campo ilegivel: o servidor ignora e o produto vai sem fotos do painel.
      }
      const resultado =
        fotosNoEnvio > MAXIMO_IMAGENS
          ? {
              ok: false,
              erro: `${fotosNoEnvio} fotos estão validadas e o produto leva no máximo ${MAXIMO_IMAGENS}. Tire a validação ou exclua ${fotosNoEnvio - MAXIMO_IMAGENS} (Melhorar).`,
            }
          : await salvarProduto(produto?.id ?? null, anterior, formData);

      /*
      O REACT 19 LIMPA O FORMULARIO DEPOIS DA ACTION, e o que volta e o
      defaultValue de cada campo — nao o que foi digitado. Num Salvar recusado
      (SKU repetido) o SKU voltava VAZIO junto com a mensagem de erro, e todo
      campo escrito a mao fora do cadastro inicial sumia. Guardar o que foi
      enviado como valor inicial faz o reset devolver os mesmos valores.
    */
      // "Os dados foram salvos, mas as fotos (ou os documentos) nao": o gasto desta edicao JA entrou no produto. Passa
      // para o total salvo e zera, senao o segundo Salvar somaria de novo.
      if (resultado.gastoGravado) {
        setGastoSalvo((salvo) => somarResumos(salvo, lerGastoEnviado(formData)));
        setGastoDaEdicao(null);
      }
      if (!resultado.ok) {
        const enviados = Object.fromEntries(formData.entries());
        enviados.ativo = enviados.ativo === "on";
        setPreenchido(enviados);
        // E REMONTA os campos com o que foi enviado (achado em 10/10/2026): o reset do React devolve cada LISTA
        // (<select>) ao valor de quando ela foi montada, e mudar o `defaultValue` depois nao muda isso. Sem
        // remontar, um kit novo recusado (codigo vazio) voltava a Unidade para UN e o Tipo para Simples sem a
        // tela mostrar, e o Salvar seguinte gravava um produto simples, sem as pecas.
        setVersao((anterior) => anterior + 1);
      }

      if (resultado.ok) {
        setAlterado(false);
        // Salvou no banco: o rascunho cumpriu o papel (pedido do dono em 13/10/2026).
        rascunho.encerrar();

        // Os dois voltam para a lista (pedido do dono em 10/10/2026: o produto novo FICAVA na tela, de quando fotos,
        // documentos e fornecedores so entravam depois de o produto existir; hoje tudo entra antes do Salvar). A
        // lista ordena pelo ultimo alterado, entao o novo vem no topo, destacado (`novo`). Os avisos de algo que nao
        // foi gravado vao na URL e aparecem na lista, senao a foto recusada sumiria em silencio.
        // A volta e para a lista como ela estava nesta aba (pesquisa, pagina, ordem: pedido do dono em 20/10/2026).
        if (produto) router.push(lerUltimaLista());
        else if (resultado.id) {
          router.replace(
            listaComParametros(lerUltimaLista(), {
              novo: resultado.id,
              fotos: resultado.avisoImagens ? "falhou" : null,
              documentos: resultado.avisoArquivos ? "falhou" : null,
              fornecedores: resultado.avisoFornecedores ? "falhou" : null,
              concorrentes: resultado.avisoConcorrentes ? "falhou" : null,
            }),
          );
        }
      }

      return resultado;
    },
    null,
  );

  const erros = estado?.erros ?? {};
  // A mensagem do Salvar recusado some quando o formulario muda (ela ficava na tela depois de corrigida, achado do
  // dono em 10/10/2026). O proximo Salvar traz outra resposta e a mostra de novo.
  const [erroDispensado, setErroDispensado] = useState(null);
  // O que foi preenchido ou enviado vence o cadastro gravado: e o estado mais
  // recente da tela.
  const inicial = preenchido ?? produto;
  const v = (campo) => inicial?.[campo] ?? "";
  const novo = !produto;
  // GARANTIA sugerida: 3 meses (pedido do dono em 10/10/2026), so no produto NOVO que nao veio de um clone. O clone
  // (da lista ou por codigo) traz a garantia DO PRODUTO CLONADO, mesmo vazia (o dono conferiu em 10/10/2026). So no
  // estado inicial (`preenchido` nulo): depois de um Salvar recusado o campo volta com o que foi enviado, e quem
  // apagou os 3 meses nao os ve de volta. Produto ja salvo com o campo vazio NAO muda: o proximo Salvar gravaria 3
  // sem o dono ter escolhido.
  const garantiaInicial = novo && !clone && preenchido === null && v("garantiaMeses") === "" ? "3" : v("garantiaMeses");
  // A aba Fornecedores agora SEMPRE le e edita a lista em memoria (rascunho),
  // produto novo ou existente — ver o comentario junto de
  // `fornecedoresRascunho`, acima.
  const usaFornecedorRascunho = true;

  // Preco venda ATUAL, para a comparacao com concorrentes em Concorrentes.jsx.
  // O campo continua nao controlado (ver CampoPreco); isto so espelha o valor
  // numa variavel de estado, atualizada ao digitar e ao escolher da lista de
  // precos das referencias — os dois unicos jeitos de mudar este campo. Nasce
  // depois de `v` existir, por isso nao esta com os outros `useState` do topo.
  const [precoVendaTexto, setPrecoVendaTexto] = useState(v("precoVenda"));
  const precoVendaAtual = precoVendaTexto !== "" ? Number(precoVendaTexto) : null;

  /**
   * Sugestoes do kit nos campos (pedidos do dono em 07 e 10/10/2026): peso e medidas, codigo, preco de venda e
   * localizacao. Os campos nao sao controlados, entao a sugestao e escrita direto no <input>.
   *
   * PARA NAO APAGAR O DIGITADO, um campo so recebe a sugestao quando esta vazio ou ainda tem a ULTIMA sugestao
   * (`sugeridos`). Excecoes: o peso e escrito sempre (decisao de 07/10/2026), e a localizacao do kit de uma
   * peca tambem (e a da peca, travada). Sem sugestao (codigo com varias pecas), o campo que tinha a anterior
   * fica vazio. O codigo so e sugerido em produto novo: o de um kit salvo nunca muda sozinho.
   */
  const sugeridos = useRef(null);
  if (sugeridos.current === null) sugeridos.current = textosDasSugestoes(produto?.composicao ?? clone?.composicao ?? []);

  function aplicarSugestoesDoKit(lista) {
    const form = formulario.current;
    if (!form) return;
    const anterior = sugeridos.current ?? {};
    const nova = textosDasSugestoes(lista);
    const travada = localizacaoDoKit(lista).travada;
    let precoEscrito = null;
    const escrever = (nome, valor, { sempre = false } = {}) => {
      const entrada = form.elements.namedItem(nome);
      if (!entrada) return;
      const atual = entrada.value;
      if (valor === null) {
        if (mesmaSugestao(atual, anterior[nome])) entrada.value = "";
        return;
      }
      if (sempre || atual === "" || mesmaSugestao(atual, anterior[nome])) {
        entrada.value = valor;
        if (nome === "precoVenda") precoEscrito = valor;
      }
    };
    if (nova.pesoKg !== null) escrever("pesoKg", nova.pesoKg, { sempre: true });
    for (const campo of ["comprimentoCm", "larguraCm", "alturaCm"]) {
      // Medida que a peca nao tem nao apaga a do campo.
      if (nova[campo] !== null) escrever(campo, nova[campo]);
    }
    if (!produto) escrever("sku", nova.sku);
    // Soma incompleta (peca sem preco) nao sugere nem apaga: uma soma parcial pareceria um preco certo.
    if (nova.precoVenda !== null) escrever("precoVenda", nova.precoVenda);
    escrever("localizacao", nova.localizacao, { sempre: travada });
    if (precoEscrito !== null) setPrecoVendaTexto(precoEscrito);
    // A proxima comparacao e com o que se sugeriu agora; campo sem sugestao nova guarda a anterior.
    sugeridos.current = {
      ...anterior,
      ...Object.fromEntries(Object.entries(nova).filter(([campo, valor]) => valor !== null || campo === "sku")),
    };
  }

  // As pecas ou o tipo mudaram: refaz as sugestoes. Compara com a ultima chave aplicada, e nao com "primeira
  // passada": abrir um kit nao pode mudar o que esta gravado, nem quando o modo estrito roda o efeito duas vezes.
  const assinaturaDasPecas = pecas.map((peca) => `${peca.componenteId}:${peca.quantidade}`).join(",");
  const chaveDasSugestoes = `${tipo}|${assinaturaDasPecas}`;
  const ultimaChaveDasSugestoes = useRef(chaveDasSugestoes);
  useEffect(() => {
    if (ultimaChaveDasSugestoes.current === chaveDasSugestoes) return;
    ultimaChaveDasSugestoes.current = chaveDasSugestoes;
    if (tipo === "COMPOSICAO") aplicarSugestoesDoKit(pecas);
    // So a chave (tipo, ids e quantidades) diz se algo mudou; `pecas` e recriada a cada edicao.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDasSugestoes]);

  /**
   * FOTOS DAS PECAS (pedido do dono em 10/10/2026): cada peca incluida traz as fotos dela para o painel, todas sem
   * escolher (so a validada e salva, e o dono escolhe as do kit). A peca de origem do clone ja tem as fotos no
   * painel e nao baixa de novo. Peca tirada leva as fotos dela que ainda estao sem check; as da origem ficam (sao
   * as do clone). Abrir um kit nao traz nada: so peca que ENTRA.
   */
  const imagensDoPainel = useRef(imagensLote);
  useEffect(() => {
    imagensDoPainel.current = imagensLote;
  }, [imagensLote]);
  const importacoesDePecas = useRef(0);
  const idsDasPecas = pecas.map((peca) => peca.componenteId).join(",");
  const pecasDasFotos = useRef(idsDasPecas);

  async function trazerFotosDaPeca(pecaId) {
    if (pecaId === origemId && imagensDoPainel.current.some((imagem) => imagem.daOrigem)) {
      setImagensLote((lista) =>
        lista.map((imagem) => (imagem.daOrigem ? { ...imagem, daPeca: pecaId, finalizada: false } : imagem)),
      );
      return;
    }
    const lote = garantirLote();
    importacoesDePecas.current += 1;
    setImportandoImagens(true);
    setProgressoDaImportacao("Trazendo as fotos das peças...");
    const resposta = await tentar(() => importarImagensDaOrigem(lote, `rise:${pecaId}`));
    importacoesDePecas.current -= 1;
    if (importacoesDePecas.current === 0) {
      setImportandoImagens(false);
      setProgressoDaImportacao(null);
    }
    if (!resposta.ok) {
      setErroAcao(`As fotos de uma peça não vieram (${resposta.erro}).`);
      return;
    }
    // A peca pode ter saido do kit enquanto as fotos baixavam.
    if (!pecasDasFotos.current.split(",").includes(pecaId)) return;
    const vagas = Math.max(0, MAXIMO_FOTOS_NO_PAINEL - imagensDoPainel.current.length);
    const novas = resposta.imagens.slice(0, vagas).map((imagem) => ({ ...imagem, finalizada: false, daPeca: pecaId }));
    if (novas.length < resposta.imagens.length) {
      setErroAcao(
        `O painel guarda até ${MAXIMO_FOTOS_NO_PAINEL} fotos: ${resposta.imagens.length - novas.length} foto(s) de uma peça ficaram de fora.`,
      );
    }
    if (novas.length > 0) setImagensLote((lista) => [...lista, ...novas]);
  }

  useEffect(() => {
    if (pecasDasFotos.current === idsDasPecas) return;
    const antes = new Set(pecasDasFotos.current ? pecasDasFotos.current.split(",") : []);
    pecasDasFotos.current = idsDasPecas;
    const atuais = new Set(idsDasPecas ? idsDasPecas.split(",") : []);
    const sairam = [...antes].filter((id) => !atuais.has(id));
    if (sairam.length > 0) {
      setImagensLote((lista) =>
        lista.filter(
          (imagem) => !(imagem.daPeca && sairam.includes(imagem.daPeca) && !imagem.daOrigem && imagem.finalizada !== true),
        ),
      );
    }
    for (const id of atuais) if (!antes.has(id)) trazerFotosDaPeca(id);
    // So os ids dizem se uma peca entrou ou saiu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsDasPecas]);

  /** Escreve num campo nao controlado (EAN, estoque, unidade) e devolve o valor que estava. */
  function trocarCampo(nome, valor) {
    const entrada = formulario.current?.elements.namedItem(nome);
    if (!entrada) return "";
    const antes = entrada.value;
    entrada.value = valor;
    return antes;
  }

  /**
   * Trocar o Tipo (o campo so aparece em produto novo ou clonado, pedido do dono em 10/10/2026).
   *
   * Virar kit: unidade KIT; EAN, estoque minimo e maximo, fornecedores e concorrentes (eram da peca: o Bling
   * receberia o custo de uma peca como custo do kit, e o selo de preco compararia o kit com a peca avulsa) ficam
   * guardados e saem; as fotos passam a "nao escolhida"; o preco e as medidas do clone contam como sugestao; e o
   * produto de origem entra como primeira peca, se puder ser peca.
   */
  function virarKit() {
    const valorDe = (nome) => formulario.current?.elements.namedItem(nome)?.value ?? "";
    guardadoDoSimples.current = {
      // O que a tela vai sugerir no kit: volta ao escolher Simples se o dono nao tiver mexido.
      campos: Object.fromEntries(
        ["sku", "precoVenda", "localizacao", "pesoKg", "comprimentoCm", "larguraCm", "alturaCm"].map((nome) => [nome, valorDe(nome)]),
      ),
      fornecedores: fornecedoresRascunho,
      concorrentes: concorrentesRascunho,
      ean: trocarCampo("ean", ""),
      estoqueMinimo: trocarCampo("estoqueMinimo", ""),
      estoqueMaximo: trocarCampo("estoqueMaximo", ""),
      fotosValidadas: new Set(imagensLote.filter((imagem) => imagem.finalizada === true).map((imagem) => imagem.base)),
    };
    trocarCampo("unidade", "KIT");
    setFornecedoresRascunho([]);
    setConcorrentesRascunho([]);
    setImagensLote((lista) => lista.map((imagem) => (imagem.finalizada === true ? { ...imagem, finalizada: false } : imagem)));
    const atual = (nome) => formulario.current?.elements.namedItem(nome)?.value || null;
    sugeridos.current = {
      ...sugeridos.current,
      precoVenda: atual("precoVenda"),
      comprimentoCm: atual("comprimentoCm"),
      larguraCm: atual("larguraCm"),
      alturaCm: atual("alturaCm"),
      localizacao: atual("localizacao"),
      // O "Clonar a partir de um codigo" copia o codigo da PECA para o campo: no kit ele vira o "{sku}_N".
      ...(origemId ? { sku: atual("sku") } : {}),
    };
    setAvisoComposicao(null);
    setTipo("COMPOSICAO");
    setAba("composicao");
    marcarAlterado();
    if (origemId && pecas.length === 0) incluirOrigem(origemId);
  }

  async function incluirOrigem(id) {
    const resposta = await tentar(() => pecaDeOrigemDoKit(id));
    if (resposta.ok) {
      // So entra com o kit ainda vazio: o dono pode ter incluido outra peca enquanto a leitura corria.
      setPecas((atuais) => (atuais.length === 0 ? [resposta.peca] : atuais));
      return;
    }
    const quem = resposta.sku ? `O produto de origem ${resposta.sku}` : "O produto de origem";
    const motivo = resposta.faltas ? textoDasFaltas(resposta.faltas) : resposta.erro;
    setAvisoComposicao(`${quem} não entrou no kit: ${motivo}.`);
  }

  /** Voltar a Simples: unidade UN, as pecas saem e o que o kit limpou volta (o que entrou enquanto era kit fica). */
  function voltarASimples() {
    setTipo("SIMPLES");
    setPecas([]);
    setConfirmarSimples(false);
    setAvisoComposicao(null);
    marcarAlterado();
    if (aba === "composicao") setAba("caracteristicas");
    trocarCampo("unidade", "UN");
    const guardado = guardadoDoSimples.current;
    guardadoDoSimples.current = null;
    if (!guardado) return;
    const juntar = (velhos) => (atuais) => [...velhos, ...atuais.filter((item) => !velhos.some((velho) => velho.id === item.id))];
    setFornecedoresRascunho(juntar(guardado.fornecedores));
    setConcorrentesRascunho(juntar(guardado.concorrentes));
    for (const nome of ["ean", "estoqueMinimo", "estoqueMaximo"]) {
      const entrada = formulario.current?.elements.namedItem(nome);
      if (entrada && entrada.value === "") entrada.value = guardado[nome];
    }
    // Codigo, preco, localizacao, peso e medidas que ainda tem a sugestao do kit voltam ao que eram no Simples
    // (o codigo "{sku}_5" e o preco de 5 pecas nao servem para o produto simples). O que o dono digitou fica.
    for (const [nome, valor] of Object.entries(guardado.campos ?? {})) {
      const entrada = formulario.current?.elements.namedItem(nome);
      if (!entrada || !mesmaSugestao(entrada.value, sugeridos.current?.[nome])) continue;
      entrada.value = valor;
      if (nome === "precoVenda") setPrecoVendaTexto(valor);
    }
    setImagensLote((lista) =>
      lista.map((imagem) =>
        guardado.fotosValidadas.has(imagem.base) && imagem.finalizada === false ? { ...imagem, finalizada: true } : imagem,
      ),
    );
  }

  function mudarTipo(novoTipo) {
    if (novoTipo === tipo) return;
    if (novoTipo === "COMPOSICAO") {
      virarKit();
      return;
    }
    // Kit com pecas: pergunta antes, porque as pecas saem.
    if (pecas.length > 0) {
      setConfirmarSimples(true);
      return;
    }
    voltarASimples();
  }


  // Custo do fornecedor PADRAO, para a margem ao lado do Preco venda (pedido
  // do dono em 22/09/2026). Lido da mesma lista que a aba Fornecedores usa —
  // rascunho ou vinculos de verdade — e nao de Produto.custo: aquele campo so
  // e recalculado no Salvar, e ficaria um Salvar atrasado do que a tela mostra
  // (ex.: acabou de marcar outro fornecedor como padrao, ainda nao salvou).
  // No kit, o custo e o CUSTO TOTAL das pecas (custo x quantidade), e nulo quando falta o de alguma: a
  // margem nao pode sair de uma soma parcial.
  const ehKit = tipo === "COMPOSICAO";
  // Kit: a localizacao e automatica (a da peca, ou `100101(F9) / 101010(H2)` com varias) e fica travada (pedidos do
  // dono em 10/10/2026).
  const localizacaoTravada = ehKit && pecas.length >= 1;
  // Os nomes que o produto ja tem (gravados e nao riscados, e os "a salvar"), por tipo: o "Anexar a este produto"
  // vira "Anexado" para nao duplicar.
  const nomesDosDocumentos = Object.fromEntries(
    ["DOCUMENTO", "CERTIFICADO"].map((tipoDoArquivo) => [
      tipoDoArquivo,
      new Set([
        ...(arquivos[tipoDoArquivo] ?? [])
          .filter((arquivo) => !documentosExcluidos.includes(arquivo.id))
          .map((arquivo) => arquivo.nomeOriginal ?? arquivo.arquivo),
        ...temporarios.filter((item) => item.tipo === tipoDoArquivo).map((item) => item.nomeOriginal ?? item.nome),
      ]),
    ]),
  );
  const custoPadrao = ehKit
    ? totaisDoKit(pecas).custo
    : pecasLigadas
      ? custoDaLista(pecasProprias)
      : ((usaFornecedorRascunho ? fornecedoresRascunho : fornecedores).find((item) => item.padrao)?.precoCusto ?? null);

  // Referencias marcadas na lupa que ja servem de atalho na aba Fornecedores
  // (pedido do dono em 18/09/2026): fornecedor vira sugestao de linha ali;
  // concorrente so aparece para consulta, em Concorrentes.jsx — preco de
  // concorrente nao e custo, entao nao entra na mesma tabela.
  // Repetido = mesmo fornecedor E mesmo codigo (desde 23/10/2026 o mesmo fornecedor pode entrar mais de uma vez no
  // produto, com codigos diferentes; ate ali bastava o nome para a sugestao sumir).
  const chaveDoFornecedor = (nome, codigo) =>
    `${String(nome ?? "").trim().toLocaleLowerCase("pt-BR")}|${String(codigo ?? "").trim().toLocaleLowerCase("pt-BR")}`;
  const fornecedoresAtuais = new Set(
    (usaFornecedorRascunho ? fornecedoresRascunho : fornecedores).map((item) => chaveDoFornecedor(item.nome, item.codigo)),
  );
  const sugestoesFornecedor = [...marcados.values()].filter(
    (item) =>
      item.tipo === "FORNECEDOR" &&
      item.fonte &&
      !fornecedoresAtuais.has(chaveDoFornecedor(item.fonte, item.codigo && item.codigo !== "N/A" ? item.codigo : "")),
  );

  // Mesmo atalho para Concorrentes, pela referencia (produtoColetadoId), nao
  // pelo nome da loja: duas linhas do mesmo concorrente com produtos
  // diferentes sao legitimas (o Fornecedor e o unico por loja; o concorrente
  // nao).
  const idsConcorrentesAtuais = new Set(
    concorrentesRascunho.map((item) => item.produtoColetadoId).filter(Boolean),
  );
  const sugestoesConcorrente = [...marcados.values()].filter(
    (item) => item.tipo === "CONCORRENTE" && !idsConcorrentesAtuais.has(item.id),
  );

  // O estoque de cada concorrente da lista, lido do banco (a aba Concorrentes le o seu so quando abre, e o selo
  // ao lado do Preco venda aparece antes). Concorrente sem estoque, ou que saiu da loja, nao conta na posicao.
  const [estoqueDosConcorrentes, setEstoqueDosConcorrentes] = useState({});
  const chaveDosColetados = concorrentesRascunho
    .map((item) => item.produtoColetadoId)
    .filter(Boolean)
    .sort()
    .join(",");
  useEffect(() => {
    // Sem o dado Concorrentes nao ha lista para consultar (e o servidor devolveria vazio).
    if (!acessos.concorrentes) return;
    let valido = true;
    consultarSituacaoConcorrentes(chaveDosColetados ? chaveDosColetados.split(",") : [])
      .then((resposta) => {
        if (valido) setEstoqueDosConcorrentes(resposta.ok ? resposta.itens : {});
      })
      .catch(() => {
        if (valido) setEstoqueDosConcorrentes({});
      });
    return () => {
      valido = false;
    };
  }, [chaveDosColetados, acessos.concorrentes]);

  // O EAN do produto e de verdade e e deste produto? (pedido do dono em 21/10/2026, opcao 1): formato, digito verificador e
  // o catalogo do Mercado Livre. So quem edita; confere ao abrir, ao sair do campo e ao escolher um EAN da lista.
  const [avisoEan, setAvisoEan] = useState(null);
  const eanConferido = useRef(null);
  function conferirEan() {
    if (!acessos.editar) return;
    const ean = valorDoCampo("ean").trim();
    if (ean === eanConferido.current) return;
    eanConferido.current = ean;
    if (!ean) {
      setAvisoEan(null);
      return;
    }
    conferirEanNoMercadoLivre(ean, valorDoCampo("sku"), valorDoCampo("tituloBase"))
      .then((resposta) => {
        if (eanConferido.current === ean) setAvisoEan(resposta?.ok ? resposta.aviso : null);
      })
      .catch(() => {});
  }
  const eanInicial = String(produto?.ean ?? clone?.campos?.ean ?? "").trim();
  // "Gerar EAN interno" (pedido do dono em 23/10/2026, sem GS1): EAN-13 da faixa 2 derivado do SKU. O botao so existe com
  // o campo vazio, e o campo nao e controlado: `eanPreenchido` e mantido pelo input, pelo blur e pela lista de referencias,
  // senao um EAN escolhido na lista deixaria o botao a vista por cima de um campo cheio.
  const [eanPreenchido, setEanPreenchido] = useState(Boolean(eanInicial));
  const [falhaEan, setFalhaEan] = useState(null);
  function atualizarEanPreenchido() {
    setEanPreenchido(Boolean(valorDoCampo("ean").trim()));
  }
  function gerarEan() {
    const resultado = gerarEanDoSku(valorDoCampo("sku"));
    if (!resultado.ok) {
      setFalhaEan(resultado.erro);
      return;
    }
    const campo = formulario.current?.elements.namedItem("ean");
    if (!campo) return;
    campo.value = resultado.ean;
    setFalhaEan(null);
    setEanPreenchido(true);
    marcarAlterado();
    usos.marcar("ean");
    // O catalogo do ML nao conhece a faixa 2 e nao avisa nada; se um dia o codigo bater em outro produto, o aviso ambar
    // aparece como para qualquer EAN.
    conferirEan();
  }
  const skuInicial = produto?.sku ?? "";
  const tituloInicial = produto?.tituloBase ?? clone?.campos?.tituloBase ?? "";
  useEffect(() => {
    if (!acessos.editar || !eanInicial) return;
    eanConferido.current = eanInicial;
    let valido = true;
    conferirEanNoMercadoLivre(eanInicial, skuInicial, tituloInicial)
      .then((resposta) => {
        if (valido && eanConferido.current === eanInicial) setAvisoEan(resposta?.ok ? resposta.aviso : null);
      })
      .catch(() => {});
    return () => {
      valido = false;
    };
  }, [acessos.editar, eanInicial, skuInicial, tituloInicial]);

  // "2º de 10" ao lado de Preco venda e de Concorrentes (pedido do dono em 06/10/2026): o preco que esta no
  // campo AGORA contra a lista de concorrentes da tela, salva ou nao. Ver lib/posicaoDePreco.js.
  const posicaoDoPreco = posicaoDePreco(
    precoVendaAtual,
    concorrentesRascunho.map((item) => ({
      loja: item.fonte,
      preco: item.preco,
      // A mesma regra da coluna Estoque e da ordem da aba Concorrentes.
      indisponivel: indisponivel(estoqueDosConcorrentes[item.produtoColetadoId]),
    })),
  );

  /*
    INDICACOES SEMPRE A MOSTRA (pedido do dono em 06/10/2026): marca, modelo, EAN, medidas, NCM, preco e a
    lista de titulos vem das referencias marcadas na lupa E dos fornecedores e concorrentes SALVOS na aba
    Fornecedores / Concorrentes. Antes so vinham da lupa, e um produto salvo abria sem indicacao nenhuma.

    Os vinculos NAO entram em `marcados`: a marcacao da lupa continua comecando vazia (decisao do dono em
    22/09/2026 — pre-marcar disparava a importacao de fotos sozinha). Aqui so se LE: nada e gravado, nenhuma
    foto e trazida.
  */
  const [vinculosItens, setVinculosItens] = useState([]);
  // A assinatura dos vinculos que ja foi LIDA: enquanto difere da de agora, a janela Criar descricao espera (a leitura
  // leva segundos, e antes a janela abria sem as lojas e so a segunda abertura as trazia; pedido do dono em 10/10/2026).
  const [assinaturaLida, setAssinaturaLida] = useState(null);
  const assinaturaVinculos = JSON.stringify({
    fornecedores: (usaFornecedorRascunho ? fornecedoresRascunho : fornecedores)
      .filter((item) => item.nome?.trim())
      .map(({ nome, codigo, link }) => [nome.trim(), codigo ?? null, link ?? null]),
    concorrentes: [...idsConcorrentesAtuais].sort(),
  });
  useEffect(() => {
    // As indicacoes dos vinculos sao ferramenta de referencia: sem ela, nao se le o acervo coletado.
    if (!acessos.referencias) return;
    const { fornecedores: lista, concorrentes: ids } = JSON.parse(assinaturaVinculos);
    let valido = true;
    // Espera a digitacao parar: o nome de um fornecedor novo muda a cada tecla, e a busca le o acervo.
    const espera = setTimeout(() => {
      buscarPorPalavras(formulario.current?.elements.namedItem("tituloBase")?.value ?? "", {
        // So os vinculos, sem os achados por semelhanca.
        limite: 0,
        fornecedoresLigados: lista.map(([nome, codigo, link]) => ({ nome, codigo, link })),
        idsConcorrentesLigados: ids,
      })
        .then((resposta) => {
          if (!valido) return;
          setVinculosItens(resposta.ok ? resposta.itens : []);
          setAssinaturaLida(assinaturaVinculos);
        })
        .catch(() => {
          if (!valido) return;
          setVinculosItens([]);
          setAssinaturaLida(assinaturaVinculos);
        });
    }, 600);
    return () => {
      valido = false;
      clearTimeout(espera);
    };
  }, [assinaturaVinculos, acessos.referencias]);

  // Ha fornecedor ou concorrente salvo ainda sendo lido? (sem nenhum, nao ha o que esperar)
  const vinculadosAgora = JSON.parse(assinaturaVinculos);
  const lendoVinculos =
    acessos.referencias &&
    (vinculadosAgora.fornecedores.length > 0 || vinculadosAgora.concorrentes.length > 0) &&
    assinaturaLida !== assinaturaVinculos;

  // Vinculos e marcadas, sem repetir: a marcada vence (e a que o operador acabou de escolher na lupa).
  const referenciasDasIndicacoes = [
    ...new Map([...vinculosItens.map((item) => [item.id, item]), ...marcados]).values(),
  ];
  const idsDasIndicacoes = [...new Set([...idsDaLupa, ...vinculosItens.map((item) => item.id)])];
  const chaveDasIndicacoes = [...idsDasIndicacoes].sort().join(",");
  useEffect(() => {
    if (!acessos.referencias) return;
    const ids = chaveDasIndicacoes ? chaveDasIndicacoes.split(",") : [];
    let valido = true;
    iniciarLeituraRefs(async () => {
      const resultado = await tentar(() => camposDasReferencias(ids));
      if (valido) setValoresRefs(resultado.ok ? resultado : { erro: resultado.erro });
    });
    return () => {
      valido = false;
    };
  }, [chaveDasIndicacoes, acessos.referencias]);

  /**
   * Por padrao parte do que JA esta digitado e sobrepoe so o que veio com
   * valor: e o que a IA (titulo, descricao, medidas) precisa, porque remontar
   * a partir apenas do resultado apagaria o SKU ou o preco que o operador
   * escreveu.
   *
   * `recomecar` parte do formulario em branco (como nasceu): e o "Buscar por
   * codigo", que CLONA um produto. Somar ao que estava na tela misturava dois
   * produtos — a segunda busca herdava da primeira tudo o que a nova nao traz
   * (achado do dono em 19/09/2026).
   */
  function aplicar(campos, { recomecar = false, forcarOrigem = [] } = {}) {
    const atual =
      recomecar && valoresIniciais.current
        ? { ...valoresIniciais.current }
        : lerFormulario(formulario.current);

    // O SKU trazido passa por cima do digitado: e o codigo do produto buscado,
    // pedido do dono em 16/09/2026. Outro codigo, so pela varinha.
    const trazidos = Object.fromEntries(
      Object.entries(campos)
        .filter(
          ([, valor]) => valor !== null && valor !== undefined && valor !== "",
        )
        .map(([campo, valor]) => [
          campo,
          CAMPOS_MAIUSCULOS.includes(campo) ? maiusculas(valor) : valor,
        ]),
    );

    // `forcarOrigem`: campos que valem o que a ORIGEM tem, mesmo vazio (o `trazidos` acima ignora o vazio, e o campo
    // ficaria com o padrao do cadastro novo: a Garantia, por exemplo, ficaria com os 3 meses sugeridos).
    const daOrigem = Object.fromEntries(forcarOrigem.map((campo) => [campo, campos[campo] ?? ""]));
    const mesclado = { ...atual, ...trazidos, ...daOrigem };
    // O Nome trocado por aqui (a lista de titulos) leva a descricao junto, como a digitacao no campo: se a descricao nao veio
    // nos campos trazidos, o titulo dela e o 1o item incluso acompanham (so se ainda forem o Nome de antes).
    if (trazidos.tituloBase !== undefined && trazidos.descricaoBase === undefined && typeof mesclado.descricaoBase === "string") {
      mesclado.descricaoBase = acompanharTituloNaDescricao(mesclado.descricaoBase, atual.tituloBase, mesclado.tituloBase);
    }
    // O que outro caminho trouxe (IA, busca por codigo) ja nao e o valor da proposta: a marca sai.
    if (daProposta) setEditadosDaProposta((anteriores) => new Set([...anteriores, ...Object.keys(trazidos), ...Object.keys(daOrigem)]));
    setPreenchido(mesclado);
    // O campo Preco venda tambem remonta aqui (key={versao}), sem disparar o
    // onChange de CampoPreco: sem isto, a Diferenca em Concorrentes.jsx ficava
    // em travessao depois de "Buscar por codigo" trazer o preco, ate o
    // operador escolher um preco da lista manualmente (achado do dono em
    // 18/09/2026).
    setPrecoVendaTexto(mesclado.precoVenda ?? "");
    setVersao((anterior) => anterior + 1);
    marcarAlterado();
  }

  function preencher(resultado) {
    // Recomeca do ZERO, e tudo o que era do cadastro anterior sai junto (pedido
    // do dono em 19/09/2026, duas vezes: primeiro os campos, depois a lupa, que
    // continuava apontando para o primeiro produto clonado):
    //  - icones voltam a azul e as opcoes de titulo do Nome antigo deixam de valer;
    //  - lupa: referencias marcadas, os valores lidos delas (que acendem os
    //    icones de marca, peso, NCM...) e a busca da janela;
    //  - fornecedores e concorrentes: as linhas entram sozinhas a partir da
    //    marcacao da lupa, entao ficariam apontando para o produto velho;
    //  - documentos enviados: apagados do lote temporario junto.
    setUsados(new Set());
    setOpcoesTitulo(null);
    setErroIA(null);
    setMarcados(new Map());
    // As indicacoes da lupa saem; as dos vinculos salvos sao relidas pelo efeito, se mudarem.
    setIdsDaLupa([]);
    referencias.current?.reiniciar();
    setFornecedoresRascunho([]);
    setConcorrentesRascunho([]);
    limparTemporarios();
    aplicar(resultado.campos, {
      recomecar: true,
      // Produto do Rise: a garantia e a dele, mesmo vazia. Produto de fornecedor ou concorrente nao tem garantia
      // cadastrada: fica a sugestao do cadastro novo.
      forcarOrigem: String(resultado.id ?? "").startsWith("rise:") ? ["garantiaMeses"] : [],
    });
    // Produto do Rise preenchido por aqui vale como origem do kit, igual ao "Clonar" da lista (pedido do dono em
    // 10/10/2026). Produto de fornecedor ou concorrente nao: ele nao pode ser peca.
    setOrigemId(String(resultado.id ?? "").startsWith("rise:") ? resultado.id.slice("rise:".length) : null);

    // As fotos do produto clonado entram no painel AGORA, baixadas e padronizadas no
    // servidor, e nao so no Salvar: assim o dono ve a foto final e ja pode melhorar uma
    // delas. Vem so a REFERENCIA (`resultado.id`); os enderecos sao lidos de novo la.
    if (resultado.imagens?.length > 0) {
      const novoLote = crypto.randomUUID();
      setLoteTemporario(novoLote);
      setImportandoImagens(true);
      // Foto de produto coletado leva o id dele: se o mesmo produto for marcado na lupa depois,
      // as fotos nao entram de novo. `doClone` a protege de sair quando ele nao estiver marcado.
      const idColetado = String(resultado.id ?? "").startsWith("coletado:")
        ? resultado.id.slice("coletado:".length)
        : null;
      if (idColetado) refsComFotos.current.add(idColetado);
      tentar(() => importarImagensDaOrigem(novoLote, resultado.id)).then((resposta) => {
        if (resposta.ok) {
          setImagensLote(
            idColetado
              ? resposta.imagens.map((imagem) => ({ ...imagem, ref: idColetado, doClone: true }))
              : resposta.imagens.map((imagem) => ({ ...imagem, daOrigem: true })),
          );
          if (resposta.recusadas > 0) {
            setErroAcao(
              `${resposta.recusadas} foto(s) do produto de origem não puderam ser trazidas (ilegível ou o site não respondeu).`,
            );
          }
        } else {
          setErroAcao(resposta.erro);
        }
        setImportandoImagens(false);
      });
    }
  }

  // Cancelar PERGUNTA quando ha alteracao (pedido do dono em 14/10/2026, que trocou o "sem confirmacao" de
  // 18/09/2026): o pop-up "Sair sem salvar?" e o mesmo dos editores de anuncio (`EditorAnuncioLI`/`EditorAnuncioML`).
  // Sem alteracao sai direto, como sempre. Continuar editando, Esc e clicar fora voltam ao formulario sem perder nada.
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);

  function pedirCancelamento() {
    if (alterado) setConfirmandoSaida(true);
    else cancelar();
  }

  useEffect(() => {
    if (!confirmandoSaida) return undefined;
    function aoTeclar(evento) {
      if (evento.key === "Escape" && !evento.repeat) setConfirmandoSaida(false);
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [confirmandoSaida]);

  // So sai de verdade pelo "Sair sem salvar" (ou sem alteracao): descarta tudo e volta para a lista.
  function cancelar() {
    // Cancelar desfaz tudo: o rascunho tambem some, senao voltaria no proximo cadastro.
    rascunho.encerrar();
    // O lote do painel (as fotos copiadas, as previas) nao serve mais.
    if (loteTemporario) tentar(() => descartarLoteDeArquivos(loteTemporario));
    router.push(lerUltimaLista());
  }


  // O campo que o dono mexe deixa de ser "da proposta" (a marca some), mesmo que volte ao mesmo valor.
  function marcarEditadoDaProposta(evento) {
    const nome = evento.target?.name;
    if (!nome || !daProposta || !Object.hasOwn(camposComAProposta, nome) || editadosDaProposta.has(nome)) return;
    setEditadosDaProposta((anteriores) => new Set([...anteriores, nome]));
  }

  return (
    <PropostaNosCampos.Provider
      value={daProposta ? { valores: camposComAProposta, editados: editadosDaProposta, listas: daProposta.nasListas } : null}
    >
    <form
      ref={formulario}
      action={acao}
      onChange={(evento) => {
        marcarAlterado();
        marcarEditadoDaProposta(evento);
        if (estado?.erro) setErroDispensado(estado);
      }}
      // A cada tecla (o onChange so dispara ao sair do campo): marca como alterado ja na digitacao, senao quem digita e
      // recarrega sem sair do campo perderia tudo, e o rascunho espera a pausa na digitacao para gravar.
      onInput={(evento) => {
        marcarAlterado();
        marcarEditadoDaProposta(evento);
        rascunho.agendar();
      }}
      className="space-y-4"
    >
      {/* Lote de arquivos enviados antes de salvar (ver enviarTemporario). */}
      <input type="hidden" name="loteTemporario" value={loteTemporario} />
      <input
        type="hidden"
        name="arquivosTemporarios"
        value={JSON.stringify(temporarios)}
      />
      {/* A ordem dos documentos e do certificado (setas e arrastar na aba Documentos técnicos). */}
      <input type="hidden" name="ordemDosArquivos" value={JSON.stringify(ordemDosArquivos)} />
      {/* Fotos do painel de imagens, na ordem, a principal marcada (ver PainelDeImagens). */}
      <input
        type="hidden"
        name="imagensDoLote"
        value={JSON.stringify(
          imagensLote.map((imagem, posicao) => ({
            base: imagem.base,
            principal: posicao === 0,
            // Da foto que ja era do produto: o servidor sabe qual linha ela substitui ou mantem.
            arquivoId: imagem.arquivoId ?? null,
            // O check verde = foto VALIDADA. So as validadas sao salvas; as com `false` sao excluidas no
            // Salvar. Vai como esta, e NAO como `Boolean(...)`: foto vinda de uma tela antiga nao tem o
            // campo, e o ausente quer dizer "nao sei" (o servidor a mantem), enquanto `false` quer dizer "excluir".
            finalizada: imagem.finalizada,
            // Rotulo da versao que esta na foto (original, photoroom, nanobanana): o Salvar grava na FOTO.
            versao: imagem.versao ?? "original",
            // O grupo liga a foto as versoes dela na reserva (nulo = a propria foto, sem reserva).
            grupo: imagem.grupo ?? null,
            // Foto atual tirada ao aplicar as fotos da proposta: o Salvar a guarda na reserva em vez de apagar.
            paraReserva: imagem.paraReserva === true,
            // A candidata da proposta de onde a foto veio: o Salvar devolve a escolha e a ordem a proposta.
            candidataId: typeof imagem.candidataId === "string" ? imagem.candidataId : null,
          })),
        )}
      />
      {/* Produto existente: so com o painel carregado o servidor mexe nas fotos (ver `fotosProntas`). */}
      <input type="hidden" name="fotosDoPainelProntas" value={fotosProntas ? "1" : "0"} />
      <input type="hidden" name="arquivosPreservados" value={JSON.stringify(fotosPreservadas)} />
      {/* Imagens da reserva que o dono excluiu na tela: so o Salvar apaga (ver ReservaDeImagens). */}
      <input type="hidden" name="reservaExcluida" value={JSON.stringify(reservaExcluida)} />
      {/* Documentos ja gravados que o dono excluiu na tela: so o Salvar apaga. */}
      <input type="hidden" name="documentosExcluidos" value={JSON.stringify(documentosExcluidos)} />
      {/* Fornecedores adicionados antes de o produto existir (ver Fornecedores.jsx). */}
      {/* Sem o dado Custo a lista nem sai do servidor, e o campo nao vai: o Salvar nao mexe nos fornecedores. */}
      {acessos.custo && (
        <input
          type="hidden"
          name="fornecedoresRascunho"
          value={JSON.stringify(fornecedoresRascunho)}
        />
      )}
      {/* Pecas do kit (aba Composicao). So o id e a quantidade: o servidor le o resto do banco. No tipo
          Simples o servidor ignora a lista e apaga as pecas gravadas. */}
      <input
        type="hidden"
        name="composicao"
        value={JSON.stringify(pecas.map((peca) => ({ componenteId: peca.componenteId, quantidade: peca.quantidade })))}
      />
      {/* Pecas proprias: o liga/desliga e a lista (so o essencial; o servidor le custo e estoque do banco). Sem o dado
          Custo o campo nao vai, e o Salvar nao mexe nelas. */}
      {acessos.custo && (
        <input
          type="hidden"
          name="pecasProprias"
          value={JSON.stringify({
            ligado: pecasLigadas,
            // A linha recem-adicionada e ainda vazia nao vai: o Salvar a recusaria por falta de nome.
            pecas: pecasProprias.filter((peca) => !linhaVazia(peca)).map((peca) => ({
              componenteId: peca.componenteId ?? null,
              descricao: peca.componenteId ? null : peca.descricao,
              custoManual: peca.componenteId ? null : peca.custoManual,
              codigoManual: peca.componenteId ? null : peca.codigoManual,
              fornecedorManual: peca.componenteId ? null : peca.fornecedorManual,
              fotoManual: peca.componenteId ? null : peca.fotoManual,
              quantidade: peca.quantidade,
            })),
          })}
        />
      )}
      {/* Concorrentes adicionados antes de o produto existir (ver Concorrentes.jsx). */}
      {acessos.concorrentes && (
        <input
          type="hidden"
          name="concorrentesRascunho"
          value={JSON.stringify(concorrentesRascunho)}
        />
      )}
      {/* Gasto com IA desta edicao (descricao e titulo): o Salvar soma ao total do produto (pedido do dono em 12/10/2026). */}
      <input type="hidden" name="gastoIA" value={gastoDaEdicao ? JSON.stringify(gastoDaEdicao) : ""} />
      <input type="hidden" name="propostaAplicada" value={JSON.stringify(propostaAplicada)} />
      {/* Os campos que a proposta preencheu ao abrir: o Salvar compara com o gravado e sabe o que o dono mudou. */}
      <input type="hidden" name="propostaPreenchidos" value={JSON.stringify(Object.keys(daProposta?.preencher ?? {}))} />

      {/* ---------- Acoes no topo ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        {/* So leitura (pedido do dono em 20/10/2026): sem Salvar, e o Cancelar vira Voltar. */}
        {!somenteLeitura && (
          <button
            type="submit"
            disabled={enviando || carregandoFotosDoProduto}
            className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {enviando && <Loader size={14} className="animate-spin" />}
            Salvar
          </button>
        )}
        <button
          type="button"
          onClick={pedirCancelamento}
          className="rounded border border-borda px-4 py-2 text-sm hover:bg-fundo"
        >
          {somenteLeitura ? "Voltar" : "Cancelar"}
        </button>
        {/* Produto ainda em proposta (pedido do dono em 22/10/2026): o selo e o Relatorio ao lado do Cancelar. */}
        {acessos.editar && produto?.proposta && <PropostaNoTopo proposta={produto.proposta} />}

        {estado?.ok && (
          <span className="text-sm text-emerald-700">Produto salvo.</span>
        )}
        {estado?.erro && estado !== erroDispensado && (
          <span className="text-sm text-red-700">{estado.erro}</span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {/* A garantia de que nada se perde ao recarregar: discreta, so depois da primeira gravacao. */}
          {!somenteLeitura && rascunho.salvoEm && (
            <span
              className="text-[11px] text-suave tabular-nums"
              title="Suas alterações ficam guardadas neste navegador até você salvar ou cancelar o cadastro."
            >
              Rascunho salvo às {new Date(rascunho.salvoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {/* Quanto este produto ja custou de IA e quanto esta edicao vai somar (pedido do dono em 12/10/2026). */}
          {!somenteLeitura && <GastoDoProduto salvo={gastoSalvo} edicao={gastoDaEdicao} />}
          {novo && acessos.referencias && (
            <BuscarPorCodigo
              codigoAtual={() =>
                formulario.current?.elements.namedItem("sku")?.value
              }
              aoEscolher={preencher}
            />
          )}
        </div>
      </div>

      {/* "Sair sem salvar?" (pedido do dono em 14/10/2026): o mesmo pop-up dos editores de anuncio. O foco cai em
          "Continuar editando", o botao seguro; "Sair sem salvar" e o vermelho. */}
      {confirmandoSaida && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
          {...propsDoFundo(() => setConfirmandoSaida(false))}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="produto-sair-titulo"
            className="w-full max-w-sm rounded-lg border border-borda bg-superficie p-4 shadow-2xl"
          >
            <p id="produto-sair-titulo" className="text-sm font-semibold">
              Sair sem salvar?
            </p>
            <p className="mt-1 text-sm text-suave">As alterações deste cadastro ainda não foram salvas e serão perdidas.</p>
            <div className="mt-4 flex justify-end gap-2">
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
                onClick={cancelar}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Sair sem salvar
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Ha alteracoes nao salvas guardadas neste navegador (pedido do dono em 13/10/2026): recuperar ou descartar. */}
      {!somenteLeitura && rascunho.guardado && (
        <BannerDeRascunho
          rascunho={rascunho.guardado}
          aguardando={carregandoFotosDoProduto || importandoImagens}
          aoRecuperar={recuperarRascunho}
          aoDescartar={rascunho.descartar}
        />
      )}


      {erroAcao && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-800">{erroAcao}</p>
      )}

      {/* O "!" do kit (pedido do dono em 10/10/2026): o que mudou nas pecas desde o ultimo Salvar do kit. Salvar o
          kit grava o retrato de hoje e apaga o aviso. */}
      {produto?.mudancasDasPecas?.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
              !
            </span>
            {produto.mudancasDasPecas.length === 1
              ? "Uma peça do kit mudou desde o último Salvar"
              : `${produto.mudancasDasPecas.length} peças do kit mudaram desde o último Salvar`}
          </p>
          <ul className="mt-1.5 space-y-1 pl-6">
            {produto.mudancasDasPecas.map((peca) => (
              <li key={peca.componenteId}>
                <a href={`/produtos/${peca.componenteId}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  <span className="font-mono text-xs">{peca.sku}</span> {peca.tituloBase}
                </a>
                : {peca.mudancas.map((mudanca) => mudanca.texto).join("; ")}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 pl-6 text-[12px]">
            Confira o kit (preço, descrição, fotos, documentos) e salve para marcar como revisado.
          </p>
        </div>
      )}

      <Fragment key={`geral-${versao}`}>
        {/* ---------- Visao geral ---------- */}
        <Card>
          {/* So leitura: o `fieldset` desabilita todos os campos de uma vez (pedido do dono em 20/10/2026). */}
          <fieldset disabled={somenteLeitura} className="m-0 grid min-w-0 gap-5 border-0 p-0 lg:grid-cols-[18rem_1fr]">
            <div className="lg:col-span-2">
              <CampoNome
                inicial={v("tituloBase")}
                erro={erros.tituloBase}
                aoBuscar={(palavras) => referencias.current?.buscar(palavras)}
                ia={ia}
                aoCriarIA={criarComIA}
                aoEscolherTitulo={escolherTitulo}
                aoAlterarNome={acompanharNomeNaDescricao}
                referencias={referenciasDasIndicacoes}
                usos={usos}
                comLupa={acessos.referencias}
                comTitulos={acessos.editar && (acessos.referencias || Boolean(ia.propostaTitulos))}
              />
            </div>

            {/*
              A COLUNA DE IMAGEM NAO DITA A ALTURA DO BLOCO (pedido do dono em
              16/09/2026): o bloco termina onde terminam os campos ao lado. O
              conteudo fica em "absolute inset-0", entao a linha do grid tem a altura
              dos campos e a foto grande encolhe para caber com as miniaturas. Em
              tela estreita, sem os campos ao lado, a altura e fixa.
            */}
            <div className="relative h-80 lg:h-auto">
              <div className="absolute inset-0">
                {/* O mesmo painel no produto novo e na edicao. */}
                <PainelDeImagens
                  lote={loteTemporario}
                  garantirLote={garantirLote}
                  imagens={imagensLote}
                  setImagens={setImagensLote}
                  importando={importandoImagens || carregandoFotosDoProduto}
                  progressoDaImportacao={
                    carregandoFotosDoProduto ? "Carregando as fotos do produto..." : progressoDaImportacao
                  }
                  aoAlterar={() => marcarAlterado()}
                  reserva={reserva}
                  reservaExcluida={reservaExcluida}
                  setReservaExcluida={setReservaExcluida}
                  proposta={produto?.proposta ?? null}
                  produtoId={produto?.id ?? null}
                  aoAplicarFotosDaProposta={() => setPropostaAplicada((atual) => [...new Set([...atual, "fotos"])])}
                />
              </div>
            </div>

            <div className="grid content-start gap-4 sm:grid-cols-2">
              <CampoSku
                inicial={v("sku")}
                erro={erros.sku}
                aoAlterar={() => marcarAlterado()}
                usos={usos}
                comVarinha={acessos.editar}
              />
              <Campo
                nome="localizacao"
                rotulo="Localização"
                // Travada, mostra a da peca desde a abertura (um kit gravado antes da regra pode estar sem ela; o
                // Salvar grava a da peca).
                defaultValue={localizacaoTravada ? (localizacaoDoKit(pecas).valor ?? "") : v("localizacao")}
                ajuda={
                  localizacaoTravada
                    ? "Kit: a localização vem das peças e muda junto com elas. Acima de 40 caracteres, vira “Verificar a aba composição”."
                    : "Ex.: R14"
                }
                readOnly={localizacaoTravada}
                aria-readonly={localizacaoTravada}
                className={`${CLASSE_CAMPO} border-borda focus:border-acento ${localizacaoTravada ? "bg-fundo text-suave" : ""}`}
              />

              <CampoPreco
                inicial={v("precoVenda")}
                erro={erros.precoVenda}
                referencias={referenciasDasIndicacoes}
                custo={custoPadrao}
                precoAtual={precoVendaAtual}
                posicao={posicaoDoPreco}
                aoAlterar={() => marcarAlterado()}
                aoMudarValor={setPrecoVendaTexto}
                usos={usos}
                margemModo={acessos.margem}
                comReferencias={acessos.referencias}
              />
              {/* Unidade em cima e Tipo embaixo (pedido do dono em 10/10/2026, que desfez a troca de 07/10). A Unidade
                  segue o Tipo (KIT ou UN) e continua aberta para escolher. */}
              <Campo nome="unidade" rotulo="Unidade">
                <select
                  id="unidade"
                  name="unidade"
                  defaultValue={inicial?.unidade || "UN"}
                  className={`${CLASSE_CAMPO} border-borda focus:border-acento`}
                >
                  {UNIDADES.map((unidade) => (
                    <option key={unidade} value={unidade}>
                      {unidade}
                    </option>
                  ))}
                </select>
              </Campo>

              <Interruptor nome="ativo" inicial={inicial?.ativo ?? true} />
              {/* Tipo SO em produto novo ou clonado (pedido do dono em 10/10/2026): sem o campo no envio, o servidor
                  mantem o tipo gravado (`prepararComposicaoDoCadastro`), e um produto salvo nao vira kit nem volta a
                  simples pela tela. O caminho para um kit novo e o Clonar. */}
              {novo && (
                <div>
                  <Campo nome="tipo" rotulo="Tipo">
                    {/* `defaultValue` + `key`, e nao `value`: o reset do React depois de um Salvar recusado volta a
                        lista ao valor PADRAO dela, e uma lista controlada nao tem padrao (voltava para Simples). A
                        chave remonta a lista a cada troca, e tambem quando o "Manter com composicao" desfaz a escolha. */}
                    <select
                      key={`tipo-${tipo}-${confirmarSimples}`}
                      id="tipo"
                      name="tipo"
                      defaultValue={tipo}
                      onChange={(evento) => mudarTipo(evento.target.value)}
                      className={`${CLASSE_CAMPO} border-borda focus:border-acento`}
                    >
                      <option value="SIMPLES">Simples</option>
                      <option value="COMPOSICAO">Com composição</option>
                    </select>
                  </Campo>
                  {confirmarSimples && (
                    <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2.5 text-[13px] text-amber-900">
                      <p>
                        {pecas.length === 1 ? "A peça do kit será removida" : `As ${pecas.length} peças do kit serão removidas`} ao
                        salvar.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={voltarASimples}
                          className="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          Trocar para Simples
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmarSimples(false)}
                          className="rounded border border-amber-300 px-2.5 py-1 text-xs hover:bg-amber-100"
                        >
                          Manter com composição
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {/* O link da Loja Integrada fica sempre na primeira coluna, com ou sem o Tipo ao lado da Situacao. */}
              <div className="sm:col-start-1">
              <LinkLojaIntegrada
                inicial={v("urlLojaIntegrada")}
                dominio={dominioLojaIntegrada}
                erro={erros.urlLojaIntegrada}
              />
              </div>
            </div>
          </fieldset>
        </Card>
      </Fragment>

      {/*
        Fora dos trechos remontados: preencher o Nome com o titulo da IA troca a
        `versao`, e a busca e a marcacao nao podem sumir junto.
      */}
      {acessos.referencias && (
      <ReferenciasDeMercado
        ref={referencias}
        marcados={marcados}
        aoAlternar={alternarReferencia}
        aoMarcarLigados={marcarReferenciasLigadas}
        aoLimpar={() => setMarcados(new Map())}
        aoFechar={lerValoresRefs}
        fornecedoresLigados={usaFornecedorRascunho ? fornecedoresRascunho : fornecedores}
        idsConcorrentesLigados={idsConcorrentesAtuais}
      />
      )}

      {/* Fora dos trechos remontados, pelo mesmo motivo da janela da lupa. */}
      {acessos.ia && (
      <JanelaDescricao
        ref={janelaDescricao}
        aoGastar={somarAoGastoDaEdicao}
        // So o que esta cadastrado na aba Fornecedores / Concorrentes (salvo ou nao) e o marcado na lupa
        // (pedido do dono em 07/10/2026): a janela nao procura mais pelo Nome no catalogo das lojas.
        ids={[...new Set([...idsMarcados, ...vinculosItens.map((item) => item.id)])]}
        lendoReferencias={lendoVinculos}
        descricaoAtual={produto?.descricaoBase ?? clone?.campos.descricaoBase ?? null}
        // Kit: as pecas viram referencias da descricao (pedido do dono em 10/10/2026).
        pecas={tipo === "COMPOSICAO" ? pecas.map((peca) => ({ id: peca.componenteId, quantidade: peca.quantidade })) : []}
        lerProduto={() => ({
          titulo: valorDoCampo("tituloBase"),
          sku: valorDoCampo("sku"),
          // Sem fornecedor nem concorrente, a IA escreve a partir destes (pedido do dono em 10/10/2026).
          marca: valorDoCampo("marca"),
          modelo: valorDoCampo("modelo"),
          descricao: valorDoCampo("descricaoBase"),
          // Peso e medidas ja preenchidos vao para a descricao como estao: o texto
          // nao pode dizer uma medida e o campo outra.
          medidas: Object.fromEntries(
            CAMPOS_DE_MEDIDA.map((campo) => [
              campo,
              Number(valorDoCampo(campo)) || null,
            ]),
          ),
        })}
        aoUsar={(texto, { camposEscolhidos = {} } = {}) => {
          const { campos } = medidasParaCamposVazios(texto);
          aplicar({ descricaoBase: texto, ...campos, ...camposEscolhidos });
          setAba("descricao");
        }}
      />
      )}

      <Fragment key={`abas-${versao}`}>
        {/* ---------- Abas ---------- */}
        <Card className="p-0">
          <div className="flex overflow-x-auto border-b border-borda">
            {ABAS.filter((item) => item.id !== "composicao" || tipo === "COMPOSICAO").map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.id === "documentos") setAberturaDocumentos((atual) => atual + 1);
                  setAba(item.id);
                }}
                className={`shrink-0 border-b-2 px-4 py-3 text-sm whitespace-nowrap ${
                  aba === item.id
                    ? "border-acento font-medium text-texto"
                    : "border-transparent text-suave hover:text-texto"
                }`}
              >
                {item.rotulo}
              </button>
            ))}
          </div>

          {/* Todas as abas ficam montadas e apenas escondidas: campo desmontado
              nao entra no FormData, e salvar de uma aba invalidaria as outras. */}
          <fieldset disabled={somenteLeitura} className="m-0 min-w-0 border-0 p-5">
            <div className={aba === "caracteristicas" ? "space-y-5" : "hidden"}>
              <div className="grid gap-4 sm:grid-cols-2">
                <CampoDeReferencias
                  nome="marca"
                  rotulo="Marca"
                  inicial={v("marca")}
                  ids={idsDasIndicacoes}
                  valores={valoresRefs?.marca}
                  carregando={lendoRefs}
                  aoAlterar={() => marcarAlterado()}
                  usos={usos}
                  vazio="Nenhuma referência (lupa ou vínculos salvos) publica a marca (a loja que põe o próprio nome como marca fica de fora)."
                />
                <CampoDeReferencias
                  nome="modelo"
                  rotulo="Modelo"
                  inicial={v("modelo")}
                  ids={idsDasIndicacoes}
                  valores={valoresRefs?.modelo}
                  carregando={lendoRefs}
                  aoAlterar={() => marcarAlterado()}
                  usos={usos}
                  vazio="Nenhuma referência (lupa ou vínculos salvos) publica o modelo."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Campo
                  nome="garantiaMeses"
                  rotulo="Garantia (meses)"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={garantiaInicial}
                />
              </div>

              <Campo
                nome="videoUrl"
                rotulo="Vídeo (link do YouTube)"
                defaultValue={v("videoUrl")}
                placeholder="https://www.youtube.com/watch?v=..."
              />

              <div className="grid gap-4 border-t border-borda pt-5 sm:grid-cols-2">
                <CampoDeReferencias
                  nome="numeroHomologacao"
                  rotulo="Número de homologação"
                  inicial={v("numeroHomologacao")}
                  ajuda="Anatel/INMETRO. O Mercado Livre pede o número em várias categorias."
                  ids={idsDasIndicacoes}
                  valores={valoresRefs?.homologacao}
                  carregando={lendoRefs}
                  aoAlterar={() => marcarAlterado()}
                  usos={usos}
                  vazio="Nenhuma referência (lupa ou vínculos salvos) publica o número de homologação. Poucas lojas publicam: a maioria escreve só 'certificado pela Anatel'."
                />
                <div
                  onBlur={() => {
                    conferirEan();
                    atualizarEanPreenchido();
                  }}
                  onInput={() => {
                    atualizarEanPreenchido();
                    setFalhaEan(null);
                  }}
                >
                  <CampoDeReferencias
                    nome="ean"
                    rotulo="GTIN / EAN"
                    inicial={v("ean")}
                    erro={erros.ean}
                    ajuda="Código de barras do produto. Sem código do fabricante, 'Gerar EAN interno' cria um EAN-13 da faixa interna (prefixo 2) a partir do código do produto; o Mercado Livre não o aceita como GTIN."
                    ids={idsDasIndicacoes}
                    valores={valoresRefs?.ean}
                    carregando={lendoRefs}
                    aoAlterar={() => {
                      marcarAlterado();
                      setEanPreenchido(true);
                      conferirEan();
                    }}
                    usos={usos}
                    vazio="Nenhuma referência publica um código de barras válido."
                  />
                  <div className="flex items-start justify-between gap-2">
                    <LinksDeConsulta campo="ean" sites={SITES_DO_EAN} lerCampo={valorDoCampo} />
                    {acessos.editar && !eanPreenchido && <BotaoGerarEan aoGerar={gerarEan} usado={usos.tem("ean")} />}
                  </div>
                  {falhaEan && (
                    <p role="alert" className="mt-1 text-[12px] text-red-700">
                      {falhaEan}
                    </p>
                  )}
                  {avisoEan && (
                    <p role="status" className="mt-1.5 flex items-start gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span>
                        {avisoEan.texto}
                        {avisoEan.itens?.map((item) => (
                          <a
                            key={item.id}
                            href={`https://www.mercadolivre.com.br/p/${item.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-1 font-medium underline"
                          >
                            {item.nome}
                          </a>
                        ))}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/*
              Aba propria para os envios de arquivo (pedido do dono em 18/09/2026),
              tirados de Caracteristicas. Continua montada e so escondida, como as
              outras: o envio de arquivo nao passa pelo FormData, mas a lista de
              temporarios do cadastro novo vive no formulario.

              UM campo so para manual, datasheet e ficha tecnica — decidido com o
              dono em 16/09/2026; o certificado de homologacao continua separado:
              anda com o numero, e o Mercado Livre pede em algumas categorias.
            */}
            <div className={aba === "composicao" && tipo === "COMPOSICAO" ? "" : "hidden"}>
              <Composicao
                pecas={pecas}
                setPecas={setPecas}
                produtoId={produto?.id ?? null}
                aoAlterar={() => marcarAlterado()}
                aviso={avisoComposicao}
              />
            </div>

            <div className={aba === "documentos" ? "grid gap-5 sm:grid-cols-2" : "hidden"}>
              {/* Produto novo ou existente: tudo so vale no Salvar (pedido do dono em 10/10/2026). O envio espera as
                  fotos do produto carregarem: elas criam o lote, e um segundo lote ficaria orfao. */}
              <DocumentosDoProduto
                tipo="DOCUMENTO"
                rotulo="Documentos técnicos"
                ajuda="Manual, datasheet, ficha técnica. PDF, JPG ou PNG, até 20 MB cada."
                salvos={arquivos.DOCUMENTO ?? []}
                excluidos={documentosExcluidos}
                aoAlternarExclusao={alternarExclusaoDeDocumento}
                lista={temporarios.filter((item) => item.tipo === "DOCUMENTO")}
                aoEnviar={enviarTemporario}
                aoRemover={removerTemporario}
                desabilitado={carregandoFotosDoProduto}
                ordem={ordemDosArquivos.DOCUMENTO ?? []}
                aoReordenar={(chaves) => reordenarArquivos("DOCUMENTO", chaves)}
              />
              <DocumentosDoProduto
                tipo="CERTIFICADO"
                rotulo="Certificado de homologação"
                salvos={arquivos.CERTIFICADO ?? []}
                excluidos={documentosExcluidos}
                aoAlternarExclusao={alternarExclusaoDeDocumento}
                lista={temporarios.filter((item) => item.tipo === "CERTIFICADO")}
                aoEnviar={enviarTemporario}
                aoRemover={removerTemporario}
                desabilitado={carregandoFotosDoProduto}
                ordem={ordemDosArquivos.CERTIFICADO ?? []}
                aoReordenar={(chaves) => reordenarArquivos("CERTIFICADO", chaves)}
              />
              {/* Kit: os documentos e certificados das pecas, com "Anexar a este produto" (pedido do dono em 10/10/2026). */}
              {ehKit && (
                <DocumentosDasPecas
                  pecas={pecas}
                  ativo={aba === "documentos"}
                  nomesNoProduto={nomesDosDocumentos}
                  aoAnexar={anexarDocumento}
                  desabilitado={carregandoFotosDoProduto}
                />
              )}
              {acessos.editar && produto?.proposta && <DocumentosDaProposta proposta={produto.proposta} />}
              {acessos.referencias && (
                <DocumentosDasReferencias
                  key={aberturaDocumentos}
                  ids={idsMarcados}
                  ativo={aba === "documentos"}
                  produtoId={produto?.id ?? null}
                />
              )}
            </div>

            <div className={aba === "descricao" ? "" : "hidden"}>
              {acessos.ia && (
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative inline-flex shrink-0">
                  <button
                    type="button"
                    onClick={() => janelaDescricao.current?.abrir()}
                    className="inline-flex items-center gap-1.5 rounded border border-acento bg-superficie px-3 py-2 text-sm font-medium text-acento hover:bg-fundo"
                  >
                    <Sparkles size={15} />
                    Criar descrição
                  </button>
                  <BolhaDeAjuda
                    texto={
                      "Busca descrições dos produtos correspondentes nos fornecedores e concorrentes cadastrados e cria o texto com IA."
                    }
                  />
                </div>
              </div>
              )}
              {acessos.editar && produto?.proposta?.secoes?.descricao && (
                <div className="mb-1 flex items-center gap-1">
                  <MarcaDaProposta nome="descricaoBase" />
                  <OlhoDaProposta proposta={produto.proposta} secao="descricao" />
                  {/* A descricao de antes da proposta (etiqueta "Original"), para voltar a ela com um clique. */}
                  <IconeDaProposta nome="descricaoBase" />
                </div>
              )}
              <EditorDescricao
                nome="descricaoBase"
                valorInicial={v("descricaoBase")}
                aoSair={lerMedidasDaDescricaoEditada}
              />
            </div>

            <div className={aba === "dimensoes" ? "" : "hidden"}>
              <div className="grid gap-4 sm:grid-cols-4">
                <CampoDeReferencias
                  nome="pesoKg"
                  rotulo="Peso (kg)"
                  type="number"
                  step="0.001"
                  min="0"
                  inicial={v("pesoKg")}
                  ids={idsDasIndicacoes}
                  valores={valoresRefs?.peso}
                  carregando={lendoRefs}
                  aoAlterar={() => marcarAlterado()}
                  usos={usos}
                  unidade="kg"
                  vazio="Nenhuma referência (lupa ou vínculos salvos) publica o peso na ficha técnica."
                />
                <CampoDeReferencias
                  nome="comprimentoCm"
                  rotulo="Comprimento (cm)"
                  type="number"
                  step="0.01"
                  min="0"
                  inicial={v("comprimentoCm")}
                  ids={idsDasIndicacoes}
                  valores={valoresRefs?.comprimento}
                  carregando={lendoRefs}
                  aoAlterar={() => marcarAlterado()}
                  usos={usos}
                  unidade="cm"
                  vazio="Nenhuma referência (lupa ou vínculos salvos) publica o comprimento na ficha técnica."
                />
                <CampoDeReferencias
                  nome="larguraCm"
                  rotulo="Largura (cm)"
                  type="number"
                  step="0.01"
                  min="0"
                  inicial={v("larguraCm")}
                  ids={idsDasIndicacoes}
                  valores={valoresRefs?.largura}
                  carregando={lendoRefs}
                  aoAlterar={() => marcarAlterado()}
                  usos={usos}
                  unidade="cm"
                  vazio="Nenhuma referência (lupa ou vínculos salvos) publica a largura na ficha técnica."
                />
                <CampoDeReferencias
                  nome="alturaCm"
                  rotulo="Altura (cm)"
                  type="number"
                  step="0.01"
                  min="0"
                  inicial={v("alturaCm")}
                  ids={idsDasIndicacoes}
                  valores={valoresRefs?.altura}
                  carregando={lendoRefs}
                  aoAlterar={() => marcarAlterado()}
                  usos={usos}
                  unidade="cm"
                  vazio="Nenhuma referência (lupa ou vínculos salvos) publica a altura na ficha técnica."
                />
              </div>
              {ehKit && (
                <MedidasDoKit pecas={pecas} />
              )}
            </div>

            <div className={aba === "tributacao" ? "space-y-4" : "hidden"}>
              <p className="rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                <strong>Dados da nota fiscal.</strong> Quem emite a nota é o
                Bling — aqui ficam só os campos que identificam o produto e
                viajam com ele. Os valores calculados de imposto continuam no
                Bling, que tem as regras tributárias.
              </p>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <Selecao
                    nome="origem"
                    rotulo="Origem"
                    opcoes={ORIGENS}
                    inicial={inicial?.origem}
                    ajuda="Origem fiscal da mercadoria (nacional, importada etc.), usada no cálculo do ICMS."
                  />
                </div>
                <div className="sm:col-span-3">
                  <Selecao
                    nome="tipoProducao"
                    rotulo="Tipo de produção"
                    opcoes={TIPOS_PRODUCAO}
                    inicial={inicial?.tipoProducao ?? "REVENDA"}
                    semVazio
                    ajuda="Usado pela nota fiscal da Loja Integrada: revenda ou fabricação própria (muda o CFOP)."
                  />
                </div>
                <div>
                  <CampoDeReferencias
                    nome="ncm"
                    rotulo="NCM"
                    inicial={v("ncm")}
                    placeholder="0000.00.00"
                    ajuda="Obrigatório para emitir nota."
                    ids={ncmDasPecas.length > 0 ? [...idsDasIndicacoes, "pecas-do-kit"] : idsDasIndicacoes}
                    valores={
                      ncmDasPecas.length > 0
                        ? [...ncmDasPecas, ...(Array.isArray(valoresRefs?.ncm) ? valoresRefs.ncm : [])]
                        : valoresRefs?.ncm
                    }
                    carregando={lendoRefs && ncmDasPecas.length === 0}
                    aoAlterar={() => marcarAlterado()}
                    usos={usos}
                    vazio="Nenhuma referência (lupa ou vínculos salvos) publica o NCM. Fortek, Casa da Robótica e Smartkits costumam publicar; Eletrogate, Saravati e Usinainfo não."
                  />
                  <LinksDeConsulta campo="ncm" sites={SITES_DO_NCM} lerCampo={valorDoCampo} />
                </div>
                <Campo
                  nome="cest"
                  rotulo="CEST"
                  defaultValue={v("cest")}
                  placeholder="00.000.00"
                  ajuda="Só para produtos sujeitos a substituição tributária."
                />
                <Campo
                  nome="percentualTributos"
                  rotulo="% Tributos"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={v("percentualTributos")}
                  ajuda="Lei da Transparência."
                />
                <div className="sm:col-span-3">
                  <Selecao
                    nome="spedTipoItem"
                    rotulo="Tipo do item"
                    opcoes={TIPOS_ITEM}
                    inicial={inicial?.spedTipoItem}
                    ajuda="Usado na geração do SPED PIS/COFINS."
                  />
                </div>
              </div>
            </div>

            {/* Categorias e SEO da Loja Integrada: do produto (25/10/2026). Montadas e so escondidas como as outras abas, para o
                Salvar levar os campos; a arvore da loja so e lida na primeira vez que a aba abre. */}
            <div className={aba === "categorias" ? "" : "hidden"}>
              <CategoriasDaLoja
                inicial={v("categoriasLI")}
                lerCampo={valorDoCampo}
                aoAlterar={() => {
                  marcarAlterado();
                  marcarEditadoDaProposta({ target: { name: "categoriasLI" } });
                }}
                ativo={aba === "categorias"}
                acessos={{ ia: acessos.ia }}
                propostaSugerida={daProposta?.nasListas?.categoriasLI ? { ids: daProposta.nasListas.categoriasLI.valor, texto: daProposta.nasListas.categoriasLI.origem } : null}
                marcaDaProposta={<MarcaDaProposta nome="categoriasLI" />}
              />
            </div>

            <div className={aba === "seo" ? "" : "hidden"}>
              <SeoDaLoja
                produtoId={produto?.id ?? null}
                inicialTitulo={v("seoTituloLI")}
                inicialDescricao={v("seoDescricaoLI")}
                lerCampo={valorDoCampo}
                aoAlterar={() => marcarAlterado()}
                ativo={aba === "seo"}
                acessos={{ concorrentes: acessos.concorrentes, ia: acessos.ia }}
                iconeDaProposta={<IconeDaProposta nome="seoDescricaoLI" />}
                marcaDaProposta={<MarcaDaProposta nome="seoDescricaoLI" />}
              />
            </div>

            <div className={aba === "fornecedores" ? "space-y-5" : "hidden"}>
              <div className="grid items-end gap-4 sm:grid-cols-5">
                {!ehKit && acessos.custo && (
                  <InterruptorPecasProprias
                    ligado={pecasLigadas}
                    aoTrocar={() => {
                      if (!pecasLigadas) {
                        setPecasLigadas(true);
                        marcarAlterado();
                      } else if (pecasProprias.length > 0) {
                        setConfirmarDesligar(true);
                      } else {
                        setPecasLigadas(false);
                        marcarAlterado();
                      }
                    }}
                  />
                )}
                <Campo
                  nome="estoqueMinimo"
                  rotulo="Estoque mínimo"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={v("estoqueMinimo")}
                  ajuda="Quanto você quer ter em estoque, no mínimo."
                />
                <Campo
                  nome="estoqueMaximo"
                  rotulo="Estoque máximo"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={v("estoqueMaximo")}
                />
              </div>

              {/* Kit: a tabela de fornecedores e a das PECAS, so leitura (pedido do dono em 07/10/2026; sem
                  "Padrão" nem "Adicionar fornecedor"). A tabela editavel fica montada e escondida: os
                  vinculos que o kit ja tinha continuam indo no envio, e nada some no Salvar. */}
              {pecasLigadas && !ehKit && acessos.custo && (
                <PecasProprias
                  pecas={pecasProprias}
                  setPecas={setPecasProprias}
                  produtoId={produto?.id ?? null}
                  aoAlterar={() => marcarAlterado()}
                  rodape={
                    acessos.produzir && produto?.id ? (
                      <JanelaProduzir
                        produtoId={produto.id}
                        nome={produto.tituloBase}
                        motivo={
                          pecasProprias.filter((peca) => !linhaVazia(peca)).length === 0
                            ? "Adicione os itens antes de produzir."
                            : JSON.stringify({ ligado: pecasLigadas, pecas: pecasProprias }) !== pecasGravadas
                              ? "Salve o produto antes de produzir: a ordem usa os itens gravados."
                              : null
                        }
                      />
                    ) : null
                  }
                />
              )}
              {confirmarDesligar && (
                <JanelaDesligarPecas
                  pecas={pecasProprias}
                  aoCancelar={() => setConfirmarDesligar(false)}
                  aoConfirmar={() => {
                    setPecasProprias([]);
                    setPecasLigadas(false);
                    setConfirmarDesligar(false);
                    marcarAlterado();
                  }}
                />
              )}
              {ehKit && acessos.custo && <FornecedoresDoKit pecas={pecas} ativo={aba === "fornecedores"} />}
              {/* Pecas proprias ligadas: fornecedores e concorrentes ficam montados e escondidos (os dados nao se
                  perdem; desligar os mostra de volta). */}
              {acessos.custo && (
              <div className={ehKit || (pecasLigadas && !ehKit) ? "hidden" : ""}>
                <Fornecedores
                  ref={fornecedoresRef}
                  podeCadastrar={acessos.cadastrarFornecedor}
                  produtoId={produto?.id ?? null}
                  ativo={aba === "fornecedores" && !ehKit}
                  vinculos={usaFornecedorRascunho ? fornecedoresRascunho : fornecedores}
                  catalogo={catalogoFornecedores}
                  aoFalhar={setErroAcao}
                  modoRascunho={usaFornecedorRascunho}
                  aoMudarRascunho={mudarFornecedoresRascunho}
                  sugestoes={sugestoesFornecedor}
                />
              </div>
              )}

              {acessos.concorrentes && (
              <div className={pecasLigadas && !ehKit ? "hidden" : ""}>
              <Concorrentes
                ref={concorrentesRef}
                podeCadastrar={acessos.cadastrarConcorrente}
                produtoId={produto?.id ?? null}
                ativo={aba === "fornecedores"}
                vinculos={concorrentesRascunho}
                aoFalhar={setErroAcao}
                modoRascunho
                aoMudarRascunho={mudarConcorrentesRascunho}
                sugestoes={sugestoesConcorrente}
                precoProduto={precoVendaAtual}
                seloDoTitulo={<SeloPosicaoDePreco posicao={posicaoDoPreco} />}
              />
              </div>
              )}
            </div>
          </fieldset>
        </Card>
      </Fragment>

    </form>
    </PropostaNosCampos.Provider>
  );
}
