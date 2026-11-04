/**
 * O nivel do cliente (Bronze, Prata, Ouro, Platinum) ao lado do nome. Sem nivel, nada aparece (regra 4 do Padrao
 * visual: so o que tem dado). Cor discreta, so a inicial na lista; o nome inteiro no `title`.
 */
const NIVEIS = {
  BRONZE: { texto: "Bronze", classe: "bg-orange-100 text-orange-800" },
  PRATA: { texto: "Prata", classe: "bg-slate-200 text-slate-700" },
  OURO: { texto: "Ouro", classe: "bg-amber-100 text-amber-800" },
  PLATINUM: { texto: "Platinum", classe: "bg-sky-100 text-sky-800" },
};

export default function SeloDoNivel({ nivel, completo = false }) {
  const dados = NIVEIS[nivel];
  if (!dados) return null;
  return (
    <span title={`Cliente ${dados.texto}`} className={`inline-flex shrink-0 items-center rounded px-1.5 text-[10px] leading-4 font-semibold ${dados.classe}`}>
      {completo ? dados.texto : dados.texto.charAt(0)}
    </span>
  );
}
