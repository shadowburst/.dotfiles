{...}: {
  programs.git = {
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
      init = {
        defaultBranch = "main";
      };
      pull = {
        rebase = "true";
      };
    };
  };
}
