// SnapOG — Dashboard & landing page HTML
// Aesthetic: "Carbon Terminal" — dark developer tool, amber accent, monospace-first.
// Billing surfaces extend the same system: mono micro-labels, amber as the only
// call-to-action colour, receipt-paper dashed rules for anything money-related.

import type { ApiKey, PaidTier } from '../types';
import { TIER_LIMITS, TIER_PRICE_CENTS } from '../types';

/** Escape untrusted values before they hit HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const TIER_LABEL: Record<PaidTier, string> = { pro: 'Pro', business: 'Business' };

function priceLabel(tier: PaidTier): string {
  return `$${(TIER_PRICE_CENTS[tier] / 100).toFixed(0)}`;
}

function limitLabel(tier: PaidTier | 'free'): string {
  return TIER_LIMITS[tier].toLocaleString();
}

const TIER_PERKS: Record<PaidTier, string[]> = {
  pro: [
    'No SnapOG watermark',
    'Custom font upload',
    'Usage analytics',
    'Priority support',
  ],
  business: [
    'Everything in Pro',
    'Custom domain (CNAME)',
    'Team access (3 seats)',
    'White-label output',
  ],
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,700;1,400&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;1,9..40,400&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:      #0A0A0A;
    --surface: #141414;
    --border:  #1F1F1F;
    --divider: #2A2A2A;
    --text-1:  #F5F5F5;
    --text-2:  #A3A3A3;
    --text-3:  #525252;
    --accent:  #F59E0B;
    --accent-dim: #92400E;
    --teal:    #14B8A6;
    --red:     #EF4444;
    --font-mono: 'JetBrains Mono', 'Consolas', monospace;
    --font-sans: 'DM Sans', system-ui, sans-serif;
    --r: 6px;
    --r-lg: 12px;
    --shadow: 0 0 0 1px var(--border);
  }

  html { scroll-behavior: smooth; }

  body {
    background: var(--bg);
    color: var(--text-1);
    font-family: var(--font-sans);
    font-size: 16px;
    line-height: 1.6;
    min-height: 100vh;
    /* Dot-grid background */
    background-image: radial-gradient(circle, #1F1F1F 1px, transparent 1px);
    background-size: 32px 32px;
  }

  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Nav */
  .nav {
    position: sticky; top: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 32px;
    background: rgba(10,10,10,0.92);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
  }
  .nav-logo {
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: 18px;
    color: var(--text-1);
    letter-spacing: -0.02em;
  }
  .nav-logo span { color: var(--accent); }
  .nav-links { display: flex; gap: 24px; align-items: center; }
  .nav-links a { color: var(--text-2); font-size: 14px; }
  .nav-links a:hover { color: var(--text-1); text-decoration: none; }
  .btn {
    display: inline-flex; align-items: center; justify-content: center;
    font-family: var(--font-mono); font-size: 13px; font-weight: 500;
    padding: 8px 20px; border-radius: var(--r);
    border: none; cursor: pointer; transition: all 0.15s;
    text-decoration: none;
  }
  .btn-primary { background: var(--accent); color: #000; }
  .btn-primary:hover { background: #FBBF24; text-decoration: none; }
  .btn-ghost { background: transparent; color: var(--text-2); border: 1px solid var(--border); }
  .btn-ghost:hover { border-color: var(--accent); color: var(--accent); text-decoration: none; }

  /* Container */
  .container { max-width: 900px; margin: 0 auto; padding: 0 24px; }
  .container-wide { max-width: 1100px; margin: 0 auto; padding: 0 24px; }

  /* Hero */
  .hero { padding: 100px 0 72px; text-align: center; position: relative; }
  .hero-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    font-family: var(--font-mono); font-size: 12px; color: var(--accent);
    letter-spacing: 0.1em; text-transform: uppercase;
    border: 1px solid var(--accent-dim); border-radius: 100px;
    padding: 4px 14px; margin-bottom: 28px;
  }
  .hero-eyebrow::before {
    content: ''; width: 6px; height: 6px; border-radius: 50%;
    background: var(--accent); animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.8); }
  }
  .hero h1 {
    font-size: clamp(42px, 6vw, 72px);
    font-weight: 700; letter-spacing: -0.04em;
    line-height: 1.05;
    background: linear-gradient(135deg, #F5F5F5 0%, #A3A3A3 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 24px;
  }
  .hero h1 em {
    font-style: normal;
    background: linear-gradient(135deg, var(--accent), #FCD34D);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .hero-sub {
    font-size: 18px; color: var(--text-2); max-width: 560px; margin: 0 auto 40px;
    line-height: 1.65;
  }
  .hero-cta { display: flex; gap: 12px; justify-content: center; }

  /* OG Preview */
  .og-preview-wrap {
    position: relative; margin: 72px auto 0; max-width: 720px;
    border-radius: var(--r-lg); overflow: hidden;
    box-shadow: 0 0 0 1px var(--border), 0 40px 80px rgba(0,0,0,0.6);
  }
  .og-preview-wrap img {
    width: 100%; display: block;
    border-radius: var(--r-lg);
  }
  .og-preview-label {
    position: absolute; top: 12px; left: 12px;
    font-family: var(--font-mono); font-size: 11px; color: var(--text-3);
    background: var(--surface); border: 1px solid var(--border);
    padding: 4px 10px; border-radius: var(--r);
  }

  /* Section */
  .section { padding: 80px 0; }
  .section-title {
    font-family: var(--font-mono); font-size: 11px; font-weight: 500;
    color: var(--accent); letter-spacing: 0.12em; text-transform: uppercase;
    margin-bottom: 12px;
  }
  .section-h2 {
    font-size: 36px; font-weight: 700; letter-spacing: -0.025em;
    margin-bottom: 16px; line-height: 1.15;
  }
  .section-sub { font-size: 17px; color: var(--text-2); max-width: 480px; line-height: 1.6; }

  /* Code block */
  .code-block {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--r-lg); overflow: hidden; margin-top: 32px;
  }
  .code-block-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px; border-bottom: 1px solid var(--border);
  }
  .code-block-lang {
    font-family: var(--font-mono); font-size: 12px; color: var(--text-3);
    letter-spacing: 0.06em;
  }
  .code-block-dots { display: flex; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .dot-red { background: #FF5F57; }
  .dot-yellow { background: #FEBC2E; }
  .dot-green { background: #28C840; }
  .code-block pre {
    padding: 24px 20px; font-family: var(--font-mono); font-size: 13px;
    line-height: 1.7; color: var(--text-1); overflow-x: auto;
    white-space: pre;
  }
  .c-comment { color: var(--text-3); }
  .c-key { color: var(--teal); }
  .c-val { color: #86EFAC; }
  .c-str { color: #FCD34D; }
  .c-url { color: var(--accent); }

  /* API params table */
  .params-table { width: 100%; border-collapse: collapse; margin-top: 24px; }
  .params-table th, .params-table td {
    padding: 12px 16px; text-align: left;
    border-bottom: 1px solid var(--border); font-size: 14px;
  }
  .params-table th {
    font-family: var(--font-mono); font-size: 11px; color: var(--text-3);
    letter-spacing: 0.08em; text-transform: uppercase;
  }
  .params-table td:first-child { font-family: var(--font-mono); color: var(--teal); }
  .params-table .required {
    font-family: var(--font-mono); font-size: 10px; color: var(--accent);
    border: 1px solid var(--accent-dim); border-radius: 3px; padding: 1px 6px;
  }
  .params-table .optional {
    font-family: var(--font-mono); font-size: 10px; color: var(--text-3);
    border: 1px solid var(--border); border-radius: 3px; padding: 1px 6px;
  }

  /* Pricing */
  .pricing-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 48px; }
  .pricing-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--r-lg); padding: 32px;
    display: flex; flex-direction: column;
    transition: border-color 0.2s;
  }
  .pricing-card:hover { border-color: var(--accent); }
  .pricing-card.featured {
    border-color: var(--accent);
    background: linear-gradient(180deg, #1C1400 0%, var(--surface) 100%);
  }
  .pricing-tier {
    font-family: var(--font-mono); font-size: 11px; color: var(--text-3);
    letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 16px;
  }
  .pricing-tier-featured { color: var(--accent); }
  .pricing-price {
    font-size: 40px; font-weight: 700; letter-spacing: -0.03em;
    margin-bottom: 4px; line-height: 1;
  }
  .pricing-period { font-size: 14px; color: var(--text-2); margin-bottom: 24px; }
  .pricing-limit {
    font-family: var(--font-mono); font-size: 13px; color: var(--text-2);
    margin-bottom: 20px; padding-bottom: 20px;
    border-bottom: 1px solid var(--border);
  }
  .pricing-features { list-style: none; flex: 1; }
  .pricing-features li {
    font-size: 14px; color: var(--text-2); padding: 6px 0;
    display: flex; gap: 8px; align-items: flex-start;
  }
  .pricing-features li::before { content: '→'; color: var(--accent); flex-shrink: 0; }
  .pricing-features li.dim::before { color: var(--text-3); }
  .pricing-features li.dim { color: var(--text-3); }
  .pricing-cta { margin-top: 28px; }

  /* Features grid */
  .features-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; margin-top: 48px; }
  .feature-card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--r-lg); padding: 28px;
  }
  .feature-icon {
    font-family: var(--font-mono); font-size: 20px; color: var(--accent);
    margin-bottom: 16px; display: block;
  }
  .feature-card h3 { font-size: 17px; font-weight: 600; margin-bottom: 8px; }
  .feature-card p { font-size: 14px; color: var(--text-2); line-height: 1.6; }

  /* Dashboard */
  .dash-layout { padding: 40px 0 80px; }
  .dash-header { margin-bottom: 40px; }
  .dash-header h1 { font-size: 26px; font-weight: 700; margin-bottom: 4px; letter-spacing: -0.02em; }
  .dash-header p { font-size: 14px; color: var(--text-2); }

  .dash-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 24px; }
  .dash-grid-full { grid-column: 1 / -1; }

  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--r-lg); padding: 28px;
  }
  .card-title {
    font-family: var(--font-mono); font-size: 11px; font-weight: 500;
    color: var(--text-3); letter-spacing: 0.1em; text-transform: uppercase;
    margin-bottom: 20px;
  }

  /* API key display */
  .api-key-display {
    display: flex; align-items: center; gap: 8px;
    background: var(--bg); border: 1px solid var(--border);
    border-radius: var(--r); padding: 12px 16px;
    font-family: var(--font-mono); font-size: 13px; color: var(--text-2);
    flex: 1;
  }
  .api-key-display .key-val { flex: 1; word-break: break-all; }
  .api-key-row { display: flex; gap: 8px; align-items: stretch; }

  /* Usage meter */
  .usage-bar-wrap {
    background: var(--bg); border-radius: 100px;
    height: 6px; margin: 12px 0 8px; overflow: hidden;
  }
  .usage-bar {
    height: 100%; border-radius: 100px;
    background: var(--accent);
    transition: width 0.6s ease;
  }
  .usage-bar.warn { background: #F97316; }
  .usage-bar.full { background: var(--red); }
  .usage-meta { display: flex; justify-content: space-between; font-size: 13px; }
  .usage-count { font-family: var(--font-mono); font-size: 28px; font-weight: 700; }
  .usage-limit { font-size: 13px; color: var(--text-3); }

  /* Tier badge */
  .tier-badge {
    display: inline-flex; align-items: center;
    font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em;
    text-transform: uppercase; padding: 3px 10px; border-radius: 100px;
  }
  .tier-free { background: #1C1C1C; color: var(--text-3); border: 1px solid var(--border); }
  .tier-pro { background: #1C1400; color: var(--accent); border: 1px solid var(--accent-dim); }
  .tier-business { background: #0A2A2A; color: var(--teal); border: 1px solid #115E59; }

  /* Register form */
  .form-group { margin-bottom: 20px; }
  .form-label { display: block; font-family: var(--font-mono); font-size: 12px; color: var(--text-2); margin-bottom: 8px; letter-spacing: 0.06em; }
  .form-input {
    width: 100%; padding: 12px 16px;
    background: var(--bg); border: 1px solid var(--border);
    border-radius: var(--r); font-family: var(--font-mono);
    font-size: 14px; color: var(--text-1);
    outline: none; transition: border-color 0.15s;
  }
  .form-input:focus { border-color: var(--accent); }
  .form-hint { font-size: 12px; color: var(--text-3); margin-top: 6px; }

  /* Alert */
  .alert { padding: 14px 18px; border-radius: var(--r); font-size: 14px; margin-bottom: 20px; }
  .alert-error { background: #1C0A0A; border: 1px solid #7F1D1D; color: #FCA5A5; }
  .alert-success { background: #052E16; border: 1px solid #14532D; color: #86EFAC; }

  /* Footer */
  .footer {
    border-top: 1px solid var(--border); padding: 32px 0;
    text-align: center; font-size: 13px; color: var(--text-3);
    font-family: var(--font-mono);
  }

  /* ── Billing: two-step progress rail ── */
  .steps {
    display: flex; align-items: center; gap: 12px; margin-bottom: 28px;
    font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .step { display: flex; align-items: center; gap: 8px; color: var(--text-3); }
  .step-num {
    display: grid; place-items: center;
    width: 20px; height: 20px; border-radius: 4px;
    border: 1px solid var(--border); font-size: 10px;
  }
  .step.active { color: var(--accent); }
  .step.active .step-num { border-color: var(--accent-dim); background: #1C1400; }
  .step.done { color: var(--teal); }
  .step.done .step-num { border-color: #115E59; background: #0A2A2A; }
  .step-rail { flex: 1; height: 1px; background: var(--divider); max-width: 48px; }

  /* ── Billing: receipt-style order summary ── */
  .receipt {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--r-lg); padding: 24px; margin-bottom: 20px;
    position: relative; overflow: hidden;
  }
  .receipt::before {
    content: ''; position: absolute; inset: 0 0 auto 0; height: 2px;
    background: linear-gradient(90deg, var(--accent), transparent 70%);
  }
  .receipt-head {
    display: flex; align-items: baseline; justify-content: space-between;
    gap: 16px; margin-bottom: 4px;
  }
  .receipt-plan {
    font-family: var(--font-mono); font-size: 11px; color: var(--accent);
    letter-spacing: 0.12em; text-transform: uppercase;
  }
  .receipt-amount { font-size: 32px; font-weight: 700; letter-spacing: -0.03em; }
  .receipt-amount small {
    font-size: 13px; font-weight: 400; color: var(--text-2);
    letter-spacing: 0; margin-left: 2px;
  }
  .receipt-rule {
    border: 0; border-top: 1px dashed var(--divider); margin: 18px 0;
  }
  .receipt-line {
    display: flex; justify-content: space-between; gap: 12px;
    font-size: 13px; color: var(--text-2); padding: 4px 0;
  }
  .receipt-line span:last-child {
    font-family: var(--font-mono); color: var(--text-1);
  }
  .receipt-perks { list-style: none; margin-top: 14px; }
  .receipt-perks li {
    font-size: 13px; color: var(--text-2); padding: 3px 0;
    display: flex; gap: 8px;
  }
  .receipt-perks li::before { content: '+'; color: var(--teal); }

  /* ── Billing: plan state card (dashboard) ── */
  .plan-row {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px; flex-wrap: wrap;
  }
  .plan-name {
    font-size: 22px; font-weight: 700; letter-spacing: -0.02em;
    display: flex; align-items: center; gap: 10px;
  }
  .plan-meta {
    font-family: var(--font-mono); font-size: 12px; color: var(--text-3);
    margin-top: 6px;
  }
  .status-pill {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em;
    text-transform: uppercase; padding: 3px 10px; border-radius: 100px;
    border: 1px solid var(--border); color: var(--text-3);
  }
  .status-pill::before {
    content: ''; width: 5px; height: 5px; border-radius: 50%;
    background: currentColor;
  }
  .status-active { color: #86EFAC; border-color: #14532D; background: #052E16; }
  .status-past_due, .status-unpaid, .status-incomplete {
    color: #FCA5A5; border-color: #7F1D1D; background: #1C0A0A;
  }
  .status-canceled, .status-incomplete_expired, .status-paused {
    color: var(--text-3); border-color: var(--border);
  }
  .status-trialing { color: var(--teal); border-color: #115E59; background: #0A2A2A; }

  .upgrade-options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
  .upgrade-option {
    display: block; padding: 16px; border-radius: var(--r);
    border: 1px solid var(--border); background: var(--bg);
    transition: border-color 0.15s, transform 0.15s;
  }
  .upgrade-option:hover {
    border-color: var(--accent); text-decoration: none; transform: translateY(-2px);
  }
  .upgrade-option .uo-tier {
    font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--text-3);
  }
  .upgrade-option .uo-price {
    font-size: 22px; font-weight: 700; color: var(--text-1);
    letter-spacing: -0.02em; margin: 4px 0 2px;
  }
  .upgrade-option .uo-price small { font-size: 12px; font-weight: 400; color: var(--text-3); }
  .upgrade-option .uo-limit {
    font-family: var(--font-mono); font-size: 11px; color: var(--accent);
  }
  .upgrade-option.featured { border-color: var(--accent-dim); background: linear-gradient(180deg,#1C1400,var(--bg)); }

  /* ── Credential cards: publishable vs secret ── */
  .key-card { position: relative; overflow: hidden; }
  .key-card::before {
    content: ''; position: absolute; inset: 0 auto 0 0; width: 3px;
  }
  .key-card-pk::before { background: var(--teal); }
  .key-card-sk::before { background: var(--red); }
  .key-card-head {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; margin-bottom: 10px;
  }
  .key-tag {
    font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em;
    text-transform: uppercase; padding: 3px 10px; border-radius: 100px;
  }
  .key-tag-safe { background: #0A2A2A; color: var(--teal); border: 1px solid #115E59; }
  .key-tag-danger { background: #1C0A0A; color: #FCA5A5; border: 1px solid #7F1D1D; }
  .key-help { font-size: 13px; color: var(--text-2); margin-bottom: 14px; line-height: 1.55; }
  .key-help code {
    font-family: var(--font-mono); font-size: 12px; color: var(--text-1);
    background: var(--bg); border: 1px solid var(--border);
    padding: 1px 5px; border-radius: 3px;
  }

  /* ── Domain allowlist form ── */
  .domain-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
  .domain-chip {
    font-family: var(--font-mono); font-size: 12px; color: var(--teal);
    background: #0A2A2A; border: 1px solid #115E59;
    padding: 3px 10px; border-radius: 100px;
  }
  .domain-chip.none {
    color: var(--text-3); background: var(--bg); border-color: var(--border);
  }
  textarea.form-input { resize: vertical; min-height: 76px; line-height: 1.6; }
  .checkbox-row {
    display: flex; align-items: flex-start; gap: 10px; margin-top: 14px;
    font-size: 13px; color: var(--text-2);
  }
  .checkbox-row input { margin-top: 3px; accent-color: var(--accent); }

  /* ── Billing: confirming / success states ── */
  .confirm-badge {
    display: inline-flex; align-items: center; gap: 10px;
    font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.08em;
    text-transform: uppercase; color: var(--accent);
    border: 1px solid var(--accent-dim); border-radius: 100px;
    padding: 6px 16px; margin-bottom: 24px;
  }
  .confirm-badge .spinner {
    width: 10px; height: 10px; border-radius: 50%;
    border: 2px solid var(--accent-dim); border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .paid-mark {
    width: 56px; height: 56px; border-radius: 50%;
    display: grid; place-items: center; margin: 0 auto 24px;
    background: #052E16; border: 1px solid #14532D;
    color: #86EFAC; font-size: 26px;
    animation: pop 0.45s cubic-bezier(0.34,1.56,0.64,1) both;
  }
  @keyframes pop {
    from { transform: scale(0.6); opacity: 0; }
    to   { transform: scale(1);   opacity: 1; }
  }

  /* Staggered reveal for billing pages */
  .reveal > * { animation: rise 0.5s ease both; }
  .reveal > *:nth-child(1) { animation-delay: 0.02s; }
  .reveal > *:nth-child(2) { animation-delay: 0.08s; }
  .reveal > *:nth-child(3) { animation-delay: 0.14s; }
  .reveal > *:nth-child(4) { animation-delay: 0.20s; }
  .reveal > *:nth-child(5) { animation-delay: 0.26s; }
  @keyframes rise {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .reveal > *, .paid-mark { animation: none; }
    .confirm-badge .spinner { animation-duration: 3s; }
  }

  @media (max-width: 768px) {
    .pricing-grid { grid-template-columns: 1fr; }
    .features-grid { grid-template-columns: 1fr; }
    .dash-grid { grid-template-columns: 1fr; }
    .upgrade-options { grid-template-columns: 1fr; }
    .hero h1 { font-size: 36px; }
  }
`;

function layout(title: string, body: string, extraHead = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — SnapOG</title>
  <meta name="description" content="Generate stunning Open Graph images via API. Hosted on Cloudflare edge, cached globally, delivered in milliseconds." />
  <style>${CSS}</style>
  ${extraHead}
</head>
<body>
  ${body}
</body>
</html>`;
}

function nav(_activePath = '/'): string {
  return `
  <nav class="nav">
    <a class="nav-logo" href="/">Snap<span>OG</span></a>
    <div class="nav-links">
      <a href="/#how-it-works">Docs</a>
      <a href="/#pricing">Pricing</a>
      <a href="/register" class="btn btn-primary">Get API Key →</a>
    </div>
  </nav>`;
}

function footer(): string {
  return `
  <footer class="footer">
    <div class="container">
      snapog.dev — OG images at the edge. Built with ♥ on Cloudflare Workers.
    </div>
  </footer>`;
}

export function landingPage(host: string): string {
  void host; // used in template strings below

  const body = `
  ${nav('/')}

  <!-- Hero -->
  <section class="hero">
    <div class="container">
      <div class="hero-eyebrow">Open Graph Images API</div>
      <h1>OG images for every URL,<br/><em>delivered at the edge</em></h1>
      <p class="hero-sub">
        One API call. Instant PNG. Cached globally on Cloudflare CDN.
        Stop hand-coding OG templates — let SnapOG generate them dynamically.
      </p>
      <div class="hero-cta">
        <a href="/register" class="btn btn-primary" style="font-size:15px;padding:12px 28px;">Get Free API Key</a>
        <a href="/#how-it-works" class="btn btn-ghost" style="font-size:15px;padding:12px 28px;">View Docs</a>
      </div>

      <!-- Live OG preview -->
      <div class="og-preview-wrap" style="margin-top:56px;">
        <div class="og-preview-label">1200 × 630 PNG — rendered live</div>
        <img
          src="/og?title=How%20to%20Build%20a%20Billion-Dollar%20API&description=A%20deep%20dive%20into%20developer%20tools%20that%20compound%20%E2%80%94%20and%20the%20pricing%20that%20makes%20them%20survive&domain=myblog.dev&theme=dark&template=default"
          alt="Live OG image example"
          style="width:100%;border-radius:8px;"
        />
      </div>
    </div>
  </section>

  <!-- How it works -->
  <section class="section" id="how-it-works">
    <div class="container">
      <p class="section-title">API Reference</p>
      <h2 class="section-h2">One endpoint, infinite images</h2>
      <p class="section-sub">
        Send a GET request. Get a PNG back. Cache it in your CDN. Done.
      </p>

      <div class="code-block" style="margin-top:36px;">
        <div class="code-block-header">
          <div class="code-block-dots">
            <div class="dot dot-red"></div>
            <div class="dot dot-yellow"></div>
            <div class="dot dot-green"></div>
          </div>
          <span class="code-block-lang">HTTP GET</span>
        </div>
        <pre><span class="c-url">GET https://${host}/og</span>
  <span class="c-comment">  ?title=</span><span class="c-str">Your Page Title Here</span>
  <span class="c-comment">  &amp;description=</span><span class="c-str">Optional subtitle or excerpt</span>
  <span class="c-comment">  &amp;domain=</span><span class="c-str">yourdomain.com</span>
  <span class="c-comment">  &amp;author=</span><span class="c-str">Jane Doe</span>
  <span class="c-comment">  &amp;template=</span><span class="c-str">default</span>  <span class="c-comment"># default | blog | article</span>
  <span class="c-comment">  &amp;theme=</span><span class="c-str">dark</span>      <span class="c-comment"># dark | light</span>
  <span class="c-comment">  &amp;tag=</span><span class="c-str">Tutorial</span>
  <span class="c-comment">  &amp;key=</span><span class="c-str">sk_your_api_key</span>

<span class="c-comment">← 200 OK  Content-Type: image/png  X-Cache: MISS</span></pre>
      </div>

      <h3 style="font-size:18px;font-weight:600;margin:48px 0 0;letter-spacing:-0.01em;">Parameters</h3>
      <table class="params-table">
        <thead>
          <tr>
            <th>Param</th><th>Type</th><th>Required</th><th>Description</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>title</td><td>string</td><td><span class="required">required</span></td><td>Page title — the main headline (max 120 chars)</td></tr>
          <tr><td>key</td><td>string</td><td><span class="required">required</span></td><td>Your API key (free tier = 100 images/month)</td></tr>
          <tr><td>description</td><td>string</td><td><span class="optional">optional</span></td><td>Subtitle or page excerpt (max 200 chars)</td></tr>
          <tr><td>domain</td><td>string</td><td><span class="optional">optional</span></td><td>Your domain shown as source label</td></tr>
          <tr><td>author</td><td>string</td><td><span class="optional">optional</span></td><td>Author name shown in footer</td></tr>
          <tr><td>template</td><td>enum</td><td><span class="optional">optional</span></td><td><code>default</code> | <code>blog</code> | <code>article</code></td></tr>
          <tr><td>theme</td><td>enum</td><td><span class="optional">optional</span></td><td><code>dark</code> (default) | <code>light</code></td></tr>
          <tr><td>tag</td><td>string</td><td><span class="optional">optional</span></td><td>Category label shown as pill (e.g. "Tutorial")</td></tr>
        </tbody>
      </table>

      <h3 style="font-size:18px;font-weight:600;margin:48px 0 20px;letter-spacing:-0.01em;">Use in HTML</h3>
      <div class="code-block">
        <div class="code-block-header">
          <div class="code-block-dots">
            <div class="dot dot-red"></div><div class="dot dot-yellow"></div><div class="dot dot-green"></div>
          </div>
          <span class="code-block-lang">HTML meta tags</span>
        </div>
        <pre><span class="c-comment">&lt;!-- Drop in &lt;head&gt; --&gt;</span>
<span class="c-key">&lt;meta</span> <span class="c-val">property=</span><span class="c-str">"og:image"</span>
      <span class="c-val">content=</span><span class="c-str">"https://${host}/og?title=My+Post+Title&amp;key=YOUR_KEY"</span> <span class="c-key">/&gt;</span>
<span class="c-key">&lt;meta</span> <span class="c-val">property=</span><span class="c-str">"og:image:width"</span>  <span class="c-val">content=</span><span class="c-str">"1200"</span> <span class="c-key">/&gt;</span>
<span class="c-key">&lt;meta</span> <span class="c-val">property=</span><span class="c-str">"og:image:height"</span> <span class="c-val">content=</span><span class="c-str">"630"</span>  <span class="c-key">/&gt;</span>
<span class="c-key">&lt;meta</span> <span class="c-val">name=</span><span class="c-str">"twitter:card"</span>    <span class="c-val">content=</span><span class="c-str">"summary_large_image"</span> <span class="c-key">/&gt;</span>
<span class="c-key">&lt;meta</span> <span class="c-val">name=</span><span class="c-str">"twitter:image"</span>   <span class="c-val">content=</span><span class="c-str">"https://${host}/og?title=My+Post+Title&amp;key=YOUR_KEY"</span> <span class="c-key">/&gt;</span></pre>
      </div>
    </div>
  </section>

  <!-- Features -->
  <section class="section" style="padding-top:0;">
    <div class="container">
      <p class="section-title">Why SnapOG</p>
      <h2 class="section-h2">Built for production, priced for teams</h2>
      <div class="features-grid">
        <div class="feature-card">
          <span class="feature-icon">⚡</span>
          <h3>Edge-cached globally</h3>
          <p>Images are generated once and stored on Cloudflare R2. Subsequent requests hit the cache in under 50ms worldwide.</p>
        </div>
        <div class="feature-card">
          <span class="feature-icon">🎨</span>
          <h3>3 templates out of the box</h3>
          <p>Default, Blog, and Article templates — dark and light variants. No design work needed.</p>
        </div>
        <div class="feature-card">
          <span class="feature-icon">🔑</span>
          <h3>Instant API key</h3>
          <p>Sign up with email, get a key immediately. 100 images free, no credit card required.</p>
        </div>
        <div class="feature-card">
          <span class="feature-icon">📊</span>
          <h3>Usage dashboard</h3>
          <p>Track how many images you've generated, reset date, and tier status in a clean developer dashboard.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Pricing -->
  <section class="section" id="pricing">
    <div class="container">
      <p class="section-title">Pricing</p>
      <h2 class="section-h2">Start free. Scale as you publish.</h2>
      <div class="pricing-grid">

        <div class="pricing-card">
          <p class="pricing-tier">Free</p>
          <p class="pricing-price">$0</p>
          <p class="pricing-period">forever</p>
          <p class="pricing-limit">100 images / month</p>
          <ul class="pricing-features">
            <li>3 templates (dark + light)</li>
            <li>R2 global cache</li>
            <li>API key + dashboard</li>
            <li class="dim">SnapOG watermark</li>
            <li class="dim">No custom fonts</li>
          </ul>
          <div class="pricing-cta">
            <a href="/register" class="btn btn-ghost" style="width:100%;">Get started →</a>
          </div>
        </div>

        <div class="pricing-card featured">
          <p class="pricing-tier pricing-tier-featured">⚡ Pro — most popular</p>
          <p class="pricing-price" style="color:var(--accent);">$19</p>
          <p class="pricing-period">per month</p>
          <p class="pricing-limit" style="color:var(--accent);">10,000 images / month</p>
          <ul class="pricing-features">
            <li>Everything in Free</li>
            <li>No watermark</li>
            <li>Custom font upload</li>
            <li>Usage analytics</li>
            <li>Priority support</li>
          </ul>
          <div class="pricing-cta">
            <a href="/register?tier=pro" class="btn btn-primary" style="width:100%;">Start Pro →</a>
          </div>
        </div>

        <div class="pricing-card">
          <p class="pricing-tier">Business</p>
          <p class="pricing-price">$49</p>
          <p class="pricing-period">per month</p>
          <p class="pricing-limit">100,000 images / month</p>
          <ul class="pricing-features">
            <li>Everything in Pro</li>
            <li>Custom domain (CNAME)</li>
            <li>Team access (3 seats)</li>
            <li>White-label (no branding)</li>
            <li>SLA + priority queue</li>
          </ul>
          <div class="pricing-cta">
            <a href="/register?tier=business" class="btn btn-ghost" style="width:100%;">Start Business →</a>
          </div>
        </div>

      </div>
    </div>
  </section>

  ${footer()}

  <script>
    // Copy to clipboard helper
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.copy || '');
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });
    });
  </script>`;

  return layout('Generate OG images at the edge', body);
}

function isPaid(tier?: string): tier is PaidTier {
  return tier === 'pro' || tier === 'business';
}

/**
 * `tier` is INTENT, not entitlement. Registration always mints a free key; when
 * someone arrives from a paid CTA we show them exactly where payment happens so
 * the two-step flow never feels like a bait-and-switch.
 */
export function registerPage(error?: string, tier?: string): string {
  const paid = isPaid(tier);

  const steps = paid
    ? `
      <div class="steps">
        <div class="step active"><span class="step-num">1</span> Create key</div>
        <div class="step-rail"></div>
        <div class="step"><span class="step-num">2</span> Payment</div>
      </div>`
    : '';

  const summary = paid
    ? `
      <div class="receipt">
        <div class="receipt-head">
          <div>
            <p class="receipt-plan">SnapOG ${TIER_LABEL[tier]}</p>
            <p class="receipt-amount">${priceLabel(tier)}<small>/month</small></p>
          </div>
          <span class="tier-badge tier-${tier}">${tier}</span>
        </div>
        <hr class="receipt-rule" />
        <div class="receipt-line"><span>Images included</span><span>${limitLabel(tier)} / mo</span></div>
        <div class="receipt-line"><span>Billing</span><span>Monthly, cancel anytime</span></div>
        <div class="receipt-line"><span>Charged by</span><span>Stripe</span></div>
        <ul class="receipt-perks">
          ${TIER_PERKS[tier].map(p => `<li>${p}</li>`).join('\n          ')}
        </ul>
      </div>`
    : '';

  const heading = paid
    ? `Get your key, then pay`
    : `Start generating`;

  const sub = paid
    ? `Step 1 creates your API key — free, instant, no card. Step 2 takes you to
       Stripe to activate ${TIER_LABEL[tier]} on that key.`
    : `Enter your email to receive your API key instantly. No password.
       No credit card. 100 images a month, free forever.`;

  const cta = paid
    ? `Create key → continue to payment`
    : `Create API Key →`;

  const body = `
  ${nav()}
  <section class="section">
    <div class="container reveal" style="max-width:480px;">
      ${steps}
      <p class="section-title">${paid ? `Upgrade to ${TIER_LABEL[tier]}` : 'Get API Key'}</p>
      <h1 class="section-h2">${heading}</h1>
      <p class="section-sub" style="margin-bottom:32px;">${sub}</p>

      ${error ? `<div class="alert alert-error">${esc(error)}</div>` : ''}

      ${summary}

      <div class="card">
        <form method="POST" action="/register">
          <input type="hidden" name="tier" value="${paid ? tier : 'free'}" />
          <div class="form-group">
            <label class="form-label" for="email">EMAIL ADDRESS</label>
            <input class="form-input" type="email" name="email" id="email" placeholder="you@example.com" required autocomplete="email" />
            <p class="form-hint">Your API key will be displayed immediately after registration.</p>
          </div>
          <div class="form-group">
            <label class="form-label" for="keyname">KEY NAME (optional)</label>
            <input class="form-input" type="text" name="keyname" id="keyname" placeholder="production" />
            <p class="form-hint">Give this key a label to identify it later.</p>
          </div>
          <button type="submit" class="btn btn-primary" style="width:100%;padding:14px;font-size:15px;">
            ${cta}
          </button>
          ${
            paid
              ? `<p class="form-hint" style="text-align:center;margin-top:12px;">
                   You are not charged until you complete Stripe checkout.
                 </p>`
              : ''
          }
        </form>
      </div>

      <p style="font-size:13px;color:var(--text-3);margin-top:20px;text-align:center;">
        Already have a key? <a href="/dashboard">View your dashboard</a>
        ${paid ? `· <a href="/register">Just the free tier →</a>` : ''}
      </p>
    </div>
  </section>
  ${footer()}`;

  return layout(paid ? `Upgrade to ${TIER_LABEL[tier]}` : 'Get API Key', body);
}

/**
 * Every key minted here is free tier. `upgradeIntent` only means "this person
 * clicked a paid CTA" — so we hand them the key first (they must save it) and
 * then put the payment step front and centre.
 */
export function keyCreatedPage(
  rawKey: string,
  rawPublishable: string,
  email: string,
  upgradeIntent?: PaidTier
): string {
  const keyQ = encodeURIComponent(rawKey);
  const pkQ = encodeURIComponent(rawPublishable);
  const paid = upgradeIntent !== undefined;

  const steps = paid
    ? `
      <div class="steps">
        <div class="step done"><span class="step-num">✓</span> Key created</div>
        <div class="step-rail"></div>
        <div class="step active"><span class="step-num">2</span> Payment</div>
      </div>`
    : '';

  const payBlock = paid
    ? `
      <div class="receipt" style="margin-top:32px;">
        <div class="receipt-head">
          <div>
            <p class="receipt-plan">Activate ${TIER_LABEL[upgradeIntent]}</p>
            <p class="receipt-amount">${priceLabel(upgradeIntent)}<small>/month</small></p>
          </div>
          <span class="tier-badge tier-${upgradeIntent}">${upgradeIntent}</span>
        </div>
        <hr class="receipt-rule" />
        <div class="receipt-line"><span>Your key today</span><span>Free — ${limitLabel('free')} images/mo</span></div>
        <div class="receipt-line"><span>After payment</span><span style="color:var(--accent);">${limitLabel(upgradeIntent)} images/mo</span></div>
        <a href="/checkout?tier=${upgradeIntent}&amp;key=${keyQ}"
           class="btn btn-primary"
           style="width:100%;padding:14px;font-size:15px;margin-top:20px;">
          Pay ${priceLabel(upgradeIntent)}/mo with Stripe →
        </a>
        <p style="font-size:12px;color:var(--text-3);margin-top:12px;text-align:center;font-family:var(--font-mono);">
          Secure checkout · Cancel anytime · Your key keeps working either way
        </p>
      </div>`
    : `
      <div class="card" style="margin-top:32px;">
        <p class="card-title">Need more than ${limitLabel('free')} images?</p>
        <div class="upgrade-options" style="margin-top:0;">
          <a class="upgrade-option featured" href="/checkout?tier=pro&amp;key=${keyQ}">
            <p class="uo-tier">Pro</p>
            <p class="uo-price">${priceLabel('pro')}<small>/mo</small></p>
            <p class="uo-limit">${limitLabel('pro')} images/mo</p>
          </a>
          <a class="upgrade-option" href="/checkout?tier=business&amp;key=${keyQ}">
            <p class="uo-tier">Business</p>
            <p class="uo-price">${priceLabel('business')}<small>/mo</small></p>
            <p class="uo-limit">${limitLabel('business')} images/mo</p>
          </a>
        </div>
      </div>`;

  const body = `
  ${nav()}
  <section class="section">
    <div class="container reveal" style="max-width:600px;">
      ${steps}
      <div class="alert alert-success">
        ✓ API key created for ${esc(email)}
      </div>
      <p class="section-title">Your API Key</p>
      <h1 class="section-h2">Save this key now</h1>
      <p class="section-sub" style="margin-bottom:32px;">
        This is the only time you'll see the full key. Copy it and store it securely.
      </p>

      <div class="card key-card key-card-pk">
        <div class="key-card-head">
          <p class="card-title" style="margin-bottom:0;">Publishable key</p>
          <span class="key-tag key-tag-safe">safe to embed</span>
        </div>
        <p class="key-help">
          Put this one in your <code>&lt;meta og:image&gt;</code> tags. It can only
          render images — it cannot read your usage or touch billing.
        </p>
        <div class="api-key-row">
          <div class="api-key-display">
            <span class="key-val">${esc(rawPublishable)}</span>
          </div>
          <button class="btn btn-primary" data-copy="${esc(rawPublishable)}" style="white-space:nowrap;">Copy</button>
        </div>
      </div>

      <div class="card key-card key-card-sk" style="margin-top:16px;">
        <div class="key-card-head">
          <p class="card-title" style="margin-bottom:0;">Secret key</p>
          <span class="key-tag key-tag-danger">server-side only</span>
        </div>
        <p class="key-help">
          Never put this in page source. It controls your dashboard, billing and
          settings. Keep it in an environment variable.
        </p>
        <div class="api-key-row">
          <div class="api-key-display">
            <span class="key-val" id="api-key">${esc(rawKey)}</span>
          </div>
          <button class="btn btn-ghost" data-copy="${esc(rawKey)}" style="white-space:nowrap;">Copy</button>
        </div>
        <p style="font-size:12px;color:var(--text-3);margin-top:12px;font-family:var(--font-mono);">
          ${limitLabel('free')} images/month · Resets 1st UTC · Cached images are free
        </p>
      </div>

      ${payBlock}

      <div class="code-block" style="margin-top:32px;">
        <div class="code-block-header">
          <div class="code-block-dots">
            <div class="dot dot-red"></div><div class="dot dot-yellow"></div><div class="dot dot-green"></div>
          </div>
          <span class="code-block-lang">Quick start</span>
        </div>
        <pre><span class="c-comment"># Test it — use the publishable key in URLs</span>
<span class="c-key">curl</span> <span class="c-str">"https://snapog.dev/og?title=Hello+World&amp;key=${esc(rawPublishable)}"</span> \
  <span class="c-val">--output</span> og.png && <span class="c-key">open</span> og.png

<span class="c-comment">&lt;!-- Then drop it in your &lt;head&gt; --&gt;</span>
<span class="c-key">&lt;meta</span> <span class="c-val">property=</span><span class="c-str">"og:image"</span>
      <span class="c-val">content=</span><span class="c-str">"https://snapog.dev/og?title=My+Post&amp;key=${esc(rawPublishable)}"</span> <span class="c-key">/&gt;</span></pre>
      </div>

      <div class="card" style="margin-top:16px;">
        <p class="card-title">Lock it down (recommended)</p>
        <p class="key-help" style="margin-bottom:0;">
          Add your domains in the dashboard so the publishable key only renders
          for your sites. <a href="/dashboard?key=${keyQ}#domains">Set allowed domains →</a>
        </p>
      </div>

      <div style="margin-top:32px;display:flex;gap:12px;">
        <a href="/dashboard?key=${keyQ}" class="btn ${paid ? 'btn-ghost' : 'btn-primary'}">Open Dashboard →</a>
        <a href="/#how-it-works" class="btn btn-ghost">Read the docs</a>
        <a href="/og?title=Hello+World&amp;key=${pkQ}" class="btn btn-ghost" target="_blank" rel="noreferrer">Preview an image →</a>
      </div>
    </div>
  </section>
  ${footer()}
  <script>
    document.querySelectorAll('[data-copy]').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.copy || '');
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });
    });
  </script>`;

  return layout('API Key Created', body);
}

export function dashboardPage(
  key: ApiKey,
  recentCount: number,
  rawKey: string,
  billingEnabled: boolean,
  saved?: string
): string {
  const pct = Math.round((key.usage_count / key.monthly_limit) * 100);
  const barClass = pct >= 100 ? 'full' : pct >= 80 ? 'warn' : '';
  // Quota rolls over at the first instant of the next UTC month — display it in
  // UTC too, so the date shown always matches the date enforced.
  const resetDate = new Date(key.usage_reset_at);
  const nextReset = new Date(
    Date.UTC(resetDate.getUTCFullYear(), resetDate.getUTCMonth() + 1, 1)
  ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  const tierBadge = `<span class="tier-badge tier-${key.tier}">${key.tier}</span>`;
  const keyQ = encodeURIComponent(rawKey);
  const status = key.subscription_status;
  const allowedDomains = (key.allowed_domains ?? '')
    .split(',')
    .map(d => d.trim())
    .filter(Boolean);
  // A paid key whose payment is failing needs to know before it gets cut off.
  const dunning =
    status === 'past_due' || status === 'unpaid' || status === 'incomplete'
      ? `<div class="alert alert-error" style="margin-bottom:24px;">
           <strong>Payment problem.</strong> Stripe couldn't charge your card, so
           this key will drop to the free tier if it isn't resolved.
           ${
             billingEnabled
               ? `<a href="/billing/portal?key=${keyQ}">Update your payment method →</a>`
               : ''
           }
         </div>`
      : '';

  const statusPill = status
    ? `<span class="status-pill status-${status}">${status.replace(/_/g, ' ')}</span>`
    : '';

  // POST /dashboard/domains redirects back here with ?saved=domains. Without
  // this the form silently re-renders and the customer can't tell whether a
  // security setting they just toggled actually took effect.
  const savedNotice =
    saved === 'domains'
      ? `<div class="alert alert-success" style="margin-bottom:20px;">
           Settings saved. The allowed domains and signature requirement below
           are what <code>/og</code> now enforces.
         </div>`
      : '';

  // ── Billing card: what they're on, and the one action that matters next ──
  const upgradeGrid = `
    <div class="upgrade-options">
      ${
        key.tier !== 'pro'
          ? `<a class="upgrade-option featured" href="/checkout?tier=pro&amp;key=${keyQ}">
               <p class="uo-tier">Pro</p>
               <p class="uo-price">${priceLabel('pro')}<small>/mo</small></p>
               <p class="uo-limit">${limitLabel('pro')} images/mo</p>
             </a>`
          : ''
      }
      <a class="upgrade-option ${key.tier === 'pro' ? 'featured' : ''}" href="/checkout?tier=business&amp;key=${keyQ}">
        <p class="uo-tier">Business</p>
        <p class="uo-price">${priceLabel('business')}<small>/mo</small></p>
        <p class="uo-limit">${limitLabel('business')} images/mo</p>
      </a>
    </div>`;

  const billingCard = `
    <div class="card dash-grid-full">
      <p class="card-title">Plan &amp; Billing</p>
      <div class="plan-row">
        <div>
          <div class="plan-name">
            ${key.tier === 'free' ? 'Free' : TIER_LABEL[key.tier as PaidTier]}
            ${statusPill}
          </div>
          <p class="plan-meta">
            ${limitLabel(key.tier === 'free' ? 'free' : (key.tier as PaidTier))} images/month
            ${key.tier === 'free' ? '· $0' : `· ${priceLabel(key.tier as PaidTier)}/mo`}
            ${key.tier_updated_at ? `· since ${esc(key.tier_updated_at.slice(0, 10))}` : ''}
          </p>
        </div>
        ${
          key.tier !== 'free' && billingEnabled && key.stripe_customer_id
            ? `<a href="/billing/portal?key=${keyQ}" class="btn btn-ghost">Manage billing →</a>`
            : ''
        }
      </div>

      ${
        !billingEnabled
          ? `<p style="font-size:13px;color:var(--text-3);margin-top:18px;font-family:var(--font-mono);">
               Upgrades are temporarily unavailable — billing is not configured on
               this deployment.
             </p>`
          : key.tier === 'business' && (status === 'active' || status === 'trialing')
            ? `<p style="font-size:13px;color:var(--text-2);margin-top:18px;">
                 You're on the top plan. Need more than ${limitLabel('business')} images
                 or a custom SLA? <a href="mailto:hello@snapog.dev">Talk to us →</a>
               </p>`
            : upgradeGrid
      }
    </div>`;

  const body = `
  ${nav()}
  <div class="container">
    <div class="dash-layout">
      <div class="dash-header">
        <h1>Dashboard ${tierBadge}</h1>
        <p>API key: <code style="font-family:var(--font-mono);font-size:13px;color:var(--text-2);">${esc(key.key_prefix)}••••••••••••••••••••</code>
          ${key.name ? `· <span style="font-family:var(--font-mono);font-size:13px;">${esc(key.name)}</span>` : ''}
        </p>
      </div>

      ${dunning}

      <div class="dash-grid">

        <!-- Usage card -->
        <div class="card">
          <p class="card-title">Images Rendered This Month</p>
          <div class="usage-count">${key.usage_count.toLocaleString()}</div>
          <p class="usage-limit">
            of ${key.monthly_limit.toLocaleString()} · cached views are free and unlimited
          </p>
          <div class="usage-bar-wrap">
            <div class="usage-bar ${barClass}" style="width:${Math.min(pct, 100)}%"></div>
          </div>
          <div class="usage-meta">
            <span style="color:var(--text-3);font-size:13px;">${pct}% used</span>
            <span style="color:var(--text-3);font-size:13px;">Resets ${nextReset}</span>
          </div>
          ${
            pct >= 80 && key.tier !== 'business' && billingEnabled
              ? `<div style="margin-top:20px;padding-top:20px;border-top:1px solid var(--border);">
                   <p style="font-size:13px;color:var(--text-2);">
                     ${pct >= 100 ? 'Limit reached — requests are returning 429.' : 'You’re close to your limit.'}
                   </p>
                   <a href="/checkout?tier=${key.tier === 'free' ? 'pro' : 'business'}&amp;key=${keyQ}"
                      class="btn btn-primary" style="margin-top:10px;">
                     Upgrade to ${key.tier === 'free' ? `Pro — ${priceLabel('pro')}/mo` : `Business — ${priceLabel('business')}/mo`} →
                   </a>
                 </div>`
              : ''
          }
        </div>

        <!-- Stats sidebar -->
        <div style="display:flex;flex-direction:column;gap:16px;">
          <div class="card">
            <p class="card-title">Recent Generations</p>
            <p style="font-size:32px;font-weight:700;font-family:var(--font-mono);">${recentCount}</p>
            <p style="font-size:13px;color:var(--text-3);margin-top:4px;">in last 24h</p>
          </div>
          <div class="card">
            <p class="card-title">Watermark</p>
            <p style="font-size:32px;font-weight:700;font-family:var(--font-mono);color:${key.tier === 'free' ? 'var(--text-2)' : 'var(--teal)'};">
              ${key.tier === 'free' ? 'ON' : 'OFF'}
            </p>
            <p style="font-size:13px;color:var(--text-3);margin-top:4px;">
              ${key.tier === 'free' ? 'removed on paid plans' : 'clean images'}
            </p>
          </div>
        </div>

        ${billingCard}

        <!-- Keys & domain lockdown -->
        <div class="card dash-grid-full" id="domains">
          <p class="card-title">Keys &amp; Allowed Domains</p>
          ${savedNotice}

          <div class="key-card key-card-pk" style="padding:0 0 0 16px;margin-bottom:20px;">
            <div class="key-card-head">
              <p class="card-title" style="margin-bottom:0;">Publishable key</p>
              <span class="key-tag key-tag-safe">safe to embed</span>
            </div>
            <p class="key-help" style="margin-bottom:8px;">
              This is the key that belongs in your <code>&lt;meta og:image&gt;</code> URLs.
              ${
                key.publishable_prefix
                  ? `<code>${esc(key.publishable_prefix)}…</code>`
                  : 'Not generated for this key — create a new key to get one.'
              }
            </p>
          </div>

          <p class="key-help">
            A key in page source is public. Restrict it to your own domains so a
            stranger can't render on your quota. Leave empty to allow any domain.
          </p>

          <div class="domain-list">
            ${
              allowedDomains.length
                ? allowedDomains.map(d => `<span class="domain-chip">${esc(d)}</span>`).join('')
                : `<span class="domain-chip none">any domain (unrestricted)</span>`
            }
          </div>

          <form method="POST" action="/dashboard/domains">
            <input type="hidden" name="key" value="${esc(rawKey)}" />
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" for="domains-input">ALLOWED DOMAINS</label>
              <textarea class="form-input" name="domains" id="domains-input"
                placeholder="example.com, blog.example.com">${esc(allowedDomains.join(', '))}</textarea>
              <p class="form-hint">
                Comma or newline separated. A bare domain also allows its subdomains.
              </p>
            </div>
            <label class="checkbox-row">
              <input type="checkbox" name="require_signature" ${key.require_signature === 1 ? 'checked' : ''} />
              <span>
                <strong style="color:var(--text-1);">Require signed URLs.</strong>
                Domain checks rely on the <code>Referer</code> header, which social
                crawlers don't send — so they can't be verified. Signed URLs are the
                only hard guarantee. Enabling this breaks any unsigned URL already
                published. <a href="/#signed-urls">How to sign →</a>
              </span>
            </label>
            <button type="submit" class="btn btn-primary" style="margin-top:18px;">Save settings</button>
          </form>
        </div>

        <!-- Quick start code -->
        <div class="card dash-grid-full">
          <p class="card-title">Quick Start</p>
          <div class="code-block">
            <div class="code-block-header">
              <div class="code-block-dots">
                <div class="dot dot-red"></div><div class="dot dot-yellow"></div><div class="dot dot-green"></div>
              </div>
              <span class="code-block-lang">HTML / meta tags</span>
            </div>
            <pre><span class="c-key">&lt;meta</span> <span class="c-val">property=</span><span class="c-str">"og:image"</span>
      <span class="c-val">content=</span><span class="c-str">"https://snapog.dev/og?title=YOUR_TITLE&amp;key=${key.key_prefix}..."</span> <span class="c-key">/&gt;</span></pre>
          </div>
          <div class="code-block" style="margin-top:12px;">
            <div class="code-block-header">
              <div class="code-block-dots">
                <div class="dot dot-red"></div><div class="dot dot-yellow"></div><div class="dot dot-green"></div>
              </div>
              <span class="code-block-lang">cURL test</span>
            </div>
            <pre><span class="c-key">curl</span> <span class="c-str">"https://snapog.dev/og?title=My+Blog+Post&amp;domain=myblog.com&amp;key=${key.key_prefix}..."</span> \
  <span class="c-val">--output</span> og.png && <span class="c-key">open</span> og.png</pre>
          </div>
        </div>

      </div>
    </div>
  </div>
  ${footer()}`;

  return layout('Dashboard', body);
}

/**
 * Landing page after Stripe checkout.
 *
 * The webhook is the source of truth and may not have landed yet, so this page
 * tells the truth about what the DB currently says instead of claiming success.
 */
export function billingSuccessPage(
  key: ApiKey | null,
  rawKey: string | null,
  tier: PaidTier
): string {
  const keyQ = rawKey ? encodeURIComponent(rawKey) : '';
  const upgraded = key !== null && key.tier !== 'free';

  const confirmed = `
    <div style="text-align:center;">
      <div class="paid-mark">✓</div>
    </div>
    <p class="section-title" style="text-align:center;">Payment received</p>
    <h1 class="section-h2" style="text-align:center;">
      ${key ? TIER_LABEL[key.tier as PaidTier] : TIER_LABEL[tier]} is live
    </h1>
    <p class="section-sub" style="margin:0 auto 32px;text-align:center;">
      Your existing API key now serves
      <strong style="color:var(--accent);">${key ? key.monthly_limit.toLocaleString() : limitLabel(tier)}</strong>
      images a month, with no watermark. Nothing to re-deploy — the same key just
      does more.
    </p>`;

  const pending = `
    <div style="text-align:center;">
      <span class="confirm-badge"><span class="spinner"></span> Confirming with Stripe</span>
    </div>
    <p class="section-title" style="text-align:center;">Payment received</p>
    <h1 class="section-h2" style="text-align:center;">Activating ${TIER_LABEL[tier]}…</h1>
    <p class="section-sub" style="margin:0 auto 32px;text-align:center;">
      Stripe has your payment. We upgrade the key the moment the confirmation
      webhook lands — usually a second or two. This page refreshes itself.
    </p>`;

  const body = `
  ${nav()}
  <section class="section">
    <div class="container reveal" style="max-width:560px;">
      ${upgraded ? confirmed : pending}

      <div class="card">
        <p class="card-title">Current plan</p>
        <div class="plan-row">
          <div>
            <div class="plan-name">
              ${key ? (key.tier === 'free' ? 'Free' : TIER_LABEL[key.tier as PaidTier]) : '—'}
              ${
                key?.subscription_status
                  ? `<span class="status-pill status-${key.subscription_status}">${key.subscription_status.replace(/_/g, ' ')}</span>`
                  : ''
              }
            </div>
            <p class="plan-meta">
              ${key ? `${key.monthly_limit.toLocaleString()} images/month` : 'Sign in with your key to see usage'}
            </p>
          </div>
        </div>
      </div>

      <div style="margin-top:28px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        ${
          rawKey
            ? `<a href="/dashboard?key=${keyQ}" class="btn btn-primary" style="padding:12px 24px;">Open Dashboard →</a>`
            : `<a href="/dashboard" class="btn btn-primary" style="padding:12px 24px;">Open Dashboard →</a>`
        }
        <a href="/#how-it-works" class="btn btn-ghost" style="padding:12px 24px;">Read the docs</a>
      </div>

      <p style="font-size:12px;color:var(--text-3);margin-top:24px;text-align:center;font-family:var(--font-mono);">
        Receipt sent by Stripe · Manage or cancel anytime from your dashboard
      </p>
    </div>
  </section>
  ${footer()}
  ${
    upgraded || !rawKey
      ? ''
      : `<script>
           // The webhook usually beats the redirect, but not always.
           setTimeout(() => location.reload(), 3000);
         </script>`
  }`;

  return layout(upgraded ? 'Upgrade complete' : 'Confirming payment', body);
}

/** Checkout abandoned — no guilt, just a clear way back. */
export function billingCancelPage(rawKey: string | null, tier: PaidTier): string {
  const keyQ = rawKey ? encodeURIComponent(rawKey) : '';
  const body = `
  ${nav()}
  <section class="section">
    <div class="container reveal" style="max-width:520px;">
      <p class="section-title">Checkout cancelled</p>
      <h1 class="section-h2">No charge was made</h1>
      <p class="section-sub" style="margin-bottom:32px;">
        Your API key is untouched and still works on the free tier —
        ${limitLabel('free')} images a month. Pick ${TIER_LABEL[tier]} back up
        whenever you're ready.
      </p>

      <div class="card">
        <p class="card-title">Still deciding?</p>
        <ul class="receipt-perks">
          <li>${limitLabel(tier)} images/month instead of ${limitLabel('free')}</li>
          ${TIER_PERKS[tier].map(p => `<li>${p}</li>`).join('\n          ')}
        </ul>
        <div style="margin-top:24px;display:flex;gap:12px;flex-wrap:wrap;">
          ${
            rawKey
              ? `<a href="/checkout?tier=${tier}&amp;key=${keyQ}" class="btn btn-primary">
                   Resume ${TIER_LABEL[tier]} — ${priceLabel(tier)}/mo →
                 </a>
                 <a href="/dashboard?key=${keyQ}" class="btn btn-ghost">Back to dashboard</a>`
              : `<a href="/#pricing" class="btn btn-primary">See pricing →</a>
                 <a href="/dashboard" class="btn btn-ghost">Back to dashboard</a>`
          }
        </div>
      </div>
    </div>
  </section>
  ${footer()}`;

  return layout('Checkout cancelled', body);
}

/**
 * Shown when Stripe env vars are absent. Honest about the cause — a developer
 * seeing this should know it's our misconfiguration, not their mistake.
 */
export function billingUnavailablePage(): string {
  const body = `
  ${nav()}
  <section class="section">
    <div class="container reveal" style="max-width:520px;">
      <p class="section-title">503 — Billing offline</p>
      <h1 class="section-h2">Upgrades are temporarily unavailable</h1>
      <p class="section-sub" style="margin-bottom:28px;">
        Payment processing isn't configured on this deployment yet, so we can't
        take your money — and we won't pretend otherwise. Image generation and
        your existing API key are unaffected.
      </p>

      <div class="card">
        <p class="card-title">What this means</p>
        <div class="receipt-line"><span>Image API</span><span style="color:#86EFAC;">Operational</span></div>
        <div class="receipt-line"><span>Free tier keys</span><span style="color:#86EFAC;">Operational</span></div>
        <div class="receipt-line"><span>Paid upgrades</span><span style="color:#FCA5A5;">Offline</span></div>
        <hr class="receipt-rule" />
        <p style="font-size:13px;color:var(--text-2);">
          Want to be first in line when paid plans open?
          <a href="mailto:hello@snapog.dev?subject=SnapOG%20paid%20plan">Email us</a>
          and we'll set you up manually.
        </p>
      </div>

      <div style="margin-top:28px;display:flex;gap:12px;">
        <a href="/dashboard" class="btn btn-primary">Back to dashboard</a>
        <a href="/" class="btn btn-ghost">Home</a>
      </div>
    </div>
  </section>
  ${footer()}`;

  return layout('Billing unavailable', body);
}

export function errorPage(code: number, message: string): string {
  const body = `
  ${nav()}
  <section class="section">
    <div class="container" style="text-align:center;max-width:480px;">
      <p style="font-family:var(--font-mono);font-size:80px;font-weight:700;color:var(--border);line-height:1;">${code}</p>
      <h1 style="font-size:24px;margin:16px 0 12px;">${esc(message)}</h1>
      <p style="color:var(--text-2);margin-bottom:32px;">Something went wrong. Try again or check the docs.</p>
      <a href="/" class="btn btn-ghost">← Back to home</a>
    </div>
  </section>
  ${footer()}`;

  return layout(`${code} Error`, body);
}
