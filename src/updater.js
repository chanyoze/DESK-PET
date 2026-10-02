/**
 * 업데이트 — GitHub Releases 에서 새 버전을 찾아 받고, 바꿔 끼운 뒤 다시 켠다
 * -------------------------------------------------------------
 * 배포는 .github/workflows/release.yml 이 한다: package.json 버전을 올려 main 에 푸시하면
 *   윈도우 → 릴리스 v버전 · DeskPet-버전.exe (포터블)
 *   맥     → 사전 릴리스 mac-v버전 · DeskPet-mac-버전.zip (mac.yml)
 * 둘 다 그림 없는 공개판이다. 캐릭터는 각 PC 의 userData/characters 에 있으니 앱만 바꾸면 된다.
 *
 * 설치 방식
 *  - 윈도우 포터블: 새 exe 를 지금 exe 옆에 받고 → 새 exe 를 --replaced=옛경로 로 켜고 → 나는 끈다.
 *    새 앱이 뜨면 옛 exe 를 지운다 (cleanupOld). 자동 시작이 켜져 있었으면 새 경로로 다시 건다
 *  - 맥: zip 을 임시 폴더에 받아 ditto 로 풀고 → 작은 셸 스크립트가 내가 꺼지길 기다렸다가
 *    지금 .app 을 새 것으로 바꾸고 다시 연다. 바꿀 수 없는 자리면 받은 폴더를 Finder 로 연다
 *  - 개발 실행(electron .)은 확인 · 알림만 하고 설치는 하지 않는다
 */
const { app, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const REPO = 'chanyoze/DESK-PET';
const IS_MAC = process.platform === 'darwin';

/** "0.15.0" 비교 — a > b 면 양수 */
function cmp(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

/**
 * 가장 새 릴리스 → { version, tag, notes, url(릴리스 페이지), asset: { name, url, size } } | null
 * 이 플랫폼용 파일이 붙은 릴리스만 본다 (윈도우 v버전 + .exe / 맥 mac-v버전 + .zip).
 */
async function latest() {
  // DESKPET_UPDATE_FEED — 개발 · 시험용으로 릴리스 목록 주소를 바꾼다 (같은 모양의 JSON)
  const feed = process.env.DESKPET_UPDATE_FEED || 'https://api.github.com/repos/' + REPO + '/releases?per_page=20';
  const res = await fetch(feed, {
    headers: { 'User-Agent': 'DeskPet-updater', Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error('GitHub 응답 ' + res.status);
  const list = await res.json();
  let best = null;
  for (const r of list) {
    if (r.draft) continue;
    const m = IS_MAC ? /^mac-v(\d+\.\d+\.\d+)$/.exec(r.tag_name) : /^v(\d+\.\d+\.\d+)$/.exec(r.tag_name);
    if (!m) continue;
    const asset = (r.assets || []).find((a) => (IS_MAC ? /^DeskPet-mac-[\d.]+\.zip$/ : /^DeskPet-[\d.]+\.exe$/).test(a.name));
    if (!asset) continue;
    if (!best || cmp(m[1], best.version) > 0) {
      best = {
        version: m[1], tag: r.tag_name, notes: (r.body || '').slice(0, 1500), url: r.html_url,
        // digest = "sha256:…" (GitHub 가 붙여 준다) — 받은 파일이 깨졌는지 확인하는 데 쓴다
        asset: { name: asset.name, url: asset.browser_download_url, size: asset.size, digest: asset.digest || '' },
      };
    }
  }
  return best;
}

/** 새 버전이 있으면 그 정보, 없으면 null. skip 은 "이 버전 건너뛰기" 한 버전 */
async function check(skip) {
  const r = await latest();
  if (!r || cmp(r.version, app.getVersion()) <= 0) return null;
  if (skip && r.version === skip) return null;
  return r;
}

/**
 * 받은 파일 확인 — 크기, 그리고 GitHub 가 알려 준 sha256 이 있으면 그것까지.
 * 깨진 exe 를 켜면 "NSIS Error" 창만 뜨고 앱이 안 켜진다 (2026-10-01 시험에서 겪음) → 설치 전에 막는다.
 */
function verify(file, asset) {
  const size = fs.statSync(file).size;
  if (asset.size && size !== asset.size) throw new Error('받은 파일 크기가 다르다 (' + size + ' / ' + asset.size + ')');
  const m = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest || '');
  if (m) {
    const h = require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (h.toLowerCase() !== m[1].toLowerCase()) throw new Error('받은 파일이 깨졌다 (sha256 다름)');
  }
}

/** 파일 받기 — onProgress(0~1) */
async function download(url, dest, onProgress) {
  const res = await fetch(url, { headers: { 'User-Agent': 'DeskPet-updater' } });   // fetch 는 리다이렉트를 따라간다
  if (!res.ok || !res.body) throw new Error('받기 실패 ' + res.status);
  const total = Number(res.headers.get('content-length')) || 0;
  const tmp = dest + '.part';
  const out = fs.createWriteStream(tmp);
  let got = 0, lastTick = 0;
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
      if (total && onProgress && Date.now() - lastTick > 400) { lastTick = Date.now(); onProgress(got / total); }
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    if (total && got !== total) throw new Error('받다가 끊겼다 (' + got + '/' + total + ')');
    fs.renameSync(tmp, dest);
    return dest;
  } catch (e) {
    // 받다 만 파일을 남기지 않는다 (윈도우는 exe 옆 — 바탕화면일 수 있다)
    out.destroy();
    try { fs.unlinkSync(tmp); } catch { /* 없으면 그만 */ }
    throw e;
  }
}

/** 설치할 수 있는 실행 방식인지 (개발 실행 · 설치형 아님은 안내만) */
function canInstall() {
  if (!app.isPackaged) return { ok: false, why: '개발 실행에선 설치하지 않는다' };
  if (IS_MAC) return { ok: true };
  if (!process.env.PORTABLE_EXECUTABLE_FILE) return { ok: false, why: '포터블 exe 로 실행했을 때만 바꿔 끼울 수 있다' };
  return { ok: true };
}

/** 받아서 설치하고 다시 켠다. 성공하면 앱을 끈다 (새 앱이 대신 뜬다) */
async function install(info, onProgress) {
  const ci = canInstall();
  if (!ci.ok) {
    shell.openExternal(info.url);
    return { ok: false, why: ci.why + ' — 릴리스 페이지를 열었다' };
  }
  return IS_MAC ? installMac(info, onProgress) : installWin(info, onProgress);
}

async function installWin(info, onProgress) {
  const oldExe = process.env.PORTABLE_EXECUTABLE_FILE;
  const dir = path.dirname(oldExe);
  let dest = path.join(dir, info.asset.name);
  if (path.resolve(dest).toLowerCase() === path.resolve(oldExe).toLowerCase()) dest = path.join(dir, 'DeskPet-' + info.version + '-new.exe');
  await download(info.asset.url, dest, onProgress);
  try { verify(dest, info.asset); } catch (e) { try { fs.unlinkSync(dest); } catch { /* 그만 */ } throw e; }

  /*
   * 내가 완전히 꺼진 뒤에 새 앱을 켠다 — 먼저 켜면 중복 실행 잠금에 걸려 새 앱이 바로 꺼진다.
   * 기다리는 프로세스는 WMI(Win32_Process.Create)로 띄운다. 그냥 spawn 하면 포터블 실행기의
   * 작업 개체에 묶여서 내가 꺼질 때 같이 죽는다 (그래서 새 앱이 안 켜졌다 — 2026-10-01 시험).
   * WMI 로 뜬 프로세스는 우리 환경 변수를 못 받으므로 경로는 스크립트 안에 넣고,
   * 스크립트는 UTF-16 base64(-EncodedCommand)로 넘겨 한글 · 따옴표가 섞여도 깨지지 않게 한다.
   */
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const keep = Object.keys(process.env).filter((k) => k.startsWith('DESKPET_'))      // 시험용 설정은 새 앱에도
    .map((k) => '$env:' + k + ' = ' + q(process.env[k]) + '; ').join('');
  const waiter = keep +
    'Wait-Process -Id ' + process.pid + ' -Timeout 60 -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 800; ' +
    'Start-Process -FilePath ' + q(dest) + ' -ArgumentList (' + q('--replaced="' + oldExe + '"') + '), ' + q('--updated-from=' + app.getVersion());
  const enc = Buffer.from(waiter, 'utf16le').toString('base64');
  const launcher = 'Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = ' +
    q('powershell.exe -NoProfile -WindowStyle Hidden -EncodedCommand ' + enc) + ' } | Out-Null';
  await new Promise((resolve, reject) => {
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', launcher], { windowsHide: true, stdio: 'ignore' });
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('새 앱을 켤 준비를 못 했다 (' + c + ')'))));
    p.on('error', reject);
  });
  setTimeout(() => app.quit(), 300);
  return { ok: true, path: dest };
}

async function installMac(info, onProgress) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-update-'));
  const zip = path.join(work, info.asset.name);
  try {
    await download(info.asset.url, zip, onProgress);
    verify(zip, info.asset);
  } catch (e) {
    fs.rmSync(work, { recursive: true, force: true });       // 받다 만 zip 을 남기지 않는다
    throw e;
  }
  const unzip = path.join(work, 'app');
  let newApp;
  try {
    await new Promise((r, j) => {
      const p = spawn('/usr/bin/ditto', ['-x', '-k', zip, unzip]);
      p.on('exit', (c) => (c === 0 ? r() : j(new Error('압축 풀기 실패 ' + c))));
    });
    newApp = fs.readdirSync(unzip).map((n) => path.join(unzip, n)).find((p) => p.endsWith('.app'));
    if (!newApp) throw new Error('zip 안에 .app 이 없다');
  } catch (e) {
    fs.rmSync(work, { recursive: true, force: true });
    throw e;
  }
  // 지금 앱 번들 — …/DeskPet.app/Contents/MacOS/DeskPet
  const curApp = path.resolve(app.getPath('exe'), '..', '..', '..');
  let writable = true;
  try { fs.accessSync(path.dirname(curApp), fs.constants.W_OK); } catch { writable = false; }
  if (!curApp.endsWith('.app') || !writable) {
    shell.showItemInFolder(newApp);
    return { ok: false, why: '앱을 바꿀 수 없는 자리라 새 앱을 Finder 에서 열었다 — 응용 프로그램 폴더로 옮겨 줘' };
  }
  // 내가 꺼진 뒤 바꿔 끼우고 다시 연다
  const script = path.join(work, 'swap.sh');
  fs.writeFileSync(script, [
    '#!/bin/sh',
    'while kill -0 ' + process.pid + ' 2>/dev/null; do sleep 0.5; done',
    'rm -rf "' + curApp + '.old"',
    'mv "' + curApp + '" "' + curApp + '.old" && mv "' + newApp + '" "' + curApp + '" && rm -rf "' + curApp + '.old"',
    'xattr -cr "' + curApp + '" 2>/dev/null',
    'open "' + curApp + '" --args --updated-from=' + app.getVersion(),
    'rm -rf "' + work + '"',                                  // 받은 zip · 푼 앱 · 이 스크립트 (수백 MB)
    '',
  ].join('\n'), { mode: 0o755 });
  spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 300);
  return { ok: true, path: curApp };
}

/**
 * 업데이트로 새로 뜬 앱이 할 뒷정리 (윈도우) — 옛 exe 지우기.
 * 이름이 DeskPet*.exe 이고 지금 exe 와 같은 폴더일 때만 지운다 (엉뚱한 파일을 지우지 않게).
 * 옛 앱이 완전히 꺼질 때까지 잠겨 있으니 몇 번 다시 해 본다.
 */
function cleanupOld(argv) {
  const a = argv.find((x) => x.startsWith('--replaced='));
  if (!a || IS_MAC) return;
  const old = a.slice('--replaced='.length);
  const me = process.env.PORTABLE_EXECUTABLE_FILE || '';
  if (!/^DeskPet[^\\/]*\.exe$/i.test(path.basename(old))) return;
  if (!me || path.dirname(path.resolve(old)).toLowerCase() !== path.dirname(path.resolve(me)).toLowerCase()) return;
  if (path.resolve(old).toLowerCase() === path.resolve(me).toLowerCase()) return;
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    try {
      if (fs.existsSync(old)) fs.unlinkSync(old);
      clearInterval(t);
      console.log('[update] 옛 exe 지움:', old);
    } catch {
      if (tries > 30) clearInterval(t);
    }
  }, 2000);
}

module.exports = { check, install, canInstall, cleanupOld, cmp, latest };
