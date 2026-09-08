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
 */
const http = require('http');

function start(port, onMessage) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (url.pathname === '/ping') {
      res.end(JSON.stringify({ ok: true, app: 'deskpet' }));
      return;
    }
    if (url.pathname !== '/say') {
      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'not found' }));
      return;
    }

    const deliver = (text, mood, ms) => {
      if (!text) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: 'text 없음' }));
        return;
      }
      onMessage({ text: String(text).slice(0, 300), mood: mood || 'normal', ms: Number(ms) || 0 });
      res.end(JSON.stringify({ ok: true }));
    };

    if (req.method === 'GET') {
      deliver(url.searchParams.get('text'), url.searchParams.get('mood'), url.searchParams.get('ms'));
      return;
    }

    // 버퍼를 모아 두었다가 한 번에 UTF-8로 디코드한다.
    // 문자열로 이어붙이면 청크 경계에서 한글 같은 멀티바이트 문자가 깨진다.
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 8192) return req.destroy();
      chunks.push(c);
    });
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      let payload = {};
      try {
        payload = JSON.parse(body);
      } catch {
        payload = { text: body };     // JSON 아니면 본문을 그대로 대사로
      }
      deliver(payload.text, payload.mood, payload.ms);
    });
  });

  server.on('error', (e) => console.error('[notify] 서버 오류:', e.message));
  server.listen(port, '127.0.0.1', () => {
    console.log('[notify] 대기 중: http://127.0.0.1:' + port + '/say');
  });
  return server;
}

module.exports = { start };
