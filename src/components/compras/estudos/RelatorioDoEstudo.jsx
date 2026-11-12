"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, RotateCcw } from "lucide-react";

import { estudarDeNovoAcao } from "@/app/compras/estudos/acoes";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import FotoComLupa from "@/components/ui/FotoComLupa";
import { LIMITES, ROTULO_DA_CONFIANCA, idDoAnuncio, pisoDosVendidos, precoPorUnidade } from "@/lib/estudos/regras";

import SeloDoVeredito from "./SeloDoVeredito";
import { ROTULO_DA_DEMANDA, data, moeda, porcento } from "./formato";

const ABAS = [
  ["resumo", "Resumo"],
  ["ml", "Mercado Livre"],
  ["custo", "Custo"],
  ["historico", "Histórico"],
];

function Linha({ rotulo, children, ajuda = null, destaque = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-borda/60 py-1.5 last:border-0">
      <dt className="flex items-center gap-1 text-suave">
        {rotulo}
        {ajuda && <BolhaDeAjuda texto={ajuda} variante="inline" />}
      </dt>
      <dd className={`text-right tabular-nums ${destaque ? "font-semibold" : ""}`}>{children}</dd>
    </div>
  );
}

function Quadro({ titulo, children }) {
  return (
    <section className="rounded-lg border border-borda bg-superficie p-4">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-suave uppercase">{titulo}</h3>
      <dl className="text-sm">{children}</dl>
    </section>
  );
}

function Resumo({ contas }) {
  const mercado = contas?.mercado ?? {};
  const lucro = contas?.lucro;
  const quantidade = contas?.quantidade;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Quadro titulo="Mercado Livre">
        <Linha rotulo="Preço de referência" destaque ajuda="Mediana do preço por unidade dos anúncios do mesmo produto.">
          {moeda(mercado.precoReferencia)}
        </Linha>
        <Linha rotulo="Menor e maior">
          {moeda(mercado.precoMenor)} – {moeda(mercado.precoMaior)}
        </Linha>
        <Linha rotulo="Anúncios do mesmo produto">
          {mercado.iguais ?? 0} de {mercado.lidos ?? 0}
        </Linha>
        <Linha rotulo="Vendidos (somados)" ajuda={`O ML mostra o total acumulado em faixas; conta o piso ("+500" = 500). Forte a partir de ${LIMITES.demandaForte}, Média a partir de ${LIMITES.demandaMedia}.`}>
          {mercado.vendidosSomados ?? "—"} {mercado.demanda ? `(${ROTULO_DA_DEMANDA[mercado.demanda]})` : ""}
        </Linha>
        <Linha rotulo="Vendas por mês" ajuda={`Só sai comparando com um estudo anterior de pelo menos ${LIMITES.diasParaMedirVendas} dias.`}>
          {mercado.vendasPorMes ? `${mercado.vendasPorMes.porMes} (em ${mercado.vendasPorMes.dias} dias)` : "Não medido"}
        </Linha>
        <Linha rotulo="Vendedores · com Full">
          {mercado.vendedores ?? 0} · {mercado.comFull ?? 0}
        </Linha>
      </Quadro>
      <Quadro titulo="Lucro no Clássico">
        {lucro ? (
          <>
            <Linha rotulo="Preço">{moeda(lucro.preco)}</Linha>
            <Linha rotulo={`Comissão (${porcento(lucro.comissaoPercentual)})`}>− {moeda(lucro.comissao)}</Linha>
            {lucro.tarifaFixa > 0 && <Linha rotulo="Tarifa fixa">− {moeda(lucro.tarifaFixa)}</Linha>}
            <Linha
              rotulo={lucro.freteEstimado ? "Frete (estimado)" : "Frete"}
              ajuda={lucro.freteEstimado ? `Sem as medidas do pacote: ${lucro.pacote.alturaCm}×${lucro.pacote.larguraCm}×${lucro.pacote.comprimentoCm} cm, ${lucro.pacote.pesoKg} kg.` : null}
            >
              − {moeda(lucro.frete)}
            </Linha>
            <Linha rotulo="Imposto">− {moeda(lucro.imposto)}</Linha>
            <Linha rotulo="Custo">− {moeda(contas?.custo?.custo)}</Linha>
            <Linha rotulo="Lucro por unidade" destaque>
              <span className={lucro.lucro !== null && lucro.lucro < 0 ? "text-rose-600" : ""}>{moeda(lucro.lucro)}</span>
            </Linha>
            <Linha rotulo="Markup" ajuda="Lucro sobre o custo total (fornecedor + taxas + frete + imposto), a conta do editor do ML.">
              {porcento(lucro.markup)}
            </Linha>
            <Linha rotulo={`Preço mínimo para ${LIMITES.markupBom}%`}>{moeda(lucro.precoMinimo)}</Linha>
          </>
        ) : (
          <p className="text-sm text-suave">Sem preço do mercado para calcular.</p>
        )}
      </Quadro>
      <Quadro titulo="Compra inicial">
        <Linha rotulo="Fornecedor de menor custo">{contas?.custo?.fornecedor ?? "—"}</Linha>
        <Linha rotulo="Custo por unidade">{moeda(contas?.custo?.custo)}</Linha>
        <Linha
          rotulo="Quantidade sugerida"
          destaque
          ajuda={
            quantidade?.origem === "parecidos"
              ? `Mediana das vendas mensais dos parecidos da 4hobby no ML × ${LIMITES.mesesDeEstoque} meses, no múltiplo do fornecedor.`
              : "Sem parecidos com venda: 20, 10 ou 5 pela demanda Forte, Média ou Fraca."
          }
        >
          {contas?.regra?.quantidade ?? quantidade?.quantidade ?? "—"}
        </Linha>
        <Linha rotulo="Investimento">{contas?.custo?.custo && contas?.regra?.quantidade ? moeda(contas.custo.custo * contas.regra.quantidade) : "—"}</Linha>
        {contas?.regra?.motivos?.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-amber-800">
            {contas.regra.motivos.map((motivo) => (
              <li key={motivo}>• {motivo}</li>
            ))}
          </ul>
        )}
      </Quadro>
    </div>
  );
}

function AnunciosML({ anuncios }) {
  if (!anuncios?.length) return <p className="text-sm text-suave">Nenhum anúncio lido.</p>;
  const ordenados = [...anuncios].sort((a, b) => Number(Boolean(b.mesmoProduto)) - Number(Boolean(a.mesmoProduto)));
  return (
    <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
      <table className="w-full text-sm">
        <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
          <tr>
            <th className="px-3 py-2.5 font-medium">Anúncio</th>
            <th className="w-28 px-3 py-2.5 text-right font-medium">Preço</th>
            <th className="w-28 px-3 py-2.5 text-right font-medium">Por unidade</th>
            <th className="w-32 px-3 py-2.5 font-medium">Vendidos</th>
            <th className="w-40 px-3 py-2.5 font-medium">Vendedor</th>
            <th className="w-12 px-3 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {ordenados.map((anuncio, indice) => (
            <tr key={`${idDoAnuncio(anuncio) ?? anuncio.titulo}-${indice}`} className={anuncio.mesmoProduto ? "" : "text-suave"}>
              <td className="max-w-0 px-3 py-2">
                <span className="block truncate" title={anuncio.titulo}>
                  {anuncio.titulo}
                </span>
                <span className="mt-0.5 flex flex-wrap gap-1.5 text-[11px]">
                  {!anuncio.mesmoProduto && <span className="rounded bg-slate-100 px-1.5 text-slate-600">Outro produto{anuncio.motivo ? `: ${anuncio.motivo}` : ""}</span>}
                  {anuncio.unidades > 1 && <span className="rounded bg-sky-50 px-1.5 text-sky-800">{anuncio.unidades} un.</span>}
                  {anuncio.full && <span className="rounded bg-emerald-50 px-1.5 font-semibold text-emerald-800">FULL</span>}
                  {anuncio.catalogo && <span className="rounded bg-indigo-50 px-1.5 text-indigo-800">Catálogo</span>}
                  {anuncio.patrocinado && <span className="rounded bg-slate-100 px-1.5 text-slate-600">Patrocinado</span>}
                </span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{moeda(anuncio.preco)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{moeda(precoPorUnidade(anuncio))}</td>
              <td className="px-3 py-2 tabular-nums" title={anuncio.vendidos != null ? `Conta ${pisoDosVendidos(anuncio.vendidos) ?? "—"}` : undefined}>
                {anuncio.vendidos ?? "—"}
              </td>
              <td className="max-w-0 truncate px-3 py-2" title={anuncio.reputacao ?? undefined}>
                {anuncio.vendedor ?? "—"}
              </td>
              <td className="px-3 py-2 text-center">
                {anuncio.url && (
                  <a href={anuncio.url} target="_blank" rel="noopener noreferrer" title="Abrir o anúncio" className="inline-flex text-acento hover:opacity-70">
                    <ExternalLink size={15} />
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Custo({ fornecedores, parecidos }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-lg border border-borda bg-superficie p-4">
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-suave uppercase">Fornecedores do mesmo produto</h3>
        {fornecedores?.length ? (
          // table-fixed: com as celulas de numero sem largura, a do nome (max-w-0) encolhia ate "ZZ-E...".
          <table className="w-full table-fixed text-sm">
            <tbody className="divide-y divide-borda">
              {[...fornecedores]
                .sort((a, b) => (a.custo ?? Infinity) - (b.custo ?? Infinity))
                .map((fornecedor) => (
                  <tr key={fornecedor.produtoColetadoId}>
                    <td className="max-w-0 py-1.5 pr-3">
                      <span className="block truncate font-medium">{fornecedor.fonte}</span>
                      <span className="block truncate text-xs text-suave" title={fornecedor.nome}>
                        {fornecedor.codigo ? `${fornecedor.codigo} · ` : ""}
                        {fornecedor.nome}
                      </span>
                    </td>
                    <td className="w-24 py-1.5 pr-3 text-right tabular-nums">{moeda(fornecedor.custo)}</td>
                    <td className="w-36 py-1.5 text-right text-xs">
                      {fornecedor.temEstoque ? (
                        <span className="text-emerald-700">{fornecedor.quantidade != null ? `${fornecedor.quantidade} pronta entrega` : "Disponível"}</span>
                      ) : (
                        <span className="text-rose-600">Sem pronta entrega</span>
                      )}
                      {fornecedor.aChegar > 0 && <span className="block text-suave">{fornecedor.aChegar} a chegar</span>}
                      {fornecedor.multiploVenda > 1 && <span className="block text-suave">De {fornecedor.multiploVenda} em {fornecedor.multiploVenda}</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-rose-600">Nenhum fornecedor coletado vende este produto.</p>
        )}
      </section>
      <section className="rounded-lg border border-borda bg-superficie p-4">
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-suave uppercase">Parecidos da 4hobby no ML (últimos {LIMITES.diasDasVendasDaLoja} dias)</h3>
        {parecidos?.length ? (
          <table className="w-full table-fixed text-sm">
            <tbody className="divide-y divide-borda">
              {parecidos.map((parecido) => (
                <tr key={parecido.sku}>
                  <td className="max-w-0 py-1.5 pr-3">
                    <Link href={`/produtos/${parecido.produtoId}`} className="block truncate hover:text-acento" title={parecido.nome}>
                      <span className="font-mono text-xs">{parecido.sku}</span> {parecido.nome}
                    </Link>
                  </td>
                  <td className="w-44 py-1.5 text-right text-xs whitespace-nowrap tabular-nums">
                    {parecido.vendidos90Dias} vendidos · {String(parecido.vendasPorMes).replace(".", ",")}/mês
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-suave">Nenhum parecido apontado.</p>
        )}
      </section>
    </div>
  );
}

function Historico({ historico }) {
  if (!historico?.length) return <p className="text-sm text-suave">Primeiro estudo deste produto.</p>;
  return (
    <ul className="divide-y divide-borda rounded-lg border border-borda bg-superficie">
      {historico.map((estudo) => (
        <li key={estudo.id}>
          <Link href={`/compras/estudos/${estudo.id}`} className="flex items-center gap-4 px-4 py-2.5 text-sm hover:bg-fundo/60">
            <span className="w-24 text-suave tabular-nums">{data(estudo.concluidoEm ?? estudo.criadoEm)}</span>
            <SeloDoVeredito situacao={estudo.situacao} veredito={estudo.veredito} />
            <span className="ml-auto text-suave tabular-nums">
              {moeda(estudo.contas?.mercado?.precoReferencia)} · lucro {moeda(estudo.contas?.lucro?.lucro)}
              {estudo.situacao === "CONCLUIDO" ? ` · comprar ${estudo.quantidadeInicial ?? "—"}` : ""}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * O relatorio de um estudo. Linha-guia: o operador ve primeiro o veredito, a quantidade e a conclusao; os numeros que
 * sustentam ficam nas abas. A acao principal e "Estudar de novo" (um estudo novo na fila; este fica no historico).
 */
export default function RelatorioDoEstudo({ estudo, podeEditar }) {
  const router = useRouter();
  const [aba, setAba] = useState("resumo");
  const [erro, setErro] = useState(null);
  const [ocupado, iniciar] = useTransition();
  const concluido = estudo.situacao === "CONCLUIDO";

  const estudarDeNovo = () =>
    iniciar(async () => {
      const resposta = await estudarDeNovoAcao(estudo.id);
      if (!resposta?.ok) {
        setErro(resposta?.erro ?? "Não foi possível.");
        return;
      }
      router.push(`/compras/estudos/${resposta.id}`);
    });

  return (
    <>
      <section className="mb-5 flex flex-wrap items-start gap-4 rounded-lg border border-borda bg-superficie p-4">
        {estudo.miniatura ? <FotoComLupa src={estudo.miniatura} alt={estudo.nome} className="h-20 w-20" /> : <span className="h-20 w-20 rounded bg-fundo" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeloDoVeredito situacao={estudo.situacao} veredito={estudo.veredito} grande />
            {concluido && (
              <span className="text-sm text-suave">
                Confiança {ROTULO_DA_CONFIANCA[estudo.confianca]?.toLowerCase() ?? "—"} · {data(estudo.concluidoEm)}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-suave">
            {estudo.fonteTipo === "FORNECEDOR" ? "Fornecedor" : "Concorrente"} {estudo.fonteNome}
            {estudo.codigo ? ` · ${estudo.codigo}` : ""}
            {estudo.url && (
              <a href={estudo.url} target="_blank" rel="noopener noreferrer" className="ml-1.5 inline-flex align-middle text-acento hover:opacity-70" title="Abrir na loja">
                <ExternalLink size={13} />
              </a>
            )}
          </p>
          {concluido ? (
            <p className="mt-3 text-sm whitespace-pre-line text-pretty">{estudo.conclusao}</p>
          ) : (
            <p className="mt-3 text-sm text-suave">Na fila desde {data(estudo.criadoEm)}. Peça ao Claude Desktop: &quot;faça os estudos de viabilidade da fila&quot;.</p>
          )}
        </div>
        {concluido && (
          <div className="text-right">
            <p className="text-xs tracking-wide text-suave uppercase">Comprar</p>
            <p className="text-3xl font-semibold tabular-nums">{estudo.quantidadeInicial ?? "—"}</p>
            <p className="text-xs text-suave">unidades</p>
          </div>
        )}
        {podeEditar && concluido && (
          <button
            type="button"
            onClick={estudarDeNovo}
            disabled={ocupado}
            title="Põe um estudo novo deste produto na fila; este fica no histórico."
            className="inline-flex items-center gap-1.5 self-start rounded-md border border-borda px-3 py-1.5 text-sm font-medium hover:bg-fundo disabled:opacity-60"
          >
            <RotateCcw size={15} /> Estudar de novo
          </button>
        )}
      </section>
      {erro && (
        <p className="-mt-3 mb-3 text-sm text-rose-600" role="alert">
          {erro}
        </p>
      )}

      {estudo.contas ? (
        <div className="rounded-lg border border-borda bg-superficie p-0">
          <div role="tablist" className="flex gap-1 border-b-2 border-borda px-3">
            {ABAS.map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={aba === id}
                onClick={() => setAba(id)}
                className={`-mb-0.5 border-b-2 px-3 py-2.5 text-sm font-medium ${aba === id ? "border-acento text-texto" : "border-transparent text-suave hover:text-texto"}`}
              >
                {rotulo}
                {id === "ml" && estudo.anunciosML?.length ? <span className="ml-1 text-xs text-suave">{estudo.anunciosML.length}</span> : null}
                {id === "historico" && estudo.historico?.length ? <span className="ml-1 text-xs text-suave">{estudo.historico.length}</span> : null}
              </button>
            ))}
          </div>
          <div className="bg-fundo/40 p-4">
            {aba === "resumo" && <Resumo contas={estudo.contas} />}
            {aba === "ml" && <AnunciosML anuncios={estudo.anunciosML} />}
            {aba === "custo" && <Custo fornecedores={estudo.fornecedores} parecidos={estudo.parecidos} />}
            {aba === "historico" && <Historico historico={estudo.historico} />}
          </div>
        </div>
      ) : (
        estudo.historico?.length > 0 && (
          <>
            <h2 className="mb-2 text-sm font-semibold">Estudos anteriores</h2>
            <Historico historico={estudo.historico} />
          </>
        )
      )}
    </>
  );
}
