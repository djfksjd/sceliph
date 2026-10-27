const NAME_DIMENSIONS = /(\d+(?:[.,]\d+)?\s*-?\s*(?:"|”|''|in\b|inch(?:es)?|cm|mm|ft)\s*(?:[WHDL]\b)?|\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)+(?:\s*(?:cm|mm|in))?)/gi;
/** Product name with dimension strings removed (exploratory size-from-photo runs). */
export function stripDimensions(name: string): string {
  return name.replace(NAME_DIMENSIONS, '').replace(/\(\s*[A-Za-z x×]*\)/g, '').replace(/\s*,(\s*,)+/g, ',').replace(/\s{2,}/g, ' ').replace(/[\s,–-]+$/, '').trim();
}
