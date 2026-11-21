/**
 * The text that is embedded and keyword-indexed for a chunk. `text` itself stays untouched, so
 * display and citations are unaffected. The `search` column in the migration indexes the same words.
 */
export function contextualText(chunk: {
  text: string;
  context?: string | null;
}): string {
  return chunk.context ? `${chunk.context}\n\n${chunk.text}` : chunk.text;
}
