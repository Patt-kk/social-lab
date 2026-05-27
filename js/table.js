// table.js
// ── TABLE ─────────────────────────────────────────────────────────────────────
function buildColToggles(){
  const c=document.getElementById('colToggle');c.innerHTML='';
  DISPLAY_COLS.filter(col=>col!=='link').forEach(col=>{
    const lbl=document.createElement('label');lbl.className='col-check on';
    lbl.innerHTML=`<input type="checkbox" checked> ${col}`;
    lbl.querySelector('input').addEventListener('change',e=>{lbl.classList.toggle('on',e.target.checked);renderTable();});
    c.appendChild(lbl);
  });
}
function getActiveCols(){
  return [...document.querySelectorAll('#colToggle .col-check')].filter(l=>l.querySelector('input').checked).map(l=>l.querySelector('input').nextSibling.textContent.trim());
}
function getLinkField(row){
  for(const f of LINK_FIELDS){ if(row[f] && String(row[f]).startsWith('http')) return row[f]; }
  return null;
}
function renderTable(){
  const searchVal = document.getElementById('tableSearch')?.value || '';
  const hasFilter = searchVal || activeBrands.size > 0;
  const noMatch   = hasFilter && rawData.length && !filteredData.length;
  const data      = noMatch ? rawData : (hasFilter ? filteredData : rawData);

  // No data at all — show full empty state
  if(!rawData.length){
    document.getElementById('tableEmpty').style.display = '';
    document.getElementById('tableArea').style.display  = 'none';
    document.getElementById('tableEmptyIcon').textContent  = '🗂';
    document.getElementById('tableEmptyTitle').textContent = 'No data loaded';
    document.getElementById('tableEmptySub').textContent   = 'Upload a CSV to browse individual rows';
    return;
  }

  // Show/hide no-match banner above the table
  let banner = document.getElementById('tableNoMatchBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'tableNoMatchBanner';
    banner.style.cssText = 'display:none;align-items:center;gap:10px;padding:8px 14px;margin-bottom:10px;border-radius:8px;background:#fff8ed;border:1px solid #fde68a;font-size:12px;color:#92400e;font-weight:600;';
    banner.innerHTML = `<span>🔍</span><span>No matching results — showing all data instead.</span><a href="#" id="clearTableSearch" style="margin-left:auto;color:var(--accent);text-decoration:underline;white-space:nowrap">Clear search</a>`;
    const tableArea = document.getElementById('tableArea');
    tableArea.parentNode.insertBefore(banner, tableArea);
    document.getElementById('clearTableSearch').addEventListener('click', e => {
      e.preventDefault();
      const input = document.getElementById('tableSearch');
      if (input) input.value = '';
      activeBrands.clear();
      document.querySelectorAll('.brand-pill').forEach(p => p.classList.remove('active'));
      const allPill = document.querySelector('.brand-pill[data-brand="__all__"]');
      if (allPill) allPill.classList.add('active');
      applyFilters();
    });
  }
  banner.style.display = noMatch ? 'flex' : 'none';

  document.getElementById('tableEmpty').style.display = 'none';
  document.getElementById('tableArea').style.display  = '';
  const cols=getActiveCols(),total=Math.ceil(data.length/PAGE_SIZE);
  currentPage=Math.min(currentPage,total);
  const slice=data.slice((currentPage-1)*PAGE_SIZE,currentPage*PAGE_SIZE);
  // Update row count badge
  const rcEl = document.getElementById('tableRowCount');
  if (rcEl) rcEl.textContent = `${data.length.toLocaleString()} rows`;
  document.getElementById('tHead').innerHTML='<tr>'+cols.map(c=>`<th>${c}</th>`).join('')+'<th>Link</th></tr>';
  const tb=document.getElementById('tBody');tb.innerHTML='';
  slice.forEach(row=>{
    const tr=document.createElement('tr');
    cols.forEach(col=>{
      const td=document.createElement('td'),val=row[col]||'';
      if(col==='sentiment') td.innerHTML=`<span class="badge ${val}">${val}</span>`;
      else{td.textContent=val;td.title=val;}
      tr.appendChild(td);
    });
    // Link column
    const tdLink=document.createElement('td');
    const href=getLinkField(row);
    tdLink.innerHTML=href
      ? `<a href="${href}" target="_blank" rel="noopener noreferrer" class="bdd-post-link" style="font-size:10px">🔗 Open</a>`
      : `<span style="font-size:10px;color:var(--text3);">—</span>`;
    tr.appendChild(tdLink);
    tb.appendChild(tr);
  });
  document.getElementById('pageInfo').textContent=`Page ${currentPage} of ${total} (${data.length.toLocaleString()} rows)`;
  document.getElementById('prevPage').disabled=currentPage<=1;
  document.getElementById('nextPage').disabled=currentPage>=total;
}

function _init_table() {
  document.getElementById('prevPage').addEventListener('click',()=>{currentPage--;renderTable();});
  document.getElementById('nextPage').addEventListener('click',()=>{currentPage++;renderTable();});
  document.getElementById('tableSearch').addEventListener('input',applyFilters);
  
  // "/" key to focus table search when Data Table tab is active
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const activeTab = document.querySelector('.tab-btn.active');
      if (activeTab?.dataset.tab === 'table') {
        const inp = document.getElementById('tableSearch');
        if (document.activeElement !== inp) { e.preventDefault(); inp.focus(); inp.select(); }
      }
    }
  });
  
  // Export filtered/visible rows as CSV
  document.getElementById('tableExportFilteredBtn')?.addEventListener('click', () => {
    const searchVal = document.getElementById('tableSearch')?.value || '';
    const hasFilter = searchVal || activeBrands.size > 0;
    const data = hasFilter && filteredData.length ? filteredData : rawData;
    if (!data.length) { showToast('No data to export', 'error'); return; }
    const cols = getActiveCols();
    const header = [...cols, 'link'].join(',');
    const rows = data.map(row => {
      const vals = cols.map(c => {
        const v = String(row[c]||'').replace(/"/g,'""');
        return v.includes(',') || v.includes('\n') ? `"${v}"` : v;
      });
      const link = getLinkField(row) || '';
      vals.push(link.includes(',') ? `"${link}"` : link);
      return vals.join(',');
    });
    const csv = header + '\n' + rows.join('\n');
    const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `filtered_data_${data.length}_rows.csv`;
    a.click();
    showToast(`Exported ${data.length.toLocaleString()} rows as CSV`, 'success');
  });
  

}
