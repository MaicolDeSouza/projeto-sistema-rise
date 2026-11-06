import { z } from "zod";

/**
 * O que a extensao "Rise LightBurn" manda ao Rise (spec 2026-11-05, §6.4; campos medidos em extensao-lightburn/MEDICAO.md).
 * Chave desconhecida e descartada (o z.object padrao): o e-mail e o nome de quem esta logado no portal, a localizacao
 * do PC do cliente e qualquer outro dado pessoal que escape da extensao nao chegam ao banco.
 */

const texto = (maximo) => z.string().trim().max(maximo);
const textoOuNulo = (maximo) => texto(maximo).nullable().optional().transform((valor) => valor ?? null);
// O portal manda microssegundos ("2025-10-06T17:58:20.256388Z"); o datetime do zod aceita qualquer fracao de segundo.
const dataOuNula = z.string().datetime().nullable().optional().transform((valor) => valor ?? null);
const inteiroOuNulo = z.number().int().nonnegative().nullable().optional().transform((valor) => valor ?? null);
const dados = z.record(z.string(), z.any()).optional().transform((valor) => valor ?? {});

const Ativacao = z.object({
  idNoPortal: textoOuNulo(80),
  hostname: texto(200).min(1),
  so: textoOuNulo(120),
  criadaEm: dataOuNula,
  ultimaSincronizacaoEm: dataOuNula,
  leaseExpiraEm: dataOuNula,
  dados,
});

const Licenca = z.object({
  idNoPortal: textoOuNulo(80),
  chave: texto(120).min(4),
  situacao: texto(40),
  expiraEm: dataOuNula,
  criadaEm: dataOuNula,
  ativacoesUsadas: inteiroOuNulo,
  ativacoesPermitidas: inteiroOuNulo,
  tipo: textoOuNulo(40),
  dados,
  ativacoes: z.array(Ativacao).max(50).optional().transform((valor) => valor ?? []),
});

const Leitura = z.object({
  versao: texto(20),
  lidoEm: z.string().datetime(),
  completa: z.boolean(),
  licencas: z.array(Licenca).max(2000),
});

/** `{ ok: true, dados }` ou `{ ok: false, erro: "licencas.0.chave: ..." }` (o caminho do primeiro problema). */
export function lerCorpoDaLeitura(json) {
  const resultado = Leitura.safeParse(json);
  if (!resultado.success) {
    const problema = resultado.error.issues[0];
    const caminho = problema?.path?.length ? `${problema.path.join(".")}: ` : "";
    return { ok: false, erro: `${caminho}${problema?.message ?? "formato inválido"}` };
  }
  return { ok: true, dados: resultado.data };
}
