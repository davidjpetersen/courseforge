'use client';

import { useEffect, useState } from 'react';

interface AuditEntry {
  timestamp: string;
  actor: string;
  actionType: string;
  resourceType: string;
  detail?: Record<string, unknown>;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  useEffect(() => {
    void fetch('/api/audit')
      .then((res) => {
        if (res.status === 403) {
          throw new Error('forbidden');
        }
        return res.json();
      })
      .then((payload) => setEntries(payload.entries ?? []));
  }, []);

  return (
    <div>
      <button onClick={() => (window.location.href = '/api/audit/export')}>Export CSV</button>
      <table>
        <thead>
          <tr>
            <th>timestamp</th>
            <th>actor</th>
            <th>action</th>
            <th>resource</th>
            <th>detail</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={`${entry.timestamp}-${entry.actor}-${entry.actionType}`}>
              <td>{entry.timestamp}</td>
              <td>{entry.actor}</td>
              <td>{entry.actionType}</td>
              <td>{entry.resourceType}</td>
              <td>{JSON.stringify(entry.detail ?? {})}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
