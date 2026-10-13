import CartaoDeProvedor from "@/components/riseAi/CartaoDeProvedor";
import FormularioConfiguracao from "@/components/riseAi/FormularioConfiguracao";
import { estadoDasChaves, lerConfiguracao } from "@/lib/riseAi/configuracao";
import { MODELOS_SUGERIDOS, PROVEDORES, endpointPadrao } from "@/lib/riseAi/modelos";
import { PROMPT_ATENDIMENTO_PADRAO } from "@/lib/riseAi/prompt";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";
import { sessaoDoRiseAi } from "../sessao";

export const metadata = { title: "Configurações | Rise AI" };
export const dynamic = "force-dynamic";

const comoTexto = (data) => (data ? data.toISOString() : null);

/**
 * As configurações do Rise AI, só para quem tem o recurso em Acessos (os demais têm 404; a conferência é do servidor). A página
 * lê a chave só para saber SE existe e DE ONDE vem: nenhuma chave, nem cifrada, chega ao navegador.
 */
export default async function ConfiguracoesPage() {
  const sessao = sessaoDoRiseAi(await exigirAcessoNaPagina("riseAi.configuracoes", "ver"));

  const [configuracao, chaves] = await Promise.all([lerConfiguracao(), estadoDasChaves()]);
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
    prompt: configuracao.prompts.atendimento ?? PROMPT_ATENDIMENTO_PADRAO,
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div>
        <h1 className="text-lg font-semibold">Configurações do Rise AI</h1>
        <p className="mt-1 text-sm text-suave">Os provedores de IA, qual deles responde e como.</p>
      </div>
      <FormularioConfiguracao inicial={inicial} provedores={escolhas} promptPadrao={PROMPT_ATENDIMENTO_PADRAO} />
      <div className="grid gap-4 xl:grid-cols-2">
        {provedores.map((provedor) => (
          <CartaoDeProvedor key={provedor.id} provedor={provedor} />
        ))}
      </div>
    </div>
  );
}
