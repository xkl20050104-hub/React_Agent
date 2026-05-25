# ReAct Agent 多会话智能体系统

基于 **FastAPI + LangGraph + ReAct** 的 Agent 工程实践项目，提供完整的后端 API 与 Web 控制台，支持多用户多会话、HITL 人工审查、MCP 工具接入，以及 PostgreSQL 长短期记忆与 Redis 会话管理。

---

## 这个项目能做什么


| 能力            | 说明                                               |
| ------------- | ------------------------------------------------ |
| **智能对话**      | 用户提问后，Agent 自动推理，按需调用工具并返回结果                     |
| **工具调用**      | 支持自定义工具（酒店预订、计算等）与 MCP 工具（高德地图）                  |
| **HITL 人工审查** | 敏感工具调用前暂停，由用户 approve / reject / edit / response |
| **短期记忆**      | 同一会话内多轮对话上下文，持久化到 PostgreSQL                     |
| **长期记忆**      | 按用户保存偏好信息，跨会话注入系统提示词                             |
| **会话管理**      | Redis 记录会话状态，支持恢复最近会话、切换历史会话                     |


---

## 系统架构

```mermaid
flowchart LR
    A[React Web UI] -->|HTTP| B[FastAPI Backend]
    B --> C[LangGraph ReAct Agent]
    C --> D[Tools: 自定义 + MCP]
    B --> E[(Redis: 会话状态)]
    C --> F[(PostgreSQL: 短期记忆 Checkpointer)]
    C --> G[(PostgreSQL: 长期记忆 Store)]
```



**数据如何关联：**

- **用户 ID** → 长期记忆、Redis 会话索引
- **会话 ID** → 短期记忆（LangGraph `thread_id`）、Redis 会话元数据
- 每次提问时，后端将长期记忆拼入 system prompt，并用 session_id 加载对话历史

---

## 技术栈


| 层级    | 技术                             |
| ----- | ------------------------------ |
| 后端    | Python 3.10+、FastAPI、Uvicorn   |
| Agent | LangGraph、LangChain、ReAct      |
| 存储    | PostgreSQL（记忆）、Redis（会话状态）     |
| 前端    | React 19、TypeScript、Vite       |
| 工具    | MCP（高德地图）、自定义 Function Calling |


---

## 环境要求

- **Python** 3.10 及以上
- **Node.js** 18 及以上
- **Docker**（推荐，用于启动 PostgreSQL 与 Redis）
- **API Key**：
  - 通义千问：`DASHSCOPE_API_KEY`（默认模型）
  - 高德地图：`AMAP_MAPS_API_KEY`（MCP 工具，可选）

---

## 快速启动

按以下顺序操作，约 5 分钟可跑通。

### 1. 克隆并进入项目

```bash
cd react_agent
```

### 2. 配置环境变量

在项目根目录创建或编辑 `.env`：

```env
# 通义千问（默认 LLM，必填）
DASHSCOPE_API_KEY=your_dashscope_api_key

# 高德地图 MCP（使用地图相关工具时必填）
AMAP_MAPS_API_KEY=your_amap_api_key

# 可选：自定义 PostgreSQL 连接
# DB_URI=postgresql://xkl:123456@localhost:5432/postgres?sslmode=disable

# 可选：后端端口（默认 8002）
# PORT=8002
```

### 3. 启动 PostgreSQL 与 Redis

```bash
# PostgreSQL
cd docker/postgresql
docker compose up -d
cd ../..

# Redis
cd docker/redis
docker compose up -d
cd ../..
```

默认配置与 `utils/config.py` 一致：

- PostgreSQL：`localhost:5432`，用户 `xkl`，密码 `123456`，库 `postgres`
- Redis：`localhost:6379`

### 4. 安装 Python 依赖并启动后端

```bash
# 建议使用虚拟环境
pip install -r requirements.txt

python 01_backendServer.py
```

启动成功后，控制台应出现 Agent、Checkpointer、Redis 初始化成功的日志。

- 后端地址：**[http://localhost:8002](http://localhost:8002)**
- API 文档：**[http://localhost:8002/docs](http://localhost:8002/docs)**

### 5. 启动前端

新开一个终端：

```bash
cd web-ui
npm install
npm run dev
```

- 前端地址：**[http://localhost:5173](http://localhost:5173)**
- 默认后端地址已在 UI 中配置为 `http://localhost:8002`，可在左侧修改

### 6. 验证

1. 打开 [http://localhost:5173](http://localhost:5173)
2. 输入问题，例如：「你好」或「帮我查北京海淀区的酒店」
3. 若触发工具调用，会出现 HITL 审批面板，选择允许或拒绝后继续

---

## 配置说明

主要配置位于 `utils/config.py`：


| 配置项                         | 默认值                  | 说明                                           |
| --------------------------- | -------------------- | -------------------------------------------- |
| `LLM_TYPE`                  | `qwen`               | 模型类型：`qwen` / `openai` / `ollama` / `oneapi` |
| `DB_URI`                    | 见 config             | PostgreSQL 连接串，可用环境变量 `DB_URI` 覆盖            |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Redis 地址                                     |
| `PORT`                      | `8002`               | 后端监听端口，可用环境变量 `PORT` 覆盖                      |
| `TTL`                       | `3600`               | Redis 会话过期时间（秒）                              |


模型详细配置见 `utils/llms.py` 中的 `MODEL_CONFIGS`。

---

## Web UI 使用说明


| 区域             | 功能                                      |
| -------------- | --------------------------------------- |
| **左侧 · 连接与会话** | 配置后端地址、用户 ID、会话 ID；恢复/切换/新建/删除会话        |
| **中间 · 提问与响应** | 最终回答（上）→ 用户提问（中）→ 状态（下）；支持流式展示效果        |
| **右侧 · 长期记忆**  | 写入用户偏好，下次提问时自动注入 Agent                  |
| **HITL 面板**    | 工具调用中断时出现，支持 yes / no / edit / response |


**会话操作简要说明：**

- **恢复最近会话**：按用户 ID 找回最近一次更新的 session_id
- **历史会话**：列出该用户所有未过期的会话，点击可切换
- **新会话**：生成新 session_id，短期记忆从零开始，长期记忆不变
- **删除会话**：仅删除 Redis 中的会话记录，不清理 PostgreSQL 对话历史

---

## 典型交互流程

```mermaid
sequenceDiagram
    participant U as 用户
    participant UI as Web UI
    participant API as FastAPI
    participant A as Agent

    U->>UI: 输入问题
    UI->>API: POST /agent/invoke
    API->>A: 读取长期记忆 + 加载短期记忆
    A->>A: LLM 推理，决定是否调工具

    alt 需要调工具（HITL）
        A-->>API: status=interrupted
        API-->>UI: 展示审批面板
        U->>UI: accept / reject / edit / response
        UI->>API: POST /agent/resume
        API->>A: Command(resume) 继续执行
    end

    A-->>API: status=completed
    API-->>UI: 返回最终回答
```



---

## API 参考

### 调用智能体

`POST /agent/invoke`

```json
{
  "user_id": "user_001",
  "session_id": "your-session-uuid",
  "query": "帮我订汉庭酒店",
  "system_message": "你会使用工具来帮助用户。如果工具使用被拒绝，请提示用户。"
}
```

### 恢复 HITL 中断

`POST /agent/resume`

```json
{
  "user_id": "user_001",
  "session_id": "your-session-uuid",
  "response_type": "accept"
}
```

`response_type` 可选：`accept` | `reject` | `edit` | `response`  
`edit` / `response` 需在 `args` 中携带额外参数，详见 `/docs`。

### 其他常用接口


| 方法     | 路径                                      | 说明          |
| ------ | --------------------------------------- | ----------- |
| GET    | `/agent/status/{user_id}/{session_id}`  | 查询会话状态      |
| GET    | `/agent/active/sessionid/{user_id}`     | 获取最近活跃会话 ID |
| GET    | `/agent/sessionids/{user_id}`           | 获取用户历史会话列表  |
| DELETE | `/agent/session/{user_id}/{session_id}` | 删除会话（Redis） |
| POST   | `/agent/write/longterm`                 | 写入长期记忆      |


完整接口说明：**[http://localhost:8002/docs](http://localhost:8002/docs)**

---

## 项目结构

```text
react_agent/
├── 01_backendServer.py      # FastAPI 主服务（Agent、API、会话管理）
├── requirements.txt         # Python 依赖
├── utils/
│   ├── config.py            # 全局配置
│   ├── llms.py              # 多模型初始化
│   └── tools.py             # 工具注册 + HITL 包装
├── web-ui/                  # React 前端
│   └── src/App.tsx          # 主界面
├── docker/
│   ├── postgresql/          # PostgreSQL Docker Compose
│   └── redis/               # Redis Docker Compose
├── logfile/                 # 运行日志
└── .env                     # 环境变量（需自行创建）
```

---

## 常见问题

**Q：后端启动报 PostgreSQL / Redis 连接失败？**  
A：确认 Docker 容器已启动：`docker ps`，并检查 `utils/config.py` 中的连接配置是否与 Docker 一致。

**Q：前端请求 404 或跨域错误？**  
A：确认后端已运行在 8002 端口，且 UI 中「后端地址」填写正确。

**Q：高德工具不可用？**  
A：检查 `.env` 中 `AMAP_MAPS_API_KEY` 是否配置；未配置时地图相关 MCP 工具可能失败。

**Q：刷新页面后对话「丢了」？**  
A：短期记忆在 PostgreSQL 中，需保持 **用户 ID** 不变，并点击「恢复最近会话」或从历史列表选择对应 session_id。

**Q：HITL 中断后如何继续？**  
A：在审批面板选择 yes / no / edit / response；底层由 LangGraph Checkpointer 保存中断状态，Redis 仅记录 `interrupted` 状态供 UI 展示。

---

## 扩展方向

- JWT / RBAC 多租户权限
- 向量检索增强长期记忆
- SSE / WebSocket 真实流式输出
- Tracing、Metrics、Prompt 日志
- 自动化测试与 CI/CD

