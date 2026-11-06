/**
 * Regras puras das Licencas Softwares (spec 2026-11-05-licencas-softwares-design.md, §6.3). Sem banco e sem rede: o
 * banco (`banco.js`), a leitura do portal (`portal.js`) e a tela usam as mesmas contas.
 *
 * Por que a "vaga livre" so sai do portal: a planilha do dono diz a quem a chave foi vendida, mas so o portal sabe
 * quantos PCs estao ativados de fato (o cliente pode ter trocado de PC, ou nunca ter ativado). Licenca nunca lida do
 * portal mostra "nao lida", nunca "3 livres": vender uma vaga que nao existe e o pior erro que esta tela pode causar.
 *
 * Por que empate nao casa: o casamento linha <-> PC e pelo nome do PC, e dois PCs com o mesmo nome (ou duas linhas com
 * o mesmo nome de PC) nao dizem qual e de quem. Casar o primeiro poria o cliente errado na vaga; a tela mostra o empate
 * e o dono decide.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

export const CANAIS_DA_LICENCA = [
  { valor: "MERCADO_LIVRE", rotulo: "Mercado Livre" },
  { valor: "LOJA_INTEGRADA", rotulo: "Loja Integrada" },
  { valor: "SHOPEE", rotulo: "Shopee" },
  { valor: "DIRETA", rotulo: "Direta" },
];

export function rotuloDoCanal(valor) {
  return CANAIS_DA_LICENCA.find((canal) => canal.valor === valor)?.rotulo ?? (valor ? String(valor) : "");
}

// O portal da LightBurn (Cryptlex) nao tem palavra de situacao: a extensao a deriva de revoked/suspended/expiresAt
// (extensao-lightburn/MEDICAO.md) e manda uma destas quatro.
export const SITUACOES_VALIDAS = ["ACTIVE"];
export const SITUACOES_EXPIRADAS = ["EXPIRED"];
export const ROTULOS_DE_SITUACAO = { SUSPENDED: "Suspensa", REVOKED: "Revogada" };

/** Nome do PC para comparar com o hostname do portal: a planilha deixou `\t` e `\r` e caixa misturada. */
export function normalizarNomeDoPc(texto) {
  if (texto == null) return "";
  return String(texto).replace(/[\t\r\n]/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
}

/** A chave do LightBurn e sempre maiuscula no portal; o nome licenciado do Mach3 ("Mach3 VD60") fica como esta. */
export function normalizarIdentificador(texto, identificacao) {
  const aparado = String(texto ?? "").trim();
  return identificacao === "CHAVE" ? aparado.toUpperCase() : aparado;
}

const ativa = (ativacao) => !ativacao.sumiuEm;

export function vagasLivres({ software, licenca, ativacoes }) {
  const usadas = (ativacoes ?? []).filter(ativa).length;
  const permitidas = licenca?.portalAtivacoesPermitidas ?? software?.ativacoesPermitidas ?? null;
  const lida = Boolean(licenca?.portalLidoEm);
  const livres = !lida || permitidas == null ? null : Math.max(0, permitidas - usadas);
  return { permitidas, usadas, livres, lida };
}

/**
 * Casa cada linha ATIVA com o PC ativado de mesmo nome. Linha sem nome de PC, encerrada ou sem PC fica com `null`;
 * PC sem linha vai para `semCliente`; nome repetido (entre PCs ou entre linhas) vira empate e nao casa.
 */
export function casarLinhasComAtivacoes(linhas, ativacoes) {
  const linhasAtivas = (linhas ?? []).filter((linha) => linha.situacao === "ATIVA");
  const pcs = (ativacoes ?? []).filter(ativa);

  const pcsPorNome = new Map();
  for (const pc of pcs) {
    const nome = normalizarNomeDoPc(pc.hostname);
    if (!nome) continue;
    pcsPorNome.set(nome, [...(pcsPorNome.get(nome) ?? []), pc]);
  }
  const linhasPorNome = new Map();
  for (const linha of linhasAtivas) {
    const nome = normalizarNomeDoPc(linha.nomeDoPc);
    if (!nome) continue;
    linhasPorNome.set(nome, [...(linhasPorNome.get(nome) ?? []), linha]);
  }

  const porLinha = new Map(linhasAtivas.map((linha) => [linha.id, null]));
  const empates = [];
  const casados = new Set();
  const emEmpate = new Set();
  for (const [nome, pcsDoNome] of pcsPorNome) {
    const linhasDoNome = linhasPorNome.get(nome) ?? [];
    if (pcsDoNome.length > 1 || linhasDoNome.length > 1) {
      empates.push({ hostname: nome, linhaIds: linhasDoNome.map((linha) => linha.id) });
      for (const pc of pcsDoNome) emEmpate.add(pc);
      continue;
    }
    if (linhasDoNome.length === 1) {
      porLinha.set(linhasDoNome[0].id, pcsDoNome[0]);
      casados.add(pcsDoNome[0]);
    }
  }
  const semCliente = pcs.filter((pc) => !casados.has(pc) && !emEmpate.has(pc));
  return { porLinha, semCliente, empates };
}

/** O uso mais recente entre os PCs ainda ativados (o portal registra a ultima sincronizacao de cada um). */
export function ultimoUso(ativacoes) {
  let maior = null;
  for (const ativacao of ativacoes ?? []) {
    if (!ativa(ativacao) || !ativacao.ultimaSincronizacaoEm) continue;
    const data = new Date(ativacao.ultimaSincronizacaoEm);
    if (!maior || data > maior) maior = data;
  }
  return maior;
}

const dias = (n) => `${n} dia${n === 1 ? "" : "s"}`;

/**
 * Uma cor e um texto para a licenca com portal. Expirada e cinza, nao vermelha: o LightBurn continua rodando, so as
 * atualizacoes param, e o dono renova ao revender.
 */
export function situacaoDaLicenca({ licenca, software, agora = new Date() }) {
  if (!software?.temPortal) return null;
  if (licenca?.portalSumiuEm) return { cor: "vermelho", texto: "Sumiu do portal" };
  if (!licenca?.portalLidoEm) return { cor: "cinza", texto: "Não lida do portal" };
  const situacao = licenca.portalSituacao ?? "";
  if (!SITUACOES_VALIDAS.includes(situacao) && !SITUACOES_EXPIRADAS.includes(situacao)) {
    return { cor: "vermelho", texto: ROTULOS_DE_SITUACAO[situacao] ?? (situacao || "Situação desconhecida") };
  }
  if (!licenca.portalExpiraEm) return { cor: "verde", texto: "Sem expiração" };
  // `|| 0` troca o -0 do Math.ceil por 0: no dia em que expira, "Expira hoje".
  const restam = Math.ceil((new Date(licenca.portalExpiraEm) - agora) / DIA_MS) || 0;
  if (restam > 30) return { cor: "verde", texto: `Expira em ${dias(restam)}` };
  if (restam >= 0) return { cor: "ambar", texto: restam === 0 ? "Expira hoje" : `Expira em ${dias(restam)}` };
  return { cor: "cinza", texto: `Expirada há ${dias(-restam)}` };
}

/** O dia no calendario de Sao Paulo, como meia-noite UTC: "hoje" e "ha N dias" contam dias de calendario, nao 24 h. */
function diaEmSaoPaulo(data) {
  const texto = new Date(data).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return Date.parse(`${texto}T00:00:00Z`);
}

/** Quao recente e a ultima leitura do portal (o que diz se as vagas livres ainda valem). Prazos: 7 e 30 dias. */
export function frescorDaLeitura(lidaEm, agora = new Date()) {
  if (!lidaEm) return { cor: "vermelho", texto: "Nunca lido do portal" };
  const passados = Math.max(0, Math.round((diaEmSaoPaulo(agora) - diaEmSaoPaulo(lidaEm)) / DIA_MS));
  if (passados === 0) return { cor: "verde", texto: "Lido do portal hoje" };
  const cor = passados <= 7 ? "verde" : passados <= 30 ? "ambar" : "vermelho";
  return { cor, texto: `Lido do portal há ${dias(passados)}` };
}

// Ordem da situacao quando o dono ordena por ela: o que pede acao primeiro (vermelho), depois o que vence logo.
const PESO_DA_COR = { vermelho: 0, ambar: 1, cinza: 2, verde: 3 };

const comparaTexto = (a, b) => String(a).localeCompare(String(b), "pt-BR", { sensitivity: "base", numeric: true });
const tempo = (data) => (data ? new Date(data).getTime() : null);

function valorParaOrdenar(projetada, campo) {
  switch (campo) {
    case "identificador":
      return projetada.identificador ?? null;
    case "tipo":
      return projetada.tipo || null;
    case "situacao":
      return projetada.situacao ? [PESO_DA_COR[projetada.situacao.cor] ?? 9, tempo(projetada.portalExpiraEm) ?? Infinity] : null;
    case "livres":
      return projetada.vagas?.livres ?? null;
    case "ultimoUso":
      return tempo(projetada.ultimoUso);
    case "renovadaEm":
      return tempo(projetada.renovadaEm);
    case "clientes":
      return (projetada.clientes ?? []).map((cliente) => cliente.nome).filter(Boolean).join(", ") || null;
    case "ultimaEntrega":
      return tempo(projetada.ultimaEntrega);
    default:
      return null;
  }
}

function compararValores(a, b) {
  if (Array.isArray(a)) {
    for (let i = 0; i < a.length; i++) {
      const diferenca = compararValores(a[i], b[i]);
      if (diferenca) return diferenca;
    }
    return 0;
  }
  if (typeof a === "number") return a === b ? 0 : a < b ? -1 : 1;
  return comparaTexto(a, b);
}

/**
 * Padrao: mais vagas livres primeiro (as nao lidas por ultimo), depois a de uso mais antigo (nunca usada primeiro: e a
 * melhor para vender), depois a chave. Com `ordenar`, o campo pedido na direcao pedida; vazio vai para o fim nas duas
 * direcoes (padrao das listas do Rise) e o empate cai na chave.
 */
export function ordenarLicencas(projetadas, { ordenar = null, direcao = "asc" } = {}) {
  const lista = [...(projetadas ?? [])];
  const porChave = (a, b) => comparaTexto(a.identificador ?? "", b.identificador ?? "");
  if (!ordenar) {
    return lista.sort((a, b) => {
      const livresA = a.vagas?.livres ?? null;
      const livresB = b.vagas?.livres ?? null;
      if (livresA !== livresB) {
        if (livresA == null) return 1;
        if (livresB == null) return -1;
        return livresB - livresA;
      }
      const usoA = tempo(a.ultimoUso);
      const usoB = tempo(b.ultimoUso);
      if (usoA !== usoB) {
        if (usoA == null) return -1;
        if (usoB == null) return 1;
        return usoA - usoB;
      }
      return porChave(a, b);
    });
  }
  const sinal = direcao === "desc" ? -1 : 1;
  return lista.sort((a, b) => {
    const valorA = valorParaOrdenar(a, ordenar);
    const valorB = valorParaOrdenar(b, ordenar);
    if (valorA == null && valorB == null) return porChave(a, b);
    if (valorA == null) return 1;
    if (valorB == null) return -1;
    return sinal * compararValores(valorA, valorB) || porChave(a, b);
  });
}

/** "2026-11-05" -> meia-noite UTC (campo @db.Date). Texto fora do formato, ou data que nao existe, -> null. */
export function lerDataIso(texto) {
  const casado = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto ?? "").trim());
  if (!casado) return null;
  const data = new Date(Date.UTC(Number(casado[1]), Number(casado[2]) - 1, Number(casado[3])));
  return data.getUTCDate() === Number(casado[3]) && data.getUTCMonth() === Number(casado[2]) - 1 ? data : null;
}

/** dd/mm/aa em UTC: as datas de licenca sao dias (@db.Date), e no fuso de Sao Paulo cairiam no dia anterior. */
export function formatarDataCurta(data) {
  if (!data) return "";
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return "";
  const dois = (n) => String(n).padStart(2, "0");
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${dois(d.getUTCFullYear() % 100)}`;
}

/** O resumo de um "Enviar ao Rise" (popup da extensao, log e cartao de Integracoes). Zeros saem, menos o total. */
export function textoDoResumoDaLeitura({ licencas = 0, novas = 0, alteradas = 0, sumiram = 0, pcsSemCliente = 0 } = {}) {
  const partes = [licencas === 1 ? "1 chave lida" : `${licencas} chaves lidas`];
  if (novas) partes.push(novas === 1 ? "1 nova" : `${novas} novas`);
  if (alteradas) partes.push(alteradas === 1 ? "1 alterada" : `${alteradas} alteradas`);
  if (sumiram) partes.push(sumiram === 1 ? "1 PC sumiu" : `${sumiram} PCs sumiram`);
  if (pcsSemCliente) partes.push(pcsSemCliente === 1 ? "1 PC sem cliente (abra o Rise)" : `${pcsSemCliente} PCs sem cliente (abra o Rise)`);
  return partes.join(" · ");
}
