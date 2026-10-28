/**
 * Ponte entre a pagina (pagina.js, world MAIN) e a extensao (content script ISOLATED). A pagina nao pode chamar o
 * Rise (CORS e a chave): os pedidos vao ao service worker (fundo.js), que so aceita os dois caminhos do Rise. O
 * andamento vai para o `chrome.storage.local`, que o popup le.
 */
chrome.runtime.onMessage.addListener((mensagem) => {
  if (mensagem?.acao === "iniciar") {
    chrome.storage.local.set({ andamento: { rodando: true, texto: "Começando…", em: Date.now() } });
    window.postMessage({ rise: "ALI-PARA-PAGINA", tipo: "iniciar" }, window.location.origin);
  }
});

window.addEventListener("message", async (evento) => {
  if (evento.source !== window || evento.data?.rise !== "ALI-DA-PAGINA") return;
  const { tipo } = evento.data;
  if (tipo === "rise") {
    const resposta = await chrome.runtime.sendMessage({ tipo: "rise", metodo: evento.data.metodo, caminho: evento.data.caminho, corpo: evento.data.corpo });
    window.postMessage({ rise: "ALI-PARA-PAGINA", tipo: "resposta", id: evento.data.id, resposta }, window.location.origin);
  } else if (tipo === "progresso") {
    chrome.storage.local.set({ andamento: { rodando: true, texto: evento.data.texto, em: Date.now() } });
  } else if (tipo === "fim") {
    chrome.storage.local.set({
      andamento: { rodando: false, ok: evento.data.ok, texto: evento.data.ok ? evento.data.texto : evento.data.erro, avisos: evento.data.avisos ?? [], em: Date.now() },
    });
  }
});
