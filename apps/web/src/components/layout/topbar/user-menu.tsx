'use client';

import { Crown, LogOut, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useLogout, useMe } from '@/hooks/use-auth';
import { useIsMobile } from '@/hooks/use-media-query';
import { roleLabel as roleLabelOf, roleLabels } from '@/lib/role-labels';
import { cn, getInitials } from '@/lib/utils';

import type { ReactElement } from 'react';

const ADMIN_ROLE_CODES = ['administrator', 'patrimonial_admin'];

function isAdminUser(roles: readonly string[]): boolean {
  return roles.some((r) => ADMIN_ROLE_CODES.includes(r));
}

function primaryRoleLabel(roles: readonly string[]): string {
  // Prioriza administrator > patrimonial_admin > primer rol del array
  for (const code of ADMIN_ROLE_CODES) {
    if (roles.includes(code)) {
      return roleLabelOf(code);
    }
  }
  return roles[0] ? roleLabelOf(roles[0]) : 'Usuario';
}

function UserAvatar({
  className,
  initials,
}: {
  className?: string;
  initials: string;
}): ReactElement {
  return (
    <Avatar className={cn('h-8 w-8', className)}>
      <AvatarFallback className="bg-primary text-sm font-medium text-primary-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}

function AdminCrown({ className }: { className?: string }): ReactElement {
  return <Crown aria-label="Administrador" className={cn('shrink-0 text-amber-500', className)} />;
}

function UserInfoCard({
  displayName,
  roleLabel,
  email,
  isAdmin,
  organizationId,
}: {
  displayName: string;
  roleLabel: string;
  email: string;
  isAdmin: boolean;
  organizationId: string;
}): ReactElement {
  return (
    <div className="rounded-lg bg-muted px-4 py-3">
      <div className="flex items-center gap-1.5">
        <p className="truncate text-sm font-bold text-foreground">{displayName}</p>
        {isAdmin ? <AdminCrown className="h-3.5 w-3.5" /> : null}
      </div>
      <p className="truncate text-xs font-semibold text-primary">{roleLabel}</p>
      {email ? <p className="truncate text-xs font-medium text-muted-foreground">{email}</p> : null}
      <p className="mt-2 truncate text-xs font-medium text-muted-foreground">
        Organización #{organizationId}
      </p>
    </div>
  );
}

const menuItemClass =
  'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm text-foreground transition-colors hover:bg-accent';

const dangerItemClass =
  'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 cursor-pointer';

export function UserMenu(): ReactElement | null {
  const isMobile = useIsMobile();
  const me = useMe();
  const logoutMutation = useLogout();
  const router = useRouter();

  if (!me.data) {
    return null;
  }
  const user = me.data;
  const displayName = user.displayName.trim();
  const email = user.email;
  const initials = getInitials(displayName);
  const isAdmin = isAdminUser(user.roles);
  const roleLabel = user.roles.length > 1 ? roleLabels(user.roles) : primaryRoleLabel(user.roles);

  function handleSignOut(): void {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        router.replace('/login');
      },
    });
  }

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-full outline-none ring-ring focus-visible:ring-2"
          >
            <UserAvatar initials={initials} />
          </button>
        </SheetTrigger>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="px-4 pt-4 pb-0">
            <SheetTitle className="text-base">Cuenta</SheetTitle>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-1 p-4">
            <UserInfoCard
              displayName={displayName}
              roleLabel={roleLabel}
              email={email}
              isAdmin={isAdmin}
              organizationId={user.organizationId}
            />
            <nav className="mt-2 flex flex-col gap-0.5">
              <Link href="/me" className={menuItemClass}>
                <User className="h-4 w-4" />
                Mi cuenta
              </Link>
              <div className="my-1.5 border-t border-border" />
              <button type="button" className={dangerItemClass} onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                Cerrar sesión
              </button>
            </nav>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full outline-none ring-ring focus-visible:ring-2"
        >
          <UserAvatar initials={initials} />
          <div className="hidden max-w-[180px] flex-col md:flex">
            <div className="flex items-center gap-1">
              <span className="truncate text-sm font-semibold">{displayName}</span>
              {isAdmin ? <AdminCrown className="h-3.5 w-3.5" /> : null}
            </div>
            <span className="truncate text-xs text-muted-foreground">{roleLabel}</span>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-[260px] rounded-xl border border-border p-2 shadow-[0_8px_32px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)]"
      >
        <div className="mb-2">
          <UserInfoCard
            displayName={displayName}
            roleLabel={roleLabel}
            email={email}
            isAdmin={isAdmin}
            organizationId={user.organizationId}
          />
        </div>
        <DropdownMenuItem asChild className="rounded-md text-sm text-foreground hover:bg-accent">
          <Link href="/me">
            <User className="mr-2 h-4 w-4" />
            Mi cuenta
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator className="my-1.5 border-border" />
        <DropdownMenuItem
          className="rounded-md text-sm font-medium text-destructive hover:bg-destructive/10"
          onClick={handleSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
