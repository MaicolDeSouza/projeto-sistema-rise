import { z } from "zod";

import { prisma } from "@/lib/db";
import { lerSegredo, salvarConexao } from "@/lib/integracoes/conexoes";
import { ambienteDoRise } from "@/lib/sessao";
import { PROVEDORES, endpointPadrao } from "./modelos";

/**
 * Configuração do Rise AI: padrão de fábrica, o que o administrador salvou e as chaves dos provedores.
 *
 * O que é salvo mora na linha `unica` de `ConfiguracaoIA` (JSON), e SÓ o que foi mudado de fato: o resto vem do padrão
 * do ambiente. Gravar também os endereços padrão levaria o endereço da VPS (`host.docker.internal`) para o banco do
 * PC na próxima `copia:atualizar`. A CHAVE de cada provedor não passa por aqui: fica cifrada em `Conexao`
 * (AES-256-GCM), com o `.env` como reserva para as que já existiam (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`).
 */

export const SERVICO_DO_PROVEDOR = {
  lmstudio: "LM_STUDIO",
  ollama: "OLLAMA",
  openai: "OPENAI",
  anthropic: "ANTHROPIC",
  gemini: "GEMINI",
};

export const VARIAVEL_DA_CHAVE = {
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
};

const IDS = PROVEDORES.map((provedor) => provedor.id);

/** Padrão de fábrica (spec §5.2). `ambiente` decide o endereço do LM Studio e do Ollama ("pc" ou "vps"). */
export function configuracaoPadrao(ambiente) {
  return {
    padrao: { provedor: "lmstudio", modelo: "" },
    reserva: { provedor: "anthropic", modelo: "claude-haiku-5-5" },
    endpoints: Object.fromEntries(IDS.map((id) => [id, endpointPadrao(id, ambiente)])),
    // Um modelo local pequeno demora para COMEÇAR (ler o prompt), não só para escrever: 45 s até o primeiro token.
    tempoLimite: { primeiroTokenMs: 45000, totalMs: 180000 },
    maxChamadasDeFerramenta: 8,
    maxTokensResposta: 1500,
    contextoMaxTokens: 12000,
    modelosHabilitados: { lmstudio: [], ollama: [], openai: [], anthropic: ["claude-haiku-5-5"], gemini: [] },
    taxaPorUsuarioPorMinuto: 20,
    // `atendimento` = o estilo do texto ao CLIENTE (Entrega 1); `interno` = o estilo das respostas a equipe no chat (A1).
    prompts: { atendimento: null, interno: null },
    // Teto de gasto do mes em reais (spec §3): os clientes (WhatsApp) e o uso interno (chat, Telegram, anuncios).
    orcamentos: { clientesBrl: 70, internoBrl: 30 },
    // "Pesquisar na internet" no chat interno: nasce desligado e o WhatsApp nunca pesquisa (spec §3).
    internet: false,
  };
}

const Escolha = z.object({
  provedor: z.enum(IDS, { message: "Escolha um provedor da lista." }),
  modelo: z.string().max(200, "O nome do modelo é longo demais."),
});

// Endereço de CONFIGURAÇÃO do administrador (nunca vindo do modelo nem de texto de terceiro): só http(s).
const Endereco = z.string().regex(/^https?:\/\/\S+$/i, "O endereço precisa começar com http:// ou https://.");

const inteiro = (minimo, maximo, rotulo) =>
  z.number({ message: `${rotulo}: informe um número.` }).int(`${rotulo}: use um número inteiro.`).min(minimo, `${rotulo}: no mínimo ${minimo}.`).max(maximo, `${rotulo}: no máximo ${maximo}.`);

const reais = (maximo, rotulo) =>
  z
    .number({ message: `${rotulo}: informe um número.` })
    .min(0, `${rotulo}: não pode ser negativo.`)
    .max(maximo, `${rotulo}: no máximo ${maximo}.`)
    .refine((valor) => Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-6, `${rotulo}: use no máximo 2 casas decimais.`);

const EsquemaDaConfiguracao = z.object({
  padrao: Escolha,
  reserva: Escolha.nullable(),
  endpoints: z.object(Object.fromEntries(IDS.map((id) => [id, Endereco]))),
  tempoLimite: z
    .object({
      primeiroTokenMs: inteiro(5000, 300000, "Tempo até o primeiro token"),
      totalMs: inteiro(5000, 900000, "Tempo total"),
    })
    .refine((tempos) => tempos.totalMs >= tempos.primeiroTokenMs, {
      message: "O tempo total precisa ser maior ou igual ao tempo até o primeiro token.",
      path: ["totalMs"],
    }),
  maxChamadasDeFerramenta: inteiro(1, 20, "Chamadas de ferramenta por resposta"),
  maxTokensResposta: inteiro(200, 8000, "Tokens por resposta"),
  contextoMaxTokens: inteiro(2000, 100000, "Contexto máximo"),
  modelosHabilitados: z.object(Object.fromEntries(IDS.map((id) => [id, z.array(z.string().max(200))]))),
  taxaPorUsuarioPorMinuto: inteiro(1, 200, "Perguntas por minuto"),
  prompts: z.object({
    atendimento: z.string().max(12000, "O prompt passa de 12.000 caracteres.").nullable(),
    interno: z.string().max(12000, "O prompt passa de 12.000 caracteres.").nullable(),
  }),
  orcamentos: z.object({ clientesBrl: reais(5000, "Orçamento dos clientes"), internoBrl: reais(5000, "Orçamento interno") }),
  internet: z.boolean({ message: "Use ligado ou desligado." }),
});

/** @returns {{ ok: true, dados: object } | { ok: false, erros: Record<string, string> }} */
export function validarConfiguracao(dados) {
  const resultado = EsquemaDaConfiguracao.safeParse(dados);
  if (resultado.success) return { ok: true, dados: resultado.data };
  const erros = {};
  for (const problema of resultado.error.issues) {
    const campo = problema.path.join(".") || "configuracao";
    erros[campo] ??= problema.message;
  }
  return { ok: false, erros };
}

/** Os grupos que se mesclam chave a chave; o resto de 1º nível o salvo substitui inteiro (`reserva: null` inclusive). */
const GRUPOS = ["endpoints", "modelosHabilitados", "tempoLimite", "prompts", "orcamentos"];

function mesclar(base, parcial) {
  const resultado = { ...base };
  for (const [chave, valor] of Object.entries(parcial ?? {})) {
    if (valor === undefined) continue;
    resultado[chave] =
      GRUPOS.includes(chave) && valor && typeof valor === "object" ? { ...(base[chave] ?? {}), ...valor } : valor;
  }
  return resultado;
}

const ambienteAtual = () => ambienteDoRise(process.env);

async function lerSalvo() {
  const linha = await prisma.configuracaoIA.findUnique({ where: { id: "unica" } });
  return linha?.dados && typeof linha.dados === "object" ? linha.dados : {};
}

/** O padrão do ambiente com o que o administrador salvou por cima. */
export async function lerConfiguracao(ambiente = ambienteAtual()) {
  return mesclar(configuracaoPadrao(ambiente), await lerSalvo());
}

/**
 * Grava só o que mudou. Valida o RESULTADO da mesclagem: valor inválido volta como `{ ok: false, erros }` e nada é
 * gravado.
 *
 * @param {object} parcial
 * @param {{ usuario: string, ambiente?: "pc"|"vps" }} opcoes
 */
export async function gravarConfiguracao(parcial, { usuario, ambiente = ambienteAtual() }) {
  const salvo = mesclar(await lerSalvo(), parcial);
  const validacao = validarConfiguracao(mesclar(configuracaoPadrao(ambiente), salvo));
  if (!validacao.ok) return validacao;

  await prisma.configuracaoIA.upsert({
    where: { id: "unica" },
    update: { dados: salvo, atualizadoPor: usuario },
    create: { id: "unica", dados: salvo, atualizadoPor: usuario },
  });
  return { ok: true, dados: validacao.dados };
}

/** A chave do provedor: a cadastrada na tela (`Conexao`) vence, depois o `.env`; `null` se não há (ou não precisa). */
export async function lerChave(provedor, env = process.env) {
  const servico = SERVICO_DO_PROVEDOR[provedor];
  if (!servico) return null;
  const segredo = await lerSegredo(servico);
  const cadastrada = typeof segredo?.chave === "string" && segredo.chave.trim() ? segredo.chave : null;
  const variavel = VARIAVEL_DA_CHAVE[provedor];
  const doAmbiente = variavel && String(env?.[variavel] ?? "").trim() ? String(env[variavel]).trim() : null;
  return cadastrada ?? doAmbiente;
}

export async function gravarChave(provedor, chave) {
  const servico = SERVICO_DO_PROVEDOR[provedor];
  if (!servico) throw new Error(`Provedor de IA desconhecido: ${provedor}`);
  const limpa = String(chave ?? "").trim();
  if (!limpa) throw new Error("Informe a chave.");
  await salvarConexao(servico, { segredo: { chave: limpa }, status: "CONECTADO", conectadoEm: new Date() });
}

/**
 * Para a tela de configurações: se há chave, de onde, quando foi cadastrada e o último teste. NUNCA a chave (nem a
 * cifrada): a tela só precisa saber "chave cadastrada em dd/mm".
 */
export async function estadoDasChaves(env = process.env) {
  const linhas = await prisma.conexao.findMany({
    where: { servico: { in: Object.values(SERVICO_DO_PROVEDOR) } },
    select: { servico: true, segredoCifrado: true, conectadoEm: true, ultimoTesteEm: true, ultimoTesteOk: true, ultimoErro: true },
  });
  const porServico = new Map(linhas.map((linha) => [linha.servico, linha]));

  return Object.fromEntries(
    IDS.map((id) => {
      const linha = porServico.get(SERVICO_DO_PROVEDOR[id]);
      const variavel = VARIAVEL_DA_CHAVE[id];
      const doAmbiente = Boolean(variavel && String(env?.[variavel] ?? "").trim());
      const naConexao = Boolean(linha?.segredoCifrado);
      return [
        id,
        {
          cadastrada: naConexao || doAmbiente,
          origem: naConexao ? "conexao" : doAmbiente ? "env" : null,
          em: naConexao ? (linha.conectadoEm ?? null) : null,
          ultimoTesteEm: linha?.ultimoTesteEm ?? null,
          ultimoTesteOk: linha?.ultimoTesteOk ?? null,
          ultimoErro: linha?.ultimoErro ?? null,
        },
      ];
    }),
  );
}
