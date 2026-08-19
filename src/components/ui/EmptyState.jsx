export default function EmptyState({ icone: Icone, titulo, descricao, acao }) {
  return (
    <div className="rounded-lg border border-dashed border-borda bg-superficie px-6 py-14 text-center">
      {Icone && (
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-fundo text-suave">
          <Icone size={22} />
        </span>
      )}
      <p className="font-medium">{titulo}</p>
      {descricao && (
        <p className="mx-auto mt-1 max-w-md text-sm text-suave">{descricao}</p>
      )}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}
