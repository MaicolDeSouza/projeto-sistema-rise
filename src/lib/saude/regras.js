/**
 * Regras da Saude do Rise (pedido do dono em 25/10/2026: um cartao em Configuracoes que vigia os workers, o banco, as
 * integracoes e o resto que importa). Sem imports: a tela, o servidor, o worker e o teste leem as mesmas regras.
 *
 * Cada item vira `{ estado, detalhe }`. Estados: "ok", "atencao" (amarelo: funciona, mas pede olhar), "falha" (vermelho:
 * o Telegram avisa), "aguardando" (sem dado ainda, ou nao se aplica aqui) e "info" (so informacao). Os dois ultimos nunca
 * pioram o estado geral.
 */

/** As rotinas do worker normal que gravam o resultado em `RotinaDoWorker` (o `id` e a chave da linha). */
export const ROTINAS_DO_WORKER = [
  { id: "estoqueBling", rotulo: "Estoque do Bling" },
  { id: "estadoML", rotulo: "Anúncios no Mercado Livre" },
  { id: "monitorLI", rotulo: "Anúncios na Loja Integrada" },
  { id: "concorrentesML", rotulo: "Concorrentes do Mercado Livre" },
  { id: "aguardandoEstoque", rotulo: "Anúncios do ML sem estoque" },
  { id: "telegram", rotulo: "Avisos do Telegram" },
  { id: "rotinaSemanal", rotulo: "Rodada semanal e relatório" },
  { id: "fotoMensal", rotulo: "Foto mensal de preço e estoque" },
  { id: "temporarios", rotulo: "Limpeza dos temporários" },
];

const ORDEM = { ok: 0, info: 0, aguardando: 0, atencao: 1, falha: 2 };

const MIN = 60 * 1000;
const HORA = 60 * MIN;

/** "há 5 min", "há 3 h", "há 2 dias". */
export function quandoFoi(data, agora) {
  const ms = Math.max(0, agora - new Date(data).getTime());
  if (ms < HORA) return `há ${Math.max(1, Math.round(ms / MIN))} min`;
  if (ms < 48 * HORA) return `há ${Math.round(ms / HORA)} h`;
  return `há ${Math.round(ms / (24 * HORA))} dias`;
}

const decimal = (numero) => numero.toFixed(1).replace(".", ",");
const tempo = (data) => (data ? new Date(data).getTime() : 0);

/**
 * O que uma volta da rotina devolveu, no formato da linha. As rotinas do worker nunca lancam e devolvem `parou` (401/429
 * pararam a rodada), `motivo: "erro"` ou `ok: false` quando falham; `falhas > 0` com o resto feito e falha PARCIAL.
 */
export function resultadoDaRotina(retorno) {
  if (retorno?.parou) return { ok: false, erro: `rodada parada (${retorno.parou})`, aviso: null };
  if (retorno?.motivo === "erro" || retorno?.ok === false) return { ok: false, erro: retorno.erro ? String(retorno.erro) : "falhou", aviso: null };
  if (Number(retorno?.falhas) > 0) return { ok: true, erro: null, aviso: `${retorno.falhas} falha(s)` };
  return { ok: true, erro: null, aviso: null };
}

/**
 * Uma rotina pela linha dela. A ultima volta falhou = falha. Sem rodar em 2 intervalos = atrasada; em 3 = parou (a folga
 * de minutos cobre a volta de 5 s do worker e uma rotina demorada antes dela).
 */
export function avaliarRotina(linha, agora) {
  if (!linha) return { estado: "aguardando", detalhe: "Ainda não rodou desde a última atualização do worker." };
  const okEm = tempo(linha.ultimaOkEm);
  const falhaEm = tempo(linha.ultimaFalhaEm);
  if (falhaEm > okEm) return { estado: "falha", detalhe: `Falhou ${quandoFoi(falhaEm, agora)}: ${linha.ultimoErro ?? "sem mensagem"}` };
  const intervalo = Number(linha.intervaloMs) || 0;
  if (intervalo && agora - okEm > 3 * intervalo + 5 * MIN) return { estado: "falha", detalhe: `Parou: a última volta boa foi ${quandoFoi(okEm, agora)}.` };
  if (intervalo && agora - okEm > 2 * intervalo + 2 * MIN) return { estado: "atencao", detalhe: `Atrasada: rodou ${quandoFoi(okEm, agora)}.` };
  if (linha.aviso) return { estado: "atencao", detalhe: `Rodou ${quandoFoi(okEm, agora)} com aviso: ${linha.aviso}` };
  return { estado: "ok", detalhe: `Rodou ${quandoFoi(okEm, agora)}.` };
}

/** O worker normal pelo sinal de vida dele (`WorkerColeta.sinalEm`, a cada 15 s; sem sinal em 1 min, caiu). */
export function avaliarWorker(sinalEm, agora) {
  if (!sinalEm) return { estado: "falha", detalhe: "O worker não está no ar." };
  const ms = agora - tempo(sinalEm);
  if (ms > MIN) return { estado: "falha", detalhe: `Sem sinal ${quandoFoi(sinalEm, agora)}: o worker caiu ou travou.` };
  return { estado: "ok", detalhe: `No ar, último sinal há ${Math.max(1, Math.round(ms / 1000))} s.` };
}

/** O disco onde mora `dados/`: abaixo de 15% livre pede olhar, abaixo de 10% e falha (backup e fotos param). */
export function avaliarDisco(disco) {
  if (!disco?.totalBytes) return { estado: "aguardando", detalhe: "Não foi possível ler o disco." };
  const percentual = (disco.livreBytes / disco.totalBytes) * 100;
  const GB = 1024 ** 3;
  const detalhe = `${decimal(disco.livreBytes / GB)} GB livres de ${decimal(disco.totalBytes / GB)} GB (${Math.round(percentual)}%)`;
  if (percentual < 10) return { estado: "falha", detalhe };
  if (percentual < 15) return { estado: "atencao", detalhe };
  return { estado: "ok", detalhe };
}

/** O backup diario (03:00): com mais de 26 h ele falhou uma vez; com mais de 50 h, duas. */
export function avaliarBackup(maisNovoEm, agora) {
  if (!maisNovoEm) return { estado: "falha", detalhe: "Nenhum backup em dados/backup." };
  const ms = agora - tempo(maisNovoEm);
  const detalhe = `Último backup ${quandoFoi(maisNovoEm, agora)}.`;
  if (ms > 50 * HORA) return { estado: "falha", detalhe };
  if (ms > 26 * HORA) return { estado: "atencao", detalhe };
  return { estado: "ok", detalhe };
}

/** A memoria do worker (gravada por ele de hora em hora): o worker ja caiu 6 vezes por falta de heap. */
export function avaliarMemoria(memoria, agora) {
  if (!memoria?.heapMb || !memoria?.limiteMb) return { estado: "aguardando", detalhe: "O worker ainda não informou a memória." };
  const percentual = (memoria.heapMb / memoria.limiteMb) * 100;
  const detalhe = `${Math.round(memoria.heapMb)} MB de ${Math.round(memoria.limiteMb)} MB (${Math.round(percentual)}%)${memoria.em ? `, lido ${quandoFoi(memoria.em, agora)}` : ""}.`;
  if (percentual > 92) return { estado: "falha", detalhe };
  if (percentual > 80) return { estado: "atencao", detalhe };
  return { estado: "ok", detalhe };
}

/** O banco: responde, em quanto tempo e quanto ocupa. */
export function avaliarBanco({ latenciaMs, tamanhoBytes, erro } = {}) {
  if (erro) return { estado: "falha", detalhe: `Não respondeu: ${erro}` };
  const detalhe = `Respondeu em ${Math.round(latenciaMs)} ms${tamanhoBytes ? ` · ${Math.round(tamanhoBytes / 1024 ** 2)} MB` : ""}`;
  if (latenciaMs > 2000) return { estado: "falha", detalhe };
  if (latenciaMs > 500) return { estado: "atencao", detalhe };
  return { estado: "ok", detalhe };
}

/**
 * Uma integracao pela `Conexao` e pelo `LogIntegracao` das ultimas 24 h. `obrigatoria`: sem ela o Rise para (Bling, ML,
 * Loja Integrada); a opcional sem configurar so fica cinza.
 */
export function avaliarIntegracao({ status, ultimoTesteOk, ultimoErro, recusas24h = 0, limite24h = 0, obrigatoria = false } = {}) {
  if (!status || status === "NAO_CONFIGURADO") {
    return obrigatoria ? { estado: "falha", detalhe: "Não conectada." } : { estado: "aguardando", detalhe: "Não configurada." };
  }
  if (status === "EXPIRADO") return { estado: "falha", detalhe: "Conexão expirada: conecte de novo em Integrações." };
  if (status === "ERRO") return { estado: "falha", detalhe: `Conexão com erro${ultimoErro ? `: ${ultimoErro}` : "."}` };
  if (ultimoTesteOk === false) return { estado: "falha", detalhe: `Último teste falhou: ${ultimoErro ?? "sem mensagem"}` };
  if (recusas24h > 0) return { estado: "atencao", detalhe: `${recusas24h} recusa(s) de acesso (401/403) nas últimas 24 h.` };
  if (limite24h > 0) return { estado: "atencao", detalhe: `${limite24h} pedido(s) barrado(s) por limite (429) nas últimas 24 h.` };
  return { estado: "ok", detalhe: "Conectada." };
}

/** O orcamento da IA no mes (`estadoDoOrcamento`): aviso a partir de 80%, esgotado em 100%. */
export function avaliarOrcamento({ nivel, percentual, gastoBrl, tetoBrl } = {}) {
  const reais = (valor) => Number(valor ?? 0).toFixed(2).replace(".", ",");
  const detalhe = `R$ ${reais(gastoBrl)} de R$ ${reais(tetoBrl)} no mês (${Math.round(Number(percentual ?? 0))}%).`;
  if (nivel === "esgotado") return { estado: "falha", detalhe };
  if (nivel === "aviso") return { estado: "atencao", detalhe };
  return { estado: "ok", detalhe };
}

/** As varreduras: em andamento, na fila e as que falharam nas ultimas 24 h (pelo nome da fonte). */
export function avaliarColeta({ emAndamento = 0, naFila = 0, falhas24h = [] } = {}) {
  if (falhas24h.length) {
    const nomes = [...new Set(falhas24h)];
    return { estado: "atencao", detalhe: `${falhas24h.length} varredura${falhas24h.length > 1 ? "s falharam" : " falhou"} nas últimas 24 h: ${nomes.join(", ")}` };
  }
  return { estado: "ok", detalhe: `${emAndamento} em andamento, ${naFila} na fila, nenhuma falha em 24 h.` };
}

/** O Rise do PC (fontes "Varrer pelo PC"): pedido esperando com o PC sem responder e falha. */
export function avaliarPc({ fontesNoPc = 0, pedidosSemResposta = 0, sinalEm = null } = {}, agora) {
  if (!fontesNoPc) return { estado: "aguardando", detalhe: "Nenhuma fonte marcada para varrer pelo PC." };
  if (pedidosSemResposta > 0) {
    return { estado: "falha", detalhe: `${pedidosSemResposta} pedido(s) esperando e o Rise do PC não responde${sinalEm ? ` (último sinal ${quandoFoi(sinalEm, agora)})` : ""}.` };
  }
  return { estado: "ok", detalhe: `${fontesNoPc} fonte(s) pelo PC, nenhum pedido esperando.` };
}

/** As batidas do healthchecks.io (os avisos por e-mail quando o worker, o backup ou o site param). So valem na VPS. */
export function avaliarHealthchecks({ naVps, worker, backup, site, copia } = {}) {
  if (!naVps) return { estado: "aguardando", detalhe: "Só na VPS." };
  const ligados = [worker && "worker", backup && "backup", copia && "cópia externa", site && "site"].filter(Boolean);
  const faltam = [!worker && "worker", !site && "site"].filter(Boolean);
  const detalhe = `${ligados.length ? `Batidas: ${ligados.join(", ")}.` : "Nenhuma batida configurada."}${faltam.length ? ` Sem URL: ${faltam.join(", ")}.` : ""}`;
  return { estado: faltam.length ? "atencao" : "ok", detalhe };
}

/** A linha de detalhe do cartao em Configuracoes: "Tudo certo" ou "2 em vermelho · 1 em amarelo". */
export function resumoDaSaude(itens) {
  const vermelhos = itens.filter((item) => item.estado === "falha").length;
  const amarelos = itens.filter((item) => item.estado === "atencao").length;
  const partes = [vermelhos && `${vermelhos} em vermelho`, amarelos && `${amarelos} em amarelo`].filter(Boolean);
  return partes.length ? partes.join(" · ") : "Tudo certo";
}

/** O pior estado entre os itens; "aguardando" e "info" nao pioram nada. */
export function estadoGeral(itens) {
  let pior = "ok";
  for (const item of itens) if ((ORDEM[item.estado] ?? 0) > ORDEM[pior]) pior = item.estado;
  return pior;
}
