{ pkgs }:
pkgs.buildNpmPackage {
  pname = "pi-web-access";
  version = "0.33.0";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-web-access";
    rev = "v0.33.0";
    hash = "sha256-culvDJyexdP3eS6w3nfSBbWQ7atWD1iLH0PS+CpUA8k=";
  };

  npmDepsHash = "sha256-EdFBTKDeCBCtuYrQjtHsXkDQvxENBSdLVHFW1koIXmU=";

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