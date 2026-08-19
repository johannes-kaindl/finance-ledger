// logos.jsx — Finance Ledger logo exploration
// 4 marks, all 96×96 viewBox, designed to read at 16px (favicon) → 96px (sigil).
// Severe / archival. Draws from KSP visual language.

const { useMemo } = React;

/* ─────────────────────────────────────────────────────────────────────
   A · BAR — double-entry rule. Two horizontal bars stacked.
   Top = Phosphor (credit). Bottom = Crimson (debit). Aligned column gap
   between them implies the ledger seam. The negative space is the entry.
   ───────────────────────────────────────────────────────────────────── */
function MarkBar({ size = 96, mono = false, glow = true }) {
  const cred = mono ? '#e8e4d8' : '#39ff7a';
  const debt = mono ? '#828a97' : '#d4203a';
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      {glow && !mono && (
        <defs>
          <filter id="bar-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.2" />
          </filter>
        </defs>
      )}
      {/* top rule — credit */}
      <rect x="14" y="34" width="68" height="6" rx="1" fill={cred}
            filter={glow && !mono ? 'url(#bar-glow)' : undefined} opacity={glow && !mono ? 0.55 : 1} />
      <rect x="14" y="34" width="68" height="6" rx="1" fill={cred} />
      {/* bottom rule — debit */}
      <rect x="14" y="56" width="68" height="6" rx="1" fill={debt}
            filter={glow && !mono ? 'url(#bar-glow)' : undefined} opacity={glow && !mono ? 0.55 : 1} />
      <rect x="14" y="56" width="68" height="6" rx="1" fill={debt} />
      {/* tick marks — column dividers (the journal columns) */}
      <rect x="30" y="32" width="1" height="32" fill="#5a6170" opacity="0.5" />
      <rect x="66" y="32" width="1" height="32" fill="#5a6170" opacity="0.5" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   B · FOLD — ledger seam. Square book with center fold and a single
   posted line crossing the seam. Fold reads as open journal. The line
   reads as a transaction — a connection between two pages (credit/debit).
   ───────────────────────────────────────────────────────────────────── */
function MarkFold({ size = 96, mono = false }) {
  const stroke = '#e8e4d8';
  const accent = mono ? '#e8e4d8' : '#39ff7a';
  const accent2 = mono ? '#828a97' : '#d4203a';
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      {/* outer */}
      <rect x="16" y="20" width="64" height="56" rx="2"
            fill="none" stroke={stroke} strokeWidth="2" />
      {/* fold seam */}
      <line x1="48" y1="20" x2="48" y2="76" stroke={stroke} strokeWidth="1.25" opacity="0.5" />
      {/* posted line — crosses the seam (the entry) */}
      <line x1="26" y1="42" x2="46" y2="42" stroke={accent} strokeWidth="2.5" strokeLinecap="square" />
      <line x1="50" y1="42" x2="70" y2="42" stroke={accent2} strokeWidth="2.5" strokeLinecap="square" />
      {/* second posted line — partial */}
      <line x1="26" y1="54" x2="38" y2="54" stroke={stroke} strokeWidth="1.25" opacity="0.4" />
      <line x1="58" y1="54" x2="70" y2="54" stroke={stroke} strokeWidth="1.25" opacity="0.4" />
      <line x1="26" y1="62" x2="34" y2="62" stroke={stroke} strokeWidth="1.25" opacity="0.25" />
      <line x1="62" y1="62" x2="70" y2="62" stroke={stroke} strokeWidth="1.25" opacity="0.25" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   C · DIFF — Git/commit heritage. A horizontal ledger rule with a
   single filled commit dot on it; a fainter dot ahead in time. Reads
   as "transaction posted to a versioned timeline" — the plain-text
   diff-able promise.
   ───────────────────────────────────────────────────────────────────── */
function MarkDiff({ size = 96, mono = false }) {
  const line = '#828a97';
  const dot = mono ? '#e8e4d8' : '#39ff7a';
  const halo = mono ? '#e8e4d8' : '#39ff7a';
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="diff-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor={halo} stopOpacity="0.55" />
          <stop offset="60%" stopColor={halo} stopOpacity="0.10" />
          <stop offset="100%" stopColor={halo} stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* timeline rule */}
      <line x1="10" y1="48" x2="86" y2="48" stroke={line} strokeWidth="1.25" />
      {/* tick marks */}
      <line x1="20" y1="44" x2="20" y2="52" stroke={line} strokeWidth="1" opacity="0.5" />
      <line x1="36" y1="44" x2="36" y2="52" stroke={line} strokeWidth="1" opacity="0.5" />
      <line x1="68" y1="44" x2="68" y2="52" stroke={line} strokeWidth="1" opacity="0.5" />
      <line x1="80" y1="44" x2="80" y2="52" stroke={line} strokeWidth="1" opacity="0.5" />
      {/* posted commit — bright */}
      <circle cx="52" cy="48" r="14" fill="url(#diff-halo)" />
      <circle cx="52" cy="48" r="5" fill={dot} />
      <circle cx="52" cy="48" r="5" fill="none" stroke="#060709" strokeWidth="1" />
      {/* future / pending dot — outline only */}
      <circle cx="76" cy="48" r="3" fill="none" stroke={line} strokeWidth="1.25" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   D · GLYPH — typographic mark. The paragraph/section glyph § is the
   editor's mark for an entry. Set in EB Garamond, with a single hairline
   underline (the ledger rule). Quietly literary — the "plain-text" mark.
   ───────────────────────────────────────────────────────────────────── */
function MarkGlyph({ size = 96, mono = false }) {
  const fg = '#e8e4d8';
  const accent = mono ? '#5a6170' : '#39ff7a';
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
      <text x="48" y="64" textAnchor="middle"
            fontFamily="'EB Garamond', Garamond, serif"
            fontSize="60" fontWeight="500" fontStyle="italic"
            fill={fg}>§</text>
      {/* ledger rule under */}
      <line x1="22" y1="76" x2="74" y2="76" stroke={accent} strokeWidth="1.5" />
      <line x1="22" y1="80" x2="58" y2="80" stroke="#5a6170" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Lockup: mark + wordmark. Two lines.
   Top: FINANCE LEDGER (Space Grotesk, semibold, tracked) + 元帳 kanji
   Bottom: LOCAL · FIRST · PROTOCOL (mono caps, tracked, dim)
   ───────────────────────────────────────────────────────────────────── */
function Wordmark({ eyebrow = true }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, lineHeight: 1 }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26,
        letterSpacing: '-0.02em', color: 'var(--fg-primary)',
      }}>
        Finance Ledger
      </div>
      {eyebrow && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'var(--fg-tertiary)',
        }}>Local · First · Protocol</div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   E · LEDGER — open book in perspective. Two grid panels (left + right)
   meet at a vertical seam, splayed slightly toward the viewer like an
   open journal on a desk. The columns of each panel double as letterforms:
   left page reads F, right page reads L. Severe, architectural,
   unmistakeably a ledger. Drawn in Circuit (link · live connection) —
   this is the artefact you actually open.
   ───────────────────────────────────────────────────────────────────── */
function MarkLedger({ size = 96, mono = false }) {
  /* Modern monogram. Strict 8-unit grid (96 ÷ 12 cells). Single weight,
     single colour, geometric construction — the marks of contemporary
     identity work (Stripe / Linear / Vercel). The mark is a square ledger
     "card" with two letters set into its grid:
       · LEFT half  → F  (top-rule + mid-rule extending from a left stem)
       · RIGHT half → L  (right stem + bottom-rule)
     The two letters share the centre seam, which doubles as the journal
     spine. The negative space between the F's mid-bar and the L's bottom
     reads as a posted entry.

     Construction:
       viewBox 96. Card 12→84 (72 unit). Stem-thickness 8.
       Letter heights 24→72 (48 unit). Stems flush with seam (x=44 / 52).
   */
  const fg = mono ? 'currentColor' : 'var(--signal-pearl, #e8e4d8)';
  const accent = mono ? 'currentColor' : 'var(--accent, #39ff7a)';

  // Grid coordinates (a 12×12 cell grid inside the 96 box, gutter 12 each side)
  // U = 6   so 12 units = 72 inner card
  // We work directly in viewBox units to keep things readable.
  /* Optical adjustments away from pure geometry:
     · Stem T=7 → 1:6.86 stroke ratio (geometric-sans territory).
     · F mid-arm at y=44 (3u above geometric centre) so the upper counter
       (13u) is smaller than the lower (21u) — convention compensating
       for the top-heavy bar.
     · F mid-arm length 18 (0.75 of the 24u top arm) — long enough at 16px,
       short enough to keep the lower counter open.
     · F-stem and L-stem both inset 16u from the card edge (mirrored).
       F top arm and L foot both run exactly to the seam axis (x=48).
     · Seam: 1u × 52u (24→76) — never thicker than ⅙ of the stem so it
       reads as a hairline rule, not a third stroke.
     · Card radius 12 (1.7× stem). Stroke 1u at 14% opacity — quiet. */
  const T = 7;
  const SEAM = 1;

  return (
    <svg width={size} height={size} viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg"
         shapeRendering="geometricPrecision">
      <rect x="8" y="8" width="80" height="80" rx="12"
            fill="none" stroke={fg} strokeOpacity="0.14" strokeWidth="1" />

      {/* — F · stem 24→31, top arm 24→48, mid arm 24→42 (lifted 3u) — */}
      <rect x="24" y="24" width={T} height="48" fill={fg} />
      <rect x="24" y="24" width="24" height={T} fill={fg} />
      <rect x="24" y="44" width="18" height={T} fill={fg} />

      {/* — L · stem 65→72, foot 48→72 (mirrors F top arm) — */}
      <rect x="65" y="24" width={T} height="48" fill={fg} />
      <rect x="48" y="65" width="24" height={T} fill={fg} />

      {/* Centre seam — hairline rule, only colour cue at 16px */}
      <rect x={(96 - SEAM) / 2} y="24" width={SEAM} height="52" fill={accent} />
    </svg>
  );
}

window.FinanceLogos = { MarkBar, MarkFold, MarkDiff, MarkGlyph, MarkLedger, Wordmark };
