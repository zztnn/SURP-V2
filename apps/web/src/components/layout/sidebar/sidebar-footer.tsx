'use client';

import { useSidebarStore } from '@/stores/sidebar-store';

import { SystemInfoModal } from './system-info-modal';

export function SidebarFooter(): React.ReactElement {
  const isExpanded = useSidebarStore((s) => s.isExpanded || s.isMobileOpen);

  return (
    <div className="border-t border-sidebar-foreground/10">
      <div className="flex items-center justify-center px-2 py-2">
        <SystemInfoModal isExpanded={isExpanded} />
      </div>
    </div>
  );
}
