import { createRalphCommand } from "./command.mjs";

export function registerRalphCommands(pi) {
  pi.registerCommand("ralph", {
    description: "Run the Ralph Loop for all remaining tasks in a Feature Spec.",
    handler: createRalphCommand({ mode: "all" }),
  });

  pi.registerCommand("ralph:once", {
    description: "Run one Ralph Loop task from a Feature Spec, then stop or ask to continue.",
    handler: createRalphCommand({ mode: "once" }),
  });
}
