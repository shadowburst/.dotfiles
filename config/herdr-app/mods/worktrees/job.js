// A command in a hidden herdr-core terminal: it outlives the popup's 30 s exec
// limit, and its output shows in the popup while it runs.

import { hc } from "herdr";

const json = (r) => {
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
};

export class Job {
  // onLines(lines) gets the output so far; resolves with the exit code.
  static async run(cwd, argv, onLines) {
    const started = json(await hc(["run", "--bg", "--json", "--no-notify", "--name", `worktrees-${Date.now()}`, "--cwd", cwd, "--", ...argv]));
    if (!started?.address) throw new Error(`Cannot start ${argv.slice(0, 3).join(" ")} in herdr-core.`);
    const t = started.address;
    let state = null;
    for (;;) {
      await hc(["wait", t, "--timeout", "1", "--json"]);
      state = json(await hc(["get", t, "--json"]));
      const screen = (await hc(["read", t, "--lines", "500"])).stdout ?? "";
      onLines(screen.replace(/\s+$/, "").split("\n"));
      if (!state || state.state === "finished") break;
    }
    await hc(["rm", t]);
    return state?.exit_code ?? 1;
  }
}
