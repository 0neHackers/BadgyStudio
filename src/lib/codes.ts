/**
 * Barcode and Data Matrix rendering.
 *
 * Both come back as SVG strings rather than canvases. Vector survives the 3x
 * export without a single soft edge, and an inline <svg> is something
 * html-to-image can serialise without a crossorigin round trip.
 *
 * bwip-js is pulled in on demand so it stays out of the first paint.
 */

type BwipModule = typeof import("bwip-js/browser");

/**
 * bwip-js types only the options shared by every symbology. Per-barcode keys
 * such as `format` and `eclevel` are valid at runtime but absent from the
 * declaration, so they go through this widened alias.
 */
type EncodeOptions = Parameters<BwipModule["toSVG"]>[0] & Record<string, unknown>;

let cached: Promise<BwipModule> | null = null;

function bwip(): Promise<BwipModule> {
  cached ??= import("bwip-js/browser");
  return cached;
}

export interface CodeResult {
  svg: string;
  /** Intrinsic size from the viewBox, used to keep the aspect ratio honest. */
  width: number;
  height: number;
}

/**
 * bwip-js emits a viewBox but no width/height attributes, and it always paints
 * an opaque white backing rect regardless of `backgroundcolor`. The rect has to
 * go, otherwise every code sits in a white square on the cream card.
 */
function normalise(svg: string, preserveAspectRatio: string): CodeResult {
  const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);

  const cleaned = svg
    .replace(/<rect\s+width="100%"\s+height="100%"\s+fill="#[0-9a-fA-F]{3,8}"\s*\/>\s*/i, "")
    .replace(
      /<svg /,
      `<svg preserveAspectRatio="${preserveAspectRatio}" style="width:100%;height:100%;display:block" `,
    );

  return {
    svg: cleaned,
    width: box ? Number(box[1]) : 0,
    height: box ? Number(box[2]) : 0,
  };
}

/**
 * Code 128 turned a quarter turn so it reads bottom to top down the edge of
 * the badge. Rotation happens inside the encoder, not in CSS, so the bars stay
 * on whole pixels and a scanner has no trouble with it.
 */
export async function verticalBarcode(value: string): Promise<CodeResult> {
  const { toSVG } = await bwip();
  return normalise(
    toSVG({
      bcid: "code128",
      text: value,
      scale: 4,
      height: 9,
      rotate: "R",
      includetext: false,
      // Code 128 needs a quiet zone of at least ten modules at each end or a
      // reader will not lock onto it. Zero padding produced bars that looked
      // right and would not scan.
      paddingwidth: 12,
      paddingheight: 4,
      barcolor: "000000",
    } as EncodeOptions),
    "none",
  );
}

/**
 * Square Data Matrix.
 *
 * `format: "square"` is the correct key here. An earlier build passed
 * `version: "square"`, which bwip-js rejects with datamatrixVersionFormat#25315
 * because `version` expects an explicit RxC size. The throw was being caught
 * and turned into an empty box, which is why no matrix ever appeared.
 */
export async function dataMatrix(value: string): Promise<CodeResult> {
  const { toSVG } = await bwip();
  return normalise(
    toSVG({
      bcid: "datamatrix",
      text: value,
      format: "square",
      scale: 5,
      padding: 0,
      barcolor: "000000",
    } as EncodeOptions),
    "xMidYMid meet",
  );
}

/** Plain QR, kept as an option for anyone whose scanner app is fussy. */
export async function qrCode(value: string): Promise<CodeResult> {
  const { toSVG } = await bwip();
  return normalise(
    toSVG({
      bcid: "qrcode",
      text: value,
      scale: 5,
      eclevel: "M",
      padding: 0,
      barcolor: "000000",
    } as EncodeOptions),
    "xMidYMid meet",
  );
}

export type CodeKind = "datamatrix" | "qrcode";

/**
 * The two options, named once.
 *
 * WHY THIS EXISTS, AND IT IS NOT TIDINESS
 *
 * Every surface that offered this choice built its own array inline and wrote
 * the QR value as `"qr"`. The encoder's value is `"qrcode"`, so `renderCode`
 * fell through to its Data Matrix branch and the QR option produced a Data
 * Matrix. Everywhere. From V06.02, when the choice was introduced, until
 * V06.04, when this was found.
 *
 * The type should have caught it on the first keystroke. `Segmented` is
 * generic over its value, so a `CodeKind[]` of options makes `"qr"` an error.
 * Every call site defeated that by writing `onChange={(next) => set(next as
 * CodeKind)}`, which widened the inference to `string` and turned a compile
 * error into a silent wrong answer.
 *
 * So the options live here, typed, and no call site casts. A cast that exists
 * to silence a type error is usually the type being right.
 */
export const CODE_OPTIONS: { value: CodeKind; label: string; sub: string }[] = [
  { value: "datamatrix", label: "Data Matrix", sub: "denser" },
  { value: "qrcode", label: "QR", sub: "any camera" },
];

export function renderCode(kind: CodeKind, value: string): Promise<CodeResult> {
  return kind === "qrcode" ? qrCode(value) : dataMatrix(value);
}
