export type MenuNodeKind = 'group' | 'subgroup' | 'item';

export interface MenuNode {
  id: number;
  code: string;
  kind: MenuNodeKind;
  label: string;
  icon?: string | null;
  href?: string | null;
  badge?: number;
  isFavorite?: boolean;
  children: MenuNode[];
}

export interface MenuTree {
  nodes: MenuNode[];
  favorites: MenuNode[];
}

export interface MenuItemRecord {
  id: number;
  tenantId: number | null;
  parentId: number | null;
  kind: MenuNodeKind;
  depth: number;
  code: string;
  label: string;
  icon: string | null;
  href: string | null;
  position: number;
  requiredPermissionCode: string | null;
  badgeQuery: string | null;
  isActive: boolean;
  isSystem: boolean;
}

export interface CreateMenuItemInput {
  scope: 'global' | 'tenant';
  parentId?: number | null;
  kind: MenuNodeKind;
  code: string;
  label: string;
  icon?: string | null;
  href?: string;
  position: number;
  requiredPermissionCode?: string | null;
  badgeQuery?: string | null;
  isActive?: boolean;
}

export interface UpdateMenuItemInput {
  label?: string;
  icon?: string | null;
  href?: string | null;
  position?: number;
  parentId?: number | null;
  requiredPermissionCode?: string | null;
  badgeQuery?: string | null;
  isActive?: boolean;
}

export interface ReorderEntry {
  id: number;
  position: number;
  parentId?: number | null;
}

export interface UpsertOverrideInput {
  labelOverride?: string | null;
  iconOverride?: string | null;
  positionOverride?: number | null;
  parentCodeOverride?: string | null;
  isHidden?: boolean;
}
