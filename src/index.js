// Feedback Aggregator Dashboard — Cloudflare Worker
// Routes: GET /, GET /api/feedback, GET /api/feedback/summary,
//         GET /api/feedback/timeseries, POST /api/feedback/seed

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/' && request.method === 'GET') {
        return serveDashboard();
      }
      if (path === '/api/feedback' && request.method === 'GET') {
        return handleGetFeedback(url, env);
      }
      if (path === '/api/feedback/summary' && request.method === 'GET') {
        return handleGetSummary(url, env);
      }
      if (path === '/api/feedback/timeseries' && request.method === 'GET') {
        return handleGetTimeseries(url, env);
      }
      if (path === '/api/feedback/seed' && request.method === 'POST') {
        return handleSeed(env);
      }

      return new Response('Not Found', { status: 404 });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  },
};

// ─── API Handlers ───────────────────────────────────────────────

async function handleGetFeedback(url, env) {
  const days = parseInt(url.searchParams.get('days') || '30');
  const sentiment = url.searchParams.get('sentiment');
  const source = url.searchParams.get('source');
  const limit = parseInt(url.searchParams.get('limit') || '100');

  let query = `SELECT * FROM feedback WHERE timestamp >= datetime('now', '-${days} days')`;
  const params = [];

  if (sentiment) {
    query += ` AND sentiment = ?`;
    params.push(sentiment);
  }
  if (source) {
    query += ` AND source = ?`;
    params.push(source);
  }

  query += ` ORDER BY timestamp DESC LIMIT ?`;
  params.push(limit);

  const stmt = env.DB.prepare(query).bind(...params);
  const { results } = await stmt.all();

  return Response.json(results, {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

async function handleGetTimeseries(url, env) {
  const days = parseInt(url.searchParams.get('days') || '30');
  const sentiment = url.searchParams.get('sentiment');

  let query = `
    SELECT
      DATE(timestamp) as date,
      sentiment,
      COUNT(*) as count
    FROM feedback
    WHERE timestamp >= datetime('now', '-${days} days')
  `;

  if (sentiment && sentiment !== 'all') {
    query += ` AND sentiment = '${sentiment}'`;
  }

  query += ` GROUP BY DATE(timestamp), sentiment ORDER BY date ASC`;

  const { results } = await env.DB.prepare(query).all();

  return Response.json(results, {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

async function handleGetSummary(url, env) {
  const days = parseInt(url.searchParams.get('days') || '7');

  const { results } = await env.DB.prepare(
    `SELECT source, content, sentiment FROM feedback
     WHERE timestamp >= datetime('now', '-${days} days')
     ORDER BY timestamp DESC LIMIT 50`
  ).all();

  if (!results || results.length === 0) {
    return Response.json({ summary: 'No feedback data available for the selected period.' });
  }

  const feedbackText = results
    .map((f) => `- [${f.source}] (${f.sentiment}) ${f.content}`)
    .join('\n');

  const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
    prompt: `You are a product manager analysing customer feedback. Based on the following ${results.length} feedback items from the past ${days} days, provide a brief summary (2-3 sentences) of the overall sentiment and key themes. Then list the top 3-5 themes with approximate counts.

Feedback:
${feedbackText}

Summary:`,
  });

  const summary = typeof response === 'string' ? response : response.response || JSON.stringify(response);

  return Response.json({ summary, itemCount: results.length, days }, {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

async function handleSeed(env) {
  // Generate and insert mock data directly via the API
  const sources = ['Support Ticket', 'Discord', 'GitHub Issue', 'Email', 'Twitter', 'Community Forum'];

  const templates = {
    positive: [
      "Love the new dashboard redesign! It's so much easier to navigate now.",
      "Great support response time - got my issue resolved within an hour.",
      "The API documentation is really well written, made integration a breeze.",
      "Performance has been rock solid for us this month. Great work!",
      "Just migrated from a competitor and the onboarding experience was fantastic.",
      "The new analytics features are exactly what we needed. Thank you!",
      "Your team's response on the forum was incredibly helpful.",
      "Impressed with the uptime - haven't had a single outage in 6 months.",
      "The CLI tool is a joy to use. Very intuitive design.",
      "Pricing is fair for the value we're getting. Happy customer here.",
      "The new caching features have cut our load times in half.",
      "Really appreciate the transparent changelog and communication.",
      "Setup was surprisingly easy - had everything running in under 30 minutes.",
      "The webhooks feature works flawlessly. Exactly what we needed.",
      "Your free tier is generous enough to let us properly evaluate the product.",
      "The mobile experience has improved dramatically. Nice work!",
      "Edge computing support has been a game changer for our latency issues.",
      "Love the real-time monitoring dashboard. Very actionable insights.",
    ],
    negative: [
      "The site has been painfully slow the past few days. Pages take forever to load.",
      "Getting a 500 error when trying to access my account settings.",
      "Your pricing is too expensive for small teams. Need more affordable options.",
      "Documentation is outdated - half the code examples don't work anymore.",
      "Been waiting 3 days for a support response. This is unacceptable.",
      "The new UI update broke our custom integration. No warning given.",
      "SSL certificate renewal failed and took our site down for 2 hours.",
      "Rate limiting is way too aggressive. Keeps blocking legitimate traffic.",
      "The migration tool lost some of our data. Very concerning.",
      "Dashboard keeps timing out when loading analytics for large sites.",
      "API response times have degraded significantly since the last update.",
      "Your billing system charged us twice this month. Still waiting for refund.",
      "The deploy process failed silently - no error messages to debug.",
      "Search functionality is broken - returns irrelevant results.",
      "Mobile app crashes constantly on Android. Please fix.",
      "Lost 4 hours debugging because error messages are so cryptic.",
    ],
    neutral: [
      "How do I configure custom headers for my workers?",
      "Is there a way to export analytics data to CSV?",
      "What's the difference between the Pro and Business plans?",
      "Looking for documentation on the new routing features.",
      "Can you clarify the fair usage policy for bandwidth?",
      "When is the next maintenance window scheduled?",
      "Wondering if you support custom domains with wildcard certificates.",
      "Any plans to add GraphQL support to the API?",
      "How does the caching behavior work with query parameters?",
      "What regions are available for data residency?",
      "Could you provide more details about your SOC 2 compliance?",
      "Is there a status page I can subscribe to for updates?",
    ],
  };

  // Clear existing data
  await env.DB.exec('DELETE FROM feedback');

  const stmts = [];
  const now = Date.now();

  const sentimentCounts = { positive: 30, negative: 26, neutral: 19 };
  const spikeDays = [10, 11, 12];

  for (const [sentiment, count] of Object.entries(sentimentCounts)) {
    const pool = templates[sentiment];
    for (let i = 0; i < count; i++) {
      let daysAgo;
      if (sentiment === 'negative' && i < 8) {
        daysAgo = spikeDays[i % spikeDays.length] + Math.random() * 0.5;
      } else {
        daysAgo = Math.random() * 30;
      }

      const ts = new Date(now - daysAgo * 86400000);
      ts.setHours(8 + Math.floor(Math.random() * 14));
      ts.setMinutes(Math.floor(Math.random() * 60));
      const timestamp = ts.toISOString().replace('T', ' ').substring(0, 19);

      const score =
        sentiment === 'neutral'
          ? (0.4 + Math.random() * 0.2).toFixed(2)
          : (0.7 + Math.random() * 0.3).toFixed(2);

      stmts.push(
        env.DB.prepare(
          `INSERT INTO feedback (source, content, timestamp, sentiment, sentiment_score) VALUES (?, ?, ?, ?, ?)`
        ).bind(
          sources[Math.floor(Math.random() * sources.length)],
          pool[i % pool.length],
          timestamp,
          sentiment,
          parseFloat(score)
        )
      );
    }
  }

  await env.DB.batch(stmts);

  return Response.json({ success: true, inserted: stmts.length }, {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// ─── Dashboard HTML ─────────────────────────────────────────────

function serveDashboard() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Feedback Aggregator Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fa;
      color: #1a1a2e;
      line-height: 1.5;
    }

    /* Header */
    .header {
      background: #fff;
      border-bottom: 1px solid #e2e8f0;
      padding: 16px 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 600;
      color: #1a1a2e;
    }
    .header select {
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      background: #fff;
      cursor: pointer;
    }

    /* Main layout */
    .container {
      max-width: 1200px;
      margin: 24px auto;
      padding: 0 24px;
    }

    /* Chart section */
    .chart-section {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    .chart-header h2 {
      font-size: 16px;
      font-weight: 600;
    }
    .filter-buttons {
      display: flex;
      gap: 8px;
    }
    .filter-btn {
      padding: 6px 14px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.15s;
    }
    .filter-btn.active {
      background: #1a1a2e;
      color: #fff;
      border-color: #1a1a2e;
    }
    .filter-btn:hover:not(.active) {
      background: #f1f5f9;
    }
    .chart-container {
      position: relative;
      height: 280px;
    }

    /* Bottom panels */
    .panels {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    @media (max-width: 768px) {
      .panels { grid-template-columns: 1fr; }
    }

    .panel {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 24px;
    }
    .panel h2 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    /* AI Summary */
    .summary-content {
      font-size: 14px;
      color: #475569;
      line-height: 1.7;
      white-space: pre-wrap;
    }
    .summary-loading {
      color: #94a3b8;
      font-style: italic;
    }

    /* Feedback feed */
    .feed-list {
      max-height: 400px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .feed-item {
      padding: 12px;
      border: 1px solid #f1f5f9;
      border-radius: 8px;
      background: #fafbfc;
      cursor: pointer;
      transition: background 0.15s;
    }
    .feed-item:hover {
      background: #f1f5f9;
    }
    .feed-item-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 12px;
    }
    .source-badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 500;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .source-support { background: #dbeafe; color: #1e40af; }
    .source-discord { background: #ede9fe; color: #6d28d9; }
    .source-github { background: #f1f5f9; color: #334155; }
    .source-email { background: #fef3c7; color: #92400e; }
    .source-twitter { background: #cffafe; color: #155e75; }
    .source-forum { background: #d1fae5; color: #065f46; }

    .sentiment-icon { font-size: 14px; }
    .sentiment-positive { color: #16a34a; }
    .sentiment-negative { color: #dc2626; }
    .sentiment-neutral { color: #6b7280; }

    .feed-time {
      color: #94a3b8;
      margin-left: auto;
      font-size: 12px;
    }
    .feed-content {
      font-size: 13px;
      color: #475569;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }
    .feed-item.expanded .feed-content {
      -webkit-line-clamp: unset;
    }

    /* Loading spinner */
    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid #e2e8f0;
      border-top-color: #1a1a2e;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Feedback Aggregator Dashboard</h1>
    <select id="timeFilter">
      <option value="7">Last 7 days</option>
      <option value="14">Last 14 days</option>
      <option value="30" selected>Last 30 days</option>
    </select>
  </div>

  <div class="container">
    <!-- Chart Section -->
    <div class="chart-section">
      <div class="chart-header">
        <h2>Feedback Volume Over Time</h2>
        <div class="filter-buttons">
          <button class="filter-btn active" data-sentiment="all">All</button>
          <button class="filter-btn" data-sentiment="positive">Positive</button>
          <button class="filter-btn" data-sentiment="negative">Negative</button>
          <button class="filter-btn" data-sentiment="neutral">Neutral</button>
        </div>
      </div>
      <div class="chart-container">
        <canvas id="feedbackChart"></canvas>
      </div>
    </div>

    <!-- Bottom Panels -->
    <div class="panels">
      <!-- AI Summary Panel -->
      <div class="panel">
        <h2>AI Summary</h2>
        <div id="summaryContent" class="summary-content summary-loading">
          <span class="spinner"></span> Generating AI summary...
        </div>
      </div>

      <!-- Latest Feedback Panel -->
      <div class="panel">
        <h2>Latest Feedback</h2>
        <div id="feedList" class="feed-list">
          <div class="summary-loading"><span class="spinner"></span> Loading feedback...</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    let chart = null;
    let currentSentimentFilter = 'all';
    let currentDays = 30;

    // Source badge class mapping
    function sourceClass(source) {
      const map = {
        'Support Ticket': 'source-support',
        'Discord': 'source-discord',
        'GitHub Issue': 'source-github',
        'Email': 'source-email',
        'Twitter': 'source-twitter',
        'Community Forum': 'source-forum',
      };
      return map[source] || 'source-forum';
    }

    // Sentiment icon
    function sentimentIcon(sentiment) {
      if (sentiment === 'positive') return '<span class="sentiment-icon sentiment-positive">&#x1F44D;</span>';
      if (sentiment === 'negative') return '<span class="sentiment-icon sentiment-negative">&#x1F44E;</span>';
      return '<span class="sentiment-icon sentiment-neutral">&#x1F610;</span>';
    }

    // Relative time
    function timeAgo(timestamp) {
      const now = new Date();
      const then = new Date(timestamp.replace(' ', 'T') + 'Z');
      const diffMs = now - then;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) return diffMins + 'm ago';
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return diffHours + 'h ago';
      const diffDays = Math.floor(diffHours / 24);
      return diffDays + 'd ago';
    }

    // ── Load Timeseries Chart ──
    async function loadChart() {
      const params = new URLSearchParams({ days: currentDays });
      if (currentSentimentFilter !== 'all') params.set('sentiment', currentSentimentFilter);
      const res = await fetch('/api/feedback/timeseries?' + params);
      const data = await res.json();

      // Build date-sentiment map
      const dateMap = {};
      data.forEach(row => {
        if (!dateMap[row.date]) dateMap[row.date] = { positive: 0, negative: 0, neutral: 0 };
        dateMap[row.date][row.sentiment] = row.count;
      });

      const dates = Object.keys(dateMap).sort();
      const positive = dates.map(d => dateMap[d].positive || 0);
      const negative = dates.map(d => dateMap[d].negative || 0);
      const neutral = dates.map(d => dateMap[d].neutral || 0);

      const labels = dates.map(d => {
        const dt = new Date(d + 'T00:00:00');
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      });

      if (chart) chart.destroy();

      const datasets = [];
      if (currentSentimentFilter === 'all' || currentSentimentFilter === 'positive') {
        datasets.push({
          label: 'Positive',
          data: positive,
          backgroundColor: 'rgba(22, 163, 74, 0.15)',
          borderColor: '#16a34a',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
        });
      }
      if (currentSentimentFilter === 'all' || currentSentimentFilter === 'negative') {
        datasets.push({
          label: 'Negative',
          data: negative,
          backgroundColor: 'rgba(220, 38, 38, 0.15)',
          borderColor: '#dc2626',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
        });
      }
      if (currentSentimentFilter === 'all' || currentSentimentFilter === 'neutral') {
        datasets.push({
          label: 'Neutral',
          data: neutral,
          backgroundColor: 'rgba(107, 114, 128, 0.15)',
          borderColor: '#6b7280',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
        });
      }

      const ctx = document.getElementById('feedbackChart').getContext('2d');
      chart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 } },
            x: { grid: { display: false } },
          },
          plugins: { legend: { position: 'bottom' } },
        },
      });
    }

    // ── Load AI Summary ──
    async function loadSummary() {
      const el = document.getElementById('summaryContent');
      el.innerHTML = '<span class="spinner"></span> Generating AI summary...';
      el.classList.add('summary-loading');

      try {
        const res = await fetch('/api/feedback/summary?days=' + currentDays);
        const data = await res.json();
        el.textContent = data.summary;
        el.classList.remove('summary-loading');
      } catch (err) {
        el.textContent = 'Failed to generate summary. Please try again.';
        el.classList.remove('summary-loading');
      }
    }

    // ── Load Feedback Feed ──
    async function loadFeed() {
      const el = document.getElementById('feedList');
      el.innerHTML = '<div class="summary-loading"><span class="spinner"></span> Loading feedback...</div>';

      const res = await fetch('/api/feedback?days=' + currentDays + '&limit=30');
      const items = await res.json();

      el.innerHTML = items.map(item => {
        return '<div class="feed-item" onclick="this.classList.toggle(\\'expanded\\')">'
          + '<div class="feed-item-header">'
          + '<span class="source-badge ' + sourceClass(item.source) + '">' + item.source + '</span>'
          + sentimentIcon(item.sentiment)
          + '<span class="feed-time">' + timeAgo(item.timestamp) + '</span>'
          + '</div>'
          + '<div class="feed-content">' + escapeHtml(item.content) + '</div>'
          + '</div>';
      }).join('');
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // ── Event Listeners ──
    document.getElementById('timeFilter').addEventListener('change', (e) => {
      currentDays = parseInt(e.target.value);
      loadAll();
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSentimentFilter = btn.dataset.sentiment;
        loadChart();
      });
    });

    // ── Initial Load ──
    function loadAll() {
      loadChart();
      loadSummary();
      loadFeed();
    }

    loadAll();
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}
