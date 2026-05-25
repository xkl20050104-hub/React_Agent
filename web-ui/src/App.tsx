import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type AgentResponse = {
  session_id: string
  status: 'interrupted' | 'completed' | 'error' | 'running' | 'idle'
  timestamp?: number
  message?: string
  result?: {
    messages?: Array<{ role?: string; content?: string }>
    [key: string]: unknown
  }
  interrupt_data?: {
    description?: string
    action_request?: {
      action?: string
      args?: unknown
    }
    [key: string]: unknown
  }
}

type SessionStatus = {
  user_id: string
  session_id?: string
  status: string
  message?: string
  last_query?: string
  last_updated?: number
  last_response?: AgentResponse
}

const API_BASE_URL = 'http://localhost:8002'

const defaultSystemMessage =
  '你会使用工具来帮助用户。如果工具使用被拒绝，请提示用户。'

function createSessionId() {
  return crypto.randomUUID()
}

function App() {
  const [apiBaseUrl, setApiBaseUrl] = useState(API_BASE_URL)
  const [userId, setUserId] = useState(`user_${Math.floor(Date.now() / 1000)}`)
  const [sessionId, setSessionId] = useState<string>(createSessionId())
  const [query, setQuery] = useState('')
  const [memoryInfo, setMemoryInfo] = useState('')
  const [interruptEditArgs, setInterruptEditArgs] = useState('{}')
  const [interruptResponseText, setInterruptResponseText] = useState('')
  const [loading, setLoading] = useState(false)

  const [currentResponse, setCurrentResponse] = useState<AgentResponse | null>(null)
  const [currentStatus, setCurrentStatus] = useState<SessionStatus | null>(null)
  const [userSessionIds, setUserSessionIds] = useState<string[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [streamingAnswer, setStreamingAnswer] = useState('')

  const pushLog = (msg: string) => {
    setLogs((prev) => [`${new Date().toLocaleTimeString()} - ${msg}`, ...prev].slice(0, 30))
  }

  const finalAnswer = useMemo(() => {
    const messages = currentResponse?.result?.messages
    if (!messages || messages.length === 0) return ''
    const last = messages[messages.length - 1]
    return last?.content ?? ''
  }, [currentResponse])

  useEffect(() => {
    if (!finalAnswer) {
      setStreamingAnswer('')
      return
    }

    let index = 0
    const timer = window.setInterval(() => {
      index += 1
      setStreamingAnswer(finalAnswer.slice(0, index))
      if (index >= finalAnswer.length) {
        window.clearInterval(timer)
      }
    }, 18)

    return () => window.clearInterval(timer)
  }, [finalAnswer])

  async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${apiBaseUrl}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`)
    }
    return res.json() as Promise<T>
  }

  async function fetchActiveSessionId() {
    setLoading(true)
    try {
      const data = await requestJson<{ active_session_id: string }>(`/agent/active/sessionid/${userId}`)
      if (data.active_session_id) {
        setSessionId(data.active_session_id)
        pushLog(`已恢复最近会话：${data.active_session_id}`)
      } else {
        const newId = createSessionId()
        setSessionId(newId)
        pushLog(`当前用户无历史会话，创建新会话：${newId}`)
      }
    } catch (error) {
      pushLog(`获取最近会话失败：${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function fetchUserSessions() {
    setLoading(true)
    try {
      const data = await requestJson<{ session_ids: string[] }>(`/agent/sessionids/${userId}`)
      setUserSessionIds(data.session_ids)
      pushLog(`读取历史会话 ${data.session_ids.length} 条`)
    } catch (error) {
      pushLog(`获取历史会话失败：${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function fetchCurrentSessionStatus() {
    setLoading(true)
    try {
      const data = await requestJson<SessionStatus>(`/agent/status/${userId}/${sessionId}`)
      setCurrentStatus(data)
      setCurrentResponse(data.last_response ?? null)
      pushLog(`会话状态：${data.status}`)
    } catch (error) {
      pushLog(`查询会话状态失败：${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function invokeAgent(e: FormEvent) {
    e.preventDefault()
    const text = query.trim()
    if (!text) return

    setQuery('')
    setLoading(true)
    try {
      const data = await requestJson<AgentResponse>('/agent/invoke', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          session_id: sessionId,
          query: text,
          system_message: defaultSystemMessage,
        }),
      })
      setCurrentResponse(data)
      pushLog(`请求完成：${data.status}`)
      await fetchCurrentSessionStatus()
    } catch (error) {
      pushLog(`提交问题失败：${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function resumeAgent(responseType: 'accept' | 'edit' | 'response' | 'reject') {
    setLoading(true)
    try {
      let args: Record<string, unknown> | undefined
      if (responseType === 'edit') {
        args = { args: JSON.parse(interruptEditArgs) }
      }
      if (responseType === 'response') {
        args = { args: interruptResponseText }
      }

      const data = await requestJson<AgentResponse>('/agent/resume', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          session_id: sessionId,
          response_type: responseType,
          args,
        }),
      })
      setCurrentResponse(data)
      pushLog(`中断处理结果：${data.status}`)
      await fetchCurrentSessionStatus()
    } catch (error) {
      pushLog(`恢复执行失败：${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function writeLongTermMemory() {
    if (!memoryInfo.trim()) return
    setLoading(true)
    try {
      await requestJson<{ status: string; memory_id: string; message: string }>('/agent/write/longterm', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, memory_info: memoryInfo }),
      })
      setMemoryInfo('')
      pushLog('长期记忆写入成功')
    } catch (error) {
      pushLog(`写入长期记忆失败：${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  async function deleteCurrentSession() {
    setLoading(true)
    try {
      await requestJson<{ status: string; message: string }>(`/agent/session/${userId}/${sessionId}`, {
        method: 'DELETE',
      })
      const newId = createSessionId()
      setSessionId(newId)
      setCurrentStatus(null)
      setCurrentResponse(null)
      pushLog(`已删除会话，切换到新会话：${newId}`)
      await fetchUserSessions()
    } catch (error) {
      pushLog(`删除会话失败：${(error as Error).message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1>ReAct Agent Web UI</h1>
        <p>会话控制台</p>
      </header>

      <main className="layout">
        <aside className="card sidebar">
          <h2>连接与会话</h2>
          <label>
            后端地址
            <input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} />
          </label>
          <label>
            用户 ID
            <input value={userId} onChange={(e) => setUserId(e.target.value)} />
          </label>
          <label>
            会话 ID
            <input value={sessionId} onChange={(e) => setSessionId(e.target.value)} />
          </label>
          <div className="sidebar-actions">
            <button onClick={fetchActiveSessionId} disabled={loading}>恢复最近会话</button>
            <button onClick={fetchUserSessions} disabled={loading}>历史会话</button>
            <button onClick={() => setSessionId(createSessionId())} disabled={loading}>新会话</button>
            <button className="danger" onClick={deleteCurrentSession} disabled={loading}>删除会话</button>
          </div>
          <div className="history-list">
            {userSessionIds.map((id) => (
              <button key={id} className="ghost" onClick={() => setSessionId(id)}>
                使用 {id}
              </button>
            ))}
          </div>
        </aside>

        <section className="card content">
          <h2>提问与响应</h2>

          <section className="panel answer-panel">
            <h3>最终回答</h3>
            <pre>{streamingAnswer || '暂无回答'}</pre>
          </section>

          <form onSubmit={invokeAgent}>
            <label>
              用户问题
              <textarea
                rows={3}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="请输入需求，例如：我想在北京海淀区预订如家酒店"
              />
            </label>
            <div className="row submit-row">
              <button type="submit" disabled={loading}>提交问题</button>
            </div>
          </form>

          <section className="panel">
            <h3>状态</h3>
            <p>当前状态：{currentResponse?.status ?? currentStatus?.status ?? '未查询'}</p>
            {currentStatus?.last_updated ? (
              <p>更新时间：{new Date(currentStatus.last_updated * 1000).toLocaleString()}</p>
            ) : null}
            {currentStatus?.last_query ? <p>上次问题：{currentStatus.last_query}</p> : null}
          </section>

          {currentResponse?.status === 'interrupted' && (
            <section className="panel interrupt">
              <h3>人工审批（HITL）</h3>
              <p>{currentResponse.interrupt_data?.description ?? '工具调用等待审批'}</p>
              <p>工具：{currentResponse.interrupt_data?.action_request?.action ?? '未知'}</p>
              <pre>{JSON.stringify(currentResponse.interrupt_data?.action_request?.args, null, 2)}</pre>
              <div className="hint-list">
                <p><strong>yes</strong>：接受当前工具调用</p>
                <p><strong>no</strong>：拒绝本次工具调用</p>
                <p><strong>edit</strong>：修改参数后继续调用（填写下方 JSON）</p>
                <p><strong>response</strong>：不调用工具，直接给 Agent 一段反馈</p>
              </div>
              <div className="row">
                <button onClick={() => resumeAgent('accept')} disabled={loading}>yes / 允许</button>
                <button onClick={() => resumeAgent('reject')} disabled={loading}>no / 拒绝</button>
              </div>
              <label>
                edit 参数（JSON）
                <textarea
                  rows={3}
                  value={interruptEditArgs}
                  onChange={(e) => setInterruptEditArgs(e.target.value)}
                  placeholder='{"hotel_name":"汉庭酒店(软件园店)"}'
                />
                <button onClick={() => resumeAgent('edit')} disabled={loading}>edit / 修改后继续</button>
              </label>
              <label>
                response 文本
                <textarea
                  rows={2}
                  value={interruptResponseText}
                  onChange={(e) => setInterruptResponseText(e.target.value)}
                  placeholder="把酒店名称换为：汉庭酒店(软件园店)，再调用工具预订"
                />
                <button onClick={() => resumeAgent('response')} disabled={loading}>response / 直接反馈</button>
              </label>
            </section>
          )}
        </section>

        <aside className="card sidebar">
          <h2>长期记忆</h2>
          <label>
            偏好内容
            <textarea
              rows={5}
              value={memoryInfo}
              onChange={(e) => setMemoryInfo(e.target.value)}
              placeholder="例如：回答尽量简洁、优先中文。"
            />
          </label>
          <button onClick={writeLongTermMemory} disabled={loading}>写入长期记忆</button>

          <section className="panel">
            <h3>操作日志</h3>
            <ul className="logs">
              {logs.map((line, idx) => (
                <li key={`${line}-${idx}`}>{line}</li>
              ))}
            </ul>
          </section>
        </aside>
      </main>
      <footer className="footer">
        {loading ? '处理中...' : '就绪'}
      </footer>
    </div>
  )
}

export default App
