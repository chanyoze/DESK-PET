/**
 * 로컬 알림 수신 서버
 * -------------------------------------------------------------
 * 외부 도구(예: Claude Code 훅, 빌드 스크립트)가 캐릭터에게 말을 시킬 수 있게
 * 127.0.0.1 에만 바인딩한 작은 HTTP 서버를 연다.
 *
 *   curl -X POST http://127.0.0.1:45678/say -d "{\"text\":\"빌드 끝났어\"}"
 *   curl "http://127.0.0.1:45678/say?text=%EB%81%9D&mood=happy"
 *
 * mood: normal | happy | alert   (캐릭터가 어떤 애니메이션으로 반응할지)
 *
 * /claude — Claude Code 훅이 stdin 으로 받은 JSON 을 그대로 POST 한다 (src/claude-hooks.js).
 *           무슨 말을 할지는 앱이 hook_event_name 등을 보고 정한다.
 *           응답에 needWindow(세션 id)가 있으면 훅이 터미널 창을 찾아 /claude-window 로 알려 준다.
 *
 * /todo · /note — 다른 프로그램(다른 Claude 세션 · deskpet.ps1 todo/note)이 할 일 · 스티커 메모를 넣는다.
 *           JSON POST 만, 브라우저가 보낸 요청(Origin 헤더)은 거절한다 — 열어 둔 웹페이지가 몰래 넣지 못하게.
 *           (브라우저는 다른 출처로 Content-Type: application/json 을 보내려면 먼저 허락을 묻는데 우리는 답하지 않는다)
 */
const http = require('http');

/** 요청 본문을 Buffer 로 모아 UTF-8 로 한 번에 디코드한다 */
function readBody(req, limit, cb) {
  // 문자열로 이어붙이면 청크 경계에서 한글 같은 멀티바이트 문자가 깨진다.
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > limit) return req.destroy();
    chunks.push(c);
  });
  req.on('end', () => cb(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '')));
}

function start(port, onMessage, onClaude, onInbox) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (url.pathname === '/ping') {
      res.end(JSON.stringify({ ok: true, app: 'deskpet' }));
      return;
    }
    if ((url.pathname === '/claude' || url.pathname === '/claude-window') && req.method === 'POST') {
      // Stop 의 last_assistant_message 가 길 수 있어서 한도를 넉넉히 둔다
      readBody(req, 1024 * 1024, (body) => {
        let ev;
        try {
          ev = JSON.parse(body);
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: 'JSON 아님' }));
          return;
        }
        const extra = onClaude ? onClaude(ev, url.pathname === '/claude-window' ? 'window' : 'event') : null;
        res.end(JSON.stringify({ ok: true, ...(extra || {}) }));
      });
      return;
    }
    if ((url.pathname === '/todo' || url.pathname === '/note') && onInbox) {
      const ct = String(req.headers['content-type'] || '');
      if (req.method !== 'POST' || req.headers.origin || !/application\/json/i.test(ct)) {
        res.statusCode = 403;
        res.end(JSON.stringify({ ok: false, error: 'JSON POST 만 받는다' }));
        return;
      }
      readBody(req, 64 * 1024, (body) => {
        let p;
        try { p = JSON.parse(body); } catch { res.statusCode = 400; res.end(JSON.stringify({ ok: false, error: 'JSON 아님' })); return; }
        let r;
        try { r = onInbox(url.pathname.slice(1), p || {}); } catch (e) { r = { ok: false, error: e.message }; }
        if (!r || !r.ok) res.statusCode = 400;
        res.end(JSON.stringify(r || { ok: false }));
      });
      return;
    }
    if (url.pathname !== '/say') {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }

    /**
     * source 가 있으면 알림 카드로 뜬다 (대화 말풍선과 구분 · 놓친 알림에 남음).
     * level: done | fail | due | build | info — 카드 색. fail 이면 윈도우 알림도.
     */
    const deliver = (text, mood, ms, extra) => {
      if (!text) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: 'text 없음' }));
        return;
      }
      const msg = { text: String(text).slice(0, 300), mood: mood || 'normal', ms: Number(ms) || 0 };
      const e = extra || {};
      if (e.source) msg.source = String(e.source).slice(0, 40);
      if (e.level) msg.level = String(e.level).slice(0, 20);
      if (e.project) msg.project = String(e.project).slice(0, 60);
      if (e.line) msg.line = String(e.line).slice(0, 200);
      onMessage(msg);
      res.end(JSON.stringify({ ok: true }));
    };

    if (req.method === 'GET') {
      const q = (k) => url.searchParams.get(k);
      deliver(q('text'), q('mood'), q('ms'), { source: q('source'), level: q('level'), project: q('project'), line: q('line') });
      return;
    }

    readBody(req, 8192, (body) => {
      let payload = {};
      try {
        payload = JSON.parse(body);
      } catch {
        payload = { text: body };     // JSON 아니면 본문을 그대로 대사로
      }
      deliver(payload.text, payload.mood, payload.ms, payload);
    });
  });

  server.on('error', (e) => console.error('[notify] 서버 오류:', e.message));
  server.listen(port, '127.0.0.1', () => {
    console.log('[notify] 대기 중: http://127.0.0.1:' + port + '/say');
  });
  return server;
}

module.exports = { start };
