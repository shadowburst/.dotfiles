{ pkgs }:
pkgs.buildNpmPackage {
  pname = "ponytail";
  version = "5.3.2";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "DietrichGebert";
    repo = "ponytail";
    rev = "v5.3.2";
    hash = "sha256-IJlhfkdXI6pMZZCZO7XBRg88LBiNfzc5Gnm4ofGybL8=";
  };

  npmDepsHash = "sha256-QC2JUD6EMHQ072W9aVrkVNC43wxLdwp+zq0rmjloPS4=";

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