// ── tabs/greview.js — Google Review Dashboard + AI Analysis
// ── GOOGLE REVIEW MODULE ─────────────────────────────────────────────────────
let grData = [];               // filtered google review rows
let grCurrentPage = 1;
const GR_PAGE_SIZE = 50;
let grReviewFilter = 'all';    // all | positive | neutral | negative
let grReviewLimit = 5;         // how many example reviews to show
let grWcSentiment = 'all';     // word-cloud sentiment filter
let grWcLang      = 'all';     // word-cloud language filter: 'all' | 'en' | 'th'

// Detect Google Review source column candidates
function _grGetSource(row) {
  return String(row.source || row.Source || row.channel || row.Channel || '').toLowerCase().trim();
}
function _grIsGoogle(row) {
  const s = _grGetSource(row);
  // Match any row whose source contains the exact substring "googlereviews"
  return s.includes('googlereviews');
}

// Helpers to read a row safely (case-insensitive fallback for column names)
function _grGet(row, ...keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') return row[k];
    // Try case-insensitive match
    const match = Object.keys(row).find(x => x.toLowerCase() === k.toLowerCase());
    if (match && row[match] !== undefined && row[match] !== null && String(row[match]).trim() !== '') return row[match];
  }
  return '';
}

function updateGooglePanel() {
  // Use grRawData which is parsed by pandas — correctly handles rows with
  // embedded newlines in text that the JS parseCSV would have dropped
  grData = grRawData.length ? grRawData : rawData.filter(_grIsGoogle);

  if (!grData.length) {
    document.getElementById('greviewEmpty').style.display = '';
    document.getElementById('greviewContent').style.display = 'none';
    return;
  }

  document.getElementById('greviewEmpty').style.display = 'none';
  document.getElementById('greviewContent').style.display = '';

  document.getElementById('grSubnavMeta').textContent =
    `${grData.length.toLocaleString()} Google Reviews loaded`;

  renderGrDashboard();
  renderGrRawTable();
  populateGrAiModelSelect();
  populateGrAiBrandPills();
}

// ── DASHBOARD ────────────────────────────────────────────────────────────────
function renderGrDashboard() {
  // ── KPIs
  const uniq = new Set(grData.map(r => r.id || r.ID || JSON.stringify(r))).size;
  document.getElementById('grUniqueMentions').textContent = uniq.toLocaleString();

  // Mentions/day based on days input
  updateGrMentionsPerDay();

  // Net Sentiment (pos - neg) / total * 100
  const sentCounts = { positive:0, neutral:0, negative:0 };
  grData.forEach(r => {
    const s = String(r.sentiment || '').toLowerCase().trim();
    if (sentCounts[s] !== undefined) sentCounts[s]++;
  });
  const sentTotal = sentCounts.positive + sentCounts.neutral + sentCounts.negative || 1;
  const nss = ((sentCounts.positive - sentCounts.negative) / sentTotal * 100);
  const nssEl = document.getElementById('grAvgRating');
  nssEl.textContent = (nss >= 0 ? '+' : '') + nss.toFixed(0) + '%';
  nssEl.style.color = nss >= 20 ? 'var(--pos)' : (nss <= -20 ? 'var(--neg)' : 'var(--neu)');

  // Date range
  const dates = grData
    .map(r => new Date(_grGet(r, 'created_at', 'Created_At', 'date', 'Date')))
    .filter(d => !isNaN(d.getTime()));
  if (dates.length) {
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`;
    document.getElementById('grDateRange').textContent = dates.length > 1 ? `${fmt(min)} – ${fmt(max)}` : fmt(min);
    document.getElementById('grDateRange').style.fontSize = '15px';
  } else {
    document.getElementById('grDateRange').textContent = '—';
  }

  // ── Charts
  renderGrDonut(sentCounts);
  renderGrCategoryStack();
  renderGrTop5Branches();
  renderGrWordCloud();
  renderGrExampleReviews();
}

function updateGrMentionsPerDay() {
  const days = parseInt(document.getElementById('grDaysInput').value) || 30;
  const total = grData.length;
  const perDay = total / days;
  document.getElementById('grMentionsPerDay').textContent =
    perDay >= 10 ? perDay.toFixed(0) : perDay.toFixed(1);
}

document.getElementById('grDaysInput').addEventListener('input', updateGrMentionsPerDay);

// ── SENTIMENT DONUT ──────────────────────────────────────────────────────────
function renderGrDonut(counts) {
  const el = document.getElementById('grSentimentDonut');
  el.innerHTML = '';

  const total = counts.positive + counts.neutral + counts.negative || 1;
  const segs = [
    { key:'positive', label:'Positive', val:counts.positive, color:'#1DC997' },
    { key:'neutral',  label:'Neutral',  val:counts.neutral,  color:'#FFC145' },
    { key:'negative', label:'Negative', val:counts.negative, color:'#FF5050' },
  ];

  // ── Canvas sizing — large enough to fit leader lines + labels on all sides ──
  const STROKE = 52, R = 95;
  const PAD = 110;                          // generous padding for labels
  const SIZE = (R + STROKE / 2) * 2 + PAD * 2;
  const cx = SIZE / 2, cy = SIZE / 2;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  canvas.style.cssText = 'display:block;margin:0 auto;max-width:100%';

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:' + SIZE + 'px;max-width:100%;margin:0 auto';
  wrap.appendChild(canvas);
  el.appendChild(wrap);

  // ── Horizontal legend ──
  const legend = document.createElement('div');
  legend.style.cssText = 'display:flex;justify-content:center;gap:28px;margin-top:10px;flex-wrap:wrap';
  segs.forEach(s => {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px';
    item.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px">
        <span style="width:11px;height:11px;border-radius:50%;background:${s.color};flex-shrink:0;display:inline-block"></span>
        <span style="font-size:12px;font-weight:600;color:#4B5168">${s.label}</span>
      </div>
      <span style="font-family:'DM Mono',monospace;font-size:14px;font-weight:700;color:#1A1D2E">${s.val.toLocaleString()}</span>`;
    legend.appendChild(item);
  });
  el.appendChild(legend);

  // ── Draw ──
  requestAnimationFrame(() => {
    const ctx = canvas.getContext('2d');
    const GAP = 0.022;

    // Pre-compute angles
    let angle = -Math.PI / 2;
    const segAngles = segs.map(s => {
      const sweep = (s.val / total) * Math.PI * 2;
      const start = angle;
      angle += sweep;
      return { ...s, start, sweep, end: angle };
    });

    // Draw ring segments
    segAngles.forEach(s => {
      if (!s.val) return;
      ctx.beginPath();
      ctx.arc(cx, cy, R, s.start + GAP / 2, s.end - GAP / 2);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = STROKE;
      ctx.lineCap = 'butt';
      ctx.stroke();
    });

    // Leader line distances (all relative to cx/cy)
    const RING_OUTER  = R + STROKE / 2;      // outer edge of ring
    const LINE_START  = RING_OUTER + 6;      // start of leader line
    const LINE_RADIAL = RING_OUTER + 24;     // end of radial part
    const TICK_LEN    = 18;                  // horizontal tick length
    const LABEL_GAP   = 5;                   // gap between tick end and text

    ctx.textBaseline = 'middle';

    segAngles.forEach(s => {
      const pct = s.val / total * 100;
      if (pct < 0.5) return;

      const mid = s.start + s.sweep / 2;
      const cos = Math.cos(mid);
      const sin = Math.sin(mid);

      // Radial line: ring outer → elbow
      const x1 = cx + cos * LINE_START;
      const y1 = cy + sin * LINE_START;
      const x2 = cx + cos * LINE_RADIAL;
      const y2 = cy + sin * LINE_RADIAL;

      // Horizontal tick
      const dir  = cos >= 0 ? 1 : -1;
      const x3   = x2 + dir * TICK_LEN;
      const y3   = y2;

      // Draw line
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x3, y3);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Text anchor
      const labelX = x3 + dir * LABEL_GAP;
      ctx.textAlign = dir >= 0 ? 'left' : 'right';

      // Label name
      ctx.fillStyle = '#4B5168';
      ctx.font = '500 14px "DM Sans", sans-serif';
      ctx.fillText(s.label, labelX, y3 - 11);

      // Percentage
      ctx.fillStyle = s.color;
      ctx.font = '700 16px "DM Sans", sans-serif';
      ctx.fillText(pct.toFixed(2) + '%', labelX, y3 + 10);
    });
  });
}

// ── CATEGORY STACKED BAR (from "Detail" column) ─────────────────────────────
function renderGrCategoryStack() {
  const el = document.getElementById('grCategoryStack');
  el.innerHTML = '';

  // Group by Detail × sentiment (exploded on Detail comma-split & bracket-stripped)
  const cats = {}; // { categoryName: { positive, neutral, negative, total } }
  grData.forEach(r => {
    let detail = _grGet(r, 'Detail', 'detail', 'Category', 'category');
    if (!detail) return;
    let s = String(detail).trim();
    if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1,-1);
    const parts = s.split(',').map(x => x.trim()).filter(Boolean);
    const sent = String(r.sentiment || '').toLowerCase().trim();
    parts.forEach(cat => {
      if (!cats[cat]) cats[cat] = { positive:0, neutral:0, negative:0, total:0 };
      if (cats[cat][sent] !== undefined) {
        cats[cat][sent]++;
        cats[cat].total++;
      }
    });
  });

  const catList = Object.entries(cats)
    .map(([name, c]) => ({ name, ...c }))
    .sort((a, b) => {
      const aOther = /^others?$/i.test(a.name.trim());
      const bOther = /^others?$/i.test(b.name.trim());
      if (aOther && !bOther) return 1;
      if (!aOther && bOther) return -1;
      return b.total - a.total;
    });

  if (!catList.length) {
    el.innerHTML = '<div class="gr-chart-empty">No "Detail" column data found in Google Reviews</div>';
    return;
  }

  // Legend
  const leg = document.createElement('div');
  leg.className = 'sent-legend';
  leg.style.marginBottom = '14px';
  ['positive','neutral','negative'].forEach(s => {
    const i = document.createElement('div');
    i.className = 'sent-leg-item';
    i.innerHTML = `<span class="sent-leg-dot" style="background:${SENT_COLORS[s]}"></span>${s}`;
    leg.appendChild(i);
  });
  el.appendChild(leg);

  catList.forEach(c => {
    const tot = c.total || 1;
    const pp = (c.positive / tot * 100);
    const np = (c.neutral  / tot * 100);
    const negp = (c.negative / tot * 100);

    const row = document.createElement('div');
    row.className = 'gr-cat-row';

    const lbl = document.createElement('div');
    lbl.className = 'gr-cat-lbl';
    lbl.textContent = c.name;
    lbl.title = c.name;

    const track = document.createElement('div');
    track.className = 'gr-cat-track';

    [['positive',c.positive,pp],['neutral',c.neutral,np],['negative',c.negative,negp]].forEach(([s,v,pct]) => {
      const seg = document.createElement('div');
      seg.className = 'gr-cat-seg';
      seg.style.background = SENT_COLORS[s];
      seg.style.width = '0%';
      seg.dataset.pct = pct.toFixed(1);
      seg.title = `${s}: ${v.toLocaleString()} (${pct.toFixed(1)}%)`;
      if (pct >= 6) {
        const pctEl = document.createElement('span');
        pctEl.className = 'gr-cat-seg-count';
        pctEl.textContent = pct.toFixed(1) + '%';
        seg.appendChild(pctEl);
      }
      track.appendChild(seg);
      requestAnimationFrame(() => { seg.style.width = pct + '%'; });
    });

    const tot2 = document.createElement('div');
    tot2.className = 'gr-cat-total';
    tot2.textContent = c.total.toLocaleString();

    row.appendChild(lbl); row.appendChild(track); row.appendChild(tot2);
    el.appendChild(row);
  });
}

// ── WORD CLOUD ──────────────────────────────────────────────────────────────
const GR_STOPWORDS = new Set([
  // English
  'the','a','an','and','or','but','of','in','on','at','to','for','with','by','from','as','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','must','can','this','that','these','those','i','you','he','she','it','we','they','my','your','his','her','its','our','their','me','him','them','us','what','which','who','when','where','why','how','all','any','both','each','few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too','very','just','up','out','if','about','into','through','during','before','after','above','below','over','under','again','further','then','once','very','really','quite','there','here','also','because','been','being','went','go','got','get','got','would','one','two','three','new','back','good','like','much','many','big','small','think','say','said','know','time','way','use','even','much','well','make','made','see','saw','want','need','came','come','find','take','took','put','want','day','days','year','years','thing','things','people','person','work','day','mr','ms','mrs','etc',
  // Thai common
  'ครับ','ค่ะ','คะ','นะ','และ','ของ','ที่','ไม่','มาก','ก็','จะ','แต่','เป็น','ให้','ได้','กับ','มี','ใน','ไป','มา','ว่า','ไว้','ต้อง','คน','นี้','นั้น','ถ้า','จาก','เรา','เขา','เธอ','ผม','ฉัน','โดย','ด้วย','อยู่','อยาก','ยัง','แล้ว','เลย','อีก','ทำ','ใช้','เอา','ดู','อะไร','ทำไม','อย่าง','ที่สุด','เพราะ','หรือ','สำหรับ','ต่อ','ไหม','เท่านั้น','เดียว','ประมาณ','ช่วย','คิด','รู้','พูด','ชอบ','หน่อย','มัน','ทั้ง','จริง','เพื่อ','ตอน','วัน','เมื่อ','ทุก','กว่า','ซึ่ง','เช่น','คือ','ตาม','อย่างไร','ฯลฯ','ๆ','ต่างๆ','หลาย','บาง','เรื่อง','เวลา','ทาง','พร้อม','อีกทั้ง','โอ','เฮ้','ว้าว','สาขา'
]);

function _grTokenise(text) {
  if (!text) return [];
  const s = String(text).toLowerCase();
  const tokens = s.split(/[\s,.\-!?;:"'()\[\]{}\/\\|<>@#$%^&*+=~`\n\t\r0-9]+/u)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !GR_STOPWORDS.has(t) && !/^\d+$/.test(t));
  return tokens;
}

// Detect if a token is Thai (contains at least one Thai Unicode char)
function _isThai(token) { return /[\u0E00-\u0E7F]/.test(token); }
function _isEnglish(token) { return /^[a-z]+$/.test(token); }

function renderGrWordCloud() {
  const el = document.getElementById('grWordCloud');
  el.innerHTML = '';

  let pool = grData;
  if (grWcSentiment !== 'all') {
    pool = grData.filter(r => String(r.sentiment || '').toLowerCase() === grWcSentiment);
  }

  const freq = {};
  pool.forEach(r => {
    const text = _grGet(r, 'text', 'Text', 'review', 'Review', 'content', 'Content');
    _grTokenise(text).forEach(t => {
      // Language filter
      if (grWcLang === 'en' && !_isEnglish(t)) return;
      if (grWcLang === 'th' && !_isThai(t)) return;
      freq[t] = (freq[t] || 0) + 1;
    });
  });

  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80);

  if (!top.length) {
    el.innerHTML = '<div class="gr-wc-empty" style="padding:40px 0;text-align:center">No text data available for word cloud</div>';
    return;
  }

  // ── Canvas-based word cloud ──
  const W = 680, H = 320;
  const canvas = document.createElement('canvas');
  canvas.width  = W;
  canvas.height = H;
  canvas.style.cssText = 'display:block;width:100%;max-width:' + W + 'px;border-radius:10px;background:#fff;margin:0 auto';
  el.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  // Soft multi-color palette matching reference image style
  const PALETTE = [
    '#2563EB','#1DC997','#8B5CF6','#F59E0B','#EF4444',
    '#0EA5E9','#EC4899','#10B981','#F97316','#6366F1',
    '#14B8A6','#A855F7','#3B82F6','#84CC16',
  ];

  const maxC = top[0][1];
  const minC = top[top.length - 1][1];
  const range = Math.max(maxC - minC, 1);

  // Collision grid (pixel-based bitmask using occupied rectangles)
  const placed = []; // [{x,y,w,h}]
  function overlaps(nx, ny, nw, nh) {
    for (const r of placed) {
      if (nx < r.x + r.w + 4 && nx + nw + 4 > r.x &&
          ny < r.y + r.h + 4 && ny + nh + 4 > r.y) return true;
    }
    return false;
  }

  // Spiral placement from centre
  function tryPlace(word, fontSize, color) {
    ctx.font = `700 ${fontSize}px "Bricolage Grotesque", "DM Sans", sans-serif`;
    const tw = ctx.measureText(word).width;
    const th = fontSize * 1.1;

    const cx = W / 2, cy = H / 2;
    const step = 3, maxR = Math.max(W, H);

    for (let r = 0; r < maxR; r += step) {
      const turns = r === 0 ? 1 : Math.max(8, Math.round(2 * Math.PI * r / step));
      for (let i = 0; i < turns; i++) {
        const angle = (2 * Math.PI * i) / turns;
        // slight random jitter to avoid perfect rings
        const rx = cx + r * Math.cos(angle) * (0.9 + Math.random() * 0.2) - tw / 2;
        const ry = cy + r * Math.sin(angle) * (0.55 + Math.random() * 0.1) - th / 2;

        if (rx < 6 || ry < 6 || rx + tw > W - 6 || ry + th > H - 6) continue;
        if (overlaps(rx, ry, tw, th)) continue;

        // Place it
        placed.push({ x: rx, y: ry, w: tw, h: th });
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.82 + (fontSize / (14 + 44)) * 0.18;
        ctx.fillText(word, rx, ry + fontSize * 0.88);
        ctx.globalAlpha = 1;
        return true;
      }
    }
    return false;
  }

  top.forEach(([word, cnt], idx) => {
    const ratio    = (cnt - minC) / range;
    const fontSize = Math.round(11 + ratio * 28);  // 11px → 39px
    const color    = PALETTE[idx % PALETTE.length];
    tryPlace(word, fontSize, color);
  });
}

// Word cloud sentiment filter
document.querySelectorAll('input[name="grWcSent"]').forEach(r => {
  r.addEventListener('change', e => {
    grWcSentiment = e.target.value;
    renderGrWordCloud();
  });
});

// Word cloud language filter
document.querySelectorAll('input[name="grWcLang"]').forEach(r => {
  r.addEventListener('change', e => {
    grWcLang = e.target.value;
    renderGrWordCloud();
  });
});

// ── EXAMPLE REVIEWS ─────────────────────────────────────────────────────────
function renderGrExampleReviews() {
  const el = document.getElementById('grExampleReviews');
  el.innerHTML = '';

  let pool = grData;
  if (grReviewFilter !== 'all') {
    pool = grData.filter(r => String(r.sentiment || '').toLowerCase() === grReviewFilter);
  }

  // Sort by engagement score desc if available, else by date desc, else original
  pool = pool.slice().sort((a, b) => {
    const ea = parseFloat(a.engagement_score) || 0;
    const eb = parseFloat(b.engagement_score) || 0;
    if (eb !== ea) return eb - ea;
    const da = new Date(_grGet(a, 'created_at', 'date')).getTime() || 0;
    const db = new Date(_grGet(b, 'created_at', 'date')).getTime() || 0;
    return db - da;
  });

  const slice = pool.slice(0, grReviewLimit);

  if (!slice.length) {
    el.innerHTML = '<div class="gr-chart-empty">No reviews match this filter</div>';
    document.getElementById('grLoadMoreBtn').style.display = 'none';
    return;
  }

  slice.forEach(r => {
    const brand = _grGet(r, 'Brands', 'brand', 'Brand') || 'Unknown Brand';
    const brandClean = String(brand).replace(/^\[|\]$/g, '').trim();
    const location = String(_grGet(r, 'title', 'Title', 'location', 'Location') || '').trim();
    const locationClean = (location && location !== 'null') ? location : '';
    const text  = _grGet(r, 'text', 'Text', 'review', 'Review');
    const sent  = String(r.sentiment || '').toLowerCase();
    const date  = _grGet(r, 'created_at', 'date', 'Date');
    const link  = _grGet(r, 'link', 'Link', 'url', 'URL', 'post_url', 'permalink');
    const author = _grGet(r, 'author', 'Author', 'username', 'user_name', 'user') || brandClean;
    const initial = (author || 'U').toString().charAt(0).toUpperCase();

    const dateFmt = date ? new Date(date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '';

    const item = document.createElement('div');
    item.className = 'gr-review-item';

    const linkHtml = link
      ? `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer" class="gr-review-link">🔗 View on Google</a>`
      : '<span class="gr-review-no-link">no link</span>';

    item.innerHTML = `
      <div class="gr-review-avatar">${initial}</div>
      <div class="gr-review-body">
        <div class="gr-review-head">
          ${locationClean ? `<span class="gr-review-location">📍 ${escapeHtml(locationClean)}</span>` : `<span class="gr-review-brand">${escapeHtml(brandClean)}</span>`}
          ${dateFmt ? `<span class="gr-review-date">· ${escapeHtml(dateFmt)}</span>` : ''}
        </div>
        <div class="gr-review-text">${escapeHtml(text || '(no text)')}</div>
        <div class="gr-review-foot">
          ${sent ? `<span class="gr-review-sent ${sent}">${sent}</span>` : ''}
          ${linkHtml}
        </div>
      </div>`;
    el.appendChild(item);
  });

  // Show "load more" if there are more than current limit
  const loadBtn = document.getElementById('grLoadMoreBtn');
  if (pool.length > grReviewLimit) {
    loadBtn.style.display = '';
    loadBtn.textContent = `Load more reviews (${(pool.length - grReviewLimit).toLocaleString()} remaining)`;
  } else {
    loadBtn.style.display = 'none';
  }
}

// ── TOP 5 BRANCH / LOCATION TABLE ───────────────────────────────────────────
let grTop5Filter = 'all'; // all | positive | neutral | negative

function renderGrTop5Branches() {
  const tbody = document.getElementById('grTop5Body');
  if (!tbody) return;
  tbody.innerHTML = '';

  // Aggregate by branch name — look for title/Title first (Google Maps page name),
  // then location/Location, then branch/Branch. Never fall back to Brands.
  const branches = {};
  grData.forEach(r => {
    const branch = String(_grGet(r, 'title', 'Title', 'page', 'Page', 'location', 'Location', 'branch', 'Branch') || '').trim();
    if (!branch || branch === 'null') return;
    const sent = String(r.sentiment || '').toLowerCase().trim();
    if (!branches[branch]) branches[branch] = { positive: 0, neutral: 0, negative: 0 };
    if (branches[branch][sent] !== undefined) branches[branch][sent]++;
  });

  if (!Object.keys(branches).length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text3);font-style:italic">No branch/location data found — needs a "title", "Location", "branch", or "page" column</td></tr>`;
    return;
  }

  // Build sortable list
  let list = Object.entries(branches).map(([name, c]) => {
    const total = c.positive + c.neutral + c.negative;
    const net = total ? ((c.positive - c.negative) / total * 100) : 0;
    return { name, ...c, total, net };
  });

  // Sort: if filter is a sentiment, rank by that count desc; else by total mentions desc
  if (grTop5Filter === 'all') {
    list.sort((a, b) => b.total - a.total);
  } else {
    list.sort((a, b) => b[grTop5Filter] - a[grTop5Filter]);
  }

  // Top 5
  const top5 = list.slice(0, 5);

  top5.forEach((row, idx) => {
    const netClass = row.net > 0 ? 'pos' : (row.net < 0 ? 'neg' : 'neu');
    const netStr   = (row.net >= 0 ? '+' : '') + row.net.toFixed(0) + '%';

    // Highlight the sorted column
    const posStyle = grTop5Filter === 'positive' ? `font-weight:700;color:var(--pos)` : `color:var(--pos)`;
    const neuStyle = grTop5Filter === 'neutral'  ? `font-weight:700;color:var(--neu)` : `color:var(--neu)`;
    const negStyle = grTop5Filter === 'negative' ? `font-weight:700;color:var(--neg)` : `color:var(--neg)`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="branch-name" title="${escapeHtml(row.name)}">${escapeHtml(row.name)}</td>
      <td class="num" style="font-weight:700;color:var(--text)">${row.total.toLocaleString()}</td>
      <td class="num" style="${posStyle}">${row.positive.toLocaleString()}</td>
      <td class="num" style="${neuStyle}">${row.neutral.toLocaleString()}</td>
      <td class="num" style="${negStyle}">${row.negative.toLocaleString()}</td>
      <td class="num"><span class="gr-top5-netsent ${netClass}">${netStr}</span></td>`;
    tbody.appendChild(tr);
  });
}

// Filter pill event listeners
document.querySelectorAll('.gr-top5-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gr-top5-pill').forEach(b => {
      b.classList.remove('active-all','active-pos','active-neu','active-neg');
    });
    grTop5Filter = btn.dataset.top5;
    const activeClass = grTop5Filter === 'all' ? 'active-all'
      : grTop5Filter === 'positive' ? 'active-pos'
      : grTop5Filter === 'neutral'  ? 'active-neu'
      : 'active-neg';
    btn.classList.add(activeClass);
    renderGrTop5Branches();
  });
});



// Review filter pills
document.querySelectorAll('.gr-rev-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gr-rev-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    grReviewFilter = btn.dataset.rev;
    grReviewLimit = 5; // reset on filter change
    renderGrExampleReviews();
  });
});

document.getElementById('grLoadMoreBtn').addEventListener('click', () => {
  grReviewLimit += 10;
  renderGrExampleReviews();
});

// Safe HTML escape (reusing pattern from elsewhere)

// ── RAW DATA TABLE ──────────────────────────────────────────────────────────
const GR_DISPLAY_COLS = ['title','created_at','Brands','Detail','sentiment','text','link'];

// Human-readable header labels for GR table columns
const GR_COL_LABELS = {
  title:       'LOCATION',
  source:      'SOURCE',
  created_at:  'DATE',
  brands:      'BRANDS',
  detail:      'DETAIL',
  sentiment:   'SENTIMENT',
  text:        'REVIEW',
  link:        'LINK',
};

function renderGrRawTable() {
  const search = (document.getElementById('grTableSearch').value || '').toLowerCase();
  const sentF  = document.getElementById('grSentFilter').value;

  let filtered = grData.filter(row => {
    if (sentF !== '__all__' && String(row.sentiment || '').toLowerCase() !== sentF) return false;
    if (search) {
      const hay = Object.values(row).join(' ').toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  document.getElementById('grTableCount').textContent = `${filtered.length.toLocaleString()} rows`;

  // Determine which columns actually exist in the first row of grData
  const sampleKeys = grData.length ? Object.keys(grData[0]) : [];
  const cols = GR_DISPLAY_COLS.filter(c =>
    sampleKeys.some(k => k.toLowerCase() === c.toLowerCase())
  );
  // Fallback: if no cols match, use first 8 keys excluding 'id'
  const finalCols = cols.length ? cols : sampleKeys.filter(k => k.toLowerCase() !== 'id').slice(0, 8);

  // Build header using friendly labels
  document.getElementById('grTHead').innerHTML =
    '<tr>' + finalCols.map(c => {
      const label = GR_COL_LABELS[c.toLowerCase()] || c.toUpperCase();
      return `<th>${escapeHtml(label)}</th>`;
    }).join('') + '</tr>';

  const total = Math.max(1, Math.ceil(filtered.length / GR_PAGE_SIZE));
  grCurrentPage = Math.min(grCurrentPage, total);
  const slice = filtered.slice((grCurrentPage-1)*GR_PAGE_SIZE, grCurrentPage*GR_PAGE_SIZE);

  const tb = document.getElementById('grTBody');
  tb.innerHTML = '';

  if (!slice.length) {
    tb.innerHTML = `<tr><td colspan="${finalCols.length}" style="text-align:center;padding:28px;color:var(--text3);font-style:italic">No rows match</td></tr>`;
  } else {
    slice.forEach(row => {
      const tr = document.createElement('tr');
      finalCols.forEach(c => {
        // Find the actual key regardless of case
        const actualKey = Object.keys(row).find(k => k.toLowerCase() === c.toLowerCase()) || c;
        let val = row[actualKey] || '';
        const td = document.createElement('td');
        if (c.toLowerCase() === 'sentiment') {
          const s = String(val).toLowerCase();
          td.innerHTML = val ? `<span class="badge ${s}">${escapeHtml(val)}</span>` : '';
        } else if (c.toLowerCase() === 'link' || c.toLowerCase() === 'url') {
          if (val) {
            td.innerHTML = `<a href="${escapeHtml(val)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:none;font-weight:600">🔗 Open</a>`;
          }
        } else {
          td.textContent = val;
          td.title = val;
        }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
  }

  document.getElementById('grPageInfo').textContent = `Page ${grCurrentPage} of ${total} (${filtered.length.toLocaleString()} rows)`;
  document.getElementById('grPrevPage').disabled = grCurrentPage <= 1;
  document.getElementById('grNextPage').disabled = grCurrentPage >= total;
}

document.getElementById('grPrevPage').addEventListener('click', () => { grCurrentPage--; renderGrRawTable(); });
document.getElementById('grNextPage').addEventListener('click', () => { grCurrentPage++; renderGrRawTable(); });
document.getElementById('grTableSearch').addEventListener('input', () => { grCurrentPage = 1; renderGrRawTable(); });
document.getElementById('grSentFilter').addEventListener('change', () => { grCurrentPage = 1; renderGrRawTable(); });

// ── GR SUB-TAB SWITCHER ─────────────────────────────────────────────────────
document.querySelectorAll('.gr-subtab').forEach(btn => {
  btn.addEventListener('click', () => {
    // Only affect tabs within the same parent subnav
    const nav = btn.closest('.gr-subnav');
    const panel = btn.closest('.panel') || btn.closest('#bddContent') || document.body;
    nav.querySelectorAll('.gr-subtab').forEach(b => b.classList.remove('active'));
    // Hide all gr-subpanels that are siblings of this subnav's parent
    const subpanelParent = nav.parentElement;
    subpanelParent.querySelectorAll(':scope > .gr-subpanel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const tabId = btn.dataset.grTab || btn.dataset.bddTab;
    // Determine the correct panel prefix
    const isGr  = !!btn.dataset.grTab;
    const prefix = isGr ? 'gr-panel-' : 'bdd-panel-';
    const target = document.getElementById(prefix + tabId);
    if (target) target.classList.add('active');
  });
});

// ── GR AI ANALYSIS MODULE ────────────────────────────────────────────────────
let grAiActiveBrand = null; // null = all brands

// Multi-select helpers scoped to grAi
function grAiMsToggle(key) {
  const drop = document.getElementById('grAiMsDrop'+key);
  const trig = document.getElementById('grAiMsTrigger'+key);
  const isOpen = drop.classList.contains('open');
  document.querySelectorAll('.ms-dropdown.open').forEach(d=>d.classList.remove('open'));
  document.querySelectorAll('.ms-trigger.open').forEach(t=>t.classList.remove('open'));
  if (!isOpen) { drop.classList.add('open'); trig.classList.add('open'); }
}
function grAiMsToggleAll(key, el) {
  const drop = document.getElementById('grAiMsDrop'+key);
  drop.querySelectorAll('.ms-option:not(.ms-all)').forEach(o=>{o.classList.remove('selected');o.querySelector('input').checked=false;});
  el.classList.add('selected'); el.querySelector('input').checked=true;
  grAiMsUpdateLabel(key); _grAiUpdatePostCount();
}
function grAiMsToggleOption(key, el) {
  const allEl = document.getElementById('grAiMsDrop'+key).querySelector('.ms-all');
  const checked = !el.classList.contains('selected');
  el.classList.toggle('selected', checked); el.querySelector('input').checked = checked;
  const anySelected = [...document.getElementById('grAiMsDrop'+key).querySelectorAll('.ms-option:not(.ms-all)')].some(o=>o.classList.contains('selected'));
  allEl.classList.toggle('selected', !anySelected); allEl.querySelector('input').checked = !anySelected;
  grAiMsUpdateLabel(key); _grAiUpdatePostCount();
}
function grAiMsGetValues(key) {
  const drop = document.getElementById('grAiMsDrop'+key);
  if (!drop) return ['__all__'];
  const allEl = drop.querySelector('.ms-all');
  if (allEl?.classList.contains('selected')) return ['__all__'];
  return [...drop.querySelectorAll('.ms-option:not(.ms-all).selected')].map(o=>o.dataset.value);
}
function grAiMsUpdateLabel(key) {
  const vals = grAiMsGetValues(key);
  const lbl  = document.getElementById('grAiMsLabel'+key);
  if (!lbl) return;
  if (vals[0]==='__all__'||vals.length===0) { lbl.textContent='All sentiments'; lbl.classList.add('placeholder'); }
  else { lbl.textContent=vals.join(', '); lbl.classList.remove('placeholder'); }
}

function populateGrAiModelSelect() {
  const sel = document.getElementById('grAiModel');
  if (!sel) return;
  sel.innerHTML = '';
  AI_MODELS['gemini'].forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.value; opt.textContent = m.label; sel.appendChild(opt);
  });
  sel.value = 'gemini-2.5-flash-lite';
}

function populateGrAiBrandPills() {
  const container = document.getElementById('grAiBrandPills');
  if (!container) return;
  container.innerHTML = '';

  // Count reviews per brand then sort descending
  const brandCount = {};
  grData.forEach(row => {
    let b = String(row.Brands || row.brands || '').trim();
    if (b.startsWith('[') && b.endsWith(']')) b = b.slice(1,-1);
    b.split(',').map(x=>x.trim()).filter(Boolean).forEach(x => {
      brandCount[x] = (brandCount[x] || 0) + 1;
    });
  });
  const brands = Object.keys(brandCount).sort((a, b) => brandCount[b] - brandCount[a]);

  // Helper to build a pill
  function makePill(label, isActive, color, onClick) {
    const pill = document.createElement('button');
    pill.className = 'bdd-ai-brand-pill' + (isActive ? ' active' : '');
    if (isActive && color) pill.style.color = color;
    pill.innerHTML = `<span class="pill-dot" style="background:${isActive ? (color||'var(--accent)') : 'rgba(255,255,255,.6)'}"></span>${label}`;
    pill.addEventListener('click', onClick);
    return pill;
  }

  // "All Brands" pill
  const allPill = makePill('All Brands', grAiActiveBrand === null, null, () => {
    grAiActiveBrand = null;
    populateGrAiBrandPills();
    _grAiUpdatePostCount();
  });
  container.appendChild(allPill);

  // Per-brand pills
  brands.forEach((brand, i) => {
    const color = BDD_COLORS[i % BDD_COLORS.length];
    const isActive = brand === grAiActiveBrand;
    const pill = makePill(brand, isActive, color, () => {
      grAiActiveBrand = brand;
      populateGrAiBrandPills();
      _grAiUpdatePostCount();
    });
    container.appendChild(pill);
  });

  _grAiUpdatePostCount();
}

function _grAiGetRows() {
  const pool = grData;
  const sents   = grAiMsGetValues('Sent');
  const allSent = sents[0]==='__all__';
  return pool.filter(row => {
    if (grAiActiveBrand) {
      let b = String(row.Brands||row.brands||'').trim();
      if (b.startsWith('[')&&b.endsWith(']')) b=b.slice(1,-1);
      if (!b.split(',').map(x=>x.trim()).includes(grAiActiveBrand)) return false;
    }
    if (!allSent && !sents.includes(String(row.sentiment||'').toLowerCase())) return false;
    return true;
  });
}

function _grAiGetFilteredTexts() {
  const max    = parseInt(document.getElementById('grAiMaxPosts').value)||1000;
  const sortBy = document.getElementById('grAiSortBy').value;
  let rows = _grAiGetRows().filter(r=>String(r.text||'').trim()&&String(r.text||'').trim()!=='null');
  if (sortBy==='engagement') rows=rows.slice().sort((a,b)=>(parseFloat(b.engagement_score)||0)-(parseFloat(a.engagement_score)||0));
  return rows.slice(0,max).map(row=>({
    text:       String(row.text||'').trim(),
    engagement: parseFloat(row.engagement_score)||0,
    sentiment:  String(row.sentiment||'').toLowerCase(),
    source:     String(row.source||row.Source||''),
    title:      String(row.title||row.Title||row.page||''),
    created_at: row.created_at||row.date||'',
  }));
}

function _grAiUpdatePostCount() {
  if (!grData.length) return;
  const max      = parseInt(document.getElementById('grAiMaxPosts').value)||1000;
  const sortBy   = document.getElementById('grAiSortBy')?.value;
  const total    = _grAiGetRows().length;
  const withText = _grAiGetRows().filter(r=>String(r.text||'').trim()&&String(r.text||'').trim()!=='null').length;
  const forAI    = Math.min(withText, max);
  const noText   = total - withText;
  const capped   = withText > max;

  let note = '';
  if (capped)          note = ` · <strong>${forAI.toLocaleString()} sent to AI</strong> (capped at ${max.toLocaleString()})`;
  else if (noText > 0) note = ` · ${noText} row${noText>1?'s':''} skipped (no text)`;

  const sorted = sortBy==='engagement' ? ' · sorted by engagement' : '';
  const el = document.getElementById('grAiPostCount');
  if (el) el.innerHTML = `${total.toLocaleString()} reviews matched${note}${sorted}`;
}

['grAiMaxPosts','grAiSortBy'].forEach(id=>{
  document.getElementById(id)?.addEventListener('change', _grAiUpdatePostCount);
});

document.getElementById('grAiRunBtn').addEventListener('click', async () => {
  if (!geminiApiKey) {
    const el=document.getElementById('grAiError'); el.textContent='Please save your Gemini API key in the bar at the top first.'; el.style.display='';
    return;
  }
  const rows = _grAiGetFilteredTexts();
  if (!rows.length) {
    const el=document.getElementById('grAiError'); el.textContent='No reviews with text match the current filters.'; el.style.display=''; return;
  }

  const btn        = document.getElementById('grAiRunBtn');
  const outputCard = document.getElementById('grAiOutputCard');
  const outputBody = document.getElementById('grAiOutputBody');
  const errEl      = document.getElementById('grAiError');
  const metaEl     = document.getElementById('grAiOutputMeta');
  const model      = document.getElementById('grAiModel')?.value || 'gemini-2.5-flash-lite';
  const sents      = grAiMsGetValues('Sent');
  const sent       = sents[0]==='__all__'?'all sentiments':sents.join(', ');
  const brandLabel = grAiActiveBrand || 'All Brands';

  btn.classList.add('running'); btn.disabled=true;
  errEl.style.display='none';
  outputCard.style.display='';
  outputBody.innerHTML='<span class="ai-cursor"></span>';
  metaEl.textContent=`${rows.length.toLocaleString()} reviews · ${brandLabel} · ${sent} · Gemini · ${model}`;
  showToast(`Analysing ${rows.length.toLocaleString()} reviews with Gemini…`, 'info', 3000);

  const { system, user } = _buildGrAiPrompts(rows);

  await _runGeminiStream({ model, system, user, outputBody,
    onDone: (fullText) => {
      btn.classList.remove('running'); btn.disabled=false;
      showToast('Google Review analysis complete!', 'success');
      document.getElementById('grAiCopyBtn').onclick=()=>{
        navigator.clipboard.writeText(fullText).then(()=>{
          document.getElementById('grAiCopyBtn').textContent='Copied!';
          showToast('AI analysis copied to clipboard!', 'success');
          setTimeout(()=>document.getElementById('grAiCopyBtn').textContent='Copy',2000);
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

