/**
 * Popup da extensao: o botao "Enviar ao Rise" (so na aba do portal de licencas da LightBurn), o andamento lido do
 * `chrome.storage.local` e a configuracao (endereco do Rise e chave gerada no cartao LightBurn de Integracoes).
 */
const PADRAO = "https://rise.4hobby.com.br";
const $ = (id) => document.getElementById(id);

function mostrar(andamento) {
  const caixa = $("situacao");
  if (!andamento) {
    caixa.hidden = true;
    return;
  }
  caixa.hidden = false;
  caixa.className = `situacao${andamento.rodando ? "" : andamento.ok ? " ok" : " erro"}`;
  caixa.textContent = andamento.texto ?? "";
  for (const aviso of andamento.avisos ?? []) {
    const linha = document.createElement("div");
    linha.className = "aviso";
    linha.textContent = aviso;
    caixa.appendChild(linha);
  }
  // Rodando ha menos de 10 min: o botao espera (um clique por vez).
  $("enviar").disabled = Boolean(andamento.rodando && Date.now() - (andamento.em ?? 0) < 10 * 60 * 1000);
}

async function abaDoPortal() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  return aba && /^https:\/\/lightburn\.customer\.cryptlex\.com\//.test(aba.url ?? "") ? aba : null;
}

async function iniciar() {
  const { endereco, chave, andamento } = await chrome.storage.local.get(["endereco", "chave", "andamento"]);
  $("endereco").value = endereco ?? PADRAO;
  $("chave").value = chave ?? "";
  if (!chave) $("config").open = true;
  mostrar(andamento);
  if (!(await abaDoPortal())) {
    $("enviar").disabled = true;
    $("enviar").title = "Abra o portal das licenças da LightBurn e entre";
  }
}

$("enviar").addEventListener("click", async () => {
  const aba = await abaDoPortal();
  if (!aba) return;
  const { chave } = await chrome.storage.local.get(["chave"]);
  if (!chave) {
    $("config").open = true;
    mostrar({ rodando: false, ok: false, texto: "Cole a chave gerada no Rise (Integrações › LightBurn)." });
    return;
  }
  await chrome.tabs.sendMessage(aba.id, { acao: "iniciar" });
});

$("salvar").addEventListener("click", async () => {
  const endereco = $("endereco").value.trim().replace(/\/+$/, "") || PADRAO;
  await chrome.storage.local.set({ endereco, chave: $("chave").value.trim() });
  mostrar({ rodando: false, ok: true, texto: "Configuração salva." });
});

chrome.storage.onChanged.addListener((mudancas) => {
  if (mudancas.andamento) mostrar(mudancas.andamento.newValue);
});

iniciar();
