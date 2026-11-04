import { ApprovalsView } from './Approvals';
import { PurchaseHeadline } from './Headline';
import { OverviewView } from './Overview';
import { SpendView } from './Spend';
import { readyGuard } from './guard';

/** Purchase inside the Management workspace: one sidebar entry, these tabs inside it. */
export const procurementManagement = {
  headline: PurchaseHeadline,
  tabs: [
    { id: 'overview', label: 'Overview', View: readyGuard(OverviewView) },
    { id: 'approvals', label: 'Approvals waiting', View: readyGuard(ApprovalsView) },
    { id: 'spend', label: 'Spend and stock', View: readyGuard(SpendView) },
  ],
  links: [
    { label: 'Requests', path: 'requests' },
    { label: 'Purchase orders', path: 'orders' },
    { label: 'Stock', path: 'stock' },
  ],
};
