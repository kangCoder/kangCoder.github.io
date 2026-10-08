/**
 * Firebase 설정이 비었을 때 — docs/spec-sync-v0.1.md §3.5
 *
 * 가장 흔한 배포 사고가 GitHub Secrets 누락이다. 그대로 두면 흰 화면에
 * 콘솔 오류만 남아 원인을 찾기 어렵다. 어느 키가 비었는지 화면에 띄운다.
 */
export function ConfigErrorScreen({ missing }: { missing: string[] }) {
  return (
    <div className="flex min-h-dvh flex-col justify-center px-6">
      <h1 className="text-[20px] font-semibold text-zinc-900">
        Firebase 설정이 없습니다
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-500">
        아래 값이 비어 있어 로그인할 수 없습니다. 로컬 개발이면{' '}
        <code>.env.local</code>, 배포면 GitHub 저장소 Secrets를 확인하세요.
      </p>
      <ul className="mt-3 flex flex-col gap-1">
        {missing.map((key) => (
          <li
            key={key}
            className="rounded-lg bg-white px-3 py-2 font-mono text-[12px] text-red-600 ring-1 ring-zinc-200"
          >
            {key}
          </li>
        ))}
      </ul>
    </div>
  )
}
