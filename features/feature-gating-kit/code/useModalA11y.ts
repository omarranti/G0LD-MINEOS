"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * Shared modal accessibility: Escape to close, Tab focus-trap, body scroll lock,
 * and focus restore to the element that opened the modal.
 *
 * Extracted from the original inline implementation in UpgradeModal so every
 * modal (UpgradeModal, ExitIntentPopup, FoundingModal) behaves the same.
 *
 * Pass a ref to the modal panel element and call when `open` flips true.
 */
export function useModalA11y(
  open: boolean,
  onClose: () => void,
  modalRef: RefObject<HTMLElement | null>,
) {
  const triggerRef = useRef<Element | null>(null);

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  const handleTab = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [modalRef],
  );

  useEffect(() => {
    if (!open) return;

    // Store the element that opened the modal so we can restore focus on close.
    triggerRef.current = document.activeElement;
    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", handleTab);
    document.body.style.overflow = "hidden";

    // Move focus into the modal on next tick.
    requestAnimationFrame(() => {
      const first = modalRef.current?.querySelector<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      first?.focus();
    });

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleTab);
      document.body.style.overflow = "";
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, [open, handleEscape, handleTab, modalRef]);
}
