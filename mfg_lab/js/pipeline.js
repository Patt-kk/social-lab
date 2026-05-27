// ── pipeline.js — State, Pyodide, File Upload, Data Pipeline, Report Rendering
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  mfg_lab_campaign_select_v15.html — Inline Script Index                │
// │                                                                         │
// │  External:  prompts.js  — AI prompt builders, Gemini runner,           │
// │                            renderAiMarkdown, escapeHtml                 │
// │                                                                         │
// │  Sections (search by marker):                                           │
// │  ── STATE                Pipeline state variables & constants           │
// │  ── TOAST NOTIFICATIONS  showToast()                                    │
// │  ── THEME TOGGLE         Dark / light mode                              │
// │  ── SCROLL TO TOP        Scroll button wiring                           │
// │  ── KEYBOARD SHORTCUTS   Alt+1–7, Alt+D, /                             │
// │  ── PIPELINE OVERLAY     _showPipelineOverlay helpers                   │
// │  ── PYODIDE              initPyodide, Python runtime                    │
// │  ── FILE UPLOAD          registerFile, setupUploadZone                  │
// │  ── MAIN PIPELINE        triggerPipeline, setStep                       │
// │  ── RENDER REPORT        Statistical Data tab                           │
// │  ── CAMPAIGN TAB         _buildCampCards, renderCampaignTab             │
// │  ── OVERVIEW TAB         renderOverview                                 │
// │  ── SIDEBAR STATS        Sidebar date / KPIs                            │
// │  ── BRAND FILTER         activeBrands, applyFilters                     │
// │  ── CHARTS               Sentiment charts, donuts, stacked bars         │
// │  ── TABLE                renderTable, pagination, export                │
// │  ── GOOGLE REVIEW MODULE updateGooglePanel and sub-modules              │
// │  ── TABS                 Tab switching, lazy load                       │
// │  ── AI SUMMARY           Global AI Summary (unused / future)            │
// │  ── GLOBAL API KEY BAR   Gemini key save                                │
// │  ── COPY TABLE           copyTableToClipboard, copyOvTable              │
// │  ── BRAND DEEP-DIVE      updateBrandDeepDive, BDD AI                   │
// │  ── CAMPAIGN AI          Campaign AI state, filters, run button         │
// └─────────────────────────────────────────────────────────────────────────┘

let pyodide = null;
let rawData = [], filteredData = [];
let grRawData = [];   // Google Review rows parsed by pandas — preserves embedded newlines
let allRawData = [];  // All rows parsed by pandas — used by AI Summary
let activeBrands = new Set();
let currentPage = 1;
const PAGE_SIZE = 50;
const DISPLAY_COLS = ['source','created_at','Brands','Topics','Campaign','sentiment','text','link'];
const LINK_FIELDS  = ['link','Link','url','URL','post_url','post_link','permalink','source_url'];
let reportData = { topicRows:[], sentRows:[], totalMention:0, totalEngagement:0, csvBlob:null };
let csvFile1 = null, csvFile2 = null;  // store both uploaded files

// ── PYODIDE ───────────────────────────────────────────────────────────────────
async function initPyodide() {
  setStatus('loading','Loading Python…');
  document.getElementById('loadProgress').textContent = 'Loading Pyodide…';
  pyodide = await loadPyodide();
  document.getElementById('loadProgress').textContent = 'Installing pandas & numpy…';
  await pyodide.loadPackage(['pandas','numpy']);
  setStatus('ready','Python ready');
  setTimeout(() => document.getElementById('loadingScreen').classList.add('done'), 400);
}
function setStatus(s,t) {
  document.getElementById('statusPill').className='status-chip '+s;
  document.getElementById('statusText').textContent=t;
}
function setStep(id, state) {
  const el=document.getElementById(id), icons={done:'✔',running:'…',error:'✖'};
  el.className='step '+(state||'');
  const _num=id.replace('step',''); el.querySelector('.step-icon').textContent=icons[state]||_num;
  // Update pipeline overlay progress
  if (state === 'running') {
    const stepIdx = parseInt(_num);
    _showPipelineOverlay(stepIdx);
  }
  if (state === 'done' && _num === '7') {
    _hidePipelineOverlay();
  }
  if (state === 'error') {
    _hidePipelineOverlay();
  }
}

// ── FILE UPLOAD ───────────────────────────────────────────────────────────────
function setupUploadZone(zoneId, inputId, slot) {
  const uz = document.getElementById(zoneId);
  document.getElementById(inputId).addEventListener('change', e => {
    if (e.target.files[0]) registerFile(e.target.files[0], slot);
  });
  uz.addEventListener('dragover', e => { e.preventDefault(); uz.classList.add('drag-over','drag-active'); });
  uz.addEventListener('dragleave', () => uz.classList.remove('drag-over','drag-active'));
  uz.addEventListener('drop', e => {
    e.preventDefault(); uz.classList.remove('drag-over','drag-active');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (!f.name.endsWith('.csv')) {
      showToast('Only CSV files are supported', 'error');
      return;
    }
    registerFile(f, slot);
  });
}
setupUploadZone('uploadZone',  'fileInput',  1);
setupUploadZone('uploadZone2', 'fileInput2', 2);

function registerFile(file, slot) {
  if (slot === 1) {
    csvFile1 = file;
    document.getElementById('fileBadge').textContent = `✔ ${file.name}\n${(file.size/1024).toFixed(0)} KB`;
    document.getElementById('fileBadge').classList.add('show');
    document.getElementById('uploadZone2').style.opacity = '1';
    document.getElementById('clearFile1').classList.add('show');
    showToast(`File 1 loaded: ${file.name}`, 'success');
  } else {
    csvFile2 = file;
    document.getElementById('fileBadge2').textContent = `✔ ${file.name}\n${(file.size/1024).toFixed(0)} KB`;
    document.getElementById('fileBadge2').classList.add('show');
    document.getElementById('uploadZone2').classList.add('has-file');
    document.getElementById('clearFile2').classList.add('show');
    showToast(`File 2 loaded: ${file.name} — merging…`, 'info');
  }
  // Auto-run pipeline whenever at least file 1 is present
  if (csvFile1) triggerPipeline();
}

// ── FILE CLEAR HANDLERS ───────────────────────────────────────────────────────
document.getElementById('clearFile1').addEventListener('click', () => {
  csvFile1 = null;
  document.getElementById('fileBadge').textContent = '';
  document.getElementById('fileBadge').classList.remove('show');
  document.getElementById('fileInput').value = '';
  document.getElementById('clearFile1').classList.remove('show');
  document.getElementById('uploadZone2').style.opacity = '0.55';
  // Also clear file 2 if present since file 1 is required
  if (csvFile2) document.getElementById('clearFile2').click();
  showToast('File 1 removed', 'info');
});
document.getElementById('clearFile2').addEventListener('click', () => {
  csvFile2 = null;
  document.getElementById('fileBadge2').textContent = '';
  document.getElementById('fileBadge2').classList.remove('show');
  document.getElementById('fileInput2').value = '';
  document.getElementById('clearFile2').classList.remove('show');
  document.getElementById('uploadZone2').classList.remove('has-file');
  showToast('File 2 removed', 'info');
});

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = ev => resolve(ev.target.result);
    r.onerror = reject;
    r.readAsText(file);
  });
}

async function triggerPipeline() {
  setStatus('loading','Parsing CSV…');
  ['step0','step1','step2','step3','step4','step5','step6','step7'].forEach(s=>setStep(s,''));
  activeBrands = new Set();

  setStep('step0','running');
  let text1 = await readFileAsText(csvFile1);
  let mergedText = text1;

  if (csvFile2) {
    let text2 = await readFileAsText(csvFile2);
    // Strip BOM from both
    text1 = text1.replace(/^\uFEFF/, '');
    text2 = text2.replace(/^\uFEFF/, '');
    // Keep header from file1 only; append body rows of file2
    const lines2 = text2.split('\n');
    const body2 = lines2.slice(1).filter(l => l.trim()).join('\n');
    mergedText = text1.trimEnd() + '\n' + body2;
    document.getElementById('fileBadge2').textContent =
      document.getElementById('fileBadge2').textContent.replace('✔','🔗');
  }
  setStep('step0','done');

  rawData = parseCSV(mergedText);
  const totalLabel = csvFile2
    ? `${rawData.length.toLocaleString()} rows (2 files merged)`
    : `${rawData.length.toLocaleString()} rows`;
  document.getElementById('fileBadge').textContent =
    `✔ ${csvFile1.name}\n${totalLabel}`;

  setStep('step1','running');
  await pushDFtoPyodide(mergedText);
  setStep('step1','done');

  await runMainPipeline();
  updateSidebarStats(); buildBrandFilter(); buildColToggles();
  filteredData=[...rawData]; renderCharts(); renderTable(); updateGooglePanel(); updateBrandDeepDive(); renderOverview();
  setStatus('ready', totalLabel);
  _hidePipelineOverlay();
  showToast(`✅ Pipeline complete — ${totalLabel}`, 'success', 4000);
}

function parseCSV(text) {
  const lines=text.split('\n'), headers=parseLine(lines[0]), rows=[];
  for(let i=1;i<lines.length;i++){
    if(!lines[i].trim()) continue;
    const vals=parseLine(lines[i]);
    if(vals.length<headers.length/2) continue;
    const row={}; headers.forEach((h,idx)=>{ row[h.replace(/^\uFEFF/,'')]=vals[idx]||''; }); rows.push(row);
  }
  return rows;
}
function parseLine(line) {
  const r=[]; let cur='',inQ=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){inQ=!inQ;continue;}
    if(c===','&&!inQ){r.push(cur);cur='';continue;}
    cur+=c;
  }
  r.push(cur);
  return r.map(s=>s.replace(/^\uFEFF/,'').trim());
}

async function pushDFtoPyodide(csvText) {
  pyodide.globals.set('_csv_data', csvText);
  await pyodide.runPythonAsync(`
import pandas as pd, numpy as np, io, json
from datetime import date

df = pd.read_csv(io.StringIO(_csv_data), low_memory=False)
df.columns = [c.lstrip('\\ufeff') for c in df.columns]
# Normalise common column name variants (case differences between files)
if 'Source' in df.columns and 'source' not in df.columns:
    df = df.rename(columns={'Source': 'source'})
if 'view_count' not in df.columns:
    df['view_count'] = 0
final_sw_data = pd.DataFrame()
`);
}

// ── MAIN PIPELINE ─────────────────────────────────────────────────────────────
async function runMainPipeline() {
  setStatus('loading','Running pipeline…');
  // step0 (merge) already handled by triggerPipeline before this is called

  const pipeline = [
    // ── STEP 2: strip outer brackets → split → explode Topics then Brands ─────
    // e.g. "[amazon, starbucks]" → strip → "amazon, starbucks" → split → explode
    ['step2', `
def clean_and_split(val):
    s = str(val).strip()
    if s.startswith('[') and s.endswith(']'):
        s = s[1:-1]
    return [x.strip() for x in s.split(',') if x.strip()]

mfg = df.copy()
mfg['_topics_list']   = mfg['Topics'].apply(clean_and_split)
mfg['_brands_list']   = mfg['Brands'].apply(clean_and_split)
if 'Campaign' in mfg.columns:
    mfg['_campaign_list'] = mfg['Campaign'].apply(clean_and_split)
else:
    mfg['_campaign_list'] = [['(no campaign)']] * len(mfg)

# Explode Topics → Brands → Campaign — each row becomes one Brand + one Topic + one Campaign
mfg['Topics'] = mfg['_topics_list']
filtered_mfg_exploded = mfg.explode('Topics').copy()

filtered_mfg_exploded['Brands'] = filtered_mfg_exploded['_brands_list']
filtered_mfg_exploded_2 = filtered_mfg_exploded.explode('Brands').copy()

filtered_mfg_exploded_2['Campaign'] = filtered_mfg_exploded_2['_campaign_list']
filtered_mfg_exploded_final = filtered_mfg_exploded_2.explode('Campaign').copy()

filtered_mfg_exploded_final['Brands']   = filtered_mfg_exploded_final['Brands'].astype(str).str.strip()
filtered_mfg_exploded_final['Topics']   = filtered_mfg_exploded_final['Topics'].astype(str).str.strip()
filtered_mfg_exploded_final['Campaign'] = filtered_mfg_exploded_final['Campaign'].astype(str).str.strip()
filtered_mfg_exploded_final['engagement_score'] = pd.to_numeric(filtered_mfg_exploded_final['engagement_score'], errors='coerce').fillna(0)

print("Exploded shape:", filtered_mfg_exploded_final.shape)
print("Unique Brands:",    sorted(filtered_mfg_exploded_final['Brands'].unique()))
print("Unique Topics:",    sorted(filtered_mfg_exploded_final['Topics'].unique()))
print("Unique Campaigns:", sorted(filtered_mfg_exploded_final['Campaign'].unique()))
`],

    // ── STEP 3: sentiment count pivot — sum per Brand+Topic+sentiment ─────────
    ['step3', `
desired_order = ['product', 'promotion', 'price', 'branding', 'service', 'activity', 'others']

# Count unique IDs per Brand × Topic × sentiment (on exploded df)
topic_brand_sentiment_counts = (
    filtered_mfg_exploded_final
    .groupby(['Brands', 'Topics', 'sentiment'])['id']
    .nunique()
)
topic_sentiment_pivot = topic_brand_sentiment_counts.unstack(fill_value=0)

# Build a complete MultiIndex: every brand × every topic in desired_order
# Brand order here doesn't matter — step 5 will sort by engagement rank
all_brands_step3 = filtered_mfg_exploded_final['Brands'].unique().tolist()
full_index_step3 = pd.MultiIndex.from_product([all_brands_step3, desired_order], names=['Brands', 'Topics'])
topic_sentiment_pivot = topic_sentiment_pivot.reindex(full_index_step3, fill_value=0)

# Ensure all three sentiment columns exist
for col in ['negative', 'neutral', 'positive']:
    if col not in topic_sentiment_pivot.columns:
        topic_sentiment_pivot[col] = 0
topic_sentiment_pivot = topic_sentiment_pivot[['negative', 'neutral', 'positive']]
`],

    // ── STEP 4: sum engagement + count unique mention per Brand+Topic ─────────
    ['step4', `
desired_order = ['product', 'promotion', 'price', 'branding', 'service', 'activity', 'others']

engagement_mention_by_topic_brand = (
    filtered_mfg_exploded_final
    .groupby(['Brands', 'Topics'])
    .agg(
        engagement=('engagement_score', 'sum'),   # sum engagement across exploded rows
        mention=('id', 'nunique')                  # unique post IDs
    )
)

# Sort brands alphabetically (A → Z)
sorted_brands = sorted(engagement_mention_by_topic_brand.index.get_level_values('Brands').unique())

# Build a complete MultiIndex: every brand × every topic in desired_order (sorted by engagement)
full_index = pd.MultiIndex.from_product([sorted_brands, desired_order], names=['Brands', 'Topics'])
engagement_mention_by_topic_brand = engagement_mention_by_topic_brand.reindex(full_index, fill_value=0)
`],

    // ── STEP 5: combine pivot + engagement table, insert blank separator rows ──
    ['step5', `
# Align topic_sentiment_pivot to the same sorted index as engagement_mention_by_topic_brand
topic_sentiment_pivot = topic_sentiment_pivot.reindex(engagement_mention_by_topic_brand.index, fill_value=0)
blank_column = pd.DataFrame(np.nan, index=engagement_mention_by_topic_brand.index, columns=[''])
combined_data = pd.concat([topic_sentiment_pivot, blank_column, engagement_mention_by_topic_brand], axis=1)

# Use engagement-sorted brand order from step 4
combined_data_list = []
for brand in sorted_brands:
    if brand not in combined_data.index.get_level_values('Brands'):
        continue
    brand_df = combined_data.xs(brand, level='Brands')
    brand_df.index = pd.MultiIndex.from_tuples(
        [(brand, t) for t in brand_df.index], names=combined_data.index.names
    )
    combined_data_list.append(brand_df)
    blank_row_df = pd.DataFrame(
        np.nan,
        index=pd.MultiIndex.from_tuples([('', '')], names=combined_data.index.names),
        columns=combined_data.columns
    )
    combined_data_list.append(blank_row_df)

combined_data_with_blanks = pd.concat(combined_data_list[:-1]).reset_index()

# Suppress repeated brand name — only show it on first topic row
combined_data_with_blanks.loc[combined_data_with_blanks['Brands'].duplicated(), 'Brands'] = ''

# Convert numeric cols to int, blank rows stay blank
for col in ['negative', 'neutral', 'positive', 'engagement', 'mention']:
    if col in combined_data_with_blanks.columns:
        combined_data_with_blanks[col] = combined_data_with_blanks[col].apply(
            lambda x: int(round(x)) if pd.notna(x) and str(x) not in ['', 'nan'] else ''
        )

combined_data_with_blanks = combined_data_with_blanks.reset_index(drop=True)
`],

    // ── STEP 6: sentiment by brand (on brand-only explode, not Brand×Topic) ─────
    ['step6', `
combined_data_with_blanks[" "] = ""   # spacer column

# Build a brand-only exploded df from the raw df so sentiment counts are
# NOT multiplied by the number of topics (which the double-exploded
# filtered_mfg_exploded_final would do).
def _cs6(val):
    s = str(val).strip()
    if s.startswith('[') and s.endswith(']'): s = s[1:-1]
    return [x.strip() for x in s.split(',') if x.strip()]

_s6 = df.copy()
_s6['_bl'] = _s6['Brands'].apply(_cs6)
_s6 = _s6.explode('_bl')
_s6 = _s6[_s6['_bl'].notna() & (_s6['_bl'] != '')]

# Unique mention count per Brand × sentiment
sentiment_counts_by_brand = (
    _s6
    .groupby(['_bl', 'sentiment'])['id']
    .nunique()
    .unstack(fill_value=0)
    .reset_index()
    .rename(columns={'_bl': 'Brands'})
)

# Ensure all sentiment columns exist
for col in ['negative', 'neutral', 'positive']:
    if col not in sentiment_counts_by_brand.columns:
        sentiment_counts_by_brand[col] = 0

# Pad missing columns so it aligns with combined_data_with_blanks for CSV export
for col in combined_data_with_blanks.columns:
    if col not in sentiment_counts_by_brand.columns:
        sentiment_counts_by_brand[col] = ""
sentiment_counts_by_brand = sentiment_counts_by_brand[combined_data_with_blanks.columns]
`],

    // ── STEP 7: assemble final_sw_data + JSON for UI ──────────────────────────
    ['step7', `
title_row_2 = pd.DataFrame({col: "" for col in combined_data_with_blanks.columns}, index=[0])
title_row_2.iloc[0, 0] = "Sentiment by Mention"

section2_header = pd.DataFrame({col: "" for col in combined_data_with_blanks.columns}, index=[0])
section2_header.iloc[0, 0] = "Brand"
for sname in ['negative', 'neutral', 'positive']:
    if sname in combined_data_with_blanks.columns:
        section2_header.iloc[0, combined_data_with_blanks.columns.get_loc(sname)] = sname

blank_sep = pd.DataFrame({col: "" for col in combined_data_with_blanks.columns}, index=[0])

final_sw_data = pd.concat([
    combined_data_with_blanks,
    blank_sep,
    title_row_2,
    section2_header,
    sentiment_counts_by_brand,
], ignore_index=True)

# ── Summary stats (from raw df, before explode) ───────────────────────────────
total_mention_val = int(df['id'].nunique())
total_eng_val     = float(pd.to_numeric(df['engagement_score'], errors='coerce').sum())

# ── Build topic rows for Report UI ───────────────────────────────────────────
_topic_rows = []
for _, row in combined_data_with_blanks.iterrows():
    b = str(row.get('Brands', ''))
    t = str(row.get('Topics', ''))
    if b == '' and t == '':
        _topic_rows.append({'brand':'__blank__','topic':'','negative':'','neutral':'','positive':'','engagement':'','mention':''})
        continue
    _topic_rows.append({
        'brand':      b,
        'topic':      t,
        'negative':   row.get('negative', ''),
        'neutral':    row.get('neutral',  ''),
        'positive':   row.get('positive', ''),
        'engagement': row.get('engagement',''),
        'mention':    row.get('mention',  ''),
    })

# ── Build sentiment rows for Report UI ───────────────────────────────────────
_sent_rows = []
for _, row in sentiment_counts_by_brand.iterrows():
    b = str(row.get('Brands', ''))
    if not b or b in ('', 'nan'): continue
    def _i(v):
        try: return int(v)
        except: return 0
    neg = _i(row.get('negative', 0))
    neu = _i(row.get('neutral',  0))
    pos = _i(row.get('positive', 0))
    _sent_rows.append({'brand':b,'negative':neg,'neutral':neu,'positive':pos,'total':neg+neu+pos})

# ── Per-brand and per-topic metrics (engagement, mention, view) ───────────────
# IMPORTANT: must use single-axis explodes from the RAW df (not filtered_mfg_exploded_final)
# so that each post's engagement_score is counted once per brand / once per topic,
# not once per (brand × topic) combination which would inflate numbers.

def _clean_split(val):
    s = str(val).strip()
    if s.startswith('[') and s.endswith(']'): s = s[1:-1]
    return [x.strip() for x in s.split(',') if x.strip()]

# --- Brand-axis explode ---
_df_brands = df.copy()
_df_brands['engagement_score'] = pd.to_numeric(_df_brands['engagement_score'], errors='coerce').fillna(0)
if 'view_count' not in _df_brands.columns: _df_brands['view_count'] = 0
_df_brands['view_count'] = pd.to_numeric(_df_brands['view_count'], errors='coerce').fillna(0)
_df_brands['_bl'] = _df_brands['Brands'].apply(_clean_split)
_df_brands_exploded = _df_brands.explode('_bl')
_df_brands_exploded = _df_brands_exploded[_df_brands_exploded['_bl'].notna() & (_df_brands_exploded['_bl'] != '')]
eng_by_brand  = _df_brands_exploded.groupby('_bl')['engagement_score'].sum().to_dict()
men_by_brand  = _df_brands_exploded.groupby('_bl')['id'].nunique().to_dict()
view_by_brand = _df_brands_exploded.groupby('_bl')['view_count'].sum().to_dict()

# --- Topic-axis explode ---
_df_topics = df.copy()
_df_topics['engagement_score'] = pd.to_numeric(_df_topics['engagement_score'], errors='coerce').fillna(0)
if 'view_count' not in _df_topics.columns: _df_topics['view_count'] = 0
_df_topics['view_count'] = pd.to_numeric(_df_topics['view_count'], errors='coerce').fillna(0)
_df_topics['_tl'] = _df_topics['Topics'].apply(_clean_split)
_df_topics_exploded = _df_topics.explode('_tl')
_df_topics_exploded = _df_topics_exploded[_df_topics_exploded['_tl'].notna() & (_df_topics_exploded['_tl'] != '')]
eng_by_topic  = _df_topics_exploded.groupby('_tl')['engagement_score'].sum().to_dict()
men_by_topic  = _df_topics_exploded.groupby('_tl')['id'].nunique().to_dict()
view_by_topic = _df_topics_exploded.groupby('_tl')['view_count'].sum().to_dict()

# --- Campaign-axis explode ---
_df_campaigns = df.copy()
_df_campaigns['engagement_score'] = pd.to_numeric(_df_campaigns['engagement_score'], errors='coerce').fillna(0)
if 'view_count' not in _df_campaigns.columns: _df_campaigns['view_count'] = 0
_df_campaigns['view_count'] = pd.to_numeric(_df_campaigns['view_count'], errors='coerce').fillna(0)
if 'Campaign' in _df_campaigns.columns:
    _df_campaigns['_cl'] = _df_campaigns['Campaign'].apply(_clean_split)
else:
    _df_campaigns['_cl'] = [['(no campaign)']] * len(_df_campaigns)
_df_campaigns_exploded = _df_campaigns.explode('_cl')
_df_campaigns_exploded = _df_campaigns_exploded[_df_campaigns_exploded['_cl'].notna() & (_df_campaigns_exploded['_cl'] != '')]
eng_by_campaign  = _df_campaigns_exploded.groupby('_cl')['engagement_score'].sum().to_dict()
men_by_campaign  = _df_campaigns_exploded.groupby('_cl')['id'].nunique().to_dict()
view_by_campaign = _df_campaigns_exploded.groupby('_cl')['view_count'].sum().to_dict()

# --- Source metrics (source is not exploded, one value per row) ---
view_by_source = df.groupby('source')['view_count'].sum().to_dict() if 'source' in df.columns and 'view_count' in df.columns else {}
eng_by_source  = df.groupby('source')['engagement_score'].sum().to_dict() if 'source' in df.columns else {}
men_by_source  = df.groupby('source')['id'].nunique().to_dict() if 'source' in df.columns else {}

# ── Brand × Topic sentiment (for stacked sentiment chart) ─────────────────────
_desired_topics = ['product', 'promotion', 'price', 'branding', 'service', 'activity', 'others']
_brand_topic_sent = {}
_bt_sent = filtered_mfg_exploded_final.groupby(['Brands','Topics','sentiment'])['id'].nunique()
for (b,t,s), v in _bt_sent.items():
    if b not in _brand_topic_sent: _brand_topic_sent[b] = {}
    if t not in _brand_topic_sent[b]: _brand_topic_sent[b][t] = {'positive':0,'neutral':0,'negative':0}
    _brand_topic_sent[b][t][s] = int(v)
# Fill missing topics with zeros for each brand
for b in _brand_topic_sent:
    for t in _desired_topics:
        if t not in _brand_topic_sent[b]:
            _brand_topic_sent[b][t] = {'positive':0,'neutral':0,'negative':0}

# ── All-brand aggregated topic sentiment ──────────────────────────────────────
_all_topic_sent = {}
_at_sent = filtered_mfg_exploded_final.groupby(['Topics','sentiment'])['id'].nunique()
for (t,s), v in _at_sent.items():
    if t not in _all_topic_sent: _all_topic_sent[t] = {'positive':0,'neutral':0,'negative':0}
    _all_topic_sent[t][s] = int(v)

# ── Brand × Channel (source) engagement & mention ─────────────────────────────
# Uses brand-only exploded df so each post counted once per brand per source
_bc_eng  = _df_brands_exploded.groupby(['_bl', 'source'])['engagement_score'].sum() if 'source' in _df_brands_exploded.columns else {}
_bc_men  = _df_brands_exploded.groupby(['_bl', 'source'])['id'].nunique() if 'source' in _df_brands_exploded.columns else {}
_bc_view = _df_brands_exploded.groupby(['_bl', 'source'])['view_count'].sum() if 'source' in _df_brands_exploded.columns and 'view_count' in _df_brands_exploded.columns else {}
_brand_channel_eng  = {}
_brand_channel_men  = {}
_brand_channel_view = {}
for (b, s), v in (_bc_eng.items() if hasattr(_bc_eng, 'items') else []):
    if b not in _brand_channel_eng: _brand_channel_eng[b] = {}
    _brand_channel_eng[b][str(s)] = float(v)
for (b, s), v in (_bc_men.items() if hasattr(_bc_men, 'items') else []):
    if b not in _brand_channel_men: _brand_channel_men[b] = {}
    _brand_channel_men[b][str(s)] = int(v)
for (b, s), v in (_bc_view.items() if hasattr(_bc_view, 'items') else []):
    if b not in _brand_channel_view: _brand_channel_view[b] = {}
    _brand_channel_view[b][str(s)] = float(v)

_js_payload = json.dumps({
    'totalMention':    total_mention_val,
    'totalEngagement': total_eng_val,
    'topicRows':       _topic_rows,
    'sentRows':        _sent_rows,
    'metrics': {
        'engagement': {'brand': {k:float(v) for k,v in eng_by_brand.items()},
                       'topic': {k:float(v) for k,v in eng_by_topic.items()},
                       'campaign': {k:float(v) for k,v in eng_by_campaign.items()},
                       'source':{k:float(v) for k,v in eng_by_source.items()}},
        'mention':    {'brand': {k:int(v)   for k,v in men_by_brand.items()},
                       'topic': {k:int(v)   for k,v in men_by_topic.items()},
                       'campaign': {k:int(v) for k,v in men_by_campaign.items()},
                       'source':{k:int(v)   for k,v in men_by_source.items()}},
        'view':       {'brand': {k:float(v) for k,v in view_by_brand.items()},
                       'topic': {k:float(v) for k,v in view_by_topic.items()},
                       'campaign': {k:float(v) for k,v in view_by_campaign.items()},
                       'source':{k:float(v) for k,v in view_by_source.items()}},
    },
    'brandTopicSent': _brand_topic_sent,   # {brand: {topic: {pos,neu,neg}}}
    'allTopicSent':   _all_topic_sent,     # {topic: {pos,neu,neg}}
    'brandChannelEng': _brand_channel_eng, # {brand: {rawSource: eng}}
    'brandChannelMen': _brand_channel_men, # {brand: {rawSource: men}}
    'brandChannelView': _brand_channel_view, # {brand: {rawSource: view}}
})

# ── Google Reviews: export directly from pandas (avoids JS parseCSV
#    dropping rows that contain embedded newlines in the text field) ──────────
_gr_mask = df['source'].astype(str).str.lower().str.contains('googlereviews', na=False) if 'source' in df.columns else pd.Series([False]*len(df))
_gr_df = df[_gr_mask].copy()
# Only keep columns the GR panel actually uses — avoids serialising unused wide columns
_gr_keep = [c for c in ['id','source','text','sentiment','created_at','date','engagement_score',
                         'view_count','comment_count','like_count','share_count','retweet_count','reply_count',
                         'Brands','Topics','Campaign','campaign','Detail','detail','Category','category',
                         'link','Link','url','URL','post_url','post_link','permalink','source_url',
                         'title','Title','page','Page',
                         'branch','Branch','location','Location'] if c in _gr_df.columns]
_gr_df = _gr_df[_gr_keep] if _gr_keep else _gr_df
# Serialise NaN as None → null in JSON so JS doesn't see "nan" strings
_gr_df = _gr_df.where(_gr_df.notna(), other=None)
_gr_rows_payload = _gr_df.to_json(orient='records', force_ascii=False)

# ── All rows payload is built lazily (on AI tab open) to avoid MemoryError
#    on large datasets. Set a sentinel so JS knows to fetch it on demand. ──────
_all_rows_payload = '__LAZY__'
`],
  ];

  for (const [stepId, code] of pipeline) {
    setStep(stepId,'running');
    try {
      await pyodide.runPythonAsync(code);
      setStep(stepId,'done');
    } catch(e) {
      setStep(stepId,'error');
      setStatus('error','Pipeline error — check console');
      console.error(`Pipeline error at ${stepId}:`, e.toString());
      showToast(`Pipeline error at ${stepId} — check console`, 'error', 6000);
      return;
    }
  }

  // Pull results back to JS
  const _raw=pyodide.globals.get('_js_payload'); const payload=JSON.parse(typeof _raw==='string'?_raw:_raw.toString());
  reportData = {
    topicRows:        payload.topicRows,
    sentRows:         payload.sentRows,
    totalMention:     payload.totalMention,
    totalEngagement:  payload.totalEngagement,
    metrics:          payload.metrics,
    brandTopicSent:   payload.brandTopicSent,
    allTopicSent:     payload.allTopicSent,
    brandChannelEng:  payload.brandChannelEng  || {},
    brandChannelMen:  payload.brandChannelMen  || {},
    brandChannelView: payload.brandChannelView || {},
    campaignMetrics: {
      engagement: payload.metrics?.engagement?.campaign || {},
      mention:    payload.metrics?.mention?.campaign    || {},
      view:       payload.metrics?.view?.campaign       || {},
    },
    csvBlob:          null,
  };

  // Pull Google Review rows parsed by pandas (preserves rows with embedded newlines)
  const _grRaw = pyodide.globals.get('_gr_rows_payload');
  grRawData = JSON.parse(typeof _grRaw === 'string' ? _grRaw : _grRaw.toString());

  // allRawData is loaded lazily on first AI/BDD access to avoid MemoryError on large datasets
  allRawData = [];

  // Build CSV download blob
  const csvStr = await pyodide.runPythonAsync(`
import io as _io
_buf = _io.StringIO()
final_sw_data.to_csv(_buf, index=False, encoding='utf-8')
_buf.getvalue()
`);
  const csvStr2=typeof csvStr==='string'?csvStr:csvStr.toString(); reportData.csvBlob = new Blob(['\uFEFF'+csvStr2], {type:'text/csv;charset=utf-8'});

  renderReport();
}

// ── RENDER REPORT ─────────────────────────────────────────────────────────────
function renderReport() {
  document.getElementById('reportEmpty').style.display='none';
  document.getElementById('reportContent').style.display='';

  // Pre-render campaign tab data (non-blocking, uses metrics already in reportData)
  if (reportData.campaignMetrics) renderCampaignTab();

  const today=new Date();
  today.setMonth(today.getMonth() - 1);
  document.getElementById('reportDateLabel').textContent=
    today.toLocaleString('default',{month:'long',year:'numeric'});

  document.getElementById('rTotalMention').textContent=reportData.totalMention.toLocaleString();
  document.getElementById('rTotalEng').textContent=Math.round(reportData.totalEngagement).toLocaleString();

  const total=reportData.sentRows.reduce((a,r)=>a+r.total,0);
  const pos=reportData.sentRows.reduce((a,r)=>a+r.positive,0);
  const neg=reportData.sentRows.reduce((a,r)=>a+r.negative,0);
  document.getElementById('rPosPct').textContent=total?Math.round(pos/total*100)+'%':'—';
  document.getElementById('rNegPct').textContent=total?Math.round(neg/total*100)+'%':'—';

  // Section 1
  const tb1=document.getElementById('topicTableBody'); tb1.innerHTML='';
  reportData.topicRows.forEach(r=>{
    if(r.brand==='__blank__'){
      const tr=document.createElement('tr'); tr.className='blank-row';
      tr.innerHTML='<td colspan="8"></td>'; tb1.appendChild(tr); return;
    }
    const tr=document.createElement('tr');
    const n=(v,cls)=>v===''||v===null?`<td class="num"></td>`:`<td class="num ${cls}">${Number(v).toLocaleString()}</td>`;
    tr.innerHTML=
      `<td class="${r.brand?'brand-cell':''}">${r.brand}</td><td>${r.topic}</td>`+
      n(r.negative,'num-neg')+n(r.neutral,'num-neu')+n(r.positive,'num-pos')+
      `<td class="col-spacer"></td>`+n(r.engagement,'')+n(r.mention,'');
    tb1.appendChild(tr);
  });

  // Section 2
  const tb2=document.getElementById('sentTableBody'); tb2.innerHTML='';
  reportData.sentRows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=
      `<td class="brand-cell">${r.brand}</td>`+
      `<td class="num num-neg">${r.negative.toLocaleString()}</td>`+
      `<td class="num num-neu">${r.neutral.toLocaleString()}</td>`+
      `<td class="num num-pos">${r.positive.toLocaleString()}</td>`+
      `<td class="num">${r.total.toLocaleString()}</td>`;
    tb2.appendChild(tr);
  });

  // Download button
  const btn=document.getElementById('downloadBtn');
  btn.disabled=false;
  btn.onclick=()=>{
    const d=new Date();
    const ds=String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+d.getFullYear();
    const a=document.createElement('a');
    a.href=URL.createObjectURL(reportData.csvBlob);
    a.download=`sw_data_for_report_${ds}.csv`;
    a.click();
    showToast('CSV downloaded!', 'success');
  };
}

// ── BRAND FILTER ──────────────────────────────────────────────────────────────
function buildBrandFilter() {
  const brands=new Set();
  rawData.forEach(r=>(r.Brands||'').replace(/[\[\]]/g,'').split(',').map(x=>x.trim()).filter(Boolean).forEach(b=>brands.add(b)));
  const c=document.getElementById('brandFilter'); c.innerHTML='';
  const allP=document.createElement('span');
  allP.className='brand-pill active'; allP.textContent='All'; allP.dataset.brand='__all__';
  allP.addEventListener('click',()=>{
    activeBrands.clear();
    document.querySelectorAll('.brand-pill').forEach(p=>p.classList.remove('active'));
    allP.classList.add('active'); applyFilters();
  });
  c.appendChild(allP);
  [...brands].sort().forEach(b=>{
    const p=document.createElement('span'); p.className='brand-pill'; p.textContent=b; p.dataset.brand=b;
    p.addEventListener('click',()=>{
      document.querySelector('.brand-pill[data-brand="__all__"]').classList.remove('active');
      if(activeBrands.has(b)){activeBrands.delete(b);p.classList.remove('active');}
      else{activeBrands.add(b);p.classList.add('active');}
      if(!activeBrands.size) document.querySelector('.brand-pill[data-brand="__all__"]').classList.add('active');
      applyFilters();
    });
    c.appendChild(p);
  });
}

function applyFilters() {
  if (!rawData.length) return; // no data yet — don't wipe the empty state
  const search=(document.getElementById('tableSearch')?.value||'').toLowerCase().trim();
  filteredData=rawData.filter(row=>{
    if(activeBrands.size>0){
      const b=(row.Brands||'').toLowerCase();
      if(![...activeBrands].some(ab=>b.includes(ab.toLowerCase()))) return false;
    }
    if(search){
      const hay=[row.text,row.Brands,row.source,row.Topics,row.sentiment].join(' ').toLowerCase();
      if(!hay.includes(search)) return false;
    }
    return true;
  });
  currentPage=1; renderTable();
}

