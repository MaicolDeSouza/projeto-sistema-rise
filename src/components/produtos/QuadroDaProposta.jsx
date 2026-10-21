"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Eye, X } from "lucide-react";

import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import { propsDoFundo } from "@/lib/fundoDaJanela";
import { SECOES_APLICAVEIS, temOQueAplicar } from "@/lib/proposta/aplicar";

/**
 * Quadro "Proposta" no topo do cadastro (spec 2026-10-16, Como a tela mostra): o que a sessao do Claude propos para
 * este produto, uma linha por secao, com o estado (aplicada / pendente / falta salvar) e o detalhe em "Ver". A acao
 * principal so PREENCHE o formulario (`aoAplicar`); quem grava e o Salvar, e quem aprova e o Conferido.
 *
 * Desenho: nesta tela o operador precisa ver primeiro o que a proposta tem por secao e se ja foi aplicada; a acao
 * principal e "Aplicar escolhidos ao formulario". Titulo e preco escolhem a opcao na propria linha.
 */

const NOMES = {
  titulos: "Título", descricao: "Descrição", campos: "Campos", preco: "Preço", ean: "EAN",
  fotos: "Fotos", documentos: "Documentos", relatorio: "Relatório",
};
const ORDEM = ["titulos", "descricao", "campos", "preco", "ean", "fotos", "documentos", "relatorio"];
const ROTULO_DO_CAMPO = {
  marca: "Marca", modelo: "Modelo", unidade: "Unidade", garantiaMeses: "Garantia (meses)", codigo: "Código", ncm: "NCM",
  origem: "Origem", pesoKg: "Peso (kg)", alturaCm: "Altura (cm)", larguraCm: "Largura (cm)", comprimentoCm: "Comprimento (cm)",
};

const reais = (valor) => (typeof valor === "number" ? valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");
const posicaoTexto = (posicao) => (posicao ? `${posicao.posicao}º de ${posicao.total}` : "sem posição");
const descricaoDaOpcaoDePreco = (opcao) => `${reais(opcao.preco)} · ${opcao.margem}% · ${posicaoTexto(opcao.posicao)}`;

/** Uma frase por secao: o que a proposta traz, sem abrir o detalhe. */
function resumo(secao, conteudo) {
  if (secao === "descricao") {
    // So as linhas da secao "Especificacoes tecnicas" (ate a proxima linha em branco), nao os itens inclusos.
    const todas = String(conteudo.texto ?? "").split(/\r?\n/);
    const inicio = todas.findIndex((linha) => /^especifica/i.test(linha.trim()));
    const depois = inicio < 0 ? [] : todas.slice(inicio + 1);
    const fim = depois.findIndex((linha) => linha.trim() === "");
    const linhas = (fim < 0 ? depois : depois.slice(0, fim)).filter((linha) => linha.startsWith("- ")).length;
    const interrogacoes = (conteudo.interrogacoes ?? []).length;
    return `${linhas} linhas de especificação${interrogacoes ? `, ${interrogacoes} com "?"` : ""}`;
  }
  if (secao === "campos") {
    return Object.entries(conteudo).map(([campo, item]) => `${ROTULO_DO_CAMPO[campo] ?? campo} ${item.valor}`).join(", ") || "nada a propor";
  }
  if (secao === "ean") {
    const descartados = (conteudo.descartados ?? []).length;
    return conteudo.escolhido ? `${conteudo.escolhido.valor} (${conteudo.escolhido.origem})` : `Nenhum confiável${descartados ? ` (${descartados} descartados)` : ""}`;
  }
  if (secao === "fotos") {
    const candidatas = conteudo.candidatas ?? [];
    return `${candidatas.filter((c) => c.escolhida).length} escolhidas de ${candidatas.length}; aplicar na aba Imagens (Proposta)`;
  }
  if (secao === "documentos") {
    const itens = conteudo.itens ?? [];
    const quebrados = itens.filter((item) => item.link && !item.link.ok).length;
    return `${itens.length} documento(s)${quebrados ? ` · ${quebrados} não ${quebrados === 1 ? "abre" : "abrem"}` : ""}`;
  }
  if (secao === "relatorio") {
    if (Array.isArray(conteudo.topicos)) return conteudo.topicos[0]?.itens?.[0] ?? "";
    return String(conteudo.texto ?? "").split(/\r?\n/)[0];
  }
  return "";
}

const aplicavel = temOQueAplicar;

function Estado({ estado }) {
  const estilos = {
    aplicada: "bg-emerald-50 text-emerald-800",
    pendente: "bg-amber-50 text-amber-800",
    "falta salvar": "bg-sky-50 text-sky-800",
  };
  if (!estado) return <span className="w-24" aria-hidden />;
  return <span className={`inline-flex w-24 justify-center rounded px-1.5 py-0.5 text-[11px] font-medium ${estilos[estado]}`}>{estado}</span>;
}

export default function QuadroDaProposta({ proposta, aoAplicar, aplicadasNestaEdicao = [] }) {
  const secoes = proposta?.secoes ?? {};
  const presentes = ORDEM.filter((secao) => secoes[secao]);
  const [aberto, setAberto] = useState(() => (proposta?.naoAplicadas ?? []).length > 0);
  const [marcadas, setMarcadas] = useState(() => new Set(presentes.filter((s) => aplicavel(s, secoes[s]) && (proposta.naoAplicadas ?? []).includes(s))));
  const [titulo, setTitulo] = useState(secoes.titulos?.recomendada ?? 0);
  const recomendadaDePreco = secoes.preco?.recomendada ?? null;
  const [preco, setPreco] = useState(recomendadaDePreco?.margem ?? secoes.preco?.opcoes?.[0]?.margem ?? null);
  const [vendo, setVendo] = useState(null);

  if (presentes.length === 0) return null;

  const estadoDe = (secao) => {
    // Fotos se aplica na aba Imagens, mas tem estado como as outras.
    if (secao !== "fotos" && !aplicavel(secao, secoes[secao])) return null;
    if (aplicadasNestaEdicao.includes(secao)) return "falta salvar";
    return (proposta.naoAplicadas ?? []).includes(secao) ? "pendente" : "aplicada";
  };
  const pendentes = presentes.filter((secao) => estadoDe(secao) === "pendente").length;
  const faltaSalvar = presentes.filter((secao) => estadoDe(secao) === "falta salvar").length;
  // O cabecalho diz o que falta, na ordem em que o dono resolve: aplicar, depois salvar.
  const situacao = pendentes
    ? { texto: `${pendentes} ${pendentes === 1 ? "seção pendente" : "seções pendentes"}`, cor: "text-amber-700" }
    : faltaSalvar
      ? { texto: `${faltaSalvar} ${faltaSalvar === 1 ? "aplicada" : "aplicadas"}, falta salvar`, cor: "text-sky-700" }
      : { texto: "tudo aplicado", cor: "text-suave" };

  function alternar(secao) {
    setMarcadas((atual) => {
      const nova = new Set(atual);
      if (nova.has(secao)) nova.delete(secao);
      else nova.add(secao);
      return nova;
    });
  }

  function aplicar() {
    aoAplicar({ secoes: [...marcadas], titulo: Number(titulo), preco: preco === null ? null : Number(preco) });
  }

  const opcoesDePreco = [
    ...(recomendadaDePreco ? [{ ...recomendadaDePreco, recomendada: true }] : []),
    ...(secoes.preco?.opcoes ?? []).filter((opcao) => opcao.preco && opcao.margem !== recomendadaDePreco?.margem),
  ];

  return (
    <section aria-label="Proposta" className="rounded-lg border border-borda bg-superficie">
      <header className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setAberto((atual) => !atual)}
          aria-expanded={aberto}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          {aberto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          Proposta
        </button>
        <span className={`text-xs ${situacao.cor}`}>{situacao.texto}</span>
        <span className="relative inline-flex">
          <BolhaDeAjuda
            variante="inline"
            texto="O que a pesquisa propõe para este produto. Marque as seções e clique em Aplicar: os campos do formulário são preenchidos, e nada é gravado até o Salvar. O Conferido aprova e apaga a proposta."
          />
        </span>
        <button
          type="button"
          onClick={aplicar}
          disabled={marcadas.size === 0}
          title={marcadas.size === 0 ? "Marque pelo menos uma seção" : undefined}
          className="ml-auto rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Aplicar escolhidos ao formulário
        </button>
      </header>

      {aberto && (
        <ul className="divide-y divide-borda border-t border-borda">
          {presentes.map((secao) => {
            const conteudo = secoes[secao];
            const podeAplicar = aplicavel(secao, conteudo);
            return (
              <li key={secao} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="flex w-5 justify-center">
                  {podeAplicar && (
                    <input
                      type="checkbox"
                      checked={marcadas.has(secao)}
                      onChange={() => alternar(secao)}
                      aria-label={`Aplicar ${NOMES[secao]}`}
                      className="accent-emerald-600"
                    />
                  )}
                </span>
                <span className="w-24 shrink-0 font-medium">{NOMES[secao]}</span>
                <span className="min-w-0 flex-1">
                  {secao === "titulos" ? (
                    <select
                      value={titulo}
                      onChange={(evento) => setTitulo(Number(evento.target.value))}
                      aria-label="Título a aplicar"
                      className="w-full max-w-xl rounded border border-borda bg-superficie px-2 py-1 text-sm"
                    >
                      {conteudo.opcoes.map((opcao, indice) => (
                        <option key={opcao} value={indice}>
                          {opcao} ({opcao.length}){indice === conteudo.recomendada ? " · recomendada" : ""}
                        </option>
                      ))}
                    </select>
                  ) : secao === "preco" && opcoesDePreco.length > 0 ? (
                    <select
                      value={preco ?? ""}
                      onChange={(evento) => setPreco(Number(evento.target.value))}
                      aria-label="Preço a aplicar"
                      className="w-full max-w-xl rounded border border-borda bg-superficie px-2 py-1 text-sm tabular-nums"
                    >
                      {opcoesDePreco.map((opcao) => (
                        <option key={opcao.margem} value={opcao.margem}>
                          {descricaoDaOpcaoDePreco(opcao)}{opcao.recomendada ? " · recomendada" : ""}
                        </option>
                      ))}
                    </select>
                  ) : secao === "preco" ? (
                    <span className="text-suave">{conteudo.motivoSemRecomendada}</span>
                  ) : (
                    <span className="block truncate text-suave" title={resumo(secao, conteudo)}>{resumo(secao, conteudo)}</span>
                  )}
                </span>
                <Estado estado={estadoDe(secao)} />
                <button
                  type="button"
                  onClick={() => setVendo(secao)}
                  aria-label={`Ver ${NOMES[secao]}`}
                  title="Ver o detalhe"
                  className="rounded p-1.5 text-suave hover:bg-fundo hover:text-texto"
                >
                  <Eye size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {vendo && <JanelaDaSecao secao={vendo} conteudo={secoes[vendo]} urls={proposta.urls ?? {}} aoFechar={() => setVendo(null)} />}
    </section>
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
                <td className="py-1.5">{opcao.margem}%</td>
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
