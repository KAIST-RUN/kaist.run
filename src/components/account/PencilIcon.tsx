// 마이페이지의 "이 값 고치기" 버튼에 쓰는 연필 아이콘 — 닉네임(UserProfileCard)과
// 코딩 핸들(UserInfoCard) 두 군데서 같이 씁니다.
export default function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path
        d="M12.4 4.2l3.4 3.4-8.4 8.4-4 1 1-4 8-8.4z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M10.8 5.8l3.4 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
