{ pkgs }:
pkgs.buildNpmPackage {
  pname = "pi-web-access";
  version = "0.31.0";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-web-access";
    rev = "v0.31.0";
    hash = "sha256-ykR2slh8MkxxbP660h0rvk2Y7SaKv+Cw/lJC21JqGW8=";
  };

  npmDepsHash = "sha256-AsxdP0NJ5Y1raF5GjiFI6BAOwh3wYGMSNXuJIrX9dJA=";

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