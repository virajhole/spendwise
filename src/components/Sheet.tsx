import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export default function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} aria-label={title} className="money-sheet" onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) onClose(); }}>
    <div className="sheet-content">
      <div className="sheet-handle" />
      <div className="flex items-center justify-between gap-3 pb-4"><h2 className="text-xl font-bold">{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      {children}
    </div>
  </dialog>;
}
