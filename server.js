const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const auth = require('./auth');
const memoryStore = require('./memory');

const ROOT = __dirname;

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match || match[1].startsWith('#')) continue;
    process.env[match[1]] ??= match[2].replace(/^['"]|['"]$/g, '');
  }
}

loadEnv(path.join(ROOT, '.env'));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.FLAGOS_API_KEY || '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function sendFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function requireUser(req, res) {
  const user = auth.getSessionUser(req);
  if (!user) {
    sendJson(res, 401, { error: '请先登录' });
    return null;
  }
  return user;
}

async function summarizeMessages(messages) {
  const response = await fetch('https://api.flagos.net/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.MODEL || 'GLM-5.2',
      messages: [
        {
          role: 'system',
          content: '把下面这段对话压缩成一句适合长期记忆的用户画像摘要。只输出摘要本身，不要加标题，不超过 80 字。'
        },
        ...messages
      ],
      temperature: 0.3,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error('摘要生成失败');
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}

function proxyChat(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (!API_KEY) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('服务端未配置 FLAGOS_API_KEY');
    return;
  }

  if (!requireUser(req, res)) return;

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    const options = {
      hostname: 'api.flagos.net',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const upstream = https.request(options, upstreamRes => {
      res.writeHead(upstreamRes.statusCode || 500, {
        'Content-Type': upstreamRes.headers['content-type'] || 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*'
      });
      upstreamRes.pipe(res);
    });
    upstream.on('error', err => {
      res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`代理请求失败：${err.message}`);
    });
    upstream.write(body);
    upstream.end();
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, model: process.env.MODEL || 'GLM-5.2' }));
    return;
  }

  if (url.pathname === '/api/auth/register' && req.method === 'POST') {
    readBody(req)
      .then(body => sendJson(res, 200, auth.register(JSON.parse(body || '{}'))))
      .catch(() => sendJson(res, 400, { error: '请求格式不正确' }));
    return;
  }

  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    readBody(req)
      .then(body => sendJson(res, 200, auth.login(JSON.parse(body || '{}'))))
      .catch(() => sendJson(res, 400, { error: '请求格式不正确' }));
    return;
  }

  if (url.pathname === '/api/auth/me' && req.method === 'GET') {
    const user = auth.getSessionUser(req);
    if (!user) {
      sendJson(res, 401, { error: '未登录' });
      return;
    }
    sendJson(res, 200, { user: auth.publicUser(user) });
    return;
  }

  if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
    auth.logout(req);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === '/api/memory' && req.method === 'GET') {
    const user = requireUser(req, res);
    if (!user) return;
    sendJson(res, 200, { memory: memoryStore.getMemory(user.id) });
    return;
  }

  if (url.pathname === '/api/memory' && req.method === 'PUT') {
    const user = requireUser(req, res);
    if (!user) return;
    readBody(req)
      .then(body => {
        const payload = JSON.parse(body || '{}');
        sendJson(res, 200, { memory: memoryStore.saveMemory(user.id, payload.memory || payload) });
      })
      .catch(() => sendJson(res, 400, { error: '记忆数据格式不正确' }));
    return;
  }

  if (url.pathname === '/api/memory/summarize' && req.method === 'POST') {
    const user = requireUser(req, res);
    if (!user) return;
    readBody(req)
      .then(async body => {
        const payload = JSON.parse(body || '{}');
        const messages = Array.isArray(payload.messages) ? payload.messages : [];
        const summary = await summarizeMessages(messages);
        sendJson(res, 200, { summary });
      })
      .catch(() => sendJson(res, 500, { error: '摘要生成失败' }));
    return;
  }

  if (url.pathname === '/api/chat/completions' && req.method === 'POST') {
    proxyChat(req, res);
    return;
  }
  const file = path.join(ROOT, url.pathname === '/' ? 'index.html' : url.pathname);
  const relative = path.relative(ROOT, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end();
    return;
  }
  sendFile(res, file);
});

const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`AI 测测已启动：http://${HOST}:${PORT}`);
});
