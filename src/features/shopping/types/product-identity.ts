/** A conservative incompatibility check, never proof that two goods are interchangeable. */
export function compatibleProductType(
  query: string,
  candidate: string,
): boolean {
  const kind = (value: string) => {
    const name = value.toLocaleLowerCase("nl");
    if (/\b(smeerboter|margarine|spread|butter|boter)\b/u.test(name))
      return "spread";
    if (
      /\b(olijfolie|olive\s+oil|zonnebloemolie|sunflower\s+oil|koolzaadolie)\b/u.test(
        name,
      )
    )
      return "oil";
    return null;
  };
  const a = kind(query);
  const b = kind(candidate);
  return !a || !b || a === b;
}
