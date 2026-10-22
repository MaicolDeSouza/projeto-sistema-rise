"use client";

import { useEffect, useState } from "react";
import { Eye, FileText, X } from "lucide-react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { propsDoFundo } from "@/lib/fundoDaJanela";

/**
 * A proposta no cadastro do produto. Ate 21/10/2026 era um quadro com uma linha por secao e "Aplicar escolhidos"; desde
 * 22/10/2026 (pedido do dono) a proposta preenche o formulario sozinha e aqui ficam so o topo (selo + Relatorio), o olho
 * de uma secao e os documentos. A janela de detalhe (`JanelaDaSecao`) e a mesma de antes.
 */

const NOMES = {
  titulos: "Título", descricao: "Descrição", campos: "Campos", preco: "Preço", ean: "EAN",
  fotos: "Fotos", documentos: "Documentos", relatorio: "Relatório",
};
const ROTULO_DO_CAMPO = {
  marca: "Marca", modelo: "Modelo", unidade: "Unidade", garantiaMeses: "Garantia (meses)", codigo: "Código", ncm: "NCM",
  origem: "Origem", pesoKg: "Peso (kg)", alturaCm: "Altura (cm)", larguraCm: "Largura (cm)", comprimentoCm: "Comprimento (cm)",
};

const reais = (valor) => (typeof valor === "number" ? valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");
const posicaoTexto = (posicao) => (posicao ? `${posicao.posicao}º de ${posicao.total}` : "sem posição");
// A margem vem em porcentagem (46) pelo roteiro, mas a conversa do claude.ai ja gravou como fracao (0.46): as duas
// viram "46%". Formato pedido pelo dono em 21/10/2026: "R$ 39,38 (46% margem)".
const margemTexto = (margem) => {
  const numero = Number(margem);
  if (!Number.isFinite(numero)) return "";
  const porcento = numero > 0 && numero <= 1 ? numero * 100 : numero;
  return `${porcento.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
};

/**
 * O topo do cadastro quando ha proposta (pedido do dono em 22/10/2026: o quadro saiu): o selo "Proposta" com a bolha e
 * o botao "Relatorio", ao lado do Cancelar. Os campos a proposta ja preencheu ao abrir (`propostaNoFormulario`).
 */
export default function PropostaNoTopo({ proposta }) {
  const [vendo, setVendo] = useState(false);
  const secoes = proposta?.secoes ?? {};
  return (
    <>
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
        Proposta
        <BolhaDeAjuda
          variante="inline"
          texto="Este produto ainda é uma proposta. Os campos vazios já vieram preenchidos (marca PROPOSTA) e os preenchidos têm a sugestão no topo da lista do ícone. Confira e salve; marcar Conferido aprova e apaga a proposta."
        />
      </span>
      {secoes.relatorio && (
        <button
          type="button"
          onClick={() => setVendo(true)}
          className="inline-flex items-center gap-1.5 rounded border border-borda px-3 py-2 text-sm hover:bg-fundo"
        >
          <FileText size={15} /> Relatório
        </button>
      )}
      {vendo && <JanelaDaSecao secao="relatorio" conteudo={secoes.relatorio} urls={proposta.urls ?? {}} aoFechar={() => setVendo(false)} />}
    </>
  );
}

/**
 * O olho de uma secao (pedido do dono em 22/10/2026, na Descricao: "e bem util para entender de onde foram retirados os
 * dados"): abre a mesma janela de detalhe de antes.
 */
export function OlhoDaProposta({ proposta, secao }) {
  const [vendo, setVendo] = useState(false);
  const conteudo = proposta?.secoes?.[secao];
  if (!conteudo) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setVendo(true)}
        aria-label={`Ver de onde veio: ${NOMES[secao]}`}
        title="Ver de onde a proposta tirou os dados"
        className="rounded p-1 text-suave hover:bg-fundo hover:text-texto"
      >
        <Eye size={16} />
      </button>
      {vendo && <JanelaDaSecao secao={secao} conteudo={conteudo} urls={proposta.urls ?? {}} aoFechar={() => setVendo(false)} />}
    </>
  );
}

/** A secao "Da proposta" da aba Documentos tecnicos: os links que a proposta escolheu, com os que nao abrem marcados. */
export function DocumentosDaProposta({ proposta }) {
  const conteudo = proposta?.secoes?.documentos;
  if (!conteudo?.itens?.length) return null;
  return (
    <div className="sm:col-span-2">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
        Da proposta
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Proposta</span>
      </p>
      <div className="rounded border border-amber-200 bg-amber-50/40 p-3 text-sm">
        <DetalheDaSecao secao="documentos" conteudo={conteudo} urls={proposta.urls ?? {}} />
      </div>
    </div>
  );
}

function JanelaDaSecao({ secao, conteudo, urls, aoFechar }) {
  useEffect(() => {
    const aoTeclar = (evento) => {
      if (evento.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" {...propsDoFundo(aoFechar)}>
      <div role="dialog" aria-label={`Proposta: ${NOMES[secao]}`} className="mt-10 w-full max-w-3xl rounded-lg bg-superficie shadow-xl">
        <header className="flex items-center justify-between border-b border-borda px-5 py-3">
          <h2 className="font-semibold">Proposta: {NOMES[secao]}</h2>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-suave hover:bg-fundo">
            <X size={18} />
          </button>
        </header>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4 text-sm">
          <DetalheDaSecao secao={secao} conteudo={conteudo} urls={urls} />
        </div>
      </div>
    </div>
  );
}

const Subtitulo = ({ children }) => <h3 className="mt-4 mb-1.5 font-semibold first:mt-0">{children}</h3>;
const Link = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer" className="break-all text-acento hover:underline">
    {children}
  </a>
);
const ehEndereco = (texto) => /^https?:\/\//.test(String(texto ?? ""));

function DetalheDaSecao({ secao, conteudo, urls }) {
  if (secao === "descricao") {
    return (
      <>
        <pre className="rounded border border-borda bg-fundo p-3 font-sans text-sm whitespace-pre-wrap">{conteudo.texto}</pre>
        {(conteudo.divergencias ?? []).length > 0 && (
          <>
            <Subtitulo>Divergências resolvidas</Subtitulo>
            <ul className="space-y-2">
              {conteudo.divergencias.map((item) => (
                <li key={item.campo}>
                  <span className="font-medium">{item.campo}:</span> ficou <span className="font-medium">{item.escolhida}</span>
                  <span className="text-suave"> ({item.motivo})</span>
                  <ul className="mt-0.5 ml-4 list-disc text-suave">
                    {item.opcoes.map((opcao) => <li key={opcao.valor}>{opcao.valor}: {opcao.lojas.join(", ")}</li>)}
                  </ul>
                </li>
              ))}
            </ul>
          </>
        )}
        {(conteudo.pesquisadas ?? []).length > 0 && (
          <>
            <Subtitulo>Preenchido por pesquisa</Subtitulo>
            <ul className="space-y-1">
              {conteudo.pesquisadas.map((item) => (
                <li key={item.linha}>{item.linha} {ehEndereco(item.fonte) ? <Link href={item.fonte}>fonte</Link> : <span className="text-suave">({item.fonte})</span>}</li>
              ))}
            </ul>
          </>
        )}
        {(conteudo.interrogacoes ?? []).length > 0 && (
          <>
            <Subtitulo>Sem fonte (ficaram com &quot;?&quot;)</Subtitulo>
            <p className="text-suave">{conteudo.interrogacoes.join(", ")}</p>
          </>
        )}
      </>
    );
  }
  if (secao === "titulos") {
    return (
      <>
        <ul className="space-y-1">
          {conteudo.opcoes.map((opcao, indice) => (
            <li key={opcao} className="flex items-center justify-between gap-3 rounded border border-borda px-3 py-2">
              <span className="font-medium">{opcao}</span>
              <span className="shrink-0 text-xs text-suave">{opcao.length} caracteres{indice === conteudo.recomendada ? " · recomendada" : ""}</span>
            </li>
          ))}
        </ul>
        {conteudo.motivo && <p className="mt-2 text-suave">{conteudo.motivo}</p>}
        <Subtitulo>Títulos dos concorrentes usados</Subtitulo>
        <ul className="ml-4 list-disc text-suave">{(conteudo.concorrentes ?? []).map((item) => <li key={item}>{item}</li>)}</ul>
      </>
    );
  }
  if (secao === "campos") {
    return (
      <table className="w-full">
        <tbody className="divide-y divide-borda">
          {Object.entries(conteudo).map(([campo, item]) => (
            <tr key={campo}>
              <td className="py-1.5 pr-3 font-medium">{ROTULO_DO_CAMPO[campo] ?? campo}</td>
              <td className="py-1.5 pr-3">{String(item.valor)}</td>
              <td className="py-1.5 text-suave">{item.origem}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  if (secao === "preco") {
    const linhas = [...(conteudo.opcoes ?? []), ...(conteudo.recomendada ? [{ ...conteudo.recomendada, recomendada: true }] : [])];
    return (
      <>
        <p className="mb-2 text-suave">Custo {reais(conteudo.custo)}{conteudo.custoOrigem ? ` (${conteudo.custoOrigem})` : ""}</p>
        <table className="w-full tabular-nums">
          <thead className="text-left text-xs text-suave">
            <tr><th className="pb-1">Margem</th><th className="pb-1">Preço</th><th className="pb-1">Posição</th><th /></tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {linhas.map((opcao) => (
              <tr key={`${opcao.margem}-${opcao.recomendada ? "r" : ""}`} className={opcao.recomendada ? "font-semibold" : ""}>
                <td className="py-1.5">{margemTexto(opcao.margem)}</td>
                <td className="py-1.5">{reais(opcao.preco)}</td>
                <td className="py-1.5">{posicaoTexto(opcao.posicao)}</td>
                <td className="py-1.5 text-xs text-emerald-700">{opcao.recomendada ? "recomendada" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {conteudo.motivoSemRecomendada && <p className="mt-2 text-amber-800">{conteudo.motivoSemRecomendada}</p>}
      </>
    );
  }
  if (secao === "ean") {
    return (
      <>
        <p>{conteudo.escolhido ? <>Escolhido: <span className="font-medium">{conteudo.escolhido.valor}</span> <span className="text-suave">({conteudo.escolhido.origem})</span></> : "Nenhum EAN confiável: o campo fica como está."}</p>
        {(conteudo.descartados ?? []).length > 0 && (
          <>
            <Subtitulo>Descartados</Subtitulo>
            <ul className="space-y-1">{conteudo.descartados.map((item) => <li key={item.valor}><span className="font-medium tabular-nums">{item.valor}</span> <span className="text-suave">{item.motivo}</span></li>)}</ul>
          </>
        )}
        {(conteudo.buscas ?? []).length > 0 && (
          <>
            <Subtitulo>Onde foi procurado</Subtitulo>
            <ul className="ml-4 list-disc text-suave">{conteudo.buscas.map((item) => <li key={item}>{item}</li>)}</ul>
          </>
        )}
      </>
    );
  }
  if (secao === "fotos") {
    const candidatas = [...(conteudo.candidatas ?? [])].sort((a, b) => Number(b.escolhida) - Number(a.escolhida) || (a.ordem ?? 99) - (b.ordem ?? 99));
    return (
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {candidatas.map((candidata) => (
          <li key={candidata.id} className={`rounded border p-2 ${candidata.escolhida ? "border-emerald-500" : "border-borda"}`}>
            {urls[`foto:${candidata.id}`] && (
              // eslint-disable-next-line @next/next/no-img-element -- foto da pasta da proposta, servida pela rota do Rise
              <img src={urls[`foto:${candidata.id}`]} alt={`Candidata ${candidata.id}`} loading="lazy" className="aspect-square w-full rounded object-contain" />
            )}
            <p className="mt-1 text-xs">
              {candidata.escolhida ? <span className="font-medium text-emerald-700">{candidata.ordem + 1}ª · </span> : null}
              {candidata.origem?.loja}
            </p>
            <p className="text-xs text-suave">{candidata.motivo}</p>
          </li>
        ))}
      </ul>
    );
  }
  if (secao === "documentos") {
    return (
      <>
        <ul className="space-y-1.5">
          {(conteudo.itens ?? []).map((item) => {
            // O link que o Rise testou ao gravar e nao abriu fica riscado, com o motivo (pedido do dono em 21/10/2026).
            const quebrado = item.link && !item.link.ok;
            const motivo = quebrado ? (item.link.status ? `não abre (${item.link.status})` : `não abre (${item.link.erro ?? "sem resposta"})`) : null;
            return (
              <li key={item.id} className={quebrado ? "text-suave" : undefined}>
                {quebrado ? (
                  <span className="break-all line-through" title={item.url}>{item.titulo}</span>
                ) : (
                  <Link href={urls[`documento:${item.id}`] ?? item.url}>{item.titulo}</Link>
                )}
                {item.loja && <span className="text-suave"> ({item.loja})</span>}
                {motivo && <span className="ml-1.5 rounded bg-fundo px-1.5 py-0.5 text-xs">{motivo}</span>}
              </li>
            );
          })}
        </ul>
        {conteudo.observacao && <p className="mt-2 text-suave">{conteudo.observacao}</p>}
      </>
    );
  }
  if (secao === "relatorio") {
    // Em topicos (desde 21/10/2026): titulo e a lista de cada um; "atencao" vem destacado (e o que o dono precisa olhar).
    if (Array.isArray(conteudo.topicos)) {
      return (
        <div className="space-y-4">
          {conteudo.topicos.map((topico, i) => (
            <section key={i} className={topico.atencao ? "rounded border-l-4 border-amber-400 bg-amber-50 py-2 pr-3 pl-3" : undefined}>
              <h3 className={`mb-1.5 text-xs font-semibold tracking-wide uppercase ${topico.atencao ? "text-amber-800" : "text-suave"}`}>{topico.titulo}</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {topico.itens.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      );
    }
    return <pre className="font-sans text-sm whitespace-pre-wrap">{conteudo.texto}</pre>;
  }
  return null;
}
