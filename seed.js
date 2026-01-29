// seed.js — Generates mock feedback data and outputs SQL INSERT statements
// Usage: node seed.js > seed.sql
// Then: wrangler d1 execute feedback-db --file=./seed.sql

const sources = [
  'Support Ticket',
  'Discord',
  'GitHub Issue',
  'Email',
  'Twitter',
  'Community Forum'
];

const feedbackTemplates = {
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
  ]
};

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTimestamp(daysAgo) {
  const now = new Date();
  const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  // Add random hours/minutes within the day
  date.setHours(randomInt(8, 22));
  date.setMinutes(randomInt(0, 59));
  date.setSeconds(randomInt(0, 59));
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

function generateFeedbackItems() {
  const items = [];

  // Generate 75 feedback items
  // Distribution: ~40% positive (30), ~35% negative (26), ~25% neutral (19)
  const sentimentCounts = { positive: 30, negative: 26, neutral: 19 };

  // Create a "bad day" spike — days 10-12 ago get extra negative feedback
  const spikeDays = [10, 11, 12];

  for (const [sentiment, count] of Object.entries(sentimentCounts)) {
    const templates = feedbackTemplates[sentiment];
    for (let i = 0; i < count; i++) {
      let daysAgo;

      // For negative sentiment, cluster some on spike days
      if (sentiment === 'negative' && i < 8) {
        daysAgo = randomChoice(spikeDays) + Math.random() * 0.5;
      } else {
        daysAgo = Math.random() * 30;
      }

      items.push({
        source: randomChoice(sources),
        content: templates[i % templates.length],
        timestamp: generateTimestamp(daysAgo),
        sentiment: sentiment,
        sentiment_score: sentiment === 'positive'
          ? (0.7 + Math.random() * 0.3).toFixed(2)
          : sentiment === 'negative'
            ? (0.7 + Math.random() * 0.3).toFixed(2)
            : (0.4 + Math.random() * 0.2).toFixed(2)
      });
    }
  }

  return items;
}

function escapeSQL(str) {
  return str.replace(/'/g, "''");
}

// Generate and output SQL
const items = generateFeedbackItems();

console.log("-- Mock feedback data for Feedback Aggregator Dashboard");
console.log("-- Generated: " + new Date().toISOString());
console.log("");

for (const item of items) {
  console.log(
    `INSERT INTO feedback (source, content, timestamp, sentiment, sentiment_score) VALUES ('${escapeSQL(item.source)}', '${escapeSQL(item.content)}', '${item.timestamp}', '${item.sentiment}', ${item.sentiment_score});`
  );
}

console.log("");
console.log("-- Total items: " + items.length);
