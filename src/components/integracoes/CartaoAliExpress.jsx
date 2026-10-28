"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound, ShoppingBag } from "lucide-react";

import { gerarChaveAliExpressAcao, marcarFornecedorAliExpressAcao } from "@/app/integracoes/acoes";
import Badge from "@/components/ui/Badge";
import BolhaDeAjuda from "@/components/ui/BolhaDeAjuda";
import Card from "@/components/ui/Card";

const formatarData = (valor) =>
  valor ? new Date(valor).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : null;

const COMO_INSTALAR = (
  <>
    <span className="block">1. Gere a chave aqui e copie.</span>
    <span className="block">2. No Chrome, abra chrome://extensions, ligue o Modo do desenvolvedor e use Carregar sem compactação na pasta extensao-aliexpress do projeto.</span>
    <span className="block">3. Clique no ícone da extensão, cole a chave e confira o endereço do Rise.</span>
    <span className="block">4. Toda semana: abra Meus pedidos no AliExpress e clique em Enviar ao Rise.</span>
  </>
);

/**
 * Cartao "AliExpress" em Integracoes (spec 2026-10-28, §6.4). Linha-guia: o operador ve primeiro o estado e a ultima
 * importacao; a acao principal e "Gerar chave da extensao". A chave aparece UMA vez (o banco guarda so o hash).
 */
export default function CartaoAliExpress({ estado, ultimaImportacao, fornecedorMarcado, fornecedores, podeEditar = true }) {
  const [chave, setChave] = useState(null);
  const [copiada, setCopiada] = useState(false);
  const [erro, setErro] = useState(null);
  const [marcado, setMarcado] = useState(fornecedorMarcado?.id ?? "");
  const [pendente, iniciar] = useTransition();

  const gerar = () =>
    iniciar(async () => {
      setErro(null);
      const resposta = await gerarChaveAliExpressAcao();
      if (!resposta?.ok) return setErro(resposta?.erro ?? "Não foi possível gerar a chave.");
      setChave(resposta.chave);
      setCopiada(false);
    });

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(chave);
      setCopiada(true);
    } catch {
      setErro("Não foi possível copiar: selecione a chave e copie com Ctrl+C.");
    }
  };

  const trocarFornecedor = (id) =>
    iniciar(async () => {
      setErro(null);
      const anterior = marcado;
      setMarcado(id);
      const resposta = await marcarFornecedorAliExpressAcao(id);
      if (!resposta?.ok) {
        setMarcado(anterior);
        setErro(resposta?.erro ?? "Não foi possível trocar o fornecedor.");
      }
    });

  return (
    <Card className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="rounded-md bg-fundo p-2 text-acento">
            <ShoppingBag size={18} />
          </span>
          <div>
            <p className="flex items-center gap-1.5 font-medium">
              AliExpress <BolhaDeAjuda variante="inline" texto={COMO_INSTALAR} />
            </p>
            <p className="text-sm text-suave">Compras pela extensão do Chrome</p>
          </div>
        </div>
        <Badge tom={estado.configurada ? "sucesso" : "neutro"}>{estado.configurada ? "Conectado" : "Não configurado"}</Badge>
      </div>

      <dl className="mt-4 space-y-1 text-sm">
        {ultimaImportacao && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-suave">Última importação:</dt>
            <dd className="min-w-0 truncate" title={ultimaImportacao.resumo ?? undefined}>
              {formatarData(ultimaImportacao.em)}
              {ultimaImportacao.resumo && <span className="text-suave"> · {ultimaImportacao.resumo}</span>}
            </dd>
          </div>
        )}
        <div className="flex items-center gap-2">
          <dt className="shrink-0 text-suave">Fornecedor:</dt>
          <dd className="min-w-0 flex-1">
            {podeEditar ? (
              <select
                value={marcado}
                disabled={pendente}
                onChange={(evento) => trocarFornecedor(evento.target.value)}
                aria-label="Fornecedor das compras do AliExpress"
                className="w-full max-w-56 rounded border border-borda bg-superficie px-2 py-1 text-sm focus:border-acento focus:outline-none"
              >
                {!marcado && <option value="">Escolha o fornecedor</option>}
                {fornecedores.map((fornecedor) => (
                  <option key={fornecedor.id} value={fornecedor.id}>
                    {fornecedor.nome}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-medium">{fornecedorMarcado?.nome ?? "—"}</span>
            )}
          </dd>
        </div>
      </dl>

      {estado.ultimoErro && !chave && <p className="mt-3 rounded bg-red-50 p-2 text-xs break-words text-red-800">{estado.ultimoErro}</p>}
      {erro && (
        <p className="mt-3 rounded bg-red-50 p-2 text-xs text-red-800" role="alert">
          {erro}
        </p>
      )}

      {chave && (
        <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 p-2">
          <p className="text-xs font-medium text-emerald-900">Chave nova: cole na extensão. Ela não aparece de novo.</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-superficie px-2 py-1 font-mono text-xs select-all">{chave}</code>
            <button
              type="button"
              onClick={copiar}
              className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
            >
              {copiada ? <Check size={13} /> : <Copy size={13} />}
              {copiada ? "Copiada" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      {podeEditar && (
        <div className="mt-auto pt-4">
          <button
            type="button"
            onClick={gerar}
            disabled={pendente}
            title={estado.configurada ? "Gera outra chave; a que está na extensão deixa de valer" : undefined}
            className="inline-flex items-center gap-1.5 rounded bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            <KeyRound size={14} />
            {estado.configurada ? "Gerar nova chave" : "Gerar chave da extensão"}
          </button>
        </div>
      )}
    </Card>
  );
}
