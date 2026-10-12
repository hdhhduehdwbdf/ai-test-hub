const userMenuButton = document.getElementById('userMenuButton');
const userMenu = document.getElementById('userMenu');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userGender = document.getElementById('userGender');
const menuUserName = document.getElementById('menuUserName');
const menuUserGender = document.getElementById('menuUserGender');
const logoutButton = document.getElementById('logoutButton');
const panelOverlay = document.getElementById('userPanelOverlay');
const panelEyebrow = document.getElementById('panelEyebrow');
const panelTitle = document.getElementById('panelTitle');
const panelBody = document.getElementById('panelBody');
const panelClose = document.getElementById('panelClose');

function token() {
  try {
    return localStorage.getItem('ai_test_token') || '';
  } catch {
    return '';
  }
}

function apiBase() {
  return window.AI_TEST_HUB_CONFIG?.apiBase || '';
}

function authHeaders(json = false) {
  const value = token();
  const headers = value ? { Authorization: `Bearer ${value}` } : {};
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

function clearSession() {
  try {
    localStorage.removeItem('ai_test_token');
    localStorage.removeItem('ai_test_user');
  } catch {
    // 忽略 localStorage 不可用
  }
}

function closeUserMenu() {
  userMenu?.classList.add('hidden');
}

function toggleUserMenu() {
  userMenu?.classList.toggle('hidden');
}

function showToast(message) {
  const existing = document.querySelector('[data-user-toast]');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.dataset.userToast = '';
  toast.className = 'fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg shadow-slate-300/60';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 1800);
}

function showUser(user) {
  if (!user) return;
  const initials = String(user.name || '').trim().charAt(0) || 'AI';
  userAvatar.textContent = initials.toUpperCase();
  userName.textContent = user.name || '';
  userGender.textContent = user.gender || '';
  menuUserName.textContent = user.name || '';
  menuUserGender.textContent = user.gender || '';
  userName.parentElement?.classList.remove('hidden');
}

async function checkSession() {
  const currentToken = token();
  if (!currentToken) {
    location.replace(apiBase() + '/login.html');
    return;
  }

  try {
    const response = await fetch(apiBase() + '/api/auth/me', { headers: authHeaders() });
    if (!response.ok) {
      clearSession();
      location.replace(apiBase() + '/login.html');
      return;
    }
    const data = await response.json();
    localStorage.setItem('ai_test_user', JSON.stringify(data.user));
    showUser(data.user);
  } catch {
    try {
      const cached = localStorage.getItem('ai_test_user');
      if (cached) showUser(JSON.parse(cached));
    } catch {
      // 忽略本地缓存异常
    }
  }
}

async function getMemory() {
  const response = await fetch(apiBase() + '/api/memory', { headers: authHeaders() });
  if (!response.ok) throw new Error('无法读取记忆');
  return (await response.json()).memory;
}

async function saveMemory(memory) {
  const response = await fetch(apiBase() + '/api/memory', {
    method: 'PUT',
    headers: authHeaders(true),
    body: JSON.stringify({ memory })
  });
  if (!response.ok) throw new Error('保存失败');
  return (await response.json()).memory;
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function field(label, value) {
  const box = el('div', 'rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200');
  box.appendChild(el('p', 'text-xs text-slate-400', label));
  box.appendChild(el('p', 'mt-1 text-sm font-medium text-slate-800', value || '未填写'));
  return box;
}

function actionButton(label, onClick, tone = 'default') {
  const toneClass = tone === 'danger'
    ? 'bg-rose-50 text-rose-600 ring-rose-100 hover:bg-rose-100'
    : 'bg-indigo-50 text-indigo-600 ring-indigo-100 hover:bg-indigo-100';
  const button = el('button', `w-full rounded-2xl px-4 py-3 text-sm font-medium ring-1 transition ${toneClass}`, label);
  button.addEventListener('click', onClick);
  return button;
}

function openPanel(eyebrow, title, render) {
  closeUserMenu();
  panelEyebrow.textContent = eyebrow;
  panelTitle.textContent = title;
  panelBody.innerHTML = '';
  panelOverlay.classList.remove('hidden');
  render(panelBody);
}

function closePanel() {
  panelOverlay.classList.add('hidden');
  panelBody.innerHTML = '';
}

function renderProfile(body) {
  let user = null;
  try { user = JSON.parse(localStorage.getItem('ai_test_user') || 'null'); } catch {}
  body.appendChild(field('名字', user?.name));
  body.appendChild(field('性别', user?.gender));
  body.appendChild(field('账号 ID', user?.id));
  body.appendChild(el('p', 'text-xs leading-6 text-slate-500', '当前是轻量账号模式，后续可以接入邮箱、头像和更多资料。'));
}

async function renderMemory(body) {
  body.appendChild(el('p', 'text-sm text-slate-500', '正在读取记忆...'));
  try {
    const memory = await getMemory();
    body.innerHTML = '';
    body.appendChild(field('会话数量', String(memory.sessions.length)));
    body.appendChild(field('跨会话摘要', memory.summary || '还没有生成摘要'));
    body.appendChild(field('用户标签', memory.profile.tags?.join('、') || '暂无标签'));
    body.appendChild(field('回复偏好', memory.profile.prefs?.tone || '温和'));
    body.appendChild(actionButton('刷新记忆', () => renderMemory(body)));
  } catch {
    body.innerHTML = '';
    body.appendChild(el('p', 'text-sm text-rose-600', '读取失败，请稍后再试。'));
  }
}

async function renderSessions(body) {
  body.appendChild(el('p', 'text-sm text-slate-500', '正在读取会话...'));
  try {
    const memory = await getMemory();
    body.innerHTML = '';
    if (!memory.sessions.length) {
      body.appendChild(el('p', 'text-sm text-slate-500', '还没有历史会话。'));
      return;
    }
    memory.sessions.forEach((session) => {
      const row = el('button', 'w-full rounded-2xl bg-slate-50 px-4 py-3 text-left ring-1 ring-slate-200 transition hover:bg-white');
      row.appendChild(el('p', 'text-sm font-medium text-slate-800', session.title || '新会话'));
      row.appendChild(el('p', 'mt-1 text-xs text-slate-500', `${session.messages?.length || 0} 条消息 · ${new Date(session.updatedAt || session.createdAt).toLocaleString()}`));
      row.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('switch-session', { detail: session.id }));
        closePanel();
      });
      body.appendChild(row);
    });
  } catch {
    body.innerHTML = '';
    body.appendChild(el('p', 'text-sm text-rose-600', '读取失败，请稍后再试。'));
  }
}

async function renderTests(body) {
  let results = [];
  try {
    const memory = await getMemory();
    results = memory.profile.testResults || [];
  } catch {}
  if (!results.length) {
    body.appendChild(el('p', 'text-sm leading-7 text-slate-500', '还没有已保存的测试结果。完成历史人物测验或塔罗后，结果会出现在这里。'));
  } else {
    results.forEach((item) => {
      body.appendChild(field(item.type || '测试结果', item.name || '未命名结果'));
    });
  }
  body.appendChild(actionButton('去做历史人物测验', () => window.open('https://history-persona-quiz.pages.dev', '_blank')));
  body.appendChild(actionButton('去做 AI 塔罗占卜', () => window.open('https://tarocard.pages.dev', '_blank')));
}
async function renderPreferences(body) {
  body.appendChild(el('p', 'text-sm text-slate-500', '正在读取偏好...'));
  try {
    const memory = await getMemory();
    body.innerHTML = '';
    body.appendChild(el('p', 'text-sm font-medium text-slate-700', '回复语气'));
    ['温和', '直接', '简洁'].forEach((tone) => {
      const active = (memory.profile.prefs?.tone || '温和') === tone;
      const button = el('button', `w-full rounded-2xl px-4 py-3 text-sm font-medium ring-1 transition ${active ? 'bg-indigo-50 text-indigo-600 ring-indigo-200' : 'bg-slate-50 text-slate-600 ring-slate-200 hover:bg-white'}`, tone);
      button.addEventListener('click', async () => {
        memory.profile.prefs = { ...(memory.profile.prefs || {}), tone };
        await saveMemory(memory);
        showToast(`已切换为「${tone}」语气`);
        renderPreferences(body);
      });
      body.appendChild(button);
    });
  } catch {
    body.innerHTML = '';
    body.appendChild(el('p', 'text-sm text-rose-600', '读取失败，请稍后再试。'));
  }
}

async function renderAppearance(body) {
  body.appendChild(el('p', 'text-sm text-slate-500', '正在读取外观设置...'));
  try {
    const memory = await getMemory();
    body.innerHTML = '';
    body.appendChild(el('p', 'text-sm font-medium text-slate-700', '界面密度'));
    ['紧凑', '舒适', '宽松'].forEach((density) => {
      const active = (memory.profile.prefs?.density || '舒适') === density;
      const button = el('button', `w-full rounded-2xl px-4 py-3 text-sm font-medium ring-1 transition ${active ? 'bg-indigo-50 text-indigo-600 ring-indigo-200' : 'bg-slate-50 text-slate-600 ring-slate-200 hover:bg-white'}`, density);
      button.addEventListener('click', async () => {
        memory.profile.prefs = { ...(memory.profile.prefs || {}), density };
        await saveMemory(memory);
        applyDensity(density);
        showToast(`界面密度已切换为「${density}」`);
        renderAppearance(body);
      });
      body.appendChild(button);
    });
  } catch {
    body.innerHTML = '';
    body.appendChild(el('p', 'text-sm text-rose-600', '读取失败，请稍后再试。'));
  }
}

function applyDensity(density) {
  const sizes = { 紧凑: '14px', 舒适: '16px', 宽松: '18px' };
  document.documentElement.style.fontSize = sizes[density] || '16px';
}

async function renderPrivacy(body) {
  body.appendChild(el('p', 'text-sm text-slate-500', '正在读取数据设置...'));
  try {
    const memory = await getMemory();
    body.innerHTML = '';

    body.appendChild(field('记忆开关', memory.profile.prefs?.memoryEnabled === false ? '已关闭' : '已开启'));
    body.appendChild(actionButton(memory.profile.prefs?.memoryEnabled === false ? '开启记忆' : '关闭记忆', async () => {
      memory.profile.prefs = { ...(memory.profile.prefs || {}), memoryEnabled: memory.profile.prefs?.memoryEnabled === false };
      await saveMemory(memory);
      showToast('记忆开关已更新');
      renderPrivacy(body);
    }));

    body.appendChild(actionButton('导出我的数据', () => {
      const blob = new Blob([JSON.stringify(memory, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ai-test-memory.json';
      link.click();
      URL.revokeObjectURL(url);
    }));

    body.appendChild(actionButton('清空全部记忆', async () => {
      if (!window.confirm('确定清空全部会话与记忆吗？')) return;
      const empty = {
        version: 1,
        activeSessionId: null,
        summary: '',
        profile: { tags: [], testResults: [], prefs: { tone: '温和' } },
        sessions: []
      };
      await saveMemory(empty);
      showToast('记忆已清空');
      renderPrivacy(body);
    }, 'danger'));
  } catch {
    body.innerHTML = '';
    body.appendChild(el('p', 'text-sm text-rose-600', '读取失败，请稍后再试。'));
  }
}

userMenuButton?.addEventListener('click', (event) => {
  event.stopPropagation();
  toggleUserMenu();
});

document.addEventListener('click', (event) => {
  if (!userMenu || !userMenuButton) return;
  if (userMenu.classList.contains('hidden')) return;
  if (!userMenu.contains(event.target) && !userMenuButton.contains(event.target)) closeUserMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeUserMenu();
    closePanel();
  }
});

panelClose?.addEventListener('click', closePanel);
panelOverlay?.addEventListener('click', (event) => {
  if (event.target === panelOverlay) closePanel();
});

document.querySelectorAll('.menu-item').forEach((item) => {
  item.addEventListener('click', () => {
    const action = item.dataset.action;
    if (action === 'profile') openPanel('个人中心', '基本资料', renderProfile);
    if (action === 'memory') openPanel('个人中心', '我的记忆', renderMemory);
    if (action === 'sessions') openPanel('个人中心', '我的会话', renderSessions);
    if (action === 'tests') openPanel('个人中心', '我的测试', renderTests);
    if (action === 'preferences') openPanel('设置', '偏好设置', renderPreferences);
    if (action === 'appearance') openPanel('设置', '外观与字体', renderAppearance);
    if (action === 'privacy') openPanel('设置', '数据与隐私', renderPrivacy);
    if (action === 'security') openPanel('设置', '安全设置', renderProfile);
  });
});

logoutButton?.addEventListener('click', async () => {
  try {
    await fetch(apiBase() + '/api/auth/logout', {
      method: 'POST',
      headers: authHeaders()
    });
  } finally {
    clearSession();
    location.replace(apiBase() + '/login.html');
  }
});

checkSession();

