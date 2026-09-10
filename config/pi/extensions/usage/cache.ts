import { watch, type FSWatcher } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { UsageSnapshot } from "./state.ts";

function isSnapshot(value: unknown): value is UsageSnapshot {
  if (value === null || typeof value !== "object") return false;
  const snapshot = value as Partial<UsageSnapshot>;
  return Array.isArray(snapshot.windows) && snapshot.windows.every((window) =>
    window !== null
    && typeof window === "object"
    && typeof window.label === "string"
    && typeof window.usedPercent === "number"
  );
}

export class SharedUsageCache {
  private watcher: FSWatcher | undefined;
  private readonly directory: string;

  constructor(directory: string) {
    this.directory = directory;
  }

  async start(providers: string[], onSnapshot: (provider: string, snapshot: UsageSnapshot) => void): Promise<void> {
    if (this.watcher) return;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });

    const files = new Map(providers.map((provider) => [this.filename(provider), provider]));
    this.watcher = watch(this.directory, (_event, filename) => {
      const provider = filename ? files.get(filename.toString()) : undefined;
      if (provider) void this.read(provider).then((snapshot) => snapshot && onSnapshot(provider, snapshot));
    });

    await Promise.all(providers.map(async (provider) => {
      const snapshot = await this.read(provider);
      if (snapshot) onSnapshot(provider, snapshot);
    }));
  }

  async write(provider: string, snapshot: UsageSnapshot): Promise<void> {
    const target = join(this.directory, this.filename(provider));
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(snapshot), { encoding: "utf8", mode: 0o600 });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  close(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }

  private filename(provider: string): string {
    return `${encodeURIComponent(provider)}.json`;
  }

  private async read(provider: string): Promise<UsageSnapshot | undefined> {
    try {
      const value: unknown = JSON.parse(await readFile(join(this.directory, this.filename(provider)), "utf8"));
      return isSnapshot(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }
}
