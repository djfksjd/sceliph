/**
 * Contract for an LLM/VLM (or a person) pointing at parts in a photo. The
 * request binds the exact resized image; the response lists one or more boxes
 * per requested part. Boxes are prompts for a segmenter, never geometry.
 */

export interface PartBoxRequest {
  schema: 'sceliph.part-box-request/0.1';
  image: { sha256: string; width: number; height: number; maxSide: number };
  parts: Array<{ id: string; description: string; componentIds: string[] }>;
  instructions: string;
}

export interface PartBoxResponse {
  schema: 'sceliph.part-box-response/0.1';
  imageSha256: string;
  width: number;
  height: number;
  parts: Array<{ id: string; boxes: Array<[number, number, number, number]>; note?: string }>;
}

const MAX_PARTS = 16;
const MAX_BOXES_PER_PART = 8;
const MIN_BOX_SIDE = 2;

export const PART_BOX_INSTRUCTIONS = [
  'Look at box-sheet.png. Pixel coordinates start at the top-left corner (0, 0); x grows to the right and y grows downward.',
  'Grid lines are drawn every 32 pixels and labelled every 64 pixels.',
  'For each requested part id, return one or more tight axis-aligned boxes [x0, y0, x1, y1] around its visible pixels.',
  'Use several boxes for a part made of separated or thin pieces (e.g. each leg of a stand). Omit a part you cannot see; do not guess.',
  'Reply with JSON only, matching sceliph.part-box-response/0.1: {"schema", "imageSha256", "width", "height", "parts": [{"id", "boxes", "note"?}]}.',
].join(' ');

export function validatePartBoxResponse(response: unknown, request: PartBoxRequest): PartBoxResponse {
  if (typeof response !== 'object' || response === null) throw new Error('Part box response must be a JSON object.');
  const value = response as Partial<PartBoxResponse>;
  if (value.schema !== 'sceliph.part-box-response/0.1') throw new Error('Unsupported part box response schema.');
  if (value.imageSha256 !== request.image.sha256) throw new Error('Part box response refers to a different image.');
  if (value.width !== request.image.width || value.height !== request.image.height) throw new Error('Part box response image size differs from the request.');
  if (!Array.isArray(value.parts) || value.parts.length > MAX_PARTS) throw new Error(`Part box response must list at most ${MAX_PARTS} parts.`);
  const requested = new Set(request.parts.map((part) => part.id));
  const seen = new Set<string>();
  const parts = value.parts.map((part) => {
    if (typeof part !== 'object' || part === null || typeof part.id !== 'string' || !requested.has(part.id)) {
      throw new Error(`Part box response names an unrequested part ${String((part as { id?: unknown })?.id)}.`);
    }
    if (seen.has(part.id)) throw new Error(`Part ${part.id} appears twice in the box response.`);
    seen.add(part.id);
    if (!Array.isArray(part.boxes) || part.boxes.length < 1 || part.boxes.length > MAX_BOXES_PER_PART) {
      throw new Error(`Part ${part.id} must have 1–${MAX_BOXES_PER_PART} boxes.`);
    }
    const boxes = part.boxes.map((box) => {
      if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) throw new Error(`Part ${part.id} box must be four finite numbers.`);
      const [x0, y0, x1, y1] = box;
      if (x0 < 0 || y0 < 0 || x1 > request.image.width || y1 > request.image.height) throw new Error(`Part ${part.id} box lies outside the image.`);
      if (x1 - x0 < MIN_BOX_SIDE || y1 - y0 < MIN_BOX_SIDE) throw new Error(`Part ${part.id} box is smaller than ${MIN_BOX_SIDE} px.`);
      return [x0, y0, x1, y1] as [number, number, number, number];
    });
    if (part.note !== undefined && (typeof part.note !== 'string' || part.note.length > 240)) throw new Error(`Part ${part.id} note must be a string of at most 240 characters.`);
    return { id: part.id, boxes, ...(part.note === undefined ? {} : { note: part.note }) };
  });
  return { schema: 'sceliph.part-box-response/0.1', imageSha256: request.image.sha256, width: request.image.width, height: request.image.height, parts };
}
