// ── charts.js — Channel Normalisation, Sentiment Charts, Overview Tab
// ── OVERVIEW TAB ─────────────────────────────────────────────────────────────
let ovMetric = 'both'; // kept for backward compat but no longer used as toggle

function setOvMetric(m) { ovMetric = m; renderOverview(); }

function renderOverview() {
  const empty   = document.getElementById('overviewEmpty');
  const content = document.getElementById('overviewContent');
  if (!reportData.sentRows || !reportData.sentRows.length) {
    empty.style.display=''; content.style.display='none'; return;
  }
  empty.style.display='none'; content.style.display='';

  const bcEng  = reportData.brandChannelEng  || {};
  const bcMen  = reportData.brandChannelMen  || {};
  const bcView = reportData.brandChannelView || {};

  // Canonical channel normalizer
  function normExt(raw) {
    const s = String(raw||'').toLowerCase().trim();
    if (!s||s==='null'||s==='undefined') return 'Website';
    if (s.includes('facebook')||s==='fb')                              return 'Facebook';
    if (s.includes('tiktok')||s==='tt')                                return 'TikTok';
    if (s.includes('pantip'))                                          return 'Pantip';
    if (s.includes('youtube')||s==='yt')                               return 'YouTube';
    if (s.includes('instagram')||s==='ig')                             return 'Instagram';
    if (s.includes('googlereview')||s.includes('google review')||
        s.includes('google_review')||(s.includes('google')&&s.includes('review'))) return 'Google Review';
    if (s.includes('lemon8')||s.includes('lem8'))                      return 'Lemon8';
    if (s.includes('linevoom')||s.includes('line voom')||
        s.includes('livoom')||s.includes('line_voom'))                 return 'LineVoom';
    if (s.includes('blockdit'))                                        return 'Blockdit';
    if (s.includes('twitter')||s.includes('x (twitter)')||s==='x'||s==='tweet') return 'X (Twitter)';
    return 'Website';
  }

  const CHANNEL_PRIORITY = ['Facebook','X (Twitter)','TikTok','Pantip','YouTube','Instagram','Google Review','Lemon8','LineVoom','Blockdit','Website'];
  const CH_COLORS = {
    'Facebook':'#1877F2','X (Twitter)':'#000000','TikTok':'#010101',
    'Pantip':'#EC008C','YouTube':'#FF0000','Instagram':'#E1306C',
    'Google Review':'#34A853','Lemon8':'#FFD700','LineVoom':'#06C755',
    'Blockdit':'#1A237E','Website':'#6B7280',
  };

  const brands = reportData.sentRows.map(r=>r.brand);
  const channelSet = new Set();
  const brandChEng = {}, brandChMen = {}, brandChView = {};

  brands.forEach(b => {
    brandChEng[b]={}; brandChMen[b]={}; brandChView[b]={};
    Object.entries(bcEng[b]||{}).forEach(([raw,v])=>{
      const ch=normExt(raw); channelSet.add(ch);
      brandChEng[b][ch]=(brandChEng[b][ch]||0)+v;
    });
    Object.entries(bcMen[b]||{}).forEach(([raw,v])=>{
      const ch=normExt(raw); channelSet.add(ch);
      brandChMen[b][ch]=(brandChMen[b][ch]||0)+v;
    });
    Object.entries(bcView[b]||{}).forEach(([raw,v])=>{
      const ch=normExt(raw); channelSet.add(ch);
      brandChView[b][ch]=(brandChView[b][ch]||0)+v;
    });
  });

  const extras=[...channelSet].filter(c=>!CHANNEL_PRIORITY.includes(c)).sort();
  const channels=[...CHANNEL_PRIORITY, ...extras];
  const fmt=v=>Number(v).toLocaleString();   // always show a number, 0 when empty

  // ── Build a single-metric table ──────────────────────────────────────────────
  function buildTable(tableEl, getData) {
    tableEl.innerHTML='';

    // colgroup — fixes identical widths across both tables
    const cg=document.createElement('colgroup');
    const cBrand=document.createElement('col'); cBrand.className='ov-col-brand'; cg.appendChild(cBrand);
    channels.forEach(()=>{ const c=document.createElement('col'); c.className='ov-col-ch'; cg.appendChild(c); });
    const cTot=document.createElement('col'); cTot.className='ov-col-total'; cg.appendChild(cTot);
    tableEl.appendChild(cg);

    // thead
    const thead=document.createElement('thead');
    const tr1=document.createElement('tr'); tr1.className='ov-header-channels';
    const th0=document.createElement('th'); th0.textContent='Brand'; th0.style.textAlign='left'; tr1.appendChild(th0);
    channels.forEach(ch=>{
      const th=document.createElement('th');
      const col=CH_COLORS[ch]||'#6B7280';
      th.innerHTML=`<div class="ov-ch-header"><span class="ov-ch-dot" style="background:${col}"></span>${ch}</div>`;
      th.style.borderLeft='1px solid var(--border2)';
      tr1.appendChild(th);
    });
    const thTot=document.createElement('th'); thTot.textContent='Total';
    thTot.style.borderLeft='2px solid var(--border2)'; tr1.appendChild(thTot);
    thead.appendChild(tr1);
    tableEl.appendChild(thead);

    // tbody
    const tbody=document.createElement('tbody');
    brands.forEach(brand=>{
      const tr=document.createElement('tr');
      const tdB=document.createElement('td'); tdB.className='ov-brand-cell'; tdB.textContent=brand; tr.appendChild(tdB);
      let total=0;
      channels.forEach(ch=>{
        const v=getData(brand,ch);
        total+=v;
        const td=document.createElement('td'); td.className='ov-num';
        td.innerHTML=fmt(Math.round(v)); td.style.borderLeft='1px solid var(--border)';
        tr.appendChild(td);
      });
      const tdTot=document.createElement('td'); tdTot.className='ov-total';
      tdTot.innerHTML=fmt(Math.round(total)); tdTot.style.borderLeft='2px solid var(--border2)';
      tr.appendChild(tdTot);
      tbody.appendChild(tr);
    });
    tableEl.appendChild(tbody);
  }

  buildTable(document.getElementById('ovTableEng'),  (b,ch)=>brandChEng[b]?.[ch]||0);
  buildTable(document.getElementById('ovTableMen'),  (b,ch)=>brandChMen[b]?.[ch]||0);

  // ── View table: two sub-rows per brand (Page View + Video View) ──────────────
  // Video View: TikTok, YouTube, Facebook, Instagram
  // Page View:  everything else (X, Blockdit, Pantip, Google Review, Lemon8, LineVoom, Website…)
  const VIDEO_CHANNELS = new Set(['TikTok','YouTube','Facebook','Instagram']);

  function buildViewTable(tableEl) {
    tableEl.innerHTML='';

    // thead
    const thead=document.createElement('thead');
    const tr1=document.createElement('tr'); tr1.className='ov-header-channels';
    const th0=document.createElement('th'); th0.textContent='Brand';
    th0.style.textAlign='left'; th0.rowSpan=2; tr1.appendChild(th0);
    const thType=document.createElement('th'); thType.textContent='View Type';
    thType.style.textAlign='left'; thType.rowSpan=2; tr1.appendChild(thType);
    channels.forEach(ch=>{
      const th=document.createElement('th');
      const col=CH_COLORS[ch]||'#6B7280';
      th.innerHTML=`<div class="ov-ch-header"><span class="ov-ch-dot" style="background:${col}"></span>${ch}</div>`;
      th.style.borderLeft='1px solid var(--border2)';
      tr1.appendChild(th);
    });
    const thTot=document.createElement('th'); thTot.textContent='Total';
    thTot.style.borderLeft='2px solid var(--border2)'; tr1.appendChild(thTot);
    thead.appendChild(tr1);
    tableEl.appendChild(thead);

    // tbody
    const tbody=document.createElement('tbody');
    brands.forEach((brand,bi)=>{
      [
        {label:'📄 Page View',  isVideo:false},
        {label:'▶ Video View', isVideo:true},
      ].forEach(({label,isVideo},ri)=>{
        const tr=document.createElement('tr');

        // Brand cell — only on first sub-row, spans 2
        if(ri===0){
          const tdB=document.createElement('td'); tdB.className='ov-brand-cell';
          tdB.textContent=brand; tdB.rowSpan=2;
          // light top border between brand groups
          if(bi>0) tdB.style.borderTop='2px solid var(--border2)';
          tr.appendChild(tdB);
        }

        const tdType=document.createElement('td');
        tdType.style.cssText=`font-size:11px;font-weight:600;color:var(--text3);white-space:nowrap;padding:7px 12px;${ri===0&&bi>0?'border-top:2px solid var(--border2)':''}`;
        tdType.textContent=label; tr.appendChild(tdType);

        let total=0;
        channels.forEach(ch=>{
          const isVideoCh=VIDEO_CHANNELS.has(ch);
          // Page View row only counts non-video channels; Video View row only video channels
          const v=(isVideo===isVideoCh) ? (brandChView[brand]?.[ch]||0) : 0;
          total+=v;
          const td=document.createElement('td'); td.className='ov-num';
          td.innerHTML=fmt(Math.round(v));
          td.style.borderLeft='1px solid var(--border)';
          if(ri===0&&bi>0) td.style.borderTop='2px solid var(--border2)';
          // Dim channels that don't belong to this view type
          if(isVideo!==isVideoCh) td.style.opacity='.25';
          tr.appendChild(td);
        });

        const tdTot=document.createElement('td'); tdTot.className='ov-total';
        tdTot.innerHTML=fmt(Math.round(total));
        tdTot.style.borderLeft='2px solid var(--border2)';
        if(ri===0&&bi>0) tdTot.style.borderTop='2px solid var(--border2)';
        tr.appendChild(tdTot);
        tbody.appendChild(tr);
      });
    });
    tableEl.appendChild(tbody);
  }

  buildViewTable(document.getElementById('ovTableView'));
}

function copyOvTable(tableId, btnId) {
  const tbl = document.getElementById(tableId);
  if (!tbl) return;
  const rows = [...tbl.querySelectorAll('tr')];
  const tsv = rows.map(tr =>
    [...tr.querySelectorAll('th,td')].map(c => c.innerText.replace(/\n/g,' ').trim()).join('\t')
  ).join('\n');
  navigator.clipboard.writeText(tsv).then(() => {
    const btn = document.getElementById(btnId);
    btn.textContent = '✔ Copied!'; btn.classList.add('copied');
    showToast('Table copied to clipboard!', 'success');
    setTimeout(() => { btn.textContent = '⎘ Copy'; btn.classList.remove('copied'); }, 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = tsv; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    const btn = document.getElementById(btnId);
    btn.textContent = '✔ Copied!'; btn.classList.add('copied');
    showToast('Table copied to clipboard!', 'success');
    setTimeout(() => { btn.textContent = '⎘ Copy'; btn.classList.remove('copied'); }, 2000);
  });
}

// ── CHARTS ────────────────────────────────────────────────────────────────────
const SENT_COLORS  = { positive:'#1DC997', neutral:'#FFC145', negative:'#FF5050' };
const TOPIC_ORDER  = ['product','promotion','price','branding','service','activity','others'];

// ── CHANNEL NORMALISATION ─────────────────────────────────────────────────────
// Fixed channel list — everything not matched falls through to Website
const CANONICAL_CHANNELS = ['Facebook','X (Twitter)','TikTok','Pantip','YouTube','Instagram','Google Review','Lemon8','LineVoom','Blockdit','Website'];
const CHANNEL_SVGS = {
  'Facebook':      `<svg viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.269h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg>`,
  'TikTok':        `<svg viewBox="0 0 24 24" fill="#010101"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>`,
  'Instagram':     `<svg viewBox="0 0 24 24"><defs><linearGradient id="ig" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#f09433"/><stop offset="25%" stop-color="#e6683c"/><stop offset="50%" stop-color="#dc2743"/><stop offset="75%" stop-color="#cc2366"/><stop offset="100%" stop-color="#bc1888"/></linearGradient></defs><path fill="url(#ig)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>`,
  'X (Twitter)':   `<svg viewBox="0 0 24 24" fill="#000000"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`,
  'YouTube':       `<svg viewBox="0 0 24 24" fill="#FF0000"><path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/></svg>`,
  'Pantip':        `<svg viewBox="0 0 24 24" fill="#EC008C"><rect width="24" height="24" rx="6"/><text x="12" y="17" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="800" fill="#fff">P</text></svg>`,
  'Google Review': `<svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>`,
  'Lemon8':        `<svg viewBox="0 0 24 24" fill="#FFD700"><rect width="24" height="24" rx="8" fill="#FFD700"/><text x="12" y="17" text-anchor="middle" font-family="sans-serif" font-size="12" font-weight="800" fill="#333">L8</text></svg>`,
  'LineVoom':      `<svg viewBox="0 0 24 24" fill="#06C755"><rect width="24" height="24" rx="8" fill="#06C755"/><path fill="#fff" d="M12 4C7.582 4 4 7.163 4 11.077c0 3.546 3.146 6.519 7.4 7.082.288.062.68.19.78.437.089.224.058.575.028.801l-.126.756c-.038.224-.178.876.768.477.946-.4 5.108-3.007 6.969-5.147C21.108 13.88 22 12.559 22 11.077 22 7.163 18.418 4 12 4z"/></svg>`,
  'Blockdit':      `<svg viewBox="0 0 24 24" fill="#1A237E"><rect width="24" height="24" rx="6" fill="#1A237E"/><text x="12" y="17" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="800" fill="#fff">BD</text></svg>`,
  'Website':       `<svg viewBox="0 0 24 24" fill="#6B7280"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`,
};

const CHANNEL_COLORS = {
  'Facebook':      '#1877F2',
  'X (Twitter)':   '#000000',
  'TikTok':        '#010101',
  'Pantip':        '#EC008C',
  'YouTube':       '#FF0000',
  'Instagram':     '#E1306C',
  'Google Review': '#34A853',
  'Lemon8':        '#FFD700',
  'LineVoom':      '#06C755',
  'Blockdit':      '#1A237E',
  'Website':       '#6B7280',
};
function normalizeChannel(raw) {
  const s = String(raw||'').toLowerCase().trim();
  if (!s||s==='null'||s==='undefined') return 'Website';
  if (s.includes('facebook')||s==='fb')                              return 'Facebook';
  if (s.includes('tiktok')||s==='tt')                                return 'TikTok';
  if (s.includes('pantip'))                                          return 'Pantip';
  if (s.includes('youtube')||s==='yt')                               return 'YouTube';
  if (s.includes('instagram')||s==='ig')                             return 'Instagram';
  if (s.includes('googlereview')||s.includes('google review')||
      s.includes('google_review')||(s.includes('google')&&s.includes('review'))) return 'Google Review';
  if (s.includes('lemon8')||s.includes('lem8'))                      return 'Lemon8';
  if (s.includes('linevoom')||s.includes('line voom')||
      s.includes('livoom')||s.includes('line_voom'))                 return 'LineVoom';
  if (s.includes('blockdit'))                                        return 'Blockdit';
  if (s.includes('twitter')||s.includes('x (twitter)')||s==='x'||s==='tweet') return 'X (Twitter)';
  // Everything else (web, blog, news, forum, GG, etc.) → Website
  return 'Website';
}

let activeTSBrand = '__all__';

function renderCharts() {
  if (!reportData.topicRows.length) {
    document.getElementById('chartsEmpty').style.display='';
    document.getElementById('chartsGrid').style.display='none'; return;
  }
  document.getElementById('chartsEmpty').style.display='none';
  document.getElementById('chartsGrid').style.display='';

  const brandsSorted = reportData.sentRows.map(r => r.brand);

  // ── 1. Sentiment Split by Brand ───────────────────────────────────────────
  const sentBrand = {};
  reportData.sentRows.forEach(r => {
    sentBrand[r.brand] = { positive:r.positive, neutral:r.neutral, negative:r.negative };
  });
  renderSentimentStacked('sent-brand-stacked', sentBrand, brandsSorted);

  // ── 1b. Sentiment donut per brand ─────────────────────────────────────────
  renderBrandDonuts(brandsSorted);

  // ── 2. Sentiment by Topic — filterable by brand ───────────────────────────
  buildTopicSentBrandFilter(brandsSorted);
  renderTopicSentBars();

  // ── 3. Topic × Brand × Sentiment ─────────────────────────────────────────
  renderBrandTopicSentiment(brandsSorted);
}

// ── Stacked sentiment bar ─────────────────────────────────────────────────────
function renderSentimentStacked(id, sentData, order) {
  const el=document.getElementById(id); el.innerHTML='';
  const leg=document.createElement('div'); leg.className='sent-legend';
  ['positive','neutral','negative'].forEach(s=>{
    const i=document.createElement('div'); i.className='sent-leg-item';
    i.innerHTML=`<span class="sent-leg-dot" style="background:${SENT_COLORS[s]}"></span>${s}`;
    leg.appendChild(i);
  });
  el.appendChild(leg);
  order.forEach(key=>{
    const d=sentData[key]||{positive:0,neutral:0,negative:0};
    const total=(d.positive||0)+(d.neutral||0)+(d.negative||0)||1;
    const pp=(d.positive/total*100).toFixed(1), np=(d.neutral/total*100).toFixed(1), negp=(d.negative/total*100).toFixed(1);
    const row=document.createElement('div'); row.className='stk-row';
    row.innerHTML=`
      <div class="stk-lbl" title="${key}">${key}</div>
      <div class="stk-track">
        <div class="stk-seg" style="width:0%;background:${SENT_COLORS.positive}" title="positive ${pp}% (${d.positive.toLocaleString()})"></div>
        <div class="stk-seg" style="width:0%;background:${SENT_COLORS.neutral}"  title="neutral ${np}% (${d.neutral.toLocaleString()})"></div>
        <div class="stk-seg" style="width:0%;background:${SENT_COLORS.negative}" title="negative ${negp}% (${d.negative.toLocaleString()})"></div>
      </div>
      <div class="stk-total">${total.toLocaleString()}</div>`;
    el.appendChild(row);
    requestAnimationFrame(()=>{
      const segs=row.querySelectorAll('.stk-seg');
      segs[0].style.width=pp+'%'; segs[1].style.width=np+'%'; segs[2].style.width=negp+'%';
    });
  });
}

// ── Brand sentiment donut charts ──────────────────────────────────────────────
function renderBrandDonuts(brandsSorted) {
  const el = document.getElementById('brand-donuts');
  el.innerHTML = '';

  brandsSorted.forEach(brand => {
    const row = reportData.sentRows.find(r => r.brand === brand);
    if (!row) return;

    const pos = row.positive || 0;
    const neu = row.neutral  || 0;
    const neg = row.negative || 0;
    const total = pos + neu + neg || 1;

    const segs = [
      { label:'Neutral',  val:neu, color:'#FFC145' },
      { label:'Positive', val:pos, color:'#1DC997' },
      { label:'Negative', val:neg, color:'#FF5050'  },
    ];

    // wrapper
    const wrap = document.createElement('div');
    wrap.className = 'brand-donut-wrap';

    // brand name
    const name = document.createElement('div');
    name.className = 'brand-donut-name';
    name.textContent = brand;
    wrap.appendChild(name);

    // canvas
    const SIZE = 130, STROKE = 22, R = (SIZE - STROKE) / 2;
    const canvasWrap = document.createElement('div');
    canvasWrap.className = 'brand-donut-canvas';
    canvasWrap.style.cssText = `width:${SIZE}px;height:${SIZE}px;position:relative;`;

    const canvas = document.createElement('canvas');
    canvas.width  = SIZE;
    canvas.height = SIZE;
    canvasWrap.appendChild(canvas);

    // total label in centre
    const centre = document.createElement('div');
    centre.style.cssText = `
      position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
      text-align:center; pointer-events:none;`;
    centre.innerHTML = `
      <div style="font-family:'Bricolage Grotesque',sans-serif;font-size:17px;font-weight:800;color:var(--text);line-height:1">${total.toLocaleString()}</div>
      <div style="font-family:'DM Mono',monospace;font-size:8px;color:var(--text3);margin-top:2px;letter-spacing:.5px">MENTIONS</div>`;
    canvasWrap.appendChild(centre);
    wrap.appendChild(canvasWrap);

    // legend
    const legend = document.createElement('div');
    legend.className = 'brand-donut-legend';
    segs.forEach(s => {
      const pct = (s.val / total * 100).toFixed(1);
      const row2 = document.createElement('div');
      row2.className = 'brand-donut-leg-row';
      row2.innerHTML = `
        <span class="brand-donut-leg-dot" style="background:${s.color}"></span>
        <span>${s.label}</span>
        <span class="brand-donut-leg-val">${s.val.toLocaleString()}</span>
        <span class="brand-donut-leg-pct">${pct}%</span>`;
      legend.appendChild(row2);
    });
    wrap.appendChild(legend);
    el.appendChild(wrap);

    // Draw donut after DOM is ready
    requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d');
      const cx = SIZE / 2, cy = SIZE / 2;
      let angle = -Math.PI / 2;

      // background ring
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.lineWidth = STROKE;
      ctx.stroke();

      segs.forEach(s => {
        if (!s.val) return;
        const sweep = (s.val / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R, angle, angle + sweep);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = STROKE;
        ctx.lineCap = 'butt';
        ctx.stroke();
        angle += sweep;
      });
    });
  });
}

// ── Topic sentiment brand filter pills ────────────────────────────────────────
function buildTopicSentBrandFilter(brandsSorted) {
  const c=document.getElementById('topic-sent-brand-filter'); c.innerHTML='';
  const makeP=(label,value)=>{
    const p=document.createElement('span');
    p.className='ts-brand-pill'+(value===activeTSBrand?' active':'');
    p.textContent=label;
    p.addEventListener('click',()=>{
      activeTSBrand=value;
      document.querySelectorAll('.ts-brand-pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      renderTopicSentBars();
    });
    return p;
  };
  c.appendChild(makeP('All brands','__all__'));
  brandsSorted.forEach(b=>c.appendChild(makeP(b,b)));
}

// ── Sentiment by Topic — horizontal stacked bar per topic ─────────────────────
function renderTopicSentBars() {
  const el=document.getElementById('sent-topic-bars'); el.innerHTML='';
  const buckets = activeTSBrand==='__all__'
    ? reportData.allTopicSent
    : (reportData.brandTopicSent[activeTSBrand]||{});

  const leg=document.createElement('div'); leg.className='sent-legend'; leg.style.marginBottom='14px';
  ['positive','neutral','negative'].forEach(s=>{
    const i=document.createElement('div'); i.className='sent-leg-item';
    i.innerHTML=`<span class="sent-leg-dot" style="background:${SENT_COLORS[s]}"></span>${s}`;
    leg.appendChild(i);
  });
  el.appendChild(leg);

  TOPIC_ORDER.forEach(topic=>{
    const d=buckets[topic]||{positive:0,neutral:0,negative:0};
    const pos=d.positive||0, neu=d.neutral||0, neg=d.negative||0;
    const total=pos+neu+neg||1;
    const pp=(pos/total*100).toFixed(1), np=(neu/total*100).toFixed(1), negp=(neg/total*100).toFixed(1);

    const wrap=document.createElement('div');
    wrap.style.cssText='display:flex;align-items:center;gap:10px;margin-bottom:11px;';

    const lbl=document.createElement('div');
    lbl.style.cssText='font-family:"DM Mono",monospace;font-size:11px;font-weight:700;color:var(--text);width:90px;flex-shrink:0;';
    lbl.textContent=topic;

    const track=document.createElement('div');
    track.style.cssText='flex:1;height:22px;display:flex;border-radius:5px;overflow:hidden;background:var(--border);';
    ['positive','neutral','negative'].forEach((s,i)=>{
      const seg=document.createElement('div');
      seg.style.cssText=`width:0%;height:100%;background:${SENT_COLORS[s]};transition:width 0.6s cubic-bezier(0.16,1,0.3,1);`;
      seg.title=`${s}: ${[pos,neu,neg][i].toLocaleString()} (${[pp,np,negp][i]}%)`;
      track.appendChild(seg);
      requestAnimationFrame(()=>{ seg.style.width=[pp,np,negp][i]+'%'; });
    });

    const vals=document.createElement('div');
    vals.style.cssText='display:flex;gap:10px;flex-shrink:0;';
    [[pos,'#1DC997'],[neu,'#FFC145'],[neg,'#FF5050']].forEach(([v,c])=>{
      const s=document.createElement('span');
      s.style.cssText=`font-family:"DM Mono",monospace;font-size:10px;color:${c};min-width:36px;text-align:right;`;
      s.textContent=v.toLocaleString();
      vals.appendChild(s);
    });

    wrap.appendChild(lbl); wrap.appendChild(track); wrap.appendChild(vals);
    el.appendChild(wrap);
  });
}

// ── Topic × Brand × Sentiment — vertical stacked bars ────────────────────────
function renderBrandTopicSentiment(brandsSorted) {
  const el=document.getElementById('brand-topic-sent-grid'); el.innerHTML='';

  const leg=document.createElement('div'); leg.className='sent-legend'; leg.style.marginBottom='18px';
  ['positive','neutral','negative'].forEach(s=>{
    const i=document.createElement('div'); i.className='sent-leg-item';
    i.innerHTML=`<span class="sent-leg-dot" style="background:${SENT_COLORS[s]}"></span>${s}`;
    leg.appendChild(i);
  });
  el.appendChild(leg);

  const headerRow=document.createElement('div');
  headerRow.style.cssText='display:grid;grid-template-columns:100px repeat(7,1fr);gap:4px 8px;margin-bottom:6px;';
  headerRow.innerHTML='<div></div>'+TOPIC_ORDER.map(t=>
    `<div style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text3);text-align:center;letter-spacing:.5px;">${t}</div>`
  ).join('');
  el.appendChild(headerRow);

  let gMax=0;
  brandsSorted.forEach(b=>{
    const bt=reportData.brandTopicSent[b]||{};
    TOPIC_ORDER.forEach(t=>{ const d=bt[t]||{}; gMax=Math.max(gMax,(d.positive||0)+(d.neutral||0)+(d.negative||0)); });
  });

  brandsSorted.forEach((brand,bi)=>{
    const bt=reportData.brandTopicSent[brand]||{};
    const row=document.createElement('div');
    row.style.cssText='display:grid;grid-template-columns:100px repeat(7,1fr);gap:4px 8px;margin-bottom:12px;align-items:end;';

    const brandTotal = TOPIC_ORDER.reduce((sum,t)=>{
      const d=bt[t]||{}; return sum+(d.positive||0)+(d.neutral||0)+(d.negative||0);
    }, 0);
    const blbl=document.createElement('div');
    blbl.style.cssText='display:flex;flex-direction:column;gap:3px;padding-bottom:4px;';
    blbl.innerHTML=`<span style="font-family:'DM Mono',monospace;font-size:11px;font-weight:700;color:var(--accent);">${brand}</span><span style="font-family:'DM Mono',monospace;font-size:10px;color:var(--text3);">Total: <strong style="color:var(--text)">${brandTotal.toLocaleString()}</strong></span>`;
    row.appendChild(blbl);

    TOPIC_ORDER.forEach(topic=>{
      const d=bt[topic]||{positive:0,neutral:0,negative:0};
      const pos=d.positive||0, neu=d.neutral||0, neg=d.negative||0;
      const rawTotal=pos+neu+neg;
      const total=rawTotal||1;
      const pp=(pos/total*100).toFixed(1), np=(neu/total*100).toFixed(1), negp=(neg/total*100).toFixed(1);

      const cell=document.createElement('div');
      cell.style.cssText='display:flex;flex-direction:column;align-items:center;gap:3px;';

      const barWrap=document.createElement('div');
      barWrap.style.cssText='width:100%;height:80px;display:flex;flex-direction:column-reverse;border-radius:4px;overflow:hidden;background:var(--border);';

      ['positive','neutral','negative'].forEach((s,i)=>{
        const pct=parseFloat([pp,np,negp][i]);
        const v=[pos,neu,neg][i];
        const seg=document.createElement('div');
        seg.style.cssText=`width:100%;height:0%;background:${SENT_COLORS[s]};transition:height 0.7s cubic-bezier(0.16,1,0.3,1);flex-shrink:0;display:flex;align-items:center;justify-content:center;overflow:hidden;`;
        seg.title=`${brand} · ${topic} · ${s}: ${v.toLocaleString()} (${pct}%)`;
        if (pct >= 12) {
          const lbl=document.createElement('span');
          lbl.style.cssText='font-family:"DM Mono",monospace;font-size:9px;font-weight:800;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,.3);pointer-events:none;white-space:nowrap;';
          lbl.textContent=pct+'%';
          seg.appendChild(lbl);
        }
        barWrap.appendChild(seg);
        requestAnimationFrame(()=>{ seg.style.height=pct+'%'; });
      });

      const tot=document.createElement('div');
      tot.style.cssText='font-family:"DM Mono",monospace;font-size:9px;font-weight:700;color:var(--text2);text-align:center;';
      tot.textContent=rawTotal>0?rawTotal.toLocaleString():'—';

      cell.appendChild(barWrap); cell.appendChild(tot);
      row.appendChild(cell);
    });

    el.appendChild(row);

    if (bi<brandsSorted.length-1) {
      const sep=document.createElement('div');
      sep.style.cssText='height:1px;background:var(--border);margin:2px 0 10px;';
      el.appendChild(sep);
    }
  });
}

