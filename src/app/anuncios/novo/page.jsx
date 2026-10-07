import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";

import { canais } from "@/lib/anuncios/canais";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";

export const dynamic = "force-dynamic";

const CAMPOS = [
  { nome: "sku", rotulo: "SKU", ajuda: "Código único. É ele que liga o produto aos canais." },
  { nome: "ean", rotulo: "EAN / GTIN" },
  { nome: "marca", rotulo: "Marca" },
  { nome: "modelo", rotulo: "Modelo" },
  { nome: "tituloBase", rotulo: "Título base", largo: true },
  { nome: "descricaoBase", rotulo: "Descrição base", largo: true, area: true },
  { nome: "custo", rotulo: "Custo" },
  { nome: "precoVenda", rotulo: "Preço de venda" },
  { nome: "estoque", rotulo: "Estoque" },
  { nome: "garantiaMeses", rotulo: "Garantia (meses)" },
];

export default function NovoAnuncioPage() {
  return (
    <>
      <Link
        href="/anuncios"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-suave hover:text-texto"
      >
        <ArrowLeft size={15} />
        Voltar para anúncios
      </Link>

      <PageHeader
        titulo="Novo anúncio"
        descricao="Cadastre o produto uma vez e escolha em quais canais ele deve ser publicado."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold">Dados do produto</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {CAMPOS.map((campo) => (
              <div key={campo.nome} className={campo.largo ? "sm:col-span-2" : ""}>
                <label className="block text-xs font-medium">{campo.rotulo}</label>
                {campo.area ? (
                  <textarea
                    rows={3}
                    disabled
                    className="mt-1 w-full rounded border border-borda bg-fundo px-2 py-1.5 text-sm"
                  />
                ) : (
                  <input
                    type="text"
                    disabled
                    className="mt-1 w-full rounded border border-borda bg-fundo px-2 py-1.5 text-sm"
                  />
                )}
                {campo.ajuda && (
                  <p className="mt-1 text-[11px] text-suave">{campo.ajuda}</p>
                )}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-semibold">Canais</h2>
          <p className="mb-4 text-xs text-suave">
            O Bling é obrigatório: sem o produto no ERP os marketplaces não têm
            onde gravar o código de retorno que liga os dois lados.
          </p>

          <div className="space-y-3">
            {canais.map((canal) => (
              <label
                key={canal.id}
                className={`flex items-start gap-2 rounded border border-borda p-2.5 ${
                  canal.disponivel ? "" : "opacity-60"
                }`}
              >
                <input
                  type="checkbox"
                  defaultChecked={canal.obrigatorio}
                  disabled
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {canal.nome}
                    {canal.obrigatorio && <Lock size={11} className="text-suave" />}
                  </span>
                  <span className="block text-xs text-suave">{canal.resumo}</span>
                  {!canal.disponivel && (
                    <span className="mt-1 block text-[11px] text-suave">
                      {canal.motivoIndisponivel}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>

          <button
            type="button"
            disabled
            title="Disponível na próxima etapa, quando a publicação for ligada"
            className="mt-4 w-full cursor-not-allowed rounded border border-borda px-3 py-2 text-sm text-suave opacity-60"
          >
            Salvar e validar
          </button>
          <p className="mt-2 text-[11px] text-suave">
            O cadastro entra em funcionamento na próxima etapa, junto com a
            publicação.
          </p>
        </Card>
      </div>
    </>
  );
}
