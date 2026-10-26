/**
 * As contas do popup de andamento do Sincronizar e do Cadastrar (`AndamentoDoEnvio.jsx`), comuns ao Bling e a Loja Integrada.
 * Sem imports: o navegador e o teste leem o mesmo arquivo. Uma etapa e `{ id, rotulo, estado: "espera"|"andando"|"feito"|"falhou",
 * detalhe }`; quem decide as etapas de cada envio e a lib do canal (`ETAPAS_DO_ENVIO` do Bling, `ETAPAS_DO_ENVIO_LI` da LI).
 */

/// Todas as etapas esperando, com a primeira ja andando (o servidor so marca a dele alguns milissegundos depois).
export function etapasIniciais(etapas) {
  return etapas.map((etapa, indice) => ({ ...etapa, estado: indice === 0 ? "andando" : "espera", detalhe: null }));
}

/// O estado que o servidor marcou, por cima das etapas da tela. Entre uma etapa terminar e a outra comecar passam milissegundos
/// sem ninguem "andando": nesses instantes a primeira que falta fica andando, para o circulo nao piscar.
export function mesclarEtapas(etapas, doServidor) {
  const porId = new Map(doServidor.map((etapa) => [etapa.id, etapa]));
  const mescladas = etapas.map((etapa) => {
    const lida = porId.get(etapa.id);
    return lida ? { ...etapa, estado: lida.estado, detalhe: lida.detalhe } : etapa;
  });
  if (mescladas.some((etapa) => etapa.estado === "andando" || etapa.estado === "falhou")) return mescladas;
  const proxima = mescladas.findIndex((etapa) => etapa.estado === "espera");
  return mescladas.map((etapa, indice) => (indice === proxima ? { ...etapa, estado: "andando" } : etapa));
}

/// Fecha as etapas com o que a acao devolveu. Deu certo: as do servidor ficam todas concluidas (a "conferir" e da tela). Falhou: a
/// que o servidor marcou como falha leva o motivo; sem marca (a acao foi recusada antes de comecar, ou caiu por fora), a que
/// estava andando falha.
export function etapasComOResultado(etapas, resultado) {
  if (resultado.ok === true) return etapas.map((etapa) => (etapa.id === "conferir" ? etapa : { ...etapa, estado: "feito" }));
  if (etapas.some((etapa) => etapa.estado === "falhou")) {
    return etapas.map((etapa) => (etapa.estado === "falhou" && !etapa.detalhe ? { ...etapa, detalhe: resultado.erro ?? "O envio não foi concluído." } : etapa));
  }
  const andando = etapas.findIndex((etapa) => etapa.estado === "andando");
  const alvo = andando >= 0 ? andando : Math.max(0, etapas.findIndex((etapa) => etapa.estado !== "feito"));
  return etapas.map((etapa, indice) => {
    if (indice === alvo) return { ...etapa, estado: "falhou", detalhe: resultado.erro ?? "O envio não foi concluído." };
    return etapa.estado === "andando" ? { ...etapa, estado: "espera" } : etapa;
  });
}

/// O andamento que o servidor guardou para o produto, ou null (rota fora do ar, sem acesso, nada aberto). So le a memoria do servidor.
export async function lerAndamentoNoServidor(rota, produtoId) {
  try {
    const resposta = await fetch(`${rota}/${encodeURIComponent(produtoId)}`, { cache: "no-store" });
    if (!resposta.ok) return null;
    return (await resposta.json()).progresso ?? null;
  } catch {
    return null;
  }
}
