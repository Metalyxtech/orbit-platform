import type { ReactNode } from 'react';
import { Avatar, Icon } from './Icon';

/**
 * Bottom of every sidebar: optional switchers or links, then the signed-in person with sign-out.
 * Sign-out is a POST form so another site cannot sign people out with a link.
 */
export function SideFoot({
  name,
  title,
  signOutAction = '/auth/sign-out',
  children,
}: {
  name: string;
  title?: string | null;
  signOutAction?: string;
  children?: ReactNode;
}) {
  return (
    <div className="o-side-foot">
      {children}
      <div className="o-user">
        <Avatar name={name} />
        <div className="o-user-id">
          <strong title={name}>{name}</strong>
          {title && <span title={title}>{title}</span>}
        </div>
        <form action={signOutAction} method="post">
          <button className="o-iconbtn" type="submit" title="Sign out" aria-label="Sign out">
            <Icon name="signout" size={18} />
          </button>
        </form>
      </div>
      <div className="o-legal">
        <a href="/legal/terms" target="_blank" rel="noreferrer">
          Terms
        </a>
        {' · '}
        <a href="/legal/privacy" target="_blank" rel="noreferrer">
          Privacy
        </a>
      </div>
    </div>
  );
}

/** A plain "Sign out" button for pages without a sidebar. */
export function SignOutButton({ className = 'o-btn', action = '/auth/sign-out' }: { className?: string; action?: string }) {
  return (
    <form action={action} method="post" style={{ display: 'inline-flex' }}>
      <button className={className} type="submit">
        Sign out
      </button>
    </form>
  );
}
