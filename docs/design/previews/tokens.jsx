// tokens.jsx — Foundation tokens (color, type, signal mapping)

function ColorSystem() {
  const finance = [
    { tok: '--txn-credit',     name: 'Credit',       hex: '#39ff7a', src: 'Phosphor',  role: 'Income · money in · positive delta' },
    { tok: '--txn-debit',      name: 'Debit',        hex: '#d4203a', src: 'Crimson',   role: 'Expense · money out · negative delta' },
    { tok: '--txn-tbc',        name: 'TBC',          hex: '#ffb442', src: 'Ember',     role: 'Uncategorized · pending triage' },
    { tok: '--txn-reconciled', name: 'Reconciled',   hex: '#8bbf87', src: 'Biolink',   role: 'Settled · matched to bank statement' },
    { tok: '--txn-transfer',   name: 'Transfer',     hex: '#4ac8d8', src: 'Circuit',   role: 'Between own accounts · cancels out' },
    { tok: '--txn-recurring',  name: 'Recurring',    hex: '#b49bd1', src: 'Voidwitch', role: 'Repeating pattern · subscription · standing order' },
    { tok: '--txn-orphan',     name: 'Orphan',       hex: '#e8b979', src: 'Rust',      role: 'Missing counterparty · entropy warning' },
    { tok: '--txn-future',     name: 'Future',       hex: '#7ab8c4', src: 'Ghost',     role: 'Dated forward · scheduled · drift candidate' },
  ];
  return (
    <div style={{ padding: 32, display: 'grid', gap: 24 }}>
      <Note>
        Finance Ledger introduces <em>no new primitives.</em> Every state is a
        semantic remap of an existing KSP signal — the same hue Kuro uses for
        "Success" is what the ledger calls "Credit." One source. The chamber
        already knows these colours; we are only assigning them new jobs.
      </Note>

      {/* Mapping grid */}
      <div style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}>
        <Header label="Transaction states" sub="8 signals · 8 jobs" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', borderTop: '1px solid var(--border-subtle)' }}>
          {finance.map((c, i) => (
            <div key={c.tok} style={{
              display: 'grid',
              gridTemplateColumns: '180px 110px 130px 1fr',
              alignItems: 'center', gap: 16,
              padding: '14px 24px',
              borderTop: i ? '1px solid var(--border-subtle)' : 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 4,
                  background: c.hex, boxShadow: `0 0 18px -4px ${c.hex}`,
                  border: '1px solid rgba(0,0,0,0.4)',
                }} />
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, color: 'var(--fg-primary)', letterSpacing: '-0.01em' }}>
                  {c.name}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-tertiary)', letterSpacing: '0.06em' }}>
                {c.hex.toUpperCase()}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-secondary)' }}>
                ← {c.src}
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
                {c.role}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Specimen — money figures */}
      <div style={{
        background: 'var(--surface-raised)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        boxShadow: 'var(--shadow-card)',
        overflow: 'hidden',
      }}>
        <Header label="Money figure specimen" sub="JetBrains Mono · tabular-nums · lining" />
        <div style={{
          padding: '24px 32px',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24,
          fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums lining-nums',
        }}>
          <Spec label="Credit"      value="+1,240.00 €" tone="#39ff7a" />
          <Spec label="Debit"       value="−   86.50 €" tone="#d4203a" />
          <Spec label="Zero / open" value="    0.00 €"  tone="var(--fg-tertiary)" />
          <Spec label="Large"       value="+22,891.04 €" tone="#39ff7a" big />
          <Spec label="Negative"    value="− 3,402.17 €" tone="#d4203a" big />
          <Spec label="Balance"     value="  9,488.87 €" tone="var(--signal-pearl)" big />
        </div>
      </div>
    </div>
  );
}

function Spec({ label, value, tone, big }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: big ? 28 : 18, color: tone, fontWeight: 500, fontVariantNumeric: 'tabular-nums lining-nums' }}>
        {value}
      </div>
    </div>
  );
}

function TypeSystem() {
  return (
    <div style={{ padding: 32, display: 'grid', gap: 20 }}>
      {/* display */}
      <Card label="Display" sub="EB Garamond · 600 · −0.02em · screen titles, empty states, callouts">
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--fg-primary)', lineHeight: 1.05 }}>
          The graph has a memory.
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, fontStyle: 'italic', color: 'var(--fg-secondary)', marginTop: 8 }}>
          Plain text. Yours. For thirty years.
        </div>
      </Card>

      {/* sans / body */}
      <Card label="Sans" sub="Space Grotesk · UI · buttons · labels · 13–17px">
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 500, color: 'var(--fg-primary)' }}>Quick-Action · Categorize · Reconcile</div>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 400, color: 'var(--fg-secondary)', marginTop: 4 }}>Filter presets, button labels, sidebar nav.</div>
      </Card>
      <Card label="Body" sub="Inter · long form · 13–15px">
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.6, color: 'var(--fg-primary)', maxWidth: 540 }}>
          Every transaction lives as a single posting in <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--signal-circuit)', background: 'var(--surface-inset)', padding: '1px 5px', borderRadius: 3 }}>journal.ledger</span> — a plain-text file in your vault, fully diff-able in Git, readable in thirty years.
        </div>
      </Card>

      {/* mono */}
      <Card label="Mono" sub="JetBrains Mono · captions · meta · all monetary figures">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-primary)', whiteSpace: 'pre' }}>
{`2026-05-08 * Edeka  Wochenmarkt
    Expenses:Groceries           42.18 EUR
    Assets:Checking             -42.18 EUR`}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', marginTop: 12 }}>
          Eyebrow · Caps · Tracked 0.16em
        </div>
      </Card>
    </div>
  );
}

function Header({ label, sub }) {
  return (
    <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-secondary)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-tertiary)', letterSpacing: '0.1em' }}>{sub}</div>
    </div>
  );
}

function Card({ label, sub, children }) {
  return (
    <div style={{
      background: 'var(--surface-raised)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 10,
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
    }}>
      <Header label={label} sub={sub} />
      <div style={{ padding: '8px 24px 24px', borderTop: '1px solid var(--border-subtle)' }}>{children}</div>
    </div>
  );
}

function Note({ children }) {
  return (
    <div style={{
      borderLeft: '2px solid var(--signal-circuit)',
      background: 'color-mix(in oklab, var(--signal-circuit) 6%, transparent)',
      padding: '14px 20px',
      borderRadius: '0 6px 6px 0',
      fontFamily: 'var(--font-body)', fontSize: 13, lineHeight: 1.6, color: 'var(--fg-secondary)',
      maxWidth: 720,
    }}>{children}</div>
  );
}

window.FinanceTokens = { ColorSystem, TypeSystem };
