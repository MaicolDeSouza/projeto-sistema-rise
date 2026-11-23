"use client";

import { useState, useTransition } from "react";
import { Copy, ExternalLink, Loader2 } from "lucide-react";

import { gerarRecargaAcao } from "@/app/envios/acoes";
import Card from "@/components/ui/Card";
import { formatoDeMoeda } from "@/lib/dinheiro";

const moeda = formatoDeMoeda();
const dataHora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const CAMPO = "w-full rounded-md border border-borda bg-superficie px-3 py-2 text-sm focus:border-acento focus:outline-none focus:ring-2 focus:ring-acento/20 aria-[invalid=true]:border-rose-500";

/**
 * O formulario da recarga (23/11/2026): valor (atalhos ou digitado), Pix ou boleto, senha e "Gerar pagamento". O link que
 * volta abre o pagamento no Melhor Envio; o Pix copia e cola ou a linha do boleto, quando vem, ganha o botao Copiar.
 */
export default function FormularioDeRecarga({ situacao, recargas, valoresRapidos, minimo, maximo, podeRecarregar }) {
  const [valor, setValor] = useState(String(valoresRapidos[0]));
  const [forma, setForma] = useState("PIX");
  const [senha, setSenha] = useState("");
  const [resultado, setResultado] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [pendente, iniciar] = useTransition();
  const baixo = situacao.saldo !== null && situacao.saldo < situacao.limite;

  function gerar(evento) {
    evento.preventDefault();
    setResultado(null);
    setCopiado(false);
    iniciar(async () => {
      let resposta;
      try {
        resposta = await gerarRecargaAcao({ valor, forma, senha });
      } catch {
        resposta = { ok: false, erro: "Não foi possível falar com o servidor." };
      }
      setResultado(resposta);
      if (resposta?.ok) setSenha("");
    });
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  const erros = resultado && !resultado.ok ? (resultado.erros ?? {}) : {};
  const recarga = resultado?.ok ? resultado.recarga : null;

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-suave">Saldo atual</span>
          <span className={`text-2xl font-semibold tabular-nums ${baixo ? "text-amber-700" : "text-texto"}`}>{situacao.saldo === null ? "—" : moeda.format(situacao.saldo)}</span>
        </div>
        <p className="mt-1 text-right text-xs text-suave">
          {situacao.lidoEm ? `Lido às ${dataHora.format(new Date(situacao.lidoEm))}` : "Saldo não lido"} · aviso no Telegram abaixo de {moeda.format(situacao.limite)}
        </p>
      </Card>

      {podeRecarregar && (
        <form onSubmit={gerar}>
          <Card>
            <div className="space-y-4">
              <div>
                <span className="mb-1.5 block text-sm font-medium">Valor</span>
                <div className="flex flex-wrap items-center gap-2">
                  {valoresRapidos.map((rapido) => (
                    <button
                      key={rapido}
                      type="button"
                      onClick={() => setValor(String(rapido))}
                      aria-pressed={valor === String(rapido)}
                      className={`rounded-md border px-3 py-1.5 text-sm tabular-nums ${valor === String(rapido) ? "border-acento bg-acento/10 font-medium text-acento" : "border-borda hover:bg-fundo"}`}
                    >
                      {moeda.format(rapido)}
                    </button>
                  ))}
                  <input
                    inputMode="decimal"
                    aria-label="Outro valor"
                    aria-invalid={Boolean(erros.valor)}
                    title={erros.valor ?? `De ${moeda.format(minimo)} a ${moeda.format(maximo)}`}
                    value={valor}
                    onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))}
                    className={`${CAMPO} w-32 text-right tabular-nums`}
                  />
                </div>
                {erros.valor && <p className="mt-1 text-xs text-red-600">{erros.valor}</p>}
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-medium">Forma</span>
                <div className="flex gap-2">
                  {[["PIX", "Pix"], ["BOLETO", "Boleto"]].map(([id, rotulo]) => (
                    <label key={id} className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${forma === id ? "border-acento bg-acento/10 font-medium text-acento" : "border-borda hover:bg-fundo"}`}>
                      <input type="radio" name="forma" value={id} checked={forma === id} onChange={() => setForma(id)} className="sr-only" />
                      {rotulo}
                    </label>
                  ))}
                </div>
              </div>

              <div className="max-w-xs">
                <label htmlFor="senhaDaRecarga" className="mb-1.5 block text-sm font-medium">
                  Senha da recarga
                </label>
                <input
                  id="senhaDaRecarga"
                  type="password"
                  autoComplete="off"
                  aria-invalid={Boolean(erros.senha)}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className={CAMPO}
                />
                {erros.senha && <p className="mt-1 text-xs text-red-600">{erros.senha}</p>}
              </div>

              {resultado && !resultado.ok && !erros.valor && !erros.senha && (
                <p role="alert" className="text-sm text-red-600">
                  {resultado.erro}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={pendente || !senha}
                  title={senha ? undefined : "Digite a senha da recarga"}
                  className="inline-flex items-center gap-1.5 rounded-md bg-acento px-4 py-2 text-sm font-semibold text-white hover:bg-acento/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pendente && <Loader2 size={14} className="animate-spin" />}
                  Gerar pagamento
                </button>
              </div>
            </div>
          </Card>
        </form>
      )}

      {recarga && (
        <Card className="border-emerald-300 bg-emerald-50/60">
          <p className="text-sm font-medium text-emerald-800">
            {recarga.forma === "PIX" ? "Pix" : "Boleto"} de {moeda.format(recarga.valor)} gerado. Pague no Melhor Envio; o saldo entra depois do pagamento.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {recarga.link && (
              <a href={recarga.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                <ExternalLink size={15} /> Abrir pagamento
              </a>
            )}
            {recarga.digitavel && (
              <button type="button" onClick={() => copiar(recarga.digitavel)} className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-100">
                <Copy size={14} /> {copiado ? "Copiado" : recarga.forma === "PIX" ? "Copiar Pix" : "Copiar linha do boleto"}
              </button>
            )}
          </div>
        </Card>
      )}

      {recargas.length > 0 && (
        <Card className="p-0">
          <h2 className="border-b border-borda px-4 py-2.5 text-sm font-semibold">Últimas recargas pedidas pelo Rise</h2>
          <table className="w-full text-sm">
            <tbody>
              {recargas.map((linha) => (
                <tr key={linha.id} className="border-b border-borda last:border-0">
                  <td className="px-4 py-2 text-suave tabular-nums">{dataHora.format(new Date(linha.criadoEm))}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{moeda.format(linha.valor)}</td>
                  <td className="px-4 py-2">{linha.forma === "PIX" ? "Pix" : "Boleto"}</td>
                  <td className="px-4 py-2 text-suave">{linha.pedidoPor ?? "—"}</td>
                  <td className="truncate px-4 py-2" title={linha.erro ?? undefined}>
                    {linha.status === "GERADA" && linha.link ? (
                      <a href={linha.link} target="_blank" rel="noreferrer" className="text-acento hover:underline">
                        Abrir pagamento
                      </a>
                    ) : linha.status === "GERADA" ? (
                      <span className="text-emerald-700">Gerada</span>
                    ) : (
                      <span className="text-red-600">Falhou</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
