{ pkgs }:
pkgs.buildNpmPackage {
  pname = "pi-tasks";
  version = "0.9.0";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "tintinweb";
    repo = "pi-tasks";
    rev = "29180d72498bdd77d5601dc77a9093d25da42102";
    hash = "sha256-2Wa+lUHQP6qvnRERaqFNu1IkOD4d5etb+x6oTCqh6Vg=";
  };

  npmDepsHash = "sha256-A1JP5lX9TApIlOT/IO+1IEpyX9WEn2hiDmPFFolbX1Y=";

  postPatch = ''
    ${pkgs.nodejs}/bin/npm pkg delete devDependencies
    ${pkgs.nodejs}/bin/npm install --package-lock-only --ignore-scripts --legacy-peer-deps
  '';

  npmInstallFlags = [
    "--omit=dev"
    "--legacy-peer-deps"
  ];
  dontNpmBuild = true;
  installPhase = ''
    runHook preInstall
    mkdir -p $out
    cp -r ./* $out/
    runHook postInstall
  '';
}