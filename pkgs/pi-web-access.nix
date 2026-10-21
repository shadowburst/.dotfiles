{ pkgs }:
pkgs.buildNpmPackage {
  pname = "pi-web-access";
  version = "0.44.0";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-web-access";
    rev = "v0.44.0";
    hash = "sha256-/NQbfQTheJ8Di5l3ZP8pbWqAKqrhJ2F6OsiZAKt59YI=";
  };

  npmDepsHash = "sha256-SlGZ/NLE0DWzNdjW6WfuK8WAvLI1jbE2rIys9ToNzfk=";

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