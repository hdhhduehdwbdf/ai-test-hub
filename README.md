# AI 测测

一个前后端分离结构的测试合集入口：

- 前端：`index.html` + `app.js` + `config.js`
- 后端：`server.js`
- 模型调用：由后端代理到 FlagOS API

## 目录结构

```text
ai-test-hub/
├─ index.html          # 页面结构
├─ app.js              # 对话与交互逻辑
├─ config.js           # 前端运行配置
├─ server.js           # 后端服务与 API 代理
├─ .env                # 本地环境变量（不要提交）
├─ .env.example        # 环境变量示例
└─ package.json
```

## 启动

```bash
npm start
```

浏览器打开 `http://localhost:3000`。

## 后端接口

- `GET /api/health`：健康检查
- `POST /api/auth/register`：注册（名字、性别、密码）
- `POST /api/auth/login`：登录（名字、密码）
- `GET /api/auth/me`：获取当前用户
- `POST /api/auth/logout`：退出登录
- `GET /api/memory`：读取当前用户记忆
- `PUT /api/memory`：保存当前用户记忆
- `POST /api/memory/summarize`：生成跨会话摘要
- `POST /api/chat/completions`：代理模型对话请求

## 简单账号系统

- 用户用名字、性别、密码区分
- 密码经过 scrypt 哈希，不存明文
- 登录状态使用会话 token
- 用户数据保存在 `data/users.json`
- 部署到免费平台时文件系统可能重置，后续建议迁移到数据库

## 记忆层

- 每个用户独立保存记忆，路径为 `data/memory/<userId>.json`
- 支持多会话：新建、切换、重命名、删除
- 会话包含 `id / title / createdAt / updatedAt / messages`
- `messages` 只保存 `user` 和 `assistant`，不保存 system prompt
- 跨会话摘要保存在 `summary`
- 长期画像预留在 `profile.tags / profile.testResults / profile.prefs`

## 安全说明

模型密钥只放在后端 `.env` 中，不会发送到浏览器。

## 部署到 Render

1. 把代码推到 GitHub 仓库
2. 在 Render 新建 Web Service，选择该仓库
3. Build Command 填 `npm install`
4. Start Command 填 `npm start`
5. 在 Environment 中添加 `FLAGOS_API_KEY`
6. 部署完成后访问 Render 提供的公网地址

也可以直接使用仓库里的 `render.yaml` 进行 Blueprint 部署。

## 部署到 Railway

1. 新建项目并关联 GitHub 仓库
2. Railway 会自动识别 Node 项目
3. 在 Variables 中添加 `FLAGOS_API_KEY`
4. 启动命令保持 `npm start`

## 部署到 Fly.io

```bash
fly launch
fly secrets set FLAGOS_API_KEY=你的密钥
fly deploy
```

仓库已提供 `Dockerfile` 和 `fly.toml`。

## 部署到 Docker

```bash
docker build -t ai-test-hub .
docker run -p 3000:3000 -e FLAGOS_API_KEY=你的密钥 ai-test-hub
```
