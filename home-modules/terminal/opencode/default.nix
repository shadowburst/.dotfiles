{...}: {
  programs.opencode = {
    enable = true;
    settings = {
      theme = "catppuccin";
      model = "github-copilot/gpt-4.1";
      mode.build.prompt = "{file:${./prompts/build.md}}";
      mode.plan.prompt = "{file:${./prompts/plan.md}}";
    };
  };
}
