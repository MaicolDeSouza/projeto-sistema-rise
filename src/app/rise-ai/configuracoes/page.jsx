import { notFound } from "next/navigation";

import AbaAtendimento from "@/components/riseAi/AbaAtendimento";
import AbaCanais from "@/components/riseAi/AbaCanais";
import AbaOrcamentos from "@/components/riseAi/AbaOrcamentos";
import CartaoDeProvedor from "@/components/riseAi/CartaoDeProvedor";
import ConfiguracoesEmAbas from "@/components/riseAi/ConfiguracoesEmAbas";
import FormularioConfiguracao from "@/components/riseAi/FormularioConfiguracao";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { cotacaoDoDolar } from "@/lib/cotacaoDolar";
import { garantirCotacaoDoDia } from "@/lib/cotacaoDoDia";
import { ABAS, RECURSO_DA_ABA } from "@/lib/riseAi/abasDeConfiguracao";
import { estadoDasChaves, lerConfiguracao } from "@/lib/riseAi/configuracao";
import { MODELOS_SUGERIDOS, PROVEDORES, endpointPadrao } from "@/lib/riseAi/modelos";
import { estadoDoOrcamento } from "@/lib/riseAi/orcamento";
import { PROMPT_ATENDIMENTO_PADRAO, PROMPT_INTERNO_PADRAO } from "@/lib/riseAi/prompt";
import { versaoAnterior } from "@/lib/riseAi/versoesDePrompt";
import { sessaoDoRiseAi } from "../sessao";

export const metadata = { title: "Configurações | Rise AI" };
export const dynamic = "force-dynamic";

const ROTULOS = { modelos: "Modelos", orcamentos: "Orçamentos", canais: "Canais", atendimento: "Atendimento" };
const RECURSO_DO_PROMPT_DO_CLIENTE = "riseAi.configuracoes.promptCliente";

const comoTexto = (data) => (data ? data.toISOString() : null);
const emReais = (valor) => Number(valor).toFixed(2).replace(".", ",");
const FUSO = "America/Sao_Paulo";

/** "alterado por Maicol em 12/10 às 14:10", na hora de São Paulo (escrito aqui, no servidor: servidor e navegador não divergem). */
function notaDaVersao({ alteradoPor, alteradoEm }) {
  const dia = alteradoEm.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: FUSO });
  const hora = alteradoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: FUSO });
  return `alterado por ${alteradoPor} em ${dia} às ${hora}`;
}

/** O dólar que as contas de custo usam: o PTAX do dia ou, se o Banco Central não respondeu, a cotação fixa. */
async function textoDaCotacao() {
  const cotacao = await garantirCotacaoDoDia();
  if (cotacao.origem === "ptax") {
    const [, mes, dia] = /^\d{4}-(\d{2})-(\d{2})/.exec(cotacao.data ?? "") ?? [];
    return `PTAX${dia ? ` de ${dia}/${mes}` : ""}: R$ ${cotacao.valor.toFixed(4).replace(".", ",")}`;
  }
  return `cotação fixa de R$ ${emReais(cotacaoDoDolar().valor)}: o Banco Central não respondeu`;
}

async function versaoParaATela(canal) {
  const anterior = await versaoAnterior(canal);
  return anterior ? { texto: anterior.texto, nota: notaDaVersao(anterior) } : null;
}

/**
 * As configurações do Rise AI, em quatro abas (Modelos, Orçamentos, Canais e Atendimento). A página existe para quem tem o
 * recurso `riseAi.configuracoes`; cada aba aparece só para quem tem o recurso dela, e sem nenhuma o resultado é 404 (a
 * conferência é do servidor, e cada Salvar confere de novo). A página lê a chave só para saber SE existe e DE ONDE vem:
 * nenhuma chave, nem cifrada, chega ao navegador.
 */
export default async function ConfiguracoesPage() {
  const acesso = await exigirAcessoNaPagina("riseAi.configuracoes", "ver");
  const sessao = sessaoDoRiseAi(acesso);
  const visiveis = ABAS.filter((aba) => acesso.pode(RECURSO_DA_ABA[aba], "ver"));
  if (visiveis.length === 0) notFound();
  const podeEditar = (aba) => acesso.pode(RECURSO_DA_ABA[aba], "editar");

  const configuracao = await lerConfiguracao();
  const paineis = {};

  if (visiveis.includes("modelos")) {
    const chaves = await estadoDasChaves();
    const provedores = PROVEDORES.map((provedor) => ({
      id: provedor.id,
      rotulo: provedor.rotulo,
      precisaDeChave: provedor.precisaDeChave,
      local: provedor.local,
      enderecoFixo: !provedor.compativelOpenAI,
      endpoint: configuracao.endpoints[provedor.id],
      endpointPadrao: endpointPadrao(provedor.id, sessao.ambiente),
      habilitados: configuracao.modelosHabilitados[provedor.id] ?? [],
      sugeridos: MODELOS_SUGERIDOS[provedor.id] ?? [],
      chave: {
        cadastrada: chaves[provedor.id].cadastrada,
        origem: chaves[provedor.id].origem,
        em: comoTexto(chaves[provedor.id].em),
        ultimoTesteEm: comoTexto(chaves[provedor.id].ultimoTesteEm),
        ultimoTesteOk: chaves[provedor.id].ultimoTesteOk,
        ultimoErro: chaves[provedor.id].ultimoErro,
      },
    }));
    const escolhas = provedores.map(({ id, rotulo, habilitados }) => ({ id, rotulo, habilitados }));
    const inicial = {
      padrao: configuracao.padrao,
      reserva: configuracao.reserva,
      numeros: {
        primeiroTokenMs: configuracao.tempoLimite.primeiroTokenMs,
        totalMs: configuracao.tempoLimite.totalMs,
        maxChamadasDeFerramenta: configuracao.maxChamadasDeFerramenta,
        maxTokensResposta: configuracao.maxTokensResposta,
        contextoMaxTokens: configuracao.contextoMaxTokens,
        taxaPorUsuarioPorMinuto: configuracao.taxaPorUsuarioPorMinuto,
      },
    };
    paineis.modelos = (
      <div className="flex flex-col gap-6">
        <FormularioConfiguracao inicial={inicial} provedores={escolhas} podeEditar={podeEditar("modelos")} />
        <section className="flex flex-col gap-3 border-t border-borda pt-5">
          <h2 className="text-base font-semibold">Provedores</h2>
          <fieldset disabled={!podeEditar("modelos")} title={podeEditar("modelos") ? undefined : "Você pode ver esta aba, mas não alterá-la. Peça a um administrador."} className="grid min-w-0 gap-4 xl:grid-cols-2">
            {provedores.map((provedor) => (
              <CartaoDeProvedor key={provedor.id} provedor={provedor} />
            ))}
          </fieldset>
        </section>
      </div>
    );
  }

  if (visiveis.includes("orcamentos")) {
    const [clientes, interno, cotacao] = await Promise.all([
      estadoDoOrcamento("CLIENTES", { config: configuracao }),
      estadoDoOrcamento("INTERNO", { config: configuracao }),
      textoDaCotacao(),
    ]);
    paineis.orcamentos = (
      <AbaOrcamentos
        podeEditar={podeEditar("orcamentos")}
        inicial={{ clientes: emReais(configuracao.orcamentos.clientesBrl), interno: emReais(configuracao.orcamentos.internoBrl) }}
        estados={{ clientes, interno }}
        cotacao={cotacao}
      />
    );
  }

  if (visiveis.includes("canais")) {
    paineis.canais = <AbaCanais podeEditar={podeEditar("canais")} internet={Boolean(configuracao.internet)} />;
  }

  if (visiveis.includes("atendimento")) {
    const podePromptCliente = acesso.pode(RECURSO_DO_PROMPT_DO_CLIENTE, "editar");
    const [anteriorInterno, anteriorCliente] = await Promise.all([versaoParaATela("interno"), podePromptCliente ? versaoParaATela("cliente") : null]);
    paineis.atendimento = (
      <AbaAtendimento
        podeEditar={podeEditar("atendimento")}
        podePromptCliente={podePromptCliente}
        interno={{ texto: configuracao.prompts.interno ?? PROMPT_INTERNO_PADRAO, padrao: PROMPT_INTERNO_PADRAO, anterior: anteriorInterno }}
        cliente={podePromptCliente ? { texto: configuracao.prompts.atendimento ?? PROMPT_ATENDIMENTO_PADRAO, padrao: PROMPT_ATENDIMENTO_PADRAO, anterior: anteriorCliente } : null}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <h1 className="text-lg font-semibold">Configurações do Rise AI</h1>
      <ConfiguracoesEmAbas abas={visiveis.map((id) => ({ id, rotulo: ROTULOS[id] }))} paineis={paineis} />
    </div>
  );
}
