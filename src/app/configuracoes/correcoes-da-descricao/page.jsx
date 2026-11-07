import CorrecoesDaDescricao from "@/components/configuracoes/CorrecoesDaDescricao";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { avisoDoTeto } from "@/lib/ia/correcoes";
import { listarCorrecoes } from "@/lib/ia/correcoesBanco";
import { listarPromptsDaDescricao } from "@/lib/ia/promptsDescricao";

export const metadata = { title: "Correções da descrição | Sistema Rise" };
export const dynamic = "force-dynamic";

/**
 * Configuracoes › Correcoes da descricao (spec 2026-11-07). Linha-guia: o dono ve primeiro a lista do que o Rise corrige
 * em toda descricao; a acao principal e "Nova correcao". Quem ve o cadastro de Produtos le; quem edita muda. A busca vem
 * da URL (`?q=`).
 */
export default async function CorrecoesDaDescricaoPage({ searchParams }) {
  const acesso = await exigirAcessoNaPagina("tela.produtos.cadastro", "ver");
  const params = await searchParams;
  const busca = typeof params.q === "string" ? params.q : "";
  const [correcoes, ativas, prompts] = await Promise.all([listarCorrecoes({ busca }), listarCorrecoes({ ativas: true }), listarPromptsDaDescricao()]);

  return (
    <CorrecoesDaDescricao
      busca={busca}
      podeEditar={acesso.pode("tela.produtos.cadastro", "editar")}
      // O teto e por geracao (as de todas mais as do prompt); somar todas as ligadas avisa antes, nunca depois.
      aviso={avisoDoTeto(ativas)}
      prompts={prompts.map((prompt) => prompt.nome)}
      correcoes={correcoes.map((correcao) => ({
        id: correcao.id,
        tipo: correcao.tipo,
        errado: correcao.errado,
        certo: correcao.certo,
        explicacao: correcao.explicacao,
        promptNome: correcao.promptNome,
        ativa: correcao.ativa,
        origem: correcao.origem,
        produtoSku: correcao.produtoSku,
        usos: correcao.usos,
        criadoPor: correcao.criadoPor,
        criadoEm: correcao.criadoEm.toISOString(),
      }))}
    />
  );
}
