/**
 * TermsModal is no longer used as a modal overlay.
 * Terms are now presented as a full-page screen: TermsScreen.tsx.
 * This file is kept as a stub to avoid any stale import errors during the transition.
 */

export interface TermsModalProps {
  open: boolean;
  onAccept: () => void;
}

export function TermsModal(_props: TermsModalProps) {
  return null;
}
