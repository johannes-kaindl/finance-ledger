// components.jsx — Plugin-specific component specimens
// Ledger row, TBC triage modal, dashboard cards, deep-link chip, button states.

const { MarkBar, MarkFold, MarkDiff, MarkGlyph } = window.FinanceLogos;

/* ───────────────── LEDGER ROW ───────────────── */

function LedgerRowSpec() {
  const rows = [
    { date: '2026-05-08', payee: 'Edeka Wochenmarkt',     cat: 'Expenses:Groceries',  acct: 'Checking',  amt: -42.18, state: 'reconciled' },
    { date: '2026-05-08', payee: 'Lohn · Mai',             cat: 'Income:Salary',       acct: 'Checking',  amt: +3840.00, state: 'reconciled' },
    { date: '2026-05-07', payee: 'Spotify',                cat: 'Expenses:Subscriptions', acct: 'Visa',   amt: -10.99, state: 'recurring' },
    { date: '2026-05-07', payee: 'DB Bahn · ICE 78',       cat: '?',                   acct: 'Visa',      amt: -89.50, state: 'tbc' },
    { date: '2026-05-06', payee: 'Transfer → Sparkonto',   cat: 'Assets:Savings',      acct: 'Checking',  amt: -500.00, state: 'transfer' },
    { date: '2026-05-04', payee: 'Apotheke am Markt',      cat: 'Expenses:Health',     acct: 'Cash',      amt: -14.20, state: 'orphan' },
  ];
  return (
    <div style={{ padding: 32 }}>
      <Card label="Ledger row" sub="Default · TBC · Reconciled · Recurring · Transfer · Orphan">
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 200px 120px 120px 36px', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', fontWeight: 600, gap: 12 }}>
          <span>Date</span><span>Payee</span><span>Category</span><span style={{ textAlign: 'right' }}>Amount</span><span>Account</span><span></span>
        </div>
        {rows.map((r, i) => <LedgerRow key={i} {...r} />)}
      </Card>
    </div>
  );
}

function LedgerRow({ date, payee, cat, acct, amt, state }) {
  const stateMap = {
    reconciled: { dot: 'var(--txn-reconciled)', glow: false, label: 'Reconciled' },
    recurring:  { dot: 'var(--txn-recurring)',  glow: false, label: 'Recurring' },
    tbc:        { dot: 'var(--txn-tbc)',        glow: true,  label: 'TBC' },
    transfer:   { dot: 'var(--txn-transfer)',   glow: false, label: 'Transfer' },
    orphan:     { dot: 'var(--txn-orphan)',     glow: true,  label: 'Orphan' },
    default:    { dot: 'var(--fg-disabled)',    glow: false, label: '' },
  }[state] || { dot: 'var(--fg-disabled)', glow: false, label: '' };
  const isCredit = amt > 0;
  const isTbc = state === 'tbc';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '90px 1fr 200px 120px 120px 36px',
      alignItems: 'center', gap: 12,
      padding: '10px 12px',
      borderBottom: '1px solid var(--border-subtle)',
      fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-primary)',
      cursor: 'pointer',
    }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{date}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
          background: stateMap.dot,
          boxShadow: stateMap.glow ? `0 0 8px ${stateMap.dot}` : 'none',
        }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{payee}</span>
      </span>
      {isTbc ? (
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--txn-tbc)',
          background: 'color-mix(in oklab, var(--txn-tbc) 12%, transparent)',
          border: '1px solid color-mix(in oklab, var(--txn-tbc) 35%, transparent)',
          padding: '2px 8px', borderRadius: 999, justifySelf: 'flex-start',
          letterSpacing: '0.1em', fontWeight: 600, textTransform: 'uppercase',
        }}>?  uncategorized</span>
      ) : (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-secondary)' }}>{cat}</span>
      )}
      <span style={{
        textAlign: 'right',
        fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums lining-nums',
        fontSize: 13, fontWeight: 500,
        color: isCredit ? 'var(--txn-credit)' : 'var(--txn-debit)',
      }}>
        {isCredit ? '+' : '−'}{Math.abs(amt).toFixed(2)} €
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-tertiary)' }}>{acct}</span>
      <span style={{ color: 'var(--fg-disabled)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>›</span>
    </div>
  );
}

/* ───────────────── TRIAGE MODAL ───────────────── */

function TriageModalSpec() {
  return (
    <div style={{ padding: 32 }}>
      <Card label="TBC Triage · Quick-Action Modal" sub="Type-ahead · keyboard-first · ⌘+T">
        <div style={{
          padding: 32, display: 'grid', placeItems: 'center',
          background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.4), var(--surface-inset))',
          borderRadius: 6, minHeight: 420,
        }}>
          <TriageModal />
        </div>
      </Card>
    </div>
  );
}

function TriageModal() {
  return (
    <div style={{
      width: 540,
      background: 'var(--surface-overlay)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 14,
      boxShadow: 'var(--shadow-modal)',
      overflow: 'hidden',
    }}>
      {/* header */}
      <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--txn-tbc)', boxShadow: '0 0 10px var(--txn-tbc)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--txn-tbc)' }}>TBC · Triage</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-tertiary)', marginLeft: 6 }}>3 of 17</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-disabled)', letterSpacing: '0.1em' }}>esc to close</span>
      </div>

      {/* the transaction */}
      <div style={{ padding: '20px 24px 16px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', marginBottom: 8 }}>2026-05-07 · Visa</div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--fg-primary)' }}>
            DB Bahn · ICE 78
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums lining-nums', fontSize: 22, fontWeight: 500, color: 'var(--txn-debit)' }}>
            − 89.50 €
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-tertiary)', marginTop: 4 }}>
          Card transaction · Berlin Hbf → München Hbf · ref 4471/B
        </div>
      </div>

      {/* type-ahead */}
      <div style={{ padding: '0 24px 12px' }}>
        <div style={{
          background: 'var(--surface-inset)',
          border: '1px solid var(--accent)',
          borderRadius: 6,
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: 'var(--glow-focus)',
        }}>
          <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>›</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-primary)' }}>Expenses:Travel:Train</span>
          <span style={{
            display: 'inline-block', width: 1, height: 14,
            background: 'var(--accent)',
            animation: 'fl-caret 1s steps(2) infinite',
          }} />
        </div>
      </div>

      {/* suggestions */}
      <div style={{ padding: '0 12px 4px' }}>
        {[
          { cat: 'Expenses:Travel:Train',     hint: '14 prior matches · DB Bahn',         active: true },
          { cat: 'Expenses:Travel',           hint: 'parent category',                    active: false },
          { cat: 'Expenses:Travel:Lodging',   hint: 'last used 2026-04-22',               active: false },
          { cat: 'Expenses:Subscriptions',    hint: 'unmatched',                          active: false },
        ].map((s, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px',
            borderRadius: 6,
            background: s.active ? 'color-mix(in oklab, var(--accent) 10%, transparent)' : 'transparent',
            cursor: 'pointer',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: s.active ? 'var(--accent)' : 'var(--fg-disabled)', width: 14 }}>
                {s.active ? '●' : '○'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--fg-primary)', fontWeight: s.active ? 500 : 400 }}>{s.cat}</span>
            </div>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg-tertiary)' }}>{s.hint}</span>
          </div>
        ))}
      </div>

      {/* footer */}
      <div style={{
        padding: '12px 20px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--surface-primary)',
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-tertiary)', letterSpacing: '0.08em',
      }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <KbdHint k="↵" label="commit" />
          <KbdHint k="⌘↵" label="commit + next" />
          <KbdHint k="⌘D" label="dismiss" />
        </div>
        <span>17 remaining</span>
      </div>
    </div>
  );
}

function KbdHint({ k, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-secondary)',
        background: 'var(--surface-inset)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 3, padding: '1px 5px', letterSpacing: 0,
      }}>{k}</span>
      <span style={{ textTransform: 'uppercase' }}>{label}</span>
    </span>
  );
}

/* ───────────────── DASHBOARD CARDS ───────────────── */

function DashboardCardSpec() {
  return (
    <div style={{ padding: 32, display: 'grid', gap: 16 }}>
      <Card label="Aggregate dashboards" sub="Per account · category · payee · month · quarter · year">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: 8 }}>
          <BalanceCard />
          <CategoryCard />
          <DeadlineCard />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, padding: '0 8px 8px' }}>
          <SparkCard />
          <TbcCard />
        </div>
      </Card>
    </div>
  );
}

function CardShell({ topBorder, label, sub, children, height = 'auto' }) {
  return (
    <div style={{
      background: 'var(--surface-raised)',
      border: '1px solid var(--border-subtle)',
      borderTop: topBorder || '1px solid var(--border-subtle)',
      borderRadius: 10,
      boxShadow: 'var(--shadow-card)',
      padding: 20,
      display: 'flex', flexDirection: 'column', gap: 12,
      height,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-tertiary)' }}>{label}</span>
        {sub && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-disabled)' }}>{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function BalanceCard() {
  return (
    <CardShell topBorder="var(--card-balance-top)" label="Net worth · May" sub="snapshot 23:59">
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 500, color: 'var(--fg-primary)', fontVariantNumeric: 'tabular-nums lining-nums' }}>
        47,202.18 €
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        <span style={{ color: 'var(--txn-credit)' }}>↑ 1,840.50</span>
        <span style={{ color: 'var(--fg-disabled)' }}>vs Apr</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 4 }}>
        <Mini label="Assets"      value="51,109.04" tone="var(--txn-credit)" />
        <Mini label="Liabilities" value="−3,906.86" tone="var(--txn-debit)" />
      </div>
    </CardShell>
  );
}

function Mini({ label, value, tone }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontVariantNumeric: 'tabular-nums lining-nums', color: tone }}>{value} €</div>
    </div>
  );
}

function CategoryCard() {
  const cats = [
    { name: 'Groceries',     val: 412.18, frac: 0.78 },
    { name: 'Travel',        val: 289.50, frac: 0.55 },
    { name: 'Subscriptions', val: 96.94,  frac: 0.18 },
    { name: 'Health',        val: 74.20,  frac: 0.14 },
  ];
  return (
    <CardShell label="Top categories · May" sub="expenses">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
        {cats.map(c => (
          <div key={c.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              <span style={{ color: 'var(--fg-secondary)' }}>{c.name}</span>
              <span style={{ color: 'var(--fg-primary)', fontVariantNumeric: 'tabular-nums lining-nums' }}>{c.val.toFixed(2)} €</span>
            </div>
            <div style={{ height: 3, background: 'var(--surface-inset)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${c.frac * 100}%`, height: '100%', background: 'var(--txn-debit)', boxShadow: '0 0 8px var(--txn-debit)', opacity: 0.85 }} />
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function DeadlineCard() {
  return (
    <CardShell topBorder="var(--card-deadline-top)" label="Upcoming · 7 days" sub="3 due">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { d: 'May 11', name: 'Miete · KSW',    val: '−1,240.00', state: 'recurring' },
          { d: 'May 14', name: 'KK · TK',         val: '−   84.50', state: 'recurring' },
          { d: 'May 16', name: 'Stromabschlag',   val: '−   62.00', state: 'tbc' },
        ].map((u, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 8, borderBottom: i < 2 ? '1px solid var(--border-subtle)' : 0 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: u.state === 'tbc' ? 'var(--txn-tbc)' : 'var(--txn-recurring)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-tertiary)', width: 50 }}>{u.d}</span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-primary)', flex: 1 }}>{u.name}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--txn-debit)', fontVariantNumeric: 'tabular-nums lining-nums' }}>{u.val} €</span>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function SparkCard() {
  // Synthesised quarterly cashflow
  const data = [3.2, 4.1, 3.8, 5.6, 4.9, 6.2, 5.1, 7.4, 6.8, 8.0, 7.1, 8.4];
  const max = Math.max(...data);
  return (
    <CardShell label="Cashflow · last 12 months" sub="net delta">
      <svg viewBox="0 0 320 80" style={{ width: '100%', height: 80 }}>
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#39ff7a" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#39ff7a" stopOpacity="0" />
          </linearGradient>
        </defs>
        {(() => {
          const pts = data.map((v, i) => `${(i / (data.length - 1)) * 320},${80 - (v / max) * 70}`).join(' ');
          return <>
            <polyline points={`0,80 ${pts} 320,80`} fill="url(#spark-grad)" />
            <polyline points={pts} fill="none" stroke="var(--txn-credit)" strokeWidth="1.5" />
            {data.map((v, i) => (
              <circle key={i} cx={(i / (data.length - 1)) * 320} cy={80 - (v / max) * 70} r={i === data.length - 1 ? 3 : 0} fill="var(--txn-credit)" />
            ))}
          </>;
        })()}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-tertiary)', letterSpacing: '0.1em' }}>
        <span>JUN</span><span>SEP</span><span>DEC</span><span>MAR</span><span style={{ color: 'var(--txn-credit)' }}>MAY</span>
      </div>
    </CardShell>
  );
}

function TbcCard() {
  return (
    <CardShell topBorder="var(--card-tbc-top)" label="Triage queue" sub="uncategorized">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--txn-tbc)', lineHeight: 1 }}>17</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-secondary)' }}>transactions</span>
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--fg-secondary)', lineHeight: 1.5 }}>
        Oldest waiting <span style={{ color: 'var(--fg-primary)' }}>9 days</span>. Tend them before they rot.
      </div>
      <button style={{
        marginTop: 4, padding: '8px 14px', borderRadius: 6,
        background: 'var(--txn-tbc)', color: '#060709',
        border: 'none', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
        letterSpacing: '0.04em', cursor: 'pointer',
        boxShadow: '0 0 0 1px color-mix(in oklab, var(--txn-tbc) 60%, transparent), 0 0 24px -4px color-mix(in oklab, var(--txn-tbc) 60%, transparent)',
      }}>Triage now ›</button>
    </CardShell>
  );
}

/* ───────────────── DEEP-LINK CHIP ───────────────── */

function DeepLinkSpec() {
  return (
    <div style={{ padding: 32 }}>
      <Card label="Deep-link chip" sub="In-vault note → filtered LedgerView">
        <div style={{ padding: '24px 8px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg-primary)', lineHeight: 1.7, maxWidth: 640 }}>
            Wrote up the Berlin trip. Travel costs landed at <DeepLinkChip>account=Visa · cat=Travel · 2026-05</DeepLinkChip> — under budget by sixty euros. Train tickets via DB Bahn went to <DeepLinkChip variant="payee">payee=DB Bahn · YTD</DeepLinkChip>; flagged one <DeepLinkChip variant="tbc">?  TBC · ICE 78</DeepLinkChip> for the morning.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <DeepLinkChip>account=Checking · 2026</DeepLinkChip>
            <DeepLinkChip variant="cat">cat=Expenses:Subscriptions</DeepLinkChip>
            <DeepLinkChip variant="payee">payee=Edeka · last 90d</DeepLinkChip>
            <DeepLinkChip variant="tbc">?  TBC · 17</DeepLinkChip>
            <DeepLinkChip variant="orphan">orphan · 3</DeepLinkChip>
          </div>
        </div>
      </Card>
    </div>
  );
}

function DeepLinkChip({ children, variant = 'default' }) {
  const map = {
    default: { tone: 'var(--signal-circuit)', sym: '⟶' },
    cat:     { tone: 'var(--signal-circuit)', sym: '⟶' },
    payee:   { tone: 'var(--signal-circuit)', sym: '⟶' },
    tbc:     { tone: 'var(--txn-tbc)',        sym: '⟶' },
    orphan:  { tone: 'var(--txn-orphan)',     sym: '⟶' },
  }[variant];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, verticalAlign: 'baseline',
      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
      color: map.tone,
      background: `color-mix(in oklab, ${map.tone} 8%, transparent)`,
      border: `1px solid color-mix(in oklab, ${map.tone} 35%, transparent)`,
      padding: '2px 8px', borderRadius: 999,
      cursor: 'pointer',
      letterSpacing: '0.01em',
    }}>
      <span style={{ opacity: 0.7 }}>{map.sym}</span>
      <span>{children}</span>
    </span>
  );
}

/* ───────────────── SHARED ───────────────── */

function Card({ label, sub, children }) {
  return (
    <div style={{
      background: 'var(--surface-raised)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 10,
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-secondary)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-tertiary)', letterSpacing: '0.1em' }}>{sub}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

window.FinanceComponents = { LedgerRowSpec, TriageModalSpec, DashboardCardSpec, DeepLinkSpec };
