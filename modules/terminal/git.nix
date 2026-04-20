_:
{
  flake.homeModules.git =
    { lib, pkgs, ... }:
    {
      programs.git = {
        enable = true;
        settings = {
          init.defaultBranch = "main";
          pull.rebase = "true";
          user.name = "ShadowBurst";
          user.email = "37303345+shadowburst@users.noreply.github.com";
          difftool.codediff.cmd = ''nvim "$LOCAL" "$REMOTE" +"CodeDiff file $LOCAL $REMOTE"'';
          diff.tool = "codediff";
          mergetool.codediff.cmd = ''nvim "$MERGED" -c "CodeDiff merge \"$MERGED\""'';
          merge.tool = "codediff";
        };
      };

      programs.delta = {
        enable = true;
        enableGitIntegration = true;
        options = {
          "line-numbers" = true;
          "side-by-side" = true;
        };
      };

      programs.gh = {
        enable = true;
        settings = {
          git_protocol = "ssh";
          prompt = "enabled";
        };
      };

      programs.gh-dash = {
        enable = true;
        settings = {
          prSections = [
            {
              title = "Needs Review";
              filters = "is:open review-requested:@me";
            }
            {
              title = "My Pull Requests";
              filters = "is:open author:@me";
            }
            {
              title = "All Pull Requests";
              filters = "is:open";
            }
          ];
          pager.diff = "delta --side-by-side --line-numbers";
        };
      };
    };
}
