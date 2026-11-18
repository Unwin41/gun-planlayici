let counter = 0;

/** Small unique id; good enough for local task ids (no crypto needed). */
export function newId(): string {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
