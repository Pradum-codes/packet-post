import FileUpload from './components/FileUpload';

export default function Home() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'dropr',
    description:
      'Send files instantly with no account needed. Share secure links or use private browser-to-browser transfers.',
    url: 'https://dropr.pradum.dev',
    applicationCategory: 'FileTransferApplication',
    operatingSystem: 'All',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };

  return (
    <main className="bg-background" aria-labelledby="page-title">
      <h1 id="page-title" className="sr-only">
        dropr - Send files instantly
      </h1>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FileUpload />
    </main>
  );
}
