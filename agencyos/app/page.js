'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function Home() {
  const router = useRouter();
  const [showLP, setShowLP] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/dashboard');
      } else {
        setShowLP(true);
      }
    });
  }, []);

  if (!showLP) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#05080f'}}>
      <div style={{width:32,height:32,border:'3px solid #3B8FFF',borderTop:'3px solid transparent',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <iframe
      src="/lp.html"
      style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',border:'none'}}
      title="Sky Metrics — Track Everything. Scale Anything."
    />
  );
}
