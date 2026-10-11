"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb, Sparkles } from "lucide-react";

import { gerarSugestaoAcao, proporCorrecaoAcao } from "@/app/rise-ai/revisao/acoes";

const campo = "w-full rounded-md border border-borda bg-superficie px-2 py-1.5 text-sm";

/**
 * "Propor correção", embaixo de uma resposta da IA — só para administrador (a Revisão e o chat do dono). O
 * administrador escreve o que estava errado e a regra certa; ao "Aprovar e guardar" a nota já vale nas próximas
 * respostas, com o nome dele. Quem só conversa (a esposa) não vê este quadro: ela sinaliza com o 👎 e a IA propõe a
 * regra para o dono aprovar.
 *
 * Numa resposta sinalizada (👎), também oferece "Pedir sugestão à IA" (a automática pode ter falhado).
 *
 * @param {{ mensagem: { id: string, avaliacao: number | null, avisos?: string[] } }} props
 */
export default function ProporCorrecao({ mensagem }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [problema, setProblema] = useState("");
  const [regra, setRegra] = useState("");
  const [produtos, setProdutos] = useState("");
  const [fonte, setFonte] = useState("");
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [pendente, iniciar] = useTransition();

  function limpar() {
    setAberto(false);
    setProblema("");
    setRegra("");
    setProdutos("");
    setFonte("");
    setErro(null);
  }

  function guardar(evento) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("mensagemId", mensagem.id);
    dados.set("problema", problema);
    dados.set("regra", regra);
    dados.set("produtos", produtos);
    dados.set("fonte", fonte);
    iniciar(async () => {
      const resultado = await proporCorrecaoAcao(dados);
      if (!resultado.ok) return setErro(resultado.erro);
      limpar();
      setAviso("Correção guardada: já vale nas próximas respostas.");
      router.refresh();
    });
  }

  function pedirSugestao() {
    setAviso(null);
    setErro(null);
    iniciar(async () => {
      const resultado = await gerarSugestaoAcao(mensagem.id);
      if (!resultado.ok) return setErro(resultado.erro);
      setAviso("Sugestão da IA pronta: veja na aba Sugestões da IA.");
      router.refresh();
    });
  }

  const botao = "inline-flex items-center gap-1 rounded-md border border-borda px-2 py-1 text-xs text-suave hover:bg-superficie disabled:opacity-60";

  return (
    <div className="flex flex-col gap-2 border-t border-borda pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setAberto((valor) => !valor)} aria-expanded={aberto} className={botao}>
          <Lightbulb size={13} /> Propor correção
        </button>
        {mensagem.avaliacao === -1 && (
          <button type="button" disabled={pendente} onClick={pedirSugestao} className={botao} title="A IA lê a conversa e propõe a regra; só vale quando você aprova">
            <Sparkles size={13} /> {pendente ? "Pedindo…" : "Pedir sugestão à IA"}
          </button>
        )}
        {aviso && <span className="text-xs text-emerald-700">{aviso}</span>}
      </div>

      {aberto && (
        <form onSubmit={guardar} className="flex flex-col gap-2 rounded-md border border-borda bg-superficie p-3">
          <label className="text-xs font-medium">
            O que estava errado?
            <input value={problema} onChange={(evento) => setProblema(evento.target.value)} maxLength={120} className={`${campo} mt-1 font-normal`} placeholder="Ex.: indicou o Mega para ligar um LED" />
          </label>
          <label className="text-xs font-medium">
            Qual é a regra certa?
            <textarea value={regra} onChange={(evento) => setRegra(evento.target.value)} rows={3} maxLength={4000} className={`${campo} mt-1 font-normal`} placeholder="Ex.: Para projeto simples, indique o Uno ou o Nano; o Mega só com muitos pinos." />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium">
              Produtos (códigos, separados por vírgula)
              <input value={produtos} onChange={(evento) => setProdutos(evento.target.value)} className={`${campo} mt-1 font-normal`} placeholder="100101, 100105" />
            </label>
            <label className="text-xs font-medium">
              Fonte (opcional)
              <input value={fonte} onChange={(evento) => setFonte(evento.target.value)} className={`${campo} mt-1 font-normal`} placeholder="Ex.: ficha do fabricante" />
            </label>
          </div>
          {erro && <p className="text-xs text-red-700">{erro}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={pendente || !problema.trim() || !regra.trim()} className="rounded-md bg-acento px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
              Aprovar e guardar
            </button>
            <button type="button" onClick={limpar} className="rounded-md border border-borda px-3 py-1.5 text-xs text-suave hover:bg-fundo">
              Descartar
            </button>
          </div>
        </form>
      )}
      {!aberto && erro && <p className="text-xs text-red-700">{erro}</p>}
    </div>
  );
}
