import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FaXmark } from 'react-icons/fa6';

/**
 * A bottom sheet on phones, a centred card on larger screens. Slides/fades in and out, closes on
 * Escape, on a tap outside, and returns focus to whatever opened it. Rendered in <body> so it is never
 * clipped by the page card.
 */
export default function Sheet({ title, onClose, children }) {
  const panel = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => onCloseRef.current(), 170); // let the exit animation play
  }, []);

  useEffect(() => {
    const opener = document.activeElement;
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // the page behind must not scroll
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [close]);

  return createPortal(
    <div className={`lt-overlay ${closing ? 'is-closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="lt-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <div className="lt-sheet-grab" aria-hidden="true" />
        <div className="lt-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="lt-sheet-x" onClick={close} aria-label="Close">
            <FaXmark aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
