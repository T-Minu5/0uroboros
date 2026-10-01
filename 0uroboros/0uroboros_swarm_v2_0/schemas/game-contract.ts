// 0uroboros Game Contract v2.0
// Preserves v1.1 gameplay contract; this file is an implementation skeleton, not a rule source.
export type PlayerId = "P1" | "P2";
export type NodeId = 1 | 2 | 3 | 4 | 5;
export type RuntimeTurn = 1 | 2 | 3;
export interface DataCenterState { id: "PRIMARY" | "BACKUP"; current: number; max: number; destroyed: boolean; }
export interface MarketEntry { marketEntryId: string; cardDefinitionId: string; category: "BASE"|"CHAOS"|"VP"|"CRYPTO"|"CIRCUIT_REWARD"; effectiveCost?: number; sharedRemaining?: number; p1Remaining?: number; p2Remaining?: number; }
export interface DraftPurchaseRequest { requestId: string; matchId: string; playerId: PlayerId; marketEntryId: string; clientObservedDraftVersion?: number; }
export interface DraftPurchaseAck { requestId: string; accepted: boolean; rejectionReason?: string; resultingWallet: number; resultingSharedRemaining?: number; resultingPlayerRemaining?: number; grantedCardInstanceId?: string; eventSequences: number[]; }
export interface GameEvent<T = unknown> { eventId: string; sequence: number; type: string; serverTimeMs: number; payload: T; relatedRuleIds?: string[]; causationId?: string; correlationId?: string; rngRef?: string; }
export interface ContractRequest { id: string; requester: string; missingFieldOrEvent: string; useCase: string; authoritativeOrPresentation: "AUTHORITATIVE"|"PRESENTATION"|"UNSURE"; relatedIds: string[]; suggestedShape?: unknown; fallbackIfDenied?: string; canonicalVersion: string; }
export interface ProvisionalMock { id: string; contractRequestId: string; requester: string; provisionalData: unknown; provisionalFields: string[]; assumptions: string[]; fallback: string; reconcileOnContractVersion?: string; }
