import CartaoDeAtalho from "@/components/ui/CartaoDeAtalho";
import PageHeader from "@/components/ui/PageHeader";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { CARTOES_DE_CONFIGURACOES } from "@/lib/configuracoes/catalogo";
import { detalheDeIntegracoes, detalheDeUsuarios, detalheDoRiseAi } from "@/lib/configuracoes/detalhes";
import { prisma } from "@/lib/db";
import { listarConexoes } from "@/lib/integracoes/conexoes";
import { conectores } from "@/lib/integracoes/registro";
import { lerConfiguracao } from "@/lib/riseAi/configuracao";
import { PROVEDORES } from "@/lib/riseAi/modelos";

export const metadata = { title: "Configurações | Sistema Rise" };
// O detalhe de cada cartao e vivo (quantos usuarios, a situacao das conexoes): nada montado no build.
export const dynamic = "force-dynamic";

/** Le so o detalhe dos cartoes que a pessoa ve; um detalhe que falha nao derruba a pagina (o cartao fica sem ele). */
async function detalhe(href) {
  try {
    if (href === "/configuracoes/usuarios") {
      const [usuarios, funcoes] = await Promise.all([prisma.usuarioRise.count({ where: { ativo: true } }), prisma.funcaoRise.count()]);
      return detalheDeUsuarios({ usuarios, funcoes });
    }
    if (href === "/integracoes") return detalheDeIntegracoes(conectores, await listarConexoes());
    if (href === "/rise-ai/configuracoes") return detalheDoRiseAi((await lerConfiguracao()).padrao, PROVEDORES);
  } catch (erro) {
    console.error(`[configuracoes] detalhe de ${href} não lido:`, erro?.message ?? erro);
  }
  return undefined;
}

/**
 * O bloco Configuracoes (spec de Acessos, §5.2): uma grade de cartoes, como Ferramentas e Cadastros. Linha-guia: o
 * operador ve primeiro os cartoes que pode abrir; a acao principal e abrir um. Sem a tela de entrada em Acessos, 404.
 */
export default async function ConfiguracoesPage() {
  const acesso = await exigirAcessoNaPagina("tela.configuracoes", "ver");
  const cartoes = CARTOES_DE_CONFIGURACOES.filter((cartao) => acesso.pode(cartao.recurso, "ver"));
  const detalhes = await Promise.all(cartoes.map((cartao) => detalhe(cartao.href)));

  return (
    <>
      <PageHeader titulo="Configurações" descricao="Usuários, integrações e o Rise AI." />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cartoes.map((cartao, indice) => (
          <CartaoDeAtalho
            key={cartao.href}
            href={cartao.href}
            icone={cartao.icone}
            titulo={cartao.rotulo}
            descricao={cartao.resumo}
            detalhe={detalhes[indice]}
          />
        ))}
      </div>
    </>
  );
}
