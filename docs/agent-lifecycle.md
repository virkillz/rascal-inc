# Agent Lifecycle

Agents in rascal-inc are **reactive** — they only run when explicitly invoked. There is no background loop, no autonomy, and no hook system where agents self-trigger. Every agent run originates from one of three entry points.

---

## Three Triggering Paths

### 1. Human Chat (manual)

The user types a message in the UI.

```
User types message
  → POST /api/agents/:id/chat { message }
  → chat.ts router persists user message to chat_messages
  → chatWithAgent(agent, message, model)
  → Pi SDK session.prompt(message)
  → agent:thinking → [LLM runs] → agent:reply → agent:idle
  → reply persisted to chat_messages
  → res.json({ reply })
```

This is the only synchronous path — the HTTP response waits for the full reply before returning.

### 2. Scheduler (cron-based)

Defined per-agent in the `agent_schedules` table. The scheduler polls every 60 seconds.

```
setInterval (60s)
  → query agent_schedules WHERE enabled = 1 AND next_run_at <= now
  → for each due schedule:
      → advance next_run_at (crash-safe — done before firing)
      → emit schedule:fired event (UI notification)
      → insert synthetic "user" message: "[Scheduled: label] prompt"
      → chatWithAgent(agent, triggerMsg, model) — fire-and-forget
      → reply persisted to chat_messages
```

The scheduler fires at most once per minute and does **not** wait for the previous run to complete before firing overlapping schedules.

### 3. Pipeline Orchestrator (programmatic)

Templates implement `PipelineRunner`. When a project is started, the runner calls `chatWithAgent()` directly to drive agents through pipeline stages.

```
POST /api/projects/:id/start
  → pipeline-manager gets the template's PipelineRunner
  → runner.start(projectId, input)
      → runner calls chatWithAgent(agentRecord, stagePrompt, model)
      → emits pipeline:stage events as stages progress
      → if approval needed: emits gate:created, suspends

POST /api/gates/:id/decide { action, feedback }
  → runner.resume(projectId, gateId, decision)
      → continues calling chatWithAgent() for remaining stages
```

The pipeline is responsible for sequencing — it knows which agent to call, with what prompt, and in what order.

---

## Session Model

All three paths converge on `chatWithAgent()` in `agent-runner.ts`. This function manages a **persistent Pi SDK session per agent** (the `liveSessions` map).

- **First call**: creates a new session (`createLiveSession`), assembles the system prompt from agent config + current memory + open todos.
- **Subsequent calls**: reuses the existing session — the LLM retains conversation context across all trigger types.
- **Session reset**: only happens on explicit `DELETE /api/agents/:id/chat` or on error.

The system prompt is assembled **once at session creation**, not on every message. If memory or todos change after a session is live, those changes won't be visible to the agent until the session is reset.

---

## What Does NOT Exist (Yet)

- **Event-driven hooks**: agents cannot subscribe to system events (e.g., "trigger when a file is written to workspace"). The EventBus is frontend-facing only.
- **Agent-to-agent messaging**: agents cannot directly trigger each other. Only the pipeline runner can orchestrate multi-agent workflows.
- **External webhooks**: no inbound webhook endpoint to trigger an agent from outside the process.
- **Reactive scheduling**: schedules are fixed cron expressions — there is no "trigger after X happens" pattern.

---

## Summary

| Trigger | Who initiates | Async? | Entry point |
|---|---|---|---|
| Chat | Human via UI | No (awaits reply) | `POST /api/agents/:id/chat` |
| Scheduler | Clock (60s poll) | Yes (fire-and-forget) | `scheduler.ts` setInterval |
| Pipeline | Template code | Yes | `PipelineRunner.start()` / `.resume()` |
