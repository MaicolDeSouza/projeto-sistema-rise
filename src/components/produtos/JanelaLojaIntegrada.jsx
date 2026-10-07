"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CircleCheck, Loader } from "lucide-react";

import { abrirJanelaLI, cadastrarProdutoNaLI, sincronizarComLI } from "@/app/produtos/acoes-li";
import JanelaAnuncioLI from "@/components/anuncios/li/JanelaAnuncioLI";
import { mudouNaLI, resumirEnvioLI, valorParaTela } from "@/lib/canaisDeVenda/li/apresentacao";
import { Popup } from "./EdicaoRapida";

/**
 * Pop-up do icone da Loja Integrada na lista de Produtos, no molde do do Bling: le a loja sob o
 * codigo do produto (`abrirJanelaLI`, que so le a LI; na primeira abertura de um produto que ja
 * existe la, grava o vinculo no Rise), mostra as diferencas campo a campo e oferece o envio que faz
 * sentido: "Cadastrar na LI" (nao existe la) ou "Sincronizar com a LI". "Abrir anuncio" abre o editor.
 *
 * Com as travas de escrita fechadas os botoes continuam aqui; ao clicar a acao devolve o motivo, em
 * vermelho. Nunca um botao que some sem dizer por que.
 */

async function chamar(acao, argumentos, escreve) {
  try {
    return await acao(...argumentos);
  } catch {
    return {
      ok: false,
      erro: escreve
        ? "A resposta do servidor se perdeu. A Loja Integrada pode ter recebido o envio: confira na loja antes de tentar de novo."
        : "Nao foi possivel falar com o servidor. Tente de novo.",
    };
  }
}

const CLASSE_DO_TOM = {
  erro: "border-red-200 bg-red-50 text-red-800",
  atencao: "border-amber-200 bg-amber-50 text-amber-900",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

const CLASSE_DO_BOTAO_SECUNDARIO =
  "inline-flex items-center gap-1.5 rounded border border-acento bg-superficie px-3 py-1.5 text-xs font-medium text-acento hover:bg-fundo disabled:cursor-not-allowed disabled:opacity-60";

function Valor({ campo, valor, quandoVazio }) {
  const texto = valorParaTela(campo, valor);
  if (texto === null) return <span className="text-suave italic">{quandoVazio}</span>;
  return <span className="block max-h-24 overflow-y-auto break-words whitespace-pre-wrap">{texto}</span>;
}

function LinhaDeDiferenca({ item }) {
  const vazioNoRise = item.tipo === "vazioNoRise";
  return (
    <li className={`rounded border p-2 ${vazioNoRise ? "border-borda bg-fundo/60 text-suave" : "border-amber-200 bg-amber-50/50"}`}>
      <p className="text-xs font-medium text-texto">
        {item.rotulo}
        <span className="ml-1.5 font-normal text-suave">{vazioNoRise ? "so tem na loja" : "diferente"}</span>
      </p>
      <dl className="mt-1 grid grid-cols-2 gap-3 text-xs">
        <div className="min-w-0">
          <dt className="text-[11px] text-suave">No Rise</dt>
          <dd>
            <Valor campo={item.campo} valor={item.rise} quandoVazio="vazio no Rise (nao sera enviado)" />
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-suave">Na Loja Integrada</dt>
          <dd>
            <Valor campo={item.campo} valor={item.li} quandoVazio="vazio na loja" />
          </dd>
        </div>
      </dl>
    </li>
  );
}

function Diferencas({ diferencas, iguais }) {
  const textoDosIguais = `${iguais} ${iguais === 1 ? "campo igual" : "campos iguais"}`;
  if (diferencas.length === 0) {
    return <p className={`rounded border p-2 text-xs ${CLASSE_DO_TOM.ok}`}>Nenhuma diferenca: {textoDosIguais} no Rise e na Loja Integrada.</p>;
  }
  return (
    <section aria-label="Diferencas entre o Rise e a Loja Integrada">
      <p className="text-xs font-medium">
        Diferencas entre o Rise e a Loja Integrada <span className="font-normal text-suave">({diferencas.length})</span>
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {diferencas.map((item) => (
          <LinhaDeDiferenca key={item.campo} item={item} />
        ))}
      </ul>
      {iguais > 0 && <p className="mt-1.5 text-xs text-suave">{textoDosIguais}</p>}
    </section>
  );
}

export default function JanelaLojaIntegrada({ produto, aoFechar }) {
  const [leitura, setLeitura] = useState(null);
  const [ocupado, iniciarTransicao] = useTransition();
  const [qual, setQual] = useState(null);
  const [erro, setErro] = useState(null);
  const [envio, setEnvio] = useState(null);
  const [editor, setEditor] = useState(false);
  const foco = useRef(null);
  const montada = useRef(false);
  const leituraIniciada = useRef(false);

  useEffect(() => {
    montada.current = true;
    foco.current?.focus();
    if (!leituraIniciada.current) {
      leituraIniciada.current = true;
      (async () => {
        const lida = await chamar(abrirJanelaLI, [produto.id], false);
        if (montada.current) setLeitura(lida);
      })();
    }
    return () => {
      montada.current = false;
    };
  }, [produto.id]);

  const carregando = leitura === null;
  const pendente = carregando || ocupado;

  function enviar(tipo, executar) {
    setErro(null);
    setEnvio(null);
    setQual(tipo);
    const rotulos = Object.fromEntries((leitura?.diferencas ?? []).map((item) => [item.campo, item.rotulo]));
    iniciarTransicao(async () => {
      try {
        const resultado = await executar();
        const resumo = resumirEnvioLI(tipo, resultado, rotulos);
        setEnvio(resumo ? { ok: resultado.ok === true, titulo: resumo.titulo, linhas: resumo.linhas } : null);
        if (!resultado.ok) setErro(resultado.erro ?? "O envio nao foi concluido.");
        if (mudouNaLI(tipo, resultado)) {
          setQual("lendo");
          setLeitura(await chamar(abrirJanelaLI, [produto.id], false));
        }
      } finally {
        setQual(null);
      }
    });
  }

  function lerDeNovo() {
    setErro(null);
    setEnvio(null);
    setLeitura(null);
    iniciarTransicao(async () => {
      setLeitura(await chamar(abrirJanelaLI, [produto.id], false));
    });
  }

  const sincronizar = () => enviar("sincronizar", () => chamar(sincronizarComLI, [produto.id], true));
  const cadastrar = () => enviar("cadastrar", () => chamar(cadastrarProdutoNaLI, [produto.id], true));

  let principal;
  if (carregando) principal = { rotulo: "Lendo a Loja Integrada...", executar: () => {} };
  else if (leitura.ok && !leitura.conferido) principal = { rotulo: "Fechar", executar: aoFechar };
  else if (!leitura.ok) principal = { rotulo: "Ler de novo", executar: lerDeNovo };
  else if (leitura.situacao === "nao_existe") principal = { rotulo: "Cadastrar na LI", executar: cadastrar };
  else principal = { rotulo: "Sincronizar com a LI", executar: sincronizar };

  let rotuloDoBotao = principal.rotulo;
  if (qual === "sincronizar" || qual === "cadastrar") rotuloDoBotao = "Enviando...";
  else if (qual === "lendo") rotuloDoBotao = "Atualizando...";

  if (editor) {
    return (
      <JanelaAnuncioLI
        produtoId={produto.id}
        aoFechar={() => {
          setEditor(false);
          lerDeNovo();
        }}
      />
    );
  }

  const avisos = leitura?.avisos ?? [];
  const podeEditar = leitura?.conferido && (leitura.situacao === "existe" || leitura.situacao === "nao_existe");
  const escritaBloqueada = leitura?.ok && leitura.conferido && leitura.escrita?.liberada === false;
  const linkSeguro = /^https?:\/\//i.test(String(leitura?.urlExterna ?? ""));

  return (
    <Popup
      titulo="Sincronizacao com a Loja Integrada"
      produto={produto}
      aoFechar={aoFechar}
      aoEnviar={principal.executar}
      rotuloBotao={rotuloDoBotao}
      pendente={pendente}
      erro={erro}
    >
      <div ref={foco} tabIndex={-1} aria-busy={pendente} className="max-h-[45vh] space-y-3 overflow-y-auto pr-1 focus:outline-none">
        {carregando ? (
          <p role="status" className="flex items-center gap-2 py-6 text-sm text-suave">
            <Loader size={16} className="animate-spin" />
            Lendo a Loja Integrada...
          </p>
        ) : (
          <>
            {!leitura.ok && (
              <p role="alert" className={`rounded border p-2.5 text-xs ${CLASSE_DO_TOM.erro}`}>
                {leitura.erro ?? "Nao foi possivel ler a Loja Integrada."}
              </p>
            )}

            {leitura.ok && !leitura.conferido && (
              <p className={`rounded border p-2.5 text-xs ${CLASSE_DO_TOM.atencao}`}>
                So produto Conferido vai para a Loja Integrada. Confira o cadastro do produto e abra de novo.
              </p>
            )}

            {leitura.ok && leitura.conferido && leitura.situacao === "nao_existe" && (
              <section aria-label="Produto fora da Loja Integrada" className="rounded border border-borda bg-fundo p-2.5 text-xs">
                <p className="font-medium">Este codigo nao esta na Loja Integrada</p>
                <p className="mt-1 text-suave">
                  &quot;Cadastrar na LI&quot; cria o produto <span className="font-mono">{leitura.sku}</span> na loja, INATIVO, com o anuncio do Rise (nome,
                  descricao, SEO, NCM, medidas, marca e categorias). Preco e estoque chegam pelo Bling. Confira na loja e ative-o la.
                </p>
              </section>
            )}

            {leitura.ok && leitura.situacao === "existe" && (
              <>
                {leitura.vinculadoAgora && (
                  <p className={`rounded border p-2 text-xs ${CLASSE_DO_TOM.ok}`}>
                    Vinculado agora pelo codigo (id {leitura.idExterno}): o endereco, as categorias e o destaque vieram da loja para o anuncio do Rise.
                  </p>
                )}
                {linkSeguro && (
                  <a href={leitura.urlExterna} target="_blank" rel="noreferrer" className="inline-block text-xs text-acento hover:underline">
                    Abrir o produto na loja
                  </a>
                )}
                <Diferencas diferencas={leitura.diferencas ?? []} iguais={leitura.iguais ?? 0} />
              </>
            )}

            {avisos.length > 0 && (
              <ul className={`space-y-1 rounded border p-2 text-xs ${CLASSE_DO_TOM.atencao}`}>
                {avisos.map((aviso, indice) => (
                  <li key={`${indice}-${aviso}`}>{aviso}</li>
                ))}
              </ul>
            )}

            {podeEditar && (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setEditor(true)} disabled={pendente} className={CLASSE_DO_BOTAO_SECUNDARIO}>
                  Abrir anuncio
                </button>
                {leitura.situacao === "existe" && (
                  <button type="button" onClick={lerDeNovo} disabled={pendente} className={CLASSE_DO_BOTAO_SECUNDARIO}>
                    Ler de novo
                  </button>
                )}
              </div>
            )}

            {escritaBloqueada && (
              <p className={`rounded border p-2 text-xs ${CLASSE_DO_TOM.atencao}`}>
                <span className="font-medium">Envio a Loja Integrada bloqueado.</span> {leitura.escrita.motivo}
              </p>
            )}
          </>
        )}
      </div>

      {envio && (
        <div role="status" className={`mt-3 rounded border p-2.5 text-xs ${CLASSE_DO_TOM[envio.ok ? "ok" : "atencao"]}`}>
          <p className="flex items-start gap-1.5 font-medium">
            {envio.ok && <CircleCheck size={14} className="mt-px shrink-0" />}
            {envio.titulo}
          </p>
          {envio.linhas.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {envio.linhas.map((linha, indice) => (
                <li key={`${indice}-${linha}`}>{linha}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Popup>
  );
}
