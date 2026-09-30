/**
 * 앱이 userData 에 써 두는 PowerShell 스크립트들
 * -------------------------------------------------------------
 * 윈도우 기본 PowerShell 5.1 로 돈다 (Node 가 없는 PC 에서도).
 * 한글이 든 스크립트는 UTF-8 BOM 을 붙여서 쓴다 — PS 5.1 은 BOM 이 없으면 ANSI(CP949)로 읽는다.
 *
 *  deskpet-focus.ps1  세션의 터미널 창을 앞으로 (main.js focusClaudeSession)
 *  deskpet.ps1        명령줄 도구 — say / run / watch (빌드 · 서버 기동 알림)
 */

/** 창 핸들을 받아 앞으로 가져온다. 결과를 ok | denied | gone 으로 찍는다 */
function focusScript() {
  return [
    'param([string]$Hwnd)',
    "Add-Type -TypeDefinition @'",
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class DeskPetWin {',
    '  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);',
    '  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);',
    '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);',
    '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
    '  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);',
    '}',
    "'@",
    '$h = [IntPtr][int64]$Hwnd',
    "if (-not [DeskPetWin]::IsWindow($h)) { 'gone'; exit }",
    'if ([DeskPetWin]::IsIconic($h)) { [void][DeskPetWin]::ShowWindow($h, 9) }',
    '# Windows blocks background processes from stealing focus; holding ALT is the usual way around it',
    '[DeskPetWin]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero)',
    '$ok = [DeskPetWin]::SetForegroundWindow($h)',
    '[DeskPetWin]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)',
    "if ($ok) { 'ok' } else { 'denied' }",
    '',
  ].join('\r\n');
}

/**
 * 명령줄 도구. 사용법은 스크립트 첫머리 주석과 README "빌드 · 서버 알림" 참고.
 *   deskpet.ps1 say "빌드 끝났어" -Mood happy
 *   deskpet.ps1 run "mvn -q package" -Name 빌드
 *   deskpet.ps1 watch C:\tomcat\logs\catalina.out -Name 톰캣
 */
function cliScript(port) {
  return '\uFEFF' + [
    '<#',
    '  DeskPet 명령줄 도구 (앱이 만든 파일 — 앱을 켤 때마다 새로 쓴다. 고치지 말 것)',
    '',
    '  say   "할 말" [-Mood normal|happy|alert|fail]',
    '  run   "명령" [-Name 이름]     명령을 돌리고 끝나면 성공/실패와 걸린 시간을 알려 준다 (종료 코드 그대로 돌려줌)',
    '  watch 로그파일 [-Name 이름] [-Ok 정규식] [-Fail 정규식]',
    '        로그에 새로 붙는 줄을 지켜보다가 Ok 에 걸리면 "다 떴어", Fail 에 걸리면 쓰러지며 알려 주고 끝난다',
    '        기본값은 톰캣 · 스프링 부트 기동 메시지',
    '',
    '  앱이 꺼져 있으면 알림만 조용히 건너뛴다.',
    '#>',
    'param(',
    "  [Parameter(Position = 0)][string]$Command = 'help',",
    '  [Parameter(Position = 1)][string]$Target = \'\',',
    "  [string]$Mood = 'normal',",
    "  [string]$Name = '',",
    "  [string]$Ok = 'Server startup in|Started .+ in [0-9.]+ seconds',",
    "  [string]$Fail = 'startup failed|failed to start|Address already in use|BindException|OutOfMemoryError'",
    ')',
    '',
    'function Send-Pet([string]$Text, [string]$M) {',
    '  try {',
    '    $tc = New-Object System.Net.Sockets.TcpClient',
    "    $ar = $tc.BeginConnect('127.0.0.1', " + port + ', $null, $null)',
    '    $up = $ar.AsyncWaitHandle.WaitOne(300) -and $tc.Connected',
    '    $tc.Close()',
    '    if (-not $up) { return }',
    '    $json = @{ text = $Text; mood = $M } | ConvertTo-Json -Compress',
    '    $bytes = [Text.Encoding]::UTF8.GetBytes($json)',
    "    $req = [System.Net.HttpWebRequest]::Create('http://127.0.0.1:" + port + "/say')",
    "    $req.Method = 'POST'",
    "    $req.ContentType = 'application/json; charset=utf-8'",
    '    $req.Timeout = 1500',
    '    $req.ContentLength = $bytes.Length',
    '    $out = $req.GetRequestStream()',
    '    $out.Write($bytes, 0, $bytes.Length)',
    '    $out.Close()',
    '    $req.GetResponse().Close()',
    '  } catch { }',
    '}',
    '',
    'function Format-Dur([TimeSpan]$d) {',
    "  if ($d.TotalMinutes -ge 1) { return ('{0}분 {1}초' -f [int][math]::Floor($d.TotalMinutes), $d.Seconds) }",
    "  return ('{0}초' -f [int][math]::Round($d.TotalSeconds))",
    '}',
    '',
    'switch ($Command) {',
    "  'say' {",
    '    Send-Pet $Target $Mood',
    '  }',
    "  'run' {",
    "    if (-not $Target) { Write-Host '사용법: deskpet.ps1 run \"명령\" [-Name 이름]'; exit 2 }",
    '    if (-not $Name) { $Name = ($Target -split \' \')[0] }',
    '    $t0 = Get-Date',
    '    & cmd.exe /c $Target',
    '    $code = $LASTEXITCODE',
    '    $dur = Format-Dur ((Get-Date) - $t0)',
    "    if ($code -eq 0) { Send-Pet \"[$Name] 끝났어 ($dur)\" 'happy' }",
    "    else { Send-Pet \"[$Name] 실패했어… 코드 $code ($dur)\" 'fail' }",
    '    exit $code',
    '  }',
    "  'watch' {",
    "    if (-not $Target) { Write-Host '사용법: deskpet.ps1 watch 로그파일 [-Name 이름]'; exit 2 }",
    '    if (-not $Name) { $Name = [IO.Path]::GetFileNameWithoutExtension($Target) }',
    "    Write-Host \"[$Name] 지켜보는 중: $Target  (그만두려면 Ctrl+C)\"",
    '    while (-not (Test-Path $Target)) { Start-Sleep -Seconds 1 }',
    '    $t0 = Get-Date',
    '    Get-Content -Path $Target -Tail 0 -Wait | ForEach-Object {',
    '      if ($_ -match $Fail) {',
    '        $line = $_.Trim()',
    '        if ($line.Length -gt 60) { $line = $line.Substring(0, 60) + \'…\' }',
    "        Send-Pet \"[$Name] 떨어졌어… $line\" 'fail'",
    "        Write-Host \"[$Name] 실패 감지: $_\"",
    '        exit 1',
    '      }',
    '      if ($_ -match $Ok) {',
    '        $dur = Format-Dur ((Get-Date) - $t0)',
    "        Send-Pet \"[$Name] 다 떴어! ($dur)\" 'happy'",
    "        Write-Host \"[$Name] 성공 감지: $_\"",
    '        exit 0',
    '      }',
    '    }',
    '  }',
    '  default {',
    "    Write-Host 'deskpet.ps1 say \"할 말\" [-Mood happy|alert|fail]'",
    "    Write-Host 'deskpet.ps1 run \"명령\" [-Name 이름]'",
    "    Write-Host 'deskpet.ps1 watch 로그파일 [-Name 이름] [-Ok 정규식] [-Fail 정규식]'",
    '  }',
    '}',
    '',
  ].join('\r\n');
}

module.exports = { focusScript, cliScript };
