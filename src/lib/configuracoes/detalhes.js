/**
 * A linha de detalhe de cada cartao da pagina Configuracoes: um dado vivo, nunca uma frase fixa (Padrao visual, regra
 * 4). Puras, sem imports: a pagina le os numeros no servidor e passa para ca; o teste as confere.
 */

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** "2 usuários · 2 funções". */
export function detalheDeUsuarios({ usuarios, funcoes }) {
  return `${plural(usuarios, "usuário", "usuários")} · ${plural(funcoes, "função", "funções")}`;
}

/** A situacao das integracoes, a pior primeiro: "1 expirada · 2 conectadas". So o que tem valor. */
export function detalheDeIntegracoes(conectores, conexoes) {
  const contagem = { ERRO: 0, EXPIRADO: 0, NAO_CONFIGURADO: 0, CONECTADO: 0 };
  for (const conector of conectores) {
    const status = conexoes.get(conector.id)?.status ?? "NAO_CONFIGURADO";
    contagem[Object.hasOwn(contagem, status) ? status : "ERRO"] += 1;
  }
  const partes = [
    contagem.ERRO && `${contagem.ERRO} com erro`,
    contagem.EXPIRADO && plural(contagem.EXPIRADO, "expirada", "expiradas"),
    contagem.NAO_CONFIGURADO && plural(contagem.NAO_CONFIGURADO, "não configurada", "não configuradas"),
    contagem.CONECTADO && plural(contagem.CONECTADO, "conectada", "conectadas"),
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : "nenhuma conectada";
}

/** "Padrão: Anthropic · claude-haiku-5-5" (o rotulo do provedor vem de PROVEDORES; desconhecido fica o id). */
export function detalheDoRiseAi(padrao, provedores) {
  if (!padrao?.provedor || !padrao?.modelo) return "Sem modelo padrão";
  const rotulo = provedores.find((provedor) => provedor.id === padrao.provedor)?.rotulo ?? padrao.provedor;
  return `Padrão: ${rotulo} · ${padrao.modelo}`;
}
