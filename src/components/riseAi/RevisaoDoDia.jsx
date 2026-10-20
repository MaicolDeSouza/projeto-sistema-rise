"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader, ThumbsDown } from "lucide-react";

import { carregarConversaParaRevisaoAcao, marcarRevisadaAcao } from "@/app/rise-ai/revisao/acoes";
import ConhecimentoLista from "./ConhecimentoLista";
import ConsultasDoDia from "./ConsultasDoDia";
import MensagemDaIA from "./MensagemDaIA";
import ProporCorrecao from "./ProporCorrecao";
import SugestoesDaIA from "./SugestoesDaIA";
import { custoEmTexto, rotuloDoProvedor } from "./formatos";

const ROTULOS_DA_SUSPEITA = {
  sem_resultado: "IA: sem resultado",
  limite_de_ferramentas: "limite de consultas",
  erro: "erro",
  reserva: "reserva",
};

const rotuloDoModelo = (chave) => {
  const [provedor, ...resto] = chave.split("/");
  return `${rotuloDoProvedor(provedor)} · ${resto.join("/")}`;
};

const SELO = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs";

/** De onde veio a dúvida: só as do MCP têm (o chat interno saiu em 20/10/2026). */
const SeloDoCliente = ({ cliente }) => (cliente ? <span className={`${SELO} bg-violet-100 text-violet-800`}>pelo {cliente}</span> : null);

function Selos({ conversa }) {
  const selo = SELO;
  return (
    <div className="flex flex-wrap gap-1">
      <SeloDoCliente cliente={conversa.cliente} />
      {conversa.sinalizada && (
        <span className={`${selo} bg-red-100 text-red-800`}>
          <ThumbsDown size={11} /> sinalizada
        </span>
      )}
      {conversa.suspeitas.map((suspeita) => (
        <span key={suspeita} className={`${selo} ${suspeita === "reserva" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-800"}`}>
          {ROTULOS_DA_SUSPEITA[suspeita] ?? suspeita}
        </span>
      ))}
      {conversa.revisadaEm && <span className={`${selo} bg-emerald-100 text-emerald-800`}>já revisada</span>}
    </div>
  );
}

/** A conversa aberta à direita: cada resposta da IA inteira (como a equipe a viu), com avaliar e "Propor correção". */
function LeituraDaConversa({ leitura, resumo, aoMarcar, marcando }) {
  if (leitura.carregando) {
    return (
      <p className="flex items-center gap-2 p-4 text-sm text-suave" role="status">
        <Loader size={15} className="animate-spin" /> Abrindo a conversa…
      </p>
    );
  }
  if (leitura.erro) return <p className="p-4 text-sm text-red-700">{leitura.erro}</p>;
  if (!leitura.conversa) return <p className="p-4 text-sm text-suave">Escolha uma conversa à esquerda para ler.</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-borda px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{leitura.conversa.titulo}</h2>
          <p className="flex items-center gap-1.5 text-xs text-suave">
            de {leitura.conversa.usuario} <SeloDoCliente cliente={resumo?.cliente} />
          </p>
        </div>
        <button
          type="button"
          disabled={marcando || Boolean(resumo?.revisadaEm)}
          onClick={aoMarcar}
          className="inline-flex items-center gap-1.5 rounded-md border border-borda px-3 py-1.5 text-xs font-medium hover:bg-fundo disabled:opacity-60"
        >
          <CheckCheck size={14} /> {resumo?.revisadaEm ? "Revisada" : "Marcar como revisada"}
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {leitura.mensagens.map((mensagem) =>
          mensagem.papel === "USUARIO" ? (
            <div key={mensagem.id} className="flex max-w-[85%] flex-col gap-2 self-end rounded-lg bg-acento/10 px-4 py-2.5 text-sm">
              <span className="whitespace-pre-line">{mensagem.conteudo}</span>
              {/* Os arquivos que a pessoa mandou ao Claude/ChatGPT chegam só como o texto que o modelo extraiu (decisão B do dono). */}
              {(mensagem.estruturado?.anexos ?? []).map((anexo, indice) => (
                <details key={indice} className="rounded-md border border-borda bg-superficie px-3 text-xs">
                  <summary className="-mx-3 cursor-pointer rounded-md px-3 py-2 select-none focus-visible:ring-2 focus-visible:ring-acento focus-visible:outline-none focus-visible:ring-inset">
                    📎 {anexo.nome} · {Number(anexo.caracteres ?? anexo.texto?.length ?? 0).toLocaleString("pt-BR")} caracteres
                  </summary>
                  <pre className="max-h-60 overflow-y-auto pb-2 font-sans leading-relaxed whitespace-pre-wrap">{anexo.texto}</pre>
                </details>
              ))}
            </div>
          ) : (
            <MensagemDaIA key={mensagem.id} mensagem={mensagem}>
              <ProporCorrecao mensagem={mensagem} />
            </MensagemDaIA>
          ),
        )}
      </div>
    </div>
  );
}

/**
 * A Revisão do dia (esboço 3A): as conversas do dia — as sinalizadas primeiro —, as sugestões que a IA fez a partir dos
 * 👎 e o conhecimento aprendido. As três abas ficam montadas e só escondidas (o que se digitou numa não se perde ao
 * olhar outra). Só administradores chegam aqui (a página e cada ação conferem no servidor).
 *
 * @param {{ dia: string, hoje: string, conversas: object[], resumo: { custoBrl: number, respostasPorModelo: Record<string, number> },
 *   sugestoes: object[], notas: object[] }} props
 */
export default function RevisaoDoDia({ dia, hoje, conversas, resumo, sugestoes, notas, consultas = [] }) {
  const router = useRouter();
  const [aba, setAba] = useState("conversas");
  const [aberta, setAberta] = useState(null);
  const [leitura, setLeitura] = useState({ carregando: false, erro: null, conversa: null, mensagens: [] });
  const [marcando, iniciar] = useTransition();

  async function abrir(id) {
    setAberta(id);
    setLeitura({ carregando: true, erro: null, conversa: null, mensagens: [] });
    const resultado = await carregarConversaParaRevisaoAcao(id);
    setLeitura(resultado.ok ? { carregando: false, erro: null, conversa: resultado.conversa, mensagens: resultado.mensagens } : { carregando: false, erro: resultado.erro, conversa: null, mensagens: [] });
  }

  function marcar() {
    iniciar(async () => {
      const resultado = await marcarRevisadaAcao(aberta);
      if (!resultado.ok) return setLeitura((atual) => ({ ...atual, erro: resultado.erro }));
      router.refresh();
    });
  }

  const doItemAberto = conversas.find((conversa) => conversa.id === aberta) ?? null;
  const abas = [
    { id: "conversas", rotulo: "Conversas", quantidade: conversas.length },
    { id: "sugestoes", rotulo: "Sugestões da IA", quantidade: sugestoes.length },
    { id: "conhecimento", rotulo: "Conhecimento", quantidade: notas.length },
    { id: "consultas", rotulo: "Consultas", quantidade: consultas.reduce((soma, grupo) => soma + grupo.total, 0) },
  ];
  const modelos = Object.entries(resumo.respostasPorModelo);

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-borda bg-superficie lg:h-full">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-borda px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold">Revisão do dia</h1>
          <input
            type="date"
            value={dia}
            max={hoje}
            onChange={(evento) => evento.target.value && router.push(`/rise-ai/revisao?dia=${evento.target.value}`)}
            aria-label="Dia da revisão"
            className="rounded-md border border-borda bg-fundo px-2 py-1 text-sm"
          />
        </div>
        <nav className="flex gap-1" aria-label="Abas da revisão">
          {abas.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setAba(item.id)}
              aria-current={aba === item.id ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm ${aba === item.id ? "bg-fundo font-medium" : "text-suave hover:bg-fundo hover:text-texto"}`}
            >
              {item.rotulo} ({item.quantidade})
            </button>
          ))}
        </nav>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div hidden={aba !== "conversas"} className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <ul className="max-h-72 shrink-0 overflow-y-auto border-b border-borda p-2 lg:max-h-none lg:w-80 lg:border-r lg:border-b-0" aria-label="Conversas do dia">
            {conversas.length === 0 && <li className="p-3 text-sm text-suave">Nenhuma conversa neste dia.</li>}
            {conversas.map((conversa) => (
              <li key={conversa.id}>
                <button
                  type="button"
                  onClick={() => abrir(conversa.id)}
                  aria-current={aberta === conversa.id ? "true" : undefined}
                  className={`flex w-full flex-col gap-1.5 rounded-md px-2.5 py-2 text-left ${aberta === conversa.id ? "bg-fundo" : "hover:bg-fundo"}`}
                >
                  <span className="truncate text-sm font-medium">{conversa.titulo}</span>
                  <span className="text-xs text-suave">
                    {conversa.usuario} · {conversa.horaInicio} · {conversa.respostas} {conversa.respostas === 1 ? "resposta" : "respostas"} · {custoEmTexto(conversa.custoBrl)}
                  </span>
                  <span className="truncate text-xs text-suave">{conversa.modelos.map(rotuloDoModelo).join(", ")}</span>
                  <Selos conversa={conversa} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex min-h-96 min-w-0 flex-1 flex-col">
            <LeituraDaConversa leitura={leitura} resumo={doItemAberto} aoMarcar={marcar} marcando={marcando} />
          </div>
        </div>

        <div hidden={aba !== "sugestoes"} className="min-h-0 flex-1 overflow-y-auto p-4">
          <SugestoesDaIA sugestoes={sugestoes} />
        </div>
        <div hidden={aba !== "consultas"} className="min-h-0 flex-1 overflow-y-auto p-4">
          <ConsultasDoDia consultas={consultas} />
        </div>
        <div hidden={aba !== "conhecimento"} className="min-h-0 flex-1 overflow-y-auto p-4">
          <ConhecimentoLista notas={notas} />
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-borda px-4 py-2.5 text-xs text-suave">
        <span>
          Custo do dia na API: <strong className="text-texto">{custoEmTexto(resumo.custoBrl)}</strong>
        </span>
        <span>
          Respostas por modelo:{" "}
          {modelos.length === 0 ? "nenhuma" : modelos.map(([chave, quantidade]) => `${rotuloDoModelo(chave)} (${quantidade})`).join(" · ")}
        </span>
      </footer>
    </section>
  );
}
