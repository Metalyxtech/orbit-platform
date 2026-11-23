'use client';

/** Opens the browser's print dialog; choose "Save as PDF" to keep a file. */
export function PrintButton({ label = 'Print or save as PDF' }: { label?: string }) {
  return (
    <button type="button" className="o-btn small primary no-print" onClick={() => window.print()}>
      {label}
    </button>
  );
}
