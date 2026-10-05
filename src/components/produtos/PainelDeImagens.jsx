"use client";

import { useRef, useState, useTransition } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ImageOff,
  ImagePlus,
  Loader,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";

import {
  enviarImagemAoLote,
  escolherVersaoNoLote,
  removerImagemDoLote,
  removerImagensDoLote,
} from "@/app/produtos/acoes-imagens";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { MAXIMO_FOTOS_NO_PAINEL, MAXIMO_IMAGENS } from "@/lib/limites";
import { AmpliacaoDeFoto, ImagemComZoom } from "./ImagemComZoom";
import JanelaDeFotos from "./JanelaDeFotos";
import TiraDeFotos from "./TiraDeFotos";

async function tentar(acao) {
  try {
    return await acao();
  } catch (erro) {
    return {
      ok: false,
      erro:
        erro?.message?.includes("Body exceeded") || erro?.name === "TypeError"
          ? "Falha ao enviar a foto. Ela pode ser grande demais para a conexao."
          : (erro?.message ?? "Falha inesperada ao executar a acao."),
    };
  }
}

/**
 * Nome do arquivo baixado: o SKU que esta digitado no formulario e a posicao da foto
 * ("100103-2.jpg"). Sem o SKU, todo download de todo produto se chamaria "foto-1.jpg" e um
 * sobrescreveria o outro na pasta de downloads. O SKU e lido do campo na hora do clique, e nao
 * guardado em estado: ele e um campo nao controlado e o painel nao precisa saber dele o resto do tempo.
 * O que vem do campo e texto livre, entao so ficam letras, numeros, ponto, hifen e sublinhado.
 */
function nomeParaBaixar(link, posicao) {
  const sku = link.closest("form")?.elements.namedItem("sku")?.value ?? "";
  const limpo = sku.trim().replace(/[^\w.-]+/g, "_");
  return `${limpo || "foto"}-${posicao}.jpg`;
}

// O que a janela pode mudar numa foto: a ordem, a escolha, a versao e a exclusao. E com isto que se
// sabe se ha alteracao a salvar ou a descartar.
const assinatura = (lista) =>
  JSON.stringify(lista.map((i) => [i.base, Boolean(i.finalizada), Boolean(i.melhorada), Boolean(i.excluida)]));

/**
 * As fotos do produto NOVO, antes de ele ser salvo.
 *
 * Toda foto que entra (enviada aqui, do Bling, do "Clonar a partir de um codigo" ou dos produtos
 * marcados na lupa) e PADRONIZADA no servidor na hora (1024x1024, fundo branco, JPEG), de graca, e
 * o que se ve aqui ja e a foto final. So o Photoroom e opcional, foto por foto.
 *
 * Este painel e a VITRINE (pedido do dono em 21/09/2026): a foto com zoom, as setas, a tira de
 * miniaturas, "Melhorar" e "Excluir". Escolher e melhorar ficam na janela de revisao
 * (`JanelaDeFotos`). A ordem da tira e a ordem em que as fotos vao para o produto, e a PRIMEIRA e a
 * principal: arrastar as miniaturas e a unica forma de escolher.
 *
 * A JANELA TRABALHA NUM RASCUNHO, com "Salvar" e "Cancelar" (pedido do dono em 21/09/2026):
 *  - `imagens` (o estado do formulario) so muda no Salvar, entao ele e o retrato de antes da janela;
 *  - as exclusoes da janela sao MARCADAS (`excluida`) e so apagam no servidor no Salvar, senao o
 *    Cancelar nao teria o que devolver;
 *  - o Cancelar restaura a ordem, as escolhas e a versao de cada foto (o servidor volta a versao que
 *    estava). A compra do Photoroom nao tem volta: a foto melhorada fica guardada, so nao e usada.
 * O "Excluir" do painel, fora da janela, apaga na hora.
 *
 * O painel aceita ate `MAXIMO_FOTOS_NO_PAINEL` candidatas, mas o produto leva `MAXIMO_IMAGENS`: o
 * dono exclui as fracas, e o Salvar recusa se sobrar mais do que cabe. O estado mora no formulario,
 * e nao aqui, porque o "Clonar" e a lupa tambem alimentam as fotos.
 *
 * <img> e nao next/image: as fotos vem do lote temporario, servidas por rota propria, e mudam
 * de conteudo sob o mesmo nome (Melhorar, escolher a versao).
 */
export default function PainelDeImagens({
  lote,
  garantirLote,
  imagens,
  setImagens,
  importando,
  progressoDaImportacao,
  aoAlterar,
}) {
  const [pendente, iniciarTransicao] = useTransition();
  const [foco, setFoco] = useState(null);
  const [erro, setErro] = useState(null);
  const [rascunho, setRascunho] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [ampliada, setAmpliada] = useState(false);
  // Previa e opcoes do Photoroom de cada foto ({ [base]: { opcoes, previa } }). Ficam aqui, e nao
  // na janela: fechar a janela nao pode perder uma previa ja gerada.
  const [porFoto, setPorFoto] = useState({});
  // Foto paga que o dono clicou uma vez em "Excluir": o segundo clique confirma.
  const [paraConfirmar, setParaConfirmar] = useState(null);
  const entrada = useRef(null);

  const janelaAberta = rascunho !== null;
  const visiveisDaJanela = rascunho ? rascunho.filter((imagem) => !imagem.excluida) : [];
  const atualDaJanela = visiveisDaJanela.find((imagem) => imagem.base === foco) ?? visiveisDaJanela[0] ?? null;

  const alteradoNaJanela = janelaAberta && assinatura(rascunho) !== assinatura(imagens);
  const jaCompradas = new Set(imagens.filter((imagem) => imagem.temMelhorada).map((imagem) => imagem.base));
  const comprasNaJanela = janelaAberta
    ? rascunho.filter((imagem) => imagem.temMelhorada && !jaCompradas.has(imagem.base)).length
    : 0;

  const atual = imagens.find((imagem) => imagem.base === foco) ?? imagens[0] ?? null;
  const indice = atual ? imagens.indexOf(atual) : -1;
  const cheio = imagens.length >= MAXIMO_FOTOS_NO_PAINEL;
  const ocupado = pendente || importando;
  // Validadas = com o check verde (`finalizada`). So elas sao salvas (04/10/2026): as demais sao excluidas
  // no Salvar, e por isso o limite do produto conta so as validadas.
  const finalizadas = imagens.filter((imagem) => imagem.finalizada).length;
  const naoValidadas = imagens.length - finalizadas;
  const excedente = finalizadas - MAXIMO_IMAGENS;

  // Com a janela aberta as alteracoes vao para o rascunho; fora dela, direto para as fotos.
  const mudarLista = (funcao) => (janelaAberta ? setRascunho(funcao) : setImagens(funcao));

  function enviarArquivos(arquivos) {
    const lista = [...arquivos];
    if (lista.length === 0) return;

    const vagas = MAXIMO_FOTOS_NO_PAINEL - imagens.length;
    const sobra = lista.length - vagas;

    iniciarTransicao(async () => {
      const problemas = [];
      if (sobra > 0) problemas.push(`Limite de ${MAXIMO_FOTOS_NO_PAINEL} fotos: ${sobra} ficou de fora.`);

      const loteAtual = garantirLote();
      for (const arquivo of lista.slice(0, Math.max(vagas, 0))) {
        const dados = new FormData();
        dados.set("arquivo", arquivo);
        const resposta = await tentar(() => enviarImagemAoLote(loteAtual, dados));
        if (!resposta.ok) {
          problemas.push(`${arquivo.name}: ${resposta.erro}`);
          continue;
        }
        setImagens((anteriores) => [...anteriores, resposta.imagem]);
        aoAlterar();
      }
      setErro(problemas.length > 0 ? problemas.join(" ") : null);
    });
  }

  function aoEscolherArquivos(evento) {
    const arquivos = evento.target.files ? [...evento.target.files] : [];
    if (entrada.current) entrada.current.value = "";
    enviarArquivos(arquivos);
  }

  function ir(passo) {
    const alvo = imagens[indice + passo];
    if (alvo) setFoco(alvo.base);
  }

  // A ordem da tira e a ordem do produto, e a primeira e a principal.
  function reordenar(lista) {
    setImagens(lista);
    aoAlterar();
  }

  // Na janela a tira mostra so as fotos NAO excluidas; as marcadas para excluir ficam guardadas no fim.
  function reordenarNaJanela(lista) {
    setRascunho((anterior) => [...lista, ...anterior.filter((imagem) => imagem.excluida)]);
  }

  // "Finalizada" marca que o dono ja decidiu por esta foto (o check verde). Vai no Salvar do produto
  // (`ProdutoArquivo.finalizada`) e volta ao reabrir; ate ele salvar, so existe aqui na tela.
  function finalizar(base, valor) {
    mudarLista((anteriores) =>
      anteriores.map((outra) => (outra.base === base ? { ...outra, finalizada: valor } : outra)),
    );
  }

  // Troca uma foto na lista mantendo a posicao e o que ja se sabia dela. O conteudo mudou
  // (melhorada ou de volta a original), entao a decisao de "finalizada" tambem recomeca.
  function trocar(nova) {
    mudarLista((anteriores) =>
      anteriores.map((outra) =>
        outra.base === nova.base ? { ...outra, ...nova, finalizada: false } : outra,
      ),
    );
    if (!janelaAberta) aoAlterar();
  }

  // "Escolher essa" numa versao que ja existe (a original, ou a melhorada ja comprada): o servidor
  // poe a versao como a foto do produto, sem custo, e a foto fica finalizada.
  function escolherVersao(imagem, versao) {
    iniciarTransicao(async () => {
      const resposta = await tentar(() => escolherVersaoNoLote(lote, imagem.base, versao));
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      trocar(resposta.imagem);
      finalizar(imagem.base, true);
      setErro(null);
    });
  }

  // Comprou: a melhorada passa a ser a foto do produto e ja fica finalizada, porque "Escolher essa"
  // na previa e a compra.
  function aoComprar(nova) {
    trocar(nova);
    finalizar(nova.base, true);
  }

  // Exclui a foto INTEIRA (a padronizada, a original guardada, a previa e a melhorada; o servidor
  // apaga tudo) e segue para a proxima da fila. E o do painel: apaga NA HORA.
  function excluir(imagem) {
    if (imagem.temMelhorada && paraConfirmar !== imagem.base) {
      // Foto paga: pede mais um clique.
      setParaConfirmar(imagem.base);
      return;
    }
    setParaConfirmar(null);
    iniciarTransicao(async () => {
      const resposta = await tentar(() => removerImagemDoLote(lote, imagem.base));
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      const posicao = imagens.findIndex((outra) => outra.base === imagem.base);
      const restantes = imagens.filter((outra) => outra.base !== imagem.base);
      setImagens((anteriores) => anteriores.filter((outra) => outra.base !== imagem.base));
      setFoco(restantes[Math.min(posicao, restantes.length - 1)]?.base ?? null);
      setPorFoto((anterior) => {
        const novo = { ...anterior };
        delete novo[imagem.base];
        return novo;
      });
      setErro(null);
      aoAlterar();
    });
  }

  // O da janela so MARCA: o servidor so apaga no Salvar, para o Cancelar poder devolver a foto.
  function excluirNoRascunho(imagem) {
    const posicao = visiveisDaJanela.findIndex((outra) => outra.base === imagem.base);
    const restantes = visiveisDaJanela.filter((outra) => outra.base !== imagem.base);
    setRascunho((anterior) =>
      anterior.map((outra) => (outra.base === imagem.base ? { ...outra, excluida: true } : outra)),
    );
    setFoco(restantes[Math.min(posicao, restantes.length - 1)]?.base ?? null);
  }

  function abrirJanela() {
    setRascunho(imagens);
    setErro(null);
  }

  // SALVAR: as fotos passam a ser as do rascunho, e as marcadas para excluir saem do servidor.
  function salvarJanela() {
    const excluidas = rascunho.filter((imagem) => imagem.excluida).map((imagem) => imagem.base);
    const final = rascunho.filter((imagem) => !imagem.excluida);
    const mudou = alteradoNaJanela;

    setImagens(final);
    setRascunho(null);
    if (foco && !final.some((imagem) => imagem.base === foco)) setFoco(null);
    if (mudou) aoAlterar();

    if (excluidas.length > 0) {
      setPorFoto((anterior) => {
        const novo = { ...anterior };
        for (const base of excluidas) delete novo[base];
        return novo;
      });
      tentar(() => removerImagensDoLote(lote, excluidas)).then((resposta) => {
        if (!resposta.ok) setErro(resposta.erro);
      });
    }
  }

  // CANCELAR: descarta o rascunho. As fotos ja estao como antes (o rascunho nunca as tocou), menos a
  // VERSAO: comprar ou escolher a melhorada mexe na foto do servidor, e la ela volta ao que era. O que
  // foi comprado continua guardado (a tela ainda sabe da melhorada), so nao e usado.
  function cancelarJanela() {
    if (!alteradoNaJanela) {
      setRascunho(null);
      return;
    }
    const doRascunho = rascunho;
    iniciarTransicao(async () => {
      const restauradas = [];
      for (const antes of imagens) {
        const depois = doRascunho.find((outra) => outra.base === antes.base);
        if (!depois) {
          restauradas.push(antes);
          continue;
        }
        let foto = {
          ...antes,
          temMelhorada: depois.temMelhorada,
          originalUrl: depois.originalUrl,
          melhoradaUrl: depois.melhoradaUrl,
        };
        if (Boolean(depois.melhorada) !== Boolean(antes.melhorada)) {
          const resposta = await tentar(() =>
            escolherVersaoNoLote(lote, antes.base, antes.melhorada ? "melhorada" : "original"),
          );
          if (resposta.ok) foto = { ...antes, ...resposta.imagem, finalizada: antes.finalizada };
          else setErro(`Nao foi possivel devolver uma foto ao que era: ${resposta.erro}`);
        }
        restauradas.push(foto);
      }
      setImagens(restauradas);
      setRascunho(null);
    });
  }

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDragOver={(evento) => evento.preventDefault()}
      onDrop={(evento) => {
        evento.preventDefault();
        if (!cheio && !ocupado) enviarArquivos(evento.dataTransfer.files);
      }}
    >
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded border border-borda bg-white">
        {atual ? (
          <ImagemComZoom
            src={atual.url}
            alt=""
            zoom={zoom}
            setZoom={setZoom}
            aoAmpliar={() => setAmpliada(true)}
            className="h-full w-full p-1"
          />
        ) : (
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={ocupado}
            className="flex h-full w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-borda text-suave hover:border-acento hover:text-acento disabled:opacity-60"
          >
            <ImageOff size={26} />
            <span className="px-4 text-center text-xs">Enviar fotos (ou arraste para ca)</span>
            <span className="px-4 text-center text-[10px]">
              Cada foto e ajustada para 1024x1024, fundo branco
            </span>
          </button>
        )}

        {atual && (
          <>
            <span className="pointer-events-none absolute top-1 left-1 flex flex-col items-start gap-1">
              {indice === 0 && (
                <span
                  className="inline-flex items-center gap-1 rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-medium text-white"
                  title="A primeira da fila e a foto principal do produto"
                >
                  <Star size={10} className="fill-amber-300 text-amber-300" /> Principal
                </span>
              )}
              {atual.ampliada && (
                <span
                  className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900"
                  title="A foto original era menor que 1024 px e foi ampliada. Pode ter menos nitidez."
                >
                  Ampliada
                </span>
              )}
              {atual.melhorada && (
                <span
                  className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900"
                  title="Tratada pelo Photoroom."
                >
                  Melhorada
                </span>
              )}
            </span>

            {atual.finalizada && (
              <span
                className="pointer-events-none absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white shadow"
                title="Foto validada"
              >
                <Check size={14} strokeWidth={3} />
              </span>
            )}

            {imagens.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => ir(-1)}
                  disabled={indice <= 0}
                  aria-label="Foto anterior"
                  className="absolute top-1/2 left-1 -translate-y-1/2 rounded-full border border-borda bg-white/90 p-1 text-suave shadow hover:text-texto disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => ir(1)}
                  disabled={indice >= imagens.length - 1}
                  aria-label="Proxima foto"
                  className="absolute top-1/2 right-1 -translate-y-1/2 rounded-full border border-borda bg-white/90 p-1 text-suave shadow hover:text-texto disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}

            <span className="pointer-events-none absolute right-1 bottom-1 rounded bg-slate-800/70 px-1.5 py-0.5 text-[10px] text-white">
              {indice + 1} / {imagens.length}
            </span>
          </>
        )}

        {/* As fotos vao chegando uma a uma (a espera e o download das lojas): este aviso nao cobre a foto. */}
        {importando && (
          <span className="pointer-events-none absolute top-1 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-slate-800/85 px-2.5 py-1 text-[10px] text-white shadow">
            <Loader size={11} className="animate-spin" />
            {progressoDaImportacao ?? "Trazendo as fotos..."}
          </span>
        )}
        {pendente && (
          <span className="absolute inset-0 flex items-center justify-center gap-2 bg-white/75 text-xs text-suave">
            <Loader size={14} className="animate-spin" />
            Ajustando a foto...
          </span>
        )}
      </div>

      {atual && (
        <div className="mt-1.5 flex shrink-0 flex-wrap gap-1.5">
          <button
            type="button"
            onClick={abrirJanela}
            disabled={ocupado}
            title="Ver as fotos grandes, escolher quais usar e ver uma previa gratis do Photoroom"
            className="inline-flex items-center gap-1 rounded border border-acento px-2 py-1 text-[11px] font-medium text-acento hover:bg-fundo disabled:opacity-50"
          >
            <Sparkles size={12} /> Melhorar
          </button>
          {/*
            Baixa a foto que esta na tela (a padronizada 1024x1024, ou a melhorada, se foi a escolhida).
            E um link com `download`, e nao um botao que busca o arquivo: o endereco e do proprio sistema
            (`/api/temporarios/...`), entao o navegador baixa direto. Fica ENTRE Melhorar e Excluir para o
            botao destrutivo continuar sendo o ultimo. Enquanto a foto esta sendo ajustada ("Ajustando a
            foto...") o arquivo pode estar mudando, e o link fica apagado.
          */}
          <a
            href={atual.url}
            download="foto.jpg"
            aria-disabled={pendente}
            title="Baixar esta foto"
            onClick={(evento) => {
              if (pendente) {
                evento.preventDefault();
                return;
              }
              evento.currentTarget.download = nomeParaBaixar(evento.currentTarget, indice + 1);
            }}
            className={`inline-flex items-center gap-1 rounded border border-borda px-2 py-1 text-[11px] text-texto hover:bg-fundo ${
              pendente ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <Download size={12} /> Baixar
          </a>
          <button
            type="button"
            onClick={() => excluir(atual)}
            disabled={ocupado}
            className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] disabled:opacity-50 ${
              paraConfirmar === atual.base
                ? "border-red-600 bg-red-600 font-medium text-white hover:opacity-90"
                : "border-borda text-red-700 hover:bg-red-50"
            }`}
          >
            <Trash2 size={12} />
            {paraConfirmar === atual.base ? "Confirmar (foto paga)" : "Excluir"}
          </button>
        </div>
      )}

      <div className="mt-2 shrink-0">
        <TiraDeFotos
          imagens={imagens}
          atualBase={atual?.base ?? null}
          aoEscolher={setFoco}
          aoReordenar={reordenar}
        >
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={ocupado || cheio}
            title={
              cheio
                ? `Limite de ${MAXIMO_FOTOS_NO_PAINEL} fotos no painel`
                : "Adicionar fotos. Cada uma e ajustada para 1024x1024, fundo branco."
            }
            className="flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded border border-dashed border-borda text-suave hover:border-acento hover:text-acento disabled:opacity-40"
          >
            <ImagePlus size={15} />
            <span className="text-[9px]">{imagens.length}</span>
          </button>
        </TiraDeFotos>
      </div>

      {imagens.length > 0 && (
        <p
          className={`mt-1 flex shrink-0 items-center gap-1.5 text-[10px] ${excedente > 0 || naoValidadas > 0 ? "font-medium text-amber-700" : "text-suave"}`}
        >
          <span>
            {imagens.length} foto{imagens.length === 1 ? "" : "s"} · {finalizadas} validada
            {finalizadas === 1 ? "" : "s"}
            {excedente > 0
              ? ` · tire ${excedente} (maximo ${MAXIMO_IMAGENS})`
              : ` · maximo ${MAXIMO_IMAGENS}`}
            {naoValidadas > 0 &&
              ` · ${naoValidadas} sem validar ${naoValidadas === 1 ? "sera excluida" : "serao excluidas"} ao salvar`}
          </span>
          {/* Mensagem informativa: icone "i" (padrao do sistema), e nao texto fixo nem dica escondida. */}
          <BolhaDeAjuda
            texto={`Ao salvar o produto, so as fotos validadas (com o check verde) sao salvas: as demais sao excluidas. Valide em Melhorar > Escolher essa. O produto leva no maximo ${MAXIMO_IMAGENS} fotos, na ordem da tira, e a primeira e a principal: arraste as miniaturas para ordenar.`}
            variante="inline"
          />
        </p>
      )}

      <input
        ref={entrada}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={aoEscolherArquivos}
        className="hidden"
      />

      {erro && !janelaAberta && (
        <p className="mt-1 shrink-0 rounded bg-red-50 px-2 py-1 text-[11px] text-red-800" title={erro}>
          {erro}
        </p>
      )}

      {ampliada && atual && (
        <AmpliacaoDeFoto
          src={atual.url}
          alt="Foto do produto"
          aoFechar={() => setAmpliada(false)}
          // Setas para passar de foto sem fechar: usa o mesmo `ir` das setas do painel, entao a foto de tras
          // acompanha (fechar a ampliada nao devolve a vitrine a uma foto antiga).
          posicao={indice}
          total={imagens.length}
          aoNavegar={ir}
        />
      )}

      {janelaAberta && (
        <JanelaDeFotos
          lote={lote}
          imagens={visiveisDaJanela}
          atual={atualDaJanela}
          porFoto={porFoto}
          setPorFoto={setPorFoto}
          ocupado={ocupado}
          erro={erro}
          alterado={alteradoNaJanela}
          comprasNaJanela={comprasNaJanela}
          aoEscolher={setFoco}
          aoSalvar={salvarJanela}
          aoCancelar={cancelarJanela}
          aoComprar={aoComprar}
          aoFinalizar={finalizar}
          aoExcluir={excluirNoRascunho}
          aoEscolherVersao={escolherVersao}
          aoReordenar={reordenarNaJanela}
        />
      )}
    </div>
  );
}
