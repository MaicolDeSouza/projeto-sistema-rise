"use client";

import {
  Fragment,
  useActionState,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  BadgeDollarSign,
  Calculator,
  Download,
  ExternalLink,
  FileText,
  Hammer,
  ListChecks,
  Loader,
  Search,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import { UNIDADES } from "@/lib/unidades";
import { ORIGENS, TIPOS_ITEM } from "@/lib/fiscal";
import { LIMITE_TITULO_ML, MAXIMO_FOTOS_NO_PAINEL, MAXIMO_IMAGENS } from "@/lib/limites";
import { medidasDaDescricao } from "@/lib/medidas";
import BuscarPorCodigo from "./BuscarPorCodigo";
import Concorrentes from "./Concorrentes";
import EditorDescricao from "./EditorDescricao";
import Fornecedores from "./Fornecedores";
import JanelaDescricao from "./JanelaDescricao";
import PainelDeImagens from "./PainelDeImagens";
import ReferenciasDeMercado, { MAXIMO_MARCADOS } from "./ReferenciasDeMercado";
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
  criarTitulosIA,
  enviarArquivo,
  enviarArquivoTemporario,
  gerarSku,
  documentosDasReferencias,
  removerArquivo,
  removerArquivoTemporario,
  salvarProduto,
} from "@/app/produtos/acoes";

const ABAS = [
  { id: "caracteristicas", rotulo: "Caracteristicas" },
  { id: "descricao", rotulo: "Descricao" },
  { id: "fornecedores", rotulo: "Fornecedores / Concorrentes" },
  { id: "documentos", rotulo: "Documentos tecnicos" },
  { id: "dimensoes", rotulo: "Peso e dimensoes" },
  { id: "tributacao", rotulo: "Tributacao" },
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
          ? "Falha ao enviar o arquivo. Ele pode ser grande demais para a conexao."
          : (erro?.message ?? "Falha inesperada ao executar a acao."),
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

function Campo({ nome, rotulo, erro, ajuda, children, ...props }) {
  return (
    <div>
      <label htmlFor={nome} className="flex items-center gap-1 text-sm font-semibold">
        {rotulo}
        {ajuda && <BolhaDeAjuda texto={ajuda} variante="inline" />}
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
    </div>
  );
}

function Selecao({ nome, rotulo, opcoes, inicial, ajuda }) {
  return (
    <Campo nome={nome} rotulo={rotulo} ajuda={ajuda}>
      <select
        id={nome}
        name={nome}
        defaultValue={inicial ?? ""}
        className={`${CLASSE_CAMPO} border-borda focus:border-acento`}
      >
        <option value="">Selecione</option>
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
      <span className="block text-sm font-semibold">Situacao</span>
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
  if (quantas === 0) return null;

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
        title={`Escolher o titulo: das ${quantas} referencia(s) (lupa e vinculos salvos), ou gerado com IA`}
        aria-label="Escolher o titulo"
        aria-expanded={aberta}
        className={`rounded border p-2.5 hover:bg-fundo ${usado ? BORDA_DE_USO.usado : BORDA_DE_USO.funcao}`}
      >
        {emCurso ? <Loader size={18} className="animate-spin" /> : <ListChecks size={18} />}
      </button>
      <BolhaDeAjuda
        texto={`Escolha o titulo entre os das ${quantas} referencia(s) — marcadas na lupa e fornecedores/concorrentes salvos —, ou gere um com IA. Nada vai para o Nome ate voce clicar numa opcao.`}
      />

      {aberta && (
        <ListaFlutuante largura="w-[36rem]" espaco="mt-2" aoFechar={() => setAberta(false)}>
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <span className="text-sm font-semibold">Escolha um titulo</span>
            <button
              type="button"
              onClick={() => setAberta(false)}
              aria-label="Fechar a lista de titulos"
              className="rounded p-1 text-suave hover:bg-fundo"
            >
              <X size={14} />
            </button>
          </div>

          <p className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-suave uppercase">
            Das referencias ({porTitulo.size})
          </p>
          {porTitulo.size === 0 ? (
            <p className="px-2 pb-2 text-sm text-suave">As referencias nao tem titulo.</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto">
              {[...porTitulo].map(([titulo, origens]) => (
                <LinhaDeTitulo key={titulo} titulo={titulo} origem={origens.join(" · ")} aoEscolher={escolher} />
              ))}
            </ul>
          )}

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
                  {emCurso ? "Escrevendo..." : "Gerar outras opcoes"}
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
                <span>{emCurso ? "Escrevendo os titulos..." : "Gerar titulo com IA"}</span>
                <span className="ml-auto text-[11px] font-normal text-suave">
                  3 opcoes, no padrao da loja
                </span>
              </button>
            )}
          </div>
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
  prefixo,
  children,
  ...props
}) {
  return (
    <div className="relative">
      <label htmlFor={nome} className="flex items-center gap-1 text-sm font-semibold">
        {rotulo}
        {ajuda && <BolhaDeAjuda texto={ajuda} variante="inline" />}
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
          className={`${CLASSE_CAMPO} ${iconeExtra ? "pr-56" : "pr-11"} ${prefixo ? "pl-9" : ""} ${
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
function CampoSku({ inicial, erro, aoAlterar, usos }) {
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
      rotulo="Codigo (SKU) *"
      entrada={entrada}
      defaultValue={inicial}
      erro={erro ?? falha}
      ajuda="Letras, numeros, ponto, hifen e sublinhado. E o nome da pasta de arquivos."
      icone={
        <button
          type="button"
          onClick={gerar}
          disabled={gerando}
          title="Gerar o proximo codigo livre (25xxxx)"
          aria-label="Gerar codigo automatico"
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
      }
    />
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
 * Margem LIQUIDA sobre o PRECO DE VENDA (pedido do dono em 22/09/2026):
 * (preco * (1 - imposto) - custo) / preco — o lucro depois de tirar o custo
 * do fornecedor E o imposto, nao so o custo. Custo vazio ou zero nao tem
 * margem que calcular — o fornecedor padrao ainda nao foi escolhido, ou nao
 * tem preco de custo.
 */
function calcularMargem(preco, custo) {
  if (!(custo > 0) || !(preco > 0)) return null;
  const liquido = preco * (1 - IMPOSTO_PADRAO) - custo;
  return (liquido / preco) * 100;
}

/**
 * Preco que da a margem pedida, isolando `preco` de
 * `margem = (preco*(1-imposto) - custo) / preco`:
 * `preco = custo / (1 - imposto - margem/100)`.
 * Travado abaixo de `(1-imposto)*100`: acima disso nem um custo zero
 * cobriria o imposto sozinho, e o preco explodiria (ou ficaria negativo).
 */
function calcularPrecoDaMargem(margem, custo) {
  if (!(custo > 0)) return null;
  const tetoMargem = (1 - IMPOSTO_PADRAO) * 100 - 1;
  const m = Math.min(Math.max(Number(margem) || 0, 0), tetoMargem);
  return custo / (1 - IMPOSTO_PADRAO - m / 100);
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
 * baixa); amarelo com lucro abaixo de 60%; verde a partir de 60%.
 */
function corDaMargem(preco, custo) {
  if (!(custo > 0) || !(preco > 0)) return "text-suave";
  if (preco < custo) return "text-red-600";
  const margem = calcularMargem(preco, custo);
  if (margem === null) return "text-suave";
  // "amber" (#b45309) e vermelho (#b91c1c) sao os dois tons queimados demais
  // para diferenciar num texto pequeno — o dono viu 52% e leu como vermelho
  // (pedido de correcao em 22/09/2026). "yellow-600" e amarelo de verdade.
  return margem >= 60 ? "text-emerald-600" : "text-yellow-600";
}

function CampoPreco({ inicial, erro, referencias, custo, precoAtual, aoAlterar, aoMudarValor, usos }) {
  const entrada = useRef(null);
  const [aberto, setAberto] = useState(false);
  const [abertoMargem, setAbertoMargem] = useState(false);

  // Campos do PAINEL de margem (ListaFlutuante propria, ver abaixo): tres
  // valores que descrevem o mesmo numero de tres jeitos — preco, % de lucro e
  // lucro em reais — e se mantem sincronizados entre si e com o campo
  // principal. Fornecedor (custo) e so leitura ali: quem muda o custo e o
  // fornecedor padrao na aba Fornecedores, nao aqui.
  const precoNoPainel = useRef(null);
  const lucroPercentual = useRef(null);
  const lucroReais = useRef(null);

  const comPreco = referencias
    .filter((item) => item.preco !== null && item.preco !== undefined)
    .sort((a, b) =>
      a.tipo === b.tipo ? a.preco - b.preco : a.tipo === "CONCORRENTE" ? -1 : 1,
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
    const margem = calcularMargem(preco, custo);
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
    const margem = calcularMargem(preco, custo);
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
    const novoPreco = calcularPrecoDaMargem(evento.target.value, custo);
    if (novoPreco !== null) propagarPreco(novoPreco, "lucroPercentual");
  }

  function aoSairLucroPercentual() {
    if (!lucroPercentual.current) return;
    const novoPreco = calcularPrecoDaMargem(lucroPercentual.current.value, custo);
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

  const margemAtual = calcularMargem(precoAtual, custo);
  const lucroAtual =
    custo > 0 && precoAtual !== null ? precoAtual * (1 - IMPOSTO_PADRAO) - custo : null;
  const impostoAtual = precoAtual !== null ? precoAtual * IMPOSTO_PADRAO : null;
  const temCusto = custo > 0;
  const corIndicador = corDaMargem(precoAtual, custo);

  return (
    <CampoComIcone
      nome="precoVenda"
      rotulo="Preco venda"
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
      iconeExtra={
        <>
          {/* Indicador (percentual de lucro / lucro em reais), pedido do dono
              em 22/09/2026: vermelho abaixo do custo, amarelo com lucro
              menor que 60%, verde a partir de 60%. So mostra o dado — quem
              edita e o painel, abaixo. */}
          {temCusto && margemAtual !== null && (
            <button
              type="button"
              onClick={() => setAbertoMargem((atual) => !atual)}
              title={`Percentual de lucro / lucro em reais, ja com ${(IMPOSTO_PADRAO * 100).toFixed(0)}% de imposto descontado — clique para editar`}
              className={`shrink-0 text-sm font-semibold tabular-nums whitespace-nowrap hover:underline ${corIndicador}`}
            >
              ({margemAtual.toFixed(1)}% / {reais(lucroAtual)})
            </button>
          )}
          <button
            type="button"
            onClick={() => setAbertoMargem((atual) => !atual)}
            disabled={!temCusto}
            title={
              temCusto
                ? "Calcular a partir do custo do fornecedor padrao"
                : "Marque um fornecedor padrao com preco de custo para calcular a margem"
            }
            aria-label="Calcular margem a partir do custo do fornecedor"
            className={`relative shrink-0 rounded p-1.5 hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-40 ${COR_DE_USO.funcao}`}
          >
            <Calculator size={16} />
          </button>
        </>
      }
      icone={
        <button
          type="button"
          onClick={() => setAberto((atual) => !atual)}
          title={
            comPreco.length > 0
              ? "Ver os precos das referencias: marcadas na lupa do Nome e fornecedores/concorrentes salvos"
              : "As referencias nao trazem preco"
          }
          aria-label="Precos das referencias"
          className={`relative rounded p-1.5 hover:bg-fundo ${
            usos.tem("precoVenda") ? COR_DE_USO.usado : COR_DE_USO.funcao
          }`}
        >
          <BadgeDollarSign size={16} />
          <Contador
            quantidade={comPreco.length}
            usado={usos.tem("precoVenda")}
          />
        </button>
      }
    >
      {aberto && (
        <ListaFlutuante largura="w-[30rem]" aoFechar={() => setAberto(false)}>
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <span className="text-sm font-semibold">Escolha um preco</span>
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar precos"
              className="rounded p-1 text-suave hover:bg-fundo"
            >
              <X size={14} />
            </button>
          </div>

          {comPreco.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-suave">
              {referencias.length === 0
                ? "Marque produtos de referencia na lupa ao lado do Nome, ou vincule fornecedores e concorrentes."
                : "As referencias nao tem preco coletado."}
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
                      <span className="shrink-0 text-sm font-semibold text-emerald-700 tabular-nums">
                        {reais(item.preco)}
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
          entre si pelo mesmo par de contas de calcularMargem/
          calcularPrecoDaMargem. Sem custo do fornecedor padrao nao ha o que
          calcular, e o botao que abre fica desabilitado. */}
      {abertoMargem && temCusto && (
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
                Imposto ({(IMPOSTO_PADRAO * 100).toFixed(0)}% do preco)
              </span>
              <p className="text-sm font-medium tabular-nums">
                {impostoAtual !== null ? reais(impostoAtual) : "—"}
              </p>
            </div>

            <label className="block">
              <span className="block text-xs text-suave">Preco de venda</span>
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
              <span className="block text-xs text-suave">% de lucro (liquido, ja com imposto)</span>
              <div className="relative mt-0.5">
                <input
                  ref={lucroPercentual}
                  type="number"
                  step="0.1"
                  min="0"
                  max="99"
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
              <span className="block text-xs text-suave">Margem financeira (liquida)</span>
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
              Imposto de {(IMPOSTO_PADRAO * 100).toFixed(0)}% ja descontado do lucro acima. Fixo
              por enquanto — no futuro vira configuravel.
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

  const lista = Array.isArray(valores) ? valores : [];
  // Icone CINZA quando as referencias marcadas nao trazem este dado — pedido do
  // dono em 16/09/2026: assim se ve sem clicar que nao ha o que escolher.
  const temDado = lista.length > 0;

  return (
    <CampoComIcone
      nome={nome}
      rotulo={rotulo}
      ajuda={ajuda}
      entrada={entrada}
      {...props}
      defaultValue={emMaiusculas && inicial ? maiusculas(inicial) : inicial}
      onInput={emMaiusculas ? aoDigitarMaiusculo : undefined}
      icone={
        // Sem dado nas referencias marcadas, o icone NAO aparece (pedido do dono).
        carregando ? (
          <Loader size={16} className="mr-1.5 animate-spin text-suave" />
        ) : temDado ? (
          <button
            type="button"
            onClick={abrir}
            title={`Ver ${rotulo.toLowerCase()} das referencias: marcadas na lupa do Nome e fornecedores/concorrentes salvos`}
            aria-label={`${rotulo} das referencias`}
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

          {ids.length === 0 ? (
            <p className="px-2 pb-2 text-sm text-suave">
              Marque produtos de referencia na lupa ao lado do Nome, ou vincule fornecedores e concorrentes na
              aba Fornecedores / Concorrentes.
            </p>
          ) : carregando || !valores ? (
            <p className="flex items-center gap-2 px-2 pb-2 text-sm text-suave">
              <Loader size={14} className="animate-spin" /> Lendo as
              referencias...
            </p>
          ) : valores?.erro ? (
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
                    <span className="shrink-0 text-right text-[11px] text-suave">
                      {item.fontes.join(", ")}
                    </span>
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
  referencias,
  usos,
}) {
  const [tamanho, setTamanho] = useState((inicial ?? "").length);
  const excedeu = tamanho > LIMITE_TITULO_ML;
  const entrada = useRef(null);

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
            onChange={(evento) => setTamanho(evento.target.value.length)}
            className={`${CLASSE_CAMPO} ${
              excedeu ? "border-amber-400" : "border-borda focus:border-acento"
            }`}
          />
          {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}
        </div>
        {/* Busca produtos de fornecedores e concorrentes com as palavras do Nome. */}
        <button
          type="button"
          onClick={() => aoBuscar(entrada.current?.value ?? "")}
          title="Buscar referencias de mercado com as palavras do Nome"
          aria-label="Buscar referencias de mercado"
          // Usada = ha referencias marcadas.
          className={`relative mt-6 shrink-0 rounded border p-2.5 hover:bg-fundo ${
            ia.quantos > 0 ? BORDA_DE_USO.usado : BORDA_DE_USO.funcao
          }`}
        >
          <Search size={18} />
          {/* Quantos produtos estao marcados como referencia. */}
          <Contador quantidade={ia.quantos} usado />
          <BolhaDeAjuda texto="Marca produtos parecidos de fornecedores e concorrentes como referencia: preenche preco, marca, modelo e medidas, e cria titulo e descricao com IA." />
        </button>
        {/* Aparece depois que produtos foram marcados na janela da lupa. */}
        <ListaDeTitulos
          usado={usos.tem("titulo")}
          ia={ia}
          referencias={referencias}
          aoCriar={aoCriarIA}
          aoEscolher={aoEscolherTitulo}
        />
      </div>
      <ErroIA ia={ia} qual="titulo" />
    </div>
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
          Este link nao aponta para {dominio}. Confira se e o endereco certo.
        </p>
      )}
      {erro && <p className="mt-1 text-[11px] text-red-700">{erro}</p>}
    </div>
  );
}

// Formatos do seletor de arquivo: Documentos tecnicos aceitam tambem .zip; o certificado nao.
const ACEITA_CERTIFICADO = "application/pdf,image/jpeg,image/png";
const ACEITA_DOCUMENTO = `${ACEITA_CERTIFICADO},.zip,application/zip`;

/** Envio de documento (manual, ficha tecnica, certificado). */
function Documento({ produtoId, tipo, rotulo, ajuda, arquivos }) {
  const [pendente, iniciarTransicao] = useTransition();
  const [erro, setErro] = useState(null);
  const entrada = useRef(null);

  function aoEscolher(evento) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;

    const dados = new FormData();
    dados.set("arquivo", arquivo);

    iniciarTransicao(async () => {
      const resultado = await tentar(() =>
        enviarArquivo(produtoId, tipo, null, dados),
      );
      setErro(resultado.ok ? null : resultado.erro);
      if (entrada.current) entrada.current.value = "";
    });
  }

  return (
    <div>
      <span className="flex items-center gap-1 text-sm font-semibold">
        {rotulo}
        {ajuda && <BolhaDeAjuda texto={ajuda} variante="inline" />}
      </span>

      <div className="mt-1 space-y-1">
        {arquivos.map((arquivo) => (
          <div
            key={arquivo.id}
            className="flex items-center gap-2 rounded border border-borda px-2 py-1.5"
          >
            {/*
              BAIXA o arquivo (pedido do dono em 05/10/2026: clicar abria uma janela nova e nao baixava nada).
              O icone e o nome ficam DENTRO do mesmo link, entao clicar em qualquer um baixa. Sem
              `target="_blank"`: com ele o ZIP abria uma aba em branco e o PDF abria no navegador, em vez de
              baixar. `download` leva o nome real (o endereco e do proprio sistema, entao o atributo vale).
            */}
            <a
              href={arquivo.url}
              download={arquivo.nomeOriginal ?? arquivo.arquivo}
              title="Baixar"
              className="group/doc flex min-w-0 flex-1 items-center gap-2 text-sm hover:text-acento"
            >
              <Download size={14} className="shrink-0 text-suave group-hover/doc:text-acento" />
              <span className="truncate">{arquivo.nomeOriginal ?? arquivo.arquivo}</span>
            </a>
            <button
              type="button"
              onClick={() =>
                iniciarTransicao(async () => {
                  const r = await tentar(() => removerArquivo(arquivo.id));
                  if (!r.ok) setErro(r.erro);
                })
              }
              aria-label="Remover"
              className="shrink-0 rounded p-1 text-suave hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={pendente}
        className="mt-1.5 inline-flex items-center gap-1.5 rounded border border-borda px-2.5 py-1.5 text-xs hover:bg-fundo disabled:opacity-50"
      >
        {pendente ? (
          <Loader size={12} className="animate-spin" />
        ) : (
          <Upload size={12} />
        )}
        Enviar arquivo
      </button>

      <input
        ref={entrada}
        type="file"
        accept={tipo === "DOCUMENTO" ? ACEITA_DOCUMENTO : ACEITA_CERTIFICADO}
        onChange={aoEscolher}
        className="hidden"
      />

      {erro && (
        <p className="mt-1 rounded bg-red-50 p-2 text-[11px] text-red-800">
          {erro}
        </p>
      )}
    </div>
  );
}

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
        Arquivos dos fornecedores e concorrentes atuais. Baixe o arquivo ou acesse a pagina do produto na loja.
      </p>
      {!temReferencias && <p className="mt-3 text-sm text-suave">Marque referencias na lupa do Nome para buscar documentos.</p>}
      {temReferencias && carregando && <p className="mt-3 text-sm text-suave">Buscando documentos...</p>}
      {temReferencias && !carregando && itens.length === 0 && !erroBusca && (
        <p className="mt-3 text-sm text-suave">Nenhum documento tecnico foi coletado dessas referencias.</p>
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
 * Envio de documento/certificado ANTES de o produto existir. Mesmo desenho do
 * `Documento`, mas o arquivo vai para a pasta temporaria e a lista e do
 * formulario (`temporarios`), que manda tudo junto no Salvar.
 *
 * Sem link para abrir: o arquivo ainda nao tem endereco publico, e servir a
 * pasta temporaria abriria uma rota para arquivo de cadastro que nem existe.
 */
function DocumentoTemporario({
  tipo,
  rotulo,
  ajuda,
  lista,
  aoEnviar,
  aoRemover,
}) {
  const [pendente, iniciarTransicao] = useTransition();
  const [erro, setErro] = useState(null);
  const entrada = useRef(null);

  function aoEscolher(evento) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    iniciarTransicao(async () => {
      const resultado = await aoEnviar(tipo, arquivo);
      setErro(resultado.ok ? null : resultado.erro);
      if (entrada.current) entrada.current.value = "";
    });
  }

  return (
    <div>
      <span className="flex items-center gap-1 text-sm font-semibold">
        {rotulo}
        {ajuda && <BolhaDeAjuda texto={ajuda} variante="inline" />}
      </span>

      <div className="mt-1 space-y-1">
        {lista.map((arquivo) => (
          <div
            key={arquivo.nome}
            className="flex items-center gap-2 rounded border border-dashed border-borda px-2 py-1.5"
          >
            <FileText size={14} className="shrink-0 text-suave" />
            <span
              className="min-w-0 flex-1 truncate text-sm"
              title="Sera gravado ao salvar"
            >
              {arquivo.nomeOriginal ?? arquivo.nome}
            </span>
            <button
              type="button"
              onClick={() => iniciarTransicao(() => aoRemover(arquivo))}
              aria-label="Remover"
              className="shrink-0 rounded p-1 text-suave hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={pendente}
        className="mt-1.5 inline-flex items-center gap-1.5 rounded border border-borda px-2.5 py-1.5 text-xs hover:bg-fundo disabled:opacity-50"
      >
        {pendente ? (
          <Loader size={12} className="animate-spin" />
        ) : (
          <Upload size={12} />
        )}
        Enviar arquivo
      </button>

      <input
        ref={entrada}
        type="file"
        accept={tipo === "DOCUMENTO" ? ACEITA_DOCUMENTO : ACEITA_CERTIFICADO}
        onChange={aoEscolher}
        className="hidden"
      />

      {!erro && lista.length > 0 && (
        <p className="mt-1 text-[11px] text-suave">
          Os arquivos sao gravados no produto ao salvar.
        </p>
      )}
      {erro && (
        <p className="mt-1 rounded bg-red-50 p-2 text-[11px] text-red-800">
          {erro}
        </p>
      )}
    </div>
  );
}

export default function FormularioProduto({
  produto,
  arquivos = {},
  fornecedores = [],
  concorrentes = [],
  catalogoFornecedores = [],
  dominioLojaIntegrada = "",
}) {
  const router = useRouter();
  const [aba, setAba] = useState("caracteristicas");
  const [aberturaDocumentos, setAberturaDocumentos] = useState(0);
  const [alterado, setAlterado] = useState(false);
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
  const [preenchido, setPreenchido] = useState(null);
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
            `${resposta.naoCarregadas.length} foto(s) do produto nao puderam ser abertas e ficam como estao.`,
          );
        }
      } else {
        setErroAcao(`As fotos do produto nao carregaram (${resposta.erro}). Salvar nao mexe nelas.`);
      }
      setCarregandoFotosDoProduto(false);
    });
  }, [produto]);

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
  // vinculo de verdade: depois de salvo uma vez, `fornecedores` deixa de vir
  // vazio e o rascunho do Bling some, substituido pelos vinculos reais.
  const [fornecedoresRascunho, setFornecedoresRascunho] = useState(() =>
    produto?.fornecedorRascunho?.nome && fornecedores.length === 0
      ? [
          {
            id: "bling-rascunho",
            nome: produto.fornecedorRascunho.nome,
            descricao: produto.fornecedorRascunho.descricao ?? null,
            codigo: produto.fornecedorRascunho.codigo ?? null,
            precoCusto: produto.fornecedorRascunho.precoCusto ?? null,
            // O Bling nao separa um "link" proprio — o que ele chama de
            // "Descricao no fornecedor" e, na pratica, esse link (ver
            // Produto.fornecedorRascunho); mora em `descricao`, nao aqui.
            link: null,
            padrao: true,
          },
        ]
      : fornecedores,
  );

  function mudarFornecedoresRascunho(atualizador) {
    setFornecedoresRascunho(atualizador);
    setAlterado(true);
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
    concorrentes.map(paraRascunho),
  );

  function mudarConcorrentesRascunho(atualizador) {
    setConcorrentesRascunho(atualizador);
    setAlterado(true);
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
      setAlterado(true);
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
          setAlterado(true);
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
          `${recusadas} foto(s) dos produtos marcados nao puderam ser trazidas (ilegivel ou o site nao respondeu).`,
        );
      }
      if (foraDoLimite > 0) {
        avisos.push(
          `O painel guarda ${MAXIMO_FOTOS_NO_PAINEL} fotos: ${foraDoLimite} dos produtos marcados ficaram de fora.`,
        );
      }
      if (trazidas === 0 && avisos.length === 0) {
        avisos.push("Os produtos marcados nao trouxeram nenhuma foto nova.");
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

  const idsMarcados = [...marcados.keys()];

  const valorDoCampo = (nome) =>
    formulario.current?.elements.namedItem(nome)?.value ?? "";

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
  };

  // O resultado e tratado dentro da propria acao, e nao num efeito: reagir a
  // mudanca de estado com setState dentro de useEffect provoca renderizacoes em
  // cascata (e a regra do React 19 barra).
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
              erro: `${fotosNoEnvio} fotos estao validadas e o produto leva no maximo ${MAXIMO_IMAGENS}. Tire a validacao ou exclua ${fotosNoEnvio - MAXIMO_IMAGENS} (Melhorar).`,
            }
          : await salvarProduto(produto?.id ?? null, anterior, formData);

      /*
      O REACT 19 LIMPA O FORMULARIO DEPOIS DA ACTION, e o que volta e o
      defaultValue de cada campo — nao o que foi digitado. Num Salvar recusado
      (SKU repetido) o SKU voltava VAZIO junto com a mensagem de erro, e todo
      campo escrito a mao fora do cadastro inicial sumia. Guardar o que foi
      enviado como valor inicial faz o reset devolver os mesmos valores.
    */
      if (!resultado.ok) {
        const enviados = Object.fromEntries(formData.entries());
        enviados.ativo = enviados.ativo === "on";
        setPreenchido(enviados);
      }

      if (resultado.ok) {
        setAlterado(false);

        // Produto existente volta para a lista. Produto novo FICA na tela: e so
        // depois de existir que imagens, documentos e fornecedores ficam
        // liberados — devolver a lista obrigaria a procura-lo de novo.
        if (produto) router.push("/produtos");
        else if (resultado.id) {
          // Quantas imagens vieram vai na URL: a tela do produto ja criado e outra
          // pagina, e sem isso a foto recusada sumiria em silencio.
          const busca = new URLSearchParams();
          if (resultado.avisoImagens) busca.set("fotos", "falhou");
          if (resultado.avisoArquivos) busca.set("documentos", "falhou");
          if (resultado.avisoFornecedores) busca.set("fornecedores", "falhou");
          if (resultado.avisoConcorrentes) busca.set("concorrentes", "falhou");
          const sufixo = busca.size > 0 ? `?${busca}` : "";
          router.replace(`/produtos/${resultado.id}${sufixo}`);
        }
      }

      return resultado;
    },
    null,
  );

  const erros = estado?.erros ?? {};
  // O que foi preenchido ou enviado vence o cadastro gravado: e o estado mais
  // recente da tela.
  const inicial = preenchido ?? produto;
  const v = (campo) => inicial?.[campo] ?? "";
  const novo = !produto;
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

  // Custo do fornecedor PADRAO, para a margem ao lado do Preco venda (pedido
  // do dono em 22/09/2026). Lido da mesma lista que a aba Fornecedores usa —
  // rascunho ou vinculos de verdade — e nao de Produto.custo: aquele campo so
  // e recalculado no Salvar, e ficaria um Salvar atrasado do que a tela mostra
  // (ex.: acabou de marcar outro fornecedor como padrao, ainda nao salvou).
  const custoPadrao =
    (usaFornecedorRascunho ? fornecedoresRascunho : fornecedores).find((item) => item.padrao)
      ?.precoCusto ?? null;

  // Referencias marcadas na lupa que ja servem de atalho na aba Fornecedores
  // (pedido do dono em 18/09/2026): fornecedor vira sugestao de linha ali;
  // concorrente so aparece para consulta, em Concorrentes.jsx — preco de
  // concorrente nao e custo, entao nao entra na mesma tabela.
  const nomesFornecedoresAtuais = new Set(
    (usaFornecedorRascunho ? fornecedoresRascunho : fornecedores).map((item) =>
      item.nome.trim().toLocaleLowerCase("pt-BR"),
    ),
  );
  const sugestoesFornecedor = [...marcados.values()].filter(
    (item) =>
      item.tipo === "FORNECEDOR" &&
      item.fonte &&
      !nomesFornecedoresAtuais.has(item.fonte.trim().toLocaleLowerCase("pt-BR")),
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

  /*
    INDICACOES SEMPRE A MOSTRA (pedido do dono em 06/10/2026): marca, modelo, EAN, medidas, NCM, preco e a
    lista de titulos vem das referencias marcadas na lupa E dos fornecedores e concorrentes SALVOS na aba
    Fornecedores / Concorrentes. Antes so vinham da lupa, e um produto salvo abria sem indicacao nenhuma.

    Os vinculos NAO entram em `marcados`: a marcacao da lupa continua comecando vazia (decisao do dono em
    22/09/2026 — pre-marcar disparava a importacao de fotos sozinha). Aqui so se LE: nada e gravado, nenhuma
    foto e trazida.
  */
  const [vinculosItens, setVinculosItens] = useState([]);
  const assinaturaVinculos = JSON.stringify({
    fornecedores: (usaFornecedorRascunho ? fornecedoresRascunho : fornecedores)
      .filter((item) => item.nome?.trim())
      .map(({ nome, codigo, link }) => [nome.trim(), codigo ?? null, link ?? null]),
    concorrentes: [...idsConcorrentesAtuais].sort(),
  });
  useEffect(() => {
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
          if (valido) setVinculosItens(resposta.ok ? resposta.itens : []);
        })
        .catch(() => {
          if (valido) setVinculosItens([]);
        });
    }, 600);
    return () => {
      valido = false;
      clearTimeout(espera);
    };
  }, [assinaturaVinculos]);

  // Vinculos e marcadas, sem repetir: a marcada vence (e a que o operador acabou de escolher na lupa).
  const referenciasDasIndicacoes = [
    ...new Map([...vinculosItens.map((item) => [item.id, item]), ...marcados]).values(),
  ];
  const idsDasIndicacoes = [...new Set([...idsDaLupa, ...vinculosItens.map((item) => item.id)])];
  const chaveDasIndicacoes = [...idsDasIndicacoes].sort().join(",");
  useEffect(() => {
    const ids = chaveDasIndicacoes ? chaveDasIndicacoes.split(",") : [];
    let valido = true;
    iniciarLeituraRefs(async () => {
      const resultado = await tentar(() => camposDasReferencias(ids));
      if (valido) setValoresRefs(resultado.ok ? resultado : { erro: resultado.erro });
    });
    return () => {
      valido = false;
    };
  }, [chaveDasIndicacoes]);

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
  function aplicar(campos, { recomecar = false } = {}) {
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

    const mesclado = { ...atual, ...trazidos };
    setPreenchido(mesclado);
    // O campo Preco venda tambem remonta aqui (key={versao}), sem disparar o
    // onChange de CampoPreco: sem isto, a Diferenca em Concorrentes.jsx ficava
    // em travessao depois de "Buscar por codigo" trazer o preco, ate o
    // operador escolher um preco da lista manualmente (achado do dono em
    // 18/09/2026).
    setPrecoVendaTexto(mesclado.precoVenda ?? "");
    setVersao((anterior) => anterior + 1);
    setAlterado(true);
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
    aplicar(resultado.campos, { recomecar: true });

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
              : resposta.imagens,
          );
          if (resposta.recusadas > 0) {
            setErroAcao(
              `${resposta.recusadas} foto(s) do produto de origem nao puderam ser trazidas (ilegivel ou o site nao respondeu).`,
            );
          }
        } else {
          setErroAcao(resposta.erro);
        }
        setImportandoImagens(false);
      });
    }
  }

  // Sem confirmacao (pedido do dono em 18/09/2026): Cancelar sempre descarta e
  // volta para a lista, direto.
  function cancelar() {
    // O lote do painel (as fotos copiadas, as previas) nao serve mais.
    if (loteTemporario) tentar(() => descartarLoteDeArquivos(loteTemporario));
    router.push("/produtos");
  }


  return (
    <form
      ref={formulario}
      action={acao}
      onChange={() => setAlterado(true)}
      className="space-y-4"
    >
      {/* Lote de arquivos enviados antes de salvar (ver enviarTemporario). */}
      <input type="hidden" name="loteTemporario" value={loteTemporario} />
      <input
        type="hidden"
        name="arquivosTemporarios"
        value={JSON.stringify(temporarios)}
      />
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
          })),
        )}
      />
      {/* Produto existente: so com o painel carregado o servidor mexe nas fotos (ver `fotosProntas`). */}
      <input type="hidden" name="fotosDoPainelProntas" value={fotosProntas ? "1" : "0"} />
      <input type="hidden" name="arquivosPreservados" value={JSON.stringify(fotosPreservadas)} />
      {/* Imagens da reserva que o dono excluiu na tela: so o Salvar apaga (ver ReservaDeImagens). */}
      <input type="hidden" name="reservaExcluida" value={JSON.stringify(reservaExcluida)} />
      {/* Fornecedores adicionados antes de o produto existir (ver Fornecedores.jsx). */}
      <input
        type="hidden"
        name="fornecedoresRascunho"
        value={JSON.stringify(fornecedoresRascunho)}
      />
      {/* Concorrentes adicionados antes de o produto existir (ver Concorrentes.jsx). */}
      <input
        type="hidden"
        name="concorrentesRascunho"
        value={JSON.stringify(concorrentesRascunho)}
      />

      {/* ---------- Acoes no topo ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={enviando || carregandoFotosDoProduto}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {enviando && <Loader size={14} className="animate-spin" />}
          Salvar
        </button>
        <button
          type="button"
          onClick={cancelar}
          className="rounded border border-borda px-4 py-2 text-sm hover:bg-fundo"
        >
          Cancelar
        </button>

        {estado?.ok && (
          <span className="text-sm text-emerald-700">Produto salvo.</span>
        )}
        {estado?.erro && (
          <span className="text-sm text-red-700">{estado.erro}</span>
        )}

        {novo && (
          <div className="ml-auto">
            <BuscarPorCodigo
              codigoAtual={() =>
                formulario.current?.elements.namedItem("sku")?.value
              }
              aoEscolher={preencher}
            />
          </div>
        )}
      </div>

      {erroAcao && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-800">{erroAcao}</p>
      )}

      <Fragment key={`geral-${versao}`}>
        {/* ---------- Visao geral ---------- */}
        <Card>
          <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
            <div className="lg:col-span-2">
              <CampoNome
                inicial={v("tituloBase")}
                erro={erros.tituloBase}
                aoBuscar={(palavras) => referencias.current?.buscar(palavras)}
                ia={ia}
                aoCriarIA={criarComIA}
                aoEscolherTitulo={escolherTitulo}
                referencias={referenciasDasIndicacoes}
                usos={usos}
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
                  aoAlterar={() => setAlterado(true)}
                  reserva={reserva}
                  reservaExcluida={reservaExcluida}
                  setReservaExcluida={setReservaExcluida}
                />
              </div>
            </div>

            <div className="grid content-start gap-4 sm:grid-cols-2">
              <CampoSku
                inicial={v("sku")}
                erro={erros.sku}
                aoAlterar={() => setAlterado(true)}
                usos={usos}
              />
              <Campo
                nome="localizacao"
                rotulo="Localizacao"
                defaultValue={v("localizacao")}
                ajuda="Ex.: R14"
              />

              <CampoPreco
                inicial={v("precoVenda")}
                erro={erros.precoVenda}
                referencias={referenciasDasIndicacoes}
                custo={custoPadrao}
                precoAtual={precoVendaAtual}
                aoAlterar={() => setAlterado(true)}
                aoMudarValor={setPrecoVendaTexto}
                usos={usos}
              />
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
              <LinkLojaIntegrada
                inicial={v("urlLojaIntegrada")}
                dominio={dominioLojaIntegrada}
                erro={erros.urlLojaIntegrada}
              />
            </div>
          </div>
        </Card>
      </Fragment>

      {/*
        Fora dos trechos remontados: preencher o Nome com o titulo da IA troca a
        `versao`, e a busca e a marcacao nao podem sumir junto.
      */}
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

      {/* Fora dos trechos remontados, pelo mesmo motivo da janela da lupa. */}
      <JanelaDescricao
        ref={janelaDescricao}
        ids={idsMarcados}
        descricaoAtual={produto?.descricaoBase ?? null}
        lerProduto={() => ({
          titulo: valorDoCampo("tituloBase"),
          sku: valorDoCampo("sku"),
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

      <Fragment key={`abas-${versao}`}>
        {/* ---------- Abas ---------- */}
        <Card className="p-0">
          <div className="flex overflow-x-auto border-b border-borda">
            {ABAS.map((item) => (
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
          <div className="p-5">
            <div className={aba === "caracteristicas" ? "space-y-5" : "hidden"}>
              <div className="grid gap-4 sm:grid-cols-2">
                <CampoDeReferencias
                  nome="marca"
                  rotulo="Marca"
                  inicial={v("marca")}
                  ids={idsDasIndicacoes}
                  valores={valoresRefs?.marca}
                  carregando={lendoRefs}
                  aoAlterar={() => setAlterado(true)}
                  usos={usos}
                  vazio="Nenhuma referencia (lupa ou vinculos salvos) publica a marca (a loja que poe o proprio nome como marca fica de fora)."
                />
                <CampoDeReferencias
                  nome="modelo"
                  rotulo="Modelo"
                  inicial={v("modelo")}
                  ids={idsDasIndicacoes}
                  valores={valoresRefs?.modelo}
                  carregando={lendoRefs}
                  aoAlterar={() => setAlterado(true)}
                  usos={usos}
                  vazio="Nenhuma referencia (lupa ou vinculos salvos) publica o modelo."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <Campo
                  nome="garantiaMeses"
                  rotulo="Garantia (meses)"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={v("garantiaMeses")}
                />
              </div>

              <Campo
                nome="videoUrl"
                rotulo="Video (link do YouTube)"
                defaultValue={v("videoUrl")}
                placeholder="https://www.youtube.com/watch?v=..."
              />

              <div className="grid gap-4 border-t border-borda pt-5 sm:grid-cols-2">
                <CampoDeReferencias
                  nome="numeroHomologacao"
                  rotulo="Numero de homologacao"
                  inicial={v("numeroHomologacao")}
                  ajuda="Anatel/INMETRO. O Mercado Livre pede o numero em varias categorias."
                  ids={idsDasIndicacoes}
                  valores={valoresRefs?.homologacao}
                  carregando={lendoRefs}
                  aoAlterar={() => setAlterado(true)}
                  usos={usos}
                  vazio="Nenhuma referencia (lupa ou vinculos salvos) publica o numero de homologacao. Poucas lojas publicam: a maioria escreve so 'certificado pela Anatel'."
                />
                <CampoDeReferencias
                  nome="ean"
                  rotulo="GTIN / EAN"
                  inicial={v("ean")}
                  ajuda="Codigo de barras do produto."
                  ids={idsDasIndicacoes}
                  valores={valoresRefs?.ean}
                  carregando={lendoRefs}
                  aoAlterar={() => setAlterado(true)}
                  usos={usos}
                  vazio="Nenhuma referencia publica um codigo de barras valido."
                />
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
            <div className={aba === "documentos" ? "grid gap-5 sm:grid-cols-2" : "hidden"}>
              {novo ? (
                <DocumentoTemporario
                  tipo="DOCUMENTO"
                  rotulo="Documentos tecnicos"
                  ajuda="Manual, datasheet, ficha tecnica. PDF, JPG ou PNG, ate 20 MB cada."
                  lista={temporarios.filter((item) => item.tipo === "DOCUMENTO")}
                  aoEnviar={enviarTemporario}
                  aoRemover={removerTemporario}
                />
              ) : (
                <Documento
                  produtoId={produto.id}
                  tipo="DOCUMENTO"
                  rotulo="Documentos tecnicos"
                  ajuda="Manual, datasheet, ficha tecnica. PDF, JPG ou PNG, ate 20 MB cada."
                  arquivos={arquivos.DOCUMENTO ?? []}
                />
              )}
              {novo ? (
                <DocumentoTemporario
                  tipo="CERTIFICADO"
                  rotulo="Certificado de homologacao"
                  lista={temporarios.filter((item) => item.tipo === "CERTIFICADO")}
                  aoEnviar={enviarTemporario}
                  aoRemover={removerTemporario}
                />
              ) : (
                <Documento
                  produtoId={produto.id}
                  tipo="CERTIFICADO"
                  rotulo="Certificado de homologacao"
                  arquivos={arquivos.CERTIFICADO ?? []}
                />
              )}
              <DocumentosDasReferencias
                key={aberturaDocumentos}
                ids={idsMarcados}
                ativo={aba === "documentos"}
                produtoId={produto?.id ?? null}
              />
            </div>

            <div className={aba === "descricao" ? "" : "hidden"}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="relative inline-flex shrink-0">
                  <button
                    type="button"
                    onClick={() => janelaDescricao.current?.abrir()}
                    className="inline-flex items-center gap-1.5 rounded border border-acento bg-superficie px-3 py-2 text-sm font-medium text-acento hover:bg-fundo"
                  >
                    <Sparkles size={15} />
                    Criar descricao
                  </button>
                  <BolhaDeAjuda
                    texto={
                      "Busca descricoes dos produtos correspondentes nos fornecedores e concorrentes cadastrados e cria o texto com IA."
                    }
                  />
                </div>
              </div>
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
                  aoAlterar={() => setAlterado(true)}
                  usos={usos}
                  unidade="kg"
                  vazio="Nenhuma referencia (lupa ou vinculos salvos) publica o peso na ficha tecnica."
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
                  aoAlterar={() => setAlterado(true)}
                  usos={usos}
                  unidade="cm"
                  vazio="Nenhuma referencia (lupa ou vinculos salvos) publica o comprimento na ficha tecnica."
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
                  aoAlterar={() => setAlterado(true)}
                  usos={usos}
                  unidade="cm"
                  vazio="Nenhuma referencia (lupa ou vinculos salvos) publica a largura na ficha tecnica."
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
                  aoAlterar={() => setAlterado(true)}
                  usos={usos}
                  unidade="cm"
                  vazio="Nenhuma referencia (lupa ou vinculos salvos) publica a altura na ficha tecnica."
                />
              </div>
            </div>

            <div className={aba === "tributacao" ? "space-y-4" : "hidden"}>
              <p className="rounded border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                <strong>Dados da nota fiscal.</strong> Quem emite a nota e o
                Bling — aqui ficam so os campos que identificam o produto e
                viajam com ele. Os valores calculados de imposto continuam no
                Bling, que tem as regras tributarias.
              </p>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <Selecao
                    nome="origem"
                    rotulo="Origem"
                    opcoes={ORIGENS}
                    inicial={inicial?.origem}
                    ajuda="Origem fiscal da mercadoria (nacional, importada etc.), usada no calculo do ICMS."
                  />
                </div>
                <CampoDeReferencias
                  nome="ncm"
                  rotulo="NCM"
                  inicial={v("ncm")}
                  placeholder="0000.00.00"
                  ajuda="Obrigatorio para emitir nota."
                  ids={idsDasIndicacoes}
                  valores={valoresRefs?.ncm}
                  carregando={lendoRefs}
                  aoAlterar={() => setAlterado(true)}
                  usos={usos}
                  vazio="Nenhuma referencia (lupa ou vinculos salvos) publica o NCM. Fortek, Casa da Robotica e Smartkits costumam publicar; Eletrogate, Saravati e Usinainfo nao."
                />
                <Campo
                  nome="cest"
                  rotulo="CEST"
                  defaultValue={v("cest")}
                  placeholder="00.000.00"
                  ajuda="So para produtos sujeitos a substituicao tributaria."
                />
                <Campo
                  nome="percentualTributos"
                  rotulo="% Tributos"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={v("percentualTributos")}
                  ajuda="Lei da Transparencia."
                />
                <div className="sm:col-span-3">
                  <Selecao
                    nome="spedTipoItem"
                    rotulo="Tipo do item"
                    opcoes={TIPOS_ITEM}
                    inicial={inicial?.spedTipoItem}
                    ajuda="Usado na geracao do SPED PIS/COFINS."
                  />
                </div>
              </div>
            </div>

            <div className={aba === "fornecedores" ? "space-y-5" : "hidden"}>
              <div className="grid gap-4 sm:grid-cols-4">
                <Campo
                  nome="estoqueMinimo"
                  rotulo="Estoque minimo"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={v("estoqueMinimo")}
                  ajuda="Quanto voce quer ter em estoque, no minimo."
                />
                <Campo
                  nome="estoqueMaximo"
                  rotulo="Estoque maximo"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue={v("estoqueMaximo")}
                />
              </div>

              <Fornecedores
                ref={fornecedoresRef}
                produtoId={produto?.id ?? null}
                ativo={aba === "fornecedores"}
                vinculos={usaFornecedorRascunho ? fornecedoresRascunho : fornecedores}
                catalogo={catalogoFornecedores}
                aoFalhar={setErroAcao}
                modoRascunho={usaFornecedorRascunho}
                aoMudarRascunho={mudarFornecedoresRascunho}
                sugestoes={sugestoesFornecedor}
              />

              <Concorrentes
                ref={concorrentesRef}
                produtoId={produto?.id ?? null}
                ativo={aba === "fornecedores"}
                vinculos={concorrentesRascunho}
                aoFalhar={setErroAcao}
                modoRascunho
                aoMudarRascunho={mudarConcorrentesRascunho}
                sugestoes={sugestoesConcorrente}
                precoProduto={precoVendaAtual}
              />
            </div>
          </div>
        </Card>
      </Fragment>

    </form>
  );
}
