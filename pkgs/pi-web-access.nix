{ pkgs }:
pkgs.buildNpmPackage {
  pname = "pi-web-access";
  version = "0.46.0";

  forceEmptyCache = true;

  src = pkgs.fetchFromGitHub {
    owner = "nicobailon";
    repo = "pi-web-access";
    rev = "v0.46.0";
    hash = "sha256-i/C22ovZYwUu3a7gzBeFVaMqvhIB+N/Z63wOCPdhwLs=";
  };

  npmDepsHash = "sha256-zjmnY+h1amN9p7gkzLy1b+K+kZIq2IutSwVUoeUhvF0=";

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