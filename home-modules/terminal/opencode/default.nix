{...}: {
  programs.opencode = {
    enable = true;
    settings = {
      theme = "system";
      model = "github-copilot/gpt-4.1";
      mode = {
        build = {
          prompt = "{file:${./prompts/build.md}}";
        };
        plan = {
          prompt = "{file:${./prompts/plan.md}}";
        };
      };
      keybinds.leader = "ctrl+g";
    };
  };
}
