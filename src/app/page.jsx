import Link from "next/link";
import { CircleAlert, CircleCheck, Lock, Megaphone, Package } from "lucide-react";

import { blocos } from "@/lib/blocos";
import { prisma } from "@/lib/db";
import { haAdministrador } from "@/lib/acessos/banco";
import { avisoDoPainel, cartoesDoPainel } from "@/lib/acessos/painel";
import { blocosOcultos } from "@/lib/acessos/resolucao";
import { sessaoDeAcessos } from "@/lib/acessos/servidor";
import PageHeader from "@/components/ui/PageHeader";
import Card, { CardIndicador } from "@/components/ui/Card";
import AvisoBanco from "@/components/ui/AvisoBanco";
import EmptyState from "@/components/ui/EmptyState";

// Painel de operacao: sempre le o estado atual do banco, nunca uma versao
// pre-renderizada na hora do build.
export const dynamic = "force-dynamic";

/** So conta o que a pessoa ve: o numero de um cartao escondido nao sai do servidor (spec de Acessos, §4). */
async function carregarIndicadores(cartoes) {
  const contar = (ligado, consulta) => (ligado ? consulta() : Promise.resolve(null));
  const [produtos, produtosAtivos, publicados, comErro] = await Promise.all([
    contar(cartoes.produtos, () => prisma.produto.count()),
    contar(cartoes.produtos, () => prisma.produto.count({ where: { ativo: true } })),
    contar(cartoes.anunciosPublicados, () => prisma.anuncio.count({ where: { status: "PUBLICADO" } })),
    contar(cartoes.anunciosComErro, () => prisma.anuncio.count({ where: { status: "ERRO" } })),
  ]);

  return { produtos, produtosAtivos, publicados, comErro };
}

export default async function PainelPage() {
  // O Painel e de todos (decisao do dono): nunca da 404; mostra so os cartoes liberados e, sem nenhum, o aviso.
  const acesso = await sessaoDeAcessos();
  const cartoes = cartoesDoPainel(acesso.pode);
  const ocultos = blocosOcultos(acesso.permissoes, blocos.map((bloco) => bloco.href));
  const outrosBlocos = blocos.filter((bloco) => bloco.href !== "/" && !ocultos.includes(bloco.href));

  if (!cartoes.algum || acesso.estado === "erro-banco") {
    const aviso = avisoDoPainel({
      estado: acesso.estado,
      semAdministrador: acesso.ambiente === "vps" && acesso.estado !== "erro-banco" && !(await haAdministrador()),
    });
    return (
      <>
        <PageHeader titulo="Painel" descricao="Visão geral da operação da loja." />
        <EmptyState icone={Lock} titulo={aviso.tom === "erro" ? <span className="text-red-700">{aviso.texto}</span> : aviso.texto} />
      </>
    );
  }

  let indicadores = null;
  let erro = null;

  try {
    indicadores = await carregarIndicadores(cartoes);
  } catch (excecao) {
    erro = excecao;
  }

  const temIndicador = cartoes.produtos || cartoes.anunciosPublicados || cartoes.anunciosComErro || cartoes.blocos;

  return (
    <>
      <PageHeader
        titulo="Painel"
        descricao="Visão geral da operação da loja."
      />

      {erro ? (
        <AvisoBanco erro={erro} />
      ) : (
        temIndicador && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cartoes.produtos && (
              <CardIndicador
                rotulo="Produtos cadastrados"
                valor={indicadores.produtos}
                detalhe={`${indicadores.produtosAtivos} ativos`}
                icone={Package}
              />
            )}
            {cartoes.anunciosPublicados && (
              <CardIndicador
                rotulo="Anúncios publicados"
                valor={indicadores.publicados}
                detalhe="Mercado Livre + Loja Integrada"
                icone={CircleCheck}
              />
            )}
            {cartoes.anunciosComErro && (
              <CardIndicador
                rotulo="Anúncios com erro"
                valor={indicadores.comErro}
                detalhe="Precisam de nova tentativa"
                icone={CircleAlert}
              />
            )}
            {cartoes.blocos && (
              <CardIndicador
                rotulo="Blocos disponíveis"
                valor={blocos.filter((bloco) => bloco.pronto).length}
                detalhe={`de ${blocos.length} previstos`}
                icone={Megaphone}
              />
            )}
          </div>
        )
      )}

      {cartoes.blocos && outrosBlocos.length > 0 && (
        <>
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
      )}
    </>
  );
}
