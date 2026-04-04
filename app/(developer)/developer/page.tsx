export default function DeveloperPortalPage() {
  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <h1>Developer Portal</h1>
      <p>Manage CourseForge Connect API keys and monitor API usage.</p>

      <section>
        <h2>API Keys</h2>
        <p>Create key modal should display the raw key once with copy action and warning text: "This will not be shown again".</p>
        <ul>
          <li>List all API keys for tenant</li>
          <li>Create new key (name + scope)</li>
          <li>Revoke key with confirmation dialog</li>
        </ul>
      </section>

      <section>
        <h2>Usage Stats</h2>
        <p>Requests today: --</p>
        <p>Requests this month: --</p>
      </section>

      <a href="/developer/docs">Open API reference docs</a>
    </main>
  );
}
