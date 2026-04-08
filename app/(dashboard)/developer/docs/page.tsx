'use client';

import { useEffect, useRef } from 'react';

export default function SwaggerDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/swagger-ui-dist/swagger-ui.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js';
    script.onload = () => {
      if (containerRef.current && (window as any).SwaggerUIBundle) {
        (window as any).SwaggerUIBundle({
          url: '/api/v1/openapi.json',
          dom_id: '#swagger-ui',
          presets: [(window as any).SwaggerUIBundle.presets.apis],
          layout: 'BaseLayout',
        });
      }
    };
    document.body.appendChild(script);

    return () => {
      document.head.removeChild(link);
      document.body.removeChild(script);
    };
  }, []);

  return (
    <main className="min-h-screen bg-white p-6">
      <div className="space-y-2 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">API Documentation</h1>
        <p className="text-sm text-slate-600">
          Interactive API reference powered by OpenAPI 3.1.
        </p>
      </div>
      <div id="swagger-ui" ref={containerRef} />
    </main>
  );
}
