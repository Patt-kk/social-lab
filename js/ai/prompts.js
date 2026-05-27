// ╔══════════════════════════════════════════════════════════════════╗
// ║  prompts.js  —  AI Prompt Builders, Gemini Stream Runner,       ║
// ║                 and AI Output Rendering utilities                ║
// ║  Extracted from mfg_lab_campaign_select_v15.html                ║
// ║  All functions are pure or read from DOM — no module deps.      ║
// ╚══════════════════════════════════════════════════════════════════╝

/* eslint-disable */
// (Linting disabled — this file is inlined at runtime, not bundled)


// ── HTML ESCAPE UTILITY ──────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── AI OUTPUT RENDERER ───────────────────────────────────────────────────────
function renderAiMarkdown(text) {
  const lines = text.split('\n');
  let html = '';
  let inSection = false;
  let sectionKey = '';

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // ── Section header: any **Bold line** that stands alone ──────────────────
    // Matches both ALL-CAPS (Claude) and Title Case (Gemini) headers.
    // Rule: starts and ends with **, contains only word chars + common
    // punctuation, and has NO lowercase letters after a space that would
    // indicate it is an inline bold phrase inside a sentence.
    if (/^\*\*[^\*].{2,}\*\*$/.test(trimmed) && !/[.!?]$/.test(trimmed.replace(/\*\*/g,''))) {
      if (inSection) html += '</div>'; // close previous section body
      const title = trimmed.replace(/\*\*/g, '').trim();
      sectionKey = title.toUpperCase();  // normalise for icon lookup
      const icon = AI_SECTION_ICONS[sectionKey] || AI_SECTION_ICONS[title] || '▸';
      html += `
        <div class="ai-section">
          <div class="ai-section-title">
            <span class="ai-section-icon">${icon}</span>${title}
          </div>
          <div class="ai-section-body">`;
      inSection = true;
      continue;
    }

    // ── Numbered bullet: "1." "2." etc ─────────────────────────────────────
    if (/^\d+\.\s/.test(trimmed)) {
      const num   = trimmed.match(/^(\d+)\.\s/)[1];
      const rest  = trimmed.replace(/^\d+\.\s/, '');
      const isRec = sectionKey.includes('RECOMMENDATION');
      html += `
        <div class="ai-numbered-item${isRec ? ' ai-rec-item' : ''}">
          <span class="ai-num-badge${isRec ? ' ai-rec-badge' : ''}">${num}</span>
          <span>${renderInline(rest)}</span>
        </div>`;
      continue;
    }

    // ── Bullet point: "- " or "• " ─────────────────────────────────────────
    if (/^[-•]\s/.test(trimmed)) {
      const content = trimmed.slice(2);
      // Risk badge detection
      const riskMatch = content.match(/\b(High|Medium|Low)\s+[Rr]isk\b/);
      let riskBadge = '';
      if (riskMatch) {
        const lvl = riskMatch[1].toLowerCase();
        riskBadge = `<span class="ai-risk-badge ai-risk-${lvl}">${riskMatch[1]} Risk</span>`;
      }
      html += `
        <div class="ai-bullet-item">
          <span class="ai-bullet-dot">▸</span>
          <span>${renderInline(content)}${riskBadge}</span>
        </div>`;
      continue;
    }

    // ── Quote block: lines that look like quoted verbatim ──────────────────
    // Detected by starting with " or ' or [quote
    if (/^["'"']/.test(trimmed) || /^\[\d+\]\s*"/.test(trimmed)) {
      html += `<div class="ai-quote">${renderInline(trimmed)}</div>`;
      continue;
    }

    // ── Empty line ──────────────────────────────────────────────────────────
    if (!trimmed) {
      html += '<div style="height:4px"></div>';
      continue;
    }

    // ── Normal paragraph ────────────────────────────────────────────────────
    html += `<p class="ai-para">${renderInline(trimmed)}</p>`;
  }

  if (inSection) html += '</div></div>'; // close body + section
  return html;
}

function renderInline(text) {
  return text
    // **bold**
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Inline sentiment labels [positive] [negative] [neutral]
    .replace(/\[(positive|negative|neutral)\]/gi, (_, s) => {
      const cls = s.toLowerCase();
      return `<span class="ai-sent-tag ai-sent-${cls}">${s}</span>`;
    })
    // [eng:NNN] → styled engagement tag
    .replace(/\[eng:([\d.]+)\]/gi, (_, n) =>
      `<span class="ai-eng-tag">⚡ ${n}</span>`
    );
}

// ── SHARED GEMINI STREAMING RUNNER ──────────────────────────────────────────
async function _runGeminiStream({ model, system, user, outputBody, onDone, onError }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${geminiApiKey}&alt=sse`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 4096, temperature: 0.7 },
      }),
    });
    if (!response.ok) {
      const err = await response.json().catch(()=>({}));
      const msg = err?.error?.message || `HTTP ${response.status}`;
      if (response.status===400) throw new Error(`Bad request — check your API key. (${msg})`);
      if (response.status===403) throw new Error(`API key invalid or missing model access. (${msg})`);
      if (response.status===429) {
        showToast('Rate limit hit — please wait and retry', 'error', 5000);
        throw new Error(`Rate limit — wait a moment and retry. (${msg})`);
      }
      throw new Error(msg);
    }
    let fullText='', buffer='';
    outputBody.innerHTML='';
    const reader=response.body.getReader(), decoder=new TextDecoder();
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream:true });
      const lines = buffer.split('\n'); buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim(); if (!data||data==='[DONE]') continue;
        try {
          const evt = JSON.parse(data);
          const chunk = evt?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (chunk) { fullText+=chunk; outputBody.innerHTML=renderAiMarkdown(fullText)+'<span class="ai-cursor"></span>'; outputBody.scrollTop=outputBody.scrollHeight; }
        } catch(_) {}
      }
    }
    outputBody.innerHTML = renderAiMarkdown(fullText);
    onDone(fullText);
  } catch(e) {
    outputBody.innerHTML = '';
    onError(e.message);
  }
}

// ── BRAND DEEP-DIVE PROMPT BUILDERS ─────────────────────────────────────────
// Build a Social Listening prompt scoped to the active brand
function _buildBddSocialListeningPrompts(rows) {
  const brand    = bddActiveBrand || 'the selected brand';
  const sources  = bddAiMsGetValues('Source'); const source = sources[0]==='__all__'?'all channels':sources.join(', ');
  const sents    = bddAiMsGetValues('Sent');   const sent   = sents[0]==='__all__'?'all sentiments':`"${sents.join(', ')}" sentiment only`;
  const sortBy   = document.getElementById('bddAiSortBy').value;
  const instruction = document.getElementById('bddAiInstruction').value.trim();
  const sortCtx  = sortBy==='engagement'?'Posts are ordered by highest engagement score first.':'Posts are in their original order.';

  // If user wrote a full custom prompt, use it directly — skip default structure
  if (instruction) {
    const postsBlock = rows.map((r,i)=>`[${i+1}] [eng:${r.engagement}] [${r.sentiment}] [${r.source}] ${r.text}`).join('\n');
    const system = `You are a senior Digital Marketing & Social Listening strategist. The user has provided a custom prompt — follow it precisely. ${sortCtx}`;
    const user = `Brand: "${brand}" | Source: ${source} | Sentiment filter: ${sent}\n\n${instruction}\n\n--- POSTS START ---\n${postsBlock}\n--- POSTS END ---`;
    return { system, user };
  }

  const focusPart = '';
  const system = `You are a senior Digital Marketing & Social Listening strategist specialising in Thai food & beverage brands.
You analyse social media listening data and produce structured, insight-driven intelligence reports used by brand managers and marketing teams.

Your output MUST follow this exact structure — use these exact section headers (with ** wrapping):

**EXECUTIVE SNAPSHOT**
2–3 sentences. State the total post count, dominant sentiment, and the single most important finding a brand manager must know immediately.

**SENTIMENT BREAKDOWN**
Describe the sentiment distribution in concrete terms (e.g. proportions, dominant tone). Note any sentiment shifts, polarisation, or unusual patterns. Reference engagement weight where relevant.

**CONVERSATION THEMES & TOPIC CLUSTERS**
Identify 4–6 recurring conversation themes. For each theme: name it, explain what people are saying, and note its approximate share of conversation. Use bullet format.

**HIGH-IMPACT POSITIVE SIGNALS**
Top positive drivers — what is resonating, what consumers love, which messages are amplifying brand equity. Cite specific post examples or phrases. Bullet format.

**RISK AREAS & NEGATIVE SIGNALS**
Pain points, complaints, crisis seeds, or reputational risks. Be specific. Rate each as Low / Medium / High risk. Bullet format.

**CHANNEL & SOURCE INTELLIGENCE**
Observations about where conversations are happening, which channels drive the most engagement or negativity, and platform-specific behaviours.

**AUDIENCE VOICE — VERBATIM SIGNALS**
3–5 direct quotes or paraphrased sentiments that best represent the data (high-engagement posts preferred). Label each with sentiment and engagement score.

**STRATEGIC RECOMMENDATIONS**
3–5 concrete, prioritised actions for the marketing / brand team. Each recommendation should state: the action, why it matters (linked to the data), and the suggested channel or format.

Rules:
- Be specific and data-driven. Reference post counts, engagement scores, and examples.
- Avoid generic marketing waffle. Every sentence must add insight.
- Write in clear, professional English suitable for a brand manager briefing.
- Do not repeat yourself across sections.`;

  const user = `Analyse the following ${rows.length} social media posts about the brand "${brand}" from ${source} (filtered to ${sent}).
${sortCtx}${focusPart}

DATA CONTEXT:
- Each post is formatted as: [index] [eng:<engagement_score>] [<sentiment>] [<source_channel>] <post_text>
- Engagement score reflects combined reach and interaction weight.
- Use engagement scores to weight your insights — high-engagement posts matter more.

--- POSTS START ---
${rows.map((r,i)=>`[${i+1}] [eng:${r.engagement}] [${r.sentiment}] [${r.source}] ${r.text}`).join('\n')}
--- POSTS END ---

Produce the full Social Listening Intelligence Report now. Be specific, cite examples, and make every section actionable.`;

  return { system, user };
}
function _buildBddSentimentPrompts(rows) {
  const brand    = bddActiveBrand || 'the selected brand';
  const sources  = bddAiMsGetValues('Source'); const source = sources[0]==='__all__'?'all channels':sources.join(', ');
  const sents    = bddAiMsGetValues('Sent');   const sent   = sents[0]==='__all__'?'all sentiments':`"${sents.join(', ')}" only`;
  const sortBy   = document.getElementById('bddAiSortBy').value;
  const instruction = document.getElementById('bddAiInstruction').value.trim();
  const sortCtx  = sortBy==='engagement'?'Posts are ordered by highest engagement score first.':'Posts are in their original order.';

  if (instruction) {
    const postsBlock = rows.map((r,i)=>`[${i+1}] [eng:${r.engagement}] [${r.sentiment}] [${r.source}] ${r.text}`).join('\n');
    const system = `You are a senior Digital Marketing & Social Listening strategist. The user has provided a custom prompt — follow it precisely. ${sortCtx}`;
    const user = `Brand: "${brand}" | Source: ${source} | Sentiment filter: ${sent}\n\n${instruction}\n\n--- POSTS START ---\n${postsBlock}\n--- POSTS END ---`;
    return { system, user };
  }

  const focusPart = '';
  // Reuse the main sentiment prompt builder logic, just swap context vars
  const system = `Act as a senior digital marketing and social listening strategist.
Analyze the provided data and deliver a concise, executive-ready summary for a Brand Manager and COO.

Your output MUST follow this exact structure — use these exact section headers (wrapped in **):

**Overall Sentiment Snapshot**
% breakdown (Positive / Neutral / Negative). One-line interpretation of brand health.

**Key Positive Drivers**
What is working and why it matters (Max 5 bullet points).

**Key Negative Drivers**
Core issues + business impact (Max 5 bullet points).

Constraints: Maximum 500 words. Use bullet points only. Do not add any preamble or conclusion outside the three sections above.`;
  const user = `Analyse the following ${rows.length} social media posts about the brand "${brand}" from ${source} (filtered to ${sent}).
${sortCtx}${focusPart}

Each post: [index] [eng:<score>] [<sentiment>] [<source>] <text>

--- POSTS START ---
${rows.map((r,i)=>`[${i+1}] [eng:${r.engagement}] [${r.sentiment}] [${r.source}] ${r.text}`).join('\n')}
--- POSTS END ---

Start directly with **Overall Sentiment Snapshot**.`;
  return { system, user };
}
function _buildBddBrandPrompts(rows) {
  const brand    = bddActiveBrand || 'the selected brand';
  const sources  = bddAiMsGetValues('Source'); const source = sources[0]==='__all__'?'all channels':sources.join(', ');
  const sents    = bddAiMsGetValues('Sent');   const sent   = sents[0]==='__all__'?'all sentiments':`"${sents.join(', ')}" only`;
  const sortBy   = document.getElementById('bddAiSortBy').value;
  const instruction = document.getElementById('bddAiInstruction').value.trim();
  const sortCtx  = sortBy==='engagement'?'Posts are ordered by highest engagement score first.':'Posts are in their original order.';

  if (instruction) {
    const postsBlock = rows.map((r,i)=>`[${i+1}] [eng:${r.engagement}] [${r.sentiment}] [${r.source}] ${r.text}`).join('\n');
    const system = `You are a senior Digital Marketing & Social Listening strategist. The user has provided a custom prompt — follow it precisely. ${sortCtx}`;
    const user = `Brand: "${brand}" | Source: ${source} | Sentiment filter: ${sent}\n\n${instruction}\n\n--- POSTS START ---\n${postsBlock}\n--- POSTS END ---`;
    return { system, user };
  }

  const focusPart = '';
  const system = `Act as a senior social listening and digital marketing strategist.
Conduct a brand analysis and deliver a concise, executive-ready summary for a Brand Manager and COO.

Your output MUST follow this exact structure — use these exact section headers (wrapped in **):

**Brand Health Overview**
One concise statement on overall brand positioning and perception.

**Key Strengths**
What the brand is doing well + why it matters commercially (Max 3 bullet points).

**Key Weaknesses / Risks**
Critical issues + potential business impact (Max 3 bullet points).

**Consumer Perception Drivers**
What is shaping audience sentiment (Max 3 bullet points).

**Competitive / Market Signals**
Notable positioning gaps or opportunities (Max 3 bullet points).

**Strategic Recommendations**
Clear, actionable next steps (Max 3 bullet points).

Constraints: Maximum 200 words. Bullet points only. No preamble or conclusion outside the six sections above.`;
  const user = `Analyse the following ${rows.length} social media posts about the brand "${brand}" from ${source} (filtered to ${sent}).
${sortCtx}${focusPart}

Each post: [index] [eng:<score>] [<sentiment>] [<source>] <text>

--- POSTS START ---
${rows.map((r,i)=>`[${i+1}] [eng:${r.engagement}] [${r.sentiment}] [${r.source}] ${r.text}`).join('\n')}
--- POSTS END ---

Start directly with **Brand Health Overview**.`;
  return { system, user };
}

// ── BDD GOOGLE REVIEW PROMPT BUILDER ────────────────────────────────────────
function _buildBddGoogleReviewPrompts(rows) {
  const brand    = bddActiveBrand || 'the selected brand';
  const sents    = bddAiMsGetValues('Sent'); const sent = sents[0]==='__all__'?'all sentiments':`"${sents.join(', ')}" only`;
  const instruction = document.getElementById('bddAiInstruction').value.trim();
  const enriched = rows.map((r,i) => {
    const loc  = String(r.title||r.page||'').trim()||'Unknown Location';
    const date = String(r.created_at||r.date||'').trim().slice(0,16);
    return `[${i+1}] [${r.sentiment}] [${loc}] [${date}]\n${r.text}`;
  });

  if (instruction) {
    const system = `You are an expert Customer Experience & Brand Reputation Analyst. The user has provided a custom prompt — follow it precisely.`;
    const user = `Brand: "${brand}" | Sentiment filter: ${sent}\n\n${instruction}\n\n--- REVIEWS START ---\n${enriched.join('\n\n')}\n--- REVIEWS END ---`;
    return { system, user };
  }

  const focusPart = '';
  const system = `You are an expert Customer Experience & Brand Reputation Analyst.
Your output MUST follow this EXACT structure with these EXACT section headers (wrapped in **). No extras.

**Total Volume & Sentiment Distribution**
3 sentences max: total count, sentiment split %, one analytical implication. Add one bullet on peak review periods.

**Location Performance**
Bold sub-labels: High Engagement (top 3 by volume), Top Performers (top 3 by positive), Service Watchlist (worst negative complaints).

**Key Strengths (Positive Sentiment)**
Group into max 3 named themes (bold label + one sentence each).

**Critical Pain Points (Negative Sentiment)**
Max 5 themes (bold label + one sentence + risk label: 🔴 High / 🟡 Medium / 🟢 Low).

Rules: Every sentence must cite specific locations or counts. No filler. Tight analyst prose.`;
  const user = `Analyse ${rows.length} Google Reviews for "${brand}" (filtered to ${sent}).${focusPart}

Format: [index] [sentiment] [branch/location] [date]
<review text>

--- REVIEWS START ---
${enriched.join('\n\n')}
--- REVIEWS END ---

Start directly with **Total Volume & Sentiment Distribution**.`;
  return { system, user };
}

// Route to correct prompt builder based on bddAiAnalysisType
function _buildBddAiPrompts(rows) {
  if (bddAiAnalysisType === 'googlereview') return _buildBddGoogleReviewPrompts(rows);
  if (bddAiAnalysisType === 'sentiment')    return _buildBddSentimentPrompts(rows);
  if (bddAiAnalysisType === 'brand')        return _buildBddBrandPrompts(rows);
  return _buildBddSocialListeningPrompts(rows);
}

// ── GOOGLE REVIEW AI PROMPT BUILDER ─────────────────────────────────────────
// Build Google Review prompt scoped to active brand
// ── GR AI PROMPT BUILDER ─────────────────────────────────────────────────────
// Mirrors _buildBddGoogleReviewPrompts but reads from GR-scoped UI elements
function _buildGrAiPrompts(rows) {
  const brand       = grAiActiveBrand || 'All Brands';
  const sents       = grAiMsGetValues('Sent');
  const sent        = sents[0]==='__all__' ? 'all sentiments' : `"${sents.join(', ')}" only`;
  const enriched    = rows.map((r,i) => {
    const loc  = String(r.title||r.page||'').trim() || 'Unknown Location';
    const date = String(r.created_at||r.date||'').trim().slice(0,16);
    return `[${i+1}] [${r.sentiment}] [${loc}] [${date}]\n${r.text}`;
  });
  const instruction = document.getElementById('grAiInstruction').value.trim();

  // If user wrote a full custom prompt, use it directly — skip default structure
  if (instruction) {
    const postsBlock = enriched.join('\n\n');
    const system = `You are an expert Customer Experience & Brand Reputation Analyst. The user has provided a custom prompt — follow it precisely.`;
    const user = `Brand: "${brand}" | Sentiment filter: ${sent}\n\n${instruction}\n\n--- REVIEWS START ---\n${postsBlock}\n--- REVIEWS END ---`;
    return { system, user };
  }

  const focusPart = '';
  const system = `You are an expert Customer Experience & Brand Reputation Analyst specialising in Thai food & beverage chains.
You analyse Google Review data and write concise, data-driven intelligence reports for brand managers.

Your output MUST follow this EXACT structure with these EXACT section headers (wrapped in **). Do not add extra sections, intros, or closing remarks.

**Total Volume & Sentiment Distribution**
Write 3 sentences maximum:
1. State the exact total review count and brand name.
2. State the sentiment split as percentages (Positive X%, Neutral X%, Negative X%).
3. One analytical sentence on what the sentiment balance implies operationally for the brand.
Then add one bullet on peak review periods with a hypothesis (day/week spike + likely cause).

**Location Performance**
Use these exact sub-labels on separate lines in bold:
- High Engagement: name the top 3 locations by volume with counts. Summarize and group any sentiment concerns at that location in 1–2 sentences.
- Top Performers: name the top 3 locations by positive sentiment counts. Summarize positive sentiment highlight at that location in 1–2 sentences.
- Service Watchlist: name locations with the most critical or specific negative complaints.

**Key Strengths (Positive Sentiment)**
Group positives into named themes (e.g. "Product Excellence", "Atmosphere", "Staff Friendliness").
For each theme: one label in bold, then one sentence summarizing the positive messages and citing location names.
Maximum 3 themes.

**Critical Pain Points (Negative Sentiment)**
Group top distinct issues into named themes in bold (e.g. "Operational Slowness", "Hygiene Standards").
For each: one sentence summarizing the specific incident or pattern and location names.
End each with a risk label: 🔴 High / 🟡 Medium / 🟢 Low.
Maximum 5 pain points.

Rules:
- Never write generic observations. Every sentence must reference specific locations, counts, or reviewer language from the data.
- Do not include an introduction, preamble, or conclusion outside the four sections above.
- Do not use phrases like "it is worth noting", "overall", "in summary", or any filler language.
- Write in tight, direct analyst prose — each bullet should be 1–2 sentences maximum.`;

  const user = `Analyse the following ${rows.length} Google Reviews for "${brand}" (filtered to ${sent}).${focusPart}

Each review below is formatted as:
[index] [sentiment] [branch/location] [date]
<review text>

DATA NOTES:
- "branch/location" is the exact branch name — always use it when citing examples.
- Dates are in "YYYY Mon DD HH:MM" format — use them to identify volume spikes.

--- REVIEWS START ---
${enriched.join('\n\n')}
--- REVIEWS END ---

Output only the four sections as instructed. No introduction. No conclusion. Start directly with **Total Volume & Sentiment Distribution**.`;

  return { system, user };
}

// ── CAMPAIGN AI PROMPT BUILDERS ──────────────────────────────────────────────
function _buildCampPerformancePrompts(rows) {
  const camp        = campActiveCampaign || 'the selected campaign';
  const sources     = campAiMsGetValues('Source'); const source = sources[0]==='__all__'?'all channels':sources.join(', ');
  const sents       = campAiMsGetValues('Sent');   const sent   = sents[0]==='__all__'?'all sentiments':`"${sents.join(', ')}" only`;
  const sortBy      = document.getElementById('campAiSortBy')?.value;
  const instruction = document.getElementById('campAiInstruction')?.value.trim();
  const sortCtx     = sortBy==='engagement'?'Posts are ordered by highest engagement score first.':'Posts are in original order.';

  if (instruction) {
    const postsBlock = rows.map((r,i)=>`[${i+1}] [eng:${r.engagement}] [${r.sentiment}] [${r.source}] ${r.text}`).join('\n');
    return {
      system: `You are a senior Campaign Performance Analyst. Follow the user's custom prompt precisely. ${sortCtx}`,
      user:   `Campaign: "${camp}" | Source: ${source} | Sentiment: ${sent}\n\n${instruction}\n\n--- POSTS START ---\n${postsBlock}\n--- POSTS END ---`,
    };
  }

  const system = `You are a senior Digital Marketing & Social Listening strategist specialising in Thai food & beverage brands.
You analyse social media listening data and produce structured, insight-driven intelligence reports used by brand managers and marketing teams.

Your output MUST follow this exact structure using these exact section headers (wrapped in **):

**Campaign Detail**
Describe what this campaign is about — the concept, creative direction, promotion mechanics, and any key messages the brand is pushing. Identify the primary engagement driver (price, product, emotion, event, influencer, etc.) and which channels carry it. Include total post count, date range if available, and top-performing channel by engagement.

**Campaign Key Takeaways**
3–5 concise, high-value takeaways a brand manager must know. Each must be specific, evidence-backed, and actionable. Cover: overall performance vs expectation signals, standout wins, risks or missed opportunities, and one forward-looking implication. Bullet format.

**Campaign Feedback**
Summarise what the audience is actually saying. Group messages by frequency — identify the top recurring themes, phrases, or reactions in the posts. For each group: label the theme, describe the message pattern in 1–2 sentences, estimate its share of conversation, and note the dominant sentiment. At least 4 groups, ordered from most to least frequent.

Rules: Every sentence must cite specific counts, engagement scores, or verbatim post language. No generic observations. Tight analyst prose, no filler.`;

  const user = `Analyse ${rows.length} posts for campaign "${camp}" from ${source} (${sent}).
${sortCtx}

Each post: [index] [eng:<score>] [<sentiment>] [<source>] <text>

--- POSTS START ---
${rows.map((r,i)=>`[${i+1}] [eng:${r.engagement}] [${r.sentiment}] [${r.source}] ${r.text}`).join('\n')}
--- POSTS END ---

Start directly with **Campaign Detail**.`;
  return { system, user };
}

function _buildCampSentimentPrompts(rows) {
  const camp        = campActiveCampaign || 'the selected campaign';
  const sources     = campAiMsGetValues('Source'); const source = sources[0]==='__all__'?'all channels':sources.join(', ');
  const sents       = campAiMsGetValues('Sent');   const sent   = sents[0]==='__all__'?'all sentiments':`"${sents.join(', ')}" only`;
  const sortBy      = document.getElementById('campAiSortBy')?.value;
  const instruction = document.getElementById('campAiInstruction')?.value.trim();
  const sortCtx     = sortBy==='engagement'?'Posts are ordered by highest engagement score first.':'Posts are in original order.';

  if (instruction) {
    const postsBlock = rows.map((r,i)=>`[${i+1}] [eng:${r.engagement}] [${r.sentiment}] [${r.source}] ${r.text}`).join('\n');
    return {
      system: `You are a senior Digital Marketing & Social Listening strategist specialising in Thai food & beverage brands. You analyse social media listening data and produce structured, insight-driven intelligence reports used by brand managers and marketing teams. Follow the user's custom prompt precisely. ${sortCtx}`,
      user:   `Campaign: "${camp}" | Source: ${source} | Sentiment: ${sent}\n\n${instruction}\n\n--- POSTS START ---\n${postsBlock}\n--- POSTS END ---`,
    };
  }

  const system = `You are a senior Digital Marketing & Social Listening strategist specialising in Thai food & beverage brands.
You analyse social media listening data and produce structured, insight-driven intelligence reports used by brand managers and marketing teams.

Your output MUST follow this exact structure using these exact section headers (wrapped in **):

**Campaign Detail**
Describe what this campaign is about — the concept, mechanics, and key messages. State the overall sentiment split upfront (Positive X%, Neutral X%, Negative X%) and note what the tone distribution implies about how the audience is receiving this campaign. Identify which channels carry the most emotionally charged conversations.

**Campaign Key Takeaways**
3–5 high-value sentiment takeaways for the brand team. Each must be specific and evidence-backed. Cover: the dominant sentiment driver, any polarisation or sentiment shift across channels, the single strongest positive signal, the most significant risk or negative cluster, and one forward-looking recommendation to protect or improve sentiment. Bullet format.

**Campaign Feedback**
Summarise the audience voice by grouping recurring sentiment patterns. For each group: label the sentiment theme (e.g. "Product Delight", "Price Sensitivity", "Service Frustration", "Brand Love"), describe the message pattern in 1–2 sentences using specific post language, estimate its share of all posts, and rate the sentiment intensity — 🔴 Strong Negative / 🟡 Mixed / 🟢 Strong Positive. At least 4 groups, ordered from most to least frequent.

Rules: Cite specific post text, exact sentiment counts, and engagement scores in every section. No filler language. Tight analyst prose.`;

  const user = `Analyse sentiment in ${rows.length} posts for campaign "${camp}" from ${source} (${sent}).
${sortCtx}

Each post: [index] [eng:<score>] [<sentiment>] [<source>] <text>

--- POSTS START ---
${rows.map((r,i)=>`[${i+1}] [eng:${r.engagement}] [${r.sentiment}] [${r.source}] ${r.text}`).join('\n')}
--- POSTS END ---

Start directly with **Campaign Detail**.`;
  return { system, user };
}

function _buildCampContentPrompts(rows) {
  const camp        = campActiveCampaign || 'the selected campaign';
  const sources     = campAiMsGetValues('Source'); const source = sources[0]==='__all__'?'all channels':sources.join(', ');
  const sents       = campAiMsGetValues('Sent');   const sent   = sents[0]==='__all__'?'all sentiments':`"${sents.join(', ')}" only`;
  const sortBy      = document.getElementById('campAiSortBy')?.value;
  const instruction = document.getElementById('campAiInstruction')?.value.trim();
  const sortCtx     = sortBy==='engagement'?'Posts are ordered by highest engagement score first.':'Posts are in original order.';

  if (instruction) {
    const postsBlock = rows.map((r,i)=>`[${i+1}] [eng:${r.engagement}] [${r.sentiment}] [${r.source}] ${r.text}`).join('\n');
    return {
      system: `You are a senior Digital Marketing & Social Listening strategist specialising in Thai food & beverage brands. You analyse social media listening data and produce structured, insight-driven intelligence reports used by brand managers and marketing teams. Follow the user's custom prompt precisely. ${sortCtx}`,
      user:   `Campaign: "${camp}" | Source: ${source} | Sentiment: ${sent}\n\n${instruction}\n\n--- POSTS START ---\n${postsBlock}\n--- POSTS END ---`,
    };
  }

  const system = `You are a senior Digital Marketing & Social Listening strategist specialising in Thai food & beverage brands.
You analyse social media listening data and produce structured, insight-driven intelligence reports used by brand managers and marketing teams.

Your output MUST follow this exact structure using these exact section headers (wrapped in **):

**Campaign Detail**
Describe what this campaign is about — the creative concept, content formats present in the data (reviews, UGC, influencer posts, promotional announcements, etc.), key messaging pillars, and which channels carry which content types. Identify the primary content driver and note total post count and channel spread.

**Campaign Key Takeaways**
3–5 high-value content insights for the creative and marketing team. Each must be specific and backed by data. Cover: which content formats or messages drove the highest engagement, which messages resonated vs fell flat, any platform-specific content behaviour worth noting, and one untapped content opportunity the campaign should explore. Bullet format.

**Campaign Feedback**
Summarise what the audience is saying and sharing around this campaign. Group by recurring message or content theme — for each group: label the theme (e.g. "Taste & Product Reviews", "Price & Value Mentions", "Sharing & Gifting Intent", "Brand Comparison"), describe the message pattern in 1–2 sentences with specific post examples, estimate its frequency as a share of all posts, and note the engagement level (High / Medium / Low). At least 4 groups, ordered from most to least frequent.

Rules: Ground every observation in specific post text or engagement data. No generic marketing advice. Tight, direct analyst prose.`;

  const user = `Analyse content themes and messaging in ${rows.length} posts for campaign "${camp}" from ${source} (${sent}).
${sortCtx}

Each post: [index] [eng:<score>] [<sentiment>] [<source>] <text>

--- POSTS START ---
${rows.map((r,i)=>`[${i+1}] [eng:${r.engagement}] [${r.sentiment}] [${r.source}] ${r.text}`).join('\n')}
--- POSTS END ---

Start directly with **Campaign Detail**.`;
  return { system, user };
}

function _buildCampAiPrompts(rows) {
  if (campAiAnalysisType === 'sentiment') return _buildCampSentimentPrompts(rows);
  if (campAiAnalysisType === 'content')   return _buildCampContentPrompts(rows);
  return _buildCampPerformancePrompts(rows);
}
