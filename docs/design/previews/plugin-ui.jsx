// plugin-ui.jsx — Hi-fi mock of the Finance Ledger plugin inside Obsidian
// Static-ish layout, ~1280×860. Full ledger view with sidebar, filter chips,
// table, inspector, and the bottom status bar.

const { MarkBar, MarkFold, MarkDiff, MarkGlyph, MarkLedger } = window.FinanceLogos;

function PluginUI({ logoVariant = 'E' }) {
  const Mark = { A: MarkBar, B: MarkFold, C: MarkDiff, D: MarkGlyph, E: MarkLedger }[logoVariant] || MarkLedger;
  return (
    <div className="fl-app" style={{
      width: 1280, height: 860,
      display: 'grid',
      gridTemplateColumns: '240px 1fr 320px',
      gridTemplateRows: '44px 1fr 24px',
      gridTemplateAreas: `
        "topbar topbar topbar"
        "sidebar main inspector"
        "statusbar statusbar statusbar"
      `,
      background: 'var(--surface-vault)',
      color: 'var(--fg-primary)',
      fontFamily: 'var(--font-body)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* chamber grain */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 100,
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/></svg>\")",
        opacity: 0.03,
      }} />

      <TopBar Mark={Mark} />
      <SideBar />
      <Main />
      <Inspector />
      <StatusBar />
    </div>
  );
}

function TopBar({ Mark }) {
  return (
    <div style={{
      gridArea: 'topbar',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 12px',
      background: 'var(--surface-primary)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      {/* Obsidian-ish window controls */}
      <div style={{ display: 'flex', gap: 6, paddingRight: 12 }}>
        {['#5a6170', '#5a6170', '#5a6170'].map((c, i) => (
          <span key={i} style={{ width: 11, height: 11, borderRadius: '50%', background: c, opacity: 0.6 }} />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 14, borderRight: '1px solid var(--border-subtle)', height: '100%' }}>
        <Mark size={20} />
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em' }}>
          Finance Ledger
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-tertiary)', letterSpacing: '0.12em', border: '1px solid var(--border-subtle)', padding: '1px 5px', borderRadius: 3, marginLeft: 4 }}>v0.4.2</span>
      </div>

      {/* breadcrumbs / current view */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-tertiary)' }}>
        <span>vault</span>
        <span style={{ color: 'var(--fg-disabled)' }}>/</span>
        <span>ledger</span>
        <span style={{ color: 'var(--fg-disabled)' }}>/</span>
        <span style={{ color: 'var(--fg-primary)' }}>journal.ledger</span>
        <span style={{
          marginLeft: 8, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'var(--signal-circuit)',
          background: 'color-mix(in oklab, var(--signal-circuit) 10%, transparent)',
          border: '1px solid color-mix(in oklab, var(--signal-circuit) 35%, transparent)',
          padding: '1px 6px', borderRadius: 3, fontWeight: 600,
        }}>● live</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* aspect picker */}
      <div style={{
        display: 'flex', gap: 2, padding: 3,
        background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)',
        borderRadius: 999,
      }}>
        {[
          { k: 'shugo',   label: 'Guard',  c: '#39ff7a' },
          { k: 'gunshi',  label: 'Strat',  c: '#a878ff' },
          { k: 'kantoku', label: 'Task',   c: '#d4203a' },
          { k: 'sensei',  label: 'Mentor', c: '#ffb442' },
        ].map((a, i) => (
          <span key={a.k} style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '4px 8px', borderRadius: 999,
            color: i === 0 ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
            background: i === 0 ? 'var(--surface-raised)' : 'transparent',
            boxShadow: i === 0 ? `0 0 0 1px var(--border-default) inset, 0 0 14px -6px ${a.c}` : 'none',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: a.c }} />
            {a.label}
          </span>
        ))}
      </div>

      <button style={{
        background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--fg-secondary)',
        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
        padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
      }}>⌘K · Quick</button>

      {/* git pip */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
        borderRadius: 999, border: '1px solid var(--border-subtle)',
        background: 'var(--surface-inset)',
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--fg-secondary)', fontWeight: 600,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--signal-phosphor)', boxShadow: '0 0 10px var(--signal-phosphor)' }} />
        git · synced
      </div>
    </div>
  );
}

function SideBar() {
  const presets = [
    { name: 'Inbox · TBC',         count: 17, dot: 'var(--txn-tbc)',        glow: true,  active: false },
    { name: 'This month',          count: 142, dot: 'var(--fg-tertiary)',  glow: false, active: true },
    { name: 'Recurring · due 7d',  count: 3,  dot: 'var(--txn-recurring)', glow: false, active: false },
    { name: 'Orphans',             count: 2,  dot: 'var(--txn-orphan)',    glow: true,  active: false },
    { name: 'Reconcile · Checking', count: 8,  dot: 'var(--txn-reconciled)', glow: false, active: false },
    { name: 'Future · scheduled',  count: 5,  dot: 'var(--txn-future)',    glow: false, active: false },
  ];
  const accounts = [
    { name: 'Checking',    bal: '8,491.04',   tone: 'var(--txn-credit)' },
    { name: 'Savings',     bal: '38,610.00',  tone: 'var(--txn-credit)' },
    { name: 'Visa',        bal: '−1,406.86',  tone: 'var(--txn-debit)' },
    { name: 'Cash',        bal: '   208.00',  tone: 'var(--fg-secondary)' },
    { name: 'Brokerage',   bal: '21,500.00',  tone: 'var(--txn-credit)' },
  ];
  return (
    <div style={{
      gridArea: 'sidebar',
      background: 'var(--surface-primary)',
      borderRight: '1px solid var(--border-subtle)',
      overflowY: 'auto',
    }}>
      <SideSection title="Filter presets" count="6">
        {presets.map((p, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', margin: '0 6px',
            borderRadius: 4,
            background: p.active ? 'color-mix(in oklab, var(--accent) 12%, transparent)' : 'transparent',
            boxShadow: p.active ? 'inset 2px 0 0 0 var(--accent)' : 'none',
            cursor: 'pointer',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: p.dot,
              boxShadow: p.glow ? `0 0 6px ${p.dot}` : 'none', flexShrink: 0,
            }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: p.active ? 'var(--fg-primary)' : 'var(--fg-secondary)', flex: 1 }}>{p.name}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: p.active ? 'var(--fg-primary)' : 'var(--fg-disabled)', fontVariantNumeric: 'tabular-nums' }}>{p.count}</span>
          </div>
        ))}
      </SideSection>

      <SideSection title="Accounts" count="5">
        {accounts.map((a, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 10px', margin: '0 6px',
            borderRadius: 4, cursor: 'pointer',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-disabled)', width: 14 }}>›</span>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg-secondary)', flex: 1 }}>{a.name}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: a.tone, fontVariantNumeric: 'tabular-nums lining-nums' }}>{a.bal} €</span>
          </div>
        ))}
      </SideSection>

      <SideSection title="Reports" count="">
        {['Cashflow', 'P&L · YTD', 'Net worth', 'Tax · 2025', 'Budget vs actual'].map((r, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 10px', margin: '0 6px',
            borderRadius: 4, cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--fg-secondary)',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-disabled)', width: 14 }}>§</span>
            {r}
          </div>
        ))}
      </SideSection>
    </div>
  );
}

function SideSection({ title, count, children }) {
  return (
    <div style={{ padding: '14px 0 8px' }}>
      <div style={{
        padding: '0 16px 8px',
        display: 'flex', justifyContent: 'space-between',
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
        color: 'var(--fg-tertiary)', fontWeight: 600,
      }}>
        <span>{title}</span>
        {count && <span style={{ color: 'var(--fg-disabled)' }}>{count}</span>}
      </div>
      {children}
    </div>
  );
}

function Main() {
  const transactions = [
    { date: '2026-05-08', payee: 'Lohn · Mai',                 cat: 'Income:Salary',          acct: 'Checking', amt: +3840.00, state: 'reconciled' },
    { date: '2026-05-08', payee: 'Edeka Wochenmarkt',          cat: 'Expenses:Groceries',     acct: 'Checking', amt: -42.18,   state: 'reconciled' },
    { date: '2026-05-07', payee: 'Spotify Premium',            cat: 'Expenses:Subscriptions', acct: 'Visa',     amt: -10.99,   state: 'recurring' },
    { date: '2026-05-07', payee: 'DB Bahn · ICE 78',           cat: '',                       acct: 'Visa',     amt: -89.50,   state: 'tbc',  selected: true },
    { date: '2026-05-06', payee: 'Transfer → Sparkonto',       cat: 'Assets:Savings',         acct: 'Checking', amt: -500.00,  state: 'transfer' },
    { date: '2026-05-06', payee: 'Apotheke am Markt',          cat: 'Expenses:Health',        acct: 'Cash',     amt: -14.20,   state: 'orphan' },
    { date: '2026-05-05', payee: 'Hetzner · Cloud',            cat: 'Expenses:Infra',         acct: 'Visa',     amt: -22.40,   state: 'recurring' },
    { date: '2026-05-04', payee: 'Volksbank · Kontoführung',   cat: 'Expenses:Bank',          acct: 'Checking', amt: -8.50,    state: 'reconciled' },
    { date: '2026-05-04', payee: 'Buchhandlung Hugendubel',    cat: 'Expenses:Books',         acct: 'Cash',     amt: -32.90,   state: 'reconciled' },
    { date: '2026-05-03', payee: 'Aldi Süd',                   cat: 'Expenses:Groceries',     acct: 'Checking', amt: -27.61,   state: 'reconciled' },
    { date: '2026-05-03', payee: 'Erstattung · Krankenkasse',  cat: 'Income:Refund',          acct: 'Checking', amt: +124.00,  state: 'reconciled' },
    { date: '2026-05-02', payee: 'Backwerk',                   cat: '',                       acct: 'Cash',     amt: -4.80,    state: 'tbc' },
    { date: '2026-05-02', payee: 'Kino · Babylon',             cat: 'Expenses:Leisure',       acct: 'Cash',     amt: -14.00,   state: 'reconciled' },
    { date: '2026-05-01', payee: 'Miete · KSW',                cat: 'Expenses:Rent',          acct: 'Checking', amt: -1240.00, state: 'recurring' },
  ];
  return (
    <div style={{ gridArea: 'main', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* tabs */}
      <div style={{
        display: 'flex', borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--surface-primary)', padding: '0 8px',
      }}>
        {[
          { name: 'Ledger',  active: true },
          { name: 'Triage · 17',  active: false, badge: 'tbc' },
          { name: 'Reconcile',     active: false },
          { name: 'Reports',       active: false },
        ].map((t, i) => (
          <div key={i} style={{
            padding: '10px 14px', fontFamily: 'var(--font-body)', fontSize: 12,
            color: t.active ? 'var(--fg-primary)' : 'var(--fg-tertiary)',
            borderBottom: t.active ? '2px solid var(--accent)' : '2px solid transparent',
            marginBottom: -1, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t.badge === 'tbc' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--txn-tbc)', boxShadow: '0 0 6px var(--txn-tbc)' }} />}
            {t.name}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingRight: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-tertiary)', letterSpacing: '0.1em' }}>142 rows · May 2026</span>
        </div>
      </div>

      {/* filter bar */}
      <div style={{
        padding: '14px 24px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        background: 'var(--surface-vault)',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <FilterChip>date ≥ 2026-05-01</FilterChip>
        <FilterChip>date ≤ 2026-05-31</FilterChip>
        <FilterChip variant="account">account: Checking, Visa, Cash</FilterChip>
        <FilterChip variant="add">+ Add filter</FilterChip>
        <div style={{ flex: 1 }} />
        <input placeholder="search payees, categories, notes…" style={{
          background: 'var(--surface-inset)', border: '1px solid var(--border-subtle)',
          borderRadius: 6, padding: '6px 10px', color: 'var(--fg-primary)',
          fontFamily: 'var(--font-body)', fontSize: 12, outline: 'none', width: 280,
        }} />
        <button style={{
          padding: '6px 12px', borderRadius: 6,
          background: 'var(--accent)', color: 'var(--fg-on-accent)',
          border: 'none', fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600,
          letterSpacing: '0.02em', cursor: 'pointer',
          boxShadow: 'var(--glow-accent)',
        }}>+ Add txn</button>
      </div>

      {/* table */}
      <div style={{ background: 'var(--surface-vault)', flex: 1 }}>
        {/* table head */}
        <div style={{
          display: 'grid', gridTemplateColumns: '110px 1fr 220px 130px 100px 28px',
          alignItems: 'center', gap: 14,
          padding: '10px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600,
          letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-tertiary)',
          position: 'sticky', top: 0, background: 'var(--surface-vault)', zIndex: 1,
        }}>
          <span>Date ↓</span><span>Payee</span><span>Category</span><span style={{ textAlign: 'right' }}>Amount</span><span>Account</span><span></span>
        </div>
        {transactions.map((r, i) => <BigRow key={i} {...r} />)}

        {/* day footer */}
        <div style={{
          padding: '14px 24px',
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: 'var(--fg-tertiary)', fontWeight: 600,
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>End of May · 142 transactions · 17 TBC</span>
          <span>Net <span style={{ color: 'var(--txn-credit)', fontVariantNumeric: 'tabular-nums lining-nums' }}>+ 1,840.50 €</span></span>
        </div>
      </div>
    </div>
  );
}

function BigRow({ date, payee, cat, acct, amt, state, selected }) {
  const stateMap = {
    reconciled: { dot: 'var(--txn-reconciled)', glow: false },
    recurring:  { dot: 'var(--txn-recurring)',  glow: false },
    tbc:        { dot: 'var(--txn-tbc)',        glow: true },
    transfer:   { dot: 'var(--txn-transfer)',   glow: false },
    orphan:     { dot: 'var(--txn-orphan)',     glow: true },
  }[state] || { dot: 'var(--fg-disabled)', glow: false };
  const isCredit = amt > 0;
  const isTbc = state === 'tbc';
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '110px 1fr 220px 130px 100px 28px',
      alignItems: 'center', gap: 14,
      padding: '10px 24px',
      borderBottom: '1px solid var(--border-subtle)',
      fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg-primary)',
      cursor: 'pointer', position: 'relative',
      background: selected ? 'color-mix(in oklab, var(--accent) 8%, transparent)' : 'transparent',
      boxShadow: selected ? 'inset 2px 0 0 0 var(--accent)' : 'none',
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
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--txn-tbc)',
          background: 'color-mix(in oklab, var(--txn-tbc) 12%, transparent)',
          border: '1px solid color-mix(in oklab, var(--txn-tbc) 35%, transparent)',
          padding: '2px 8px', borderRadius: 999, justifySelf: 'flex-start',
          letterSpacing: '0.1em', fontWeight: 600, textTransform: 'uppercase',
        }}>?  uncategorized</span>
      ) : (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
      )}
      <span style={{
        textAlign: 'right',
        fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums lining-nums',
        fontSize: 13, fontWeight: 500,
        color: isCredit ? 'var(--txn-credit)' : 'var(--txn-debit)',
      }}>
        {isCredit ? '+' : '−'}{Math.abs(amt).toFixed(2)} €
      </span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--fg-tertiary)' }}>{acct}</span>
      <span style={{ color: 'var(--fg-disabled)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>›</span>
    </div>
  );
}

function FilterChip({ children, variant = 'default' }) {
  const isAdd = variant === 'add';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 500,
      color: isAdd ? 'var(--fg-tertiary)' : 'var(--signal-circuit)',
      background: isAdd ? 'transparent' : 'color-mix(in oklab, var(--signal-circuit) 8%, transparent)',
      border: `1px ${isAdd ? 'dashed' : 'solid'} ${isAdd ? 'var(--border-subtle)' : 'color-mix(in oklab, var(--signal-circuit) 35%, transparent)'}`,
      padding: '4px 10px', borderRadius: 999,
      cursor: 'pointer',
    }}>{children} {!isAdd && <span style={{ color: 'var(--fg-disabled)', fontSize: 10 }}>×</span>}</span>
  );
}

function Inspector() {
  return (
    <div style={{
      gridArea: 'inspector',
      background: 'var(--surface-primary)',
      borderLeft: '1px solid var(--border-subtle)',
      overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* header */}
      <div style={{
        padding: '16px 20px 12px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--txn-tbc)', boxShadow: '0 0 8px var(--txn-tbc)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--txn-tbc)' }}>TBC · selected</span>
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-disabled)' }}>1 of 17</span>
      </div>

      {/* selected txn */}
      <div style={{ padding: '20px 20px 16px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', marginBottom: 6 }}>2026-05-07 · Visa</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--fg-primary)', lineHeight: 1.15 }}>
          DB Bahn · ICE 78
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums lining-nums', fontSize: 22, fontWeight: 500, color: 'var(--txn-debit)', marginTop: 8 }}>
          − 89.50 €
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11.5, color: 'var(--fg-tertiary)', lineHeight: 1.5, marginTop: 6 }}>
          Card transaction · Berlin Hbf → München Hbf · ref&nbsp;4471/B · imported via CSV 2026-05-08 06:14
        </div>
      </div>

      {/* category type-ahead */}
      <Section label="Category">
        <div style={{
          background: 'var(--surface-inset)',
          border: '1px solid var(--accent)',
          borderRadius: 6, padding: '8px 12px',
          fontFamily: 'var(--font-mono)', fontSize: 12,
          color: 'var(--fg-primary)', display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: 'var(--glow-focus)',
        }}>
          <span style={{ color: 'var(--accent)' }}>›</span>
          <span>Expenses:Travel:Train</span>
        </div>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[
            { c: 'Expenses:Travel:Train',   m: '14 · DB Bahn',         a: true },
            { c: 'Expenses:Travel',         m: 'parent',                a: false },
            { c: 'Expenses:Travel:Lodging', m: 'last 04-22',            a: false },
          ].map((s, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between',
              padding: '5px 10px', borderRadius: 4,
              background: s.a ? 'color-mix(in oklab, var(--accent) 10%, transparent)' : 'transparent',
              fontFamily: 'var(--font-mono)', fontSize: 11.5,
              color: s.a ? 'var(--fg-primary)' : 'var(--fg-secondary)',
            }}>
              <span>{s.c}</span>
              <span style={{ color: 'var(--fg-disabled)', fontFamily: 'var(--font-body)' }}>{s.m}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section label="Posting">
        <pre style={{
          margin: 0, padding: 12,
          background: 'var(--surface-inset)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-secondary)',
          lineHeight: 1.6, overflowX: 'auto',
        }}>
{`2026-05-07 * "DB Bahn"
  ; ref: 4471/B
  Expenses:Travel:Train  `}<span style={{ color: 'var(--txn-debit)' }}>89.50 EUR</span>{`
  Liabilities:Visa      `}<span style={{ color: 'var(--txn-credit)' }}>-89.50 EUR</span>
        </pre>
      </Section>

      <Section label="Actions">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <ActionBtn primary>Commit · ↵</ActionBtn>
          <ActionBtn>Commit + Next · ⌘↵</ActionBtn>
          <ActionBtn>Split posting</ActionBtn>
          <ActionBtn ghost>Mark recurring</ActionBtn>
          <ActionBtn ghost>Dismiss · ⌘D</ActionBtn>
        </div>
      </Section>

      <Section label="Trail">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-secondary)' }}>
          {[
            { t: '06:14', e: 'Imported · CSV',              tone: 'var(--fg-tertiary)' },
            { t: '06:14', e: 'Auto-tagged · payee match',   tone: 'var(--signal-circuit)' },
            { t: '—',     e: 'Awaiting category',           tone: 'var(--txn-tbc)' },
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: 'var(--fg-disabled)', width: 36 }}>{t.t}</span>
              <span style={{ color: t.tone }}>● {t.e}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--fg-tertiary)', marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  );
}

function ActionBtn({ children, primary, ghost }) {
  return (
    <button style={{
      width: '100%', textAlign: 'left',
      padding: '8px 12px', borderRadius: 6,
      background: primary ? 'var(--accent)' : ghost ? 'transparent' : 'var(--surface-raised)',
      color: primary ? 'var(--fg-on-accent)' : 'var(--fg-primary)',
      border: ghost ? '1px solid var(--border-subtle)' : (primary ? 'none' : '1px solid var(--border-default)'),
      fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: primary ? 600 : 500,
      letterSpacing: '0.02em', cursor: 'pointer',
      boxShadow: primary ? 'var(--glow-accent)' : 'none',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}>{children}</button>
  );
}

function StatusBar() {
  return (
    <div style={{
      gridArea: 'statusbar',
      borderTop: '1px solid var(--border-subtle)',
      background: 'var(--surface-primary)',
      display: 'flex', alignItems: 'center',
      padding: '0 16px', gap: 16,
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.08em',
      color: 'var(--fg-tertiary)',
    }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--signal-phosphor)', boxShadow: '0 0 6px var(--signal-phosphor)' }} />
        journal.ledger · 8,142 lines · 142 txns
      </span>
      <span style={{ color: 'var(--fg-disabled)' }}>·</span>
      <span>git: ↑0  ↓0  · last commit 06:14</span>
      <span style={{ color: 'var(--fg-disabled)' }}>·</span>
      <span style={{ color: 'var(--txn-tbc)' }}>17 TBC</span>
      <span style={{ color: 'var(--fg-disabled)' }}>·</span>
      <span style={{ color: 'var(--txn-orphan)' }}>2 orphans</span>
      <div style={{ flex: 1 }} />
      <span>UTF-8 · LF · UTC+02</span>
    </div>
  );
}

window.FinancePluginUI = { PluginUI };
