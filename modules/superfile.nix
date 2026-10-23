_: {
  flake.homeModules.cli =
    { config, ... }:
    {
      programs.superfile = {
        enable = true;

        settings = {
          theme = "catppuccin-${config.catppuccin.flavor}";
          editor = config.home.sessionVariables.EDITOR;
          dir_editor = config.home.sessionVariables.EDITOR;
          auto_check_update = false;
          # Home Manager manages only overrides; Superfile supplies the other defaults.
          ignore_missing_fields = true;
          default_sort_type = 4;
          code_previewer = "bat";
          transparent_background = true;
          zoxide_support = true;
        };

        # https://superfile.dev/configure/custom-hotkeys/#vim-like-superfile-hotkeys
        hotkeys = {
          confirm = [
            "enter"
            "l"
          ];
          quit = [
            "q"
            "ctrl+c"
          ];
          cd_quit = [ "Q" ];

          list_up = [ "k" ];
          list_down = [ "j" ];
          page_up = [ "pgup" ];
          page_down = [ "pgdown" ];

          create_new_file_panel = [ "n" ];
          close_file_panel = [ "w" ];
          next_file_panel = [ "tab" ];
          previous_file_panel = [ "shift+tab" ];
          split_file_panel = [ "N" ];
          toggle_file_preview_panel = [ "f" ];
          open_sort_options_menu = [ "o" ];
          toggle_reverse_sort = [ "R" ];

          focus_on_process_bar = [ "ctrl+p" ];
          focus_on_sidebar = [ "ctrl+s" ];
          focus_on_metadata = [ "ctrl+d" ];

          file_panel_item_create = [ "a" ];
          file_panel_item_rename = [ "r" ];
          copy_items = [ "y" ];
          cut_items = [ "x" ];
          paste_items = [ "p" ];
          delete_items = [ "d" ];
          permanently_delete_items = [ "D" ];
          extract_file = [ "ctrl+e" ];
          compress_file = [ "ctrl+a" ];

          open_file_with_editor = [ "e" ];
          open_current_directory_with_editor = [ "E" ];
          pinned_directory = [ "P" ];
          toggle_dot_file = [ "." ];
          change_panel_mode = [ "m" ];
          open_help_menu = [ "?" ];
          open_spf_prompt = [ ">" ];
          open_command_line = [ ":" ];
          open_zoxide = [ "z" ];
          copy_path = [ "Y" ];
          copy_present_working_directory = [ "c" ];
          toggle_footer = [ "ctrl+f" ];

          confirm_typing = [ "enter" ];
          cancel_typing = [ "esc" ];
          parent_directory = [ "h" ];
          search_bar = [ "/" ];
          file_panel_select_mode_items_select_down = [ "J" ];
          file_panel_select_mode_items_select_up = [ "K" ];
          file_panel_select_all_items = [ "A" ];
        };
      };
    };
}
