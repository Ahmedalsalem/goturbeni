import path from "path"
import Tesseract from "tesseract.js"

// Vendored so recognize() never depends on jsdelivr's CDN being reachable at
// runtime — see next.config.ts's outputFileTracingIncludes for why this
// specific directory (not bundled by default, since tesseract.js loads it by
// a runtime-constructed path, not a static import Next.js can trace itself).
const LANG_PATH = path.join(process.cwd(), "assets/tesseract-lang")

// Extracts raw candidate fields from a settlement receipt image so the
// caller (submitSettlementReceipt) can hand them, unmodified, to the
// submit_settlement_receipt_ocr RPC — the actual "does this match" decision
// is made there, against the real driver IBAN and ride amount, never here.
// This module only reads text off the image; it has no opinion on what's
// correct.
export interface ReceiptOcrResult {
  iban: string | null
  amounts: number[]
}

const IBAN_PATTERN = /TR\d{24}/
// Same IBAN but tolerant of the whitespace banking apps usually group it
// with ("TR33 0006 ...") — used to strip it out of the text before amount
// extraction so its digit groups don't pollute the amount candidates.
const IBAN_WITH_SPACES_PATTERN = /TR[\d\s]{24,34}/
// Matches loose number tokens (150 / 150,00 / 1.234,56 / 1,234.56) so the
// caller can find the expected deposit among them regardless of which
// decimal/thousands convention the receipt's banking app used.
const NUMBER_TOKEN_PATTERN = /\d[\d.,]*\d|\d/g
const MAX_AMOUNT_CANDIDATES = 30

function parseAmountToken(raw: string): number | null {
  const lastComma = raw.lastIndexOf(",")
  const lastDot = raw.lastIndexOf(".")

  let normalized: string
  if (lastComma > lastDot) {
    // Comma is the decimal separator (Turkish convention) — any dots are
    // thousands separators.
    normalized = raw.replaceAll(".", "").replace(",", ".")
  } else if (lastDot > lastComma) {
    normalized = raw.replaceAll(",", "")
  } else {
    normalized = raw
  }

  const value = Number(normalized)
  return Number.isFinite(value) && value > 0 && value <= 100_000 ? Math.round(value * 100) / 100 : null
}

export async function extractReceiptFields(image: Buffer): Promise<ReceiptOcrResult> {
  const {
    data: { text },
  } = await Tesseract.recognize(image, "eng", { langPath: LANG_PATH, gzip: false, cacheMethod: "none" })

  const ibanMatch = text.replace(/\s+/g, "").match(IBAN_PATTERN)
  const textWithoutIban = text.replace(IBAN_WITH_SPACES_PATTERN, "")

  const amounts: number[] = []
  for (const token of textWithoutIban.matchAll(NUMBER_TOKEN_PATTERN)) {
    const parsed = parseAmountToken(token[0])
    if (parsed !== null && !amounts.includes(parsed)) {
      amounts.push(parsed)
      if (amounts.length >= MAX_AMOUNT_CANDIDATES) break
    }
  }

  return { iban: ibanMatch?.[0] ?? null, amounts }
}
