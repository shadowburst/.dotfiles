{ pkgs }:
pkgs.stdenvNoCC.mkDerivation {
  pname = "pi-claude-code";
  version = "0.1.0";

  src = pkgs.fetchFromGitHub {
    owner = "earendil-works";
    repo = "pi-claude-code";
    rev = "70abb65186592ca788b29b3db22c3160d629c41f";
    hash = "sha256-9BHTz/IRf8jZczVYoXtypepBDmWJ9+5id6hwZUdeSV0=";
  };

  dontBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r src package.json README.md ARCHITECTURE.md LICENSE $out/
    runHook postInstall
  '';
}
