/**
 * Leitura das respostas da API do portal de licencas da LightBurn (Cryptlex) para a extensao "Rise LightBurn" (spec
 * docs/superpowers/specs/2026-11-05-licencas-softwares-design.md, §6.4). Funcoes puras, sem rede e sem DOM: a pagina
 * usa, e o teste (scripts/teste-extensao-lightburn.js) carrega este arquivo como o Chrome carrega.
 *
 * Os formatos foram medidos ao vivo em 05/11/2026 (extensao-lightburn/MEDICAO.md): `/v3/me/licenses` e
 * `/v3/me/activations` devolvem arrays; a situacao nao vem pronta (deriva de revoked/suspended/expiresAt); Core e Pro
 * nao existem no portal. So sai daqui o que o Rise usa: nunca o e-mail, o nome nem o id de quem esta logado, e nunca a
 * localizacao do PC do cliente.
 */
(function () {
  const PROIBIDAS = new Set(["email", "name", "location", "userid"]);

  /** Data do portal ("2025-10-06T17:58:20.256388Z") -> ISO com milissegundos; o que nao e data -> null. */
  function dataIso(valor) {
    if (!valor) return null;
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? null : data.toISOString();
  }

  /** Copia rasa sem o que identifica a pessoa logada nem o lugar do PC (`email`, `name`, `userId`, `user*`, `location`). */
  function limparDados(json) {
    const limpo = {};
    for (const [chave, valor] of Object.entries(json ?? {})) {
      const nome = chave.toLowerCase();
      if (PROIBIDAS.has(nome) || nome.startsWith("user")) continue;
      limpo[chave] = valor;
    }
    return limpo;
  }

  /** A regra medida: revogada, suspensa, expirada pela data, senao ativa. */
  function situacaoDoPortal(licenca, agora = new Date()) {
    if (licenca?.revoked) return "REVOKED";
    if (licenca?.suspended) return "SUSPENDED";
    const expira = licenca?.expiresAt ? new Date(licenca.expiresAt) : null;
    if (expira && !Number.isNaN(expira.getTime()) && expira.getTime() < new Date(agora).getTime()) return "EXPIRED";
    return "ACTIVE";
  }

  /** O portal nao diferencia Core de Pro (medido: todos os campos iguais nos dois). O tipo fica com o Rise. */
  function tipoDoPortal() {
    return null;
  }

  const inteiroOuNulo = (valor) => (Number.isInteger(valor) && valor >= 0 ? valor : null);

  function licencaDoPortal(json, agora = new Date()) {
    return {
      idNoPortal: json?.id ? String(json.id) : null,
      chave: String(json?.key ?? "").trim(),
      situacao: situacaoDoPortal(json, agora),
      expiraEm: dataIso(json?.expiresAt),
      criadaEm: dataIso(json?.createdAt),
      ativacoesUsadas: inteiroOuNulo(json?.totalActivations),
      ativacoesPermitidas: inteiroOuNulo(json?.allowedActivations),
      tipo: tipoDoPortal(json),
      dados: limparDados({
        type: json?.type ?? null,
        perpetual: json?.perpetual ?? null,
        validity: json?.validity ?? null,
        allowedDeactivations: json?.allowedDeactivations ?? null,
        totalDeactivations: json?.totalDeactivations ?? null,
        leaseDuration: json?.leaseDuration ?? null,
        effectiveDate: json?.effectiveDate ?? null,
        updatedAt: json?.updatedAt ?? null,
        productId: json?.product?.id ?? null,
      }),
    };
  }

  function ativacaoDoPortal(json) {
    const so = [json?.os, json?.osVersion].filter(Boolean).join(" ").trim();
    return {
      idNoPortal: json?.id ? String(json.id) : null,
      hostname: String(json?.hostname ?? "").trim().slice(0, 200),
      so: so || null,
      criadaEm: dataIso(json?.createdAt),
      ultimaSincronizacaoEm: dataIso(json?.lastSyncedAt),
      leaseExpiraEm: dataIso(json?.leaseExpiresAt),
      dados: limparDados({
        offline: json?.offline ?? null,
        container: json?.container ?? null,
        vmName: json?.vmName ?? null,
        appVersion: json?.appVersion ?? null,
        releaseVersion: json?.releaseVersion ?? null,
        expiresAt: json?.expiresAt ?? null,
        updatedAt: json?.updatedAt ?? null,
      }),
    };
  }

  /** A lista de ativacoes vem da conta inteira, cada uma com o `licenseId`: agrupa por licenca. */
  function agruparAtivacoes(ativacoes) {
    const porLicenca = {};
    for (const ativacao of ativacoes ?? []) {
      const id = ativacao?.licenseId ? String(ativacao.licenseId) : null;
      if (!id) continue;
      (porLicenca[id] ??= []).push(ativacao);
    }
    return porLicenca;
  }

  /** O corpo do POST /api/licencas/lightburn/importar (o esquema do Rise descarta o que nao conhece). */
  function montarPayload({ licencas, ativacoesPorLicenca, completa, versao, agora = new Date() }) {
    return {
      versao: String(versao ?? ""),
      lidoEm: new Date(agora).toISOString(),
      completa: Boolean(completa),
      licencas: (licencas ?? [])
        .filter((licenca) => String(licenca?.key ?? "").trim().length >= 4)
        .map((licenca) => ({
          ...licencaDoPortal(licenca, agora),
          ativacoes: ((ativacoesPorLicenca ?? {})[licenca.id] ?? []).map(ativacaoDoPortal).filter((ativacao) => ativacao.hostname),
        })),
    };
  }

  /** O resumo que o Rise devolve, como o popup mostra (o mesmo texto do Rise, em src/lib/ferramentas/licencas/regras.js). */
  function textoDoResumo({ licencas = 0, novas = 0, alteradas = 0, sumiram = 0, pcsSemCliente = 0 } = {}) {
    const partes = [licencas === 1 ? "1 chave lida" : `${licencas} chaves lidas`];
    if (novas) partes.push(novas === 1 ? "1 nova" : `${novas} novas`);
    if (alteradas) partes.push(alteradas === 1 ? "1 alterada" : `${alteradas} alteradas`);
    if (sumiram) partes.push(sumiram === 1 ? "1 PC sumiu" : `${sumiram} PCs sumiram`);
    if (pcsSemCliente) partes.push(pcsSemCliente === 1 ? "1 PC sem cliente (abra o Rise)" : `${pcsSemCliente} PCs sem cliente (abra o Rise)`);
    return partes.join(" · ");
  }

  /**
   * O endereco da API que a pagina guarda (`localStorage.apiBaseUrl`), so se for da Cryptlex: o token da sessao vai nos
   * pedidos, e uma pagina alterada nao pode desviar o token para outro lugar.
   */
  function baseDaApi(valor) {
    const casado = /^(https:\/\/api(?:-eu)?\.cryptlex\.com)\/?$/.exec(String(valor ?? "").trim());
    return casado ? casado[1] : "https://api.cryptlex.com";
  }

  globalThis.RiseLeituraLB = { dataIso, limparDados, situacaoDoPortal, tipoDoPortal, licencaDoPortal, ativacaoDoPortal, agruparAtivacoes, montarPayload, textoDoResumo, baseDaApi };
})();
