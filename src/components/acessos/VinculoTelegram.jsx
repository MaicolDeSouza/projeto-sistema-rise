"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

import { confirmarVinculoAcao, conferirVinculoAcao, desvincularTelegramAcao, gerarCodigoDeVinculoAcao } from "@/app/configuracoes/acoes";
import Badge from "@/components/ui/Badge";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";

const SECUNDARIO =
  "inline-flex h-9 items-center gap-1.5 rounded-md border border-borda bg-superficie px-3 text-sm transition-[background-color] duration-150 hover:bg-fundo focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";
const PRINCIPAL =
  "inline-flex h-9 items-center rounded-md bg-acento px-3 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 focus-visible:ring-2 focus-visible:ring-acento focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-50";

const AJUDA =
  "Liga esta pessoa ao Telegram dela, para receber os avisos do Rise. Gere o código, a pessoa abre o bot no Telegram, toca em Iniciar e envia /vincular com o código. Depois confira aqui: aparece o nome e o @ de quem enviou, e você confirma.";

const MOTIVO = {
  "sem-token": "Cadastre o token do bot em Rise AI › Configurações › Canais.",
  "sem-codigo": "Não há código aberto. Gere outro.",
  expirado: "Código vencido. Gere outro.",
  anulado: "Código anulado: cinco tentativas erradas de um chat. Gere outro.",
  "nao-chegou": "Ainda não chegou. Envie a mensagem ao bot e confira de novo.",
};

const horaEMinuto = (iso) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" });

/**
 * O Telegram de um usuario salvo (Entrega C1), na aba Dados, abaixo da Entrada no Rise. So o Administrador chega aqui
 * (a tela e de Usuarios e funcoes). O codigo aparece uma vez; a conferencia le o Telegram uma vez por clique.
 *
 * @param {{ usuarioId: string, ativo: boolean, vinculado: boolean, temToken: boolean }} props
 */
export default function VinculoTelegram({ usuarioId, ativo, vinculado, temToken }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState(null); // { codigo, expiraEm }
  const [achado, setAchado] = useState(null); // { chatId, nome, usuario }
  const [mensagem, setMensagem] = useState(null); // { tipo: "ok" | "erro" | "info", texto }
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const [pendente, iniciar] = useTransition();

  const motivo = !temToken ? MOTIVO["sem-token"] : !ativo ? "Ative o usuário (e salve) antes de vincular o Telegram." : null;

  function gerar() {
    setMensagem(null);
    setAchado(null);
    iniciar(async () => {
      const resultado = await gerarCodigoDeVinculoAcao(usuarioId);
      if (!resultado.ok) return setMensagem({ tipo: "erro", texto: resultado.erro });
      setCodigo({ codigo: resultado.codigo, expiraEm: resultado.expiraEm });
    });
  }

  function conferir() {
    setMensagem(null);
    setAchado(null);
    iniciar(async () => {
      const resultado = await conferirVinculoAcao(usuarioId);
      if (resultado.ok) return setAchado(resultado.chat);
      if (resultado.motivo === "telegram") return setMensagem({ tipo: "erro", texto: `Telegram: ${resultado.erro}` });
      if (resultado.motivo && MOTIVO[resultado.motivo]) {
        if (resultado.motivo !== "nao-chegou") setCodigo(null);
        return setMensagem({ tipo: resultado.motivo === "nao-chegou" ? "info" : "erro", texto: MOTIVO[resultado.motivo] });
      }
      setMensagem({ tipo: "erro", texto: resultado.erro ?? "Não foi possível conferir." });
    });
  }

  function confirmar() {
    iniciar(async () => {
      const resultado = await confirmarVinculoAcao(usuarioId, achado.chatId);
      if (!resultado.ok) return setMensagem({ tipo: "erro", texto: resultado.erro });
      setCodigo(null);
      setAchado(null);
      setMensagem({ tipo: resultado.aviso ? "erro" : "ok", texto: resultado.aviso ?? "Telegram vinculado. A mensagem de boas-vindas chegou no celular." });
      router.refresh();
    });
  }

  function desvincular() {
    if (!confirmandoSaida) return setConfirmandoSaida(true);
    setConfirmandoSaida(false);
    iniciar(async () => {
      const resultado = await desvincularTelegramAcao(usuarioId);
      if (!resultado.ok) return setMensagem({ tipo: "erro", texto: resultado.erro });
      setMensagem({ tipo: "ok", texto: "Telegram desvinculado. Os avisos deixam de chegar." });
      router.refresh();
    });
  }

  return (
    <section className="border-t border-borda px-5 py-4">
      <h2 className="mb-2 flex items-center gap-1 text-sm font-medium">
        Telegram
        <BolhaDeAjuda variante="inline" texto={AJUDA} />
      </h2>

      {vinculado ? (
        <div className="flex flex-wrap items-center gap-3">
          <Send size={16} className="text-suave" aria-hidden="true" />
          <Badge tom="sucesso">Telegram vinculado</Badge>
          <button type="button" onClick={desvincular} disabled={pendente} className="h-9 rounded-md px-2 text-sm text-red-700 transition-[background-color] duration-150 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none disabled:opacity-50">
            {confirmandoSaida ? "Clique de novo para desvincular" : "Desvincular"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Send size={16} className="text-suave" aria-hidden="true" />
            <span className="text-sm text-suave">Sem Telegram vinculado</span>
            <button type="button" onClick={gerar} disabled={pendente || Boolean(motivo)} title={motivo ?? undefined} className={codigo ? SECUNDARIO : PRINCIPAL}>
              {codigo ? "Gerar outro código" : "Gerar código"}
            </button>
          </div>

          {codigo && !achado && (
            <div className="flex flex-col gap-2 rounded-md border border-borda bg-fundo px-3 py-3">
              <p className="text-sm">
                No Telegram, abra o bot e envie: <code className="rounded bg-superficie px-1.5 py-0.5 font-mono text-[15px] tracking-wider select-all">/vincular {codigo.codigo}</code>
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs text-suave tabular-nums">Vale até {horaEMinuto(codigo.expiraEm)}</span>
                <button type="button" onClick={conferir} disabled={pendente} className={PRINCIPAL}>
                  {pendente ? "Conferindo…" : "Conferir vínculo"}
                </button>
              </div>
            </div>
          )}

          {achado && (
            <div className="flex flex-col gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-3">
              <p className="text-sm">
                Chat encontrado: <strong>{achado.nome}</strong>
                {achado.usuario && <span className="text-suave"> (@{achado.usuario})</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={confirmar} disabled={pendente} className={PRINCIPAL}>
                  {pendente ? "Vinculando…" : "Confirmar vínculo"}
                </button>
                <button type="button" onClick={() => setAchado(null)} disabled={pendente} className={SECUNDARIO}>
                  Não é este
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {mensagem && (
        <p className={`mt-2 text-xs ${mensagem.tipo === "ok" ? "text-emerald-700" : mensagem.tipo === "info" ? "text-suave" : "text-red-700"}`} role="status">
          {mensagem.texto}
        </p>
      )}
    </section>
  );
}
