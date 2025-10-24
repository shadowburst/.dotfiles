{pkgs, ...}: {
  programs.git = {
    enable = true;
    settings = {
      init.defaultBranch = "main";
      pull.rebase = "true";
      user = {
        name = "ShadowBurst";
        email = "37303345+shadowburst@users.noreply.github.com";
      };
    };
  };

  programs.difftastic = {
    enable = true;
    git.enable = true;
    git.diffToolMode = true;
  };

  programs.gh = {
    enable = true;
    settings = {
      git_protocol = "ssh";
      prompt = "enabled";
    };
    extensions = with pkgs; [gh-copilot];
  };

  programs.gh-dash.enable = true;

  home.packages = with pkgs; [
    wrkflw
  ];
}
