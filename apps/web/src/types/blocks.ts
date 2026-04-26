export type BlockTargetType = 'party' | 'vehicle';

export interface BlockListItem {
  id: string;
  externalId: string;
  targetType: BlockTargetType;
  targetId: string;
  reason: string;
  active: boolean;
  grantedAt: string;
  grantedByUserId: string;
  revokedAt: string | null;
  revokedByUserId: string | null;
  revokeReason: string | null;
  linkedIncidentId: string | null;
}

export interface BlockListResponse {
  page: number;
  pageSize: number;
  total: number;
  items: BlockListItem[];
}

export interface BlockListFilters {
  page?: number;
  pageSize?: number;
  targetType?: BlockTargetType;
  active?: boolean;
}
