import { useSyncExternalStore } from "react";

/** Nothing to subscribe to — the value flips once, at hydration, and never again. */
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

/**
 * `false` during SSR and the hydration render, `true` afterwards.
 *
 * Use this to gate reads of client-only sources (localStorage, matchMedia,
 * the user's local clock) so they can be derived during render instead of
 * written into state from an effect.
 */
export const useIsMounted = (): boolean =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
