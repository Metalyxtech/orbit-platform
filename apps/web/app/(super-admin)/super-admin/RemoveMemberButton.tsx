'use client';
import { RemoveMemberButton as RemoveButton } from '@/company-admin/RemoveMemberButton';
import { removeMemberAction } from './actions';

/** Super Admin's "Remove from company" for one person. */
export function RemoveMemberButton({ companyId, membershipId, name, company }: { companyId: string; membershipId: string; name: string; company: string }) {
  return <RemoveButton name={name} company={company} remove={(typed) => removeMemberAction(companyId, membershipId, typed)} />;
}
