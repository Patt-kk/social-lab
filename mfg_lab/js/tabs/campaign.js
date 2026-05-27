// ── tabs/campaign.js — Campaign Dashboard, Campaign AI Analysis
// ── CAMPAIGN TAB ──────────────────────────────────────────────────────────────
let campActiveCampaign = null;
let campPostLimit  = 5;
let campPostSent   = 'all';

const CAMP_COLORS = [
  '#2563EB','#7c3aed','#0ea5e9','#10b981','#f59e0b',
  '#ef4444','#ec4899','#14b8a6','#6366f1','#84cc16',
];

function _buildCampCards(camps, metrics, containerId, activeLabelId) {
  const engMap = metrics.engagement || {};

  const top20 = camps
    .filter(c => c.toLowerCase() !== 'others')
    .sort((a, b) => {
      const aIs26 = a.startsWith('2026'), bIs26 = b.startsWith('2026');
      if (aIs26 !== bIs26) return aIs26 ? -1 : 1;
      return (engMap[b]||0) - (engMap[a]||0);
    })
    .slice(0, 20);

  const WARM = [
    '#E07A5F','#F2A65A','#F4C04C','#81B29A','#6B9AC4',
    '#C97B84','#E8956D','#F0B97B','#A8C5A0','#7EB5D6',
    '#D4856A','#EDAA82','#F7CE7A','#95C4A8','#88B8D4',
    '#C07068','#E89A72','#F6C86A','#8BBFA4','#79AECB',
  ];

  const container = document.getElementById(containerId || 'campPillsContainer');
  if (!container) return;
  container.innerHTML = '';

  if (activeLabelId) {
    const lbl = document.getElementById(activeLabelId);
    if (lbl) lbl.textContent = campActiveCampaign ? '— ' + campActiveCampaign : '';
  }

  container.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:7px';

  top20.forEach((c, i) => {
    const isActive = c === campActiveCampaign;
    const base = WARM[i % WARM.length];
    const pill = document.createElement('button');
    pill.style.cssText = `padding:7px 10px;border-radius:8px;font-size:11px;font-weight:600;
      cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;
      transition:all .15s;border:2px solid ${isActive ? base : base+'55'};
      background:${isActive ? base : base+'22'};color:${isActive ? '#fff' : base};
      box-shadow:${isActive ? '0 2px 8px '+base+'55' : 'none'};`;
    pill.title = c;
    pill.textContent = c;
    pill.addEventListener('mouseenter', () => {
      if (c !== campActiveCampaign) { pill.style.background = base+'44'; pill.style.borderColor = base; }
    });
    pill.addEventListener('mouseleave', () => {
      if (c !== campActiveCampaign) { pill.style.background = base+'22'; pill.style.borderColor = base+'55'; }
    });
    pill.addEventListener('click', () => {
      const wasActive = c === campActiveCampaign;
      campActiveCampaign = wasActive ? null : c;
      if (!wasActive) { campPostSent='all'; campPostLimit=5; document.querySelectorAll('[data-camp-sent]').forEach(x=>x.classList.toggle('active',x.dataset.campSent==='all')); }
      renderCampaignTab();
    });
    container.appendChild(pill);
  });
}

function renderCampaignTab() {
  const metrics = reportData.campaignMetrics;
  const camps = Object.keys(metrics?.mention || {}).filter(k => k && k !== '(no campaign)').sort();
  const hasCampaigns = camps.length > 0;

  document.getElementById('campaignEmpty').style.display   = hasCampaigns ? 'none' : '';
  document.getElementById('campaignContent').style.display = hasCampaigns ? ''     : 'none';
  if (!hasCampaigns) return;

  // Validate campActiveCampaign
  if (campActiveCampaign && !camps.includes(campActiveCampaign)) {
    campActiveCampaign = null;
  }

  _buildCampCards(camps, metrics, 'campPillsContainer', 'campActiveLabel');

  // Nothing selected yet — show prompt, hide detail
  if (!campActiveCampaign) {
    document.getElementById('campSelectPrompt').style.display = '';
    document.getElementById('campDetail').style.display       = 'none';
    return;
  }

  // Campaign selected — hide prompt, show detail
  document.getElementById('campSelectPrompt').style.display = 'none';
  document.getElementById('campDetail').style.display       = '';

  _renderCampKpis(metrics);
  _renderCampChannelTable();
  _renderCampChannelBars();
  _renderCampMentionBars();
  _renderCampSentDonut();
  renderCampPosts();

  // Keep AI panel in sync — mirror updateBrandDeepDive() → _renderBddAiBrandPills() pattern
  populateCampAiPills();
  populateCampAiFilters();
  _campAiUpdatePostCount();
}

function _renderCampKpis(metrics) {
  const men  = (metrics.mention    || {})[campActiveCampaign] || 0;
  const eng  = (metrics.engagement || {})[campActiveCampaign] || 0;

  // Sentiment from raw data for this campaign only
  const pool = (allRawData.length ? allRawData : rawData);
  let pos=0, neu=0, neg=0;
  pool.forEach(r => {
    let raw = String(r.Campaign||r.campaign||'').trim();
    if (raw.startsWith('[') && raw.endsWith(']')) raw = raw.slice(1,-1);
    if (!raw.split(',').map(x=>x.trim()).includes(campActiveCampaign)) return;
    const s = String(r.sentiment||'').toLowerCase();
    if (s==='positive') pos++;
    else if (s==='neutral') neu++;
    else if (s==='negative') neg++;
  });
  const total = pos+neu+neg || 1;

  document.getElementById('campKpiRow').innerHTML = `
    <div class="bdd-kpi eng">
      <div class="bdd-kpi-val">${Math.round(eng).toLocaleString()}</div>
      <div class="bdd-kpi-lbl">Engagement</div>
    </div>
    <div class="bdd-kpi">
      <div class="bdd-kpi-val">${men.toLocaleString()}</div>
      <div class="bdd-kpi-lbl">Mentions</div>
    </div>
    <div class="bdd-kpi pos">
      <div class="bdd-kpi-val">${Math.round(pos/total*100)}%</div>
      <div class="bdd-kpi-lbl">Positive</div>
    </div>
    <div class="bdd-kpi neg">
      <div class="bdd-kpi-val">${Math.round(neg/total*100)}%</div>
      <div class="bdd-kpi-lbl">Negative</div>
    </div>
  `;
}

function _campPostsForActive() {
  const pool = (allRawData.length ? allRawData : rawData);
  return pool.filter(r => {
    let raw = String(r.Campaign||r.campaign||'').trim();
    if (raw.startsWith('[') && raw.endsWith(']')) raw = raw.slice(1,-1);
    return raw.split(',').map(x=>x.trim()).includes(campActiveCampaign);
  });
}

function _renderCampChannelTable() {
  const posts = _campPostsForActive();
  // Build { channel: { engagement, mention, positive, neutral, negative } }
  const chMap = {};
  posts.forEach(r => {
    const ch  = normalizeChannel(String(r.source||r.Source||''));
    const eng = parseFloat(r.engagement_score)||0;
    const s   = String(r.sentiment||'').toLowerCase();
    if (!chMap[ch]) chMap[ch] = { engagement:0, mention:0, positive:0, neutral:0, negative:0 };
    chMap[ch].engagement += eng;
    chMap[ch].mention++;
    if (chMap[ch][s] !== undefined) chMap[ch][s]++;
  });

  const rows = Object.entries(chMap).sort((a,b)=>b[1].engagement-a[1].engagement);
  const tbody = document.getElementById('campTBody');
  tbody.innerHTML = '';

  rows.forEach(([ch, d]) => {
    const tot  = (d.positive+d.neutral+d.negative)||1;
    const posPct = Math.round(d.positive/tot*100);
    const neuPct = Math.round(d.neutral/tot*100);
    const negPct = 100-posPct-neuPct;
    const color  = CHANNEL_COLORS[ch]||'#6B7280';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;display:flex;align-items:center;gap:7px">
        <span style="width:9px;height:9px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0"></span>${escapeHtml(ch)}
      </td>
      <td class="num" style="font-weight:700;color:var(--accent)">${Math.round(d.engagement).toLocaleString()}</td>
      <td class="num">${d.mention.toLocaleString()}</td>
      <td class="num" style="color:var(--pos);font-weight:600">${posPct}%</td>
      <td class="num" style="color:var(--neu);font-weight:600">${neuPct}%</td>
      <td class="num" style="color:var(--neg);font-weight:600">${negPct}%</td>
      <td>
        <div class="camp-sent-bar">
          <div class="camp-sent-seg" style="width:${posPct}%;background:var(--pos)"></div>
          <div class="camp-sent-seg" style="width:${neuPct}%;background:var(--neu)"></div>
          <div class="camp-sent-seg" style="width:${negPct}%;background:var(--neg)"></div>
        </div>
      </td>`;
    tbody.appendChild(tr);
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text3);font-size:12px">No channel data for this campaign</td></tr>`;
  }
}

function _renderCampChannelIcons() {
  const posts  = _campPostsForActive();
  const chMap  = {};
  posts.forEach(r => {
    const ch  = normalizeChannel(String(r.source||r.Source||''));
    const eng = parseFloat(r.engagement_score)||0;
    if (!chMap[ch]) chMap[ch] = 0;
    chMap[ch] += eng;
  });
  const sorted   = Object.entries(chMap).sort((a,b)=>b[1]-a[1]);
  const totalEng = sorted.reduce((s,[,v])=>s+v, 0) || 1;
  const el = document.getElementById('campChannelIcons');
  if (!el) return;
  el.innerHTML = '';
  if (!sorted.length) return;
  sorted.forEach(([ch, eng]) => {
    const ICON_WHITELIST = ['Facebook','TikTok','Instagram','X (Twitter)'];
    if (!ICON_WHITELIST.includes(ch)) return;
    const sharePct = (eng/totalEng*100).toFixed(2);
    const color    = CHANNEL_COLORS[ch] || '#6B7280';
    const svgIcon  = CHANNEL_SVGS[ch]   || CHANNEL_SVGS['Website'];
    const tile     = document.createElement('div');
    tile.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px;min-width:64px;padding:10px 8px;background:var(--bg);border:1px solid var(--border);border-radius:10px;flex:0 0 auto';
    tile.innerHTML = `
      <div style="width:36px;height:36px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;overflow:hidden;padding:5px;flex-shrink:0">
        ${svgIcon}
      </div>

      <div style="font-family:'DM Mono',monospace;font-size:11px;font-weight:600;color:${color};background:${color}18;border-radius:4px;padding:1px 5px">${sharePct}%</div>
    `;
    el.appendChild(tile);
  });
}

function _renderCampChannelBars() {
  _renderCampChannelIcons();
  const posts  = _campPostsForActive();
  const chMap  = {};
  posts.forEach(r => {
    const ch  = normalizeChannel(String(r.source||r.Source||''));
    const eng = parseFloat(r.engagement_score)||0;
    if (!chMap[ch]) chMap[ch] = 0;
    chMap[ch] += eng;
  });
  const sorted   = Object.entries(chMap).sort((a,b)=>b[1]-a[1]);
  const maxEng   = sorted[0]?.[1] || 1;
  const totalEng = sorted.reduce((s,[,v])=>s+v, 0) || 1;
  const el = document.getElementById('campChannelBars');
  el.innerHTML = '';
  if (!sorted.length) { el.innerHTML='<div style="color:var(--text3);font-size:12px;padding:12px 0">No data</div>'; return; }
  sorted.forEach(([ch, eng]) => {
    const barPct   = eng/maxEng*100;
    const sharePct = (eng/totalEng*100).toFixed(2);
    const color    = CHANNEL_COLORS[ch]||'#6B7280';
    const row      = document.createElement('div');
    row.className  = 'camp-bar-wrap';
    row.innerHTML  = `
      <div style="display:flex;align-items:center;gap:5px;min-width:110px;max-width:130px">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
        <span class="camp-bar-label" style="min-width:0">${escapeHtml(ch)}</span>
      </div>
      <div class="camp-bar-track"><div class="camp-bar-fill" style="width:0%;background:${color}" data-pct="${barPct}"></div></div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <div class="camp-bar-val">${Math.round(eng).toLocaleString()}</div>
        <div style="font-family:'DM Mono',monospace;font-size:11px;font-weight:700;color:${color};background:${color}18;border-radius:5px;padding:1px 6px;min-width:38px;text-align:center">${sharePct}%</div>
      </div>`;
    el.appendChild(row);
  });

  requestAnimationFrame(()=>{ el.querySelectorAll('.camp-bar-fill').forEach(f=>{ f.style.width=f.dataset.pct+'%'; }); });
}

function _renderCampMentionIcons() {
  const posts  = _campPostsForActive();
  const chMap  = {};
  posts.forEach(r => {
    const ch = normalizeChannel(String(r.source||r.Source||''));
    if (!chMap[ch]) chMap[ch] = 0;
    chMap[ch]++;
  });
  const sorted    = Object.entries(chMap).sort((a,b)=>b[1]-a[1]);
  const totalMen  = sorted.reduce((s,[,v])=>s+v, 0) || 1;
  const el = document.getElementById('campMentionIcons');
  if (!el) return;
  el.innerHTML = '';
  sorted.forEach(([ch, cnt]) => {
    const ICON_WHITELIST = ['Facebook','TikTok','Instagram','X (Twitter)'];
    if (!ICON_WHITELIST.includes(ch)) return;
    const sharePct = (cnt/totalMen*100).toFixed(2);
    const color    = CHANNEL_COLORS[ch] || '#6B7280';
    const svgIcon  = CHANNEL_SVGS[ch]   || CHANNEL_SVGS['Website'];
    const tile     = document.createElement('div');
    tile.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px;min-width:64px;padding:10px 8px;background:var(--bg);border:1px solid var(--border);border-radius:10px;flex:0 0 auto';
    tile.innerHTML = `
      <div style="width:36px;height:36px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;overflow:hidden;padding:5px;flex-shrink:0">
        ${svgIcon}
      </div>

      <div style="font-family:'DM Mono',monospace;font-size:11px;font-weight:600;color:${color};background:${color}18;border-radius:4px;padding:1px 5px">${sharePct}%</div>`;
    el.appendChild(tile);
  });
}

function _renderCampMentionBars() {
  _renderCampMentionIcons();
  const posts  = _campPostsForActive();
  const chMap  = {};
  posts.forEach(r => {
    const ch = normalizeChannel(String(r.source||r.Source||''));
    if (!chMap[ch]) chMap[ch] = 0;
    chMap[ch]++;
  });
  const sorted   = Object.entries(chMap).sort((a,b)=>b[1]-a[1]);
  const maxMen   = sorted[0]?.[1] || 1;
  const totalMen = sorted.reduce((s,[,v])=>s+v, 0) || 1;
  const el = document.getElementById('campMentionBars');
  el.innerHTML = '';
  if (!sorted.length) { el.innerHTML='<div style="color:var(--text3);font-size:12px;padding:12px 0">No data</div>'; return; }
  sorted.forEach(([ch, cnt]) => {
    const barPct   = cnt/maxMen*100;
    const sharePct = (cnt/totalMen*100).toFixed(2);
    const color    = CHANNEL_COLORS[ch]||'#6B7280';
    const row      = document.createElement('div');
    row.className  = 'camp-bar-wrap';
    row.innerHTML  = `
      <div style="display:flex;align-items:center;gap:5px;min-width:110px;max-width:130px">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>
        <span class="camp-bar-label" style="min-width:0">${escapeHtml(ch)}</span>
      </div>
      <div class="camp-bar-track"><div class="camp-bar-fill" style="width:0%;background:${color}" data-pct="${barPct}"></div></div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <div class="camp-bar-val">${cnt.toLocaleString()}</div>
        <div style="font-family:'DM Mono',monospace;font-size:11px;font-weight:700;color:${color};background:${color}18;border-radius:5px;padding:1px 6px;min-width:38px;text-align:center">${sharePct}%</div>
      </div>`;
    el.appendChild(row);
  });
  requestAnimationFrame(()=>{ el.querySelectorAll('.camp-bar-fill').forEach(f=>{ f.style.width=f.dataset.pct+'%'; }); });
}

function _renderCampSentDonut() {
  const posts = _campPostsForActive();
  let pos=0, neu=0, neg=0;
  posts.forEach(r => {
    const s = String(r.sentiment||'').toLowerCase();
    if (s==='positive') pos++;
    else if (s==='neutral') neu++;
    else if (s==='negative') neg++;
  });
  const totalMentions = pos + neu + neg;
  const total = totalMentions || 1;
  const el = document.getElementById('campSentDonut');
  el.innerHTML = '';

  const segments = [
    { label:'Negative', val:neg, color:SENT_COLORS.negative },
    { label:'Neutral',  val:neu, color:SENT_COLORS.neutral  },
    { label:'Positive', val:pos, color:SENT_COLORS.positive },
  ];

  // ── Canvas sizing (compact) ──
  const STROKE = 30, R = 58;
  const PAD = 72;
  const SIZE = (R + STROKE / 2) * 2 + PAD * 2;
  const cx = SIZE / 2, cy = SIZE / 2;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  canvas.style.cssText = 'display:block;flex-shrink:0;max-width:100%';

  // ── Right panel: stacked bar + legend ──
  const rightPanel = document.createElement('div');
  rightPanel.style.cssText = 'flex:1;min-width:180px;display:flex;flex-direction:column;justify-content:center;gap:14px';

  const barSegs = segments.map(s => {
    const pct    = (s.val / total * 100);
    const pctStr = Math.round(pct) + '%';
    return `<div class="camp-stk-seg" data-pct="${pct}" style="flex:0 0 0%;background:${s.color};display:flex;align-items:center;justify-content:center;overflow:hidden;transition:flex-basis .7s cubic-bezier(.16,1,.3,1)">
      <span style="font-family:'DM Mono',monospace;font-size:11px;font-weight:800;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.35);white-space:nowrap">${pctStr}</span>
    </div>`;
  }).join('');

  const legendRows = segments.map(s => `
    <div style="display:flex;align-items:center;gap:7px;font-size:12px;padding:3px 0;border-bottom:1px solid var(--border)">
      <span style="width:10px;height:10px;border-radius:3px;background:${s.color};flex-shrink:0"></span>
      <span style="color:var(--text2);font-weight:600">${s.label}</span>
      <span style="margin-left:auto;font-family:'DM Mono',monospace;font-size:11px;color:var(--text3)">${s.val.toLocaleString()}</span>
      <span style="font-family:'DM Mono',monospace;font-size:11px;font-weight:700;color:${s.color};background:${s.color}18;border-radius:4px;padding:1px 6px;min-width:40px;text-align:center">${Math.round(s.val/total*100)}%</span>
    </div>`).join('');

  rightPanel.innerHTML = `
    <div style="height:32px;border-radius:7px;overflow:hidden;display:flex;box-shadow:0 1px 3px rgba(0,0,0,.1)">${barSegs}</div>
    <div style="display:flex;flex-direction:column;gap:0">${legendRows}</div>`;

  // ── Outer layout: donut left, right panel right ──
  const layout = document.createElement('div');
  layout.style.cssText = 'display:flex;align-items:center;gap:20px;flex-wrap:wrap';
  layout.appendChild(canvas);
  layout.appendChild(rightPanel);
  el.appendChild(layout);

  requestAnimationFrame(() => {
    // Animate stacked bar
    el.querySelectorAll('.camp-stk-seg').forEach(seg => {
      seg.style.flexBasis = seg.dataset.pct + '%';
    });

    // Draw canvas donut
    const ctx = canvas.getContext('2d');
    const GAP = 0.018;

    let angle = -Math.PI / 2;
    const segAngles = segments.map(s => {
      const sweep = (s.val / total) * Math.PI * 2;
      const start = angle;
      angle += sweep;
      return { ...s, start, sweep, end: angle };
    });

    // Background ring
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = STROKE;
    ctx.stroke();

    // Segment arcs
    segAngles.forEach(s => {
      if (!s.val) return;
      ctx.beginPath();
      ctx.arc(cx, cy, R, s.start + GAP / 2, s.end - GAP / 2);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = STROKE;
      ctx.lineCap = 'butt';
      ctx.stroke();
    });

    // Centre text: total mentions
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1A1D2E';
    ctx.font = '800 18px "Bricolage Grotesque", sans-serif';
    ctx.fillText(totalMentions.toLocaleString(), cx, cy - 7);
    ctx.fillStyle = '#8890A8';
    ctx.font = '700 9px "DM Sans", sans-serif';
    ctx.fillText('MENTIONS', cx, cy + 9);

    // Leader lines
    const RING_OUTER  = R + STROKE / 2;
    const LINE_START  = RING_OUTER + 4;
    const LINE_RADIAL = RING_OUTER + 18;
    const TICK_LEN    = 16;
    const LABEL_GAP   = 4;

    ctx.textBaseline = 'middle';

    segAngles.forEach(s => {
      const pct = s.val / total * 100;
      if (pct < 0.5) return;

      const mid  = s.start + s.sweep / 2;
      const cosA = Math.cos(mid);
      const sinA = Math.sin(mid);

      const x1 = cx + cosA * LINE_START;
      const y1 = cy + sinA * LINE_START;
      const x2 = cx + cosA * LINE_RADIAL;
      const y2 = cy + sinA * LINE_RADIAL;
      const dir = cosA >= 0 ? 1 : -1;
      const x3  = x2 + dir * TICK_LEN;
      const y3  = y2;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x2, y2, 2, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();

      const labelX = x3 + dir * LABEL_GAP;
      ctx.textAlign = dir >= 0 ? 'left' : 'right';

      ctx.fillStyle = '#4B5168';
      ctx.font = '600 11px "DM Sans", sans-serif';
      ctx.fillText(s.label, labelX, y3 - 8);

      ctx.fillStyle = s.color;
      ctx.font = '800 12px "DM Sans", sans-serif';
      ctx.fillText(pct.toFixed(1) + '%', labelX, y3 + 7);
    });
  });
}

function renderCampPosts() {
  const posts = _campPostsForActive();
  let filtered = posts.filter(r => {
    const text = String(r.text||'').trim();
    if (!text || text==='null') return false;
    if (campPostSent!=='all' && String(r.sentiment||'').toLowerCase()!==campPostSent) return false;
    return true;
  });
  filtered.sort((a,b)=>(parseFloat(b.engagement_score)||0)-(parseFloat(a.engagement_score)||0));

  const el   = document.getElementById('campTopPosts');
  el.innerHTML = '';
  const slice = filtered.slice(0, campPostLimit);

  if (!slice.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:12px">No posts match the current filter</div>';
    document.getElementById('campLoadMorePosts').style.display='none';
    return;
  }

  slice.forEach((row, idx) => {
    const sent     = String(row.sentiment||'').toLowerCase();
    const src      = normalizeChannel(String(row.source||row.Source||'').trim());
    const srcColor = CHANNEL_COLORS[src]||'#6B7280';
    const dateRaw  = row.created_at||row.date||row.Date||row.Created_At||'';
    const date     = _formatPostDate(dateRaw);
    const eng      = parseFloat(row.engagement_score)||0;
    const views    = parseFloat(row.view_count)||0;
    const comments = parseFloat(row.comment_count)||0;
    const likes    = parseFloat(row.like_count)||0;
    const text     = String(row.text||'').trim();
    const link     = _grGet(row,'link','Link','url','URL','post_url','post_link','permalink','source_url');
    const hasLink  = link&&link.startsWith('http');

    const item = document.createElement('div');
    item.className = 'bdd-post-item';
    item.innerHTML = `
      <div class="bdd-post-rank">${idx+1}</div>
      <div class="bdd-post-body">
        <div class="bdd-post-meta">
          ${src  ? `<span class="bdd-post-source" style="border-left:3px solid ${srcColor};padding-left:6px">${escapeHtml(src)}</span>` : ''}
          ${date ? `<span class="bdd-post-date">📅 ${escapeHtml(date)}</span>` : ''}
          ${sent ? `<span class="badge ${sent}" style="font-size:10px">${sent}</span>` : ''}
          ${hasLink ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="bdd-post-link">↗ View post</a>` : ''}
        </div>
        <div class="bdd-post-text">${escapeHtml(text)}</div>
        <div class="bdd-post-stats">
          ${eng      ? `<span class="bdd-post-stat">⚡ <strong>${eng.toLocaleString()}</strong> engagement</span>` : ''}
          ${comments ? `<span class="bdd-post-stat">💬 <strong>${comments.toLocaleString()}</strong> comments</span>` : ''}
          ${views    ? `<span class="bdd-post-stat">👁 <strong>${views.toLocaleString()}</strong> views</span>` : ''}
          ${likes    ? `<span class="bdd-post-stat">❤️ <strong>${likes.toLocaleString()}</strong> likes</span>` : ''}
        </div>
      </div>`;
    el.appendChild(item);
  });

  const loadBtn = document.getElementById('campLoadMorePosts');
  if (filtered.length > campPostLimit) {
    loadBtn.style.display = '';
    loadBtn.textContent = `Load more posts (${(filtered.length-campPostLimit).toLocaleString()} remaining)`;
  } else {
    loadBtn.style.display = 'none';
  }
}

// Campaign event wiring
document.getElementById('campLoadMorePosts').addEventListener('click', () => {
  campPostLimit += 5;
  renderCampPosts();
});
document.querySelectorAll('[data-camp-sent]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-camp-sent]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    campPostSent  = btn.dataset.campSent;
    campPostLimit = 5;
    renderCampPosts();
  });
});

// ── CAMPAIGN SUBNAV ───────────────────────────────────────────────────────────
document.getElementById('campSubnav')?.querySelectorAll('.gr-subtab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('campSubnav').querySelectorAll('.gr-subtab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.campTab;
    document.querySelectorAll('#camp-panel-dashboard, #camp-panel-ai').forEach(p => p.classList.remove('active'));
    document.getElementById(`camp-panel-${target}`)?.classList.add('active');
    if (target === 'ai') _campAiInit();
  });
});

// ── CAMPAIGN AI STATE ─────────────────────────────────────────────────────────
let campAiAnalysisType = 'performance';

function setCampAiType(type) {
  campAiAnalysisType = type;
  ['Performance','Sentiment','Content'].forEach(t => document.getElementById('campAiType'+t)?.classList.remove('active'));
  const map = { performance:'campAiTypePerformance', sentiment:'campAiTypeSentiment', content:'campAiTypeContent' };
  document.getElementById(map[type])?.classList.add('active');
  const labels = {
    performance: { btn:'✦ Generate Campaign Performance Report', output:'Campaign Performance Report' },
    sentiment:   { btn:'✦ Generate Sentiment Analysis',          output:'Sentiment Analysis'          },
    content:     { btn:'✦ Generate Content Insights',            output:'Content Insights'             },
  };
  const lbl = labels[type] || labels.performance;
  const b = document.getElementById('campAiRunBtnLabel'); if (b) b.textContent = lbl.btn;
  const o = document.getElementById('campAiOutputLabel'); if (o) o.textContent = lbl.output;
  _campAiUpdatePostCount();
}

function _campAiInit() {
  populateCampAiModelSelect();
  // Sync pills and filters from the current shared campActiveCampaign state
  populateCampAiPills();
  populateCampAiFilters();
  _campAiUpdatePostCount();
}

// Model selector (same list as BDD AI)
function populateCampAiModelSelect() {
  const sel = document.getElementById('campAiModel');
  if (!sel || sel.options.length) return;
  AI_MODELS['gemini'].forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.value; opt.textContent = m.label; sel.appendChild(opt);
  });
  sel.value = 'gemini-2.5-flash-lite';
}

// Campaign pills in the AI hero header — same layout/colours as Dashboard, synced via shared campActiveCampaign
function populateCampAiPills() {
  const metrics = reportData.campaignMetrics;
  if (!metrics) return;
  const camps = Object.keys(metrics.mention || {}).filter(k => k && k !== '(no campaign)').sort();
  if (!camps.length) return;
  _buildCampCards(camps, metrics, 'campAiPillsContainer', 'campAiActiveLabel');
}

// Source channel filter for Campaign AI
function populateCampAiFilters() {
  const drop = document.getElementById('campAiMsDropSource');
  if (!drop) return;
  while (drop.children.length > 2) drop.removeChild(drop.lastChild);
  const pool = allRawData.length ? allRawData : rawData;
  const campPool = campActiveCampaign ? pool.filter(r => {
    let v = String(r.Campaign || r.campaign || '').trim();
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
    return v.split(',').map(x => x.trim()).includes(campActiveCampaign);
  }) : pool;

  const presentNorm = new Set(campPool.map(r => normalizeChannel(String(r.source || r.Source || '').trim())));
  const toShow = CANONICAL_CHANNELS.filter(ch => presentNorm.has(ch));
  const rawSrcs = new Set();
  campPool.forEach(r => { const s = String(r.source || r.Source || '').trim(); if (s && s !== 'null') rawSrcs.add(s); });
  rawSrcs.forEach(raw => { const n = normalizeChannel(raw); if (!CANONICAL_CHANNELS.includes(n)) toShow.push(raw); });

  toShow.forEach(ch => {
    const div = document.createElement('div'); div.className = 'ms-option'; div.dataset.value = ch;
    div.setAttribute('onclick', `campAiMsToggleOption('Source',this)`);
    div.innerHTML = `<input type="checkbox"> ${ch}`; drop.appendChild(div);
  });
  drop.querySelector('.ms-all').classList.add('selected');
  drop.querySelector('.ms-all input').checked = true;
  campAiMsUpdateLabel('Source');
}

// Multi-select helpers for Campaign AI
function campAiMsToggle(key) {
  const drop = document.getElementById('campAiMsDrop'+key);
  const trig = document.getElementById('campAiMsTrigger'+key);
  const isOpen = drop.classList.contains('open');
  document.querySelectorAll('.ms-dropdown.open').forEach(d=>d.classList.remove('open'));
  document.querySelectorAll('.ms-trigger.open').forEach(t=>t.classList.remove('open'));
  if (!isOpen) { drop.classList.add('open'); trig.classList.add('open'); }
}
function campAiMsToggleAll(key, el) {
  const drop = document.getElementById('campAiMsDrop'+key);
  drop.querySelectorAll('.ms-option:not(.ms-all)').forEach(o=>{o.classList.remove('selected');o.querySelector('input').checked=false;});
  el.classList.add('selected'); el.querySelector('input').checked=true;
  campAiMsUpdateLabel(key); _campAiUpdatePostCount();
}
function campAiMsToggleOption(key, el) {
  const allEl = document.getElementById('campAiMsDrop'+key).querySelector('.ms-all');
  const checked = !el.classList.contains('selected');
  el.classList.toggle('selected', checked); el.querySelector('input').checked = checked;
  const anySelected = [...document.getElementById('campAiMsDrop'+key).querySelectorAll('.ms-option:not(.ms-all)')].some(o=>o.classList.contains('selected'));
  allEl.classList.toggle('selected', !anySelected); allEl.querySelector('input').checked = !anySelected;
  campAiMsUpdateLabel(key); _campAiUpdatePostCount();
}
function campAiMsGetValues(key) {
  const drop = document.getElementById('campAiMsDrop'+key);
  if (!drop) return ['__all__'];
  if (drop.querySelector('.ms-all')?.classList.contains('selected')) return ['__all__'];
  return [...drop.querySelectorAll('.ms-option:not(.ms-all).selected')].map(o=>o.dataset.value);
}
function campAiMsUpdateLabel(key) {
  const vals = campAiMsGetValues(key);
  const lbl  = document.getElementById('campAiMsLabel'+key);
  if (!lbl) return;
  if (vals[0]==='__all__'||!vals.length) { lbl.textContent=key==='Source'?'All channels':'All sentiments'; lbl.classList.add('placeholder'); }
  else { lbl.textContent=vals.join(', '); lbl.classList.remove('placeholder'); }
}

// Analysis type switcher
// Get filtered rows for Campaign AI
function _campAiGetRows() {
  if (!campActiveCampaign) return [];
  const pool    = allRawData.length ? allRawData : rawData;
  const sources = campAiMsGetValues('Source');
  const sents   = campAiMsGetValues('Sent');
  const allSrc  = sources[0] === '__all__';
  const allSent = sents[0]   === '__all__';
  return pool.filter(row => {
    let v = String(row.Campaign || row.campaign || '').trim();
    if (v.startsWith('[') && v.endsWith(']')) v = v.slice(1, -1);
    if (!v.split(',').map(x=>x.trim()).includes(campActiveCampaign)) return false;
    if (!allSrc) {
      const rawSrc = String(row.source || row.Source || '').trim();
      const normSrc = normalizeChannel(rawSrc);
      if (!sources.includes(normSrc) && !sources.includes(rawSrc)) return false;
    }
    if (!allSent && !sents.includes(row.sentiment)) return false;
    return true;
  });
}

function _campAiGetFilteredTexts() {
  const max    = parseInt(document.getElementById('campAiMaxPosts')?.value) || 1000;
  const sortBy = document.getElementById('campAiSortBy')?.value || 'engagement';
  let rows = _campAiGetRows().filter(r => String(r.text||'').trim() && String(r.text||'').trim() !== 'null');
  if (sortBy === 'engagement') rows = rows.slice().sort((a,b) => (parseFloat(b.engagement_score)||0) - (parseFloat(a.engagement_score)||0));
  return rows.slice(0, max).map(row => ({
    text:       String(row.text||'').trim(),
    engagement: parseFloat(row.engagement_score)||0,
    sentiment:  row.sentiment||'',
    source:     row.source||'',
    created_at: row.created_at||row.date||'',
    user_name:  row.user_name||row.author||'',
  }));
}

function _campAiUpdatePostCount() {
  if (!rawData.length || !campActiveCampaign) { const el=document.getElementById('campAiPostCount'); if(el) el.textContent=''; return; }
  const max      = parseInt(document.getElementById('campAiMaxPosts')?.value) || 1000;
  const total    = _campAiGetRows().length;
  const withText = _campAiGetRows().filter(r => String(r.text||'').trim() && String(r.text||'').trim() !== 'null').length;
  const forAI    = Math.min(withText, max);
  const noText   = total - withText;
  const capped   = withText > max;
  let note = '';
  if (capped)          note = ` · <strong>${forAI.toLocaleString()} sent to AI</strong> (capped at ${max.toLocaleString()})`;
  else if (noText > 0) note = ` · ${noText} row${noText>1?'s':''} skipped (no text)`;
  const el = document.getElementById('campAiPostCount');
  if (el) el.innerHTML = `${total.toLocaleString()} posts matched${note}`;
}

['campAiMaxPosts','campAiSortBy'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', _campAiUpdatePostCount);
});


// ── CAMPAIGN AI RUN BUTTON ────────────────────────────────────────────────────
document.getElementById('campAiRunBtn')?.addEventListener('click', async () => {
  if (!geminiApiKey) {
    const el = document.getElementById('campAiError');
    el.textContent = 'Please save your Gemini API key in the bar at the top first.'; el.style.display = '';
    return;
  }
  if (!campActiveCampaign) {
    const el = document.getElementById('campAiError');
    el.textContent = 'Please select a campaign first.'; el.style.display = ''; return;
  }
  const rows = _campAiGetFilteredTexts();
  if (!rows.length) {
    const el = document.getElementById('campAiError');
    el.textContent = 'No posts with text match the current filters.'; el.style.display = ''; return;
  }

  const btn        = document.getElementById('campAiRunBtn');
  const outputCard = document.getElementById('campAiOutputCard');
  const outputBody = document.getElementById('campAiOutputBody');
  const errEl      = document.getElementById('campAiError');
  const metaEl     = document.getElementById('campAiOutputMeta');
  const sources    = campAiMsGetValues('Source');
  const model      = document.getElementById('campAiModel')?.value || 'gemini-2.5-flash-lite';

  btn.classList.add('running'); btn.disabled = true;
  errEl.style.display = 'none';
  outputCard.style.display = '';
  outputBody.innerHTML = '<span class="ai-cursor"></span>';
  metaEl.textContent = `${rows.length.toLocaleString()} posts · ${campActiveCampaign}${sources[0]!=='__all__'?' · '+sources.join(', '):''}  · Gemini · ${model}`;
  showToast(`Analysing ${rows.length.toLocaleString()} posts with Gemini…`, 'info', 3000);

  const { system, user } = _buildCampAiPrompts(rows);

  await _runGeminiStream({ model, system, user, outputBody,
    onDone: (fullText) => {
      btn.classList.remove('running'); btn.disabled = false;
      showToast('Campaign AI report complete!', 'success');
      document.getElementById('campAiCopyBtn').onclick = () => {
        navigator.clipboard.writeText(fullText).then(() => {
          document.getElementById('campAiCopyBtn').textContent = 'Copied!';
          showToast('AI report copied to clipboard!', 'success');
          setTimeout(() => document.getElementById('campAiCopyBtn').textContent = 'Copy', 2000);
        });
      };
    },
    onError: (msg) => {
      outputCard.style.display = 'none';
      errEl.textContent = `Gemini error: ${msg}`; errEl.style.display = '';
      btn.classList.remove('running'); btn.disabled = false;
    }
  });
});


initPyodide().catch(err=>{
  setStatus('error','Python failed');
  document.getElementById('loadProgress').textContent='Error: '+err.message;
  showToast('Python runtime failed to load — try refreshing', 'error', 8000);
});

// Sidebar date
(function(){
  const d = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const str = `${days[d.getDay()]}, ${String(d.getDate()).padStart(2,'0')} ${months[d.getMonth()]} ${d.getFullYear()}`;
  document.getElementById('sidebarDate').textContent = str;
})();
