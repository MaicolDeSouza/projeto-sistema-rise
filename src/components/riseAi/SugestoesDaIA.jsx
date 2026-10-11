"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";

import { aprovarSugestaoAcao, rejeitarSugestaoAcao } from "@/app/rise-ai/revisao/acoes";
import { rotuloDoProvedor } from "./formatos";

const campo = "w-full rounded-md border border-borda bg-superficie px-2 py-1.5 text-sm";

const ROTULOS_DO_TIPO = {
  resposta_errada: "resposta errada",
  produto_errado: "produto errado",
  faltou_informacao: "faltou informação",
  preco_ou_estoque: "preço ou estoque",
  tom_ou_formato: "tom ou formato",
  outro: "outro",
};

/** Verde a partir de 70, âmbar de 40 a 69, vermelho abaixo: o dono sabe o quanto confiar antes de ler. */
function Confianca({ valor }) {
  if (valor === null || valor === undefined) return null;
  const cor = valor >= 70 ? "bg-emerald-100 text-emerald-800" : valor >= 40 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cor}`}>confiança {valor}%</span>;
}

function CartaoDeSugestao({ sugestao }) {
  const router = useRouter();
  const [modo, setModo] = useState("ler"); // "ler" | "editar" | "rejeitar"
  const [assunto, setAssunto] = useState(sugestao.problema.slice(0, 120));
  const [conteudo, setConteudo] = useState(sugestao.correcaoSugerida);
  const [produtos, setProdutos] = useState(sugestao.produtos.join(", "));
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState(null);
  const [pendente, iniciar] = useTransition();

  function decidir(acao, dados) {
    iniciar(async () => {
      const resultado = await acao(sugestao.id, dados);
      if (!resultado.ok) return setErro(resultado.erro);
      router.refresh();
    });
  }

  const aprovarComoEsta = () => decidir(aprovarSugestaoAcao, new FormData());
  function aprovarEditada(evento) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("assunto", assunto);
    dados.set("conteudo", conteudo);
    dados.set("produtos", produtos);
    decidir(aprovarSugestaoAcao, dados);
  }
  function rejeitar(evento) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("motivo", motivo);
    decidir(rejeitarSugestaoAcao, dados);
  }

  const nomeDoProduto = new Map(sugestao.produtosDaResposta.map((produto) => [produto.sku.toUpperCase(), produto.nome]));
  const geradaPor = sugestao.geradaPor ? `${rotuloDoProvedor(sugestao.geradaPor.provedor)} · ${sugestao.geradaPor.modelo}` : null;

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-borda bg-fundo p-4">
      <header className="flex flex-wrap items-center gap-2 text-xs text-suave">
        <span className="font-medium text-texto">{sugestao.conversa.titulo}</span>
        <span>· de {sugestao.conversa.usuario}</span>
        {sugestao.tipo && <span className="rounded-full bg-superficie px-2 py-0.5">{ROTULOS_DO_TIPO[sugestao.tipo] ?? sugestao.tipo}</span>}
        <Confianca valor={sugestao.confianca} />
        {geradaPor && <span title="Quem propôs esta sugestão">proposta por {geradaPor}</span>}
      </header>

      {sugestao.pergunta && (
        <div>
          <p className="text-xs font-medium tracking-wide text-suave uppercase">Pergunta original</p>
          <p className="mt-1 text-sm whitespace-pre-line">{sugestao.pergunta}</p>
        </div>
      )}
      {sugestao.resposta && (
        <div>
          <p className="text-xs font-medium tracking-wide text-suave uppercase">Resposta dada</p>
          <p className="mt-1 rounded-md border border-borda bg-superficie p-2 text-sm whitespace-pre-line">{sugestao.resposta}</p>
        </div>
      )}
      {sugestao.comentario && (
        <p className="text-sm">
          <span className="text-xs font-medium tracking-wide text-suave uppercase">Comentário de quem sinalizou </span>
          “{sugestao.comentario}”
        </p>
      )}

      <div className="rounded-md border border-l-4 border-borda border-l-acento bg-superficie p-3">
        <p className="text-xs font-medium tracking-wide text-suave uppercase">O que estava errado</p>
        <p className="mt-1 text-sm">{sugestao.problema}</p>
        <p className="mt-3 text-xs font-medium tracking-wide text-suave uppercase">Correção sugerida</p>
        <p className="mt-1 text-sm whitespace-pre-line">{sugestao.correcaoSugerida}</p>
        {sugestao.justificativa && (
          <>
            <p className="mt-3 text-xs font-medium tracking-wide text-suave uppercase">Justificativa</p>
            <p className="mt-1 text-sm text-suave">{sugestao.justificativa}</p>
          </>
        )}
        {sugestao.produtos.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-suave">
            Produtos:
            {sugestao.produtos.map((sku) => (
              <span key={sku} className="rounded-full bg-fundo px-2 py-0.5" title={nomeDoProduto.get(sku) ?? undefined}>
                {sku}
              </span>
            ))}
          </p>
        )}
      </div>

      {modo === "ler" && (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pendente} onClick={aprovarComoEsta} className="inline-flex items-center gap-1 rounded-md bg-acento px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
            <Check size={13} /> Aprovar
          </button>
          <button type="button" disabled={pendente} onClick={() => setModo("editar")} className="inline-flex items-center gap-1 rounded-md border border-borda px-3 py-1.5 text-xs hover:bg-superficie">
            <Pencil size={13} /> Editar antes
          </button>
          <button type="button" disabled={pendente} onClick={() => setModo("rejeitar")} className="inline-flex items-center gap-1 rounded-md border border-borda px-3 py-1.5 text-xs text-red-700 hover:bg-superficie">
            <X size={13} /> Rejeitar
          </button>
        </div>
      )}

      {modo === "editar" && (
        <form onSubmit={aprovarEditada} className="flex flex-col gap-2 rounded-md border border-borda bg-superficie p-3">
          <label className="text-xs font-medium">
            Assunto
            <input value={assunto} onChange={(evento) => setAssunto(evento.target.value)} maxLength={120} className={`${campo} mt-1 font-normal`} />
          </label>
          <label className="text-xs font-medium">
            Regra que vai valer
            <textarea value={conteudo} onChange={(evento) => setConteudo(evento.target.value)} rows={4} maxLength={4000} className={`${campo} mt-1 font-normal`} />
          </label>
          <label className="text-xs font-medium">
            Produtos (códigos, separados por vírgula)
            <input value={produtos} onChange={(evento) => setProdutos(evento.target.value)} className={`${campo} mt-1 font-normal`} />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={pendente} className="rounded-md bg-acento px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
              Aprovar com esta edição
            </button>
            <button type="button" onClick={() => setModo("ler")} className="rounded-md border border-borda px-3 py-1.5 text-xs text-suave hover:bg-fundo">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {modo === "rejeitar" && (
        <form onSubmit={rejeitar} className="flex flex-col gap-2 rounded-md border border-borda bg-superficie p-3">
          <label className="text-xs font-medium">
            Por que não vale? (opcional)
            <input value={motivo} onChange={(evento) => setMotivo(evento.target.value)} maxLength={500} className={`${campo} mt-1 font-normal`} placeholder="Ex.: foi só desse cliente, não é regra" />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={pendente} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
              Rejeitar
            </button>
            <button type="button" onClick={() => setModo("ler")} className="rounded-md border border-borda px-3 py-1.5 text-xs text-suave hover:bg-fundo">
              Cancelar
            </button>
          </div>
        </form>
      )}
      {erro && <p className="text-xs text-red-700">{erro}</p>}
    </article>
  );
}

/**
 * A aba "Sugestões da IA": o que a IA propôs a partir dos 👎, para o dono decidir. Nada aqui vale nas respostas até a
 * aprovação — "Aprovar" cria a nota de conhecimento com o nome de quem aprovou.
 *
 * @param {{ sugestoes: object[] }} props  as pendentes, já prontas para a tela (`listarSugestoes`)
 */
export default function SugestoesDaIA({ sugestoes }) {
  if (sugestoes.length === 0) {
    return <p className="rounded-lg border border-dashed border-borda p-6 text-center text-sm text-suave">Nenhuma sugestão esperando. Quando alguém sinalizar uma resposta com 👎, a IA propõe a correção e ela aparece aqui.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {sugestoes.map((sugestao) => (
        <CartaoDeSugestao key={sugestao.id} sugestao={sugestao} />
      ))}
    </div>
  );
}
