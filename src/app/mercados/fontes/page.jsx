import Link from "next/link";
import { ArrowLeft, Store } from "lucide-react";

import { prisma } from "@/lib/db";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import AvisoBanco from "@/components/ui/AvisoBanco";
import FormularioFonte from "@/components/mercados/FormularioFonte";
import LinhaFonte from "@/components/mercados/LinhaFonte";
import AbasDeFontes from "@/components/mercados/AbasDeFontes";

export const dynamic = "force-dynamic";

export default async function FontesPage({ searchParams }) {
  const params = await searchParams;

  // Fornecedor e a aba padrao: e a que tem rotina manual — alguem precisa
  // baixar a lista e enviar. Concorrente se varre sozinho, e so se olha quando
  // ha duvida.
  const aba = params?.tipo === "CONCORRENTE" ? "CONCORRENTE" : "FORNECEDOR";

  let fontes = null;
  let erro = null;

  try {
    fontes = await prisma.fonteColeta.findMany({
      orderBy: [{ ativa: "desc" }, { nome: "asc" }],
    });
  } catch (excecao) {
    erro = excecao;
  }

  const linhas = (fontes ?? []).map((fonte) => ({
    id: fonte.id,
    nome: fonte.nome,
    dominio: fonte.dominio,
    prefixoUrl: fonte.prefixoUrl,
    tipo: fonte.tipo,
    ativa: fonte.ativa,
    robotsPermite: fonte.robotsPermite,
    ultimaVarreduraEm: fonte.ultimaVarreduraEm,
    // Quantos a loja tem, e quantos ja pegamos. Os dois juntos: um sozinho
    // nao responde se a coleta esta perto do fim ou mal comecou.
    produtosNoSite: fonte.produtosNoSite,
    produtosNoSiteParcial: fonte.produtosNoSiteParcial,
    instrucoes: fonte.instrucoes,
    // A lista guardada. So do fornecedor: concorrente tem vitrine e nao manda
    // arquivo.
    manifesto:
      fonte.tipo === "FORNECEDOR" && fonte.listaArquivos
        ? { arquivos: fonte.listaArquivos, enviadoEm: fonte.listaEnviadaEm }
        : null,
    // A ULTIMA COLETA GRAVADA: quantos produtos vieram nela, quando e quanto
    // demorou. A data da lista so acompanha quando a coleta veio DELA — numa
    // varredura de site, "lista de 01/09" apareceria ao lado de uma data que
    // nada tem a ver com a lista.
    coleta: fonte.ultimaColetaEm
      ? {
          total: fonte.ultimaColetaTotal,
          coletadoEm: fonte.ultimaColetaEm,
          duracaoMs: fonte.ultimaColetaDuracaoMs,
          listaEnviadaEm:
            fonte.ultimaColetaOrigem === "arquivo" ? fonte.listaEnviadaEm : null,
        }
      : null,
  }));

  // A tabela mostra so o tipo da aba. "OUTRO" cai com os concorrentes: nao tem
  // lista para enviar, e a rotina dele e a mesma — varrer o site.
  const daAba = linhas.filter((fonte) =>
    aba === "FORNECEDOR" ? fonte.tipo === "FORNECEDOR" : fonte.tipo !== "FORNECEDOR",
  );

  return (
    <>
      <Link
        href="/mercados"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-suave hover:text-texto"
      >
        <ArrowLeft size={15} />
        Voltar para Mercados
      </Link>

      <PageHeader
        titulo="Fontes acompanhadas"
        descricao="Concorrentes e fornecedores. Cada fonte e testada antes de ser cadastrada."
      />

      {erro && <AvisoBanco erro={erro} />}

      {!erro && (
        <>
          <FormularioFonte tipoInicial={aba} />

          {linhas.length > 0 && (
            <AbasDeFontes
              ativa={aba}
              quantos={{
                FORNECEDOR: linhas.filter((f) => f.tipo === "FORNECEDOR").length,
                CONCORRENTE: linhas.filter((f) => f.tipo !== "FORNECEDOR").length,
              }}
            />
          )}

          {linhas.length === 0 ? (
            <EmptyState
              icone={Store}
              titulo="Nenhuma fonte cadastrada"
              descricao="Cole o endereco de um concorrente ou fornecedor no campo acima para comecar."
            />
          ) : daAba.length === 0 ? (
            <EmptyState
              icone={Store}
              titulo={
                aba === "FORNECEDOR"
                  ? "Nenhum fornecedor cadastrado"
                  : "Nenhum concorrente cadastrado"
              }
              descricao="Cadastre um no campo acima, ou veja a outra aba."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
              <table className="w-full text-sm">
                <thead className="border-b border-borda bg-fundo text-left text-xs tracking-wide text-suave uppercase">
                  <tr className="divide-x divide-borda">
                    <th className="px-3 py-2.5 font-medium">Loja</th>
                    <th className="px-3 py-2.5 font-medium">Situacao</th>
                    {/*
                      "no site" sozinho mentia na aba de fornecedor: o catalogo
                      da Fortek e da Nightech vem da LISTA que eles mandam, nao
                      de vitrine — e onde o fornecedor tem os dois, o numero e a
                      soma sem repetir o que aparece nos dois lugares.
                    */}
                    <th className="px-3 py-2.5 text-right font-medium">
                      {aba === "FORNECEDOR" ? "Produtos no site/arquivo" : "Produtos no site"}
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      Produtos atualizados
                    </th>
                    <th className="px-3 py-2.5 font-medium">Ultima varredura</th>
                    {aba === "FORNECEDOR" && (
                      <th className="px-3 py-2.5 font-medium">Lista do fornecedor</th>
                    )}
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-borda">
                  {daAba.map((fonte) => (
                    <LinhaFonte key={fonte.id} fonte={fonte} mostrarLista={aba === "FORNECEDOR"} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
