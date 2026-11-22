import Link from "next/link";
import { Plus } from "lucide-react";

import TabelaDeEnvios from "@/components/frete/TabelaDeEnvios";
import NavegacaoDoTopo from "@/components/mercados/NavegacaoDoTopo";
import Paginacao from "@/components/mercados/Paginacao";
import CampoBusca from "@/components/ui/CampoBusca";
import { LembrarLista } from "@/components/ui/ListaLembrada";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { COLUNAS_DOS_ENVIOS, listarEnvios } from "@/lib/frete/envios";
import { obterProvedor, PROVEDOR_PADRAO } from "@/lib/frete/provedores/registro";
import { SITUACAO_DO_ENVIO } from "@/lib/frete/regras";
import { config } from "@/lib/integracoes/config";
import { porPaginaDaUrl } from "@/lib/porPagina";
import { formatoDeMoeda } from "@/lib/dinheiro";

export const metadata = { title: "Envios | Sistema Rise" };
export const dynamic = "force-dynamic";

const moeda = formatoDeMoeda();

/** O saldo da carteira, discreto no topo; sem resposta do provedor, some (a lista abre igual). */
async function saldoDaCarteira() {
  try {
    return (await obterProvedor(PROVEDOR_PADRAO).saldo()).saldo;
  } catch {
    return null;
  }
}

/**
 * Envios (modulo de frete, fase 2). Nesta tela o operador ve primeiro o que esta a postar e o que deu problema; a acao
 * principal e "Novo envio" (avulso: garantia, troca, amostra).
 */
export default async function EnviosPage({ searchParams }) {
  const acesso = await exigirAcessoNaPagina("tela.envios", "ver");
  const params = await searchParams;
  const status = [params?.status ?? []].flat().filter((valor) => SITUACAO_DO_ENVIO[valor]);
  const busca = typeof params?.q === "string" ? params.q : "";
  const paginaPedida = Math.max(1, Number.parseInt(params?.pagina, 10) || 1);
  const POR_PAGINA = porPaginaDaUrl(params?.por);
  const ordenar = COLUNAS_DOS_ENVIOS.includes(params?.ordenar) ? params.ordenar : null;
  const sentido = params?.direcao === "asc" ? "asc" : "desc";
  const veCusto = acesso.pode("dado.custo", "ver");

  const [{ linhas, total, contagemPorStatus }, saldo] = await Promise.all([
    listarEnvios({ status, busca, ordenar: veCusto || ordenar !== "custo" ? ordenar : null, sentido, pagina: paginaPedida, por: POR_PAGINA }),
    saldoDaCarteira(),
  ]);
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const pagina = Math.min(paginaPedida, totalPaginas);
  // O custo e dado sensivel (regra do pedido): sai no servidor para quem nao o ve.
  const linhasNaTela = veCusto ? linhas : linhas.map((linha) => ({ ...linha, custo: null }));
  const podeComprar = acesso.pode("acao.envios.comprarEtiqueta", "executar");

  return (
    <>
      <LembrarLista caminho="/envios" />
      <PageHeader
        titulo="Envios"
        descricao={total === 1 ? "1 envio." : `${total} envios.`}
        acao={
          <div className="flex items-center gap-4">
            {saldo !== null && veCusto && (
              <a
                href={`${config.melhorEnvio.urlBase.replace(/\/+$/, "")}/painel`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-suave hover:text-acento"
                title="Saldo da carteira do Melhor Envio (recarregar no painel)"
              >
                Saldo <span className="font-medium tabular-nums text-texto">{moeda.format(saldo)}</span>
              </a>
            )}
            {podeComprar && (
              <Link
                href="/envios/novo"
                className="inline-flex items-center gap-1.5 rounded-md bg-acento px-3.5 py-2 text-sm font-semibold text-white hover:bg-acento/90"
              >
                <Plus size={16} /> Novo envio
              </Link>
            )}
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <CampoBusca valorInicial={busca} rotulo="Buscar por número, rastreio, destinatário ou pedido" className="w-full max-w-sm" />
        <NavegacaoDoTopo pagina={pagina} totalPaginas={totalPaginas} total={total} porPagina={POR_PAGINA} />
      </div>
      <TabelaDeEnvios linhas={linhasNaTela} status={status} contagem={contagemPorStatus} veCusto={veCusto} />
      {totalPaginas > 1 && (
        <div className="mt-4">
          <Paginacao pagina={pagina} totalPaginas={totalPaginas} total={total} primeiro={(pagina - 1) * POR_PAGINA + 1} ultimo={Math.min(pagina * POR_PAGINA, total)} />
        </div>
      )}
    </>
  );
}
