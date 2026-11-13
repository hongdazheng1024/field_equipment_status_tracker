import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Adds DOM matchers like toBeInTheDocument(), and unmounts rendered
// components after each test so tests don't see each other's DOM.
afterEach(() => cleanup());

// jsdom has no <dialog> modal support yet. This stand-in only toggles `open`;
// the real behaviour (inert page, backdrop, focus trap) is checked in a browser.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
}
