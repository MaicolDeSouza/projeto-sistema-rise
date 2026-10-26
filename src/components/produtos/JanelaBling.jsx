"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CircleCheck, ExternalLink, ImageOff, Loader, RefreshCw, X } from "lucide-react";

import {
  abrirJanelaBling,
  cadastrarProdutoNoBling,
  enviarEstoqueAoBling,
  sincronizarComBling,
} from "@/app/produtos/acoes-bling";
import { BarraDeAbas } from "@/components/cadastros/Abas";
import ConclusaoDoEnvio from "@/components/ui/ConclusaoDoEnvio";
import { ETAPAS_DO_ENVIO, mudouNoBling, resumirEnvio, valorParaTela } from "@/lib/blingSync/apresentacao";
import { propsDoFundo } from "@/lib/fundoDaJanela";
import AndamentoDoEnvio from "./AndamentoDoEnvio";

/**
 * Janela aberta pelo icone do Bling na lista de Produtos: o que o Bling tem sob o codigo do produto,
 * comparado campo a campo com o Rise, e os envios (sincronizar os campos e as fotos, cadastrar o produto,
 * enviar os ajustes de estoque). Cada abertura monta a janela do zero e le o Bling de novo
 * (`abrirJanelaBling`, que so le).
 *
 * Desenho (pedido do dono em 14/10/2026: "similar a tela de divergencias da LI, grande como na LI"): a mesma
 * janela do editor da Loja Integrada (`max-w-5xl`, presa no alto, cabecalho, corpo que rola e rodape), com as
 * diferencas no molde da aba Divergencias dela. Nesta tela o operador precisa ver primeiro o que difere entre
 * o Rise e o Bling, e a acao principal e "Sincronizar com o Bling".
 *
 * Estados do corpo: carregando; erro de leitura (token, limite, codigo duplicado: a mensagem vem da acao);
 * codigo que nao existe no Bling ("Cadastrar no Bling"); ou as diferencas, as fotos, os avisos e o estoque.
 *
 * A escrita no Bling tem duas travas no servidor. Com elas fechadas os botoes de envio CONTINUAM aqui, e ao
 * clicar a acao devolve o motivo, que a janela mostra em vermelho: nunca em silencio, e nunca um botao que
 * some e deixa o operador sem saber por que. Os botoes so ficam desabilitados enquanto um envio roda (a trava
 * de "um envio por produto" da lib so vale dentro de um processo, e o clique duplo nao pode mandar o mesmo
 * ajuste duas vezes).
 *
 * Este arquivo so chama as Server Actions de `acoes-bling.js`. A lib de sincronizacao e de servidor (usa
 * `node:crypto` e o banco): o texto e as contas daqui vem de `lib/blingSync/apresentacao.js`, e os rotulos
 * dos campos, das diferencas que a propria leitura devolve.
 */

/// A acao ja devolve `{ ok: false }` para o que da errado no servidor; isto cobre a rede caindo. Num
/// envio a resposta que se perde nao quer dizer que o Bling nao recebeu: a mensagem manda conferir
/// antes de tentar de novo, em vez de convidar a repetir uma escrita.
async function chamar(acao, argumentos, escreve) {
  try {
    return await acao(...argumentos);
  } catch {
    return {
      ok: false,
      erro: escreve
        ? "A resposta do servidor se perdeu. O Bling pode ter recebido o envio: confira no Bling antes de tentar de novo."
        : "Não foi possível falar com o servidor. Tente de novo.",
    };
  }
}

// ---------------------------------------------------------------------------
// O popup de etapas do Sincronizar e do Cadastrar (`AndamentoDoEnvio`)
// ---------------------------------------------------------------------------

/// Os envios que mostram as etapas; o do estoque e um passo so e segue com o aviso de conclusao.
const ENVIOS_COM_ETAPAS = new Set(["sincronizar", "cadastrar"]);

/// Todas as etapas esperando, com a primeira ja andando (o servidor so marca a dele alguns milissegundos depois).
function etapasIniciais(tipo) {
  return ETAPAS_DO_ENVIO[tipo].map((etapa, indice) => ({ ...etapa, estado: indice === 0 ? "andando" : "espera", detalhe: null }));
}

/// O estado que o servidor marcou, por cima das etapas da tela. Entre uma etapa terminar e a outra comecar passam milissegundos
/// sem ninguem "andando": nesses instantes a primeira que falta fica andando, para o circulo nao piscar.
function mesclarEtapas(etapas, doServidor) {
  const porId = new Map(doServidor.map((etapa) => [etapa.id, etapa]));
  const mescladas = etapas.map((etapa) => {
    const lida = porId.get(etapa.id);
    return lida ? { ...etapa, estado: lida.estado, detalhe: lida.detalhe } : etapa;
  });
  if (mescladas.some((etapa) => etapa.estado === "andando" || etapa.estado === "falhou")) return mescladas;
  const proxima = mescladas.findIndex((etapa) => etapa.estado === "espera");
  return mescladas.map((etapa, indice) => (indice === proxima ? { ...etapa, estado: "andando" } : etapa));
}

/// Fecha as etapas com o que a acao devolveu. Deu certo: as do servidor ficam todas concluidas. Falhou: a que o servidor marcou
/// como falha leva o motivo; sem marca (a acao foi recusada antes de comecar, ou caiu por fora), a que estava andando falha.
function etapasComOResultado(etapas, resultado) {
  if (resultado.ok === true) return etapas.map((etapa) => (etapa.id === "conferir" ? etapa : { ...etapa, estado: "feito" }));
  if (etapas.some((etapa) => etapa.estado === "falhou")) {
    return etapas.map((etapa) => (etapa.estado === "falhou" && !etapa.detalhe ? { ...etapa, detalhe: resultado.erro ?? "O envio não foi concluído." } : etapa));
  }
  const andando = etapas.findIndex((etapa) => etapa.estado === "andando");
  const alvo = andando >= 0 ? andando : Math.max(0, etapas.findIndex((etapa) => etapa.estado !== "feito"));
  return etapas.map((etapa, indice) => {
    if (indice === alvo) return { ...etapa, estado: "falhou", detalhe: resultado.erro ?? "O envio não foi concluído." };
    return etapa.estado === "andando" ? { ...etapa, estado: "espera" } : etapa;
  });
}

/// O andamento que o servidor guardou, ou null (rota fora do ar, sem acesso, nada aberto). So le a memoria do servidor.
async function lerAndamentoNoServidor(produtoId) {
  try {
    const resposta = await fetch(`/api/bling/progresso/${encodeURIComponent(produtoId)}`, { cache: "no-store" });
    if (!resposta.ok) return null;
    return (await resposta.json()).progresso ?? null;
  } catch {
    return null;
  }
}

/// O titulo do aviso de conclusao de cada envio.
const TITULO_DA_CONCLUSAO = {
  sincronizar: "Sincronização concluída",
  cadastrar: "Cadastro concluído",
  estoque: "Estoque enviado",
};

const CLASSE_DO_TOM = {
  erro: "border-red-200 bg-red-50 text-red-800",
  atencao: "border-amber-200 bg-amber-50 text-amber-900",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

const CLASSE_DO_BOTAO_SECUNDARIO =
  "inline-flex items-center gap-2 rounded-md border border-acento bg-superficie px-4 py-2 text-sm font-medium text-acento hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-60";

/// A janela e uma comparacao em DUAS COLUNAS FIXAS (pedido do dono em 26/10/2026: "na esquerda sempre dados do Rise e
/// na direita dados do Bling"): o Rise e sempre a metade da esquerda e o Bling a da direita, em toda secao, e a
/// faixa de cima (`CabecalhoDasColunas`) fica presa no topo ao rolar para dizer qual e qual. Por isso as celulas
/// nao repetem "No Rise"/"No Bling" (so para leitor de tela).
function Par({ rise, bling, className = "" }) {
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] divide-x divide-borda ${className}`}>
      <div className="min-w-0 px-4 py-3">{rise}</div>
      <div className="min-w-0 px-4 py-3">{bling}</div>
    </div>
  );
}

function CabecalhoDasColunas({ existe }) {
  return (
    <div className="sticky top-0 z-10 bg-superficie pb-1 pt-1">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] divide-x divide-borda overflow-hidden rounded-lg border border-borda bg-fundo/70">
        <div className="border-t-4 border-acento px-4 py-2.5">
          <p className="text-lg font-semibold text-texto">Rise</p>
          <p className="text-sm text-suave">o que está salvo no produto</p>
        </div>
        <div className="border-t-4 border-slate-500 px-4 py-2.5">
          <p className="text-lg font-semibold text-texto">Bling</p>
          <p className="text-sm text-suave">{existe ? "lido agora" : "último saldo lido"}</p>
        </div>
      </div>
    </div>
  );
}

/// O valor de um campo: texto que cabe na coluna (a descricao inteira rola em vez de esticar a janela) ou,
/// sem valor, a frase que diz de qual lado ele falta.
function Valor({ campo, valor, quandoVazio }) {
  const texto = valorParaTela(campo, valor);
  if (texto === null) return <span className="text-suave italic">{quandoVazio}</span>;
  return <span className="block max-h-48 overflow-y-auto break-words whitespace-pre-wrap">{texto}</span>;
}

/**
 * Um campo que difere: Rise e Bling lado a lado. `vazioNoRise` (o Rise nao tem o valor e o Bling tem)
 * fica em cinza e diz que nao sera enviado: campo vazio no Rise nunca apaga o do Bling, entao nao e
 * divergencia. O estado vai em palavras ("diferente", "so tem no Bling"), alem da cor.
 */
function LinhaDeDiferenca({ item }) {
  const vazioNoRise = item.tipo === "vazioNoRise";
  return (
    <li className={`overflow-hidden rounded-lg border ${vazioNoRise ? "border-borda bg-fundo/60 text-suave" : "border-amber-200 bg-amber-50/50"}`}>
      <p className="px-4 pt-3 text-base font-medium text-texto">
        {item.rotulo}
        <span className="ml-2 text-sm font-normal text-suave">{vazioNoRise ? "só tem no Bling" : "diferente"}</span>
      </p>
      <Par
        rise={
          <>
            <span className="sr-only">No Rise: </span>
            <span className="text-base">
              <Valor campo={item.campo} valor={item.rise} quandoVazio="vazio no Rise (não será enviado)" />
            </span>
          </>
        }
        bling={
          <>
            <span className="sr-only">No Bling: </span>
            <span className="text-base">
              <Valor campo={item.campo} valor={item.bling} quandoVazio="vazio no Bling" />
            </span>
          </>
        }
      />
    </li>
  );
}

/// Quantas miniaturas cabem numa linha da janela antes do "+N".
const MINIATURAS_VISIVEIS = 12;

/// A fila de miniaturas de um lado. Foto que nao abre (link do Bling vencido, arquivo sumido) some do quadro
/// e fica a contagem, que e o que a comparacao usa.
function Miniaturas({ itens, campo, vazio }) {
  if (itens.length === 0) {
    return (
      <span className="flex items-center gap-1.5 text-suave italic">
        <ImageOff size={16} />
        {vazio}
      </span>
    );
  }
  const visiveis = itens.slice(0, MINIATURAS_VISIVEIS);
  return (
    <ul className="flex flex-wrap gap-1.5">
      {visiveis.map((item, posicao) => (
        <li key={`${posicao}-${item[campo]}`} className="h-16 w-16 shrink-0 overflow-hidden rounded border border-borda bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item[campo]} alt={`Foto ${posicao + 1}`} loading="lazy" className="h-full w-full object-contain" />
        </li>
      ))}
      {itens.length > visiveis.length && (
        <li className="flex h-16 w-16 shrink-0 items-center justify-center rounded border border-borda bg-fundo text-sm text-suave">
          +{itens.length - visiveis.length}
        </li>
      )}
    </ul>
  );
}

/// O que o Sincronizar faz com as fotos, dito em uma linha: so aparece quando ele vai mexer nelas. "Trocar" e o
/// unico caso em que o envio apaga algo no Bling (ele so tira foto com a lista vazia), por isso vem dito.
function textoDaAcaoDeFotos(fotos) {
  if (fotos.acao === "acrescentar") return `O Sincronizar envia ${fotos.quantasEnviar} foto(s) que faltam no Bling.`;
  if (fotos.acao === "substituir") return "O Sincronizar troca as fotos do Bling pelas do Rise.";
  return null;
}

/**
 * As fotos dos dois lados. So aparece quando algum lado tem foto (caixa sem dado some). A comparacao e pelo
 * CONTEUDO das fotos (o Bling guarda o arquivo identico ao enviado), nao so pela quantidade; sem conseguir abrir
 * alguma, cai na quantidade e diz. Foto so no Bling (o Rise nao tem nenhuma) fica em cinza: nada e enviado, foto
 * vazia no Rise nunca apaga.
 */
function BlocoDeFotos({ fotos }) {
  if (!fotos || (fotos.rise.total === 0 && fotos.bling.total === 0)) return null;
  const soNoBling = fotos.rise.total === 0;
  const tom = soNoBling ? "border-borda bg-fundo/60 text-suave" : fotos.diferente ? "border-amber-200 bg-amber-50/50" : "border-borda";
  let estado = "iguais";
  if (soNoBling) estado = "só tem no Bling";
  else if (fotos.acao === "acrescentar") estado = "faltam no Bling";
  else if (fotos.acao === "substituir") estado = "diferentes";
  else if (fotos.porContagem) estado = "mesma quantidade";
  const acao = fotos.podeEnviar ? textoDaAcaoDeFotos(fotos) : null;
  return (
    <section aria-label="Fotos" className={`overflow-hidden rounded-lg border ${tom}`}>
      <p className="px-4 pt-3 text-base font-semibold text-texto">
        Fotos
        <span className="ml-2 text-sm font-normal text-suave">{estado}</span>
      </p>
      <Par
        rise={
          <>
            <p className="mb-2 text-sm text-suave">{fotos.rise.total === 1 ? "1 foto" : `${fotos.rise.total} fotos`}</p>
            <Miniaturas itens={fotos.rise.itens} campo="caminho" vazio="sem foto no Rise (não será enviado)" />
          </>
        }
        bling={
          <>
            <p className="mb-2 text-sm text-suave">{fotos.bling.total === 1 ? "1 foto" : `${fotos.bling.total} fotos`}</p>
            <Miniaturas itens={fotos.bling.itens} campo="miniatura" vazio="sem foto no Bling" />
          </>
        }
      />
      {(acao || fotos.motivo) && (
        <div className="space-y-1 border-t border-borda px-4 py-3 text-sm">
          {acao && <p className="text-amber-900">{acao}</p>}
          {fotos.motivo && <p className="text-amber-800">{fotos.motivo}</p>}
        </div>
      )}
    </section>
  );
}

/**
 * As diferencas e quantos campos sao iguais. Os iguais ficam so na contagem: a leitura devolve o
 * numero, nao a lista deles, e os rotulos dos campos vivem numa lib de servidor que o navegador nao
 * importa.
 */
/// Rotulo e valor de um campo do vinculo do fornecedor, como o operador le.
const ROTULO_DO_VINCULO = { precoCusto: "Custo", codigo: "Código", descricao: "Descrição", padrao: "Padrão" };
function valorDoVinculo(campo, valor) {
  if (valor === null || valor === undefined || valor === "") return "vazio";
  if (campo === "precoCusto") return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (campo === "padrao") return valor ? "sim" : "não";
  return String(valor);
}

function ValorDoVinculo({ campo, valor, destaque = false }) {
  return (
    <>
      <span className="block text-sm text-suave">{ROTULO_DO_VINCULO[campo] ?? campo}</span>
      <span className={`block text-base tabular-nums ${destaque ? "font-medium" : ""}`}>{valorDoVinculo(campo, valor)}</span>
    </>
  );
}

/**
 * Os FORNECEDORES, Rise x Bling (23/10/2026: o dono viu "Nenhuma diferença" com o "!" aceso: era o custo do
 * fornecedor, que a tela nao mostrava). So aparece quando ha diferenca, falta ou erro de leitura: fornecedor igual fica
 * so na contagem, como os campos.
 */
function BlocoDeFornecedores({ fornecedores }) {
  if (!fornecedores) return null;
  const pendentes = (fornecedores.itens ?? []).filter((item) => item.situacao !== "igual");
  if (pendentes.length === 0 && !fornecedores.erro) return null;
  return (
    <section aria-label="Fornecedores" className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/50">
      <h3 className="px-4 pt-3 text-base font-semibold">Fornecedores</h3>
      {fornecedores.erro && <p className="px-4 pt-1 text-sm text-amber-900">{fornecedores.erro}</p>}
      <ul>
        {pendentes.map((item) => (
          <li key={item.nome} className="border-t border-borda first:border-t-0">
            <p className="px-4 pt-3 text-base font-medium">{item.nome}</p>
            {item.situacao === "falta" ? (
              <Par
                rise={<span className="text-base">Ligado a este produto</span>}
                bling={<span className="text-base italic text-suave">Não está ligado (o Sincronizar liga)</span>}
              />
            ) : (
              item.diferencas.map((diferenca) => (
                <Par
                  key={diferenca.campo}
                  rise={<ValorDoVinculo campo={diferenca.campo} valor={diferenca.rise} destaque />}
                  bling={<ValorDoVinculo campo={diferenca.campo} valor={diferenca.bling} />}
                />
              ))
            )}
          </li>
        ))}
      </ul>
      <p className="border-t border-borda px-4 py-3 text-sm text-suave">O Sincronizar envia os fornecedores do Rise ao Bling.</p>
    </section>
  );
}

/// Quantos itens divergem entre o Rise e o Bling: campo "diferente" (o "so tem no Bling" nao conta, como na LI), fotos,
/// fornecedores e ajuste de estoque ainda nao enviado (e o unico jeito de o estoque do Rise diferir do saldo do Bling).
/// Sem nenhum, a janela mostra so a frase "Nenhuma diferenca" (pedido do dono em 26/10/2026).
function contarDivergencias(leitura, estoque) {
  const fornecedores = leitura.fornecedores;
  const nosFornecedores = (fornecedores?.itens ?? []).filter((item) => item.situacao !== "igual").length + (fornecedores?.erro ? 1 : 0);
  const nosCampos = (leitura.diferencas ?? []).filter((item) => item.tipo === "diferente").length;
  return nosCampos + (leitura.fotos?.diferente ? 1 : 0) + nosFornecedores + ((estoque?.pendentes ?? 0) > 0 ? 1 : 0);
}

function Diferencas({ existe, divergencias, diferencas, fotos, fornecedores, iguais, lerDeNovo, lendo, children }) {
  const textoDosIguais = `${iguais} ${iguais === 1 ? "campo igual" : "campos iguais"}`;
  const semDivergencia = existe && divergencias === 0;

  return (
    <section aria-label="Comparação entre o Rise e o Bling" className="space-y-4 pt-5">
      {existe && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {semDivergencia ? (
            <p className={`rounded-md border px-4 py-2 text-base ${CLASSE_DO_TOM.ok}`}>Nenhuma diferença: {textoDosIguais} no Rise e no Bling.</p>
          ) : (
            <p className="text-base">
              <span className="font-semibold">{divergencias} item(ns) diferente(s)</span> entre o produto salvo no Rise e o Bling.
            </p>
          )}
          <button
            type="button"
            onClick={lerDeNovo}
            disabled={lendo}
            className="inline-flex items-center gap-2 rounded-md border border-borda px-4 py-2 text-sm hover:bg-fundo disabled:opacity-60"
          >
            {lendo ? <Loader size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            Ler o Bling de novo
          </button>
        </div>
      )}

      {!semDivergencia && <CabecalhoDasColunas existe={existe} />}

      {/* Igual dos dois lados: nada de fotos, estoque nem campos, so a frase de cima (e os avisos, que sao de verdade). */}
      {!semDivergencia && diferencas.length > 0 && (
        <ul className="space-y-3">
          {diferencas.map((item) => (
            <LinhaDeDiferenca key={item.campo} item={item} />
          ))}
        </ul>
      )}
      {!semDivergencia && <BlocoDeFotos fotos={fotos?.diferente ? fotos : null} />}
      {!semDivergencia && <BlocoDeFornecedores fornecedores={fornecedores} />}
      {!semDivergencia && iguais > 0 && diferencas.length > 0 && <p className="text-sm text-suave">{textoDosIguais} no Rise e no Bling.</p>}
      {children}
    </section>
  );
}

export default function JanelaBling({ produto, aoFechar }) {
  // null = lendo o Bling (a abertura e o "Ler de novo"). Depois de um envio a janela mantem a leitura
  // antiga na tela enquanto le a nova (`qual` = "lendo"), para o conteudo nao piscar.
  const [leitura, setLeitura] = useState(null);
  const [ocupado, iniciarTransicao] = useTransition();
  // O que roda agora, so para o botao certo dizer "Enviando...": "sincronizar", "cadastrar", "estoque"
  // ou "lendo" (a releitura que vem depois do envio).
  const [qual, setQual] = useState(null);
  const [erro, setErro] = useState(null);
  const [envio, setEnvio] = useState(null);
  // O aviso de conclusao (popup com OK) de um envio que deu certo; `null` = nenhum aberto.
  const [conclusao, setConclusao] = useState(null);
  // O popup de etapas do Sincronizar e do Cadastrar: `{ tipo, etapas, fim, resumo, aviso }`; `null` = fechado.
  const [andamento, setAndamento] = useState(null);
  // O Bling tem mais de um deposito e nenhum padrao: `{lista, motivo}` ate o operador escolher.
  const [depositos, setDepositos] = useState(null);
  const [deposito, setDeposito] = useState(null);
  const foco = useRef(null);
  // As respostas chegam depois de um await: se a janela foi fechada nesse meio tempo, nada a fazer.
  const montada = useRef(false);
  // A leitura da abertura sai UMA vez por abertura. No modo de desenvolvimento o React monta, desmonta
  // e monta o efeito de novo; sem isto cada abertura leria o Bling duas vezes (duas chamadas da conta,
  // que tem limite), e a primeira resposta seria jogada fora.
  const leituraIniciada = useRef(false);

  useEffect(() => {
    montada.current = true;
    // O foco entra na janela ao abrir (senao fica no icone, atras do fundo escuro e fora do alcance de
    // quem usa o teclado), como na janela do Mercado Livre. Sem prender o foco: so a entrada.
    foco.current?.focus();
    if (!leituraIniciada.current) {
      leituraIniciada.current = true;
      (async () => {
        const lida = await chamar(abrirJanelaBling, [produto.id], false);
        if (montada.current) setLeitura(lida);
      })();
    }
    return () => {
      montada.current = false;
    };
  }, [produto.id]);

  // O Esc fecha a janela. Efeito proprio: `aoFechar` muda a cada render da lista, e se ele entrasse no efeito
  // da abertura o foco voltaria para a janela toda hora.
  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const carregando = leitura === null;
  const pendente = carregando || ocupado;

  /**
   * Roda um envio e conta o resultado. Depois, se o Bling pode ter mudado (`mudouNoBling`), le de novo
   * para a janela mostrar o estado de agora (e o saldo novo). A mensagem da acao vai em vermelho; o que
   * ja foi enviado antes de uma falha vai no quadro do resultado. Os rotulos dos campos vem das
   * diferencas que a janela mostrava ANTES de enviar: o resultado traz so o id do campo.
   */
  function enviar(tipo, executar) {
    setErro(null);
    setEnvio(null);
    setConclusao(null);
    setDepositos(null);
    setQual(tipo);
    const rotulos = Object.fromEntries((leitura?.diferencas ?? []).map((item) => [item.campo, item.rotulo]));

    // Sincronizar e Cadastrar abrem o popup de etapas e o mantem em dia lendo o andamento do servidor (uma rota, e nao uma
    // Server Action: as acoes rodam uma de cada vez e a consulta esperaria o envio acabar). So vale o andamento de um envio
    // NOVO (numero maior que o de antes de enviar): o de um envio anterior fica na memoria ate o servidor abrir o novo, e uma
    // acao recusada antes de comecar nunca abre o dela.
    const comEtapas = ENVIOS_COM_ETAPAS.has(tipo);
    if (comEtapas) setAndamento({ tipo, etapas: etapasIniciais(tipo), fim: null, resumo: null, aviso: null });
    let relogio = null;

    iniciarTransicao(async () => {
      try {
        let numeroDeAntes = 0;
        if (comEtapas) {
          numeroDeAntes = (await lerAndamentoNoServidor(produto.id))?.numero ?? 0;
          relogio = setInterval(async () => {
            const lido = await lerAndamentoNoServidor(produto.id);
            if (!lido || lido.numero <= numeroDeAntes || lido.terminou || !montada.current) return;
            setAndamento((atual) => (atual && !atual.fim ? { ...atual, etapas: mesclarEtapas(atual.etapas, lido.etapas) } : atual));
          }, 400);
        }
        const resultado = await executar();
        const resumo = resumirEnvio(tipo, resultado, rotulos);
        const aviso = resultado.aviso ?? null;
        if (relogio) {
          clearInterval(relogio);
          relogio = null;
          // A ultima palavra e a do servidor: o andamento final (com o envio terminado) e o resultado da acao.
          const final = await lerAndamentoNoServidor(produto.id);
          if (montada.current) {
            setAndamento((atual) => {
              if (!atual) return atual;
              const base = final && final.numero > numeroDeAntes ? mesclarEtapas(atual.etapas, final.etapas) : atual.etapas;
              return { ...atual, etapas: etapasComOResultado(base, resultado) };
            });
          }
        }
        if (resultado.ok === true && !comEtapas) {
          // Deu certo: o popup com OK conta o que foi feito (pedido do dono em 14/10/2026). A falha, ou o que foi
          // enviado antes dela, continua no quadro da janela, onde o operador a le enquanto decide.
          setConclusao({
            titulo: TITULO_DA_CONCLUSAO[tipo] ?? "Envio concluído",
            mensagem: resumo?.titulo ?? null,
            linhas: resumo?.linhas ?? [],
            aviso,
          });
        } else if (resultado.ok !== true) {
          setEnvio(resumo || aviso ? { ok: false, titulo: resumo?.titulo ?? null, linhas: resumo?.linhas ?? [], aviso } : null);
        }

        if (!resultado.ok) {
          if (Array.isArray(resultado.precisaDeposito) && resultado.precisaDeposito.length > 0) {
            // Nada foi enviado: a lib quer saber em qual deposito lancar. A mensagem dela e a pergunta.
            setDeposito(null);
            setDepositos({ lista: resultado.precisaDeposito, motivo: resultado.erro });
          } else {
            setErro(resultado.erro ?? "O envio não foi concluído.");
          }
        }

        // A ultima etapa do popup e a releitura do Bling (so quando o envio mexeu la): "Conferir o resultado no Bling".
        const releu = mudouNoBling(tipo, resultado);
        if (comEtapas && releu && resultado.ok === true) {
          setAndamento((atual) => (atual ? { ...atual, etapas: atual.etapas.map((etapa) => (etapa.id === "conferir" ? { ...etapa, estado: "andando" } : etapa)) } : atual));
        }
        if (releu) {
          setQual("lendo");
          setLeitura(await chamar(abrirJanelaBling, [produto.id], false));
        }

        // O fim do popup so depois da releitura: o "Fechar" nao pode aparecer com a janela de tras ainda velha.
        if (comEtapas && montada.current) {
          const deuCerto = resultado.ok === true;
          setAndamento((atual) =>
            atual
              ? {
                  ...atual,
                  etapas: deuCerto ? atual.etapas.map((etapa) => (etapa.id === "conferir" ? { ...etapa, estado: "feito" } : etapa)) : atual.etapas,
                  fim: deuCerto ? "ok" : "falhou",
                  resumo,
                  aviso,
                }
              : atual,
          );
        }
      } finally {
        if (relogio) clearInterval(relogio);
        // Rede de seguranca: se algo inesperado cortou o caminho de cima, o popup nao fica girando para sempre.
        if (comEtapas && montada.current) setAndamento((atual) => (atual && !atual.fim ? { ...atual, fim: "falhou" } : atual));
        setQual(null);
      }
    });
  }

  function lerDeNovo() {
    setErro(null);
    setEnvio(null);
    setDepositos(null);
    setLeitura(null);
    iniciarTransicao(async () => {
      setLeitura(await chamar(abrirJanelaBling, [produto.id], false));
    });
  }

  const sincronizar = () => enviar("sincronizar", () => chamar(sincronizarComBling, [produto.id], true));
  const cadastrar = () => enviar("cadastrar", () => chamar(cadastrarProdutoNoBling, [produto.id], true));
  const enviarEstoque = (depositoId) =>
    enviar("estoque", () => chamar(enviarEstoqueAoBling, depositoId === undefined ? [produto.id] : [produto.id, depositoId], true));

  // O botao principal do rodape e o envio que faz sentido no estado da janela.
  let principal;
  if (carregando) principal = { rotulo: "Lendo o Bling...", executar: () => {} };
  else if (!leitura.ok) principal = { rotulo: "Ler de novo", executar: lerDeNovo };
  else if (leitura.situacao === "nao_existe") principal = { rotulo: "Cadastrar no Bling", executar: cadastrar };
  else principal = { rotulo: "Sincronizar com o Bling", executar: sincronizar };

  let rotuloDoBotao = principal.rotulo;
  if (qual === "sincronizar" || qual === "cadastrar") rotuloDoBotao = "Enviando...";
  else if (qual === "lendo") rotuloDoBotao = "Atualizando...";

  const avisos = leitura?.avisos ?? [];
  const estoque = leitura?.estoque ?? null;
  // Sem o sku a leitura falhou antes de achar o produto no Rise: nao ha estoque a mostrar.
  const mostraEstoque = Boolean(estoque && leitura?.sku);
  const existeNoBling = Boolean(leitura?.ok && leitura.situacao === "existe");
  const divergencias = existeNoBling ? contarDivergencias(leitura, estoque) : 0;
  // Com o Bling lido e igual, o estoque nao aparece (so a frase "Nenhuma diferenca"); com divergencia, so se ha ajuste a enviar.
  const mostraEstoqueNaTela = mostraEstoque && (!existeNoBling || estoque.pendentes > 0);
  const escritaBloqueada = leitura?.ok && leitura.escrita?.liberada === false;
  // Edicao do produto no Bling (`produtos.php#edit/<id>`), so com o id numerico lido do proprio Bling.
  const linkDoBling = /^\d+$/.test(String(leitura?.blingId ?? "")) ? `https://www.bling.com.br/produtos.php#edit/${leitura.blingId}` : null;
  const temAviso = Boolean(erro || envio);

  // Presa no ALTO, como a do editor da Loja Integrada: centralizada, ela subia e descia a cada leitura.
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 pt-[4vh] text-left font-normal normal-case"
      {...propsDoFundo(() => aoFechar())}
    >
      <section
        ref={foco}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Sincronização com o Bling"
        aria-busy={pendente}
        className="flex max-h-full w-full max-w-5xl flex-col rounded-lg border border-borda bg-superficie shadow-2xl focus:outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-borda px-6 py-4">
          <div className="min-w-0">
            <p className="text-xl font-semibold">Sincronização com o Bling</p>
            <p className="mt-1 truncate text-base text-suave">
              <span className="font-mono">{produto.sku}</span> · {produto.tituloBase}
            </p>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-md p-2 text-suave hover:bg-fundo">
            <X size={20} />
          </button>
        </header>

        {temAviso && (
          <div className="shrink-0 space-y-2 px-6 pt-4">
            {erro && (
              <p role="alert" className={`rounded-md border px-4 py-2.5 text-base ${CLASSE_DO_TOM.erro}`}>
                {erro}
              </p>
            )}
            {envio && (
              <div role="status" className={`rounded-md border px-4 py-2.5 text-base ${CLASSE_DO_TOM[envio.ok ? "ok" : "atencao"]}`}>
                {envio.titulo && (
                  <p className="flex items-start gap-2 font-medium">
                    {envio.ok && <CircleCheck size={18} className="mt-0.5 shrink-0" />}
                    {envio.titulo}
                  </p>
                )}
                {envio.linhas.length > 0 && (
                  <ul className="mt-1 max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm">
                    {envio.linhas.map((linha, indice) => (
                      <li key={`${indice}-${linha}`}>{linha}</li>
                    ))}
                  </ul>
                )}
                {envio.aviso && <p className={envio.titulo ? "mt-1 text-sm" : "text-sm"}>{envio.aviso}</p>}
              </div>
            )}
          </div>
        )}

        {/* A aba "Divergencias (N)" so existe quando o Rise e o Bling diferem, no molde do editor da LI e do ML. */}
        {!carregando && divergencias > 0 && (
          <div className="shrink-0 px-2">
            <BarraDeAbas abas={[{ id: "divergencias", rotulo: `Divergências (${divergencias})` }]} aba="divergencias" aoMudar={() => {}} comErro={() => true} />
          </div>
        )}

        {/* Sem padding em cima: a faixa Rise/Bling gruda no topo ao rolar, e o espaco acima dela vem de cada bloco. */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-6">
          {carregando ? (
            <p role="status" className="flex items-center gap-2 py-6 text-base text-suave">
              <Loader size={18} className="animate-spin" />
              Lendo o Bling...
            </p>
          ) : (
            <>
              {!leitura.ok && (
                <p role="alert" className={`mt-5 rounded-md border px-4 py-2.5 text-base ${CLASSE_DO_TOM.erro}`}>
                  {leitura.erro ?? "Não foi possível ler o Bling."}
                </p>
              )}

              {leitura.ok && leitura.situacao === "nao_existe" && (
                <section aria-label="Produto fora do Bling" className="mt-5 rounded-lg border border-borda bg-fundo p-4 text-base">
                  <p className="font-medium">Este código não está no Bling</p>
                  <p className="mt-1 text-sm text-suave">
                    O código <span className="font-mono">{leitura.sku}</span> não foi achado entre os produtos ativos do Bling.
                    &quot;Cadastrar no Bling&quot; cria o produto lá com os dados do Rise. Se ele existe inativo no Bling, reative-o
                    lá em vez de cadastrar.
                  </p>
                </section>
              )}

              {(existeNoBling || mostraEstoqueNaTela) && (
                <Diferencas
                  existe={existeNoBling}
                  divergencias={divergencias}
                  diferencas={leitura.diferencas ?? []}
                  fotos={leitura.fotos ?? null}
                  fornecedores={leitura.fornecedores ?? null}
                  iguais={leitura.iguais ?? 0}
                  lerDeNovo={lerDeNovo}
                  lendo={pendente}
                >
                  {avisos.length > 0 && (
                    <ul className={`space-y-1 rounded-lg border p-4 text-sm ${CLASSE_DO_TOM.atencao}`}>
                      {avisos.map((aviso, indice) => (
                        <li key={`${indice}-${aviso}`}>{aviso}</li>
                      ))}
                    </ul>
                  )}

                  {mostraEstoqueNaTela && (
                    <section aria-label="Estoque" className="overflow-hidden rounded-lg border border-borda">
                      <p className="px-4 pt-3 text-base font-semibold">Estoque</p>
                      <Par
                        rise={
                          <dl className="flex gap-10">
                            <div>
                              <dt className="text-sm text-suave">Estoque no Rise</dt>
                              <dd className="text-2xl font-semibold tabular-nums">{estoque.riseEstoque}</dd>
                            </div>
                            <div>
                              <dt className="text-sm text-suave">Ajustes pendentes</dt>
                              <dd className="text-2xl font-semibold tabular-nums">{estoque.pendentes}</dd>
                            </div>
                          </dl>
                        }
                        bling={
                          <dl>
                            <dt className="text-sm text-suave">Saldo no Bling</dt>
                            <dd className="text-2xl font-semibold tabular-nums">{estoque.blingSaldo ?? "não lido"}</dd>
                            {/* Sem leitura agora (codigo fora do Bling ou erro), o saldo e o ultimo guardado no Rise. */}
                            {estoque.blingSaldo !== null && (
                              <dd className="text-sm text-suave">{existeNoBling ? "lido agora" : "último lido"}</dd>
                            )}
                          </dl>
                        }
                      />
                      <div className="space-y-3 border-t border-borda px-4 py-3">
                        <p className="text-sm text-suave">O estoque do Rise é o saldo do Bling mais os ajustes ainda não enviados.</p>

                        {existeNoBling && estoque.pendentes > 0 && !depositos && (
                          <button type="button" onClick={() => enviarEstoque()} disabled={pendente} className={CLASSE_DO_BOTAO_SECUNDARIO}>
                            {qual === "estoque" && <Loader size={15} className="animate-spin" />}
                            {qual === "estoque" ? "Enviando..." : "Enviar ajustes de estoque"}
                          </button>
                        )}

                        {depositos && (
                          <fieldset className={`rounded-lg border p-4 ${CLASSE_DO_TOM.atencao}`}>
                            <legend className="px-1 text-sm font-medium">Escolha o depósito</legend>
                            <p className="text-sm">{depositos.motivo}</p>
                            {/* O Enter num radio enviaria o formulario inteiro, e o botao principal do rodape e
                                outro envio (sincronizar): aqui o Enter nao faz nada. */}
                            <div
                              className="mt-2 space-y-1.5"
                              onKeyDown={(evento) => {
                                if (evento.key === "Enter") evento.preventDefault();
                              }}
                            >
                              {depositos.lista.map((item) => (
                                <label key={item.id} className="flex cursor-pointer items-center gap-2 text-base">
                                  <input
                                    type="radio"
                                    name="deposito-bling"
                                    checked={deposito === item.id}
                                    onChange={() => setDeposito(item.id)}
                                    disabled={pendente}
                                  />
                                  {item.descricao || `Depósito ${item.id}`}
                                </label>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => enviarEstoque(deposito)}
                              disabled={pendente || deposito === null}
                              className={`mt-3 ${CLASSE_DO_BOTAO_SECUNDARIO}`}
                            >
                              {qual === "estoque" && <Loader size={15} className="animate-spin" />}
                              {qual === "estoque" ? "Enviando..." : "Enviar ajustes neste depósito"}
                            </button>
                          </fieldset>
                        )}
                      </div>
                    </section>
                  )}
                </Diferencas>
              )}

              {!existeNoBling && !mostraEstoqueNaTela && avisos.length > 0 && (
                <ul className={`mt-5 space-y-1 rounded-lg border p-4 text-sm ${CLASSE_DO_TOM.atencao}`}>
                  {avisos.map((aviso, indice) => (
                    <li key={`${indice}-${aviso}`}>{aviso}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-borda px-6 py-4">
          {/* A trava fechada nao esconde o botao: o motivo fica aqui, em uma linha, e o clique devolve o mesmo
              motivo em vermelho. */}
          <div className="flex min-w-0 flex-1 items-center gap-3 text-sm">
            {/* O produto no Bling, em outra aba (pedido do dono em 24/10/2026): so com o produto ja la. */}
            {linkDoBling && (
              <a
                href={linkDoBling}
                target="_blank"
                rel="noreferrer"
                title="Abre o produto no Bling, em outra aba"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-borda px-3.5 py-2 font-medium text-acento hover:bg-fundo"
              >
                Abrir no Bling <ExternalLink size={14} />
              </a>
            )}
            <p className="min-w-0 flex-1 truncate text-amber-800" title={escritaBloqueada ? leitura.escrita.motivo : undefined}>
              {escritaBloqueada && (
                <>
                  <span className="font-medium">Envio ao Bling bloqueado.</span> {leitura.escrita.motivo}
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={aoFechar}
              disabled={ocupado}
              className="rounded-md border border-borda px-5 py-2.5 text-base hover:bg-fundo disabled:opacity-50"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={principal.executar}
              disabled={pendente}
              className="inline-flex items-center gap-2 rounded-md bg-acento px-5 py-2.5 text-base font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pendente && <Loader size={16} className="animate-spin" />}
              {rotuloDoBotao}
            </button>
          </div>
        </footer>
      </section>

      {conclusao && <ConclusaoDoEnvio {...conclusao} aoFechar={() => setConclusao(null)} />}

      {/* O andamento do Sincronizar e do Cadastrar: "Fechar" (deu certo) fecha este popup e a janela; "Voltar à janela" (falhou) so este. */}
      {andamento && (
        <AndamentoDoEnvio
          tipo={andamento.tipo}
          sku={produto.sku}
          etapas={andamento.etapas}
          fim={andamento.fim}
          resumo={andamento.resumo}
          aviso={andamento.aviso}
          aoFechar={aoFechar}
          aoVoltar={() => setAndamento(null)}
        />
      )}
    </div>
  );
}
