// ── tabs/brand.js — Brand Deep-Dive Dashboard + AI Analysis
// ── BRAND DEEP-DIVE MODULE ────────────────────────────────────────────────────
let bddActiveBrand = null;
let bddPostSentFilter = 'all';
let bddPostLimit = 5;
let bddMetric = 'engagement'; // 'mention' | 'engagement'

// Brand color palette (cycles)
const BDD_COLORS = [
  '#2563EB','#7c3aed','#0ea5e9','#10b981','#f59e0b',
  '#ef4444','#ec4899','#14b8a6','#6366f1','#84cc16',
];
function bddColor(brand) {
  const brands = reportData.sentRows.map(r => r.brand);
  const idx = brands.indexOf(brand);
  return BDD_COLORS[(idx < 0 ? 0 : idx) % BDD_COLORS.length];
}

function updateBrandDeepDive() {
  const hasData = rawData.length > 0;
  document.getElementById('bddEmpty').style.display   = hasData ? 'none' : '';
  document.getElementById('bddContent').style.display = hasData ? ''     : 'none';
  if (!hasData) return;

  // Sync metric toggle buttons
  document.querySelectorAll('.bdd-metric-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.metric === bddMetric);
  });

  // Build brand pills
  const pillsEl = document.getElementById('bddBrandPills');
  pillsEl.innerHTML = '';
  const brands = reportData.sentRows.map(r => r.brand).filter(Boolean);
  if (!brands.length) return;

  brands.forEach((b, i) => {
    const p = document.createElement('button');
    p.className = 'bdd-pill' + (b === bddActiveBrand ? ' active' : '');
    p.textContent = b;
    p.style.setProperty('--pill-color', BDD_COLORS[i % BDD_COLORS.length]);
    if (b === bddActiveBrand) {
      p.style.background = BDD_COLORS[i % BDD_COLORS.length];
      p.style.borderColor = BDD_COLORS[i % BDD_COLORS.length];
    }
    p.addEventListener('click', () => {
      bddActiveBrand = b;
      bddPostSentFilter = 'all';
      bddPostLimit = 5;
      // Reset post filter pills
      document.querySelectorAll('[data-bdd-sent]').forEach(x => x.classList.toggle('active', x.dataset.bddSent === 'all'));
      updateBrandDeepDive();
    });
    pillsEl.appendChild(p);
  });

  // Auto-select first brand if none selected
  if (!bddActiveBrand || !brands.includes(bddActiveBrand)) {
    bddActiveBrand = brands[0];
    updateBrandDeepDive(); return;
  }

  renderBddHero();
  renderBddKpis();
  renderBddSentDonut();
  renderBddTopicBars();
  renderBddSourceBars();
  renderBddTopicSentBars();
  renderBddCompareTable();
  renderBddTopPosts();
  // Update brand label and post count in the AI Social Listening card
  const lbl = document.getElementById('bddAiBrandLabel');
  if (lbl) lbl.textContent = bddActiveBrand || 'selected brand';
  populateBddAiFilters();
  _bddAiUpdatePostCount();
  _renderBddAiBrandPills();
}

// ── BDD AI BRAND PILL SELECTOR ────────────────────────────────────────────────
function _renderBddAiBrandPills() {
  const container = document.getElementById('bddAiBrandPills');
  if (!container) return;
  container.innerHTML = '';
  const brands = reportData.sentRows.map(r => r.brand).filter(Boolean);
  brands.forEach((b, i) => {
    const color = BDD_COLORS[i % BDD_COLORS.length];
    const isActive = b === bddActiveBrand;
    const pill = document.createElement('button');
    pill.className = 'bdd-ai-brand-pill' + (isActive ? ' active' : '');
    pill.style.setProperty('--pill-color', color);
    if (isActive) pill.style.color = color;
    pill.innerHTML = `<span class="pill-dot" style="background:${isActive ? color : 'rgba(255,255,255,.6)'}"></span>${b}`;
    pill.addEventListener('click', () => {
      bddActiveBrand = b;
      bddPostSentFilter = 'all';
      bddPostLimit = 5;
      document.querySelectorAll('[data-bdd-sent]').forEach(x => x.classList.toggle('active', x.dataset.bddSent === 'all'));
      updateBrandDeepDive();
    });
    container.appendChild(pill);
  });
}
function renderBddHero() {
  const brand = bddActiveBrand;
  const color = bddColor(brand);
  const heroEl = document.getElementById('bddHero');
  heroEl.style.display = '';
  document.getElementById('bddHeroBadge').textContent = brand.charAt(0).toUpperCase();
  document.getElementById('bddHeroBadge').style.background = `linear-gradient(135deg, ${color}, ${color}cc)`;
  document.getElementById('bddHeroName').textContent = brand;
  const metaEl = document.getElementById('bddSubnavMeta');
  if (metaEl) metaEl.textContent = brand;

  const metrics = reportData.metrics || {};
  const row = reportData.sentRows.find(r => r.brand === brand);

  if (bddMetric === 'engagement') {
    const eng = Math.round(metrics.engagement?.brand?.[brand]||0);
    // Use the true global total (pre-explode) as denominator.
    // Summing eng_by_brand across all brands inflates the total because posts
    // tagged to multiple brands are counted in each brand's bucket.
    const globalEng = reportData.totalEngagement || 1;
    const share = (eng / globalEng * 100).toFixed(1);
    document.getElementById('bddHeroSub').textContent =
      `${eng.toLocaleString()} total engagement · ${share}% share of engagement`;
  } else {
    const men = metrics.mention?.brand?.[brand] ?? (reportData.sentRows.find(r => r.brand === brand)?.total ?? 0);
    // Use the true global unique-post count as denominator for the same reason.
    const globalMen = reportData.totalMention || 1;
    const share = (men / globalMen * 100).toFixed(1);
    document.getElementById('bddHeroSub').textContent =
      `${men.toLocaleString()} mentions · ${share}% share of voice`;
  }
}

// ── KPIS ──────────────────────────────────────────────────────────────────────
function renderBddKpis() {
  const brand = bddActiveBrand;
  const color = bddColor(brand);
  const row   = reportData.sentRows.find(r => r.brand === brand) || {positive:0,neutral:0,negative:0,total:0};
  const metrics = reportData.metrics || {};
  const eng  = (metrics.engagement?.brand?.[brand]||0);
  const men  = (metrics.mention?.brand?.[brand] || row.total || 0);
  // Use men (single-explode unique count) as denominator for sentiment %,
  // not row.total which is overcounted from the Brand×Topic double-explode.
  const total = men || 1;
  const posPct = (row.positive / total * 100).toFixed(1);
  const negPct = (row.negative / total * 100).toFixed(1);
  const netSent = ((row.positive - row.negative) / total * 100).toFixed(1);
  const netColor = netSent >= 20 ? 'var(--pos)' : (netSent <= -20 ? 'var(--neg)' : 'var(--neu)');

  const kpis = [
    { key:'engagement', val: Math.round(eng).toLocaleString(),              lbl: 'Total Engagement', sub: 'engagement score',                       cls: 'eng' },
    { key:'mention',    val: men.toLocaleString(),                          lbl: 'Total Mentions',   sub: 'unique posts',                           cls: '' },
    { key:'positive',   val: posPct + '%',                                  lbl: 'Positive',         sub: row.positive.toLocaleString() + ' posts', cls: 'pos' },
    { key:'negative',   val: negPct + '%',                                  lbl: 'Negative',         sub: row.negative.toLocaleString() + ' posts', cls: 'neg' },
    { key:'net',        val: (netSent >= 0 ? '+' : '') + netSent + '%',     lbl: 'Net Sentiment',    sub: 'positive minus negative',                cls: '' },
  ];

  const el = document.getElementById('bddKpiRow');
  el.innerHTML = '';
  kpis.forEach(k => {
    const isActiveMetric = k.key === bddMetric;
    const ringColor = k.key === 'engagement' ? '#7c3aed' : color;
    const d = document.createElement('div');
    d.className = `bdd-kpi ${k.cls}`;
    if (isActiveMetric) d.style.cssText = `box-shadow:0 0 0 2.5px ${ringColor},0 4px 14px rgba(0,0,0,.08);`;
    const valColor = k.lbl==='Net Sentiment' ? netColor
                   : k.cls==='pos' ? 'var(--pos)'
                   : k.cls==='neg' ? 'var(--neg)'
                   : k.cls==='eng' ? '#7c3aed'
                   : color;
    d.innerHTML = `
      ${isActiveMetric ? `<div style="font-size:9px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:${ringColor};margin-bottom:5px;display:flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:${ringColor};display:inline-block"></span>ACTIVE VIEW</div>` : ''}
      <div class="bdd-kpi-val" style="color:${valColor}">${k.val}</div>
      <div class="bdd-kpi-lbl">${k.lbl}</div>
      <div class="bdd-kpi-sub">${k.sub}</div>`;
    el.appendChild(d);
  });
}

// ── SENTIMENT DONUT ───────────────────────────────────────────────────────────
function renderBddSentDonut() {
  const brand = bddActiveBrand;
  const el    = document.getElementById('bddSentDonut');
  el.innerHTML = '';
  const row = reportData.sentRows.find(r => r.brand === brand) || {positive:0,neutral:0,negative:0,total:0};
  const total = row.positive + row.neutral + row.negative || 1;

  const segs = [
    { label:'Positive', val:row.positive, color:'#1DC997' },
    { label:'Neutral',  val:row.neutral,  color:'#FFC145' },
    { label:'Negative', val:row.negative, color:'#FF5050' },
  ];

  const SIZE = 200, STROKE = 38, R = (SIZE - STROKE) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  canvas.style.cssText = 'display:block;margin:0 auto';

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:'+SIZE+'px;margin:0 auto 12px';

  const centre = document.createElement('div');
  centre.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;pointer-events:none';
  centre.innerHTML = `<div style="font-family:'Bricolage Grotesque',sans-serif;font-size:22px;font-weight:800;color:var(--text)">${total.toLocaleString()}</div><div style="font-family:'DM Mono',monospace;font-size:9px;color:var(--text3);letter-spacing:.8px">MENTIONS</div>`;

  wrap.appendChild(canvas);
  wrap.appendChild(centre);
  el.appendChild(wrap);

  const leg = document.createElement('div');
  leg.style.cssText = 'display:flex;flex-direction:column;gap:7px;margin-top:4px';
  segs.forEach(s => {
    const pct = (s.val / total * 100).toFixed(1);
    const r2 = document.createElement('div');
    r2.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px';
    r2.innerHTML = `<span style="width:10px;height:10px;border-radius:3px;background:${s.color};flex-shrink:0;display:inline-block"></span><span style="font-size:12px;font-weight:600;color:var(--text2);flex:1">${s.label}</span><span style="font-family:'DM Mono',monospace;font-size:12px;font-weight:700;color:var(--text)">${s.val.toLocaleString()}</span><span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text3);min-width:40px;text-align:right">${pct}%</span>`;
    leg.appendChild(r2);
  });
  el.appendChild(leg);

  requestAnimationFrame(() => {
    const ctx = canvas.getContext('2d');
    const cx = SIZE/2, cy = SIZE/2;
    ctx.beginPath(); ctx.arc(cx,cy,R,0,Math.PI*2); ctx.strokeStyle='rgba(0,0,0,.06)'; ctx.lineWidth=STROKE; ctx.stroke();
    let angle = -Math.PI/2;
    segs.forEach(s => {
      if (!s.val) return;
      const sweep = (s.val/total)*Math.PI*2;
      ctx.beginPath(); ctx.arc(cx,cy,R,angle,angle+sweep); ctx.strokeStyle=s.color; ctx.lineWidth=STROKE; ctx.lineCap='butt'; ctx.stroke();
      angle += sweep;
    });
  });
}

// ── TOPIC BREAKDOWN ───────────────────────────────────────────────────────────
function renderBddTopicBars() {
  const brand = bddActiveBrand;
  const el    = document.getElementById('bddTopicBars');
  el.innerHTML = '';
  const bt = reportData.brandTopicSent?.[brand] || {};
  const color = bddColor(brand);
  const metrics = reportData.metrics || {};

  // Build per-topic engagement from topicRows
  const topicEngMap = {};
  (reportData.topicRows||[]).forEach(r => {
    if (r.brand === brand || (r.brand === '' && false)) {
      if (r.topic && r.engagement !== '') topicEngMap[r.topic] = parseFloat(r.engagement)||0;
    }
  });
  // Also pull from a full scan of topicRows finding the brand block
  let foundBrand = false;
  (reportData.topicRows||[]).forEach(r => {
    if (r.brand === brand) foundBrand = true;
    if (foundBrand && r.brand === '__blank__') foundBrand = false;
    if (foundBrand && r.topic && r.topic !== '') topicEngMap[r.topic] = parseFloat(r.engagement)||0;
  });

  const topicData = TOPIC_ORDER.map(t => {
    const d = bt[t] || {positive:0,neutral:0,negative:0};
    const mentionTotal = d.positive + d.neutral + d.negative;
    const engTotal = topicEngMap[t] || 0;
    return { topic:t, mention:mentionTotal, engagement:engTotal, ...d };
  });

  const useEng = bddMetric === 'engagement';
  const metricKey = useEng ? 'engagement' : 'mention';
  const sorted = [...topicData].filter(x => x[metricKey] > 0).sort((a,b) => b[metricKey] - a[metricKey]);

  if (!sorted.length) { el.innerHTML = '<div class="bdd-placeholder">No topic data available</div>'; return; }
  const maxVal = Math.max(...sorted.map(x => x[metricKey]), 1);

  // Section label
  const metaLabel = document.createElement('div');
  metaLabel.style.cssText = 'font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.5px;text-transform:uppercase;margin-bottom:10px;display:flex;align-items:center;gap:6px';
  metaLabel.innerHTML = `<span style="padding:2px 8px;border-radius:4px;background:${useEng?'#f5f3ff':'var(--accent-lt)'};color:${useEng?'#7c3aed':'var(--accent)'};border:1px solid ${useEng?'rgba(124,58,237,.2)':'rgba(37,99,235,.2)'}">by ${useEng ? '⚡ engagement' : '📌 mention'}</span>`;
  el.appendChild(metaLabel);

  sorted.forEach(d => {
    const barPct = (d[metricKey] / maxVal * 100).toFixed(1);
    const displayVal = useEng ? Math.round(d.engagement).toLocaleString() : d.mention.toLocaleString();
    const row = document.createElement('div');
    row.className = 'bdd-topic-bar-row';
    row.innerHTML = `
      <div class="bdd-topic-lbl" title="${d.topic}">${d.topic}</div>
      <div class="bdd-topic-track">
        <div class="bdd-topic-seg" style="width:0%;background:${SENT_COLORS.positive}" title="positive: ${d.positive.toLocaleString()}"></div>
        <div class="bdd-topic-seg" style="width:0%;background:${SENT_COLORS.neutral}"  title="neutral: ${d.neutral.toLocaleString()}"></div>
        <div class="bdd-topic-seg" style="width:0%;background:${SENT_COLORS.negative}" title="negative: ${d.negative.toLocaleString()}"></div>
      </div>
      <div class="bdd-topic-total">${displayVal}</div>`;
    el.appendChild(row);
    requestAnimationFrame(() => {
      const mentionTotal = d.mention || 1;
      const pos = (d.positive/mentionTotal*100).toFixed(1);
      const neu = (d.neutral/mentionTotal*100).toFixed(1);
      const neg = (d.negative/mentionTotal*100).toFixed(1);
      // Bar width reflects the active metric; sentiment split is always mention-based
      const segs = row.querySelectorAll('.bdd-topic-seg');
      segs[0].style.width = (parseFloat(pos) * barPct / 100).toFixed(2)+'%';
      segs[1].style.width = (parseFloat(neu) * barPct / 100).toFixed(2)+'%';
      segs[2].style.width = (parseFloat(neg) * barPct / 100).toFixed(2)+'%';
    });
  });

  const leg = document.createElement('div');
  leg.className = 'sent-legend';
  leg.style.cssText = 'margin-top:12px';
  ['positive','neutral','negative'].forEach(s => {
    const i = document.createElement('div'); i.className = 'sent-leg-item';
    i.innerHTML = `<span class="sent-leg-dot" style="background:${SENT_COLORS[s]}"></span>${s}`;
    leg.appendChild(i);
  });
  el.appendChild(leg);
}

// ── SOURCE / CHANNEL BREAKDOWN ────────────────────────────────────────────────
function renderBddSourceBars() {
  const brand = bddActiveBrand;
  const el    = document.getElementById('bddSourceBars');
  el.innerHTML = '';
  const useEng = bddMetric === 'engagement';

  const pool = (allRawData.length ? allRawData : rawData).filter(row => {
    let b = String(row.Brands||'').trim();
    if (b.startsWith('[') && b.endsWith(']')) b = b.slice(1,-1);
    return b.split(',').map(x=>x.trim()).includes(brand);
  });

  // Accumulate into the 6 canonical channels
  const buckets = {};
  CANONICAL_CHANNELS.forEach(ch => { buckets[ch] = { mention:0, engagement:0 }; });
  pool.forEach(r => {
    const ch = normalizeChannel(r.source||r.Source||r.channel||r.Channel||'');
    buckets[ch].mention++;
    buckets[ch].engagement += parseFloat(r.engagement_score)||0;
  });

  const metricKey = useEng ? 'engagement' : 'mention';
  const entries = CANONICAL_CHANNELS
    .map(ch => [ch, useEng ? Math.round(buckets[ch].engagement) : buckets[ch].mention])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!entries.length) { el.innerHTML = '<div class="bdd-placeholder">No source data available</div>'; return; }
  const maxVal = entries[0][1];
  const grandTotal = entries.reduce((s, [, v]) => s + v, 0);

  // Meta label
  const metaLabel = document.createElement('div');
  metaLabel.style.cssText = 'font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.5px;text-transform:uppercase;margin-bottom:12px;display:flex;align-items:center;gap:6px';
  metaLabel.innerHTML = `<span style="padding:2px 8px;border-radius:4px;background:${useEng?'#f5f3ff':'var(--accent-lt)'};color:${useEng?'#7c3aed':'var(--accent)'};border:1px solid ${useEng?'rgba(124,58,237,.2)':'rgba(37,99,235,.2)'}">by ${useEng ? '⚡ engagement' : '📌 mention'}</span>`;
  el.appendChild(metaLabel);

  entries.forEach(([ch, cnt]) => {
    const barPct  = (cnt / maxVal * 100).toFixed(1);
    const truePct = (cnt / grandTotal * 100).toFixed(1);
    const color   = CHANNEL_COLORS[ch] || '#6B7280';
    const row     = document.createElement('div');
    row.className = 'bdd-src-row';
    row.innerHTML = `
      <div class="bdd-src-lbl" title="${ch}" style="display:flex;align-items:center;gap:6px">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
        ${ch}
      </div>
      <div class="bdd-src-track">
        <div class="bdd-src-fill" style="width:0%;background:${color}" title="${ch}: ${cnt.toLocaleString()} (${truePct}% of total)"></div>
      </div>
      <div class="bdd-src-val">${cnt.toLocaleString()} <span style="color:var(--text3);font-weight:400">(${truePct}%)</span></div>`;
    el.appendChild(row);
    requestAnimationFrame(() => { row.querySelector('.bdd-src-fill').style.width = barPct + '%'; });
  });

  // Channel legend dots at bottom
  const leg = document.createElement('div');
  leg.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px 14px;margin-top:14px;padding-top:10px;border-top:1px solid var(--border)';
  CANONICAL_CHANNELS.forEach(ch => {
    const dot = document.createElement('div');
    dot.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text3);font-weight:600';
    dot.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${CHANNEL_COLORS[ch]};display:inline-block;flex-shrink:0"></span>${ch}`;
    leg.appendChild(dot);
  });
  el.appendChild(leg);
}

// ── SENTIMENT BY TOPIC ────────────────────────────────────────────────────────
function renderBddTopicSentBars() {
  const brand = bddActiveBrand;
  const el    = document.getElementById('bddTopicSentBars');
  el.innerHTML = '';
  const bt = reportData.brandTopicSent?.[brand] || {};

  // Gather per-topic positive & negative counts
  const rows = TOPIC_ORDER.map(topic => {
    const d = bt[topic] || {positive:0,neutral:0,negative:0};
    return { topic, pos: d.positive||0, neg: d.negative||0 };
  });

  // Max value for scaling both sides equally
  const maxVal = Math.max(...rows.map(r => Math.max(r.pos, r.neg)), 1);

  // Header row
  const header = document.createElement('div');
  header.style.cssText = 'display:grid;grid-template-columns:1fr 120px 1fr;align-items:center;margin-bottom:6px;padding:0 0 6px;border-bottom:1px solid var(--border)';
  header.innerHTML = `
    <div style="text-align:right;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#0d9e75;padding-right:12px">Positive Mentions</div>
    <div style="text-align:center;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--text3)">Topic</div>
    <div style="text-align:left;font-size:10px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:#d14f4f;padding-left:12px">Negative Mentions</div>
  `;
  el.appendChild(header);

  rows.forEach(({ topic, pos, neg }) => {
    const posW = (pos / maxVal * 100).toFixed(1);
    const negW = (neg / maxVal * 100).toFixed(1);

    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:1fr 100px 1fr;align-items:center;margin-bottom:9px;gap:0';

    // Left (positive) side — bar grows right-to-left
    const leftCell = document.createElement('div');
    leftCell.style.cssText = 'display:flex;align-items:center;gap:8px;justify-content:flex-end;padding-right:8px';
    const posLabel = document.createElement('div');
    posLabel.style.cssText = 'font-family:"DM Mono",monospace;font-size:12px;font-weight:700;color:#0d9e75;flex-shrink:0;min-width:36px;text-align:right';
    posLabel.textContent = pos.toLocaleString();
    const posTrack = document.createElement('div');
    posTrack.style.cssText = 'width:100%;height:26px;border-radius:4px 0 0 4px;background:var(--bg);border:1px solid var(--border);border-right:none;overflow:hidden;display:flex;justify-content:flex-end';
    const posFill = document.createElement('div');
    posFill.style.cssText = 'height:100%;width:0%;background:#1DC997;border-radius:4px 0 0 4px;transition:width .65s cubic-bezier(.16,1,.3,1)';
    posFill.title = `Positive: ${pos.toLocaleString()}`;
    posTrack.appendChild(posFill);
    leftCell.appendChild(posLabel);
    leftCell.appendChild(posTrack);

    // Center label
    const centerCell = document.createElement('div');
    centerCell.style.cssText = 'text-align:center;font-size:11px;font-weight:700;color:var(--text);text-transform:capitalize;padding:0 4px;background:var(--surface2);border:1px solid var(--border);height:26px;display:flex;align-items:center;justify-content:center;z-index:1;flex-shrink:0';
    centerCell.textContent = topic;

    // Right (negative) side
    const rightCell = document.createElement('div');
    rightCell.style.cssText = 'display:flex;align-items:center;gap:8px;padding-left:8px';
    const negTrack = document.createElement('div');
    negTrack.style.cssText = 'width:100%;height:26px;border-radius:0 4px 4px 0;background:var(--bg);border:1px solid var(--border);border-left:none;overflow:hidden';
    const negFill = document.createElement('div');
    negFill.style.cssText = 'height:100%;width:0%;background:#FF5050;border-radius:0 4px 4px 0;transition:width .65s cubic-bezier(.16,1,.3,1)';
    negFill.title = `Negative: ${neg.toLocaleString()}`;
    negTrack.appendChild(negFill);
    const negLabel = document.createElement('div');
    negLabel.style.cssText = 'font-family:"DM Mono",monospace;font-size:12px;font-weight:700;color:#d14f4f;flex-shrink:0;min-width:36px';
    negLabel.textContent = neg.toLocaleString();
    rightCell.appendChild(negTrack);
    rightCell.appendChild(negLabel);

    row.appendChild(leftCell);
    row.appendChild(centerCell);
    row.appendChild(rightCell);
    el.appendChild(row);

    // Animate after paint
    requestAnimationFrame(() => {
      posFill.style.width = posW + '%';
      negFill.style.width = negW + '%';
    });
  });
}

// ── WORD CLOUD ────────────────────────────────────────────────────────────────
// ── COMPETITOR COMPARISON TABLE ────────────────────────────────────────────────
function renderBddCompareTable() {
  const activeBrand = bddActiveBrand;
  // Default sort follows the active metric toggle; the dropdown can override
  const sortKey = document.getElementById('bddCompareSort').value;
  const tbody = document.getElementById('bddCompareTBody');
  tbody.innerHTML = '';

  // Sync the sort dropdown to match the active metric when it hasn't been manually changed
  const dropdown = document.getElementById('bddCompareSort');
  if (dropdown.dataset.userSet !== 'true') {
    dropdown.value = bddMetric === 'engagement' ? 'engagement' : 'mention';
  }
  const effectiveSortKey = dropdown.value;

  const metrics = reportData.metrics || {};
  let rows = reportData.sentRows.map(r => {
    // Use men_by_brand (single brand-axis explode, unique IDs) for mention count.
    // r.total comes from sentiment_counts_by_brand which uses the Brand×Topic
    // double-exploded df and overcounts posts that have multiple topics.
    const mention = metrics.mention?.brand?.[r.brand] ?? r.total;
    const total = mention || 1;
    return {
      brand:      r.brand,
      mention:    mention,
      engagement: Math.round(metrics.engagement?.brand?.[r.brand]||0),
      positive:   r.positive,
      neutral:    r.neutral,
      negative:   r.negative,
      posPct:     r.positive/total*100,
      negPct:     r.negative/total*100,
    };
  });

  rows.sort((a,b) => {
    if (effectiveSortKey === 'mention')    return b.mention - a.mention;
    if (effectiveSortKey === 'engagement') return b.engagement - a.engagement;
    if (effectiveSortKey === 'positive')   return b.posPct - a.posPct;
    if (effectiveSortKey === 'negative')   return b.negPct - a.negPct;
    return 0;
  });

  const maxMention    = Math.max(...rows.map(r => r.mention), 1);
  const maxEngagement = Math.max(...rows.map(r => r.engagement), 1);

  // Highlight the active-metric column header
  document.querySelectorAll('#bddCompareTable thead th').forEach(th => {
    const col = th.dataset.col;
    const isActive = col === bddMetric;
    th.style.color     = isActive ? (bddMetric==='engagement' ? '#7c3aed' : 'var(--accent)') : '';
    th.style.background= isActive ? (bddMetric==='engagement' ? '#f5f3ff' : 'var(--accent-lt)') : '';
  });

  rows.forEach(r => {
    const isActive = r.brand === activeBrand;
    const color = bddColor(r.brand);
    const posPct  = (r.posPct).toFixed(1);
    const negPct  = (r.negPct).toFixed(1);
    const neuPct  = (r.neutral / (r.mention||1) * 100).toFixed(1);
    const posBarW = r.posPct.toFixed(1);
    const negBarW = r.negPct.toFixed(1);

    // Which primary metric column to emphasise
    const mentionStyle    = bddMetric === 'mention'     ? `font-weight:800;color:var(--accent)`  : '';
    const engagementStyle = bddMetric === 'engagement'  ? `font-weight:800;color:#7c3aed`        : '';

    const tr = document.createElement('tr');
    if (isActive) tr.className = 'highlight-row';

    tr.innerHTML = `
      <td style="font-weight:${isActive?'800':'600'};color:${isActive?color:'var(--text2)'}">
        ${isActive?'▶ ':''}${r.brand}
      </td>
      <td class="num">
        <div class="bdd-bar-inline">
          <span style="min-width:60px;text-align:right;${engagementStyle}">${r.engagement.toLocaleString()}</span>
          <div class="bdd-bar-inline-track"><div class="bdd-bar-inline-fill" style="width:${(r.engagement/maxEngagement*100).toFixed(1)}%;background:${bddMetric==='engagement'?'#7c3aed':'var(--border2)'}"></div></div>
        </div>
      </td>
      <td class="num">
        <div class="bdd-bar-inline">
          <span style="min-width:50px;text-align:right;${mentionStyle}">${r.mention.toLocaleString()}</span>
          <div class="bdd-bar-inline-track"><div class="bdd-bar-inline-fill" style="width:${(r.mention/maxMention*100).toFixed(1)}%;background:${bddMetric==='mention'?(isActive?color:'var(--accent)'):'var(--border2)'}"></div></div>
        </div>
      </td>
      <td class="num" style="color:var(--pos);font-weight:600">${posPct}%</td>
      <td class="num" style="color:var(--neu);font-weight:600">${neuPct}%</td>
      <td class="num" style="color:var(--neg);font-weight:600">${negPct}%</td>
      <td>
        <div style="display:flex;height:10px;border-radius:5px;overflow:hidden;background:var(--bg);border:1px solid var(--border)">
          <div style="width:${posBarW}%;background:var(--pos);transition:width .6s"></div>
          <div style="width:${(100-parseFloat(posBarW)-parseFloat(negBarW)).toFixed(1)}%;background:var(--neu)"></div>
          <div style="width:${negBarW}%;background:var(--neg)"></div>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('bddCompareSort').addEventListener('change', () => {
  document.getElementById('bddCompareSort').dataset.userSet = 'true';
  if (bddActiveBrand) renderBddCompareTable();
});

// Metric toggle
document.querySelectorAll('.bdd-metric-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    bddMetric = btn.dataset.metric;
    // Reset sort dropdown to follow metric
    document.getElementById('bddCompareSort').dataset.userSet = 'false';
    document.getElementById('bddCompareSort').value = bddMetric === 'engagement' ? 'engagement' : 'mention';
    if (bddActiveBrand) updateBrandDeepDive();
  });
});

// ── TOP POSTS ─────────────────────────────────────────────────────────────────

// Robustly parse a date value into a clean "DD Mon YYYY" string.
// Handles ISO timestamps, Unix epoch (seconds & ms), and DD/MM/YYYY variants.
function _formatPostDate(raw) {
  if (!raw && raw !== 0) return '';
  const s = String(raw).trim();
  if (!s || s === 'null' || s === 'undefined') return '';

  // Unix epoch in seconds (10 digits) or milliseconds (13 digits)
  if (/^\d{10}$/.test(s)) {
    const d = new Date(parseInt(s, 10) * 1000);
    return _dateToDisplay(d);
  }
  if (/^\d{13}$/.test(s)) {
    const d = new Date(parseInt(s, 10));
    return _dateToDisplay(d);
  }

  // DD/MM/YYYY or DD-MM-YYYY → rewrite to YYYY-MM-DD for reliable parsing
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`);
    return _dateToDisplay(d);
  }

  // ISO / natural string — let Date parse it
  const d = new Date(s);
  if (!isNaN(d.getTime())) return _dateToDisplay(d);

  // Last resort: return the first 10 chars as-is if they look like a date
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

function _dateToDisplay(d) {
  if (!d || isNaN(d.getTime())) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function renderBddTopPosts() {
  const brand = bddActiveBrand;
  const el    = document.getElementById('bddTopPosts');
  el.innerHTML = '';

  let pool = (allRawData.length ? allRawData : rawData).filter(row => {
    let b = String(row.Brands||'').trim();
    if (b.startsWith('[') && b.endsWith(']')) b = b.slice(1,-1);
    return b.split(',').map(x=>x.trim()).includes(brand);
  });

  if (bddPostSentFilter !== 'all') {
    pool = pool.filter(r => String(r.sentiment||'').toLowerCase() === bddPostSentFilter);
  }

  pool = pool.filter(r => String(r.text||'').trim() && String(r.text||'').trim() !== 'null');
  pool.sort((a,b) => (parseFloat(b.engagement_score)||0) - (parseFloat(a.engagement_score)||0));

  const slice = pool.slice(0, bddPostLimit);
  if (!slice.length) {
    el.innerHTML = '<div class="bdd-placeholder">No posts match the current filter</div>';
    document.getElementById('bddLoadMorePosts').style.display = 'none';
    return;
  }

  slice.forEach((row, idx) => {
    const sent    = String(row.sentiment||'').toLowerCase();
    const rawSrc  = String(row.source||row.Source||'').trim();
    const src     = normalizeChannel(rawSrc);
    const srcColor = CHANNEL_COLORS[src] || '#6B7280';

    // ── Date: use the robust parser ──────────────────────────────────────────
    const dateRaw = row.created_at || row.date || row.Date || row.Created_At || '';
    const date    = _formatPostDate(dateRaw);

    // ── Metrics ──────────────────────────────────────────────────────────────
    const eng     = parseFloat(row.engagement_score) || 0;
    const views   = parseFloat(row.view_count)       || 0;
    const comments= parseFloat(row.comment_count)    || 0;
    const likes   = parseFloat(row.like_count)       || 0;

    const text    = String(row.text||'').trim();
    const link    = _grGet(row, 'link','Link','url','URL','post_url','post_link','permalink','source_url');
    const hasLink = link && link.startsWith('http');

    const item = document.createElement('div');
    item.className = 'bdd-post-item';
    item.innerHTML = `
      <div class="bdd-post-rank">${idx+1}</div>
      <div class="bdd-post-body">
        <div class="bdd-post-meta">
          ${src  ? `<span class="bdd-post-source" style="border-left:3px solid ${srcColor};padding-left:6px">${escapeHtml(src)}</span>` : ''}
          ${date ? `<span class="bdd-post-date">📅 ${escapeHtml(date)}</span>` : ''}
          ${sent ? `<span class="badge ${sent}" style="font-size:10px">${sent}</span>` : ''}
          ${hasLink ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="bdd-post-link" title="Open original post">↗ View post</a>` : ''}
        </div>
        <div class="bdd-post-text">${escapeHtml(text)}</div>
        <div class="bdd-post-stats">
          ${eng      ? `<span class="bdd-post-stat" title="Engagement score">⚡ <strong>${eng.toLocaleString()}</strong> engagement</span>` : ''}
          ${comments ? `<span class="bdd-post-stat" title="Comments">💬 <strong>${comments.toLocaleString()}</strong> comments</span>` : ''}
          ${views    ? `<span class="bdd-post-stat" title="Views">👁 <strong>${views.toLocaleString()}</strong> views</span>` : ''}
          ${likes    ? `<span class="bdd-post-stat" title="Likes">❤️ <strong>${likes.toLocaleString()}</strong> likes</span>` : ''}
        </div>
      </div>`;
    el.appendChild(item);
  });

  const loadBtn = document.getElementById('bddLoadMorePosts');
  if (pool.length > bddPostLimit) {
    loadBtn.style.display = '';
    loadBtn.textContent = `Load more posts (${(pool.length - bddPostLimit).toLocaleString()} remaining)`;
  } else {
    loadBtn.style.display = 'none';
  }
}

document.getElementById('bddLoadMorePosts').addEventListener('click', () => {
  bddPostLimit += 5;
  renderBddTopPosts();
});

// Post sentiment filter pills
document.querySelectorAll('[data-bdd-sent]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-bdd-sent]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    bddPostSentFilter = btn.dataset.bddSent;
    bddPostLimit = 5;
    renderBddTopPosts();
  });
});

// ── BDD AI ANALYSIS ───────────────────────────────────────────────────────────
// Mini multi-select helpers — scoped to bddAi prefix to avoid collisions
let bddAiAnalysisType = 'social'; // 'social' | 'sentiment' | 'brand' | 'googlereview'

function setBddAiType(type) {
  bddAiAnalysisType = type;
  ['Social','Sentiment','Brand','Googlereview'].forEach(t => {
    document.getElementById('bddAiType'+t)?.classList.remove('active');
  });
  const map = { social:'bddAiTypeSocial', sentiment:'bddAiTypeSentiment', brand:'bddAiTypeBrand', googlereview:'bddAiTypeGooglereview' };
  document.getElementById(map[type])?.classList.add('active');

  // Label updates
  const labels = {
    social:       { btn: '✦ Generate Social Listening Report', output: 'Social Listening Report' },
    sentiment:    { btn: '✦ Generate Sentiment Analysis',      output: 'Sentiment Analysis' },
    brand:        { btn: '✦ Generate Brand Analysis',          output: 'Brand Analysis' },
    googlereview: { btn: '✦ Generate Google Review Analysis',  output: 'Google Review Analysis' },
  };
  const lbl = labels[type] || labels.social;
  const btnLbl = document.getElementById('bddAiRunBtnLabel');
  if (btnLbl) btnLbl.textContent = lbl.btn;
  const outLbl = document.getElementById('bddAiOutputLabel');
  if (outLbl) outLbl.textContent = lbl.output;

  // Lock source to Google Reviews for that type
  const srcWrap = document.getElementById('bddAiMsWrapSource');
  const srcLock = document.getElementById('bddAiSourceLockNote');
  if (type === 'googlereview') {
    if (srcWrap) { srcWrap.style.opacity='0.45'; srcWrap.style.pointerEvents='none'; }
    const srcLbl = document.getElementById('bddAiMsLabelSource');
    if (srcLbl) { srcLbl.textContent='Google Reviews only'; srcLbl.classList.remove('placeholder'); }
    if (srcLock) srcLock.style.display='';
  } else {
    if (srcWrap) { srcWrap.style.opacity=''; srcWrap.style.pointerEvents=''; }
    bddAiMsUpdateLabel('Source');
    if (srcLock) srcLock.style.display='none';
  }
  _bddAiUpdatePostCount();
}

// Populate the BDD AI model selector from the same AI_MODELS list
function populateBddAiModelSelect() {
  const sel = document.getElementById('bddAiModel');
  if (!sel) return;
  sel.innerHTML = '';
  AI_MODELS['gemini'].forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.value; opt.textContent = m.label; sel.appendChild(opt);
  });
  sel.value = 'gemini-2.5-flash-lite';
}

function bddAiMsToggle(key) {
  const drop = document.getElementById('bddAiMsDrop'+key);
  const trig = document.getElementById('bddAiMsTrigger'+key);
  const isOpen = drop.classList.contains('open');
  document.querySelectorAll('.ms-dropdown.open').forEach(d=>d.classList.remove('open'));
  document.querySelectorAll('.ms-trigger.open').forEach(t=>t.classList.remove('open'));
  if (!isOpen) { drop.classList.add('open'); trig.classList.add('open'); }
}
function bddAiMsToggleAll(key, el) {
  const drop = document.getElementById('bddAiMsDrop'+key);
  drop.querySelectorAll('.ms-option:not(.ms-all)').forEach(o=>{o.classList.remove('selected');o.querySelector('input').checked=false;});
  el.classList.add('selected'); el.querySelector('input').checked=true;
  bddAiMsUpdateLabel(key); _bddAiUpdatePostCount();
}
function bddAiMsToggleOption(key, el) {
  const allEl = document.getElementById('bddAiMsDrop'+key).querySelector('.ms-all');
  const checked = !el.classList.contains('selected');
  el.classList.toggle('selected', checked); el.querySelector('input').checked = checked;
  const anySelected = [...document.getElementById('bddAiMsDrop'+key).querySelectorAll('.ms-option:not(.ms-all)')].some(o=>o.classList.contains('selected'));
  allEl.classList.toggle('selected', !anySelected); allEl.querySelector('input').checked = !anySelected;
  bddAiMsUpdateLabel(key); _bddAiUpdatePostCount();
}
function bddAiMsGetValues(key) {
  const drop = document.getElementById('bddAiMsDrop'+key);
  if (!drop) return ['__all__'];
  const allEl = drop.querySelector('.ms-all');
  if (allEl?.classList.contains('selected')) return ['__all__'];
  return [...drop.querySelectorAll('.ms-option:not(.ms-all).selected')].map(o=>o.dataset.value);
}
function bddAiMsUpdateLabel(key) {
  const vals = bddAiMsGetValues(key);
  const lbl  = document.getElementById('bddAiMsLabel'+key);
  if (!lbl) return;
  if (vals[0]==='__all__'||vals.length===0) { lbl.textContent=key==='Source'?'All channels':'All sentiments'; lbl.classList.add('placeholder'); }
  else { lbl.textContent=vals.join(', '); lbl.classList.remove('placeholder'); }
}

function populateBddAiFilters() {
  const pool = allRawData.length ? allRawData : rawData;
  const drop = document.getElementById('bddAiMsDropSource');
  if (!drop) return;
  while (drop.children.length > 2) drop.removeChild(drop.lastChild);

  // Scope to active brand rows so we only show channels that brand actually has
  const brandPool = bddActiveBrand ? pool.filter(row => {
    let b = String(row.Brands||row.brands||'').trim();
    if (b.startsWith('[')&&b.endsWith(']')) b=b.slice(1,-1);
    return b.split(',').map(x=>x.trim()).includes(bddActiveBrand);
  }) : pool;

  // Build present channels from normalized names
  const presentNormalized = new Set(brandPool.map(r => normalizeChannel(String(r.source||r.Source||'').trim())));

  // Also collect raw source values that didn't normalize to a known channel,
  // so we never silently drop a channel the user can see in their data
  const rawSources = new Set();
  brandPool.forEach(r => {
    const raw = String(r.source||r.Source||'').trim();
    if (raw && raw !== 'null') rawSources.add(raw);
  });

  // Show all canonical channels present for this brand
  const toShow = CANONICAL_CHANNELS.filter(ch => presentNormalized.has(ch));

  // Add any raw source values that didn't map to a canonical channel
  rawSources.forEach(raw => {
    const norm = normalizeChannel(raw);
    if (!CANONICAL_CHANNELS.includes(norm) && raw) toShow.push(raw);
  });

  toShow.forEach(ch => {
    const div = document.createElement('div'); div.className='ms-option'; div.dataset.value=ch;
    div.setAttribute('onclick',`bddAiMsToggleOption('Source',this)`);
    div.innerHTML=`<input type="checkbox"> ${ch}`; drop.appendChild(div);
  });

  drop.querySelector('.ms-all').classList.add('selected');
  drop.querySelector('.ms-all input').checked=true;
  bddAiMsUpdateLabel('Source');
}

function _bddAiGetRows() {
  if (!bddActiveBrand) return [];
  const pool    = allRawData.length ? allRawData : rawData;
  const sources = bddAiMsGetValues('Source');
  const sents   = bddAiMsGetValues('Sent');
  const allSrc  = sources[0]==='__all__';
  const allSent = sents[0]==='__all__';
  const forceGR = bddAiAnalysisType === 'googlereview';
  return pool.filter(row => {
    // Always filter to active brand
    let b = String(row.Brands||'').trim();
    if (b.startsWith('[')&&b.endsWith(']')) b=b.slice(1,-1);
    if (!b.split(',').map(x=>x.trim()).includes(bddActiveBrand)) return false;
    if (forceGR) {
      const rawSrc = String(row.source||row.Source||'').toLowerCase();
      if (!rawSrc.includes('googlereviews')) return false;
    } else if (!allSrc) {
      const rawSrc = String(row.source||row.Source||'').trim();
      const rowSrc = normalizeChannel(rawSrc);
      if (!sources.includes(rowSrc) && !sources.includes(rawSrc)) return false;
    }
    if (!allSent && !sents.includes(row.sentiment)) return false;
    return true;
  });
}

function _bddAiGetFilteredTexts() {
  const max    = parseInt(document.getElementById('bddAiMaxPosts').value)||1000;
  const sortBy = document.getElementById('bddAiSortBy').value;
  let rows = _bddAiGetRows().filter(r=>String(r.text||'').trim()&&String(r.text||'').trim()!=='null');
  if (sortBy==='engagement') rows=rows.slice().sort((a,b)=>(parseFloat(b.engagement_score)||0)-(parseFloat(a.engagement_score)||0));
  return rows.slice(0,max).map(row=>({
    text:       String(row.text||'').trim(),
    engagement: parseFloat(row.engagement_score)||0,
    sentiment:  row.sentiment||'',
    source:     row.source||'',
    title:      row.title||row.page||'',
    created_at: row.created_at||row.date||'',
    user_name:  row.user_name||row.author||'',
  }));
}

function _bddAiUpdatePostCount() {
  if (!rawData.length||!bddActiveBrand) return;
  const max      = parseInt(document.getElementById('bddAiMaxPosts').value)||1000;
  const sortBy   = document.getElementById('bddAiSortBy').value;
  const total    = _bddAiGetRows().length;
  const withText = _bddAiGetRows().filter(r=>String(r.text||'').trim()&&String(r.text||'').trim()!=='null').length;
  const forAI    = Math.min(withText, max);
  const noText   = total - withText;
  const capped   = withText > max;

  let note = '';
  if (capped)         note = ` · <strong>${forAI.toLocaleString()} sent to AI</strong> (capped at ${max.toLocaleString()})`;
  else if (noText > 0) note = ` · ${noText} row${noText>1?'s':''} skipped (no text)`;

  const sorted = sortBy==='engagement' ? ' · sorted by engagement' : '';
  const el = document.getElementById('bddAiPostCount');
  if (el) el.innerHTML = `${total.toLocaleString()} posts matched${note}${sorted}`;
}

['bddAiMaxPosts','bddAiSortBy'].forEach(id=>{
  document.getElementById(id)?.addEventListener('change', _bddAiUpdatePostCount);
});


// Build Sentiment prompt scoped to active brand

// Build Brand Analysis prompt scoped to active brand




document.getElementById('bddAiRunBtn').addEventListener('click', async () => {
  if (!geminiApiKey) {
    const el=document.getElementById('bddAiError'); el.textContent='Please save your Gemini API key in the bar at the top first.'; el.style.display='';
    return;
  }
  if (!bddActiveBrand) {
    const el=document.getElementById('bddAiError'); el.textContent='Please select a brand first.'; el.style.display=''; return;
  }
  const rows = _bddAiGetFilteredTexts();
  if (!rows.length) {
    const el=document.getElementById('bddAiError'); el.textContent='No posts with text match the current filters.'; el.style.display=''; return;
  }

  const btn = document.getElementById('bddAiRunBtn');
  const outputCard = document.getElementById('bddAiOutputCard');
  const outputBody = document.getElementById('bddAiOutputBody');
  const errEl      = document.getElementById('bddAiError');
  const metaEl     = document.getElementById('bddAiOutputMeta');
  const sources    = bddAiMsGetValues('Source');
  const model      = document.getElementById('bddAiModel')?.value || 'gemini-2.5-flash-lite';

  btn.classList.add('running'); btn.disabled=true;
  errEl.style.display='none';
  outputCard.style.display='';
  outputBody.innerHTML='<span class="ai-cursor"></span>';
  metaEl.textContent=`${rows.length.toLocaleString()} posts · ${bddActiveBrand}${sources[0]!=='__all__'?' · '+sources.join(', '):''}  · Gemini · ${model}`;
  showToast(`Analysing ${rows.length.toLocaleString()} posts with Gemini…`, 'info', 3000);

  const { system, user } = _buildBddAiPrompts(rows);

  await _runGeminiStream({ model, system, user, outputBody,
    onDone: (fullText) => {
      btn.classList.remove('running'); btn.disabled=false;
      showToast('AI report complete!', 'success');
      document.getElementById('bddAiCopyBtn').onclick=()=>{
        navigator.clipboard.writeText(fullText).then(()=>{
          document.getElementById('bddAiCopyBtn').textContent='Copied!';
          showToast('AI report copied to clipboard!', 'success');
          setTimeout(()=>document.getElementById('bddAiCopyBtn').textContent='Copy',2000);
        });
      };
    },
    onError: (msg) => {
      outputCard.style.display='none';
      errEl.textContent=`Gemini error: ${msg}`; errEl.style.display='';
      btn.classList.remove('running'); btn.disabled=false;
    }
  });
});

