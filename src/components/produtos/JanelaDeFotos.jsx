"use client";

import { useEffect, useEffectEvent, useState, useTransition } from "react";
import { Check, ChevronLeft, ChevronRight, ExternalLink, Loader, ShoppingCart, Sparkles, Trash2, X } from "lucide-react";

import {
  comprarPhotoroom,
  estadoDoPhotoroom,
  gerarPreviaPhotoroom,
} from "@/app/produtos/acoes-imagens";
import { estadoDoNanoBanana } from "@/app/produtos/acoes-nanobanana";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { MAXIMO_PIXELS_PARA_AMPLIAR } from "@/lib/limites";
import { AmpliacaoDeFoto, ImagemComZoom } from "./ImagemComZoom";
import PainelNanoBanana from "./PainelNanoBanana";
import TiraDeFotos from "./TiraDeFotos";

/**
 * Revisao das fotos do produto NOVO, uma a uma (pedido do dono em 21/09/2026).
 *
 * As fotos dos concorrentes e fornecedores marcados na lupa entram todas no painel, e aqui o dono
 * passa por elas com as setas (ou as teclas esquerda e direita) e, em cada uma:
 *  - olha a foto GRANDE, passa o mouse para ampliar a mesma area nas duas e clica para ver inteira;
 *  - gera a PREVIA do Photoroom (gratis, com marca d'agua) com as opcoes que ficam EMBAIXO DELA;
 *  - decide com o botao "Escolher essa", um EMBAIXO DE CADA FOTO: o da esquerda usa a original, o da
 *    direita usa a melhorada. Escolhida, a foto ganha o selo "Finalizada" e o botao dela fica cinza,
 *    fosco; o da outra fica verde, e clicar nele troca a escolha. Nenhuma escolhida: os dois verdes;
 *  - ou exclui, e a janela segue para a proxima.
 * A ordem das miniaturas (arrastar) e a ordem em que as fotos vao para o produto, e a primeira e
 * a principal.
 *
 * O "Escolher essa" da PREVIA e a COMPRA: a previa tem marca d'agua e nao pode ir para o produto, entao
 * escolher a melhorada e comprar a versao limpa. Por isso o botao mostra o valor (US$ 0,10) e pede uma
 * confirmacao antes de chamar o Photoroom. Depois da compra as duas versoes ficam guardadas, e o dono
 * alterna entre elas sem pagar de novo. Regras herdadas: so se compra o que foi visto (previa gerada
 * com as MESMAS opcoes marcadas agora), e o botao fica cinza enquanto a compra estiver desligada
 * (PHOTOROOM_COMPRA=false). O servidor confere tudo de novo: esta tela nao decide nada sozinha.
 *
 * A previa e as opcoes de cada foto moram no painel (`porFoto`), e nao aqui: fechar a janela nao
 * pode perder uma previa ja gerada. O estado LOCAL de cada foto (erro, confirmacoes, zoom) reinicia
 * ao trocar de foto, porque `FotoEmRevisao` e montada com `key` da foto.
 */

const OPCOES_INICIAIS = { removerFundo: true, iluminacao: false, ampliar: false };

// Rotulos curtos: as tres opcoes, a previa e o "Escolher essa" tem que caber na largura da foto.
const ROTULOS = [
  {
    chave: "removerFundo",
    rotulo: "Remover fundo",
    ajuda: "Deixa o fundo branco liso. Não precisa em foto que já está sem fundo.",
  },
  {
    chave: "iluminacao",
    rotulo: "Iluminação",
    ajuda: "Melhora a iluminação sem mudar a cor do produto.",
  },
  {
    chave: "ampliar",
    // Voltou a se chamar "Ampliar" (pedido do dono em 21/09/2026, "como no inicio do teste"). Toda
    // foto ja e ajustada para 1024x1024 de graca, esticando os pixels; esta opcao e outra coisa: a IA
    // refaz a foto PEQUENA com mais definicao, e so aceita foto de ate 1 megapixel.
    rotulo: "Ampliar",
    ajuda:
      "Ampliar: a IA refaz uma foto pequena com mais definição (o ajuste simples para 1024 px já é automático e grátis). Só vale para foto de até 1 megapixel, cerca de 1000x1000.",
  },
];

const reais = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dolares = (valor) => `US$ ${valor.toFixed(2).replace(".", ",")}`;

/**
 * O tamanho que a foto TINHA antes do ajuste, para a etiqueta do canto da original. Fotos com o lado
 * maior abaixo de 1024 foram ampliadas (e ficam menos nitidas); acima, reduzidas.
 */
function tamanhoAnterior(origem) {
  if (!origem?.largura || !origem?.altura) return null;
  const { largura, altura } = origem;
  const maior = Math.max(largura, altura);
  if (largura === 1024 && altura === 1024) return null;
  if (maior < 1024) return `era menor: ${largura}×${altura}`;
  if (maior > 1024) return `era maior: ${largura}×${altura}`;
  return `era ${largura}×${altura}`;
}

// O lado das fotos acompanha a ALTURA da tela: o que sobra depois do cabecalho, das linhas de baixo e
// da tira de miniaturas. Assim as duas ficam o maior possivel sem empurrar os botoes para fora.
const ALTURA_DA_FOTO = "max(240px, calc(100vh - 375px))";
const LADO_DA_FOTO = `min(100%, ${ALTURA_DA_FOTO})`;
// A janela tem a largura das duas fotos mais as setas e as margens, e nao a da tela: com o espaco
// sobrando entre as fotos, o olho tem que atravessar a tela para comparar.
const LARGURA_DA_JANELA = `min(97vw, calc(2 * ${ALTURA_DA_FOTO} + 190px))`;

async function tentar(acao) {
  try {
    return await acao();
  } catch (erro) {
    return { ok: false, erro: erro?.message ?? "Falha inesperada." };
  }
}

function Quadro({ titulo, legenda, acima, botoes, children }) {
  return (
    <figure className="mx-auto flex flex-col gap-1.5" style={{ width: LADO_DA_FOTO }}>
      <p className="text-center text-xs font-medium text-suave">{titulo}</p>
      <div className="relative aspect-square overflow-hidden rounded border border-borda bg-white">
        {children}
      </div>
      {/* Origem, tamanho e o selo "Finalizada" moram AQUI, embaixo da foto, e nao por cima dela (pedido do
          dono em 21/09/2026: em cima atrapalhavam a visualizacao da imagem). */}
      <figcaption className="flex min-h-6 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-600">
        {legenda}
      </figcaption>
      <div className="flex min-h-8 flex-wrap items-center justify-center gap-1.5">{acima}</div>
      <div className="flex min-h-9 flex-nowrap items-center justify-center gap-1.5">{botoes}</div>
    </figure>
  );
}

/**
 * O selo "Finalizada" e tambem o jeito de DESFAZER a escolha (pedido do dono em 21/09/2026): clicar nele
 * tira o "finalizada" e os dois botoes "Escolher essa" voltam a ficar verdes. O "×" no fim diz que da para
 * clicar.
 */
function SeloFinalizada({ aoDesfazer, desativado }) {
  return (
    <button
      type="button"
      onClick={aoDesfazer}
      disabled={desativado}
      aria-label="Desfazer: tirar a validação da foto"
      title="Desfazer"
      className="group/selo inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
    >
      <Check size={12} strokeWidth={3} /> Validada
      <X size={12} className="opacity-70 group-hover/selo:opacity-100" />
    </button>
  );
}

/**
 * "Escolher essa": verde quando da para clicar; CINZA FOSCO quando esta foi a escolhida; contorno
 * apagado quando ainda nao ha o que escolher (a melhorada sem previa nem compra).
 */
function BotaoEscolher({ escolhida, indisponivel, aoClicar, rotulo, dica, compacto = false }) {
  const estilo = escolhida
    ? "cursor-default bg-slate-200 text-slate-500 opacity-70"
    : indisponivel
      ? "cursor-not-allowed border border-borda text-suave opacity-60"
      : "bg-emerald-600 text-white hover:opacity-90";
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={escolhida || indisponivel}
      title={dica}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded py-2 text-sm font-medium whitespace-nowrap ${
        compacto ? "px-2.5" : "px-3"
      } ${estilo}`}
    >
      <Check size={14} strokeWidth={3} /> {rotulo}
    </button>
  );
}

function FotoEmRevisao({
  lote,
  imagem,
  outras,
  dados,
  mudarDados,
  mudarNB,
  estado,
  estadoNB,
  atualizarEstado,
  atualizarEstadoNB,
  aoSalvouPrompt,
  ocupado,
  aoComprar,
  aoFinalizar,
  aoExcluir,
  aoEscolherVersao,
  aoAtualizarFoto,
}) {
  const [erro, setErro] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [zoom, setZoom] = useState(null);
  const [ampliada, setAmpliada] = useState(null);
  const [gerando, iniciarPrevia] = useTransition();
  const [comprando, iniciarCompra] = useTransition();
  // A geracao do Nano Banana mora aqui (e nao no painel dele) para travar tambem os botoes do Photoroom.
  const [gerandoNB, iniciarGeracaoNB] = useTransition();

  const opcoes = dados?.opcoes ?? OPCOES_INICIAIS;
  const previa = dados?.previa ?? null;
  const algumaOpcao = Object.values(opcoes).some(Boolean);
  const previaVale = Boolean(previa) && JSON.stringify(previa.opcoes) === JSON.stringify(opcoes);
  const compra = estado?.compra;
  const finalizada = Boolean(imagem.finalizada);
  // A versao do Photoroom ja comprada (o quadro da direita a mostra); `temPaga` inclui o Nano Banana, para
  // excluir pedir confirmacao de qualquer foto paga.
  const temPhotoroom = Boolean(imagem.versoes?.photoroom);
  const temPaga = temPhotoroom || Boolean(imagem.versoes?.nanobanana);
  const escolhida = finalizada ? (imagem.versao ?? "original") : null;
  const parado = ocupado || gerando || comprando || gerandoNB;
  // A aba da direita, lembrada por foto (padrao: Photoroom).
  const aba = dados?.aba === "nanobanana" ? "nanobanana" : "photoroom";

  // O Photoroom so amplia foto de ate 1 megapixel, e o que ele recebe e o ARQUIVO QUE CHEGOU (nao a
  // foto ja ajustada). Acima disso a opcao "Ampliar" fica desligada: melhor do que o dono descobrir
  // pelo erro, e foto grande tambem nao precisa dela.
  const pixelsDaOrigem = imagem.origem ? imagem.origem.largura * imagem.origem.altura : 0;
  const grandeParaAmpliar = pixelsDaOrigem > MAXIMO_PIXELS_PARA_AMPLIAR;
  const anterior = tamanhoAnterior(imagem.origem);

  // Custo em reais (estimativa, pela cotacao de `cotacaoDolar.js`), com o dolar entre parenteses: o
  // Photoroom cobra em dolar no cartao.
  const custoEmReais = estado ? reais(estado.custoBrl) : null;
  const custoCompleto = estado ? `${custoEmReais} (${dolares(estado.custoUsd)})` : "US$ 0,10";

  // A esquerda mostra sempre a original ja padronizada; a direita, a previa quando existe e, sem ela,
  // a melhorada ja comprada.
  const urlDaOriginal = imagem.urls?.original ?? imagem.url;
  const urlDaDireita = previa ? previa.url : temPhotoroom ? imagem.urls?.photoroom : null;

  function mudarOpcao(chave) {
    mudarDados({ opcoes: { ...opcoes, [chave]: !opcoes[chave] } });
    setConfirmando(false);
  }

  function gerar() {
    setErro(null);
    setConfirmando(false);
    iniciarPrevia(async () => {
      const resposta = await tentar(() => gerarPreviaPhotoroom(lote, imagem.base, opcoes));
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      mudarDados({ previa: { url: resposta.previaUrl, opcoes: resposta.opcoes } });
      // O contador de uso mudou: le de novo, sem esperar reabrir a janela.
      atualizarEstado();
    });
  }

  function comprar() {
    setErro(null);
    iniciarCompra(async () => {
      const resposta = await tentar(() => comprarPhotoroom(lote, imagem.base, opcoes));
      if (!resposta.ok) {
        setErro(resposta.erro);
        setConfirmando(false);
        return;
      }
      mudarDados({ previa: null });
      setConfirmando(false);
      atualizarEstado();
      aoComprar(resposta.imagem);
    });
  }

  function excluir() {
    // Ha versao paga: pede mais um clique antes de jogar fora.
    if (temPaga && !confirmandoExclusao) {
      setConfirmandoExclusao(true);
      return;
    }
    aoExcluir(imagem);
  }

  // ----- Esquerda: escolher a original -----
  const botoesEsquerda = (
    <>
      <BotaoEscolher
        escolhida={escolhida === "original"}
        indisponivel={parado}
        aoClicar={() =>
          (imagem.versao ?? "original") !== "original" ? aoEscolherVersao(imagem, "original") : aoFinalizar(imagem.base, true)
        }
        rotulo="Escolher essa"
        dica={escolhida === "original" ? "Esta é a foto escolhida" : "Usar a original no produto"}
      />
      <button
        type="button"
        onClick={excluir}
        disabled={parado}
        title="Exclui a foto, a prévia e a melhorada, e segue para a próxima"
        className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        <Trash2 size={14} /> Excluir
      </button>
    </>
  );

  // ----- Direita: com previa na tela, escolher e COMPRAR; sem previa, escolher a melhorada ja comprada -----
  const escolherComprando = Boolean(previa);
  const podeEscolherDireita = escolherComprando ? previaVale && Boolean(compra?.ok) && !ocupado : temPhotoroom;

  // O porque do botao da direita estar cinza (ou o que ele faz), no icone "i" ao lado dele. Antes era
  // um texto fixo embaixo, e o dono nao sabia que precisava da previa para o botao ligar.
  const explicacaoDireita = [];
  if (estado && compra && !compra.ok) {
    explicacaoDireita.push(compra.ligada ? compra.motivo : "Compra desligada (modo teste): só a prévia grátis funciona.");
  }
  if (previa && !previaVale) explicacaoDireita.push("Você mudou as opções: gere a prévia de novo.");
  else if (previa) explicacaoDireita.push(`Compra a foto sem marca d'água por ${custoCompleto} e a usa no produto.`);
  else if (temPhotoroom) explicacaoDireita.push("Usa a melhorada que você já comprou, sem custo.");
  else {
    explicacaoDireita.push(
      "Gere a prévia (grátis) para habilitar este botão. Escolher a melhorada compra a foto sem marca d'água.",
    );
  }
  const dicaDireita = explicacaoDireita.join(" ");

  const botoesDireita = confirmando ? (
    <>
      <button
        type="button"
        onClick={comprar}
        disabled={!podeEscolherDireita || comprando}
        className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {comprando ? <Loader size={14} className="animate-spin" /> : <ShoppingCart size={14} />}
        Sim, comprar
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        disabled={comprando}
        className="rounded border border-borda px-3 py-2 text-sm hover:bg-fundo disabled:opacity-50"
      >
        Voltar
      </button>
    </>
  ) : (
    <>
      {/* "Gerar previa" e "Escolher essa" lado a lado, dentro da largura da foto (pedido do dono em
          21/09/2026): o "(gratis)" saiu do botao e mora no "i" ao lado; a previa e sempre gratis. */}
      <button
        type="button"
        onClick={gerar}
        disabled={parado || !algumaOpcao || !estado?.previa.ok}
        title="Gera uma prévia grátis, com marca d'água"
        className="inline-flex shrink-0 items-center gap-1.5 rounded border border-acento px-2.5 py-2 text-sm font-medium whitespace-nowrap text-acento hover:bg-fundo disabled:opacity-50"
      >
        {gerando ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
        Gerar prévia
      </button>
      <BotaoEscolher
        escolhida={escolhida === "photoroom" && !previa}
        indisponivel={!podeEscolherDireita || parado}
        aoClicar={() => (escolherComprando ? setConfirmando(true) : aoEscolherVersao(imagem, "photoroom"))}
        rotulo={escolherComprando && estado ? `Escolher essa (${custoEmReais})` : "Escolher essa"}
        compacto
      />
      <BolhaDeAjuda texto={dicaDireita} variante="inline-direita" />
    </>
  );

  // As tres opcoes e, no fim, o "i" que explica cada uma (e por que "Ampliar" esta desligada, se estiver).
  const ajudaDasOpcoes = [
    ...ROTULOS.map((item) => item.ajuda),
    grandeParaAmpliar
      ? `Ampliar está desligada: esta foto tem ${imagem.origem.largura}×${imagem.origem.altura} e o Photoroom só amplia até 1 megapixel.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const opcoesEmbaixoDaPrevia = (
    <>
      {ROTULOS.map((item) => {
        const desligada = item.chave === "ampliar" && grandeParaAmpliar;
        return (
          <label
            key={item.chave}
            className={`inline-flex items-center gap-1.5 rounded border border-borda px-2 py-1 text-xs ${
              desligada ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-fundo"
            }`}
          >
            <input
              type="checkbox"
              checked={desligada ? false : opcoes[item.chave]}
              onChange={() => mudarOpcao(item.chave)}
              disabled={comprando || desligada}
              className="h-3.5 w-3.5 accent-acento"
            />
            {item.rotulo}
          </label>
        );
      })}
      <BolhaDeAjuda texto={ajudaDasOpcoes} variante="inline-direita" />
    </>
  );

  // Embaixo da foto da ESQUERDA: a origem (so a loja, o nome do produto ja esta na lista de referencias),
  // o tamanho e, se a original foi a escolhida, o selo que tambem desfaz. O tamanho diz se a foto ficou
  // esticada e menos nitida: uma de 397x300 a 1024 e outra coisa que uma de 1200x900.
  const desfazerEscolha = () => aoFinalizar(imagem.base, false);
  const legendaEsquerda = (
    <>
      <span>{imagem.fonte ? `Origem: ${imagem.fonte}` : "Enviada por você"}</span>
      <span aria-hidden="true">·</span>
      <span>
        1024×1024{anterior ? ` (${anterior})` : ""}
      </span>
      {escolhida === "original" && <SeloFinalizada aoDesfazer={desfazerEscolha} desativado={parado} />}
    </>
  );

  // Embaixo da foto da DIREITA: o selo, se a melhorada foi a escolhida, e o aviso de que as opcoes mudaram.
  // So o que pede uma acao fica escrito; o resto e explicado no "i".
  const cabecalhoDireita = temPhotoroom && !previa ? "Melhorada" : "Prévia do Photoroom";
  const legendaDireita = (
    <>
      <span>{cabecalhoDireita}</span>
      {previa && !previaVale && <span>Você mudou as opções: gere a prévia de novo.</span>}
      {escolhida === "photoroom" && <SeloFinalizada aoDesfazer={desfazerEscolha} desativado={parado} />}
    </>
  );

  // As abas do quadro da direita ficam no lugar do titulo. O titulo antigo ("Melhorada" ou "Previa do
  // Photoroom") passou para a legenda embaixo da foto.
  // O site de cada servico, para usar fora do Rise (pedido do dono em 06/10/2026): so o icone ao lado do nome
  // da aba. Um link com texto parecia uma terceira ferramenta. O icone e um <a> FORA do botao da aba (link
  // dentro de botao nao vale em HTML), e clicar nele nao troca de aba.
  const abas = (
    <span className="flex w-full gap-1" role="tablist">
      {[
        ["photoroom", "Photoroom", { nome: "Photoroom", url: "https://app.photoroom.com" }],
        ["nanobanana", "Nano Banana", { nome: "Flow do Google, onde o Nano Banana roda", url: "https://labs.google/flow" }],
      ].map(([chave, rotulo, site]) => (
        <span
          key={chave}
          className={`flex flex-1 items-center justify-center gap-1 border-b-2 ${
            aba === chave ? "border-acento" : "border-borda"
          }`}
        >
          <button
            type="button"
            role="tab"
            aria-selected={aba === chave}
            onClick={() => mudarDados({ aba: chave })}
            className={`py-1 pl-2 text-xs ${
              aba === chave ? "font-semibold text-acento" : "text-suave hover:text-texto"
            }`}
          >
            {rotulo}
          </button>
          <a
            href={site.url}
            target="_blank"
            rel="noreferrer"
            title={`Abre o site do ${site.nome} numa aba nova`}
            aria-label={`Abrir o site do ${site.nome}`}
            className="rounded p-0.5 pr-2 text-suave hover:text-acento"
          >
            <ExternalLink size={11} />
          </a>
        </span>
      ))}
    </span>
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2">
        <Quadro
          titulo={temPaga ? "Original" : "Foto atual"}
          legenda={legendaEsquerda}
          botoes={botoesEsquerda}
        >
          <ImagemComZoom
            src={urlDaOriginal}
            alt="Foto atual do produto"
            zoom={zoom}
            setZoom={setZoom}
            aoAmpliar={() => setAmpliada({ src: urlDaOriginal, alt: "Foto atual do produto" })}
            className="h-full w-full"
          />
        </Quadro>

        {aba === "nanobanana" ? (
          <PainelNanoBanana
            lote={lote}
            imagem={imagem}
            outras={outras}
            estado={estadoNB}
            nb={dados?.nb}
            mudarNB={mudarNB}
            abas={abas}
            selo={escolhida === "nanobanana" ? <SeloFinalizada aoDesfazer={desfazerEscolha} desativado={parado} /> : null}
            lado={LADO_DA_FOTO}
            parado={ocupado || gerando || comprando}
            gerando={gerandoNB}
            iniciarGeracao={iniciarGeracaoNB}
            aoGerado={(parcial) => {
              aoAtualizarFoto(imagem.base, parcial);
              atualizarEstadoNB();
            }}
            aoEscolher={() => aoEscolherVersao(imagem, "nanobanana")}
            aoSalvouPrompt={aoSalvouPrompt}
            aoAmpliar={setAmpliada}
            zoom={zoom}
            setZoom={setZoom}
          />
        ) : (
        <Quadro titulo={abas} legenda={legendaDireita} acima={opcoesEmbaixoDaPrevia} botoes={botoesDireita}>
          {urlDaDireita ? (
            <ImagemComZoom
              src={urlDaDireita}
              alt={previa ? "Prévia com marca d'água" : "Foto melhorada"}
              zoom={zoom}
              setZoom={setZoom}
              aoAmpliar={() => setAmpliada({ src: urlDaDireita, alt: cabecalhoDireita })}
              className="h-full w-full"
              opaca={Boolean(previa) && !previaVale}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-suave">
              A prévia aparece aqui, grátis e com marca d&apos;água.
            </span>
          )}
          {gerando && (
            <span className="absolute inset-0 flex items-center justify-center gap-2 bg-white/80 text-sm text-suave">
              <Loader size={16} className="animate-spin" /> Gerando a prévia...
            </span>
          )}
        </Quadro>
        )}
      </div>

      {estado && !estado.previa.ok && (
        <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">{estado.previa.motivo}</p>
      )}
      {confirmando && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Comprar esta foto por <strong>{custoEmReais}</strong> ({dolares(estado.custoUsd)}, a{" "}
          {reais(estado.cotacao.valor)} por dólar) e usá-la no produto? O Photoroom cobra em dólar, no cartão: o
          valor em reais e uma estimativa, sem IOF.
        </p>
      )}
      {erro && <p className="rounded bg-red-50 p-2 text-xs text-red-800">{erro}</p>}
      {confirmandoExclusao && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Esta foto tem versão paga. Excluir joga fora todas as versões dela. Clique em Excluir de novo para
          confirmar.
        </p>
      )}
      {ampliada && <AmpliacaoDeFoto src={ampliada.src} alt={ampliada.alt} aoFechar={() => setAmpliada(null)} />}
    </div>
  );
}

export default function JanelaDeFotos({
  lote,
  imagens,
  atual,
  porFoto,
  setPorFoto,
  ocupado,
  erro,
  alterado,
  comprasNaJanela,
  aoEscolher,
  aoSalvar,
  aoCancelar,
  aoComprar,
  aoFinalizar,
  aoExcluir,
  aoEscolherVersao,
  aoAtualizarFoto,
  aoReordenar,
}) {
  const [estado, setEstado] = useState(null);
  // O estado do Nano Banana (modelos, prompts salvos, uso), lido do servidor ao abrir.
  const [estadoNB, setEstadoNB] = useState(null);
  // A faixa de pergunta antes de sair: "sair" (X, Esc ou clique fora, com alteracoes) ou "cancelar"
  // (Cancelar, quando ha compra nesta janela, que nao tem volta).
  const [barra, setBarra] = useState(null);

  const total = imagens.length;
  const indice = atual ? imagens.findIndex((imagem) => imagem.base === atual.base) : -1;
  const finalizadas = imagens.filter((imagem) => imagem.finalizada).length;

  // FECHAR sem escolher entre Salvar e Cancelar: sem alteracao fecha direto; com alteracao, pergunta.
  // Perder a escolha de 20 fotos por um Esc sem querer seria pior do que um clique a mais.
  function pedirParaFechar() {
    if (!alterado) aoCancelar();
    else setBarra("sair");
  }

  // CANCELAR desfaz tudo de graca, MENOS a compra. Se houve compra nesta janela, avisa antes.
  function pedirCancelar() {
    if (alterado && comprasNaJanela > 0) setBarra("cancelar");
    else aoCancelar();
  }

  // Chaves, trava e uso, lidos do servidor ao abrir. A resposta chega depois do primeiro
  // desenho, e por isso o setState fica no `then`, e nao no corpo do efeito.
  useEffect(() => {
    let vivo = true;
    estadoDoPhotoroom().then((resposta) => {
      if (vivo) setEstado(resposta);
    });
    estadoDoNanoBanana().then((resposta) => {
      if (vivo) setEstadoNB(resposta);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const atualizarEstado = () => {
    estadoDoPhotoroom().then(setEstado);
  };
  // Depois de gerar, o uso do dia e do mes mudou.
  const atualizarEstadoNB = () => {
    estadoDoNanoBanana().then(setEstadoNB);
  };
  // O prompt salvo passa a valer na hora, sem ler o servidor de novo.
  const aoSalvouPrompt = (modelo, texto) => {
    setEstadoNB((anterior) => (anterior ? { ...anterior, prompts: { ...anterior.prompts, [modelo]: texto } } : anterior));
  };

  // O ouvinte le sempre a foto de agora, sem ser refeito a cada desenho.
  const aoTeclar = useEffectEvent((evento) => {
    if (evento.key === "Escape") {
      if (barra) setBarra(null);
      else pedirParaFechar();
    } else if (evento.key === "ArrowLeft" && indice > 0) aoEscolher(imagens[indice - 1].base);
    else if (evento.key === "ArrowRight" && indice >= 0 && indice < total - 1) aoEscolher(imagens[indice + 1].base);
  });

  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener("keydown", aoTeclar);
    };
  }, []);

  const uso = estado?.uso;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3"
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) pedirParaFechar();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Fotos do produto"
        style={{ width: LARGURA_DA_JANELA }}
        className="flex max-h-[97vh] flex-col overflow-hidden rounded-lg border border-borda bg-superficie shadow-2xl"
      >
        <header className="flex items-center gap-2 border-b border-borda px-4 py-2.5">
          <Sparkles size={16} className="text-acento" />
          <h2 className="text-sm font-semibold">Fotos do produto</h2>
          <span className="text-xs text-suave">
            {atual
              ? `Foto ${indice + 1} de ${total} · ${finalizadas} validada${finalizadas === 1 ? "" : "s"}`
              : "Nenhuma foto"}
          </span>
          <button
            type="button"
            onClick={pedirParaFechar}
            aria-label="Fechar"
            className="ml-auto rounded p-1 text-suave hover:bg-fundo"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {/* Erro de excluir ou de escolher a versao: acontece no painel, que esta atras desta janela. */}
          {erro && <p className="mb-3 rounded bg-red-50 p-2 text-xs text-red-800">{erro}</p>}
          {!atual && (
            <p className="py-16 text-center text-sm text-suave">
              Todas as fotos foram excluídas. Cancele para trazer de volta, ou salve para ficar sem elas.
            </p>
          )}
          {atual && (
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              onClick={() => aoEscolher(imagens[indice - 1].base)}
              disabled={indice <= 0}
              aria-label="Foto anterior"
              title="Foto anterior (seta para à esquerda)"
              className="flex w-9 shrink-0 items-center justify-center self-center rounded-full border border-borda py-6 text-suave hover:bg-fundo disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="min-w-0 flex-1">
              <FotoEmRevisao
                key={atual.base}
                lote={lote}
                imagem={atual}
                outras={imagens}
                dados={porFoto[atual.base]}
                mudarDados={(parcial) =>
                  setPorFoto((anterior) => ({
                    ...anterior,
                    [atual.base]: { ...anterior[atual.base], ...parcial },
                  }))
                }
                // O estado do Nano Banana da foto (modelo, prompt editado, extras) vai em `nb`, e aceita
                // uma funcao do estado de agora: duas respostas seguidas nao perdem uma a outra.
                mudarNB={(alteracao) =>
                  setPorFoto((anterior) => {
                    const daFoto = anterior[atual.base] ?? {};
                    const nb = daFoto.nb ?? {};
                    const novo = typeof alteracao === "function" ? alteracao(nb) : alteracao;
                    return { ...anterior, [atual.base]: { ...daFoto, nb: { ...nb, ...novo } } };
                  })
                }
                estado={estado}
                estadoNB={estadoNB}
                atualizarEstado={atualizarEstado}
                atualizarEstadoNB={atualizarEstadoNB}
                aoSalvouPrompt={aoSalvouPrompt}
                aoAtualizarFoto={aoAtualizarFoto}
                ocupado={ocupado}
                aoComprar={aoComprar}
                aoFinalizar={aoFinalizar}
                aoExcluir={aoExcluir}
                aoEscolherVersao={aoEscolherVersao}
              />
            </div>

            <button
              type="button"
              onClick={() => aoEscolher(imagens[indice + 1].base)}
              disabled={indice >= total - 1}
              aria-label="Próxima foto"
              title="Próxima foto (seta para à direita)"
              className="flex w-9 shrink-0 items-center justify-center self-center rounded-full border border-borda py-6 text-suave hover:bg-fundo disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight size={20} />
            </button>
          </div>
          )}
        </div>

        {/* A pergunta antes de sair ou de cancelar. Fica escrita, e nao num "i": pede uma decisao. */}
        {barra && (
          <div className="flex flex-wrap items-center gap-2 border-t border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <span className="min-w-0 flex-1">
              {barra === "sair"
                ? "Você fez alterações nas fotos. Salvar antes de fechar?"
                : `Cancelar desfaz as escolhas, a ordem e as exclusões desta janela, mas NÃO devolve o valor ${
                    comprasNaJanela === 1 ? "da foto paga" : `das ${comprasNaJanela} fotos pagas`
                  } agora: ${comprasNaJanela === 1 ? "ela fica guardada" : "elas ficam guardadas"}, só não ${
                    comprasNaJanela === 1 ? "será usada" : "serão usadas"
                  }. Desfazer mesmo?`}
              {barra === "sair" && comprasNaJanela > 0 && (
                <span>
                  {" "}
                  Descartar não devolve o valor {comprasNaJanela === 1 ? "da foto paga" : "das fotos pagas"}.
                </span>
              )}
            </span>
            {barra === "sair" ? (
              <>
                <button
                  type="button"
                  onClick={aoSalvar}
                  disabled={ocupado}
                  className="rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={aoCancelar}
                  disabled={ocupado}
                  className="rounded border border-amber-400 px-3 py-1.5 text-sm hover:bg-amber-100 disabled:opacity-50"
                >
                  Descartar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={aoCancelar}
                disabled={ocupado}
                className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Sim, desfazer
              </button>
            )}
            <button
              type="button"
              onClick={() => setBarra(null)}
              className="rounded border border-amber-400 px-3 py-1.5 text-sm hover:bg-amber-100"
            >
              {barra === "sair" ? "Continuar editando" : "Voltar"}
            </button>
          </div>
        )}

        <footer className="flex items-center gap-3 border-t border-borda px-4 py-2">
          <div className="min-w-0 flex-1">
            <TiraDeFotos
              imagens={imagens}
              atualBase={atual?.base ?? null}
              aoEscolher={aoEscolher}
              aoReordenar={aoReordenar}
              tamanho="h-12 w-12"
            />
          </div>

          {/* Era uma frase fixa no rodape; e mensagem informativa, entao e o icone "i" (padrao do sistema). */}
          <BolhaDeAjuda
            texto="Arraste as miniaturas para mudar a ordem. A primeira da fila é a foto principal do produto."
            variante="inline"
          />

          {/* Em DUAS linhas e mais curto (pedido do dono em 21/09/2026): o espaco que sobra vai para mais
              miniaturas na tira. */}
          {uso && (
            <span className="hidden shrink-0 text-[10px] leading-tight text-suave md:block">
              <span className="block">Prévias hoje: {uso.previasHoje}/{uso.limiteDia}</span>
              <span className="block">
                Compras no mês: {reais(estado.gastoMesBrl ?? 0)}
              </span>
            </span>
          )}
          {estadoNB?.uso && (
            <span className="hidden shrink-0 text-[10px] leading-tight text-suave md:block">
              <span className="block">Nano Banana hoje: {estadoNB.uso.hoje}/{estadoNB.uso.limiteDia}</span>
              <span className="block">Nano Banana no mês: {reais(estadoNB.gastoMesBrl ?? 0)}</span>
            </span>
          )}

          {/* Salvar guarda tudo o que foi feito nas fotos; Cancelar desfaz tudo e mantem as de antes. */}
          <button
            type="button"
            onClick={pedirCancelar}
            disabled={ocupado}
            title="Desfaz o que foi feito nesta janela e mantém as fotos como estavam antes"
            className="shrink-0 rounded border border-borda px-4 py-2 text-sm hover:bg-fundo disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={aoSalvar}
            disabled={ocupado}
            title="Guarda todas as alterações feitas nas fotos"
            className="inline-flex shrink-0 items-center gap-1.5 rounded bg-acento px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {ocupado && <Loader size={14} className="animate-spin" />}
            Salvar
          </button>
        </footer>
      </section>
    </div>
  );
}
