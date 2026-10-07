/**
 * A match format inside an uppercase meta line. '5-a-side' follows the line's
 * casing; the 'v' in an uneven format like '6v5' stays lower case.
 */
export function FormatLabel({ format }: { format: string }) {
  const uneven = /^(\d+)v(\d+)$/.exec(format)
  if (!uneven) return <>{format}</>
  return <>{uneven[1]}<span className="normal-case">v</span>{uneven[2]}</>
}
