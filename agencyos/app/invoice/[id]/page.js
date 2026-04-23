'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { fmtDate } from '@/lib/utils';
import { ArrowLeft, Printer } from 'lucide-react';

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function fmtMoney(amount, currency = 'EUR') {
  return new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function splitLines(value) {
  return (value || '').split('\n').map(line => line.trim()).filter(Boolean);
}

export default function InvoicePrintPage({ params }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadInvoice() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }
      const { data } = await supabase
        .from('billing')
        .select('*, clients(name,company,email,phone,client_type)')
        .eq('id', params.id)
        .single();
      setInvoice(data || null);
      setLoading(false);
    }
    loadInvoice();
  }, [params.id, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-ios-bg flex items-center justify-center">
        <div className="w-8 h-8 border-[3px] border-ios-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-ios-bg flex items-center justify-center p-6">
        <div className="card p-8 text-center max-w-md">
          <p className="text-headline font-semibold mb-2">Invoice not found</p>
          <button className="btn-secondary" onClick={() => router.push('/dashboard/billing')}>Back to Billing</button>
        </div>
      </div>
    );
  }

  const currency = invoice.invoice_currency || 'EUR';
  const rate = currency === 'EUR' ? 1 : (Number(invoice.exchange_rate) || 1);
  const amountEur = roundMoney(invoice.amount);
  const displayAmount = roundMoney(invoice.display_amount ?? amountEur * rate);
  const monthLabel = `${MONTHS_FULL[(invoice.month || 1) - 1]} ${invoice.year || new Date().getFullYear()}`;
  const itemDescription = invoice.invoice_description?.trim()
    ? invoice.invoice_description.trim()
    : `Online marketing services - ${monthLabel}`;
  const issuerLines = splitLines(invoice.issuer_details);
  const clientLines = splitLines(invoice.client_billing_details);
  const clientFallback = [
    invoice.clients?.company || invoice.clients?.name,
    invoice.clients?.email,
    invoice.clients?.phone,
  ].filter(Boolean);

  return (
    <div className="min-h-screen bg-ios-bg text-ios-primary">
      <div className="no-print sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-ios-separator/50">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button onClick={() => router.push('/dashboard/billing')} className="btn-secondary flex items-center gap-2">
            <ArrowLeft className="w-4 h-4" /> Billing
          </button>
          <button onClick={() => window.print()} className="btn-primary flex items-center gap-2">
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
        </div>
      </div>

      <main className="max-w-4xl mx-auto p-4 sm:p-8 print:p-0">
        <section className="bg-white rounded-ios-lg shadow-ios p-8 sm:p-12 print:shadow-none print:rounded-none invoice-page">
          <header className="flex items-start justify-between gap-6 border-b border-ios-separator pb-8">
            <div>
              <div className="w-14 h-14 rounded-full border border-ios-separator flex items-center justify-center text-title3 font-bold text-ios-blue mb-5">
                SM
              </div>
              <p className="text-title2 font-bold">INVOICE</p>
              <p className="text-subhead text-ios-secondary mt-1">Invoice # {invoice.invoice_number || 'Draft'}</p>
            </div>
            <div className="text-right">
              <p className="text-footnote uppercase tracking-wide text-ios-secondary">Balance Due</p>
              <p className="text-title1 font-bold mt-1">{fmtMoney(displayAmount, currency)}</p>
              {currency !== 'EUR' && (
                <p className="text-footnote text-ios-tertiary mt-1">
                  Internal value: {fmtMoney(amountEur, 'EUR')} at 1 EUR = {rate} {currency}
                </p>
              )}
            </div>
          </header>

          <div className="grid sm:grid-cols-2 gap-8 py-8">
            <div>
              <p className="text-footnote uppercase tracking-wide text-ios-secondary mb-3">From</p>
              {issuerLines.length > 0 ? issuerLines.map(line => (
                <p key={line} className="text-subhead text-ios-primary leading-6">{line}</p>
              )) : (
                <p className="text-subhead text-ios-tertiary">Add issuer details in Billing before exporting.</p>
              )}
            </div>
            <div>
              <p className="text-footnote uppercase tracking-wide text-ios-secondary mb-3">Bill To</p>
              {(clientLines.length > 0 ? clientLines : clientFallback).map(line => (
                <p key={line} className="text-subhead text-ios-primary leading-6">{line}</p>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 rounded-ios bg-ios-bg p-4 mb-8">
            <div>
              <p className="text-caption1 text-ios-secondary">Invoice Date</p>
              <p className="text-subhead font-semibold">{fmtDate(invoice.issue_date)}</p>
            </div>
            <div>
              <p className="text-caption1 text-ios-secondary">Due Date</p>
              <p className="text-subhead font-semibold">{fmtDate(invoice.due_date)}</p>
            </div>
            <div>
              <p className="text-caption1 text-ios-secondary">Currency</p>
              <p className="text-subhead font-semibold">{currency}</p>
            </div>
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-ios-separator text-left">
                <th className="py-3 text-footnote uppercase tracking-wide text-ios-secondary font-semibold">#</th>
                <th className="py-3 text-footnote uppercase tracking-wide text-ios-secondary font-semibold">Item & Description</th>
                <th className="py-3 text-footnote uppercase tracking-wide text-ios-secondary font-semibold text-right">Qty</th>
                <th className="py-3 text-footnote uppercase tracking-wide text-ios-secondary font-semibold text-right">Rate</th>
                <th className="py-3 text-footnote uppercase tracking-wide text-ios-secondary font-semibold text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-ios-separator/60">
                <td className="py-4 text-subhead align-top">1</td>
                <td className="py-4 text-subhead align-top pr-4">{itemDescription}</td>
                <td className="py-4 text-subhead align-top text-right">1.00</td>
                <td className="py-4 text-subhead align-top text-right">{fmtMoney(displayAmount, currency)}</td>
                <td className="py-4 text-subhead align-top text-right font-semibold">{fmtMoney(displayAmount, currency)}</td>
              </tr>
            </tbody>
          </table>

          <div className="flex justify-end mt-8">
            <div className="w-full max-w-xs space-y-3">
              <div className="flex justify-between text-subhead">
                <span className="text-ios-secondary">Sub Total</span>
                <span>{fmtMoney(displayAmount, currency)}</span>
              </div>
              <div className="flex justify-between text-subhead">
                <span className="text-ios-secondary">Tax</span>
                <span>{Number(invoice.tax_rate || 0).toFixed(2)}%</span>
              </div>
              <div className="border-t border-ios-separator pt-3 flex justify-between text-title3 font-bold">
                <span>Total</span>
                <span>{fmtMoney(displayAmount, currency)}</span>
              </div>
              <div className="flex justify-between text-subhead font-semibold text-ios-blue">
                <span>Balance Due</span>
                <span>{fmtMoney(displayAmount, currency)}</span>
              </div>
            </div>
          </div>

          <footer className="mt-12 pt-6 border-t border-ios-separator">
            <p className="text-footnote uppercase tracking-wide text-ios-secondary mb-2">Notes</p>
            <p className="text-subhead text-ios-secondary">{invoice.notes || 'Thanks for your business.'}</p>
          </footer>
        </section>
      </main>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          body { background: white !important; }
          .no-print { display: none !important; }
          .invoice-page { width: 100%; min-height: auto; }
        }
      `}</style>
    </div>
  );
}
