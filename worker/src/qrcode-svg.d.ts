// qrcode-svg는 타입 정의를 제공하지 않는 순수 JS 패키지라 여기서 최소한만 선언합니다.
// 실제로 쓰는 옵션만 적었습니다 — 더 쓰게 되면 여기에 추가하세요.
declare module "qrcode-svg" {
  type QRCodeOptions = {
    content: string;
    padding?: number;
    width?: number;
    height?: number;
    color?: string;
    background?: string;
    // 오류 정정 수준 — H면 30% 손상까지 복원됩니다(포스터 인쇄용으로 넉넉하게).
    ecl?: "L" | "M" | "Q" | "H";
    // "svg"(기본, width/height 고정) 또는 "svg-viewbox"(viewBox만 — 컨테이너에 맞게 스케일).
    container?: "svg" | "svg-viewbox" | "g" | "none";
  };
  export default class QRCode {
    constructor(options: QRCodeOptions | string);
    svg(): string;
  }
}
