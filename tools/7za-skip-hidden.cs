// 7za 래퍼 — 압축(a)할 때 숨김+시스템 속성 파일을 뺀다.
//
// 어떤 보안 프로그램은 폴더마다 숨김+시스템 속성의 미끼 파일(랜섬웨어 감시용 추정)을 끼워 넣고,
// 같은 이름을 두 번 보여 주기까지 한다. 그러면 7za 가 "Duplicate filename on disk" 로 멈춰서
// electron-builder 의 포터블 빌드가 실패한다 (2026-09-30 회사 PC, locales\ZULRFF.DOCX).
// 미끼 파일은 지우지 않고 (감시를 건드리지 않게) 압축에서만 뺀다.
//
// tools/build-private.js 가 윈도우 기본 .NET 의 csc.exe 로 컴파일해서
// ELECTRON_BUILDER_7ZIP_PATH 로 끼운다. 진짜 7za 경로는 DESKPET_REAL_7ZA 로 받는다.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;

class SevenZipSkipHidden
{
    static int Main(string[] args)
    {
        string real = Environment.GetEnvironmentVariable("DESKPET_REAL_7ZA");
        if (string.IsNullOrEmpty(real) || !File.Exists(real))
        {
            Console.Error.WriteLine("[7za-skip-hidden] DESKPET_REAL_7ZA 가 없다");
            return 2;
        }

        var list = new List<string>(args);
        if (args.Length > 0 && args[0] == "a")
        {
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            try
            {
                foreach (var f in Directory.EnumerateFiles(Environment.CurrentDirectory, "*", SearchOption.AllDirectories))
                {
                    var a = File.GetAttributes(f);
                    if ((a & FileAttributes.Hidden) != 0 && (a & FileAttributes.System) != 0) names.Add(Path.GetFileName(f));
                }
            }
            catch (Exception e)
            {
                Console.Error.WriteLine("[7za-skip-hidden] 폴더 훑기 실패: " + e.Message);
            }
            foreach (var n in names)
            {
                Console.Error.WriteLine("[7za-skip-hidden] 뺌: " + n);
                list.Add("-xr!" + n);
            }
        }

        var sb = new StringBuilder();
        foreach (var s in list)
        {
            if (sb.Length > 0) sb.Append(' ');
            sb.Append(Quote(s));
        }
        var psi = new ProcessStartInfo(real, sb.ToString()) { UseShellExecute = false };
        using (var p = Process.Start(psi))
        {
            p.WaitForExit();
            return p.ExitCode;
        }
    }

    // 윈도우 명령줄 인자 규칙대로 감싼다 (공백 · 따옴표가 있을 때만)
    static string Quote(string s)
    {
        if (s.Length > 0 && s.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return s;
        var sb = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in s)
        {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { sb.Append('\\', slashes * 2 + 1); sb.Append('"'); slashes = 0; continue; }
            sb.Append('\\', slashes);
            slashes = 0;
            sb.Append(c);
        }
        sb.Append('\\', slashes * 2);
        sb.Append('"');
        return sb.ToString();
    }
}
