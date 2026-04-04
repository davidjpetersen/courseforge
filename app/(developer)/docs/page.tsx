export default function DeveloperApiDocsPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>CourseForge Connect API Docs</h1>
      <div id="swagger-ui" />
      <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js" defer />
      <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-standalone-preset.js" defer />
      <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
      <script
        defer
        dangerouslySetInnerHTML={{
          __html: `window.addEventListener('load', function () {
            if (window.SwaggerUIBundle) {
              window.SwaggerUIBundle({
                url: '/api/v1/openapi.json',
                dom_id: '#swagger-ui',
                presets: [window.SwaggerUIBundle.presets.apis, window.SwaggerUIStandalonePreset],
              });
            }
          });`,
        }}
      />
    </main>
  );
}
