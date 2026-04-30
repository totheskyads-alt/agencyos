'use client';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ title, onClose, children, size = 'md' }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const previousHtmlPaddingRight = html.style.paddingRight;

    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    html.classList.add('modal-scroll-lock');
    body.classList.add('modal-scroll-lock');
    setMounted(true);
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      const gutter = `${scrollbarWidth}px`;
      html.style.paddingRight = gutter;
      body.style.paddingRight = gutter;
    }

    return () => {
      document.removeEventListener('keydown', handleKey);
      html.classList.remove('modal-scroll-lock');
      body.classList.remove('modal-scroll-lock');
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      html.style.paddingRight = previousHtmlPaddingRight;
      body.style.paddingRight = previousBodyPaddingRight;
      setMounted(false);
    };
  }, []);

  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  if (!mounted) return null;

  return createPortal((
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/52 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 flex min-h-full items-center justify-center p-4">
        <div className={`relative bg-white w-full ${sizes[size]} rounded-ios-xl shadow-ios-modal max-h-[90vh] overflow-hidden flex flex-col`}>
          <div className="hidden" />
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-ios-separator/50 shrink-0">
            <h3 className="text-headline font-semibold text-ios-primary">{title}</h3>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-ios-fill flex items-center justify-center hover:bg-ios-fill2 transition-colors">
              <X className="w-3.5 h-3.5 text-ios-secondary" strokeWidth={2.5} />
            </button>
          </div>
          {/* Content */}
          <div className="overflow-y-auto flex-1 px-5 py-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  ), document.body);
}
