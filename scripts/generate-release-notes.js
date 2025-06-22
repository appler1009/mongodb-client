const { execSync } = require('child_process');
const fs = require('fs');
const fetch = require('node-fetch');

const API_URL = 'https://api.x.ai/v1/chat/completions';
const API_KEY = process.env.XAI_API_KEY;

async function generateReleaseNotes() {
  // Fetch commits since last tag
  const lastTag = execSync('git describe --tags --abbrev=0').toString().trim();
  const commits = execSync(`git log ${lastTag}..HEAD --pretty=%B`).toString().trim();

  // Prepare prompt for Grok
  const prompt = `Summarize the following commit messages into concise, professional release notes in Markdown format, grouping by features, bug fixes, and chores:\n\n${commits}`;

  // Call Grok API
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-3-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 250,
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  const releaseNotes = data.choices[0]?.message?.content || 'No release notes generated.';

  // Save to file
  fs.writeFileSync('RELEASE_NOTES.md', releaseNotes);
  console.log('Release notes saved to RELEASE_NOTES.md');
}

generateReleaseNotes().catch(console.error);
