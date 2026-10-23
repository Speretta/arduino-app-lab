import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/ai-assistant')({
  // Renders nothing: the chat panel is mounted persistently by AppLabMain and kept alive across the
  // Editor<->Agent toggle (so its stream subscription survives and switching is a show/hide, not a
  // remount). This route only puts /ai-assistant in the URL, which the layout reads to reveal the panel.
  component: () => null,
});
