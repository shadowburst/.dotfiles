{pkgs, ...}: {
  programs = {
    git = {
      enable = true;
      userName = "ShadowBurst";
      userEmail = "37303345+shadowburst@users.noreply.github.com";
      delta = {
        enable = true;
        options = {
          "line-numbers" = true;
          "side-by-side" = true;
        };
      };
      extraConfig = {
        init.defaultBranch = "main";
        pull.rebase = "true";
      };
    };

    gh = {
      enable = true;
      settings = {
        git_protocol = "ssh";
        prompt = "enabled";
      };
      extensions = with pkgs; [gh-copilot];
    };

    gh-dash.enable = true;
  };

  home.packages = with pkgs; [
    wrkflw
  ];
}
