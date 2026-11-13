import { execFile } from "node:child_process";
import { createEffect } from "solid-js";

export default {
  id: "herdr.resume",
  setup(api) {
    if (!process.env.HC_TERMINAL_ID || !process.env.HC_TERMINAL_SOCKET) return;
    let selected;
    let chain = Promise.resolve();
    let closed = false;
    function report(sessionID, hookEvent) {
      const event = JSON.stringify({
        session_id: sessionID, hook_event_name: hookEvent,
        cwd: api.location?.directory ?? process.cwd(), argv: process.argv,
      });
      // Selection and exit share a queue: an exit cannot overtake its last capture.
      chain = chain.then(() => new Promise((resolve) => {
        const child = execFile("@helper@", ["opencode"], { timeout: 3000 }, (error, _out, err) => {
          if (error || err) console.warn("Herdr: conversation recovery was not saved", err || error.message);
          resolve();
        });
        child.stdin?.on("error", (error) => console.warn("Herdr: recovery capture input failed", error.message));
        child.stdin?.end(event);
      })).catch((error) => console.warn("Herdr: recovery capture failed", error.message));
      return chain;
    }
    const remove = api.ui.slot({
      append: "app",
      render() {
        createEffect(() => {
          if (closed) return;
          const route = api.ui.router.current();
          const id = route.type === "session" ? route.sessionID : null;
          if (id === selected) return;
          if (id) report(id, "SessionStart");
          else if (selected) report(selected, "SessionEnd");
          selected = id;
        });
        return null;
      },
    });
    return () => {
      closed = true;
      remove();
      return selected ? report(selected, "SessionEnd") : chain;
    };
  },
};
