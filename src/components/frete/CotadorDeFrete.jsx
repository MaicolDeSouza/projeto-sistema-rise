"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Copy, Loader2 } from "lucide-react";

import { cotarFreteAcao } from "@/app/frete/acoes";
import CabecalhoOrdenavel from "@/components/ui/CabecalhoOrdenavel";
import { textoDaCotacao } from "@/lib/frete/regras";

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const prazo = (dias) => (dias ? `${dias} ${dias === 1 ? "dia útil" : "dias úteis"}` : "—");
const paraTexto = (valor) => (valor === null || valor === undefined || valor === "" ? "" : String(valor).replace(".", ","));
const soDecimal = (texto) => texto.replace(/[^\d.,]/g, "");
const formatarCep = (texto) => {
  const digitos = texto.replace(/\D/g, "").slice(0, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
};

const CLASSE = "w-full rounded border border-borda bg-superficie px-2.5 py-1.5 text-sm tabular-nums focus:border-acento focus:outline-none";
const ORDENS = {
  servico: (s) => `${s.transportadora} ${s.servicoNome}`,
  prazo: (s) => s.prazoDias ?? 999,
  custo: (s) => s.preco,
  cobrar: (s) => s.valorACobrar,
};

/**
 * O cotador de frete, igual na Proposta, no Pedido e em Ferramentas (spec 5.3). Linha-guia: o operador ve primeiro o
 * preco e o prazo de cada servico; a acao principal e "Cotar frete" e, depois, escolher um servico (quando quem usa
 * passa `aoEscolher`). Nada aqui grava: quem escolhe decide o que fazer com o servico.
 *
 * `inicial`: { cepDestino, caixaId, pesoKg, valorDeclarado, incompletos, motivo, cidadeDestino }, tudo opcional.
 */
export default function CotadorDeFrete({ caixas, inicial = {}, aoEscolher, rotuloDaEscolha = "Usar" }) {
  const [campos, setCampos] = useState({
    cepDestino: formatarCep(String(inicial.cepDestino ?? "")),
    caixaId: inicial.caixaId ?? (caixas[0]?.id || "outra"),
    comprimentoCm: "",
    larguraCm: "",
    alturaCm: "",
    pesoKg: paraTexto(inicial.pesoKg),
    valorDeclarado: paraTexto(inicial.valorDeclarado),
  });
  const [resultado, setResultado] = useState(null);
  const [erros, setErros] = useState({});
  const [ordem, setOrdem] = useState({ ordenar: null, direcao: "asc" });
  const [copiado, setCopiado] = useState(false);
  const [pendente, iniciar] = useTransition();
  const mudar = (campo, valor) => setCampos((atual) => ({ ...atual, [campo]: valor }));
  const outraMedida = campos.caixaId === "outra";

  function cotar(evento) {
    evento?.preventDefault();
    setErros({});
    iniciar(async () => {
      const resposta = await cotarFreteAcao({ ...campos, caixaId: outraMedida ? null : campos.caixaId });
      if (resposta?.ok) return setResultado(resposta);
      setResultado(null);
      setErros({ ...(resposta?.erros ?? {}), geral: resposta?.erro ?? null, codigo: resposta?.codigo ?? null });
    });
  }

  const servicos = useMemo(() => {
    const lista = resultado?.atendem ?? [];
    if (!ordem.ordenar) return lista;
    const chave = ORDENS[ordem.ordenar];
    const fator = ordem.direcao === "asc" ? 1 : -1;
    return [...lista].sort((a, b) => {
      const [x, y] = [chave(a), chave(b)];
      return (typeof x === "string" ? x.localeCompare(y) : x - y) * fator;
    });
  }, [resultado, ordem]);

  function ordenarPor(campo) {
    setOrdem((atual) =>
      atual.ordenar !== campo ? { ordenar: campo, direcao: "asc" } : atual.direcao === "asc" ? { ordenar: campo, direcao: "desc" } : { ordenar: null, direcao: "asc" },
    );
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoDaCotacao({ cidadeDestino: inicial.cidadeDestino, servicos }));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // Sem permissao da area de transferencia: o texto continua na tela.
    }
  }

  const erroDe = (campo) => erros[campo] && <span className="mt-0.5 block text-xs text-red-600">{erros[campo]}</span>;
  const cabecalho = (campo, rotulo, className) => (
    <CabecalhoOrdenavel campo={campo} rotulo={rotulo} ordenar={ordem.ordenar} direcao={ordem.direcao} aoClicar={ordenarPor} className={className} />
  );

  return (
    <div className="space-y-4">
      <form onSubmit={cotar} className="flex flex-wrap items-start gap-3">
        <label className="w-32 text-xs font-semibold text-suave">
          CEP de destino
          <input value={campos.cepDestino} inputMode="numeric" onChange={(e) => mudar("cepDestino", formatarCep(e.target.value))} placeholder="00000-000" className={`mt-1 ${CLASSE}`} aria-invalid={Boolean(erros.cepDestino)} />
          {erroDe("cepDestino")}
        </label>
        <label className="w-40 text-xs font-semibold text-suave">
          Caixa
          <select value={campos.caixaId} onChange={(e) => mudar("caixaId", e.target.value)} className={`mt-1 ${CLASSE}`}>
            {caixas.map((caixa) => (
              <option key={caixa.id} value={caixa.id}>
                {caixa.nome}
              </option>
            ))}
            <option value="outra">Outra medida</option>
          </select>
          {erroDe("caixaId")}
        </label>
        {outraMedida &&
          [
            ["comprimentoCm", "Compr. (cm)"],
            ["larguraCm", "Larg. (cm)"],
            ["alturaCm", "Alt. (cm)"],
          ].map(([campo, rotulo]) => (
            <label key={campo} className="w-24 text-xs font-semibold text-suave">
              {rotulo}
              <input value={campos[campo]} inputMode="decimal" onChange={(e) => mudar(campo, soDecimal(e.target.value))} className={`mt-1 ${CLASSE}`} aria-invalid={Boolean(erros[campo])} />
              {erroDe(campo)}
            </label>
          ))}
        <label className="w-24 text-xs font-semibold text-suave">
          Peso (kg)
          <input value={campos.pesoKg} inputMode="decimal" onChange={(e) => mudar("pesoKg", soDecimal(e.target.value))} placeholder="0,300" className={`mt-1 ${CLASSE}`} aria-invalid={Boolean(erros.pesoKg)} />
          {erroDe("pesoKg")}
        </label>
        <label className="w-32 text-xs font-semibold text-suave">
          Valor declarado (R$)
          <input value={campos.valorDeclarado} inputMode="decimal" onChange={(e) => mudar("valorDeclarado", soDecimal(e.target.value))} className={`mt-1 ${CLASSE}`} aria-invalid={Boolean(erros.valorDeclarado)} />
          {erroDe("valorDeclarado")}
        </label>
        <button
          type="submit"
          disabled={pendente}
          className="mt-5 inline-flex items-center gap-1.5 rounded bg-acento px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {pendente && <Loader2 size={14} className="animate-spin" />}
          Cotar frete
        </button>
      </form>

      {inicial.incompletos > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-amber-700">
          <AlertTriangle size={15} />
          {inicial.incompletos === 1 ? "1 item sem peso ou medida no cadastro" : `${inicial.incompletos} itens sem peso ou medida no cadastro`}: escolha a caixa e digite o peso.
        </p>
      )}
      {inicial.motivo === "NAO_CABE" && (
        <p className="flex items-center gap-1.5 text-sm text-amber-700">
          <AlertTriangle size={15} /> Os itens não cabem em nenhuma caixa cadastrada.
        </p>
      )}

      {erros.geral && (
        <p role="alert" className="text-sm text-red-600">
          {erros.geral}{" "}
          {erros.codigo === "NAO_CONECTADO" && (
            <Link href="/integracoes" className="underline">
              Abrir Integrações
            </Link>
          )}
        </p>
      )}

      {resultado && (
        <div className="rounded-lg border border-borda">
          {servicos.length === 0 ? (
            <p className="px-4 py-3 text-sm text-suave">Nenhum serviço atende este envio.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-borda text-left text-xs text-suave">
                  <tr>
                    {cabecalho("servico", "Serviço")}
                    {cabecalho("prazo", "Prazo")}
                    {cabecalho("custo", "Custo", "text-right")}
                    {cabecalho("cobrar", "Cobrar do cliente", "text-right")}
                    {aoEscolher && <th className="px-3 py-2.5" aria-label="Escolher" />}
                  </tr>
                </thead>
                <tbody>
                  {servicos.map((servico) => (
                    <tr key={servico.servicoId} className="border-b border-borda last:border-0">
                      <td className="px-3 py-2">
                        <span className="text-suave">{servico.transportadora}</span> <span className="font-medium">{servico.servicoNome}</span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">{prazo(servico.prazoDias)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{moeda.format(servico.preco)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{moeda.format(servico.valorACobrar)}</td>
                      {aoEscolher && (
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => aoEscolher(servico, resultado.pacote, resultado.cotadoEm)}
                            className="rounded border border-acento px-2.5 py-1 text-xs font-medium whitespace-nowrap text-acento hover:bg-acento hover:text-white"
                          >
                            {rotuloDaEscolha}
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borda px-3 py-2 text-xs text-suave">
            {resultado.recusados.length > 0 ? (
              <details>
                <summary className="cursor-pointer">
                  {resultado.recusados.length === 1 ? "1 não atende este envio" : `${resultado.recusados.length} não atendem este envio`}
                </summary>
                <ul className="mt-1 space-y-0.5">
                  {resultado.recusados.map((servico) => (
                    <li key={servico.servicoId}>
                      {servico.transportadora} {servico.servicoNome}: {servico.motivoDaRecusa ?? "sem preço"}
                    </li>
                  ))}
                </ul>
              </details>
            ) : (
              <span />
            )}
            {servicos.length > 0 && (
              <button type="button" onClick={copiar} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-fundo hover:text-texto" title="Copia o texto para mandar ao cliente">
                {copiado ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                {copiado ? "Copiado" : "Copiar"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
