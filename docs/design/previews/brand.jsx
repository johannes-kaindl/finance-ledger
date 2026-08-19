// brand.jsx — Finance Ledger brand sheet artboard contents
// Reads `window.FinanceLogos` for the marks.

const { MarkBar, MarkFold, MarkDiff, MarkGlyph, MarkLedger, Wordmark } = window.FinanceLogos;

/* ───────────────────────── 1 · LOGO EXPLORATION ───────────────────────── */

function LogoExploration({ active = 'A' }) {
  const variants = [
    { id: 'E', mark: <MarkLedger size={120} />, name: 'Ledger', sub: 'Open book · F | L · grid in perspective', note: 'Two grid panels splayed open like a journal on a desk. The columns of the left page read F, the right page reads L. The grid is literally the ledger — rows × columns. Architectural, unmistakeable.' },
    { id: 'A', mark: <MarkBar size={120} />, name: 'Bar', sub: 'Double-entry rule', note: 'Two stacked rules — top Phosphor (credit), bottom Crimson (debit). Ledger column ticks. Severe. Reads at any size.' },
    { id: 'B', mark: <MarkFold size={120} />, name: 'Fold', sub: 'Ledger seam', note: 'Square book bisected by a center fold. A single posted entry crosses the seam — one credit, one debit. Quiet. Archival.' },
    { id: 'C', mark: <MarkDiff size={120} />, name: 'Diff', sub: 'Commit on a timeline', note: 'A horizontal rule with a posted commit dot and a future dot. Honours the Git heritage — every write is versioned plain-text.' },
    { id: 'D', mark: <MarkGlyph size={120} />, name: 'Glyph', sub: 'Section · paragraph · entry', note: 'EB Garamond § over a hairline rule. Pure typography. Literary register. The "plain-text" mark.' },
  ];
  return (
    <div style={{ padding: 32, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
      {variants.map(v => (
        <div key={v.id} style={{
          background: 'var(--surface-raised)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 10, padding: 24,
          display: 'flex', flexDirection: 'column', gap: 16,
          boxShadow: 'var(--shadow-card)',
          position: 'relative',
          ...(v.id === active ? { boxShadow: '0 0 0 1px var(--accent-glow), var(--shadow-card)' } : {}),
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', fontWeight: 600 }}>
              {v.id} · {v.name}
            </div>
            {v.id === active && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 600 }}>
                ● Active
              </div>
            )}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--surface-inset)', borderRadius: 6,
            border: '1px solid var(--border-subtle)',
            height: 200,
          }}>
            {v.mark}
          </div>
          {/* size grid — 16/24/48 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', justifyContent: 'flex-start', padding: '0 4px' }}>
            {[16, 24, 48].map(s => (
              <div key={s} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
                <div style={{ width: s, height: s, display: 'grid', placeItems: 'center' }}>
                  {React.cloneElement(v.mark, { size: s })}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--fg-tertiary)', letterSpacing: '0.1em' }}>{s}</div>
              </div>
            ))}
            <div style={{ flex: 1 }} />
            <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 13, color: 'var(--fg-secondary)' }}>{v.sub}</div>
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.55, color: 'var(--fg-secondary)' }}>
            {v.note}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── 2 · LOCKUPS ───────────────────────── */

function Lockups({ active = 'A' }) {
  const Mark = { A: MarkBar, B: MarkFold, C: MarkDiff, D: MarkGlyph, E: MarkLedger }[active] || MarkLedger;

  return (
    <div style={{ padding: 32, display: 'grid', gap: 20 }}>
      {/* Primary horizontal lockup */}
      <Row label="Primary horizontal" sub="Top-bar / install card / docs header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Mark size={48} />
          <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-subtle)' }} />
          <Wordmark />
        </div>
      </Row>

      {/* Stacked */}
      <Row label="Stacked" sub="Splash · marketing · square placements">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '8px 0' }}>
          <Mark size={64} />
          <Wordmark eyebrow={false} />
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--fg-tertiary)' }}>Local · First · Protocol</div>
        </div>
      </Row>

      {/* Compact */}
      <Row label="Compact" sub="Status bar · ribbon · in-vault chip">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Mark size={20} />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--fg-primary)' }}>
            Finance Ledger
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-tertiary)', letterSpacing: '0.12em', border: '1px solid var(--border-subtle)', padding: '1px 5px', borderRadius: 3 }}>v0.4.2</span>
        </div>
      </Row>

      {/* Mark only — favicon grid */}
      <Row label="Mark · favicon grid" sub="16 · 24 · 32 · 48 · 64 · 96">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
          {[16, 24, 32, 48, 64, 96].map(s => (
            <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: s + 12, height: s + 12,
                background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)',
                borderRadius: 4, display: 'grid', placeItems: 'center',
              }}>
                <Mark size={s} />
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-tertiary)', letterSpacing: '0.1em' }}>{s}px</div>
            </div>
          ))}
        </div>
      </Row>

      {/* Mono / on-light fallbacks */}
      <Row label="Fallbacks" sub="Mono · inverse · light-ground">
        <div style={{ display: 'flex', gap: 12 }}>
          <FallbackTile bg="#060709"><Mark size={56} mono /></FallbackTile>
          <FallbackTile bg="var(--signal-pearl)"><Mark size={56} mono /></FallbackTile>
          <FallbackTile bg="#fff"><Mark size={56} mono /></FallbackTile>
        </div>
      </Row>
    </div>
  );
}

function Row({ label, sub, children }) {
  return (
    <div style={{
      background: 'var(--surface-raised)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 10,
      padding: 24,
      display: 'grid', gridTemplateColumns: '180px 1fr', gap: 32, alignItems: 'center',
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-tertiary)' }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg-disabled)', marginTop: 4 }}>{sub}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function FallbackTile({ bg, children }) {
  return (
    <div style={{
      background: bg,
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      width: 120, height: 120,
      display: 'grid', placeItems: 'center',
    }}>{children}</div>
  );
}

window.FinanceBrand = { LogoExploration, Lockups };
