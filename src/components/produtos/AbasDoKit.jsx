"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { consultarEstoqueFornecedores } from "@/app/produtos/acoes";
import { pesoEMedidasDoKit, totaisDoKit } from "@/lib/composicao";

/**
 * As abas do produto com composicao (kit) que mostram dados das PECAS (pedido do dono em 07/10/2026):
 * os fornecedores padrao de cada peca, com custo e venda totais, e o peso e as medidas de cada uma. Tudo
 * so leitura: o que se edita e a peca, no cadastro dela (o link abre em outra aba para nao perder o kit).
 */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatarMoeda = (valor) => (valor === null || valor === undefined ? "—" : moeda.format(valor));
const formatarNumero = (valor, casas = 3) =>
  valor === null || valor === undefined ? null : Number(valor).toLocaleString("pt-BR", { maximumFractionDigits: casas });

/// So http/https vira link: o endereco veio de um cadastro digitado, e `javascript:` num href executa.
function linkSeguro(endereco) {
  try {
    const url = new URL(String(endereco ?? ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function LinkDaPeca({ peca }) {
  return (
    <Link
      href={`/produtos/${peca.componenteId}`}
      target="_blank"
      className="inline-flex items-center gap-1 font-medium hover:text-acento"
      title="Abrir a peça em outra aba"
    >
      {peca.tituloBase}
      <ExternalLink size={12} className="shrink-0 text-suave" />
    </Link>
  );
}

/** Estoque do fornecedor na ultima coleta, no mesmo vocabulario da aba Fornecedores. */
function EstoqueDoFornecedor({ info }) {
  if (info === undefined) return <span className="text-suave">…</span>;
  if (!info) return <span className="text-suave" title="Este item não foi achado nas coletas do fornecedor.">—</span>;
  if (info.quantidade !== null && info.quantidade !== undefined) {
    return (
      <span className={info.quantidade > 0 ? "" : "text-red-700"}>
        {info.quantidade}
        {info.aChegar ? <span className="block text-[11px] text-suave">+{info.aChegar} a chegar</span> : null}
      </span>
    );
  }
  return info.disponivel ? <span className="text-emerald-700">Disponível</span> : <span className="text-red-700">Sem estoque</span>;
}

/**
 * Aba Fornecedores do kit: uma linha por peca com o fornecedor PADRAO dela, e no rodape o custo total e a
 * venda total (valor x quantidade). Peca sem custo ou sem preco deixa o total incompleto, nunca uma soma
 * parcial (pareceria uma margem boa).
 */
export function FornecedoresDoKit({ pecas, ativo }) {
  const [estoques, setEstoques] = useState({});
  const totais = totaisDoKit(pecas);

  // Le o estoque dos fornecedores so com a aba aberta (consulta ao banco de coleta), e de novo quando as
  // pecas mudam. O resultado vem por id do vinculo (ProdutoFornecedor) de cada peca.
  // So o fornecedor confirmado tem vinculo (id) para consultar; o rascunho do Bling nao.
  const vinculos = pecas
    .filter((peca) => peca.fornecedor?.id)
    .map((peca) => ({ id: peca.fornecedor.id, nome: peca.fornecedor.nome, codigo: peca.fornecedor.codigo, link: peca.fornecedor.link }));
  const chave = vinculos.map((item) => item.id).join(",");
  useEffect(() => {
    if (!ativo || !chave) return;
    let vivo = true;
    consultarEstoqueFornecedores(vinculos)
      .then((resposta) => {
        if (vivo) setEstoques(resposta?.ok ? resposta.itens : {});
      })
      .catch(() => {
        if (vivo) setEstoques({});
      });
    return () => {
      vivo = false;
    };
    // `vinculos` e refeito a cada render; a chave (os ids) e o que diz se mudou.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, chave]);

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">Fornecedores das peças</h3>
        <p className="text-[12px] text-suave">
          O fornecedor padrão de cada peça do kit. Para mudar, abra a peça e edite o fornecedor dela.
        </p>
      </div>

      <div className="overflow-x-auto rounded border border-borda">
        <table className="w-full text-sm">
          <thead className="bg-fundo text-left text-xs font-semibold text-suave">
            <tr>
              <th className="px-3 py-2">Peça</th>
              <th className="px-3 py-2 text-right">Qtde</th>
              <th className="px-3 py-2">Fornecedor padrão</th>
              <th className="px-3 py-2">Descrição no fornecedor</th>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2 text-right">Custo</th>
              <th className="px-3 py-2 text-right">Estoque fornec.</th>
              <th className="px-3 py-2">Link</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {pecas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-4 text-center text-suave">
                  O kit ainda não tem peças (aba Composição).
                </td>
              </tr>
            )}
            {pecas.map((peca) => {
              const fornecedor = peca.fornecedor;
              const link = linkSeguro(fornecedor?.link) ?? linkSeguro(fornecedor?.site);
              return (
                <tr key={peca.componenteId}>
                  <td className="px-3 py-2">
                    <LinkDaPeca peca={peca} />
                    <span className="block font-mono text-[11px] text-suave">{peca.sku}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{peca.quantidade}</td>
                  <td className="px-3 py-2">
                    {fornecedor ? fornecedor.nome : <span className="text-amber-700">Sem fornecedor padrão</span>}
                    {fornecedor?.rascunho && (
                      <span
                        className="block text-[11px] text-amber-700"
                        title="Veio da importação do Bling e ainda não foi confirmado: salve a peça para confirmar."
                      >
                        rascunho do Bling
                      </span>
                    )}
                  </td>
                  <td className="max-w-56 truncate px-3 py-2" title={fornecedor?.descricao ?? ""}>
                    {fornecedor?.descricao || "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{fornecedor?.codigo || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {peca.custo === null ? <span className="text-amber-700">sem custo</span> : formatarMoeda(peca.custo)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fornecedor?.id ? <EstoqueDoFornecedor info={estoques[fornecedor.id]} /> : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {link ? (
                      <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-acento hover:underline">
                        Abrir <ExternalLink size={12} />
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pecas.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded border border-borda p-3">
            <span className="block text-xs text-suave">Custo total (custo × quantidade)</span>
            <strong className="text-lg tabular-nums">{formatarMoeda(totais.custo)}</strong>
            {totais.faltaCusto.length > 0 && (
              <span className="block text-[12px] text-amber-700">Incompleto: falta o custo de {totais.faltaCusto.join(", ")}.</span>
            )}
          </div>
          <div className="rounded border border-borda p-3">
            <span className="block text-xs text-suave">Venda total das peças avulsas (preço × quantidade)</span>
            <strong className="text-lg tabular-nums">{formatarMoeda(totais.venda)}</strong>
            {totais.faltaVenda.length > 0 && (
              <span className="block text-[12px] text-amber-700">Incompleto: falta o preço de {totais.faltaVenda.join(", ")}.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Quadro de consulta da aba Peso e dimensoes do kit: o peso e as medidas de cada peca e a sugestao para o
 * kit (peso somado; comprimento e largura da maior peca; alturas somadas). "Usar a sugestao" preenche os
 * campos de cima, que continuam editaveis.
 */
export function MedidasDoKit({ pecas, aoUsarSugestao }) {
  const sugestao = pesoEMedidasDoKit(pecas);
  if (pecas.length === 0) return null;

  const celula = (valor, unidade) => {
    const texto = formatarNumero(valor);
    return texto === null ? <span className="text-amber-700">sem dado</span> : `${texto} ${unidade}`;
  };

  return (
    <div className="mt-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Peso e medidas das peças</h3>
          <p className="text-[12px] text-suave">
            Sugestão do kit: peso somado, comprimento e largura da maior peça, alturas somadas (peças empilhadas).
          </p>
        </div>
        <button
          type="button"
          onClick={() => aoUsarSugestao(sugestao)}
          className="rounded border border-borda px-3 py-1.5 text-sm hover:bg-fundo"
        >
          Usar a sugestão nos campos
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-borda">
        <table className="w-full text-sm">
          <thead className="bg-fundo text-left text-xs font-semibold text-suave">
            <tr>
              <th className="px-3 py-2">Peça</th>
              <th className="px-3 py-2 text-right">Qtde</th>
              <th className="px-3 py-2 text-right">Peso</th>
              <th className="px-3 py-2 text-right">Comprimento</th>
              <th className="px-3 py-2 text-right">Largura</th>
              <th className="px-3 py-2 text-right">Altura</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda">
            {pecas.map((peca) => (
              <tr key={peca.componenteId}>
                <td className="px-3 py-2">
                  <LinkDaPeca peca={peca} />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{peca.quantidade}</td>
                <td className="px-3 py-2 text-right tabular-nums">{celula(peca.pesoKg, "kg")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{celula(peca.comprimentoCm, "cm")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{celula(peca.larguraCm, "cm")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{celula(peca.alturaCm, "cm")}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-borda bg-fundo font-medium">
            <tr>
              <td className="px-3 py-2" colSpan={2}>
                Sugestão para o kit
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{celula(sugestao.pesoKg, "kg")}</td>
              <td className="px-3 py-2 text-right tabular-nums">{celula(sugestao.comprimentoCm, "cm")}</td>
              <td className="px-3 py-2 text-right tabular-nums">{celula(sugestao.larguraCm, "cm")}</td>
              <td className="px-3 py-2 text-right tabular-nums">{celula(sugestao.alturaCm, "cm")}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {sugestao.incompleto.length > 0 && (
        <p className="text-[12px] text-amber-700">
          Incompleto: {sugestao.incompleto.join(", ")} sem peso ou medida. O campo que depende dela fica sem sugestão.
        </p>
      )}
    </div>
  );
}
