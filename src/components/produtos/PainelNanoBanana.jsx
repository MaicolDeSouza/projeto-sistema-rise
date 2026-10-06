"use client";

import { useRef, useState, useTransition } from "react";
import { Check, ImagePlus, Loader, Sparkles, X } from "lucide-react";

import {
  adicionarExtraAoLote,
  gerarComNanoBanana,
  removerExtraDoLote,
  salvarPromptDoModelo,
} from "@/app/produtos/acoes-nanobanana";
import { ImagemComZoom } from "./ImagemComZoom";

/**
 * A aba "Nano Banana" da janela de fotos (spec §7, layout B): o quadro com a ultima geracao e, embaixo dele,
 * modelo, prompt, imagens extras e os botoes. Gerar e PAGAR (o Google nao tem previa gratis), entao o "Gerar"
 * so cobra depois da confirmacao do preco, e o servidor confere tudo de novo (trava, teto, uma por vez).
 *
 * O estado de cada foto (modelo, prompt editado, extras marcadas) mora em `porFoto[base].nb`, no painel, e
 * nao aqui: fechar a janela nao pode perder um prompt que o dono estava refinando. Todas as mudancas passam
 * por `mudarNB`, que aceita uma funcao do estado de agora (duas respostas seguidas nao perdem uma a outra).
 *
 * O valor em reais vem de `estado.modelos[i].brl` (cotacao fixa por ora) e e uma ESTIMATIVA: o Google cobra
 * em dolar, no cartao, e a confirmacao diz os dois.
 */

const reais = (valor) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dolares = (valor) => `US$ ${valor.toFixed(3).replace(".", ",")}`;

async function tentar(acao) {
  try {
    return await acao();
  } catch (erro) {
    return { ok: false, erro: erro?.message ?? "Falha inesperada." };
  }
}

export default function PainelNanoBanana({
  lote,
  imagem,
  outras,
  estado,
  nb,
  mudarNB,
  abas,
  selo,
  lado,
  parado,
  gerando,
  iniciarGeracao,
  aoGerado,
  aoEscolher,
  aoSalvouPrompt,
  aoAmpliar,
  zoom,
  setZoom,
}) {
  const [erro, setErro] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [salvandoPrompt, iniciarSalvarPrompt] = useTransition();
  const [enviando, iniciarEnvio] = useTransition();
  const entrada = useRef(null);

  const modelos = estado?.modelos ?? [];
  const modelo = nb?.modelo ?? estado?.modeloPadrao ?? "nano-banana-2";
  const definicao = modelos.find((item) => item.chave === modelo) ?? null;
  const salvo = estado?.prompts?.[modelo] ?? "";
  const texto = nb?.prompts?.[modelo] ?? salvo;
  const extras = nb?.extras ?? [];
  const maximoExtras = estado?.maximoExtras ?? 5;
  const maximoPrompt = estado?.maximoPrompt ?? 2000;

  const jaGerou = Boolean(imagem.versoes?.nanobanana);
  const liberado = Boolean(estado?.config?.ok);
  const promptValido = texto.trim().length > 0 && texto.length <= maximoPrompt;
  const ocupado = parado || gerando || salvandoPrompt || enviando;
  const aceitaExtras = definicao?.aceitaExtras ?? true;
  const preco = definicao ? reais(definicao.brl) : "";
  const textoDoPreco = jaGerou ? `Gerar de novo (${preco})` : `Gerar (${preco})`;

  // "Escolher essa" so fica apagado quando a foto JA e a Nano Banana validada e nao ha geracao nova por
  // cima. Depois de "gerar de novo" a escolhida continua sendo a anterior: o botao volta a poder trocar.
  const escolhida = imagem.versao === "nanobanana" && Boolean(imagem.finalizada);
  const podeEscolher = jaGerou && !ocupado && !(escolhida && nb?.novaGeracao !== true);

  const fotoDaTira = outras.filter((outra) => outra.base !== imagem.base);
  const marcadas = new Set(extras.filter((extra) => extra.tipo === "foto").map((extra) => extra.base));
  const cheioDeExtras = extras.length >= maximoExtras;

  function mudarTexto(valor) {
    mudarNB((atual) => ({ prompts: { ...atual.prompts, [modelo]: valor } }));
    setConfirmando(false);
  }

  function voltarAoSalvo() {
    mudarNB((atual) => {
      const prompts = { ...atual.prompts };
      delete prompts[modelo];
      return { prompts };
    });
  }

  function trocarModelo(chave) {
    mudarNB({ modelo: chave });
    setConfirmando(false);
    setErro(null);
  }

  function salvarPrompt() {
    setErro(null);
    iniciarSalvarPrompt(async () => {
      const resposta = await tentar(() => salvarPromptDoModelo(modelo, texto));
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      aoSalvouPrompt(modelo, resposta.texto);
      voltarAoSalvo();
    });
  }

  function alternarFoto(base) {
    mudarNB((atual) => {
      const lista = atual.extras ?? [];
      if (lista.some((extra) => extra.tipo === "foto" && extra.base === base)) {
        return { extras: lista.filter((extra) => !(extra.tipo === "foto" && extra.base === base)) };
      }
      return lista.length >= maximoExtras ? {} : { extras: [...lista, { tipo: "foto", base }] };
    });
    setConfirmando(false);
  }

  function enviarExtra(arquivo) {
    if (!arquivo) return;
    setErro(null);
    iniciarEnvio(async () => {
      const dados = new FormData();
      dados.set("arquivo", arquivo);
      const resposta = await tentar(() => adicionarExtraAoLote(lote, imagem.base, dados));
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      mudarNB((atual) => ({ extras: [...(atual.extras ?? []), { tipo: "enviada", n: resposta.extra.n, url: resposta.extra.url }] }));
      setConfirmando(false);
    });
  }

  function tirarEnviada(extra) {
    iniciarEnvio(async () => {
      const resposta = await tentar(() => removerExtraDoLote(lote, imagem.base, extra.n));
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      mudarNB((atual) => ({ extras: (atual.extras ?? []).filter((outra) => !(outra.tipo === "enviada" && outra.n === extra.n)) }));
      setConfirmando(false);
    });
  }

  function gerar() {
    setErro(null);
    setConfirmando(false);
    iniciarGeracao(async () => {
      const pedido = {
        modelo,
        prompt: texto,
        // So o que o servidor precisa para achar cada extra: o original da outra foto ou o arquivo enviado.
        extras: aceitaExtras
          ? extras.map((extra) => (extra.tipo === "foto" ? { tipo: "foto", base: extra.base } : { tipo: "enviada", n: extra.n }))
          : [],
        repetida: jaGerou,
      };
      const resposta = await tentar(() => gerarComNanoBanana(lote, imagem.base, pedido));
      if (!resposta.ok) {
        setErro(resposta.erro);
        return;
      }
      // Marca a geracao nova: a escolhida (se ja era a Nano Banana) passa a ser a anterior.
      mudarNB({ novaGeracao: true });
      aoGerado({ versoes: resposta.versoes, urls: resposta.urls });
    });
  }

  function escolher() {
    setErro(null);
    mudarNB({ novaGeracao: false });
    aoEscolher();
  }

  const urlDoResultado = imagem.urls?.nanobanana ?? null;

  return (
    <figure className="mx-auto flex flex-col gap-1.5" style={{ width: lado }}>
      <p className="flex items-center justify-center gap-1 text-xs font-medium text-suave">{abas}</p>

      <div className="relative aspect-square overflow-hidden rounded border border-borda bg-white">
        {urlDoResultado ? (
          <ImagemComZoom
            src={urlDoResultado}
            alt="Foto gerada pelo Nano Banana"
            zoom={zoom}
            setZoom={setZoom}
            aoAmpliar={() => aoAmpliar({ src: urlDoResultado, alt: "Nano Banana" })}
            className="h-full w-full"
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-suave">
            {definicao ? `O resultado aparece aqui. Cada geracao custa ${preco}.` : "O resultado aparece aqui."}
          </span>
        )}
        {gerando && (
          <span className="absolute inset-0 flex items-center justify-center gap-2 bg-white/80 text-sm text-suave">
            <Loader size={16} className="animate-spin" /> Gerando... (uns 10 a 30 s)
          </span>
        )}
      </div>

      <figcaption className="flex min-h-6 flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-600">
        {selo}
      </figcaption>

      {estado && !liberado && (
        <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">{estado.config.motivo}</p>
      )}

      {/* Modelo e preco */}
      <fieldset className="space-y-1 text-xs" disabled={ocupado}>
        <legend className="mb-0.5 font-medium text-suave">Modelo</legend>
        {modelos.map((item) => (
          <label
            key={item.chave}
            className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1 hover:bg-fundo ${
              modelo === item.chave ? "border-acento bg-fundo" : "border-borda"
            }`}
          >
            <input
              type="radio"
              name={`modelo-${imagem.base}`}
              checked={modelo === item.chave}
              onChange={() => trocarModelo(item.chave)}
              className="accent-acento"
            />
            <span className="flex-1">
              {item.nome}
              {!item.aceitaExtras && <span className="text-suave"> · ignora as imagens extras</span>}
            </span>
            <span className="text-suave">{reais(item.brl)}</span>
          </label>
        ))}
      </fieldset>

      {/* Prompt: um salvo por modelo; editar sem salvar vale so para esta geracao */}
      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-medium text-suave">Prompt</span>
          <span className={`ml-auto ${texto.length > maximoPrompt ? "font-medium text-red-700" : "text-suave"}`}>
            {texto.length}/{maximoPrompt}
          </span>
        </div>
        <textarea
          value={texto}
          onChange={(evento) => mudarTexto(evento.target.value)}
          disabled={ocupado}
          rows={5}
          className="w-full rounded border border-borda bg-white p-2 text-xs"
          aria-label="Prompt do Nano Banana"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={salvarPrompt}
            disabled={ocupado || texto === salvo || !promptValido}
            title="Guarda este texto como o prompt deste modelo"
            className="inline-flex items-center gap-1 rounded border border-acento px-2 py-1 text-xs text-acento hover:bg-fundo disabled:opacity-40"
          >
            {salvandoPrompt && <Loader size={12} className="animate-spin" />}
            Salvar prompt
          </button>
          <button
            type="button"
            onClick={voltarAoSalvo}
            disabled={ocupado || texto === salvo}
            title="Descarta o que voce editou e volta ao prompt salvo"
            className="rounded border border-borda px-2 py-1 text-xs hover:bg-fundo disabled:opacity-40"
          >
            Voltar ao salvo
          </button>
        </div>
      </div>

      {/* Imagens extras: outras fotos do carrossel (clicar marca) e arquivos enviados; ate o maximo */}
      <div className={`space-y-1 text-xs ${aceitaExtras ? "" : "pointer-events-none opacity-40"}`} aria-disabled={!aceitaExtras}>
        <div className="flex items-center gap-2">
          <span className="font-medium text-suave">Imagens extras</span>
          <span className="text-suave">
            {extras.length}/{maximoExtras} · a original sempre vai
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {fotoDaTira.map((outra) => (
            <button
              key={outra.base}
              type="button"
              onClick={() => alternarFoto(outra.base)}
              disabled={ocupado || (!marcadas.has(outra.base) && cheioDeExtras)}
              aria-pressed={marcadas.has(outra.base)}
              title={marcadas.has(outra.base) ? "Tirar das imagens extras" : "Usar como imagem extra"}
              className={`relative h-11 w-11 shrink-0 overflow-hidden rounded border bg-white disabled:opacity-40 ${
                marcadas.has(outra.base) ? "border-emerald-600 ring-2 ring-emerald-600" : "border-borda"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={outra.url} alt="" className="h-full w-full object-contain" />
              {marcadas.has(outra.base) && (
                <span className="absolute top-0 right-0 flex h-3.5 w-3.5 items-center justify-center rounded-bl bg-emerald-600 text-white">
                  <Check size={10} strokeWidth={3} />
                </span>
              )}
            </button>
          ))}
          {extras
            .filter((extra) => extra.tipo === "enviada")
            .map((extra) => (
              <span key={extra.n} className="relative h-11 w-11 shrink-0 overflow-hidden rounded border border-emerald-600 bg-white ring-2 ring-emerald-600">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={extra.url} alt="Imagem extra enviada" className="h-full w-full object-contain" />
                <button
                  type="button"
                  onClick={() => tirarEnviada(extra)}
                  disabled={ocupado}
                  aria-label="Tirar esta imagem extra"
                  className="absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-bl bg-slate-800/80 text-white hover:bg-red-700"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          <button
            type="button"
            onClick={() => entrada.current?.click()}
            disabled={ocupado || cheioDeExtras}
            title={cheioDeExtras ? `No maximo ${maximoExtras} imagens extras` : "Enviar uma imagem do computador"}
            className="inline-flex h-11 shrink-0 items-center gap-1 rounded border border-dashed border-borda px-2 text-suave hover:border-acento hover:text-acento disabled:opacity-40"
          >
            {enviando ? <Loader size={13} className="animate-spin" /> : <ImagePlus size={13} />} Enviar
          </button>
          <input
            ref={entrada}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(evento) => {
              const arquivo = evento.target.files?.[0];
              evento.target.value = "";
              enviarExtra(arquivo);
            }}
          />
        </div>
      </div>

      {confirmando && definicao && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Gerar com <strong>{definicao.nome}</strong> por <strong>{reais(definicao.brl)}</strong> ({dolares(definicao.usd)})?
          Cada geracao e cobrada e sai diferente. O Google cobra em dolar, no cartao: o valor em reais e uma estimativa,
          sem IOF.
        </p>
      )}
      {erro && <p className="rounded bg-red-50 p-2 text-xs text-red-800">{erro}</p>}

      <div className="flex min-h-9 flex-wrap items-center justify-center gap-1.5">
        {confirmando ? (
          <>
            <button
              type="button"
              onClick={gerar}
              disabled={ocupado}
              className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              <Sparkles size={14} /> Sim, gerar
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={ocupado}
              className="rounded border border-borda px-3 py-2 text-sm hover:bg-fundo disabled:opacity-50"
            >
              Voltar
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={ocupado || !liberado || !promptValido || !definicao}
              title={!liberado ? estado?.config?.motivo : "Gera a foto (cobra pela geracao)"}
              className="inline-flex shrink-0 items-center gap-1.5 rounded border border-acento px-3 py-2 text-sm font-medium whitespace-nowrap text-acento hover:bg-fundo disabled:opacity-50"
            >
              {gerando ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {textoDoPreco}
            </button>
            <button
              type="button"
              onClick={escolher}
              disabled={!podeEscolher}
              title={escolhida && nb?.novaGeracao !== true ? "Esta e a foto escolhida" : "Usar a foto do Nano Banana no produto, sem custo"}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded px-3 py-2 text-sm font-medium whitespace-nowrap ${
                podeEscolher ? "bg-emerald-600 text-white hover:opacity-90" : "cursor-not-allowed border border-borda text-suave opacity-60"
              }`}
            >
              <Check size={14} strokeWidth={3} /> Escolher essa
            </button>
          </>
        )}
      </div>
    </figure>
  );
}
