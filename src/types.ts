export type Role = 'customer' | 'contractor' | 'admin';
export type Trade = 'Plumbing' | 'Electrical' | 'Handyman';
export type Status = 'requested' | 'accepted' | 'in_progress' | 'awaiting_confirmation' | 'completed' | 'disputed' | 'refunded' | 'cancelled';

export interface User {
  id: number; email: string; name: string; phone: string | null; role: Role; isDemo: boolean;
  contractor: { id: number; trade: Trade; verified: boolean; licenceType: string; licenceNo: string; initials: string } | null;
}
export interface CatalogItem {
  id: number; trade: Trade; title: string; summary: string; scope: string[]; exclusions: string[];
  durationMin: number; price: number; compliance: string; active: boolean; updatedAt: number;
}
export interface Contractor {
  id: number; name: string; phone: string | null; trade: Trade; licenceType: string; licenceNo: string;
  verified: boolean; rating: number; jobsDone: number; yearsExp: number; bio: string; initials: string;
}
export interface Photo { id: number; kind: 'before' | 'after' | 'rework'; url: string; lat: number | null; lng: number | null; takenAt: number; isSample: boolean; claimId: number | null }
export interface Addon { id: number; label: string; price: number; status: 'pending' | 'approved' | 'declined'; createdAt: number; decidedAt: number | null }
export interface Claim { id: number; issue: string; status: 'open' | 'resolved'; contractorNote: string | null; createdAt: number; resolvedAt: number | null }
export interface Dispute { id: number; reason: string; details: string; status: 'open' | 'released' | 'refunded'; resolutionNote: string | null; createdAt: number; resolvedAt: number | null }
export interface Amounts { base: number; addonsApproved: number; gross: number; fee: number; reserve: number; net: number; feeBps: number; reserveBps: number }
export interface Booking {
  id: number; ref: string; status: Status; trade: Trade; jobTitle: string;
  job: { id: number; title: string; summary: string; scope: string[]; durationMin: number; compliance: string } | null;
  customer: { name: string; phone: string | null };
  contractor: Contractor | null;
  address: { postalCode: string; unitNo: string; area: string; lat: number; lng: number };
  notes: string; windowDate: string; windowSlot: string; hasPart: boolean;
  payment: { rail: 'paynow' | 'card'; ref: string };
  amounts: Amounts;
  createdAt: number; acceptedAt: number | null; checkedInAt: number | null; completedAt: number | null;
  autoReleaseAt: number | null; releasedAt: number | null; releaseType: 'customer' | 'auto' | 'ops' | null; refundedAt: number | null;
  warrantyUntil: number | null; warrantyActive: boolean; completionNote: string | null;
  addons: Addon[]; photos: Photo[]; claims: Claim[]; dispute: Dispute | null;
  events: { at: number; actor: string; message: string }[];
}
export interface Settings { feeBps: number; reserveBps: number; autoReleaseHours: number; warrantyDays: number; demoMode: boolean }
export interface DemoAccount { email: string; name: string; role: Role; trade: Trade | null; licenceType: string | null }
