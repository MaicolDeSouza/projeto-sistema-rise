"use client";

import { propsDoFundo } from "@/lib/fundoDaJanela";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, ExternalLink, Loader, X } from "lucide-react";

import { abrirAnuncioLI, listarCategoriasLI, salvarAnuncioLI, vinculoBlingLI } from "@/app/canais-de-venda/loja-integrada/acoes";
import { abrirJanelaLI, cadastrarProdutoNaLI, completarCadastroNaLI, confirmarAjusteFiscalNaLI, sincronizarComLI } from "@/app/produtos/acoes-li";
import { BarraDeAbas, Painel } from "@/components/cadastros/Abas";
import ConclusaoDoEnvio from "@/components/ui/ConclusaoDoEnvio";
import AndamentoDoEnvio from "@/components/produtos/AndamentoDoEnvio";
import { etapasComOResultado, etapasIniciais, lerAndamentoNoServidor, mesclarEtapas } from "@/lib/andamentoDoEnvio";
import { ETAPAS_DO_ENVIO_LI, mudouNaLI, resumirEnvioLI, resumoDasDivergenciasLI } from "@/lib/canaisDeVenda/li/apresentacao";
import { ROTULO_DA_ETAPA_LI, faltaNoCadastroLI, ofereceCompletar } from "@/lib/canaisDeVenda/li/etapasCadastro";
import { ABAS_LI, validarRascunhoLI } from "@/lib/canaisDeVenda/li/validacao";
import AbaCategorias from "./AbaCategorias";
import AbaDescricao from "./AbaDescricao";
import AbaDivergencias from "./AbaDivergencias";
import AbaGeral from "./AbaGeral";
import AbaImagens from "./AbaImagens";
import AbaStatus, { situacaoDoBling } from "./AbaStatus";
import AbaSEO from "./AbaSEO";
import AcoesDoFimDoEnvio from "./AcoesDoFimDoEnvio";
import { AbaEnvio, AbaFiscal, linkDoPainelLI } from "./AbasDeLeitura";

/// A rota que devolve o andamento do envio que o servidor esta fazendo (`lib/canaisDeVenda/li/progresso.js`).
const ROTA_DO_ANDAMENTO = "/api/loja-integrada/progresso";

// Uma aba por id de `ABAS_LI`: aba nova na validacao pede o componente aqui.
const ABAS_PRONTAS = {
  status: AbaStatus,
  geral: AbaGeral,
  imagens: AbaImagens,
  descricao: AbaDescricao,
  categorias: AbaCategorias,
  envio: AbaEnvio,
  fiscal: AbaFiscal,
  seo: AbaSEO,
};

const CLASSE_DA_MENSAGEM = {
  erro: "border-red-200 bg-red-50 text-red-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  atencao: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-borda bg-fundo text-texto",
};

async function chamar(acao, ...argumentos) {
  try {
    return await acao(...argumentos);
  } catch {
    return { ok: false, erro: "Não foi possível falar com o servidor." };
  }
}

/** O envio cuja resposta se perdeu pode ter chegado a loja: a mensagem manda conferir antes. */
async function chamarEnvio(acao, produtoId) {
  try {
    return await acao(produtoId);
  } catch {
    return { ok: false, erro: "A resposta do servidor se perdeu. A Loja Integrada pode ter recebido o envio: confira na loja antes de tentar de novo." };
  }
}

/** Diferenca de verdade (o selo do icone): "so tem na loja" nao e divergencia, vazio nunca apaga. */
// As fotos contam como uma divergencia quando o Sincronizar mudaria as da loja (`resumoDasFotosLI`).
// Desde 25/10/2026 conta tambem o que so o painel da LI corrige (origem e tipo de producao); e desde 26/10/2026 o "Ativo na
// loja" diferente do Rise entra como campo: o "!" do icone acusa esses motivos, e a aba tem de mostra-los
// (`resumoDasDivergenciasLI`).
const divergenciasDe = (leitura) => resumoDasDivergenciasLI(leitura).total;

/**
 * Editor do anuncio da Loja Integrada, na casca do editor do Mercado Livre: estado controlado sem
 * `<form>`, as abas montadas e so escondidas, Salvar no rodape, e no modo janela o Esc e o
 * "Sair sem salvar?".
 *
 * Desde 07/10/2026 (pedidos do dono) o editor tambem e o pop-up do icone da lista de Produtos:
 * - ao abrir le a loja (`abrirJanelaLI`, so leitura; na primeira vez de um produto que ja existe la,
 *   grava o vinculo) e, havendo campo diferente, poe a aba "Divergencias" como a PRIMEIRA;
 * - o rodape tem "Sincronizar com a LI" ("Cadastrar na LI" se o produto nao esta na loja), sob as
 *   mesmas travas. O envio le o anuncio SALVO: com alteracao na tela, pergunta "Salvar e
 *   sincronizar" antes (sem a opcao de enviar sem salvar);
 * - "Editar produto" (Descricao, Fiscal, Envio) abre o cadastro na mesma aba e, com alteracao nao
 *   salva, pergunta antes.
 *
 * Tambem le as categorias da loja (a validacao de categoria que sumiu).
 * Falha em qualquer leitura nao impede editar nem salvar.
 */
/// Sem `acessos` o editor e o de sempre, sem restricao. O calculo de verdade e `acessosDoEditorLI`
/// (src/lib/acessos/projecoes.js), feito no servidor (paginas e acoes de abrir).
const ACESSO_TOTAL_LI = { editar: true, sincronizar: true, concorrentes: true };

export default function EditorAnuncioLI({ anuncioId, rascunhoInicial, contextoInicial, vinculo, modo = "pagina", aoSalvar, aoFechar, acessos = ACESSO_TOTAL_LI }) {
  const router = useRouter();
  const [rascunho, setRascunho] = useState(rascunhoInicial);
  const [contexto, setContexto] = useState(contextoInicial);
  const [aba, setAba] = useState(ABAS_LI[0].id);
  const [mensagem, setMensagem] = useState(null);
  const [idAtual, setIdAtual] = useState(anuncioId ?? null);
  const [vinculoAtual, setVinculoAtual] = useState(vinculo ?? null);
  const [salvo, setSalvo] = useState(rascunhoInicial);
  const [leitura, setLeitura] = useState(null);
  const [bling, setBling] = useState(null);
  const [lendo, setLendo] = useState(true);
  const [envio, setEnvio] = useState(null);
  // O popup com OK de um envio que deu certo (padrao de sincronizacao, pedido do dono em 14/10/2026).
  const [conclusao, setConclusao] = useState(null);
  // O popup de etapas do Sincronizar e do Cadastrar: `{ tipo, etapas, fim, resumo }`; `null` = fechado.
  const [andamento, setAndamento] = useState(null);
  const [pergunta, setPergunta] = useState(null);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const [ocupado, iniciarTrabalho] = useTransition();
  const [qual, setQual] = useState(null);
  const caixaDaMensagem = useRef(null);
  const secaoDaJanela = useRef(null);
  const montado = useRef(false);
  const abaEscolhida = useRef(false);
  const alteradoRef = useRef(false);

  const produtoId = rascunho.produtoId ?? contexto.produto?.id ?? null;
  const alterado = rascunho !== salvo;
  const janela = modo === "janela";
  // O primeiro Salvar de um anuncio novo na pagina troca a URL e remonta o editor: o que fosse
  // digitado nesse intervalo se perderia (mesma regra do editor do ML).
  const travado = ocupado && idAtual === null && modo === "pagina";
  // Tela em `ver` (Acessos): paineis travados, abas navegaveis, sem Salvar nem Sincronizar.
  const somenteLeitura = !acessos.editar;
  const problemas = useMemo(
    () => validarRascunhoLI(rascunho, { produto: contexto.produto, categoriasDaLI: contexto.categoriasDaLI ?? null, gtinDaLI: leitura?.daLoja?.gtin ?? null }),
    [rascunho, contexto, leitura],
  );
  // Problema que impede o envio (peso e medidas, SEO, produto nao Conferido): o botao fica desabilitado com o motivo no
  // title, e a aba Status lista (pedido do dono em 26/10/2026, sobre peso e dimensoes).
  const primeiroBloqueioDaTela = problemas.find((problema) => problema.bloqueante) ?? null;
  const divergencias = divergenciasDe(leitura);
  const abas = useMemo(() => (divergencias > 0 ? [{ id: "divergencias", rotulo: `Divergências (${divergencias})` }, ...ABAS_LI] : ABAS_LI), [divergencias]);
  const abaVisivel = abas.some((item) => item.id === aba) ? aba : ABAS_LI[0].id;

  useEffect(() => {
    alteradoRef.current = alterado;
  }, [alterado]);

  const recarregarCategorias = useCallback(async () => {
    setContexto((atual) => ({ ...atual, carregandoCategorias: true, erroDasCategorias: null }));
    const resultado = await chamar(listarCategoriasLI);
    if (!montado.current) return;
    setContexto((atual) =>
      resultado.ok
        ? { ...atual, categoriasDaLI: resultado.categorias, carregandoCategorias: false, erroDasCategorias: null }
        : { ...atual, carregandoCategorias: false, erroDasCategorias: resultado.erro },
    );
  }, []);

  /**
   * Le a loja. Quando a leitura acabou de VINCULAR o produto (categorias e destaque vieram da loja
   * para o anuncio salvo), o editor recarrega o anuncio, se nada foi mexido na tela.
   */
  const lerLoja = useCallback(async () => {
    if (!produtoId) return;
    setLendo(true);
    const lida = await chamar(abrirJanelaLI, produtoId);
    if (!montado.current) return;
    setLeitura(lida);
    setLendo(false);
    // O vinculo do produto com o canal da LI DENTRO do Bling (so leitura): e ele que leva estoque e
    // pedidos. Corre em paralelo, sem segurar a tela.
    chamar(vinculoBlingLI, produtoId).then((lido) => {
      if (montado.current) setBling(lido);
    });
    if (lida.ok && lida.idExterno) {
      setVinculoAtual((atual) => ({ ...(atual ?? {}), idExterno: lida.idExterno, urlExterna: lida.urlExterna ?? atual?.urlExterna ?? null }));
    }
    if (lida.vinculadoAgora && lida.anuncioId) {
      if (alteradoRef.current) {
        setMensagem({ tipo: "atencao", texto: "O anúncio acabou de ser vinculado à loja: as categorias e o destaque de lá foram gravados. Salvar agora troca pelos da tela." });
      } else {
        const aberto = await chamar(abrirAnuncioLI, lida.anuncioId);
        if (!montado.current || !aberto.ok) return;
        setRascunho(aberto.rascunho);
        setSalvo(aberto.rascunho);
        setIdAtual(aberto.anuncioId);
        setVinculoAtual(aberto.vinculo);
      }
    }
    if (divergenciasDe(lida) > 0 && !abaEscolhida.current) setAba("divergencias");
  }, [produtoId]);

  useEffect(() => {
    montado.current = true;
    (async () => {
      // A lista de marcas da loja saiu daqui (26/10/2026): a marca e so leitura e o Sincronizar a acha ou a cria.
      await Promise.all([lerLoja(), recarregarCategorias()]);
    })();
    return () => {
      montado.current = false;
    };
  }, [recarregarCategorias, lerLoja]);

  useEffect(() => {
    if (mensagem?.tipo === "erro") caixaDaMensagem.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [mensagem]);

  useEffect(() => {
    if (janela) secaoDaJanela.current?.focus();
  }, [janela]);

  const pedirFechamento = useCallback(() => {
    if (ocupado) return;
    if (alterado) setConfirmandoSaida(true);
    else aoFechar?.();
  }, [ocupado, alterado, aoFechar]);

  useEffect(() => {
    if (!janela) return undefined;
    function aoTeclar(evento) {
      if (evento.key !== "Escape" || evento.repeat) return;
      if (pergunta) setPergunta(null);
      else if (confirmandoSaida) setConfirmandoSaida(false);
      else pedirFechamento();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [janela, confirmandoSaida, pergunta, pedirFechamento]);

  function mudarAba(id) {
    abaEscolhida.current = true;
    setAba(id);
  }

  function alterar(parcial) {
    setRascunho((atual) => ({ ...atual, ...(typeof parcial === "function" ? parcial(atual) : parcial) }));
    setMensagem((atual) => (atual?.tipo === "ok" ? null : atual));
  }

  /** Grava o rascunho; devolve o id salvo ou null. `avisar` chama o `aoSalvar` (a pagina troca a URL). */
  async function gravar({ avisar = true } = {}) {
    const enviado = rascunho;
    let resultado;
    try {
      resultado = await salvarAnuncioLI(idAtual, enviado);
    } catch {
      resultado = { ok: false, erro: "Não foi possível falar com o servidor. O que está na tela continua aqui: tente salvar de novo." };
    }
    if (!resultado.ok) {
      setMensagem({ tipo: "erro", texto: resultado.erro });
      return null;
    }
    setIdAtual(resultado.id);
    setSalvo(enviado);
    if (avisar) aoSalvar?.(resultado.id);
    return resultado.id;
  }

  /** Sai do editor: a janela se fecha; a pagina volta para a lista de anuncios da LI. */
  function fechar() {
    if (janela) aoFechar?.();
    else router.push("/canais-de-venda/loja-integrada");
  }

  /** "Salvar e fechar" (26/10/2026): grava e fecha; sem alteracao, so fecha. Falha ao gravar deixa o editor aberto com o erro. */
  function salvarEFechar() {
    setMensagem(null);
    setQual("salvar");
    iniciarTrabalho(async () => {
      const pronto = !alterado && idAtual !== null ? true : Boolean(await gravar({ avisar: false }));
      setQual(null);
      if (pronto) fechar();
    });
  }

  const tipoDeEnvio = leitura?.ok && leitura.situacao === "nao_existe" ? "cadastrar" : "sincronizar";

  /**
   * Sincronizar e Cadastrar abrem o popup de etapas (pedido do dono em 26/10/2026, igual ao do Bling) e o mantem em dia lendo o
   * andamento do servidor (uma rota, e nao uma Server Action: as acoes rodam uma de cada vez e a consulta esperaria o envio
   * acabar). So vale o andamento de um envio NOVO (numero maior que o de antes de enviar): o de um envio anterior fica na
   * memoria ate o servidor abrir o novo, e uma acao recusada antes de comecar nunca abre o dela. O fim do popup so vem depois da
   * releitura da loja: o "Fechar" nao pode aparecer com a janela de tras ainda velha.
   */
  async function enviar() {
    const tipo = tipoDeEnvio;
    setQual("enviar");
    const rotulos = Object.fromEntries((leitura?.diferencas ?? []).map((item) => [item.campo, item.rotulo]));
    setAndamento({ tipo, etapas: etapasIniciais(ETAPAS_DO_ENVIO_LI[tipo]), fim: null, resumo: null, aviso: null });
    let relogio = null;
    try {
      const numeroDeAntes = (await lerAndamentoNoServidor(ROTA_DO_ANDAMENTO, produtoId))?.numero ?? 0;
      relogio = setInterval(async () => {
        const lido = await lerAndamentoNoServidor(ROTA_DO_ANDAMENTO, produtoId);
        if (!lido || lido.numero <= numeroDeAntes || lido.terminou || !montado.current) return;
        setAndamento((atual) => (atual && !atual.fim ? { ...atual, etapas: mesclarEtapas(atual.etapas, lido.etapas) } : atual));
      }, 400);
      const resultado = await chamarEnvio(tipo === "cadastrar" ? cadastrarProdutoNaLI : sincronizarComLI, produtoId);
      clearInterval(relogio);
      relogio = null;
      if (!montado.current) return;
      // A ultima palavra e a do servidor: o andamento final (com o envio terminado) e o resultado da acao.
      const final = await lerAndamentoNoServidor(ROTA_DO_ANDAMENTO, produtoId);
      if (!montado.current) return;
      setAndamento((atual) => {
        if (!atual) return atual;
        const base = final && final.numero > numeroDeAntes ? mesclarEtapas(atual.etapas, final.etapas) : atual.etapas;
        return { ...atual, etapas: etapasComOResultado(base, resultado) };
      });
      const resumo = resumirEnvioLI(tipo, resultado, rotulos);
      // A falha tambem fica no quadro da janela, que o operador le depois de voltar do popup.
      if (resultado.ok !== true) {
        setEnvio(resumo ? { ok: false, titulo: resumo.titulo, linhas: resumo.linhas } : null);
        setMensagem({ tipo: "erro", texto: resultado.erro ?? "O envio não foi concluído." });
      }
      // A ultima etapa do popup e a releitura da loja (so quando o envio mexeu la): "Conferir o resultado na loja".
      const releu = mudouNaLI(tipo, resultado);
      if (releu && resultado.ok === true) {
        setAndamento((atual) => (atual ? { ...atual, etapas: atual.etapas.map((etapa) => (etapa.id === "conferir" ? { ...etapa, estado: "andando" } : etapa)) } : atual));
      }
      if (releu) {
        setQual("lendo");
        await lerLoja();
      }
      if (!montado.current) return;
      const deuCerto = resultado.ok === true;
      setAndamento((atual) =>
        atual
          ? {
              ...atual,
              etapas: deuCerto ? atual.etapas.map((etapa) => (etapa.id === "conferir" ? { ...etapa, estado: "feito" } : etapa)) : atual.etapas,
              fim: deuCerto ? "ok" : "falhou",
              // As linhas do resumo do cadastro repetem as etapas do popup ("Criar o anuncio pausado: feito."): ficam so no titulo.
              resumo: tipo === "cadastrar" && resumo ? { ...resumo, linhas: [] } : resumo,
            }
          : atual,
      );
    } finally {
      if (relogio) clearInterval(relogio);
      // Rede de seguranca: se algo inesperado cortou o caminho de cima, o popup nao fica girando para sempre.
      if (montado.current) setAndamento((atual) => (atual && !atual.fim ? { ...atual, fim: "falhou" } : atual));
    }
  }

  /** "Fechar" do fim do envio: fecha o popup e, na janela do icone, o editor tambem. Na pagina o editor continua onde esta. */
  function fecharTudo() {
    setAndamento(null);
    if (janela) aoFechar?.();
  }

  /** Sincronizar/Cadastrar: com alteracao na tela (ou anuncio novo nunca salvo), salvar vem antes. */
  function pedirEnvio() {
    setMensagem(null);
    setEnvio(null);
    setConclusao(null);
    if (alterado || idAtual === null) {
      setPergunta("enviar");
      return;
    }
    iniciarTrabalho(async () => {
      await enviar();
      setQual(null);
    });
  }

  function salvarEEnviar() {
    setPergunta(null);
    setQual("salvar");
    iniciarTrabalho(async () => {
      const novo = idAtual === null;
      const id = await gravar({ avisar: false });
      if (id) {
        await enviar();
        // Anuncio novo na pagina: so agora a URL vira a do anuncio (a troca remonta o editor).
        if (novo) aoSalvar?.(id);
      }
      setQual(null);
    });
  }

  function irParaProduto() {
    if (produtoId) router.push(`/produtos/${produtoId}`);
  }

  /** "Editar produto": com alteracao nao salva, pergunta antes; sem, abre direto (na mesma aba). */
  function abrirProduto() {
    if (alterado) setPergunta("produto");
    else irParaProduto();
  }

  function salvarEAbrirProduto() {
    setPergunta(null);
    setQual("salvar");
    iniciarTrabalho(async () => {
      if (await gravar({ avisar: false })) irParaProduto();
      setQual(null);
    });
  }

  const propsDasAbas = {
    rascunho,
    contexto,
    alterar,
    setContexto,
    irPara: mudarAba,
    anuncioId: idAtual,
    vinculo: vinculoAtual,
    recarregarCategorias,
    leitura,
    bling,
    abrirProduto,
    acessos,
  };

  // Produto sem o canal da LI no Bling: aviso no topo (estoque e pedidos nao passam). Ligado, so na aba Status.
  const estadoDoBling = situacaoDoBling(bling);
  // O que falta no cadastro automatico (24/10/2026): a falha gravada ou o que a leitura da loja e do Bling mostra.
  const cadastroFalhou = leitura?.ok ? leitura.cadastroFalhou : null;
  const faltaNoCadastro = faltaNoCadastroLI({
    idExterno: vinculoAtual?.idExterno ?? (leitura?.ok ? leitura.idExterno : null),
    ativo: leitura?.ok ? leitura.ativoNaLI : null,
    estoqueGerenciado: leitura?.ok ? leitura.estoqueGerenciado : null,
    situacaoNoBling: bling?.ok ? bling.situacao : null,
  });
  const podeCompletar = acessos.sincronizar && ofereceCompletar({ falta: faltaNoCadastro, falhou: Boolean(cadastroFalhou) });
  // O "Completar o cadastro" liga no Bling: o aviso de "sem vinculo" fica dentro da faixa dele.
  const avisoDoBling = estadoDoBling && estadoDoBling.tipo === "atencao" && !(podeCompletar && faltaNoCadastro.includes("ligar_bling")) ? estadoDoBling.texto : null;

  /** Liga no Bling, grava o estoque inicial e ativa o que falta (sob as travas da LI e do Bling) e le de novo. */
  function completarCadastro() {
    setMensagem(null);
    setEnvio(null);
    setConclusao(null);
    setQual("completar");
    iniciarTrabalho(async () => {
      const resultado = await chamarEnvio(completarCadastroNaLI, produtoId);
      if (!montado.current) return;
      const resumo = resumirEnvioLI("completar", resultado);
      if (resultado.ok === true) setConclusao({ titulo: "Cadastro completo", mensagem: resumo?.titulo ?? null, linhas: resumo?.linhas ?? [] });
      else {
        setEnvio(resumo ? { ok: false, titulo: resumo.titulo, linhas: resumo.linhas } : null);
        setMensagem({ tipo: "erro", texto: resultado.erro ?? "O cadastro não foi completado." });
      }
      if (mudouNaLI("completar", resultado)) {
        setQual("lendo");
        await lerLoja();
      }
      setQual(null);
    });
  }

  // O estado da loja em uma linha, acima das abas: o que o pop-up do icone dizia.
  let situacaoDaLoja = null;
  if (leitura && !leitura.ok) {
    situacaoDaLoja = { tipo: "erro", texto: leitura.erro ?? "Não foi possível ler a Loja Integrada.", lerDeNovo: true };
  } else if (leitura?.ok && leitura.situacao === "nao_existe") {
    situacaoDaLoja = {
      tipo: "info",
      texto: `O código ${leitura.sku} não está na Loja Integrada. "Cadastrar na LI" cria o produto pausado com este anúncio e o preço do Rise, liga no Bling, grava o estoque do Bling na loja e ativa.`,
    };
  } else if (leitura?.vinculadoAgora) {
    situacaoDaLoja = { tipo: "ok", texto: `Vinculado agora pelo código (id ${leitura.idExterno}): as categorias e o destaque vieram da loja.` };
  }

  const avisos = (
    <>
      {mensagem && (
        <div ref={caixaDaMensagem} role={mensagem.tipo === "erro" ? "alert" : "status"} className={`rounded border px-3 py-2 text-sm ${CLASSE_DA_MENSAGEM[mensagem.tipo]}`}>
          {mensagem.texto}
        </div>
      )}
      {envio && (
        <div role="status" className={`rounded border px-3 py-2 text-sm ${CLASSE_DA_MENSAGEM[envio.ok ? "ok" : "atencao"]}`}>
          <p className="flex items-start gap-1.5 font-medium">
            {envio.ok && <CircleCheck size={15} className="mt-0.5 shrink-0" />}
            {envio.titulo}
          </p>
          {envio.linhas.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
              {envio.linhas.map((linha, indice) => (
                <li key={`${indice}-${linha}`}>{linha}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {avisoDoBling && <div className={`rounded border px-3 py-2 text-xs ${CLASSE_DA_MENSAGEM.atencao}`}>{avisoDoBling}</div>}
      {podeCompletar && (
        <div role="status" className={`flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-xs ${CLASSE_DA_MENSAGEM.atencao}`}>
          <span className="min-w-0 flex-1">
            <span className="font-medium">Cadastro incompleto na Loja Integrada.</span>{" "}
            {cadastroFalhou
              ? `Parou em "${ROTULO_DA_ETAPA_LI[cadastroFalhou.etapa] ?? cadastroFalhou.etapa}": ${cadastroFalhou.erro}`
              : `Falta: ${faltaNoCadastro.map((etapa) => ROTULO_DA_ETAPA_LI[etapa].toLowerCase()).join(", ")}.`}
          </span>
          <button
            type="button"
            onClick={completarCadastro}
            disabled={ocupado}
            title="Liga no Bling, grava o estoque do Bling na loja e ativa o anúncio. O que já está feito não é refeito."
            className="inline-flex items-center gap-1.5 rounded border border-current px-2 py-1 font-medium hover:bg-white/50 disabled:opacity-60"
          >
            {qual === "completar" && <Loader size={12} className="animate-spin" />}
            {qual === "completar" ? "Completando..." : "Completar o cadastro"}
          </button>
        </div>
      )}
      {situacaoDaLoja && (
        <div className={`flex flex-wrap items-center gap-2 rounded border px-3 py-2 text-xs ${CLASSE_DA_MENSAGEM[situacaoDaLoja.tipo]}`}>
          <span className="min-w-0 flex-1">{situacaoDaLoja.texto}</span>
          {situacaoDaLoja.lerDeNovo && (
            <button type="button" onClick={lerLoja} disabled={lendo} className="rounded border border-current px-2 py-0.5 hover:bg-white/50 disabled:opacity-60">
              Ler de novo
            </button>
          )}
        </div>
      )}
    </>
  );
  const caixaDeConclusao = conclusao && <ConclusaoDoEnvio {...conclusao} aoFechar={() => setConclusao(null)} />;
  // Os dois links ficam ANTES da caixa de andamento, que os usa: declarados depois, o Sincronizar derrubava a pagina em
  // producao ("Cannot access ... before initialization") no instante em que o popup de etapas abria (26/10/2026).
  const linkDoPainel = linkDoPainelLI(vinculoAtual?.idExterno);
  // A pagina do produto no site da loja (pedido do dono em 25/10/2026): so depois de o anuncio existir na LI (com `idExterno`)
  // e com endereco http(s) completo; sem o dominio da loja (LI_DOMINIO) a URL gravada e so o caminho e o botao nao nasce.
  const linkDoSite = vinculoAtual?.idExterno && /^https?:\/\//i.test(String(vinculoAtual.urlExterna ?? "")) ? vinculoAtual.urlExterna : null;
  // O fim do Sincronizar e do Cadastrar: etapas e, quando deu certo, tres botoes (painel da loja, anuncio e Fechar). Quem falhou
  // volta para a janela, com o erro a vista. O anuncio so abre com endereco http(s) completo.
  const caixaDeAndamento = andamento && (
    <AndamentoDoEnvio
      canal="li"
      larga
      tipo={andamento.tipo}
      sku={contexto.produto?.sku ?? ""}
      etapas={andamento.etapas}
      fim={andamento.fim}
      resumo={andamento.resumo}
      aoFechar={fecharTudo}
      aoVoltar={() => setAndamento(null)}
      acoesDoFim={<AcoesDoFimDoEnvio linkDoPainel={linkDoPainel} linkDoSite={linkDoSite} aoFechar={fecharTudo} />}
    />
  );
  const temAviso = Boolean(mensagem || envio || situacaoDaLoja || avisoDoBling || podeCompletar);

  const barra = (
    <div inert={travado}>
      <BarraDeAbas
        abas={abas}
        aba={abaVisivel}
        aoMudar={mudarAba}
        comErro={(id) => id === "divergencias" || problemas.some((problema) => problema.aba === id && problema.bloqueante)}
      />
    </div>
  );

  const paineis = (
    <div inert={travado || somenteLeitura} aria-busy={travado} className={travado ? "opacity-70" : undefined}>
      {divergencias > 0 && (
        <Painel id="divergencias" aba={abaVisivel}>
          <AbaDivergencias leitura={leitura} lerLoja={lerLoja} lendo={lendo} linkDoPainel={linkDoPainelLI(leitura?.idExterno ?? vinculoAtual?.idExterno)}
            aoConfirmarAjuste={acessos.editar ? () => chamar(confirmarAjusteFiscalNaLI, produtoId) : null}
          />
        </Painel>
      )}
      {ABAS_LI.map(({ id }) => {
        const Aba = ABAS_PRONTAS[id];
        return (
          <Painel key={id} id={id} aba={abaVisivel}>
            <Aba {...propsDasAbas} problemas={problemas.filter((problema) => problema.aba === id)} {...(id === "status" ? { todosProblemas: problemas } : {})} />
          </Painel>
        );
      })}
    </div>
  );

  let rotuloDoEnvio = tipoDeEnvio === "cadastrar" ? "Cadastrar na LI" : "Sincronizar com a LI";
  if (lendo && !leitura) rotuloDoEnvio = "Lendo a loja...";
  else if (qual === "enviar") rotuloDoEnvio = "Enviando...";
  else if (qual === "lendo") rotuloDoEnvio = "Atualizando...";

  // O rodape no padrao da janela do Bling (pedido do dono em 26/10/2026): os links a esquerda; "Salvar e fechar" (contornado) e o
  // envio (azul, a acao principal) a direita. Saiu o selo "Na loja" e o "Tudo salvo": o estado aparece no ícone e na aba Previa.
  const rodape = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 text-sm">
        {alterado && <span className="text-xs text-amber-700">Alterações não salvas</span>}
        {somenteLeitura && <span className="text-xs text-suave">Seu acesso a este canal é de leitura.</span>}
        {/* O produto no painel da LI, em outra aba (pedido do dono em 24/10/2026): so com o produto ja na loja. */}
        {linkDoPainel && (
          <a
            href={linkDoPainel}
            target="_blank"
            rel="noreferrer"
            title="Abre o produto no painel de controle da Loja Integrada"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-borda px-3.5 py-2 font-medium text-acento hover:bg-fundo"
          >
            Abrir no painel da LI <ExternalLink size={14} />
          </a>
        )}
        {linkDoSite && (
          <a
            href={linkDoSite}
            target="_blank"
            rel="noreferrer"
            title="Abre a página do produto no site da loja (produto pausado ainda não aparece para o cliente)"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-borda px-3.5 py-2 font-medium text-acento hover:bg-fundo"
          >
            Abrir no site <ExternalLink size={14} />
          </a>
        )}
      </div>
      <div className="flex items-center gap-2">
        {/* Sem permissao de editar nao ha o que salvar: o botao e so "Fechar". */}
        <button
          type="button"
          onClick={somenteLeitura ? fechar : salvarEFechar}
          disabled={ocupado}
          className="inline-flex items-center gap-2 rounded-md border border-borda px-5 py-2.5 text-base hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-50"
        >
          {qual === "salvar" && <Loader size={16} className="animate-spin" />}
          {somenteLeitura ? "Fechar" : qual === "salvar" ? "Salvando..." : "Salvar e fechar"}
        </button>
        {acessos.sincronizar && (
          <button
            type="button"
            onClick={pedirEnvio}
            disabled={ocupado || (lendo && !leitura) || !produtoId || Boolean(primeiroBloqueioDaTela)}
            title={primeiroBloqueioDaTela?.problema ?? (leitura?.ok && leitura.escrita?.liberada === false ? leitura.escrita.motivo : undefined)}
            className="inline-flex items-center gap-2 rounded-md bg-acento px-5 py-2.5 text-base font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {(qual === "enviar" || qual === "lendo" || (lendo && !leitura)) && <Loader size={16} className="animate-spin" />}
            {rotuloDoEnvio}
          </button>
        )}
      </div>
    </div>
  );

  // Pergunta antes de sincronizar ou de abrir o produto com alteracao nao salva.
  const caixaDePergunta = pergunta && (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
      {...propsDoFundo(() => setPergunta(null))}
    >
      <section role="alertdialog" aria-modal="true" aria-labelledby="li-pergunta-titulo" className="w-full max-w-md rounded-lg border border-borda bg-superficie p-4 shadow-2xl">
        {pergunta === "enviar" ? (
          <>
            <p id="li-pergunta-titulo" className="text-sm font-semibold">
              Salvar antes de {tipoDeEnvio === "cadastrar" ? "cadastrar" : "sincronizar"}?
            </p>
            <p className="mt-1 text-sm text-suave">O envio leva o anúncio salvo. As alterações da tela precisam ser salvas antes.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setPergunta(null)} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo">
                Cancelar
              </button>
              <button type="button" onClick={salvarEEnviar} className="rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
                {tipoDeEnvio === "cadastrar" ? "Salvar e cadastrar" : "Salvar e sincronizar"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p id="li-pergunta-titulo" className="text-sm font-semibold">
              Abrir o produto com alterações não salvas?
            </p>
            <p className="mt-1 text-sm text-suave">O cadastro do produto abre nesta mesma aba. O que não for salvo neste anúncio será perdido.</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" autoFocus onClick={() => setPergunta(null)} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo">
                Cancelar
              </button>
              <button type="button" onClick={irParaProduto} className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
                Abrir sem salvar
              </button>
              <button type="button" onClick={salvarEAbrirProduto} className="rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
                Salvar e abrir o produto
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );

  if (!janela) {
    return (
      <div className="space-y-4">
        {temAviso && <div className="space-y-2">{avisos}</div>}
        <div className="rounded-lg border border-borda bg-superficie">
          {barra}
          <div className="p-5">{paineis}</div>
        </div>
        <div className="sticky bottom-0 z-10 rounded-lg border border-borda bg-superficie shadow-lg">{rodape}</div>
        {caixaDePergunta}
        {caixaDeConclusao}
        {caixaDeAndamento}
      </div>
    );
  }

  const produto = contexto.produto;
  // Janela presa no ALTO (pedido do dono em 07/10/2026): centralizada, ela subia e descia a cada troca de aba,
  // porque cada aba tem uma altura. Assim so a parte de baixo muda.
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 pt-[4vh] text-left font-normal normal-case"
      {...propsDoFundo(() => pedirFechamento())}
    >
      <section
        ref={secaoDaJanela}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Anúncio da Loja Integrada"
        className="flex max-h-full w-full max-w-5xl flex-col rounded-lg border border-borda bg-superficie shadow-2xl focus:outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-borda px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Anúncio da Loja Integrada</p>
            {produto && (
              <p className="mt-0.5 truncate text-xs text-suave">
                <span className="font-mono">{produto.sku}</span> · {produto.tituloBase}
              </p>
            )}
          </div>
          <button type="button" onClick={pedirFechamento} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={16} />
          </button>
        </header>
        {temAviso && <div className="shrink-0 space-y-2 px-5 pt-3">{avisos}</div>}
        <div className="shrink-0">{barra}</div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{paineis}</div>
        <div className="shrink-0 border-t border-borda">{rodape}</div>
      </section>

      {confirmandoSaida && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-4"
          {...propsDoFundo(() => setConfirmandoSaida(false))}
        >
          <section role="alertdialog" aria-modal="true" aria-labelledby="li-sair-titulo" className="w-full max-w-sm rounded-lg border border-borda bg-superficie p-4 shadow-2xl">
            <p id="li-sair-titulo" className="text-sm font-semibold">
              Sair sem salvar?
            </p>
            <p className="mt-1 text-sm text-suave">As alterações deste anúncio ainda não foram salvas e serão perdidas.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setConfirmandoSaida(false)} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo">
                Continuar editando
              </button>
              <button type="button" onClick={() => aoFechar?.()} className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
                Sair sem salvar
              </button>
            </div>
          </section>
        </div>
      )}
      {caixaDePergunta}
      {caixaDeConclusao}
      {caixaDeAndamento}
    </div>
  );
}
