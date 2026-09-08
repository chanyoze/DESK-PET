/**
 * 캐릭터에게 말을 시킨다. 외부 도구에서 부르기 쉬우라고 만든 얇은 래퍼.
 *
 *   node tools/say.js "빌드 끝났어" happy
 *   node tools/say.js "테스트 실패" alert 8000
 *   echo "긴 메시지" | node tools/say.js
 *
 * mood: normal | happy | alert
 * 앱이 안 떠 있으면 조용히 무시한다 (훅에서 불려도 에러를 내지 않기 위해).
 */
const http = require('http');

const PORT = process.env.DESKPET_PORT || 45678;

function post(text, mood, ms) {
  const body = Buffer.from(JSON.stringify({ text, mood, ms }), 'utf8');
  const req = http.request(
    {
      host: '127.0.0.1',
      port: PORT,
      path: '/say',
      method: 'POST',
      timeout: 1200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': body.length,
      },
    },
    (res) => res.resume()
  );
  // 앱이 꺼져 있어도 훅이 실패하면 안 된다
  req.on('error', () => {});
  req.on('timeout', () => req.destroy());
  req.end(body);
}

const [, , argText, argMood, argMs] = process.argv;

if (argText) {
  post(argText, argMood || 'normal', Number(argMs) || 0);
} else {
  // 인자가 없으면 stdin 을 읽는다 (훅이 JSON 을 흘려보내는 경우)
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return;
    let text = raw;
    try {
      const j = JSON.parse(raw);
      text = j.text || j.message || raw;
    } catch { /* 평문 그대로 */ }
    post(text.slice(0, 300), argMood || 'normal', Number(argMs) || 0);
  });
  setTimeout(() => process.exit(0), 1500);   // stdin 이 안 닫혀도 훅을 막지 않는다
}
