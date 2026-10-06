/**
 * Shared source-document UI (WP1-FE): section status, provenance and "not answered /
 * not observed" markers. Strings live in common.json (common.sectionStatus.*,
 * common.provenance.*, common.notAnswered, common.notObserved).
 */
export { NotAnswered, NotObserved } from "./Markers";
export { interpolateNodes } from "./interpolate";
export { PROVENANCE_KINDS, ProvenanceBadge, ProvenanceBadges, isProvenanceKind, type ProvenanceEntry, type ProvenanceKind } from "./ProvenanceBadge";
export {
  SECTION_STATUSES,
  StatusPicker,
  StatusPill,
  isSectionStatus,
  normalizeStatus,
  statusLabelKey,
  type SectionStatus,
  type StatusWording,
} from "./StatusPill";
