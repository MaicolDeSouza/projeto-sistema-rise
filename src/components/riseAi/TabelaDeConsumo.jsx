import { PROVEDOR_DO_MCP, custoEmTexto, duracaoEmTexto, ehLocal, rotuloDoProvedor } from "./formatos";

const numero = (valor) => Number(valor).toLocaleString("pt-BR");
const comoData = (dia) => dia.split("-").reverse().join("/");
const dolar = (valor) => `US$ ${Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

const CABECALHOS = [
  { rotulo: "Respostas", ajuda: "Respostas que o modelo deu (as mensagens de erro ficam em Falhas)." },
  { rotulo: "Tokens", ajuda: "Entrada (o que o modelo leu) e saída (o que escreveu)." },
  { rotulo: "Custo", ajuda: "Estimado na hora da resposta: preço do modelo × tokens × dólar do dia. Modelo no seu PC custa zero." },
  { rotulo: "Outros", ajuda: "O que não é resposta do chat: pesquisa na internet, transcrição de áudio e embeddings. O valor do dia aparece na primeira linha dele; passe o mouse para ver por tipo." },
  { rotulo: "Tempo médio", ajuda: "Do envio da pergunta ao fim da resposta." },
  { rotulo: "Reservas", ajuda: "Respostas em que a reserva assumiu porque o modelo padrão falhou." },
  { rotulo: "Falhas", ajuda: "Respostas que terminaram em erro." },
  { rotulo: "👎", ajuda: "Respostas sinalizadas como erradas." },
  { rotulo: "Sem resultado", ajuda: "A busca no catálogo não achou produto." },
];

const TIPOS_DE_OUTROS = { BUSCA: "Pesquisa na internet", TRANSCRICAO: "Transcrição de áudio", EMBEDDING: "Embeddings" };

/** O gasto "Outros" do dia, com o detalhe por tipo no mouse; `null` (a linha não é a primeira do dia, ou não houve gasto) fica em branco. */
function Outros({ gasto }) {
  if (!gasto) return <span className="text-suave">—</span>;
  const detalhe = Object.entries(gasto.porTipo)
    .filter(([, brl]) => brl > 0)
    .map(([tipo, brl]) => `${TIPOS_DE_OUTROS[tipo] ?? tipo}: ${custoEmTexto(brl)}`)
    .join("\n");
  return (
    <span title={detalhe || undefined}>
      {custoEmTexto(gasto.brl)}
      <span className="block text-xs text-suave">{dolar(gasto.usd)}</span>
    </span>
  );
}

function Custo({ custoBrl, custoUsd, semCusto, respostas, local, contaPropria }) {
  // As dúvidas anotadas pelo Claude/ChatGPT foram respondidas na conta da pessoa: zero para o Rise, mas não "no seu PC".
  if (contaPropria) return <span className="text-suave">conta própria</span>;
  if (local) return <span className="text-suave">no seu PC</span>;
  // Nenhuma resposta da linha tem preço: "R$ 0,00" diria que não custou nada, e o que falta é o preço do modelo.
  if (semCusto > 0 && semCusto >= respostas) return <span className="text-amber-700">preço não cadastrado</span>;
  return (
    <>
      {custoEmTexto(custoBrl)}
      <span className="block text-xs text-suave">{dolar(custoUsd)}</span>
      {semCusto > 0 && <span className="block text-xs text-amber-700">{semCusto} sem preço cadastrado</span>}
    </>
  );
}

/**
 * O consumo por dia, provedor e modelo (spec §5.10), com os totais do período no fim. Só mostra: quem decide o período
 * é a página. Sem estado, então roda no servidor.
 *
 * @param {{ linhas: object[], totais: object }} props  `consumoPorDia` e `totaisDoPeriodo`
 */
export default function TabelaDeConsumo({ linhas, totais }) {
  if (linhas.length === 0) {
    return <p className="rounded-lg border border-dashed border-borda p-6 text-center text-sm text-suave">Nenhuma resposta neste período.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-borda bg-superficie">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead className="border-b border-borda text-xs text-suave uppercase">
          <tr>
            <th className="px-3 py-2 font-medium">Dia</th>
            <th className="px-3 py-2 font-medium">Modelo</th>
            {CABECALHOS.map((cabecalho) => (
              <th key={cabecalho.rotulo} title={cabecalho.ajuda} className="px-3 py-2 text-right font-medium">
                {cabecalho.rotulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-borda">
          {linhas.map((linha) => (
            <tr key={`${linha.dia}|${linha.provedor}|${linha.modelo}`} className="align-top">
              <td className="px-3 py-2 whitespace-nowrap">{comoData(linha.dia)}</td>
              {linha.semModelo ? (
                // Dia que só teve gasto Outros: não há resposta, então não há modelo nem contagem para mostrar.
                <>
                  <td className="px-3 py-2 text-suave">—</td>
                  <td className="px-3 py-2 text-right text-suave" colSpan={3}>
                    —
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    <Outros gasto={linha.outros} />
                  </td>
                  <td className="px-3 py-2 text-right text-suave" colSpan={5}>
                    —
                  </td>
                </>
              ) : (
                <>
                  <td className="px-3 py-2">
                    {rotuloDoProvedor(linha.provedor) || "—"}
                    <span className="block text-xs text-suave">{linha.modelo ?? "sem modelo"}</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{numero(linha.respostas)}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">
                    {numero(linha.tokensEntrada)}
                    <span className="block text-suave">{numero(linha.tokensSaida)}</span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    <Custo custoBrl={linha.custoBrl} custoUsd={linha.custoUsd} semCusto={linha.semCusto} respostas={linha.respostas} local={ehLocal(linha.provedor)} contaPropria={linha.provedor === PROVEDOR_DO_MCP} />
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                    <Outros gasto={linha.outros} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{linha.respostas ? duracaoEmTexto(linha.duracaoMediaMs) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numero(linha.reservas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numero(linha.falhas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numero(linha.negativas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{numero(linha.semResultado)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-borda bg-fundo font-medium">
          <tr className="align-top">
            <td className="px-3 py-2" colSpan={2}>
              Total do período
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{numero(totais.respostas)}</td>
            <td className="px-3 py-2 text-right text-xs tabular-nums">
              {numero(totais.tokensEntrada)}
              <span className="block text-suave">{numero(totais.tokensSaida)}</span>
            </td>
            <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
              {custoEmTexto(totais.custoBrl)}
              <span className="block text-xs font-normal text-suave">{dolar(totais.custoUsd)}</span>
              {totais.semCusto > 0 && <span className="block text-xs font-normal text-amber-700">{totais.semCusto} sem preço cadastrado</span>}
            </td>
            <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{totais.outrosBrl > 0 ? custoEmTexto(totais.outrosBrl) : <span className="font-normal text-suave">—</span>}</td>
            <td className="px-3 py-2 text-right tabular-nums">{totais.respostas ? duracaoEmTexto(totais.duracaoMediaMs) : "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums">{numero(totais.reservas)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{numero(totais.falhas)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{numero(totais.negativas)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{numero(totais.semResultado)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
