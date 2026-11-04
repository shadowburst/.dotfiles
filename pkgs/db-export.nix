{ pkgs }:
pkgs.writeShellApplication {
  name = "db-export";
  runtimeInputs = with pkgs; [
    coreutils
    gawk
    gnugrep
    gnused
    gzip
    libsecret
    openssh
    pv
    television
  ];
  text = builtins.readFile ./db-export.sh;
  # The wizard library (from the /wizard skill template) has helpers this script
  # does not call, and a readline prompt that shellcheck reads as an array.
  excludeShellChecks = [
    "SC1087"
    "SC2317"
    "SC2329"
  ];
}
