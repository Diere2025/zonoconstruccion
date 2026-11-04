'use client';
import { useEffect, useRef } from 'react';
export function useOutletDialog(open: boolean, onClose: () => void) {
    const close = useRef(onClose);
    useEffect(() => { close.current = onClose; }, [onClose]);
    useEffect(() => {
        if (!open)
            return;
        const previous = document.activeElement as HTMLElement | null;
        const dialog = document.querySelector<HTMLElement>('[data-outlet-dialog]');
        if (!dialog)
            return;
        const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')).filter(e => e.getClientRects().length > 0);
        const frame = requestAnimationFrame(() => focusable()[0]?.focus());
        const key = (e: KeyboardEvent) => { if (e.key === 'Escape') {
            e.preventDefault();
            close.current();
        } if (e.key === 'Tab') {
            const items = focusable();
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last?.focus();
            }
            else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first?.focus();
            }
        } };
        const old = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', key);
        return () => { cancelAnimationFrame(frame); document.body.style.overflow = old; document.removeEventListener('keydown', key); previous?.focus(); };
    }, [open]);
}
