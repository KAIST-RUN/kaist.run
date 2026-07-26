# RUN — KAIST 알고리즘 문제해결 동아리 웹사이트

Next.js(App Router) + TypeScript로 만든 정적 사이트입니다. GitHub Pages에 배포되며, `main` 브랜치에 push할 때마다 GitHub Actions가 자동으로 다시 빌드/배포합니다.

## 개발

```bash
npm install
npm run dev
```

http://localhost:3000 에서 확인할 수 있습니다.

## 빌드

```bash
npm run build   # content/ 언어 짝 검증(prebuild) 후 정적 export를 out/ 에 생성
npx serve out    # 로컬에서 정적 결과물 미리보기
```

## 공지사항 추가하기

1. `content/notices/ko/`와 `content/notices/en/`에 **같은 파일명**으로 마크다운 파일을 하나씩 만듭니다. (예: `2026-08-01-camp.md`)
2. 각 파일 맨 위에 frontmatter를 작성합니다:

   ```markdown
   ---
   title: "제목"
   date: "2026-08-01"
   pinned: false
   ---

   본문 내용...
   ```

3. 두 언어 버전을 커밋하고 `main`에 push하면 자동으로 사이트에 반영됩니다.
4. 한 언어만 올리고 커밋하면 빌드가 실패합니다 (`npm run check-content` 가 짝을 검사합니다). 두 언어 파일이 모두 있어야 합니다.

### 공지사항에 사진 첨부하기

1. 사진 파일을 `public/notices/<파일명(슬러그)>/`에 넣습니다. 예를 들어 `content/notices/ko/2026-08-01-camp.md`라면 사진은 `public/notices/2026-08-01-camp/photo.jpg`에 둡니다.
2. 본문에서 마크다운 이미지 문법으로 절대 경로(`/`로 시작)로 참조합니다:

   ```markdown
   ![현장 사진](/notices/2026-08-01-camp/photo.jpg)
   ```

3. `ko`, `en` 두 버전 모두 같은 사진 경로를 참조하면 됩니다 (사진 파일은 하나만 있으면 됨).
4. GitHub Pages는 저장소 이름이 붙은 하위 경로(예: `/website/...`)에서 서비스되는데, 빌드 시 `/`로 시작하는 이미지 경로 앞에 그 하위 경로를 자동으로 붙여주므로 신경 쓰지 않고 위 예시처럼 루트 기준 절대 경로로 작성하면 됩니다.

## 대회 아카이브 자료 추가하기

1. `content/archive/spring/` 또는 `content/archive/fall/` 아래에 대회별 폴더를 만듭니다. (예: `content/archive/spring/2027-spring/`)
2. 그 폴더 안에 `ko.md`, `en.md` 두 파일을 만들고 frontmatter를 작성합니다:

   ```markdown
   ---
   title: "2027 봄 대회"
   season: spring
   year: 2027
   date: "2027-04-17"
   resources:
     - file: problems.pdf
       label: "문제지"
     - file: editorial.pdf
       label: "풀이"
   ---

   대회 소개...
   ```

3. 실제 PDF 등 리소스 파일은 `public/archive/spring/2027-spring/`에 `resources`에 적은 파일명과 동일하게 넣습니다.
4. 커밋 후 push하면 자동으로 반영됩니다.

## 소개 페이지 수정하기

소개 페이지도 공지사항과 마찬가지로 마크다운 파일로 관리됩니다. UI 문구(json)를 건드릴 필요 없이 아래 두 파일만 수정하면 됩니다.

- `content/about/ko.md`
- `content/about/en.md`

각 파일의 frontmatter에는 페이지 제목(`title`)만 있고, 나머지는 자유롭게 마크다운 본문으로 작성합니다.

두 언어 파일 중 하나라도 없으면 다른 콘텐츠와 마찬가지로 빌드가 실패합니다.

## 연락처 페이지 수정하기

연락처 페이지는 공지사항과 마찬가지로 마크다운 파일로 관리됩니다. UI 문구(json)를 건드릴 필요 없이 아래 두 파일만 수정하면 됩니다.

- `content/contact/ko.md`
- `content/contact/en.md`

각 파일의 frontmatter에는 페이지 제목(`title`)만 있고, 나머지는 자유롭게 마크다운 본문으로 작성합니다. 이메일/인스타그램 등 연락 수단도 본문에 마크다운 링크로 직접 적으면 됩니다:

```markdown
---
title: "연락처"
---

RUN에 대해 궁금한 점이 있다면 아래로 연락해 주세요.

- **이메일**: [run@kaist.ac.kr](mailto:run@kaist.ac.kr)
- **인스타그램**: [@kaist_run](https://instagram.com/kaist_run)
```

두 언어 파일 중 하나라도 없으면 공지사항/아카이브와 마찬가지로 빌드가 실패합니다.

## 배포 설정 (최초 1회)

1. GitHub 저장소 Settings → Pages → Build and deployment → Source를 **GitHub Actions**로 설정합니다.
2. `main`에 push하면 `.github/workflows/deploy.yml`이 자동으로 빌드/배포합니다.
3. basePath(예: `/website`)는 저장소의 Pages 설정에서 자동으로 계산되어 빌드에 주입되므로 별도 설정이 필요 없습니다.

## 아직 채워야 할 자리

- `content/contact/{ko,en}.md`의 이메일/인스타그램 주소는 임시 값입니다. 실제 연락처로 교체하세요.
- `content/archive/**`의 샘플 리소스는 `.txt` placeholder입니다. 실제 PDF로 교체하고 frontmatter의 `resources`도 함께 업데이트하세요.
- 동아리 로고/브랜드 컬러가 정해지면 `src/app/globals.css`와 `Header` 컴포넌트에 반영하세요.
