"use client";

import { propsDoFundo } from "@/lib/fundoDaJanela";
import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, ExternalLink, Loader, X, XCircle } from "lucide-react";

import { prepararPublicacaoMLAcao, publicarAnuncioMLAcao } from "@/app/canais-de-venda/mercado-livre/acoes";
import { ROTULO_DA_ETAPA } from "@/lib/canaisDeVenda/ml/etapas";
import { ROTULO_DO_TIPO_ML } from "@/lib/canaisDeVenda/ml/rotulos";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Janela do Publicar do anuncio do Mercado Livre (fase 3). Ao abrir, pede ao servidor a pre-checagem
 * (so leitura) e mostra os motivos que impedem ou o resumo do que vai ser enviado; o dono confirma, e
 * a janela mostra as etapas feitas e a que falhou. A mesma janela serve para "Retomar publicacao" e
 * "Verificar no Bling" (o servidor continua da etapa que falta).
 *
 * `aoFechar(houveEnvio)` avisa o editor se algo foi enviado (para ele reler o anuncio).
 */
export default function JanelaPublicarML({ anuncioId, rotuloDoBotao, aoFechar }) {
  const [preparo, setPreparo] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [lendo, iniciarLeitura] = useTransition();
  const [publicando, iniciarPublicacao] = useTransition();

  useEffect(() => {
    iniciarLeitura(async () => {
      let lido;
      try {
        lido = await prepararPublicacaoMLAcao(anuncioId);
      } catch {
        lido = { ok: false, motivos: ["Não foi possível falar com o servidor."] };
      }
      setPreparo({ ...lido, motivos: lido.motivos ?? (lido.erro ? [lido.erro] : []) });
    });
  }, [anuncioId]);

  useEffect(() => {
    function aoTeclar(evento) {
      if (evento.key === "Escape" && !publicando) aoFechar(Boolean(resultado));
    }
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [publicando, resultado, aoFechar]);

  function publicar({ recriar = false } = {}) {
    iniciarPublicacao(async () => {
      let feito;
      try {
        feito = await publicarAnuncioMLAcao(anuncioId, { recriar });
      } catch {
        feito = { ok: false, erro: "Não foi possível falar com o servidor. Abra o anúncio de novo e confira a situação antes de tentar outra vez." };
      }
      setResultado(feito);
    });
  }

  const resumo = preparo?.resumo;
  const incerta = Boolean(preparo?.incerta) || Boolean(resultado?.incerta);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 text-left font-normal normal-case"
      {...propsDoFundo(() => { if (!publicando) aoFechar(Boolean(resultado)); })}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="ml-publicar-titulo" className="flex max-h-full w-full max-w-lg flex-col rounded-lg border border-borda bg-superficie shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-borda px-5 py-3">
          <p id="ml-publicar-titulo" className="text-sm font-semibold">
            {rotuloDoBotao} no Mercado Livre
          </p>
          <button type="button" onClick={() => aoFechar(Boolean(resultado))} disabled={publicando} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo disabled:opacity-40">
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          {lendo && !preparo && (
            <p className="flex items-center gap-2 text-suave" role="status">
              <Loader size={14} className="animate-spin" /> Conferindo o anúncio, o Mercado Livre e o Bling...
            </p>
          )}

          {preparo && !preparo.ok && !resultado && (
            <div role="alert">
              <p className="font-semibold text-red-700">Não dá para publicar ainda:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-red-800">
                {preparo.motivos.map((motivo, posicao) => (
                  <li key={posicao}>{motivo}</li>
                ))}
              </ul>
            </div>
          )}

          {preparo?.ok && resumo && !resultado && (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                <dt className="text-suave">Título (family_name)</dt>
                <dd className="font-medium">{resumo.familyName}</dd>
                <dt className="text-suave">Preço</dt>
                <dd className="font-medium tabular-nums">{moeda.format(resumo.preco)}</dd>
                <dt className="text-suave">Estoque</dt>
                <dd className="tabular-nums">{resumo.estoque}</dd>
                <dt className="text-suave">Tipo</dt>
                <dd>{ROTULO_DO_TIPO_ML[resumo.tipoAnuncio] ?? resumo.tipoAnuncio}</dd>
                <dt className="text-suave">Fotos</dt>
                <dd className="tabular-nums">{resumo.fotos}</dd>
                <dt className="text-suave">Código</dt>
                <dd className="font-mono">{resumo.codigo}</dd>
              </dl>
              {resumo.kit && (
                <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  {resumo.kit.situacao === "criar" ? `O Rise vai criar o kit ${resumo.kit.codigo} no Bling com: ` : `O kit ${resumo.kit.codigo} já existe no Bling com as mesmas peças: `}
                  {resumo.kit.itens.map((item) => `${item.quantidade}× ${item.sku}`).join(", ")}.
                </p>
              )}
              {resumo.outrosVinculos?.length > 0 && (
                <p className="text-xs text-suave">
                  No Bling, este produto já tem outro(s) anúncio(s) do ML ({resumo.outrosVinculos.join(", ")}). O novo é registrado junto, e o Bling controla o
                  estoque de todos.
                </p>
              )}
              <p className="text-xs text-suave">
                O anúncio é criado pausado, recebe a descrição, é vinculado e registrado no Bling e só então é ativado. Se uma etapa falhar,
                nada é repetido sozinho: o botão vira Retomar publicação.
              </p>
              {incerta && (
                <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                  A última tentativa de criar o anúncio ficou sem resposta do Mercado Livre. Confira em Anúncios &gt; Pausados no Mercado
                  Livre: se o anúncio não estiver lá, use Criar de novo.
                </p>
              )}
            </>
          )}

          {publicando && (
            <p className="flex items-center gap-2 text-suave" role="status">
              <Loader size={14} className="animate-spin" /> Publicando... (as fotos sobem uma a uma)
            </p>
          )}

          {resultado && <ResultadoDaPublicacao resultado={resultado} />}
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-borda px-5 py-3">
          <button type="button" onClick={() => aoFechar(Boolean(resultado))} disabled={publicando} className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-50">
            {resultado ? "Fechar" : "Cancelar"}
          </button>
          {preparo?.ok && !resultado && incerta && (
            <button type="button" onClick={() => publicar({ recriar: true })} disabled={publicando} className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              Criar de novo
            </button>
          )}
          {preparo?.ok && !resultado && !incerta && (
            <button type="button" onClick={() => publicar()} disabled={publicando} className="rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {rotuloDoBotao === "Publicar" ? "Publicar no Mercado Livre" : rotuloDoBotao}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

/** As etapas feitas, a que falhou (em vermelho) e o recado; no sucesso, o link do anuncio. */
function ResultadoDaPublicacao({ resultado }) {
  const feitas = Array.isArray(resultado.feitas) ? resultado.feitas : [];
  return (
    <div className="space-y-3">
      {resultado.ok ? (
        <p className="flex items-center gap-2 font-semibold text-emerald-700">
          <CheckCircle2 size={16} /> Anúncio publicado e ativo.
        </p>
      ) : (
        <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-red-800">
          {resultado.erro ?? "Não foi possível publicar."}
        </p>
      )}
      {(feitas.length > 0 || resultado.etapa) && (
        <ol className="space-y-1">
          {feitas.map((etapa) => (
            <li key={etapa} className="flex items-center gap-2 text-emerald-800">
              <CheckCircle2 size={14} /> {ROTULO_DA_ETAPA[etapa] ?? etapa}
            </li>
          ))}
          {!resultado.ok && resultado.etapa && !feitas.includes(resultado.etapa) && (
            <li className="flex items-center gap-2 font-medium text-red-700">
              <XCircle size={14} /> {ROTULO_DA_ETAPA[resultado.etapa] ?? resultado.etapa}
            </li>
          )}
        </ol>
      )}
      {resultado.avisos?.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
          {resultado.avisos.map((aviso, posicao) => (
            <li key={posicao}>{aviso}</li>
          ))}
        </ul>
      )}
      {resultado.ok && resultado.permalink && (
        <a href={resultado.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-acento hover:underline">
          Ver no Mercado Livre <ExternalLink size={13} />
        </a>
      )}
    </div>
  );
}
