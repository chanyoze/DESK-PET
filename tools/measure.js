#!/usr/bin/env node
/**
 * 무게 재기 — 메모리 · CPU · 크기를 같은 조건으로 재서 바꾸기 전후를 비교한다
 * -------------------------------------------------------------
 *   node tools/measure.js                         개발 실행(electron .)을 잰다
 *   node tools/measure.js --exe dist/DeskPet-x.exe 빌드한 exe 를 잰다 (크기도)
 *   옵션: --warmup 20 (뜬 뒤 기다릴 초) --window 30 (CPU 를 재는 초) --label 이름 (결과 파일 이름)
 *
 * 조건을 맞추려고
 *  - 설정 폴더를 임시로 따로 만든다 (DESKPET_USERDATA). 지금 쓰는 캐릭터 · 설정을 복사하고
 *    알림 서버 포트만 바꾼다 → 실행 중인 앱과 겹치지 않는다
 *  - 띄운 프로세스와 그 자식(렌더러 · GPU · 유틸리티)만 센다
 *  - 메모리는 작업 집합(작업 관리자 "메모리")과 전용 바이트, CPU 는 재는 동안 쓴 시간 ÷ 경과 시간
 *    (한 코어 기준 % 와 전체 코어 기준 % 둘 다)
 * 결과는 dist/measure/<label>.json 에도 남는다. 윈도우 전용 (PowerShell · CIM).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const exe = arg('exe', null);
const warmup = Number(arg('warmup', 20));
const windowSec = Number(arg('window', 30));
const label = arg('label', exe ? path.basename(exe, '.exe') : 'dev');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 모든 프로세스 — pid · 부모 · 이름 · 메모리 · CPU 시간(100ns) · 명령줄 */
function snapshot() {
  const ps = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize,PrivatePageCount,KernelModeTime,UserModeTime,CommandLine | ConvertTo-Json -Compress';
  const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return JSON.parse(out);
}

/** root 와 그 자손 */
function tree(all, root) {
  const kids = new Map();
  for (const p of all) {
    if (!kids.has(p.ParentProcessId)) kids.set(p.ParentProcessId, []);
    kids.get(p.ParentProcessId).push(p);
  }
  const out = [];
  const walk = (pid) => { for (const c of kids.get(pid) || []) { out.push(c); walk(c.ProcessId); } };
  const me = all.find((p) => p.ProcessId === root);
  if (me) out.push(me);
  walk(root);
  return out;
}

const kind = (p) => {
  const m = /--type=([\w-]+)/.exec(p.CommandLine || '');
  if (m) return m[1] + (/--utility-sub-type=([\w.]+)/.exec(p.CommandLine || '') || [, ''])[1].replace(/^/, m[1] === 'utility' ? ':' : '').replace(/^:$/, '');
  return /DeskPet-|portable/i.test(p.Name) && !/^DeskPet\.exe$|^electron\.exe$/i.test(p.Name) ? 'launcher' : 'main';
};

function dirSize(d) {
  let n = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
}

async function main() {
  // 1) 임시 설정 폴더 — 지금 쓰는 캐릭터 · 설정을 복사, 포트만 바꾼다
  const real = path.join(process.env.APPDATA, 'deskpet');
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'deskpet-measure-'));
  if (fs.existsSync(path.join(real, 'characters'))) fs.cpSync(path.join(real, 'characters'), path.join(ud, 'characters'), { recursive: true });
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(path.join(real, 'settings.json'), 'utf8')); } catch { /* 없으면 기본 */ }
  Object.assign(cfg, { notifyPort: 45690, reminders: [], toastOn: false, lastVersion: '999.0.0' });   // 새로 바뀐 것 창도 안 뜨게
  fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify(cfg, null, 2));

  // 2) 띄우기
  const env = { ...process.env, DESKPET_USERDATA: ud, DESKPET_UPDATE_FEED: 'http://127.0.0.1:9/none' };   // 업데이트 확인은 조용히 실패
  const child = exe
    ? spawn(path.resolve(exe), [], { env, detached: true, stdio: 'ignore' })
    : spawn(path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'), [ROOT], { env, detached: true, stdio: 'ignore', cwd: ROOT });
  console.log('[measure]', label, '— 띄움 pid', child.pid, '·', warmup + '초 기다림, CPU', windowSec + '초');
  await sleep(warmup * 1000);

  // 3) 메모리 · CPU
  const a = tree(snapshot(), child.pid);
  const t0 = Date.now();
  await sleep(windowSec * 1000);
  const allB = snapshot();
  const b = tree(allB, child.pid);
  const elapsed = (Date.now() - t0) / 1000;
  const cpuOf = (p) => (Number(p.KernelModeTime) + Number(p.UserModeTime)) / 1e7;   // 초
  const rows = b.map((p) => {
    const was = a.find((x) => x.ProcessId === p.ProcessId);
    const cpu = was ? (cpuOf(p) - cpuOf(was)) / elapsed * 100 : null;
    return { pid: p.ProcessId, kind: kind(p), ws: p.WorkingSetSize / 1048576, priv: p.PrivatePageCount / 1048576, cpu };
  });

  // 4) 끄기
  try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* 이미 꺼졌으면 */ }

  const sum = (k) => rows.reduce((n, r) => n + (r[k] || 0), 0);
  const cores = os.cpus().length;
  const result = {
    label, at: new Date().toISOString(), warmup, windowSec, cores,
    processes: rows.length,
    workingSetMB: Math.round(sum('ws')), privateMB: Math.round(sum('priv')),
    cpuOneCorePct: +sum('cpu').toFixed(2), cpuTotalPct: +(sum('cpu') / cores).toFixed(2),
    rows: rows.map((r) => ({ ...r, ws: Math.round(r.ws), priv: Math.round(r.priv), cpu: r.cpu == null ? null : +r.cpu.toFixed(2) })),
  };
  if (exe) {
    result.exeMB = +(fs.statSync(exe).size / 1048576).toFixed(1);
    const unpacked = path.join(path.dirname(exe), 'win-unpacked');
    if (fs.existsSync(unpacked)) result.unpackedMB = +(dirSize(unpacked) / 1048576).toFixed(1);
  }

  console.log('');
  console.log('  종류                      작업집합MB  전용MB   CPU%(한 코어)');
  for (const r of result.rows) {
    console.log('  ' + r.kind.padEnd(26) + String(r.ws).padStart(8) + String(r.priv).padStart(8) + String(r.cpu == null ? '-' : r.cpu).padStart(12));
  }
  console.log('  ' + '합계'.padEnd(24) + String(result.workingSetMB).padStart(10) + String(result.privateMB).padStart(8) + String(result.cpuOneCorePct).padStart(12));
  console.log('  → CPU 전체 기준 ' + result.cpuTotalPct + '% (' + cores + '코어)' + (result.exeMB ? ' · exe ' + result.exeMB + 'MB' : '') + (result.unpackedMB ? ' · 풀린 크기 ' + result.unpackedMB + 'MB' : ''));

  const outDir = path.join(ROOT, 'dist', 'measure');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, label + '.json'), JSON.stringify(result, null, 2));
  // 앱이 늦게 꺼지면 폴더가 잠겨 있다 — 조금 기다렸다 지우고, 그래도 안 되면 남겨 둔다 (임시 폴더)
  await sleep(2000);
  try { fs.rmSync(ud, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 }); } catch { /* 그만 */ }
}

main().catch((e) => { console.error('[measure] 실패:', e.message); process.exit(1); });
