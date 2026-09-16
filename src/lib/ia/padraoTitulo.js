import { LIMITE_TITULO_ML } from "@/lib/limites";

/**
 * Padrao de titulo da Rise, como instrucao para a IA.
 *
 * Definido em 16/09/2026 a partir dos titulos gravados dos concorrentes
 * (Saravati, Usinainfo, Eletrogate, Smartkits, Casa da Robotica): todos abrem
 * pelo TIPO da peca, seguem com funcao, modelo/CI e especificacao, e ficam entre
 * 41 e 57 caracteres na mediana. A ordem vem deles; a caixa alta e decisao do
 * dono, e e o que a Rise ja usa no Bling.
 *
 * Mora sozinho para ser ajustado sem mexer na chamada da IA.
 */
export const PADRAO_TITULO = `Padrão de título da loja (anúncio do Mercado Livre):

Ordem: TIPO + FUNÇÃO PRINCIPAL + MODELO/CI + ESPECIFICAÇÃO-CHAVE + COMPATIBILIDADE/INCLUI

Regras:
- No máximo ${LIMITE_TITULO_ML} caracteres, contando espaços. Prefira tirar a informação menos importante a abreviar palavras.
- Tudo em LETRAS MAIÚSCULAS, com a acentuação correta (MÓDULO, COMPATÍVEL, TENSÃO).
- Comece pelo tipo da peça (PLACA, MÓDULO, SENSOR, FONTE, KIT, DISPLAY...).
- Modelo e CI com a grafia do fabricante (HC-SR04, ESP32-S3, CH340, ATMEGA328P).
- Especificação-chave só quando decide a compra: tensão, corrente, tamanho, quantidade de canais.
- "COMPATÍVEL ARDUINO" quando as referências indicarem compatibilidade. Nunca use ARDUINO como se fosse a marca do produto.
- Kit ou quantidade vão no início: "KIT 10 ...".
- Use "COM" em vez de "+". Sem nome de loja, sem ORIGINAL, PROMOÇÃO, FRETE GRÁTIS, emoji, "*" ou outros símbolos.
- Só informação que aparece nas referências: não invente modelo nem especificação.

Exemplos no padrão:
PLACA UNO R3 CH340 COMPATÍVEL ARDUINO COM CABO USB
SENSOR DE DISTÂNCIA ULTRASSÔNICO HC-SR04 5V
MÓDULO RELÉ 5V 4 CANAIS COM OPTOACOPLADOR`;
