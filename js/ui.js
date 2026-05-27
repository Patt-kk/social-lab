// ── ui.js — Tabs, Toasts, Theme, Scroll, Keyboard Shortcuts, API Key Bar, Clipboard
// ── TOAST NOTIFICATIONS ───────────────────────────────────────────────────────
function showToast(msg, type='info', duration=3000) {
  const icons = { success:'✅', error:'❌', info:'ℹ️' };
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove(), { once:true });
  }, duration);
}

// ── THEME TOGGLE ──────────────────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem('mfg-theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('themeToggle').textContent = '☀️';
  } else {
    // Default is always light — explicitly remove any stale dark attribute
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('themeToggle').textContent = '🌙';
  }
})();

document.getElementById('themeToggle').addEventListener('click', () => {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    document.getElementById('themeToggle').textContent = '🌙';
    localStorage.setItem('mfg-theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('themeToggle').textContent = '☀️';
    localStorage.setItem('mfg-theme', 'dark');
  }
});

// ── SCROLL TO TOP ─────────────────────────────────────────────────────────────
const mainContent = document.querySelector('.main-content');
mainContent.addEventListener('scroll', () => {
  const btn = document.getElementById('scrollTopBtn');
  btn.classList.toggle('visible', mainContent.scrollTop > 300);
});
document.getElementById('scrollTopBtn').addEventListener('click', () => {
  mainContent.scrollTo({ top:0, behavior:'smooth' });
});

// ── KEYBOARD SHORTCUTS ────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  // Alt+D → toggle dark mode
  if (e.altKey && e.key === 'd') { document.getElementById('themeToggle').click(); return; }
  // Alt+1–7 → switch tabs
  if (e.altKey && !e.ctrlKey && !e.shiftKey) {
    const tabs = ['report','overview','brand','greview','campaign','charts','table'];
    const idx = parseInt(e.key) - 1;
    if (idx >= 0 && idx < tabs.length) {
      e.preventDefault();
      const btn = document.querySelector(`.tab-btn[data-tab="${tabs[idx]}"]`);
      if (btn) btn.click();
    }
  }
});

// ── PIPELINE OVERLAY HELPERS ───────────────────────────────────────────────────
const STEP_LABELS = [
  'Merging CSV files…',
  'Loading & parsing CSV…',
  'Cleaning & exploding data…',
  'Computing sentiment pivot…',
  'Calculating engagement & mentions…',
  'Combining tables…',
  'Sentiment by brand…',
  'Building export…',
];

function _showPipelineOverlay(stepIdx) {
  const overlay = document.getElementById('pipelineOverlay');
  overlay.classList.add('show');
  document.getElementById('pipelineOverlayStep').textContent = STEP_LABELS[stepIdx] || 'Processing…';
  document.getElementById('pipelineOverlayFill').style.width = ((stepIdx + 1) / 8 * 100).toFixed(0) + '%';
}
function _hidePipelineOverlay() {
  document.getElementById('pipelineOverlay').classList.remove('show');
}



// ── SIDEBAR STATS ─────────────────────────────────────────────────────────────
function updateSidebarStats() {
  document.getElementById('statRows').textContent=rawData.length.toLocaleString();
  const brands=new Set();
  rawData.forEach(r=>(r.Brands||'').replace(/[\[\]]/g,'').split(',').map(x=>x.trim()).filter(Boolean).forEach(b=>brands.add(b)));
  document.getElementById('statBrands').textContent=brands.size;
}

// ── TABS ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-'+btn.dataset.tab).classList.add('active');
    // Lazy-load full pandas rows on first visit to AI or Brand Deep-Dive tab
    if ((btn.dataset.tab === 'ai' || btn.dataset.tab === 'brand' || btn.dataset.tab === 'campaign') && rawData.length && !allRawData.length) {
      showToast('Loading full dataset for deep-dive…', 'info', 2000);
      _loadAllRawData();
    }
    if (btn.dataset.tab === 'campaign' && reportData.campaignMetrics) renderCampaignTab();

  });
});

// Lazily serialise the full dataset from Pyodide in small column-slices to
// avoid the MemoryError that occurs when to_json() is called on 60k+ wide rows.
let _allRawDataLoading = false;
async function _loadAllRawData() {
  if (_allRawDataLoading || allRawData.length) return;
  _allRawDataLoading = true;
  try {
    const _allRaw = await pyodide.runPythonAsync(`
import json as _json
_all_df2 = df.copy()
_all_df2 = _all_df2.where(_all_df2.notna(), other=None)
# Only keep columns useful to the UI to reduce payload size
_keep_cols = [c for c in ['id','source','Source','text','Text','sentiment','created_at','date',
    'engagement_score','view_count','comment_count','like_count','share_count','retweet_count','reply_count',
    'Brands','Topics','Campaign','campaign','Detail','detail','Category','category',
    'link','Link','url','URL','post_url','post_link','permalink','source_url',
    'title','Title','page','Page',
    'branch','Branch','location','Location'] if c in _all_df2.columns]
_all_df2 = _all_df2[_keep_cols] if _keep_cols else _all_df2
_all_df2.to_json(orient='records', force_ascii=False)
`);
    allRawData = JSON.parse(typeof _allRaw === 'string' ? _allRaw : _allRaw.toString());
    showToast(`Full dataset loaded (${allRawData.length.toLocaleString()} rows)`, 'info', 2500);
    // Refresh panels that use allRawData now that it's available
    if (document.querySelector('.tab-btn[data-tab="brand"]')?.classList.contains('active')) updateBrandDeepDive();
    if (document.querySelector('.tab-btn[data-tab="campaign"]')?.classList.contains('active')) renderCampaignTab();
  } catch(e) {
    console.warn('Lazy allRawData load failed, falling back to rawData:', e.toString());
    // Non-fatal: _aiPool() and bdd pool already fall back to rawData
  } finally {
    _allRawDataLoading = false;
  }
}


// ── AI SUMMARY ────────────────────────────────────────────────────────────────
let aiApiKey    = '';
let geminiApiKey = '';
let aiProvider  = 'gemini';  // 'gemini'

const AI_MODELS = {
  gemini: [
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite'},
    { value: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash'},
    { value: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro'},
  ],
};

// ── GLOBAL API KEY BAR ───────────────────────────────────────────────────────
function _applyGeminiKey(val) {
  if (!val) return;
  geminiApiKey = val;
  // Update saved badge in the global bar
  const badge = document.getElementById('globalKeyBadge');
  if (badge) badge.classList.add('visible');
  // Clear both inputs after saving
  const gi = document.getElementById('globalGeminiApiKey');
  if (gi) gi.value = '';
  showToast('Gemini API key saved — AI features enabled', 'success');
}

document.getElementById('globalGeminiSaveKey').addEventListener('click', () => {
  const val = document.getElementById('globalGeminiApiKey').value.trim();
  _applyGeminiKey(val);
});
document.getElementById('globalGeminiApiKey').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const val = e.target.value.trim();
    _applyGeminiKey(val);
  }
});

// Save Gemini key (legacy — element removed; kept as no-op guard)
document.getElementById('geminiSaveKey')?.addEventListener('click', () => {
  const val = document.getElementById('geminiApiKey')?.value.trim();
  _applyGeminiKey(val);
});

// ── CONVENIENCE POOL HELPER ───────────────────────────────────────────────────
function _aiPool() { return allRawData.length ? allRawData : rawData; }

// ── CLOSE MS DROPDOWNS ON OUTSIDE CLICK OR ESCAPE ────────────────────────────
document.addEventListener('click', e => {
  if (!e.target.closest('.ms-wrap')) {
    document.querySelectorAll('.ms-dropdown.open').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.ms-trigger.open').forEach(t => t.classList.remove('open'));
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.ms-dropdown.open').forEach(d => d.classList.remove('open'));
    document.querySelectorAll('.ms-trigger.open').forEach(t => t.classList.remove('open'));
  }
});

// ── COPY TABLE TO CLIPBOARD ──────────────────────────────────────────────────
function copyTableToClipboard(tbodyId, btnId) {
  const tbody = document.getElementById(tbodyId);
  const btn = document.getElementById(btnId);
  if (!tbody) return;

  const isTopicTable = tbodyId === 'topicTableBody';

  // Get headers from the parent table's thead (keep blank spacer column as empty string)
  const table = tbody.closest('table');
  const headers = [...table.querySelectorAll('thead th')]
    .map(th => th.textContent.trim());

  const tsvRows = [headers.join('\t')];

  [...tbody.querySelectorAll('tr')].forEach(tr => {
    if (tr.classList.contains('blank-row')) {
      // For the topic table: include the blank row as an empty line
      if (isTopicTable) tsvRows.push('');
      return;
    }
    const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
    tsvRows.push(cells.join('\t'));
  });

  const finalText = tsvRows.join('\n');

  navigator.clipboard.writeText(finalText).then(() => {
    btn.textContent = '✔ Copied!';
    btn.classList.add('copied');
    showToast('Table copied to clipboard!', 'success');
    setTimeout(() => { btn.textContent = '⎘ Copy'; btn.classList.remove('copied'); }, 2000);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = finalText;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent = '✔ Copied!';
    btn.classList.add('copied');
    showToast('Table copied to clipboard!', 'success');
    setTimeout(() => { btn.textContent = '⎘ Copy'; btn.classList.remove('copied'); }, 2000);
  });
}

