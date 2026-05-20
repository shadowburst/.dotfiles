import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

type RalphMode = "all" | "once";

type CommandModule = {
  createRalphCommand: (options: { mode: RalphMode }) => (args: string, ctx: unknown) => Promise<string>;
};

export default async function (pi: ExtensionAPI) {
  const { createRalphCommand } = (await import(`./src/command.mjs?reload=${Date.now()}`)) as CommandModule;

  pi.registerCommand("ralph", {
    description: "Run the Ralph Loop for all remaining tasks in a Feature Spec.",
    handler: createRalphCommand({ mode: "all" }),
  });

  pi.registerCommand("ralph:once", {
    description: "Run one Ralph Loop task from a Feature Spec, then stop or ask to continue.",
    handler: createRalphCommand({ mode: "once" }),
  });
}
