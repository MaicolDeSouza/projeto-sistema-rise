import { PROVEDORES } from "./modelos";
import { TIPOS_DE_AVISO } from "@/lib/telegram/avisosTipos";

// O interruptor manda "true" ou "false"; qualquer outra coisa segue como veio e a validacao recusa no campo.
const booleanoDoCampo = (dados, nome) => {
  const valor = String(dados.get(nome) ?? "").trim();
  return valor === "true" ? true : valor === "false" ? false : valor;
};
import { PROMPT_ATENDIMENTO_PADRAO, PROMPT_INTERNO_PADRAO } from "./prompt";

/**
 * Leitura dos formulários das telas de administração do Rise AI (Server Actions). Sem banco e sem Next: o teste usa
 * o mesmo arquivo.
 */

/** "a, B;c\n d" → ["a", "B", "c", "d"]: códigos de produto separados por vírgula, ponto e vírgula, espaço ou quebra de linha. */
export function codigosDoTexto(valor) {
  return String(valor ?? "")
    .split(/[\s,;]+/)
    .filter(Boolean);
}

/**
 * Os campos de texto PREENCHIDOS do formulário, aparados. Campo em branco fica de fora: numa edição, "não mexi" e
 * "apaguei" são coisas diferentes, e apagar o assunto de uma nota não é o que um campo em branco quer dizer.
 *
 * @param {FormData} dados
 * @param {string[]} nomes
 */
export function camposDoFormulario(dados, nomes) {
  const campos = {};
  for (const nome of nomes) {
    const valor = String(dados.get(nome) ?? "").trim();
    if (valor) campos[nome] = valor;
  }
  return campos;
}

const MAXIMO_DE_MODELOS = 500;

/** Os campos de texto do formulário que o usuário deixou preenchidos ou apagou: presença do NOME, não do valor. */
const tem = (dados, nome) => dados.has(nome);
const texto = (dados, nome) => String(dados.get(nome) ?? "").trim();
/** Campo numérico: em branco ou com letra vira NaN, e a validação da configuração diz "informe um número" naquele campo. */
const numeroDoCampo = (dados, nome) => (texto(dados, nome) === "" ? Number.NaN : Number(texto(dados, nome)));
/** Valor em reais do campo: "45,50", "1.234,50" ou "45.5"; em branco ou com letra vira NaN (a validacao diz "informe um número"). */
function reaisDoCampo(dados, nome) {
  const bruto = texto(dados, nome).replace(/R\$|\s/g, "");
  if (bruto === "") return Number.NaN;
  const normal = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
  return /^\d+(\.\d+)?$/.test(normal) ? Number(normal) : Number.NaN;
}
const comoLinhasUnix = (valor) => String(valor ?? "").replace(/\r\n?/g, "\n").trim();

/**
 * O formulário de configurações do Rise AI vira o `parcial` de `gravarConfiguracao`: só entra o que veio no formulário
 * (cada cartão e cada bloco da tela envia só os seus campos), e quem valida é `validarConfiguracao`, que devolve o erro
 * campo a campo. Nada aqui lê chave de API: ela vai por uma ação própria.
 *
 *   padraoProvedor/padraoModelo · reservaProvedor/reservaModelo ("" = sem reserva) · primeiroTokenMs · totalMs ·
 *   maxChamadasDeFerramenta · maxTokensResposta · contextoMaxTokens · taxaPorUsuarioPorMinuto · endpoint.<provedor> ·
 *   promptAtendimento (em branco ou igual ao padrão do código = nulo: uma melhoria futura do padrão chega a quem nunca
 *   mexeu no texto)
 *
 * @param {FormData} dados
 */
export function parcialDaConfiguracao(dados) {
  const parcial = {};
  if (tem(dados, "padraoProvedor")) parcial.padrao = { provedor: texto(dados, "padraoProvedor"), modelo: texto(dados, "padraoModelo") };
  if (tem(dados, "reservaProvedor")) {
    parcial.reserva = texto(dados, "reservaProvedor") ? { provedor: texto(dados, "reservaProvedor"), modelo: texto(dados, "reservaModelo") } : null;
  }
  const tempos = {};
  for (const nome of ["primeiroTokenMs", "totalMs"]) if (tem(dados, nome)) tempos[nome] = numeroDoCampo(dados, nome);
  if (Object.keys(tempos).length) parcial.tempoLimite = tempos;
  for (const nome of ["maxChamadasDeFerramenta", "maxTokensResposta", "contextoMaxTokens", "taxaPorUsuarioPorMinuto"]) {
    if (tem(dados, nome)) parcial[nome] = numeroDoCampo(dados, nome);
  }
  const orcamentos = {};
  if (tem(dados, "orcamentoClientesBrl")) orcamentos.clientesBrl = reaisDoCampo(dados, "orcamentoClientesBrl");
  if (tem(dados, "orcamentoInternoBrl")) orcamentos.internoBrl = reaisDoCampo(dados, "orcamentoInternoBrl");
  if (Object.keys(orcamentos).length) parcial.orcamentos = orcamentos;
  // A aba Canais (Telegram, Entrega C1): o interruptor do bot e um por aviso, cada um "true" ou "false".
  const telegram = {};
  if (tem(dados, "telegramLigado")) telegram.ligado = booleanoDoCampo(dados, "telegramLigado");
  const avisos = {};
  for (const tipo of TIPOS_DE_AVISO) if (tem(dados, `telegramAviso.${tipo}`)) avisos[tipo] = booleanoDoCampo(dados, `telegramAviso.${tipo}`);
  if (Object.keys(avisos).length) telegram.avisos = avisos;
  if (Object.keys(telegram).length) parcial.telegram = telegram;
  // A aba Canais, chat da loja (o Hobi): os campos `chat.*`. So entra o que veio; o Salvar do Telegram nao toca aqui.
  const chat = {};
  for (const nome of ["ligado", "publico"]) if (tem(dados, `chat.${nome}`)) chat[nome] = booleanoDoCampo(dados, `chat.${nome}`);
  for (const nome of ["nome", "boasVindas", "whatsapp", "turnstileSiteKey"]) if (tem(dados, `chat.${nome}`)) chat[nome] = texto(dados, `chat.${nome}`);
  // `chat.horario` marca que o bloco do horario veio: caixa de dia desmarcada nao manda nada, e "nenhum dia" e um valor.
  if (tem(dados, "chat.horario")) {
    const dias = [...new Set(dados.getAll("chat.dias").map((dia) => Number(dia)))].sort((a, b) => a - b);
    const turnos = [1, 2].map((numero) => [texto(dados, `chat.turno${numero}De`), texto(dados, `chat.turno${numero}Ate`)]).filter(([de, ate]) => de || ate);
    chat.horario = { dias, turnos };
  }
  // "<provedor>/<modelo>": o nome do modelo pode ter barra, o do provedor nao.
  const escolha = (valor) => {
    const corte = valor.indexOf("/");
    return corte === -1 ? { provedor: valor, modelo: "" } : { provedor: valor.slice(0, corte), modelo: valor.slice(corte + 1) };
  };
  if (tem(dados, "chat.principal")) chat.principal = escolha(texto(dados, "chat.principal"));
  if (tem(dados, "chat.reserva")) chat.reserva = texto(dados, "chat.reserva") ? escolha(texto(dados, "chat.reserva")) : null;
  const limites = {};
  // Os dois limites em dinheiro aceitam "0,50"; os outros sao numeros inteiros.
  for (const nome of ["mensagensPorSessaoPorHora", "caracteresPorMensagem", "brlPorSessaoPorDia", "mensagensPorIpPorHora", "respostasAoMesmoTempo", "brlPorDia"]) {
    if (tem(dados, `chat.limite.${nome}`)) limites[nome] = (nome.startsWith("brl") ? reaisDoCampo : numeroDoCampo)(dados, `chat.limite.${nome}`);
  }
  if (Object.keys(limites).length) chat.limites = limites;
  if (Object.keys(chat).length) parcial.chatDaLoja = chat;
  if (tem(dados, "internet")) {
    // O interruptor manda "true" ou "false"; qualquer outra coisa segue como veio e a validacao recusa no campo.
    const valor = texto(dados, "internet");
    parcial.internet = valor === "true" ? true : valor === "false" ? false : valor;
  }
  const endpoints = {};
  for (const { id } of PROVEDORES) if (tem(dados, `endpoint.${id}`)) endpoints[id] = texto(dados, `endpoint.${id}`);
  if (Object.keys(endpoints).length) parcial.endpoints = endpoints;
  if (tem(dados, "promptAtendimento")) {
    const prompt = comoLinhasUnix(dados.get("promptAtendimento"));
    parcial.prompts = { atendimento: !prompt || prompt === comoLinhasUnix(PROMPT_ATENDIMENTO_PADRAO) ? null : prompt };
  }
  if (tem(dados, "promptInterno")) {
    const prompt = comoLinhasUnix(dados.get("promptInterno"));
    parcial.prompts = { ...(parcial.prompts ?? {}), interno: !prompt || prompt === comoLinhasUnix(PROMPT_INTERNO_PADRAO) ? null : prompt };
  }
  return parcial;
}

/** Os ids dos modelos marcados nas caixas (`modelo` repetido): aparados, sem vazios nem repetidos. */
export function idsDosModelos(dados) {
  return [...new Set(dados.getAll("modelo").map((id) => String(id ?? "").trim()).filter((id) => id && id.length <= 200))].slice(0, MAXIMO_DE_MODELOS);
}
