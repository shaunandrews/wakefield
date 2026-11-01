import { useMemo } from "preact/hooks";
import qrcode from "qrcode-generator";

/** A crisp SVG QR code. */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const path = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
    }
    return { d, count };
  }, [value]);
  const pad = 2;
  return (
    <svg
      role="img"
      aria-label={`QR code for ${value}`}
      width={size}
      height={size}
      viewBox={`${-pad} ${-pad} ${path.count + pad * 2} ${path.count + pad * 2}`}
      class="rounded-xl bg-white"
      shape-rendering="crispEdges"
    >
      <path d={path.d} fill="#05070d" />
    </svg>
  );
}
