{host, ...}: {
  home.shell.enableNushellIntegration = true;

  programs.nushell = {
    enable = true;
    settings = {
      show_banner = false;
      edit_mode = "vi";
      cursor_shape.vi_insert = "line";
      cursor_shape.vi_normal = "block";
      keybindings = [
        {
          name = "backspaceword";
          modifier = "alt";
          keycode = "backspace";
          mode = ["emacs" "vi_insert" "vi_normal"];
          event = {
            edit = "backspaceword";
          };
        }
      ];
    };
    environmentVariables = {
      PROMPT_INDICATOR_VI_NORMAL = "";
      PROMPT_INDICATOR_VI_INSERT = "";
    };
    shellAliases = {
      cp = "cp -i";
      mv = "mv -i";
      rm = "rm -i";
      grep = "grep --color=always";
      cat = "bat --color=always --plain";
      ll = "ls -al";
      flake-switch = "sudo nixos-rebuild switch --flake ~/.dotfiles#${host}";
      flake-boot = "sudo nixos-rebuild boot --flake ~/.dotfiles#${host}";
      flake-update = "nix flake update --flake ~/.dotfiles";
      sail = "./vendor/bin/sail";
      sail-pint = "./vendor/bin/sail php ./vendor/bin/pint";
    };
  };
}
