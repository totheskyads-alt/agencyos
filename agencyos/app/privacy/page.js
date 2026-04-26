export const metadata = {
  title: 'Privacy Policy',
  description: 'Learn how Sky Metrics collects, uses, and protects your personal data. We are committed to your privacy.',
  alternates: {
    canonical: 'https://www.sky-metrics.online/privacy',
  },
  openGraph: {
    title: 'Privacy Policy | Sky Metrics',
    description: 'Learn how Sky Metrics collects, uses, and protects your personal data.',
    url: 'https://www.sky-metrics.online/privacy',
  },
};

export default function PrivacyPage() {
  return (
    <div style={{background:'#05080f',color:'#F0F4FF',fontFamily:'Montserrat,sans-serif',minHeight:'100vh',padding:'0'}}>
      <nav style={{position:'sticky',top:0,background:'rgba(5,8,15,0.95)',backdropFilter:'blur(24px)',borderBottom:'1px solid rgba(255,255,255,0.07)',padding:'16px 5%',display:'flex',alignItems:'center',justifyContent:'space-between',zIndex:100}}>
        <a href="/" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none',color:'#F0F4FF',fontWeight:800,fontSize:'1rem'}}>
          <span style={{fontSize:'1.4rem'}}>🚀</span> Sky Metrics
        </a>
        <a href="/" style={{color:'#6B7A9F',textDecoration:'none',fontSize:'.85rem',fontWeight:600}}>← Back to Home</a>
      </nav>

      <div style={{maxWidth:760,margin:'0 auto',padding:'4rem 5%'}}>
        <div style={{display:'inline-block',background:'rgba(59,143,255,0.09)',border:'1px solid rgba(59,143,255,0.22)',color:'#3B8FFF',padding:'.28rem .88rem',borderRadius:100,fontSize:'.68rem',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:'1rem'}}>
          Legal
        </div>
        <h1 style={{fontSize:'clamp(1.8rem,3.5vw,2.6rem)',fontWeight:900,lineHeight:1.1,letterSpacing:'-.03em',marginBottom:'1rem'}}>Privacy Policy</h1>
        <p style={{color:'#6B7A9F',fontSize:'.88rem',marginBottom:'3rem'}}>Last updated: April 2026</p>

        {[
          {
            title: '1. Who We Are',
            body: 'Sky Metrics is a project & time management platform for agencies. We are operated by To The Sky Ads. For any questions regarding this privacy policy, contact us at contact@tothesky.online.'
          },
          {
            title: '2. What Data We Collect',
            body: 'We collect information you provide directly: name, email address, company name, and usage data within the platform (time entries, projects, tasks, notes, billing records). We do not sell your data to third parties.'
          },
          {
            title: '3. How We Use Your Data',
            body: 'Your data is used exclusively to provide the Sky Metrics service — tracking time, managing projects, generating reports and invoices. We may use your email to send important service notifications and updates.'
          },
          {
            title: '4. Data Storage & Security',
            body: 'All data is stored securely on Supabase (EU region). Access is protected by Row Level Security — each user can only access their own data. Passwords are never stored in plain text.'
          },
          {
            title: '5. Third-Party Services',
            body: 'We use Supabase for database and authentication, Vercel for hosting. These services have their own privacy policies. We do not share your data with any advertising networks.'
          },
          {
            title: '6. Your Rights',
            body: 'You have the right to access, correct, or delete your personal data at any time. To request data deletion, contact us at contact@tothesky.online. We will process your request within 30 days.'
          },
          {
            title: '7. Cookies',
            body: 'We use only essential session cookies required for authentication. We do not use tracking or advertising cookies.'
          },
          {
            title: '8. Changes to This Policy',
            body: 'We may update this policy occasionally. We will notify active users of significant changes via email. Continued use of the platform after changes constitutes acceptance.'
          },
        ].map((section, i) => (
          <div key={i} style={{marginBottom:'2rem',padding:'1.5rem',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:16}}>
            <h2 style={{fontSize:'1rem',fontWeight:800,marginBottom:'.75rem',color:'#F0F4FF'}}>{section.title}</h2>
            <p style={{color:'#6B7A9F',fontSize:'.88rem',lineHeight:1.8}}>{section.body}</p>
          </div>
        ))}

        <div style={{marginTop:'3rem',padding:'1.5rem',background:'rgba(59,143,255,0.06)',border:'1px solid rgba(59,143,255,0.18)',borderRadius:16,textAlign:'center'}}>
          <p style={{color:'#6B7A9F',fontSize:'.85rem'}}>Questions? Email us at{' '}
            <a href="mailto:contact@tothesky.online" style={{color:'#3B8FFF',textDecoration:'none',fontWeight:600}}>contact@tothesky.online</a>
          </p>
        </div>
      </div>

      <footer style={{borderTop:'1px solid rgba(255,255,255,0.07)',padding:'2rem 5%',textAlign:'center',color:'#6B7A9F',fontSize:'.75rem'}}>
        © 2026 Sky Metrics · <a href="/privacy" style={{color:'#6B7A9F',textDecoration:'none'}}>Privacy Policy</a> · <a href="/terms" style={{color:'#6B7A9F',textDecoration:'none'}}>Terms</a>
      </footer>
    </div>
  );
}
