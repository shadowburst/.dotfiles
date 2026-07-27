import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const commands = {
  commit: "Create Conventional Commit(s) from current changes",
  pr: "Create or update a GitHub pull request",
};

export default function (pi: ExtensionAPI) {
  for (const [skill, description] of Object.entries(commands)) {
    pi.registerCommand(skill, {
      description,
      handler: async (args, ctx) => {
        const model = ctx.modelRegistry.find("openai-codex", "gpt-5.6-luna");
        if (!model || !(await pi.setModel(model))) {
          ctx.ui.notify("openai-codex/gpt-5.6-luna is unavailable", "error");
          return;
        }

        pi.sendUserMessage(`Use the \`${skill}\` skill with ${args}.`);
      },
    });
  }
}
