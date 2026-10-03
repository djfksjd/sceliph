const symbol = new URL('../assets/brand/sceliph-symbol-dark.png', import.meta.url).href;

/** Display the supplied symbol within its original image; keep the source intact. */
export default function SceliphIcon() {
  return (
    <svg viewBox="300 180 960 720" aria-hidden="true" className="sceliph-symbol">
      <image href={symbol} width="1536" height="1024" />
    </svg>
  );
}
