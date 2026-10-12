const fs = require('fs');
const path = require('path');

const MEMORY_DIR = path.join(__dirname, 'data', 'memory');

function ensureStore() {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function fileFor(userId) {
  return path.join(MEMORY_DIR, `${userId}.json`);
}

function defaultMemory() {
  return {
    version: 1,
    activeSessionId: null,
    summary: '',
    profile: {
      tags: [],
      testResults: [],
      prefs: { tone: '温和' }
    },
    sessions: []
  };
}

function getMemory(userId) {
  ensureStore();
  const file = fileFor(userId);
  if (!fs.existsSync(file)) return defaultMemory();
  try {
    const memory = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      ...defaultMemory(),
      ...memory,
      profile: { ...defaultMemory().profile, ...(memory.profile || {}) },
      sessions: Array.isArray(memory.sessions) ? memory.sessions : []
    };
  } catch {
    return defaultMemory();
  }
}

function saveMemory(userId, memory) {
  ensureStore();
  const safe = {
    ...defaultMemory(),
    ...memory,
    profile: { ...defaultMemory().profile, ...(memory.profile || {}) },
    sessions: Array.isArray(memory.sessions) ? memory.sessions : []
  };
  fs.writeFileSync(fileFor(userId), JSON.stringify(safe, null, 2), 'utf8');
  return safe;
}

module.exports = { getMemory, saveMemory, defaultMemory };

