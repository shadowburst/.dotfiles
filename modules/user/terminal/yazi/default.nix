{ ... }:

  {
  programs.yazi = {
  enable = true;
  enableFishIntegration = true;

  initLua = ''
      require("starship"):setup()
  '';

  plugins = {
    keyjump = ./plugins/keyjump.yazi;
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
    opener = {
      extract = [
        { run = "ya pub extract --list '$@'"; desc = "Extract here"; for = "unix"; }
        { run = "ya pub extract --list %*"; desc = "Extract here"; for = "windows"; }
      ];
    };
  };

  keymap = {
    manager.prepend_keymap = [
      # General
      { run = "close"; on = [ "q" ]; desc = "Close the current tab, or quit if it is last tab"; }
      # Navigation
      { run = "plugin smart-enter --sync"; on = [ "l" ]; desc = "Enter the child directory, or open the file"; }
      { run = "plugin smart-enter --sync"; on = [ "<Enter>" ]; desc = "Enter the child directory, or open the file"; }
      { run = "plugin keyjump"; on = [ "<C-s>" ]; desc = "Keyjump"; }
      # Operations
      { run = "remove --force"; on = [ "d" "d" ]; desc = "Move the files to the trash"; }
      { run = "remove --permanently"; on = [ "D" "D" ]; desc = "Permanently delete the files"; }
      #Goto
      { run = "cd ~/.dotfiles"; on = [ "g" "d" ]; desc = "Goto dotfiles"; }
      { run = "cd ~/.config"; on = [ "g" "c" ]; desc = "Goto config"; }
      { run = "cd ~/Public"; on = [ "g" "p" ]; desc = "Goto public"; }
      { run = "cd ~/.local/share/Trash/files"; on = [ "g" "t" ]; desc = "Goto trash"; }
      { run = "cd ~/Videos"; on = [ "g" "v" ]; desc = "Goto videos"; }
    ];
    completion.prepend_keymap = [
      { run = "close --submit"; on = [ "<C-y>" ]; desc = "Submit the completion"; }
    ];
    };

    theme = {
      manager = { 
        cwd = { fg = "#828bb8"; italic = true; };
        # Hovered
        hovered         = { bg = "#2f334d"; };
        preview_hovered = { bg = "#2f334d"; };
        # Find
        find_keyword  = { fg = "#1e2030"; bg = "#ff966c"; bold = true; };
        find_position = { fg = "#0db9d7"; bg = "#203346"; bold = true; };
        # Marker
        marker_copied   = { fg = "#4fd6be"; bg = "#4fd6be"; };
        marker_cut      = { fg = "#ff757f"; bg = "#ff757f"; };
        marker_marked   = { fg = "#c099ff"; bg = "#c099ff"; };
        marker_selected = { fg = "#82aaff"; bg = "#82aaff"; };
        # Tab
        tab_active   = { fg = "#c8d3f5"; bg = "#2f334d"; };
        tab_inactive = { fg = "#3b4261"; bg = "#222436"; };
        tab_width    = 1;
        # Count
        count_copied   = { fg = "#c8d3f5"; bg = "#41a6b5"; };
        count_cut      = { fg = "#c8d3f5"; bg = "#c53b53"; };
        count_selected = { fg = "#c8d3f5"; bg = "#3e68d7"; };
        # Border
        border_symbol = "│";
        border_style  = { fg = "#589ed7"; };
      };
      status = {
        separator_open  = "";
        separator_close = "";
        separator_style = { fg = "#3b4261"; bg = "#3b4261"; };
        # Mode
        mode_normal = { fg = "#1e2030"; bg = "#82aaff"; bold = true; };
        mode_select = { fg = "#1e2030"; bg = "#c099ff"; bold = true; };
        mode_unset  = { fg = "#1e2030"; bg = "#fca7ea"; bold = true; };
        # Progress
        progress_label  = { fg = "#828bb8"; bold = true; };
        progress_normal = { fg = "#222436"; };
        progress_error  = { fg = "#ff757f"; };
        # Permissions
        permissions_t = { fg = "#82aaff"; };
        permissions_r = { fg = "#ffc777"; };
        permissions_w = { fg = "#ff757f"; };
        permissions_x = { fg = "#c3e88d"; };
        permissions_s = { fg = "#444a73"; };
      };
      select = {
        border   = { fg = "#589ed7"; };
        active   = { fg = "#c8d3f5";  bg = "#2d3f76"; };
        inactive = { fg = "#c8d3f5"; };
      };
      input = {
        border   = { fg = "#0db9d7"; };
        title    = {};
        value    = { fg = "#fca7ea"; };
        selected = { bg = "#2d3f76"; };
      };
      completion = {
        border   = { fg = "#0db9d7"; };
        active   = { fg = "#c8d3f5"; bg = "#2d3f76"; };
        inactive = { fg = "#c8d3f5"; };
      };
      tasks = {
        border  = { fg = "#589ed7"; };
        title   = {};
        hovered = { fg = "#c8d3f5"; bg="#2d3f76"; };
      };
      which = {
        cols = 3;
        mask            = { bg = "#1e2030"; };
        cand            = { fg = "#86e1fc"; };
        rest            = { fg = "#82aaff"; };
        desc            = { fg = "#c099ff"; };
        separator       = ";  ";
        separator_style = { fg = "#636da6"; };
      };
      notify = {
        title_info  = { fg = "#0db9d7"; };
        title_warn  = { fg = "#ffc777"; };
        title_error = { fg = "#ff757f"; };
      };
      help = {
        on      = { fg = "#c3e88d"; };
        run     = { fg = "#c099ff"; };
        hovered = { bg = "#2d3f76"; };
        footer  = { fg = "#c8d3f5"; bg = "#222436"; };
      };
      filetype = {
        rules = [
          # Images
          { mime = "image/*"; fg = "#ffc777"; }
          # Media
          { mime = "{audio,video}/*"; fg = "#c099ff"; }
          # Archives
          { mime = "application/*zip"; fg = "#ff757f"; }
          { mime = "application/x-{tar,bzip*,7z-compressed,xz,rar}"; fg = "#ff757f"; }
          # Documents
          { mime = "application/{pdf,doc,rtf,vnd.*}"; fg = "#86e1fc"; }
          # Empty files
          # { mime = "inode/x-empty", fg = "#ff757f"; }
          # Special files
          { name = "*"; is = "orphan"; bg = "#ff757f"; }
          { name = "*"; is = "exec"; fg = "#c3e88d"; }
          # Fallback
          { name = "*/"; fg = "#82aaff"; }
        ];
      };
    };
  };
}
