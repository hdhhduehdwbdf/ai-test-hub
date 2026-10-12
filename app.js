const chat = document.getElementById('chat');
const promptInput = document.getElementById('prompt');
const sendButton = document.getElementById('send');
const promptSuggestionsLabel = document.getElementById('promptSuggestionsLabel');
const promptSuggestionsRow = document.getElementById('promptSuggestionsRow');
const sessionSelect = document.getElementById('sessionSelect');
const newSessionButton = document.getElementById('newSession');
const renameSessionButton = document.getElementById('renameSession');
const deleteSessionButton = document.getElementById('deleteSession');

const systemPromptBase = '你是“AI 测测”的引导助手，帮助用户先理解自己的状态，再判断适合去做“历史人物测验”还是“AI 塔罗占卜”。请用温和、不评判的中文交流。每次回复不超过 5 句。回复结构：先一句共情，再一个关键观察，最后给出一个明确下一步。不要给出医疗、心理治疗、投资或绝对命运判断。如果用户情绪比较低落，先温和承接情绪，再建议慢慢梳理。你的角色是帮用户理清方向，不是替用户做决定。';
const initialQuestions = ['我最近很适合哪种测试？', '帮我分析一下最近的困扰。', '我想测测自己的性格原型。', '我想用塔罗看看当前处境。'];
const followUpQuestions = ['现状梳理', '行动建议'];

let memory = null;
let isSending = false;

function apiBase() {
  return window.AI_TEST_HUB_CONFIG?.apiBase || '';
}

function authHeaders() {
  const token = localStorage.getItem('ai_test_token') || '';
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

function uid(prefix) {
  const random = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random}`;
}

function makeTitle(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '新会话';
  return clean.length > 15 ? `${clean.slice(0, 15)}…` : clean;
}

function activeSession() {
  return memory?.sessions.find((session) => session.id === memory.activeSessionId) || null;
}

function createSessionRecord() {
  const now = new Date().toISOString();
  return { id: uid('s'), title: '新会话', createdAt: now, updatedAt: now, messages: [] };
}
async function loadMemory() {
  const response = await fetch(apiBase() + '/api/memory', { headers: authHeaders() });
  if (response.status === 401) {
    localStorage.removeItem('ai_test_token');
    location.href = apiBase() + '/login.html';
    return;
  }
  const data = await response.json();
  memory = data.memory;

  if (!memory.sessions.length) {
    memory.sessions.push(createSessionRecord());
    memory.activeSessionId = memory.sessions[0].id;
    await saveMemory();
  }

  if (!activeSession()) {
    memory.activeSessionId = memory.sessions[0].id;
  }
}

async function saveMemory() {
  const response = await fetch(apiBase() + '/api/memory', {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify({ memory })
  });
  if (response.status === 401) {
    localStorage.removeItem('ai_test_token');
    location.href = apiBase() + '/login.html';
  }
}

function renderSessionSelect() {
  sessionSelect.innerHTML = '';
  memory.sessions.forEach((session) => {
    const option = document.createElement('option');
    option.value = session.id;
    option.textContent = session.title;
    option.selected = session.id === memory.activeSessionId;
    sessionSelect.appendChild(option);
  });
}

function renderPromptSuggestions(title, items) {
  promptSuggestionsLabel.textContent = title;
  promptSuggestionsRow.innerHTML = '';
  items.forEach((text) => {
    const button = document.createElement('button');
    button.className = 'rounded-full bg-white/80 px-4 py-2 text-sm text-slate-600 ring-1 ring-slate-200 transition hover:bg-white';
    button.textContent = text;
    button.addEventListener('click', () => sendMessage(text));
    promptSuggestionsRow.appendChild(button);
  });
}

function renderAssistantContent(bubble, text) {
  if (!bubble) return;
  if (window.marked && window.DOMPurify) {
    bubble.innerHTML = DOMPurify.sanitize(marked.parse(text || ''));
  } else {
    bubble.textContent = text || '';
  }
}

function createMessage(role, content) {
  const wrapper = document.createElement('div');
  wrapper.className = role === 'user' ? 'flex justify-end' : 'flex justify-start';

  const bubble = document.createElement('div');
  bubble.className = role === 'user'
    ? 'max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-50 px-4 py-2.5 text-slate-900 ring-1 ring-indigo-100'
    : 'max-w-[85%] space-y-2 rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 text-slate-900 ring-1 ring-slate-200';

  if (role === 'assistant') {
    renderAssistantContent(bubble, content || '');
  } else {
    bubble.textContent = content || '';
  }

  wrapper.appendChild(bubble);
  chat.appendChild(wrapper);
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}

function renderActiveSession() {
  chat.innerHTML = '';
  const session = activeSession();

  if (!session || !session.messages.length) {
    createMessage('assistant', '你好，我是 AI 测测助手。告诉我你最近的情况或想测什么，我可以帮你判断从哪个入口开始。');
    renderPromptSuggestions('推荐问', initialQuestions);
    return;
  }

  session.messages.forEach((message) => createMessage(message.role, message.content));
  renderPromptSuggestions('你想先看什么？', followUpQuestions);
}

function buildHistory() {
  const session = activeSession();
  const summary = memory.summary ? `\n你记得的长期摘要：${memory.summary}` : '';
  const systemPrompt = { role: 'system', content: systemPromptBase + summary };
  const recent = (session?.messages || []).slice(-12).map(({ role, content }) => ({ role, content }));
  return [systemPrompt, ...recent];
}

function setSending(value) {
  isSending = value;
  sendButton.disabled = value;
  sendButton.textContent = value ? '思考中…' : '发送';
}
async function summarizeSession(session) {
  if (!session || session.messages.length < 2) return;
  try {
    const response = await fetch(apiBase() + '/api/memory/summarize', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        messages: session.messages.map(({ role, content }) => ({ role, content }))
      })
    });
    if (!response.ok) return;
    const data = await response.json();
    if (data.summary) {
      memory.summary = data.summary;
      await saveMemory();
    }
  } catch {
    // 摘要失败不阻塞主流程
  }
}

async function requestCompletion(bubble) {
  const response = await fetch(window.AI_TEST_HUB_CONFIG.endpoint, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      model: window.AI_TEST_HUB_CONFIG.model,
      messages: buildHistory(),
      temperature: 0.7,
      stream: true
    })
  });

  if (response.status === 401) {
    localStorage.removeItem('ai_test_token');
    location.href = apiBase() + '/login.html';
    return null;
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`请求失败：${response.status} ${detail.slice(0, 180)}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '暂时没有收到回复。';
    renderAssistantContent(bubble, text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
        if (delta) {
          fullText += delta;
          renderAssistantContent(bubble, fullText);
          chat.scrollTop = chat.scrollHeight;
        }
      } catch {
        continue;
      }
    }
  }

  return fullText || '暂时没有收到回复。';
}

async function sendMessage(textOverride) {
  const text = (textOverride ?? promptInput.value).trim();
  if (!text || isSending) return;

  const session = activeSession();
  if (!session) return;

  promptInput.value = '';
  session.messages.push({ role: 'user', content: text, ts: Date.now() });
  if (session.title === '新会话') session.title = makeTitle(text);
  session.updatedAt = new Date().toISOString();
  memory.activeSessionId = session.id;
  createMessage('user', text);
  renderSessionSelect();
  await saveMemory();

  const assistantBubble = createMessage('assistant', '');
  setSending(true);

  try {
    const reply = await requestCompletion(assistantBubble);
    if (reply === null) {
      assistantBubble.parentElement?.remove();
      return;
    }
    session.messages.push({ role: 'assistant', content: reply, ts: Date.now() });
    session.updatedAt = new Date().toISOString();
    await saveMemory();
    renderPromptSuggestions('你想先看什么？', followUpQuestions);
  } catch (error) {
    const bubble = document.createElement('div');
    bubble.className = 'max-w-[85%] rounded-2xl bg-red-500/10 px-4 py-2.5 text-red-200 ring-1 ring-red-400/20';
    bubble.textContent = error.message || '请求失败，请稍后再试。';
    assistantBubble.replaceWith(bubble);
  } finally {
    setSending(false);
    promptInput.focus();
  }
}

async function switchSession(sessionId) {
  const previous = activeSession();
  memory.activeSessionId = sessionId;
  renderSessionSelect();
  renderActiveSession();
  await saveMemory();
  summarizeSession(previous);
}

newSessionButton.addEventListener('click', async () => {
  const previous = activeSession();
  const session = createSessionRecord();
  memory.sessions.unshift(session);
  memory.activeSessionId = session.id;
  await saveMemory();
  renderSessionSelect();
  renderActiveSession();
  summarizeSession(previous);
});

renameSessionButton.addEventListener('click', async () => {
  const session = activeSession();
  if (!session) return;
  const next = window.prompt('重命名会话', session.title);
  if (!next || !next.trim()) return;
  session.title = next.trim().slice(0, 30);
  session.updatedAt = new Date().toISOString();
  await saveMemory();
  renderSessionSelect();
});

deleteSessionButton.addEventListener('click', async () => {
  const session = activeSession();
  if (!session) return;
  if (!window.confirm(`删除「${session.title}」？`)) return;
  memory.sessions = memory.sessions.filter((item) => item.id !== session.id);
  if (!memory.sessions.length) memory.sessions.push(createSessionRecord());
  memory.activeSessionId = memory.sessions[0].id;
  await saveMemory();
  renderSessionSelect();
  renderActiveSession();
});

sessionSelect.addEventListener('change', (event) => switchSession(event.target.value));
window.addEventListener('switch-session', (event) => {
  if (event.detail) switchSession(event.detail);
});
sendButton.addEventListener('click', () => sendMessage());
promptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

(async function init() {
  await loadMemory();
  renderSessionSelect();
  renderActiveSession();
  document.getElementById('year').textContent = new Date().getFullYear();
})();

