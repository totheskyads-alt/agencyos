export const metadata = {
  title: 'Terms & Conditions',
  description: 'Read the Terms & Conditions for using Sky Metrics — the project management and time tracking platform for agencies.',
  alternates: {
    canonical: 'https://www.sky-metrics.online/terms',
  },
  openGraph: {
    title: 'Terms & Conditions | Sky Metrics',
    description: 'Read the Terms & Conditions for using Sky Metrics.',
    url: 'https://www.sky-metrics.online/terms',
  },
};

export default function TermsPage() {
  return (
    <div style={{background:'#05080f',color:'#F0F4FF',fontFamily:'Montserrat,sans-serif',minHeight:'100vh',padding:'0'}}>
      <nav style={{position:'sticky',top:0,background:'rgba(5,8,15,0.95)',backdropFilter:'blur(24px)',borderBottom:'1px solid rgba(255,255,255,0.07)',padding:'16px 5%',display:'flex',alignItems:'center',justifyContent:'space-between',zIndex:100}}>
        <a href="/" style={{display:'flex',alignItems:'center',gap:10,textDecoration:'none',color:'#F0F4FF',fontWeight:800,fontSize:'1rem'}}>
          <span style={{fontSize:'1.4rem'}}>🚀</span> Sky Metrics
        </a>
        <a href="/" style={{color:'#6B7A9F',textDecoration:'none',fontSize:'.85rem',fontWeight:600}}>← Back to Home</a>
      </nav>

      <div style={{maxWidth:760,margin:'0 auto',padding:'4rem 5%'}}>
        <div style={{display:'inline-block',background:'rgba(255,107,53,0.1)',border:'1px solid rgba(255,107,53,0.22)',color:'#FF6B35',padding:'.28rem .88rem',borderRadius:100,fontSize:'.68rem',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:'1rem'}}>
          Legal
        </div>
        <h1 style={{fontSize:'clamp(1.8rem,3.5vw,2.6rem)',fontWeight:900,lineHeight:1.1,letterSpacing:'-.03em',marginBottom:'1rem'}}>Terms & Conditions</h1>
        <p style={{color:'#6B7A9F',fontSize:'.88rem',marginBottom:'3rem'}}>Last updated: April 2026</p>

        {[
          {
            title: '1. Acceptance of Terms',
            body: 'By accessing or using Sky Metrics, you agree to be bound by these Terms & Conditions. If you do not agree, please do not use the platform.'
          },
          {
            title: '2. Description of Service',
            body: 'Sky Metrics is a SaaS platform providing project management, time tracking, financial reporting, and team management tools for agencies and freelancers. Access is by invitation or admin approval only.'
          },
          {
            title: '3. Account Responsibilities',
            body: 'You are responsible for maintaining the confidentiality of your account credentials. You agree not to share your account with others or use another person\'s account. You are responsible for all activity that occurs under your account.'
          },
          {
            title: '4. Acceptable Use',
            body: 'You agree to use Sky Metrics only for lawful business purposes. You may not use the platform to store illegal content, attempt to gain unauthorized access to other accounts or systems, or interfere with the proper functioning of the service.'
          },
          {
            title: '5. Data Ownership',
            body: 'You retain full ownership of all data you enter into Sky Metrics. We do not claim any rights over your business data. You can export or request deletion of your data at any time.'
          },
          {
            title: '6. Service Availability',
            body: 'We aim for high availability but do not guarantee uninterrupted access. We may perform maintenance that temporarily affects service availability. We will communicate planned downtime in advance where possible.'
          },
          {
            title: '7. Payments & Subscriptions',
            body: 'Subscription fees (if applicable) are billed in advance. Refunds are handled on a case-by-case basis. We reserve the right to change pricing with 30 days notice to active subscribers.'
          },
          {
            title: '8. Termination',
            body: 'We reserve the right to suspend or terminate accounts that violate these terms. You may cancel your account at any time by contacting contact@tothesky.online.'
          },
          {
            title: '9. Limitation of Liability',
            body: 'Sky Metrics is provided "as is". We are not liable for indirect, incidental, or consequential damages arising from use of the service. Our maximum liability is limited to the amount paid for the service in the last 3 months.'
          },
          {
            title: '10. Governing Law',
            body: 'These terms are governed by the laws of Romania. Any disputes will be resolved in the courts of Romania.'
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
