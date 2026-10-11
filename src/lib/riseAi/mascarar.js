import { digitosDoTelefone, telefoneValido } from "@/lib/telefone";
import { validarCnpj, validarCpf } from "@/lib/documentos";

/**
 * Mascara telefone, e-mail e CPF/CNPJ no texto que a pessoa cola no chat (LGPD, spec §5.4/§5.12). A esposa cola
 * mensagens de cliente inteiras; a resposta não precisa desses dados, então eles não são guardados no Rise nem
 * enviados a nenhum provedor de IA — o texto que segue adiante é o já mascarado.
 *
 * Sem imports de Next, Prisma ou React: o chat, o teste e o laço da conversa usam o mesmo arquivo.
 *
 * O que NÃO se mascara: código de produto (`100101`, `121503_10z`, `HC-SR04`) e EAN de 13 dígitos. Por isso só
 * número que PASSA na conferência (DDD real e formato de telefone; dígitos verificadores de CPF/CNPJ) é tocado:
 * 10 dígitos soltos ou o `111.111.111-11` de um lote não são dado pessoal e ficariam ilegíveis se mascarados.
 */

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const CNPJ = /(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/g;
const CPF = /(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g;
// "+55 54 98899-0008", "(54) 98899-0008", "54988990008", "(54) 3333-4444".
const TELEFONE = /(?<!\d)(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}(?!\d)/g;

const finais = (digitos) => digitos.slice(-2);

/** Cada tipo: onde procurar, se o trecho achado é mesmo dado pessoal, e como fica depois de mascarado. */
const TIPOS = [
  {
    nome: "email",
    padrao: EMAIL,
    vale: () => true,
    mascara: (trecho) => `${trecho[0]}***@***`,
  },
  {
    nome: "documento",
    padrao: CNPJ,
    vale: validarCnpj,
    mascara: (trecho) => `**.***.***/****-${finais(trecho.replace(/\D/g, ""))}`,
  },
  {
    nome: "documento",
    padrao: CPF,
    vale: validarCpf,
    mascara: (trecho) => `***.***.***-${finais(trecho.replace(/\D/g, ""))}`,
  },
  {
    nome: "telefone",
    padrao: TELEFONE,
    vale: telefoneValido,
    mascara: (trecho) => {
      const digitos = digitosDoTelefone(trecho);
      const numero = digitos.slice(2);
      // Celular (9 dígitos depois do DDD) mantém o 9; fixo (8) não tem o que manter.
      const inicio = numero.length === 9 ? "9****" : "****";
      return `(${digitos.slice(0, 2)}) ${inicio}-**${finais(digitos)}`;
    },
  },
];

/**
 * @param {string} texto
 * @returns {{ texto: string, mascarados: ("telefone"|"email"|"documento")[] }}
 *   `mascarados` diz o que havia, sem repetir, na ordem em que aparece no texto.
 */
export function mascararDadosPessoais(texto) {
  const original = String(texto ?? "");

  // Os trechos são achados todos no texto ORIGINAL, na ordem de prioridade de TIPOS (e-mail, CNPJ, CPF, telefone):
  // um CPF de 11 dígitos também parece telefone, e quem vem primeiro leva o trecho. Trecho que invade outro já
  // aceito é descartado.
  const aceitos = [];
  for (const tipo of TIPOS) {
    for (const achado of original.matchAll(tipo.padrao)) {
      const inicio = achado.index;
      const fim = inicio + achado[0].length;
      if (!tipo.vale(achado[0])) continue;
      if (aceitos.some((outro) => inicio < outro.fim && fim > outro.inicio)) continue;
      aceitos.push({ inicio, fim, nome: tipo.nome, novo: tipo.mascara(achado[0]) });
    }
  }
  if (aceitos.length === 0) return { texto: original, mascarados: [] };

  aceitos.sort((a, b) => a.inicio - b.inicio);
  let resultado = "";
  let cursor = 0;
  for (const aceito of aceitos) {
    resultado += original.slice(cursor, aceito.inicio) + aceito.novo;
    cursor = aceito.fim;
  }
  resultado += original.slice(cursor);

  return { texto: resultado, mascarados: [...new Set(aceitos.map((aceito) => aceito.nome))] };
}
