// public/images의 대형 원본을 표시 크기에 맞는 webp로 일회성 변환하는 스크립트입니다.
// 홈(HomeStory)의 이미지들이 원본 그대로 나가면서(cenix.png 3.2MB가 384px 폭으로 표시)
// 첫 방문 전송량이 7MB를 넘고, JS 청크와 대역폭을 경쟁해 하이드레이션까지 늦추던 문제의
// 정리용입니다. next.config가 images.unoptimized(정적 익스포트)라 빌드 타임 최적화가
// 없으므로 저장소에 최적화된 파일을 직접 커밋합니다.
//
// 실행: node scripts/optimize-images.mjs  (변환 후 원본 삭제와 소스 참조 교체는 수동)
import sharp from "sharp";
import { stat } from "node:fs/promises";
import path from "node:path";

const IMAGES_DIR = path.join(import.meta.dirname, "..", "public", "images");

// width는 실제 표시 폭의 2배(레티나 대비). quality는 육안 비교로 고른 값.
const TARGETS = [
  { src: "cenix.png", out: "cenix.webp", width: 768, options: { quality: 82 } }, // 알파 유지(webp는 기본 지원)
  { src: "contest_photo2.jpg", out: "contest_photo2.webp", width: 1280, options: { quality: 75 } },
  { src: "contest_photo.jpg", out: "contest_photo.webp", width: 1600, options: { quality: 75 } },
];

for (const t of TARGETS) {
  const srcPath = path.join(IMAGES_DIR, t.src);
  const outPath = path.join(IMAGES_DIR, t.out);
  const before = (await stat(srcPath)).size;
  await sharp(srcPath)
    .resize({ width: t.width, withoutEnlargement: true })
    .webp(t.options)
    .toFile(outPath);
  const after = (await stat(outPath)).size;
  console.log(`${t.src} ${(before / 1024).toFixed(0)}KB → ${t.out} ${(after / 1024).toFixed(0)}KB`);
}
