'use client';
import { X } from 'lucide-react';
import { useEffect } from 'react';

export default function Modal({ title, onClose, children, size = 'md' }) {
  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, []);

  const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
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
  );
}
