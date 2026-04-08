import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const source = readFileSync(
  resolve(__dirname, 'page.tsx'),
  'utf-8',
);

describe('WorkflowDetailPage — Version History tab', () => {
  // Requirement 10.1: Fetch versions from GET /api/workflows/{workflowId}/versions on tab mount
  describe('version fetching on tab mount', () => {
    it('fetches versions from the correct API endpoint', () => {
      expect(source).toContain('/api/workflows/');
      expect(source).toContain('/versions');
    });

    it('only fetches when the versions tab is active', () => {
      expect(source).toContain("activeTab !== 'versions'");
    });

    it('tracks whether versions have been fetched to avoid re-fetching', () => {
      expect(source).toContain('versionsFetched');
      expect(source).toContain('setVersionsFetched(true)');
    });

    it('manages a loading state for versions', () => {
      expect(source).toContain('versionsLoading');
      expect(source).toContain('setVersionsLoading(true)');
      expect(source).toContain('setVersionsLoading(false)');
    });
  });

  // Requirement 10.2: Display table with Version, Published by, Published at, Action columns
  describe('version history table columns', () => {
    it('renders a table element', () => {
      expect(source).toContain('<table');
      expect(source).toContain('</table>');
    });

    it('has Version column header', () => {
      expect(source).toContain('>Version</th>');
    });

    it('has Published by column header', () => {
      expect(source).toContain('>Published by</th>');
    });

    it('has Published at column header', () => {
      expect(source).toContain('>Published at</th>');
    });

    it('has Action column header', () => {
      expect(source).toContain('>Action</th>');
    });

    it('renders version semver in table rows', () => {
      expect(source).toContain('v.semver');
    });

    it('renders createdBy in table rows', () => {
      expect(source).toContain('v.createdBy');
    });

    it('renders createdAt formatted as locale string', () => {
      expect(source).toContain('new Date(v.createdAt).toLocaleString()');
    });

    it('shows empty state when no versions exist', () => {
      expect(source).toContain('No versions published yet.');
    });

    it('shows loading state while fetching versions', () => {
      expect(source).toContain('Loading version history');
    });
  });

  // Requirement 10.3: View compiled plan action opening a modal with step names
  describe('view compiled plan action and modal', () => {
    it('has a View compiled plan button for each version row', () => {
      expect(source).toContain('View compiled plan');
    });

    it('sets viewPlanVersion state when clicking the action', () => {
      expect(source).toContain('setViewPlanVersion(v)');
    });

    it('renders a modal overlay when viewPlanVersion is set', () => {
      expect(source).toContain('viewPlanVersion &&');
      expect(source).toContain('fixed inset-0');
    });

    it('displays the version semver in the modal title', () => {
      expect(source).toContain('viewPlanVersion.semver');
    });

    it('renders step names as an ordered list in the modal', () => {
      expect(source).toContain('stepNames.map');
      expect(source).toContain('list-decimal');
    });

    it('shows fallback message when no step info is available', () => {
      expect(source).toContain('No step information available for this version.');
    });

    it('has a Close button to dismiss the modal', () => {
      expect(source).toContain('setViewPlanVersion(null)');
    });
  });

  // Requirement 10.4: Tooltip explaining rollback is not available in MVP
  describe('rollback not available tooltip', () => {
    it('displays a rollback info banner in the versions tab', () => {
      expect(source).toContain('Rollback is not available in MVP');
    });

    it('explains that users can view but not revert versions', () => {
      expect(source).toContain('You can view previous versions but cannot revert to them');
    });

    it('uses an info-style banner with sky color scheme', () => {
      // The banner uses sky-200 border and sky-50 background
      expect(source).toContain('border-sky-200');
      expect(source).toContain('bg-sky-50');
    });
  });

  // State management
  describe('version history state management', () => {
    it('manages versions state as VersionRecord array', () => {
      expect(source).toContain('useState<VersionRecord[]>');
    });

    it('manages viewPlanVersion state for the modal', () => {
      expect(source).toContain('useState<VersionRecord | null>(null)');
    });

    it('imports VersionRecord type from workflow-ui-utils', () => {
      expect(source).toContain('VersionRecord');
    });
  });
});
