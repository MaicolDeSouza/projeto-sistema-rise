import Link from "next/link";
import { CircleAlert, CircleCheck, Megaphone, Package } from "lucide-react";

import { blocos } from "@/lib/blocos";
import { prisma } from "@/lib/db";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardIndicador } from "@/components/ui/Card";
import AvisoBanco from "@/components/ui/AvisoBanco";

// Painel de operacao: sempre le o estado atual do banco, nunca uma versao
// pre-renderizada na hora do build.
export const dynamic = "force-dynamic";

async function carregarIndicadores() {
  const [produtos, produtosAtivos, publicados, comErro] = await Promise.all([
    prisma.produto.count(),
    prisma.produto.count({ where: { ativo: true } }),
    prisma.anuncio.count({ where: { status: "PUBLICADO" } }),
    prisma.anuncio.count({ where: { status: "ERRO" } }),
  ]);

  return { produtos, produtosAtivos, publicados, comErro };
}

export default async function PainelPage() {
  let indicadores = null;
  let erro = null;

  try {
    indicadores = await carregarIndicadores();
  } catch (excecao) {
    erro = excecao;
  }

  const outrosBlocos = blocos.filter((bloco) => bloco.href !== "/");

  return (
    <>
      <PageHeader
        titulo="Painel"
        descricao="Visão geral da operação da loja."
      />

      {erro ? (
        <AvisoBanco erro={erro} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <CardIndicador
            rotulo="Produtos cadastrados"
            valor={indicadores.produtos}
            detalhe={`${indicadores.produtosAtivos} ativos`}
            icone={Package}
          />
          <CardIndicador
            rotulo="Anúncios publicados"
            valor={indicadores.publicados}
            detalhe="Mercado Livre + Loja Integrada"
            icone={CircleCheck}
          />
          <CardIndicador
            rotulo="Anúncios com erro"
            valor={indicadores.comErro}
            detalhe="Precisam de nova tentativa"
            icone={CircleAlert}
          />
          <CardIndicador
            rotulo="Blocos disponíveis"
            valor={blocos.filter((bloco) => bloco.pronto).length}
            detalhe={`de ${blocos.length} previstos`}
            icone={Megaphone}
          />
        </div>
      )}

      <h2 className="mt-10 mb-4 text-sm font-semibold tracking-wide text-suave uppercase">
        Blocos do sistema
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {outrosBlocos.map((bloco) => {
          const Icone = bloco.icone;
          return (
            <Link key={bloco.href} href={bloco.href} className="group">
              <Card className="h-full transition-colors group-hover:border-acento">
                <div className="flex items-start gap-3">
                  <span className="rounded-md bg-fundo p-2 text-acento">
                    <Icone size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">{bloco.rotulo}</p>
                    <p className="mt-1 text-sm text-suave">{bloco.resumo}</p>
                    {!bloco.pronto && (
                      <p className="mt-2 text-xs text-suave/80">Em construção</p>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
