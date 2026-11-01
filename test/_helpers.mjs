// Jobdar tests — helpers shared by more than one test file: loopback mock model servers and the
// one-rating verdict shorthand. Everything here is offline (127.0.0.1 only).

import http from 'node:http'

// Spin a fake Messages-API server on 127.0.0.1 (loopback = no external network). Returns { url, close }.
export function mockBackend({ reply = 'Fit score: 4.2 (Apply)\nRecommendation: strong SQL match' } = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/health') { res.writeHead(200); res.end('ok'); return }
      if (req.method === 'POST' && req.url === '/v1/messages') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ model: 'mock-2b', content: [{ type: 'text', text: reply }], usage: { input_tokens: 40, output_tokens: 12 } }))
        return
      }
      res.writeHead(404); res.end()
    })
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }))
  })
}

// Mock an OpenAI chat-completions server (Ollama/llamafile shape) on loopback.
export function mockOpenAI({ content = 'Fit score: 4.0 (Apply)\nRecommendation: solid' } = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/api/tags') { res.writeHead(200); res.end('{}'); return }
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ model: 'ollama-qwen', choices: [{ message: { role: 'assistant', content } }], usage: { prompt_tokens: 30, completion_tokens: 9 } }))
        return
      }
      res.writeHead(404); res.end()
    })
    server.listen(0, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) }))
  })
}

// Every rubric criterion at one rating — the shortest way to write a model verdict.
export const ALL = (r) => ({ skills: { rating: r }, experience: { rating: r }, level_fit: { rating: r }, logistics: { rating: r }, education: { rating: r } })
