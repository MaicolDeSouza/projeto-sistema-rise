"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Plug } from "lucide-react";

import { habilitarModelosAcao, removerChaveAcao, salvarAbaAcao, salvarChaveAcao, testarProvedorAcao } from "@/app/rise-ai/configuracoes/acoes";
import Campo, { CLASSE_CAMPO, bordaDoCampo } from "@/components/cadastros/Campo";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { duracaoEmTexto } from "./formatos";

const diaEMes = (iso) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const botao = "rounded-md border border-borda px-3 py-1.5 text-sm hover:bg-fundo disabled:opacity-60";
const botaoPrincipal = "rounded-md bg-acento px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60";

/**
 * O cartão de UM provedor de IA: endereço, chave (só de escrita), teste de conexão e modelos habilitados. O que se
 * habilita aqui é o que aparece nas listas Padrão e Reserva.
 *
 * A chave vai num `FormData` e NUNCA volta para a tela: só "cadastrada em dd/mm" e de onde ela vem. Cada botão grava
 * por conta própria e relê a tela (`router.refresh`).
 *
 * @param {{ provedor: { id: string, rotulo: string, precisaDeChave: boolean, local: boolean, enderecoFixo: boolean, endpoint: string,
 *   endpointPadrao: string, habilitados: string[], sugeridos: string[],
 *   chave: { cadastrada: boolean, origem: "conexao" | "env" | null, em: string | null, ultimoTesteEm: string | null, ultimoTesteOk: boolean | null, ultimoErro: string | null } } }} props
 */
export default function CartaoDeProvedor({ provedor }) {
  const router = useRouter();
  const [endpoint, setEndpoint] = useState(provedor.endpoint);
  const [chave, setChave] = useState("");
  const [teste, setTeste] = useState(null); // { ok, latenciaMs, modelos, erro }
  const [marcados, setMarcados] = useState(() => new Set(provedor.habilitados));
  const [outroModelo, setOutroModelo] = useState("");
  const [extras, setExtras] = useState([]);
  const [aviso, setAviso] = useState(null); // { tipo: "ok" | "erro", texto }
  const [erros, setErros] = useState({});
  const [pendente, iniciar] = useTransition();

  const modelosDaLista = [...new Set([...provedor.sugeridos, ...provedor.habilitados, ...(teste?.modelos ?? []).map((modelo) => modelo.id), ...extras])];

  function executar(acao, depois) {
    setAviso(null);
    setErros({});
    iniciar(async () => {
      const resultado = await acao();
      if (!resultado.ok) {
        setErros(resultado.erros ?? {});
        return setAviso({ tipo: "erro", texto: resultado.erro });
      }
      depois?.(resultado);
      router.refresh();
    });
  }

  function salvarEndpoint() {
    const dados = new FormData();
    dados.set(`endpoint.${provedor.id}`, endpoint);
    executar(() => salvarAbaAcao("modelos", dados), () => setAviso({ tipo: "ok", texto: "Endereço salvo." }));
  }

  function guardarChave(evento) {
    evento.preventDefault();
    const dados = new FormData();
    dados.set("chave", chave);
    executar(() => salvarChaveAcao(provedor.id, dados), () => {
      setChave("");
      setAviso({ tipo: "ok", texto: "Chave guardada. Use Testar conexão para conferir." });
    });
  }

  function testar() {
    setAviso(null);
    iniciar(async () => {
      const resultado = await testarProvedorAcao(provedor.id);
      setTeste({ ok: Boolean(resultado.ok), latenciaMs: resultado.latenciaMs ?? null, modelos: resultado.modelos ?? [], erro: resultado.erro ?? null });
      router.refresh();
    });
  }

  function salvarModelos() {
    const dados = new FormData();
    for (const id of marcados) dados.append("modelo", id);
    executar(() => habilitarModelosAcao(provedor.id, dados), () => setAviso({ tipo: "ok", texto: "Modelos habilitados salvos." }));
  }

  function alternar(id) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function adicionarModelo() {
    const id = outroModelo.trim();
    if (!id) return;
    setExtras((atual) => [...atual, id]);
    setMarcados((atual) => new Set(atual).add(id));
    setOutroModelo("");
  }

  const origemDaChave = provedor.chave.origem === "conexao" ? "cadastrada nesta tela" : "vem do arquivo .env do servidor";
  const ultimoTeste = provedor.chave.ultimoTesteEm ? `${provedor.chave.ultimoTesteOk ? "conectou" : "falhou"} em ${diaEMes(provedor.chave.ultimoTesteEm)}` : null;

  return (
    <Card className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Plug size={16} className="text-suave" /> {provedor.rotulo}
          <Badge tom={provedor.local ? "info" : "neutro"}>{provedor.local ? "no seu PC" : "API"}</Badge>
        </h3>
        {ultimoTeste && <Badge tom={provedor.chave.ultimoTesteOk ? "sucesso" : "erro"}>último teste: {ultimoTeste}</Badge>}
      </header>

      {provedor.enderecoFixo ? (
        <p className="text-xs text-suave">Endereço fixo no Rise ({provedor.endpoint}): a chave só é enviada para o servidor oficial.</p>
      ) : (
        <Campo nome={`endpoint-${provedor.id}`} rotulo="Endereço" erro={erros[`endpoints.${provedor.id}`]} ajuda="O endereço da API do provedor. No LM Studio e no Ollama é o do servidor local; na VPS, o túnel do seu PC.">
          <div className="flex gap-2">
            <input
              id={`endpoint-${provedor.id}`}
              value={endpoint}
              onChange={(evento) => setEndpoint(evento.target.value)}
              className={`${CLASSE_CAMPO} ${bordaDoCampo(erros[`endpoints.${provedor.id}`])}`}
              spellCheck={false}
            />
            <button type="button" disabled={pendente || endpoint.trim() === provedor.endpoint} onClick={salvarEndpoint} className={`${botao} mt-1 shrink-0`}>
              Salvar
            </button>
          </div>
          {endpoint !== provedor.endpointPadrao && (
            <button type="button" onClick={() => setEndpoint(provedor.endpointPadrao)} className="mt-1 text-xs text-acento hover:underline">
              Usar o endereço de fábrica ({provedor.endpointPadrao})
            </button>
          )}
        </Campo>
      )}

      {provedor.precisaDeChave ? (
        <form onSubmit={guardarChave} className="flex flex-col gap-2">
          <Campo
            nome={`chave-${provedor.id}`}
            rotulo="Chave de API"
            ajuda="O campo só recebe a chave: ela é guardada cifrada e nunca volta para a tela."
          >
            <div className="flex gap-2">
              <input
                id={`chave-${provedor.id}`}
                name="chave"
                type="password"
                autoComplete="off"
                value={chave}
                onChange={(evento) => setChave(evento.target.value)}
                placeholder={provedor.chave.cadastrada ? "••••••••  (cole outra para trocar)" : "Cole a chave aqui"}
                className={`${CLASSE_CAMPO} ${bordaDoCampo(false)}`}
              />
              <button type="submit" disabled={pendente || !chave.trim()} className={`${botaoPrincipal} mt-1 shrink-0`}>
                <KeyRound size={14} className="mr-1 inline" /> Guardar
              </button>
            </div>
          </Campo>
          <p className="text-xs text-suave">
            {provedor.chave.cadastrada
              ? `Chave ${origemDaChave}${provedor.chave.em ? `, em ${diaEMes(provedor.chave.em)}` : ""}.`
              : "Nenhuma chave cadastrada: este provedor não responde enquanto faltar."}{" "}
            {provedor.chave.origem === "conexao" && (
              <button type="button" disabled={pendente} onClick={() => executar(() => removerChaveAcao(provedor.id), () => setAviso({ tipo: "ok", texto: "Chave removida." }))} className="text-red-700 hover:underline">
                Remover a chave
              </button>
            )}
          </p>
        </form>
      ) : (
        <p className="text-xs text-suave">Este provedor roda no seu PC e não usa chave.</p>
      )}

      <div className="flex flex-col gap-2 border-t border-borda pt-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={pendente} onClick={testar} className={botao}>
            {pendente && !teste ? "Testando…" : "Testar conexão"}
          </button>
          {teste?.ok && (
            <span className="text-sm text-emerald-700">
              Conectou em {duracaoEmTexto(teste.latenciaMs)} · {teste.modelos.length} {teste.modelos.length === 1 ? "modelo" : "modelos"}
            </span>
          )}
          {teste && !teste.ok && <span className="text-sm text-red-700">{teste.erro}</span>}
        </div>

        <div>
          <p className="text-sm font-semibold">Modelos habilitados</p>
          <p className="text-xs text-suave">Só os marcados aparecem nas listas Padrão e Reserva. Use Testar conexão para ver os modelos que o provedor tem.</p>
          {modelosDaLista.length === 0 ? (
            <p className="mt-2 text-xs text-suave">Nenhum modelo ainda: teste a conexão ou adicione um pelo nome.</p>
          ) : (
            <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto">
              {modelosDaLista.map((id) => (
                <li key={id}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={marcados.has(id)} onChange={() => alternar(id)} /> {id}
                  </label>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              value={outroModelo}
              onChange={(evento) => setOutroModelo(evento.target.value)}
              onKeyDown={(evento) => {
                if (evento.key === "Enter") {
                  evento.preventDefault();
                  adicionarModelo();
                }
              }}
              placeholder="Outro modelo, pelo nome"
              aria-label={`Adicionar um modelo do ${provedor.rotulo} pelo nome`}
              className="min-w-40 flex-1 rounded border border-borda px-2.5 py-1.5 text-sm"
            />
            <button type="button" onClick={adicionarModelo} disabled={!outroModelo.trim()} className={botao}>
              Adicionar
            </button>
            <button type="button" disabled={pendente} onClick={salvarModelos} className={botaoPrincipal}>
              Salvar modelos
            </button>
          </div>
        </div>
        {aviso && (
          <p className={`text-xs ${aviso.tipo === "ok" ? "text-emerald-700" : "text-red-700"}`} role="status">
            {aviso.texto}
          </p>
        )}
      </div>
    </Card>
  );
}
