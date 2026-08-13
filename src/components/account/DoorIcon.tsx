// 헤더 계정 버튼의 비로그인 상태에 쓰는 "들어가기" 아이콘 — 문틀 + 안으로 향하는 화살표.
// 로그인 상태의 프로필 사진과 같은 원 안에 들어가되, 사진과 달리 사람 모양이 아니라서
// "이건 나를 가리키는 게 아니라 눌러서 들어가는 곳"이라는 게 한눈에 구분됩니다.
//
// Discord 로고를 쓰지 않는 이유: 이 버튼은 로그인만이 아니라 "가입 신청"도 함께 여는
// 모달이라, 특정 서비스 로고를 쓰면 뜻이 좁아집니다. 문은 둘 다 아우릅니다.
export default function DoorIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      {/* 문틀 — 화살표가 들어가는 왼쪽 면만 열어둡니다 */}
      <path
        d="M11.8 3.5h3.2a1.3 1.3 0 0 1 1.3 1.3v10.4a1.3 1.3 0 0 1-1.3 1.3h-3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 안으로 향하는 화살표 */}
      <path d="M3.5 10h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M8 7.4 10.6 10 8 12.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
