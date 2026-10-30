{ inputs, ... }:
{
  flake.homeModules.gui = {
    imports = [ inputs.hex.homeManagerModules.hex ];

    programs.hex = {
      enable = true;
      autostart = true;
    };

    xdg.dataFile."hex/settings.json".text = builtins.toJSON {
      enable_on_launch = true;
      shortcut_mode = "hold";
      double_tap_lock = false;
      double_tap_only = false;
      indicator_position = "bottom";
      history_retention = "day";
      paste_with_shift = true;
      transcription = {
        model = "whisper_large_v3_turbo";
        language = "auto";
      };
      capture.enabled = false;
      meetings.enabled = false;
      # Prevent first-run migrations from overriding these settings.
      migrations = [
        "streaming-english-model"
        "annotate-on-by-default"
      ];
    };
  };
}
