import { prisma } from "@/lib/db";
import { ErroDeUso } from "@/lib/riseAi/erros";
import { limitesDoDia } from "@/lib/riseAi/revisao";

/**
 * As consultas que cada pessoa fez ao Rise pelo Claude/ChatGPT num dia, para a Revisao (pedido do dono em 20/10/2026:
 * "sempre salvar o historico de conversa no Rise"). O Rise so recebe a pergunta e a resposta quando o modelo chama
 * `anotarDuvida`, e o claude.ai nem sempre chama; o que sempre chega e cada consulta (a `ChamadaMcp`). Aqui elas viram a
 * lista do dia por pessoa, com o que foi pesquisado e se ficou coberta por uma anotacao.
 *
 * Coberta = a mesma regra do `anotarDuvida` (`chamadasRecentes`): a anotacao leva as consultas desde a anotacao anterior,
 * no maximo as dos 30 minutos antes dela, do mesmo login e do mesmo cliente.
 */

const FUSO = "America/Sao_Paulo";
const ANOTAR = "anotarDuvida";
// A proposta de cadastro nao e duvida de atendimento: aparece na lista, mas nao espera anotacao (spec 2026-10-21).
const DA_PROPOSTA = new Set(["roteiroDaProposta", "lerParaProposta", "lerProposta", "baixarCandidatas", "folhaDeContato", "gravarSecao", "situacaoDoProduto", "lerParaPropostaLI", "gravarPropostaLI", "lerParaPropostaML", "lerCategoriaML", "gravarPropostaML"]);
const JANELA_MS = 30 * 60 * 1000;
const hora = (data) => new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(data);

const lista = (valor) => (Array.isArray(valor) ? valor.join(", ") : String(valor ?? ""));
const RESUMOS = {
  buscarProdutos: (a) => `buscou: ${a.termos}`,
  consultarProduto: (a) => `ficha de ${a.sku}`,
  consultarEstoque: (a) => `estoque de ${lista(a.skus)}`,
  consultarPreco: (a) => `preço de ${lista(a.skus)}`,
  compararProdutos: (a) => `comparou ${lista(a.skus)}`,
  buscarProdutosSimilares: (a) => `parecidos com ${a.sku}`,
  buscarConhecimento: (a) => `conhecimento: ${a.termos}`,
  buscarNoMercado: (a) => `mercado: ${a.termos}`,
  filtrarProdutos: (a) => ["filtros: " + (lista(a.filtros) || "nenhum"), a.termos].filter(Boolean).join(" · "),
  anunciosDoProduto: (a) => `anúncios de ${a.sku}`,
  historicoDePreco: (a) => (a.sku ? `histórico de ${a.sku}` : `histórico de ${a.codigo} em ${a.fonte}`),
  listarFornecedores: (a) => `fornecedores${a.termos ? `: ${a.termos}` : ""}`,
  listarConcorrentes: (a) => `concorrentes${a.termos ? `: ${a.termos}` : ""}`,
  listarTransportadoras: (a) => `transportadoras${a.termos ? `: ${a.termos}` : ""}`,
  listarMarcas: (a) => `marcas${a.termos ? `: ${a.termos}` : ""}`,
  listarClientes: (a) => `clientes${a.termos ? `: ${a.termos}` : ""}`,
  roteiroDaProposta: (a) => (a?.canal && a.canal !== "produto" ? `proposta ${a.canal.toUpperCase()}: leu o roteiro` : "proposta: leu o roteiro"),
  lerParaProposta: (a) => `proposta de ${a.sku}: leitura`,
  lerProposta: (a) => `proposta de ${a.sku}: conferência`,
  baixarCandidatas: (a) => `proposta de ${a.sku}: ${Array.isArray(a.ids) ? a.ids.length : 0} foto(s) baixada(s)`,
  folhaDeContato: (a) => `proposta de ${a.sku}: folha de fotos${a.pagina ? ` (página ${a.pagina})` : ""}`,
  gravarSecao: (a) => `proposta de ${a.sku}: gravou ${a.secao}`,
  situacaoDoProduto: (a) => `situação de ${a.sku}`,
  lerParaPropostaLI: (a) => `proposta LI de ${a.sku}: leitura`,
  gravarPropostaLI: (a) => `proposta LI de ${a.sku}: gravou`,
  lerParaPropostaML: (a) => `proposta ML de ${a.sku}: leitura`,
  lerCategoriaML: (a) => `proposta ML: categoria ${a.categoriaId}`,
  gravarPropostaML: (a) => `proposta ML de ${a.sku}: gravou`,
};
const ROTULOS_CORTADOS = { buscarProdutos: "buscou", buscarNoMercado: "mercado", buscarConhecimento: "conhecimento" };

/** "buscou: sensor ultrassonico", "preço de 100101, 100103"... Ferramenta nova ou argumento estranho nunca quebra a tela. */
export function resumoDaChamada(ferramenta, argumentos) {
  if (argumentos?.cortado) return `${ROTULOS_CORTADOS[ferramenta] ?? ferramenta} (argumentos longos)`;
  const resumir = RESUMOS[ferramenta];
  if (!resumir || !argumentos || typeof argumentos !== "object") return ferramenta;
  try {
    return resumir(argumentos);
  } catch {
    return ferramenta;
  }
}

/**
 * @returns {Promise<{ login: string, cliente: string, total: number, semAnotacao: number,
 *   chamadas: { hora: string, ferramenta: string, resumo: string, ok: boolean, erro: string | null, anotada: boolean }[] }[]>}
 *   uma entrada por pessoa e cliente, a de consulta mais recente primeiro; as chamadas na ordem do dia
 */
export async function consultasDoDia(dia, { administrador = false } = {}) {
  if (!administrador) throw new ErroDeUso("Só administradores do Rise AI podem ver a revisão.");
  const { inicio, fim } = limitesDoDia(dia);
  // A anotacao do comeco do dia pode cobrir consulta da noite anterior; a janela de 30 min basta para buscar as do dia.
  const linhas = await prisma.chamadaMcp.findMany({
    where: { quando: { gte: new Date(inicio.getTime() - JANELA_MS), lt: fim } },
    orderBy: [{ quando: "asc" }, { id: "asc" }],
    select: { login: true, clienteId: true, clienteNome: true, ferramenta: true, argumentos: true, ok: true, erro: true, quando: true },
  });

  const grupos = new Map();
  for (const linha of linhas) {
    const chave = `${linha.login}\u0000${linha.clienteId ?? ""}`;
    if (!grupos.has(chave)) grupos.set(chave, { login: linha.login, cliente: linha.clienteNome, pendentes: [], chamadas: [], ultima: 0 });
    const grupo = grupos.get(chave);
    if (linha.ferramenta === ANOTAR) {
      for (const pendente of grupo.pendentes) if (linha.quando - pendente.quando <= JANELA_MS) pendente.anotada = true;
      grupo.pendentes = [];
      continue;
    }
    const item = { quando: linha.quando, hora: hora(linha.quando), ferramenta: linha.ferramenta, resumo: resumoDaChamada(linha.ferramenta, linha.argumentos), ok: linha.ok, erro: linha.erro ?? null, anotada: false };
    if (DA_PROPOSTA.has(linha.ferramenta)) item.proposta = true;
    else grupo.pendentes.push(item);
    if (linha.quando >= inicio) {
      grupo.chamadas.push(item);
      grupo.ultima = linha.quando.getTime();
    }
  }

  return [...grupos.values()]
    .filter((grupo) => grupo.chamadas.length > 0)
    .sort((a, b) => b.ultima - a.ultima)
    .map((grupo) => ({
      login: grupo.login,
      cliente: grupo.cliente,
      total: grupo.chamadas.length,
      semAnotacao: grupo.chamadas.filter((item) => !item.anotada && !item.proposta).length,
      chamadas: grupo.chamadas.map(({ quando, ...item }) => {
        void quando;
        return item;
      }),
    }));
}
