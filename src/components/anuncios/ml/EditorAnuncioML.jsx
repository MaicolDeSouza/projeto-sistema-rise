"use client";

import { FaixaDaProposta } from "@/components/anuncios/PropostaDoAnuncio";
import { propsDoFundo } from "@/lib/fundoDaJanela";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Loader, X } from "lucide-react";

import { abrirAnuncioML, enviarMudancasMLAcao, lerCategoriaML, marcarCatalogoVistoMLAcao, salvarAnuncioML, salvarPublicadoMLAcao } from "@/app/canais-de-venda/mercado-livre/acoes";
import { BarraDeAbas, Painel } from "@/components/cadastros/Abas";
import Badge from "@/components/ui/Badge";
import ConclusaoDoEnvio from "@/components/ui/ConclusaoDoEnvio";
import { NOMES_DAS_PARTES, textoDasPartes } from "@/lib/canaisDeVenda/ml/acompanhar";
import { avisoDeCatalogoPendente, precisaAgirNoML, textoDoAvisoDeCatalogo, textoDoCatalogo, textoDoEstadoML } from "@/lib/canaisDeVenda/ml/estadoNoML";
import { AGUARDANDO_BLING, AGUARDANDO_ESTOQUE, STATUS_ML, linkDoAnuncioML, linkDoPainelML } from "@/lib/canaisDeVenda/ml/rotulos";
import { ABAS_ML, validarRascunhoML } from "@/lib/canaisDeVenda/ml/validacao";
import AbaDescricao from "./AbaDescricao";
import AbaEnvio from "./AbaEnvio";
import AbaFichaTecnica from "./AbaFichaTecnica";
import AbaGeral from "./AbaGeral";
import AbaImagens from "./AbaImagens";
import AbaPrecoEstoque from "./AbaPrecoEstoque";
import AbaPrevia from "./AbaPrevia";
import JanelaPublicarML from "./JanelaPublicarML";

// Uma aba por id de `ABAS_ML`: aba nova na validacao pede o componente aqui.
const ABAS_PRONTAS = {
  geral: AbaGeral,
  preco: AbaPrecoEstoque,
  imagens: AbaImagens,
  descricao: AbaDescricao,
  ficha: AbaFichaTecnica,
  envio: AbaEnvio,
  previa: AbaPrevia,
};

const CLASSE_DA_MENSAGEM = {
  erro: "border-red-200 bg-red-50 text-red-800",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

/// Os botoes do rodape (abrir no painel, no ML, clonar): o mesmo desenho dos "Abrir no painel da LI" e "Abrir no site".
const CLASSE_DO_BOTAO = "inline-flex items-center gap-1 rounded border border-borda px-2.5 py-1 font-medium text-acento hover:bg-fundo";
const MOTIVO_DO_PUBLICADO = "Anúncio publicado: só preço e ficha técnica se editam aqui.";
// Depois de publicado, so estas abas se editam (pedido do dono em 24/10/2026): o preco, os concorrentes e o ranking (na
// aba Preco e custos) e a ficha tecnica. O resto (titulo, categoria, tipo, envio) fica como foi publicado.
const ABAS_DO_PUBLICADO = new Set(["preco", "ficha"]);
const DATA_DO_ESTADO = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

const CATEGORIA_ML = /^MLB\d+$/;
// Espera o dono parar de digitar o codigo: cada tecla seria uma leitura no ML.
const ESPERA_DA_CATEGORIA_MS = 400;

/**
 * Editor de um anuncio do Mercado Livre: a casca (abas, Salvar, Publicar) e o estado que as abas
 * compartilham. Montado pela pagina (`modo="pagina"`, rodape fixo na base da tela) e pela janela
 * da lista de Produtos (`modo="janela"`, que ele mesmo desenha, com Esc e confirmacao de saida).
 *
 * O estado e todo controlado, sem `<form>`: cada aba le `rascunho` e `contexto` e escreve por
 * `alterar` e `setContexto`. Todas as abas ficam montadas e so escondidas (`Painel`).
 *
 * - `anuncioId`: `null` num anuncio novo. Depois do primeiro Salvar o editor guarda o id que a
 *   acao devolveu, e os proximos Salvar atualizam o mesmo anuncio.
 * - `aoSalvar(id)`: quem monta decide o que fazer (a pagina navega, a janela volta a lista).
 * - `aoFechar()`: so no modo janela.
 * - O estado nasce das props e nao as acompanha: quem monta troca o `key` ao abrir outro anuncio.
 *
 * Cada aba recebe `{ rascunho, contexto, alterar, setContexto, problemas, irPara, anuncioId }`.
 * `alterar(parcial)` mescla raso; `parcial` pode ser uma funcao `(atual) => parcial`, para quem
 * decide depois de esperar o servidor e nao pode desfazer o que foi digitado nesse meio tempo.
 * `problemas` ja vem filtrado pela aba. So a Previa recebe tambem `todosProblemas`, a lista
 * inteira da validacao (ela mostra as de todas as abas).
 */
/// Sem `acessos` o editor e o de sempre, sem restricao. O calculo de verdade e `acessosDoEditorML`
/// (src/lib/acessos/projecoes.js), feito no servidor (paginas e acoes de abrir).
const ACESSO_TOTAL_ML = { editar: true, publicar: true, custos: true, concorrentes: true };
const MOTIVO_DA_LEITURA = "Seu acesso a este canal é de leitura.";

export default function EditorAnuncioML({
  anuncioId,
  rascunhoInicial,
  contextoInicial,
  status,
  publicacaoInicial = null,
  modo = "pagina",
  aoSalvar,
  aoFechar,
  // Clonar (22/10/2026): na pagina e um link para `/novo?clonar=`; na janela, `aoClonar(id)` abre o clone nela mesma.
  // `origem` e de onde o rascunho novo foi clonado (so para mostrar).
  aoClonar,
  // Na janela do produto (pedido do dono em 24/10/2026): "Novo anuncio" no rodape, ja que a janela abre direto no anuncio.
  origem = null,
  acessos = ACESSO_TOTAL_ML,
}) {
  const [rascunho, setRascunho] = useState(rascunhoInicial);
  const [contexto, setContexto] = useState(contextoInicial);
  const [aba, setAba] = useState(ABAS_ML[0].id);
  const [mensagem, setMensagem] = useState(null);
  // `null` e "anuncio novo"; as acoes recusam `undefined` (prop esquecida) como "Pedido invalido.".
  const [idAtual, setIdAtual] = useState(anuncioId ?? null);
  // O que foi salvo por ultimo. "Alterado" e o rascunho ser outro objeto: assim, o dono que
  // continua digitando enquanto o Salvar espera o servidor segue com alteracao pendente.
  const [salvo, setSalvo] = useState(rascunhoInicial);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  // A publicacao (fase 3) muda o status e o anuncio no ML sem remontar o editor: o editor rele o
  // anuncio quando a janela do Publicar fecha depois de um envio.
  const [statusAtual, setStatusAtual] = useState(status);
  const [infoDoML, setInfoDoML] = useState(publicacaoInicial ?? {});
  const [publicando, setPublicando] = useState(false);
  const [enviandoMudancas, iniciarEnvioDasMudancas] = useTransition();
  const [erroDasMudancas, setErroDasMudancas] = useState(null);
  // As partes enviadas, para o popup de sucesso (`null` = popup fechado).
  const [conclusaoDasMudancas, setConclusaoDasMudancas] = useState(null);
  const [salvando, iniciarSalvamento] = useTransition();
  const [carregandoCategoria, iniciarLeituraDaCategoria] = useTransition();
  const caixaDaMensagem = useRef(null);
  const secaoDaJanela = useRef(null);
  // Numero da leitura de categoria mais nova: a resposta de uma leitura antiga e descartada.
  const leituraDaCategoria = useRef(0);
  const categoriaId = rascunho.categoriaId;

  // A categoria do ML (fase 2) vive no contexto, nao no rascunho: e lida de novo a cada codigo
  // novo (e ao abrir o anuncio) e da a validacao o limite do titulo, se e final e os atributos.
  useEffect(() => {
    const id = String(categoriaId ?? "").trim();
    const leitura = ++leituraDaCategoria.current;
    const espera = setTimeout(
      () => {
        if (!CATEGORIA_ML.test(id)) {
          setContexto((atual) => (atual.categoria === undefined && !atual.categoriaErro ? atual : { ...atual, categoria: undefined, categoriaErro: null }));
          return;
        }
        iniciarLeituraDaCategoria(async () => {
          let resultado;
          try {
            resultado = await lerCategoriaML(id);
          } catch {
            resultado = { ok: false, erro: "Não foi possível falar com o servidor." };
          }
          if (leitura !== leituraDaCategoria.current) return;
          setContexto((atual) => ({
            ...atual,
            categoria: resultado.ok ? resultado.categoria : undefined,
            categoriaErro: resultado.ok ? null : resultado.erro,
          }));
        });
      },
      CATEGORIA_ML.test(id) ? ESPERA_DA_CATEGORIA_MS : 0,
    );
    return () => clearTimeout(espera);
  }, [categoriaId]);

  const alterado = rascunho !== salvo;
  const janela = modo === "janela";
  // Publicado nao se edita aqui (o servidor recusa o Salvar): a tela nem finge que edita.
  const publicado = statusAtual === "PUBLICADO";
  const publicacao = infoDoML.publicacao ?? null;
  // Durante a publicacao, e depois que o item ja existe no ML (pausado), o rascunho nao muda mais:
  // so "Retomar publicacao" segue dali (o servidor tambem recusa o Salvar).
  const presoNaPublicacao = statusAtual === "PUBLICANDO" || Boolean(publicacao?.itemId);
  // O primeiro Salvar de um anuncio novo na pagina troca a URL e remonta o editor a partir do
  // banco: o que fosse digitado enquanto a acao do servidor roda se perderia, e o rodape diria
  // "Tudo salvo". Travar so esse caso mantem o resto do editor livre (a janela volta a lista).
  const travado = salvando && idAtual === null && modo === "pagina";
  // Tela em `ver` (Acessos): os paineis travam, mas as abas continuam navegaveis para ler.
  const somenteLeitura = !acessos.editar;
  const bloqueado = publicado || travado || presoNaPublicacao || somenteLeitura;
  // O publicado libera so as abas de ABAS_DO_PUBLICADO (preco e ficha); o resto continua travado.
  const editaPublicado = publicado && !somenteLeitura && !travado;
  const travaDaAba = (id) => bloqueado && !(editaPublicado && ABAS_DO_PUBLICADO.has(id));
  const problemas = useMemo(() => validarRascunhoML(rascunho, contexto), [rascunho, contexto]);

  // O anuncio entrou, saiu ou trocou de catalogo no ML (25/10/2026): abrir o anuncio e ver o aviso; o "!" da lista apaga.
  // O texto continua no rodape nesta abertura (o estado da tela nao muda).
  const catalogoPendente = idAtual && avisoDeCatalogoPendente(publicacao?.estadoML) ? idAtual : null;
  useEffect(() => {
    if (catalogoPendente) marcarCatalogoVistoMLAcao(catalogoPendente).catch(() => {});
  }, [catalogoPendente]);

  // O erro aparece no topo: com o rodape fixo, o dono clica em Salvar com a pagina rolada.
  useEffect(() => {
    if (mensagem?.tipo === "erro") caixaDaMensagem.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [mensagem]);

  // No modo janela o foco entra no dialog ao abrir (sem prender o foco: so a entrada).
  useEffect(() => {
    if (janela) secaoDaJanela.current?.focus();
  }, [janela]);

  const pedirFechamento = useCallback(() => {
    if (salvando) return;
    if (alterado) setConfirmandoSaida(true);
    else aoFechar?.();
  }, [salvando, alterado, aoFechar]);

  useEffect(() => {
    if (!janela) return undefined;
    function aoTeclar(evento) {
      // Esc segurado repete o evento: sem ignorar, o aviso abriria e fecharia a cada repeticao.
      if (evento.key !== "Escape" || evento.repeat) return;
      // A janela do Publicar ouve o proprio Esc: aqui ele nao pode fechar o editor por baixo dela.
      if (publicando) return;
      // Esc fecha so o aviso quando ele esta aberto, e nao a janela inteira por baixo.
      if (confirmandoSaida) setConfirmandoSaida(false);
      else pedirFechamento();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [janela, confirmandoSaida, pedirFechamento, publicando]);

  function alterar(parcial) {
    setRascunho((atual) => ({ ...atual, ...(typeof parcial === "function" ? parcial(atual) : parcial) }));
    // "Rascunho salvo." deixa de ser verdade com a primeira tecla; o erro fica ate o proximo Salvar.
    setMensagem((atual) => (atual?.tipo === "ok" ? null : atual));
  }

  function salvar() {
    setMensagem(null);
    const enviado = rascunho;
    iniciarSalvamento(async () => {
      let resultado;
      try {
        resultado = publicado
          ? await salvarPublicadoMLAcao(idAtual, { preco: enviado.preco, atributos: enviado.atributos })
          : await salvarAnuncioML(idAtual, enviado);
      } catch {
        // Excecao solta numa transicao iria ao error boundary e levaria o que foi digitado.
        resultado = { ok: false, erro: "Não foi possível falar com o servidor. O que está na tela continua aqui: tente salvar de novo." };
      }
      // Recusa (produto que deixou de ser Conferido, por exemplo): so o recado. Nada do estado muda.
      if (!resultado.ok) {
        setMensagem({ tipo: "erro", texto: resultado.erro });
        return;
      }
      setSalvo(enviado);
      if (publicado) {
        // O id nao muda; a faixa "Enviar mudancas ao ML" e o "!" saem da releitura.
        setMensagem({ tipo: "ok", texto: "Salvo. Falta enviar ao Mercado Livre." });
        await relerDoML();
        return;
      }
      setIdAtual(resultado.id);
      setMensagem({ tipo: "ok", texto: "Rascunho salvo." });
      aoSalvar?.(resultado.id);
    });
  }

  const bloqueantes = problemas.filter((problema) => problema.bloqueante).length;
  // A falta de blingId e as demais travas do anuncio sao bloqueantes da validacao; as travas do ML e do
  // Bling (ML_PUBLICACAO, BLING_ESCRITA) nao desabilitam o botao: a recusa do servidor aparece na janela.
  const retomando = Boolean(publicacao) && (presoNaPublicacao || statusAtual === "ERRO");
  const rotuloPublicar = publicacao?.etapaComErro === "kit_bling" ? "Verificar no Bling" : retomando ? "Retomar publicação" : "Publicar";
  const motivosSemPublicar = [
    ...(idAtual ? [] : ["Salve antes de publicar."]),
    ...(alterado ? ["Salve as alterações antes de publicar."] : []),
    ...(!publicacao?.itemId && bloqueantes > 0 ? [`${bloqueantes} problema(s) bloqueante(s) na Prévia.`] : []),
  ];

  // Le de novo o status, o anuncio no ML e o que mudou no produto (depois do Publicar e do "Enviar mudancas ao ML").
  async function relerDoML() {
    try {
      const relido = await abrirAnuncioML(idAtual);
      if (!relido.ok) return;
      setStatusAtual(relido.status);
      setInfoDoML({ publicacao: relido.publicacao, idExterno: relido.idExterno, urlExterna: relido.urlExterna, mudancas: relido.mudancas });
    } catch {
      // A releitura falhou: o rodape e a faixa ficam como estavam ate o anuncio ser aberto de novo.
    }
  }

  // Fechou a janela do Publicar: se algo foi enviado, le de novo o status e o anuncio no ML.
  async function aoFecharPublicacao(houveEnvio) {
    setPublicando(false);
    if (!houveEnvio || !idAtual) return;
    await relerDoML();
  }

  // "Enviar mudancas ao ML" (spec 2026-10-24): so no anuncio publicado que ficou para tras do produto.
  const mudancas = publicado ? (infoDoML.mudancas ?? null) : null;
  const temMudancas = (mudancas?.partes?.length ?? 0) > 0;
  function enviarMudancas() {
    setErroDasMudancas(null);
    iniciarEnvioDasMudancas(async () => {
      const resultado = await enviarMudancasMLAcao(idAtual);
      if (resultado?.ok) setConclusaoDasMudancas(resultado.enviadas ?? []);
      else setErroDasMudancas(resultado?.parte ? `${NOMES_DAS_PARTES[resultado.parte]}: ${resultado.erro}` : (resultado?.erro ?? "Não foi possível enviar."));
      await relerDoML();
    });
  }

  // "Validar no ML" (Previa) valida o anuncio GRAVADO: so com ele salvo e sem alteracao pendente.
  const podeValidar = Boolean(idAtual) && !alterado && !bloqueado;
  const propsDasAbas = { rascunho, contexto, alterar, setContexto, irPara: setAba, anuncioId: idAtual, carregandoCategoria, podeValidar, acessos };
  const rotuloDoStatus =
    statusAtual === "PUBLICANDO" && publicacao?.etapaComErro === "kit_bling"
      ? AGUARDANDO_BLING
      : statusAtual === "PUBLICADO" && publicacao?.aguardandoEstoque
        ? AGUARDANDO_ESTOQUE
        : (STATUS_ML[statusAtual] ?? (idAtual ? STATUS_ML.RASCUNHO : { rotulo: "Novo", tom: "neutro" }));

  const aviso = mensagem && (
    <div
      ref={caixaDaMensagem}
      role={mensagem.tipo === "erro" ? "alert" : "status"}
      className={`rounded border px-3 py-2 text-sm ${CLASSE_DA_MENSAGEM[mensagem.tipo]}`}
    >
      {mensagem.texto}
    </div>
  );

  // `inert` tira foco, clique e teclado dos paineis (os campos continuam montados). A BARRA de abas fica livre no anuncio
  // publicado ou parado na publicacao (pedido do dono em 24/10/2026: ele quer olhar as outras abas); so trava durante o
  // primeiro Salvar de um anuncio novo, quando a tela vai trocar de endereco.
  const barra = (
    <div inert={travado}>
      <BarraDeAbas
        abas={ABAS_ML}
        aba={aba}
        aoMudar={setAba}
        comErro={(id) => problemas.some((problema) => problema.aba === id && problema.bloqueante)}
      />
    </div>
  );

  const paineis = (
    <div aria-busy={travado}>
      {ABAS_ML.map(({ id }) => {
        const Aba = ABAS_PRONTAS[id];
        const trava = travaDaAba(id);
        return (
          <Painel key={id} id={id} aba={aba}>
            <div inert={trava} className={trava && !somenteLeitura ? "opacity-70" : undefined}>
            <Aba
              {...propsDasAbas}
              problemas={problemas.filter((problema) => problema.aba === id)}
              {...(id === "previa" ? { todosProblemas: problemas } : {})}
              {...(id === "preco" ? { catalogoNoML: publicacao?.estadoML?.catalogo } : {})}
            />
            </div>
          </Painel>
        );
      })}
    </div>
  );

  const linkDoPainel = linkDoPainelML(infoDoML.idExterno);
  const linkDoAnuncio = linkDoAnuncioML(infoDoML.idExterno, infoDoML.urlExterna);

  const rodape = (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="flex items-center gap-2 text-xs">
        <Badge tom={rotuloDoStatus.tom}>{rotuloDoStatus.rotulo}</Badge>
        {alterado ? (
          <span className="text-amber-700">Alterações não salvas</span>
        ) : (
          idAtual && <span className="text-suave">Tudo salvo</span>
        )}
        {publicado && publicacao?.estadoML?.status && (
          // O estado no ML relido de hora em hora pelo worker; "desde" e quando ficou assim.
          <span className={precisaAgirNoML(publicacao.estadoML) ? "font-medium text-red-700" : "text-suave"} title="Estado no Mercado Livre, relido de hora em hora">
            {textoDoEstadoML(publicacao.estadoML)}
            {publicacao.estadoML.desde && ` desde ${DATA_DO_ESTADO.format(new Date(publicacao.estadoML.desde))}`}
          </span>
        )}
        {publicado && textoDoCatalogo(publicacao?.estadoML?.catalogo) && (
          // O catalogo em que o anuncio esta no ML, relido com o estado; a mudanca ainda nao vista vem em ambar.
          <span
            className={catalogoPendente ? "font-medium text-amber-700" : "text-suave"}
            title="Catálogo do anúncio no Mercado Livre, relido com o estado"
          >
            {textoDoCatalogo(publicacao.estadoML.catalogo)}
            {catalogoPendente && ` (${textoDoAvisoDeCatalogo(publicacao.estadoML.catalogoAviso)})`}
          </span>
        )}
        {publicado && <span className="text-suave">{MOTIVO_DO_PUBLICADO}</span>}
        {somenteLeitura && !publicado && <span className="text-suave">{MOTIVO_DA_LEITURA}</span>}
        {/* O anuncio no painel do vendedor e no site do ML, em outra aba (pedido do dono em 25/10/2026, no molde dos botoes
            da LI): so depois de o anuncio existir no ML. */}
        {linkDoPainel && (
          <a href={linkDoPainel} target="_blank" rel="noreferrer" title={`Abre ${infoDoML.idExterno} na lista de anúncios do painel do Mercado Livre`} className={CLASSE_DO_BOTAO}>
            Abrir no painel do ML <ExternalLink size={12} />
          </a>
        )}
        {linkDoAnuncio && (
          <a href={linkDoAnuncio} target="_blank" rel="noreferrer" title={`Abre a página do anúncio ${infoDoML.idExterno} no Mercado Livre`} className={CLASSE_DO_BOTAO}>
            Abrir no ML <ExternalLink size={12} />
          </a>
        )}
        {!idAtual && origem && (
          <span className="text-suave">
            Clonado de <span className="font-mono">{origem.codigo}</span>
            {origem.idExterno && <span className="font-mono"> ({origem.idExterno})</span>}
          </span>
        )}
        {idAtual && acessos.editar && !travado && (
          modo === "pagina" ? (
            <Link href={`/canais-de-venda/mercado-livre/novo?clonar=${idAtual}`} className={CLASSE_DO_BOTAO} title="Abre um anúncio novo igual a este, do mesmo produto">
              <Copy size={12} /> Clonar anúncio
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => aoClonar?.(idAtual)}
              disabled={alterado || salvando}
              title={alterado ? "Salve as alterações antes de clonar." : "Abre um anúncio novo igual a este, do mesmo produto"}
              className={`${CLASSE_DO_BOTAO} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Copy size={12} /> Clonar anúncio
            </button>
          )
        )}
      </div>
      <div className="flex items-center gap-2">
        {!somenteLeitura && (
        <button
          type="button"
          onClick={salvar}
          disabled={salvando || (publicado && !editaPublicado)}
          title={publicado ? MOTIVO_DO_PUBLICADO : undefined}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {salvando && <Loader size={14} className="animate-spin" />}
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        )}
        {!publicado && acessos.publicar && (
          <button
            type="button"
            onClick={() => setPublicando(true)}
            disabled={salvando || motivosSemPublicar.length > 0}
            title={motivosSemPublicar.join(" ") || undefined}
            className="rounded border border-acento px-4 py-2 text-sm font-medium text-acento hover:bg-fundo disabled:cursor-not-allowed disabled:border-borda disabled:text-suave disabled:opacity-60"
          >
            {rotuloPublicar}
          </button>
        )}
      </div>
    </div>
  );

  // A ultima falha da publicacao, no topo: o dono abre o anuncio e ve por que ele parou.
  const faixaDaPublicacao = !publicado && publicacao?.erro && (
    <div role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      <span className="font-semibold">Publicação parada: </span>
      {publicacao.erro}
    </div>
  );

  const faixaDaProposta = !publicado && contexto.proposta && (
    <FaixaDaProposta proposta={contexto.proposta} oQueFazer="Revise os campos marcados, adicione os catálogos sugeridos se quiser, e publique; o P some no Publicar." />
  );

  const janelaDoPublicar = publicando && idAtual && (
    <JanelaPublicarML anuncioId={idAtual} rotuloDoBotao={rotuloPublicar} aoFechar={aoFecharPublicacao} />
  );

  // O produto mudou depois de publicar: uma linha, uma acao (a regra do padrao visual: aviso so do que pede acao).
  const faixaDasMudancas = temMudancas && (
    <div role="status" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{mudancas.naoConferido ? "Ainda não conferido com o produto." : `Mudou depois de publicar, falta enviar ao ML: ${textoDasPartes(mudancas.partes)}.`}</span>
        <button
          type="button"
          onClick={enviarMudancas}
          disabled={enviandoMudancas || !acessos.publicar || alterado}
          title={!acessos.publicar ? "Seu acesso não permite enviar ao Mercado Livre." : alterado ? "Salve antes de enviar: vai o que está salvo." : `Manda ao Mercado Livre: ${textoDasPartes(mudancas.partes)}`}
          className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {enviandoMudancas && <Loader size={14} className="animate-spin" />}
          {enviandoMudancas ? "Enviando..." : "Enviar mudanças ao ML"}
        </button>
      </div>
      {erroDasMudancas && (
        <p role="alert" className="mt-1 text-red-700">
          {erroDasMudancas}
        </p>
      )}
    </div>
  );

  const popupDasMudancas = conclusaoDasMudancas && (
    <ConclusaoDoEnvio
      titulo="Anúncio atualizado no Mercado Livre"
      mensagem={conclusaoDasMudancas.length === 0 ? "Nada a enviar: o anúncio já estava igual ao produto." : null}
      linhas={conclusaoDasMudancas.map((parte) => `Enviado: ${NOMES_DAS_PARTES[parte] ?? parte}`)}
      aoFechar={() => setConclusaoDasMudancas(null)}
    />
  );

  if (!janela) {
    return (
      <div className="space-y-4">
        {aviso}
        {faixaDaProposta}
        {faixaDaPublicacao}
        {faixaDasMudancas}
        <div className="rounded-lg border border-borda bg-superficie">
          {barra}
          <div className="p-5">{paineis}</div>
        </div>
        {/* Fixo na base da tela: o Salvar fica ao alcance em qualquer aba, por mais que ela role. */}
        <div className="sticky bottom-0 z-10 rounded-lg border border-borda bg-superficie shadow-lg">{rodape}</div>
        {janelaDoPublicar}
        {popupDasMudancas}
      </div>
    );
  }

  const principal = contexto.produtos[rascunho.produtoId];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
      {...propsDoFundo(() => pedirFechamento())}
    >
      <section
        ref={secaoDaJanela}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Anúncio do Mercado Livre"
        className="flex max-h-full w-full max-w-5xl flex-col rounded-lg border border-borda bg-superficie shadow-2xl focus:outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-borda px-5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Anúncio do Mercado Livre</p>
            {principal && (
              <p className="mt-0.5 truncate text-xs text-suave">
                <span className="font-mono">{principal.sku}</span> · {principal.tituloBase}
              </p>
            )}
          </div>
          <button type="button" onClick={pedirFechamento} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={16} />
          </button>
        </header>
        {aviso && <div className="shrink-0 px-5 pt-3">{aviso}</div>}
        {faixaDaProposta && <div className="shrink-0 px-5 pt-3">{faixaDaProposta}</div>}
        {faixaDaPublicacao && <div className="shrink-0 px-5 pt-3">{faixaDaPublicacao}</div>}
        {faixaDasMudancas && <div className="shrink-0 px-5 pt-3">{faixaDasMudancas}</div>}
        <div className="shrink-0">{barra}</div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{paineis}</div>
        <div className="shrink-0 border-t border-borda">{rodape}</div>
      </section>

      {janelaDoPublicar}
      {popupDasMudancas}

      {confirmandoSaida && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/50 p-4"
          {...propsDoFundo(() => setConfirmandoSaida(false))}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ml-sair-titulo"
            className="w-full max-w-sm rounded-lg border border-borda bg-superficie p-4 shadow-2xl"
          >
            <p id="ml-sair-titulo" className="text-sm font-semibold">
              Sair sem salvar?
            </p>
            <p className="mt-1 text-sm text-suave">As alterações deste anúncio ainda não foram salvas e serão perdidas.</p>
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
                onClick={() => aoFechar?.()}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Sair sem salvar
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
