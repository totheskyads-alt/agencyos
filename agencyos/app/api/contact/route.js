import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
      }),
    });
  } catch (e) {
    // Telegram failure doesn't block the form
  }
}

export async function POST(request) {
  try {
    const { full_name, email, account_type, seats, company_name } = await request.json();

    if (!full_name?.trim() || !email?.trim() || !account_type?.trim()) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await adminClient.from('contact_requests').insert({
      full_name: full_name.trim(),
      email: email.trim(),
      account_type: account_type.trim(),
      seats: seats ? parseInt(seats) : null,
      company_name: company_name?.trim() || null,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Trimite notificare Telegram
    const typeLabel = account_type === 'agency' ? `Agency (${seats || '?'} seats)` : 'Freelancer';
    const msg = [
      `🚀 <b>Cerere nouă Sky Metrics!</b>`,
      ``,
      `👤 <b>Nume:</b> ${full_name.trim()}`,
      `📧 <b>Email:</b> ${email.trim()}`,
      `💼 <b>Tip cont:</b> ${typeLabel}`,
      company_name?.trim() ? `🏢 <b>Companie:</b> ${company_name.trim()}` : '',
      ``,
      `⏰ ${new Date().toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest' })}`,
    ].filter(Boolean).join('\n');

    await sendTelegram(msg);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
