{ ... }:

{
  programs.git = {
    enable = true;
    userName = "ShadowBurst";
    userEmail = "37303345+shadowburst@users.noreply.github.com";
    delta = {
      enable = true;
      catppuccin.enable = true;
      options = {
        "line-numbers" = true;
      };
    };
    extraConfig = {
      init = {
        defaultBranch = "main";
      };
      pull = {
        rebase = "true";
      };
    };
  };
}
