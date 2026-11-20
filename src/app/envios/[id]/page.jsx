import Link from "next/link";
import { notFound } from "next/navigation";

import PainelDoEnvio from "@/components/frete/PainelDoEnvio";
import { Secao } from "@/components/pedidos/AbaGeral";
import { SetaParaLista } from "@/components/ui/ListaLembrada";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { linkDoWhatsappDoEnvio } from "@/lib/frete/aviso";
import { listarCaixas } from "@/lib/frete/caixas";
import { lerConfigDeFrete } from "@/lib/frete/configuracao";
import { envioParaATela, lerEnvio } from "@/lib/frete/envios";
import { numeroDoEnvio } from "@/lib/frete/regras";
import { config } from "@/lib/integracoes/config";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const envio = await lerEnvio(id).catch(() => null);
  return { title: envio ? `${numeroDoEnvio(envio.numero)} | Sistema Rise` : "Envio | Sistema Rise" };
}

/**
 * Um envio do Rise (modulo de frete, fase 2). Linha-guia: o operador ve primeiro em que passo o envio esta; a acao
 * principal e o proximo passo (comprar, imprimir, avisar). Quem recebe aparece com o endereco so para quem ve dado pessoal.
 */
export default async function EnvioPage({ params }) {
  const acesso = await exigirAcessoNaPagina("tela.envios", "ver");
  const { id } = await params;
  const envio = await lerEnvio(id);
  if (!envio) notFound();
  const [caixas, configDeFrete] = await Promise.all([listarCaixas({ soAtivas: true }), lerConfigDeFrete()]);
  const vePessoal = acesso.pode("dado.pessoalDoCliente", "ver");
  const parte = envio.direcao === "REVERSO" ? envio.remetente : envio.destinatario;
  const endereco = parte?.endereco ?? {};
  const naTela = JSON.parse(JSON.stringify({ ...envioParaATela(envio), custo: acesso.pode("dado.custo", "ver") ? envio.custo : null }));

  return (
    <>
      <PageHeader
        voltar={<SetaParaLista caminho="/envios" rotulo="Voltar aos envios" />}
        titulo={numeroDoEnvio(envio.numero)}
        descricao={
          envio.pedidoDeVenda ? (
            <Link href={`/pedidos/${envio.pedidoDeVenda.id}?aba=envio`} className="hover:text-acento hover:underline">
              Pedido {envio.pedidoDeVenda.numero}
            </Link>
          ) : (
            "Envio avulso"
          )
        }
      />
      <div className="grid gap-x-10 gap-y-7 rounded-lg border border-borda bg-superficie p-5 md:grid-cols-2">
        <Secao titulo="Envio">
          <PainelDoEnvio
            envio={naTela}
            caixas={JSON.parse(JSON.stringify(caixas))}
            travaLiberada={Boolean(config.travas.freteCompra)}
            pode={{ cotar: false, comprar: acesso.pode("acao.envios.comprarEtiqueta", "executar"), avisar: acesso.pode("acao.envios.avisarCliente", "executar") }}
            whatsapp={linkDoWhatsappDoEnvio(envio, envio.pedidoDeVenda, configDeFrete)}
            temEmail={Boolean(envio.destinatario?.email)}
            chaveDaNota={envio.pedidoDeVenda?.nf?.chave ?? null}
          />
        </Secao>
        <Secao titulo={envio.direcao === "REVERSO" ? "Quem envia" : "Quem recebe"}>
          <p className="font-medium">{parte?.nome ?? "—"}</p>
          {vePessoal ? (
            <address className="mt-1 text-sm leading-relaxed text-suave not-italic">
              {[endereco.logradouro, endereco.numero].filter(Boolean).join(", ")}
              {endereco.complemento ? ` · ${endereco.complemento}` : ""}
              <span className="block">
                {[endereco.bairro, endereco.cidade && `${endereco.cidade}${endereco.uf ? ` - ${endereco.uf}` : ""}`].filter(Boolean).join(" · ")}
              </span>
              {endereco.cep && <span className="block tabular-nums">CEP {String(endereco.cep).replace(/(\d{5})(\d{3})/, "$1-$2")}</span>}
              {parte?.email && <span className="block">{parte.email}</span>}
            </address>
          ) : (
            <p className="mt-1 text-sm text-suave">{endereco.cidade ? `${endereco.cidade}${endereco.uf ? ` - ${endereco.uf}` : ""}` : ""}</p>
          )}
          {Array.isArray(envio.itensDaDeclaracao) && envio.itensDaDeclaracao.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm">
              {envio.itensDaDeclaracao.map((item, indice) => (
                <li key={indice} className="flex justify-between gap-4">
                  <span className="truncate">
                    {item.quantidade} × {item.descricao}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>
    </>
  );
}
