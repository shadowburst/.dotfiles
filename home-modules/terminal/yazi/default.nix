{...}: {
  programs.yazi = {
    enable = true;
    enableFishIntegration = true;

    initLua =
      /*
      lua
      */
      ''
        require("starship"):setup()

        require("session"):setup({
          sync_yanked = true,
        })
      '';

    plugins = {
      smart-enter = ./plugins/smart-enter.yazi;
      starship = ./plugins/starship.yazi;
    };

    settings = {
      manager = {
        sort_by = "natural";
        sort_sensitive = false;
        sort_dir_first = true;
        linemode = "none";
        show_hidden = true;
        show_symlink = true;
      };
      preview = {
        image_delay = 100;
      };
      opener = {
        extract = [
          {
            run = ''ya pub extract --list "$@"'';
            desc = "Extract here";
            for = "unix";
          }
          {
            run = "ya pub extract --list %*";
            desc = "Extract here";
            for = "windows";
          }
        ];
      };
    };

    keymap = {
      manager.prepend_keymap = [
        # General
        {
          run = "close";
          on = ["q"];
          desc = "Close the current tab, or quit if it is last tab";
        }
        # Navigation
        {
          run = "plugin smart-enter";
          on = ["l"];
          desc = "Enter the child directory, or open the file";
        }
        {
          run = "plugin smart-enter";
          on = ["<Enter>"];
          desc = "Enter the child directory, or open the file";
        }
        # Operations
        {
          run = "remove --force";
          on = [
            "d"
            "d"
          ];
          desc = "Move the files to the trash";
        }
        {
          run = "remove --permanently";
          on = [
            "D"
            "D"
          ];
          desc = "Permanently delete the files";
        }
        #Goto
        {
          run = "cd ~/.dotfiles";
          on = [
            "g"
            "d"
          ];
          desc = "Goto dotfiles";
        }
        {
          run = "cd ~/Downloads";
          on = [
            "g"
            "D"
          ];
          desc = "Goto dotfiles";
        }
        {
          run = "cd ~/.config";
          on = [
            "g"
            "c"
          ];
          desc = "Goto config";
        }
        {
          run = "cd ~/Public";
          on = [
            "g"
            "p"
          ];
          desc = "Goto public";
        }
        {
          run = "cd ~/.local/share/Trash/files";
          on = [
            "g"
            "t"
          ];
          desc = "Goto trash";
        }
        {
          run = "cd ~/Videos";
          on = [
            "g"
            "v"
          ];
          desc = "Goto videos";
        }
      ];
      completion.prepend_keymap = [
        {
          run = "close --submit";
          on = ["<C-y>"];
          desc = "Submit the completion";
        }
      ];
    };
  };
}
