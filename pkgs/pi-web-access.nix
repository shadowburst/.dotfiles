{ pkgs }:
pkgs.buildNpmPackage {
  pname = "pi-web-access";
  version = "0.38.0";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-web-access";
    rev = "v0.38.0";
    hash = "sha256-FLRsw9G1lmr0fkAvJ/lM+gxNbjSF2C3WBaKJx0S65sE=";
  };

  npmDepsHash = "sha256-FnPTSD7CAMB8eKCK3hYspgMraG60JTZsNUtS8YVvgvo=";

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