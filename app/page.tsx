import FileUpload from './components/FileUpload';

export default function Home() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Packet Post',
    description:
      'Send files instantly with no account needed. Share secure links or use private browser-to-browser transfers.',
    url: 'https://packet-post.pradum.dev',
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
        Packet Post - Send files instantly
      </h1>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <FileUpload />
    </main>
  );
}
