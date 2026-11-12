import Link from "next/link";

import AbaCaixinhas from "@/components/estoque3d/AbaCaixinhas";
import AbaColunas from "@/components/estoque3d/AbaColunas";
import MapaDoEstoque from "@/components/estoque3d/MapaDoEstoque";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { lerMapa } from "@/lib/estoque3d/banco";

export const metadata = { title: "Mapa do estoque | Sistema Rise" };
export const dynamic = "force-dynamic";

const ABAS = [
  ["mapa", "Mapa"],
  ["colunas", "Colunas"],
  ["caixinhas", "Caixinhas"],
];

/**
 * Mapa do estoque (spec 2026-11-12-enderecamento-de-estoque-design.md): as prateleiras e as caixinhas dos tres estoques.
 * O lugar de cada produto e a Localizacao do cadastro; por isso quem nao ve a localizacao nao ve o mapa.
 */
export default async function MapaPage({ searchParams }) {
  const acesso = await exigirAcessoNaPagina("tela.estoque.mapa", "ver");
  const params = await searchParams;
  const aba = ABAS.some(([id]) => id === params?.aba) ? params.aba : "mapa";
  const podeEditar = acesso.pode("tela.estoque.mapa", "editar");
  const veLocalizacao = acesso.pode("dado.localizacao", "ver");
  const dados = veLocalizacao ? await lerMapa() : null;

  return (
    <>
      <PageHeader
        titulo="Mapa do estoque"
        descricao="As prateleiras e as caixinhas de cada estoque."
        voltarPara="/estoque"
        voltarRotulo="Voltar a Estoque"
        somenteLeitura={podeEditar ? null : "Você pode ver o mapa, mas não editar colunas nem caixinhas."}
      />
      {!dados ? (
        <p className="rounded-lg border border-borda bg-superficie px-6 py-10 text-center text-sm text-suave">Sem permissão para ver a localização dos produtos.</p>
      ) : (
        <>
          <nav aria-label="Abas do mapa" className="mb-4 flex gap-1 border-b border-borda">
            {ABAS.map(([id, rotulo]) => (
              <Link
                key={id}
                href={id === "mapa" ? "/estoque/mapa" : `/estoque/mapa?aba=${id}`}
                aria-current={aba === id ? "page" : undefined}
                className={`-mb-px border-b-2 px-4 py-2 text-sm ${aba === id ? "border-acento font-medium text-texto" : "border-transparent text-suave hover:text-texto"}`}
              >
                {rotulo}
                {id === "colunas" && dados.mapa.semColuna.length > 0 && <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-amber-400" title="Há letras na Localização sem coluna cadastrada." />}
              </Link>
            ))}
          </nav>
          {aba === "mapa" && <MapaDoEstoque mapa={dados.mapa} />}
          {aba === "colunas" && <AbaColunas locais={dados.locais} colunas={dados.colunas} semColuna={dados.mapa.semColuna} podeEditar={podeEditar} />}
          {aba === "caixinhas" && <AbaCaixinhas modelos={dados.modelos} podeEditar={podeEditar} />}
        </>
      )}
    </>
  );
}
