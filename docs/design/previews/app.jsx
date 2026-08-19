// app.jsx — Main canvas wiring + Tweaks
const { useState, useEffect } = React;
const { DesignCanvas, DCSection, DCArtboard } = window;
const { TweaksPanel, useTweaks, TweakSection, TweakRadio, TweakSelect, TweakColor } = window;

const { LogoExploration, Lockups } = window.FinanceBrand;
const { ColorSystem, TypeSystem } = window.FinanceTokens;
const { LedgerRowSpec, TriageModalSpec, DashboardCardSpec, DeepLinkSpec } = window.FinanceComponents;
const { PluginUI } = window.FinancePluginUI;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "aspect": "shugo",
  "logoVariant": "E",
  "accent": "phosphor",
  "mode": "dark"
}/*EDITMODE-END*/;

const ACCENT_MAP = {
  phosphor: { c: '#39ff7a', name: 'Phosphor · Guardian' },
  spectre:  { c: '#a878ff', name: 'Spectre · Strategist' },
  crimson:  { c: '#d4203a', name: 'Crimson · Taskmaster' },
  ember:    { c: '#ffb442', name: 'Ember · Mentor' },
};

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply aspect + accent + mode to root
  useEffect(() => {
    document.documentElement.dataset.aspect = t.aspect;
    document.documentElement.dataset.mode = t.mode;
    // Accent map needs to follow mode — light mode uses darker signals
    const lightMap = { phosphor: '#1f9a4a', spectre: '#7a4dd1', crimson: '#b8142d', ember: '#c97a0e' };
    const c = t.mode === 'light' ? lightMap[t.accent] : ACCENT_MAP[t.accent].c;
    document.documentElement.style.setProperty('--accent', c);
    document.documentElement.style.setProperty('--accent-soft', `color-mix(in oklab, ${c} 15%, transparent)`);
    document.documentElement.style.setProperty('--accent-glow', `color-mix(in oklab, ${c} ${t.mode === 'light' ? 35 : 50}%, transparent)`);
  }, [t.aspect, t.accent, t.mode]);

  return <>
    <DesignCanvas>
      <DCSection id="identity" title="Identity" subtitle="Logo exploration · lockups · favicon">
        <DCArtboard id="logos" label="A · Logo exploration · 4 marks" width={920} height={1100}>
          <Frame><LogoExploration active={t.logoVariant} /></Frame>
        </DCArtboard>
        <DCArtboard id="lockups" label="B · Lockups · using selected mark" width={920} height={1320}>
          <Frame><Lockups active={t.logoVariant} /></Frame>
        </DCArtboard>
      </DCSection>

      <DCSection id="foundation" title="Foundation" subtitle="Color · type · signal mapping">
        <DCArtboard id="colors" label="C · Signal mapping" width={920} height={920}>
          <Frame><ColorSystem /></Frame>
        </DCArtboard>
        <DCArtboard id="type" label="D · Type system" width={920} height={920}>
          <Frame><TypeSystem /></Frame>
        </DCArtboard>
      </DCSection>

      <DCSection id="components" title="Components" subtitle="Plugin-specific specimens">
        <DCArtboard id="ledger-row" label="E · Ledger row" width={1080} height={520}>
          <Frame><LedgerRowSpec /></Frame>
        </DCArtboard>
        <DCArtboard id="triage" label="F · TBC triage modal" width={1080} height={680}>
          <Frame><TriageModalSpec /></Frame>
        </DCArtboard>
        <DCArtboard id="dash" label="G · Dashboard cards" width={1080} height={760}>
          <Frame><DashboardCardSpec /></Frame>
        </DCArtboard>
        <DCArtboard id="deeplink" label="H · Deep-link chip" width={1080} height={460}>
          <Frame><DeepLinkSpec /></Frame>
        </DCArtboard>
      </DCSection>

      <DCSection id="plugin" title="Plugin · Hi-fi mock" subtitle="Full Obsidian-host integration · 1280×860">
        <DCArtboard id="plugin-ui" label="I · Live ledger view" width={1280} height={860}>
          <PluginUI logoVariant={t.logoVariant} />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>

    <TweaksPanel title="Tweaks">
      <TweakSection title="Mode">
        <TweakRadio
          value={t.mode}
          onChange={v => setTweak('mode', v)}
          options={[
            { value: 'dark',  label: 'Dark' },
            { value: 'light', label: 'Light' },
          ]}
        />
      </TweakSection>
      <TweakSection title="Aspect">
        <TweakRadio
          value={t.aspect}
          onChange={v => setTweak('aspect', v)}
          options={[
            { value: 'shugo',   label: 'Guard' },
            { value: 'gunshi',  label: 'Strat' },
            { value: 'kantoku', label: 'Task' },
            { value: 'sensei',  label: 'Mentor' },
          ]}
        />
      </TweakSection>
      <TweakSection title="Accent">
        <TweakColor
          value={ACCENT_MAP[t.accent].c}
          onChange={hex => {
            const k = Object.keys(ACCENT_MAP).find(k => ACCENT_MAP[k].c === hex) || 'phosphor';
            setTweak('accent', k);
          }}
          options={Object.values(ACCENT_MAP).map(a => a.c)}
        />
      </TweakSection>
      <TweakSection title="Logo variant">
        <TweakSelect
          value={t.logoVariant}
          onChange={v => setTweak('logoVariant', v)}
          options={[
            { value: 'E', label: 'E · Ledger (open book F|L)' },
            { value: 'A', label: 'A · Bar (double-entry)' },
            { value: 'B', label: 'B · Fold (ledger seam)' },
            { value: 'C', label: 'C · Diff (commit dot)' },
            { value: 'D', label: 'D · Glyph (§ typographic)' },
          ]}
        />
      </TweakSection>
    </TweaksPanel>
  </>;
}

// Frame — gives each artboard a dark KSP chamber background.
function Frame({ children }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--surface-vault)',
      color: 'var(--fg-primary)',
      fontFamily: 'var(--font-body)',
      overflow: 'auto',
      position: 'relative',
    }}>
      {/* grain */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/></svg>\")",
        opacity: 0.025, zIndex: 0,
      }} />
      <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
