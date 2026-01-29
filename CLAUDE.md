# CLAUDE.md — Feedback Aggregator Dashboard

## Project Context

The goal is to prototype a tool using CloudFlare products that helps Product managers aggregate and analyse customer feedback from multiple sources to derive meaningful insights.

**Important constraint:** The build phase is time-boxed to **2 hours maximum**. Prioritise a working deployed prototype over feature completeness. A simple working dashboard beats an ambitious broken one.

**What matters most:** Cloudflare explicitly states they value "a broken prototype with brilliant product critique over a perfect prototype with no feedback." The prototype demonstrates building capability and how I approach and review it.

---

## Project Overview

### What We're Building

A dashboard that aggregates mock customer feedback from multiple sources and provides:

1. **AI-generated summary** — A natural language summary of feedback themes and sentiment patterns over a selected time period
2. **Time-series visualisation** — A chart plotting feedback volume over time, with additional filters by sentiment (positive/negative). This is to give the product manager an idea of issue spikes
3. **Latest feedback feed** — A scrollable list showing recent feedback items with source, sentiment, and content


### Mock Feedback Sources

Generate synthetic feedback simulating these channels:
- Customer Support Tickets
- Discord messages
- GitHub Issues
- Email
- X/Twitter
- Community Forum posts

Each feedback item should include:
- `id` — Unique identifier
- `source` — One of the channels above
- `content` — The feedback text (varying in sentiment and topic)
- `timestamp` — Date/time created (spread across the past 30 days)
- `sentiment` — To be populated by Workers AI analysis (positive/negative/neutral)
- `sentiment_score` — Numeric confidence score from AI analysis

---

## Technical Requirements

### Cloudflare Products to Use

| Product | Purpose |
|---------|---------|
| **Workers** | Host the application (required) |
| **Workers AI** | Sentiment analysis on feedback content |
| **D1 Database** | Store feedback items and analysis results |

Add additional Cloudflare products only if genuinely needed for core functionality.

### Tech Stack

- **Backend:** Cloudflare Workers (JavaScript)
- **Database:** D1 with SQL schema
- **AI:** Workers AI for sentiment classification
- **Frontend:** Simple HTML/CSS served from the Worker — no frameworks
- **Visualisation:** Lightweight charting (Chart.js via CDN or similar)

### File Structure

```
/
├── src/
│   └── index.js          # Main Worker: routes, API handlers, HTML serving
├── schema.sql            # D1 database schema
├── seed.js               # Script to generate and insert mock data
├── wrangler.jsonc        # Cloudflare configuration with bindings
├── package.json
└── README.md
```

Keep it simple. A single `index.js` file is acceptable if it remains readable.

---

## Database Schema

```sql
CREATE TABLE feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME NOT NULL,
    sentiment TEXT,
    sentiment_score REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_timestamp ON feedback(timestamp);
CREATE INDEX idx_feedback_sentiment ON feedback(sentiment);
CREATE INDEX idx_feedback_source ON feedback(source);
```

---

## API Endpoints

The Worker should handle these routes:

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/` | Serve the dashboard HTML |
| GET | `/api/feedback` | Return all feedback items (with optional query params for filtering) |
| GET | `/api/feedback/summary` | Return AI-generated summary of recent feedback |
| GET | `/api/feedback/timeseries` | Return aggregated counts by date and sentiment for charting |
| POST | `/api/feedback/seed` | Populate database with mock data (for testing) |

---

## Mock Data Generation

Create **50-100 mock feedback items** with random but realistic variation:

### Content Themes (vary across these topics)
- Performance issues ("The site is slow", "Pages take forever to load")
- Feature requests ("Would love to see...", "Can you add...")
- Positive experiences ("Love the new dashboard", "Great support response")
- Bug reports ("Getting an error when...", "Something broke...")
- Pricing concerns ("Too expensive", "Wish there was a free tier")
- Documentation feedback ("Docs are confusing", "Great tutorial on...")

### Sentiment Distribution
- ~40% positive
- ~35% negative  
- ~25% neutral

### Time Distribution
- Spread across the past 30 days
- Include some clustering (e.g., spike in negative feedback on certain days) to make the time-series visualisation interesting

### Source Distribution
Roughly equal distribution across all six sources, with slight variation.

---

## Dashboard UI Specifications

### Layout

```
+----------------------------------------------------------+
|  Feedback Aggregator Dashboard              [Time Filter] |
+----------------------------------------------------------+
|                                                          |
|  +----------------------------------------------------+  |
|  |              TIME-SERIES CHART                     |  |
|  |    (Line/bar chart: feedback count over time)      |  |
|  |    [Filter: All | Positive | Negative | Neutral]   |  |
|  +----------------------------------------------------+  |
|                                                          |
|  +------------------------+  +-------------------------+ |
|  |    AI SUMMARY          |  |    LATEST FEEDBACK      | |
|  |                        |  |                         | |
|  |  "Over the past week,  |  |  [Discord] 👍 2h ago   | |
|  |   users have been..."  |  |  "Love the new..."     | |
|  |                        |  |                         | |
|  |  Key themes:           |  |  [GitHub] 👎 3h ago    | |
|  |  • Performance (12)    |  |  "Getting error..."    | |
|  |  • Features (8)        |  |                         | |
|  |  • Pricing (5)         |  |  [Email] 😐 5h ago     | |
|  |                        |  |  "Question about..."   | |
|  +------------------------+  +-------------------------+ |
|                                                          |
+----------------------------------------------------------+
```

### Styling Guidelines

- Clean, minimal design
- White background, subtle borders
- System font stack (no custom fonts to load)
- Responsive but desktop-first (PM tool, likely used on laptop)
- Sentiment indicators: green for positive, red for negative, grey for neutral
- Source labels with subtle background colours to distinguish channels

### Interactivity

- Time filter dropdown (Last 7 days / Last 14 days / Last 30 days)
- Sentiment filter buttons for the chart
- Clicking a feedback item could expand to show full content (nice-to-have, not essential)

---

## Workers AI Integration

Use the `@cf/meta/llama-3-8b-instruct` model (or similar available model) for:

### 1. Sentiment Analysis

For each feedback item, classify sentiment:

```javascript
const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
    prompt: `Classify the sentiment of this customer feedback as exactly one of: positive, negative, or neutral. Respond with only that single word.

Feedback: "${feedbackContent}"

Sentiment:`
});
```

### 2. Summary Generation

For the AI summary panel:

```javascript
const response = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
    prompt: `You are a product manager analysing customer feedback. Based on the following feedback items from the past ${days} days, provide a brief summary (2-3 sentences) of the overall sentiment and key themes.

Feedback:
${feedbackItems.map(f => `- [${f.source}] ${f.content}`).join('\n')}

Summary:`
});
```

---

## Deployment Checklist

Before considering the build phase complete:

- [ ] `wrangler.jsonc` configured with D1 and Workers AI bindings
- [ ] Database schema applied to D1
- [ ] Mock data seeded to database
- [ ] Sentiment analysis runs on feedback items
- [ ] Dashboard loads at deployed URL
- [ ] Time-series chart renders with real data
- [ ] Latest feedback feed displays items with sentiment
- [ ] AI summary generates and displays
- [ ] **Screenshot taken of Workers Bindings page in Cloudflare dashboard**
- [ ] **Code pushed to GitHub repository**
- [ ] **Deployed URL confirmed working**

---

## What NOT To Do

- **Do not** use React, Vue, or any frontend framework — plain HTML/CSS only
- **Do not** implement user authentication
- **Do not** spend time on perfect error handling — basic try/catch is sufficient
- **Do not** add features beyond the three core components (chart, feed, summary)
- **Do not** optimise prematurely — get it working first
- **Do not** spend more than 2 hours on the build phase

---

## Commands Reference

```bash
# Create new Cloudflare project
npm create cloudflare@latest feedback-aggregator

# Navigate to project
cd feedback-aggregator

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create feedback-db

# Apply schema to database
wrangler d1 execute feedback-db --file=./schema.sql

# Run locally for testing
wrangler dev

# Deploy to Cloudflare
wrangler deploy
```

---

## Example wrangler.jsonc Configuration

```jsonc
{
    "name": "feedback-aggregator",
    "main": "src/index.js",
    "compatibility_date": "2024-01-01",
    "d1_databases": [
        {
            "binding": "DB",
            "database_name": "feedback-db",
            "database_id": "<your-database-id>"
        }
    ],
    "ai": {
        "binding": "AI"
    }
}
```

---

## Success Criteria

The prototype is successful if:

1. A PM can visit the deployed URL and see aggregated feedback insights
2. The dashboard clearly shows sentiment patterns over time
3. The AI summary provides actionable insight about feedback themes
4. The solution uses Workers, Workers AI, and D1 as specified
5. The code is simple enough to explain in an architecture overview

---

## Notes for Claude Code

- Prioritise working code over perfect code
- If stuck on something for more than 10 minutes, simplify the approach
- Test deployment early — don't wait until the end
- Generate realistic mock data that tells a story (include a "bad day" with negative feedback spike)
- Keep the HTML inline in the Worker for simplicity unless it becomes unwieldy
- Use CDN links for any external libraries (Chart.js)
- Begin by connecting to CloudFlares documentation MCP server (https://docs.mcp.cloudflare.com/mcp), which you will use to reference for how to correctly utilise each cloudflare product needed in this project
